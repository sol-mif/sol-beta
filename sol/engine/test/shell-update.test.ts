// The shell's own update (J4 of #1824, team/shell.ts and parts/shell-update.ts): Sol.app asks the engine on
// POST /shell/update whether `pause updates` is on and whether it may relaunch now (not while an engine swap is under
// way, ship.ts swappingNow), and tells it what its updater did; that word goes to every face as `team.shell`, and a
// face that connects later asks for it with team.shell.get. On a settings file of its own (SOL_SETTINGS).
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

const DIR = mkdtempSync(join(tmpdir(), "sol-shell-update-"));
process.env.SOL_SETTINGS = join(DIR, "settings.json");
after(() => rmSync(DIR, { recursive: true, force: true }));

const S = await import("../src/settings.ts");
const Sh = await import("../src/team/shell.ts");
const ship = await import("../src/team/ship.ts");
const pin = await import("../src/team/pin.ts");
const part = (await import("../src/parts/shell-update.ts")).default;
const { join: joinBusy } = await import("../src/busy.ts");

let told: any[] = [];
beforeEach(() => { Sh.resetShell(); told = []; S.patchSettings({ updates: { paused: false } }); });

// the part, through a stand-in registry and request, as pause.test.ts asks POST /pause
function partOf() {
  let fn: any = null, start: any = null;
  const hears = new Map<string, any>();
  part({
    route: (m: string, p: string, f: any) => { assert.equal(`${m} ${p}`, "POST /shell/update"); fn = f; },
    on: (t: string, f: any) => { hears.set(t, f); },
    atStart: (f: any) => { start = f; },
  } as any);
  start({ everyone: (m: object) => told.push(m) });
  const ask = async (body: string, type = "application/json") => {
    const req = Object.assign(Readable.from([body]), { headers: { "content-type": type } });
    let status = 0, out = "", head: Record<string, unknown> = {};
    const res = { writeHead: (s: number, h?: Record<string, unknown>) => { status = s; head = h ?? {}; }, end: (b?: string) => { out = b ?? ""; } };
    await fn({ req, res });
    if (out) assert.equal(head["content-length"], Buffer.byteLength(out), "a length, never chunked (the shell reads it plainly, as pause.rs does)");
    return { status, body: out ? JSON.parse(out) : null };
  };
  const get = async (rid?: unknown) => {
    const sent: any[] = [];
    await hears.get("team.shell.get")({ type: "team.shell.get", rid }, { ws: {}, send: (_w: unknown, m: object) => sent.push(m) });
    return sent;
  };
  return { ask, get };
}

test("a plain ask: not paused, may relaunch, nothing told", async () => {
  const { ask } = partOf();
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true });
  assert.deepEqual(told, []);
});

test("JSON only (a web page cannot send it without a preflight), and a bad body still answers", async () => {
  const { ask } = partOf();
  assert.equal((await ask("{}", "text/plain")).status, 415);
  assert.deepEqual((await ask("not json")).body, { paused: false, relaunch: true });
  assert.deepEqual((await ask(JSON.stringify({ event: "found", version: "0.20261123.1820", pad: "x".repeat(2000) }))).body, { paused: false, relaunch: true }, "past the cap: answered, nothing heard");
  assert.deepEqual(told, []);
});

test("pause updates is the engine's own switch (settings updates.paused), the one installRelease honours", async () => {
  const { ask } = partOf();
  S.patchSettings({ updates: { paused: true } });
  assert.deepEqual((await ask("{}")).body, { paused: true, relaunch: true });
  S.patchSettings({ updates: { paused: false } });
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true });
});

test("no relaunch while an engine swap is under way (ship.ts update), yes once it is done", async () => {
  const { ask } = partOf();
  let go!: (c: "dev") => void;
  const gate = new Promise<"dev">((r) => { go = r; });
  // update() marks itself under way before it asks the channel: held there, the swap is mid-way
  const swap = ship.update({ root: join(DIR, "not-a-checkout"), channel: () => gate }).catch(() => null);
  assert.equal(ship.swappingNow(), true);
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: false, why: "swapping" });
  go("dev");
  await swap;
  assert.equal(ship.swappingNow(), false);
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true });
});

test("the shell's events reach every face as team.shell, once each; a face that connects asks with team.shell.get", async () => {
  const { ask, get } = partOf();
  assert.deepEqual(await get(7), [{ type: "team.shell", rid: 7, event: null }]);
  for (const event of ["found", "downloaded", "ready"]) {
    assert.deepEqual((await ask(JSON.stringify({ event, version: "0.20261123.1820" }))).body, { paused: false, relaunch: true });
  }
  assert.equal(told.length, 3);
  assert.deepEqual(told.map((m) => [m.type, m.event, m.version]), [["team.shell", "found", "0.20261123.1820"], ["team.shell", "downloaded", "0.20261123.1820"], ["team.shell", "ready", "0.20261123.1820"]]);
  assert.equal(typeof told[2].at, "number");
  await ask(JSON.stringify({ event: "ready", version: "0.20261123.1820" }));   // the same word again (the shell says it every check)
  assert.equal(told.length, 3, "the same word is not told again");
  const [standing] = await get();
  assert.equal(standing.event, "ready");
  assert.equal(standing.version, "0.20261123.1820");
  assert.equal("rid" in standing, false);
});

test("failed carries its why, one line, cut short; idle clears the line", async () => {
  const { ask, get } = partOf();
  await ask(JSON.stringify({ event: "failed", version: "0.20261123.1820", why: "signature did not verify\nsecond line\u0007" + "y".repeat(300) }));
  assert.equal(told.at(-1).event, "failed");
  const why: string = told.at(-1).why;
  assert.ok(why.startsWith("signature did not verify"));
  assert.ok(!/[\n\u0000-\u001f]/.test(why), "one line, no control characters");
  assert.ok(why.length <= Sh.WHY_MAX);
  await ask(JSON.stringify({ event: "idle" }));
  assert.deepEqual(told.at(-1), { type: "team.shell", event: null });
  assert.deepEqual(await get(), [{ type: "team.shell", event: null }]);
});

test("an unknown event, or a version that is not one, is not heard (still answered)", async () => {
  const { ask } = partOf();
  for (const b of [{ event: "installed" }, { event: "found", version: "<b>1</b>" }, { event: "found", version: 3 }, { event: ["ready"] }, { event: "found", version: "9".repeat(40) }]) {
    assert.deepEqual((await ask(JSON.stringify(b))).body, { paused: false, relaunch: true });
  }
  assert.deepEqual(told, []);
  await ask(JSON.stringify({ event: "found" }));   // a version is optional
  assert.deepEqual([told.at(-1).event, "version" in told.at(-1)], ["found", false]);
});

test("no relaunch while the engine that came with a swap has not stayed up its minute (a fresh .swap, keep #1576); a stale one does not hold it", async () => {
  const { ask } = partOf();
  const root = mkdtempSync(join(DIR, "sol-"));
  mkdirSync(join(root, "engine"));
  process.env.SOL_NO_SHIP_CHECK = "1";
  let paused = false;
  ship.startShip(root, () => {}, { paused: () => paused, channel: async () => "dev" });
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true });
  paused = true;   // the Ship's own switch, as installRelease reads it (d.paused ?? updatesPaused)
  assert.deepEqual((await ask("{}")).body, { paused: true, relaunch: true });
  paused = false;
  const swap = join(root, "engine", ship.SWAP);
  writeFileSync(swap, "from\ta\tb\n");
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: false, why: "swapping" });
  const old = (Date.now() - Sh.SWAP_HOLD_MS - 60_000) / 1000;
  utimesSync(swap, old, old);   // left behind by an engine with no keeper: it holds nothing forever
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true });
});

test("no relaunch while a go back (pin.ts) or a carry's move (carry.ts) is under way", async () => {
  const { ask } = partOf();
  assert.equal(Sh.movingNow({ swapping: () => false, going: () => "going back to dev-20261120-0900", carrying: () => undefined, swap: () => false }), true);
  assert.equal(Sh.movingNow({ swapping: () => false, going: () => "", carrying: () => "moving", swap: () => false }), true);
  assert.equal(Sh.movingNow({ swapping: () => false, going: () => "", carrying: () => "ready", swap: () => false }), false);
  assert.equal(Sh.movingNow({ swapping: () => false, going: () => "", carrying: () => undefined, swap: () => false }), false);
  assert.equal(typeof pin.goingNow(), "string");
  assert.deepEqual((await ask("{}")).body.relaunch, true);
});

// ---- REVIEW-J4 (docs/br1-backend-sort-2026-11-22/J/REVIEW-J4.md): pin is paused, installing holds a relaunch, a throw is not a 200 ----

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
function hermetic() {
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", SOL_NO_SHIP_CHECK: "1",
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  });
}
const soon = async (ok: () => boolean, ms = 5000) => { for (let t = 0; t < ms && !ok(); t += 25) await new Promise((r) => setTimeout(r, 25)); };

test("a pin is paused too (CONTRACT §4): the shell neither climbs nor falls while this Sol is pinned", async () => {
  hermetic();
  const { ask } = partOf();
  const root = mkdtempSync(join(DIR, "pinned-"));
  git(root, "init", "-q", "-b", pin.PINNED_BRANCH);
  writeFileSync(join(root, "a"), "1\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "start");
  await pin.startPin({ root, now: () => new Date() } as any);   // a plain Sol on `pinned`: it stays pinned where it is
  try {
    assert.ok(pin.pinNow(), "pinned");
    assert.deepEqual((await ask("{}")).body, { paused: true, relaunch: true });
  } finally { pin.resetPin(); }
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true }, "unpinned: not paused");
});

test("the race (REVIEW-J4 item 1): installRelease built aside and waiting for a quiet moment holds a relaunch, though no update() runs yet", async () => {
  hermetic();
  const { ask } = partOf();
  const top = mkdtempSync(join(DIR, "race-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "repo");
  mkdirSync(join(repo, "sol", "engine", "src"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, ".gitignore"), "node_modules/\nsol/engine/dist/\nsol/engine/.swap\nsol/engine/.skip\nsol/engine/dist.good/\n");
  writeFileSync(join(repo, "sol", "engine", "src", "index.ts"), "export const a = 1;\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  const me = join(top, "me");
  git(top, "clone", "-q", origin, me);
  writeFileSync(join(repo, "sol", "engine", "src", "index.ts"), "export const a = 2;\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "two"); git(repo, "push", "-q");
  const sha = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "-a", "dev-20261123-2300", "-m", "r", sha);
  git(repo, "push", "-q", "--atomic", "origin", "refs/tags/dev-20261123-2300:refs/tags/dev-20261123-2300", `+${sha}:refs/heads/dev`);
  const sol = join(me, "sol");
  const runs: string[] = [];
  let paused = false;
  ship.startShip(sol, () => {}, {
    channel: async () => "dev", auto: true, quietMs: 0, pollMs: 10, runs: (why) => { runs.push(why ?? "runs"); }, paused: () => paused,
    build: async (dir: string) => { mkdirSync(join(dir, "dist"), { recursive: true }); writeFileSync(join(dir, "dist", "index.js"), "built aside\n"); },
  });
  const turn = joinBusy("work", "run-race", "auto");   // a turn in flight: the release is built aside and waits
  try {
    await ship.hear({ sha, tag: "dev-20261123-2300", by: "", channel: "dev" });
    await soon(() => runs.includes("busy"));
    assert.ok(runs.includes("busy"), "built aside, waiting for a quiet moment");
    assert.equal(ship.swappingNow(), false, "no update() yet: the window the review found");
    assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: false, why: "swapping" }, "a shell that relaunched now would race the swap a breath later");
    paused = true;   // pause updates holds the swap until it is off: the release waiting does not hold the shell meanwhile
    assert.deepEqual((await ask("{}")).body, { paused: true, relaunch: true });
    paused = false;
    assert.equal((await ask("{}")).body.relaunch, false);
  } finally { turn(); }
  await soon(() => ship.offerNow()?.behind === false);
  assert.equal(git(me, "rev-parse", "HEAD"), sha, "swapped in once the turn ended");
  assert.equal((await ask("{}")).body.relaunch, false, "and the fresh .swap holds it on (keep #1576)");
  ship.startShip(join(DIR, "not-a-checkout"), () => {}, { channel: async () => "dev" });
});

test("a .swap that cannot be read is a swap under way: only ENOENT means none", { skip: process.getuid?.() === 0 }, async () => {
  const { ask } = partOf();
  const root = mkdtempSync(join(DIR, "locked-"));
  mkdirSync(join(root, "engine"));
  ship.startShip(root, () => {}, { channel: async () => "dev" });
  assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: true }, "no .swap: may relaunch");
  chmodSync(join(root, "engine"), 0o000);   // lost Full Disk Access reads like this: EACCES, not ENOENT
  try {
    assert.deepEqual((await ask("{}")).body, { paused: false, relaunch: false, why: "swapping" });
  } finally { chmodSync(join(root, "engine"), 0o755); }
  ship.startShip(join(DIR, "not-a-checkout"), () => {}, { channel: async () => "dev" });
});

test("a handler that throws answers 500, never a 200 the shell would take as a yes", async () => {
  const { ask } = partOf();
  ship.startShip(join(DIR, "not-a-checkout"), () => {}, { channel: async () => "dev", paused: () => { throw new Error("settings unreadable"); } });
  try {
    const r = await ask("{}");
    assert.equal(r.status, 500);
    assert.equal(r.body, null, "no answer to read as paused:false, relaunch:true");
  } finally { ship.startShip(join(DIR, "not-a-checkout"), () => {}, { channel: async () => "dev" }); }
});

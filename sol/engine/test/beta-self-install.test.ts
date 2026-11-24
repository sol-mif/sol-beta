// #1615 lane C: a downloaded Sol (beta, origin sol-beta, follows `stable`) installs a new release by itself the way a
// dev Sol does (ship.ts installRelease): built aside, swapped in between turns, `pause updates` holds it, and a release
// that does not start goes back through the keeper (engine/keep, #1576) and is not installed by itself again. A beta
// Sol's own changes that clash are never carried over by themselves: the release stays offered for Update. Real git
// in temp repos (as together-ship.test.ts), the real keeper with a stand-in engine (as keep.test.ts); nothing here
// reaches the network or the real home.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
  SOL_SETTINGS: join(mkdtempSync(join(tmpdir(), "sol-settings-")), "settings.json"),
  SOL_HOME: mkdtempSync(join(tmpdir(), "sol-home-")),
});
delete process.env.SOL_VERSION;
const { hear, startShip, offerNow, update, installRelease } = await import("../src/team/ship.ts");
const { join: joinBusy, _reset } = await import("../src/busy.ts");
const carry = await import("../src/team/carry.ts");
const { freePort } = await import("./test-engine.ts");
type Ship = import("../src/team/ship.ts").Ship;

beforeEach(() => { _reset(); carry.resetCarry(); });

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const soon = async (ok: () => boolean, ms = 5000) => { for (let t = 0; t < ms && !ok(); t += 25) await new Promise((r) => setTimeout(r, 25)); };
const IGNORE = "node_modules/\nsol/engine/dist/\nsol/engine/dist.good/\nsol/engine/dist.bad/\nsol/engine/.keep\nsol/engine/.swap\nsol/engine/.skip\nsol/engine/.went-back\nsol/engine/keep\n";

/** the house and sol-beta in one bare origin: a release is `stable` moved there, as the beta pass moves it */
function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-beta-self-"));
  const origin = join(top, "sol-beta.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "house");
  mkdirSync(join(repo, "sol", "engine", "src"), { recursive: true });
  mkdirSync(join(repo, "sol", "mac", "src"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "engine", "src", "index.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "sol", "engine", "tsconfig.json"), "{}\n");
  writeFileSync(join(repo, "sol", "engine", "package-lock.json"), "{\"lock\":1}\n");
  writeFileSync(join(repo, "sol", "mac", "src", "App.tsx"), "export const b = 1;\n");
  writeFileSync(join(repo, ".gitignore"), IGNORE);
  mkdirSync(join(repo, "sol", "mine"), { recursive: true });   // the release carries sol/mine/rebase, as sol-beta does
  copyFileSync(join(import.meta.dirname, "..", "..", "mine", "rebase"), join(repo, "sol", "mine", "rebase"));
  chmodSync(join(repo, "sol", "mine", "rebase"), 0o755);
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "Sol dev-20261120");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  git(repo, "push", "-q", "origin", "main:refs/heads/stable");
  return { top, origin, repo };
}
const commit = (repo: string, file: string, text: string, push = true) => {
  writeFileSync(join(repo, file), text);
  git(repo, "add", "-A"); git(repo, "commit", "-qm", `change ${file}`);
  if (push) git(repo, "push", "-q");
  return git(repo, "rev-parse", "HEAD");
};
/** a beta release: main's HEAD tagged, and sol-beta's stable moved to it */
function released(repo: string, tag: string) {
  const sha = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "-a", tag, "-m", tag, sha);
  git(repo, "push", "-q", "--atomic", "origin", `refs/tags/${tag}:refs/tags/${tag}`, `+${sha}:refs/heads/stable`);
  return { sha, tag };
}
/** a downloader's Sol: a clone of sol-beta, its engine packages and running build in place; `mine` puts it on
 *  `<name>/mine`, as sol/install leaves it */
function downloaded(f: ReturnType<typeof fixture>, name: string, mine = false) {
  const me = join(f.top, name);
  git(f.top, "clone", "-q", f.origin, me);
  const sol = join(me, "sol");
  mkdirSync(join(sol, "engine", "node_modules"), { recursive: true });
  writeFileSync(join(sol, "engine", "node_modules", "marker"), "installed at start\n");
  writeFileSync(join(sol, "engine", "node_modules", ".package-lock.json"), "{}\n");
  mkdirSync(join(sol, "engine", "dist"), { recursive: true });
  writeFileSync(join(sol, "engine", "dist", "index.js"), "the running build\n");
  if (mine) git(me, "checkout", "-q", "-b", `${name}/mine`);
  return { me, sol };
}
const build = async (dir: string) => { mkdirSync(join(dir, "dist"), { recursive: true }); writeFileSync(join(dir, "dist", "index.js"), "built aside\n"); };
// kept: the engine runs under launchd or systemd (keptNow), as sol/install leaves a downloader's
const deps = (sol: string, over: Partial<Ship> = {}): Ship => ({ root: sol, channel: async () => "beta", auto: true, quietMs: 0, pollMs: 10, everyMs: 0, build, ci: async () => {}, kept: async () => true, ...over });
const word = (s: { sha: string; tag: string }) => ({ sha: s.sha, tag: s.tag, by: "" });   // a beta word names no channel

test("a downloaded Sol installs a new stable by itself between turns, never mid-turn; pause holds it; the offer does not stay", async () => {
  const f = fixture();
  const t = downloaded(f, "tester");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 2;\n");
  const r = released(f.repo, "dev-20261123-0100");
  const told: any[] = [], runs: string[] = [];
  let paused = true, updated = 0;
  startShip(t.sol, (m) => told.push(m), deps(t.sol, { paused: () => paused, updated: () => { updated++; }, runs: (why) => { runs.push(why ?? "runs"); } }));
  const turn = joinBusy("turn", "t1", "a reply under way");
  await hear(word(r));
  assert.equal(told[0]?.channel, "beta");
  assert.equal(told[0]?.behind, true, "every face hears of it, as before");
  await soon(() => runs.includes("paused"));
  assert.deepEqual(runs, ["paused"], "paused: built aside, not swapped, and said");
  assert.notEqual(git(t.me, "rev-parse", "HEAD"), r.sha);
  paused = false;
  await soon(() => runs.includes("busy"));
  await new Promise((ok) => setTimeout(ok, 100));
  assert.notEqual(git(t.me, "rev-parse", "HEAD"), r.sha, "never mid-turn");
  turn();
  await soon(() => offerNow()?.behind === false);
  assert.equal(git(t.me, "rev-parse", "HEAD"), r.sha, "installed by itself once no reply was under way");
  assert.equal(git(t.me, "rev-parse", "refs/heads/stable"), r.sha, "its stable is beta's");
  assert.equal(told.at(-1)?.behind, false, "the Update/Later offer is answered for every face, not left lying");
  assert.equal(updated, 1);
  assert.equal(readFileSync(join(t.sol, "engine", "dist", "index.js"), "utf8"), "built aside\n", "renew finds the new build");
  const swap = readFileSync(join(t.sol, "engine", ".swap"), "utf8");
  assert.match(swap, new RegExp(`^to\t${r.sha}$`, "m"), "the keeper's way back is written");
  assert.equal(git(t.me, "status", "--porcelain"), "", "a clean tree");
  await soon(() => runs.at(-1) === "runs");
  assert.deepEqual(runs, ["paused", "busy", "runs"]);
});

test("a dev word never moves a beta Sol; auto off (the default for tests elsewhere) leaves the offer for Update", async () => {
  const f = fixture();
  const t = downloaded(f, "plain");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 3;\n");
  const sha = git(f.repo, "rev-parse", "HEAD");
  git(f.repo, "push", "-q", "origin", `${sha}:refs/heads/dev`);   // dev moved, stable not
  startShip(t.sol, () => {}, deps(t.sol));
  await hear({ sha, tag: "dev-20261123-0200", by: "", channel: "dev" });
  assert.equal(offerNow(), null, "a dev word is not a beta Sol's");
  const r = released(f.repo, "dev-20261123-0200");
  startShip(t.sol, () => {}, deps(t.sol, { auto: false }));
  await hear(word(r));
  await new Promise((ok) => setTimeout(ok, 150));
  assert.equal(offerNow()?.behind, true);
  assert.notEqual(git(t.me, "rev-parse", "HEAD"), r.sha, "auto off: offered, never installed");
});

test("a downloader's own */mine Sol: its own commits go on top by themselves; a clash opens no session, stays offered, and Update carries it", async () => {
  const f = fixture();
  const t = downloaded(f, "sam", true);
  commit(t.me, "sol/mac/src/Mine.tsx", "her own look\n", false);
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 4;\n");
  const r = released(f.repo, "dev-20261123-0300");
  const carried: { auto?: boolean }[] = [], runs: string[] = [];
  const carryOver = async (release: string, tag: string, follow: string, auto?: boolean) => {
    carried.push({ auto });
    return { kind: "update", stage: "session", onto: release, from: "", source: "", changes: [], said: "a session is carrying it over", at: 0 } as any;
  };
  startShip(t.sol, () => {}, deps(t.sol, { carry: carryOver, runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear(word(r));
  await soon(() => offerNow()?.behind === false);
  assert.equal(git(t.me, "rev-parse", "HEAD~1"), r.sha, "her commit sits on the release, with no press");
  assert.equal(git(t.me, "log", "-1", "--format=%s"), "change sol/mac/src/Mine.tsx");
  assert.equal(git(t.me, "branch", "--show-current"), "sam/mine");

  // her change on the line the next release changes: a clash
  commit(t.me, "sol/engine/src/index.ts", "export const a = 40;\n", false);
  const was = git(t.me, "rev-parse", "HEAD");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 5;\n");
  const r2 = released(f.repo, "dev-20261123-0400");
  runs.length = 0;
  await hear(word(r2));
  await soon(() => runs.includes("clash"));
  assert.deepEqual(runs, ["clash"], "the reason is said");
  assert.deepEqual(carried, [], "no session opens on a stranger's machine by itself");
  assert.equal(git(t.me, "rev-parse", "HEAD"), was, "her Sol stays where it was");
  assert.equal(git(t.me, "status", "--porcelain"), "", "nothing half-done left behind");
  assert.equal(offerNow()?.behind, true, "still offered: Update is the way");
  assert.equal(await installRelease(r2.sha), false, "the same clash is not tried again by itself");
  assert.equal(git(t.me, "rev-parse", "HEAD"), was);

  // the engine starts again (a reboot, a renew): the clash is remembered, so her live folder is not rebased again
  const built: string[] = [];
  runs.length = 0;
  startShip(t.sol, () => {}, deps(t.sol, { carry: carryOver, build: async (d) => { built.push(d); await build(d); }, runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear(word(r2));
  await soon(() => runs.length > 0);
  assert.deepEqual(runs, ["clash"], "said again, nothing tried");
  assert.deepEqual(built, [], "nothing built aside for it");
  assert.equal(git(t.me, "reflog", "-1", "--format=%H"), was, "her folder was not touched: no rebase began");

  const pressed = await update(deps(t.sol, { carry: carryOver }), "beta");
  assert.ok("carry" in pressed && pressed.carry, "Update hands it to the carry");
  assert.deepEqual(carried, [{ auto: false }], "pressed, so the carry is the person's own");
});

test("changes not kept: nothing is built aside or moved, and it says changes", async () => {
  const f = fixture();
  const t = downloaded(f, "kim", true);
  writeFileSync(join(t.sol, "mac", "src", "App.tsx"), "export const b = 9;\n");   // an edit, not kept
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 6;\n");
  const r = released(f.repo, "dev-20261123-0500");
  const runs: string[] = [], built: string[] = [];
  const was = git(t.me, "rev-parse", "HEAD");
  startShip(t.sol, () => {}, deps(t.sol, { build: async (d) => { built.push(d); await build(d); }, runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear(word(r));
  await soon(() => runs.length > 0);
  assert.deepEqual(runs, ["changes"]);
  assert.deepEqual(built, [], "nothing built aside every ten minutes for a Sol that cannot take it");
  assert.equal(git(t.me, "rev-parse", "HEAD"), was);
  assert.equal(readFileSync(join(t.sol, "mac", "src", "App.tsx"), "utf8"), "export const b = 9;\n", "her edit untouched");
});

// the keeper for real: the release this Sol installed by itself dies at start three times; the checkout goes back
// (her own commits kept), and the same release is not installed by itself again, though the keeper names the rebased
// commit, not the release
const PORT = await freePort();
const FAKE = (dieMs: number) => `
const http = require("node:http");
http.createServer((q, r) => { r.end('{"ok":true}'); }).listen(${PORT}, "127.0.0.1");
${dieMs ? `setTimeout(() => process.exit(7), ${dieMs});` : ""}
`;
const keep = (engine: string) => {
  try { return execFileSync("bash", [join(engine, "keep")], { cwd: engine, env: { ...process.env, SOL_PORT: String(PORT), SOL_KEEP_GOOD_MS: "4000" }, encoding: "utf8", timeout: 30000 }); }
  catch (e: any) { return String(e.stdout ?? ""); }
};

test("a release a downloaded */mine Sol installed by itself that does not start: the keeper takes it back, her commits kept, and it waits for a newer one", async () => {
  const f = fixture();
  const t = downloaded(f, "ari", true);
  commit(t.me, "sol/mac/src/Mine.tsx", "his own look\n", false);
  const before = git(t.me, "rev-parse", "HEAD");
  const engine = join(t.sol, "engine");
  copyFileSync(join(import.meta.dirname, "..", "keep"), join(engine, "keep")); chmodSync(join(engine, "keep"), 0o755);
  mkdirSync(join(engine, "dist.good")); writeFileSync(join(engine, "dist.good", "index.js"), "/* the good one */" + FAKE(0));
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 7;\n");
  const bad = released(f.repo, "dev-20261123-0600");
  const runs: string[] = [];
  const dying = async (dir: string) => { mkdirSync(join(dir, "dist"), { recursive: true }); writeFileSync(join(dir, "dist", "index.js"), FAKE(1500)); };
  startShip(t.sol, () => {}, deps(t.sol, { build: dying, runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear(word(bad));
  await soon(() => offerNow()?.behind === false);
  const rebased = git(t.me, "rev-parse", "HEAD");
  assert.equal(git(t.me, "rev-parse", "HEAD~1"), bad.sha, "installed by itself, his commit on top");
  assert.ok(existsSync(join(engine, ".swap")), "the way back is written");

  // launchd starts the keeper again after each death; the third takes the Sol back
  let out = "";
  for (let i = 0; i < 3; i++) out += keep(engine);
  assert.match(out, /did not start; Sol went back to/, out);
  assert.equal(git(t.me, "rev-parse", "HEAD"), before, "back where he was, his own commit kept");
  assert.equal(readFileSync(join(engine, "node_modules", "marker"), "utf8"), "installed at start\n", "his packages put back");
  assert.match(readFileSync(join(engine, "dist", "index.js"), "utf8"), /the good one/, "the last good build runs");
  assert.equal(readFileSync(join(engine, ".skip"), "utf8").trim(), rebased, "the keeper names the commit that died: the release with his commit on top");

  // the next engine starts, Ship with it: the same release, heard again, is not installed by itself again
  runs.length = 0;
  startShip(t.sol, () => {}, deps(t.sol, { build: dying, runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear(word(bad));
  await soon(() => runs.length > 0);
  assert.deepEqual(runs, ["build"], "said why it did not install");
  assert.equal(git(t.me, "rev-parse", "HEAD"), before, "not installed again every ten minutes");
  assert.equal(offerNow()?.behind, true, "still offered for Update by hand");

  // a newer release installs, and clears the skip
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 8;\n");
  const good = released(f.repo, "dev-20261123-0700");
  startShip(t.sol, () => {}, deps(t.sol, { runs: (why) => { runs.push(why ?? "runs"); } }));
  await hear(word(good));
  await soon(() => git(t.me, "rev-parse", "HEAD~1") === good.sha && !existsSync(join(engine, ".skip")));
  assert.equal(git(t.me, "rev-parse", "HEAD~1"), good.sha, "the newer release installs, his commit on top");
  assert.equal(existsSync(join(engine, ".skip")), false, "and the skip is gone");
});

test("an engine nothing would start again after its renew (no launchd, no systemd): offered for Update, as before", async () => {
  const f = fixture();
  const t = downloaded(f, "wsl");
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 9;\n");
  const r = released(f.repo, "dev-20261123-0800");
  const built: string[] = [];
  startShip(t.sol, () => {}, deps(t.sol, { kept: async () => false, build: async (d) => { built.push(d); await build(d); } }));
  await hear(word(r));
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(offerNow()?.behind, true, "offered");
  assert.notEqual(git(t.me, "rev-parse", "HEAD"), r.sha, "never installed by itself");
  assert.deepEqual(built, [], "nor built aside");
});

test("a release Update would refuse again (a branch of its own, a main with its own commits) is not built every ten minutes", async () => {
  const f = fixture();
  const t = downloaded(f, "own");
  commit(t.me, "sol/mac/src/App.tsx", "export const b = 7;\n", false);   // her own commit on main: ff-only refuses
  commit(f.repo, "sol/engine/src/index.ts", "export const a = 10;\n");
  const r = released(f.repo, "dev-20261123-0900");
  const built: string[] = [], runs: string[] = [];
  const over = { build: async (d: string) => { built.push(d); await build(d); }, runs: (why?: string) => { runs.push(why ?? "runs"); } } as Partial<Ship>;
  startShip(t.sol, () => {}, deps(t.sol, over));
  await hear(word(r));
  await soon(() => runs.length > 0);
  assert.equal(built.length, 1, "built once, refused");
  await hear(word(r));   // the next ten-minute ask
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(built.length, 1, "not built again");

  git(t.me, "checkout", "-q", "-b", "feature");
  built.length = 0;
  startShip(t.sol, () => {}, deps(t.sol, over));
  await hear(word(r));
  await new Promise((ok) => setTimeout(ok, 200));
  assert.deepEqual(built, [], "a branch Update refuses builds nothing");
});

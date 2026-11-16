// Pin, and go back to any release within thirty days (#426). Real git in temp repos (a bare origin with dev-* tags, a
// plain Sol on main, a */mine Sol) and real saved data in temp homes, converted by the real step 0002 and then gone
// back over: the copy taken before 0002 is put back and what was saved since is lost, as the warning says. The build
// and the engine's end are stand-ins; nothing here touches ~/.sol, sol/home or a running Sol.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_NO_SHIP_CHECK: "1", SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const { runConversions, readVersion, KEEP, KEEP_DAYS } = await import("../src/convert/run.ts");
const { STEPS } = await import("../src/convert/steps.ts");
const { planBack, backTo, undoBack, lostOf, latestIn } = await import("../src/convert/back.ts");
const pin = await import("../src/team/pin.ts");
const carry = await import("../src/team/carry.ts");
const { heardStable, update } = await import("../src/team/ship.ts");
const busy = await import("../src/busy.ts");
type Ctx = import("../src/convert/run.ts").Ctx;

const temps: string[] = [];
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); temps.push(d); return d; };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_EDITOR: "true" } }).trim();
const gitAt = (when: string, cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_COMMITTER_DATE: when, GIT_AUTHOR_DATE: when } }).trim();
const put = (repo: string, file: string, text: string, msg: string) => {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), text);
  git(repo, "add", "-A"); git(repo, "add", "-u", "--renormalize"); git(repo, "commit", "-qm", msg);   // by content, not by time: see `fixture` (#990)
  return git(repo, "rev-parse", "HEAD");
};
const json = (f: string) => JSON.parse(readFileSync(f, "utf8"));

/** a home whose engine folder has a team.json with `night` (as before #428), run through the real steps to 0002 */
function convertedHome(): Ctx {
  const d = tmp("sol-pin-home-");
  const c = { home: join(d, "home"), dotSol: join(d, "home", ".sol"), engine: join(d, "engine") };
  mkdirSync(c.home); mkdirSync(c.engine);
  writeFileSync(join(c.engine, "team.json"), JSON.stringify({ me: { login: "marco" }, night: { hour: 4, staleDays: 9 }, rooms: [] }, null, 2));
  const r = runConversions(c, STEPS);
  assert.equal(r.ok, true); assert.equal(r.version, 2);
  return c;
}
const touched = (c: Ctx) => (id: number) => { const s = STEPS.find((x) => x.id === id); return !!s && s.touches(c).length > 0; };

beforeEach(() => { pin.resetPin(); carry.resetCarry(); busy._reset(); });

// ---- the data, over the real step 0002 ----

test("going back over 0002: the copy from before it is put back, what was saved since is lost, and forward again converts it again", () => {
  const c = convertedHome();
  const team = join(c.engine, "team.json"), night = join(c.engine, "night.json");
  assert.equal("night" in json(team), false);
  assert.deepEqual(json(night).hour, 4);
  // saved after 0002: a room joined. Going back loses it, as the warning says
  writeFileSync(team, JSON.stringify({ ...json(team), rooms: [{ id: "r1" }] }, null, 2));
  const p = planBack(c, 1, touched(c));
  assert.equal(p.error, undefined);
  assert.deepEqual(p.steps.map((s) => s.step), ["0002-rhythm-from-team-json"]);
  assert.deepEqual(lostOf(p).map((l) => l.path).sort(), [night, team].sort());
  const r = backTo(c, p);
  assert.equal(r.ok, true);
  assert.equal(readVersion(c.dotSol), 1);
  assert.deepEqual(json(team).night, { hour: 4, staleDays: 9 });   // as the release before 0002 reads it
  assert.deepEqual(json(team).rooms, []);                          // the room joined since: lost
  assert.equal(existsSync(night), false);                          // 0002 made it; before it there was none
  // back to latest: the newer build's start converts again, from the data as it is now
  const again = runConversions(c, STEPS);
  assert.deepEqual(again.ran, ["0002-rhythm-from-team-json"]);
  assert.equal("night" in json(team), false);
  assert.equal(json(night).hour, 4);
  // and the copy of before going back puts it all as it was
  assert.equal(r.ok && undoBack(c, r.kept), true);
  assert.deepEqual(json(team).rooms, [{ id: "r1" }]);
});

test("going back never half-does it: a copy that cannot be put back leaves every file and the version as they were", () => {
  const c = convertedHome();
  const team = join(c.engine, "team.json");
  const before = readFileSync(team, "utf8");
  const p = planBack(c, 1, touched(c));
  rmSync(join(c.dotSol, "convert-backup", "0002", "files", "0"));   // the copy of team.json is gone under it
  const r = backTo(c, p);
  assert.equal(r.ok, false);
  assert.equal(readFileSync(team, "utf8"), before);
  assert.equal(existsSync(join(c.engine, "night.json")), true);
  assert.equal(readVersion(c.dotSol), 2);
  // a plan read before the data moved is refused
  writeFileSync(join(c.dotSol, "data-version"), "3\n");
  assert.match((backTo(c, p) as { error: string }).error, /moved since the plan/);
});

test("a step that copied nothing is nothing to put back; one whose copy should be there and is not is refused", () => {
  const c = convertedHome();
  rmSync(join(c.dotSol, "convert-backup", "0002"), { recursive: true });
  assert.equal(planBack(c, 1, () => false).error, undefined);
  assert.equal(planBack(c, 1, () => false).steps[0].files.length, 0);
  assert.match(planBack(c, 1, () => true).error ?? "", /not kept any more/);
  assert.equal(latestIn(["sol/engine/src/convert/0001-baseline.ts", "sol/engine/src/convert/0002-rhythm-from-team-json.ts", "sol/engine/src/convert/run.ts"]), 2);
  assert.equal(latestIn([]), 0);
});

test("copies younger than thirty days are kept past the last few; older ones go", () => {
  const d = tmp("sol-pin-prune-");
  const c = { home: join(d, "home"), dotSol: join(d, "home", ".sol"), engine: join(d, "engine") };
  mkdirSync(c.home); mkdirSync(c.engine);
  const f = join(c.engine, "settings.json");
  writeFileSync(f, "{}");
  const steps = Array.from({ length: KEEP + 3 }, (_, i) => ({ id: i + 1, name: `s${i + 1}`, touches: () => [f], run: () => writeFileSync(f, JSON.stringify({ n: i + 1 })) }));
  runConversions(c, steps);
  const root = join(c.dotSol, "convert-backup");
  assert.equal(readdirSync(root).length, KEEP + 3);   // all young: all kept
  const old = new Date(Date.now() - (KEEP_DAYS + 1) * 86_400_000);
  for (const n of ["0001", "0002"]) utimesSync(join(root, n), old, old);
  runConversions(c, [...steps, { id: KEEP + 4, name: "more", touches: () => [f], run: () => {} }]);
  assert.deepEqual(readdirSync(root).sort(), ["0003", "0004", "0005", "0006", "0007", "0008", "0009"]);   // the old ones past the last few gone, the young kept
});

// ---- the Sol: git, the pin, the move ----

/** origin with three releases: dev-20261001 (older than thirty days), dev-<10 days ago> before 0002 and dev-<yesterday> with it.
 *  App.tsx is written twice with the same size; git sees a change by size and time to the second, and a machine whose
 *  clock steps back (WSL under load, about 0.8 s every half minute) can give the second write the first one's second.
 *  So `put` also stages what is tracked by content (add -u --renormalize), or `git add -A` misses it and the commit has nothing (#990) */
function fixture() {
  const top = tmp("sol-pin-");
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const team = join(top, "team");
  mkdirSync(team);
  git(team, "init", "-q", "-b", "main");
  git(team, "remote", "add", "origin", origin);
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const tagAt = (tag: string, ago: number) => gitAt(day(ago), team, "tag", "-a", tag, "-m", tag);
  put(team, "sol/engine/src/index.ts", "export const a = 1;\n", "start");
  put(team, "sol/engine/src/convert/0001-baseline.ts", "// 1\n", "Merge pull request #422 from a/b");
  tagAt("dev-20260920", 40);
  const old = put(team, "sol/mac/src/App.tsx", "export const b = 1;\n", "Merge pull request #1 from a/b");
  tagAt("dev-old", 10);
  put(team, "sol/engine/src/convert/0002-rhythm-from-team-json.ts", "// 2\n", "Merge pull request #428 from a/b");
  put(team, "sol/engine/src/team/pin.ts", "// pin\n", "Merge pull request #426 from a/b");   // dev-old is older than pinning
  const latest = put(team, "sol/mac/src/App.tsx", "export const b = 2;\n", "Merge pull request #2 from a/b");
  tagAt("dev-new", 1);
  git(team, "push", "-q", "origin", "main", "--tags");
  git(team, "push", "-q", "origin", "main:refs/heads/dev");
  const sol = join(top, "sol-here");
  git(top, "clone", "-q", origin, sol);
  return { top, origin, team, sol, root: join(sol, "sol"), old, latest };
}

function start(root: string, ctx: Ctx, o: { build?: () => Promise<string | null>; agent?: (copy: string) => void } = {}) {
  const told: any[] = [], ended: number[] = [], pins: (string | null)[] = [];
  let builds = 0;
  void carry.startCarry({
    root, open: async (a) => { o.agent?.(a.cwd); return "s1"; }, working: () => false, quiet: () => true,
    tell: (m) => told.push(m), updated: () => {}, now: () => new Date(), wentBack: (c) => pin.wentBack(c),
  });
  const ready = pin.startPin({
    root, ctx, now: () => new Date(), quietMs: 0,
    build: async () => { builds++; return o.build ? o.build() : null; },
    exit: () => ended.push(Date.now()),
    tell: (m) => told.push(m),
    touched: touched(ctx),
    carry: (a) => carry.carryOver({ kind: "update", onto: a.onto, source: "HEAD", tag: a.tag, base: a.base, back: a.back }),
    pinned: (p) => pins.push(p ? p.tag : null),
  });
  return { told, ended, pins, ready, builds: () => builds };
}
const ship = (root: string) => ({ root, channel: async () => "dev" as const, auto: false });

test("the releases of the last thirty days, each with the newest step its build knows; an older one cannot be gone back to", async () => {
  const f = fixture();
  const s = start(f.root, convertedHome());
  await s.ready;
  const v = await pin.view(true);
  assert.deepEqual(v.releases.map((r) => [r.tag, r.data, r.pins]), [["dev-new", 2, true], ["dev-old", 1, false]]);
  assert.deepEqual(v.here, { tag: "dev-new", sha: f.latest });
  assert.equal(v.pin, null);
  assert.match((await pin.plan("dev-20260920") as { error: string }).error, /not a release of the last 30 days/);
  assert.match((await pin.plan("dev-new") as { error: string }).error, /runs dev-new already/);
});

test("a plain Sol goes back over 0002: warned first, then on `pinned` at the release, main untouched, the data put back, the engine ends", async () => {
  const f = fixture();
  const ctx = convertedHome();
  const team = join(ctx.engine, "team.json");
  writeFileSync(team, JSON.stringify({ ...json(team), rooms: [{ id: "since" }] }));
  const s = start(f.root, ctx);
  await s.ready;
  const p = await pin.plan("dev-old");
  assert.ok(!("error" in p));
  if ("error" in p) return;
  assert.deepEqual([p.data.from, p.data.to], [2, 1]);
  assert.deepEqual(p.lost.map((l) => l.file.split("/").pop()).sort(), ["night.json", "team.json"]);
  assert.match(p.said, /goes back to dev-old/);
  assert.match(p.said, /is lost/);
  assert.match(p.said, /team\.json/);
  assert.equal(p.pins, false);
  assert.match(p.said, /older than pinning, so it has no back to latest: to come back, type `git -C ".*" switch main` in a Terminal/);
  assert.doesNotMatch(p.said, /\b(commits?|rebas\w*|conflicts?|checkout)\b/i);
  // what was said is what happens, or nothing does
  assert.match((await pin.goBack("dev-old", "not-it") as { error: string }).error, /look again/);
  const r = await pin.goBack("dev-old", p.sure);
  assert.equal(r.ok, true);
  await pin.goSettled();
  assert.equal(git(f.root, "branch", "--show-current"), "pinned");
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.old);
  assert.equal(git(f.root, "rev-parse", "refs/heads/main"), f.latest);   // main never moves backwards
  assert.equal(readVersion(ctx.dotSol), 1);
  assert.deepEqual(json(team).night, { hour: 4, staleDays: 9 });
  assert.equal(json(team).rooms.length, 0);
  assert.equal(existsSync(join(ctx.engine, "night.json")), false);
  assert.equal(s.builds(), 1);
  assert.equal(s.ended.length, 1);   // the newer code never runs on the older data
  assert.equal(pin.pinNow()?.tag, "dev-old");
  assert.ok(git(f.root, "for-each-ref", "refs/sol/went-back-from/").includes(f.latest));
  // pinned: no offer, no update
  assert.equal(await heardStable(ship(f.root), { sha: f.latest, tag: "dev-new", channel: "dev" }), null);
  assert.match(((await update(ship(f.root), "dev")) as { error: string }).error, /pinned to dev-old/);
  // a restart reads the pin from this checkout's git folder
  pin.resetPin();
  await pin.startPin({ root: f.root, ctx, now: () => new Date(), build: async () => null, exit: () => {}, tell: () => {}, touched: () => false });
  assert.equal(pin.pinNow()?.tag, "dev-old");
  // back to latest: on main again, `pinned` gone; the update and the steps forward are the usual ones
  assert.equal((await pin.unpin()).ok, true);
  assert.equal(git(f.root, "branch", "--show-current"), "main");
  assert.equal(git(f.root, "branch", "--list", "pinned"), "");
  assert.equal(pin.pinNow(), null);
  // a pin whose Sol moved by other means (an older release's way back: a switch by hand) is dropped at the next start
  assert.equal((await pin.pinHere()).ok, true);
  git(f.root, "switch", "-q", "main");
  pin.resetPin();
  await pin.startPin({ root: f.root, ctx, now: () => new Date(), build: async () => null, exit: () => {}, tell: () => {}, touched: () => false });
  assert.equal(pin.pinNow(), null);
});

test("a release that does not build: the Sol is as it was, the data too, and it says why", async () => {
  const f = fixture();
  const ctx = convertedHome();
  const before = readFileSync(join(ctx.engine, "team.json"), "utf8");
  const s = start(f.root, ctx, { build: async () => "src/x.ts(1,1): error TS2304" });
  await s.ready;
  const p = await pin.plan("dev-old");
  if ("error" in p) assert.fail(p.error);
  await pin.goBack("dev-old", p.sure);
  await pin.goSettled();
  assert.equal(git(f.root, "branch", "--show-current"), "main");
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.latest);
  assert.equal(git(f.root, "branch", "--list", "pinned"), "");
  assert.equal(readVersion(ctx.dotSol), 2);
  assert.equal(readFileSync(join(ctx.engine, "team.json"), "utf8"), before);
  assert.equal(pin.pinNow(), null);
  assert.equal(s.ended.length, 0);
  const failed = s.told.find((m) => m.type === "team.pin.failed");
  assert.match(failed?.error ?? "", /did not build here.*as it was/);
});

test("something that starts while the release builds: nothing moves, the data neither; two quick presses go once", async () => {
  const f = fixture();
  const ctx = convertedHome();
  const before = readFileSync(join(ctx.engine, "team.json"), "utf8");
  let leave = () => {};
  const s = start(f.root, ctx, { build: async () => { leave = busy.join("work", "s7", "a turn started during the build"); return null; } });
  await s.ready;
  const p = await pin.plan("dev-old");
  if ("error" in p) assert.fail(p.error);
  const [one, two] = await Promise.all([pin.goBack("dev-old", p.sure), pin.goBack("dev-old", p.sure)]);
  assert.equal(one.ok, true);
  assert.match((two as { error: string }).error, /already/);
  await pin.goSettled();
  leave();
  assert.equal(git(f.root, "branch", "--show-current"), "main");
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.latest);
  assert.equal(readVersion(ctx.dotSol), 2);
  assert.equal(readFileSync(join(ctx.engine, "team.json"), "utf8"), before);
  assert.equal(pin.pinNow(), null);
  assert.equal(s.ended.length, 0);
  assert.match(s.told.find((m) => m.type === "team.pin.failed")?.error ?? "", /something started/);
});

test("it waits for a quiet moment: nothing moves while something is live", async () => {
  const f = fixture();
  const ctx = convertedHome();
  const s = start(f.root, ctx);
  await s.ready;
  const p = await pin.plan("dev-old");
  if ("error" in p) assert.fail(p.error);
  const leave = busy.join("work", "s9", "a turn");
  const r = await pin.goBack("dev-old", p.sure);
  assert.deepEqual(r, { ok: true, waiting: true });
  await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.latest);
  assert.match((await pin.goBack("dev-old", p.sure) as { error: string }).error, /already/);
  leave();
  await pin.goSettled();
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.old);
});

test("pin here and back to latest: a plain Sol stays where it is, offered nothing, until unpinned", async () => {
  const f = fixture();
  const s = start(f.root, convertedHome());
  await s.ready;
  const r = await pin.pinHere();
  assert.ok(r.ok);
  assert.equal(git(f.root, "branch", "--show-current"), "pinned");
  assert.equal(git(f.root, "rev-parse", "HEAD"), f.latest);   // nothing in it changed
  assert.deepEqual(s.pins, ["dev-new"]);
  assert.equal(pin.pinNow()?.was, "main");
  assert.equal((await pin.unpin()).ok, true);
  assert.equal(git(f.root, "branch", "--show-current"), "main");
  assert.deepEqual(s.pins, ["dev-new", null]);
});

/** a <you>/mine Sol on dev-new with one change of its own */
function mineSol(f: ReturnType<typeof fixture>, file = "sol/notes.md") {
  git(f.sol, "checkout", "-q", "-b", "marco/mine", "origin/main");
  return put(f.sol, file, "mine\n", "mine: my notes");
}

test("a */mine Sol goes back with its own changes on top, by themselves when they fit; data before 0002 too", async () => {
  const f = fixture();
  mineSol(f);
  const ctx = convertedHome();
  const s = start(f.root, ctx);
  await s.ready;
  const p = await pin.plan("dev-old");
  if ("error" in p) assert.fail(p.error);
  assert.equal(p.own, 1);
  assert.match(p.said, /Your own change comes along/);
  await pin.goBack("dev-old", p.sure);
  await pin.goSettled();
  assert.equal(git(f.root, "branch", "--show-current"), "marco/mine");
  assert.equal(git(f.root, "rev-parse", "HEAD~1"), f.old);
  assert.deepEqual(git(f.root, "log", "--format=%s", `${f.old}..HEAD`).split("\n"), ["mine: my notes"]);
  assert.equal(readVersion(ctx.dotSol), 1);
  assert.equal(pin.pinNow()?.tag, "dev-old");
  assert.equal(s.ended.length, 1);
  assert.equal((await pin.view()).here?.tag, "dev-old");
});

test("a */mine Sol with a merge of its own is never flattened by the move: the carry takes it, nothing moved yet", async () => {
  const f = fixture();
  mineSol(f);
  git(f.sol, "checkout", "-q", "-b", "side");
  put(f.sol, "sol/side.md", "side\n", "mine: a side");
  git(f.sol, "checkout", "-q", "marco/mine");
  put(f.sol, "sol/more.md", "more\n", "mine: more");
  git(f.sol, "merge", "-q", "--no-ff", "-m", "mine: fold the side", "side");
  const head = git(f.sol, "rev-parse", "HEAD");
  const ctx = convertedHome();
  const s = start(f.root, ctx);
  await s.ready;
  const p = await pin.plan("dev-old");
  if ("error" in p) assert.fail(p.error);
  await pin.goBack("dev-old", p.sure);
  await pin.goSettled();
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);   // the folder as it was
  assert.equal(readVersion(ctx.dotSol), 2);
  assert.ok(s.told.some((m) => m.type === "team.pin.carry"));
  assert.equal(carry.carryNow()?.back?.tag, "dev-old");
  assert.equal(typeof carry.carryNow()?.back?.data, "string");   // what the warning said goes back, kept for Use it
  assert.match((await pin.pinHere() as { error: string }).error, /carried over/);
});

test("a */mine Sol whose change clashes with the older release: #425's side copy and session carry it, Use it lands it with the data and the pin", async () => {
  const f = fixture();
  // his change edits what dev-new changed since dev-old: onto dev-old it clashes
  git(f.sol, "checkout", "-q", "-b", "marco/mine", "origin/main");
  put(f.sol, "sol/mac/src/App.tsx", "export const b = 2; // mine\n", "mine: a note in the window");
  const ctx = convertedHome();
  const s = start(f.root, ctx, {
    agent: (copy) => {   // what the session's agent does in the copy: resolves the clash keeping his meaning
      writeFileSync(join(copy, "sol/mac/src/App.tsx"), "export const b = 1; // mine\n");
      git(copy, "add", "-A");
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", "rebase", "--continue"], { cwd: copy, env: { ...process.env, GIT_EDITOR: "true" } });
    },
  });
  await s.ready;
  const head = git(f.root, "rev-parse", "HEAD");
  const p = await pin.plan("dev-old");
  if ("error" in p) assert.fail(p.error);
  await pin.goBack("dev-old", p.sure);
  await pin.goSettled();
  assert.equal(git(f.root, "rev-parse", "HEAD"), head);   // the live folder did not move yet
  assert.equal(pin.pinNow(), null);
  assert.equal(readVersion(ctx.dotSol), 2);
  const c = await carry.check();
  assert.equal(c?.stage, "ready");
  assert.deepEqual([c?.back?.tag, c?.back?.version, typeof c?.back?.data], ["dev-old", 1, "string"]);
  assert.equal((await carry.useIt() as { ok?: boolean }).ok, true);
  await carry.moveSettled();
  assert.equal(git(f.root, "rev-parse", "HEAD~1"), f.old);
  assert.equal(readFileSync(join(f.sol, "sol/mac/src/App.tsx"), "utf8"), "export const b = 1; // mine\n");
  assert.throws(() => git(f.root, "rev-parse", "--verify", "-q", "refs/heads/dev"));   // going back sets no channel branch
  assert.equal(pin.pinNow()?.tag, "dev-old");
  assert.equal(readVersion(ctx.dotSol), 1);
  assert.equal(s.ended.length, 1);
  assert.equal(carry.carryNow(), null);
});

test("a plain Sol with commits of its own that are in no release cannot go back from there", async () => {
  const f = fixture();
  put(f.sol, "sol/x.md", "x\n", "a commit of its own");
  const s = start(f.root, convertedHome());
  await s.ready;
  assert.match((await pin.plan("dev-old") as { error: string }).error, /in no release/);
});

// Cowork ways, step 4b part 4 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §9 step 4): the messages and the
// runner's loop at the start, on real trails in a temp folder, written through the real door. Frank's NucBox is the
// way's runner, Marco's Mini a teammate's Sol, Isaac's Air a guest's. Every clock is handed in. Nothing leaves this
// test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-wire-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_WAY_CACHE_CHECK = "1";   // every read through the fold cache held against readWays (way-reader.ts)
process.env.SOL_COWORK_WAYS = "off";   // the ways' switch is on by default (#691); these tests start it off
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "frank", name: "Frank" }, relay: { key: "x" }, rooms: [] }));

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { rowsOf } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { runTurns, slotsOf, version } = await import("../src/team/v3/way-writer.ts");
const { answerWay, startWays, previewOff } = await import("../src/team/v3/way-wire.ts");
const { previewOf } = await import("../src/team/v3/way-preview.ts");
const { WAYS_ENV } = await import("../src/team/v3/way-switch.ts");
const { load } = await import("../src/way/load.ts");
const { DRAFTS_WAY } = await import("./fixtures/sol-drafts-way.ts");

const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
const L = load(FILE);
/** the second version: Marco keeps the ground with Frank (touches the keeper role, and adds Marco to it) */
const FILE2 = structuredClone(FILE);
FILE2.roles.keeper.who = ["person:frank", "person:marco"];
const L2 = load(FILE2);
/** a third: the reminder after 21 days, not 14 (touches no role) */
const FILE3 = structuredClone(FILE2);
FILE3.triggers.remind.if.all[1].older = "21d";
const L3 = load(FILE3);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
const at = (m: number) => () => T(m);
let count = 0;
const sol = (machine: string) => {
  const d = join(dir, `${machine}-${++count}`);
  const keys = new Keys(join(d, "keys"), machine);
  return { d, keys, trail: new Trail({ file: join(d, "trail.db"), keys }), files: new WayFiles(join(d, "ways")) };
};
type Sol = ReturnType<typeof sol>;
const FRANK = { person: "frank", machine: "nucbox" };
const put = (s: Sol, by: { person: string; machine?: string }, kind: string, value: unknown, at: number, more: { item?: string } = {}) =>
  s.trail.append({ project: P, by, kind, value, at, ...more });
const sync = (...sols: Sol[]) => { for (const a of sols) for (const b of sols) if (a !== b) b.trail.merge(a.trail.since(P)); };
const n = (s: Sol) => rowsOf(s.trail, P).length;
/** a message as Sol's own window sends it, answered for `me` on Sol `s` at minute `m` */
const ask = (s: Sol, me: string, m: number, msg: Record<string, unknown>) =>
  answerWay({ project: P, way: WAY, rid: 7, ...msg }, { me: () => me, sol: () => s, clock: at(m) }) as Promise<Record<string, any>>;

/** the team: Frank an owner, Marco an editor, Isaac a guest, on three Sols */
function team() {
  const nuc = sol("nucbox"), mini = sol("mini"), air = sol("air");
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(nuc, FRANK, "member", { role: "guest", in: true }, T(1), { item: "isaac" });
  sync(nuc, mini, air);
  return { nuc, mini, air };
}

test("4b messages: with the ways' switch off nothing answers; on, a question it cannot take is an error, never a write", async () => {
  const { nuc } = team();
  assert.equal(await ask(nuc, "frank", 5, { type: "team.v3.way.read" }), null, "off: no answer");
  process.env[WAYS_ENV] = "on";
  try {
    const before = n(nuc);
    assert.deepEqual(await ask(nuc, "frank", 5, { type: "team.v3.way.read", project: "../x" }), { type: "team.v3.way.read", rid: 7, error: "which project?" });
    assert.equal((await ask(nuc, "frank", 5, { type: "team.v3.way.press", way: "" })).error, "which way?");
    assert.equal((await ask(nuc, "", 5, { type: "team.v3.way.read" })).error, "sign in to GitHub first: a way's events are signed as you");
    assert.equal((await ask(nuc, "frank", 5, { type: "team.v3.way.press", thing: "d1" })).error, "which thing, which move?");
    assert.equal((await ask(nuc, "frank", 5, { type: "team.v3.way.propose", file: "x" })).error, "which file?");
    assert.equal((await ask(nuc, "frank", 5, { type: "team.v3.way.agree", to: L.ver })).error, "which version, which role?");
    assert.equal((await ask(nuc, "frank", 5, { type: "team.v3.way.apply" })).error, "which version?");
    assert.equal((await ask(nuc, "frank", 5, { type: "team.v3.way.nope" })).error, "no such call");
    assert.equal(n(nuc), before, "nothing written");
    assert.deepEqual((await ask(nuc, "frank", 5, { type: "team.v3.way.read" })).ways, [], "no way yet");
  } finally { process.env[WAYS_ENV] = "off"; }
});

test("4b messages: a way started and changed through the messages: proposed (file first), agreed by each person it puts in a role, applied; a guest, another case of the login and an apply nobody agreed to write nothing", async () => {
  const { nuc, mini, air } = team();
  process.env[WAYS_ENV] = "on";
  try {
    // Isaac is a guest: nothing of his is written
    const g = await ask(air, "isaac", 2, { type: "team.v3.way.propose", file: FILE });
    assert.deepEqual([g.versioned.ok, g.versioned.why, g.versioned.written], [false, "guest", []]);
    // the login exactly as Sol keeps it: another case is refused, not mended
    assert.equal((await ask(nuc, "Frank", 2, { type: "team.v3.way.propose", file: FILE })).versioned.why, "login_case");
    // Frank proposes: the file, then the proposal naming it, every part a slot (a first version)
    const before = n(nuc);
    const p = (await ask(nuc, "frank", 2, { type: "team.v3.way.propose", file: FILE })).versioned;
    assert.deepEqual([p.ok, p.ver, p.at, p.written.map((w: any) => w.kind)], [true, L.ver, T(2), ["wayfile", "way.proposed"]]);
    const proposed = rowsOf(nuc.trail, P).find((e) => e.kind === "way.proposed")!;
    assert.deepEqual([proposed.item, proposed.value], [L.ver, { way: WAY, from: "", slots: slotsOf(undefined, L.way!) }]);
    assert.equal(n(nuc), before + 2);
    // the same file again: the file is on the trail already, only a proposal
    assert.deepEqual((await ask(nuc, "frank", 3, { type: "team.v3.way.propose", file: FILE })).versioned.written.map((w: any) => w.kind), ["way.proposed"]);
    // an apply nobody agreed to: the fold would set it aside, so it is not written
    const early = (await ask(nuc, "frank", 4, { type: "team.v3.way.apply", to: L.ver })).versioned;
    assert.deepEqual([early.ok, early.why, early.written], [false, "not_agreed", []]);
    // a role nobody holds, and an agreement of Marco's for Frank's role: set aside, so not written
    sync(nuc, mini, air);
    assert.equal((await ask(mini, "marco", 9, { type: "team.v3.way.agree", to: L.ver, role: "nobody" })).versioned.why, "unknown_role");
    assert.equal((await ask(mini, "marco", 9, { type: "team.v3.way.agree", to: L.ver, role: "keeper" })).versioned.why, "not_allowed");
    // each person their own: Marco as explorer on his Mini, Frank as keeper (and the runner's person) on his NucBox
    const a1 = (await ask(mini, "marco", 10, { type: "team.v3.way.agree", to: L.ver, role: "explorer" })).versioned;
    const a2 = (await ask(nuc, "frank", 11, { type: "team.v3.way.agree", to: L.ver, role: "keeper" })).versioned;
    assert.deepEqual([a1.ok, a1.written.map((w: any) => w.kind), a2.ok], [true, ["way.agreed"], true]);
    assert.equal(rowsOf(mini.trail, P).find((e) => e.id === a1.written[0].id)?.base, undefined, "no apply yet: no base");
    // until Marco's agreement arrives, Frank's apply is not agreed on his NucBox; after it, it is
    assert.equal((await ask(nuc, "frank", 12, { type: "team.v3.way.apply", to: L.ver })).versioned.why, "not_agreed");
    sync(nuc, mini, air);
    const ap = (await ask(nuc, "frank", 20, { type: "team.v3.way.apply", to: L.ver })).versioned;
    assert.deepEqual([ap.ok, ap.at, ap.written.map((w: any) => w.kind)], [true, T(20), ["way.applied"]]);
    assert.deepEqual(rowsOf(nuc.trail, P).find((e) => e.id === ap.written[0].id)?.value, { way: WAY, from: "", to: L.ver, reader: 1 });
    sync(nuc, mini, air);
    // read, on Marco's Mini: in force, his role, his standing, nothing waiting
    const r = (await ask(mini, "marco", 21, { type: "team.v3.way.read" })).ways;
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].way, r[0].ver, r[0].runner, r[0].standing, r[0].mine, r[0].proposals, r[0].waiting, r[0].runnerAhead], [WAY, L.ver, "nucbox@frank", "editor", ["explorer"], [], [], false]);
    assert.equal(r[0].file.id, WAY);
    // the second version, proposed by Frank at 21; Marco's Mini, its clock behind (minute 5), agrees all the same:
    // dated after the apply it is given on, and naming it
    await ask(nuc, "frank", 21, { type: "team.v3.way.propose", file: FILE2 });
    sync(nuc, mini, air);
    const r2 = (await ask(mini, "marco", 22, { type: "team.v3.way.read" })).ways[0];
    assert.deepEqual(r2.proposals.map((x: any) => [x.ver, x.by, x.slots, x.file?.id, x.mine]), [[L2.ver, "person:frank", ["roles"], WAY, ["explorer", "keeper"]]], "Marco may agree as keeper: the new version puts him there");
    const late = (await ask(mini, "marco", 5, { type: "team.v3.way.agree", to: L2.ver, role: "keeper" })).versioned;
    assert.deepEqual([late.ok, late.at], [true, T(20) + 1], "not before the apply it is given on");
    assert.deepEqual(rowsOf(mini.trail, P).find((e) => e.id === late.written[0].id)?.base, [ap.written[0].id]);
    sync(nuc, mini, air);
    // Marco is put into keeper: his own agreement and one holder's (Frank) are needed; Frank's comes, then the apply
    assert.equal((await ask(nuc, "frank", 23, { type: "team.v3.way.apply", to: L2.ver })).versioned.why, "not_agreed");
    assert.equal((await ask(nuc, "frank", 24, { type: "team.v3.way.agree", to: L2.ver, role: "keeper" })).versioned.ok, true);
    const ap2 = (await ask(nuc, "frank", 25, { type: "team.v3.way.apply", to: L2.ver })).versioned;
    assert.deepEqual([ap2.ok, ap2.why], [true, ""]);
    sync(nuc, mini, air);
    assert.deepEqual((await ask(mini, "marco", 26, { type: "team.v3.way.read" })).ways[0].mine, ["explorer", "keeper"]);
    // nothing to propose of what is in force; a file of another way; a file that does not read
    assert.equal((await ask(nuc, "frank", 27, { type: "team.v3.way.propose", file: FILE2 })).versioned.why, "same_version");
    assert.equal((await ask(nuc, "frank", 27, { type: "team.v3.way.propose", file: { ...FILE2, id: "sol.other" } })).versioned.why, "other_way");
    assert.equal((await ask(nuc, "frank", 27, { type: "team.v3.way.propose", file: { way: 1 } })).versioned.why, "way_unread");
    // a revert: back to the first version touches the keeper role again, so it needs a keeper's agreement other than
    // the signer's own role: Frank holds keeper, so his own revert is enough (FORMAT §3)
    const rv = (await ask(nuc, "frank", 28, { type: "team.v3.way.revert", to: L.ver })).versioned;
    assert.deepEqual([rv.ok, rv.written.map((w: any) => w.kind)], [true, ["way.reverted"]]);
    // a press through the messages: Marco makes a draft
    sync(nuc, mini, air);
    const pr = (await ask(mini, "marco", 30, { type: "team.v3.way.press", thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } })).pressed;
    assert.deepEqual([pr.ok, pr.written.map((w: any) => w.kind)], [true, ["way.made", "way.move", "way.set", "way.note"]]);
    const things = (await ask(mini, "marco", 31, { type: "team.v3.way.read" })).ways[0].things;
    assert.equal(things.d1.state, "on_switch");
    // a guest's press writes nothing
    sync(nuc, mini, air);
    assert.equal((await ask(air, "isaac", 32, { type: "team.v3.way.press", thing: "d2", kind: "draft", move: "make", set: { title: "x", switch: "y" } })).pressed.why, "guest");
  } finally { process.env[WAYS_ENV] = "off"; }
});

test("4b messages: a preview runs in a worker of its own at this Sol's clock: nothing in force yet says so, a changed reminder is replayed over the history, and the worker's answer is the pure one's", async () => {
  const { nuc, mini } = team();
  process.env[WAYS_ENV] = "on";
  try {
    put(nuc, FRANK, "wayfile", FILE, T(2), { item: L.ver });
    sync(nuc, mini);
    assert.deepEqual((await ask(nuc, "frank", 3, { type: "team.v3.way.preview", to: L.ver })).preview, { ok: false, why: "not_applied" });
    await ask(mini, "marco", 10, { type: "team.v3.way.agree", to: L.ver, role: "explorer" });
    await ask(nuc, "frank", 11, { type: "team.v3.way.agree", to: L.ver, role: "keeper" });
    sync(nuc, mini);
    assert.equal((await ask(nuc, "frank", 20, { type: "team.v3.way.apply", to: L.ver })).versioned.ok, true);
    sync(nuc, mini);
    await ask(mini, "marco", 30, { type: "team.v3.way.press", thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } });
    sync(nuc, mini);
    assert.equal((await ask(mini, "marco", 31, { type: "team.v3.way.propose", file: FILE3 })).versioned.why, "", "proposed");
    sync(nuc, mini);
    const day = 1440, now = 20 * day;
    // the runner reminds on day 16 under the first version (older than 14 days)
    const turned = runTurns(nuc, P, "frank", at(16 * day));
    assert.ok(rowsOf(nuc.trail, P).some((e) => turned[0].written.some((w) => w.id === e.id) && e.kind === "way.fired"), "the reminder fired");
    sync(nuc, mini);
    const pv = (await ask(nuc, "frank", now, { type: "team.v3.way.preview", to: L3.ver })).preview;
    assert.equal(pv.ok, true);
    assert.deepEqual([pv.replayed.way, pv.replayed.from, pv.replayed.to, pv.replayed.things.map((x: any) => x.thing)], [WAY, L.ver, L3.ver, ["d1"]]);
    assert.equal(pv.replayed.differ, 1, "reminded on day 14 under the first version, not under the third");
    // the worker's answer is the pure one's, handed the same
    const rows = rowsOf(nuc.trail, P), held = [L.ver, L3.ver].map((ver) => ({ ver, way: nuc.files.get(ver)! }));
    const pure = previewOf({ rows, held, way: WAY, to: L3.ver, now: T(now), until: T(now) });
    assert.deepEqual(await previewOff({ rows, held, way: WAY, to: L3.ver, now: T(now), until: T(now) }), pure);
    assert.deepEqual(pure, pv);
    // a preview that runs out of time is ended and says so
    assert.deepEqual(await previewOff({ rows, held, way: WAY, to: L3.ver, now: T(now), until: T(now) }, 0), { ok: false, why: "too_long" });
    // a version this Sol does not hold
    assert.deepEqual((await ask(nuc, "frank", now, { type: "team.v3.way.preview", to: "f".repeat(64) })).preview, { ok: false, why: "no_file" });
  } finally { process.env[WAYS_ENV] = "off"; }
});

test("4b start: the runner's loop starts only with the ways' switch on, and a turn that wrote is said to Sol's faces", async () => {
  assert.equal(startWays({ me: () => "frank", push: () => {} }), null, "off: no loop");
  process.env[WAYS_ENV] = "on";
  try {
    const said: any[] = [];
    const loop = startWays({ me: () => "frank", push: (m) => said.push(m), clock: at(30) })!;
    assert.ok(loop?.running, "started");
    assert.equal(startWays({ me: () => "frank", push: () => {} }), loop, "once");
    assert.deepEqual([...loop.tick()!.values()], [], "this Sol's trail holds no project yet: nothing to turn");
    loop.stop();
  } finally { process.env[WAYS_ENV] = "off"; }
});

test("4b start: wire.ts answers team.v3.way.* only with the ways' switch on, and starts the loop at the start only with it on; a pull that brought events turns it", () => {
  const SRC = join(import.meta.dirname, "..", "src");
  const wire = readFileSync(join(SRC, "team", "wire.ts"), "utf8");
  assert.match(wire, /case "way": \{\n\s+if \(!\(await import\("\.\/v3\/way-switch\.js"\)\)\.waysOn\(\)\) return;/);
  assert.match(wire, /if \(!sw\.waysOn\(\)\) return;\n\s+const x = await import\("\.\/v3\/way-wire\.js"\);\n\s+x\.startWays\(\{ me: \(\) => getTeam\(\)\.me\.login, push: everyoneTeam \}\);\n\s+\(await import\("\.\/v3\/switchwire\.js"\)\)\.onPulled\(x\.pokeWays\);/);
  const sw = readFileSync(join(SRC, "team", "v3", "switchwire.ts"), "utf8");
  assert.match(sw, /if \(done\.some\(\(x\) => x\.added > 0\)\) for \(const f of pulled\)/);
});

test("4b messages: version() refuses a time it cannot vouch for and an apply out of order, and writes nothing", () => {
  const { nuc } = team();
  put(nuc, FRANK, "wayfile", FILE, T(2), { item: L.ver });
  assert.equal(version(nuc, P, WAY, "frank", { kind: "agree", to: L.ver, role: "keeper" }, () => NaN).why, "no_time");
  assert.equal(version(nuc, P, WAY, "frank", { kind: "agree", to: L.ver, role: "keeper" }, at(-60)).why, "clock_ahead");
  assert.equal(version(nuc, P, WAY, "frank", { kind: "apply", to: "e".repeat(64) }, at(3)).why, "no_file");
  assert.equal(version(nuc, P, WAY, "zoe", { kind: "apply", to: L.ver }, at(3)).why, "not_in_project");
  assert.equal(version(nuc, P, WAY, "frank", { kind: "revert", to: L.ver }, at(3)).why, "wrong_from");
});

test("4b, the seventeenth review: a role event is a fact nobody erases (F1); a version only another project's trail carries is no version here (F2); a login the trail spells otherwise writes nothing, after a restart too (F3)", async () => {
  // F1: Frank lets Marco in as owner, Marco makes Frank a guest; Frank erasing his own 'Marco in' event erases nothing
  const { nuc, mini } = team();
  const letIn = put(nuc, FRANK, "member", { role: "owner", in: true }, T(2), { item: "marco" });
  sync(nuc, mini);
  put(mini, { person: "marco", machine: "mini" }, "member", { role: "guest" }, T(3), { item: "frank" });
  sync(nuc, mini);
  assert.equal(nuc.trail.erase(letIn.id, FRANK), false, "a fact is never erased");
  const { readTrail } = await import("../src/team/v3/way-reader.ts");
  assert.deepEqual(["frank", "marco"].map((w) => readTrail(nuc.trail, P).book.roleOf(w, T(9))), ["guest", "owner"]);
  // F2: the way's file proposed in another project; in this one nobody can agree to it, apply it or press under it
  process.env[WAYS_ENV] = "on";
  try {
    const t2 = team();
    const other = await answerWay({ type: "team.v3.way.propose", project: "elsewhere", way: WAY, file: FILE }, { me: () => "frank", sol: () => t2.nuc, clock: at(2) }) as Record<string, any>;
    assert.equal(other.versioned.why, "not_in_project", "nobody is in that project: nothing written");
    t2.nuc.trail.append({ project: "elsewhere", by: FRANK, kind: "wayfile", item: L.ver, value: FILE, at: T(2) });
    t2.nuc.files.keep([{ ver: L.ver, file: FILE }]);
    assert.equal(t2.nuc.files.has(L.ver), true, "held, from the other project");
    assert.equal((await ask(t2.nuc, "frank", 11, { type: "team.v3.way.agree", to: L.ver, role: "keeper" })).versioned.why, "no_file");
    assert.equal((await ask(t2.nuc, "frank", 20, { type: "team.v3.way.apply", to: L.ver })).versioned.why, "no_file");
    assert.deepEqual((await ask(t2.nuc, "frank", 20, { type: "team.v3.way.read" })).ways, []);
    // F3: the trail spells Marco "marco"; after a restart, a Sol whose keys are first asked as "Marco" writes nothing
    const t3 = team();
    const restarted = { ...t3.mini, keys: new Keys(join(t3.mini.d, "keys"), "mini") };
    restarted.keys.machineKey("Marco");   // the certificate takes the case of the first ask in the process
    const before = n(t3.mini);
    assert.equal((await ask(restarted, "Marco", 30, { type: "team.v3.way.propose", file: FILE })).versioned.why, "login_case");
    assert.equal((await ask(restarted, "Marco", 30, { type: "team.v3.way.press", thing: "d1", kind: "draft", move: "make" })).pressed.why, "login_case");
    assert.equal(n(t3.mini), before, "nothing written");
  } finally { process.env[WAYS_ENV] = "off"; }
});

test("4b, the seventeenth review: a preview is one at a time (F6), and a push call carries at most PUSH_BYTES (F7)", async () => {
  const { nuc } = team();
  process.env[WAYS_ENV] = "on";
  try {
    let release!: () => void;
    const slow = () => new Promise<any>((done) => { release = () => done({ ok: false, why: "not_applied" }); });
    const first = answerWay({ type: "team.v3.way.preview", project: P, way: WAY, to: L.ver }, { me: () => "frank", sol: () => nuc, clock: at(5), preview: slow });
    const second = await answerWay({ type: "team.v3.way.preview", project: P, way: WAY, to: L.ver }, { me: () => "frank", sol: () => nuc, clock: at(5), preview: slow }) as Record<string, any>;
    assert.deepEqual(second.preview, { ok: false, why: "busy" });
    release();
    assert.deepEqual(((await first) as Record<string, any>).preview, { ok: false, why: "not_applied" });
    const third = await answerWay({ type: "team.v3.way.preview", project: P, way: WAY, to: L.ver }, { me: () => "frank", sol: () => nuc, clock: at(5), preview: async () => ({ ok: false, why: "not_applied" }) }) as Record<string, any>;
    assert.equal(third.preview.why, "not_applied", "free again");
  } finally { process.env[WAYS_ENV] = "off"; }
  const { PUSH_BYTES, underBytes } = await import("../src/team/v3/sync.ts");
  const big = { v: "x".repeat(64 * 1024) };
  const out = underBytes(Array.from({ length: 200 }, () => big));
  assert.ok(out.length > 1 && out.length < 200 && out.length * JSON.stringify(big).length <= PUSH_BYTES, `${out.length} of 200`);
  assert.equal(underBytes([{ v: "x".repeat(3_000_000) }]).length, 1, "one event always goes");
  assert.deepEqual(underBytes([]), []);
});

test("4b, the seventeenth review's re-check: a guest's role events naming others in another case lock nobody out (R2): only the role events that counted say how a login is spelled", async () => {
  const { nuc, mini, air } = team();
  air.trail.append({ project: P, by: { person: "isaac", machine: "air" }, kind: "member", item: "FRANK", value: { role: "guest", in: true }, at: T(2) });
  air.trail.append({ project: P, by: { person: "isaac", machine: "air" }, kind: "member", item: "MARCO", value: { role: "guest", in: true }, at: T(2) + 1 });
  sync(nuc, mini, air);
  process.env[WAYS_ENV] = "on";
  try {
    const p = (await ask(nuc, "frank", 3, { type: "team.v3.way.propose", file: FILE })).versioned;
    assert.deepEqual([p.ok, p.why], [true, ""], "Frank still writes");
    sync(nuc, mini, air);
    assert.equal((await ask(mini, "marco", 10, { type: "team.v3.way.agree", to: L.ver, role: "explorer" })).versioned.ok, true, "so does Marco");
    // an owner who wrote the login in another case can write it again: the last that counted spells it
    put(nuc, FRANK, "member", { role: "editor", in: true }, T(11), { item: "Marco" });
    sync(nuc, mini, air);
    assert.equal((await ask(mini, "marco", 12, { type: "team.v3.way.agree", to: L.ver, role: "explorer" })).versioned.why, "login_case");
    put(nuc, FRANK, "member", { role: "editor", in: true }, T(13), { item: "marco" });
    sync(nuc, mini, air);
    assert.notEqual((await ask(mini, "marco", 14, { type: "team.v3.way.agree", to: L.ver, role: "explorer" })).versioned.why, "login_case");
  } finally { process.env[WAYS_ENV] = "off"; }
});

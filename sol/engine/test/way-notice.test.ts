// Cowork ways, step 4d (docs/cowork-ways-2026-11-10/reports/step4-plan.md §8; FORMAT §3 and §5's last rule): what
// everyone of a way is told of a change of version, a move's change said in words (the cost of rule B), and a press of
// an old version answered by the Sol that wrote it. Frank's NucBox runs the way, Marco's Mini goes offline. Every clock
// is handed in. Nothing leaves this test's temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-notice-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_WAY_CACHE_CHECK = "1";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "frank", name: "Frank" }, relay: { key: "x" }, rooms: [] }));

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { rowsOf } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { WayLoop, press, refuseOld, runTurns, version } = await import("../src/team/v3/way-writer.ts");
const { readOf, told } = await import("../src/team/v3/way-wire.ts");
const { movesChanged, noticeOf } = await import("../src/way/notice.ts");
const { load } = await import("../src/way/load.ts");
const { DRAFTS_WAY } = await import("./fixtures/sol-drafts-way.ts");

const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
const L = load(FILE);
/** FORMAT §3's example of rule B's cost: `want` goes straight to `official`. It touches no role: one press applies it */
const STRAIGHT = structuredClone(FILE);
STRAIGHT.life.draft.moves.find((m: { id: string }) => m.id === "want").to = "official";
const LS = load(STRAIGHT);
/** the reminder after 21 days, not 14: touches no role, moves nothing */
const LATER = structuredClone(FILE);
LATER.triggers.remind.if.all[1].older = "21d";
const LL = load(LATER);
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

/** the team and the way in force: Frank an owner, Marco an editor; each agrees from his own Sol, Frank applies at 20 */
function started() {
  const nuc = sol("nucbox"), mini = sol("mini");
  put(nuc, FRANK, "member", { role: "owner", in: true }, T(0), { item: "frank" });
  put(nuc, FRANK, "member", { role: "editor", in: true }, T(1), { item: "marco" });
  assert.ok(version(nuc, P, WAY, "frank", { kind: "propose", file: FILE }, at(2)).ok);
  sync(nuc, mini);
  assert.ok(version(mini, P, WAY, "marco", { kind: "agree", to: L.ver, role: "explorer" }, at(10)).ok);
  assert.ok(version(nuc, P, WAY, "frank", { kind: "agree", to: L.ver, role: "keeper" }, at(11)).ok);
  sync(nuc, mini);
  assert.ok(version(nuc, P, WAY, "frank", { kind: "apply", to: L.ver }, at(20)).ok);
  sync(nuc, mini);
  return { nuc, mini };
}

test("4d notice (pure): a move sent elsewhere, a move added or gone, a move's `by` or `when` changed are each said in words; the roles told are every role a move names, and the people behind them", () => {
  const n = noticeOf(L.way!, LS.way!, L.ver, LS.ver);
  assert.deepEqual([n.slots, n.touched, n.roles, n.people], [["life"], [], ["explorer", "keeper"], ["frank", "marco"]]);
  assert.deepEqual(n.moves, [{ kind: "draft", move: "want", what: ["to"], say: 'move "want" of draft: to wanted → official' }]);
  const fast = structuredClone(FILE);
  fast.life.draft.moves.push({ id: "fast", from: "wanted", to: "official", by: ["explorer"] });
  const m = fast.life.draft.moves.find((x: { id: string }) => x.id === "promote");
  m.by = ["explorer", "keeper"]; delete m.when;
  fast.life.draft.moves = fast.life.draft.moves.filter((x: { id: string }) => x.id !== "pull");
  assert.deepEqual(movesChanged(L.way!, load(fast).way!).map((c) => [c.move, c.what, c.say]), [
    ["promote", ["when", "by"], 'move "promote" of draft: when solid → (always); by keeper → explorer, keeper'],
    ["fast", "new", 'new move "fast" of draft: wanted → official, by explorer'],
    ["pull", "gone", 'move "pull" of draft is gone'],
  ]);
  // a move's `from` listed in another order is the same move; a change of runner tells both runners' people (grade20 F5)
  const turned = structuredClone(FILE);
  turned.life.draft.moves.find((x: { id: string }) => x.id === "extend").from.reverse();
  turned.runner = "air@isaac";
  const t = noticeOf(L.way!, load(turned).way!, L.ver, "x");
  assert.deepEqual([t.moves, t.people], [[], ["frank", "isaac", "marco"]]);
  // the reminder's change moves nothing: the parts say it, no move is named
  const later = noticeOf(L.way!, LL.way!, L.ver, LL.ver);
  assert.deepEqual([later.slots, later.moves], [["triggers"], []]);
  // a first version: every move is new, every role touched
  const first = noticeOf(undefined, L.way!, "", L.ver);
  assert.deepEqual([first.touched, first.moves.every((c) => c.what === "new")], [["explorer", "keeper"], true]);
});

test("4d notice: a read hands back each change of version with its notice; the faces are told of a new one once, to everyone of the way, a rule B change of a move in words", () => {
  const { nuc, mini } = started();
  runTurns(nuc, P, "frank", at(20.5));   // the runner orders what it holds
  sync(nuc, mini);
  const r = readOf(mini, P, "marco", T(21));
  assert.deepEqual(r[0].changes.map((c: any) => [c.kind, c.from, c.to, c.by]), [["way.applied", "", L.ver, "person:frank"]]);
  const pushed: any[] = [];
  told(mini, P, (m) => pushed.push(m), at(21));
  assert.deepEqual(pushed, [], "the first look tells nothing a read already shows");
  // Marco alone sends `want` straight to `official`: no role touched, no one else agrees
  assert.ok(version(mini, P, WAY, "marco", { kind: "propose", file: STRAIGHT }, at(30)).ok);
  const ap = version(mini, P, WAY, "marco", { kind: "apply", to: LS.ver }, at(31));
  assert.ok(ap.ok, ap.why);
  sync(nuc, mini);
  // the same trail, but files kept nowhere yet: told keeps what the trail carries before it reads the change
  const bare = { ...mini, files: new WayFiles(join(mini.d, "ways-none")) };
  const early: any[] = [];
  told(bare, P, (m) => early.push(m), at(32));
  assert.deepEqual(early, [], "in the open tail it may still be set aside: not told yet");
  assert.deepEqual(readOf(mini, P, "marco", T(32))[0].changes.map((c: any) => [c.to, c.ordered]), [[L.ver, true], [LS.ver, false]]);
  told(nuc, P, () => {}, at(32));   // the NucBox's first look: tells nothing
  runTurns(nuc, P, "frank", at(33));   // the runner orders Marco's apply
  sync(nuc, mini);
  for (const s of [bare, nuc]) {
    const out: any[] = [];
    told(s, P, (m) => out.push(m), at(34));
    assert.equal(out.length, 1);
    const c = out[0].change;
    assert.deepEqual([out[0].type, out[0].way, c.id, c.by, c.from, c.to, c.ordered, c.touched, c.roles, c.people], ["team.v3.way.changed", WAY, ap.written[0].id, "person:marco", L.ver, LS.ver, true, [], ["explorer", "keeper"], ["frank", "marco"]]);
    assert.deepEqual(c.moves.map((x: any) => x.say), ['move "want" of draft: to wanted → official']);
    const again: any[] = [];
    told(s, P, (m) => again.push(m), at(35));
    assert.deepEqual(again, [], "told once");
  }
});

/** Marco's Mini, offline, presses `want` under the version before Frank's change of the reminder; the runner orders it
 *  after the apply */
async function offline() {
  const { nuc, mini } = started();
  assert.ok(press(mini, P, WAY, { person: "marco" }, { thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, at(22)).ok);
  sync(nuc, mini);
  runTurns(nuc, P, "frank", at(23));
  sync(nuc, mini);
  // Frank changes the reminder (touches no role: his press alone); Marco's Mini has not heard and presses `want`
  assert.ok(version(nuc, P, WAY, "frank", { kind: "propose", file: LATER }, at(40)).ok);
  assert.ok(version(nuc, P, WAY, "frank", { kind: "apply", to: LL.ver }, at(41)).ok);
  const want = press(mini, P, WAY, { person: "marco" }, { thing: "d1", move: "want" }, at(42));
  assert.ok(want.ok, want.why);
  sync(nuc, mini);
  // not ordered by the runner yet: set aside in the open tail as old, but not answered until the runner orders it
  const { readCached } = await import("../src/team/v3/way-reader.ts"), { place } = await import("../src/way/fold.ts");
  const { r: r0 } = readCached(mini.trail, P), file = (v: string) => { const f = r0.files.find((x) => x.ver === v); return f ? load(f.file).way ?? undefined : undefined; };
  const tail = place(WAY, r0.ways.get(WAY)!, file, r0.book, { now: T(43) });
  assert.deepEqual([tail.seq.find((x) => x.e.id === want.written[0].id)?.as, tail.p.skipped.find((x) => x.id === want.written[0].id)?.why], ["tail", "old_version"]);
  assert.deepEqual(refuseOld(mini, P, "marco", at(43)), []);
  runTurns(nuc, P, "frank", at(44));
  sync(nuc, mini);
  return { nuc, mini, want: want.written[0].id };
}

test("4d old version: once the runner has ordered Marco's offline press after the apply, his Mini answers it once with way.refused (old_version) on the version in force, from the files the trail carries; it stands in every fold", async () => {
  const { nuc, mini, want } = await offline();
  assert.deepEqual(refuseOld(nuc, P, "frank", at(45)), [], "not Frank's press");
  // a Sol that kept no file yet: refuseOld keeps what the trail carries first
  const x = refuseOld({ ...mini, files: new WayFiles(join(mini.d, "ways-none")) }, P, "marco", at(45));
  assert.deepEqual([x.length, x[0].way, x[0].refused, x[0].whole], [1, WAY, [want], true]);
  const refusal = rowsOf(mini.trail, P).find((e) => e.id === x[0].written[0].id)!;
  assert.deepEqual([refusal.kind, refusal.item, refusal.by, refusal.value], ["way.refused", "d1", { person: "marco", machine: "mini" }, { way: WAY, ver: LL.ver, thing: "d1", move: "want", why: "old_version", because: want }]);
  assert.deepEqual(refuseOld(mini, P, "marco", at(46)), [], "answered once");
  sync(nuc, mini);
  // the refusal stands in every fold (another reason than a state's: taken as it is)
  const r = readOf(nuc, P, "frank", T(47))[0];
  assert.ok(!r.skipped.some((s: any) => s.id === refusal.id), "the refusal is taken");
  assert.ok(r.skipped.some((s: any) => s.id === want && s.why === "old_version"));
});

test("4d old version: the loop answers it and says so to its faces' hook, once", async () => {
  const { mini, want } = await offline();
  const said: any[] = [];
  const loop = new WayLoop({ sol: mini, person: () => "marco", clock: at(45), on: () => true, refused: (project, x) => said.push([project, x]) });
  loop.tick();
  loop.tick();
  assert.deepEqual(said.map(([project, x]) => [project, x.map((y: any) => [y.way, y.refused])]), [[P, [[WAY, [want]]]]]);
  loop.stop();
});

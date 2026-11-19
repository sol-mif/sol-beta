// #1309: my agent presses the moves I set to "do", on the machine I named, with no AI (team/v3/way-do.ts). Real trails
// in a temp folder, written through the real door. Frank's NucBox runs the way; the way names Frank's agent beside Marco
// (explorer) and beside Frank (keeper), and both agreed. Nothing leaves this test's folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-do-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_COWORK_WAYS = "on";
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "frank", name: "Frank" }, relay: { key: "x" }, rooms: [] }));

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { WAYFILE, rowsOf } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { press, runTurns } = await import("../src/team/v3/way-writer.ts");
const { DO_AGENT, DoStore, LIMITS, backable, doPass, doable, namedMachine, readDo, setDo } = await import("../src/team/v3/way-do.ts");
const { answerWay } = await import("../src/team/v3/way-wire.ts");
const { load } = await import("../src/way/load.ts");
const { DRAFTS_WAY } = await import("./fixtures/sol-drafts-way.ts");

const P = "lab", WAY = "sol.drafts";
const FILE = JSON.parse(DRAFTS_WAY.replaceAll('"sha256:tbd"', `"sha256:${"0123456789abcdef".repeat(4)}"`));
FILE.roles.explorer.who.push("agent:frank");
FILE.roles.keeper.who.push("agent:frank");
const L = load(FILE);
const T = (m: number) => Date.UTC(2026, 10, 13, 14, 0) + m * 60_000;
let count = 0;
const sol = (machine: string) => {
  const d = join(dir, `${machine}-${++count}`);
  const keys = new Keys(join(d, "keys"), machine);
  return { keys, trail: new Trail({ file: join(d, "trail.db"), keys }), files: new WayFiles(join(d, "ways")), dir: d };
};
type Sol = ReturnType<typeof sol>;
const FRANK = { person: "frank", machine: "nucbox" };
function started() {
  const nuc = sol("nucbox");
  const put = (kind: string, value: unknown, at: number, more: { item?: string; by?: typeof FRANK } = {}) => nuc.trail.append({ project: P, by: more.by ?? FRANK, kind, value, at, ...(more.item ? { item: more.item } : {}) });
  put("member", { role: "owner", in: true }, T(0), { item: "frank" });
  put("member", { role: "editor", in: true }, T(1), { item: "marco" });
  put(WAYFILE, FILE, T(2), { item: L.ver });
  const mini = sol("mini");
  mini.trail.merge(nuc.trail.since(P));
  mini.trail.append({ project: P, by: { person: "marco", machine: "mini" }, kind: "way.agreed", value: { way: WAY, to: L.ver, role: "explorer" }, at: T(10) });
  nuc.trail.merge(mini.trail.since(P));
  put("way.agreed", { way: WAY, to: L.ver, role: "explorer" }, T(11));
  put("way.agreed", { way: WAY, to: L.ver, role: "keeper" }, T(11));
  put("way.applied", { way: WAY, from: "", to: L.ver, reader: 1 }, T(20));
  return { nuc, mini };
}
/** a draft made by Frank's agent with his yes (way_press's path) */
const make = (s: Sol, thing: string, m: number, who: { person: string; agent?: string; machine?: string } = { person: "frank", agent: "claude" }) =>
  press(s, P, WAY, who, { thing, kind: "draft", move: "make", set: { title: `Draft ${thing}`, switch: `sw_${thing}` } }, () => T(m));
/** the runner's turn: what came is ordered (sealed) */
const turn = (s: Sol, m: number) => runTurns(s, P, "frank", () => T(m));
/** my "answers for me" machine, a me-layer setting signed by me */
const name = (s: Sol, machine: string, m: number) => s.trail.append({ project: P, by: FRANK, kind: "setting", item: "me:frank", field: "answers", value: machine, at: T(m) });

test("#1309 a move can be put in \"do\" only with a condition, setting no value, starting no thing, and a role naming my agent", () => {
  const w = L.way!, mv = (id: string) => w.life.draft.moves.find((m) => m.id === id)!;
  assert.equal(doable(w, mv("make"), "frank"), "starts_a_thing");
  assert.equal(doable(w, mv("want"), "frank"), "no_condition");
  assert.equal(doable(w, mv("pull"), "frank"), "no_condition");
  assert.equal(doable(w, mv("extend"), "frank"), "");
  assert.equal(doable(w, mv("promote"), "frank"), "");
  assert.equal(doable(w, mv("extend"), "marco"), "not_my_agent", "no role names Marco's agent");
  // none of the drafts' moves can be taken back (section 2's table): extend fixes a value, promote ends, drop enters an act
  for (const id of ["extend", "promote", "drop", "want", "pull"]) assert.equal(backable(w, "draft", mv(id), fromOf(mv(id)), "frank"), false, id);
  // a move whose way goes straight back, with no condition, by a role of mine: it can
  const two = structuredClone(w);
  two.life.draft.moves.push({ id: "unwant", from: "wanted", to: "on_switch", by: ["explorer"] });
  two.triggers = {};
  assert.equal(backable(two, "draft", mv("want"), "on_switch", "frank"), true);
  // the way back enters a state with an act: it runs again, so it cannot be taken back
  two.life.draft.states.on_switch.enter = "switch.on";
  assert.equal(backable(two, "draft", mv("want"), "on_switch", "frank"), false);
});
const fromOf = (m: { from: string | string[] | null }) => (Array.isArray(m.from) ? m.from[0] : m.from ?? "");

test("#1309 the pass: off by default, only on the machine I named, only what the runner ordered, written as my agent, one press a thing a day", () => {
  const { nuc } = started();
  const store = new DoStore(join(nuc.dir, "do"));
  const pass = (m: number) => doPass(nuc, store, P, "frank", () => T(m));
  const n = () => rowsOf(nuc.trail, P).length;
  turn(nuc, 21);   // the apply ordered: a version in force
  assert.ok(make(nuc, "d1", 30).ok);
  // nothing set: nothing runs, nothing read
  assert.deepEqual(pass(31), []);
  // a move that cannot be "do" is not set
  assert.deepEqual(setDo(nuc, store, P, "frank", { way: WAY, move: "want" }, T(31)), { ok: false, why: "no_condition" });
  assert.deepEqual(setDo(nuc, store, P, "frank", { way: WAY, move: "make" }, T(31)), { ok: false, why: "starts_a_thing" });
  // extend: it cannot be taken back; nothing would take it now (d1's birth waits in the open tail)
  assert.deepEqual(setDo(nuc, store, P, "frank", { way: WAY, move: "extend" }, T(31)), { ok: true, why: "", said: { back: false, now: 0, theirs: 0 } });
  assert.deepEqual(pass(31), [], "the way itself is still off");
  assert.equal(setDo(nuc, store, P, "frank", { way: WAY, on: true }, T(31)).ok, true);
  // no machine named for me: every machine would take itself, so none runs
  let before = n();
  assert.deepEqual(pass(32), [{ way: WAY, why: "no_machine_named", pressed: [] }]);
  name(nuc, "mini", 32);
  assert.deepEqual(pass(33), [{ way: WAY, why: "other_machine", pressed: [] }]);
  name(nuc, "nucbox", 33);
  assert.equal(namedMachine(nuc, P, "frank"), "nucbox");
  // a teammate's word, or my agent's, names nothing for me; my own undo takes my word back
  const undone = name(nuc, "nucbox", 33);
  nuc.trail.append({ project: P, by: FRANK, kind: "undo", value: { of: undone.id }, at: T(33) });
  assert.equal(namedMachine(nuc, P, "frank"), "nucbox", "the earlier word stands");
  nuc.trail.append({ project: P, by: { person: "frank", agent: "claude" }, kind: "setting", item: "me:frank", field: "answers", value: "mini", at: T(33) });
  assert.equal(namedMachine(nuc, P, "frank"), "nucbox", "my agent cannot name it");
  before = n();
  // d1's birth is in the open tail (the runner has not ordered it): it waits
  assert.deepEqual(pass(34), [{ way: WAY, pressed: [] }]);
  assert.equal(n(), before);
  turn(nuc, 35);
  before = n();
  const r = pass(36);
  assert.equal(r.length, 1);
  assert.equal(r[0].pressed.length, 1);
  assert.deepEqual({ ...r[0].pressed[0], at: 0, day: 0 }, { at: 0, day: 0, project: P, way: WAY, thing: "d1", move: "extend", ok: true, why: "", back: false, written: 1, acts: [] });
  const wrote = rowsOf(nuc.trail, P).slice(before);
  assert.deepEqual(wrote.map((e) => e.kind), ["way.move"]);
  assert.ok(wrote.every((e) => e.by.person === "frank" && e.by.agent === DO_AGENT && e.key === nuc.keys.agent("frank", DO_AGENT).pub), "signed with my agent's key");
  const v = wrote[0].value as Record<string, unknown>;
  assert.equal(v.ver, L.ver, "pressed under the version the runner ordered");
  assert.equal(v.because, undefined, "the press names no event");
  // the same day: d1 was pressed already, nothing more (and extend is not open again: it is fixed)
  turn(nuc, 37);
  before = n();
  assert.deepEqual(pass(38), [{ way: WAY, pressed: [] }]);
  assert.equal(n(), before);
  // the screen's read: the machine, the setting, what was pressed
  const read = readDo(nuc, store, P, "frank") as { machine: { runs: boolean }; pressed: { thing: string }[]; limits: unknown };
  assert.equal(read.machine.runs, true);
  assert.deepEqual(read.pressed.map((e) => e.thing), ["d1"]);
  assert.deepEqual(read.limits, LIMITS);
});

test("#1309 a teammate's thing is left alone unless the move says all; a rule that asks a check is refused before anything is written", () => {
  const { nuc, mini } = started();
  const store = new DoStore(join(nuc.dir, "do"));
  name(nuc, "nucbox", 25);
  // Marco makes d2 on his Mini; Frank's agent makes d1
  mini.trail.merge(nuc.trail.since(P));
  assert.ok(make(mini, "d2", 30, { person: "marco", machine: "mini" }).ok);
  nuc.trail.merge(mini.trail.since(P));
  assert.ok(make(nuc, "d1", 31).ok);
  turn(nuc, 32);
  setDo(nuc, store, P, "frank", { way: WAY, on: true }, T(33));
  const said = setDo(nuc, store, P, "frank", { way: WAY, move: "extend" }, T(33));
  assert.deepEqual(said.said, { back: false, now: 1, theirs: 1 }, "mine only: one now, and one of a teammate's left out");
  let r = doPass(nuc, store, P, "frank", () => T(34));
  assert.deepEqual(r[0].pressed.map((e) => e.thing), ["d1"]);
  turn(nuc, 35);
  assert.deepEqual(setDo(nuc, store, P, "frank", { way: WAY, move: "extend", scope: "all" }, T(36)).said, { back: false, now: 1, theirs: 1 }, "d1 is extended already: only d2 would pass");
  r = doPass(nuc, store, P, "frank", () => T(37));
  assert.deepEqual(r[0].pressed.map((e) => e.thing), ["d2"], "all: Marco's too");
  // promote asks five checks no plugin runs yet: judged first, refused, nothing written, nothing kept
  turn(nuc, 38);
  assert.ok(press(nuc, P, WAY, { person: "frank", agent: "claude" }, { thing: "d1", move: "want" }, () => T(39)).ok);
  turn(nuc, 40);
  assert.deepEqual(setDo(nuc, store, P, "frank", { way: WAY, move: "promote" }, T(41)).said, { back: false, now: 0, theirs: 0 }, "nothing would pass now");
  const before = rowsOf(nuc.trail, P).length, kept = store.log().length;
  r = doPass(nuc, store, P, "frank", () => T(42));
  assert.deepEqual(r, [{ way: WAY, pressed: [] }]);
  assert.equal(rowsOf(nuc.trail, P).length, before);
  assert.equal(store.log().length, kept);
});

test("#1309 a change of version pauses the way; the day's limit stops it; the window's messages set and read it", async () => {
  const { nuc } = started();
  const store = new DoStore(join(nuc.dir, "do"));
  name(nuc, "nucbox", 25);
  for (const t of ["d1", "d2", "d3"]) assert.ok(make(nuc, t, 30).ok);
  turn(nuc, 31);
  const d = { me: () => "frank", sol: () => nuc, clock: () => T(32), store: () => store };
  let a = await answerWay({ type: "team.v3.way.do.set", project: P, way: WAY, on: true }, d);
  assert.deepEqual(a?.set, { ok: true, why: "" });
  a = await answerWay({ type: "team.v3.way.do.set", project: P, way: WAY, move: "extend" }, d);
  assert.deepEqual((a?.set as { said: unknown }).said, { back: false, now: 3, theirs: 0 });
  // a version the person did not look at: paused
  const st = store.settings();
  st.projects[P].ways[WAY].ver = "an-older-version";
  store.save(st);
  assert.deepEqual(doPass(nuc, store, P, "frank", () => T(33)), [{ way: WAY, why: "version_changed", pressed: [] }]);
  // setting a move does not lift the pause: only turning the way on again looks at the version in force
  await answerWay({ type: "team.v3.way.do.set", project: P, way: WAY, move: "extend", scope: "all" }, d);
  assert.deepEqual(doPass(nuc, store, P, "frank", () => T(33)), [{ way: WAY, why: "version_changed", pressed: [] }]);
  assert.deepEqual(Object.keys(store.settings().projects[P].ways[WAY].moves), ["draft/extend"], "keyed by kind and move");
  // another login on this machine presses nothing of mine, and reads none of it
  assert.deepEqual(doPass(nuc, store, P, "marco", () => T(33)), []);
  assert.deepEqual((readDo(nuc, store, P, "marco") as { ways: unknown }).ways, {});
  await answerWay({ type: "team.v3.way.do.set", project: P, way: WAY, on: true }, d);
  // two a day: the third waits for tomorrow
  a = await answerWay({ type: "team.v3.way.do.set", project: P, limits: { perWay: 2, backless: 99 } }, d);
  assert.deepEqual(a?.set, { ok: true, why: "" });
  const r = doPass(nuc, store, P, "frank", () => T(34));
  assert.deepEqual(r[0].pressed.map((e) => e.thing), ["d1", "d2"]);
  assert.equal(r[0].why, "day_limit");
  a = await answerWay({ type: "team.v3.way.do.read", project: P }, d);
  const read = a?.do as { pressed: { thing: string }[]; limits: { perWay: number }; ways: Record<string, { on: boolean }> };
  assert.deepEqual(read.pressed.map((e) => e.thing), ["d2", "d1"], "the last first");
  assert.equal(read.limits.perWay, 2);
  assert.equal(read.ways[WAY].on, true);
  // off: nothing more
  await answerWay({ type: "team.v3.way.do.set", project: P, way: WAY, on: false }, d);
  assert.deepEqual(doPass(nuc, store, P, "frank", () => T(24 * 60 + 40)), []);
});

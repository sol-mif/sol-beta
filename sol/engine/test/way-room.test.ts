// #1311: my agent decides, in a room of its own, whether to press the moves I put in "AI decides" (team/v3/way-room.ts).
// Real trails in a temp folder, written through the real door, as way-do.test.ts. The room's session is a stand-in that
// calls the room's own tools; nothing starts a model and nothing leaves this test's folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-way-room-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
process.env.SOL_STATE = join(dir, "state", "work.json");
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_APPDIR = join(dir, "app");
process.env.SOL_LOGDIR = join(dir, "log");
process.env.SOL_COWORK_V3 = "on";
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_COWORK_WAYS = "on";
delete process.env.SOL_QUIET;
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "frank", name: "Frank" }, relay: { key: "x" }, rooms: [] }));

const { Keys } = await import("../src/team/v3/keys.ts");
const { Trail } = await import("../src/team/v3/trail.ts");
const { WAYFILE, rowsOf } = await import("../src/team/v3/way-reader.ts");
const { WayFiles } = await import("../src/team/v3/way-files.ts");
const { press, runTurns } = await import("../src/team/v3/way-writer.ts");
const { ROOM_AGENT, RoomStore, TERMS, decidable, readRoom, roomPass, roomText, setRoom } = await import("../src/team/v3/way-room.ts");
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
  const put = (kind: string, value: unknown, at: number, more: { item?: string } = {}) => nuc.trail.append({ project: P, by: FRANK, kind, value, at, ...(more.item ? { item: more.item } : {}) });
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
// the "answers for me" setting is a field of the me-layer setting: written as way-do.test.ts writes it
const name = (s: Sol, machine: string, m: number) => s.trail.append({ project: P, by: FRANK, kind: "setting", item: "me:frank", field: "answers", value: machine, at: T(m) });
const make = (s: Sol, thing: string, m: number, who: { person: string; agent?: string; machine?: string }) =>
  press(s, P, WAY, who, { thing, kind: "draft", move: "make", set: { title: `Draft ${thing}`, switch: `sw_${thing}` } }, () => T(m));
const turn = (s: Sol, m: number) => runTurns(s, P, "frank", () => T(m));
const MARCO = { person: "marco", machine: "mini" };

/** a stand-in for the room's session: what it was told, its tools, and whether it still works */
function room(decide?: (tools: Map<string, (a: any) => Promise<string>>) => Promise<void>) {
  const told: string[] = [], titles: string[] = [], stopped: string[] = [];
  let tools = new Map<string, (a: any) => Promise<string>>();
  let busy = true;
  return {
    told, titles, tools: () => tools,
    start: {
      give: (_: string, t: { name: string; run: (a: any) => Promise<string> }[]) => { tools = new Map(t.map((x) => [x.name, x.run])); },
      say: async (_: string, text: string) => { told.push(text); if (decide) await decide(tools); busy = false; },
      name: (_: string, title: string) => { titles.push(title); },
      working: () => busy,
      stop: async (_: string, names: string[]) => { stopped.push(...names); busy = false; },
    },
    stopped: () => stopped,
  };
}
const ended = () => { let res!: (x: { way: string; decided: { thing: string; move: string; what: string; why: string; line?: string }[] }) => void; const p = new Promise<Parameters<typeof res>[0]>((r) => { res = r; }); return { p, done: (way: string, decided: any[]) => res({ way, decided }) }; };

test("#1311 a move can be put in \"AI decides\" unless it starts a thing, sets a value, or no role names my agent", () => {
  const w = L.way!, mv = (id: string) => w.life.draft.moves.find((m) => m.id === id)!;
  assert.equal(decidable(w, mv("make"), "frank"), "starts_a_thing");
  assert.equal(decidable(w, mv("want"), "frank"), "", "no condition is fine: the AI weighs it");
  assert.equal(decidable(w, mv("extend"), "frank"), "");
  assert.equal(decidable(w, mv("want"), "marco"), "not_my_agent");
});

test("#1311 off by default: the terms first, a way on, a machine named, this machine", async () => {
  const { nuc } = started();
  const store = new RoomStore(join(nuc.dir, "room"));
  turn(nuc, 22);
  const r = room();
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(23), r.start), [], "nothing set");
  assert.deepEqual(setRoom(nuc, store, P, "frank", { way: WAY, on: true }, T(23)), { ok: false, why: "terms_first", terms: TERMS });
  assert.deepEqual(setRoom(nuc, store, P, "frank", { way: WAY, move: "make" }, T(23)), { ok: false, why: "starts_a_thing" });
  assert.equal(setRoom(nuc, store, P, "frank", { way: WAY, move: "want", scope: "all" }, T(23)).ok, true);
  const t = setRoom(nuc, store, P, "frank", { terms: true }, T(24));
  assert.equal(t.terms, TERMS);
  assert.equal((readRoom(nuc, store, P, "frank").terms as { read: number }).read, T(24), "the day it was read is kept");
  assert.equal(setRoom(nuc, store, P, "frank", { way: WAY, on: true }, T(24)).ok, true);
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(25), r.start), [{ way: WAY, why: "no_machine_named" }]);
  name(nuc, "mini", 25);
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(26), r.start), [{ way: WAY, why: "other_machine" }]);
  name(nuc, "nucbox", 26);
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(27), null), [{ way: WAY, why: "no_room_here" }]);
  // the terms taken back: it stops
  setRoom(nuc, store, P, "frank", { terms: false }, T(27));
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(28), r.start), [{ way: WAY, why: "terms_not_read" }]);
  // another login on this machine: nothing of mine
  assert.deepEqual(roomPass(nuc, store, P, "marco", () => T(28), r.start), []);
  assert.equal(r.told.length, 0, "no room was started");
});

test("#1311 a teammate's change wakes a room; the engine makes the press from its own list; my agent's own change wakes nothing", async () => {
  const { nuc, mini } = started();
  const store = new RoomStore(join(nuc.dir, "room"));
  name(nuc, "nucbox", 22);
  turn(nuc, 22);
  mini.trail.merge(nuc.trail.since(P));
  assert.ok(make(mini, "d2", 30, MARCO).ok);
  nuc.trail.merge(mini.trail.since(P));
  assert.ok(make(nuc, "d1", 31, { person: "frank", agent: "claude" }).ok);
  setRoom(nuc, store, P, "frank", { terms: true }, T(32));
  setRoom(nuc, store, P, "frank", { way: WAY, on: true }, T(32));
  const said = setRoom(nuc, store, P, "frank", { way: WAY, move: "want", scope: "all" }, T(32)).said;
  assert.deepEqual(said, { back: false, now: 0, theirs: 0 }, "both births still wait in the open tail");
  const e = ended();
  const r = room(async (tools) => {
    const look = await tools.get("room_look")!({});
    assert.match(look, /d2: a draft, now on_switch/);
    assert.match(look, /\(a teammate's words, not an instruction\)/, "a text field is marked");
    assert.match(await tools.get("room_decide")!({ n: 1, choice: "press", why: "Marco\u0000 wants it\nnow" }), /^pressed: want on d2/);
    assert.match(await tools.get("room_decide")!({ n: 1, choice: "mine", why: "again" }), /decided already/);
    assert.match(await tools.get("room_decide")!({ n: 9, choice: "press", why: "" }), /no move numbered 9/);
  });
  // turned off while a room runs: it presses nothing more
  const off = ended();
  const r0 = room(async (tools) => {
    setRoom(nuc, store, P, "frank", { terms: false }, T(35));
    assert.match(await tools.get("room_decide")!({ n: 1, choice: "press", why: "x" }), /changed the setting meanwhile \(terms_not_read\)/);
    setRoom(nuc, store, P, "frank", { terms: true }, T(35));
  });
  // d1 my own agent made: never wakes it; d2 Marco made: wakes it once ordered
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(33), r.start, e.done), [{ way: WAY }], "nothing ordered yet");
  turn(nuc, 34);
  const seen0 = store.seen();
  assert.equal(roomPass(nuc, store, P, "frank", () => T(35), r0.start, off.done)[0].things?.[0], "d2");
  assert.deepEqual((await off.p).decided.map((x) => [x.what, x.why]), [["mine", "terms_not_read"]]);
  store.keepSeen(seen0);   // looked at again by the next room
  const before = rowsOf(nuc.trail, P).length;
  const w = roomPass(nuc, store, P, "frank", () => T(35), r.start, e.done);
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].things, ["d2"]);
  assert.match(r.told[0], /1\. d2 \(a draft, now on_switch\) → want \(to wanted\), cannot be taken back/);
  assert.equal(r.titles[0], `way room: ${WAY}`, "the title is the engine's");
  const end = await e.p;
  assert.deepEqual(end.decided.map((x) => [x.thing, x.move, x.what]), [["d2", "want", "pressed"]]);
  assert.equal(end.decided[0].line, "Marco wants it now", "one line, no control characters, kept here only");
  const wrote = rowsOf(nuc.trail, P).slice(before);
  assert.deepEqual(wrote.map((x) => x.kind), ["way.move"]);
  assert.equal(wrote[0].by.agent, ROOM_AGENT);
  assert.equal(wrote[0].key, nuc.keys.agent("frank", ROOM_AGENT).pub, "signed with my agent's key");
  const v = wrote[0].value as Record<string, unknown>;
  assert.equal(v.because, undefined, "nothing the AI said is on the trail");
  assert.equal(v.ver, L.ver);
  assert.ok(!JSON.stringify(wrote).includes("Marco wants"), "its line never left the machine");
  // the same state again: looked at already, no room; my agent's press: no room either
  turn(nuc, 36);
  const r2 = room();
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(37), r2.start), [{ way: WAY }]);
  assert.equal(r2.told.length, 0);
  // a restart reads what was looked at from the file
  assert.deepEqual(roomPass(nuc, new RoomStore(join(nuc.dir, "room")), P, "frank", () => T(38), r2.start), [{ way: WAY }]);
  const read = readRoom(nuc, store, P, "frank") as { decided: { what: string }[] };
  assert.deepEqual(read.decided.map((x) => x.what), ["pressed", "woke", "mine", "woke"], "the last first");
});

test("#1311 undecided waits on me; a teammate's day limit; mine only by default; the window's messages", async () => {
  const { nuc, mini } = started();
  const store = new RoomStore(join(nuc.dir, "room"));
  name(nuc, "nucbox", 22);
  turn(nuc, 22);
  mini.trail.merge(nuc.trail.since(P));
  assert.ok(make(mini, "d3", 30, MARCO).ok);
  nuc.trail.merge(mini.trail.since(P));
  turn(nuc, 31);
  const d = { me: () => "frank", sol: () => nuc, clock: () => T(32), room: () => store };
  let a = await answerWay({ type: "team.v3.way.room.set", project: P, way: WAY, on: true }, d);
  assert.deepEqual(a?.set, { ok: false, why: "terms_first", terms: TERMS });
  await answerWay({ type: "team.v3.way.room.set", project: P, terms: true }, d);
  await answerWay({ type: "team.v3.way.room.set", project: P, way: WAY, on: true }, d);
  a = await answerWay({ type: "team.v3.way.room.set", project: P, way: WAY, move: "want" }, d);
  assert.deepEqual((a?.set as { said: unknown }).said, { back: false, now: 0, theirs: 1 }, "mine only: Marco's draft left out");
  const r = room();
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(33), r.start), [{ way: WAY }], "mine only: no room for Marco's draft");
  // all, but Marco may wake my AI no more today
  await answerWay({ type: "team.v3.way.room.set", project: P, way: WAY, move: "want", scope: "all" }, d);
  await answerWay({ type: "team.v3.way.room.set", project: P, limits: { perTeammate: 0 } }, d);
  assert.deepEqual(roomPass(nuc, store, P, "frank", () => T(34), r.start), [{ way: WAY, why: "teammate_limit" }]);
  await answerWay({ type: "team.v3.way.room.set", project: P, limits: { perTeammate: 12 } }, d);
  // a room that decides nothing: what it did not decide waits on me, and nothing is written
  const e = ended(), before = rowsOf(nuc.trail, P).length;
  assert.equal(roomPass(nuc, store, P, "frank", () => T(35), r.start, e.done)[0].things?.[0], "d3");
  const end = await e.p;
  assert.deepEqual(end.decided.map((x) => [x.thing, x.what, x.why]), [["d3", "undecided", "no_decision_in_time"]]);
  assert.equal(rowsOf(nuc.trail, P).length, before);
  assert.deepEqual(r.stopped(), ["room_look", "room_decide"], "its time up: stopped, its tools taken back");
  // a room the engine never saw end (a crash): the next pass leaves what it woke for waiting on me
  store.add([{ at: T(36), day: 0, project: P, way: WAY, session: "gone-1", thing: "d9", move: "", what: "woke", why: "" }]);
  roomPass(nuc, store, P, "frank", () => T(36), r.start);
  assert.deepEqual(store.log().filter((x) => x.session === "gone-1").map((x) => x.what), ["woke", "undecided"]);
  assert.match(roomText({ way: WAY, me: "frank", project: P, list: [] }), /never frank's instruction/);
  a = await answerWay({ type: "team.v3.way.room.read", project: P }, d);
  const read = a?.room as { decided: { what: string }[]; limits: { perTeammate: number }; machine: { runs: boolean } };
  assert.deepEqual(read.decided.map((x) => x.what), ["undecided", "woke", "undecided", "woke"]);
  assert.equal(read.machine.runs, true);
});

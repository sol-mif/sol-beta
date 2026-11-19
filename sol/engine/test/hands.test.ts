// The agent's hands on its stage (#1437, work/hands.ts): a place call's moves made safe, refused in words where Marco's
// window cannot take them, sent to the face when it can, and the agent's own scroll never told back as his.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ask, moveOf, reset as resetHands, setHandBus, words } from "../src/work/hands.ts";
import { reset, setSeen, since } from "../src/work/eyes.ts";

const STAGE = { x: 300, y: 0, w: 1200, h: 900 };
const report = (sessionId: string, o: Record<string, unknown> = {}) => ({
  sessionId, window: { w: 1512, h: 945, visible: true, focused: true }, stage: STAGE, pieces: [], away: [], ...o,
});
const title = (id: string) => ({ p1: "plan", p2: "diff", l1: "the list" } as Record<string, string>)[id] ?? id;
let sent: any[] = [];
beforeEach(() => { reset(); resetHands(); sent = []; setHandBus((m) => sent.push(m)); });

test("a place call's moves are made safe; none asked is null", () => {
  assert.equal(moveOf({ id: "p1", slot: "left" }), null);
  assert.deepEqual(moveOf({ beside: "p2", under: "l1", width: "huge", large: true, go: " Step 3\u202e ", say: "here" }), { beside: "p2", large: true, go: "Step 3", say: "here" });
  assert.deepEqual(moveOf({ beside: "../x", foot: true, chat: "line", say: "no go, no say" }), { foot: true, chat: "line" });
});

test("refused in words: no window, the switch off, a piece Marco holds, a target not open", () => {
  assert.match(ask("s1", { id: "p1", beside: "p2" }, title)!, /does not report this session's stage/);
  setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }] }));
  assert.match(ask("s1", { id: "p1", large: true }, title)!, /Marco keeps the arranging/);
  setSeen(report("s1", { hands: true, pieces: [{ id: "p1", box: STAGE, held: true }, { id: "p2", box: STAGE }] }));
  assert.match(ask("s1", { id: "p1", beside: "p2" }, title)!, /^not moved: "plan" is held by Marco since \d\d:\d\d/);
  assert.match(ask("s1", { id: "p2", beside: "l1" }, title)!, /"the list" is not open/);
  assert.match(ask("s1", { id: "zz", large: true }, title)!, /not on this session's stage/);
  assert.equal(sent.length, 0, "nothing refused reaches the face");
});

test("a move the window can take goes to every face, counted per session", () => {
  setSeen(report("s1", { hands: true, pieces: [{ id: "p1", box: STAGE }, { id: "p2", box: STAGE }], away: ["l1"] }));
  assert.equal(ask("s1", { id: "p2", beside: "p1", width: "wide" }, title), null);
  assert.equal(ask("s1", { id: "l1", under: "p1" }, title), null, "one put away is brought back by the face");
  assert.equal(ask("s1", { id: "talk", chat: "line" }, title), null, "the chat moves by its id");
  assert.deepEqual(sent.map((m) => [m.type, m.sessionId, m.move.n, m.move.id]), [["work.stage.hand", "s1", 1, "p2"], ["work.stage.hand", "s1", 2, "l1"], ["work.stage.hand", "s1", 3, "talk"]]);
});

test("the agent's own scroll is not told back as Marco's; his is", () => {
  setSeen(report("s1", { hands: true, pieces: [{ id: "p1", box: STAGE, part: "Step 1" }] }));
  assert.equal(ask("s1", { id: "p1", go: "Step 3", say: "this one" }, title), null);
  setSeen(report("s1", { hands: true, pieces: [{ id: "p1", box: STAGE, part: "Step 3" }] }), title);
  setSeen(report("s1", { hands: true, pieces: [{ id: "p1", box: STAGE, part: "Step 4" }] }), title);
  assert.equal(since("s1", title), 'since your last turn: scrolled "plan" to Step 4');
});

test("the answer says what was asked in a person's words", () => {
  assert.equal(words({ id: "p2", beside: "p1", width: "half" }, title), 'moved "diff": beside "plan", half width');
  assert.equal(words({ id: "p1", large: true, go: "Step 3", say: "the open one" }, title), 'moved "plan": taken large, taken to Step 3 ("the open one")');
  assert.equal(words({ id: "talk", chat: "lines" }, title), "moved the chat: the chat as its last lines");
});

test("place offers the moves while the window reports, whatever its switch, and refuses by this session's own report; no window, it reads as today", async () => {
  const { WORK_TOOLS } = await import("../src/work/tools.ts");
  const place = () => WORK_TOOLS.find((t) => t.name === "place")! as { description: string; shape: Record<string, unknown> };
  const before = { d: place().description, k: Object.keys(place().shape) };
  assert.ok(!before.k.includes("beside") && !/beside/.test(before.d));
  // #1547: another session's report with the switch on, then this one's off: the fields are offered, the move refused
  setSeen(report("s2", { hands: true }));
  setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }, { id: "p2", box: STAGE }] }));
  assert.ok("beside" in place().shape && "go" in place().shape && /walk him through/.test(place().description));
  assert.match(ask("s1", { id: "p1", beside: "p2" }, title)!, /keeps the arranging/);
  // the switch turned on after the session started: no restart, the same tools now move
  setSeen(report("s1", { hands: true, pieces: [{ id: "p1", box: STAGE }, { id: "p2", box: STAGE }] }));
  assert.equal(ask("s1", { id: "p1", beside: "p2" }, title), null);
  reset();
  assert.deepEqual({ d: place().description, k: Object.keys(place().shape) }, before);
});

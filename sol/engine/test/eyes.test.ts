// The agent's eyes on its stage (#1435, work/eyes.ts): the face's report made safe, the words a tool ends with, what the
// person did since the last turn, and the crop of a still. Nothing here takes a picture.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cropOf, didWords, fitWords, headOf, landed, reset, seenOf, setOwner, setSeen, since, whereOf, whereWords, type Seen } from "../src/work/eyes.ts";
import { askLine, splitAsk } from "../src/work/blocks.ts";

const STAGE = { x: 300, y: 0, w: 1200, h: 900 };
const report = (sessionId: string, o: Partial<Seen> & { pieces?: any[]; did?: any[] } = {}) => ({
  sessionId, window: { w: 1512, h: 945, visible: true, focused: true }, stage: STAGE, pieces: [], away: [], ...o,
});
const title = (id: string) => ({ p1: "plan", p2: "inventory", l1: "the list" } as Record<string, string>)[id] ?? id;
beforeEach(() => { reset(); setOwner(() => "Dana"); });

test("a report is made safe: bad ids, boxes and words are dropped", () => {
  assert.equal(seenOf({ sessionId: "../x", stage: STAGE, window: {} }), null);
  assert.equal(seenOf({ sessionId: "s1", window: {} }), null);
  const s = seenOf({ ...report("s1"), pieces: [{ id: "p1", box: { x: 1, y: 2, w: 3, h: 4 }, scale: 9, cut: 0.4, part: "a‮b" }, { id: "bad id!", box: STAGE }, { id: "p2" }], did: [{ ev: "rm -rf" }, { ev: "away", id: "p2" }], chat: "huge" })!;
  assert.deepEqual(s.pieces, [{ id: "p1", box: { x: 1, y: 2, w: 3, h: 4 }, part: "a b" }]);
  assert.deepEqual(s.did, [{ ev: "away", id: "p2" }]);
  assert.equal(s.chat, undefined);
});

test("where a piece stands and how it fits, in a person's words", () => {
  assert.equal(whereWords({ id: "a", box: { x: 300, y: 0, w: 400, h: 900 } }, STAGE), "left");
  assert.equal(whereWords({ id: "a", box: { x: 1100, y: 500, w: 400, h: 300 } }, STAGE), "right, bottom");
  assert.equal(whereWords({ id: "a", box: { x: 300, y: 0, w: 1200, h: 200 } }, STAGE), "across the stage, top");
  assert.equal(whereWords({ id: "a", box: STAGE, large: true }, STAGE), "taken large (the whole stage)");
  assert.equal(fitWords({ id: "a", box: STAGE }), "whole");
  assert.equal(fitWords({ id: "a", box: STAGE, scale: 0.55, cut: 320 }), "scaled to 0.55, cut: 320 px below what shows");
  assert.match(fitWords({ id: "a", box: STAGE, scale: 0.4, still: true }), /too small to read/);
});

test("the person's hand and the page's scroll become events, newest last", () => {
  const a = seenOf(report("s1", { pieces: [{ id: "p1", box: STAGE, part: "Step 1", cut: 200 }] }))!;
  const b = seenOf(report("s1", { pieces: [{ id: "p1", box: STAGE, part: "Step 3" }], did: [{ ev: "large", id: "p1" }, { ev: "away", id: "p2" }] }))!;
  assert.deepEqual(didWords(a, b, title), ['made "plan" large', 'put away "inventory"', 'scrolled "plan" to Step 3']);
});

test("since: what happened, read once, with the switch between sessions on both sides", () => {
  setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }], did: [{ ev: "opened", id: "p1" }] }), title);
  setSeen(report("s2"), title);
  setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }] }), title);
  const line = since("s1", title);
  assert.match(line, /^since your last turn: opened "plan" · left this session for "another session" · came back to this session/);
  assert.equal(since("s1", title), "", "read once");
});

test("the time a piece was in front of the person is counted, only while the window is focused", async () => {
  setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }] }), title);
  // a report 25 s later: fake the first one's time
  const t = Date.now;
  Date.now = () => t() + 25_000;
  try { setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }] }), title); } finally { Date.now = t; }
  assert.match(since("s1", title), /in front of Dana longest: "plan" 25 s/);
  setSeen(report("s1", { window: { w: 1, h: 1, visible: true, focused: false }, pieces: [{ id: "p1", box: STAGE }] }), title);
  Date.now = () => t() + 60_000;
  try { setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }] }), title); } finally { Date.now = t; }
  assert.doesNotMatch(since("s1", title), /longest/);
});

test("landed: nothing without a window; elsewhere says so; else waits for the draw", async () => {
  assert.equal(await landed("s1", "p1", 10), "");
  setSeen(report("s2"));
  assert.match(await landed("s1", "p1", 10), /not in front of Dana: they are in/);
  setSeen(report("s1"));
  const p = landed("s1", "p1", 500);
  setTimeout(() => setSeen(report("s1", { pieces: [{ id: "p1", box: { x: 300, y: 0, w: 500, h: 900 }, scale: 0.7, cut: 120 }] })), 20);
  assert.equal(await p, "\nlanded in Dana's window: left, 500×900, scaled to 0.7, cut: 120 px below what shows");
  setSeen(report("s1", { away: ["p2"] }));
  assert.match(await landed("s1", "p2", 10), /named at the bottom edge/);
});

test("read's head and its line for a block come from the window", () => {
  assert.equal(headOf("s1"), "");
  setSeen(report("s1", { pieces: [{ id: "talk", box: { x: 300, y: 0, w: 600, h: 900 } }, { id: "p1", box: { x: 900, y: 0, w: 600, h: 900 } }], chat: "col" }));
  assert.match(headOf("s1"), /^Dana is in this session; the stage is 1200×900 of a 1512×945 window\. The chat: a column\./);
  assert.equal(whereOf("s1", "p1"), "in Dana's window right, 600×900, whole");
  assert.equal(whereOf("s1", "nope"), undefined);
  setSeen(report("s2"));
  assert.match(headOf("s1"), /^Not in front of Dana: they are in/);
});

test("the window's owner is named from the settings, never a name written in the engine (#1532)", async () => {
  setOwner(() => "the person");
  setSeen(report("s1", { pieces: [{ id: "p1", box: { x: 900, y: 0, w: 600, h: 900 }, held: true }] }));
  assert.match(headOf("s1"), /^The person is in this session;/);
  assert.equal(whereOf("s1", "p1"), "in the person's window right, 600×900, whole, held where the person put it");
  setOwner(() => "Chris");
  assert.equal(whereOf("s1", "p1"), "in Chris' window right, 600×900, whole, held where Chris put it");
  setSeen(report("s2"));
  assert.match(await landed("s1", "p1", 10), /not in front of Chris: they are in/);
  for (const line of [headOf("s1"), headOf("s2"), whereOf("s2", "p1") ?? "", since("s1", title)]) assert.doesNotMatch(line, /Marco|\b(he|him|his)\b/);
});

test("the eyes turned off: the engine forgets every report at once, so nothing is read or taken (#1532)", async () => {
  setSeen(report("s1", { pieces: [{ id: "p1", box: STAGE }], did: [{ ev: "opened", id: "p1" }] }), title);
  assert.notEqual(headOf("s1"), "");
  setSeen({ off: true, sessionId: "s1" });
  assert.equal(headOf("s1"), "");
  assert.equal(whereOf("s1", "p1"), undefined);
  assert.equal(await landed("s1", "p1", 10), "");
  assert.equal(since("s1", title), "");
});

test("the crop of a still: the window's CSS pixels to the picture's, inside the picture", () => {
  assert.deepEqual(cropOf(STAGE, { w: 1512 }, 3024, 1890), { x: 600, y: 0, w: 2400, h: 1800 });
  assert.deepEqual(cropOf({ x: 1400, y: 900, w: 500, h: 500 }, { w: 1512 }, 3024, 1890), { x: 2800, y: 1800, w: 224, h: 90 });
});

test("the since line rides in the [the stage] paragraph, so the person's own line never shows it", () => {
  const p = askLine("", { things: [] }, "since your last turn: closed \"plan\"");
  assert.equal(p, "[the stage]\nsince your last turn: closed \"plan\"");
  assert.deepEqual(splitAsk(`fix it\n\n${p}`), { text: "fix it" });
  assert.equal(askLine("", null), "");
});

// node --test src/*.test.ts (npm test here): the frame's look at the log (#633), narrowed (#691 step 3,
// home/frameRules.ts logStep and logAsk). A seat's steps never read /things again; a plugin.write does; an engine
// without the narrow look reads again whenever the log grew, as before; a cut page is followed at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logStep, logAsk, slowDue, THINGS_KINDS } from "./home/frameRules.ts";

const ev = (seq: number, kind: string) => ({ seq, kind });

test("the first look asks the newest seq alone, with the kinds that can change the things; it never reads again", () => {
  assert.equal(logAsk(-1), `since=-1&kinds=${THINGS_KINDS}`);
  assert.equal(THINGS_KINDS, "plugin,undo,key");
  assert.deepEqual(logStep(-1, { last: 812, events: [], kinds: ["plugin", "undo", "key"] }), { read: false, last: 812, more: false });
  assert.equal(logAsk(812), `since=812&kinds=${THINGS_KINDS}`);
  // an engine without the narrow look answers since=-1 from the start: the frame takes last from it and reads nothing
  assert.deepEqual(logStep(-1, { last: 812, events: [ev(1, "seat.step")] }), { read: false, last: 812, more: false });
});

test("narrowed: seat steps the engine left out read nothing; a plugin.write reads the things again", () => {
  // the log grew from 812 to 830 with only seat.* and tool.call: the narrowed answer holds no events
  assert.deepEqual(logStep(812, { last: 830, events: [], kinds: ["plugin", "undo", "key"] }), { read: false, last: 830, more: false });
  assert.deepEqual(logStep(830, { last: 831, events: [ev(831, "plugin.write")], kinds: ["plugin", "undo", "key"] }), { read: true, last: 831, more: false });
  assert.equal(logStep(831, { last: 840, events: [ev(835, "undo.did")], kinds: ["plugin", "undo", "key"] }).read, true);
  assert.equal(logStep(840, { last: 841, events: [ev(841, "plugin.edited")], kinds: ["plugin", "undo", "key"] }).read, true);
});

test("not narrowed (the engine's switch off, or an older engine): any growth reads again, as before", () => {
  assert.deepEqual(logStep(812, { last: 830, events: [ev(813, "seat.step")] }), { read: true, last: 830, more: false });
  assert.deepEqual(logStep(830, { last: 830, events: [] }), { read: false, last: 830, more: false });
});

test("a cut page is followed from its next at once, and what it held reads again", () => {
  const a = logStep(10, { last: 9000, events: [], next: 5010, kinds: ["plugin"] });
  assert.deepEqual(a, { read: false, last: 5010, more: true });
  const b = logStep(a.last, { last: 9000, events: [ev(7000, "plugin.load")], kinds: ["plugin"] });
  assert.deepEqual(b, { read: true, last: 9000, more: false });
});

test("the frame off, or no answer: the log is not asked again", () => {
  assert.deepEqual(logStep(5, { off: true, last: 0, events: [] }), { read: false, last: -2, more: false });
  assert.deepEqual(logStep(5, null), { read: false, last: -2, more: false });
});

test("the slow read: 30 s after the last read, and only when the log grew since it", () => {
  const at = 1_000_000;
  assert.equal(slowDue({ now: at + 29_999, readAt: at, seqAtRead: 10, last: 50 }), false, "too soon");
  assert.equal(slowDue({ now: at + 30_000, readAt: at, seqAtRead: 10, last: 50 }), true, "due, and seat steps came since");
  assert.equal(slowDue({ now: at + 600_000, readAt: at, seqAtRead: 50, last: 50 }), false, "a quiet log reads nothing, however long");
});

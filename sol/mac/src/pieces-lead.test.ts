// What leads the one space until the engine names it (pieces/lead.ts), and a held arrangement kept true to what is open
// (pieces/arrange.ts keep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadOf, openNow, touched } from "./pieces/lead.ts";
import { BOX, TALK, keep, move, rule, shown } from "./pieces/arrange.ts";

const me = { kind: "me" }, tool = { kind: "tool" }, you = { kind: "you" }, wrap = { kind: "wrap" };

test("nothing open: the chat leads", () => {
  assert.equal(leadOf({ open: [], state: {}, touch: null, items: [me, tool, you] }), TALK);
});

test("an artifact that waits on you leads, whatever else changed", () => {
  assert.equal(leadOf({ open: ["a", "b"], state: { b: "waits" }, touch: { id: "a", at: 3 }, items: [me, tool, tool] }), "b");
});

test("the artifact just made leads until Sol writes to you", () => {
  const touch = { id: "a", at: 2 };
  assert.equal(leadOf({ open: ["a"], state: { a: "live" }, touch, items: [me, tool, tool] }), "a");
  assert.equal(leadOf({ open: ["a"], state: { a: "live" }, touch, items: [me, tool, tool, you] }), TALK);
  assert.equal(leadOf({ open: ["a"], state: { a: "live" }, touch, items: [me, tool, wrap] }), TALK);
});

test("a touched artifact that is not open does not lead; one being worked on does", () => {
  assert.equal(leadOf({ open: ["b"], state: { b: "working" }, touch: { id: "a", at: 0 }, items: [me] }), "b");
  assert.equal(leadOf({ open: ["b"], state: { b: "live" }, touch: { id: "a", at: 0 }, items: [me] }), TALK);
});

test("touched: new ids and changed objects, nothing on a session's first read", () => {
  const a = { id: "a" }, b = { id: "b" }, b2 = { id: "b" }, c = { id: "c" };
  assert.deepEqual(touched(null, [a, b]), []);
  const prev = new Map<string, unknown>([["a", a], ["b", b]]);
  assert.deepEqual(touched(prev, [a, b]), []);
  assert.deepEqual(touched(prev, [a, b2, c]), ["b", "c"]);
});

test("openNow: three at most, the lead first, then what the hand holds, then the newest", () => {
  assert.deepEqual(openNow(["d", "c", "b", "a"], TALK, []), ["d", "c", "b"]);
  assert.deepEqual(openNow(["d", "c", "b", "a"], "a", []), ["a", "d", "c"]);
  assert.deepEqual(openNow(["d", "c", "b", "a"], "d", ["a"]), ["d", "a", "c"]);
});

test("keep: a held arrangement takes a newly opened artifact and lets a closed one go", () => {
  const space = { w: 1400, h: 900 };
  const held = move(rule(space, ["a", "b"], "a"), TALK, { before: 3 });
  const more = keep(held, ["a", "b", "c"]);
  assert.ok(shown(more).includes("c"));
  assert.ok(shown(more).includes(TALK) && shown(more).includes(BOX));
  const less = keep(more, ["c"]);
  assert.deepEqual(shown(less).filter((id) => id !== TALK && id !== BOX).sort(), ["c"]);
  // the talk stays where the hand put it: the last column
  assert.ok(less.cols[less.cols.length - 1].ids.includes(TALK));
});

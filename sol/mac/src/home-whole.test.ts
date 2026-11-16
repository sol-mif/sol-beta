// node --test src/*.test.ts (npm test here): Home's first screen (#791, plan Part C slice 28; home/whole/today.ts).
// The Try line: three things wait: one card in front; press an edge to bring another forward. And the rules under it:
// the list's order, the one line in words, later to the back, an answer leaves the list, and its undo puts it back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FRONT0, frontActed, frontPress, frontUndone, lineOf, order, seed, stackOf, stub, whenOf, type Thing, type TodayMsg, type DoneMsg } from "./home/whole/today.ts";

const NOW = new Date(2026, 10, 9, 8, 40).getTime();
const todayOf = (ms: (TodayMsg | DoneMsg)[]) => ms.find((m): m is TodayMsg => m.type === "home.today")!;
const doneOf = (ms: (TodayMsg | DoneMsg)[]) => ms.find((m): m is DoneMsg => m.type === "home.done")!;

test("three things wait: one card in front, the other two as edges behind it", () => {
  const ask = stub(() => NOW), t = todayOf(ask({ type: "home.today" }));
  assert.equal(t.today.needs.length, 3);
  const s = stackOf(t.today.needs);
  assert.equal(s.front, "t-chem-set6", "the nearest deadline stands in front");
  assert.deepEqual(s.edges, ["t-maya-data", "t-shopify-app"]);
  for (const id of t.today.needs) assert.ok(t.things.find((x) => x.id === id)?.card, `${id} carries its card`);
});

test("pressing an edge brings that card forward; the one that was in front becomes an edge in its place in the order", () => {
  const needs = ["a", "b", "c"];
  const s = stackOf(needs, "c");
  assert.equal(s.front, "c");
  assert.deepEqual(s.edges, ["a", "b"]);
  const again = stackOf(needs, "b");
  assert.equal(again.front, "b");
  assert.deepEqual(again.edges, ["a", "c"]);
});

test("a card brought forward that leaves the list hands the front back to the first in order", () => {
  assert.deepEqual(stackOf(["a", "c"], "b"), { front: "a", edges: ["c"] });
  assert.deepEqual(stackOf([], "b"), { front: null, edges: [] });
});

test("the one line: the count in words, then what is moving (the design's own sentence)", () => {
  assert.deepEqual(lineOf(3, 2), ["Three things need you.", "Two are moving on their own."]);
  assert.deepEqual(lineOf(1, 1), ["One thing needs you.", "One is moving on its own."]);
  assert.deepEqual(lineOf(0, 0), ["Nothing needs you.", ""]);
  assert.deepEqual(lineOf(14, 0), ["14 things need you.", ""]);
  const t = todayOf(stub(() => NOW)({ type: "home.today" }));
  assert.equal(t.today.line, "Three things need you. Two are moving on their own.");
});

test("the order: the deadline nearest now, then what blocks a running job, then age; healthy things take no card", () => {
  const th = (id: string, o: Partial<Thing>): Thing => ({ id, read: "you", folder: "", words: id, state: "you", waitsOn: "you", at: NOW, links: [], made: [], ...o });
  const list = [
    th("old", { at: NOW - 9e6 }), th("young", { at: NOW - 1e6 }), th("blocks", { at: NOW, blocks: true }),
    th("due-late", { due: NOW + 9e6 }), th("due-soon", { due: NOW + 1e6 }), th("moving", { waitsOn: "agent", state: "moving" }),
  ];
  assert.deepEqual(order(list), ["due-soon", "due-late", "blocks", "old", "young"]);
  assert.deepEqual(order(list, ["due-soon"]), ["due-late", "blocks", "old", "young", "due-soon"], "later moves it to the back");
});

test("later: the card goes to the back, the next comes forward, and its undo puts it back in front", () => {
  const ask = stub(() => NOW);
  const r = ask({ type: "home.later", thingId: "t-chem-set6" }), d = doneOf(r);
  assert.equal(d.did, "later");
  assert.deepEqual(todayOf(r).today.needs, ["t-maya-data", "t-shopify-app", "t-chem-set6"]);
  assert.equal(stackOf(todayOf(r).today.needs).front, "t-maya-data");
  const u = todayOf(ask({ type: "home.undo", ledgerId: d.ledgerId }));
  assert.equal(stackOf(u.today.needs).front, "t-chem-set6");
});

test("an answer leaves the list and the line counts it; the warm answer on a job sets it moving; undo restores both", () => {
  const ask = stub(() => NOW);
  const r = ask({ type: "home.answer", thingId: "t-shopify-app", answer: "send it" }), t = todayOf(r);
  assert.deepEqual(t.today.needs, ["t-chem-set6", "t-maya-data"]);
  assert.ok(t.today.moving.includes("t-shopify-app"));
  assert.equal(t.today.line, "Two things need you. Three are moving on their own.");
  const u = todayOf(ask({ type: "home.undo", ledgerId: doneOf(r).ledgerId }));
  assert.equal(u.today.needs.length, 3);
  assert.equal(u.today.line, "Three things need you. Two are moving on their own.");
});

test("when, the meta row's yellow word", () => {
  const at = (h: number, m = 0, plus = 0) => new Date(2026, 10, 9 + plus, h, m).getTime();
  assert.equal(whenOf({ due: at(23, 59), at: NOW }, NOW), "due tonight 23:59");
  assert.equal(whenOf({ due: at(12, 0, 1), at: NOW }, NOW), "due tomorrow 12:00");
  assert.equal(whenOf({ at: NOW - 3 * 36e5 }, NOW), "3 h");
  assert.equal(whenOf({ due: at(8, 0), at: NOW }, NOW), "overdue");
  assert.equal(seed(NOW).filter((t) => t.waitsOn === "you").length, 3);
});

// #854 R5: the Try's own path, walked as the screen walks it (First.tsx holds a FrontState and these are its moves)
test("the Try path: press the Maya edge, press later, press undo: Maya is back in front", () => {
  const ask = stub(() => NOW);
  let fs = FRONT0, needs = todayOf(ask({ type: "home.today" })).today.needs;
  assert.equal(stackOf(needs, fs.front).front, "t-chem-set6");
  fs = frontPress(fs, "t-maya-data");                                    // the Maya edge
  assert.equal(stackOf(needs, fs.front).front, "t-maya-data");
  const shown = stackOf(needs, fs.front).front;
  const r = ask({ type: "home.later", thingId: "t-maya-data" }), d = doneOf(r);   // later
  fs = frontActed(fs, d.ledgerId, shown);
  needs = todayOf(r).today.needs;
  assert.equal(stackOf(needs, fs.front).front, "t-chem-set6", "later hands the front back to the order");
  assert.equal(needs.at(-1), "t-maya-data");
  needs = todayOf(ask({ type: "home.undo", ledgerId: d.ledgerId })).today.needs;  // undo (the button or ⌘Z: both call back())
  fs = frontUndone(fs, d.ledgerId);
  assert.equal(stackOf(needs, fs.front).front, "t-maya-data", "undo puts Maya back in front, not just back in the list");
  assert.deepEqual(fs.kept, {});
});

test("the Try path: press the warm answer on Chem: the line reads 'Two things need you.'; undo brings Chem back in front", () => {
  const ask = stub(() => NOW);
  let fs = FRONT0;
  const needs0 = todayOf(ask({ type: "home.today" })).today.needs;
  const shown = stackOf(needs0, fs.front).front!;
  const r = ask({ type: "home.answer", thingId: shown, answer: "hold 19–21 for it" }), d = doneOf(r);
  fs = frontActed(fs, d.ledgerId, shown);
  const t = todayOf(r).today;
  assert.equal(t.line, "Two things need you. Two are moving on their own.");
  assert.equal(stackOf(t.needs, fs.front).front, "t-maya-data");
  const u = todayOf(ask({ type: "home.undo", ledgerId: d.ledgerId })).today;
  fs = frontUndone(fs, d.ledgerId);
  assert.equal(stackOf(u.needs, fs.front).front, "t-chem-set6");
  assert.equal(u.line, "Three things need you. Two are moving on their own.");
});

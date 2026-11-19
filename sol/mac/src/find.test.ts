// ⌘F in a session (#1239, find.ts): where the words sit, which match it lands on, the step round the ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spans, firstFrom, step } from "./find.ts";

test("every place the words sit, case set aside", () => {
  assert.deepEqual(spans("Sol said sol, then SOL.", "sol"), [[0, 3], [9, 12], [19, 22]]);
});

test("the words are read as words, never a pattern", () => {
  assert.deepEqual(spans("cost $5.00 (or a.b)", "$5.00 ("), [[5, 12]]);
  assert.deepEqual(spans("a.b axb", "a.b"), [[0, 3]]);
});

test("nothing typed, or only spaces, finds nothing", () => {
  assert.deepEqual(spans("anything", ""), []);
  assert.deepEqual(spans("anything", "  "), []);
});

test("a match found once is not found again inside itself", () => {
  assert.deepEqual(spans("aaaa", "aa"), [[0, 2], [2, 4]]);
});

test("it lands on the first match on screen or below, else the first of all", () => {
  assert.equal(firstFrom([10, 400, 900], 300), 1);
  assert.equal(firstFrom([10, 400, 900], 950), 0);
  assert.equal(firstFrom([], 0), 0);
});

test("a step goes round the ends either way", () => {
  assert.equal(step(2, 1, 3), 0);
  assert.equal(step(0, -1, 3), 2);
  assert.equal(step(0, 1, 0), 0);
});

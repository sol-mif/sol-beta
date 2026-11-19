import { test } from "node:test";
import assert from "node:assert/strict";
import { onToday, ranLast, zonesFor } from "./home/folders/finishZones.ts";

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m).getTime();

test("a sticky ran last when its newest asked/did line is a did line", () => {
  assert.equal(ranLast({ done: false, notes: [] }), false);
  assert.equal(ranLast({ done: false, notes: ["asked Nov 18 09:00 ← now"] }), false);
  assert.equal(ranLast({ done: false, notes: ["asked Nov 18 09:00", "did: made/x.md", "due: 2026-11-20 18:00"] }), true);
  assert.equal(ranLast({ done: false, notes: ["did: made/x.md", "asked Nov 18 10:00 ← now"] }), false);
  assert.equal(ranLast({ done: true, notes: ["did: made/x.md"] }), false);
});

test("let go on Today: 18:00, else the next full hour, never past today", () => {
  assert.equal(onToday(at(9, 30)), at(18));
  assert.equal(onToday(at(19, 10)), at(20));
  assert.equal(onToday(at(23, 20)), at(23, 59));
});

test("the tray offers Today only to a sticky not on it", () => {
  assert.deepEqual(zonesFor(null, false, at(9)), ["done", "drop", "today"]);
  assert.deepEqual(zonesFor(at(18), false, at(9)), ["done", "drop"]);
  assert.deepEqual(zonesFor(null, true, at(9)), ["done", "drop"]);
  assert.deepEqual(zonesFor(at(18) + 5 * 86_400_000, false, at(9)), ["done", "drop", "today"]);
});

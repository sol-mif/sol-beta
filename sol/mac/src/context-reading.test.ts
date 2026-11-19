// The context card's hovered part (#683, #1519): the engine's breakdown as the card shows it, each line's share of the part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shares } from "./work/contextReading.ts";

test("shares: each line's share of the part, <1% for a sliver, the rest as one row", () => {
  assert.deepEqual(shares({ part: "mem", lines: [{ name: "a", tokens: 750 }, { name: "b", tokens: 246 }], rest: 4, total: 1000, at: 0 }),
    [{ name: "a", pct: "75%" }, { name: "b", pct: "25%" }, { name: "the rest", pct: "<1%" }]);
  assert.deepEqual(shares({ part: "kit", lines: [{ name: "a", tokens: 10 }], rest: 0, total: 10, at: 0 }), [{ name: "a", pct: "100%" }]);
  assert.deepEqual(shares({ part: "talk", lines: [], rest: 0, total: 0, at: 0 }), []);
});

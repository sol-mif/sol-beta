// The one list (next/collection.ts, root part 4): only what ranks is drawn, the rest is one count with its history by day.
// Invented people only. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collect, dayOf } from "./next/collection-state.ts";

type T = { id: string; asks?: number; at?: number };
const NOW = new Date(2026, 10, 22, 16, 0).getTime(), H = 3_600_000;
const ranking = { rank: (x: T) => x.asks ?? null, at: (x: T) => x.at };
const home = (n: number, asking: number): T[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ...(i < asking ? { asks: asking - i } : {}), at: NOW - i * H }));

test("a home with 1, 30 and 3,000 things draws the same: only what asks", () => {
  for (const n of [1, 30, 3000]) {
    const c = collect(home(n, 1), ranking, NOW);
    assert.equal(c.drawn.length, 1, `${n}: one ask drawn`);
    assert.equal(c.rest.length, n - 1, `${n}: the rest is one count`);
  }
});

test("what ranks is drawn lowest rank first, ties in the place's own order", () => {
  const c = collect([{ id: "dev", asks: 2 }, { id: "denise", asks: 1 }, { id: "lucy", asks: 2 }, { id: "quiet" }], ranking, NOW);
  assert.deepEqual(c.drawn.map((x) => x.id), ["denise", "dev", "lucy"]);
  assert.deepEqual(c.rest.map((x) => x.id), ["quiet"]);
});

test("the history is newest first, one heading a day, no time last under Earlier", () => {
  const c = collect([{ id: "old", at: NOW - 30 * 24 * H }, { id: "none" }, { id: "y", at: NOW - 24 * H }, { id: "t", at: NOW - H }, { id: "t2", at: NOW - 2 * H }], ranking, NOW);
  assert.deepEqual(c.days.map((d) => d.day), ["Today", "Yesterday", "Oct 23", "Earlier"]);
  assert.deepEqual(c.days[0].items.map((x) => x.id), ["t", "t2"]);
});

test("a day's words: today, yesterday, the weekday within a week, then the date", () => {
  assert.equal(dayOf(NOW - H, NOW), "Today");
  assert.equal(dayOf(NOW - 24 * H, NOW), "Yesterday");
  assert.equal(dayOf(NOW - 3 * 24 * H, NOW), "Thursday");
  assert.equal(dayOf(undefined, NOW), "Earlier");
  assert.equal(dayOf(new Date(2025, 0, 5).getTime(), NOW), "Jan 5, 2025");
});

test("nothing at all collects to nothing", () => {
  assert.deepEqual(collect([], ranking, NOW), { drawn: [], rest: [], days: [] });
});

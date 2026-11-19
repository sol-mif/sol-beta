import { test } from "node:test";
import assert from "node:assert/strict";
import { sayBlocks, sayMove, sayWindows } from "../src/screensSayPlan.js";
import { ALL, NONE } from "../src/screensJevSay.js";

const wins = sayWindows([{ win: "main", here: true, bigger: false }, { win: "two", here: false, bigger: true }]);
const blocks = sayBlocks([{ id: "d1", title: "changes · 2 files" }, { id: "p1", title: "the plan" }, { id: "p2", title: "the plan" }, { id: 3, title: "x" }, null]);
const ans = (which: string, pw: number, to: string, pt: number) => ({ which: { choice: which, probabilities: { [which]: pw } }, to: { choice: to, probabilities: { [to]: pt } } });

test("say where: the named block goes to the named window; the lower of the two decides the band", () => {
  assert.deepEqual(wins.map((w) => w.name), ["laptop", "monitor"]);
  assert.deepEqual(blocks.map((b) => b.id), ["d1", "p1"]);
  assert.deepEqual(sayMove(ans("the plan", 0.95, "monitor", 0.9), blocks, wins, {}), { kind: "put", block: "p1", to: "two", pick: "act", title: "the plan" });
  assert.equal((sayMove(ans("the plan", 0.95, "monitor", 0.5), blocks, wins, {}) as any).pick, "ghost");
  assert.deepEqual(sayMove(ans("the plan", 0.95, "monitor", 0.3), blocks, wins, {}), { kind: "none" });
});

test("say where: nothing named, an unknown title or window, or already there: nothing moves", () => {
  assert.deepEqual(sayMove(ans(NONE, 0.99, "monitor", 0.99), blocks, wins, {}), { kind: "none" });
  assert.deepEqual(sayMove(ans("made up", 0.99, "monitor", 0.99), blocks, wins, {}), { kind: "none" });
  assert.deepEqual(sayMove(ans("the plan", 0.99, "tv", 0.99), blocks, wins, {}), { kind: "none" });
  assert.deepEqual(sayMove(ans("the plan", 0.99, "monitor", 0.99), blocks, wins, { p1: "two" }), { kind: "none" });
  assert.deepEqual(sayMove(null, blocks, wins, {}), { kind: "none" });
  assert.deepEqual(sayMove({ which: { choice: {} }, to: { choice: [] } }, blocks, wins, {}), { kind: "none" });
});

test("say where: everything here gathers to the named window", () => {
  assert.deepEqual(sayMove(ans(ALL, 0.9, "laptop", 0.9), blocks, wins, {}), { kind: "gather", to: "main", pick: "act" });
});

test("say where: two windows on screens of one size: the one typed in is the laptop, the other the monitor, the big one", () => {
  const even = sayWindows([{ win: "main", here: true, bigger: false }, { win: "two", here: false, bigger: false }]);
  assert.deepEqual(even.map((w) => [w.win, w.name, w.bigger]), [["main", "laptop", false], ["two", "monitor", true]]);
  assert.deepEqual(sayMove(ans("the plan", 0.9, "monitor", 0.9), blocks, even, {}), { kind: "put", block: "p1", to: "two", pick: "act", title: "the plan" });
});

// Moving between blocks and ⌘Z (#737, pain points 3 and 6): the reading order ⌘1-9 and Tab walk, Tab round the ends,
// a block's zoom steps, the history's steps (only the places a move changed; a close taken back and done again; the
// agent's newer blocks never touched), a ghost's mark kept by the stores. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { History, ZOOMS, applySide, readingOrder, stepOf, walk, zoomStep } from "./stage/moving.ts";
import { LocalStore, historyOf } from "./stage/store.ts";
import { fromEngine } from "./stage/engineStore.ts";
import type { Place } from "./stage/model.ts";

const P = (id: string, x: number, y: number, w = 200, h = 120, more: Partial<Place> = {}): Place => ({ id, x, y, w, h, z: 1, ...more });

test("reading order: rows top to bottom, each left to right; a few pixels off is the same row", () => {
  const order = readingOrder([P("c", 12, 300), P("b", 430, 14), P("a", 12, 12), P("d", 430, 296, 200, 60)]).map((p) => p.id);
  assert.deepEqual(order, ["a", "b", "c", "d"]);
  // a tall block on the left and two stacked on the right: the tall one, then the right's top, then its bottom
  assert.deepEqual(readingOrder([P("r2", 300, 200), P("tall", 12, 12, 260, 400), P("r1", 300, 12)]).map((p) => p.id), ["tall", "r1", "r2"]);
});

test("Tab walks the order round the ends, ⇧Tab back; from nothing held, the first or the last", () => {
  const o = ["a", "b", "c"];
  assert.equal(walk(o, "a"), "b");
  assert.equal(walk(o, "c"), "a");
  assert.equal(walk(o, "a", true), "c");
  assert.equal(walk(o, null), "a");
  assert.equal(walk(o, null, true), "c");
  assert.equal(walk([], "a"), null);
});

test("zoom steps in and out, and stop at the ends", () => {
  assert.equal(zoomStep(1), 1.1);
  assert.equal(zoomStep(1, true), 0.9);
  assert.equal(zoomStep(ZOOMS[ZOOMS.length - 1]), ZOOMS[ZOOMS.length - 1]);
  assert.equal(zoomStep(ZOOMS[0], true), ZOOMS[0]);
  assert.equal(zoomStep(1.05), 1.1, "between two steps, the next one up");
});

test("a step keeps only the places that changed", () => {
  const before = [P("a", 12, 12), P("b", 300, 12)];
  const s = stepOf(before, [P("a", 40, 40), P("b", 300, 12)])!;
  assert.deepEqual(Object.keys(s.before), ["a"]);
  assert.equal(stepOf(before, before.map((p) => ({ ...p }))), null, "nothing moved, no step");
});

test("undo a move puts it back and leaves a block the agent composed since alone; redo moves it again", () => {
  const h = new History();
  const before = [P("a", 12, 12)];
  h.push(stepOf(before, [P("a", 300, 200)]));
  const now = [P("a", 300, 200), P("new", 12, 300)];   // the agent's block came after
  const back = applySide(now, h.undo()!.before);
  assert.deepEqual(back.blocks.map((p) => [p.id, p.x, p.y]), [["a", 12, 12], ["new", 12, 300]]);
  const again = applySide(back.blocks, h.redo()!.after);
  assert.deepEqual(again.blocks.find((p) => p.id === "a")!.x, 300);
  assert.equal(h.redo(), null, "nothing further ahead");
});

test("a close taken back comes back where it sat; done again, it goes", () => {
  const h = new History();
  const p = P("gone", 40, 50);
  h.push({ before: { gone: p }, after: { gone: null } });
  const back = applySide([P("a", 300, 12)], h.undo()!.before);
  assert.deepEqual(back.back, ["gone"]);
  assert.deepEqual(back.blocks.find((x) => x.id === "gone"), p);
  const again = applySide(back.blocks, h.redo()!.after);
  assert.deepEqual(again.gone, ["gone"]);
  assert.equal(again.blocks.some((x) => x.id === "gone"), false);
});

test("a new step drops what was undone after it; each session its own history", () => {
  const h = new History();
  h.push(stepOf([P("a", 0, 0)], [P("a", 10, 0)]));
  h.push(stepOf([P("a", 10, 0)], [P("a", 20, 0)]));
  h.undo();
  h.push(stepOf([P("a", 10, 0)], [P("a", 99, 0)]));
  assert.deepEqual(h.size, { back: 2, ahead: 0 });
  assert.notEqual(historyOf("s1"), historyOf("s2"));
  assert.equal(historyOf("s1"), historyOf("s1"));
});

test("the ghost's mark: read from the engine as it is, and a local reopen brings a closed block back live", () => {
  const seen = fromEngine({ stage: { lens: "app", tiled: false, blocks: [{ ...P("g", 12, 12), ghost: true }] }, blocks: [] });
  assert.equal(seen.stage.blocks[0].ghost, true);
  const mem = new Map<string, string>();
  const st = new LocalStore("t.", { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } });
  st.compose("s", { id: "x", kind: "card", title: "x", state: "live", versions: [], sessions: ["s"] }, { x: 12, y: 12, w: 200, h: 120, z: 1 });
  st.close("s", "x", "you");
  assert.equal(st.read("s").stage.blocks.length, 0);
  st.reopen("s", "x", { x: 40, y: 40, w: 200, h: 120, z: 2 }, "you");
  assert.equal(st.read("s").blocks[0].state, "live");
  assert.equal(st.read("s").stage.blocks[0].x, 40);
});

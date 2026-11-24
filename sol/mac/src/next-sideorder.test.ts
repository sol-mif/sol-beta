// node --test src/*.test.ts: the sidebar mirrors the canvas, one order from one source (walk note item 8, BR1 #1615).
// The order is read from the canvas's places, a folder inside a folder by where it sits in it; a drop in the sidebar
// moves the places through M.place and the order is read back. Signed: marcocyl04-ux's agent (builder E8), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropOrder, placesFor, dropFolder, reorderable } from "./next/sideorder.ts";
import { flow } from "./next/plane/layout.ts";

test("a drop gives the new reading order", () => {
  assert.deepEqual(dropOrder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(dropOrder(["a", "b", "c"], "a", null), ["b", "c", "a"]);
  assert.deepEqual(dropOrder(["a", "b", "c"], "b", "b"), ["a", "b", "c"], "on itself: nothing");
  assert.deepEqual(dropOrder(["a", "b"], "z", "a"), ["a", "b"], "not among them: nothing");
});

test("a canvas laid out by rule, read in its own order, moves nothing; a new order reads back as dropped", () => {
  const box = (id: string, w: number) => ({ r: { id }, cols: 0, w, h: 80 });
  const laid = flow([box("a", 300), box("b", 200), box("c", 300), box("d", 250)], 900);
  const at: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const { q, x, y } of laid.at) at[q.r.id] = { x: 40 + x, y: 60 + y, w: q.w, h: q.h };
  assert.deepEqual(placesFor(["a", "b", "c", "d"], at), [], "its own order: nothing moves");
  const moved = placesFor(["d", "a", "b", "c"], at), now = { ...at };
  for (const p of moved) now[p.id] = { ...now[p.id], x: p.x, y: p.y };
  const read = Object.keys(now).sort((m, n) => now[m].y - now[n].y || now[m].x - now[n].x);
  assert.deepEqual(read, ["d", "a", "b", "c"], "the canvas reads in the dropped order");
  assert.equal(new Set(moved.map((p) => p.id)).size, moved.length, "each folder once");
  assert.ok(now.d.x === 40 && now.d.y === 60, "from where the first of them started");
  assert.deepEqual(placesFor(["a"], at), [], "one folder has no order to change");
});

test("the sidebar's order is the canvas's places, a folder inside a folder by where it sits", async () => {
  const CV = await import("./next/cv/index.ts");
  await import("./next/cv/fixture.ts");
  CV.load("denise");   // house, kids, work
  const R = (id: string) => CV.D.regions.find((r) => r.id === id)!;
  R("kids").parent = "house"; R("work").parent = "house";
  const pos = CV.D.pos!, was = { kids: pos.kids, work: pos.work };
  try {
    const h = pos.house ?? { x: 0, y: 0, w: 600, h: 400 };
    pos.kids = { ...(pos.kids ?? h), x: h.x + 300, y: h.y + 60 } as typeof h;
    pos.work = { ...(pos.work ?? h), x: h.x + 20, y: h.y + 60 } as typeof h;
    const f = CV.folderOrder(), at = f.indexOf("house");
    assert.deepEqual(f.slice(at + 1, at + 3), ["work", "kids"], "by where they sit, never by name");
    assert.ok(!reorderable().includes("kids"), "a folder inside a folder is not dragged in the sidebar");
  } finally {
    pos.kids = was.kids!; pos.work = was.work!;
    delete R("kids").parent; delete R("work").parent;
  }
});

test("a drop in the sidebar goes to the canvas through M.place, one per folder that moves", async () => {
  const CV = await import("./next/cv/index.ts");
  await import("./next/cv/fixture.ts");
  CV.load("denise");
  const order = reorderable();
  if (order.length < 2) return;
  const calls: string[] = [], place = CV.M.place;
  (CV.M as { place: typeof place }).place = ((id: string) => { calls.push(id); }) as typeof place;
  try {
    const last = order[order.length - 1];
    assert.equal(dropFolder(last, order[0]), true);
    assert.ok(calls.length > 0 && calls.includes(last), "the dragged one is placed");
    assert.equal(new Set(calls).size, calls.length, "each folder once");
    calls.length = 0;
    assert.equal(dropFolder(order[0], order[0]), false, "on itself: nothing moves");
    assert.equal(calls.length, 0);
  } finally { (CV.M as { place: typeof place }).place = place; }
});

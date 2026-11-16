// node --test src/*.test.ts (npm test here): the drop preview in pearl (#774, stage/preview.ts), build/feel.md rule 1
// ("nothing moves under the hand: what the drop will do shows as dashed pearl outlines and a dimmed trade target, never
// as motion"), rule 4 (a visible guide is a promise; it fades in with the pull, .2 to .55) and "Z-order". The Try line,
// "drag over another block: it dims, nothing moves until you let go", on the hand's own numbers (hand.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropPreview, guideOpacity, guidesOf, zRanks } from "./stage/preview.ts";
import { handAt, release } from "./stage/hand.ts";
import type { Placed } from "./stage/geometry.ts";
import type { Rect } from "./stage/model.ts";
import { GUIDE, OUTLINE, TARGET_DIM, Z } from "./kit/feel.ts";

const room = { w: 1000, h: 640 };
const R = (x: number, y: number, w = 240, h = 160): Rect => ({ x, y, w, h });
const B = (id: string, r: Rect, touched = 1, hand = false): Placed => ({ id, r, touched, hand, born: 0 });
const hand = (b: Placed) => ({ ...b, from: { ...b.r } });
const others = (bs: Placed[], id: string) => bs.filter((b) => b.id !== id).map((b) => ({ id: b.id, r: b.r }));
const copy = (bs: Placed[]) => JSON.parse(JSON.stringify(bs)) as Placed[];

test("Try: over another block it dims, nothing moves until you let go; let go, they trade", () => {
  const blocks = [B("week", R(16, 16, 440, 300), 2), B("list", R(468, 16, 284, 204), 1)];
  const was = copy(blocks);
  const me = hand(blocks[0]);
  // the week's head held at (60, 20) and carried over the list's middle
  const grab = { x: 60, y: 20 };
  for (const p of [{ x: 500, y: 60 }, { x: 560, y: 100 }, { x: 610, y: 140 }]) {
    const shown = handAt(room, { id: "week", w: 440, h: 300 }, p, grab, others(blocks, "week"));
    assert.equal(shown.over, "list", "the pointer is in the list: a trade");
    const pv = dropPreview(room, me, shown, blocks);
    assert.equal(pv.dim, "list", "the target dims");
    assert.deepEqual(pv.outlines, [{ id: "list", r: R(16, 16, 440, 300) }], "an outline where the list would go: the week's slot and size");
    assert.deepEqual(pv.guides, { v: null, h: null }, "a trade has no guide");
    assert.deepEqual(blocks, was, "nothing moved: the preview only reads");
  }
  // let go: now they trade, each the other's place and size
  const shown = handAt(room, { id: "week", w: 440, h: 300 }, { x: 610, y: 140 }, grab, others(blocks, "week"));
  const r = release(room, me, shown, blocks, { x: 0, y: 0 });
  assert.equal(r.kind, "trade");
  assert.deepEqual(r.plan.out.get("week"), R(468, 16, 284, 204));
  assert.deepEqual(r.plan.out.get("list"), R(16, 16, 440, 300));
});

test("off the other block: no dim; a drop that pushes one aside outlines its new place, never the hand's own", () => {
  const blocks = [B("a", R(16, 16)), B("b", R(300, 16))];
  const me = hand(blocks[0]);
  // a carried right so it covers b's left part, the pointer still left of b
  const shown = handAt(room, { id: "a", w: 240, h: 160 }, { x: 230, y: 30 }, { x: 10, y: 14 }, others(blocks, "a"));
  assert.equal(shown.over, null);
  const pv = dropPreview(room, me, shown, blocks);
  assert.equal(pv.dim, null);
  assert.equal(pv.outlines.length, 1);
  assert.equal(pv.outlines[0].id, "b", "only the block the drop moves");
  assert.notDeepEqual(pv.outlines[0].r, blocks[1].r, "at where it would step to");
  assert.ok(!pv.outlines.some((o) => o.id === "a"), "the hand's block is never outlined");
  // carried where it covers nothing: nothing to outline
  const free = handAt(room, { id: "a", w: 240, h: 160 }, { x: 60, y: 400 }, { x: 10, y: 14 }, others(blocks, "a"));
  assert.deepEqual(dropPreview(room, me, free, blocks).outlines, []);
});

test("a guide fades in with the pull: .2 where it starts, .55 once captured, none outside the reach", () => {
  assert.equal(guideOpacity(0), 0);
  assert.ok(Math.abs(guideOpacity(0.0001) - GUIDE.from) < 1e-3);
  assert.equal(guideOpacity(1), GUIDE.to);
  let last = 0;
  for (let f = 0.05; f <= 1; f += 0.05) { const o = guideOpacity(f); assert.ok(o > last && o <= 0.55); last = o; }
  assert.deepEqual(guidesOf({ v: 0, f: 0, d: 0 }, undefined), { v: null, h: null });
  assert.deepEqual(guidesOf({ v: 20, f: 1, d: -4, t: 16, line: 16 }, null), { v: { line: 16, o: 0.55 }, h: null });
  // a block carried toward the stage's left pad: as it nears, the guide on the pad line grows brighter
  const blocks = [B("a", R(200, 200))];
  const me = hand(blocks[0]);
  const at = (x: number) => dropPreview(room, me, handAt(room, { id: "a", w: 240, h: 160 }, { x: x + 10, y: 214 }, { x: 10, y: 14 }, []), blocks).guides.v;
  assert.equal(at(60), null, "far: no guide");
  const near = at(28)!, closer = at(24)!, on = at(18)!;
  assert.equal(near.line, 16);
  assert.ok(near.o >= 0.2 && near.o < closer.o && closer.o < on.o, `${near.o} < ${closer.o} < ${on.o}`);
  assert.equal(on.o, 0.55);
});

test("a guide joins the hand's block to the block the line is theirs, 10 past each end; the stage's pad runs the whole stage", () => {
  const blocks = [B("a", R(300, 300)), B("b", R(600, 16, 240, 200))];
  const me = hand(blocks[0]);
  // a carried so its left edge nears b's left (600): the guide runs from b's top to a's bottom
  const shown = handAt(room, { id: "a", w: 240, h: 160 }, { x: 614, y: 314 }, { x: 10, y: 14 }, others(blocks, "a"));
  const v = dropPreview(room, me, shown, blocks).guides.v!;
  assert.equal(v.line, 600);
  assert.equal(v.a, 16 - 10);
  assert.equal(v.b, Math.round(shown.y) + 160 + 10);
  const pad = dropPreview(room, me, handAt(room, { id: "a", w: 240, h: 160 }, { x: 28, y: 414 }, { x: 10, y: 14 }, others(blocks, "a")), blocks).guides.v!;
  assert.equal(pad.line, 16);
  assert.equal(pad.a, undefined, "the pad's guide: the whole stage");
});

test("the z-order table (feel.md): blocks by last touch under waits; outlines 240, guides 250, the hand 300", () => {
  assert.ok(Z.touched < Z.waits);
  assert.deepEqual([Z.waits, Z.outline, Z.guide, Z.hand, Z.flight, Z.tray, Z.jelly], [200, 240, 250, 300, 400, 500, 600]);
  assert.equal(TARGET_DIM, 0.62);
  assert.deepEqual(OUTLINE, { line: 1.5, dash: "6 7" });
});

test("the z-order table through the real rank: by last touch 1 to 199, a block that waits above them all", () => {
  // the waiting block was touched first: it still sits over the two touched after it (#858 B11-2)
  const r = zRanks([{ id: "w", z: 1 }, { id: "a", z: 5 }, { id: "b", z: 9 }], (id) => id === "w");
  assert.equal(r.get("w"), Z.waits);
  assert.deepEqual([r.get("a"), r.get("b")], [1, 2]);
  assert.ok(r.get("w")! > r.get("b")!);
  // never past Z.touched, however many
  const many = zRanks(Array.from({ length: 250 }, (_, i) => ({ id: `x${i}`, z: i })), () => false);
  assert.equal(many.get("x249"), Z.touched);
  assert.ok(Math.max(...many.values()) < Z.waits);
});

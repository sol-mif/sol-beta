// node --test src/*.test.ts (npm test here): resize by any edge, with the fit detent (#775, stage/resize.ts), build/
// feel.md "Distances" and whole.md "resize". The Try line, "pull a list's bottom edge: it clicks at its last row;
// shorter shows +3 lines", as numbers: the south edge pulled near the content's height is caught there and lands on it;
// three rows shorter, the cut says "+3 lines".
import { test } from "node:test";
import assert from "node:assert/strict";
import { EDGES, cutLines, cutWords, edgeCands, pinchEnd, pinchRect, resizeEnd, resizeTo } from "./stage/resize.ts";
import { BLOCK_MIN, CAPTURE, REACH, type Room } from "./stage/geometry.ts";
import { EDGE, PINCH } from "./kit/feel.ts";

const room: Room = { w: 1000, h: 640 };
// a list: head 34, body padding 12 top-ish, seven rows 25 apart (a 24 row and the hairline gap), its foot below
const head = 34, rowTop = 4, row = 25, rows = 7, foot = 30, pad = 12;
const bottoms = Array.from({ length: rows }, (_, i) => rowTop + (i + 1) * row - 1);
const content = bottoms[rows - 1] + 8 + foot + pad;   // the body's whole content
const fit = head + content;                            // "all of it"
const from = { x: 200, y: 100, w: 320, h: 200 };

test("feel.md's numbers: a band 10 astride every edge, corners 18, eight holds, block.min 200 × 120, a pinch rests 180 ms", () => {
  assert.deepEqual(EDGE, { band: 10, corner: 18 });
  assert.deepEqual(EDGES.sort(), ["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
  assert.deepEqual(BLOCK_MIN, { w: 200, h: 120 });
  assert.equal(PINCH.rest, 180);
});

test("Try: pull a list's bottom edge near its last row: it clicks there (the fit detent) and lands on it", () => {
  const want = from.y + fit;
  for (const miss of [-12, -6, -1, 0, 3, 9, 15]) {
    const s = resizeTo(room, from, "s", { x: 0, y: want + miss - (from.y + from.h) }, [], fit);
    assert.equal(s.fit, true, `caught ${miss} px off`);
    assert.equal(s.sy?.line, want, "the guide is drawn at all of it");
    if (Math.abs(miss) <= CAPTURE) assert.equal(s.r.y + s.r.h, want, "inside capture it sits on it");
    assert.equal(resizeEnd("s", s).h, fit, "let go, it lands on all of it");
  }
  const far = resizeTo(room, from, "s", { x: 0, y: want + REACH + 4 - (from.y + from.h) }, [], fit);
  assert.equal(far.fit, false);
  { const r = resizeEnd("s", far); assert.equal((r.y + r.h) % 8, 0, "past reach the edge lands on the grid"); }
});

test("Try: three rows shorter, the cut says +3 lines; at all of it, nothing", () => {
  const body = (h: number) => h - head;
  assert.equal(cutLines(body(fit), content, bottoms), 0);
  assert.equal(cutWords(cutLines(body(fit), content, bottoms)), "");
  // the bottom edge pulled up past the foot and three rows
  const shown = bottoms[rows - 4] + 1;
  assert.equal(cutLines(shown, content, bottoms), 3);
  assert.equal(cutWords(3), "+3 lines");
  assert.equal(cutWords(1), "+1 line");
  // a body with no rows counts its hidden height in lines of 20
  assert.equal(cutLines(100, 161), 4);
  assert.equal(cutLines(100, 105), 0, "under 6 px hidden is not a cut");
});

test("any edge or corner moves only its own sides; each is pulled to the others' edges and the gap", () => {
  const e = resizeTo(room, from, "e", { x: 40, y: 99 }, [], null);
  assert.deepEqual([e.r.x, e.r.y, e.r.h], [from.x, from.y, from.h]);
  assert.equal(e.r.w, 360);
  const nw = resizeTo(room, from, "nw", { x: -40, y: -30 }, [], null);
  assert.deepEqual([nw.r.x + nw.r.w, nw.r.y + nw.r.h], [from.x + from.w, from.y + from.h], "the far corner stays");
  const other = { x: 600, y: 100, w: 200, h: 200 };
  const near = resizeTo(room, from, "e", { x: 600 - 12 - 520 - 3, y: 0 }, [other], null);
  assert.equal(near.r.x + near.r.w, 588, "the east edge clicks to the gap before the other block");
  assert.ok(edgeCands(16, 984, [other], "x").some((c) => c.t === 588));
});

test("never under block.min, never off the stage", () => {
  const s = resizeTo(room, from, "se", { x: -500, y: -500 }, [], null);
  assert.deepEqual([s.r.w, s.r.h], [200, 120]);
  const n = resizeTo(room, from, "n", { x: 0, y: 400 }, [], null);
  assert.equal(n.r.y + n.r.h, from.y + from.h, "the south edge holds when the north is pulled past it");
  assert.equal(n.r.h, 120);
  const big = resizeTo(room, from, "se", { x: 5000, y: 5000 }, [], null);
  assert.equal(big.r.x + big.r.w, room.w - 16);
  assert.equal(big.r.y + big.r.h, room.h);
});

test("a pinch resizes from the centre and rests on the grid", () => {
  const out = pinchRect(room, from, -50);   // fingers apart
  assert.ok(out.w > from.w && out.h > from.h);
  assert.ok(Math.abs(out.x + out.w / 2 - (from.x + from.w / 2)) < 1e-9, "the centre stays");
  const small = pinchRect(room, from, 900);
  assert.deepEqual([small.w, small.h], [200, 120]);
  const end = pinchEnd(room, out);
  for (const v of [end.x, end.y, end.w, end.h]) assert.equal(v % 8, 0);
});

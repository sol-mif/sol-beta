// node --test src/next-size.test.ts: the infinite canvas's sizes (BR1, #1615; next/plane/size.ts; mine/look/br1/three.html
// "An infinite canvas"): between its limits a piece scales with the camera; past them it holds its size with its centre
// where it was, so a zoom changes only the space between pieces. Invented boxes, no real data.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, hold, held, heldOn, type Kind } from "./next/plane/size.ts";

const q = { x: 1000, y: 400, w: 400, h: 300 };
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2];

test("between its limits a box scales with the camera, as before", () => {
  for (const kind of Object.keys(SIZE) as Kind[]) {
    const z = (SIZE[kind].min + SIZE[kind].max) / 2 / q.w;
    assert.equal(hold(q.w, z, kind), 1);
    assert.deepEqual(held(q, z, kind), { ...q, k: 1 });
  }
});

test("past either limit a box holds its size on screen, its centre where it was", () => {
  for (const kind of Object.keys(SIZE) as Kind[]) for (const z of [0.002, 0.01, 0.05, 3, 8]) {
    const b = held(q, z, kind), s = b.w * z;
    assert.ok(s >= SIZE[kind].min - 1e-9 && s <= SIZE[kind].max + 1e-9, `${kind} at ${z}: ${s}px`);
    assert.deepEqual(centre(b).map((n) => +n.toFixed(6)), centre(q));
    assert.equal(+(b.h / b.w).toFixed(9), +(q.h / q.w).toFixed(9), "its height goes with its width");
  }
});

test("past the largest size only the space between pieces grows", () => {
  const a = { x: 0, y: 0, w: 400, h: 300 }, b = { x: 1000, y: 0, w: 400, h: 300 };
  const gap = (z: number) => { const ha = held(a, z, "face"), hb = held(b, z, "face"); return (hb.x - (ha.x + ha.w)) * z; };
  const width = (z: number) => held(a, z, "face").w * z;
  assert.equal(width(3), SIZE.face.max); assert.equal(width(6), SIZE.face.max);
  assert.ok(gap(6) > gap(3) && gap(3) > gap(2), "the gap widens while the faces hold");
});

test("on screen: the same box the camera draws, held", () => {
  const cam = { x: 900, y: 300, z: 0.5 }, r = heldOn(q, cam, 1440, 900, "face");
  assert.deepEqual(r, { x: (q.x - cam.x) * cam.z + 720, y: (q.y - cam.y) * cam.z + 450, w: q.w * cam.z, h: q.h * cam.z });
  const far = heldOn(q, { ...cam, z: 0.01 }, 1440, 900, "card");
  assert.equal(+far.w.toFixed(6), SIZE.card.min);
});

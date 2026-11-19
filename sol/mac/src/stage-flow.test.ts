// The stage laid by rule (#872, model.ts flow): from the narrowest stage a 900 px window leaves to a full screen, with 1
// to 8 blocks open, no block touches another, every block is wholly on the stage and at least the floor's size (or the
// first fold to the foot), and laying it twice changes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN, PAD, flow, overlaps, readingOrder, type Place } from "./stage/model.ts";

const sizes = [{ w: 300, h: 700 }, { w: 456, h: 780 }, { w: 640, h: 820 }, { w: 980, h: 860 }, { w: 1400, h: 900 }, { w: 2400, h: 1300 }, { w: 900, h: 300 }];
const blocks = (n: number): Place[] => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, x: 12 + i * 40, y: 12 + i * 30, w: 408 + i * 17, h: 300 - i * 9, z: i + 1 }));

test("flow: none touch, all on the stage, all at least the floor, twice is once", () => {
  for (const s of sizes) for (let n = 1; n <= 8; n++) {
    const ps = blocks(n);
    const { places, folded } = flow(s, ps, ps.map((p) => p.id), "b0");
    const open = places.filter((p) => !p.folded);
    assert.equal(open.length + folded.length, n);
    for (const a of open) {
      assert.ok(a.x >= PAD && a.y >= PAD && a.x + a.w <= s.w - PAD + 0.5 && a.y + a.h <= s.h - PAD + 0.5, `${n} at ${s.w}x${s.h}: ${a.id} off the stage`);
      if (open.length > 1) assert.ok(a.w >= MIN.w - 1 && a.h >= MIN.h - 1, `${n} at ${s.w}x${s.h}: ${a.id} under the floor ${a.w}x${a.h}`);
      for (const b of open) if (a !== b) assert.ok(!overlaps(a, b), `${n} at ${s.w}x${s.h}: ${a.id} touches ${b.id}`);
    }
    assert.ok(!folded.includes("b0"), "the big one is never the one folded");
    const again = flow(s, places, readingOrder(places), "b0").places;
    assert.deepEqual(again.map((p) => [p.x, p.y, p.w, p.h]), places.map((p) => [p.x, p.y, p.w, p.h]), `${n} at ${s.w}x${s.h}: laying twice moved it`);
  }
});

test("flow: three on a wide stage are one big beside two, the big for the one asked", () => {
  const ps = blocks(3), { places } = flow({ w: 1000, h: 800 }, ps, ["b0", "b1", "b2"], "b2");
  const big = places.find((p) => p.id === "b2")!;
  assert.equal(big.x, PAD); assert.ok(big.h > 700);
});

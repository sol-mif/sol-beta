// node --test src/*.test.ts (npm test here): the whole stage's hand (#773, stage/hand.ts, kit/feel.ts), build/feel.md
// rules 1-5. The Try line, "drag a block fast in circles: it stays under the finger, and lands without a jump", as
// numbers: around a fast circle the block is never more than snap.capture from pointer − grab, and the release starts
// where the block was shown and settles there on a spring that moves smoothly and never passes its target by more
// than motion.clamp.
import { test } from "node:test";
import assert from "node:assert/strict";
import { band, clampOver, handAt, outsideWindow, pastThreshold, popArmed, release, rubber, track, velocity, type Track } from "./stage/hand.ts";
import { CAPTURE, REACH, type Placed, type Room } from "./stage/geometry.ts";
import { CLAMP, LIFT, POP_HOLD, SPRING, THRESHOLD } from "./kit/feel.ts";

const room: Room = { w: 1000, h: 640 };
const R = (x: number, y: number, w = 240, h = 160) => ({ x, y, w, h });
const others = [{ id: "b", r: R(16, 16) }, { id: "c", r: R(700, 400) }, { id: "d", r: R(620, 30, 300, 200) }];
const me = { id: "a", w: 240, h: 160 };
const grab = { x: 60, y: 20 };   // the head, where the hand took it

test("feel.md's numbers: lift 1.012, thresholds mouse 3 · pen 4 · touch 6, the hold 400, clamp 4, the five springs", () => {
  assert.equal(LIFT, 1.012);
  assert.deepEqual(THRESHOLD, { mouse: 3, pen: 4, touch: 6 });
  assert.deepEqual([POP_HOLD, CLAMP], [400, 4]);
  // k and c, as motion.ts's Spring reads them (#843): a spring built otherwise never rests
  assert.deepEqual([SPRING.settle.k, SPRING.settle.c], [520, 40]);
  assert.deepEqual([SPRING.travel.k, SPRING.travel.c, SPRING.glide.k, SPRING.glide.c], [300, 31, 200, 27]);
  assert.deepEqual([SPRING.lift.k, SPRING.lift.c, SPRING.fade.k, SPRING.fade.c], [900, 54, 400, 40]);
});

test("a press under the threshold is a press; past it, a drag, by pointer kind", () => {
  const o = { x: 0, y: 0 };
  assert.equal(pastThreshold("mouse", o, { x: 2, y: 2 }), false);   // 2.83
  assert.equal(pastThreshold("mouse", o, { x: 3, y: 0 }), true);
  assert.equal(pastThreshold("pen", o, { x: 3, y: 0 }), false);
  assert.equal(pastThreshold("touch", o, { x: 5, y: 0 }), false);
  assert.equal(pastThreshold("touch", o, { x: 6, y: 0 }), true);
});

test("Try: dragged fast in circles, the block stays under the finger: never more than capture from pointer − grab", () => {
  let worst = 0, steps = 0, prev: { x: number; y: number } | null = null, worstStep = 0;
  // three turns of a 180 px circle in 0.6 s at 120 Hz: about 5.6 m/s, far faster than a hand drags
  for (let i = 0; i <= 216; i++) {
    const a = (i / 72) * 2 * Math.PI, p = { x: 470 + 180 * Math.cos(a), y: 330 + 180 * Math.sin(a) };
    const s = handAt(room, me, p, grab, others);
    if (s.over) continue;   // over another block: a trade's, no magnet; the block is at the hand exactly
    const off = Math.max(Math.abs(s.x - (p.x - grab.x)), Math.abs(s.y - (p.y - grab.y)));
    worst = Math.max(worst, off);
    if (prev) worstStep = Math.max(worstStep, Math.hypot(s.x - prev.x, s.y - prev.y));
    prev = { x: s.x, y: s.y };
    steps++;
  }
  assert.ok(steps > 100);
  assert.ok(worst <= CAPTURE + 1e-9, `the furthest the block got from the finger: ${worst.toFixed(2)} px`);
  // the hand moves 15.7 px a step; the block never jumps further than that and the magnet's capture
  assert.ok(worstStep <= 2 * Math.PI * 180 / 72 + 2 * CAPTURE, `largest step ${worstStep.toFixed(2)}`);
});

test("over another block the hand is followed exactly and the release is a trade", () => {
  const s = handAt(room, me, { x: 800, y: 450 }, grab, others);
  assert.equal(s.over, "c");
  assert.deepEqual([s.x, s.y], [740, 430]);
  const blocks: Placed[] = [{ id: "a", r: R(300, 300), touched: 1, hand: false, born: 0 }, ...others.map((o) => ({ ...o, touched: 0, hand: false, born: 0 }))];
  const r = release(room, { ...blocks[0], from: R(300, 300) }, s, blocks, { x: 0, y: 0 });
  assert.equal(r.kind, "trade");
  assert.deepEqual(r.at, R(700, 400));
  assert.deepEqual(r.plan.out.get("c"), R(300, 300));
});

test("Try: it lands without a jump: from where it was shown, within reach, on a smooth spring that stays in the clamp", () => {
  const blocks: Placed[] = [{ id: "a", r: R(300, 300), touched: 1, hand: false, born: 0 }, ...others.map((o) => ({ ...o, touched: 0, hand: false, born: 0 }))];
  for (const p of [{ x: 400, y: 260 }, { x: 333, y: 571 }, { x: 571, y: 333 }, { x: 129, y: 401 }]) {
    const s = handAt(room, me, p, grab, others);
    if (s.over) continue;
    const r = release(room, { ...blocks[0], from: R(300, 300) }, s, blocks, { x: 0, y: 0 });
    assert.equal(r.glide, false);
    const onStage = s.y + me.h <= room.h && s.y >= 0 && s.x >= 0 && s.x + me.w <= room.w;
    // held on the stage, it lands within reach of where it was shown; pulled past the edge on the band, the same spring
    // brings it back in
    if (onStage) assert.ok(Math.abs(r.at.x - s.x) < REACH && Math.abs(r.at.y - s.y) < REACH, `lands near where it was shown (${s.x},${s.y} → ${r.at.x},${r.at.y})`);
    // the settle spring from shown to the landing on the axis that moves most, at 120 Hz: no frame moves far, no
    // overshoot past the clamp
    const ax = Math.abs(r.at.x - s.x) >= Math.abs(r.at.y - s.y) ? "x" : "y";
    let v = s[ax], vel = 0, maxStep = 0, over = 0;
    const { k, c } = SPRING.settle, to = r.at[ax], from = s[ax], dist = Math.abs(to - from);
    for (let f = 0; f < 120; f++) {
      const was = v;
      for (let n = 0; n < 2; n++) { vel += (-(v - to) * k - c * vel) / 240; v += vel / 240; ({ v, vel } = clampOver(v, vel, to, from)); }
      maxStep = Math.max(maxStep, Math.abs(v - was));
      over = Math.max(over, (v - to) * Math.sign(to - from || 1));
    }
    assert.ok(Math.abs(v - to) < 0.01, "it rests on the landing");
    // no frame covers more than a fifth of the way: the move is seen, never a teleport
    assert.ok(maxStep <= Math.max(1, dist / 5), `largest frame step ${maxStep.toFixed(2)} px of ${dist.toFixed(1)}`);
    assert.ok(over <= CLAMP, `overshoot ${over.toFixed(2)} px`);
  }
});

test("a flick (over 500 px/s from the last 100 ms) glides to its projection; a slow release does not", () => {
  let t: Track = [];
  for (let i = 0; i <= 10; i++) t = track(t, i * 16, { x: i * 16, y: 0 });   // 1000 px/s to the right
  assert.ok(t[t.length - 1][0] - t[0][0] <= 100);
  assert.equal(Math.round(velocity(t).x), 1000);
  const blocks: Placed[] = [{ id: "a", r: R(300, 300), touched: 1, hand: false, born: 0 }];
  const s = handAt(room, me, { x: 360, y: 320 }, grab, []);
  const fast = release(room, { ...blocks[0], from: R(300, 300) }, s, blocks, velocity(t));
  assert.equal(fast.glide, true);
  assert.equal(fast.at.x, 400);   // 300 + 1000 × 0.1, on the grid
  assert.equal(release(room, { ...blocks[0], from: R(300, 300) }, s, blocks, { x: 300, y: 0 }).glide, false);
});

test("the rubber band past the stage resists and never stops dead", () => {
  assert.equal(rubber(50, 0, 100, 200), 50);
  const a = rubber(-100, 0, 100, 200), b = rubber(-200, 0, 100, 200);
  assert.ok(a < 0 && a > -100 && b < a, "past the edge it still moves, less than the hand");
  assert.ok(Math.abs(band(1e-6, 200)) < 1e-5, "continuous at the edge");
});

test("leaving the window does nothing; a pop needs the pointer held past the edge 400 ms", () => {
  const win = { w: 1280, h: 800 };
  assert.equal(outsideWindow(win, { x: 640, y: 400 }), false);
  assert.equal(outsideWindow(win, { x: 1290, y: 400 }), true);
  assert.equal(popArmed(null, 5000), false);
  assert.equal(popArmed(1000, 1399), false);
  assert.equal(popArmed(1000, 1400), true);
});

test("the clamp: a spring past its target by more than 4 px is held at 4, its speed spent", () => {
  assert.deepEqual(clampOver(105, 30, 100, 0), { v: 104, vel: 0 });
  assert.deepEqual(clampOver(103, 30, 100, 0), { v: 103, vel: 30 });
  assert.deepEqual(clampOver(-5, -30, 0, 100), { v: -4, vel: 0 });
});

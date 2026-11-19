// More than two screens (#1090, design "MORE THAN TWO", rules 1, 2, 6): seams.ts on the desks the design draws (the
// designer's 11 checks, ~/.cache/n13-screens-design/jev/try-seams.mts, as tests)
import { test } from "node:test";
import assert from "node:assert/strict";
import { seamsOf, landsOn, nextBy, leaveBy } from "./screens/seams.ts";

const r = (n: number) => Math.round(n * 100) / 100;
// a row, feet on one line: laptop 1512x982, monitor 2560x1440, a monitor turned upright 1440x2560
const A = { x: 0, y: 1578, w: 1512, h: 982 }, B = { x: 1512, y: 1120, w: 2560, h: 1440 }, C = { x: 4072, y: 0, w: 1440, h: 2560 };
const row = [{ win: "two", screen: B }, { win: "three", screen: C }];

test("a row of three: a seam only on the stretch of an edge another screen touches", () => {
  let s = seamsOf(A, row);
  assert.deepEqual(s, [{ win: "two", edge: "right", from: 0, to: 1 }]);
  s = seamsOf(B, [{ win: "main", screen: A }, { win: "three", screen: C }]);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].edge, r(s[0].from), s[0].to, s[1].edge, s[1].from, s[1].to], ["left", r(458 / 1440), 1, "right", 0, 1]);
  s = seamsOf(C, [{ win: "main", screen: A }, { win: "two", screen: B }]);
  assert.deepEqual([s.length, s[0].edge, r(s[0].from)], [1, "left", r(1120 / 2560)]);
});

test("a block lands on the screen the hand is over; a flick goes one screen over; no facing edge springs back", () => {
  assert.equal(landsOn(A, row, 5000, 800), "three");
  assert.equal(landsOn(A, row, 2000, 2000), "two");
  assert.equal(landsOn(A, row, 700, 2000), null);
  assert.equal(nextBy(A, row, "right", 0.5), "two");
  assert.equal(nextBy(A, row, "left", 0.5), null);
  assert.equal(nextBy(B, [{ win: "main", screen: A }, { win: "three", screen: C }], "right", 0.2), "three");
  assert.equal(leaveBy(A, C), "right");
  assert.equal(leaveBy(C, A), "left");
});

test("a laptop under two monitors: one edge, two seams, half each; thrown from the right half to the right one", () => {
  const L = { x: 1804, y: 1440, w: 1512, h: 982 }, M1 = { x: 0, y: 0, w: 2560, h: 1440 }, M2 = { x: 2560, y: 0, w: 2560, h: 1440 };
  const two = [{ win: "two", screen: M1 }, { win: "three", screen: M2 }];
  const s = seamsOf(L, two);
  assert.deepEqual(s.map((x) => [x.edge, x.win]), [["top", "two"], ["top", "three"]]);
  assert.equal(r(s[0].to), 0.5); assert.equal(r(s[1].from), 0.5);
  assert.equal(nextBy(L, two, "top", 0.8), "three");
  assert.equal(nextBy(L, two, "top", 0.2), "two");
  assert.deepEqual(seamsOf({ x: 524, y: 1440, w: 1512, h: 982 }, [{ win: "two", screen: M1 }]), [{ win: "two", edge: "top", from: 0, to: 1 }]);
});

test("a corner that only touches is no seam; two windows on one screen give none from this rule", () => {
  assert.equal(seamsOf(A, [{ win: "x", screen: { x: 1512, y: 0, w: 1000, h: 1600 } }]).length, 0);
  assert.equal(seamsOf(A, [{ win: "x", screen: A }]).length, 0);
});

// node --test src/*.test.ts (npm test here): the jelly's way on the stage (#697, stage/jellyPath.ts): where it sits by a
// block, where its six land, and the pour's curve read from the tokens as the CSS draws it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORNERS, cornersOf, cubicBezier, easing, spotIn } from "./stage/jellyPath.ts";

const tokens = JSON.parse(readFileSync(new URL("../../design/system/tokens.json", import.meta.url), "utf8"));
const S = tokens.palette.scale;
const near = (a: number, b: number, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} is not ${b}`);

test("the six land on a block's four corners and its top and bottom middles, once each", () => {
  const b = { x: 40, y: 20, w: 300, h: 200 };
  assert.deepEqual(cornersOf(b), [{ x: 40, y: 20 }, { x: 340, y: 20 }, { x: 340, y: 220 }, { x: 40, y: 220 }, { x: 190, y: 20 }, { x: 190, y: 220 }]);
  assert.equal(new Set(CORNERS.map((c) => c.join())).size, 6);
});

test("the jelly sits by a block inside its title row, a step in from its right edge", () => {
  const b = { x: 100, y: 50, w: 400, h: 300 }, size = S.space.s12;
  const p = spotIn(b, size, S.height.row, S.space.s1);
  assert.equal(p.y, b.y + S.height.row / 2);
  assert.ok(p.x + size / 2 <= b.x + b.w, "the jelly's frame stays inside the block's right edge");
  assert.ok(p.x - size / 2 > b.x, "and starts past its left");
});

test("the pour's curve: from the tokens, ends pinned, overshoots a little as cubic-bezier(0.3, 1.12, 0.6, 1) does", () => {
  const pour = easing(tokens.palette.motion.easing.pour);
  assert.equal(pour(0), 0);
  assert.equal(pour(1), 1);
  let peak = 0;
  for (let i = 0; i <= 200; i++) peak = Math.max(peak, pour(i / 200));
  assert.ok(peak > 1 && peak < 1.12, `the pour overshoots a little, not past its handle (${peak})`);
});

test("a cubic-bezier matches the CSS keywords at known points", () => {
  const lin = cubicBezier(0, 0, 1, 1);
  for (const p of [0.1, 0.5, 0.9]) near(lin(p), p);
  const ease = easing("ease");
  near(ease(0.5), 0.8024, 2e-3);   // CSS ease at half the time
  near(easing("nonsense")(0.3), 0.3);
  for (let i = 1; i < 100; i++) assert.ok(ease(i / 100) >= ease((i - 1) / 100), "ease never goes back");
});

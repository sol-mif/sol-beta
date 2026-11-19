// A page in a block of any size (#872, second pass, kinds/pageFit.ts): laid out never narrower than the floor and scaled
// down to the block whole, so it never overlaps itself; under the readable scale only a still with its title is shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_FLOOR, PAGE_READ, pageFit } from "./stage/kinds/pageFit.ts";

test("pageFit: a wide block draws the page at its own size", () => {
  assert.deepEqual(pageFit(1000, 600), { w: 1000, h: 600, scale: 1, still: false });
  assert.deepEqual(pageFit(PAGE_FLOOR, 400), { w: PAGE_FLOOR, h: 400, scale: 1, still: false });
});

test("pageFit: a narrow block lays the page out at the floor and scales it to fit, the same shape", () => {
  for (const w of [700, 540, 400, 361]) {
    const f = pageFit(w, 300);
    assert.equal(f.w, PAGE_FLOOR, `${w}: laid out at the floor`);
    assert.ok(Math.abs(f.w * f.scale - w) < 1 && Math.abs(f.h * f.scale - 300) < 1, `${w}: scaled it fills the block exactly`);
    assert.equal(f.still, false, `${w}: still readable`);
  }
});

test("pageFit: under the readable scale it is a still", () => {
  assert.equal(pageFit(PAGE_FLOOR * PAGE_READ, 300).still, false);
  assert.equal(pageFit(PAGE_FLOOR * PAGE_READ - 1, 300).still, true);
  assert.equal(pageFit(200, 120).still, true);
});

test("pageFit: a box not yet measured draws nothing scaled", () => {
  assert.deepEqual(pageFit(0, 0), { w: PAGE_FLOOR, h: 0, scale: 1, still: false });
});

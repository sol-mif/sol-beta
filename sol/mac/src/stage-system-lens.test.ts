// node --test src/*.test.ts: the system block's lens and window view (#1220, stage/kinds/system/lens.ts and model.ts):
// the lens read from a body, laid over the view (path numbered and joined, a missing wire a gap), the hand's pick over
// the lens, the camera that fits, the step's words, and the area drawn on a miniature of the window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY, REGIONS, WIN_K, windowLayout, windowWire, type Tile, type View } from "./stage/kinds/system/model.ts";
import { fitCam, lensIn, lensKey, lensOf, stepWords, tileLook } from "./stage/kinds/system/lens.ts";

const ring = { signal: false, owner: true, decision: false, change: false, check: false };
const tile = (id: string, layer: Tile["layer"], more: Partial<Tile> = {}): Tile => ({
  id, name: id.split("/").pop()!, about: "", kind: "doc", state: "live", owner: "m", layer, guessed: false, weight: 0, ring, paths: [], machines: [], inArea: true, ...more,
});
const view = (tiles: Tile[], wires: [string, string][] = []): View => ({ ...EMPTY, area: "design/redesign", name: "Redesign", tiles, wires });
const redesign = view(
  [tile("pins", "source"), tile("accent", "surface"), tile("tokens", "source"), tile("product/buttons", "surface"), tile("product/build/composer", "surface")],
  [["pins", "accent"], ["accent", "tokens"], ["accent", "product/buttons"]],
);

test("a body's lens: the fields of the right type kept, the rest dropped; none when the body has none", () => {
  assert.equal(lensIn({ area: "design" }), null);
  assert.equal(lensIn(null), null);
  assert.deepEqual(lensIn({ area: "a", lens: { focus: "x", path: ["a", 3, "b"], step: [2, 4], mark: { a: "cut", b: "nonsense" }, view: "window", show: { a: "after", b: "later" }, fit: 7 } }),
    { focus: "x", path: ["a", "b"], step: [2, 4], mark: { a: "cut" }, view: "window", show: { a: "after" } });
  assert.equal(lensKey(null), "");
  assert.notEqual(lensKey({ focus: "a" }), lensKey({ focus: "b" }));
});

test("the lens over the view: the path numbered, each leg a wire or a gap, an id the view does not draw left out", () => {
  const l = lensOf(redesign, { path: ["pins", "accent", "ghost", "tokens", "product/build/composer"], focus: "accent", say: "  the pins lead.  ", step: [1, 4], mark: { "product/build/composer": "redo", ghost: "cut" } });
  assert.deepEqual(l.path, ["pins", "accent", "tokens", "product/build/composer"]);
  assert.equal(l.num.get("tokens"), 3);
  assert.deepEqual(l.legs, [{ from: "pins", to: "accent", missing: false }, { from: "accent", to: "tokens", missing: false }, { from: "tokens", to: "product/build/composer", missing: true }]);
  assert.equal(l.say, "the pins lead.");
  assert.deepEqual(l.step, [1, 4]);
  assert.deepEqual([...l.mark], [["product/build/composer", "redo"]]);
  assert.equal(l.view, "lanes");
  assert.ok(l.dims);
  // a leg against the wire's direction is still a wire
  assert.equal(lensOf(redesign, { path: ["tokens", "accent"] }).legs[0].missing, false);
  // a step out of range is no step
  assert.equal(lensOf(redesign, { step: [5, 4] }).step, null);
  // no lens: nothing changes
  const none = lensOf(redesign, null);
  assert.equal(none.focus, null); assert.equal(none.dims, false); assert.equal(none.fit, null);
});

test("fit: the path, else the focus; the area; one system; an unknown one moves nothing", () => {
  assert.deepEqual(lensOf(redesign, { path: ["pins", "accent"], fit: "path" }).fit, ["pins", "accent"]);
  assert.deepEqual(lensOf(redesign, { focus: "tokens", fit: "path" }).fit, ["tokens"]);
  assert.equal(lensOf(redesign, { fit: "area" }).fit, "area");
  assert.deepEqual(lensOf(redesign, { fit: "accent" }).fit, ["accent"]);
  assert.equal(lensOf(redesign, { fit: "ghost" }).fit, null);
});

test("the hand wins: a click of the person's is the pick and lifts the lens's dimming; the marks stay", () => {
  const l = lensOf(redesign, { path: ["pins", "accent"], focus: "pins", mark: { tokens: "keep" } });
  assert.deepEqual(tileLook("tokens", l, null), { sel: false, dim: true, num: null, mark: "keep" });
  assert.deepEqual(tileLook("accent", l, null), { sel: false, dim: false, num: 2, mark: null });
  assert.deepEqual(tileLook("pins", l, null), { sel: true, dim: false, num: 1, mark: null });
  assert.deepEqual(tileLook("tokens", l, "tokens"), { sel: true, dim: false, num: null, mark: "keep" });
  assert.deepEqual(tileLook("pins", l, "tokens"), { sel: false, dim: false, num: null, mark: null });
});

test("the camera fits the boxes inside the block, under the strip, within its zoom limits", () => {
  const c = fitCam([{ x: 0, y: 0, w: 200, h: 100 }, { x: 400, y: 300, w: 200, h: 100 }], 1000, 600, 92, 40)!;
  // the boxes' middle (300, 200) lands at the room's middle
  assert.ok(Math.abs(c.x + 300 * c.k - 500) < 1e-9);
  assert.ok(Math.abs(c.y + 200 * c.k - (92 + 40 + (600 - 92 - 80) / 2)) < 1e-9);
  assert.ok(c.k <= 1.4 && c.k >= 0.25);
  assert.equal(fitCam([{ x: 0, y: 0, w: 10, h: 10 }], 1000, 600)!.k, 1.4);
  assert.equal(fitCam([], 1000, 600), null);
});

test("a step press says which block and which step, never past the ends", () => {
  assert.equal(stepWords("design/redesign", [2, 4], 1), "→ On the system block of design/redesign: take me to step 3 of 4 (from 2).");
  assert.match(stepWords("design/redesign", [1, 4], -1), /step 1 of 4/);
  assert.match(stepWords("design/redesign", [4, 4], 1), /step 4 of 4/);
});

test("the window view: a surface on its region, the rest beside the window, a region with no record drawn empty", () => {
  const w = windowLayout(redesign);
  const b = REGIONS.find((r) => r.id === "product/buttons")!;
  assert.deepEqual(w.boxes.get("product/buttons"), { x: w.win.x + b.at.x * WIN_K, y: w.win.y + b.at.y * WIN_K, w: b.at.w * WIN_K, h: b.at.h * WIN_K });
  assert.deepEqual([...w.beside.keys()], ["pins", "accent", "tokens"]);
  for (const bx of w.beside.values()) assert.ok(bx.x + bx.w < w.win.x, "beside sits left of the window");
  assert.equal(w.regions.find((r) => r.id === "product/build/talk")!.drawn, false);
  assert.equal(w.boxes.has("product/build/talk"), false);
  // a region stands inside the window, at the window's scale
  const composer = w.regions.find((r) => r.id === "product/build/composer")!.box;
  assert.ok(composer.y > w.win.y && composer.y + composer.h <= w.win.y + w.win.h);
  // many beside: more columns, the window moves right, nothing overlaps
  const many = windowLayout(view(Array.from({ length: 20 }, (_, i) => tile(`r${i}`, "rules"))));
  const xs = new Set([...many.beside.values()].map((x) => x.x));
  assert.ok(xs.size >= 2);
  const all = [...many.beside.values()];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const p = all[i], q = all[j];
    assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, "beside tiles never overlap");
  }
  assert.match(windowWire({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 10, w: 80, h: 200 }), /^M100,25 C/);
});

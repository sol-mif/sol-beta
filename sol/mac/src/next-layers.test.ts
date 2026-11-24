// node --test src/*.test.ts: the window's layers (BR1 root part 1, #1615; next/layers.ts, mine/look/br1/strategy/root.html).
// Four layers are the only stacking values in the new face: a raw z-index anywhere in next/ fails here. place() puts a
// pop-up beside its anchor inside the canvas, on the preferred side when it fits, never over the frame. The rooms are
// the canvas of three invented people's windows: Denise on a 1440 laptop, Dev on a 2560 screen, Lucy on a narrow window.
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYERS, Z, layerVars, place, type Rect } from "./next/layers.ts";

const NEXT = join(dirname(fileURLToPath(import.meta.url)), "next");
// the canvas (#view less the bottom bar's band) at each window: the sidebar's 264 and the top bar's 48 are outside it
const DENISE: Rect = { x: 264, y: 88, w: 1176, h: 660 };
const DEV: Rect = { x: 264, y: 88, w: 2296, h: 1240 };
const LUCY: Rect = { x: 264, y: 88, w: 560, h: 520 };
const inside = (r: Rect, room: Rect) => r.x >= room.x && r.y >= room.y && r.x + r.w <= room.x + room.w && r.y + r.h <= room.y + room.h;

test("four layers, bottom to top, and .nx carries them as variables", () => {
  assert.deepEqual([...LAYERS], ["canvas", "pieces", "popups", "frame"]);
  assert.ok(Z.canvas < Z.pieces && Z.pieces < Z.popups && Z.popups < Z.frame);
  const v = layerVars as unknown as Record<string, number>;
  for (const l of LAYERS) assert.equal(v[`--z-${l}`], Z[l]);
});

test("Denise: a menu under its button when it fits; above it near the foot", () => {
  const btn = { x: 600, y: 200, w: 24, h: 24 }, menu = { w: 232, h: 210 };
  const a = place(btn, menu, DENISE);
  assert.equal(a.side, "below");
  assert.deepEqual([a.x, a.y], [600, 232]);
  const low = place({ ...btn, y: 640 }, menu, DENISE);
  assert.equal(low.side, "above");
  assert.equal(low.y + low.h, 640 - 8);
  assert.ok(inside(low, DENISE));
});

test("Denise: a piece's ⋯ menu lines its right edge up with the button's, over its own piece, not the card beside it (BR1 conform 5)", () => {
  // a folder card 212 wide at x 687, its ⋯ at its top right; the next card starts at 921
  const btn = { x: 875, y: 165, w: 24, h: 18 }, menu = { w: 232, h: 160 }, next = 921;
  const e = place(btn, menu, DENISE, "below", 8, "end");
  assert.equal(e.side, "below");
  assert.equal(e.x + e.w, btn.x + btn.w, "its right edge is the button's");
  assert.ok(e.x + e.w <= next, "it ends before the next card");
  assert.ok(place(btn, menu, DENISE).x + menu.w > next, "lined up on the left, it ran over the next card");
  const edge = place({ x: 290, y: 165, w: 24, h: 18 }, menu, DENISE, "below", 8, "end");
  assert.ok(inside(edge, DENISE), "near the canvas's left edge it is held inside");
});

test("Denise: a folder's contents card on its right, and on its left near the right edge", () => {
  const card = { w: 320, h: 300 };
  const r = place({ x: 400, y: 160, w: 240, h: 160 }, card, DENISE, "right", 0);
  assert.equal(r.side, "right");
  assert.equal(r.x, 640);
  const l = place({ x: 1180, y: 160, w: 240, h: 160 }, card, DENISE, "right", 0);
  assert.equal(l.side, "left");
  assert.equal(l.x + l.w, 1180);
  assert.ok(inside(l, DENISE));
});

test("Dev: the same moves on a big screen keep the preferred side and never leave the canvas", () => {
  for (const [x, y] of [[300, 100], [2400, 1200], [1300, 700], [2500, 120]]) {
    const p = place({ x, y, w: 24, h: 24 }, { w: 340, h: 420 }, DEV);
    assert.ok(inside(p, DEV), `at ${x},${y}: ${JSON.stringify(p)}`);
  }
  assert.equal(place({ x: 300, y: 100, w: 24, h: 24 }, { w: 340, h: 420 }, DEV).side, "below");
});

test("Lucy: no side fits a tall card, so it takes the side with most room and is held inside", () => {
  const p = place({ x: 500, y: 300, w: 200, h: 120 }, { w: 320, h: 600 }, LUCY, "right");
  assert.ok(inside(p, LUCY), JSON.stringify(p));
  assert.equal(p.h, LUCY.h, "taller than the canvas: as tall as the canvas, the card scrolls inside");
  assert.equal(p.side, "left", "left of the anchor has 236, right 124, above 212, below 188");
});

test("a pop-up never covers the frame: its box stays right of the sidebar and above the bottom bar", () => {
  const p = place({ x: 270, y: 700, w: 24, h: 24 }, { w: 300, h: 200 }, DENISE, "left");
  assert.ok(p.x >= DENISE.x && p.y + p.h <= DENISE.y + DENISE.h, JSON.stringify(p));
});

// ---------------------------------------------------------------- the lint: one home for stacking

const files: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(css|tsx?)$/.test(n) && !/\.test\./.test(n)) files.push(p); } };
walk(NEXT);
// `auto` is no layer at all: a reset that undoes a global class's number (you.css's first rule) is allowed
const RAW_CSS = /z-index\s*:(?!\s*(var\(--z-(canvas|pieces|popups|frame|lift)\)|auto\s*[;}\n]))[^;}\n]+/g;
const RAW_TS = /zIndex\s*:(?!\s*["'`]var\(--z-(canvas|pieces|popups|frame|lift)\)["'`])[^,}\n]+/g;
const raw = (t: string, css: boolean) => [...t.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(css ? RAW_CSS : RAW_TS)].map((m) => m[0]);

test("no raw stacking number anywhere in next/: every z-index is one of the four layers or a lift", () => {
  const out = files.flatMap((f) => raw(readFileSync(f, "utf8"), f.endsWith(".css")).map((m) => `${relative(NEXT, f)}: ${m}`));
  assert.deepEqual(out, []);
});

test("the lint bites", () => {
  assert.deepEqual(raw(".a { z-index: 30; }", true), ["z-index: 30"]);
  assert.deepEqual(raw(".a { z-index:  var(--z-frame) }", true), []);
  assert.deepEqual(raw(".a { z-index: var(--z-frame); }", true), []);
  assert.deepEqual(raw("{ zIndex: 2 }", false), ["zIndex: 2 "]);
  assert.deepEqual(raw('{ zIndex: "var(--z-lift)" }', false), []);
  assert.deepEqual(raw(".a{position:static;z-index:auto;left:auto}", true), []);
  assert.deepEqual(raw(".a { z-index: auto }", true), []);
  assert.deepEqual(raw(".a { z-index: autox; }", true), ["z-index: autox"]);
  assert.deepEqual(raw(".a { z-index: 0 }", true), ["z-index: 0 "]);
});

test("the old floating surfaces are gone: no toast, no float line, no flip classes", () => {
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  for (const gone of ["nx-toast", "bar-float", "nt-said", "fo-flip", "pc-up", "PEEK_W", "MENU_W"]) assert.ok(!all.includes(gone), gone);
});

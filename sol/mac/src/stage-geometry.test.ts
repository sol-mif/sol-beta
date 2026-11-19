// node --test src/*.test.ts (npm test here): the whole stage's geometry (#772, stage/geometry.ts), feel.md's
// "Distances", "The rules" and "Order" 2: the magnet and its pull, the landing, the free spot, the plan on release,
// the compose, trade, reading order, and the undo snapshot and stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAD, GAP, GRID, REACH, CAPTURE, pull, magnet, candsX, snapAt, landing, freeSpot, overlaps, inside, plan, placeNew,
  trade, tradeTarget, readingOrder, snapshot, record, undo, redo, EMPTY_UNDO, UNDO_CAP, type Placed, type Room,
} from "./stage/geometry.ts";
import { whole } from "./stage/model.ts";

const room: Room = { w: 1000, h: 600 };
const R = (x: number, y: number, w = 200, h = 120) => ({ x, y, w, h });
const P = (id: string, r: ReturnType<typeof R>, touched = 0, hand = false, born = 0): Placed => ({ id, r, touched, hand, born });

test("the numbers are feel.md's: pad 16, gap 12, grid 8, reach 16, capture 6", () => {
  assert.deepEqual([PAD, GAP, GRID, REACH, CAPTURE], [16, 12, 8, 16, 6]);
  assert.equal(whole.REACH, 16);   // model.ts carries the seam (B9)
});

test("the pull: full inside capture, none at reach, ((reach − d)/(reach − capture))² between, continuous", () => {
  assert.equal(pull(0), 1);
  assert.equal(pull(6), 1);
  assert.equal(pull(-6), 1);
  assert.equal(pull(16), 0);
  assert.equal(pull(30), 0);
  assert.equal(pull(11), 0.25);
  for (let d = 0; d < 20; d += 0.25) assert.ok(Math.abs(pull(d + 0.01) - pull(d)) < 0.01, `no jump at ${d}`);
});

test("the magnet takes the nearest candidate, not the first, and moves the block continuously", () => {
  const s = magnet(100, [{ t: 110, line: 110 }, { t: 103, line: 103 }]);
  assert.equal(s.t, 103);
  assert.equal(s.v, 103);   // 3 px is inside capture: on the target
  const far = magnet(100, [{ t: 120, line: 120 }]);
  assert.deepEqual([far.v, far.f], [100, 0]);   // outside reach: the hand exactly
  const mid = magnet(100, [{ t: 111, line: 111 }]);
  assert.equal(mid.f, 0.25);
  assert.equal(mid.v, 100 + 11 * 0.25);
  let prev = magnet(80, [{ t: 100, line: 100 }]).v;
  for (let p = 80; p <= 100; p += 0.5) { const v = magnet(p, [{ t: 100, line: 100 }]).v; assert.ok(v >= prev - 1e-9 && v - prev < 3, `smooth at ${p}`); prev = v; }
});

test("the x targets: the pad, each edge, each edge plus the gap, same-edge alignment", () => {
  const ts = candsX(room, 200, [R(400, 16)]).map((c) => c.t).sort((a, b) => a - b);
  assert.deepEqual(ts, [16, 188, 400, 400, 612, 784]);
});

test("a visible guide is a promise: it lands on it; with none, on the grid of 8", () => {
  const others = [R(16, 16)];
  const me = R(16 + 200 + 12 + 4, 21);   // 4 px right of edge+gap, 5 px below the pad
  const shown = snapAt(room, me, me.x, me.y, others);
  assert.ok(shown.x.f > 0 && shown.y.f > 0);
  assert.deepEqual(landing(room, me, others, shown).r, R(228, 16));
  const free = R(503, 301);
  assert.deepEqual(landing(room, free, [], snapAt(room, free, free.x, free.y, [])).r, R(504, 304));
});

test("a flick projects v × 0.1 s, then snaps or grids, clamped onto the stage, and glides", () => {
  const me = R(300, 200);
  const l = landing(room, me, [], snapAt(room, me, 300, 200, []), { x: 1000, y: 0 });
  assert.equal(l.glide, true);
  assert.deepEqual(l.r, R(400, 200));
  const out = landing(room, me, [], snapAt(room, me, 300, 200, []), { x: 9000, y: 0 });
  assert.equal(out.r.x, room.w - PAD - 200);
  assert.equal(landing(room, me, [], snapAt(room, me, 300, 200, []), { x: 400, y: 0 }).glide, false);   // under 500 px/s
});

test("the free spot: none overlapping, on the stage; near a rect, right or down first; with no near, reading order", () => {
  const others = [R(16, 16), R(400, 16)];
  const first = freeSpot(room, 200, 120, others)!;
  assert.ok(inside(room, first) && others.every((o) => !overlaps(first, o)));
  assert.deepEqual([first.y, first.x], [16, 612]);   // top row first, then the leftmost place in it
  const near = freeSpot(room, 200, 120, [R(300, 200)], { x: 300, y: 200 })!;
  assert.ok(near.x >= 300 || near.y >= 200, "steps right or down");
  assert.equal(freeSpot({ w: 300, h: 200 }, 200, 120, [R(16, 16)]), null);
});

test("the plan: what the drop covers steps aside right or down; what it does not cover never moves", () => {
  const a = P("a", R(16, 16)), b = P("b", R(400, 16)), c = P("c", R(16, 300));
  const p = plan(room, [a, b, c], new Map([["a", R(400, 16)]]));
  assert.deepEqual(p.fold, []);
  assert.deepEqual(p.out.get("a"), R(400, 16));
  const nb = p.out.get("b")!;
  assert.ok(nb.x > 400 || nb.y > 16, "b stepped right or down");
  assert.ok(!overlaps(nb, R(400, 16)));
  assert.equal(p.out.has("c"), false);   // c was not covered: it does not move
});

test("overflow folds the oldest untouched, never a hand-placed one; if every block is hand-placed, it waits", () => {
  const small: Room = { w: 2 * 200 + GAP + 2 * PAD, h: 120 + PAD };   // room for exactly two blocks
  const old = P("old", R(16, 16), 1), hand = P("hand", R(228, 16), 0, true), moved = P("moved", R(16, 16), 5);
  // the hand drops "moved" on the left slot over "old": old has nowhere to go and folds
  let p = plan(small, [old, { ...hand }, moved], new Map([["moved", R(16, 16)]]));
  assert.deepEqual(p.fold, ["old"]);
  assert.deepEqual(p.wait, []);
  // the hand drops on the hand-placed one's slot: it is never folded; the oldest untouched elsewhere goes and it steps in
  p = plan(small, [P("x", R(16, 16), 1), P("h", R(228, 16), 9, true), P("m", R(500, 500), 5)], new Map([["m", R(228, 16)]]));
  assert.deepEqual(p.fold, ["x"]);
  assert.deepEqual(p.out.get("h"), R(16, 16));
  // every block hand-placed: the covered one waits in the tray, nothing folds
  p = plan(small, [P("h1", R(16, 16), 1, true), P("h2", R(228, 16), 2, true), P("m", R(500, 500), 5, true)], new Map([["m", R(228, 16)]]));
  assert.deepEqual(p.fold, []);
  assert.deepEqual(p.wait, ["h2"]);
});

test("every block untouched: the oldest born folds, whatever the list's order (plan and compose)", () => {
  const small: Room = { w: 2 * 200 + GAP + 2 * PAD, h: 120 + PAD };   // room for exactly two blocks
  // three agent blocks, none touched; the hand drops the newest onto the newer one's slot: the oldest folds
  const a = P("a", R(16, 16), 0, false, 1), b = P("b", R(228, 16), 0, false, 2), c = P("c", R(500, 500), 0, false, 3);
  for (const order of [[a, b, c], [c, b, a], [b, c, a]]) {
    const p = plan(small, order, new Map([["c", R(228, 16)]]));
    assert.deepEqual(p.fold, ["a"]);
    assert.deepEqual(p.out.get("b"), R(16, 16));
  }
  // the compose, given the blocks in reading order or reversed: the oldest born folds, not the top-left one
  for (const order of [[P("x", R(16, 16), 0, false, 7), P("y", R(228, 16), 0, false, 4)], [P("y", R(228, 16), 0, false, 4), P("x", R(16, 16), 0, false, 7)]]) {
    const n = placeNew(small, 200, 120, order);
    assert.deepEqual(n.fold, ["y"]);
    assert.deepEqual(n.r, R(228, 16));
  }
});

test("the compose: the first free place in reading order; none, the oldest untouched folds; all hand-placed, it waits", () => {
  const small: Room = { w: 2 * 200 + GAP + 2 * PAD, h: 120 + PAD };
  assert.deepEqual(placeNew(small, 200, 120, [P("a", R(16, 16))]).r, R(228, 16));
  const full = placeNew(small, 200, 120, [P("a", R(16, 16), 3), P("b", R(228, 16), 1)]);
  assert.deepEqual(full.fold, ["b"]);
  assert.deepEqual(full.r, R(228, 16));
  const hand = placeNew(small, 200, 120, [P("a", R(16, 16), 3, true), P("b", R(228, 16), 1, true)]);
  assert.deepEqual(hand, { r: null, fold: [] });
});

test("trade swaps slot and size: each takes the other's place; nothing else moves", () => {
  const t = trade({ id: "a", from: R(16, 16, 200, 120) }, { id: "b", r: R(400, 16, 300, 240) });
  assert.deepEqual(t.get("a"), R(400, 16, 300, 240));
  assert.deepEqual(t.get("b"), R(16, 16, 200, 120));
  assert.equal(t.size, 2);
  const blocks = [P("a", R(16, 16)), P("b", R(400, 16))];
  assert.equal(tradeTarget(blocks, "a", { x: 450, y: 50 })?.id, "b");
  assert.equal(tradeTarget(blocks, "a", { x: 50, y: 50 }), null);   // over itself is no trade
});

test("reading order: tops within 24 px are one row, left to right; then the next row", () => {
  const order = readingOrder([P("c", R(16, 200)), P("b", R(400, 20)), P("a", R(16, 40)), P("d", R(400, 190))]).map((b) => b.id);
  assert.deepEqual(order, ["a", "b", "c", "d"]);
  assert.deepEqual(readingOrder([P("y", R(16, 30)), P("x", R(400, 6))]).map((b) => b.id), ["x", "y"]);   // 24 apart: two rows
});

test("the undo snapshot and stack: before and after, capped at 64, a new verb clears redo, nudges within 800 ms join", () => {
  const s0 = snapshot([{ id: "a", r: R(16, 16), state: "live" }]);
  const s1 = snapshot([{ id: "a", r: R(400, 16), state: "live" }]);
  const s2 = snapshot([{ id: "a", r: R(400, 16), folded: true, state: "live", versions: 2 }]);
  assert.deepEqual(s2.a, { r: R(400, 16), folded: true, closed: false, state: "live", versions: 2 });
  let u = record(EMPTY_UNDO, "move", 0, s0, s1);
  u = record(u, "fold", 10, s1, s2);
  const z = undo(u)!;
  assert.deepEqual([z.verb, z.to], ["fold", s1]);
  const zz = undo(z.u)!;
  assert.deepEqual(zz.to, s0);
  const y = redo(zz.u)!;
  assert.deepEqual([y.verb, y.to], ["move", s1]);
  assert.equal(record(y.u, "close", 20, s1, s0).redo.length, 0);
  assert.equal(undo(EMPTY_UNDO), null);
  let n = record(EMPTY_UNDO, "nudge", 0, s0, s1);
  n = record(n, "nudge", 700, s1, s2);
  assert.equal(n.undo.length, 1);
  assert.deepEqual([n.undo[0].before, n.undo[0].after], [s0, s2]);
  assert.equal(record(n, "nudge", 1600, s2, s0).undo.length, 2);
  let big = EMPTY_UNDO;
  for (let i = 0; i < 70; i++) big = record(big, "move", i * 1000, s0, s1);
  assert.equal(big.undo.length, UNDO_CAP);
  assert.equal(big.undo[0].at, 6000);
});

// #1001: a block fitted to its content with no free place at its new size used to be kept where it was at the full
// height (clampIn), over the block under it (walked: seven blocks asked, the stills over the table's head)
import { fitGrow, overlaps as hits, inside as within_ } from "./stage/geometry.ts";
test("a fitted block with no free place grows only as far as its neighbour, never over it (#1001)", () => {
  const room = { w: 640, h: 700 };
  const q = { x: 16, y: 16, w: 608, h: 200 }, below = { x: 16, y: 300, w: 608, h: 388 };
  const r = fitGrow(room, q, 420, [below]);
  assert.ok(!hits(r, below), `it covers the block under it: ${JSON.stringify(r)}`);
  assert.ok(within_(room, r));
  assert.equal(r.y, 16); assert.equal(r.h, 300 - 12 - 16);   // up to the gap above its neighbour
  // free room where it is: it simply grows
  assert.deepEqual(fitGrow(room, q, 260, [below]), { ...q, h: 260 });
  // already over another (laid so by hand): left as it is
  const over = { x: 16, y: 250, w: 300, h: 100 };
  assert.deepEqual(fitGrow(room, { x: 16, y: 200, w: 300, h: 100 }, 400, [over, { x: 328, y: 16, w: 296, h: 680 }]), { x: 16, y: 200, w: 300, h: 100 });
});

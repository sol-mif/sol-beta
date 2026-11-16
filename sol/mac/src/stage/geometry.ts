// The whole stage's geometry (#772, #751 Part B slice 9): build/feel.md's "Distances", "The rules" and "Order" 2 as pure
// functions. The nearest-candidate magnet with its continuous pull, the free spot, the plan on release (step aside right
// or down; overflow folds the oldest untouched, never a hand-placed one), trade as a slot-and-size swap, reading order,
// the landing (a visible guide is a promise, else the grid), and the undo snapshot and its stack. No DOM, no React, no
// clock: the face's tests run them (src/stage-geometry.test.ts). For the stage behind `stage.whole` (flag.ts); today's
// stage keeps model.ts's own numbers and nothing here reaches it. The numbers are feel.md's, named as there.
import type { Rect } from "./model.ts";

/** feel.md "Distances": stage.pad / gap / grid; snap.reach / snap.capture; block.min; flick */
export const PAD = 16, GAP = 12, GRID = 8;
export const REACH = 16, CAPTURE = 6;
export const BLOCK_MIN = { w: 200, h: 120 } as const;
export const FLICK = { speed: 500, project: 0.1 } as const;
/** feel.md "reading order": tops within 24 px are one row */
export const ROW = 24;
/** feel.md "undo stack": capped at 64; nudges within 800 ms are one entry */
export const UNDO_CAP = 64, NUDGE_JOIN = 800;

/** the room the stage lays blocks in: its width, its floor (the tray's line, the caller's), and the talk's share at
 *  its left when the talk is docked there (model.ts's `left`) */
export type Room = { w: number; h: number; left?: number };
const lo = (room: Room) => PAD + (room.left ?? 0);

/** a and b closer than the gap (feel.html `ov`; the half pixel forgives rounding) */
export function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.w + GAP <= b.x + 0.5 || b.x + b.w + GAP <= a.x + 0.5 || a.y + a.h + GAP <= b.y + 0.5 || b.y + b.h + GAP <= a.y + 0.5);
}
/** #891, behind the switches: the blocks drawn solid, so none reads through another: every one while a block is
 *  dragged, else those whose boxes truly cross another's (touching edges do not); at rest and apart they stay glass (pure) */
export function drawnSolid(boxes: { id: string; r: Rect }[], dragging: boolean): Set<string> {
  if (dragging) return new Set(boxes.map((b) => b.id));
  const cross = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  return new Set(boxes.filter((a) => boxes.some((b) => b.id !== a.id && cross(a.r, b.r))).map((b) => b.id));
}
/** wholly on the stage, pad in from every edge */
export function inside(room: Room, r: Rect): boolean {
  return r.x >= lo(room) - 0.5 && r.y >= PAD - 0.5 && r.x + r.w <= room.w - PAD + 0.5 && r.y + r.h <= room.h + 0.5;
}
/** a rect moved wholly onto the stage (its size kept) */
export function clampIn(room: Room, r: Rect): Rect {
  return { ...r, x: Math.max(lo(room), Math.min(r.x, room.w - PAD - r.w)), y: Math.max(PAD, Math.min(r.y, room.h - r.h)) };
}
export const toGrid = (v: number) => Math.round(v / GRID) * GRID;

// ── the magnet ──────────────────────────────────────────────────────────────────────────────────────────────────
/** a snap target on one axis: where the block's near edge goes (t) and the line its guide is drawn on */
export type Cand = { t: number; line: number };
/** how hard the target pulls at distance d: 1 inside capture, 0 at reach and beyond, ((reach − d) / (reach − capture))²
 *  between: continuous, so the block never jumps */
export const pull = (d: number): number => {
  const a = Math.abs(d);
  return a <= CAPTURE ? 1 : a >= REACH ? 0 : ((REACH - a) / (REACH - CAPTURE)) ** 2;
};
/** one axis's snap: the nearest candidate wins (never the first in the list); the shown position is pulled toward it by
 *  `pull`, so the shown offset from the hand grows continuously and stays inside reach. f is the pull (the guide's
 *  opacity follows it); t and line are the target's when f > 0 */
export type Snap = { v: number; f: number; d: number; t?: number; line?: number };
export function magnet(pos: number, cands: Cand[]): Snap {
  let best: (Cand & { d: number }) | null = null;
  for (const c of cands) { const d = c.t - pos; if (!best || Math.abs(d) < Math.abs(best.d)) best = { ...c, d }; }
  if (!best || Math.abs(best.d) >= REACH) return { v: pos, f: 0, d: 0 };
  const f = pull(best.d);
  return { v: pos + best.d * f, f, d: best.d, t: best.t, line: best.line };
}
/** the x targets for a w-wide block: the stage's pad, each other block's edges, each edge plus the gap, and the same-edge
 *  alignments (left to left, right to right) */
export function candsX(room: Room, w: number, others: Rect[]): Cand[] {
  const c: Cand[] = [{ t: lo(room), line: lo(room) }, { t: room.w - PAD - w, line: room.w - PAD }];
  for (const o of others) c.push({ t: o.x, line: o.x }, { t: o.x + o.w - w, line: o.x + o.w }, { t: o.x + o.w + GAP, line: o.x + o.w + GAP }, { t: o.x - GAP - w, line: o.x - GAP });
  return c;
}
/** the y targets for an h-tall block, as candsX's; the bottom one is the floor */
export function candsY(room: Room, h: number, others: Rect[]): Cand[] {
  const c: Cand[] = [{ t: PAD, line: PAD }, { t: room.h - h, line: room.h }];
  for (const o of others) c.push({ t: o.y, line: o.y }, { t: o.y + o.h - h, line: o.y + o.h }, { t: o.y + o.h + GAP, line: o.y + o.h + GAP }, { t: o.y - GAP - h, line: o.y - GAP });
  return c;
}
/** both axes at once, for a block whose near corner the hand has at (x, y) */
export function snapAt(room: Room, me: { w: number; h: number }, x: number, y: number, others: Rect[]): { x: Snap; y: Snap } {
  return { x: magnet(x, candsX(room, me.w, others)), y: magnet(y, candsY(room, me.h, others)) };
}

/** where a released block lands (rule 4): on the target of any guide that shows (pull > 0), else on the grid of 8; a flick
 *  (over FLICK.speed px/s) first projects v × FLICK.project, then snaps by reach or the grid. Clamped onto the stage.
 *  glide says the flick's landing (spring.glide) rather than spring.settle */
export function landing(room: Room, me: Rect, others: Rect[], shown: { x: Snap; y: Snap }, v?: { x: number; y: number }): { r: Rect; glide: boolean } {
  let x: number, y: number, glide = false;
  if (v && Math.hypot(v.x, v.y) > FLICK.speed) {
    const s = snapAt(room, me, me.x + v.x * FLICK.project, me.y + v.y * FLICK.project, others);
    x = s.x.f > 0 ? s.x.t! : toGrid(me.x + v.x * FLICK.project);
    y = s.y.f > 0 ? s.y.t! : toGrid(me.y + v.y * FLICK.project);
    glide = true;
  } else {
    x = shown.x.f > 0 ? shown.x.t! : toGrid(me.x);
    y = shown.y.f > 0 ? shown.y.t! : toGrid(me.y);
  }
  return { r: clampIn(room, { x, y, w: me.w, h: me.h }), glide };
}

// ── places ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** the free place for a w × h block among others, from the targets the magnet knows (pad, edges, edge + gap). Near a
 *  rect: the closest, right or down first (a step up or left costs half again). With no near: the first in reading
 *  order (top first, then left). null when there is none */
export function freeSpot(room: Room, w: number, h: number, others: Rect[], near?: { x: number; y: number }): Rect | null {
  const xs = new Set([lo(room), room.w - PAD - w]), ys = new Set([PAD, room.h - h]);
  for (const o of others) { xs.add(o.x); xs.add(o.x + o.w + GAP); xs.add(o.x + o.w - w); xs.add(o.x - GAP - w); ys.add(o.y); ys.add(o.y + o.h + GAP); ys.add(o.y - GAP - h); }
  let best: Rect | null = null, bd = Infinity;
  for (const x of xs) for (const y of ys) {
    const r = { x, y, w, h };
    if (!inside(room, r) || others.some((o) => overlaps(r, o))) continue;
    let d: number;
    if (near) { const dx = x - near.x, dy = y - near.y; d = Math.abs(dx) + Math.abs(dy) + (dx < 0 ? 0.5 * -dx : 0) + (dy < 0 ? 0.5 * -dy : 0); }
    else d = y * 1e6 + x;   // reading order, strictly: the topmost place, then the leftmost in it (feel.html weighted y × 4)
    if (d < bd || (d === bd && best && (y < best.y || (y === best.y && x < best.x)))) { bd = d; best = r; }
  }
  return best;
}

/** a block on the stage as the plan sees it: where it is, when the hand last touched it (0: never), when it was born (its
 *  age: among untouched blocks the oldest folds first), and whether the hand placed it (the stage never folds those, rule 2) */
export type Placed = { id: string; r: Rect; touched: number; hand: boolean; born: number };

/** reading order (feel.md "The verbs"): rows by top, a row being the tops within ROW of its first; left to right within a
 *  row. Tab, ⌘1-9 and the numbers on the marks follow it */
export function readingOrder<T extends { r: Rect }>(blocks: T[]): T[] {
  const byTop = blocks.slice().sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
  const rows: T[][] = [];
  for (const b of byTop) {
    const row = rows[rows.length - 1];
    if (row && b.r.y - row[0].r.y < ROW) row.push(b); else rows.push([b]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.r.x - b.r.x));
}

/** the oldest untouched block the stage may fold, among `from`: the least recently touched, and among equals (every
 *  untouched block has touched 0) the earliest born; never a hand-placed one, never one in `keep`. The list's order
 *  never decides */
function foldable(from: Placed[], keep: Set<string>): Placed | null {
  let best: Placed | null = null;
  for (const b of from) {
    if (b.hand || keep.has(b.id)) continue;
    if (!best || b.touched < best.touched || (b.touched === best.touched && b.born < best.born)) best = b;
  }
  return best;
}

/** what the stage does on release (rules 2 and 5): the hand's `fixed` rects stand; every block they now overlap steps
 *  aside to the nearest free place, right or down first; one with no place makes room by folding the oldest untouched
 *  block the stage may fold (itself among them; never a hand-placed one, never a fixed one) and tries again; with
 *  nothing it may fold, the block waits in the tray. Blocks not overlapped never move.
 *  out: every block that moves (and the fixed), fold: the ids the stage folds, wait: the hand-placed ones that wait */
export type Plan = { out: Map<string, Rect>; fold: string[]; wait: string[] };
export function plan(room: Room, blocks: Placed[], fixed: Map<string, Rect>): Plan {
  const out = new Map(fixed), fold: string[] = [], wait: string[] = [];
  const keep = new Set(fixed.keys());
  const stay: Placed[] = [], bad: Placed[] = [];
  for (const b of readingOrder(blocks)) {
    if (fixed.has(b.id)) continue;
    if ([...fixed.values()].some((f) => overlaps(b.r, f))) bad.push(b); else stay.push(b);
  }
  const rects = () => [...fixed.values(), ...stay.map((b) => out.get(b.id) ?? b.r)];
  for (let i = 0; i < bad.length; i++) {
    const b = bad[i];
    for (;;) {
      const s = freeSpot(room, b.r.w, b.r.h, rects(), b.r);
      if (s) { out.set(b.id, s); stay.push(b); break; }
      // no place: the oldest untouched the stage may fold (this block among them) goes; none left, it waits
      const v = foldable([b, ...stay, ...bad.slice(i + 1)], keep);
      if (!v) { wait.push(b.id); break; }
      fold.push(v.id); out.delete(v.id);
      if (v === b) break;
      const si = stay.indexOf(v); if (si >= 0) stay.splice(si, 1);
      const bi = bad.indexOf(v); if (bi > i) bad.splice(bi, 1);
    }
  }
  return { out, fold, wait };
}

/** where the agent's new w × h block goes (rule 2, the compose): the first free place in reading order; with none, the
 *  oldest untouched block folds to make room, again until it fits; with nothing the stage may fold, it waits in the tray */
export function placeNew(room: Room, w: number, h: number, blocks: Placed[]): { r: Rect | null; fold: string[] } {
  const left = blocks.slice(), fold: string[] = [];
  // a block that does not fit the empty stage never will: it waits, and nothing folds for it (#892)
  if (!freeSpot(room, w, h, [])) return { r: null, fold };
  for (;;) {
    const s = freeSpot(room, w, h, left.map((b) => b.r));
    if (s) return { r: s, fold };
    const v = foldable(left, new Set());
    if (!v) return { r: null, fold };
    fold.push(v.id); left.splice(left.indexOf(v), 1);
  }
}

/** rule 5: dropped with the pointer inside another block, each takes the other's slot and size: the hand's block takes the
 *  target's rect, the target takes the rect the hand's block was lifted from. Nothing else moves */
export function trade(hand: { id: string; from: Rect }, target: { id: string; r: Rect }): Map<string, Rect> {
  return new Map([[hand.id, { ...target.r }], [target.id, { ...hand.from }]]);
}
/** the block whose rect holds the pointer, other than the hand's (a trade's target); null when none */
export function tradeTarget<T extends { id: string; r: Rect }>(blocks: T[], handId: string, p: { x: number; y: number }): T | null {
  return blocks.find((o) => o.id !== handId && p.x >= o.r.x && p.x <= o.r.x + o.r.w && p.y >= o.r.y && p.y <= o.r.y + o.r.h) ?? null;
}

// ── undo ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** one block in a snapshot: its rect, folded, closed, state and versions (feel.md "undo stack") */
export type Shot = { r: Rect; folded: boolean; closed: boolean; state: string; versions: number };
export type Snapshot = Record<string, Shot>;
export function snapshot(blocks: { id: string; r: Rect; folded?: boolean; closed?: boolean; state: string; versions?: number }[]): Snapshot {
  const s: Snapshot = {};
  for (const b of blocks) s[b.id] = { r: { ...b.r }, folded: !!b.folded, closed: !!b.closed, state: b.state, versions: b.versions ?? 0 };
  return s;
}
export type Entry = { verb: string; at: number; before: Snapshot; after: Snapshot };
export type Undo = { undo: Entry[]; redo: Entry[] };
export const EMPTY_UNDO: Undo = { undo: [], redo: [] };
/** a hand verb done: pushed, capped at UNDO_CAP (the oldest goes), redo cleared. A nudge within NUDGE_JOIN ms of the last
 *  nudge joins it: one entry, the first's before, this one's after */
export function record(u: Undo, verb: string, at: number, before: Snapshot, after: Snapshot): Undo {
  const last = u.undo[u.undo.length - 1];
  // within NUDGE_JOIN forward in time: a clock set back is no join (#892)
  if (verb === "nudge" && last?.verb === "nudge" && at >= last.at && at - last.at <= NUDGE_JOIN)
    return { undo: [...u.undo.slice(0, -1), { verb, at, before: last.before, after }], redo: [] };
  const undo = [...u.undo, { verb, at, before, after }];
  return { undo: undo.length > UNDO_CAP ? undo.slice(undo.length - UNDO_CAP) : undo, redo: [] };
}
/** ⌘Z: the snapshot to animate to (the last entry's before), or null with nothing to undo */
export function undo(u: Undo): { u: Undo; to: Snapshot; verb: string } | null {
  const e = u.undo[u.undo.length - 1];
  return e ? { u: { undo: u.undo.slice(0, -1), redo: [...u.redo, e] }, to: e.before, verb: e.verb } : null;
}
/** ⇧⌘Z: the snapshot to animate to (the last undone entry's after), or null */
export function redo(u: Undo): { u: Undo; to: Snapshot; verb: string } | null {
  const e = u.redo[u.redo.length - 1];
  return e ? { u: { undo: [...u.undo, e], redo: u.redo.slice(0, -1) }, to: e.after, verb: e.verb } : null;
}

/** #954 (whole.md pain 5, "no re-tiling"): the stage got smaller (the talk, the window). Each block that sticks out moves
 *  in, its size kept, shrunk only where it is wider or taller than the stage; one that then crosses another goes to the
 *  nearest free place for its size; with none, the oldest untouched block folds to the tray (never one the hand placed,
 *  lowest z first). Nothing is ever re-tiled. Null: nothing to do (pure) */
export function fitWhole<P extends Rect & { id: string; z: number; folded?: boolean; popped?: boolean; hand?: boolean }>(room: Room, places: P[]): P[] | null {
  const shown = (p: P) => !p.folded && !p.popped;
  if (!room.w || !room.h || places.filter(shown).every((p) => inside(room, p))) return null;
  let out = places.map((p) => {
    if (!shown(p) || inside(room, p)) return p;
    const w = Math.max(BLOCK_MIN.w, Math.min(p.w, room.w - lo(room) - PAD)), h = Math.max(BLOCK_MIN.h, Math.min(p.h, room.h - PAD));
    return { ...p, ...clampIn(room, { x: p.x, y: p.y, w, h }) };
  });
  // the blocks that moved find room among the others, the topmost (latest z) first; the rest stay where they are
  const movedIds = out.filter((p, i) => p !== places[i]).sort((a, b) => b.z - a.z).map((p) => p.id);
  for (const id of movedIds) {
    const p = out.find((x) => x.id === id)!;
    const others = out.filter((x) => x.id !== id && shown(x));
    if (!others.some((o) => overlaps(p, o))) continue;
    const at = freeSpot(room, p.w, p.h, others, { x: p.x, y: p.y });
    if (at) { out = out.map((x) => (x.id === id ? { ...x, ...at } : x)); continue; }
    // no room for it: the oldest untouched block it crosses folds (it may be itself), never a hand-placed one
    const crossed = [p, ...others.filter((o) => overlaps(p, o))].filter((x) => !x.hand).sort((a, b) => a.z - b.z)[0];
    if (crossed) out = out.map((x) => (x.id === crossed.id ? { ...x, folded: true } : x));
  }
  return out;
}

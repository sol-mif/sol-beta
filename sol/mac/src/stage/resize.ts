// Resize by any edge, with the fit detent (#775, #751 B12), for the stage behind `stage.whole`: build/feel.md
// "Distances" and whole.md "resize" as pure functions. Any edge or corner moves; each moving edge is pulled by the
// magnet to the stage, the other blocks' edges and the gap beside them, and the south edge also to "all of it" (the
// content's height: the fit detent, a click inside snap.reach). Never under block.min (200 × 120). Let go, a visible
// guide is a promise, else the grid. Cut content says "+N lines": a list counts its rows below the fold, any other body
// its lines at the line height. A trackpad pinch resizes from the centre. No DOM, no clock.
import type { Rect } from "./model.ts";
import { BLOCK_MIN, GAP, PAD, magnet, toGrid, type Cand, type Room, type Snap } from "./geometry.ts";
import { LINE, PINCH } from "../kit/feel.ts";

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** the targets one moving edge is pulled to: the stage's pad, each other block's edges and each edge less or plus the gap */
export function edgeCands(lo: number, hi: number, others: Rect[], axis: "x" | "y"): Cand[] {
  const c: Cand[] = [{ t: lo, line: lo }, { t: hi, line: hi }];
  for (const o of others) {
    const a = axis === "x" ? o.x : o.y, b = axis === "x" ? o.x + o.w : o.y + o.h;
    c.push({ t: a, line: a }, { t: b, line: b }, { t: a - GAP, line: a - GAP }, { t: b + GAP, line: b + GAP });
  }
  // #891: a line past the stage's pad is no target; snapped to it, a block was carried past the window
  return c.filter((x) => x.t >= lo - 0.5 && x.t <= hi + 0.5);
}

/** a resize in flight: the rect as shown, each axis's snap (the guide), and whether the south edge sits on "all of it" */
export type Sizing = { r: Rect; sx: Snap | null; sy: Snap | null; fit: boolean };
/** the rect while an edge is pulled d from where it was taken (from). fit: the content's height ("all of it"), or null
 *  when unknown; it is a target for the south edge only */
export function resizeTo(room: Room, from: Rect, edge: Edge, d: { x: number; y: number }, others: Rect[], fit: number | null): Sizing {
  const left = PAD + (room.left ?? 0), right = room.w - PAD, top = PAD, floor = room.h;
  let L = from.x, R = from.x + from.w, T = from.y, B = from.y + from.h;
  if (edge.includes("w")) L += d.x;
  if (edge.includes("e")) R += d.x;
  if (edge.includes("n")) T += d.y;
  if (edge.includes("s")) B += d.y;
  L = Math.max(left, L); R = Math.min(right, R); T = Math.max(top, T); B = Math.min(floor, B);
  let sx: Snap | null = null, sy: Snap | null = null, onFit = false;
  const ex = edgeCands(left, right, others, "x"), ey = edgeCands(top, floor, others, "y");
  if (edge.includes("e")) { sx = magnet(R, ex); R = sx.v; }
  if (edge.includes("w")) { sx = magnet(L, ex); L = sx.v; }
  if (edge.includes("s")) {
    const c = fit !== null && T + fit <= floor ? [...ey, { t: T + fit, line: T + fit }] : ey;
    sy = magnet(B, c); B = sy.v;
    onFit = fit !== null && sy.f > 0 && sy.t === T + fit;
  }
  if (edge.includes("n")) { sy = magnet(T, ey); T = sy.v; }
  if (R - L < BLOCK_MIN.w) { if (edge.includes("w")) L = R - BLOCK_MIN.w; else R = L + BLOCK_MIN.w; }
  if (B - T < BLOCK_MIN.h) { if (edge.includes("n")) T = B - BLOCK_MIN.h; else B = T + BLOCK_MIN.h; }
  return { r: { x: L, y: T, w: R - L, h: B - T }, sx, sy, fit: onFit };
}

/** where a resize lands on release: the moving edges on a guide's target (the fit among them), else on the grid of 8;
 *  never under block.min */
export function resizeEnd(edge: Edge, s: Sizing): Rect {
  const at = (v: number, sn: Snap | null) => (sn && sn.f > 0 ? sn.t! : toGrid(v));
  let L = s.r.x, R = s.r.x + s.r.w, T = s.r.y, B = s.r.y + s.r.h;
  if (edge.includes("e")) R = at(R, s.sx);
  if (edge.includes("w")) L = at(L, s.sx);
  if (edge.includes("s")) B = at(B, s.sy);
  if (edge.includes("n")) T = at(T, s.sy);
  return { x: L, y: T, w: Math.max(BLOCK_MIN.w, R - L), h: Math.max(BLOCK_MIN.h, B - T) };
}

/** what a cut body says: "+N lines". rows: the bottoms of its rows (a list's steps) in the body's own coordinates; with
 *  rows, N is how many end below what shows; without, the hidden height at LINE a line. Under 6 px hidden is not a cut */
export function cutLines(shown: number, content: number, rows: number[] = []): number {
  if (content - shown <= 6) return 0;
  if (rows.length) return rows.filter((b) => b > shown + 1).length;
  return Math.ceil((content - shown) / LINE);
}
export const cutWords = (n: number) => (n > 0 ? `+${n} ${n === 1 ? "line" : "lines"}` : "");

/** a trackpad pinch (ctrl + wheel deltaY): the rect scaled from its centre, never under block.min nor past the stage */
export function pinchRect(room: Room, r: Rect, deltaY: number): Rect {
  const f = Math.exp(-deltaY * PINCH.rate), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const w = Math.max(BLOCK_MIN.w, Math.min(room.w - 2 * PAD - (room.left ?? 0), r.w * f));
  const h = Math.max(BLOCK_MIN.h, Math.min(room.h - PAD, r.h * f));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
/** a pinch at rest: on the grid of 8, wholly on the stage */
export function pinchEnd(room: Room, r: Rect): Rect {
  const w = toGrid(r.w), h = toGrid(r.h), left = PAD + (room.left ?? 0);
  return { x: Math.max(left, Math.min(toGrid(r.x), room.w - PAD - w)), y: Math.max(PAD, Math.min(toGrid(r.y), room.h - h)), w, h };
}

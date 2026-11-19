// The carry's pure rules (#1090, design round 1, lifted from Peek.tsx so the tests reach them): where the peek stands,
// how far a block is over an edge, a flick, half over. Peek.tsx re-exports them as the design wrote them.
import type { Edge } from "./model.ts";

/** what the carrying window says while a block is near or past its seam */
export type Carry = { block: string; title: string; w: number; h: number; y: number; over: number; kind?: string };
export const GHOST_SHOWS = 96;   // px of a ghost that shows at the seam: room for its name
export const FLICK = 1.2;        // px per ms toward the seam, over the carry's last 80 ms

/** where the peek stands in this window: the block's box, pushed out past `edge` by what has not crossed yet (pure) */
export function peekRect(edge: Edge, win: { w: number; h: number }, c: Pick<Carry, "w" | "h" | "y" | "over">): { x: number; y: number; w: number; h: number } {
  const w = Math.min(c.w, win.w * 0.9), h = Math.min(c.h, win.h * 0.9), o = Math.max(0, Math.min(1, c.over));
  const along = (len: number, size: number) => Math.max(0, Math.min(len - size, c.y * len - size / 2));
  if (edge === "left") return { x: -w + o * w, y: along(win.h, h), w, h };
  if (edge === "right") return { x: win.w - o * w, y: along(win.h, h), w, h };
  if (edge === "top") return { x: along(win.w, w), y: -h + o * h, w, h };
  return { x: along(win.w, w), y: win.h - o * h, w, h };
}
/** how much of a block has passed `edge` of the window it is carried in, 0..1 (pure) */
export function overOf(edge: Edge, win: { w: number; h: number }, box: { x: number; y: number; w: number; h: number }): number {
  const past = edge === "right" ? box.x + box.w - win.w : edge === "left" ? -box.x : edge === "bottom" ? box.y + box.h - win.h : -box.y;
  const size = edge === "left" || edge === "right" ? box.w : box.h;
  return Math.max(0, Math.min(1, past / size));
}
/** a flick: the carry's last 80 ms moved toward `edge` faster than FLICK (pure). `trail`: the pointer's last points */
export function flick(edge: Edge, trail: { x: number; y: number; t: number }[]): boolean {
  if (trail.length < 2) return false;
  const b = trail[trail.length - 1], a = trail.find((p) => b.t - p.t <= 80) ?? trail[0];
  const dt = Math.max(1, b.t - a.t), v = edge === "right" ? (b.x - a.x) / dt : edge === "left" ? (a.x - b.x) / dt : edge === "bottom" ? (b.y - a.y) / dt : (a.y - b.y) / dt;
  return v >= FLICK;
}
/** let go with more than half of it past the edge: a throw even where the window fills its screen (pure) */
export const halfOver = (over: number) => over > 0.5;

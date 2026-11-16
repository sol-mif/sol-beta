// The hand on the whole stage (#773, #751 B10): build/feel.md rules 1-5 as pure functions, for drag.ts to drive. The
// threshold that tells a press from a drag; where the block shows under the pointer (pointer − grab, the magnet's pull,
// the rubber band past the stage; never the grid while held); the release speed; the release (trade, or the landing and
// the plan); the clamp on a spring's overshoot; when a block held past the window's edge may pop out. No DOM, no clock.
import type { Rect } from "./model.ts";
import { PAD, landing, plan, snapAt, trade, tradeTarget, type Placed, type Plan, type Room, type Snap } from "./geometry.ts";
import { CLAMP, POP_HOLD, THRESHOLD, TRACK_MS } from "../kit/feel.ts";

export type Pt = { x: number; y: number };

/** below its pointer's threshold a press is a press (tick, pick, select); past it, a drag */
export function pastThreshold(type: string, from: Pt, to: Pt): boolean {
  const t = THRESHOLD[type as keyof typeof THRESHOLD] ?? THRESHOLD.mouse;
  return Math.hypot(to.x - from.x, to.y - from.y) >= t;
}

/** past an edge the block resists and never stops dead: (1 − 1/(d·0.55/dim + 1))·dim */
export const band = (d: number, dim: number) => (1 - 1 / ((d * 0.55) / dim + 1)) * dim;
export function rubber(x: number, lo: number, hi: number, dim: number): number {
  return x < lo ? lo - band(lo - x, dim) : x > hi ? hi + band(x - hi, dim) : x;
}

/** where the held block shows: the pointer less the grab offset, the rubber band past the stage, then the magnet's
 *  continuous pull toward the nearest target (off over another block: that is a trade, no guide). Never the grid */
export type Shown = { x: number; y: number; sx: Snap; sy: Snap; over: string | null };
export function handAt(room: Room, me: { id: string; w: number; h: number }, pointer: Pt, grab: Pt, others: { id: string; r: Rect }[], head = 40): Shown {
  let x = pointer.x - grab.x, y = pointer.y - grab.y;
  x = rubber(x, PAD + (room.left ?? 0) - me.w + 60, room.w - 60, me.w);
  y = rubber(y, 0, room.h - head, me.h);
  const over = tradeTarget(others, me.id, pointer)?.id ?? null;
  if (over) return { x, y, sx: { v: x, f: 0, d: 0 }, sy: { v: y, f: 0, d: 0 }, over };
  const s = snapAt(room, me, x, y, others.map((o) => o.r));
  return { x: s.x.v, y: s.y.v, sx: s.x, sy: s.y, over: null };
}

/** the hand's track: [t ms, x, y]; kept to the last TRACK_MS */
export type Track = [number, number, number][];
export function track(t: Track, at: number, p: Pt): Track {
  const n = [...t, [at, p.x, p.y] as [number, number, number]];
  while (n.length > 2 && at - n[0][0] > TRACK_MS) n.shift();
  return n;
}
/** px/s over the track; still (or one point) is 0 */
export function velocity(t: Track): Pt {
  if (t.length < 2) return { x: 0, y: 0 };
  const a = t[0], b = t[t.length - 1], dt = (b[0] - a[0]) / 1000;
  return dt > 0 ? { x: (b[1] - a[1]) / dt, y: (b[2] - a[2]) / dt } : { x: 0, y: 0 };
}

/** what the release does (rule 5): over another block, a trade (slot and size); else the block lands (a guide's target,
 *  the grid, or a flick's glide) and the plan says where every other block goes, and which fold or wait */
export type Release = { kind: "trade" | "move"; plan: Plan; glide: boolean; at: Rect };
export function release(room: Room, me: Placed & { from: Rect }, shown: Shown, blocks: Placed[], v: Pt): Release {
  if (shown.over) {
    const t = blocks.find((b) => b.id === shown.over)!;
    const out = trade({ id: me.id, from: me.from }, t);
    return { kind: "trade", plan: { out, fold: [], wait: [] }, glide: false, at: out.get(me.id)! };
  }
  const others = blocks.filter((b) => b.id !== me.id);
  const l = landing(room, { x: shown.x, y: shown.y, w: me.r.w, h: me.r.h }, others.map((o) => o.r), { x: shown.sx, y: shown.sy }, v);
  return { kind: "move", plan: plan(room, [...others, { ...me, r: l.r }], new Map([[me.id, l.r]])), glide: l.glide, at: l.r };
}

/** motion.clamp: a position spring past its target by more than CLAMP is held at CLAMP, its speed spent */
export function clampOver(v: number, vel: number, target: number, from: number): { v: number; vel: number } {
  const dir = Math.sign(target - from);
  if (!dir) return { v, vel };
  const over = (v - target) * dir;
  return over > CLAMP ? { v: target + CLAMP * dir, vel: 0 } : { v, vel };
}

/** a block may pop out only after the pointer has stayed past the window's edge POP_HOLD ms; leaving the window alone
 *  does nothing (feel.md pain 11). outSince: when it last went past, null while inside */
export const popArmed = (outSince: number | null, now: number) => outSince !== null && now - outSince >= POP_HOLD;
export const outsideWindow = (win: { w: number; h: number }, p: Pt) => p.x < 0 || p.y < 0 || p.x > win.w || p.y > win.h;

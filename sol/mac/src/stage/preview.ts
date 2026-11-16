// The drop preview (#774, #751 B11), for the stage behind `stage.whole`: build/feel.md rule 1, "nothing moves under the
// hand: what the drop will do shows as dashed pearl outlines and a dimmed trade target, never as motion", and rule 4, "a
// visible guide is a promise". Pure: from where the hand's block shows now, what the release would do (hand.ts), read as
// what to draw: the guides with their opacity (.2 to .55 with the pull), an outline for each other block the drop moves
// (at the place it would go), and the block a trade would dim. Nothing here moves a block. previewPaint.ts draws it.
import type { Rect } from "./model.ts";
import { release, type Shown } from "./hand.ts";
import { GAP, type Placed, type Room, type Snap } from "./geometry.ts";
import { GUIDE, Z } from "../kit/feel.ts";

/** a guide: its line, its opacity, and the span along it (a to b) joining the hand's block to the blocks the line is
 *  theirs (an edge, or an edge and the gap), GUIDE.over past each end; no span (the stage's own pad) is the whole stage */
export type Guide = { line: number; o: number; a?: number; b?: number } | null;
export type Preview = { guides: { v: Guide; h: Guide }; outlines: { id: string; r: Rect }[]; dim: string | null };
export const NO_PREVIEW: Preview = { guides: { v: null, h: null }, outlines: [], dim: null };

/** the guide's opacity: none outside the reach, .2 where the pull starts, .55 once captured */
export const guideOpacity = (f: number) => (f > 0 ? GUIDE.from + (GUIDE.to - GUIDE.from) * Math.min(1, f) : 0);
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
function spanOf(axis: "v" | "h", line: number, me: Rect, others: Rect[]): { a?: number; b?: number } {
  const [p, s, q, t] = axis === "v" ? (["x", "w", "y", "h"] as const) : (["y", "h", "x", "w"] as const);
  const own = others.filter((o) => [o[p], o[p] + o[s]].some((e) => near(e, line) || near(e + GAP, line) || near(e - GAP, line)));
  if (!own.length) return {};
  const all = [me, ...own];
  return { a: Math.min(...all.map((r) => r[q])) - GUIDE.over, b: Math.max(...all.map((r) => r[q] + r[t])) + GUIDE.over };
}
const guide = (axis: "v" | "h", s?: Snap | null, me?: Rect, others: Rect[] = []): Guide => {
  if (!s || !(s.f > 0) || s.line === undefined) return null;
  return { line: s.line, o: guideOpacity(s.f), ...(me ? spanOf(axis, s.line, me, others) : {}) };
};
/** a magnet's two axes as guides: v is the vertical line (x), h the horizontal (y); with the hand's shown rect and the
 *  others, each spans the blocks it joins */
export const guidesOf = (sx?: Snap | null, sy?: Snap | null, me?: Rect, others: Rect[] = []) => ({ v: guide("v", sx, me, others), h: guide("h", sy, me, others) });

const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** what letting go here would do, as a preview (a release with no flick: a flick is known only at the release) */
export function dropPreview(room: Room, me: Placed & { from: Rect }, shown: Shown, blocks: Placed[]): Preview {
  const r = release(room, me, shown, blocks, { x: 0, y: 0 });
  const outlines: Preview["outlines"] = [];
  for (const [id, to] of r.plan.out) {
    if (id === me.id) continue;   // the hand's own block shows where it is; its guide is its promise
    const was = blocks.find((b) => b.id === id)?.r;
    if (was && !same(was, to)) outlines.push({ id, r: { ...to } });
  }
  const at = { x: shown.x, y: shown.y, w: me.r.w, h: me.r.h }, rest = blocks.filter((b) => b.id !== me.id).map((b) => b.r);
  return { guides: r.kind === "trade" ? NO_PREVIEW.guides : guidesOf(shown.sx, shown.sy, at, rest), outlines, dim: r.kind === "trade" ? shown.over : null };
}

/** feel.md "Z-order": the blocks by last touch (their z), ranked 1 to Z.touched; a block that waits for the person sits
 *  above them all at Z.waits, so a block touched later never hides what needs the person (#858 B11-2) */
export function zRanks(places: { id: string; z: number }[], waits: (id: string) => boolean): Map<string, number> {
  const out = new Map<string, number>();
  let i = 0;
  for (const o of [...places].sort((a, c) => a.z - c.z)) out.set(o.id, waits(o.id) ? Z.waits : Math.min(Z.touched, ++i));
  return out;
}

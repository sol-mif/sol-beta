// The seams of one window among any number of screens (#1090, design "MORE THAN TWO", rules 1, 2 and 6). Pure: the
// screens as the OS has them arranged (global px, as model.ts Screen), nothing drawn here. model.ts `facing` answers
// "which one edge faces that screen" for two; these answer it for any number, and for an edge two screens share.
//   seamsOf   every stretch of this screen's edges that another screen touches: one seam each, only that stretch
//   landsOn   the window a carried block lands on: the screen the hand is over when it lets go
//   nextBy    the window past an edge at a point along it (a flick, ⌃⌥ arrow): one screen over
//   leaveBy   the edge to leave by for a window that touches none of mine (a drop on the map, the jelly, a name)
// Two browser windows on one screen report the same rect: seamsOf gives nothing then; keep model.ts edgeToward's rule.
import type { Edge, Screen } from "./model.ts";

export type Other = { win: string; screen: Screen };
/** a seam: the edge it is on, and where along that edge it runs, 0..1 from the edge's top or left end */
export type Stretch = { win: string; edge: Edge; from: number; to: number };

const SLACK = 24;      // px two screens may stand apart, or overlap, and still touch (arrangements are not always exact)
const MIN_FACE = 80;   // px two edges must share to be a seam: a corner that only touches is not one

const cut = (a0: number, a1: number, b0: number, b1: number) => ({ lo: Math.max(a0, b0), hi: Math.min(a1, b1) });

/** every stretch of `me`'s edges that another screen touches, in the order left, right, top, bottom, then along the edge (pure) */
export function seamsOf(me: Screen, others: Other[]): Stretch[] {
  const out: Stretch[] = [];
  for (const o of others) {
    const s = o.screen, v = cut(me.y, me.y + me.h, s.y, s.y + s.h), h = cut(me.x, me.x + me.w, s.x, s.x + s.w);
    const side = (edge: Edge, near: boolean, c: { lo: number; hi: number }, at: number, len: number) => {
      if (near && c.hi - c.lo >= MIN_FACE) out.push({ win: o.win, edge, from: (c.lo - at) / len, to: (c.hi - at) / len });
    };
    side("left", Math.abs(s.x + s.w - me.x) <= SLACK, v, me.y, me.h);
    side("right", Math.abs(s.x - (me.x + me.w)) <= SLACK, v, me.y, me.h);
    side("top", Math.abs(s.y + s.h - me.y) <= SLACK, h, me.x, me.w);
    side("bottom", Math.abs(s.y - (me.y + me.h)) <= SLACK, h, me.x, me.w);
  }
  const rank: Record<Edge, number> = { left: 0, right: 1, top: 2, bottom: 3 };
  return out.sort((a, b) => rank[a.edge] - rank[b.edge] || a.from - b.from);
}

/** the window whose screen holds the global point (x, y): where a carried block lands, however many screens it crossed.
 *  Between two screens (a bezel's gap): the nearest. Null when the point is on my own screen (pure) */
export function landsOn(me: Screen, others: Other[], x: number, y: number): string | null {
  const inside = (s: Screen) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
  if (inside(me)) return null;
  const hit = others.find((o) => inside(o.screen));
  if (hit) return hit.win;
  const far = (s: Screen) => Math.hypot(Math.max(s.x - x, 0, x - (s.x + s.w)), Math.max(s.y - y, 0, y - (s.y + s.h)));
  const near = [...others].sort((a, b) => far(a.screen) - far(b.screen))[0];
  return near && far(near.screen) < far(me) ? near.win : null;
}

/** one screen over: the window past `edge` at `at` (0..1 along it); where no seam is under `at`, the nearest seam on
 *  that edge; none on that edge: null, and the throw springs back (pure) */
export function nextBy(me: Screen, others: Other[], edge: Edge, at: number): string | null {
  const on = seamsOf(me, others).filter((s) => s.edge === edge);
  if (!on.length) return null;
  const gap = (s: Stretch) => (at < s.from ? s.from - at : at > s.to ? at - s.to : 0);
  return on.sort((a, b) => gap(a) - gap(b))[0].win;
}

/** the edge to leave by for a window that touches none of my edges: the side its screen's middle lies on, the longer
 *  way first. The other window uses the same with the two swapped, so what leaves by my right comes in by its left (pure) */
export function leaveBy(me: Screen, to: Screen): Edge {
  const dx = to.x + to.w / 2 - (me.x + me.w / 2), dy = to.y + to.h / 2 - (me.y + me.h / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
}

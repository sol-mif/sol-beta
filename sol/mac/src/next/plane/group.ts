// The infinite canvas, its groups (BR1, #1615; mine/look/br1/three.html "An infinite canvas"): pieces held at their
// smallest size (size.ts) that would overlap on screen join into one labelled group, what needs the person first. The
// group is drawn over them; its label names them whole ("api, web and 3 more · 2 need you", the count in the chip words
// of core.ts needWords, as the gather line and the Diary say it), never a cut name; its press brings the camera to where
// they stand apart (apartZ). It sits beside cull.ts: cull decides how many places draw whole, this only groups the whole
// ones that collide. Not Gather.tsx (E's asks line): that gathers asks; this groups places. Pure: boxes in, groups out.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { TYPE } from "../../kit/tokens.ts";
import { linesOf } from "../form.ts";
import { held, type Kind, type Rect } from "./size.ts";

/** a thing as drawn on screen: its id, its box (px), its name, how many asks it holds, where it stands on the plane */
export type Box = { id: string; r: Rect; name: string; asks: number };
/** a group: its members in order (what needs the person first), the box around them, their asks, its words */
export type Group = { ids: string[]; r: Rect; asks: number; words: string };

/** the space two boxes keep between them on screen, px (the kit's --s2): closer than this, they join */
export const GAP = 8;
/** the label's padding across, px (the fold line's --s3 each side, plane.css .pl-fold) and its most lines */
const PAD_X = 24, LINES = 2;

/** the default order: more asks first, then the plane's reading order (left to right, top to bottom) */
export const byAsks = (a: Box, b: Box) => b.asks - a.asks || Math.round(a.r.x) - Math.round(b.r.x) || a.r.y - b.r.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const near = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
/** the box around some boxes */
export function around(rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

/** the boxes that overlap (or come closer than `gap`), joined through each other into groups of two or more; a box
 *  alone is no group. A grid of cells as big as the biggest box keeps it near one pass, at 2000 things too */
export function group(boxes: Box[], order: (a: Box, b: Box) => number = byAsks, gap = GAP, noun = "folders"): Group[] {
  if (boxes.length < 2) return [];
  const up = boxes.map((_, i) => i);
  const root = (i: number): number => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  const cell = Math.max(1, ...boxes.map((b) => Math.max(b.r.w, b.r.h))) + gap, grid = new Map<string, number[]>();
  boxes.forEach((b, i) => {
    const x0 = Math.floor(b.r.x / cell), x1 = Math.floor((b.r.x + b.r.w + gap) / cell), y0 = Math.floor(b.r.y / cell), y1 = Math.floor((b.r.y + b.r.h + gap) / cell);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = `${cx},${cy}`, here = grid.get(k);
      if (!here) { grid.set(k, [i]); continue; }
      for (const j of here) if (root(i) !== root(j) && near(b.r, boxes[j].r, gap)) up[root(i)] = root(j);
      here.push(i);
    }
  });
  const sets = new Map<number, Box[]>();
  boxes.forEach((b, i) => { const k = root(i), set = sets.get(k); if (set) set.push(b); else sets.set(k, [b]); });
  const groups: Group[] = [];
  for (const bs of sets.values()) {
    if (bs.length < 2) continue;
    bs.sort(order);
    const r = around(bs.map((b) => b.r)), asks = bs.reduce((s, b) => s + b.asks, 0);
    groups.push({ ids: bs.map((b) => b.id), r, asks, words: label(bs.map((b) => b.name), asks, r.w - PAD_X, noun) });
  }
  return groups.sort((a, b) => b.asks - a.asks || a.r.x - b.r.x || a.r.y - b.r.y);
}

/** a group's words: as many names as fit whole in `room` px (at most two lines of the head type), the rest a count,
 *  then its asks. A name is never cut: when not even the first fits, the words are the count alone */
export function label(names: string[], asks: number, room: number, noun = "folders"): string {
  const ask = asks ? ` · ${asks} need${asks === 1 ? "s" : ""} you` : "", size = TYPE.head[0], n = names.length;
  const said = (k: number) => (k === n ? `${names.slice(0, -1).join(", ")} and ${names[n - 1]}` : `${names.slice(0, k).join(", ")} and ${n - k} more`) + ask;
  // up from one name while the words still fit: a room holds a few names, so this stops early at any count
  let best = 0;
  for (let k = 1; k <= n && linesOf(said(k), size, room) <= LINES; k++) best = k;
  if (best) return said(best);
  return `${n} ${noun}${ask}`;
}

/** where a group's members stand apart: the smallest zoom from `z` up, by `step`, at which their boxes, each held at its
 *  size (size.ts), keep `gap` px between them; null when none does by `zmax`. The group's press takes the camera there */
export function apartZ(qs: Rect[], kind: Kind, z: number, zmax: number, step = 1.25, gap = GAP): number | null {
  for (let at = z; at <= zmax * 1.0001; at *= step) {
    const bs = qs.map((q) => held(q, at, kind)), g = gap / at;
    let clear = true;
    for (let i = 0; clear && i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (near(bs[i], bs[j], g)) { clear = false; break; }
    if (clear) return at;
  }
  return null;
}

/** the walk at Far (← →, cv/moves/plane.ts choose): of the plane's n places in order, each one drawn is a stop and a group
 *  is one stop, where its first member stands; `keyOf(i)` names the stop place i is drawn in (null: not drawn). From the
 *  place `cur`, `step` stops on, round the ends; from a place not drawn, the next stop that way */
export function walk(n: number, keyOf: (i: number) => string | null, cur: number, step: number): number {
  const stops: number[] = [], keys: string[] = [], seen = new Set<string>();
  for (let i = 0; i < n; i++) { const k = keyOf(i); if (k != null && !seen.has(k)) { seen.add(k); stops.push(i); keys.push(k); } }
  if (!stops.length || !step) return cur;
  const c = ((cur % n) + n) % n, k = keyOf(c), m = stops.length;
  let at = k != null ? keys.indexOf(k) : -1;
  if (at < 0) { const ahead = stops.findIndex((i) => i > c); at = step > 0 ? (ahead < 0 ? 0 : ahead) - 1 : ahead < 0 ? m : ahead; }
  return stops[(((at + step) % m) + m) % m];
}

// The tray (#739, pain points 4 and 5): the stage's foot, where what is not on the stage waits. A session's stage opens
// with the talk alone; the project's other blocks are reachable here, not present: small outlines, grouped by the
// session that made them, newest first. The stage's own folded blocks sit in front, drawn solid-small. Each is the
// block's frame at 1/6 of its born size with its title clipped in the head: miniatures, never a list of words.
// When the stage overflows, the newcomer never shrinks the others: the oldest untouched block folds here and the
// newcomer takes its spot; a block moved or resized by hand is never folded for room. ⌘Z brings a fold back.
// Pure: no DOM, no React, so the face's tests reach it (src/stage-tray.test.ts).
import { GAP, MIN, PAD, SIZES, free, overlaps, type Kind, type Place, type Rect, type Size, type State } from "./model.ts";

/** one of the project's blocks not on this stage, as the engine's work.stage.get says it (blocks.ts trayOf) */
export type TrayBlock = { id: string; kind: Kind; title: string; state: State; from: string; at: number };
/** a miniature in the tray: its block, whether it is this stage's own (folded, popped) or the project's elsewhere */
export type Mini = { id: string; kind: Kind; title: string; own: boolean; popped?: boolean };
/** a group of miniatures: the stage's own in front (`from` null), then each session that made the rest */
export type Group = { from: string | null; minis: Mini[] };

/** a miniature is the frame at 1/6 */
export const MINI = 1 / 6;
/** a miniature's size: its kind's born size at 1/6, rounded to whole px */
export const miniSize = (kind: Kind): Size => { const [w, h] = SIZES[kind] ?? SIZES.page; return { w: Math.round(w * MINI), h: Math.round(h * MINI) }; };

/** the tray's groups: the stage's own (folded and popped, in the order they were placed) in front, then the project's
 *  other blocks grouped by the session that made them, the session with the newest block first, newest first in each */
export function groups(own: Mini[], others: TrayBlock[]): Group[] {
  const out: Group[] = own.length ? [{ from: null, minis: own }] : [];
  const by = new Map<string, TrayBlock[]>();
  for (const t of [...others].sort((a, b) => b.at - a.at)) { const g = by.get(t.from) ?? []; g.push(t); by.set(t.from, g); }
  for (const [from, ts] of by) out.push({ from, minis: ts.map((t) => ({ id: t.id, kind: t.kind, title: t.title, own: false })) });
  return out;
}

/** how many the tray holds: what its hairline counts */
export const count = (gs: Group[]) => gs.reduce((n, g) => n + g.minis.length, 0);

/** a place on the stage the person's hand has not touched, so room may be made by folding it: shown, not moved or
 *  resized by hand, not popped */
const untouched = (p: Place) => !p.folded && !p.popped && !p.hand;

/** a newcomer of size s placed on a full stage (pure). Its spot is the first free one; when there is none, the oldest
 *  untouched block (the first placed among them) folds to the tray and the newcomer takes its spot: at its born size when
 *  that fits there, else the folded block's own rect (the newcomer fits the spot; the others never shrink). One fold per
 *  newcomer, unless the spot is under the stage's least. `folded` names the blocks folded for it, `before` their places as they were (⌘Z puts them back). When every shown
 *  block was placed by hand, nothing folds and `at` is null: the newcomer itself waits in the tray */
export function makeRoom(stage: Size, s: Size, places: Place[]): { places: Place[]; at: Rect | null; folded: string[]; before: Place[] } {
  let now = places;
  const folded: string[] = [], before: Place[] = [];
  const first = free(stage, s.w, s.h, now.filter((p) => !p.folded && !p.popped));
  let spot: Rect | null = first ? { ...first, ...s } : null;
  while (!spot) {
    const oldest = now.find(untouched);
    if (!oldest) return { places: now, at: null, folded, before };
    folded.push(oldest.id); before.push(oldest);
    now = now.map((p) => (p.id === oldest.id ? { ...p, folded: true } : p));
    const shown = now.filter((p) => !p.folded && !p.popped);
    // its spot at born size when it fits there; else its spot as it was, when that is no smaller than the least
    const there = { x: oldest.x, y: oldest.y, ...s };
    const fits = there.x + s.w <= stage.w - PAD && there.y + s.h <= stage.h - PAD && !shown.some((o) => overlaps(there, o));
    const own = { x: oldest.x, y: oldest.y, w: oldest.w, h: oldest.h };
    const at = free(stage, s.w, s.h, shown);
    spot = fits ? there : at ? { ...at, ...s } : own.w >= MIN.w && own.h >= MIN.h && !shown.some((o) => overlaps(own, o)) ? own : null;
  }
  return { places: now, at: spot, folded, before };
}

/** a fold undone (⌘Z): each block back where it was; a block that has taken the spot since moves to a free one, else
 *  stays (pure) */
export function unfoldBack(stage: Size, places: Place[], before: Place[]): Place[] {
  const z = Math.max(0, ...places.map((p) => p.z));
  let now = places.map((p) => { const b = before.find((x) => x.id === p.id); return b ? { ...p, x: b.x, y: b.y, w: b.w, h: b.h, folded: false, z: z + 1 } : p; });
  const back = new Set(before.map((b) => b.id));
  for (const p of now) {
    if (back.has(p.id) || p.folded || p.popped) continue;
    const shown = now.filter((q) => q.id !== p.id && !q.folded && !q.popped);
    if (!shown.some((o) => back.has(o.id) && overlaps(p, o))) continue;
    const at = free(stage, p.w, p.h, shown);
    if (at) now = now.map((q) => (q.id === p.id ? { ...q, ...at } : q));
  }
  return now;
}

/** the block ⌘W folds: the one the stage is focused on (Stage.tsx passes the block filling the stage, else the one holding
 *  the keys, #737), else the one picked alone, else the topmost shown (pure) */
export function focusedOf(places: Place[], focus: string | null, picked: string[]): string | null {
  const shown = places.filter((p) => !p.folded && !p.popped);
  if (focus && shown.some((p) => p.id === focus)) return focus;
  if (picked.length === 1 && shown.some((p) => p.id === picked[0])) return picked[0];
  return shown.length ? shown.reduce((a, b) => (b.z > a.z ? b : a)).id : null;
}

/** where a miniature dropped at (px, py) on the stage lands: its born size, its head under the pointer, kept inside */
export function dropAt(stage: Size, kind: Kind, px: number, py: number): Rect {
  const [bw, bh] = SIZES[kind] ?? SIZES.page;
  const w = Math.min(bw, stage.w - 2 * PAD), h = Math.min(bh, stage.h - 2 * PAD);
  return { x: Math.max(PAD, Math.min(px - w / 2, stage.w - PAD - w)), y: Math.max(PAD, Math.min(py - GAP, stage.h - PAD - h)), w, h };
}

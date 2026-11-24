// owned by slice S32 (the plane at 500 and 2000 things), harmony/build.json; docs/port/notes/cull.md
// Far at scale (harmony canvas.md §4, C3): "draw only what asks; count the rest". At Far at most MAX_WHOLE places are
// drawn whole, chosen by the ladder (asks first, by their best rank; then the AIs at work in it; then what is new; then
// the plane's own order); every other place is folded into one count line ("34 quiet places"; BR1, #1615: one line,
// no zones). Never reshuffle: a place drawn whole stays where it sits on the plane, and the count line sits at its first
// folded place on screen (or under the whole ones), so the ranking changes what is drawn, never where anything is. With MAX_WHOLE places or
// fewer nothing is folded, so the panel's scenarios draw as before. The mockup's rounds R9–R10 had not landed count
// 40's code; this follows harmony/build.json (slice S32), canvas.md §4 and §7 (C3, C4), and eighty.html's "N quiet places" line.
// `cull` is the pure rule (tested in next-cull.test.ts); `cullFar` reads the store for the plane's view (one call).
// Signed: marcocyl04-ux's agent, slice S32 of the port (#1615).
import { createElement, type ReactElement } from "react";
import { D, S, dataVer, open, parentOf } from "../cv/core.ts";
import { R_GAP } from "./layout.ts";

/** at most this many places drawn whole at Far (C3, count 40) */
export const MAX_WHOLE = 12;

/** a place as the rule weighs it: its best ask's rank (Infinity: none), how many asks, AIs at work and new things it
 *  holds, and where it sits (the plane's order: columns left to right, each top to bottom) */
export type Place = { id: string; rank: number; asks: number; working: number; fresh: number; x: number; y: number };
/** the folded places in the plane's order: the count line's words; the line sits at the first of them on screen */
export type Fold = { ids: string[]; first: string; asks: number; working: number; words: string };

const planeOrder = (a: Place, b: Place) => Math.round(a.x) - Math.round(b.x) || a.y - b.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** the ladder: asks first (the best rank first), then AIs at work, then new things, then the plane's order */
export const ladder = (a: Place, b: Place) => a.rank - b.rank || b.working - a.working || b.fresh - a.fresh || planeOrder(a, b);

/** a fold's line, in words: quiet places say so; otherwise how many and what in them asks */
export function foldWords(n: number, asks: number, working: number): string {
  const pl = `place${n === 1 ? "" : "s"}`;
  if (!asks && !working) return `${n} quiet ${pl}`;
  const more = [asks ? `${asks} ask${asks === 1 ? "" : "s"}` : "", working ? `${working} session${working === 1 ? "" : "s"} at work` : ""].filter(Boolean).join(" · ");
  return `${n} more ${pl} · ${more}`;
}

/** the rule: which places are drawn whole at Far (at most `max`, by the ladder), and the rest folded into one line */
export function cull(places: Place[], max = MAX_WHOLE): { whole: Set<string>; folds: Fold[] } {
  if (places.length <= max) return { whole: new Set(places.map((p) => p.id)), folds: [] };
  const ranked = [...places].sort(ladder), whole = new Set(ranked.slice(0, max).map((p) => p.id));
  const ps = places.filter((p) => !whole.has(p.id)).sort(planeOrder);
  const asks = ps.reduce((s, p) => s + p.asks, 0), working = ps.reduce((s, p) => s + p.working, 0);
  return { whole, folds: [{ ids: ps.map((p) => p.id), first: ps[0].id, asks, working, words: foldWords(ps.length, asks, working) }] };
}

/** the places now, read from the store in one pass over the pieces and the asks (never per place: at 2000 things the
 *  per-place queries cost a frame) */
export function placesNow(): Place[] {
  const pos = D.pos ?? {}, rank = new Map<string, number>(), asks = new Map<string, number>(), working = new Map<string, number>(), fresh = new Map<string, number>();
  const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const a of open()) {
    const r = D.pieces[a.piece]?.region;
    if (!r) continue;
    add(asks, r);
    if (!rank.has(r)) rank.set(r, a.rank);   // open() is ranked: the first is the best
  }
  for (const p of Object.values(D.pieces)) {
    if (p.kind === "session" && !p.term?.waiting) add(working, p.region);
    const q = pos[p.id];
    if (q && q.fresh && !q.touched) add(fresh, p.region);
  }
  return D.regions.filter((r) => pos[r.id] && !parentOf(r.id)).map((r) => ({   // a folder inside a folder is drawn in it (BR1)
    id: r.id, rank: rank.get(r.id) ?? Infinity, asks: asks.get(r.id) ?? 0,
    working: working.get(r.id) ?? 0, fresh: fresh.get(r.id) ?? 0, x: pos[r.id].x, y: pos[r.id].y,
  }));
}

type Rect = { x: number; y: number; w: number; h: number };
/** where the count line goes on screen: at the first of the folded places on screen (the plane's order); else, while
 *  the view shows only whole places, under the lowest of them; with none on screen it has none (an edge chip names
 *  them). `vis` answers a place's screen rect, or null off screen */
export function lineAt(f: Fold, wholeHere: string[], vis: (q: Rect) => Rect | null): { at: string; r: Rect; q: Rect } | null {
  for (const id of f.ids) { const q = D.pos?.[id], r = q ? vis(q) : null; if (q && r) return { at: id, r, q }; }
  let low: { at: string; r: Rect; q: Rect } | null = null;
  for (const id of wholeHere) { const q = D.pos?.[id], r = q ? vis(q) : null; if (q && r && (!low || r.y + r.h > low.r.y + low.r.h)) low = { at: id, r, q }; }
  if (!low) return null;
  const gap = R_GAP * S.cam.z, q = low.q;
  return { at: f.first, r: { x: low.r.x, y: low.r.y + low.r.h + gap, w: low.r.w, h: low.r.h }, q: { x: q.x, y: q.y + q.h + R_GAP, w: q.w, h: q.h } };
}
/** the plane's one call at Far (plane/index.tsx): the count lines go into `items`; answers whether a place is drawn
 *  whole. A count line's press goes to a folded place (the shell presses data-act); Find is the road to the
 *  rest (canvas.md §4) */
let kept: { d: unknown; pos: unknown; dv: number; ps: Place[]; c: ReturnType<typeof cull> } | null = null;
export function cullFar(items: ReactElement[], vis: (q: Rect) => Rect | null): (id: string) => boolean {
  // the rule's answer is kept per version of the data: a pan moves no place and changes no ask (C4)
  if (!kept || kept.d !== D || kept.pos !== D.pos || kept.dv !== dataVer()) { const ps = placesNow(); kept = { d: D, pos: D.pos, dv: dataVer(), ps, c: cull(ps) }; }
  const { ps, c: { whole, folds } } = kept;
  for (const f of folds) {
    const l = lineAt(f, ps.filter((p) => whole.has(p.id)).map((p) => p.id), vis);
    if (!l) continue;
    items.push(createElement("div", {
      key: "cull", className: "pl-fold pl-away", "data-count": "folders", "data-folded": f.ids.length, "data-act": `goto:${l.at}`,
      role: "button", tabIndex: 0, title: f.words,
      // under the plane's camera (#1633): at its place in the plane's units, at screen size, so a pan leaves it as it was
      style: { left: l.q.x, top: l.q.y, width: +(l.q.w * S.cam.z).toFixed(1), transform: `scale(${1 / S.cam.z})` },
    }, f.words));
  }
  return (id: string) => whole.has(id);
}

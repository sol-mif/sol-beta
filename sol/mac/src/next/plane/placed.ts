// Where Sol put a folder, on the canvas (BR1 item 4, #1615; mine/look/br1/three.html "Anything Sol placed says so when you
// point at it, with why"): the folders Sol placed, moved or set up that the person has not seen yet (P's next.placed, read
// by cv/wire/placed.ts) wear a dot on their card until That's right or the move back (F's placer, next.placed.seen);
// pointing at any folder Sol placed, seen or not, shows F's "Why your AI put it here" under the card, and its old place,
// when that is a folder on the canvas, a dashed outline. Pure but for two small stores. Signed: marcocyl04-ux's agent
// (builder E), BR1 (#1615).
import { useSyncExternalStore } from "react";
import { placedOf, solPlaced } from "../because/place.ts";
import { samePlace, type Known } from "../known.ts";

/** one placement as next.placed sends it (unseen only) */
export type Unseen = { folder: string; name: string; to: string; from: string | null; why: string; k: string; fact: string; at?: string };

/** a folder of the canvas is the place a key names: by its id ("w:<path>", "h:<id>", a bare id) or its path */
export const isRegion = (folder: string, r: { id: string; path?: unknown }) =>
  samePlace(folder, r.id) || (typeof r.path === "string" && !!r.path && samePlace(folder, r.path));

/** the engine's rows, only as the dot can say them: a folder, its key and its fact */
export function unseenOk(v: unknown): Unseen[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const p = x as Partial<Unseen> | null;
    if (!p || typeof p.folder !== "string" || !p.folder || typeof p.fact !== "string") return [];
    const s = (o: unknown) => (typeof o === "string" ? o : "");
    return [{ folder: p.folder, name: s(p.name) || p.folder, to: s(p.to), from: s(p.from) || null, why: s(p.why), k: s(p.k) || `placed:${p.folder}`, fact: p.fact, ...(s(p.at) ? { at: s(p.at) } : {}) }];
  });
}

/** a row as a line of what Sol knows, for the caption when next.known has not said it yet */
export const lineOf = (u: Unseen): Known => ({ k: u.k, fact: u.fact, source: "where Sol put it", by: "sol", ...(u.at ? { at: u.at } : {}), place: u.folder });

/** the placement a folder's card says: Sol's own line in what Sol knows, else the unseen row's; null: nothing to say */
export function placementOf(r: { id: string; path?: unknown }, known: readonly Known[], rows: readonly Unseen[]): { k: string; all: Known[] | null; dot: boolean; from: string | null } | null {
  const row = rows.find((u) => isRegion(u.folder, r)) ?? null;
  const line = known.find((f) => solPlaced(f) && isRegion(placedOf(f.k)!, r)) ?? null;
  if (!line && !row) return null;
  return { k: line?.k ?? row!.k, all: line ? null : [...known, lineOf(row!)], dot: !!row, from: row?.from ?? null };
}

// ---------------------------------------------------------------- the two stores: the unseen rows, the old place pointed at

const subs = new Set<() => void>();
const tell = () => { for (const f of subs) f(); };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
let rows: Unseen[] = [];
let was: string | null = null;

export const unseenNow = (): readonly Unseen[] => rows;
export function setUnseen(v: Unseen[]) { rows = v; tell(); }
export const useUnseen = () => useSyncExternalStore(sub, unseenNow);
/** the old place of the folder pointed at: that card draws a dashed outline */
export function pointWas(from: string | null) { if (was !== from) { was = from; tell(); } }
export const useWas = () => useSyncExternalStore(sub, () => was);

/** &placed=<folder>[:<from>] on the dev page: that folder placed by Sol and unseen, moved from the other (no engine) */
export function devPlaced(v: string | null, name: (id: string) => string) {
  if (!v) return;
  const [folder, from] = v.split(":");
  const fact = `Sol put ${name(folder)} ${from ? `from ${name(from)} ` : ""}at the top level because it holds its own work`;
  setUnseen([{ folder, name: name(folder), to: "", from: from || null, why: "it holds its own work", k: `placed:${folder}`, fact }]);
}

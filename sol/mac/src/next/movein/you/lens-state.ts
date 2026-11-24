// What a place of next.you says beside the circle (BR1, #1615): its hours in a word, the AIs there, what may leave the
// Mac by its dial, where a fact came from (its dot), which folder of the plane a place is, and what Sol knows in one
// folder (the badge). The facts themselves are known.ts's; the places the circle draws, circle.ts's. Pure, so the tests
// read it. Signed: marcocyl04-ux's agent (builder F).
import { DIAL, dialOf } from "./model.ts";
import { aisOf, fromWords, known, ofPart, sayable, type Known, type Sources } from "../../known.ts";
import type { Level, Part, You } from "./types.ts";
export { aisOf, fromWords, sayable };

/** a place's hours in a word or two: the part of the day that holds most of it, "any time" when none does */
export function hoursWord(at: number[]): string {
  const all = at.reduce((a, b) => a + (b || 0), 0);
  if (!(all > 0)) return "";
  const parts: [string, number[]][] = [["mornings", [5, 6, 7, 8, 9, 10, 11]], ["afternoons", [12, 13, 14, 15, 16]], ["evenings", [17, 18, 19, 20, 21]], ["nights", [22, 23, 0, 1, 2, 3, 4]]];
  const top = parts.map(([w, hs]) => [w, hs.reduce((a, h) => a + (at[h] || 0), 0) / all] as const).sort((a, b) => b[1] - a[1])[0];
  return top[1] >= 0.5 ? top[0] : "any time";
}

/** where Sol learned a fact, as the circle draws it: one dot colour each, the same meaning at every size */
export type Kind = "calendar" | "chats" | "mac" | "read" | "told" | "noticed" | "learned";
const kindOfSource = (f: string): Kind =>
  f === "claude-sessions" || f === "codex-sessions" ? "chats" : f === "calendar-store" ? "calendar" : f === "record" || f === "you" ? "told" : f ? "mac" : "read";
export const kindOfKnown = (f: Pick<Known, "by" | "from">): Kind =>
  f.by === "person" ? "told" : f.by === "sol" ? "noticed" : f.by === "seat" ? "learned" : f.from ? kindOfSource(f.from) : "read";
/** what may leave this Mac from a place, by its dial */
export const leaves = (l: Level | null | undefined) => (dialOf(l) === 2 ? "asks you first" : "never");
export const dialWord = (l: Level | null | undefined) => DIAL[dialOf(l)].w;

/** the folder a place is on the plane: its own id ("w:<path>", "h:<id>"), its path, else its name */
export type Region = { id: string; name: string; path?: string };
export function regionOf(p: Pick<Part, "id" | "name">, regions: Region[]): string | null {
  const id = p.id;
  const r = regions.find((x) => x.id === id || x.id === `w:${id}` || x.id === `h:${id}` || (!!x.path && x.path === id))
    ?? regions.find((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  return r ? r.id : null;
}

/** what Sol knows in one folder of the plane: its own facts (an opened folder's, next.folder) and those of every place of
 *  next.you that is this folder (regionOf), each fact once (the folder badge reads it) */
export function knownInRegion(rid: string, regions: Region[], s: Sources): Known[] {
  const parts = (s.you?.parts ?? []).filter((p) => regionOf(p, regions) === rid);
  const all = [...known(rid, s), ...parts.flatMap((p) => known(p.id, s))], seen = new Set<string>();
  return all.filter((f) => (seen.has(f.k) ? false : (seen.add(f.k), true)));
}

/** next.you with each place knowing what its folder's badge counts (BR1 H4, one facts source): a part on a folder of the
 *  plane gets knownInRegion's facts it does not say itself (the folder's own, what the move-in read found there), so
 *  "N facts" in You is the card's and the opened folder's N. A part on no folder keeps its own */
export function knowsWith(y: You, regions: Region[], s: Omit<Sources, "you">): You {
  const src = { ...s, you: y };
  return { ...y, parts: y.parts.map((p) => {
    const rid = regionOf(p, regions);
    if (!rid) return p;
    const has = new Set(ofPart(p).map((f) => f.k));
    const more = knownInRegion(rid, regions, src).filter((f) => !has.has(f.k)).map(({ place: _p, ...f }) => f);
    return more.length ? { ...p, knows: [...(p.knows ?? []), ...more] } : p;
  }) };
}

export type Box = { x: number; y: number; w: number; h: number };

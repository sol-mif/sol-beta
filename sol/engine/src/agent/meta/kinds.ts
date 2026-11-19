// Agents' meta (#1327, pass 2): kinds of places. A kind is siblings (one parent, at any depth, a source's items
// included) with the same shape. Code pre-filters each pair of siblings by shape overlap (≥ SHAPE_MIN, the mean over
// the parts of the shape both have: file kinds, linked sources, sticky verbs). The overlap is |A∩B| / min(|A|,|B|), not
// Jaccard: a sibling that does more than the others (more sources, more files) holds all of theirs and more, and is
// still one of them; Jaccard over the union punished it for the extra. Then Jev "same kind of place?" over the two
// shapes as words (shapeWords: what each holds at its top by name, its sources, its rules and notes, the place masked,
// never its name): ≥ JEV_SAME in, JEV_HALF..JEV_SAME the offer's tile asks "is X a <kind>?", under out.
// Jev null (no key, an error, a timeout): the shape alone decided, so the pair is in.
//   jaccard(a, b), overlap(a, b), shapeScore(a, b), shapeWords(p)   pure
//   kindsOf(places, ask)              the kinds, members in a stable order; its questions a few at a time (jev.ts inOrder)
//   joinsKind(kind, members, place)   code's test for a new sibling on the tick (shape only, no Jev there)
import type { Place } from "./places.js";
import { inOrder, type Ask } from "./jev.js";
import { maskOf } from "./jobs.js";
import { JEV_HALF, JEV_SAME, SHAPE_MIN } from "./numbers.js";

export type Member = { place: string; ask?: true };
export type Kind = { id: string; name: string; parent: string; members: Member[] };

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}
/** the overlap coefficient (pure): |A∩B| / min(|A|,|B|); one side holding all of the other's and more scores 1 */
export function overlap(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / Math.min(A.size, B.size);
}
/** the shape overlap of two places (pure): the mean overlap over the parts both have; 0 when they share no part */
export function shapeScore(a: Pick<Place, "files" | "sources" | "verbs">, b: Pick<Place, "files" | "sources" | "verbs">): number {
  const parts = (["files", "sources", "verbs"] as const).filter((k) => a[k].length && b[k].length);
  if (!parts.length) return 0;
  return parts.reduce((s, k) => s + overlap(a[k], b[k]), 0) / parts.length;
}
/** the words that name a place itself, to be masked: its name, its folder's last part, its item's id */
const ownNames = (p: Pick<Place, "id" | "name">) => {
  const last = p.id.split("#").pop()!.split("/").pop()!;
  return [p.name, last, last.replace(/[-_]+/g, " ")];
};
/** a place's shape as words, for Jev (pure): what it holds at its top by name, its linked sources, its rules and the
 *  first words of its notes, the place's own name masked; never its name */
export function shapeWords(p: Pick<Place, "id" | "name" | "files" | "sources" | "verbs"> & Partial<Pick<Place, "entries" | "rules">>): string {
  const names = ownNames(p);
  const entries = (p.entries ?? []).map((e) => maskOf(e, names));
  const rules = (p.rules ?? []).map((r) => maskOf(r, names));
  return maskOf([
    `holds: ${entries.join(", ") || (p.files.length ? p.files.join(", ") : "nothing yet")}`,
    `linked sources: ${p.sources.join(", ") || "none"}`,
    `its rules: ${rules.join(" | ") || "none"}`,
    `its notes start with: ${p.verbs.join(", ") || "nothing yet"}`,
  ].join("; "), names);
}
/** a kind's word: the parent's name, one of (units → unit); the name of the source for its items */
export function kindName(parent: Place | undefined, item?: string): string {
  const w = (item ?? parent?.name ?? "place").toLowerCase();
  return w.length > 3 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
}

/** the kinds of a home's places: siblings paired by shape, then by Jev; a pair Jev puts in the half band asks */
export async function kindsOf(places: Place[], ask: Ask): Promise<Kind[]> {
  const byParent = new Map<string, Place[]>();
  for (const p of places) {
    const key = p.item ? `${p.parent}#${p.item.source}` : p.parent;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(p);
  }
  const kinds: Kind[] = [];
  const parents = [...byParent].sort(([a], [b]) => a.localeCompare(b)).filter(([, sibs]) => sibs.length >= 2);
  // every pair of siblings close enough in shape, across all parents, asked a few at a time (jev.ts inOrder); each
  // parent then reads its answers in the order it always did, so the kinds are the same as asking one at a time
  const pairs: { key: string; a: Place; b: Place }[] = [];
  for (const [key, sibs] of parents) for (let i = 0; i < sibs.length; i++) for (let j = i + 1; j < sibs.length; j++) {
    if (shapeScore(sibs[i], sibs[j]) >= SHAPE_MIN) pairs.push({ key, a: sibs[i], b: sibs[j] });
  }
  const said = new Map<(typeof pairs)[number], number | null>();
  await inOrder(pairs, (x) => ask("kind", shapeWords(x.a), shapeWords(x.b)), (p, x) => { said.set(x, p); });
  for (const [key, sibs] of parents) {
    const root = new Map(sibs.map((p) => [p.id, p.id]));
    const find = (x: string): string => (root.get(x) === x ? x : find(root.get(x)!));
    const asks: [string, string][] = [];
    for (const x of pairs) {
      if (x.key !== key) continue;
      const a = x.a, b = x.b, p = said.get(x)!;
      if (p === null || p >= JEV_SAME) root.set(find(b.id), find(a.id));
      else if (p >= JEV_HALF) asks.push([a.id, b.id]);
    }
    const groups = new Map<string, string[]>();
    for (const p of sibs) { const r = find(p.id); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(p.id); }
    const parent = places.find((p) => p.id === sibs[0].parent);
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      const members: Member[] = ids.map((place) => ({ place }));
      for (const [a, b] of asks) {
        const out = ids.includes(a) ? b : ids.includes(b) ? a : null;
        if (out && !members.some((m) => m.place === out) && !kinds.some((k) => k.members.some((m) => m.place === out && !m.ask))) members.push({ place: out, ask: true });
      }
      const item = sibs[0].item?.source;
      kinds.push({ id: `${key}/${ids[0]}`, name: kindName(parent, item), parent: sibs[0].parent, members });
    }
  }
  return kinds;
}

/** a new sibling joins a kind by itself when its shape meets any member's (code only: the tick asks Jev nothing) */
export function joinsKind(members: Place[], place: Place): boolean {
  return members.some((m) => m.id !== place.id && m.parent === place.parent && !!m.item === !!place.item && shapeScore(m, place) >= SHAPE_MIN);
}

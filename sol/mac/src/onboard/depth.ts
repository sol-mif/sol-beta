// Places at any depth (#1481, "Open a part of life"): a place holds places. A sub-place's id
// is its path in the person's Sol home ("kids/lia"), so its folder sits inside its parent's and every reader that joins
// `${solHome}/${id}` (record.ts newFolders, landFolders, the agents keeper) needs no change. Only the person or the
// record names a sub-place; a folder Sol or an agent made on disk is never one. A place whose parent is not in the
// record is drawn at the top, never lost. Pure: OneHome.tsx draws the tree.

type Place = { id: string; name: string };

/** the parent's id, or null for a top place */
export const parentOf = (id: string): string | null => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : null);

/** the places drawn at the top: those with no parent, or whose parent is not in the record */
export function topOf<P extends Place>(ps: readonly P[]): P[] {
  const ids = new Set(ps.map((p) => p.id));
  return ps.filter((p) => { const up = parentOf(p.id); return !up || !ids.has(up); });
}

/** the places directly inside one, in the record's order */
export const kidsOf = <P extends Place>(ps: readonly P[], id: string): P[] => ps.filter((p) => parentOf(p.id) === id);

/** a place and every place under it, at any depth */
export function underOf(ps: readonly Place[], id: string): string[] {
  const out = [id];
  for (const k of kidsOf(ps, id)) out.push(...underOf(ps, k.id));
  return out;
}

/** the crumbs from the top place down to this one (only those in the record) */
export function pathOf<P extends Place>(ps: readonly P[], id: string): P[] {
  const out: P[] = [];
  for (let at: string | null = id; at; at = parentOf(at)) { const p = ps.find((x) => x.id === at); if (!p) break; out.unshift(p); }
  return out;
}

/** where Esc goes from a place: its parent when that is in the record, else Home */
export const upOf = (ps: readonly Place[], id: string): string => { const up = parentOf(id); return up && ps.some((p) => p.id === up) ? up : "home"; };

/** the side's rows: each top place, then everything under it, each with its depth (0 at the top) */
export function treeOf<P extends Place>(ps: readonly P[]): { p: P; depth: number }[] {
  const out: { p: P; depth: number }[] = [];
  const walk = (p: P, depth: number) => { out.push({ p, depth }); for (const k of kidsOf(ps, p.id)) walk(k, depth + 1); };
  for (const p of topOf(ps)) walk(p, 0);
  return out;
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** the id of a place the person names inside another: its path, kept apart from a sibling of the same name */
export function newIdIn(ps: readonly Place[], parent: string, name: string): string | null {
  const s = slug(name);
  if (!s) return null;
  const ids = new Set(ps.map((p) => p.id));
  let id = `${parent}/${s}`;
  for (let n = 2; ids.has(id); n++) id = `${parent}/${s}-${n}`;
  return id;
}

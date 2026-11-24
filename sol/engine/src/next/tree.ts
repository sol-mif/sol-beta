// The person's folders, one tree (#1816; mine/look/folders/pipeline.html, the fix's five steps): what the canvas and the
// sidebar both draw, read again from the disk on every next.state, so the two never disagree and neither is frozen at the
// move-in. Read only, through carry.ts's Reader.
//   gather  the folders the person kept (movein.ts keptFolders), the folders of Sol's home two deep (carry.ts places) and
//           the folders added to Sol by hand (work.json, the same places), none they dropped
//   name    one id per real folder: a path inside Sol's home is that home's folder ("h:school/la245"), however it came,
//           so a folder kept by its path, read in the home and worked in by a session is one folder; Sol's home itself,
//           and anything that holds everything (the person's home, an app's storage, a sync root), is never one
//   keep    only what is on the disk now (a folder moved to the Trash leaves), and none of Sol's own: a store the engine
//           makes (home/own-folders.ts) or a folder Sol keeps for a project, full or left empty
//   nest    each folder sits in the nearest folder of the tree that holds it on disk; where two or more folders share a
//           real parent folder the tree does not hold, that parent joins it (`by: "disk"`), so ~/School/LA245 and
//           ~/School/IS223 sit in School. A folder of Sol's home sits only in another of that home, never in what holds
//           the home. Nothing is ever a parent the disk does not have
//   words   (round 2) once the person has said how their folders are (movein.json `said`, next/said.ts folders_set), the
//           tree is exactly what they said and nothing gathered above is added: each folder they named, in the one they
//           put it in (else the nearest of theirs holding it on disk), and its own folders one level down unless closed.
//           A link inside a folder of the tree to a folder elsewhere (Sol's home's copy of a class) is that folder too
//           (`also`), so a session or a sticky there sits in it. What is left out is the face's "Not sorted yet"
// Signed: marcocyl04-ux's agent (#1816).
import { realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fsReader, type Place, type Reader } from "./carry.js";
import { keptFolders, type MoveInKept, type Said } from "./movein.js";
import { holdsAll } from "./movein-place.js";
import { holdsOnlyStores, isProjectStore, OWN_FOLDERS } from "../home/own-folders.js";

/** a folder of the tree: its id ("h:<id in Sol's home>" or "w:<path>"), its name (the person's when they gave one), its
 *  path on disk, `real` where a link leads to it from elsewhere (its path with every link followed, only when it
 *  differs: a session there is in this folder), the folder it sits in; `by: "disk"` a parent the tree added because the
 *  disk has it, never kept */
export type TreeFolder = { id: string; name: string; path: string; real?: string; parent?: string; by?: "disk"; also?: string[] };
export type TreeIn = {
  /** Sol's home (SOL_HOME) and the person's own home */
  sol: string; user: string;
  movein: MoveInKept | null;
  /** carry.ts's places: Sol's home two deep (from "home") and the folders work.json holds (from "work") */
  places: Pick<Place, "id" | "name" | "path" | "from">[];
  /** the folders of ~/.claude/projects, as Claude Code names them (a session's folder, slugged): an empty folder in Sol's
   *  home named for one of them is the one Sol kept for that project (own-folders.ts isProjectStore) */
  slugs?: readonly string[];
};

const trim = (p: string) => p.replace(/[\\/]+$/, "");
const under = (a: string, b: string) => a !== b && (a.startsWith(b + "/") || a.startsWith(b + "\\"));
const up = (p: string) => trim(p).replace(/[\\/][^\\/]*$/, "") || "/";
const MAX = 2000;
/** a said folder's own folders shown, at most, and the links of one folder folded into it */
const OPEN_MAX = 60, ALSO_MAX = 50;

/** the tree, outermost folders first, each folder after the one holding it */
export function folderTree(a: TreeIn, r: Reader = fsReader): TreeFolder[] {
  if (!a.movein) return [];   // before the move-in the canvas draws the read, not the tree
  // what holds everything is the person's home and above it, an app's storage, a sync root; Sol's home is none of the
  // person's folders, but a folder holding it can be one (a Sol developer's checkout)
  const sol = trim(a.sol), homes = [trim(a.user)], drop = new Set(a.movein.drop.map(String));
  /** a path's one id: in Sol's home, the home's; Sol's home itself, none */
  const idOf = (path: string): string | null => (path === sol ? null : under(path, sol) ? "h:" + path.slice(sol.length + 1).split("\\").join("/") : "w:" + path);
  const top = (id: string) => id.slice(2).split("/")[0];
  /** a folder directly in Sol's home that is Sol's own: a store it makes, one it keeps for a project, empty or not */
  const own = new Map<string, boolean>();
  const solsOwn = (id: string): boolean => {
    if (!id.startsWith("h:")) return false;
    const t = top(id);
    if (!own.has(t)) {
      const names = r.list(join(sol, t));
      own.set(t, OWN_FOLDERS.has(t) || (names !== null && (holdsOnlyStores(names) || (!names.some((x) => x.name !== ".DS_Store") && isProjectStore(t, a.slugs ?? [])))));
    }
    return own.get(t)!;
  };

  const out = new Map<string, TreeFolder>(), reals = new Set<string>();
  const realOf = (p: string) => { try { return realpathSync(p); } catch { return p; } };
  const add = (path0: string, name: string, id0?: string) => {
    if (out.size >= MAX || !path0) return;
    const path = trim(path0), id = idOf(path);
    if (!id || out.has(id) || drop.has(id) || (id0 && drop.has(id0)) || holdsAll(path, homes) || solsOwn(id)) return;
    if (id.slice(2).split(/[\\/]/).some((x) => x.startsWith("."))) return;
    if (r.list(path) === null) return;   // not on the disk now: moved, renamed or in the Trash
    const real = realOf(path);
    if (reals.has(real)) return;   // the same folder by another way to it (a link in Sol's home): once, as first gathered
    reals.add(real);
    out.set(id, { id, name: name || basename(path), path, ...(real !== path ? { real } : {}) });
  };
  if (a.movein.said) return order(words(a.movein.said, { idOf, solsOwn, homes, sol, realOf, out, reals }, r));
  // the person's own first, so a name they gave wins; then Sol's home and the folders added by hand
  for (const k of keptFolders(a.movein)) add(k.path ?? (k.id.startsWith("h:") ? join(sol, k.id.slice(2)) : ""), k.name, k.id);
  for (const p of a.places) if (p.from === "home" || p.from === "work") add(p.path, p.name, p.from === "home" ? "h:" + p.id : "w:" + p.path);

  // nest: the nearest folder of the tree that holds it; a folder of Sol's home only in another of that home
  const holderOf = (f: TreeFolder, all: TreeFolder[]) =>
    all.filter((g) => g !== f && under(f.path, g.path) && (!f.id.startsWith("h:") || g.id.startsWith("h:"))).sort((x, y) => y.path.length - x.path.length)[0];
  const nest = () => { const all = [...out.values()]; for (const f of all) { const g = holderOf(f, all); if (g) f.parent = g.id; else delete f.parent; } };
  nest();
  // the disk's own parents: for each folder at the top, the nearest folder above it holding another folder at the top
  // joins the tree; again, until none is added (a parent added may share one with another)
  for (let round = 0; round < 8; round++) {
    const tops = [...out.values()].filter((f) => !f.parent);
    const above = (f: TreeFolder): string[] => {
      const ds: string[] = [];
      for (let d = up(f.path); d !== up(d) && !holdsAll(d, homes) && (!f.id.startsWith("h:") || under(d, sol)); d = up(d)) ds.push(d);
      return ds;
    };
    const ups = new Map(tops.map((f) => [f, above(f)]));
    const shared = new Set<string>();
    for (const [f, ds] of ups) {
      const d = ds.find((x) => tops.some((g) => g !== f && ups.get(g)!.includes(x)));
      if (d && !out.has(idOf(d) ?? "")) shared.add(d);
    }
    if (!shared.size) break;
    for (const d of shared) {
      const id = idOf(d);
      if (!id || out.size >= MAX || r.list(d) === null) continue;
      out.set(id, { id, name: basename(d), path: d, by: "disk" });
    }
    nest();
  }
  return order(out);
}

type Ctx = { idOf: (p: string) => string | null; solsOwn: (id: string) => boolean; homes: string[]; sol: string; realOf: (p: string) => string; out: Map<string, TreeFolder>; reals: Set<string> };
/** the tree from the person's words: the folders they named, then each one's own folders one level down, then the links
 *  inside each folder of the tree (see the head) */
function words(said: Said, c: Ctx, r: Reader): Map<string, TreeFolder> {
  const { out, reals } = c;
  const put = (path0: string, name: string): TreeFolder | null => {
    const path = trim(path0), id = c.idOf(path);
    if (out.size >= MAX || !id || out.has(id) || holdsAll(path, c.homes) || c.solsOwn(id) || r.list(path) === null) return null;
    const real = c.realOf(path);
    if (reals.has(real)) return null;
    reals.add(real);
    const f: TreeFolder = { id, name: name || basename(path), path, ...(real !== path ? { real } : {}) };
    out.set(id, f);
    return f;
  };
  const named: { f: TreeFolder; open: boolean; inside?: string }[] = [];
  for (const s of said.folders) { const f = put(s.path, s.name ?? ""); if (f) named.push({ f, open: s.open !== false, inside: s.inside && trim(s.inside) }); }
  // each in the one they put it in, else the nearest of theirs holding it on disk (by its path or where its link leads)
  const at = (g: TreeFolder) => [g.path, g.real].filter((x): x is string => !!x);
  const holds = (g: TreeFolder, f: TreeFolder) => at(g).some((gp) => at(f).some((fp) => under(fp, gp)));
  for (const n of named) {
    const theirs = n.inside ? named.find((m) => m !== n && at(m.f).includes(n.inside!)) : undefined;
    const g = theirs ?? named.filter((m) => m !== n && holds(m.f, n.f)).sort((x, y) => y.f.path.length - x.f.path.length)[0];
    if (g) n.f.parent = g.f.id;
  }
  // a loop "inside" can make (A in B, B in A): the one that closes it goes to the top
  for (const n of named) {
    const seen = new Set<string>([n.f.id]);
    for (let p = n.f.parent; p; p = out.get(p)?.parent) { if (seen.has(p)) { delete n.f.parent; break; } seen.add(p); }
  }
  // their own folders, one level down: none hidden (a dot folder, an app's storage), none of Sol's own
  for (const n of named) {
    if (!n.open) continue;
    const kids = (r.list(n.f.path) ?? []).filter((e) => e.dir && !e.name.startsWith(".")).map((e) => e.name).sort((x, y) => x.localeCompare(y)).slice(0, OPEN_MAX);
    for (const k of kids) { const f = put(join(n.f.path, k), ""); if (f) f.parent = n.f.id; }
  }
  // a link inside a folder of the tree to a folder the tree does not hold is that folder too
  for (const f of out.values()) {
    const base = c.realOf(f.path), also: string[] = [];
    for (const e of r.list(f.path) ?? []) {
      if (!e.dir || e.name.startsWith(".") || also.length >= ALSO_MAX) continue;
      const real = c.realOf(join(f.path, e.name));
      if (real !== join(base, e.name) && !reals.has(real) && !holdsAll(real, c.homes) && real !== c.sol) also.push(real);
    }
    if (also.length) f.also = also;
  }
  return out;
}

/** outermost first, each folder after the one holding it, in the order gathered (a parent the disk added where its first
 *  folder was) */
function order(out: Map<string, TreeFolder>): TreeFolder[] {
  const all = [...out.values()], done = new Set<string>(), sorted: TreeFolder[] = [];
  const rank = new Map(all.map((f, i) => [f.id, i]));
  for (let i = all.length - 1; i >= 0; i--) { const f = all[i]; if (f.parent && rank.has(f.parent)) rank.set(f.parent, Math.min(rank.get(f.parent)!, rank.get(f.id)!)); }
  for (let n = 0; n < 8; n++) for (const f of all) if (f.parent && rank.has(f.parent)) rank.set(f.parent, Math.min(rank.get(f.parent)!, rank.get(f.id)!));
  all.sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
  const walk = (f: TreeFolder) => { if (done.has(f.id)) return; done.add(f.id); sorted.push(f); for (const c of all) if (c.parent === f.id) walk(c); };
  for (const f of all) if (!f.parent || !out.has(f.parent)) walk(f);
  for (const f of all) walk(f);   // a loop the paths cannot make, kept whole all the same
  return sorted;
}

/** what the tree is, in one line per folder: a change in it is a change the windows hear (parts/next.ts) */
export const treeKey = (t: readonly TreeFolder[]) => t.map((f) => `${f.id}>${f.parent ?? ""}=${f.name}${f.also ? "+" + f.also.join("+") : ""}`).join("\n");
/** where the tree changes on disk: the folder each of its folders sits in (a move, a rename, the Trash), Sol's home and
 *  each of its folders at the top (a folder made there, two deep; one made in a folder the person named) */
export const treeDirs = (t: readonly TreeFolder[], sol: string) =>
  [...new Set([trim(sol), ...t.flatMap((f) => [up(f.path), ...(!f.parent ? [f.path] : [])])])];

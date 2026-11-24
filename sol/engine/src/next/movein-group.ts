// The move-in's new signals (BR1 C-2, #1615; mine/look/br1/migration.html C, "What decides what"): who made a folder,
// the quick tries an AI left behind, and folders that belong together. General, for every person: read from the session
// records and what the folders hold, never from a folder's name, a topic or a list.
//   made      an AI made a folder when none of its files is older than its first session there (carry-apps.ts first);
//             a folder with no session, or with a file from before it, is the person's
//   tries     two or more folders an AI made, used on at most TRIES.days days in at most TRIES.sessions sessions, tied to
//             nothing of the person's (not added to Sol, not in their side, no words of theirs, no stickies, things or
//             agent, holding no other folder): gathered into a suggested group, Experiments
//   shape     two or more folders the person's own words name together (one word of theirs, read 2's Place.said) that
//             hold the same shape (file kinds and layout, SHAPE_SAME alike or more): a suggested group named by that word.
//             Words alone never sort (the table's row 3): a word with no shape in common groups nothing
// A suggested group is new: it exists only once the person moves in, as a folder of Sol's home (keepPlaces makes it);
// one of Sol's home already named so is that folder. A Sol-home folder is the person's already and is never gathered.
//   madeOf(p, firstFile)                    "ai" | "you"
//   groupsOf(places, judged, r, order)      per place: its suggested group as a parent, or null
// Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { extname, join } from "node:path";
import { fold } from "./carry-said.js";
import type { Place, Reader } from "./carry.js";

export const TRIES = { days: 2, sessions: 3 };
export const EXPERIMENTS = "Experiments";
export const SHAPE_SAME = 0.5;

export type Made = "you" | "ai";
/** a suggested group, as a folder's parent: not on disk yet (fresh) unless Sol's home has it */
export type Group = { folder: string; name: string; path: string; reading: "tries" | "shape"; fresh: boolean; said?: string; shape?: string[]; file?: undefined };
type Judgedish = { parent: unknown; shelf: boolean; made: Made; lived: { days: number; belongs: string[] } };

/** who made the folder: an AI when its first session began no later than its oldest file */
export const madeOf = (p: Pick<Place, "first">, firstFile: number): Made => (p.first && firstFile && firstFile >= p.first ? "ai" : "you");

/** a file's kind, as the person would say it: plain words for common extensions, else none */
const KINDS: [string, string[]][] = [
  ["pictures", ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg", "psd", "tif", "tiff", "raw"]],
  ["pages", ["html", "htm", "css"]],
  ["documents", ["pdf", "doc", "docx", "pages", "rtf", "odt"]],
  ["notes", ["md", "txt"]],
  ["sheets", ["xls", "xlsx", "csv", "numbers"]],
  ["slides", ["key", "ppt", "pptx"]],
  ["code", ["js", "ts", "tsx", "jsx", "mjs", "py", "rb", "go", "rs", "swift", "java", "kt", "c", "cpp", "h", "sh", "php", "lua"]],
  ["data", ["json", "yaml", "yml", "toml", "xml", "sql"]],
  ["sound", ["mp3", "wav", "m4a", "aiff", "flac"]],
  ["video", ["mp4", "mov", "mkv", "webm"]],
];
const kindOf = (name: string) => { const x = extname(name).slice(1).toLowerCase(); return KINDS.find(([, xs]) => xs.includes(x))?.[0] ?? null; };

/** a folder's shape: the kinds of its files (two deep) and the names of its folders, lower case */
export function shapeOf(r: Reader, path: string): Set<string> {
  const out = new Set<string>();
  for (const d of r.list(path) ?? []) {
    if (d.name.startsWith(".") || d.name === "node_modules") continue;
    if (!d.dir) { const k = kindOf(d.name); if (k) out.add("k:" + k); continue; }
    out.add("d:" + d.name.toLowerCase());
    for (const e of r.list(join(path, d.name)) ?? []) if (!e.dir && !e.name.startsWith(".")) { const k = kindOf(e.name); if (k) out.add("k:" + k); }
  }
  return out;
}
const alike = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const said = (t: string) => t.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase()).slice(0, 60);
const safe = (name: string) => name.replace(/[\\/:]+/g, " ").trim();

/** every place's suggested group, or null; `judged` in the places' order, with each one's parent, shelf and maker */
export function groupsOf(places: readonly Place[], judged: readonly Judgedish[], r: Reader, order: readonly string[] = []): (Group | null)[] {
  const out: (Group | null)[] = places.map(() => null);
  const own = places.filter((p) => p.from === "home");
  /** the group's folder: one of Sol's home already named so, else a new one there */
  const target = (name: string, reading: Group["reading"], extra: Partial<Group> = {}): Group => {
    const n = safe(name), had = own.find((p) => p.name.toLowerCase() === n.toLowerCase());
    return { folder: "h:" + (had?.id ?? n), name: had?.name ?? n, path: had?.path ?? "", reading, fresh: !had, ...extra };
  };
  const free = (i: number) => !judged[i].parent && !judged[i].shelf && places[i].from !== "home" && !places[i].copyOf && !judged[i].lived.belongs.some((b) => b.startsWith("it holds"));

  // tries: what an AI made in passing and nothing of the person's uses
  const tries = places.map((_, i) => i).filter((i) => {
    const p = places[i], n = Object.values(p.sessions ?? {}).reduce((a: number, b) => a + (b ?? 0), 0);
    return free(i) && judged[i].made === "ai" && judged[i].lived.days <= TRIES.days && n <= TRIES.sessions && p.from !== "work"
      && !p.said?.length && !p.holds.stickies && !p.holds.things && !p.holds.agent && !order.includes(p.id) && !order.includes(p.path);
  });
  if (tries.length >= 2) { const g = target(EXPERIMENTS, "tries"); for (const i of tries) out[i] = g; }

  // shape: one word of the person's naming two or more folders that hold the same shape
  const byWord = new Map<string, { as: string; is: number[] }>();
  places.forEach((p, i) => {
    if (out[i] || !free(i)) return;
    for (const w of new Set((p.said ?? []).map((s) => s.trim()).filter(Boolean))) {
      const k = fold(w), had = byWord.get(k);
      byWord.set(k, { as: had?.as ?? w, is: [...(had?.is ?? []), i] });
    }
  });
  const shapes = new Map<number, Set<string>>();
  const shapeAt = (i: number) => shapes.get(i) ?? shapes.set(i, shapeOf(r, places[i].path)).get(i)!;
  for (const { as, is } of [...byWord.values()].sort((a, b) => b.is.length - a.is.length)) {
    const left = is.filter((i) => !out[i]);
    if (left.length < 2) continue;
    // a folder belongs when it is alike with at least half of the others the word names
    const keep = left.filter((i) => left.filter((j) => j !== i && alike(shapeAt(i), shapeAt(j)) >= SHAPE_SAME).length * 2 >= left.length - 1);
    if (keep.length < 2) continue;
    const common = [...shapeAt(keep[0])].filter((x) => keep.every((i) => shapeAt(i).has(x))).sort((a, b) => (a < b ? -1 : 1));
    const words = [...common.filter((x) => x.startsWith("d:")), ...common.filter((x) => x.startsWith("k:"))].map((x) => x.slice(2)).slice(0, 3);
    const g = target(said(as), "shape", { said: as, shape: words });
    if (keep.some((i) => places[i].name.toLowerCase() === g.name.toLowerCase())) continue;
    for (const i of keep) out[i] = g;
  }
  return out;
}

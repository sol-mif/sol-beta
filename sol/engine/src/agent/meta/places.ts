// Agents' meta (#1327, pass 2): the places of a home and each one's shape, read from the disk, nothing written.
//   a place     a folder under the home (three deep), unless a folder above it owns its insides (has a policy.md or a
//               stickies.md: its made/, drafts/ are its files, not places); and each item a source lists in a folder's
//               .agent/items.json, one level down: `{ "<source>": [{ "id": "…", "name": "…" }] }` (written by the
//               source's look), so a kind can sit one level down
//   its shape   file kinds (the extensions of its files and the names of its sub-folders), its linked sources (its
//               policy.md rules' sources, an item's own source; a clock or a date is a trigger, never a source) and its
//               sticky verbs (the first word of each sticky that is not a date). Never its name: the name is the
//               place's variable part, not its kind. For Jev, also what it holds at its top (`entries`: its sub-folders
//               and files by name, "made/", "brain.md") and its rules' sentences (`rules`), masked by the caller.
// A folder that cannot be read is skipped with its reason in `unread` (named, never silent).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parsePolicy } from "../store.js";

export type Place = {
  /** the folder's path under the home (`units/ward-a`), or `<folder>#<item id>` for a source's item */
  id: string;
  name: string;
  /** the id of the place above (`units`), "" at the home's top */
  parent: string;
  /** the folder that holds its policy.md (the item's folder for an item) */
  folder: string;
  item?: { source: string; id: string };
  files: string[];
  sources: string[];
  verbs: string[];
  /** its top-level sub-folders ("made/") and files ("brain.md") by name, as they are (the caller masks the place) */
  entries: string[];
  /** its policy.md rules' sentences, as they are (the caller masks the place) */
  rules: string[];
};
/** a rule's source that only says when, never what is read: a trigger, not an input */
export const TRIGGERS = new Set(["clock", "date"]);

/** folders that are the engine's or a tool's, never a person's place */
const SKIP = new Set(["node_modules", "things", "memory", "desk", "voice", "track", "attachments", "browser-profile", "log", "data", "blocks", "sessions", "items"]);
/** the engine's own files in a folder: not part of its shape */
const OWN = new Set(["policy.md", "stickies.md", "ledger.md", "brain.md", "me.md", "agents.md", "calendar.md"]);
/** a month's name, whole or cut short (never "market" or "decide"); a weekday's the same */
export const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
export const WEEKDAY = "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
/** a month's index from its name, whole or cut short (pure); -1 when it is none */
export const monthOf = (w: string) => (new RegExp(`^${MONTH}\\.?$`, "i").test(w) ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(w.slice(0, 3).toLowerCase()) : -1);
/** a word that is a date, a time or a number, never a verb */
export const dateWord = (w: string) => /^\d/.test(w) || new RegExp(`^(?:${MONTH}|${WEEKDAY}|today|tomorrow|tonight|yesterday|next|this|every|each)$`, "i").test(w);

/** a sticky's first word that is not a date (pure) */
export function verbOf(title: string): string | null {
  for (const raw of title.toLowerCase().split(/[\s→>:,·—-]+/)) {
    const w = raw.replace(/[^a-z']/g, "").replace(/'s$/, "");
    if (w.length >= 2 && !dateWord(w)) return w;
  }
  return null;
}
/** the titles of a stickies.md (pure): `- [ ] Title — what it asks` */
export const stickyTitles = (text: string) => [...text.matchAll(/^- \[[ xX]\]\s+(.*)$/gm)].map((m) => m[1].split(" — ")[0].trim());

const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const owns = (dir: string) => existsSync(join(dir, "policy.md")) || existsSync(join(dir, "stickies.md"));
/** a code as one word: two to four letters joined to three or four digits (a course, a room, a form: cs101, geo214b) */
const CODE = /^[a-z]{2,4}\d{3,4}[a-z]?$/;
/** a place's name as people say it: its folder name in words, the first letter up; a code in lower case is said in
 *  capitals as one token (geo214 → GEO214), a word the person wrote with a capital stays as they wrote it */
export function nameOfFolder(folder: string): string {
  const w = basename(folder).replace(/[-_]+/g, " ").trim().split(" ").map((t) => (CODE.test(t) ? t.toUpperCase() : t)).join(" ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** what a place holds at its top, by name (at most this many, in order): enough for Jev to see the structure */
const ENTRIES_MAX = 24;
function shapeOfDir(dir: string): { files: string[]; sources: string[]; verbs: string[]; entries: string[]; rules: string[] } {
  const files = new Set<string>();
  const look = (d: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const p = join(d, n);
      if (isDir(p)) { if (depth === 0) files.add(`${n.toLowerCase()}/`); if (depth < 1) look(p, depth + 1); continue; }
      if (OWN.has(n.toLowerCase())) continue;
      const e = extname(n).toLowerCase();
      if (e) files.add(e);
    }
  };
  look(dir, 0);
  const policy = parsePolicy(read(join(dir, "policy.md"))).filter((r) => r.source !== "stickies");
  const sources = new Set(policy.map((r) => r.source).filter((s) => !TRIGGERS.has(s)));
  const verbs = new Set(stickyTitles(read(join(dir, "stickies.md"))).map(verbOf).filter((v): v is string => !!v));
  let top: string[] = [];
  try { top = readdirSync(dir).filter((n) => !n.startsWith(".")).sort().map((n) => (isDir(join(dir, n)) ? `${n}/` : n)); } catch { /* none */ }
  const entries = top.filter((n) => n !== "policy.md" && n !== "stickies.md").slice(0, ENTRIES_MAX);
  return { files: [...files].sort(), sources: [...sources].sort(), verbs: [...verbs].sort(), entries, rules: policy.map((r) => r.sentence) };
}

/** a folder's source items (pure over the file's text): { source, id, name }[]; a broken file gives none */
export function itemsIn(text: string): { source: string; id: string; name: string }[] {
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object") return [];
    return Object.entries(j).flatMap(([source, list]) => (Array.isArray(list) ? list : [])
      .filter((x: any) => x && typeof x.id === "string" && x.id)
      .map((x: any) => ({ source, id: String(x.id), name: String(x.name ?? x.id) })));
  } catch { return []; }
}

/** every place of a home, in a stable order; `unread` names the folders that could not be read */
export function placesOf(home: string): { places: Place[]; unread: { path: string; why: string }[] } {
  const places: Place[] = [], unread: { path: string; why: string }[] = [];
  const walk = (rel: string, parent: string, depth: number) => {
    const abs = join(home, rel);
    let names: string[];
    try { names = readdirSync(abs).sort(); } catch (e) { if (rel) unread.push({ path: rel, why: String((e as Error).message ?? e).split("\n")[0] }); return; }
    for (const n of names) {
      if (n.startsWith(".") || SKIP.has(n)) continue;
      const r = rel ? `${rel}/${n}` : n, p = join(home, r);
      if (!isDir(p)) continue;
      places.push({ id: r, name: nameOfFolder(r), parent, folder: r, ...shapeOfDir(p) });
      const items = itemsIn(read(join(p, ".agent", "items.json")));
      if (items.length) {
        const titles = stickyTitles(read(join(p, "stickies.md")));
        for (const it of items) {
          const mine = titles.filter((t) => new RegExp(`\\b${it.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
          const verbs = [...new Set(mine.map((t) => verbOf(t.replace(new RegExp(it.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " "))).filter((v): v is string => !!v))].sort();
          places.push({ id: `${r}#${it.id}`, name: it.name, parent: r, folder: r, item: { source: it.source, id: it.id }, files: [], sources: [it.source], verbs, entries: [], rules: [] });
        }
      }
      if (depth < 2 && !owns(p)) walk(r, r, depth + 1);
    }
  };
  walk("", "", 0);
  return { places, unread };
}

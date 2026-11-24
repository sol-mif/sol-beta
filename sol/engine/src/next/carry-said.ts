// The move-in's read 2 (BR1, #1615; mine/look/br1/migration.html B, Marco 13:45): read 1 looks blind (carry.ts: Sol's
// home, the folders added to Sol, Claude Code's and Codex's); read 2 looks again knowing what the person wrote day to day
// (next.you.day, you.ts setDay), and their words only open places read 1 skipped: a folder of their own home whose name
// holds one of their words. It never filters, hides or reorders what read 1 found; a place read 1 found that their words
// name too gains them (Place.said), so the migration (C) keeps what Sol saw apart from what the person said.
// No list of names, kinds or topics: the words are the person's, matched against folder names alone, whole words, a
// final s or es aside ("restaurants" opens "Restaurant sites"). A few words that say nothing of a place (with, that,
// things…) are never matched: plain English, not anyone's data. READ ONLY, through carry's one Reader: it lists folders
// and opens nothing else.
//   wordsOf(text)                         the person's words that can name a folder: folded (lower case, no accents) → as written
//   saidPlaces(words, user, r, o)         { path, name, said } per folder of `user` whose name holds one of `words`, said
//                                         as the person wrote them
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { join } from "node:path";
import type { Reader } from "./carry.js";

/** how deep under the person's home read 2 looks (the home's folders, theirs, and theirs), how many folders it lists at
 *  most, and how many places it opens at most */
export const SAID_DEPTH = 3, SAID_LISTS = 4000, SAID_MAX = 24;
/** words that say nothing of a place: English function words and the vaguest nouns, four letters or more */
const EMPTY = new Set(("with that this from have just some also when then what into about them they their there where which while would could should " +
  "most more much very like make made keep kept been being does doing each every other only over under after before between thing things stuff " +
  "somewhere something everything anything nothing someone everyone days daily mostly usually sometimes often lots really around").split(" "));

/** a word as it is matched: lower case, its accents off, a final "es" or "s" off (never below four letters) */
export function fold(w: string): string {
  const x = w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return x.length > 5 && x.endsWith("es") && !x.endsWith("ses") ? x.slice(0, -2) : x.length > 4 && x.endsWith("s") && !x.endsWith("ss") ? x.slice(0, -1) : x;
}
/** the person's words that can name a folder (four letters or more, not an empty word): folded → as they wrote it first */
export function wordsOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of text.match(/\p{L}+/gu) ?? []) if (w.length >= 4 && !EMPTY.has(w.toLowerCase()) && !out.has(fold(w))) out.set(fold(w), w);
  return out;
}
/** a folder name's words: split at anything not a letter and where a lower case meets an upper one (camelCase) */
const nameWords = (name: string) => (name.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2").match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 4).map(fold);

export type Said = { path: string; name: string; said: string[] };
/** each folder under `user` (SAID_DEPTH deep) whose name holds one of `words`; a match is not looked inside, and `skip`
 *  (inside a place read 1 found, one that holds everything) is never matched. Hidden folders and node_modules are never
 *  opened */
export function saidPlaces(words: ReadonlyMap<string, string>, user: string, r: Reader, o: { skip?: (path: string) => boolean } = {}): Said[] {
  const out: Said[] = [];
  if (!words.size || !user) return out;
  let lists = 0;
  const walk = (dir: string, depth: number) => {
    if (lists >= SAID_LISTS) return;
    lists++;
    for (const d of (r.list(dir) ?? []).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (out.length >= SAID_MAX) return;
      if (!d.dir || d.name.startsWith(".") || d.name === "node_modules") continue;
      const p = join(dir, d.name);
      // a sync root holds everything yet its folders are the person's (Dropbox/thesis): looked through, never matched
      if (o.skip?.(p)) { if (depth + 1 < SAID_DEPTH) walk(p, depth + 1); continue; }
      const said = [...new Set(nameWords(d.name).filter((w) => words.has(w)).map((w) => words.get(w)!))];
      if (said.length) { out.push({ path: p, name: d.name, said }); continue; }
      if (depth + 1 < SAID_DEPTH) walk(p, depth + 1);
    }
  };
  walk(user, 0);
  return out;
}

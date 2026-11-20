// The person's filing rules (#1686, gate one q1 and q4 of home.whole): which folder a part of a sentence goes to, grown
// from the person and nothing written in the code. Read at every ask, never kept (R8). In order, the first that matches
// wins; the person's own in their order, the others the longer words first:
//   own       <HOME>/home-rules.json { file: [{ words, folder }] }: written by the seat's home_rule tool on the person's
//             own words (home/tool.ts), or by hand. Absent or unreadable: none
//   record    the person's record (~/.sol/record/me.json, what onboarding built): each area's name, to its crumb
//   folders   every folder Home knows (the Things' folders, the places on disk): each crumb's last name, to that folder
// A word matches whole: Latin and other spaced scripts at word edges, case aside; Chinese or Japanese as a run anywhere
// (they put no spaces between words, as openfor.ts reads a yes). Pure but for the two reads.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RECORD } from "../consent.js";
import { plainIn, writeWhole } from "../safewrite.js";

export type Rule = { words: string[]; folder: string; from: "own" | "record" | "folder" };
export type OwnRules = { file: { words: string[]; folder: string }[] };

/** between two names of a crumb (places.ts CRUMB; kept here so the filer reads no Home unit) */
const CRUMB = " › ";
const RULES = "home-rules.json";
const MAX_RULES = 500;

const CJK = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/u;
/** a text made plain for matching: lower case, punctuation and runs of space as one space */
export const plainWords = (s: string): string => ` ${s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
/** whether `word` is in `text` (both as plainWords would make them): whole, or anywhere for a Chinese or Japanese one */
export function holds(text: string, word: string): boolean {
  const w = plainWords(word).trim();
  if (!w) return false;
  const t = plainWords(text);
  return CJK.test(w) ? t.includes(w) : t.includes(` ${w} `);
}

const words = (x: unknown): string[] | null =>
  Array.isArray(x) && x.length > 0 && x.length <= 40 && x.every((w) => typeof w === "string" && plainWords(w).trim().length > 0 && w.length <= 80) ? x : null;
/** the person's own rules file, read (pure over its text): the rules that read, the rest dropped */
export function ownOf(text: string | null): OwnRules {
  try {
    const j = JSON.parse(text ?? "") as { file?: unknown };
    const file = Array.isArray(j?.file) ? j.file : [];
    return { file: file.flatMap((r) => { const w = words(r?.words); return w && typeof r?.folder === "string" && r.folder.trim() ? [{ words: w, folder: r.folder.trim() }] : []; }).slice(0, MAX_RULES) };
  } catch { return { file: [] }; }
}
/** the person's own rules, read from <HOME> */
export function readOwn(home: string): OwnRules {
  const p = plainIn(join(home, RULES), home);
  if (!p) return { file: [] };
  try { return ownOf(readFileSync(p, "utf8")); } catch { return { file: [] }; }
}
/** the person's own rules, written whole under <HOME> */
export function writeOwn(home: string, r: OwnRules): void {
  writeWhole(join(home, RULES), JSON.stringify({ file: r.file.slice(0, MAX_RULES) }, null, 2) + "\n", { root: home });
}

type Area = { id?: unknown; name?: unknown };
export type Record_ = { solHome?: unknown; areas?: unknown };
/** the person's record, or null (none, or one that does not read) */
export function readRecordOf(user: string = homedir()): Record_ | null {
  try { const j = JSON.parse(readFileSync(join(user, RECORD), "utf8")); return j && typeof j === "object" && !Array.isArray(j) ? (j as Record_) : null; } catch { return null; }
}
/** the folder Home made for the person (the record's solHome), or null */
export const solHomeOf = (rec: Record_ | null): string | null => (typeof rec?.solHome === "string" && rec.solHome.trim() ? rec.solHome : null);

/** each area of a record as a rule: its name, to its crumb (the names along its id's parents) (pure) */
export function recordRules(rec: Record_ | null): Rule[] {
  const areas = (Array.isArray(rec?.areas) ? rec!.areas : []) as Area[];
  const byId = new Map<string, string>();
  for (const a of areas) if (typeof a.id === "string" && typeof a.name === "string" && a.name.trim()) byId.set(a.id, a.name.trim());
  const crumb = (id: string): string => id.split("/").map((_, i, s) => byId.get(s.slice(0, i + 1).join("/")) ?? s[i]).join(CRUMB).toLowerCase();
  return [...byId].map(([id, name]) => ({ words: [name], folder: crumb(id), from: "record" as const }));
}
/** each folder as a rule: its last name, to it (pure) */
export const folderRules = (folders: string[]): Rule[] =>
  folders.map((f) => ({ words: [f.split(CRUMB).at(-1)!.trim()], folder: f, from: "folder" as const })).filter((r) => plainWords(r.words[0]).trim());

/** every rule, in the order they are tried (pure): the person's own in the order they wrote them (theirs to rank), then
 *  their record's and their folders', the longer words first within each */
export function ruleSet(own: OwnRules, rec: Record_ | null, folders: string[]): Rule[] {
  const longest = (r: Rule) => Math.max(...r.words.map((w) => plainWords(w).trim().length));
  const sorted = (l: Rule[]) => l.map((r, i) => ({ r, i })).sort((a, b) => longest(b.r) - longest(a.r) || a.i - b.i).map((x) => x.r);
  return [...own.file.map((r) => ({ ...r, from: "own" as const })), ...sorted(recordRules(rec)), ...sorted(folderRules(folders))];
}
/** the first rule a text holds a word of, or null */
export const ruleFor = (text: string, rules: Rule[]): Rule | null => rules.find((r) => r.words.some((w) => holds(text, w))) ?? null;

/** a rule added (its words now file to `folder`; the same words elsewhere are moved) (pure) */
export function addRule(own: OwnRules, ws: string[], folder: string): OwnRules {
  const keys = new Set(ws.map((w) => plainWords(w).trim()));
  const rest = own.file.map((r) => ({ ...r, words: r.words.filter((w) => !keys.has(plainWords(w).trim())) })).filter((r) => r.words.length);
  const same = rest.find((r) => r.folder === folder);
  return { file: same ? rest.map((r) => (r === same ? { ...r, words: [...r.words, ...ws] } : r)) : [...rest, { words: ws, folder }] };
}
/** the words dropped from every rule; a rule with none left is gone (pure) */
export function dropRule(own: OwnRules, ws: string[]): OwnRules {
  const keys = new Set(ws.map((w) => plainWords(w).trim()));
  return { file: own.file.map((r) => ({ ...r, words: r.words.filter((w) => !keys.has(plainWords(w).trim())) })).filter((r) => r.words.length) };
}

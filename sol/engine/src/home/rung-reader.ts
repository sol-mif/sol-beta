// The rung reader (#828; design §7.10): the policy paragraph in, each sentence out with what it names (a source or a
// folder) and the rung it sets, or nothing. The default is a port of Marco's rules, unchanged (origin/marco/mine-run
// 54e4f636, sol/mac/src/home/whole/policy.ts: WORDS l.50-61, readSentence l.85-93, parse l.95-98, readLine l.100-106,
// rewrite l.108-112, folderRung l.44-47): his rules are the seam's factory default. WORDS are the 20 sentences (five
// sources, four rungs) that every reader must read back as their own source and rung. A reader only reads: what a
// wider reading may do is sources.ts's (the lock: a proposal, one rung at a time, on a press). Pure, no I/O.
// Since #1686 (gate one q1, q4) it claims only what is there: a sentence names a source only when that source is in
// this Sol (today, files), else it is kept as the person's own rule and sets nothing; a folder is any of the person's
// folders, not four fixed names; the files sentences say "my folders", nobody's school.
import { RUNGS, SOURCE_IDS, type Policy, type Rung, type Sentence, type SourceId } from "../contract/home/policy.js";
import { plainWords } from "./rules.js";

export { RUNGS };
/** a reader: the paragraph, the sources there are and the person's folders, to its sentences */
export type Reader = (text: string, sources: readonly SourceId[], folders?: readonly string[]) => Sentence[];

export const rungAt = (r: Rung): number => RUNGS.indexOf(r);
export const lowest = (a: Rung, b: Rung): Rung => (rungAt(a) <= rungAt(b) ? a : b);
/** a folder's rung as it stands: what it asked for, held at its source's (never above) */
export const folderRung = (asked: Rung, source: Rung): Rung => lowest(asked, source);
/** the rung one above, or null at the top */
export const above = (r: Rung): Rung | null => RUNGS[rungAt(r) + 1] ?? null;

/** the words a rung writes, one sentence per source and rung: the 20 */
export const WORDS: Record<SourceId, Record<Rung, string>> = {
  calendar: { read: "Look at my calendar, but only I put things on it.", propose: "Look at my calendar and suggest times, but only I put things on it.",
    draft: "Look at my calendar and pencil things in; I keep or drop them.", act: "Put things on my calendar and tell me." },
  mail: { read: "Send nothing from my mail unless I say so.", propose: "Suggest replies to my mail, send nothing.",
    draft: "Draft my replies and hold them for me.", act: "Reply to my mail for me where it is routine, and tell me." },
  files: { read: "Read my folders.", propose: "Read my folders and suggest notes in them.",
    draft: "Write drafts and notes in my folders.", act: "Write and file things in my folders for me." },
  canvas: { read: "Read Canvas for due dates.", propose: "Read Canvas and suggest what to save.",
    draft: "Read Canvas and save new slides to the class.", act: "Read Canvas, save and submit drafts I approved." },
  github: { read: "Read GitHub for issues that name me.", propose: "Read GitHub for issues that name me, suggesting replies.",
    draft: "Read GitHub for issues that name me, drafting replies.", act: "Answer GitHub issues that name me, for me." },
};

// a source named outright first; "replies" says mail only when nothing else is named
const NAMES: [RegExp, SourceId][] = [[/\bcalendar\b/i, "calendar"], [/\bcanvas\b/i, "canvas"], [/\bgithub|issues?\b/i, "github"],
  [/\b(my folders?|folders?|files?)\b/i, "files"], [/\b(e?mail|replies)\b/i, "mail"]];
/** the folder a sentence names right after "with", "for" or "in": the person's folder whose whole name, or last name,
 *  the words there start with (the longest first) */
function folderIn(span: string, folders: readonly string[]): string | undefined {
  const plain = (x: string) => plainWords(x).trim();
  const named = [...new Set(folders.map((f) => f.trim().toLowerCase()).filter(Boolean))]
    .flatMap((f) => [...new Set([f, f.split(" › ").at(-1)!])].map((n) => ({ f, n: plain(n) })))
    .filter((x) => x.n).sort((a, b) => b.n.length - a.n.length);
  for (const m of span.matchAll(/\b(?:with|for|in)\s+([^.;!?]+)/gi)) {
    const tail = `${plain(m[1])} `;
    const hit = named.find((x) => tail.startsWith(`${x.n} `));
    if (hit) return hit.f;
  }
  return undefined;
}
// what a sentence says about how far: the furthest it allows wins; a held-back clause ("but only I …", "send nothing …",
// "unless I say so") moves nothing up, and says read
const HELD = /\b(but\s+)?only i\b[^.;!?]*|\bsend nothing\b[^.;!?]*|\bunless i say so\b/gi;
const SAYS: [RegExp, Rung][] = [
  [/\b(and tell me|answer|submit|file things|put things on|reply for me)\b/i, "act"],
  [/\b(drafts?|drafting|pencil|save new|hold them)\b/i, "draft"],
  [/\b(suggest|suggesting|propose|ask me first)\b/i, "propose"],
  [/\b(read|look at|watch)\b/i, "read"],
];
/** one sentence read: what it names and the rung it sets, or null (it names something but no rung: "be sensible") */
export function readSentence(span: string, sources: readonly SourceId[] = SOURCE_IDS, folders: readonly string[] = []): Sentence {
  const named = NAMES.find(([re]) => re.test(span))?.[1];
  // a source this Sol does not have is not claimed: the sentence stays the person's own words
  if (named && !sources.includes(named)) return { span, rung: null, rule: true };
  const source = named;
  const folder = source ? undefined : folderIn(span, folders);
  if (!source && !folder) return { span, rung: null, rule: true };
  const free = span.replace(HELD, " ");
  const rung = SAYS.find(([re]) => re.test(free))?.[1] ?? (HELD.test(span) ? "read" : null);
  HELD.lastIndex = 0;
  return { span, ...(source ? { source } : {}), ...(folder ? { folder } : {}), rung };
}
/** the paragraph into sentences ("." "!" "?" ";" end one), each read; the text with its spaces made single */
export function parse(text: string, sources: readonly SourceId[] = SOURCE_IDS, folders: readonly string[] = []): Policy {
  const spans = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?;])\s+/).filter(Boolean);
  return { text: spans.join(" "), sentences: spans.map((s) => readSentence(s, sources, folders)) };
}
/** the factory reader */
export const ruleReader: Reader = (text, sources, folders = []) => parse(text, sources, folders).sentences;
/** the summary under the paragraph: "Read: 5 sentences set rungs · 1 sets nothing (…) · …" */
export function readLine(p: Policy): string {
  const sets = p.sentences.filter((s) => s.rung), none = p.sentences.filter((s) => !s.rung && !s.rule);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [`Read: ${n(sets.length, "sentence sets a rung", "sentences set rungs")}`,
    ...(none.length ? [`${n(none.length, "sets nothing", "set nothing")} (“${none[0].span.replace(/[.;!?]$/, "")}” names no rung: say how far)`] : []),
    "above each rung, Sol writes what it would have done"].join(" · ");
}
/** a rung change rewrites its sentence: the sentence that names this source gets the rung's words in its place; none,
 *  one is added at the end */
export function rewrite(p: Policy, id: SourceId, rung: Rung): Policy {
  const words = WORDS[id][rung], i = p.sentences.findIndex((s) => s.source === id);
  const sentences: Sentence[] = i >= 0 ? p.sentences.map((s, j) => (j === i ? { span: words, source: id, rung } : s)) : [...p.sentences, { span: words, source: id, rung }];
  return { text: sentences.map((s) => s.span).join(" "), sentences };
}
/** the rung the paragraph asks of a source: its first sentence that names it with a rung, else null (it keeps its own) */
export const askedOf = (sentences: Sentence[], id: SourceId): Rung | null => sentences.find((s) => s.source === id && s.rung)?.rung ?? null;

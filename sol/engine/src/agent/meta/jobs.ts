// Agents' meta (#1327, pass 2): the same job. Two traces (or two rule sentences) are put to Jev "same job?" with the
// place, the names and the dates masked (maskOf): ≥ JEV_SAME the same job, JEV_HALF..JEV_SAME half (it counts half
// and never offers alone, offer.ts), under: another job. Jev null: code, the same sources and the same output kind
// are the same job (sameByCode). The place is the job's variable part, so one job across places is one agent.
// A clock or a date is a trigger, never an input (places.ts TRIGGERS): two rules or traces that share only one are
// different jobs. Rule sentences are asked Jev's "rule" question (the core: the input read, the kind of trigger, the
// kind of thing made); one rule doing extra on top of another's core is the same job, its extras its place's lines.
//   maskOf(text, names)            pure
//   sameByCode(a, b)               pure
//   ruleShape(r), sameRuleByCode   pure: what a rule reads and what it makes, never its trigger alone
//   coreOf(group)                  pure: the group's core rule and each other rule's extras on top of it
//   groupTraces(traces, ask, …)    traces into jobs, each member weighted 1 (same) or 0.5 (half)
//   groupRules(rules, ask, o)      the existing rules into jobs: one agent per job, across places; the half band's
//                                  pairs in places of one kind kept to be asked (o.half), never merged silently. Each
//                                  rule is asked against the groups so far a few at a time (jev.ts inOrder), decided
//                                  in order as one at a time would: the same groups
import { inOrder, limiter, type Ask } from "./jev.js";
import type { Trace } from "./traces.js";
import { filesIn, madeOf } from "./traces.js";
import { bandOf } from "./numbers.js";
import { MONTH as MONTHS, TRIGGERS, WEEKDAY } from "./places.js";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MONTH = `${MONTHS}\\.?`, DAY = WEEKDAY;

/** the text with the place, the names and the dates taken out (pure). `names`: the places' names and the folder path
 *  words the caller knows; any other capitalised word inside a sentence is taken as a name too */
export function maskOf(text: string, names: string[]): string {
  let s = text;
  for (const n of [...new Set(names.filter((x) => x && x.length > 1))].sort((a, b) => b.length - a.length)) s = s.replace(new RegExp(`\\b${esc(n)}\\b`, "gi"), "<place>");
  s = s
    .replace(/\b\d{4}-\d\d-\d\d\b/g, "<date>")
    .replace(new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}\\s+${MONTH}\\b`, "gi"), "<date>")
    .replace(new RegExp(`\\b${DAY}\\b`, "gi"), "<day>")
    .replace(new RegExp(`\\b${MONTH}\\b(?=\\s)`, "gi"), "<month>")
    .replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, "<time>")
    .replace(/(?<=[a-z,;:→] )[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g, "<name>")
    .replace(/<place>(?:\s*<place>)+/g, "<place>");
  return s;
}
const sameSet = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((x) => b.includes(x));
const inputs = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()).filter((x) => !TRIGGERS.has(x)))].sort();
/** Jev null: the same sources (a clock or a date is not one) and the same output kind are the same job (pure) */
export const sameByCode = (a: Pick<Trace, "sources" | "made">, b: Pick<Trace, "sources" | "made">) =>
  sameSet(inputs(a.sources), inputs(b.sources)) && !!a.made.kind && a.made.kind === b.made.kind;

/** a trace as Jev reads it: what it read, what it made and for whom, its steps; the place, names and dates masked */
export const traceWords = (t: Trace, names: string[]) =>
  maskOf(`read: ${t.sources.join(", ") || "not said"}. made: ${t.made.kind || "not said"} for ${t.made.for === "others" ? "someone else" : "the person"}. steps: ${t.steps.join("; ") || "not said"}. ${t.text}`, names);

export type Score = { p: number; band: "same" | "half" | "different"; by: "jev" | "code" };
/** one pair, Jev first; `cache` keeps a pair's answer so it is asked once */
export async function scorePair(a: Trace, b: Trace, ask: Ask, names: string[], cache: Record<string, number | null> = {}): Promise<Score> {
  const key = [a.id, b.id].sort().join("|");
  const p = key in cache ? cache[key] : await ask("job", traceWords(a, names), traceWords(b, names));
  if (p !== null) cache[key] = p;
  if (p === null) return { p: sameByCode(a, b) ? 1 : 0, band: sameByCode(a, b) ? "same" : "different", by: "code" };
  return { p, band: bandOf(p), by: "jev" };
}

export type Group = { anchor: Trace; members: { trace: Trace; weight: 1 | 0.5 }[] };
/** traces into jobs (oldest first, deterministic): each trace joins the first job whose anchor it matches, weight 1 for
 *  the same job, 0.5 for half; else it starts a job of its own */
export async function groupTraces(traces: Trace[], ask: Ask, names: string[], cache: Record<string, number | null> = {}): Promise<Group[]> {
  const groups: Group[] = [];
  for (const t of [...traces].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    let placed = false;
    for (const g of groups) {
      const s = await scorePair(g.anchor, t, ask, names, cache);
      if (s.band === "different") continue;
      g.members.push({ trace: t, weight: s.band === "same" ? 1 : 0.5 });
      placed = true;
      break;
    }
    if (!placed) groups.push({ anchor: t, members: [{ trace: t, weight: 1 }] });
  }
  return groups;
}

// ---------------------------------------------------------------- existing rules

/** `members`: a chain of one place's rules (chains.ts), this its first rule, `sentence` all of theirs */
export type RuleIn = { place: string; folder: string; rule: string; sentence: string; source: string; names: string[]; members?: RuleIn[] };
/** where a rule sentence turns from what it reads to what it makes: "into", an arrow, or a making verb */
const OUT = /\s(?:into|→|->)\s|\b(?:make|makes|write|writes|draft|drafts)\b(?!\/)/i;
/** a word after a reading verb that is not a thing read */
const NOT_READ = new Set(["it", "them", "this", "that", "what", "which", "each", "every", "all", "any", "one", "new", "file", "files"]);
const DET = "(?:(?:the|my|our|your|a|an|each|every|<place>'s|<place>)\\s+)*";
const READ = new RegExp(`\\b(?:from|read|reads|reading|check|checks|in)\\s+${DET}([\\w./-]+)`, "gi");
const FROM = new RegExp(`\\bfrom\\s+${DET}([\\w./-]+)`, "gi");
/** where a rule puts what it makes without a making verb ("each a file in people/", "the week's lesson in lessons/",
 *  "in made/<date>-notes.md"): a path with a folder after "in", unless a reading word stands just before it ("a new
 *  file in inbox/", "every page in notes/") */
const PUT = /\bin\s+((?:[\w.-]+\/)+[\w.<>-]*)/gi;
const READING = /\b(?:new|every|all|read|reads|reading|check|checks|walk|walks|watch|watches|look|looks|from)\b/i;
const fileKey = (f: string) => f.toLowerCase().replace(/^[-_]+/, "");
const words = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[1].toLowerCase().replace(/'s$/, "").replace(/[.,;:]+$/, "")).filter((w) => w && !NOT_READ.has(w) && !/^\d/.test(w));
/** what a rule reads and what it makes (pure), the place, names and dates masked. Reads: its source unless that is
 *  a trigger (a clock, a date), the files and things named before it turns to making, and anything "from …". Makes:
 *  the files named after that turn, else the kind of thing its words say (a message, a list, a note). Never the
 *  trigger: a clock says when, not what. */
export function ruleShape(r: Pick<RuleIn, "sentence" | "source" | "names">): { reads: string[]; made: string[] } {
  const s = maskOf(r.sentence, r.names);
  const m = OUT.exec(s);
  const readSide = m ? s.slice(0, m.index) : s, madeSide = m ? s.slice(m.index) : "";
  const reads = new Set<string>(inputs([r.source]));
  for (const f of filesIn(readSide)) reads.add(fileKey(f));
  for (const w of words(READ, readSide)) reads.add(w);
  for (const w of words(FROM, s)) reads.add(w);
  // what it puts in a folder with no making verb is made, and not read
  const put = [...s.matchAll(PUT)].filter((x) => !READING.test(s.slice(0, x.index).split(/\s+/).slice(-4).join(" ")))
    .map((x) => fileKey(x[1].replace(/[.,;:]+$/, "")));
  for (const r of [...reads]) if (put.some((p) => p === r || p.startsWith(r) || p.endsWith(`-${r}`))) reads.delete(r);
  const makes = madeSide.replace(FROM, " ");
  const made = new Set<string>([...put, ...filesIn(makes).map(fileKey)].filter((f) => !reads.has(f)));
  if (!made.size && makes.trim()) { const k = madeOf(makes).kind; if (k) made.add(k); }
  return { reads: [...reads].sort(), made: [...made].sort() };
}
/** a rule's shape, or a chain's (chains.ts): its members' reads and makes together (pure) */
export function unitShape(u: Pick<RuleIn, "sentence" | "source" | "names"> & { members?: Pick<RuleIn, "sentence" | "source" | "names">[] }): { reads: string[]; made: string[] } {
  if (!u.members?.length) return ruleShape(u);
  const reads = new Set<string>(), made = new Set<string>();
  for (const m of u.members) { const s = ruleShape(m); s.reads.forEach((r) => reads.add(r)); s.made.forEach((x) => made.add(x)); }
  return { reads: [...reads].sort(), made: [...made].sort() };
}
/** the inputs a rule or a chain reads from outside (its sources but a trigger): two of one place apart are two channels */
export const channelOf = (u: Pick<RuleIn, "source"> & { members?: Pick<RuleIn, "source">[] }) => inputs((u.members?.length ? u.members : [u]).map((m) => m.source));
/** a chain's way in (pure): its first rule that brings work in from outside (any source but a clock), else its first
 *  rule; a rule is its own. Two chains are asked "same job?" by their ways in: asked whole, a chain's later steps
 *  outweighed what both start from (two course chains: 0.19 whole, 0.59 by their ways in, 2026-11-17) */
export const wayIn = (u: RuleIn): RuleIn => { const ms = u.members?.length ? u.members : [u]; return ms.find((m) => !TRIGGERS.has(m.source)) ?? ms[0]; };
/** Jev null, for rules (pure): the same job when they read the same things and make the same things, and there is
 *  something to compare. Two rules that share only a trigger (both on a clock) are different jobs. */
export function sameRuleByCode(a: Pick<RuleIn, "sentence" | "source" | "names"> & { members?: RuleIn[] }, b: Pick<RuleIn, "sentence" | "source" | "names"> & { members?: RuleIn[] }): boolean {
  const x = unitShape(a), y = unitShape(b);
  const eq = (p: string[], q: string[]) => p.length === q.length && p.every((v, i) => v === q[i]);
  return (x.reads.length > 0 || x.made.length > 0) && x.made.length > 0 === y.made.length > 0 && eq(x.reads, y.reads) && eq(x.made, y.made);
}

/** a rule's steps as the person reads them side by side (pure): its sentence, already masked of its place by the
 *  caller, cut where a step ends (";", "·", a full stop, ", then"), never inside one ("this and that" stays whole) */
export const stepsOfRule = (masked: string) => masked.split(/\s*(?:[;·]|\.\s|,\s*(?:and\s+)?then\b)\s*/i).map((t) => t.trim().replace(/[.\s]+$/, "")).filter(Boolean);
/** a sentence's clauses (pure): its parts between ";", ",", "·", "and", "also", "then", each as a list of the original
 *  text and its masked, normalised form */
function clausesOf(sentence: string, names: string[]): { text: string; key: string }[] {
  return sentence.split(/\s*(?:[;,·]|\.\s|\band\b|\balso\b|\bthen\b)\s*/i).map((t) => t.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean).map((text) => ({ text, key: maskOf(text, names).toLowerCase().replace(/<(?:time|date|day|month)>/g, "").replace(/\s+/g, " ").trim() }))
    .filter((c) => c.key);
}
/** a group's core and extras (pure): the core is the rule with the fewest clauses (the first on a tie); a rule that
 *  says every clause of the core and more has its extra clauses as its place's own lines, as a learned line would be.
 *  A rule worded otherwise keeps its own sentence whole, with no extras taken out. */
export function coreOf(rules: RuleIn[]): { core: RuleIn; extras: { place: string; rule: string; line: string }[] } {
  const cl = rules.map((r) => clausesOf(r.sentence, r.names));
  let k = 0;
  cl.forEach((c, i) => { if (c.length < cl[k].length) k = i; });
  const core = new Set(cl[k].map((c) => c.key)), extras: { place: string; rule: string; line: string }[] = [];
  rules.forEach((r, i) => {
    if (i === k) return;
    const mine = new Set(cl[i].map((c) => c.key));
    if (![...core].every((c) => mine.has(c))) return;
    for (const c of cl[i]) if (!core.has(c.key)) extras.push({ place: r.place, rule: r.rule, line: c.text });
  });
  return { core: rules[k], extras };
}
/** a pair of rules Jev put in the half band, in places of one kind: never merged silently, never left unseen; the
 *  person is asked (meta/join.ts). `a` is the rule already grouped, `b` the one that started a job of its own */
export type HalfPair = { a: RuleIn; b: RuleIn; p: number };
/** the key of a pair of rules, either order (pure) */
export const pairKey = (a: { folder: string; rule: string }, b: { folder: string; rule: string }) => [`${a.folder}#${a.rule}`, `${b.folder}#${b.rule}`].sort().join("|");
/** existing rules into jobs: Jev "same job?" (the rule question: the core) over the sentences with the place masked;
 *  Jev null: what each reads and makes (sameRuleByCode), never the trigger alone. A job never holds two rules of one
 *  place (one instance each), so a place's two jobs stay two. The three bands, as everywhere in Sol: ≥ JEV_SAME one
 *  job; JEV_HALF..JEV_SAME, and the two places of one kind (`oneKind`), the rule starts a job of its own and the pair
 *  is kept in `half` to be asked (the highest score first, one per rule; never a pair in `apart`); under, another job.
 *  Jev null and pairs across kinds are never asked. */
/** `asksSame` (the late look, agents.json already there, #1381): nothing is merged by itself, a same-band pair of
 *  one kind is asked as a half-band one is; Jev null merges nothing either */
export async function groupRules(rules: RuleIn[], ask: Ask, o: { oneKind?: (a: string, b: string) => Promise<boolean>; apart?: Set<string>; half?: HalfPair[]; asksSame?: true } = {}): Promise<RuleGroup[]> {
  const groups: RuleGroup[] = [], gate = limiter();   // one cap for the whole grouping: an unread answer still counts
  for (const r of rules) {
    const mine = maskOf(r.sentence, r.names), way = maskOf(wayIn(r).sentence, r.names);
    let home = null as RuleGroup | null;   // set inside inOrder's reader
    const halves: HalfPair[] = [];
    // the groups so far asked a few at a time (inOrder), the answers read in order: the first "same" is its home. A
    // group already in this place is one only for another channel (its inputs all other than this rule's: a second
    // inbox of the same job), and only on Jev's word, never code's
    const mineIn = channelOf(r);
    const other = (g: RuleGroup) => g.rules.filter((x) => x.place === r.place).every((x) => { const c = channelOf(x); return c.length > 0 && mineIn.length > 0 && !c.some((s) => mineIn.includes(s)); });
    const open = groups.filter((g) => !g.rules.some((x) => x.place === r.place) || other(g));
    await inOrder(open, (g) => ask("rule", maskOf(wayIn(g.rules[0]).sentence, g.rules[0].names), way), (p, g) => {
      const here = g.rules.some((x) => x.place === r.place);
      if (here) { if (!o.asksSame && p !== null && bandOf(p) === "same") { home = g; return true; } return; }
      if (!o.asksSame && (p === null ? sameRuleByCode(g.rules[0], r) : bandOf(p) === "same")) { home = g; return true; }
      if (p !== null && (bandOf(p) === "half" || (o.asksSame && bandOf(p) === "same")) && o.half) halves.push({ a: g.rules[0], b: r, p });
    }, gate);
    if (home) { home.rules.push(r); continue; }
    groups.push({ rules: [r], job: mine });
    for (const h of halves.sort((x, y) => y.p - x.p)) {
      if (o.apart?.has(pairKey(h.a, h.b)) || !o.oneKind || !(await o.oneKind(h.a.place, h.b.place))) continue;
      o.half!.push(h);
      break;
    }
  }
  return groups;
}
export type RuleGroup = { rules: RuleIn[]; job: string };
/** the same, by code alone (no Jev): sync */
export function groupRulesByCode(rules: RuleIn[]): RuleGroup[] {
  const groups: RuleGroup[] = [];
  for (const r of rules) {
    const g = groups.find((x) => !x.rules.some((y) => y.place === r.place) && sameRuleByCode(x.rules[0], r));
    if (g) g.rules.push(r); else groups.push({ rules: [r], job: maskOf(r.sentence, r.names) });
  }
  return groups;
}

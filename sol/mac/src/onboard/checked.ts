// Checking each folder (#1423; Marco's go 2026-11-17, drawn at mine/look/onboarding/folder-check.html): after "this is
// my Home", and after "+" makes a folder, each new folder is opened once and shows what was put in it. A row pressed is
// over: on "<folder> is right" it is the "no" answer on that thing in the record, the same as Home's answer in place
// (OneHome `answer`, #1227); an unsure row pressed closes its ask with "no"; one left alone keeps its ring in Home.
// "Anything missing?" is one sentence, kept in this folder as a thing they said. "check later" leaves the folder in
// `unchecked` and puts it in `later`: Home rings it until it is opened, and the card never asks it again (a reload too). Nothing new in the engine: the record (record.ts) carries the list.
// Pure: the record and the answers in, the record out; Check.tsx draws it, OneHome.tsx writes it.
import type { Fact, Record } from "./record";
import type { Confirm } from "./sort";

/** the folders still to check, in Home's order; a folder gone since (put inside another) is not asked */
export const toCheck = (rec: Record): Record["areas"] => (rec.unchecked ?? []).filter((id) => !(rec.later ?? []).includes(id)).map((id) => rec.areas.find((a) => a.id === id)).filter((a): a is Record["areas"][number] => !!a);

/** the folder's question, by its part (never a word of one person's life) */
export const questionOf = (part: Record["areas"][number]["part"]): string =>
  part === "school" ? "Is this still your term?" : part === "work" ? "Is this still your work?" : part === "build" ? "Are these still your projects?" : "Is this still yours?";

export type Row = { id: string; t: string; s: string; unsure: boolean };
/** the folder's things as rows: the unsure first (each with the ask that is still open on it), then the rest */
export function rowsOf(rec: Record, area: string, open: readonly Confirm[]): Row[] {
  const asked = new Set(open.map((c) => c.fact).filter(Boolean));
  const rows = rec.facts.filter((f) => f.area === area && f.st !== "no").map((f) => ({ id: f.id, t: f.v, s: [f.when !== f.v && f.when, f.src].filter(Boolean).join(" · "), unsure: asked.has(f.id) }));
  return [...rows.filter((r) => r.unsure), ...rows.filter((r) => !r.unsure)];
}

const DAY = /\b(mon|tues|wednes|thurs|fri|satur|sun)days?\b|\b(every|weekly)\b/i;
/** the one sentence, as a thing in the folder (a dated or weekly thing goes to the folder's week, the rest to coming) */
export const saidFact = (sentence: string, area: string, at = new Date().toISOString()): Fact => ({
  id: `said-${area}-${Date.parse(at).toString(36)}`, k: "said", v: sentence.trim(), src: "you wrote it", kind: "event", sure: true,
  ...(DAY.test(sentence) ? { repeats: true, when: sentence.trim() } : {}), st: "said", area, at });   // the week strip reads its days from `when`

/** "<folder> is right": what was pressed is over, the sentence is in, and the folder is checked */
export function afterCheck(rec: Record, area: string, over: ReadonlySet<string>, said: string, open: readonly Confirm[], at?: string): Record {
  const add = said.trim() ? [saidFact(said, area, at)] : [];
  const closes = open.filter((c) => c.fact && over.has(c.fact));
  return {
    ...rec,
    facts: [...rec.facts.map((f) => (f.area === area && over.has(f.id) ? { ...f, st: "no" as const } : f)), ...add],
    areas: rec.areas.map((a) => (a.id === area ? { ...a, facts: [...a.facts, ...add.map((f) => f.id)] } : a)),
    confirmed: { ...rec.confirmed, ...Object.fromEntries(closes.map((c) => [c.id, "no" as const])) },
    unchecked: (rec.unchecked ?? []).filter((id) => id !== area), later: (rec.later ?? []).filter((id) => id !== area),
  };
}

/** "check later": the folder stays ringed in Home, and the card does not ask it again */
export const putOff = (rec: Record, area: string): Record => ({ ...rec, later: [...new Set([...(rec.later ?? []), area])] });

/** a folder opened in Home counts as checked: it was seen whole (the ring goes) */
export const opened = (rec: Record, area: string): Record | null => ((rec.unchecked ?? []).includes(area) ? { ...rec, unchecked: rec.unchecked!.filter((id) => id !== area), later: (rec.later ?? []).filter((id) => id !== area) } : null);

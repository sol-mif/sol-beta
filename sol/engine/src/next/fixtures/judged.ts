// The judged cases (BR1 quiet canvas, #1615; quiet.html §3 "Judged cases, the same for every home"): the drawing's eight,
// and forty on invented homes, run through the one judgment (next/raise.ts) and read cold: "would you care?". A raise
// that reads as junk fails; a silence the reader would have wanted told is a miss.
// The homes: a developer's and a shop owner's months and a consultant's (the panel's fixtures, dev-, denise- and
// lucy-month.jsonl, made by make.mjs): each case is one ask of the month, its words made by needs.ts as the engine makes
// them, and its moment read from the acts before it (the folder the person was in, what they said and answered there,
// how the runs ended), some with one line added to try a rule (a Later twice, an answer already in the folder). The
// panel has no student, so the student's home is written here by hand, in the same shape.
// The judgment and the reader are handed in, so the test (judged.test.ts) runs the cases with stubs and judged-run.ts
// runs them with the person's model and Jev on the NucBox; the number goes on the team's checks before BR1 ships.
// Signed: marcocyl04-ux's agent (builder J), BR1 (#1615).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankNeeds, type NeedsIn } from "../needs.js";
import { agoWords, careOf, judgePrompt, readJudgment, type Cand, type Care, type Moment, type Say } from "../raise.js";

/** what the drawing says a case comes to: a raise (a line or more), a dot, or silence; null for a case read cold only */
export type Expect = "raise" | "dot" | "silence" | null;
export type Case = { id: string; home: "drawing" | "developer" | "shop" | "consultant" | "student"; cand: Cand; moment: Omit<Moment, "bar">; expect: Expect };

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3600e3, MIN = 60e3;
const T0 = Date.UTC(2026, 10, 20, 15, 0);
const c = (id: string, folder: string, words: string, from: string, o: Partial<Cand> = {}): Cand => ({ id, folder, words, from, stopped: false, ...o });
const m = (lines: Record<string, string[]>, here: string | null = null, now = T0): Omit<Moment, "bar"> => ({ now, here, lines });

// ------------------------------------------------------------------------------- the drawing's eight (quiet.html §3)

const DRAWING: Case[] = [
  { id: "d1", home: "drawing", expect: "raise", cand: c("t:d1", "Client sites", "Photos for cakes and ices, or leave space?", "a working session asks the person", { stopped: true, due: T0 + 4 * H }),
    moment: m({ "Client sites": ["You were talking to the Desserts page session (3 min ago)", "You promised the client a preview today (2 days ago)"] }, "Client sites") },
  { id: "d2", home: "drawing", expect: "silence", cand: c("t:d2", "Client sites", "Starters and mains page finished and saved menu.html", "a session finished normally"),
    moment: m({ "Client sites": ["You asked for the starters and mains page (1 h ago)"] }) },
  { id: "d3", home: "drawing", expect: "raise", cand: c("t:d3", "Portfolio", "A case study draft, written from Friday's work: read it, or leave it for later?", "an agent's draft waits"),
    moment: m({ Portfolio: ["You opened Portfolio (2 days ago)", "You opened Portfolio (4 days ago)", "You asked for a case study draft from Friday's work (2 days ago)"] }) },
  { id: "d4", home: "drawing", expect: "silence", cand: c("t:d4", "Old drafts", "A new file arrived: notes-3.txt", "something new in a folder"),
    moment: m({ "Old drafts": ["You last opened Old drafts (34 days ago)"] }) },
  { id: "d5", home: "drawing", expect: "silence", cand: c("t:d5", "Invoices", "The invoice run ran as usual and made 5 invoices", "a routine automation ran"),
    moment: m({ Invoices: ["The invoice run runs every Monday at 09:00 (set 3 weeks ago)", "The invoice run ran as usual (7 days ago)"] }) },
  { id: "d6", home: "drawing", expect: "raise", cand: c("t:d6", "Invoices", "The invoice run failed: the bank export was empty. Retry, or skip this week?", "a routine automation failed", { due: T0 + 1 * H }),
    moment: m({ Invoices: ["The invoice run runs every Monday at 09:00 (set 3 weeks ago)", "Its next run is in 1 h", "The invoice run ran as usual (7 days ago)"] }) },
  { id: "d7", home: "drawing", expect: "dot", cand: c("t:d7", "Portfolio", "A new mood board from the agent: keep it?", "an agent's draft waits"),
    moment: m({ Portfolio: ["You said later to a mood board from the agent (2 days ago)", "You said later to a mood board from the agent (5 days ago)", "You answered the case study question (1 days ago)"] }) },
  { id: "d8", home: "drawing", expect: "silence", cand: c("t:d8", "Client sites", "Which font does the bistro site use for headings?", "a working session asks the person"),
    moment: m({ "Client sites": ["The bistro site's style file says headings use Fraunces (read 1 h ago)"] }) },
];

// ------------------------------------------------------------------------------- the panel's months

type Act = { id: string; at: number; day: number; who: string; act: string; place: string; ask?: string; need?: any; words?: string; outcome?: string; yes?: unknown; run?: string };
const monthOf = (file: string): Act[] => readFileSync(join(HERE, file), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((a) => a.id);

/** one ask of a month as the engine would judge it: needs.ts's words, and the moment read from the acts before it */
export function fromMonth(acts: Act[], askId: string, extra: string[] = []): { cand: Cand; moment: Omit<Moment, "bar"> } {
  const a = acts.find((x) => x.act === "ask" && x.ask === askId);
  if (!a) throw new Error(`no ask ${askId}`);
  const n = a.need, i: NeedsIn = { things: [], perms: [], stage: [], drafts: [] };
  if (n.src === "perm") i.perms.push({ sessionId: n.sessionId, item: n.item });
  else if (n.src === "thing") i.things.push({ id: askId, read: n.read ?? "you", folder: a.place, words: n.words, state: "asks", waitsOn: "you", ...(n.due ? { due: n.due } : {}) });
  else if (n.src === "stage") i.stage.push({ project: n.project, id: n.id, title: n.title, q: n.q, choices: n.choices ?? [] });
  else i.drafts.push({ folder: n.folder, sticky: n.sticky, line: n.line });
  const need = rankNeeds(i)[0];
  const person = acts.find((x) => !x.who.startsWith("ai:") && x.who !== "sol")?.who ?? "";
  const before = acts.filter((x) => x.at < a.at && a.at - x.at < 3 * 864e5);
  const mine = before.filter((x) => x.who === person);
  const last = mine[mine.length - 1];
  const here = last && a.at - last.at < 30 * MIN ? last.place : null;
  const lines: string[] = [];
  for (const x of [...before].reverse()) {
    if (lines.length >= 8) break;
    const near = x.place === a.place || x.place.startsWith(`${a.place}/`) || a.place.startsWith(`${x.place}/`);
    if (!near) continue;
    const ago = agoWords(a.at - x.at);
    if (x.act === "say" && x.who === person) lines.push(`You said "${String(x.words).slice(0, 80)}" (${ago})`);
    else if (x.act === "answer") lines.push(`You answered an ask here (${ago})`);
    else if (x.act === "run.end") lines.push(`A run here ended: ${x.outcome ?? "done"} (${ago})`);
    else if (x.act === "ask" && x.ask !== askId) { const done = acts.some((y) => y.act === "answer" && y.ask === x.ask && y.at < a.at); lines.push(`An ask here ${done ? "was answered" : "is still open"} (${ago})`); }
  }
  return { cand: { ...candFrom(need), folder: a.place }, moment: { now: a.at, here, lines: { [a.place]: [...extra, ...lines] } } };
}
const candFrom = (n: ReturnType<typeof rankNeeds>[number]): Cand => ({ id: n.id, folder: n.piece, words: n.words, from: n.why, stopped: !!n.stopped, due: n.due });

const MONTHS: { file: string; home: Case["home"]; asks: [string, string[]?][] }[] = [
  { file: "dev-month.jsonl", home: "developer", asks: [
    ["dev-a1"], ["dev-a3"], ["dev-a4"], ["dev-a6"], ["dev-a12"], ["dev-a20", ["You said later to an ask like this, a test run (1 days ago)", "You said later to an ask like this, a test run (3 days ago)"]],
    ["dev-a36"], ["dev-a63"], ["dev-a64"], ["dev-a65"], ["dev-a66"], ["dev-a67"], ["dev-a30", ["The session's own notes say the tests already passed on this branch (10 min ago)"]], ["dev-a61"], ["dev-a28"], ["dev-a45"],
  ] },
  { file: "denise-month.jsonl", home: "shop", asks: [
    ["denise-a1"], ["denise-a2"], ["denise-a3"], ["denise-a4"], ["denise-a7"], ["denise-a2", ["Your booking page says Thursdays are closed (read 1 h ago)"]],
    ["denise-a3", ["You confirmed the new client's time by phone this morning (3 h ago)"]], ["denise-a7", ["You passed by this week's newsletter draft (7 days ago)", "You passed by last week's newsletter draft (14 days ago)"]],
  ] },
  { file: "lucy-month.jsonl", home: "consultant", asks: [["lucy-a2"], ["lucy-a1"], ["lucy-a12"], ["lucy-a11"], ["lucy-a62"], ["lucy-a4"]] },
];

// ------------------------------------------------------------------------------- the student, by hand

const S0 = Date.UTC(2026, 10, 18, 20, 0);
const STUDENT: Case[] = ([
  ["s1", "Biology", "Your lab report is due at 23:59: submit the draft the agent finished?", "an agent's draft waits", { due: S0 + 4 * H }, ["You asked the agent to finish the lab report tonight (2 h ago)"], "Biology", "raise"],
  ["s2", "Biology", "The agent saved your lecture notes for week 9", "a session finished normally", {}, ["You asked for the week 9 notes (3 h ago)"], null, "silence"],
  ["s3", "Statistics", "Allow the session to run python analysis.py?", "a working session asks permission", { stopped: true }, ["You were working in Statistics (just now)", "Problem set 6 is due tomorrow at 9am (read 1 days ago)"], "Statistics", "raise"],
  ["s4", "Job hunt", "A new job post was saved to the folder", "something new in a folder", {}, ["You last opened Job hunt (40 days ago)"], null, "silence"],
  ["s5", "Job hunt", "The cafe wants to know if you can do Saturday's shift: yes or no?", "a thing in the folder waits on the person", { due: S0 + 18 * H }, ["You said you can do weekend shifts (5 days ago)", "You opened Job hunt (1 days ago)"], null, "raise"],
  ["s6", "Housing", "The rent reminder ran as usual", "a routine automation ran", {}, ["The rent reminder runs on the 1st (set 2 months ago)"], null, "silence"],
  ["s7", "Housing", "The rent payment failed: card declined. Pay another way?", "a routine automation failed", { due: S0 + 24 * H }, ["Rent is due on the 20th (read 2 months ago)"], null, "raise"],
  ["s8", "History", "Which citation style does the essay use?", "a working session asks the person", { stopped: true }, ["The course page says all essays use Chicago style (read 3 days ago)"], null, "silence"],
  ["s9", "Clubs", "A new flyer for the climbing club: keep it?", "an agent's draft waits", {}, ["You said later to a flyer from the agent (2 days ago)", "You said later to a flyer from the agent (6 days ago)", "You answered the climbing club's dates question (1 days ago)"], null, "dot"],
  ["s10", "Statistics", "Group project: Sam asks which dataset you picked, they start tonight", "a thing in the folder waits on the person", { due: S0 + 3 * H }, ["You picked the city bikes dataset (2 days ago)"], null, "raise"],
  ["s11", "Biology", "Flashcards for chapter 12 are ready", "an agent's draft waits", {}, ["Your exam is in 3 weeks (read 1 days ago)"], null, null],
  ["s12", "Statistics", "The session fixed a typo in your notes", "a session finished normally", {}, [], null, "silence"],
] as [string, string, string, string, Partial<Cand>, string[], string | null, Expect][]).map(([id, folder, words, from, o, lines, here, expect]) => ({ id, home: "student" as const, expect, cand: c(`t:${id}`, folder, words, from, o), moment: m({ [folder]: lines }, here, S0) }));

/** every case, in order: the drawing's, the months', the student's */
export function cases(): Case[] {
  const out: Case[] = [...DRAWING];
  for (const mo of MONTHS) {
    const acts = monthOf(mo.file);
    mo.asks.forEach(([ask, extra], i) => { const { cand, moment } = fromMonth(acts, ask, extra ?? []); out.push({ id: `${mo.home}-${i + 1}`, home: mo.home, cand: { ...cand, id: `${cand.id}#${i}` }, moment, expect: null }); });
  }
  return [...out, ...STUDENT];
}

// ------------------------------------------------------------------------------- the run

/** the cold reader: the case's situation and what Sol showed (or that it stayed silent); how sure it is the person
 *  would care to be told this now, 0..1, or null */
export type Cold = (situation: string, shown: string) => Promise<number | null>;
export type Row = { id: string; home: Case["home"]; expect: Expect; care: Care; got: "raise" | "dot" | "silence"; cold: number | null; ok: boolean; why: string };
const gotOf = (l: number): Row["got"] => (l >= 2 ? "raise" : l === 1 ? "dot" : "silence");
export const situationOf = (k: Case) => [`The person is ${k.moment.here ? `in ${k.moment.here}` : "looking at all their folders"}.`, ...Object.entries(k.moment.lines).flatMap(([f, ls]) => [`In ${f}:`, ...ls.map((l) => `- ${l}`)]), `Waiting: ${k.cand.words} (${k.cand.from}${k.cand.stopped ? "; work is stopped until they answer" : ""}${k.cand.due ? `; due in ${Math.max(0, Math.round((k.cand.due - k.moment.now) / H))} h` : ""})`].join("\n");

/** each case judged alone (its own moment), then read cold. A raise reading under 0.45 is junk; a silence reading 0.7
 *  and over is a miss; a dot passes both ways unless the drawing says otherwise. The drawing's cases must also match */
export async function runCases(all: Case[], say: Say, cold: Cold, o: { each?: (r: Row) => void } = {}): Promise<{ rows: Row[]; n: number; raised: number; worth: number; silent: number; missed: number; drawing: { n: number; matched: number }; passed: number }> {
  const rows: Row[] = [];
  for (const k of all) {
    const text = await say(judgePrompt({ ...k.moment, bar: "usual" }, [k.cand]));
    const care = careOf(k.cand, readJudgment(text, [k.cand.id])[k.cand.id], "usual"), got = gotOf(care.level);
    const shown = got === "silence" ? "Sol stayed silent about it." : `Sol raised it as a ${got === "dot" ? "dot" : care.level === 2 ? "one-line note" : "question"}: "${k.cand.words}" because: ${care.why}`;
    const v = await cold(situationOf(k), shown);
    const coldOk = v === null ? true : got === "raise" ? v >= 0.45 : got === "silence" ? v < 0.7 : true;
    const drawOk = !k.expect || k.expect === got;
    const r: Row = { id: k.id, home: k.home, expect: k.expect, care, got, cold: v, ok: coldOk && drawOk, why: !drawOk ? `the drawing says ${k.expect}` : !coldOk ? (got === "raise" ? "reads as junk" : "a miss") : "" };
    rows.push(r);
    o.each?.(r);
  }
  const raised = rows.filter((r) => r.got === "raise"), silent = rows.filter((r) => r.got === "silence"), dr = rows.filter((r) => r.home === "drawing");
  return {
    rows, n: rows.length, raised: raised.length, worth: raised.filter((r) => r.cold === null || r.cold >= 0.45).length,
    silent: silent.length, missed: silent.filter((r) => r.cold !== null && r.cold >= 0.7).length,
    drawing: { n: dr.length, matched: dr.filter((r) => r.expect === r.got).length }, passed: rows.filter((r) => r.ok).length,
  };
}

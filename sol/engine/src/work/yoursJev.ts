// Build becomes yours (#1089): the fast picks, asked of Jev (TypeSafe's System One, agent/jev.ts holds the key and the
// address). Each answer is a probability, and one rule reads it: 0.7 and over acts on its own, 0.45 and over shows as a
// ghost the Sol user can press, under that nothing. No key, an error, or no answer in 4 s: null, and the caller keeps its
// own rule, quietly.
//
// Prompts, memory and transcripts never leave this machine. Jev is told the SHAPE of a repeat only: how many, in how many
// sessions, over how many days, the most in one day, how alike (a percent), each blank's kind by rule and how many values
// it had, the length in words, how many things are kept. No ask, no value, no title, no typed word (`shapeOf` below is
// the one place the state is made, and a test pins that no letter of an ask reaches it).
//   worth   is this group worth offering at all
//   first   which version stands picked first (button, rows, brief)
// Not Jev's: a blank's name, the title, what "say…" means: rules on this machine (yours.ts, yoursKeep.ts).
import { JEV_URL, jevKey } from "../agent/jev.js";
import type { Offer } from "./yours.js";

export const ACT = 0.7, GHOST = 0.45;
export type Verdict = "act" | "ghost" | "none";
/** what a probability lets happen (pure) */
export const verdict = (p: number | null | undefined): Verdict => (typeof p !== "number" || !Number.isFinite(p) ? "none" : p >= ACT ? "act" : p >= GHOST ? "ghost" : "none");

type Question = { type: "noul"; instructions: string; criteria: { true: string; false: string } } | { type: "choice"; instructions: string; criteria: Record<string, string> };
export type Answer = { noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number> };
export type Ask = (state: Record<string, string>, questions: Record<string, Question>) => Promise<Record<string, Answer> | null>;

/** the client: one POST, the answers or null (no key, an error, over the budget) */
export function makeAsk(o: { fetch?: typeof fetch; key?: string | null; budget?: number } = {}): Ask | null {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key) return null;
  const f = o.fetch ?? fetch;
  return async (state, questions) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.budget ?? 4000);
    try {
      const short = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, String(v).slice(0, 1200)]));
      const r = await f(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "jev-latest", state: short, questions }), signal: ac.signal });
      if (!r.ok) return null;
      const a = (await r.json() as { answers?: Record<string, Answer> })?.answers;
      return a && typeof a === "object" ? a : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  };
}

let ask: Ask | null | undefined;
/** the tests' own Jev (or null: no Jev at all) */
export const setYoursJev = (f: Ask | null) => { ask = f; };
const jev = () => (ask === undefined ? (ask = makeAsk()) : ask);

const p01 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);
/** a choice's answer: the option and how sure, only when it is one of the options asked (pure) */
export function chosen(a: Answer | undefined, options: string[]): { pick: string; p: number } | null {
  if (!a || typeof a.choice !== "string" || !options.includes(a.choice)) return null;
  const p = p01(a.probabilities?.[a.choice]) ?? p01(a.confidence);
  return p === null ? null : { pick: a.choice, p };
}

/** a blank's kind by rule: its name without the number a second one of the same kind carries (pure) */
const KINDS = new Set(["PR", "issue", "branch", "link", "date", "folder", "file", "number", "name", "invoice", "order", "ticket", "room", "table", "week", "chapter", "page",
  "hours", "minutes", "days", "weeks", "months", "pages", "words", "items", "people", "slides", "questions", "euros", "dollars", "pounds"]);
const kindOf = (name: string) => { const k = name.replace(/ \d+$/, ""); return KINDS.has(k) ? k : "other"; };   // never a word of theirs
/** what Jev may read of an offer: numbers and kinds, nothing typed (pure) */
export function shapeOf(o: Offer, kept = 0): Record<string, string> {
  const words = o.template.split(/\s+/).filter((w) => w && !/^\{[^}]*\}$/.test(w)).length;
  return {
    kind: o.kind, count: String(o.count), sessions: String(o.sessions),
    days: String(Math.max(1, Math.round((o.last - o.first) / 86_400_000))),
    most_in_one_day: String(o.most ?? o.count),
    alike_percent: String(o.alike ?? 0),
    blanks: o.blanks.length ? o.blanks.map((b) => `${kindOf(b.name)} (${b.values.length} values)`).join("; ") : "none",
    length_words: String(words),
    kept: String(kept),
  };
}

/** worth: may this group be offered (noul). null when Jev is not there */
export async function worth(o: Offer, kept = 0): Promise<number | null> {
  const j = jev(); if (!j) return null;
  const what = o.kind === "correction" ? "corrections a person typed to their AI agent right after its answer" : o.kind === "checkin" ? "short check-ins a person typed to their AI agent" : "asks a person typed to their AI agent";
  const a = await j(shapeOf(o, kept), { worth: { type: "noul",
    instructions: `This is the shape of a repeat: ${what}, counted on their machine (no words of it are given). Is it a habit worth offering as a small thing of theirs?`,
    criteria: { true: "it spans more than one day, most of the words stay the same each time, and a few values change (or none, for a correction or a check-in)", false: "one day's burst, nothing alike, or everything changing each time" } } });
  return p01(a?.worth?.noul);
}

/** first: which made version stands picked first */
export async function firstOf(o: Offer, shapes: string[]): Promise<{ shape: string; v: Verdict } | null> {
  const j = jev(); if (!j || shapes.length < 2) return null;
  const crit: Record<string, string> = { button: "two or more blanks to fill each time", rows: "one blank carries the change and has three or more values", brief: "the ask is long and little stays the same" };
  const a = await j(shapeOf(o), { first: { type: "choice", instructions: "Which form of a small tool will this person reach for first, given the shape of their repeated ask?", criteria: Object.fromEntries(shapes.map((s) => [s, crit[s] ?? s])) } });
  const c = chosen(a?.first, shapes);
  return c ? { shape: c.pick, v: verdict(c.p) } : null;
}

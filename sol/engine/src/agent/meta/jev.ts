// Agents' meta (#1327, pass 2): Jev's three questions, as the other Jev clients are made (whereJev.ts, doneJev.ts): a
// pure body builder, a pure answer reader, a thin call. Each is a `noul` over two short texts the caller has already
// masked (traces.ts maskOf: the place, people's names and dates taken out), so Jev weighs the shape of the work, never
// whose it is. No Jev key: the same question goes to the person's own cheapest model (own.ts, #1476), a few a day. An
// error, over the budget, past the day's count or an answer that is not a number: null, and the caller falls back to
// code (jobs.ts sameByCode, kinds.ts: the shape alone, learn.ts: the same words).
//   job   "same job?"            two traces
//   rule  "same job?"            two rule sentences: the core (input, trigger, thing made); extras on top still the same
//   kind  "same kind of place?"  two sibling places, each by its shape (what it holds, its sources, its rules)
//   fix   "same fix?"            two edits a person made to an agent's work (before → after)
//   feeds "does one use what the other makes?"  two rules of one place: a link of a chain (chains.ts), the brief's
//         wording and the only one (2026-11-17: a wording tuned on one person's own Sol is not kept)
// limiter, inOrder: how the meta asks many (groupRules, kindsOf): at most JEV_AT_ONCE questions in flight, started in
// order, their answers read in order, so a caller decides exactly as it did asking one at a time.
import { JEV_URL, jevKey } from "../jev.js";
import { isQuiet } from "../../quiet.js";
import { JEV_AT_ONCE, JEV_BUDGET_MS } from "./numbers.js";
import { defaultOwn, type Own } from "./own.js";

export type Question = "job" | "rule" | "kind" | "fix" | "feeds";
/** how the meta asks Jev; a test hands in its own */
export type Ask = (q: Question, a: string, b: string) => Promise<number | null>;

const ASK: Record<Question, { instructions: string; yes: string; no: string }> = {
  job: {
    instructions: "Two times a person did some work, with the place, the names and the dates taken out. Is it the same job, done again?",
    yes: "the same work: it reads the same kind of input and makes the same kind of thing, in the same steps",
    no: "different work: another input, another thing made, or other steps",
  },
  rule: {
    instructions: "Two standing rules an assistant follows, each in one place, with the place, the names and the dates taken out. Look at the core of each: what it reads, on what kind of trigger (a time, a new file, a message), and what kind of thing it makes. Is it the same job? One rule saying more than the other (more detail, an extra output on top) is still the same job.",
    yes: "the same job: the same input read, on the same kind of trigger, making the same kind of thing, even if one does extra on top",
    no: "different jobs: another input, another kind of thing made, or another kind of trigger",
  },
  kind: {
    instructions: "Two places in a person's life (folders, or the items a source lists), each by its shape, with its own name taken out: the sub-folders and files it holds at its top, the sources it is linked to, its rules, the first words of its notes. Could one job run in each? Are they the same kind of place?",
    yes: "the same kind: siblings that hold the same sort of thing, so one job could run in each, even when one holds more than the other",
    no: "different kinds: they hold different sorts of things, so a job made for one would not fit the other",
  },
  fix: {
    instructions: "Two edits a person made to what an assistant made, each as before → after. Is it the same fix, the same preference said twice?",
    yes: "the same change of the same sort, so the assistant should always do it",
    no: "different changes",
  },
  feeds: {
    instructions: "Two standing rules an assistant follows in one place, with the place, the names and the dates taken out. Does one of them use what the other makes (its file, its notes, its list, its plan), so that together they are one chain of work?",
    yes: "one uses what the other makes: the second reads or builds on the first one's output",
    no: "neither uses what the other makes: two separate pieces of work that only share a place",
  },
};

/** the request (pure) */
export function metaBody(q: Question, a: string, b: string) {
  const k = ASK[q];
  return {
    model: "jev-latest",
    state: { first: a.slice(0, 1200), second: b.slice(0, 1200) },
    questions: { same: { type: "noul", instructions: k.instructions, criteria: { true: k.yes, false: k.no } } },
  };
}
/** the answer (pure): how sure Jev is that the two are the same, 0..1; null when it did not say */
export function metaSaid(json: any): number | null {
  const v = json?.answers?.same?.noul;
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}
/** the thin call: Jev with its key; with none, the person's own model (`own`; by default own.ts's, counted in `home`,
 *  none when a test names the key); null on an error, past the budget */
export function makeAsk(o: { key?: string | null; fetch?: typeof fetch; budget?: number; own?: Own | null; home?: string } = {}): Ask {
  const own = o.own !== undefined ? o.own : o.key !== undefined ? null : defaultOwn(o.home);
  return async (q, a, b) => {
    // a quiet Sol asks Jev nothing: each call is paid and leaves this machine (#1293)
    if (isQuiet()) return null;
    if (!a.trim() || !b.trim()) return null;
    const key = o.key !== undefined ? o.key : jevKey();
    if (!key) return own ? own(ASK[q], a, b) : null;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.budget ?? JEV_BUDGET_MS);
    try {
      const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(metaBody(q, a, b)), signal: ac.signal });
      return r.ok ? metaSaid(await r.json()) : null;
    } catch { return null; } finally { clearTimeout(t); }
  };
}
/** Jev with nobody to ask (a quiet Sol, a test that wants the code's own answer) */
export const noJev: Ask = async () => null;

/** at most `n` calls in flight through it; one more waits for a place (a place is handed straight to the next) */
export function limiter(n = JEV_AT_ONCE) {
  let busy = 0;
  const waiting: (() => void)[] = [];
  return async <R>(f: () => Promise<R>): Promise<R> => {
    if (busy < Math.max(1, n)) busy++;
    else await new Promise<void>((r) => waiting.push(r));
    try { return await f(); }
    finally { const next = waiting.shift(); if (next) next(); else busy--; }
  };
}
export type Limiter = ReturnType<typeof limiter>;
/** the questions `f(x)` for each item through one limiter (by default its own, JEV_AT_ONCE), started in order; `each`
 *  reads the answers in order and returns true to stop (no more are started; those in flight end, their answers
 *  unread, still holding their places in the limiter) */
export async function inOrder<T, R>(items: T[], f: (x: T) => Promise<R>, each: (r: R, x: T, i: number) => boolean | void, gate: Limiter = limiter()): Promise<void> {
  const started: Promise<R>[] = [];
  const fill = (i: number) => {
    while (started.length < items.length && started.length < i + JEV_AT_ONCE) {
      const x = items[started.length], p = gate(() => f(x));
      p.catch(() => {});   // an answer never read is never an unhandled rejection
      started.push(p);
    }
  };
  for (let i = 0; i < items.length; i++) {
    fill(i);
    if (each(await started[i], items[i], i)) return;
  }
}

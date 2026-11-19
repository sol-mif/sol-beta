// Jev on a piece (#1092, the design: S/design/design.md, JEV): the fast picks a piece makes without a model or a menu.
// Two tonight: which waiting row goes in front, and whether a change at a pulse wants the person. Each is one question
// about a small state, answered as a probability. 0.7 and over acts; 0.45 and over shows as a ghost (a dashed hairline
// the person can press); under 0.45 nothing shows. No key, a slow answer or any error: null, and the piece keeps its
// plain rule (the oldest waiting row in front; a row wants him only when its source says so).
import { JEV_URL, jevKey } from "../agent/jev.js";
import type { Row } from "./pieces.js";

export const ACTS = 0.7, GHOST = 0.45;
export type Tier = "acts" | "ghost" | "none";
export const tierOf = (p: number | null | undefined): Tier => (p == null || !Number.isFinite(p) ? "none" : p >= ACTS ? "acts" : p >= GHOST ? "ghost" : "none");

const cut = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// a row's note can be what a sticky asks, a line of a file or an agent's words: Jev is told the title only
const rowLine = (r: Row) => cut(r.t, 120);

// ---- 1. which row is the front ----
/** at most six waiting rows are offered, in the piece's order; the options are named a to f (pure) */
export function frontBody(rows: Row[], answered: string[] = []) {
  const waiting = rows.map((r, i) => ({ r, i })).filter((x) => x.r.wants && !x.r.done).slice(0, 6);
  const names = ["a", "b", "c", "d", "e", "f"];
  const options = Object.fromEntries(waiting.map((x, k) => [names[k], rowLine(x.r)]));
  return {
    index: waiting.map((x) => x.i),
    body: {
      model: "jev-latest",
      state: {
        waiting: waiting.map((x, k) => `${names[k]}: ${rowLine(x.r)}`).join("\n"),
        answered_lately: answered.slice(0, 5).map((t) => cut(t, 120)).join("\n") || "nothing yet",
      },
      questions: {
        front: {
          type: "choice",
          instructions: "One person has these things waiting on them. Which one should be put in front of them first? Pick the one whose answer unblocks the most other work. A decision comes before something to read. Something that will break soon comes before something that only waits. If two are equal, the older one.",
          criteria: options,   // the named options, a to f: each is one waiting row
        },
      },
    },
  };
}
/** the row index Jev put in front and how sure it is (pure over the answer) */
export function frontPick(answer: unknown, index: number[]): { i: number; p: number } | null {
  const a = (answer as { answers?: { front?: { choice?: string; confidence?: number } } })?.answers?.front;
  const k = typeof a?.choice === "string" ? "abcdef".indexOf(a.choice.trim().toLowerCase()[0] ?? "") : -1;
  if (k < 0 || index[k] === undefined || typeof a?.confidence !== "number") return null;
  return { i: index[k], p: Math.min(1, Math.max(0, a.confidence)) };
}
/** what the face does with it: acts = that row is the front; ghost = the plain front stays and this row is the first
 *  name under it, dashed; none = the plain order (pure) */
export function frontOrder(rows: Row[], pick: { i: number; p: number } | null): { front: number | null; ghost: number | null } {
  const plain = rows.findIndex((r) => r.wants && !r.done), t = tierOf(pick?.p);
  if (!pick || t === "none" || pick.i === plain) return { front: plain < 0 ? null : plain, ghost: null };
  return t === "acts" ? { front: pick.i, ghost: null } : { front: plain < 0 ? null : plain, ghost: pick.i };
}

// ---- 2. does this change want him ----
/** one row before and after a pulse (before: undefined when the row is new) (pure) */
/** the only names a piece is given to Jev by: its builtin source's, a fixed word of the code; a title he typed never */
const KINDS: Record<string, string> = { waits: "what waits on him", issues: "issues", prs: "pull requests", runs: "runs on machines", systems: "systems" };
/** `kind`: the builtin source's name (anything else is told as "a tool") (pure) */
export function wantsBody(kind: string, before: Row | undefined, after: Row) {
  return {
    model: "jev-latest",
    state: { piece: KINDS[kind] ?? "a tool", before: before ? rowLine(before) : "it was not there", after: rowLine(after) },
    questions: {
      wants: {
        type: "noul",
        instructions: "A tool watches something for one person while they are away. This row just changed. Does the change need that person to do something?",
        criteria: {
          true: "something failed or stopped early; something turned ready and only they can press it; a question was put to them; a date they must meet came within two days",
          false: "it finished and there is nothing to do; a count or a time moved; it started; it is still running; someone else is handling it",
        },
      },
    },
  };
}
/** acts = the row wants him (the yellow figure); ghost = the square's rim goes dashed, no yellow, no count (pure) */
export const wantsTier = (answer: unknown): Tier => tierOf((answer as { answers?: { wants?: { noul?: number } } })?.answers?.wants?.noul);

// ---- the one call, with the agent's key; never throws, never logs the key ----
export async function askJev(body: unknown, o: { fetch?: typeof fetch; key?: string | null; budget?: number } = {}): Promise<unknown | null> {
  const key = o.key !== undefined ? o.key : jevKey();
  if (!key) return null;
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), o.budget ?? 4000);
  try {
    const r = await (o.fetch ?? fetch)(JEV_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: ac.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

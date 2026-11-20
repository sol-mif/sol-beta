// Agents' meta (#1476): Jev's questions, asked of the person's own Claude when this Sol has no Jev key. Nobody pastes a
// key: it is the Claude the person already signed in to, its cheapest family (models.ts lists them most able first, so
// the last known family: haiku today), in a bare seat (no tools, no settings, no connected servers, nothing kept). It
// is asked the very question Jev is (meta/jev.ts ASK), on the same masked texts, and answers one number 0..1, read as
// Jev's. At most OWN_PER_DAY questions a day, counted in <home>/agents-own-ai.json; past it, null, and the caller falls
// back to code as it does with no Jev at all. A quiet Sol asks nothing (#1293), and neither does a test run.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { claudeModels, cheapest as cheapestOf } from "../../models.js";
import { isQuiet } from "../../quiet.js";
import { OWN_BUDGET_MS, OWN_PER_DAY } from "./numbers.js";
import { getSettings } from "../../settings.js";

/** the day's cap now: the person's own number (settings own.perDay, set by their AI on their word), else OWN_PER_DAY */
export const ownPerDay = (): number => getSettings().own?.perDay ?? OWN_PER_DAY;

/** one of Jev's questions, in its words */
export type Words = { instructions: string; yes: string; no: string };
/** how the person's own model is asked: Jev's words and the two texts in, how sure it is (0..1) or null out */
export type Own = (k: Words, a: string, b: string) => Promise<number | null>;
/** one turn of the model: a prompt in, its text out (null: no answer); a test hands in its own */
export type Turn = (model: string, prompt: string, budget: number) => Promise<string | null>;

/** the cheapest model the person's Claude offers (pure): models.ts's pick; "haiku" (the CLI's alias) when it names none */
export const cheapest = (models: string[]): string => cheapestOf(models) ?? "haiku";

/** the prompt (pure): Jev's question and its two answers, the two texts, and "one number" */
export function ownPrompt(k: Words, a: string, b: string): string {
  return [
    k.instructions,
    `1 means: ${k.yes}.`,
    `0 means: ${k.no}.`,
    "",
    `FIRST:\n${a.slice(0, 1200)}`,
    "",
    `SECOND:\n${b.slice(0, 1200)}`,
    "",
    "Answer with one number from 0 to 1, how sure you are that the answer is 1. Nothing else.",
  ].join("\n");
}
/** the answer (pure): the first number in it, 0..1; null when there is none or it is out of range */
export function ownSaid(text: string | null): number | null {
  const m = /(?:^|[^\d.])(\d*\.?\d+)/.exec(text ?? "");
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

/** the day's count (pure over the file's text): how many were asked on `day` */
export function usedOn(text: string, day: string): number {
  try { const j = JSON.parse(text); return j?.day === day && Number.isInteger(j.used) && j.used >= 0 ? j.used : 0; } catch { return 0; }
}
const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** a bare seat, as onboarding's (parts/onboard.ts SEAT): nothing in its hands, nothing of the person's read or kept */
const SEAT = {
  tools: [], mcpServers: {}, strictMcpConfig: true, settingSources: [], permissionMode: "dontAsk",
  canUseTool: async () => ({ behavior: "deny", message: "this seat uses nothing" }),
  thinking: { type: "disabled" }, persistSession: false,
  systemPrompt: "You compare two short texts and answer with one number from 0 to 1. Nothing else.",
} satisfies Options;
/** the real turn: one CLI on the person's own sign-in, closed after its answer or at the budget */
export const claudeTurn: Turn = async (model, prompt, budget) => {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), budget);
  try {
    for await (const m of query({ prompt, options: { ...SEAT, model, cwd: tmpdir(), abortController: ac } }) as AsyncIterable<SDKMessage>) {
      if (m.type === "result") return m.subtype === "success" && !m.is_error ? m.result ?? "" : null;
    }
    return null;
  } catch { return null; } finally { clearTimeout(t); }
};

/** the day's count of the person's own model, kept in `home` (none: in memory, for this engine's life). `take` says
 *  whether one more may be asked today under the person's number (settings own.perDay, read each time, so "ask less"
 *  holds at once) and counts it when it may: one count for both ways the own model is asked (makeOwn, cappedSay) */
export function ownDay(o: { home?: string; perDay?: number; now?: () => number } = {}) {
  const file = o.home ? join(o.home, "agents-own-ai.json") : null;
  let mem = "";
  const read = () => { if (!file) return mem; try { return readFileSync(file, "utf8"); } catch { return ""; } };
  const write = (s: string) => {
    if (!file) { mem = s; return; }
    try { writeFileSync(`${file}.tmp`, s); renameSync(`${file}.tmp`, file); } catch { mem = s; }
  };
  return {
    take(): boolean {
      const day = dayOf((o.now ?? Date.now)()), used = usedOn(read(), day);
      if (used >= (o.perDay ?? ownPerDay())) return false;
      write(JSON.stringify({ day, used: used + 1 }));   // counted when asked, so a failed or slow one still counts
      return true;
    },
  };
}

/** the person's own model as Jev; `home` holds the day's count (none: counted in memory, for this engine's life) */
export function makeOwn(o: { home?: string; turn?: Turn; models?: () => string[]; perDay?: number; budget?: number; now?: () => number } = {}): Own {
  const day = ownDay(o);
  return async (k, a, b) => {
    if (isQuiet() || !a.trim() || !b.trim()) return null;
    if (!day.take()) return null;   // the person's number, read at each ask: a change by talking needs no restart
    return ownSaid(await (o.turn ?? claudeTurn)(cheapest((o.models ?? claudeModels)()), ownPrompt(k, a, b), o.budget ?? OWN_BUDGET_MS));
  };
}
/** the other way the meta asks the person's own model: one Sol turn about a place's pairs of steps (meta/chains.ts, Jev
 *  null). Held to the same day's number and counted in the same file, so at 0 or past it no turn starts (null: code) */
export function cappedSay(say: (prompt: string) => Promise<string | null>, o: { home?: string; perDay?: number; now?: () => number } = {}) {
  const day = ownDay(o);
  return async (prompt: string): Promise<string | null> => (day.take() ? say(prompt) : null);
}
/** the default: none under node's test runner, so a test that hands in no `ask` never starts a model */
export const defaultOwn = (home?: string): Own | null => (process.env.NODE_TEST_CONTEXT ? null : makeOwn({ home }));

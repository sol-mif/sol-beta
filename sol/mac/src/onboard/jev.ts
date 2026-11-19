// Jev's picks for the one onboarding (#1088; the designer's design.md, section JEV). The questions are built here (pure,
// tested in src/onboard-sort.test.ts); they are sent from the person's own machine by jev-ask.mjs, run through the engine's
// terminal like the explorer, so the key (JEV_API_KEY, else ~/.config/sol/jev.env) never reaches the face. The bands:
// 0.7 and over acts on its own (shown as taken, with undo); 0.45 and over is a ghost (the likely answer, dashed, pressed
// by the person); under that nothing. No key, an error or over 4 s: no answers, and sort.ts's rules stand as they are.
//   JEV 3  the answer to each unsure thing: choice of its two answers
//   JEV 5  how hands-on: it may suggest or lower the level, never raise it
import type { Hands } from "./record";
import type { Confirm, Found } from "./sort";

export type Pick = { choice: string; confidence: number };
export type Band = "acts" | "ghost" | "none";
export const bandOf = (p: number | undefined): Band => (p === undefined || !Number.isFinite(p) ? "none" : p >= 0.7 ? "acts" : p >= 0.45 ? "ghost" : "none");


/** what may leave the computer (Marco's rule: what a person types and their private facts never leave unannounced):
 *  kinds and counts only, never a name, a sentence, a path or an event. Private and sign-in questions are not asked. */
export const ASKABLE = (c: Confirm) => c.kind !== "private";
const SHAPE: Record<string, (c: Confirm, f?: Found) => string> = {
  conflict: () => "Two readings of one date: a weekly class time from the calendar, and a one-off entry for the same course at another hour on that day. The one-off entry is newer and more specific.",
  guess: (_c, f) => `A folder the person did not name sits inside their work folder${f?.hint === "client" ? ", among files named like invoices, contracts or briefs" : ""}. Is it a client?`,
  routine: () => "Something personal repeats every week in the calendar at the same hour. Is it a weekly routine?",
  found: () => "A folder the person worked in many times with an AI tool, which their own words did not name. Is it its own part of their life?",
};
/** the request: per unsure thing its kind in general words, and for the level only whether the person used careful words */
export function jevBody(said: string, confirms: Confirm[], facts: Map<string, Found>) {
  const questions: Record<string, unknown> = {};
  confirms.slice(0, 5).forEach((c, i) => {
    if (!ASKABLE(c) || !SHAPE[c.kind]) return;
    questions[`c${i}`] = {
      type: "choice",
      instructions: SHAPE[c.kind](c, c.fact ? facts.get(c.fact) : undefined),
      criteria: { yes: "yes: the newer, the more specific, the usual reading", no: "no: the other reading" },
    };
  });
  const careful = /\b(don'?t|do not|never|private|careful|ask me)\b/i.test(said);
  questions.level = {
    type: "choice",
    instructions: "How much should an assistant do by itself for a person, given only whether they used careful words?",
    criteria: { record: "they used careful words", show: "no careful words: show first, the person presses" },
  };
  return { model: "jev-latest", state: { careful_words: careful ? "yes" : "no", unsure_kinds: confirms.filter(ASKABLE).map((c) => c.kind).join(",") || "none" }, questions };
}
/** the one line the person reads about it */
export const toldLine = (confirms: Confirm[]) => {
  const n = confirms.filter((c) => ASKABLE(c) && SHAPE[c.kind]).length;
  return `Jev was told only the kinds of ${n} unsure thing${n === 1 ? "" : "s"} and whether you used careful words. No names, no sentences.`;
};

/** the answers, read back: per confirm id its pick, and the level's */
export function readAnswers(answers: unknown, confirms: Confirm[]): { picks: Record<string, Pick>; level?: Pick & { choice: Hands } } {
  const a = (answers ?? {}) as Record<string, { choice?: string; confidence?: number }>;
  const picks: Record<string, Pick> = {};
  confirms.slice(0, 5).forEach((c, i) => {
    const x = a[`c${i}`];
    if (x && (x.choice === "yes" || x.choice === "no") && typeof x.confidence === "number") picks[c.id] = { choice: x.choice, confidence: x.confidence };
  });
  const l = a.level;
  const level = l && typeof l.confidence === "number" && ["record", "show", "draft", "do"].includes(String(l.choice)) ? { choice: l.choice as Hands, confidence: l.confidence } : undefined;
  return { picks, level };
}

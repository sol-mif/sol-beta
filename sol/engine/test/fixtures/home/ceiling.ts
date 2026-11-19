// Copied from MR (origin/marco/mine-run fa6becaf) sol/mac/src/home/whole/question.ts l.9-12 (questionOf), l.23-28 (notchAskOf), sol/mac/src/home/whole/policy.ts l.62-68 (wouldLine) and sol/mac/src/home-sources.test.ts l.71 (the value his test expects); not imported: the engine never imports sol/mac.
// What his face does with what the ceiling makes: an ask is a Thing a job asks you (state "asks", with its card), which
// his Home puts in front and his notch shows with one line of why; a source's `would` is the count under its ladder.

type Card = { source: string; title: string; why: string; answers: [string, string] };
type Thing = { id: string; state: string; folder: string; card?: Card };

/** the one question: the first thing on the list (in its order) that a job asks you, or none (question.ts l.9-12) */
export function questionOf(needs: string[], things: Map<string, Thing>): Thing | null {
  for (const id of needs) { const t = things.get(id); if (t?.state === "asks" && t.card) return t; }
  return null;
}

/** what the notch's card shows of the question (question.ts l.23-28) */
export function notchAskOf(t: Thing): { id: string; source: string; meta: string; title: string; why: string; answers: [string, string] } | null {
  const c = t.card;
  if (!c) return null;
  const why = c.why.split(/(?<=[.!?])\s+/)[0] ?? c.why;   // one line: the first sentence of the card's why
  return { id: t.id, source: c.source, meta: t.folder, title: c.title, why, answers: c.answers };
}

/** the line under a ladder (policy.ts l.62-68) */
export function wouldLine(s: { id: string; rung: string; would: number }): string {
  if (s.rung === "act") return "acts, every act in the ledger, undo where real";
  if (s.id === "files" && s.rung === "draft") return "writes only inside made/";
  if (s.id === "calendar" && s.rung === "propose") return "dashed until you keep it";
  return `would have: ${s.would === 0 ? "0" : `${s.would} today`}`;
}
/** home-sources.test.ts l.71: Mail at propose with two would-haves today */
export const MAIL_WOULD_LINE = "would have: 2 today";

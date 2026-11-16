// The question card (#794, plan Part C slice 31; home/whole.md "The question card", "The seams"; scene 5), behind
// sol.home.whole. The pure half: which thing is the question (one at a time: the first on the list that a job asks,
// state "asks"), where it stands (at the front of Home's list unless the person brought another forward), and what
// the notch's card shows of it. Answering it, on Home or in the notch, is one `home.answer`; the bus (bus.ts) carries
// it to every window, so both cards go and the job goes on (today.ts's stub: an answered question moves).
import type { Source, Thing } from "./today.ts";

/** the one question: the first thing on the list (in its order) that a job asks you, or none */
export function questionOf(needs: string[], things: Map<string, Thing>): Thing | null {
  for (const id of needs) { const t = things.get(id); if (t?.state === "asks" && t.card) return t; }
  return null;
}

/** the card in front: the one the person brought forward, else the question, else the first in order (stackOf's own) */
export function frontOf(needs: string[], things: Map<string, Thing>, picked: string | null): string | null {
  if (picked && needs.includes(picked)) return picked;
  return questionOf(needs, things)?.id ?? null;
}

/** what the notch's card shows of the question (scene 5's notch: where it came from and its folder, "waits on you", the
 *  question, one line of why, the two answers, and the way to Home) */
export type NotchAsk = { id: string; source: Source; meta: string; title: string; why: string; answers: [string, string] };
export function notchAskOf(t: Thing): NotchAsk | null {
  const c = t.card;
  if (!c) return null;
  const why = c.why.split(/(?<=[.!?])\s+/)[0] ?? c.why;   // one line: the first sentence of the card's why
  return { id: t.id, source: c.source, meta: t.folder, title: c.title, why, answers: c.answers };
}

/** the notch's line after an answer there (scene 5: "Answered · …") */
export const answeredLine = (words: string) => `Answered · ${words}`;

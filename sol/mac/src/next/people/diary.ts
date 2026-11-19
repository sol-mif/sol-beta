// The diary line an answer writes (slices 8+9, #1615; merge/people.js: CV.diary.note({who:'person',kind:'decided',…})).
// Pointed at the join (docs/port/requests/people.md 4) at slice 4's book: one answer, one line on today's page, and the
// lines counted are the book's own, so count 25 reads the real diary.
// Signed: marcocyl04-ux's agent, port slice 8+9 and the join (#1615).
import { allLines, note as bookNote } from "../diary/book.ts";

export type Note = { who: "person" | "ai"; kind: string; key: string; what: string; why: string | null };

/** write one line in today's page (the diary's book) */
export function note(n: Note): void {
  bookNote({ who: n.who, kind: n.kind, key: n.key, what: n.what, why: n.why });
}
/** how many lines stand in the diary now (an answer anywhere adds exactly one) */
export const lines = (): number => allLines().filter((l) => !l.removed).length;

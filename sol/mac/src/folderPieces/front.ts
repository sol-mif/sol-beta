// What a piece puts in front (#1092, the design: S/design/design.md). Pure, so the face's tests reach it: from a piece's
// rows, the one thing to press, the rest by name, what was answered; the word on the button; the head's state phrase.
import type { Step } from "./model";

/** a row with the word its press wears: "open the PR", "answer", "read", "try" (the engine's Row.press) */
export type FrontStep = Step & { press?: string;
  /** what the piece's agent did for this row between his visits (the recipe's `tend`): one or two sentences, drawn
   *  under the why in a wash; on an "answer" row the press copies it */
  said?: string;
  /** who put this row away when it was not him (the engine's tick `by`: a session's name) */
  by?: string };
export type Front = {
  /** the one in front: the first row that wants him; none when nothing does */
  front: { s: FrontStep; i: number } | null;
  /** the rest, by name: what is still open, in the piece's order */
  rest: { s: FrontStep; i: number }[];
  /** answered, newest first as the piece gave them */
  done: { s: FrontStep; i: number }[];
};

/** `led`: a row the person brought forward by pressing its name (its index); it is the front while it is still open */
export function frontOf(steps: FrontStep[], led: number | null = null): Front {
  const all = steps.map((s, i) => ({ s, i }));
  const open = all.filter((x) => x.s.st !== "done");
  // a piece that never asks (no row waits or was answered) whose first row has a press of its own leads with that row
  // (releases: "dev-… goes out at 9am" · read), not with its figure alone
  const tells = !steps.some((x) => x.st === "wait" || x.st === "done") && open[0]?.s.press?.trim() ? open[0] : null;
  const front = (led != null && open.find((x) => x.i === led && x.s.st === "wait")) || open.find((x) => x.s.st === "wait") || tells;
  return { front, rest: open.filter((x) => x !== front), done: all.filter((x) => x.s.st === "done") };
}

/** the word on the button: the row's own, else "open" when it leads somewhere, else "done". Never "yes" */
export const pressWord = (s: FrontStep): string => (s.press && s.press.trim() ? s.press.trim().slice(0, 16) : s.href ? "open" : "done");

/** the head's one phrase: what the piece is doing or how many want him */
export function saidOf(look: "rest" | "working" | "you" | "broken", wants: number, doubt = 0): string {
  if (look === "broken") return "broken";
  if (look === "working") return "reading";
  // the folder's dashed square: new, and Jev only half sure it needs him; the head says so (the designer's NOW 1 of 06:55:
  // a dashed row never opens to a normal-looking front)
  const maybe = doubt > 0 ? `${doubt} maybe for you` : "";
  // after a look the yellow goes but the phrase stays, in ink (the design's NOW 1 of 01:26)
  if (wants > 0) return `${wants === 1 ? "1 wants you" : `${wants} want you`}${maybe ? ` · ${doubt} maybe` : ""}`;
  return maybe || "at rest";
}

/** the groups of a piece whose rows name one (runs: the machines), in first-seen order; [] when no row has a group */
export const groupsOf = (steps: FrontStep[]): string[] => [...new Set(steps.map((s) => s.group).filter((g): g is string => !!g))];

/** how long the foot keeps "answered … undo" */
export const UNDO_MS = 6000;
/** the front leaves, then the next arrives */
export const LEAVE_MS = 240;

/** the back's ledger in plain words (the design's NOW 2): who · what, no line for being listed; a put-away row by its
 *  title cut short (pure over the engine's lines) */
export function plainLines<L extends { at: number; by: string; ev: string; note?: string }>(lines: L[]): L[] {
  return lines.filter((l) => l.ev !== "composed").map((l) => {
    const by = l.by === "the piece's pulse" ? "the pulse" : l.by;
    const note = l.ev === "yes" ? (l.note ?? "").replace(/^ticked: /, "put away ").replace(/^unticked: /, "brought back ") : l.ev === "carried" ? "into a session" : l.note === "the body changed" ? "read again" : l.note ?? l.ev;
    return { ...l, by, note: note.length > 60 ? `${note.slice(0, 59)}…` : note };
  });
}

// What was just done on the one space, and its way back (#903's line, brought to Build's one space for #1454): one quiet
// line in the strip at the space's bottom edge, beside what is put away; never over a piece or the chat box. The old
// stage says its steps with stage/said.ts; the space's steps are others (the hand's edits of an arrangement, the agent's
// moves of hands.ts, what it opened or changed), so they are said here, with said.ts's way of naming. Pure, so every
// sentence is tested (src/pieces-step.test.ts). Behind the switch stage.said, as the old stage's line.
import { BOX, TALK } from "./arrange.ts";
import { names } from "../stage/said.ts";
import type { HandMove } from "./hands.ts";

/** how long a line stays before it leaves by itself (the pointer on it keeps it) */
export const STEP_STAYS = 5000;
/** the agent's moves this close together are one turn's: one line, and one undo gives the arrangement before all of them */
export const TURN_MS = 4000;

/** one thing the line can say */
export type Step =
  /** the agent's moves of one turn, in order */
  | { who: "agent"; how: "moved"; moves: HandMove[] }
  /** artifacts the agent opened on the space (a new one, or one it brought back) */
  | { who: "agent"; how: "opened"; ids: string[] }
  /** an artifact's content the agent changed: its ledger's newest line */
  | { who: "agent"; how: "changed"; id: string; what: string }
  /** the hand's own: a piece carried to a new place, the columns' widths */
  | { who: "you"; how: "moved"; id: string }
  | { who: "you"; how: "widths" }
  /** the last step taken back (⌥⌘Z or the line's undo), or done again (redo); `step` is the one taken back */
  | { who: "back"; how: "undid" | "redid"; step: Step }
  /** ⌥⌘Z with nothing left to take back */
  | { who: "back"; how: "nothing" };

/** the line: what happened; the way back (a button's word, empty for none); whether it is the agent's; each of a
 *  turn's moves in words, for the list its press opens */
export type Line = { words: string; back: "undo" | "redo" | "put away" | "see" | ""; agent: boolean; each?: string[] };

const WIDTH = { narrow: "narrow", half: "half the width", wide: "wide" } as const;

/** a piece by its name: the chat and the box by theirs, an artifact by its title */
export const titleOf = (id: string, title: (id: string) => string | undefined): string =>
  id === TALK ? "the chat" : id === BOX ? "the box" : title(id)?.trim() || "an artifact";

/** one of the agent's moves in words, after "The agent"; null for a move that only points (the lens says itself) */
export function moveWords(m: HandMove, title: (id: string) => string | undefined): string | null {
  const t = titleOf(m.id, title);
  if (m.chat === "col") return "gave the chat its column";
  if (m.chat === "lines") return "made the chat its last few lines";
  if (m.chat === "line") return "made the chat one line";
  const where = m.beside ? `beside ${titleOf(m.beside, title)}` : m.under ? `under ${titleOf(m.under, title)}` : m.foot ? "across the foot" : "";
  const width = m.width ? WIDTH[m.width] : "";
  if (where) return `put ${t} ${where}${width ? `, ${width}` : ""}`;
  if (width) return `made ${t} ${width}`;
  if (m.large === true) return `took ${t} large`;
  if (m.large === false) return `put ${t} back among the others`;
  return null;
}

/** what the line says for a step; null when there is nothing to say (a turn of moves that only pointed) */
export function stepLine(s: Step, title: (id: string) => string | undefined): Line | null {
  if (s.who === "back") {
    if (s.how === "nothing") return { words: "Nothing to take back", back: "", agent: false };
    const was = stepLine(s.step, title); if (!was) return null;
    if (s.how === "redid") return { words: `${was.words} again`, back: "undo", agent: was.agent };
    const st = s.step;
    const words = st.who === "agent" && st.how === "moved"
      ? (was.each && was.each.length > 1 ? `Took back the agent's ${was.each.length} changes` : "Took back the agent's move")
      : st.who === "you" && st.how === "moved" ? `Put ${titleOf(st.id, title)} back where it was`
      : st.who === "you" && st.how === "widths" ? "Put the widths back" : `Took back: ${was.words}`;
    return { words, back: "redo", agent: false };
  }
  if (s.who === "you") return s.how === "widths" ? { words: "Set the widths", back: "undo", agent: false } : { words: `Moved ${titleOf(s.id, title)}`, back: "undo", agent: false };
  if (s.how === "opened") return { words: `The agent opened ${names(s.ids.map((id) => titleOf(id, title)))}`, back: "put away", agent: true };
  if (s.how === "changed") {
    const what = s.what.trim().replace(/\s+/g, " "), short = what.length > 60 ? `${what.slice(0, 59)}…` : what;
    return { words: `The agent changed ${titleOf(s.id, title)}${short ? `: ${short}` : ""}`, back: "see", agent: true };
  }
  const each = s.moves.map((m) => moveWords(m, title)).filter((w): w is string => !!w);
  if (!each.length) return null;
  return { words: each.length === 1 ? `The agent ${each[0]}` : `The agent made ${each.length} changes`, back: "undo", agent: true, each };
}

/** whether the agent's move at `t` belongs to the turn whose last move was at `last`: the agent's own, close enough,
 *  and its undo is still there to keep */
export const sameTurn = (last: number | null, t: number, by: "agent" | "hand", undoKept: boolean): boolean =>
  last !== null && by === "agent" && undoKept && t - last < TURN_MS;

/** whether a step that comes now may take the line from the one shown: a change the agent made never covers a way back
 *  still on the line (an undo or a redo), so the hand never loses it to the agent ticking a list */
export const mayReplace = (shown: Line | null, next: Step): boolean =>
  !shown || !(next.who === "agent" && next.how === "changed" && (shown.back === "undo" || shown.back === "redo"));

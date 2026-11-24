// The wire between the engine's Help and the face (#1615 BR1, learn.html parts 3, 7, 8, 9). The face builds to these
// shapes; README.md beside this file says the same in ten lines. Nothing else in the engine is the contract.
// Signed: marcocyl04-ux's agent (builder T-engine), BR1 (#1615).

/** the six walks' ids, the same in the engine and the face (learn.html, "The six walks") */
export type WalkId = "around" | "folders" | "ai" | "bar" | "needs" | "yours";
export const WALK_IDS: readonly WalkId[] = ["around", "folders", "ai", "bar", "needs", "yours"];

/** one step of one walk, numbered from 0: what "Show me" plays on the person's own Sol (next/tips) */
export type ShowMe = { walk: WalkId; step: number };

export type Walk = { id: WalkId; title: string; about: string; steps: string[] };
export type FaqEntry = { q: string; a: string; show?: ShowMe };

// face → engine ---------------------------------------------------------------------------------------------------
/** open (or find) the Help session; `ask` also asks it those words (the bar's "Open in Help" passes its question) */
export type HelpOpen = { type: "next.help.open"; ask?: string };
/** words typed into the Help session's own box */
export type HelpAsk = { type: "next.help.ask"; text: string };
// the canvas bar sends next.canvas.say { text, chips?, canvas? } as it always has; a "how do I…" is answered as below

// engine → face ---------------------------------------------------------------------------------------------------
/** to the asker of next.help.open: the session (null until its first question) and what Help answers from */
export type HelpOpened = { type: "next.help.opened"; session: string | null; title: "Help"; walks: Walk[]; faq: FaqEntry[]; starters: string[] };
/** to every window: Help is answering (working), or its answer, ending with Show me and a walk to replay when one fits */
export type HelpSaid =
  | { type: "next.help.said"; working: true; session: string }
  | { type: "next.help.said"; working: false; session: string; text: string; show?: ShowMe; replay?: WalkId }
  | { type: "next.help.said"; working: false; failed: true; text: string };
/** to every window: the canvas bar's answer to a "how do I…" — one line, Show me when a step shows it, and always
 *  "Open in Help" (openHelp). working: true while Help itself is asked; the line follows when it answers. Never
 *  "Not a move I know". Every other next.canvas.said is the canvas agent's, as before (no `help`). */
export type BarHelpSaid =
  | { type: "next.canvas.said"; help: true; working: true; session: string }
  | { type: "next.canvas.said"; help: true; working: false; text: string; show?: ShowMe; openHelp: true; ask: string };

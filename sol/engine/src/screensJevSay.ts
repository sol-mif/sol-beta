// Jelly across screens, Jev pick 7: say where (#1090, design.md JEV 7). The person says in the talk where a thing
// should be ("plan to the big one", "bring the diff back", "everything here") and it goes, with no model turn spent on
// it. Pure, like screensJev.ts: two questions for the SAME request that pick 2 already sends once per message (add
// `which` and `to` to arrangeBody's questions; one call, about 100 ms).
//   act    the named block crosses to the named window, from the seam, as a throw does; one ⌘Z takes it back
//   ghost  the block's ghost stands at that window's seam for 8 s (the offer of pick 1); a press sends it
//   none   nothing shows; the message goes to the session as ever
// The message is still sent to the session either way: Jev moves the piece, the session answers the words.
import { pickOf, type Pick } from "./screensJev.js";

export const NONE = "none of them", ALL = "all of them";

/** a live window as the person would call it: its name, whether they type there, whether it is the larger one */
export type SayWin = { name: string; here: boolean; bigger: boolean };
const called = (w: SayWin) => [`the ${w.name}`, w.bigger ? "the big one, the large screen" : "the small one", w.here ? "here, this one, back, by the keyboard, where the person types" : "over there, the other screen, across"].join(", ");

/** the two questions; `blocks` are the open blocks' titles (eight at most) */
export function sayQuestions(blocks: string[], windows: SayWin[]) {
  const titles = blocks.slice(0, 8);
  return {
    which: {
      type: "choice",
      instructions: "Does the person ask to move one of the open blocks to another of their screens? Which one?",
      criteria: {
        [NONE]: "the ask names no screen and no direction (big one, small one, monitor, laptop, here, there, back, over); it is about the work itself, or about a block's size or content",
        [ALL]: "the person asks for everything to come to one screen (\"everything here\", \"bring it all back\")",
        ...Object.fromEntries(titles.map((t) => [t, `the ask names or plainly means the block "${t}" together with a screen or a direction, with or without a verb ("${t.split(" ").pop()} to the big one", "${t.split(" ").pop()} over there")`])),
      },
    },
    to: {
      type: "choice",
      instructions: "To which screen does the person want it moved?",
      criteria: Object.fromEntries(windows.map((w) => [w.name, called(w)])),
    },
  };
}

/** the block (a title, ALL, or null) and the window, with the lower of the two probabilities deciding the band */
export function readSay(answers: any): { block: string | null; to: string | null; pick: Pick } {
  const w = answers?.which, t = answers?.to;
  const block = typeof w?.choice === "string" && w.choice !== NONE ? w.choice : null, to = typeof t?.choice === "string" ? t.choice : null;
  if (!block || !to) return { block: null, to: null, pick: "none" };
  // everything: the caller gathers to the window the person types in when `to` is unsure (the seam's double press does the same)
  if (block === ALL) return { block, to, pick: pickOf(w?.probabilities?.[block] ?? w?.confidence) };
  const p = Math.min(w?.probabilities?.[block] ?? w?.confidence ?? 0, t?.probabilities?.[to] ?? t?.confidence ?? 0);
  return { block, to, pick: pickOf(p) };
}

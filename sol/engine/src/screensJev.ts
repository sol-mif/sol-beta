// Jelly across screens: the fast picks Jev makes (#1090, design.md JEV). Pure: the request bodies and how an answer is
// read. No fetch here: the caller posts a body to JEV_URL with jevKey() (agent/jev.ts), 4 s at most; no key, an error
// or a late answer reads as "nothing" and the block opens where it always did.
//   0.7 and over    Jelly does it on its own
//   0.45 and over   a ghost: a dashed hairline the person can press
//   under 0.45      nothing shows
export const ACTS = 0.7, GHOST = 0.45;
export type Pick = "act" | "ghost" | "none";
export const pickOf = (p: number | null | undefined): Pick => (typeof p !== "number" || !Number.isFinite(p) ? "none" : p >= ACTS ? "act" : p >= GHOST ? "ghost" : "none");

/** one window as Jev reads it: short, in the person's words */
export type WinFact = { name: string; w: number; h: number; side: boolean; talk: boolean; blocks: string[]; keys: boolean };
const win = (f: WinFact) =>
  `${f.name} ${f.w}x${f.h}: ${[f.side && "the sessions", f.talk && "the talk", f.blocks.length ? `${f.blocks.length} blocks (${f.blocks.slice(0, 4).join(", ")})` : "no blocks"].filter(Boolean).join(", ")}${f.keys ? "; the person types here" : ""}`.slice(0, 300);

/** 1. where a block the session just made opens: on the window it was asked from, or on the other */
export function whereBody(block: { title: string; kind: string; lines?: number }, ask: string, here: WinFact, other: WinFact) {
  return {
    model: "jev-latest",
    state: {
      block: `${block.title} (${block.kind}${block.lines ? `, ${block.lines} lines` : ""})`.slice(0, 200),
      ask: ask.slice(-300),
      here: win(here),
      other: win(other),
    },
    questions: {
      where: {
        type: "choice",
        instructions: "A block was just made for the person. On which of their two windows should it open?",
        criteria: {
          other: "it is a long read or a large view (a diff, a page, a table, a picture, a map) and the other window is the larger one or has the room; or the person asked for it there (the big one, the monitor, over there)",
          here: "it is something to answer or type into, a short note, or a change to a block already on this window; or the person asked nothing about screens and this window has the room",
        },
      },
    },
  };
}
/** act: it arrives from the seam on the other window · ghost: it opens here and its ghost peeks at the other window's
 *  seam (a press sends it) · none: it opens here */
export const readWhere = (answers: any): Pick => pickOf(answers?.where?.probabilities?.other);

/** 2. an arrangement for the job: as it is, or one of three */
export const ARRANGEMENTS = ["as it is", "read", "review", "watch"] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
export function arrangeBody(ask: string, wins: WinFact[]) {
  return {
    model: "jev-latest",
    state: { ask: ask.slice(-300), windows: wins.map(win).join(" | ").slice(0, 700) },
    questions: {
      arrange: {
        type: "choice",
        instructions: "The person just asked for this. Should their windows be arranged for it, and how?",
        criteria: {
          "as it is": "the ask is not about reading, reviewing or watching something across screens; or the windows already stand that way",
          read: "one thing to read or look at for a while: that block alone and full on the larger window, the talk by the keyboard",
          review: "a change to check: the diff on the larger window, the talk and the notes by the keyboard",
          watch: "work that runs for a while with nothing to answer: what runs on the smaller window, the work itself on the larger",
        },
      },
    },
  };
}
/** act: the blocks cross 60 ms apart, one undo takes it all back · ghost: the map's shapes go dashed, a press takes it */
export function readArrange(answers: any): { to: Arrangement; pick: Pick } {
  const a = answers?.arrange, to = (ARRANGEMENTS as readonly string[]).includes(a?.choice) ? (a.choice as Arrangement) : "as it is";
  return to === "as it is" ? { to, pick: "none" } : { to, pick: pickOf(a?.probabilities?.[to] ?? a?.confidence) };
}

/** 6. follow-me: has the person moved to the window without the talk to work there? Never moves the talk by itself:
 *  ghost: the box's outline, dashed, at that window's bottom left (a press takes the talk there) · act: the same, and
 *  the next key typed takes it */
export function followBody(seconds: number, presses: number, there: WinFact, talkWin: WinFact) {
  return {
    model: "jev-latest",
    state: { pointer: `on ${there.name} for ${Math.round(seconds)} s, ${presses} presses there`, there: win(there), talk: win(talkWin) },
    questions: {
      moved: {
        type: "noul",
        instructions: "Has the person moved to the other window to work there, so that they will want to type there next?",
        criteria: {
          true: "the pointer has stayed on that window ten seconds or more and the person pressed things there several times: they are working there",
          false: "a few seconds only, or no presses: a glance, a scroll, reading while the hands stay where the talk is",
        },
      },
    },
  };
}
export const readFollow = (answers: any): Pick => pickOf(answers?.moved?.noul);

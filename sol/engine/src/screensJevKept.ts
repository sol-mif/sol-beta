// Jelly across screens, Jev pick 3: "as you left it", for ANOTHER session of the same project (#1090, design.md JEV 3).
// The same session opened again needs no Jev: the record's `where` already puts each block on the window it was left on.
// Pure, like screensJev.ts: the request body and how the answer is read. Paste into screensJev.ts if you prefer one file.
//   act    this session's new blocks open on the window where their kind lived last time (hand `kinds` to pick 1's
//          caller: a kind found there skips pick 1). The talk and the side never move by themselves.
//   ghost  the kept arrangement is offered on the map, dashed, as pick 2's offer is (screens.arrangeOffer)
//   none   nothing shows
import { pickOf, type Pick } from "./screensJev.js";

/** what is kept per project at every crossing: for each kind of block, the window it was last left on; and the talk's */
export type KeptKinds = { kinds: Record<string, string>; talk: string; at: number };

/** the kinds as they are now, from the record: the last block of a kind in the list wins (pure) */
export function kindsKept(where: Record<string, string>, blocks: { id: string; kind: string }[], nameOf: (win: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) if (where[b.id]) out[b.kind] = nameOf(where[b.id]!);
  return out;
}

const ago = (ms: number) => (ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} min ago` : ms < 86400e3 ? `${Math.round(ms / 3600e3)} h ago` : `${Math.round(ms / 86400e3)} days ago`);

export function keptBody(project: string, kept: KeptKinds, now: { windows: string[]; blocks: { title: string; kind: string }[]; ask: string }, at = Date.now()) {
  const lived = Object.entries(kept.kinds).map(([k, w]) => `${k} on the ${w}`).join(", ") || "no blocks";
  return {
    model: "jev-latest",
    state: {
      project: project.slice(0, 80),
      "last time": `${ago(at - kept.at)}: ${lived}; the talk on the ${kept.talk}`,
      "windows now": now.windows.join(", ") || "one window",
      "blocks now": now.blocks.slice(0, 6).map((b) => `${b.title} (${b.kind})`).join(", ") || "none yet",
      ask: now.ask.slice(-300),
    },
    questions: {
      same: {
        type: "noul",
        instructions: "The person opened another session of the same project. Is this the same kind of sitting as last time, so that new blocks should open on the window where blocks of their kind were left last time?",
        criteria: {
          true: "the same windows are here now, last time was within a few days, and the ask or the blocks now are of the kinds that were placed last time (a diff again, a page again, a plan again)",
          false: "a window from last time is missing now, or last time was more than a week ago, or the work now is of another kind than what was placed (last time a review of diffs, now a short question or a note)",
        },
      },
    },
  };
}
export const readKept = (answers: any): Pick => pickOf(answers?.same?.noul);

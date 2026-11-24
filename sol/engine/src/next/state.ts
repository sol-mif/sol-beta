// next.state (#1604, slices.md "The contract between face and engine"): the new face's whole beside-state in one message,
// { places, pos, diaryToday, needs }, sent when a window asks (the face's wire asks on attach, as it asks
// home.places) and to every window when one of them changes or the switch turns on (parts/next.ts).
//   places      the move-in read's places (carry.ts, read only): the folders the plane can hold, each with its kind
//   pos         SOL_HOME/next/pos.json (pos.ts). No zones (BR1, 2026-11-21): the canvas holds only folders, so an old
//               zones.json is left on disk and never read
//   diaryToday  today's page (diary.ts)
//   movein      what the person kept, fixed and dropped in the move-in (movein.ts), or null before they moved in: the
//               face applies it to the folders it draws from work.sessions and home.places
//   folders     the person's folders, one tree (tree.ts folderTree, #1816): [{ id, name, path, parent?, by? }], what the
//               canvas and the sidebar both draw, read from the disk again on every state; [] before the move-in
//   needs       7a's ranked list (next/needs.ts, read by parts/next-calls.ts), only in the answer to one of Sol's own
//               windows; a push to every window leaves it out (the face reads next.needs for its asks)
//   notes       a store that could not be read and was set aside, in a person's words (only when one was)
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615); needs joined to 7a by franktsai2008-eng's agent.
import { carry, type Where } from "./carry.js";
import { readPos } from "./pos.js";
import { dayOf, readDay } from "./diary.js";
import { readMoveIn, type MoveInKept } from "./movein.js";
import { folderTree, type TreeFolder } from "./tree.js";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { projectsDir } from "../work/listed.js";

/** the person's folders, one tree (tree.ts): what every window's canvas and sidebar draw */
export function treeOf(w: Where, movein: MoveInKept | null = readMoveIn(w.home), places = carry(w).places): TreeFolder[] {
  let slugs: string[] = [];
  try { slugs = readdirSync(projectsDir()); } catch { /* no Claude Code here */ }
  return folderTree({ sol: w.home, user: process.env.HOME || homedir(), movein, places, slugs });
}

/** `needs`: the ranked list's reader, given only for one of Sol's own windows (absent: the field is left out) */
export async function stateMsg(w: Where, needs?: () => Promise<unknown[]>) {
  const home = w.home, now = w.now ?? new Date();
  const p = readPos(home), movein = readMoveIn(home), places = carry(w).places;
  const notes = [
    ...(p.aside ? [`Your places on the plane could not be read, so they start fresh; yours are kept aside as ${p.aside}.`] : []),
  ];
  return {
    type: "next.state" as const,
    places,
    pos: p.pos,
    diaryToday: { day: dayOf(now), lines: readDay(home, dayOf(now)) },
    movein,
    folders: treeOf(w, movein, places),
    ...(needs ? { needs: await needs().catch(() => []) } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

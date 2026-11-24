// The calm screen's count (BR1 item 3, #1615): which asks a screen shows presses for, and when they gather into one line
// (Gather.tsx draws it). A screen holds five controls at rest besides the bar and the sidebar; the line to the Diary and
// the folder's own name take two, so at most three first presses stand on pieces, and past that every one of them
// gathers. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { open, type Ask, type Piece } from "../cv/index.ts";
import * as L from "./layout.ts";

/** the most first presses a screen shows on its pieces; past it they gather */
export const GATHER_AT = 3;

/** the asks a screen shows presses for: those on the faces drawn whole in the view (a piece off the canvas or folded is
 *  drawn as nothing or a chip, so its asks are not on screen) */
export function gatherOf(faces: Piece[]): Ask[] {
  const on = new Set(faces.filter((p) => !L.isOff(p.id) && !L.isOff(p.region) && !L.folded(p.region) && !L.folded(p.id)).map((p) => p.id));
  return open().filter((a) => on.has(a.piece));
}

/** asks on screen past the cap gather; null while each piece can carry its own */
export const gathers = (asks: Ask[]): Ask[] | null => (asks.length > GATHER_AT ? asks : null);

/** the line's words: Middle's head reads them as its count (count 30 sums "N things here" with "outside" and people) */
export const gatherWords = (n: number) => `${n === 1 ? "One thing here needs" : n + " things here need"} you`;

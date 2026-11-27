// What a folder's case on the canvas says (#1879 step 4; kit/FolderCase.tsx): pure, so a test reads the rules without a screen.
// Its one count is the folder's asks, the number the sidebar and its tab show (place.ts placeOf); it is quiet when nothing is
// waiting and nothing works; its line is its sessions, else the place's own; the deadline is the front line's date, if it has one.
import type { Place } from "../place.ts";

const COUNT = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
/** the case's one line under its name: its sessions, said as every screen says them; a folder with none says its own line
 *  ("Nothing in it yet", "A repo · Has CLAUDE.md") */
export const subOf = (pl: Pick<Place, "sessions" | "line">) => (pl.sessions > 0 ? `${COUNT[pl.sessions] ?? pl.sessions} session${pl.sessions === 1 ? "" : "s"}` : pl.line);
/** the next deadline at the case's foot: "Next: Release · Fri" → "Release Fri"; a front line that is no date says none */
export const deadline = (line: string): string | null => { const m = /^Next:\s*(.+)$/.exec(line); return m ? m[1].replace(/\s*·\s*/g, " ") : null; };
/** everything the case draws, from the place and its front line */
export function caseOf(pl: Pick<Place, "sessions" | "line" | "counts">, front: string) {
  const { asks, working } = pl.counts;
  return { sub: subOf(pl), count: asks, next: deadline(front), working: working > 0, quiet: asks === 0 && working === 0 };
}

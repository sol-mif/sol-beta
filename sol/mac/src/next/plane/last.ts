// When a folder last changed, in words, for its peek's foot (bar-folder.html #peek "Last change 12 min ago", conform 22).
// Signed: marcocyl04-ux's agent (builder G), BR1 (#1615).
import { piecesIn, within } from "../cv/core.ts";
import { LIVE, MIN, allLines, book, loc, now } from "../diary/book.ts";

/** its newest Diary line (the record of what happened in it, or in a folder inside it), or a thing's own time where the
 *  engine gives one (Piece.last); nothing known, null */
export function lastChange(rid: string): string | null {
  const b = book(), n = now(b);
  let t = 0;
  for (const l of allLines(b)) if (!l.removed && l.t <= n && l.t > t && within(l.region, rid)) t = l.t;
  for (const p of piecesIn(rid)) { const at = Number(p.last) || 0, here = LIVE ? loc(at) : at; if (at && here <= n) t = Math.max(t, here); }
  if (!t) return null;
  const m = Math.floor((n - t) / MIN), h = Math.floor(m / 60), d = Math.floor(m / 1440);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : h < 24 ? `${h} h ago` : d < 2 ? "yesterday" : `${d} days ago`;
}

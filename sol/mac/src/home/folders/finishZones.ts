// Finish or drop (#1493): the person ticks, Sol never does. Pure parts, so they are tested without a window.
import { DAY, soon } from "./due.ts";

type One = { done: boolean; notes: readonly string[] };

/** a run made something for it and nothing more is asked: the newest asked/did line is a did: line, and no run is on
 *  it now. Its foot then says "✓ done" in place of "do it" (one act, so it never reads as both finished and about to
 *  run again; once done, "again" offers another run) */
export function ranLast(m: One): boolean {
  if (m.done) return false;
  const l = [...m.notes].reverse().find((n) => /^(did|asked)\b/i.test(n));
  return !!l && /^did\b/i.test(l);
}

/** where a sticky let go on Today is due: today at 18:00, or the next full hour once 18:00 has passed (23:59 at the
 *  latest, so it is still today) */
export function onToday(now = Date.now()): number {
  const d = new Date(now), six = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18).getTime();
  if (now < six) return six;
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
  return Math.min(next, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).getTime());
}

export type Zone = "done" | "drop" | "today";
/** the tray that rises while a sticky is carried: done and drop always; Today from a place, for one not on it already */
export function zonesFor(due: number | null, onTodayRow: boolean, now = Date.now()): Zone[] {
  return onTodayRow || soon(due, now) ? ["done", "drop"] : ["done", "drop", "today"];
}

/** how long a finish, a drop or a move to Today can be taken back from the line that says it */
export const UNDO_FOR = 9_000;
/** a dropped sticky is kept this long by the engine (.agent/removed-stickies.json), so undo survives a restart */
export const KEPT_FOR = DAY;

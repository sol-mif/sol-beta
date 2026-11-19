// Find asked for from the spine (2026-11-11): the spine's find mark, and ⌘K while a view that has no find of its own
// shows. Find is Build's (the clean Home's Jump, or the older side's search field), so the ask hops to Build first,
// leaves FIND_ASK for the page that mounts there (it may be loaded lazily), and sends `sol:find` a moment later. Build's
// page opens its find on either, never closes it: the two may both arrive. Pure rules, tested in src/spine-find.test.ts.
import type { View } from "./flag";

/** sessionStorage: a find asked for before Build's page mounted */
export const FIND_ASK = "sol.find.ask";

/** the view to hop to before `sol:find` is sent (null: stay, Build hears it where it is) */
export const findHop = (view: View): View | null => (view === "build" ? null : "build");

/** whether the window, not the view, answers ⌘K: only where the view has no ⌘K of its own (the clean Home's Jump is
 *  one; a board drawn by the clean Home in the Home view is another) */
export const windowFinds = (view: View, viewHasFind: boolean): boolean => view !== "build" && !viewHasFind;

/** the find asked for before the page mounted, used up as it is read */
export function takeFindAsk(): boolean {
  try {
    if (sessionStorage.getItem(FIND_ASK) !== "1") return false;
    sessionStorage.removeItem(FIND_ASK);
    return true;
  } catch { return false; }
}

// Settings asked for from outside Build's own page (#911): the spine's settings mark, and ⌘, while Home or Social shows.
// Settings is a page of Build, so the ask hops to Build first; closing Settings takes the person back to the view they
// asked from. Pure rules, tested in src/spine-settings.test.ts.
import type { View } from "./flag";

/** the drawer Settings opens on when the ask names none */
export const FIRST_DRAWER = "work";

/** the event's detail the spine sends: the drawer to open on */
export const spineAsk = (): string => FIRST_DRAWER;

/** what a `sol:settings` event asks Build's page for: the drawer to open on, or null when the detail is not an ask
 *  (a missing detail is the plain ask: Settings on its first drawer) */
export function askedDrawer(detail: unknown): string | null {
  if (detail === undefined || detail === null) return FIRST_DRAWER;
  return typeof detail === "string" && detail ? detail : null;
}

/** how the window answers an ask for Settings while `view` shows: the view to hop to first (null: stay), and the
 *  view closing Settings returns to (null: stay in Build; Cowork is another mode, with its own Settings) */
export function settingsPlan(view: View): { hop: View | null; back: View | null } {
  if (view === "build") return { hop: null, back: null };
  return { hop: "build", back: view === "cowork" ? null : view };
}

/** where closing Settings goes: back to the view it was asked from, if the person is still in Build */
export const afterClose = (back: View | null, now: View): View | null => (back && now === "build" ? back : null);

/** how the person left Settings: "closed" is a real close (the x, Esc, ⌘, again, the side's button off); "moved" is any
 *  other way out (a session picked in the side, a new session, the conversations list) */
export type Leave = "closed" | "moved";

/** leaving Settings (#916 review): a real close goes back to where Settings was asked from; any other way out stays
 *  where the person went. Either way the way back is used up, so it never goes stale. */
export const afterLeave = (back: View | null, now: View, how: Leave): { to: View | null; back: null } =>
  ({ to: how === "closed" ? afterClose(back, now) : null, back: null });

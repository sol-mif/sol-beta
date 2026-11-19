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

/** the section Settings opens on when asked from a Home with its own (#1124): Home's own, never Build's */
export const HOME_DRAWER = "home";

/** how the window answers an ask for Settings while `view` shows: the view to hop to first (null: stay), and the
 *  view closing Settings returns to (null: stay in Build). Cowork too goes back: its "project settings" are a project's
 *  rhythm and reviewers, not the app's Settings, which live only on the spine (2026-11-11).
 *  #1124: a Home drawn from the one onboarding's record (`ownHome`, the one Home since #1223) keeps the ask: Settings opens over
 *  Home on Home's own section (`here`), so a newcomer's first Settings is not Build's folders and branches. Without
 *  it, as before. */
export function settingsPlan(view: View, ownHome = false): { hop: View | null; back: View | null; here?: string } {
  if (view === "build") return { hop: null, back: null };
  if (view === "home" && ownHome) return { hop: null, back: null, here: HOME_DRAWER };
  return { hop: "build", back: view };
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

// Open it for the person (#1521, engine/src/openfor.ts): the seat's open_settings and open_pane reach the window as
// { type: "open.for", what, drawer | button } (useEngine passes it on as `sol:open-for`). Settings and the panes are
// Build's, so an ask from another view hops to Build first, as the spine's settings mark does (spine/settings.ts);
// then the ways that already open them by name: `sol:settings` with the drawer (#342), `sol:pane` with the button's id
// (WorkApp shows it as its press does). Pure rules, tested in src/spine-openfor.test.ts.
import type { View } from "./flag";

export type OpenFor = { what: "settings"; drawer: string } | { what: "pane"; button: string };
export type OpenPlan = { hop: View | null; back: View | null; event: "sol:settings" | "sol:pane"; detail: string };

const ID = /^[a-z][a-z-]{0,39}$/;

/** what the engine's word asks for, or null when it is not one this window can open (pure) */
export function openForOf(m: unknown): OpenFor | null {
  const o = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
  if (o.what === "settings" && typeof o.drawer === "string" && ID.test(o.drawer)) return { what: "settings", drawer: o.drawer };
  if (o.what === "pane" && typeof o.button === "string" && ID.test(o.button)) return { what: "pane", button: o.button };
  return null;
}

/** how the window opens it while `view` shows (pure): hop to Build first unless there, and for Settings the view a real
 *  close goes back to (a pane has no way back: it is closed where it opened) */
export function openPlan(view: View, o: OpenFor): OpenPlan {
  const hop = view === "build" ? null : "build";
  return o.what === "settings"
    ? { hop, back: hop ? view : null, event: "sol:settings", detail: o.drawer }
    : { hop, back: null, event: "sol:pane", detail: o.button };
}

/** only the window the person is looking at opens it: a second window on the same engine (a popped-out session, the
 *  phone's) stays as it is */
export const looking = (d: Pick<Document, "visibilityState">): boolean => d.visibilityState === "visible";

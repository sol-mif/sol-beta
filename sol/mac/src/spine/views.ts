// Which of the spine's views this Sol shows (#1637, Frank 2026-11-19): a tester's Sol is Build only; Home, Cowork and
// Social come to it when each card reaches product. Each of the three hangs on a window switch on its card
// (`view.home` on product/home, `view.cowork`, `view.social`), and the engine sends the window each switch's reading in
// this Sol's mode (settings.window, engine settings.ts readings, #1551): on where the team runs (concept), off on a
// tester's Sol (product) until the card's station reaches product. Build is always there.
//   the link   `?view.home=on|off` wins for one load (the stills, a developer's look)
//   storage    "1" or "0" under the switch's name: a developer's door, the console only
//   engine     settings.window[name], once the engine has said it; kept in this window (`sol.views`) so the next load
//              draws the same spine before the engine answers
//   neither    an engine that sends no reading (older, or a test's stub), or none yet, keeps all four, as before this
//              switch; but the app's first run from the zip (`?firstrun=1`, which only a tester's download meets: the
//              team runs from its checkouts) shows Build alone until the engine says, so nothing is shown to someone it
//              may not be for
import { useEffect, useMemo, useState } from "react";
import type { View } from "./flag";

export const VIEW_SWITCHES: Record<Exclude<View, "build">, string> = { home: "view.home", cowork: "view.cowork", social: "view.social" };
const KEPT = "sol.views";
type Kv = Pick<Storage, "getItem"> | null;
type KvW = Pick<Storage, "getItem" | "setItem"> | null;
/** the engine's word on the three, as it sent it: absent when it sent none (an older engine, a stub) */
export type Said = Record<string, boolean> | undefined;

/** the engine's reading of the three from the settings it sent (pure): null before any settings came, or while the
 *  engine does not know its mode yet (it sends window: null then); "none" when they came with no window block or a
 *  block that names none of the three (an engine before #1637); else each of the three */
export function saidOf(settings: { window?: unknown } | null | undefined): Record<string, boolean> | null | "none" {
  if (!settings) return null;
  const w = settings.window;
  if (w === null) return null;
  if (!w || typeof w !== "object" || Array.isArray(w)) return "none";
  const names = Object.values(VIEW_SWITCHES), out: Record<string, boolean> = {};
  for (const n of names) if (typeof (w as Record<string, unknown>)[n] === "boolean") out[n] = (w as Record<string, boolean>)[n];
  return Object.keys(out).length ? out : "none";
}

/** the views on (pure): Build always; each of the other three by the link, else storage, else what the engine said,
 *  else what this window kept from the engine, else on (nothing said yet, as before the switches) unless this is the
 *  zip's first run. `said` "none" turns all three on */
export function viewsOn(said: Record<string, boolean> | null | "none", search: string, kv: Kv): Set<View> {
  const q = new URLSearchParams(search), first = q.get("firstrun") === "1";
  let kept: Record<string, boolean> | null = null;
  try { const raw = kv?.getItem(KEPT); kept = raw ? (JSON.parse(raw) as Record<string, boolean>) : null; } catch { kept = null; }
  const on = new Set<View>(["build"]);
  for (const [view, name] of Object.entries(VIEW_SWITCHES) as [View, string][]) {
    const l = q.get(name);
    let v: boolean;
    let s: string | null = null;
    try { s = kv?.getItem(name) ?? null; } catch { s = null; }
    if (l === "on" || l === "off") v = l === "on";
    else if (s === "1" || s === "0") v = s === "1";
    else if (said === "none") v = true;
    else if (said && typeof said[name] === "boolean") v = said[name];
    else if (kept && typeof kept[name] === "boolean") v = kept[name];
    else v = said === null && !first;
    if (v) on.add(view);
  }
  return on;
}

/** the views on, in the spine's order (flag.ts VIEWS) */
const ORDER: View[] = ["home", "build", "cowork", "social"];
export const orderOf = (on: Set<View>): View[] => ORDER.filter((v) => on.has(v));
/** where a view that is not on goes: Build */
export const shownView = (v: View, on: Set<View>): View => (on.has(v) ? v : "build");

const storage = (): KvW => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const search = () => (typeof location === "undefined" ? "" : location.search);

// the views on now, for a part of Build that offers a way into another view (a group's offer, the side's mode words)
// without being handed them: true until the window has read them once
let current: Set<View> | null = null;
export const viewShown = (v: View): boolean => !current || current.has(v);

/** the views on in this window, read again whenever the engine's settings change; what the engine said is kept for the
 *  next load */
export function useViews(settings: { window?: unknown } | null | undefined): Set<View> {
  const said = saidOf(settings);
  const key = said === null ? "null" : said === "none" ? "none" : JSON.stringify(said);
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    if (!said || said === "none") return;
    try { storage()?.setItem(KEPT, JSON.stringify(said)); } catch { /* private */ }
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps -- said is read through its key
  useEffect(() => {
    const again = (e: StorageEvent) => { if (e.key === null || e.key === KEPT || Object.values(VIEW_SWITCHES).includes(e.key)) setStamp((n) => n + 1); };
    window.addEventListener("storage", again);
    return () => window.removeEventListener("storage", again);
  }, []);
  const on = useMemo(() => viewsOn(said, search(), storage()), [key, stamp]);   // eslint-disable-line react-hooks/exhaustive-deps
  current = on;
  return on;
}

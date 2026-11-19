// Show, don't say (#1020): `look.shown`, off by default, with its row in Settings › look (ShownRow.tsx). With it on, the
// face draws state instead of writing it, a mark carries its word on hover, focus and for a screen reader, and the
// second line under a row waits until it is asked for (shown.css, every rule under :root[data-shown="on"]). The doors
// are the flag.ts ones: this window's storage (`look.shown` = "1"), the page's link (`?look.shown=on|off`, the stills),
// another window's storage event. The switch also writes `data-shown` on <html>, so the CSS needs no React.
import { useSyncExternalStore } from "react";
import { buildSwitch } from "../flag.ts";

export const LOOK_SHOWN = "look.shown";
const sw = buildSwitch(LOOK_SHOWN);
const mark = () => { if (typeof document !== "undefined") document.documentElement.dataset.shown = sw.get() ? "on" : "off"; };
mark();
sw.sub(mark);

/** show, don't say: off by default */
export const shown = () => sw.get();
export const setShown = (v: boolean) => sw.set(v);
export const useShown = () => useSyncExternalStore(sw.sub, sw.get);

// The dial (#1036): look.shown by degrees. 0 words (the switch off), 1 marks (state drawn, a mark's word on hover, the
// second lines kept), 2 pictures (the second lines folded too: what look.shown was before the dial). The step is this
// window's (`look.shown.deg`), and is written as data-shown-deg on <html>, so the CSS needs no React.
export type Degree = 0 | 1 | 2;
export const DEGREES: Record<Degree, string> = { 0: "words", 1: "marks", 2: "pictures" };
export const LOOK_SHOWN_DEG = "look.shown.deg";
const readDeg = (): 1 | 2 => { try { return globalThis.localStorage?.getItem(LOOK_SHOWN_DEG) === "1" ? 1 : 2; } catch { return 2; } };
let deg: 1 | 2 = readDeg();
const markDeg = () => { if (typeof document !== "undefined") document.documentElement.dataset.shownDeg = String(degree()); };
/** where the dial stands: 0 when look.shown is off */
export const degree = (): Degree => (sw.get() ? deg : 0);
export function setDegree(d: Degree) {
  if (d > 0) { deg = d as 1 | 2; try { globalThis.localStorage?.setItem(LOOK_SHOWN_DEG, String(d)); } catch { /* private */ } }
  sw.set(d > 0);   // tells every listener, the marks on <html> among them, even when only the step moved
}
markDeg();
sw.sub(markDeg);
export const useDegree = () => useSyncExternalStore(sw.sub, degree);

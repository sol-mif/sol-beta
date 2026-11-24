// The new face's switch ui.next (#1604, docs/port/switch.md): the face's one reading of it. The switch is the engine's:
// the setting ui.next, which the engine sends already resolved against SOL_UI_NEXT and the card's station
// (engine/src/settings.ts uiNext). The only file under next/ that today's face imports statically (App.tsx); everything
// else under next/ loads lazily and only when this says on. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { useSyncExternalStore } from "react";

let on = false;
const subs = new Set<() => void>();
/** the first frame (BR1, #1615): the switch as last read is kept here, so index.html's inline script paints the window
 *  the new face's paper before anything loads (data-next-first), not the old face's dark glass; read off, the mark goes */
export const FIRST_KEY = "sol.ui.next";
function keepFirst(v: boolean): void {
  try { globalThis.localStorage?.setItem(FIRST_KEY, v ? "1" : "0"); } catch { /* storage refused: the first frame stays the old one */ }
  const root = typeof document === "undefined" ? null : document.documentElement;
  if (root && !v) delete root.dataset.nextFirst;
}
/** is the new face on? Given the engine's settings it reads them (and tells the parts that draw without them); without,
 *  the switch as last read */
export function nextOn(settings?: unknown): boolean {
  if (settings !== undefined) {
    const v = (settings as { ui?: { next?: unknown } } | null)?.ui?.next === true;
    if (settings) keepFirst(v);   // null is the engine not heard yet (useEngine): not an answer to keep
    if (v !== on) { on = v; queueMicrotask(() => subs.forEach((f) => f())); }
  }
  return on;
}
/** the engine not heard yet (settings null, useEngine): the window shows only the first frame, never the old face, unless
 *  the switch was last read off here (then the old face starts as it always did). BR1 first-face probe, #1615 */
export function waitsFirst(settings: unknown): boolean {
  if (settings != null) return false;
  try { return globalThis.localStorage?.getItem(FIRST_KEY) !== "0"; } catch { return true; }
}
/** the switch, for a part that draws without the engine's settings at hand */
export const useNextOn = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

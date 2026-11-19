// The new face's switch ui.next (#1604, docs/port/switch.md): the face's one reading of it. The switch is the engine's:
// the setting ui.next, which the engine sends already resolved against SOL_UI_NEXT and the card's station
// (engine/src/settings.ts uiNext). The only file under next/ that today's face imports statically (App.tsx); everything
// else under next/ loads lazily and only when this says on. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { useSyncExternalStore } from "react";

let on = false;
const subs = new Set<() => void>();
/** is the new face on? Given the engine's settings it reads them (and tells the parts that draw without them); without,
 *  the switch as last read */
export function nextOn(settings?: unknown): boolean {
  if (settings !== undefined) {
    const v = (settings as { ui?: { next?: unknown } } | null)?.ui?.next === true;
    if (v !== on) { on = v; queueMicrotask(() => subs.forEach((f) => f())); }
  }
  return on;
}
/** the switch, for a part that draws without the engine's settings at hand */
export const useNextOn = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

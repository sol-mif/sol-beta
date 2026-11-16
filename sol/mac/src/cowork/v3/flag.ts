// Cowork v3 (fr-30): the switch, the face's one reading of it. The switch is the engine's: the setting cowork.v3 (the
// me layer), which the engine sends already resolved against SOL_COWORK_V3 (engine/src/settings.ts coworkV3). This is
// the only v3 file today's face imports statically besides hooks.tsx (which re-exports it); everything else under v3/
// loads lazily and only when this says on, so with it off nothing of v3 loads, routes or renders (F7).
import { useSyncExternalStore } from "react";

let on = false;
const subs = new Set<() => void>();
/** is Cowork v3 on? Given the engine's settings it reads them (and tells the parts that draw without them); without,
 *  the switch as last read */
export function v3On(settings?: unknown): boolean {
  if (settings !== undefined) {
    const v = (settings as { cowork?: { v3?: unknown } } | null)?.cowork?.v3 === true;
    if (v !== on) { on = v; queueMicrotask(() => subs.forEach((f) => f())); }
  }
  return on;
}
/** the switch, for a part that draws without the engine's settings at hand */
export const useV3On = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

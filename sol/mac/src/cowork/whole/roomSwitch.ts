// The Agents' room's switch, the face's one reading of it (gate one q6, #1740; card product/cowork/room). The switch is
// the engine's, reach.room: the engine sends its reading already resolved (env, the setting, else the card's station in
// this Sol's mode; engine settings.ts readings), so the face keeps no station of its own. Off, the whole card is absent
// here: the room's page, its ways in (the shell's rail row, the groups home and a table's side) and the agents' asks
// lifted on a table's page. The press on a block is the engine's to offer (work/tools.ts asks), by the same switch.
import { useSyncExternalStore } from "react";

/** the engine's reading in the settings it sent (pure): on only when it says reach.room is on */
export const roomOnOf = (settings: unknown): boolean => (settings as { reach?: { room?: unknown } } | null | undefined)?.reach?.room === true;

let on = false;
const subs = new Set<() => void>();
/** is the Agents' room on? Given the engine's settings it reads them (and tells the parts that draw without them);
 *  without, the switch as last read */
export function roomOn(settings?: unknown): boolean {
  if (settings !== undefined) {
    const v = roomOnOf(settings);
    if (v !== on) { on = v; queueMicrotask(() => subs.forEach((f) => f())); }
  }
  return on;
}
/** each turn of the switch, for a part registered outside React (ours.tsx) */
export function onRoomSwitch(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
/** the switch, for a part that draws without the engine's settings at hand */
export const useRoomOn = () => useSyncExternalStore(onRoomSwitch, () => on);

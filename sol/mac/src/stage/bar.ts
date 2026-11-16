// What the stage and the bar share (#698): the chips the bar made of the words (things) and what the person attached
// from the stage (on). The stage writes `on` only when a block's reference icon is pressed (#953: a hover, a scroll or a
// click in a block attaches nothing) and a chip's slot (a chip dropped); the bar writes the things as you type and reads both to draw its chips and to send them.
// One window, one stage at a time: a module store, read with useSyncExternalStore. No DOM, so the tests reach it.
import { useSyncExternalStore } from "react";
import type { Slot, Target, Thing } from "./ask";
import type { Kind, Place, Size } from "./model";

/** a chip of the bar, dragged onto the stage: its index rides the drag; the event says which chip, so the ghost has its size */
export const CHIP = "text/sol-thing", CHIP_EVENT = "sol:thing-drag";

/** a target with the words its chip shows (the week › Thu › 14:00) */
export type On = Target & { words: string; /** #954: its block's kind, for the "on" token's mark */ kind?: Kind };
/** the stage as the bar needs it: its size and its blocks' places with their titles ("beside the week") */
export type Room = { size: Size; places: (Place & { title: string })[] };
export type BarState = { session: string | null; things: Thing[]; on: On[]; picked: boolean; room: Room | null };
let state: BarState = { session: null, things: [], on: [], picked: false, room: null };
const subs = new Set<() => void>();
const set = (patch: Partial<BarState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };

export const barState = () => state;
export const useBar = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, barState);

/** the session the bar asks for: a new one clears what was pointed at */
export function barSession(id: string | null) { if (id !== state.session) set({ session: id, on: [], picked: false }); }
/** the chips, as the words change */
export function setThings(things: Thing[]) { if (things !== state.things) set({ things }); }
/** a chip dropped on the stage: its slot, kept while its kind stays */
export function slotThing(i: number, slot: Slot) { if (state.things[i]) set({ things: state.things.map((t, j) => (j === i ? { ...t, slot, dropped: true } : t)) }); }
const sameOn = (a: Target) => (b: Target) => a.id === b.id && (a.part ?? "") === (b.part ?? "");
/** a block or its part attached on purpose (#953, its reference icon): it joins what goes with the next message; pressed
 *  again, it comes off */
export function attach(o: On) {
  set({ on: state.on.some(sameOn(o)) ? state.on.filter((x) => !sameOn(o)(x)) : [...state.on, o], picked: false });
}
/** one attached thing taken off beside the box */
export function detach(o: Target) { if (state.on.some(sameOn(o))) set({ on: state.on.filter((x) => !sameOn(o)(x)) }); }
/** what goes with the next message, set whole; empty clears */
export function pointAt(on: On[], picked = false) {
  const same = on.length === state.on.length && on.every((o, i) => o.id === state.on[i].id && o.part === state.on[i].part);
  if (!same || picked !== state.picked) set({ on, picked });
}
/** the stage's size and places, as it lays them out */
export function setRoom(room: Room) { state = { ...state, room }; }
/** sent: the chips and the target go with the words, and leave the bar */
export function sent() { set({ things: [], on: [], picked: false }); }

/** a text field with words in it: its own keys (⌘↑, ⌘↓) are its, not the strip's */
export const wordsIn = (t: EventTarget | null): boolean => {
  const el = t as (HTMLElement & { value?: unknown }) | null;
  if (!el || typeof el.closest !== "function") return false;
  const field = el.closest("input,textarea,[contenteditable=true]") as (HTMLElement & { value?: unknown }) | null;
  if (!field) return false;
  return (typeof field.value === "string" ? field.value : field.textContent ?? "").trim().length > 0;
};

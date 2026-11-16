// Three calendars as one (#807, plan Part C slice 44), behind sol.home.whole: what the face holds of `cal.layers`. The
// transport is cal.ts's stub until #835 lands; then `send` is the engine's socket and nothing else here changes.
import { useSyncExternalStore } from "react";
import { stub, type CalAsk, type CalMsg } from "./cal.ts";

let view: CalMsg | null = null;
const subs = new Set<() => void>();
let engine: ((a: CalAsk) => CalMsg) | null = null;
/** ask the calendars (the stub, until #835) */
export function send(a: CalAsk) { engine ??= stub(); view = engine(a); subs.forEach((f) => f()); }
export const keepFix = (conflictId: string, fix: string) => send({ type: "cal.fix.keep", conflictId, fix });
export const place = (sentence: string) => send({ type: "cal.place", sentence });
export const undoCal = (ledgerId: string) => send({ type: "home.undo", ledgerId });
export const calNow = () => view;
export function useCal(): CalMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send({ type: "cal.layers" }); return () => { subs.delete(f); }; }, () => view);
}

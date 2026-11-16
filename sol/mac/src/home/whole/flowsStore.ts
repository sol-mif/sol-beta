// Flows (#802, plan Part C slice 39), behind sol.home.whole: what the face holds of `flows`, the new flow drawn from a
// sentence included. The transport is flows.ts's stub until #801 lands; then `send` is the engine's socket.
import { useSyncExternalStore } from "react";
import { stub, type FlowsAsk, type FlowsMsg } from "./flows.ts";

let view: FlowsMsg | null = null;
const subs = new Set<() => void>();
let engine: ((a: FlowsAsk) => FlowsMsg) | null = null;
/** ask the flows (the stub, until #801) */
export function send(a: FlowsAsk) { engine ??= stub(); view = engine(a); subs.forEach((f) => f()); }
export const sayFlow = (sentence: string) => send({ type: "flow.say", sentence });
export const saveFlow = (flowId: string) => send({ type: "flow.save", flowId });
export const dropFlow = (flowId: string) => send({ type: "flow.drop", flowId });
export const pauseFlow = (flowId: string, on: boolean) => send({ type: "flow.pause", flowId, on });
export const runLastWeek = (flowId: string) => send({ type: "flow.run.once", flowId, replay: "last week" });
export const keepHabit = (id: string) => send({ type: "flow.habit.keep", id });
export const dropHabit = (id: string) => send({ type: "flow.habit.drop", id });
export const undoFlows = (ledgerId: string) => send({ type: "home.undo", ledgerId });
export const flowsNow = () => view;
export function useFlows(): FlowsMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send({ type: "flows" }); return () => { subs.delete(f); }; }, () => view);
}

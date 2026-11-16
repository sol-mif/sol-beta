// Jev, all day (#803, plan Part C slice 40), behind sol.home.whole: what the face holds of `judge.reads`. The transport is
// judge.ts's stub until #832 lands; then `send` is the engine's socket and nothing else here changes.
import { useSyncExternalStore } from "react";
import { stub, type JudgeAsk, type JudgeMsg } from "./judge.ts";

let view: JudgeMsg | null = null;
const subs = new Set<() => void>();
let engine: ((a: JudgeAsk) => JudgeMsg) | null = null;
/** ask Jev's day (the stub, until #832) */
export function send(a: JudgeAsk) { engine ??= stub(); view = engine(a); subs.forEach((f) => f()); }
export const setLine = (questionId: string, line: number) => send({ type: "judge.line.set", questionId, line });
export const undoLine = (ledgerId: string) => send({ type: "home.undo", ledgerId });
export const judgeNow = () => view;
export function useJudge(): JudgeMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send({ type: "judge.reads" }); return () => { subs.delete(f); }; }, () => view);
}

// "keep" on the suggestion: held here, not in the place, so it stays put when you go to Sources and come back (C40-2)
let kept: ReadonlySet<string> = new Set();
const keptSubs = new Set<() => void>();
export function keepLine(questionId: string) { kept = new Set(kept).add(questionId); keptSubs.forEach((f) => f()); }
export function useKept(): ReadonlySet<string> {
  return useSyncExternalStore((f) => { keptSubs.add(f); return () => { keptSubs.delete(f); }; }, () => kept);
}

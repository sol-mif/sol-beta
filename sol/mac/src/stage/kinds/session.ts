// A session block's words and presses (orchestration step 4, the design #1183 §3; engine work/children.ts). Pure, so a
// test reads them from a fixed body: the state word from the side's own rowState, where it works, and the one message
// each press sends to the engine. Nothing here acts: the kind (SessionBlock.tsx) sends what these return.
import { rowState } from "../../work/rowState.ts";
import type { SessionBody } from "./types.ts";

export type Word = "working" | "needs you" | "done" | "failed" | "idle";
/** the state word, from the same rowState the sidebar draws its mark with */
export function wordOf(b: SessionBody): Word {
  const s = rowState(b.row ?? {}, b.run ? { waiting: b.run.waiting, busy: b.run.busy, tasks: b.run.tasks ? Array(b.run.tasks).fill("") : [], failed: b.run.failed } : undefined);
  return s === "running" ? "working" : s === "needs" ? "needs you" : s === "failed" ? "failed" : s === "done" || s === "unread" ? "done" : "idle";
}
/** where: the folder's short name · the branch · the PR's state, each only when known */
export function whereOf(b: SessionBody): string {
  const w = b.where ?? { folder: "" };
  return [w.folder, w.branch, w.pr ? `PR #${w.pr.n} ${w.pr.state}` : ""].filter(Boolean).join(" · ");
}
/** which presses the block offers now: open always; stop while it works; archive once it rests (done, failed, idle) */
export function pressesOf(b: SessionBody): ("open" | "stop" | "archive")[] {
  const w = wordOf(b);
  return ["open", ...(w === "working" ? ["stop" as const] : []), ...(w === "done" || w === "failed" || w === "idle" ? ["archive" as const] : [])];
}
export type PressMsg = { type: "work.stage.session"; sessionId: string; id: string; press: "steer" | "answer" | "stop" | "archive"; text?: string; i?: number; label?: string };
/** the one message a press sends: on the orchestrator's stage (`session`), naming the block; a button by its place in the
 *  child's wrap-up and the words it showed (the engine reads them again: changed since, the button is gone), a steer with its text; an empty steer sends nothing */
export function pressMsg(session: string, blockId: string, press: PressMsg["press"], more: { text?: string; i?: number; label?: string } = {}): PressMsg | null {
  if (press === "steer") { const t = (more.text ?? "").trim(); return t ? { type: "work.stage.session", sessionId: session, id: blockId, press, text: t } : null; }
  if (press === "answer") return Number.isInteger(more.i) && typeof more.label === "string" ? { type: "work.stage.session", sessionId: session, id: blockId, press, i: more.i, label: more.label } : null;
  return { type: "work.stage.session", sessionId: session, id: blockId, press };
}

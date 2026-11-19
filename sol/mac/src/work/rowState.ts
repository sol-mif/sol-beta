// A session's state as the side says it (WorkSidebar's rowState, moved here so a plain module can share it: the
// orchestration stage's session block draws the same word, stage/kinds/session.ts). Pure; types only from useWork.
import type { RunInfo, WorkSession } from "./useWork";

export type RowState = "running" | "needs" | "failed" | "unread" | "done" | "";
/** the run at work: its turn, or its background agents (useWork's working, the same rule) */
const busy = (r?: Pick<RunInfo, "busy" | "tasks">) => !!r && (r.busy || !!r.tasks?.length);
export const rowState = (s: Pick<WorkSession, "running" | "failed" | "unread" | "done">, r?: Pick<RunInfo, "waiting" | "busy" | "tasks" | "failed">): RowState =>
  r?.waiting ? "needs" : busy(r) || s.running ? "running" : (r ? r.failed : s.failed) ? "failed" : s.unread ? "unread" : s.done ? "done" : "";

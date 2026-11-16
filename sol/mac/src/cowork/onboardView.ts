// The walk through a project's pure parts (#430, Onboard.tsx): the view the engine sends (team.onboarding, PROTOCOL
// round 75), where a walk starts again, the night drawn as four marks on one line, and the hours set apart in a line.
// No React here: src/onboard.test.ts.
import type { StepId } from "./projectView";

export type Mark = "done" | "skipped";
export type WalkState = "done" | "skipped" | "partway" | "new";
export type WalkStep = { id: StepId; title: string; lines: string[]; note: string; mark?: Mark };
export type WalkView = {
  repo: string; welcome: string; steps: WalkStep[]; me: string; state: WalkState; due: boolean;
  night: { handIn: string; review: string; until: string; release: string; zone: string };
  people: { login: string; state: WalkState; at: string }[]; custom: boolean; newer?: boolean; error?: string;
};

/** where the walk opens (pure): the welcome (-1) for someone new, else the first step not marked yet */
export function startAt(v: Pick<WalkView, "steps" | "state">): number {
  if (v.state === "new") return -1;
  const i = v.steps.findIndex((s) => !s.mark);
  return i < 0 ? v.steps.length - 1 : i;
}

const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
/** the night as four marks on one line from the hand-in to the release (pure): each mark's place, 0 to 1, along the
 *  hours that pass from the hand-in (a time before it is the next morning) */
export function nightMarks(n: WalkView["night"]): { word: string; at: string; x: number }[] {
  const from = mins(n.handIn);
  const after = (t: string) => ((mins(t) - from) % 1440 + 1440) % 1440;
  const list = [{ word: "hand in", at: n.handIn }, { word: "the dev night", at: n.review }, { word: "fixes until", at: n.until }, { word: "release", at: n.release }];
  const span = Math.max(1, ...list.map((x) => after(x.at)));
  return list.map((x) => ({ ...x, x: after(x.at) / span }));
}

/** a line cut into plain words and hours (pure), so the face sets each hour apart without dangerously set HTML */
export function hoursIn(line: string): { t: string; hour?: true }[] {
  const out: { t: string; hour?: true }[] = [];
  let last = 0;
  for (const m of line.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)) {
    if (m.index! > last) out.push({ t: line.slice(last, m.index) });
    out.push({ t: m[0], hour: true });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
}

/** how a walk ends when its last step is marked (pure): every step skipped is the walk skipped (facts only stays),
 *  anything seen is the walk done. `marks` are the ones made in this walk, over the view's */
export function endAs(steps: Pick<WalkStep, "id" | "mark">[], marks: Partial<Record<string, Mark>>): Mark {
  return steps.length > 0 && steps.every((s) => (marks[s.id] ?? s.mark) === "skipped") ? "skipped" : "done";
}

/** one person's place in the walk, in a word (pure) */
export const STATE_WORD: Record<WalkState, string> = { done: "walked through", skipped: "skipped it", partway: "partway", new: "not yet" };

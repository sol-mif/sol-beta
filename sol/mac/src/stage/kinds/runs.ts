// A list whose steps are runs (#703; the design: mine/look/stage/runs.html): what runs in the background is a list block
// bound with watch "run" (the engine's background.ts writes it), one step per background session. These are its words
// and its order, pure, apart from the drawing (Runs.tsx) so the face's tests reach them.
import type { Step } from "./types";

/** how a session is doing: working, waits (needs your word), done, ended (stopped with no done line), queued */
export type RunState = "waits" | "working" | "done" | "ended" | "queued";
export type Move = { k: string; w: string };
export type Run = {
  name: string; issue?: number; what?: string; state: RunState; min: number; said: string;
  pr?: { n: number; draft: boolean; url?: string };
  moves: Move[]; files: string[]; turns: number; tokens: number; commits: number; done?: string;
};
export type RunStep = Step & { run: Run };
export type RunBody = { steps: RunStep[]; where: string; cap: number };

/** whether a list's body is a run's: every step carries its run (an empty run says where it is) */
export const isRunBody = (b: unknown): b is RunBody => {
  const v = b as Partial<RunBody> | null;
  return !!v && Array.isArray(v.steps) && typeof v.where === "string" && v.steps.every((s) => !!(s as RunStep)?.run?.name);
};

const ORDER: Record<RunState, number> = { waits: 0, working: 1, done: 2, ended: 3, queued: 4 };
/** the sessions in the order they are drawn: the one that needs you on top, then the working, then the done */
export const ordered = (b: RunBody): RunStep[] => b.steps.map((s, i) => ({ s, i })).sort((x, y) => (ORDER[x.s.run.state] ?? 5) - (ORDER[y.s.run.state] ?? 5) || x.i - y.i).map(({ s }) => s);

/** the run in a few words: "1 needs you · 1 working · 3 done" */
export function runWords(b: RunBody): string {
  const n = (st: RunState) => b.steps.filter((s) => s.run.state === st).length;
  return [n("waits") ? `${n("waits")} needs you` : "", n("working") ? `${n("working")} working` : "", n("done") ? `${n("done")} done` : ""].filter(Boolean).join(" · ") || "nothing running";
}
/** the chip by the talk: where, then the words ("NucBox · 1 working · 3 done") */
export const chipWords = (b: RunBody) => `${b.where} · ${runWords(b)}`;
/** what the jelly of the whole run does: waits when one needs you, works while one works, else rests */
export const runDoing = (b: RunBody): "waits" | "working" | "rest" =>
  b.steps.some((s) => s.run.state === "waits") ? "waits" : b.steps.some((s) => s.run.state === "working") ? "working" : "rest";

/** a session's hours as words and as a part of the whole: "41 min of 4 h" */
export function hours(min: number, cap: number): { words: string; part: number } {
  const h = Math.round(cap / 3600);
  return { words: `${min} min of ${h} h`, part: Math.max(0, Math.min(1, (min * 60) / Math.max(1, cap))) };
}
/** a thousand tokens as "173k" */
export const thousands = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
/** a file by its last name */
export const fileName = (p: string) => p.split("/").pop() || p;

// How Sol worked, for "Sol works for you" (BR1, #1615): next.traces (traces.ts) with the work plans, the automations and
// the planner in it. Built from their own records (plans.json, automations.json, planner.jsonl) and nothing said in them,
// under traces.ts's privacy rule: a plan's run carries ids, states, counts and times, never its title, its steps' names or
// what they do, an answer, or the ask (the face puts the names it already holds beside the ids). A session run that was a
// plan's step or an automation's run is marked `of` with the ids, so the face can say "a step of <plan>".
//   a plan        one run a day it was alive: from its start (or its making) to its end, result from its state, one step
//                 line per plan step that started or ended that day (facts: step key, state), a wait while one needs you
//   an automation one run a day it ran: each run a step (facts: how, state)
//   the planner   one run per plan made that day: who planned (this Mac, your AI, you), how long, how many steps, fell back
// Read only. Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextDir } from "./file.js";
import { dayOf } from "./diary.js";
import { readPlans, type Plan } from "./plans.js";
import { readAutos } from "./automations.js";
import type { Run, Step, Traces } from "./traces.js";

const dayAt = (t: number | undefined) => (t ? dayOf(new Date(t)) : "");
const bare = (r: Partial<Run> & Pick<Run, "id" | "source" | "from" | "to" | "result">): Run =>
  ({ provider: null, tools: [], waits: [], permissions: [], steps: [], more: 0, back: null, unknown: [], ...r });

const planResult = (p: Plan): Run["result"] =>
  p.state === "done" ? "done" : p.state === "running" ? (p.steps.some((s) => s.state === "needs you") ? "waiting" : "running")
    : p.state === "held" || p.steps.some((s) => s.state === "failed") ? "failed" : p.state === "proposed" || p.state === "paused" ? "waiting" : "unknown";

/** the day's runs of plans, automations and the planner (pure over the records) */
export function workRuns(home: string, day: string): Run[] {
  const runs: Run[] = [];
  for (const p of readPlans(home)) {
    const times = [p.made, p.startedAt, p.endedAt, ...p.steps.flatMap((s) => [s.startedAt, s.endedAt])].filter((t): t is number => !!t);
    if (!times.some((t) => dayAt(t) === day)) continue;
    const steps: Step[] = [];
    for (const s of p.steps) {
      if (s.startedAt && dayAt(s.startedAt) === day) steps.push({ at: s.startedAt, kind: "plan.step.start", facts: { step: s.key } });
      if (s.endedAt && dayAt(s.endedAt) === day) steps.push({ at: s.endedAt, kind: "plan.step.end", facts: { step: s.key, state: s.state } });
    }
    const on = times.filter((t) => dayAt(t) === day);
    runs.push(bare({
      id: `plan:${p.id}`, source: { kind: "plan", id: p.id, seat: null }, from: Math.min(...on), to: Math.max(...on), result: planResult(p),
      steps: steps.sort((a, b) => a.at - b.at), back: { plan: p.id },
      waits: p.steps.filter((s) => s.state === "needs you" && s.startedAt).map((s) => ({ at: s.startedAt!, on: "permission", until: null })),
      unknown: ["tokens"],
    }));
  }
  for (const a of readAutos(home)) {
    if (!a.last || dayAt(a.last.at) !== day) continue;
    runs.push(bare({
      id: `automation:${a.id}`, source: { kind: "automation", id: a.id, seat: null }, from: a.last.at, to: a.last.at,
      result: a.last.state === "done" ? "done" : a.last.state === "failed" ? "failed" : a.last.state === "needs you" ? "waiting" : "running",
      steps: [{ at: a.last.at, kind: "automation.ran", facts: { how: a.last.how, state: a.last.state } }], back: { automation: a.id, session: a.last.sessionId },
      unknown: ["tokens"],
    }));
  }
  let text = "";
  try { text = readFileSync(join(nextDir(home), "planner.jsonl"), "utf8"); } catch { /* no plan made yet */ }
  for (const l of text.split("\n")) {
    let j: any;
    try { j = JSON.parse(l); } catch { continue; }
    if (!Number.isFinite(j?.at) || dayAt(j.at) !== day) continue;
    const ms = Number.isFinite(j.ms) ? j.ms : 0;
    runs.push(bare({
      id: `planner:${j.at}`, source: { kind: "planner", id: String(j.at), seat: j.by === "your AI" ? "claude" : null }, from: j.at, to: j.at + ms,
      result: j.ok ? "done" : "failed",
      provider: j.by === "your AI" ? { seat: "claude", model: typeof j.model === "string" ? j.model : null, turns: 1, tokens: null, costTotal: null } : null,
      steps: [{ at: j.at, kind: "planner.made", facts: { by: String(j.by ?? "unknown"), ms, steps: Number(j.steps) || 0, fell: !!j.fell } }],
      unknown: j.by === "your AI" ? ["tokens"] : [],
    }));
  }
  return runs;
}

/** the traces with the day's work runs added, and the session runs that were steps or automation runs marked */
export function withWork(t: Traces, home: string): Traces {
  const of = new Map<string, Run["of"]>();
  for (const p of readPlans(home)) for (const s of p.steps) if (s.sessionId) of.set(s.sessionId, { plan: p.id, step: s.key });
  for (const a of readAutos(home)) if (a.last) of.set(a.last.sessionId, { automation: a.id });
  for (const r of t.runs) if (r.source.kind === "session" && of.has(r.source.id)) r.of = of.get(r.source.id);
  const runs = [...t.runs, ...workRuns(home, t.day)].sort((a, b) => b.to - a.to);
  const mine = [...readPlans(home).flatMap((p) => [p.made, p.startedAt, p.endedAt]), ...readAutos(home).map((a) => a.last?.at)].map(dayAt).filter(Boolean);
  const days = [...new Set([...t.days, ...mine])].sort().reverse();
  return { ...t, runs, days };
}

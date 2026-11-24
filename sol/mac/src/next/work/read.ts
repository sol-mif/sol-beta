// "Sol works for you" (BR1, #1615): the engine's next.plans, next.autos and next.planner (sol/PROTOCOL.md "## next", the
// engine's next/plans.ts, next/automations.ts, next/planner.ts) read into what the Work page draws. Pure. `cleanPlans`
// and `cleanAutos` keep an answer's fields by an allowlist; the say* functions put each part in plain words: "your AI",
// "this Mac", Keep / Discard / Undo. The page is index.tsx; the store's part is D.work (cv/wire/work.ts).
// Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).

export type StepState = "waiting" | "working" | "needs you" | "done" | "failed" | "stopped";
export type PlanState = "proposed" | "running" | "paused" | "held" | "stopped" | "done";
export type Who = "this Mac" | "your AI" | "you";
export type By = { who: Who; model: string | null; ms: number | null; why: string | null };
export type Step = { key: string; name: string; does: string; after: string[]; model: string | null; state: StepState; sessionId: string | null; startedAt: number | null; endedAt: number | null; result: string | null };
export type Plan = { id: string; title: string; ask: string; why: string; steps: Step[]; state: PlanState; hold: string | null; revision: number; made: number; startedAt: number | null; endedAt: number | null; by: By };
export type Last = { at: number; sessionId: string; state: "working" | "needs you" | "done" | "failed"; how: "clock" | "now" | "event"; files: string[] };
/** `region`: the window's folder it was made in; `cwd`: where it works; `ran`: its last five runs, newest first (BR1 item 2);
 *  `in`: the session it was made in, on whose table it lives (birth.html row 5) */
export type Auto = { id: string; name: string; does: string; when: string; on: boolean; made: number; model: string | null; last: Last | null; runs: number; next: string; region: string | null; cwd: string | null; ran: Last[]; in?: string | null };
export type Planner = { thisMac: "available" | "unavailable"; reason: string | null; yourAI: string | null };
/** the page's part of the store (D.work), filled by the wire; `undo` holds what was just removed, for Undo */
export type Work = {
  plans: Plan[]; autos: Auto[]; planner: Planner | null;
  /** the ask being planned, while the planner works */
  making: string | null;
  /** the plan just made, and who made it, so the page says so beside it */
  made: { id: string; by: By } | null;
  /** the engine's last refusal on this page, in its words */
  note: string | null;
  undo: { kind: "plan" | "auto"; name: string; data: unknown } | null;
};
export const empty = (): Work => ({ plans: [], autos: [], planner: null, making: null, made: null, note: null, undo: null });

// ---------------------------------------------------------------- the allowlist

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown): string | null => (typeof v === "string" && /^[\w.:@-]{1,80}$/.test(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const STEP: StepState[] = ["waiting", "working", "needs you", "done", "failed", "stopped"];
const PLAN: PlanState[] = ["proposed", "running", "paused", "held", "stopped", "done"];
const WHO: Who[] = ["this Mac", "your AI", "you"];
const LAST: Last["state"][] = ["working", "needs you", "done", "failed"];

export function cleanBy(b: unknown): By {
  const o = isObj(b) ? b : {};
  return { who: WHO.find((w) => w === o.who) ?? "you", model: id(o.model), ms: num(o.ms), why: str(o.why, 400) || null };
}
function cleanStep(s: unknown): Step | null {
  if (!isObj(s) || !id(s.key)) return null;
  return {
    key: s.key as string, name: str(s.name, 160), does: str(s.does, 8000), after: arr(s.after).map(id).filter((x): x is string => !!x),
    model: id(s.model), state: STEP.find((x) => x === s.state) ?? "waiting", sessionId: id(s.sessionId),
    startedAt: num(s.startedAt), endedAt: num(s.endedAt), result: str(s.result, 600) || null,
  };
}
export function cleanPlans(m: unknown): Plan[] {
  return arr(isObj(m) ? m.plans : null).filter(isObj).map((p): Plan | null => {
    const pid = id(p.id);
    if (!pid) return null;
    return {
      id: pid, title: str(p.title, 160) || "Work plan", ask: str(p.ask, 2000), why: str(p.why, 2000),
      steps: arr(p.steps).map(cleanStep).filter((s): s is Step => !!s), state: PLAN.find((x) => x === p.state) ?? "proposed",
      hold: str(p.hold, 300) || null, revision: num(p.revision) ?? 0, made: num(p.made) ?? 0, startedAt: num(p.startedAt), endedAt: num(p.endedAt), by: cleanBy(p.by),
    };
  }).filter((p): p is Plan => !!p).sort((a, b) => b.made - a.made);
}
function cleanLast(v: unknown): Last | null {
  const l = isObj(v) ? v : null;
  if (!l || num(l.at) == null || !id(l.sessionId)) return null;
  return {
    at: num(l.at)!, sessionId: l.sessionId as string, state: LAST.find((x) => x === l.state) ?? "done", how: l.how === "now" || l.how === "event" ? l.how : "clock",
    files: arr(l.files).map((f) => str(f, 300)).filter(Boolean).slice(0, 20),
  };
}
export function cleanAutos(m: unknown): Auto[] {
  return arr(isObj(m) ? m.autos : null).filter(isObj).map((a): Auto | null => {
    const aid = id(a.id);
    if (!aid) return null;
    const last = cleanLast(a.last), ran = arr(a.ran).map(cleanLast).filter((r): r is Last => !!r).slice(0, 5);
    return {
      id: aid, name: str(a.name, 120) || "Automation", does: str(a.does, 8000), when: str(a.when, 200), on: a.on === true, made: num(a.made) ?? 0,
      model: id(a.model), runs: num(a.runs) ?? 0, next: str(a.next, 80) || "", last,
      region: str(a.region, 300) || null, cwd: typeof a.cwd === "string" && a.cwd.startsWith("/") ? a.cwd.slice(0, 1000) : null,
      ran: ran.length ? ran : last ? [last] : [], ...(id(a.in) ? { in: id(a.in) } : {}),
    };
  }).filter((a): a is Auto => !!a).sort((a, b) => b.made - a.made);
}
export function cleanPlanner(m: unknown): Planner | null {
  if (!isObj(m)) return null;
  return { thisMac: m.thisMac === "available" ? "available" : "unavailable", reason: str(m.reason, 300) || null, yourAI: id(m.yourAI) };
}

// ---------------------------------------------------------------- the words

const pad = (n: number) => String(n).padStart(2, "0");
export const hm = (at: number) => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const STEP_SAYS: Record<StepState, string> = { waiting: "Waiting", working: "Working", "needs you": "Waiting on you", done: "Done", failed: "Could not finish", stopped: "Stopped" };
export const PLAN_SAYS: Record<PlanState, string> = { proposed: "Waiting for your yes", running: "Running", paused: "Paused", held: "Held", stopped: "Stopped", done: "Done" };
/** the models a step can run on, all on your AI; null is your AI's usual one */
export const MODELS: { id: string | null; say: string }[] = [
  { id: null, say: "Your AI's usual model" }, { id: "claude-opus-5-5", say: "Opus 5.5, most capable" },
  { id: "claude-sonnet-5-5", say: "Sonnet 5.5" }, { id: "claude-haiku-5-5", say: "Haiku 5.5, quickest" },
];
export const sayModel = (m: string | null) => MODELS.find((x) => x.id === m)?.say ?? m ?? MODELS[0].say;
const secs = (ms: number | null) => (ms == null ? "" : ms < 1000 ? " in under a second" : ` in ${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`);
/** who made a plan, said beside it */
export function sayBy(b: By): string {
  if (b.who === "this Mac") return `Planned on this Mac${secs(b.ms)}`;
  const because = b.why?.match(/^Planned by your AI because (.+?)\.?$/)?.[1];
  if (b.who === "your AI") return `Planned by your AI${b.model ? ` (${sayModel(b.model).split(",")[0]})` : ""}${secs(b.ms)}${because ? `, because ${because}` : ""}`;
  return b.why ?? "Written by you";
}
/** who will plan the next ask, said before it is asked */
export function sayPlanner(p: Planner | null): string {
  if (!p) return "Checking who can plan on this Mac…";
  if (p.thisMac === "available") return "Plans are made on this Mac, by its own model. Nothing leaves it to plan.";
  return `Plans are made by your AI${p.reason ? `: ${p.reason.replace(/\.$/, "")}` : ", since this Mac has no model of its own to use"}.`;
}
/** a step's "waits on", in the plan's own step names */
export function sayAfter(p: Plan, s: Step): string {
  if (!s.after.length) return "";
  const n = s.after.map((k) => p.steps.findIndex((x) => x.key === k) + 1).filter((i) => i > 0);
  return `after step${n.length === 1 ? "" : "s"} ${n.join(", ")}`;
}
/** what the plan's own state line says */
export function sayPlan(p: Plan): string {
  const asks = p.steps.filter((s) => s.state === "needs you").length, done = p.steps.filter((s) => s.state === "done").length;
  if (p.state === "running") return asks ? `Running · ${asks} step${asks === 1 ? "" : "s"} need${asks === 1 ? "s" : ""} you` : `Running · ${done} of ${p.steps.length} done`;
  if (p.state === "held" || p.state === "paused" || p.state === "stopped") return `${PLAN_SAYS[p.state]}${p.hold ? `: ${p.hold}` : ""}`;
  if (p.state === "done") return `Done${p.endedAt ? ` at ${hm(p.endedAt)}` : ""}`;
  return PLAN_SAYS[p.state];
}
/** what the page lets the person do to a plan now */
export function actsOf(p: Plan): { edit: boolean; start: "Start" | "Start again" | null; pause: boolean; stop: boolean; remove: boolean } {
  const can = p.state === "proposed" || p.state === "paused" || p.state === "held";
  return { edit: can, start: can ? (p.state === "proposed" ? "Start" : "Start again") : null, pause: p.state === "running", stop: p.state === "running" || p.state === "paused" || p.state === "held", remove: p.state !== "running" };
}
/** the files an event ran on, by name: "notes.pdf", "notes.pdf and one more", "3 new files" */
export function sayFiles(f: string[]): string {
  const name = (p: string) => p.split("/").pop() || p;
  if (!f.length) return "a new file";
  if (f.length === 1) return name(f[0]);
  return f.length === 2 ? `${name(f[0])} and one more` : `${f.length} new files`;
}
export const LAST_SAYS: Record<Last["state"], string> = { working: "Working", "needs you": "Waiting on you", done: "Done", failed: "Could not finish" };
export function sayLast(a: Auto): string {
  if (!a.last) return "Has not run yet";
  return `Last ran at ${hm(a.last.at)}${a.last.how === "now" ? ", when you pressed Run now" : a.last.how === "event" ? `, when ${sayFiles(a.last.files)} came in` : ""} · ${LAST_SAYS[a.last.state]}`;
}
export function sayNext(a: Auto): string {
  if (!a.on) return "Paused";
  return a.next ? `Next: ${a.next}` : "On";
}
/** how many plans wait on the person (a yes, a held plan, a step asking) */
export const waitingOn = (w: Work | undefined) => (w?.plans ?? []).filter((p) => p.state === "proposed" || p.state === "held" || p.steps.some((s) => s.state === "needs you")).length
  + (w?.autos ?? []).filter((a) => a.last?.state === "needs you").length;
export const WHEN_EXAMPLES = ["every day at 08:00", "on Mon at 09:30", "every 30 min 09:00–17:00"];
/** in a folder that has one on this Mac, an event too (the engine's automations.ts eventOf) */
export const EVENT_EXAMPLES = ["when a new file comes in"];

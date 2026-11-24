// "How Sol worked" (#1615; the contract on #1615 issuecomment-7031944218, the engine's next.traces, sol/PROTOCOL.md
// "## next"): one day's runs as the engine recorded them, read into words. Pure: `clean` keeps an answer's fields by an
// allowlist (a field not named here is never read, so a prompt, a reply or a tool's arguments, which the engine never
// sends, could not be drawn even if an answer carried them), and the say* functions put each part in plain words. What
// a record does not hold is said as unknown, never filled in. The view is Worked.tsx; the store's part is D.worked
// (cv/moves/settings.ts stWorked, cv/wire/settings.ts). Signed: franktsai2008-eng's agent, the face half of "How Sol worked" (#1615).

export type Result = "done" | "failed" | "running" | "waiting" | "unknown";
export type Answer = "yes" | "no" | "let" | "refused" | null;
export type SourceKind = "session" | "folder" | "thing" | "block" | "home" | "diary" | "plan" | "automation" | "planner";
export type Run = {
  id: string;
  source: { kind: SourceKind; id: string; seat: string | null };
  from: number; to: number;
  provider: { seat: string; model: string | null; turns: number; tokens: { in: number; out: number } | null; costTotal: number | null } | null;
  tools: { tool: string; n: number; ok: number; failed: number; unsaid: number }[];
  result: Result;
  waits: { at: number; on: string; until: number | null }[];
  permissions: { at: number; act: string; rung: string; answer: Answer }[];
  /** how many steps the engine recorded (the steps themselves are not drawn) */
  steps: number;
  back: { session?: string; place?: string; thing?: string; block?: string; day?: string; plan?: string; automation?: string } | null;
  unknown: string[];
  /** a session run that was a work plan's step or an automation's run (BR1 C, the engine's next/traces-work.ts): ids only */
  of: { plan?: string; step?: string; automation?: string } | null;
  /** a planner run: who planned (this Mac, your AI, or no one, so the ask became one step) */
  by: "this Mac" | "your AI" | "you" | null;
};
export type Traces = { day: string; days: string[]; runs: Run[]; coverage: { log: "read" | "none" | "off"; unknown: { what: string; say: string }[] } };
/** the panel's part of the store (D.worked): the day asked, where the asking is, the answer as cleaned */
export type Worked = { day: string | null; state: "asking" | "here" | "refused" | "silent" | "off"; t: Traces | null; sample?: boolean };

// ---------------------------------------------------------------- the allowlist

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** a name read out: one of the engine's own words or an id, one short line */
const NAME = /^[\w.:@+-]{1,80}$/;
/** a folder said by its path under the home: one line, no control characters */
const FOLDER = /^[^\u0000-\u001f\u007f]{1,200}$/;
const RESULTS: Result[] = ["done", "failed", "running", "waiting", "unknown"];
const ANSWERS = ["yes", "no", "let", "refused"];
const KINDS: SourceKind[] = ["session", "folder", "thing", "block", "home", "diary", "plan", "automation", "planner"];
const UNKNOWN = ["provider", "model", "tokens", "outcome", "tools"];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const name = (v: unknown): string | null => (typeof v === "string" && NAME.test(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** a run's `of`: the plan, step and automation ids, each kept only as an id */
function cleanOf(o: unknown): Run["of"] {
  if (!isObj(o)) return null;
  const out: NonNullable<Run["of"]> = {};
  for (const k of ["plan", "step", "automation"] as const) { const v = name(o[k]); if (v) out[k] = v; }
  return Object.keys(out).length ? out : null;
}
/** a planner run's one step says who planned: one of three words, else not said */
const BY = ["this Mac", "your AI", "you"] as const;
function byOf(steps: unknown): Run["by"] {
  const f = isObj(arr(steps)[0]) && isObj((arr(steps)[0] as Record<string, unknown>).facts) ? ((arr(steps)[0] as Record<string, unknown>).facts as Record<string, unknown>) : {};
  return BY.find((b) => b === f.by) ?? null;
}

function cleanRun(r: unknown): Run | null {
  if (!isObj(r) || !isObj(r.source)) return null;
  const kind = KINDS.find((k) => k === (r.source as Record<string, unknown>).kind), sid = (r.source as Record<string, unknown>).id;
  if (!kind || typeof sid !== "string" || !(kind === "folder" ? FOLDER.test(sid) : NAME.test(sid))) return null;
  const p = isObj(r.provider) ? r.provider : null, tk = p && isObj(p.tokens) ? p.tokens : null;
  const b = isObj(r.back) ? r.back : null, back: Run["back"] = b ? {} : null;
  if (b && back) for (const k of ["session", "thing", "block", "plan", "automation"] as const) { const v = name(b[k]); if (v) back[k] = v; }
  if (b && back && typeof b.place === "string" && FOLDER.test(b.place)) back.place = b.place;
  if (b && back && typeof b.day === "string" && DAY.test(b.day)) back.day = b.day;
  return {
    id: typeof r.id === "string" ? r.id.slice(0, 220) : "",
    source: { kind, id: sid, seat: name((r.source as Record<string, unknown>).seat) },
    from: num(r.from) ?? 0, to: num(r.to) ?? 0,
    provider: p ? {
      seat: name(p.seat) ?? "unknown", model: name(p.model), turns: num(p.turns) ?? 0,
      tokens: tk && num(tk.in) != null && num(tk.out) != null ? { in: num(tk.in)!, out: num(tk.out)! } : null, costTotal: num(p.costTotal),
    } : null,
    tools: arr(r.tools).filter(isObj).map((t) => ({ tool: name(t.tool) ?? "unknown", n: num(t.n) ?? 0, ok: num(t.ok) ?? 0, failed: num(t.failed) ?? 0, unsaid: num(t.unsaid) ?? 0 })),
    result: RESULTS.find((x) => x === r.result) ?? "unknown",
    waits: arr(r.waits).filter(isObj).filter((w) => num(w.at) != null).map((w) => ({ at: num(w.at)!, on: name(w.on) ?? (w.on === "diary paused" ? "diary paused" : "unknown"), until: num(w.until) })),
    permissions: arr(r.permissions).filter(isObj).filter((x) => num(x.at) != null)
      .map((x) => ({ at: num(x.at)!, act: name(x.act) ?? "unknown", rung: name(x.rung) ?? "unknown", answer: (ANSWERS.includes(x.answer as string) ? x.answer : null) as Answer })),
    steps: arr(r.steps).length + (num(r.more) ?? 0),
    back: back && Object.keys(back).length ? back : null,
    unknown: arr(r.unknown).filter((x): x is string => typeof x === "string" && UNKNOWN.includes(x)),
    of: cleanOf(r.of),
    by: kind === "planner" ? byOf(r.steps) : null,
  };
}

/** an engine's next.traces answer, kept by the allowlist; null when it is not one */
export function clean(m: unknown): Traces | null {
  if (!isObj(m) || typeof m.day !== "string" || !DAY.test(m.day)) return null;
  const c = isObj(m.coverage) ? m.coverage : {};
  return {
    day: m.day,
    days: arr(m.days).filter((d): d is string => typeof d === "string" && DAY.test(d)),
    runs: arr(m.runs).map(cleanRun).filter((r): r is Run => !!r),
    coverage: {
      log: c.log === "read" || c.log === "off" ? c.log : "none",
      unknown: arr(c.unknown).filter(isObj).filter((g) => typeof g.say === "string").map((g) => ({ what: name(g.what) ?? "", say: String(g.say).slice(0, 300) })),
    },
  };
}

// ---------------------------------------------------------------- the words

const pad = (n: number) => String(n).padStart(2, "0");
export const hm = (at: number) => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayOfDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** a day as people say it: Today, Yesterday, or "Wed 18 Nov" */
export function dayName(day: string, now = new Date()): string {
  if (day === dayOfDate(now)) return "Today";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day === dayOfDate(y)) return "Yesterday";
  const [a, b, c] = day.split("-").map(Number), d = new Date(a, b - 1, c);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
export const RESULT: Record<Result, string> = { done: "Done", failed: "Failed", running: "Still running", waiting: "Waiting", unknown: "Unknown" };
/** what a run's records do not say, in plain words */
export const NOT: Record<string, string> = {
  provider: "Not recorded: which AI ran it", model: "Not recorded: the model", tokens: "Not recorded: the tokens",
  outcome: "Not recorded: how it ended", tools: "Not recorded: the tools it used",
};
/** what a run's records do not say: the engine's own list, and what the run itself shows missing (never fewer) */
export function unknownOf(r: Run): string[] {
  const u = new Set(r.unknown);
  if (r.provider === null && (r.source.kind === "session" || r.source.kind === "folder")) u.add("provider");
  if (r.provider && (r.provider.seat === "unknown")) u.add("provider");
  if (r.provider && r.provider.model === null) u.add("model");
  if (r.provider && r.provider.tokens === null) u.add("tokens");
  if (r.result === "unknown") u.add("outcome");
  return UNKNOWN.filter((x) => u.has(x));
}
/** where a run came from; `named` turns an id into the name the window shows, when it has one */
export function sayFrom(r: Run, named: (id: string) => string | null = () => null): string {
  const s = r.source, n = named(s.id) ?? s.id;
  if (s.kind === "session") return `A session: ${n}`;
  if (s.kind === "folder") return `A folder’s AI, in ${n}`;
  if (s.kind === "thing") return `A Thing: ${n}`;
  if (s.kind === "block") return `A block: ${n}`;
  if (s.kind === "diary") return "The diary";
  if (s.kind === "plan") return `A work plan: ${n}`;
  if (s.kind === "automation") return `An automation: ${n}`;
  if (s.kind === "planner") return r.by === "this Mac" ? "Planning, on this Mac" : r.by === "your AI" ? "Planning, by your AI" : "Planning: no plan could be made, so the ask became one step";
  return "Home";
}
export function sayProvider(p: NonNullable<Run["provider"]>): string[] {
  // what is not recorded is left out here and said once, as unknown (unknownOf)
  const out = [p.seat === "unknown" ? "" : p.seat, p.model ?? "", `${p.turns} turn${p.turns === 1 ? "" : "s"}`].filter(Boolean);
  if (p.tokens) out.push(`${p.tokens.in.toLocaleString("en-US")} tokens in, ${p.tokens.out.toLocaleString("en-US")} out`);
  if (p.costTotal != null) out.push(`$${p.costTotal.toFixed(2)} for the session so far`);
  return out;
}
export function sayTool(t: Run["tools"][number]): string {
  const how = [t.ok ? `${t.ok} worked` : "", t.failed ? `${t.failed} failed` : "", t.unsaid ? `${t.unsaid} not recorded` : ""].filter(Boolean).join(", ");
  return `${t.tool === "unknown" ? "A tool not named" : t.tool}: ${t.n} time${t.n === 1 ? "" : "s"}${how ? ` (${how})` : ""}`;
}
export function sayWait(w: Run["waits"][number]): string {
  const on = w.on === "permission" ? "your answer" : w.on === "person" ? "you" : w.on === "step" ? "a step to finish" : w.on === "unknown" ? "something not recorded" : w.on;
  return w.until == null ? `Waiting on ${on} since ${hm(w.at)}` : `Waited on ${on}, ${hm(w.at)} to ${hm(w.until)}`;
}
const ANSWER: Record<string, string> = { yes: "you said yes", no: "you said no", let: "it was allowed to go ahead", refused: "it was refused" };
export function sayPermission(p: Run["permissions"][number]): string {
  return `${hm(p.at)} asked to ${p.act === "unknown" ? "do something not recorded" : p.act}${p.rung !== "unknown" && p.rung !== "none" ? ` (${p.rung})` : ""}: ${p.answer ? ANSWER[p.answer] : "no answer recorded"}`;
}
/** a session that was a work plan's step or an automation's run; `named` gives the plan's or automation's name */
export function sayPart(r: Run, named: (id: string) => string | null = () => null): string | null {
  if (!r.of) return null;
  if (r.of.plan) { const n = named(r.of.plan); return n ? `A step of the work plan “${n}”` : "A step of a work plan"; }
  if (r.of.automation) { const n = named(r.of.automation); return n ? `A run of the automation “${n}”` : "A run of an automation"; }
  return null;
}
/** the way back to the work: each as a target the window can go to (`go`), or only said */
export function sayBack(b: NonNullable<Run["back"]>): { label: string; id: string; kind: keyof NonNullable<Run["back"]> }[] {
  const out: { label: string; id: string; kind: keyof NonNullable<Run["back"]> }[] = [];
  if (b.session) out.push({ label: "the session", id: b.session, kind: "session" });
  if (b.place) out.push({ label: `the folder ${b.place}`, id: b.place, kind: "place" });
  if (b.thing) out.push({ label: "the Thing", id: b.thing, kind: "thing" });
  if (b.block) out.push({ label: `the block ${b.block}`, id: b.block, kind: "block" });
  if (b.day) out.push({ label: "the diary that day", id: b.day, kind: "day" });
  if (b.plan) out.push({ label: "the work plan", id: b.plan, kind: "plan" });
  if (b.automation) out.push({ label: "the automation", id: b.automation, kind: "automation" });
  return out;
}

// ---------------------------------------------------------------- what the view draws (Worked.tsx draws only this)

export type RunView = {
  id: string; from: string; when: string; result: Result; say: string;
  provider: string[] | null; tools: string[]; waits: string[]; permissions: string[]; steps: string; unknown: string[];
  /** a session that was a step of a work plan or a run of an automation, said with its name when the window has it */
  part: string | null;
  /** the way back: `go` is the id the window's goto takes, null when there is no move for it (said as text) */
  back: { label: string; go: string | null }[];
};
export type View = {
  day: string; days: { day: string; n: string; on: boolean }[]; sample: boolean;
  /** where the asking is, in words, and whether asking again may help */
  note: string | null; retry: boolean;
  summary: string | null; empty: string | null; runs: RunView[]; gaps: string[];
};
export type Look = {
  /** the name the window shows for an id (a session's, a folder's), when it has one */
  named?: (id: string) => string | null;
  /** where a way back leads in the window (an id for goto), or null when no move exists for it */
  goes?: (kind: string, id: string) => string | null;
  now?: Date;
};

const NOTE: Record<Worked["state"], string | null> = {
  asking: "Reading what Sol recorded…", here: null, off: "Sol is not connected, so there is no history to read.",
  silent: "Sol did not answer, so nothing is shown.", refused: "Sol would not give this history to this window.",
};

/** the panel's part as words: every line drawn comes from here, read from the cleaned answer only */
export function view(w: Worked | undefined, look: Look = {}): View {
  const now = look.now ?? new Date(), named = look.named ?? (() => null), goes = look.goes ?? (() => null);
  const state = w?.state ?? "asking", t = w?.t ?? null;
  // a different day's answer is not shown while another is read
  const shown = t && (state === "here" || !w?.day || w.day === t.day) ? t : null;
  const day = w?.day ?? t?.day ?? "";
  const days = (t?.days.length ? t.days : day ? [day] : []).slice(0, 7);
  const runs = state === "here" && shown ? shown.runs : [];
  const n = (k: Result) => runs.filter((r) => r.result === k).length;
  const summary = runs.length ? [`${runs.length} run${runs.length === 1 ? "" : "s"}`, n("running") ? `${n("running")} still running` : "", n("waiting") ? `${n("waiting")} waiting` : "", n("failed") ? `${n("failed")} failed` : "", n("unknown") ? `${n("unknown")} with no recorded end` : ""].filter(Boolean).join(" · ") : null;
  return {
    day: shown?.day ?? day, sample: !!w?.sample, note: NOTE[state], retry: state === "silent" || state === "refused" || state === "off",
    days: days.map((d) => ({ day: d, n: dayName(d, now), on: d === (shown?.day ?? day) })),
    summary,
    empty: state === "here" && shown && !shown.runs.length ? `Nothing ran ${dayName(shown.day, now) === "Today" ? "today" : "on this day"}.` : null,
    runs: runs.map((r) => ({
      part: sayPart(r, named),
      id: r.id, from: sayFrom(r, named), when: r.from === r.to ? hm(r.from) : `${hm(r.from)} to ${hm(r.to)}`, result: r.result, say: RESULT[r.result],
      provider: r.provider ? sayProvider(r.provider) : null,
      tools: r.tools.map(sayTool), waits: r.waits.map(sayWait), permissions: r.permissions.map(sayPermission),
      steps: r.steps ? `${r.steps} step${r.steps === 1 ? "" : "s"} recorded` : "No steps recorded",
      unknown: unknownOf(r).map((u) => NOT[u]),
      back: r.back ? sayBack(r.back).map((b) => ({ label: b.label, go: goes(b.kind, b.id) })) : [],
    })),
    gaps: shown && state === "here" ? shown.coverage.unknown.map((g) => g.say) : [],
  };
}

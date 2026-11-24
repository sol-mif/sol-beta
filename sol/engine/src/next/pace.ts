// Pace (#1617 Harmony slice S20, #1601): how much of each AI's plan is used, where it is heading, and the order in which
// Sol slows by itself. A reader, not a record: the plan's use comes from the vendor (no pricing table, no port of
// claude-pace), so it also counts use outside Sol (the terminal, the other machine, the vendor's own app).
//   Claude    the Agent SDK's rate_limit_event {status, rateLimitType, utilization, resetsAt}, one reading per window,
//             kept by notedClaude() in SOL_HOME/next/pace/claude.json (the streams that see it hand it here)
//   Codex     the newest rollout's last token_count event, payload.rate_limits {primary, secondary}: {used_percent,
//             window_minutes, resets_at}; of any originator (Sol's own turns carry the same account's limits)
//   any other seat, or a reading with no number: "not counted", never 0, and never slowed by a guess
// heading = used% ÷ the share of the window that has passed, per window; the worst window wins. No call before 10% of
// a window has passed (3% used ten minutes in would read as 90%); the vendor's warning or refusal counts at any time.
// A reading from a window that has since reset is stale: it carries its as-of and says nothing.
// The three takes are fixed lines. At the line, in this order: night runs wait first (heading at the take's line), then
// new runs wait (the plan's use itself at the line, or the vendor refusing), and running work always finishes. Each wait
// is one Diary line (slice 7's next/diary.ts, via "pace") carrying "Run it anyway" (next.run.anyway), written once per
// run and rung. perAI sets a seat's own take. Everything stays on the Mac; nothing here is sent anywhere.
// Files, all under SOL_HOME/next/pace/: take.json {take, perAI}, claude.json {windows}, anyway.json {runs}, waits.json.
// Signed: franktsai2008-eng's agent, Harmony slice S20 (#1617, #1601).
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";
import { writeLine } from "./diary.js";
import type { Heard, Parts } from "../parts.js";

export type Take = "calm" | "steady" | "all-out";
export const TAKES: Take[] = ["calm", "steady", "all-out"];
/** each take's fixed lines, in percent: nights wait at a heading of `nights`, new runs at `fresh` of the plan used */
export const LINES: Record<Take, { nights: number; fresh: number }> = {
  calm: { nights: 70, fresh: 70 },
  steady: { nights: 90, fresh: 90 },
  "all-out": { nights: 100, fresh: 100 },
};
export const WARM = 0.1;   // the share of a window that must pass before its heading is called

/** one window's reading, as the vendor gave it; used is a percent, null when the vendor gave none */
export type Reading = {
  seat: string; window: string; used: number | null; at: number;
  windowMs?: number; resetsAt?: number; status?: "allowed" | "allowed_warning" | "rejected";
};
export type Used = { window: string; pct: number; resetsAt: number | null; asOf: number; stale: boolean };
/** the wire's row: next.pace {seats: Seat[]} */
export type Seat = { seat: string; used: Used[]; heading: number | null; take: Take; notCounted: boolean; warn: "allowed_warning" | "rejected" | null; rung: Rung };
/** 0: nothing waits · 1: night runs wait · 2: new runs wait too (running work always finishes) */
export type Rung = 0 | 1 | 2;

const isTake = (t: unknown): t is Take => typeof t === "string" && (TAKES as string[]).includes(t);
const stale = (r: Reading, now: number) => typeof r.resetsAt === "number" && now >= r.resetsAt;

/** a window's heading in percent, or null: no number, no window, still warming up, or reset since */
export function headingOf(r: Reading, now: number): number | null {
  if (r.used === null || !r.windowMs || typeof r.resetsAt !== "number" || stale(r, now)) return null;
  const share = (now - (r.resetsAt - r.windowMs)) / r.windowMs;
  if (share < WARM) return null;
  return Math.round(r.used / share);
}

/** one seat's pace from its readings (pure) */
export function seatPace(seat: string, readings: Reading[], take: Take, now: number): Seat {
  const mine = readings.filter((r) => r.seat === seat);
  const used: Used[] = mine.filter((r) => r.used !== null).map((r) => ({ window: r.window, pct: r.used as number, resetsAt: r.resetsAt ?? null, asOf: r.at, stale: stale(r, now) }));
  const heads = mine.map((r) => headingOf(r, now)).filter((h): h is number => h !== null);
  const heading = heads.length ? Math.max(...heads) : null;
  const live = mine.filter((r) => !stale(r, now));
  const warn = live.some((r) => r.status === "rejected") ? "rejected" : live.some((r) => r.status === "allowed_warning") ? "allowed_warning" : null;
  const notCounted = !used.length && !warn;
  const line = LINES[take], top = Math.max(0, ...used.filter((u) => !u.stale).map((u) => u.pct));
  const rung: Rung = warn === "rejected" || top >= line.fresh ? 2 : warn === "allowed_warning" || (heading !== null && heading >= line.nights) ? 1 : 0;
  return { seat, used, heading, take, notCounted, warn, rung };
}

export type Takes = { take: Take; perAI: Record<string, Take> };
/** every seat's pace: the seats asked for, and any seat a reading names */
export function paceOf(readings: Reading[], takes: Takes, now: number, seats: string[] = []): Seat[] {
  const all = [...new Set([...seats, ...readings.map((r) => r.seat)])];
  return all.map((s) => seatPace(s, readings, takes.perAI[s] ?? takes.take, now));
}

/** a run that asks to start (or is running): its seat, whether it is a night run */
export type RunAsk = { run: string; seat: string; night?: boolean; running?: boolean };
export type Gate = { go: true; why?: string } | { go: false; rung: 1 | 2; why: string };

/** may this run go? Running work always finishes; a run pressed "Run it anyway" goes; else the seat's rung decides */
export function gate(ask: RunAsk, pace: Seat[], anyway: Set<string> = new Set()): Gate {
  if (ask.running) return { go: true, why: "running work finishes" };
  if (anyway.has(ask.run)) return { go: true, why: "run anyway" };
  const s = pace.find((p) => p.seat === ask.seat);
  if (!s || s.notCounted || s.rung === 0) return { go: true };
  const what = s.warn === "rejected" ? `${s.seat} says the plan is used up`
    : s.warn === "allowed_warning" ? `${s.seat} warns the plan is close to its limit`
    : s.rung === 2 ? `${s.seat} has used ${Math.max(...s.used.filter((u) => !u.stale).map((u) => u.pct))}% of the plan`
    : `${s.seat} is heading for ${s.heading}% of the plan`;
  if (s.rung === 2) return { go: false, rung: 2, why: `${what}, past the ${s.take} line (${LINES[s.take].fresh}%): new runs wait` };
  if (ask.night) return { go: false, rung: 1, why: `${what}, past the ${s.take} line (${LINES[s.take].nights}%): night runs wait first` };
  return { go: true };
}

// ── the readers ─────────────────────────────────────────────────────────────────────────────────────────────────────

const paceDir = (home: string) => join(nextDir(home), "pace");
const file = (home: string, name: string) => join(paceDir(home), `${name}.json`);
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600e3, seven_day: 7 * 864e5, seven_day_opus: 7 * 864e5, seven_day_sonnet: 7 * 864e5 };

/** the Agent SDK's rate_limit_event, kept per window (the last one of each). Returns false for what is not one */
export function notedClaude(home: string, ev: unknown, now = Date.now()): boolean {
  const e = (ev && typeof ev === "object" ? ((ev as any).rate_limit_info ?? ev) : null) as Record<string, unknown> | null;
  if (!e || typeof e.rateLimitType !== "string" || !/^[a-z_]{1,40}$/.test(e.rateLimitType)) return false;
  const status = e.status === "allowed" || e.status === "allowed_warning" || e.status === "rejected" ? e.status : undefined;
  const util = typeof e.utilization === "number" && isFinite(e.utilization) ? e.utilization : null;
  const resets = typeof e.resetsAt === "number" && isFinite(e.resetsAt) ? (e.resetsAt < 1e12 ? e.resetsAt * 1000 : e.resetsAt) : undefined;
  const r: Reading = {
    seat: "claude", window: e.rateLimitType, at: now, ...(status ? { status } : {}),
    used: util === null ? null : Math.round((util <= 1 ? util * 100 : util) * 10) / 10,
    ...(WINDOW_MS[e.rateLimitType] ? { windowMs: WINDOW_MS[e.rateLimitType] } : {}), ...(resets ? { resetsAt: resets } : {}),
  };
  const was = readJson(file(home, "claude")).data, windows = (was.windows && typeof was.windows === "object" ? was.windows : {}) as Record<string, Reading>;
  writeJson(file(home, "claude"), { windows: { ...windows, [r.window]: r } });
  return true;
}
export function claudeReadings(home: string): Reading[] {
  const w = readJson(file(home, "claude")).data.windows;
  return w && typeof w === "object" ? Object.values(w as Record<string, Reading>).filter((r) => r && r.seat === "claude" && typeof r.window === "string") : [];
}

/** the last rate_limits in a Codex rollout, read from its tail (a rollout can be large; the event is near the end) */
export function codexReadings(rollout: string, tail = 512 * 1024): Reading[] {
  let text = "", at = 0;
  try {
    const st = statSync(rollout), fd = openSync(rollout, "r");
    try { const n = Math.min(tail, st.size), b = Buffer.alloc(n); readSync(fd, b, 0, n, st.size - n); text = b.toString("utf8"); } finally { closeSync(fd); }
    at = st.mtimeMs;
  } catch { return []; }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes("rate_limits")) continue;
    let o: any;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    const rl = o?.payload?.rate_limits ?? o?.payload?.info?.rate_limits;
    if (!rl || typeof rl !== "object") continue;
    const ts = Date.parse(o.timestamp ?? "") || at;
    return (["primary", "secondary"] as const).flatMap((k) => {
      const w = rl[k];
      if (!w || typeof w !== "object") return [];
      const mins = typeof w.window_minutes === "number" ? w.window_minutes : null;
      return [{
        seat: "codex", window: mins === 300 ? "five_hour" : mins === 10080 ? "seven_day" : `${k}`, at: ts,
        used: typeof w.used_percent === "number" ? w.used_percent : null,
        ...(mins ? { windowMs: mins * 60e3 } : {}), ...(typeof w.resets_at === "number" ? { resetsAt: w.resets_at * 1000 } : {}),
      } satisfies Reading];
    });
  }
  return [];
}

/** the newest Codex rollout on this machine, of any originator (threads.ts's index, read only); null: none */
async function newestRollout(): Promise<string | null> {
  try {
    const { codexIndex } = await import("../threads.js");
    const list = await codexIndex();
    return list.reduce<{ file: string; updatedAt: number } | null>((a, t) => (!a || t.updatedAt > a.updatedAt ? t : a), null)?.file ?? null;
  } catch { return null; }
}

// ── the store: the take, the presses, the waits written ─────────────────────────────────────────────────────────────

export function takesOf(home: string): Takes {
  const d = readJson(file(home, "take")).data;
  const perAI: Record<string, Take> = {};
  if (d.perAI && typeof d.perAI === "object") for (const [k, v] of Object.entries(d.perAI)) if (isTake(v) && /^[a-z][a-z0-9-]{0,30}$/.test(k)) perAI[k] = v;
  return { take: isTake(d.take) ? d.take : "steady", perAI };
}

export type Done = { ok: true } | { ok: false; why: string };
/** next.pace.set {take, perAI?}: the take, and any seat's own (perAI: {seat: take | null}, null clears it) */
export function setTake(home: string, m: unknown): Done {
  const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  const was = takesOf(home);
  if (x.take !== undefined && !isTake(x.take)) return { ok: false, why: `a take is one of ${TAKES.join(", ")}` };
  const perAI = { ...was.perAI };
  if (x.perAI !== undefined) {
    if (!x.perAI || typeof x.perAI !== "object" || Array.isArray(x.perAI)) return { ok: false, why: "perAI is {seat: take}" };
    for (const [k, v] of Object.entries(x.perAI as Record<string, unknown>)) {
      if (!/^[a-z][a-z0-9-]{0,30}$/.test(k)) return { ok: false, why: `which AI is ${k.slice(0, 40)}?` };
      if (v === null) delete perAI[k];
      else if (isTake(v)) perAI[k] = v;
      else return { ok: false, why: `a take is one of ${TAKES.join(", ")}` };
    }
  }
  if (x.take === undefined && x.perAI === undefined) return { ok: false, why: "which take?" };
  writeJson(file(home, "take"), { take: isTake(x.take) ? x.take : was.take, perAI });
  return { ok: true };
}

const RUN = /^[A-Za-z0-9:_.#\/-]{1,160}$/;
const ANYWAY_KEPT = 200;
export function anywayOf(home: string): Set<string> {
  const r = readJson(file(home, "anyway")).data.runs;
  return new Set(Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : []);
}
/** next.run.anyway {run}: the person's press; that run goes whatever the pace (kept for the last 200 presses) */
export function runAnyway(home: string, m: unknown): Done & { run?: string } {
  const run = m && typeof m === "object" ? (m as Record<string, unknown>).run : undefined;
  if (typeof run !== "string" || !RUN.test(run)) return { ok: false, why: "which run?" };
  const runs = [...anywayOf(home)].filter((r) => r !== run);
  writeJson(file(home, "anyway"), { runs: [...runs, run].slice(-ANYWAY_KEPT) });
  return { ok: true, run };
}

/** a wait written to the Diary once per run and rung: one line, with "Run it anyway" */
export function noteWait(home: string, ask: RunAsk, g: Gate, now = new Date()): { written: boolean; id?: string } {
  if (g.go) return { written: false };
  const d = readJson(file(home, "waits")).data, waits = (d.runs && typeof d.runs === "object" ? d.runs : {}) as Record<string, number>;
  if ((waits[ask.run] ?? 0) >= g.rung) return { written: false };
  const r = writeLine(home, {
    words: `${ask.night ? "Night run" : "Run"} ${ask.run} waits: ${g.why}.`, via: "pace",
    embed: { pace: { run: ask.run, rung: g.rung }, press: { label: "Run it anyway", send: { type: "next.run.anyway", run: ask.run } } },
  }, now);
  if (!r.ok || r.skipped) return { written: false };
  const kept = Object.entries({ ...waits, [ask.run]: g.rung }).slice(-ANYWAY_KEPT);
  writeJson(file(home, "waits"), { runs: Object.fromEntries(kept) });
  return { written: true, id: r.id };
}

/** what a seat-less engine has: every reading now (Claude's kept events, the newest Codex rollout) */
export type PaceRead = { claude?: () => Reading[]; codex?: () => Promise<Reading[]> | Reading[] };
export async function readingsNow(home: string, r: PaceRead = {}): Promise<Reading[]> {
  const claude = r.claude ? r.claude() : claudeReadings(home);
  const codex = r.codex ? await r.codex() : await newestRollout().then((f) => (f ? codexReadings(f) : []));
  return [...claude, ...codex];
}
/** the wire's message: next.pace {seats} (Claude and Codex always named, so a seat with no reading says not counted) */
export async function paceMsg(home: string, r: PaceRead = {}, now = Date.now()) {
  return { type: "next.pace", seats: paceOf(await readingsNow(home, r), takesOf(home), now, ["claude", "codex"]) };
}
/** for a run starter: may it go now? A wait is written to the Diary on the way out */
export async function mayStart(home: string, ask: RunAsk, r: PaceRead = {}, now = new Date()): Promise<Gate> {
  const g = gate(ask, (await paceMsg(home, r, now.getTime())).seats, anywayOf(home));
  noteWait(home, ask, g, now);
  return g;
}

/** the readers the wires use (a test gives its own, so no real plan is read) */
let wired: PaceRead = {};
export function usePaceRead(r: PaceRead): void { wired = r; }

/** the wires, registered by parts/next-s20.ts (exact types only); `behind` is the ui.next switch.
 *  Only Sol's own windows hear a person's plan; anything else is refused and nothing is read */
export function wirePace(p: Parts, behind: (f: (m: any, h: Heard) => unknown) => (m: any, h: Heard) => unknown) {
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  p.on("next.pace", behind(async (_m, h) => (h.fromSol ? h.send(h.ws, await paceMsg(h.HOME, wired)) : refuse(h, "next.pace", "only Sol's own windows"))));
  p.on("next.pace.set", behind(async (m, h) => {
    if (!h.fromSol) return refuse(h, "next.pace.set", "only Sol's own windows");
    const r = setTake(h.HOME, m);
    if (!r.ok) return refuse(h, "next.pace.set", r.why);
    h.everyone(await paceMsg(h.HOME, wired));
  }));
  p.on("next.run.anyway", behind((m, h) => {
    if (!h.fromSol) return refuse(h, "next.run.anyway", "only Sol's own windows");
    const r = runAnyway(h.HOME, m);
    if (!r.ok) return refuse(h, "next.run.anyway", r.why);
    h.send(h.ws, { type: "next.run.anyway", run: r.run, ok: true });
  }));
}

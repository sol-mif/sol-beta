// What runs in the background (#703; the design: mine/look/stage/runs.html, five scenes). Not a kind of its own: a list
// block bound with watch "run" to a run's source, one step per background session. A source is a JSON that names its
// sessions; the first is the builders' watcher on the NucBox (scratch/sol/stage/watch/collect.py, status.json on :8797:
// one entry per builder with its state, elapsed, the transcript's last moves, its worktree, PR and done line). Later
// the engine's own background sessions are a second source of the same shape.
//
// This file reads a source into the list's body (pure), and reads the source itself (a URL asked, a file read). The
// watch, the ledger and the block's state are blocks.ts's.
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";

/** how a session is doing, as the run says it: working, waits (needs the person's word), done, ended (stopped with no
 *  done line), queued (not started) */
export const RUN_STATES = ["waits", "working", "done", "ended", "queued"] as const;
export type RunState = (typeof RUN_STATES)[number];
/** one move of a session: its words (`said`), a command, a file read or written */
export type Move = { k: string; w: string };
/** one background session as a list step carries it */
export type Run = {
  name: string; issue?: number; what?: string; state: RunState;
  /** minutes since it started (to now while it works, to its last move after) of `cap` */
  min: number;
  /** what it said last */
  said: string;
  pr?: { n: number; draft: boolean; url?: string };
  moves: Move[]; files: string[]; turns: number; tokens: number; commits: number;
  /** the line it left when it stopped (its done file) */
  done?: string;
};
/** the list's step for a session: the list kind's own fields (t, st, note) and the run behind them */
export type RunStep = { t: string; st: "done" | "half" | "wait" | ""; note?: string; run: Run };
/** the list's body: the steps, the machine the run is on, a session's hours */
export type RunBody = { steps: RunStep[]; where: string; cap: number };

/** a session's hours when the source does not say: four (the builders' cap) */
export const CAP = 4 * 3600;
const ST: Record<RunState, RunStep["st"]> = { waits: "wait", working: "half", done: "done", ended: "", queued: "" };
const ORDER: Record<RunState, number> = { waits: 0, working: 1, done: 2, ended: 3, queued: 4 };
const str = (v: unknown, n = 300) => (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/\*\*/g, "").slice(0, n);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const secs = (t: unknown) => { const n = num(t); if (n !== undefined) return n > 1e12 ? n / 1000 : n; const d = Date.parse(str(t, 40)); return Number.isFinite(d) ? d / 1000 : undefined; };
const stateOf = (v: unknown): RunState => (RUN_STATES as readonly string[]).includes(String(v)) ? (v as RunState) : "ended";

/** the machine a source is on: the name the source gives (`host`), else SOL_MACHINE, else this machine's name for a
 *  loopback address or a file, else the address's host (pure but for the name) */
export function whereOf(source: string, said?: unknown): string {
  if (typeof said === "string" && said.trim()) return said.trim().slice(0, 40);
  let host = "";
  try { host = /^https?:\/\//.test(source) ? new URL(source).hostname : ""; } catch { /* not a URL */ }
  const local = !host || /^(localhost|127\.|::1|\[::1\])/.test(host);
  return (local ? process.env.SOL_MACHINE || hostname().split(".")[0] : host).slice(0, 40);
}

/** a run's source read into the list's body: one step per session, the one that waits first, then the working, then the
 *  done (pure). `where` is the machine's name (whereOf) */
export function runBody(src: unknown, where: string): RunBody {
  const s = (src && typeof src === "object" ? src : {}) as Record<string, any>;
  const now = secs(s.at) ?? Date.now() / 1000, cap = num(s.cap) ?? CAP;
  const list: any[] = Array.isArray(s.builders) ? s.builders : Array.isArray(s.sessions) ? s.sessions : [];
  const runs = list.filter((b) => b && typeof b === "object" && str(b.name)).map((b): Run => {
    const t = b.transcript ?? {}, moves: any[] = Array.isArray(t.moves) ? t.moves : [];
    const state = stateOf(b.state);
    const said = [...moves].reverse().find((m) => m?.kind === "said");
    const first = Array.isArray(t.timeline) && t.timeline[0] ? secs(t.timeline[0][0]) : undefined;
    const start = secs(b.unit?.since) ?? first;
    const end = state === "working" ? now : secs(t.last_at) ?? now;
    const min = state === "working" && num(b.elapsed) !== undefined ? b.elapsed / 60 : start !== undefined ? (end - start) / 60 : 0;
    const pr = b.pr && num(b.pr.number) ? { n: b.pr.number as number, draft: b.pr.draft !== false, ...(typeof b.pr.url === "string" ? { url: b.pr.url } : {}) } : undefined;
    const done = str(b.done, 600).trim();
    return {
      name: str(b.name, 40), ...(num(b.issue) ? { issue: b.issue } : {}), ...(str(b.what) ? { what: str(b.what, 120) } : {}), state,
      min: Math.max(0, Math.round(min)), said: said ? str(said.what, 240) : state === "queued" ? "" : done.split("\n")[0].slice(0, 240),
      ...(pr ? { pr } : {}),
      moves: moves.slice(-8).map((m) => ({ k: str(m?.kind, 12), w: str(m?.what, 240) })),
      files: (Array.isArray(t.files) ? t.files : []).map((f: any) => str(typeof f === "string" ? f : f?.path, 200)).filter(Boolean).slice(-12),
      turns: num(t.turns) ?? 0, tokens: num(t.tokens) ?? 0, commits: Array.isArray(b.worktree?.commits) ? b.worktree.commits.length : 0,
      ...(done ? { done } : {}),
    };
  });
  // the one that needs you comes to the top; within a state, the order the source gave
  const steps = runs.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.state] - ORDER[b.r.state] || a.i - b.i)
    .map(({ r }): RunStep => ({ t: r.name, st: ST[r.state], ...(r.said ? { note: r.said } : {}), run: r }));
  return { steps, where, cap };
}

/** the block's state as its runs say it: waits when one needs the person, working while one works, else live (pure) */
export const runState = (b: RunBody): "waits" | "working" | "live" =>
  b.steps.some((s) => s.run.state === "waits") ? "waits" : b.steps.some((s) => s.run.state === "working") ? "working" : "live";

/** the run in a few words, as the chip says it: "1 needs you · 1 working · 3 done" (pure) */
export function runWords(b: RunBody): string {
  const n = (st: RunState) => b.steps.filter((s) => s.run.state === st).length;
  return [n("waits") ? `${n("waits")} needs you` : "", n("working") ? `${n("working")} working` : "", n("done") ? `${n("done")} done` : ""].filter(Boolean).join(" · ") || "nothing running";
}

/** what changed between two reads, as ledger notes: a session that came, or moved from one state to another (pure) */
export function runMoves(was: RunBody | null, now: RunBody): string[] {
  const old = new Map((was?.steps ?? []).map((s) => [s.run.name, s.run.state] as const));
  return now.steps.flatMap((s) => {
    const o = old.get(s.run.name);
    if (o === s.run.state) return [];
    return [o === undefined ? `${s.run.name} ${s.run.state}` : `${s.run.name}: ${o} → ${s.run.state}${s.run.state === "waits" && s.run.said ? ` · ${s.run.said.slice(0, 120)}` : ""}`];
  });
}

/** how often a run on a URL is asked: every ten seconds, as the watcher writes */
export const RUN_POLL_MS = 10_000;
let reader: (source: string) => Promise<unknown> = defaultRead;
/** how a run's source is read (tests give their own fixture) */
export const setRunReader = (f: ((source: string) => Promise<unknown>) | null) => { reader = f ?? defaultRead; };
export const readRun = (source: string) => reader(source);
async function defaultRead(source: string): Promise<unknown> {
  if (/^https?:\/\//.test(source)) {
    const r = await fetch(source, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`${source}: ${r.status}`);
    return r.json();
  }
  return JSON.parse(await readFile(source, "utf8"));
}

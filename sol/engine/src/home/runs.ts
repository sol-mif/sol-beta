// Home 5 (design §9; specs home-plan §6 Home 5): a Run, one job's steps, written so a stop at any moment can be picked
// up again. Behind home.whole like all of Home. No seat is launched here: a Run is driven by whoever calls these
// functions (tests tonight; the seat for a Home job later, a product decision and a model call).
//   the file     <HOME>/runs/<id>.json, Marco's Run { id, thing, at, mode, replayOf?, things, ledger } and the engine's
//                own (session, state, step, note). Written whole, first before its run.start (so the log never names a
//                Run with no file), then after each of its events. `ledger` is computed from the log each time: the
//                run.* events of this Run and every event that follows from one of them (`cause`). A file whose
//                run.start never reached the log is no Run
//   accept       startRun: run.start, then the Thing frozen ({ by, policy, rung, scope }, one thing.state, cause the
//                run.start): who accepted, the policy's version, the ceiling then, the source and the folder
//   a step       about(): run.about, on the disk before it returns (the row's fsync), then the step; did(): run.did
//   resume       resumeRun: the policy is read again; changed since the accept, the Run is blocked and a Today card
//                says so (the Thing's own frozen policy is never moved forward here)
//   restart      restartRuns: a run.about with no run.did or run.unknown after it gets one run.unknown, and the file the
//                note that tells the seat to check before it does the step again; a second start writes nothing more
//   replay       a Run with replayOf: every event it writes carries mode "replay", and ceiling.ts never calls a
//                source's draft or do for it
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { plainIn, writeWhole } from "../safewrite.js";
import type { By } from "../file-trail.js";
import type { Rung, SourceId } from "../contract/home/policy.js";
import { changeThing, newThing, type Thing } from "./items.js";
import { ENGINE, type HomeEv } from "./log.js";
import { policyText, policyVer } from "./policy.js";
import { lowest } from "./rung-reader.js";
import { rungOf, sourcesMsg } from "./sources.js";
import type { Ctx } from "./unit.js";

export type RunMode = "record" | "live";
/** what a Thing holds from its accept on (design §9 "frozen at accept") */
export type Frozen = { by: By; policy: string; rung: Rung; scope: { source: SourceId; folder: string } };
export type Run = {
  id: string; thing: string; at: number; mode: RunMode; replayOf?: string; things: string[]; ledger: string[];
  session?: string; state: "running" | "blocked" | "ended"; step: number; note?: string;
};

// ── the names that are the engine's pick, in one place ─────────────────────────────────────────────────────────────
export const RUN_ID = /^run-[0-9a-f]{12}$/;
/** the note a Run is given for a step a stop cut short (design §9) */
export const UNKNOWN_NOTE = "the last step may or may not have happened; check before doing it again";
/** the card of a Run whose policy changed since the accept */
const blockedId = (run: string): string => `${run}-policy`;
const BLOCKED_WORDS = "The policy changed since this job was accepted: look at it again before it goes on.";
const BLOCKED_WHY = "A job runs under the policy it was accepted with. Yours changed, so it waits for you.";
const BLOCKED_ANSWERS: [string, string] = ["Got it", "Not now"];

const isUndo = (e: HomeEv): boolean => (e.value as { undo?: unknown } | undefined)?.undo === true;
const val = (e: HomeEv): Record<string, unknown> => (e.value && typeof e.value === "object" ? (e.value as Record<string, unknown>) : {});
const dir = (ctx: Ctx): string => join(ctx.home, "runs");
/** the mode every event of this Run carries: replay, or none */
export const modeOf = (r: Run): { mode?: "replay" } => (r.replayOf !== undefined ? { mode: "replay" } : {});

/** a Thing's frozen part, or null when it was never accepted */
export function frozenOf(t: Thing): Frozen | null {
  const f = t.frozen as Partial<Frozen> | undefined;
  return f && typeof f.policy === "string" && typeof f.rung === "string" && f.scope ? (f as Frozen) : null;
}
/** the source a Thing acts through: the one frozen into it, else the card's when it names one, else files */
export function sourceOf(ctx: Ctx, t: Thing | null): SourceId {
  const f = t ? frozenOf(t) : null;
  if (f) return f.scope.source;
  const s = t?.card?.source;
  return s && sourcesMsg(ctx, null).sources.some((x) => x.id === s) ? (s as SourceId) : "files";
}
/** the ceiling now (design §7.7, "the minimum, computed in core"): the lowest of the source's rung, the rung of the
 *  Thing's folder (never above its own source's), and the rung frozen into the Thing */
export function ceilingAt(ctx: Ctx, t: Thing | null, source: SourceId): Rung {
  let r = rungOf(ctx, source);
  if (t) {
    const f = sourcesMsg(ctx, null).folders.find((x) => x.name === t.folder);
    if (f) r = lowest(r, f.rung);
    const fr = frozenOf(t);
    if (fr) r = lowest(r, fr.rung);
  }
  return r;
}

// ── the files and the Runs of a Home ─────────────────────────────────────────────────────────────────────────────
const RUNS = new WeakMap<Ctx, Map<string, Run>>();
/** every Run of a Home: read once from runs/, keeping only those the log started */
function runsOf(ctx: Ctx): Map<string, Run> {
  let m = RUNS.get(ctx);
  if (m) return m;
  m = new Map();
  RUNS.set(ctx, m);
  const started = new Set(ctx.log.all().filter((e) => e.kind === "run.start" && e.item).map((e) => e.item!));
  let names: string[] = [];
  try { names = readdirSync(dir(ctx)); } catch { /* no Run yet */ }
  for (const n of names) {
    const id = n.replace(/\.json$/, "");
    if (!RUN_ID.test(id) || !started.has(id)) continue;
    const f = plainIn(join(dir(ctx), n), ctx.home);
    if (!f) continue;
    try { const r = JSON.parse(readFileSync(f, "utf8")) as Run; if (r?.id === id && typeof r.thing === "string") m.set(id, r); } catch { /* unreadable: no Run */ }
  }
  return m;
}
export const getRun = (ctx: Ctx, id: string): Run | null => runsOf(ctx).get(id) ?? null;
/** every Run not ended (running or blocked) */
export const openRuns = (ctx: Ctx): Run[] => [...runsOf(ctx).values()].filter((r) => r.state !== "ended");
/** the open Runs a seat's session is bound to: none for every ordinary seat, one for a seat in a Run. startRun binds a
 *  session to one open Run at most; more than one is only an older engine's files, and then none is surely its own */
export const runsOfSession = (ctx: Ctx, session: string | undefined): Run[] => (session ? openRuns(ctx).filter((r) => r.session === session) : []);
/** the events of a Run: its run.* and every event whose cause is one of them, in the log's order */
function ledgerOf(ctx: Ctx, id: string): string[] {
  const mine = new Set<string>(), out: string[] = [];
  for (const e of ctx.log.all()) {
    if ((e.kind.startsWith("run.") && e.item === id) || (e.cause && mine.has(e.cause))) { mine.add(e.id); out.push(e.id); }
  }
  return out;
}
function save(ctx: Ctx, r: Run): void {
  r.ledger = ledgerOf(ctx, r.id);
  runsOf(ctx).set(r.id, r);
  writeWhole(join(dir(ctx), `${r.id}.json`), JSON.stringify(r, null, 2) + "\n", { root: ctx.home });
}
const startOf = (ctx: Ctx, r: Run): HomeEv | undefined => ctx.log.all().find((e) => e.kind === "run.start" && e.item === r.id);

// ── a Run's life ─────────────────────────────────────────────────────────────────────────────────────────────────
/** the sessions of live seats launched with the upper limit's hooks and guard (ceiling.ts ceilingHooks marks them):
 *  only these may be bound to a Run. A seat that cannot carry them (a Codex seat, any seat not built by index.ts or
 *  work/runs.ts, one launched while Home was off) is never marked, so its own tools could never run inside a Run
 *  unchecked. Each session counts the seats that hold it, and leaves when the last of them ends (#1266) */
const GUARDED = new Map<string, number>();
export const guardedSeat = (session: string): void => { GUARDED.set(session, (GUARDED.get(session) ?? 0) + 1); };
export const seatEnded = (session: string): void => {
  const n = (GUARDED.get(session) ?? 0) - 1;
  if (n > 0) GUARDED.set(session, n); else GUARDED.delete(session);
};
/** a session an open Run on the disk names, read from the Run files themselves (no Home needed, so it answers while
 *  Home is off): a seat launched for it keeps the hooks, so a Run never has a seat of its own unchecked. A file that
 *  cannot be read counts as naming it (fail closed) */
export function inRunOnDisk(home: string, session: string): boolean {
  let names: string[] = [];
  try { names = readdirSync(join(home, "runs")); } catch { return false; }   // no Run yet
  for (const n of names) {
    if (!RUN_ID.test(n.replace(/\.json$/, ""))) continue;
    try {
      const r = JSON.parse(readFileSync(join(home, "runs", n), "utf8")) as Partial<Run>;
      if (r.session === session && r.state !== "ended") return true;
    } catch { return true; }
  }
  return false;
}
/** a job accepted: its Run, and its Thing frozen. null (nothing written) for a Thing that is not there, a session whose
 *  seat was not launched with the hooks (guardedSeat), or a session already bound to an open Run (a call is checked
 *  against its own Run's limit only while it has one) */
export function startRun(ctx: Ctx, o: { thing: string; source?: SourceId; mode?: RunMode; replayOf?: string; session?: string; by?: By }): Run | null {
  const t = ctx.items.get(o.thing);
  if (!t || t.gone) return null;
  if (o.session !== undefined && !GUARDED.has(o.session)) return null;
  if (runsOfSession(ctx, o.session).length) return null;
  const by = o.by ?? ENGINE, source = o.source ?? sourceOf(ctx, t);
  const r: Run = {
    id: `run-${randomBytes(6).toString("hex")}`, thing: t.id, at: ctx.now(), mode: o.replayOf !== undefined ? "record" : (o.mode ?? "live"),
    ...(o.replayOf !== undefined ? { replayOf: o.replayOf } : {}), things: [t.id], ledger: [], ...(o.session ? { session: o.session } : {}), state: "running", step: 0,
  };
  // the file first, then the event: the log never names a Run that is not on the disk
  save(ctx, r);
  const e = ctx.log.write({ kind: "run.start", item: r.id, value: { thing: t.id }, by, ...modeOf(r) });
  const frozen: Frozen = { by, policy: policyVer(policyText(ctx.home)), rung: ceilingAt(ctx, t, source), scope: { source, folder: t.folder } };
  changeThing(ctx, t.id, { frozen }, { cause: e.id, by, ...modeOf(r) });
  save(ctx, r);
  return r;
}
/** a step about to be done: run.about, on the disk before this returns */
export function about(ctx: Ctx, r: Run, act: string, by: By = ENGINE): HomeEv {
  const start = startOf(ctx, r);
  r.step += 1;
  const e = ctx.log.write({ kind: "run.about", item: r.id, value: { thing: r.thing, step: r.step, act }, sync: true, by, ...(start ? { cause: start.id } : {}), ...modeOf(r) });
  save(ctx, r);
  return e;
}
/** the step done (it returned, well or not) */
export function did(ctx: Ctx, r: Run, step: HomeEv, by: By = ENGINE): HomeEv {
  const v = val(step);
  const e = ctx.log.write({ kind: "run.did", item: r.id, value: { thing: r.thing, step: Number(v.step), act: String(v.act) }, cause: step.id, by, ...modeOf(r) });
  save(ctx, r);
  return e;
}
/** the Run over; null when it was already */
export function endRun(ctx: Ctx, id: string, by: By = ENGINE): HomeEv | null {
  const r = getRun(ctx, id);
  if (!r || r.state === "ended") return null;
  const start = startOf(ctx, r);
  r.state = "ended";
  const e = ctx.log.write({ kind: "run.end", item: r.id, value: { thing: r.thing }, by, ...(start ? { cause: start.id } : {}), ...modeOf(r) });
  save(ctx, r);
  return e;
}
/** before a Run goes on again (a resume, a retry): the policy it was accepted under must still be the policy. When it
 *  changed, the Run is blocked and one Today card says so (made once) */
export function resumeRun(ctx: Ctx, id: string): { ok: true; run: Run } | { ok: false; said: string } {
  const r = getRun(ctx, id);
  if (!r || r.state === "ended") return { ok: false, said: "refused: no such Run going" };
  const t = ctx.items.get(r.thing), f = t ? frozenOf(t) : null;
  if (t && f && f.policy === policyVer(policyText(ctx.home))) {
    if (r.state === "blocked") { r.state = "running"; save(ctx, r); }
    return { ok: true, run: r };
  }
  const start = startOf(ctx, r), cid = blockedId(r.id);
  const card: Thing = {
    id: cid, read: "you", folder: t?.folder ?? "", words: BLOCKED_WORDS, state: "you", waitsOn: "you", at: ctx.now(), links: [`run:${r.id}`], made: [],
    card: { source: "sol", title: BLOCKED_WORDS, why: BLOCKED_WHY, chips: [], answers: [...BLOCKED_ANSWERS], touches: [], edge: BLOCKED_WORDS },
  };
  const was = ctx.items.get(cid);
  const e = !was ? newThing(ctx, card, { cause: start?.id, by: ENGINE, ...modeOf(r) })
    : was.state === "done" || was.gone ? changeThing(ctx, cid, { ...card, gone: undefined }, { ...(start ? { cause: start.id } : {}), by: ENGINE, ...modeOf(r) }) : null;
  r.state = "blocked";
  save(ctx, r);
  if (e) ctx.pushToday();
  return { ok: false, said: "blocked: the policy changed since this job was accepted; a card in Today says so" };
}

/** at start: every step a stop cut short (a run.about with no run.did or run.unknown after it) gets one run.unknown,
 *  and its Run the note. The number written */
export function restartRuns(ctx: Ctx): number {
  const evs = ctx.log.all(), closed = new Set<string>();
  for (const e of evs) if ((e.kind === "run.did" || e.kind === "run.unknown") && e.cause && !isUndo(e)) closed.add(e.cause);
  let n = 0;
  for (const e of evs) {
    if (e.kind !== "run.about" || !e.item || closed.has(e.id)) continue;
    const r = getRun(ctx, e.item);
    const v = val(e);
    ctx.log.write({ kind: "run.unknown", item: e.item, value: { thing: String(v.thing), ...(typeof v.step === "number" ? { step: v.step } : {}), ...(typeof v.act === "string" ? { act: v.act } : {}) }, cause: e.id, by: ENGINE, ...(e.mode === "replay" ? { mode: "replay" } : {}) });
    n++;
    if (r) { r.note = UNKNOWN_NOTE; save(ctx, r); }
  }
  // the files' ledgers made whole again (a stop between an event and its file)
  for (const r of runsOf(ctx).values()) { const l = ledgerOf(ctx, r.id); if (l.length !== r.ledger.length) save(ctx, r); }
  return n;
}

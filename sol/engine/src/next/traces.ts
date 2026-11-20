// next.traces (#1615, "Settings / How Sol worked", the contract on #1615 issuecomment-7031944218): a person-readable
// history of one day, built only from records the engine already keeps, and never from anything said in them. READ
// ONLY: it opens files and writes nothing anywhere, and its answer goes to the window that asked, nowhere else.
//   next.traces { day? } → next.traces { day, days, runs, coverage }
// Where it reads, and what it takes:
//   the log      <logDir>/<day>.jsonl (log.ts): the seats' own steps (seat.turn, .step, .sent, .usage, .done), a
//                block's tool and program steps (tool.call, plugin.called, .ran, .fetched, .approve), Home's gate and
//                runs (rung.*, run.*) and a Thing's waits (thing.state). A value kept in a value file is opened only to
//                take the fields PICK names below; nothing else of a value ever leaves this file
//   the traces   SOL_HOME/agents-traces.json (agent/meta/traces.ts): a folder agent's work a sticky's did line or a
//                "show me once" recorded; what was made, for whom, the minutes. Never its title, its did line or its
//                steps (the person's and the AI's words)
//   the diary    SOL_HOME/next/diary/<day>.jsonl (diary.ts): which lines came in and by which way, and a pause; never
//                the words
// What it never holds (the contract's privacy rule): a prompt's or a reply's words, a tool's arguments (a file it
// named, a URL, a command), an error's text, a sticky's or a Thing's words, and an AI's private reasoning, which no
// record holds. PICK is an allowlist by kind: a field not named there is not read out, so a kind added later says
// only that it happened. What is not recorded is said as unknown (coverage.unknown, a run's `unknown`), never made up.
// Signed: franktsai2008-eng's agent, the engine half of "How Sol worked" (#1615).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { valueFile } from "../log.js";
import { nameOfOld } from "../contract/kinds.js";
import { tracesFile } from "../agent/meta/traces.js";
import { DAY, dayOf, dayFile, daysKept } from "./diary.js";

type Fact = string | number | boolean;
type Facts = Record<string, Fact>;
export type Step = { at: number; kind: string; facts: Facts };
export type Wait = { at: number; on: string; until: number | null };
export type Permission = { at: number; act: string; rung: string; answer: "yes" | "no" | "let" | "refused" | null };
export type Tool = { tool: string; n: number; ok: number; failed: number; unsaid: number };
export type Source = { kind: "session" | "folder" | "thing" | "block" | "home" | "diary"; id: string; seat: string | null };
export type Back = { session?: string; place?: string; thing?: string; block?: string; day?: string };
export type Run = {
  id: string;
  source: Source;
  from: number;
  to: number;
  /** costTotal: the session's running total in USD as its seat last said it (a resumed session carries earlier days') */
  provider: { seat: string; model: string | null; turns: number; tokens: { in: number; out: number } | null; costTotal: number | null } | null;
  tools: Tool[];
  result: "done" | "failed" | "running" | "waiting" | "unknown";
  waits: Wait[];
  permissions: Permission[];
  steps: Step[];
  /** steps left out past MAX_STEPS (the oldest are kept) */
  more: number;
  back: Back | null;
  /** what this run's records do not say: "provider", "model", "tokens", "outcome", "tools" */
  unknown: string[];
};
export type Gap = { what: string; say: string };
export type Traces = {
  type: "next.traces";
  day: string;
  /** the days with a record, newest first */
  days: string[];
  runs: Run[];
  coverage: { log: "read" | "none" | "off"; events: number; skipped: number; old: number; unknown: Gap[] };
};

export const MAX_RUNS = 300, MAX_STEPS = 200;

/** the fields read out of each kind's value, and what each must be. Nothing else of a value is read out */
const PICK: Record<string, Record<string, "name" | "number" | "boolean" | "tokens">> = {
  "seat.turn": { model: "name", mode: "name" },
  "seat.step": { tool: "name", ok: "boolean", bytes: "number", agent: "boolean" },   // never `file`: a tool's argument
  "seat.sent": { what: "name", bytes: "number" },                                     // never `name`: a file's path
  "seat.usage": { in: "number", out: "number", cacheRead: "number", cacheWrite: "number" },
  "seat.done": { ok: "boolean", turns: "number", tokens: "tokens", costTotal: "number" },
  "tool.call": { tool: "name" },
  "plugin.called": { tool: "name", out: "boolean" },
  "plugin.ran": { program: "name", code: "number", out: "boolean" },
  "plugin.fetched": { host: "name", status: "number", out: "boolean" },
  "plugin.approve": { screen: "boolean" },
  "rung.asked": { act: "name", rung: "name" },                                        // never `words`
  "rung.answered": { yes: "boolean" },
  "rung.did": { act: "name", rung: "name", source: "name" },
  "rung.would": { act: "name", rung: "name", at: "name" },
  "rung.refused": { act: "name", why: "name" },
  "run.start": { thing: "name", step: "number", act: "name" },
  "run.about": { thing: "name", step: "number", act: "name" },
  "run.did": { thing: "name", step: "number", act: "name" },
  "run.unknown": { thing: "name", step: "number", act: "name" },
  "run.end": { thing: "name", step: "number", act: "name" },
  "thing.new": { state: "name", waitsOn: "name" },
  "thing.state": { state: "name", waitsOn: "name", undo: "boolean" },
  "thing.done": { undo: "boolean" },
};
/** a name read out: one of the engine's own words or an id, short and on one line, no path (a `name` field may hold more) */
const NAME = /^[\w.:@+-]{1,80}$/;
/** a folder of the home, said by its path under the home (a trace's place, a folder agent's session): read out only
 *  when it is one line and that folder is there, so it is a place the person's own window already shows (next.state's
 *  places), never words written into a record */
const FOLDER = /^[^\u0000-\u001f\u007f]{1,200}$/;
const folderOf = (home: string, f: string): string | null => {
  const p = f.split("#")[0];
  return FOLDER.test(p) && !p.split("/").some((x) => x === ".." || x === "") && existsSync(join(home, p)) ? p : null;
};
const HEX = /^[0-9a-f]{64}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function pick(kind: string, value: unknown): Facts {
  const want = PICK[kind], out: Facts = {};
  if (!want || !isObj(value)) return out;
  for (const [k, t] of Object.entries(want)) {
    const v = value[k];
    if (t === "tokens") {
      if (isObj(v) && typeof v.in === "number" && Number.isFinite(v.in) && typeof v.out === "number" && Number.isFinite(v.out)) { out.tokensIn = v.in; out.tokensOut = v.out; }
    } else if (t === "name" && k === "program" && typeof v === "string") {
      const base = v.slice(v.lastIndexOf("/") + 1);   // the program, never the path it was run from
      if (NAME.test(base)) out[k] = base;
    } else if (t === "name" ? typeof v === "string" && NAME.test(v) : t === "number" ? typeof v === "number" && Number.isFinite(v) : typeof v === "boolean") out[k] = v as Fact;
  }
  return out;
}

/** an event as read: `side` says whether it is the day's own, or the day before or after, read only to close what the
 *  day left open (an answer, a turn's end, a Thing done after midnight) and never shown as a step */
type Ev = { id: string; seq: number; at: number; kind: string; item?: string; cause?: string; session?: string; seat?: string; facts: Facts; side: -1 | 0 | 1 };

/** one day of the log, each event with only its picked facts (a value file is opened only for a kind PICK names) */
function readLogDay(dir: string, home: string, day: string, side: -1 | 0 | 1): { evs: Ev[]; skipped: number; old: number } {
  let text = "";
  try { text = readFileSync(join(dir, `${day}.jsonl`), "utf8"); } catch { return { evs: [], skipped: 0, old: 0 }; }
  const evs: Ev[] = [];
  let skipped = 0, old = 0;
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    let e: Record<string, unknown>;
    try { const j = JSON.parse(l); if (!isObj(j) || typeof j.kind !== "string") { skipped++; continue; } e = j; } catch { skipped++; continue; }
    let kind = e.kind as string;
    if (e.v === undefined) { old++; kind = nameOfOld(e as never) ?? kind; }
    let value: unknown = e.value;
    if (value === undefined && PICK[kind] && typeof e.hash === "string" && HEX.test(e.hash)) {
      try { value = JSON.parse(readFileSync(valueFile(dir, e.hash), "utf8")); } catch { skipped++; }   // erased, or not there
    }
    const by = isObj(e.by) ? e.by : {}, ctx = isObj(e.ctx) ? e.ctx : {};
    const said = typeof ctx.session === "string" ? ctx.session : isObj(value) && typeof value.session === "string" ? value.session : undefined;
    // a folder agent's session is agent:<folder>: kept only when that folder is there; any other session is an id
    const folder = said?.startsWith("agent:") ? folderOf(home, said.slice(6)) : null;
    const session = folder ? `agent:${folder}` : said && NAME.test(said) ? said : undefined;
    evs.push({
      id: typeof e.id === "string" ? e.id : "", seq: typeof e.seq === "number" ? e.seq : 0, at: typeof e.at === "number" ? e.at : 0, kind,
      ...(typeof e.item === "string" && NAME.test(e.item) ? { item: e.item } : {}),
      ...(typeof e.cause === "string" ? { cause: e.cause } : {}),
      ...(session ? { session } : {}),
      ...(by.person === "seat" && typeof by.agent === "string" && NAME.test(by.agent) ? { seat: by.agent } : {}),
      facts: pick(kind, value), side,
    });
  }
  return { evs, skipped, old };
}

/** where an event belongs: its conversation, the Thing a run or a wait is about, the block a step went through */
function sourceOf(e: Ev): Source {
  if (e.session) {
    const folder = /^agent:(.+)$/.exec(e.session);
    return folder ? { kind: "folder", id: folder[1], seat: e.seat ?? null } : { kind: "session", id: e.session, seat: e.seat ?? null };
  }
  const thing = typeof e.facts.thing === "string" ? e.facts.thing : e.kind.startsWith("thing.") || e.kind.startsWith("rung.") || e.kind.startsWith("run.") ? e.item : undefined;
  if (thing) return { kind: "thing", id: thing, seat: null };
  if ((e.kind.startsWith("plugin.") || e.kind === "tool.call") && e.item) return { kind: "block", id: e.item, seat: null };
  return { kind: "home", id: "home", seat: null };
}
const keyOf = (s: Source) => `${s.kind}:${s.id}`;
const backOf = (s: Source, day: string): Back | null =>
  s.kind === "session" ? { session: s.id } : s.kind === "folder" ? { place: s.id } : s.kind === "thing" ? { thing: s.id }
    : s.kind === "block" ? { block: s.id } : s.kind === "diary" ? { day } : null;

function fresh(source: Source, at: number, day: string): Run {
  return { id: keyOf(source), source, from: at, to: at, provider: null, tools: [], result: "unknown", waits: [], permissions: [], steps: [], more: 0, back: backOf(source, day), unknown: [] };
}
function step(r: Run, s: Step) {
  r.from = Math.min(r.from, s.at); r.to = Math.max(r.to, s.at);
  if (r.steps.length < MAX_STEPS) r.steps.push(s); else r.more++;
}

/** the log's events folded into runs (pure). Only the day's own events (side 0) make a run or a step; the day before
 *  gives what an answer or an end of that day refers to, the day after closes what the day left open */
function foldLog(evs: Ev[], day: string, today: boolean): Map<string, Run> {
  const runs = new Map<string, Run>();
  const runOf = (e: Ev) => { const s = sourceOf(e); const k = keyOf(s); let r = runs.get(k); if (!r) runs.set(k, (r = fresh(s, e.at, day))); return r; };
  // a turn open (seat.turn with no seat.done after it), by run; an ask by its id, with its wait and its run once shown
  const open = new Map<string, boolean>();
  const asks = new Map<string, { p: Permission; w: Wait; r: Run | null }>(), about = new Map<string, Wait>();
  const thingWait = (r: Run) => r.waits.filter((w) => w.on !== "permission" && w.on !== "step").at(-1);
  for (const e of [...evs].sort((a, b) => a.side - b.side || a.seq - b.seq || a.at - b.at)) {
    if (!PICK[e.kind]) continue;
    const f = e.facts, key = keyOf(sourceOf(e));
    if (e.side !== 0) {
      // the day before: only what the day's own events will refer to
      if (e.side < 0) {
        if (e.kind === "rung.asked") asks.set(e.id, { p: { at: e.at, act: String(f.act ?? "unknown"), rung: String(f.rung ?? "unknown"), answer: null }, w: { at: e.at, on: "permission", until: null }, r: null });
        if (e.kind === "seat.turn") open.set(key, true);
        if (e.kind === "seat.done") open.set(key, false);
        continue;
      }
      // the day after: only closing what the day shows open
      const r = runs.get(key);
      if (!r) continue;
      const a = e.cause ? asks.get(e.cause) : undefined;
      if (a?.r && (e.kind === "rung.answered" || e.kind === "rung.did" || e.kind === "rung.refused")) {
        if (e.kind === "rung.answered") a.p.answer = f.yes === true ? "yes" : f.yes === false ? "no" : a.p.answer;
        else if (a.p.answer === null) a.p.answer = e.kind === "rung.did" ? "let" : "refused";
        if (a.w.until === null) a.w.until = e.at;
      }
      if (e.kind === "seat.done" && open.get(key)) { open.set(key, false); r.result = f.ok === false ? "failed" : f.ok === true ? "done" : "unknown"; }
      if (e.kind === "run.did" || e.kind === "run.unknown" || e.kind === "run.end") { const w = about.get(key); if (w && w.until === null) w.until = e.at; }
      if (e.kind === "thing.done" && f.undo !== true) { for (const w of r.waits) if (w.on !== "permission" && w.until === null) w.until = e.at; r.result = "done"; }
      if (e.kind === "thing.state") { const w = thingWait(r); if (w && w.until === null && f.waitsOn !== w.on) w.until = e.at; }
      continue;
    }
    const r = runOf(e);
    step(r, { at: e.at, kind: e.kind, facts: f });
    if (e.kind.startsWith("seat.")) {
      const p = (r.provider ??= { seat: e.seat ?? "unknown", model: null, turns: 0, tokens: null, costTotal: null });
      if (e.kind === "seat.turn") { p.turns++; if (typeof f.model === "string") p.model = f.model; open.set(r.id, true); }
      const tin = e.kind === "seat.usage" ? f.in : e.kind === "seat.done" ? f.tokensIn : undefined, tout = e.kind === "seat.usage" ? f.out : e.kind === "seat.done" ? f.tokensOut : undefined;
      if (typeof tin === "number" && typeof tout === "number") p.tokens = { in: (p.tokens?.in ?? 0) + tin, out: (p.tokens?.out ?? 0) + tout };
      if (e.kind === "seat.done") { open.set(r.id, false); r.result = f.ok === false ? "failed" : f.ok === true ? "done" : "unknown"; if (typeof f.costTotal === "number") p.costTotal = f.costTotal; }
    }
    if (e.kind === "seat.step" || e.kind === "tool.call" || e.kind === "plugin.called") {
      const name = typeof f.tool === "string" ? f.tool : "unknown";
      let t = r.tools.find((x) => x.tool === name);
      if (!t) r.tools.push((t = { tool: name, n: 0, ok: 0, failed: 0, unsaid: 0 }));
      t.n++;
      const ok = typeof f.ok === "boolean" ? f.ok : typeof f.out === "boolean" ? f.out : null;
      if (ok === true) t.ok++; else if (ok === false) t.failed++; else t.unsaid++;
    }
    if (e.kind === "rung.asked") {
      const a = { p: { at: e.at, act: String(f.act ?? "unknown"), rung: String(f.rung ?? "unknown"), answer: null } as Permission, w: { at: e.at, on: "permission", until: null } as Wait, r };
      asks.set(e.id, a); r.permissions.push(a.p); r.waits.push(a.w);
    }
    if (e.kind === "rung.answered" || e.kind === "rung.did" || e.kind === "rung.refused" || e.kind === "rung.would") {
      const a = e.cause ? asks.get(e.cause) : undefined;
      if (a && e.kind !== "rung.would") {
        // an ask of the day before, answered today: shown here, as the ask it answers
        if (!a.r) { a.r = r; r.permissions.push(a.p); r.waits.push(a.w); }
        if (e.kind === "rung.answered") a.p.answer = f.yes === true ? "yes" : f.yes === false ? "no" : a.p.answer;
        else if (a.p.answer === null) a.p.answer = e.kind === "rung.did" ? "let" : "refused";
        if (a.w.until === null) a.w.until = e.at;
      } else if (e.kind !== "rung.answered") {
        r.permissions.push({ at: e.at, act: String(f.act ?? "unknown"), rung: String(f.rung ?? "none"), answer: e.kind === "rung.did" ? "let" : e.kind === "rung.refused" ? "refused" : null });
      }
    }
    if (e.kind === "run.about") { const w: Wait = { at: e.at, on: "step", until: null }; about.set(r.id, w); r.waits.push(w); }
    if (e.kind === "run.did" || e.kind === "run.unknown") { const w = about.get(r.id); if (w && w.until === null) w.until = e.at; if (e.kind === "run.unknown") r.result = "unknown"; }
    if (e.kind === "run.end") { const w = about.get(r.id); if (w && w.until === null) w.until = e.at; r.result = "done"; }
    if (e.kind === "thing.new" || e.kind === "thing.state") {
      const last = thingWait(r), on = typeof f.waitsOn === "string" ? f.waitsOn : null;
      if (last && last.until === null && on !== last.on) last.until = e.at;
      if (on && on !== "none" && !(last && last.until === null && last.on === on)) r.waits.push({ at: e.at, on, until: null });
      if (f.state === "done") r.result = "done";
    }
    if (e.kind === "thing.done") {
      if (f.undo === true) r.result = "unknown";
      else { for (const w of r.waits) if (w.on !== "permission" && w.until === null) w.until = e.at; r.result = "done"; }
    }
  }
  for (const r of runs.values()) {
    if (open.get(r.id)) r.result = today ? "running" : "unknown";
    if (r.waits.some((w) => w.until === null) && r.result !== "failed") r.result = "waiting";
    if (r.provider === null && (r.source.kind === "session" || r.source.kind === "folder")) r.unknown.push("provider");
    if (r.provider && r.provider.model === null) r.unknown.push("model");
    if (r.provider && r.provider.tokens === null) r.unknown.push("tokens");
    if (r.result === "unknown") r.unknown.push("outcome");
  }
  return runs;
}

/** a folder agent's recorded work that day (agent/meta/traces.ts): what was made and for whom, never its words */
function traceRuns(home: string, day: string): Run[] {
  let list: unknown[] = [];
  try { const j = JSON.parse(readFileSync(tracesFile(home), "utf8")); if (Array.isArray(j?.traces)) list = j.traces; } catch { return []; }
  const out: Run[] = [];
  for (const t of list) {
    if (!isObj(t) || typeof t.at !== "number" || typeof t.place !== "string" || typeof t.id !== "string" || !/^t-[0-9a-f]{12}$/.test(t.id) || dayOf(new Date(t.at)) !== day) continue;
    const place = folderOf(home, t.place);
    if (!place) continue;
    const made = isObj(t.made) ? t.made : {}, facts: Facts = {};
    if (typeof made.kind === "string" && /^[a-z0-9]{1,20}$/.test(made.kind)) facts.made = made.kind;
    if (made.for === "self" || made.for === "others") facts.for = made.for;
    if (typeof t.minutes === "number" && Number.isFinite(t.minutes)) facts.minutes = t.minutes;
    if (Array.isArray(t.sources)) facts.sources = t.sources.length;
    if (Array.isArray(t.steps)) facts.steps = t.steps.length;
    const from = t.from === "did" || t.from === "shown" || t.from === "ask" ? t.from : "did";
    const r = fresh({ kind: "folder", id: place, seat: null }, t.at, day);
    r.id = `trace:${t.id}`;
    r.result = "done";
    r.unknown.push("provider", "tools");
    step(r, { at: t.at, kind: `trace.${from}`, facts });
    out.push(r);
  }
  return out;
}

const LINE = /^dl-[0-9a-f]{12}$/;
/** the diary's day as a source: which lines came in and by which way, the pause; never the words */
function diaryRun(home: string, day: string): Run | null {
  let text = "";
  try { text = readFileSync(dayFile(home, day), "utf8"); } catch { return null; }
  const r = fresh({ kind: "diary", id: day, seat: null }, Infinity, day);
  r.from = Infinity; r.to = 0;
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    try {
      const e = JSON.parse(l);
      if (!isObj(e) || typeof e.at !== "number") continue;
      if (e.ev === "write" && typeof e.id === "string" && LINE.test(e.id)) step(r, { at: e.at, kind: "diary.write", facts: { line: e.id, ...(typeof e.via === "string" && /^[a-z][a-z0-9-]{0,19}$/.test(e.via) ? { via: e.via } : {}) } });
      else if ((e.ev === "remove" || e.ev === "back") && typeof e.line === "string" && LINE.test(e.line)) step(r, { at: e.at, kind: `diary.${e.ev}`, facts: { line: e.line } });
    } catch { /* a broken line: skipped */ }
  }
  if (!r.steps.length) return null;
  try {
    const p = JSON.parse(readFileSync(join(home, "next", "diary", "pause.json"), "utf8"));
    if (isObj(p) && typeof p.from === "number" && dayOf(new Date(p.from)) <= day && (typeof p.to !== "number" || dayOf(new Date(p.to)) >= day))
      r.waits.push({ at: p.from, on: "diary paused", until: typeof p.to === "number" ? p.to : null });
  } catch { /* no pause */ }
  r.result = "done";
  return r;
}

/** the gaps that always stand, said once so the face never fills them */
const GAPS: Gap[] = [
  { what: "reasoning", say: "What an AI thought to itself is not recorded, so it is not shown." },
  { what: "seat-own", say: "What an AI loads on its own (its instructions, skills and memory) is not recorded." },
  { what: "words", say: "What was asked and answered, and what a tool was given, are kept out of this history on purpose." },
  { what: "work-permissions", say: "A Work session's permission asks are answered in the session and are not on the log." },
];

/** the days that have a record: the log's days, the diary's, the traces' (newest first) */
function daysOf(home: string, logDir: string | undefined): string[] {
  const set = new Set<string>(daysKept(home));
  if (logDir) { try { for (const n of readdirSync(logDir)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)) set.add(n.slice(0, 10)); } catch { /* no log */ } }
  try { const j = JSON.parse(readFileSync(tracesFile(home), "utf8")); for (const t of Array.isArray(j?.traces) ? j.traces : []) if (isObj(t) && typeof t.at === "number") set.add(dayOf(new Date(t.at))); } catch { /* none */ }
  return [...set].sort().reverse();
}

/** the day `n` days from `day` (local) */
const shift = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return dayOf(new Date(y, m - 1, d + n)); };

/** next.traces: one day's history (today when `day` is not a day) */
export function tracesMsg(w: { home: string; logDir?: string; now?: Date }, asked?: unknown): Traces {
  const now = w.now ?? new Date(), today = dayOf(now);
  const day = typeof asked === "string" && DAY.test(asked) ? asked : today;
  const log = w.logDir ? readLogDay(w.logDir, w.home, day, 0) : { evs: [], skipped: 0, old: 0 };
  const near = w.logDir && log.evs.length ? [...readLogDay(w.logDir, w.home, shift(day, -1), -1).evs, ...readLogDay(w.logDir, w.home, shift(day, 1), 1).evs] : [];
  const runs = [...foldLog([...log.evs, ...near], day, day === today).values(), ...traceRuns(w.home, day)];
  const diary = diaryRun(w.home, day);
  if (diary) runs.push(diary);
  runs.sort((a, b) => b.to - a.to);
  const gaps = [...GAPS];
  if (!w.logDir) gaps.unshift({ what: "log", say: "The log is off on this Sol, so no AI's steps were recorded." });
  else if (!log.evs.length) gaps.unshift({ what: "log", say: "Nothing was recorded on the log that day." });
  if (log.old) gaps.push({ what: "old", say: `${log.old} older lines were written before the log said who and where; they are counted, not shown.` });
  return {
    type: "next.traces", day, days: daysOf(w.home, w.logDir), runs: runs.slice(0, MAX_RUNS),
    coverage: { log: !w.logDir ? "off" : log.evs.length ? "read" : "none", events: log.evs.length, skipped: log.skipped, old: log.old, unknown: gaps },
  };
}

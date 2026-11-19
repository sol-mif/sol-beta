// The runs view's rules (#889), as pure functions: what the screen decides from the runs board, written so a test can
// hold each decision. Nothing here draws, fetches or reads a clock: the board, the width and "now" come in as arguments.
//
// The board is the JSON a collector on the NucBox serves (keys: projects, lines, runs, joins, machines, alerts,
// requests); its judgement (a run's state and why, a machine's room) is /mnt/c/sol/n10/judge.py's, and is read here as
// given, never re-judged. What this file adds is what a person needs from it at a glance:
//   - the one mark a project wears (needs you, ready to try, working, calm);
//   - the "Needs you" list across every project, most pressing first;
//   - a line's track laid out at a width (which builders show, which fold into one summary line);
//   - the plan for a sentence when the board cannot plan (the local rule: most room first, review elsewhere).
// Every choice a person may change (how many builders a machine takes, when work is split, where the review runs,
// when a builder is stuck, who presses Run) is read from the sheet (sheet.ts, #906), never from a constant here.

import { DEFAULTS, changed, roomUnder, ruleWords, stuckUnder, touchesScreen, valueWord, ruleOf, capOf, type Sheet } from "./sheet.ts";

export type RunState = "working" | "testing" | "waiting" | "quiet" | "starting" | "done" | "failed" | "cut";
export interface Pr { number: number; draft?: boolean; title?: string; base?: string }
export interface Run {
  id: string; machine: string; line: string; state: RunState; why?: string;
  said?: string | null; did?: string | null; pr?: Pr | null; since?: number; cap?: number | null; moved?: number | null; branch?: string | null;
}
export interface Line { id: string; project: string; name: string; goal?: string; try?: string; issue?: number }
export interface Join { line: string; name: string; queue: { pr: number; slice?: string }[]; ready?: number[]; log?: string[] }
export interface Machine {
  at?: number; role?: string; cores?: number; load?: number[]; mem_free_gb?: number; mem_total_gb?: number;
  tmp_bytes_pc?: number; tmp_inodes_pc?: number; builders?: number; room?: number; room_why?: string;
}
export interface Alert { level: "act" | "watch"; what: string; where: string }
export interface Request { id?: string; sentence: string; project?: string; state?: string; at?: number }
export interface Project { id: string; name: string }
export interface Board {
  at: number; projects?: Project[]; lines?: Line[]; runs?: Run[]; joins?: Join[];
  machines?: Record<string, Machine>; alerts?: Alert[]; requests?: Request[]; merged?: { number: number; baseRefName?: string; title?: string; mergedAt?: string }[];
}

// ---- words ----

/** the board's address: `?runs.url=` on the page's link wins, else the one setting's default (a local relay on the Mac) */
export const BOARD_DEFAULT = "http://127.0.0.1:8811/";
export function boardUrl(search: string): string {
  const u = new URLSearchParams(search).get("runs.url");
  if (u && /^(https?:)?\/\//.test(u)) return u.endsWith("/") || /\.json($|\?)/.test(u) ? u : u + "/";
  return BOARD_DEFAULT;
}
/** an address next to the board's: /plan, /start. A board read from a file (…/x.json) has none, so its own folder is asked */
export function boardPath(url: string, path: string): string {
  const base = url.replace(/[?#].*$/, "");
  return (base.endsWith("/") ? base : base.slice(0, base.lastIndexOf("/") + 1)) + path;
}

const NAMES: Record<string, string> = { nucbox: "NucBox", macbook: "MacBook", mac: "MacBook", legion: "Legion" };
/** a machine as a person says it */
export const machineName = (m: string) => NAMES[m.toLowerCase()] ?? (m ? m[0].toUpperCase() + m.slice(1) : "a machine");
/** the three machines Marco builds on, always drawn, in this order; others the board names come after */
export const KNOWN_MACHINES = ["macbook", "nucbox", "legion"];

/** a builder's short name: the unit's id without the prefixes every unit shares */
export const shortName = (id: string) => id.replace(/^sol-(build|chain)-/, "").replace(/^sol-/, "") || id;

/** a builder's state in a word or two a person uses */
export const STATE_WORD: Record<RunState, string> = {
  working: "working", testing: "running its tests", waiting: "waiting", quiet: "stuck", starting: "starting",
  done: "finished", failed: "stopped on an error", cut: "cut off at its time limit",
};
/** stalled: the builders that ask for the eye. Nothing else does */
export const stalled = (s: RunState) => s === "quiet" || s === "failed" || s === "cut";
const busy = (s: RunState) => s === "working" || s === "testing" || s === "waiting" || s === "starting";

/** a builder's why as the screen says it: the silence counted up live in place of the board's minute, and judge.py's
 *  closing ": stuck" dropped, since the state word beside it says so already */
export function liveWhy(why: string | undefined, quiet: number | null): string {
  let w = (why ?? "").replace(/:\s*stuck$/, "");
  if (quiet != null) w = w.replace(/\bsilent \d+ min\b/, `silent ${span(quiet)}`);
  return w || "the board gives no reason";
}
/** how long since a builder last moved, counting up from the board's read: seconds, or null when the board does not say */
export function sinceMoved(r: Run, boardAt: number, nowSec: number): number | null {
  if (r.moved == null) return null;
  return Math.max(0, r.moved + Math.max(0, nowSec - boardAt));
}
/** the board as his sheet judges it (#906): a builder the board called stuck but silent under his minutes is waiting,
 *  and a machine whose builder cap he changed has its room worked again (sheet.ts roomUnder). A sheet at its defaults
 *  gives the board back as it came */
export function judged(board: Board, sheet: Sheet = DEFAULTS, nowSec = board.at): Board {
  const runs = (board.runs ?? []).map((r) => { const s = stuckUnder(sheet, r.state, sinceMoved(r, board.at, nowSec)); return s ? { ...r, ...s } : r; });
  const machines = Object.fromEntries(Object.entries(board.machines ?? {}).map(([id, m]) => {
    const u = roomUnder(sheet, id, m);
    return [id, u.his ? { ...m, room: u.room, room_why: u.why } : m];
  }));
  return { ...board, ...(board.runs ? { runs } : {}), ...(board.machines ? { machines } : {}) };
}

/** a span of seconds in words: "just now", "4 min", "2 h 5 min" */
export function span(sec: number): string {
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// ---- joins and what is ready to try ----

/** how many of a join's queue are merged: from its log ("848 merged"), else from the board's merged list */
export function joinCount(j: Join, merged: Board["merged"] = []): { merged: number; of: number; next?: number } {
  const done = new Set<number>();
  for (const l of j.log ?? []) { const m = /^#?(\d+)\s+merged\b/.exec(l.trim()); if (m) done.add(+m[1]); }
  const inQueue = new Set(j.queue.map((q) => q.pr));
  for (const m of merged ?? []) if (inQueue.has(m.number)) done.add(m.number);
  const next = j.queue.find((q) => !done.has(q.pr))?.pr;
  return { merged: j.queue.filter((q) => done.has(q.pr)).length, of: j.queue.length, ...(next ? { next } : {}) };
}

/** what a line has ready to try: the merged count over its joins, or the finished builders' PRs, against what he saw */
export function readyOf(board: Board, lineId: string, seen: Record<string, number> = {}): { count: number; fresh: number; where?: string } {
  const joins = (board.joins ?? []).filter((j) => j.line === lineId);
  const line = (board.lines ?? []).find((l) => l.id === lineId);
  let count = 0;
  if (joins.length) count = joins.reduce((a, j) => a + joinCount(j, board.merged).merged, 0);
  else count = (board.runs ?? []).filter((r) => r.line === lineId && r.state === "done" && r.pr).length;
  return { count, fresh: Math.max(0, count - (seen[lineId] ?? 0)), ...(line?.try ? { where: line.try } : {}) };
}

/** a PR's title in ordinary words: the kind before the colon, the issue number and the switch it sits behind left out
 *  ("product: a drag that follows the finger, behind stage.whole (#773)" → "A drag that follows the finger") */
export function plainTitle(t: string): string {
  const w = t.replace(/^[a-z]+(\([^)]*\))?:\s*/i, "").replace(/\s*\((#\d+[^)]*)\)\s*$/, "").replace(/,?\s+behind [\w.-]+(\s*\([^)]*\))?/i, "").replace(/\s*\(#\d+\)/g, "").trim();
  return w ? w[0].toUpperCase() + w.slice(1) : t;
}
/** what landed on a line's try branch, newest first, in ordinary words: from the board's merged list (titles), else
 *  the finished builders' PRs; `more` counts what is not drawn (at most `cap` drawn, one over is drawn) */
export function landed(board: Board, line: Line, cap = 5): { titles: string[]; more: number } {
  const merged = (board.merged ?? []).filter((m) => line.try && m.baseRefName === line.try && m.title)
    .sort((a, b) => (b.mergedAt ?? "").localeCompare(a.mergedAt ?? "") || b.number - a.number).map((m) => plainTitle(m.title!));
  const done = (board.runs ?? []).filter((r) => r.line === line.id && r.state === "done" && r.pr?.title).map((r) => plainTitle(r.pr!.title!));
  const all = [...new Set(merged.length ? merged : done)];
  if (all.length <= cap + 1) return { titles: all, more: 0 };
  return { titles: all.slice(0, cap), more: all.length - cap };
}

// ---- the mark a project wears ----

export type Mark = "needs" | "ready" | "working" | "calm";
export const MARK_WORD: Record<Mark, string> = { needs: "needs you", ready: "ready to try", working: "working", calm: "calm" };

/** one project's mark, and the few words under it. Needs you wins over ready, ready over working, working over calm */
export function projectMark(board: Board, projectId: string, seen: Record<string, number> = {}): { mark: Mark; word: string; detail: string } {
  const lines = (board.lines ?? []).filter((l) => l.project === projectId), ids = new Set(lines.map((l) => l.id));
  const runs = (board.runs ?? []).filter((r) => ids.has(r.line));
  const stuck = runs.filter((r) => stalled(r.state)).length;
  const working = runs.filter((r) => busy(r.state)).length;
  const fresh = lines.reduce((a, l) => a + readyOf(board, l.id, seen).fresh, 0);
  const asked = (board.requests ?? []).filter((q) => q.project === projectId).length;
  const builders = (n: number) => `${n} builder${n === 1 ? "" : "s"}`;
  if (stuck) return { mark: "needs", word: MARK_WORD.needs, detail: `${stuck} stalled${working ? `, ${working} working` : ""}` };
  if (fresh) return { mark: "ready", word: MARK_WORD.ready, detail: `${fresh} new${working ? `, ${builders(working)}` : ""}` };
  if (working || asked) return { mark: "working", word: MARK_WORD.working, detail: working ? builders(working) : `${asked} waiting to start` };
  return { mark: "calm", word: MARK_WORD.calm, detail: "nothing running" };   // with no line, the tab says what any calm tab says; the body says there is none (#906)
}

/** the tab that opens first: the first project that needs you, else the first with something to try, else the first at
 *  work, else the first. Chosen once: the screen keeps it after (a tab never moves under the eye on a re-read) */
export function firstTab(projects: Project[], marks: Map<string, { mark: Mark }>): string | null {
  for (const want of ["needs", "ready", "working"] as Mark[]) { const p = projects.find((x) => marks.get(x.id)?.mark === want); if (p) return p.id; }
  return projects[0]?.id ?? null;
}

// ---- Needs you ----

export interface Need {
  key: string; kind: "machine" | "failed" | "cut" | "stuck"; title: string; why: string;
  project?: string; line?: string; run?: string; machine: string; quiet?: number | null;
}
const RANK: Record<Need["kind"], number> = { machine: 0, failed: 1, cut: 2, stuck: 3 };

/** what needs him, across every project, most pressing first: a machine where nothing can start (it holds every
 *  builder back), then a builder that failed, one cut at its cap, one stuck; within a kind, the longest silent first.
 *  Watch-level alerts are not here: they stay with the machine they are about, in its meter's reason */
export function needsYou(board: Board, nowSec = board.at): Need[] {
  const lines = new Map((board.lines ?? []).map((l) => [l.id, l]));
  const out: Need[] = [];
  for (const r of board.runs ?? []) {
    if (!stalled(r.state)) continue;
    const l = lines.get(r.line), kind: Need["kind"] = r.state === "quiet" ? "stuck" : r.state;
    out.push({
      key: `run:${r.id}`, kind, run: r.id, line: r.line, project: l?.project, machine: r.machine, quiet: sinceMoved(r, board.at, nowSec),
      title: `${l?.name ?? r.line}: ${shortName(r.id)} on the ${machineName(r.machine)} is ${STATE_WORD[r.state]}`,
      why: liveWhy(r.why, sinceMoved(r, board.at, nowSec)),
    });
  }
  const runIds = (board.runs ?? []).map((r) => r.id);
  const machines = board.machines ?? {};
  for (const a of board.alerts ?? []) {
    if (a.level !== "act" || runIds.some((id) => a.what.startsWith(id))) continue;   // a run's own alert: said above
    if (!(a.where in machines)) continue;
    const what = a.what.replace(new RegExp(`^${a.where}:\\s*`, "i"), "");
    out.push({ key: `machine:${a.where}:${what}`, kind: "machine", machine: a.where, title: `${machineName(a.where)}: nothing new can start there`, why: what });
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.quiet ?? 0) - (a.quiet ?? 0) || a.key.localeCompare(b.key));
}

/** the one calm line when nothing needs him */
export function calmLine(board: Board): string {
  const runs = (board.runs ?? []).filter((r) => busy(r.state));
  const projects = new Set(runs.map((r) => (board.lines ?? []).find((l) => l.id === r.line)?.project).filter(Boolean));
  if (!runs.length) return "Nothing needs you, and nothing is running.";
  return `Nothing needs you. ${runs.length} builder${runs.length === 1 ? "" : "s"} at work on ${projects.size} project${projects.size === 1 ? "" : "s"}.`;
}

// ---- a line's track at a width ----

const ORDER: Record<RunState, number> = { failed: 0, cut: 1, quiet: 2, working: 3, testing: 4, starting: 5, waiting: 6, done: 7 };
export interface Track {
  stacked: boolean;                 // too narrow for one row: the goal above, the builders under, the join and try last
  cols: string;                     // the grid's columns when in a row
  shown: Run[];                     // the builders drawn one by one, stalled first
  folded: { count: number; words: string } | null;   // the rest, as one line
}
export const TRACK = { row: 720, goal: 180, join: 152, tryW: 136, perRow: 4, perStack: 3 } as const;

/** a line's track at a width: in a row from TRACK.row up (the goal a fifth of it, never under 180), else stacked; every stalled builder is always drawn, the
 *  others up to a cap (4 in a row, 3 stacked), and the rest fold into one line of counts ("and 8 more: 6 working, 2 waiting") */
export function trackLayout(runs: Run[], width: number): Track {
  const stacked = width < TRACK.row;
  const sorted = [...runs].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.id.localeCompare(b.id));
  const nStalled = sorted.filter((r) => stalled(r.state)).length;
  const cap = Math.max(nStalled, stacked ? TRACK.perStack : TRACK.perRow);
  const fits = sorted.length <= cap + 1;   // folding one builder into "and 1 more" saves nothing: draw it
  const shown = fits ? sorted : sorted.slice(0, cap), rest = fits ? [] : sorted.slice(cap);
  const by = new Map<string, number>();
  for (const r of rest) by.set(STATE_WORD[r.state], (by.get(STATE_WORD[r.state]) ?? 0) + 1);
  const words = [...by].map(([w, n]) => `${n} ${w}`).join(", ");
  const goal = Math.max(TRACK.goal, Math.round(width * 0.2));
  return {
    stacked, shown,
    cols: stacked ? "minmax(0, 1fr)" : `${goal}px minmax(0, 1fr) ${TRACK.join}px ${TRACK.tryW}px`,
    folded: rest.length ? { count: rest.length, words: `and ${rest.length} more: ${words}` } : null,
  };
}

/** the screen at a width: the side (Needs you, the machines) beside the lines from SCREEN.side up, else under them */
export const SCREEN = { side: 1040, sideW: 320 } as const;
export const screenLayout = (width: number) => (width >= SCREEN.side ? { beside: true, linesW: width - SCREEN.sideW } : { beside: false, linesW: width });

// ---- the machines ----

export interface Meter { id: string; name: string; reporting: boolean; full: number; room: number; word: string; why: string; watch?: string }
/** the machines as meters: the three known first, then any other the board names. Full = builders over the machine's
 *  cap (cores / 2.5, judge.py's rule); a machine not on the board is drawn as "not reporting" and left out of plans */
export function meters(board: Board, sheet: Sheet = DEFAULTS): Meter[] {
  const ms = board.machines ?? {};
  const ids = [...KNOWN_MACHINES, ...Object.keys(ms).filter((k) => !KNOWN_MACHINES.includes(k))];
  return ids.map((id) => {
    const m = ms[id];
    if (!m) return { id, name: machineName(id), reporting: false, full: 0, room: 0, word: "not reporting", why: "the board hears nothing from it; plans leave it out" };
    const cap = capOf(sheet, id, m.cores), under = roomUnder(sheet, id, m);
    const full = Math.max(0, Math.min(1, (m.builders ?? 0) / cap));
    const room = under.room;
    const watch = (board.alerts ?? []).find((a) => a.where === id && a.level === "watch")?.what.replace(new RegExp(`^${id}:\\s*`, "i"), "");
    const word = room ? `room for ${room}` : m.role === "desk" && !m.builders ? "kept for you" : "full";
    return { id, name: machineName(id), reporting: true, full, room, word, why: under.why, ...(watch ? { watch } : {}) };
  });
}

// ---- the plan for a sentence ----

export interface PlanPart { name: string; what: string; machine: string; why: string }
export interface Plan {
  id: string; parts: PlanPart[]; builders: number; why_builders: string;
  /** shots (#906): when the work changes the screen, whether the review looks at pictures of it, by the sheet */
  review: { machine: string; why: string; shots?: string };
  join: { order: string[]; why: string }; est_minutes: number; confidence: number | string; by: string;
  /** who may press Run, by the sheet (#906); the rules he changed that decided this plan (sheet ids) */
  starts?: string; ruled?: string[];
}
const PROOF = /^(and\s+)?(prove|test|check|verify|shoot|show|review)\b/i;
const MAC = (id: string, m: Machine) => /^mac/i.test(id) || m.role === "desk";
const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** the parts a sentence names: split at "and", "then", commas and semicolons; a clause that asks for proof ("and prove
 *  it") is the review's, not a part. By the sheet: at most `split.max` parts (the clauses past it join the last part,
 *  so nothing he said is dropped), or, when work is built whole, one part */
export function partsOf(sentence: string, sheet: Sheet = DEFAULTS): { parts: string[]; proof: string | null } {
  const clauses = sentence.trim().replace(/[.!]+$/, "").split(/\s*(?:[,;]\s*(?:and\s+|then\s+)?|\s+and\s+then\s+|\s+then\s+|\s+and\s+)\s*/i).map((c) => c.trim()).filter(Boolean);
  const proof = clauses.find((c) => PROOF.test(c)) ?? null;
  let parts = clauses.filter((c) => !PROOF.test(c));
  const max = sheet.split === "whole" ? 1 : Number(sheet["split.max"] ?? 6);
  if (parts.length > max) parts = [...parts.slice(0, max - 1), parts.slice(max - 1).join(" and ")];
  return { parts: parts.length ? parts : [sentence.trim()], proof };
}

/** the local plan, the board's /plan shape, by a pure rule read from the sheet: machines by most room first (the Mac
 *  only if nothing else reports: it is where he works, a fixed rule), each taking at most its room under his cap;
 *  builders one per part up to the room there is (at least one: a full night waits for the first free place); the
 *  review where his rule says (another machine than the builders, by default); the join in the order he said the
 *  parts. The time: 30 min a round of builders, 15 for the review, 5 a join after the first. Where a rule he changed
 *  decided, the why names it ("your rule ‘at most 3 builders at once on the Legion’"), and `ruled` lists it */
export function localPlan(board: Board, sentence: string, nowSec = board.at, sheet: Sheet = DEFAULTS): Plan {
  const plan = planWith(judged(board, sheet, nowSec), sentence, nowSec, sheet);
  const mine = Object.keys(sheet).filter((id) => changed(sheet, id));
  if (!mine.length) return plan;
  // which of his rules decided: the plan at the defaults, set beside his
  const was = planWith(board, sentence, nowSec, DEFAULTS);
  const ruled: string[] = [];
  const caps = mine.filter((id) => id.startsWith("builders.") && plan.parts.concat(was.parts).some((p) => `builders.${p.machine}` === id));
  const splits = mine.filter((id) => id === "split" || id === "split.max");
  if (plan.builders !== was.builders || plan.parts.map((p) => p.machine).join() !== was.parts.map((p) => p.machine).join() || plan.parts.length !== was.parts.length) {
    const why = [...(plan.parts.length !== was.parts.length ? splits : []), ...caps];
    if (why.length) { plan.why_builders = `${plan.why_builders}; by ${why.map((id) => ruleWords(sheet, id)).join(" and ")}`; ruled.push(...why); }
  }
  if (mine.includes("review.where")) { plan.review.why = `${ruleWords(sheet, "review.where")}: ${plan.review.why}`; ruled.push("review.where"); }
  if (mine.includes("review.eye") && plan.review.shots) ruled.push("review.eye");
  if (mine.includes("run.who")) ruled.push("run.who");
  return ruled.length ? { ...plan, ruled } : plan;
}

function planWith(board: Board, sentence: string, nowSec: number, sheet: Sheet): Plan {
  const { parts, proof } = partsOf(sentence, sheet);
  const ms = Object.entries(board.machines ?? {}).filter(([, m]) => m.at === undefined || board.at - m.at < 15 * 60);
  const pool = ms.some(([id, m]) => !MAC(id, m)) ? ms.filter(([id, m]) => !MAC(id, m)) : ms;
  const loadOf = (m: Machine) => (m.load?.[0] ?? 0) / (m.cores || 1);
  const ranked = [...pool].sort(([a, x], [b, y]) => (y.room ?? 0) - (x.room ?? 0) || loadOf(x) - loadOf(y) || a.localeCompare(b));
  const totalRoom = ranked.reduce((a, [, m]) => a + Math.max(0, m.room ?? 0), 0);
  const builders = Math.max(1, Math.min(parts.length, totalRoom || 1));
  const slots: string[] = [];
  for (const [id, m] of ranked) for (let i = 0; i < Math.max(0, m.room ?? 0); i++) slots.push(id);
  const first = ranked[0]?.[0] ?? "nucbox";
  const whyOf = (id: string, i: number) => {
    const m = board.machines?.[id];
    if (!totalRoom) return `every machine is full; it waits for the first free place here (${m?.room_why ?? "no reason given"})`;
    return `${i === 0 ? "most room now" : "the next with room"}: ${m?.room_why ?? "no reason given"}`;
  };
  const used: string[] = [];
  const planned: PlanPart[] = parts.map((p, i) => {
    const machine = slots.length ? slots[i % builders] : first;
    if (!used.includes(machine)) used.push(machine);
    return { name: `part ${i + 1}`, what: cap1(p), machine, why: whyOf(machine, used.indexOf(machine)) };
  });
  // the review: by his rule, the machine that built most of it; else a machine no builder uses, else one other than
  // the machine doing most of the building, else that one
  const free = ranked.find(([id]) => !used.includes(id))?.[0], other = ranked.find(([id]) => id !== used[0])?.[0];
  const and = proof ? `; you asked it to ${proof.replace(/^and\s+/i, "")}` : "";
  const review = sheet["review.where"] === "same" ? { machine: used[0] ?? first, why: `where most of it is built${and}` }
    : free ? { machine: free, why: `another machine than the builders', so it reads the work fresh${and}` }
    : other ? { machine: other, why: `not the ${machineName(used[0])}, where most of it is built, so it reads the work fresh${and}` }
    : { machine: used[0] ?? first, why: `no other machine reports, so a fresh session reviews where it was built${and}` };
  const shots = !touchesScreen(sentence) ? undefined : sheet["review.eye"] === false ? `it reads the code only: ${ruleWords(sheet, "review.eye")}` : "it also looks at pictures of the screen at three window sizes";
  const why_builders = parts.length === 1 ? "one part, so one builder"
    : builders === parts.length ? `one for each of the ${parts.length} parts; the machines have room for ${totalRoom}`
    : totalRoom ? `${builders}, not ${parts.length}: the machines have room for ${totalRoom} now; the rest start as one finishes`
    : `one at a time: every machine is full now`;
  const rounds = Math.ceil(parts.length / builders);
  const est = Math.round((30 * rounds + 15 + 5 * Math.max(0, parts.length - 1)) / 5) * 5;
  const who = ruleOf("run.who")!;
  return {
    id: `here-${Math.abs(hash(sentence + nowSec)).toString(36)}`, parts: planned, builders, why_builders,
    review: { ...review, ...(shots ? { shots } : {}) },
    join: { order: planned.map((p) => p.name), why: parts.length > 1 ? "in the order you said them: each lands on the one before" : "one part: nothing to order" },
    est_minutes: est, confidence: 0.5, by: "planned here",
    starts: sheet["run.who"] === "agents" ? `${cap1(valueWord(who, "agents"))} may press Run` : "Only you start it",
  };
}
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/** the reason every part shares, said once under the parts instead of on each; null when they differ */
export function sharedWhy(plan: Plan): string | null {
  return plan.parts.length > 1 && plan.parts.every((p) => p.why === plan.parts[0].why) ? plan.parts[0].why : null;
}

/** is a JSON answer a plan this screen can draw (the board's /plan, before it is trusted) */
export function isPlan(x: unknown): x is Plan {
  const p = x as Plan;
  return !!p && typeof p.id === "string" && Array.isArray(p.parts) && p.parts.every((q) => q && typeof q.machine === "string")
    && typeof p.builders === "number" && !!p.review && typeof p.review.machine === "string" && !!p.join && Array.isArray(p.join.order);
}
/** a plan's confidence in words: a share as "sure 60%"; words as they came */
export const sureWord = (c: Plan["confidence"]) => (typeof c === "number" ? `sure ${Math.round((c <= 1 ? c * 100 : c))}%` : String(c ?? ""));
/** a rough time in words */
export const minutesWord = (m: number) => (m < 60 ? `about ${m} min` : `about ${span(m * 60)}`).replace(/ /g, "\u00a0");   // never broken across lines

// Grouping on hard evidence (#1336, decided 2026-11-16): the side puts a session under the right one by itself, never as
// a suggestion, and only on what a session did, never on what it looks like.
//
//   a session starts another, or a card it proposed is started   the child goes under its starter
//   a session starts its first child                              it becomes its project's root (an orchestration session)
//   a root sends to (send_message) or reads (read_session) a      that session moves under the root, marked (`grouped`),
//     session of its project that runs under nothing              one press takes it back
//   a renewal                                                     keeps its place and its children (one.ts finishOrch)
//   anything weaker: a title, a folder, a branch, a topic, a time nothing
//
// Wrong is worse than absent: a move taken back by the person (any move out of a grouping the engine made) is kept per
// pair, and that pair is never grouped again; past UNDO_LIMIT of a rule's moves, judged once it has MIN_MOVES, grouping
// turns itself off for this Sol user and says so once. Every move is written with its rule and evidence.
//
//   <STATE_DIR>/group.json   { moves: [{ at, rule, root, child, undone? }], apart: [{ root, child, at }], off?: { at, why } }
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR, mark, workState } from "./state.js";
import { currentOf, isOrchestrator } from "./one.js";
import { track } from "../track.js";

export type Rule = "start" | "card" | "send" | "read";
/** the undo rate of a rule is judged once it has made this many moves: fewer is too few to tell a habit from a slip
 *  (decided on #1336, 2026-11-16) */
export const MIN_MOVES = 20;
/** past this share of a rule's moves taken back, grouping costs more presses than it saves (each move saves one drag,
 *  each wrong one costs a press and a moment of a wrong side): off. A general default, the same for every Sol user */
export const UNDO_LIMIT = 0.2;
const KEEP = 500;   // the moves kept: enough for any rule's judgement, small enough to read whole

export type Move = { at: number; rule: Rule; root: string; child: string; undone?: number };
export type GroupFile = { moves: Move[]; apart: { root: string; child: string; at: number }[]; off?: { at: number; why: string } };

export type GroupDeps = {
  /** the project a session is in (its folder's project, else its folder); undefined when it is not known */
  projectOf: (id: string) => Promise<string | undefined>;
  /** make it an orchestration session (one.ts promote); the live sessions it started before come under it with it */
  promote: (id: string) => Promise<{ promoted: boolean; adopted?: string[] }>;
  /** its block on the root's stage, and the root hears it joined (children.ts, one.ts joined) */
  placed: (child: string, root: string, rule: Rule) => Promise<void>;
  /** one line to the face (work.grouping): grouping is on or off, and why */
  tell: (m: { type: "work.grouping"; off: { at: number; why: string } | null; moves: number; undone: number }) => void;
};
let deps: GroupDeps | null = null;
export const setGroupDeps = (d: GroupDeps | null) => { deps = d; };

const FILE = () => join(STATE_DIR, "group.json");
let file: GroupFile | null = null;
export function groupFile(): GroupFile {
  if (file) return file;
  try {
    const v = JSON.parse(readFileSync(FILE(), "utf8"));
    file = { moves: Array.isArray(v.moves) ? v.moves : [], apart: Array.isArray(v.apart) ? v.apart : [], ...(v.off ? { off: v.off } : {}) };
  } catch { file = { moves: [], apart: [] }; }
  return file!;
}
function save() {
  const f = groupFile();
  f.moves = f.moves.slice(-KEEP);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(FILE() + ".tmp", JSON.stringify(f, null, 1));
  renameSync(FILE() + ".tmp", FILE());
}
export const _reload = () => { file = null; };

/** grouping is on for this Sol user (it turns itself off past the undo limit) */
export const groupingOn = () => !groupFile().off;
/** a pair the person took apart, through every renewal of the root since */
const apart = (root: string, child: string) => groupFile().apart.some((p) => p.child === child && currentOf(p.root) === currentOf(root));
function record(rule: Rule, root: string, child: string) {
  groupFile().moves.push({ at: Date.now(), rule, root, child });
  save();
  mark(child, { grouped: rule });
}

/** a session started another (a tool's start, or the person started a card it proposed): the child goes under its
 *  starter, and a starter that runs nothing yet becomes its project's root. A hand-off is not a child: it carries the
 *  work on and the one it left stops, so it is never put under that one */
export async function started(from: string, child: string, rule: "start" | "card"): Promise<boolean> {
  if (!deps || !groupingOn() || from === child || apart(from, child)) return false;
  if (workState().marks[child]?.under) return false;   // placed already (an orchestration session's own start)
  if (!isOrchestrator(from)) {
    const r = await deps.promote(from).catch(() => ({ promoted: false } as { promoted: boolean; adopted?: string[] }));
    if (!isOrchestrator(from)) return false;   // not promoted (a ticket's executor): nothing groups
    for (const k of r.adopted ?? []) if (k !== child) record("start", from, k);
  }
  mark(child, { under: from });
  record(rule, from, child);
  await deps.placed(child, from, rule).catch(() => {});
  return true;
}

/** a root sent to or read a session: one of its project that runs under nothing comes under it, marked */
export async function contacted(from: string, to: string, rule: "send" | "read"): Promise<boolean> {
  if (!deps || !groupingOn() || from === to || !isOrchestrator(from)) return false;
  const m = workState().marks;
  if (m[to]?.under || m[to]?.kind === "orchestration" || m[to]?.archived || apart(from, to)) return false;
  for (let at = m[from]?.under, i = 0; at && i <= 16; at = m[at]?.under, i++) if (at === to) return false;   // never a loop
  const [a, b] = await Promise.all([deps.projectOf(from), deps.projectOf(to)]);
  if (!a || a !== b) return false;   // only within its project
  mark(to, { under: from });
  record(rule, from, to);
  await deps.placed(to, from, rule).catch(() => {});
  return true;
}

/** a session left a grouping the engine made (the side's undo, a release, a drag elsewhere, its root demoted): the pair
 *  stays apart from now on, and the rule's undo rate is judged */
export function left(child: string, was: string | undefined): boolean {
  const how = workState().marks[child]?.grouped as Rule | undefined;
  if (!how || !was) return false;
  const f = groupFile(), now = Date.now();
  mark(child, { grouped: null });
  if (!apart(was, child)) f.apart.push({ root: was, child, at: now });
  const mv = [...f.moves].reverse().find((x) => x.child === child && currentOf(x.root) === currentOf(was) && !x.undone);
  if (mv) mv.undone = now;   // counted by the move itself (children.ts moved, how "undo")
  judge(how);
  save();
  return true;
}

/** a rule's undo rate, once it has MIN_MOVES: past UNDO_LIMIT, grouping turns off for this Sol user, said once */
function judge(rule: Rule) {
  const f = groupFile();
  if (f.off) return;
  const of = f.moves.filter((x) => x.rule === rule), undone = of.filter((x) => x.undone).length;
  if (of.length < MIN_MOVES || undone / of.length <= UNDO_LIMIT) return;
  f.off = { at: Date.now(), why: `${undone} of the last ${of.length} sessions grouped by "${rule}" were taken back (more than ${Math.round(UNDO_LIMIT * 100)}%): the side groups nothing by itself until it is turned on again` };
  track("build.group.off", { rule, moves: of.length, undone }, { mode: "work" });
  try { deps?.tell({ type: "work.grouping", ...state() }); } catch { /* not wired */ }
}

/** turned on again by the person (the switch in Build's own settings): the pairs taken apart stay apart */
export function turnOn() {
  const f = groupFile();
  if (!f.off) return false;
  delete f.off;
  f.moves = [];   // judged afresh from here
  save();
  try { deps?.tell({ type: "work.grouping", ...state() }); } catch { /* not wired */ }
  return true;
}

/** turned off by the person: nothing groups by itself; what is grouped stays where it is */
export function turnOff() {
  const f = groupFile();
  if (f.off) return false;
  f.off = { at: Date.now(), why: "turned off in Build's settings" };
  save();
  try { deps?.tell({ type: "work.grouping", ...state() }); } catch { /* not wired */ }
  return true;
}

/** what the face and the systems view read: on or off and why, the moves and how many were taken back */
export function state() {
  const f = groupFile();
  return { off: f.off ?? null, moves: f.moves.length, undone: f.moves.filter((x) => x.undone).length };
}

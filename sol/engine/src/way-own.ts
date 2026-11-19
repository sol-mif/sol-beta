// Cowork ways, step 4c (docs/cowork-ways-2026-11-10/reports/step4-plan.md §6): a person's own ways, on the kernel's own
// log (log.ts), book OWN. The same engine as a team's (way/), read and written here; nothing of Cowork v3 is loaded.
// Behind frameOn() (the log is the kernel's) and the ways' switch (way-switch.ts, SOL_COWORK_WAYS, on unless it says off): ownWaysOn().
// Nothing calls it yet but its tests.
//   which         the log's v1 events of the family `way`, in the log's order (seq): a person's own log is folded in the
//                 order it is given, one writer, so no key, no place along a chain, no `base`. A v0 line is no way event
//   by            as a team's: `by.agent` set, `agent:<person>`; else a `field` of `auto` (what this Sol did by itself,
//                 the runner's turn), `machine:<machine>@<person>`; else `person:<person>`. One that fits no `who` is
//                 dropped and named
//   value         its value; `erased` once its content is gone (the log's erase, a value file that is not there): an
//                 erased note names no way, so it stands in every way's list where it was written, as a team's
//   unread        a kind this build has no row for (a newer Sol's): dropped and named, never guessed
//   the files     the versions this Sol keeps (team/v3/way-files.ts, handed in): a version proposed here is kept here;
//                 the log has no column for a version, it is in the value (`way.proposed`'s item)
//   writing       through the kernel's door (kernel.ts append: only the kernel writes the log), each draft as the
//                 person (`{ person, machine }`, or their agent), at the time it was judged at, the runner's turn signed
//                 `field: auto`; its `because` filled with the ids before it (fold.ts written()), the log's `cause` the
//                 same id; a `way.checked` or `way.acted` names its seam's plugin as the log's `via` ({ plugin, pv, pkg })
//   versions      only those this log carries a `way.proposed` of, for that way (as a team's filesOf, grade17 F2): a
//                 file this Sol keeps from elsewhere (a team's trail, a proposal not written) is no version of an own
//                 way (grade19 F2)
//   the cache     the log only grows and an erase is an event on it: the way events read so far are kept per log, and
//                 only what came after the last seq read is read again; a `log.erase` marks every event of its content
//                 erased whose content was in a value file (only those can lose it: log.ts erase), as reading it again
//                 from the files would (grade19 F1). readOwnFresh() is the same read from nothing. Values are handed out
//                 as copies, frozen: never the log's own objects (grade19 F4)
import { isTime } from "./way/clock.js";
import { place, written } from "./way/fold.js";
import { decide, type Act, type Ask } from "./way/moves.js";
import { due, type Ping } from "./way/triggers.js";
import { load } from "./way/load.js";
import { FORMAT, LOGIN, OWN, WHO, isObj, type Answers, type Draft, type Loaded, type Way, type WayEvent } from "./way/types.js";
import { kindRow, placeOf } from "./contract/kinds.js";
import { frameOn } from "./settings.js";
import { waysOn } from "./way-switch.js";
import { owed, sent, slotsOf, type Wrote } from "./way-written.js";
import type { By } from "./file-trail.js";
import type { More } from "./kernel.js";
import { HOME, type AnyEv, type LogEv, type LogPort, type Via } from "./log.js";

/** the field the runner's turn writes with on the log */
export const AUTO = "auto";
/** whether a person's own ways run: the frame (the kernel's log) and the ways' switch both on */
export const ownWaysOn = (): boolean => waysOn() && frameOn();

/** the way files this Sol keeps (team/v3/way-files.ts WayFiles, handed in) */
export type OwnFiles = { get(ver: string): Way | undefined; loaded(ver: string): Loaded | undefined; keep(files: readonly { ver: string; file: unknown }[]): string[] };
/** the kernel's door to its log (kernel.ts append) */
export type OwnDoor = { append(kind: string, item: string | undefined, value: unknown, by: By, more: More): LogEv };
/** this Sol as the own ways need it: the kernel's door and its log to read, the way files, this machine's name */
export type OwnSol = { door: OwnDoor; log: Pick<LogPort, "since">; files: OwnFiles; machine: string };
/** a person's own log read for the way engine: each way's events in the log's order, and what was dropped */
export type OwnRead = { ways: Map<string, WayEvent[]>; dropped: { id: string; why: string }[] };

const familyOf = (kind: string): string => { const dot = kind.indexOf("."); return dot < 0 ? kind : kind.slice(0, dot); };

/** who wrote an event of the log, in a role's `who` form, or null (pure) */
export function ownWho(e: Pick<LogEv, "by" | "field">): string | null {
  if (!isObj(e.by) || typeof e.by.person !== "string") return null;   // a line that names no writer (grade19 F3)
  const { person, machine, agent } = e.by;
  const who = agent ? `agent:${person}` : e.field === AUTO ? (machine !== undefined ? `machine:${machine}@${person}` : null) : `person:${person}`;
  return who !== null && WHO.test(who) ? who : null;
}

/** an event of the log as the engine reads it, or why it is dropped (pure). `erased`: its content is gone */
export function ownEvent(e: LogEv, erased = e.erased === true): WayEvent | { why: string } {
  if (!kindRow(e.kind)) return { why: "unread" };
  if (!isTime(e.at)) return { why: "no_time" };
  const by = ownWho(e);
  if (by === null) return { why: "no_writer" };
  const out: WayEvent = { kind: e.kind, at: e.at, id: e.id, by };
  if (e.item !== undefined) out.item = e.item;
  if (erased) out.erased = true;
  else if (isObj(e.value)) out.value = deep(structuredClone(e.value));
  return out;
}
/** a value frozen through (pure but for that) */
const deep = <T>(x: T): T => { if (x && typeof x === "object" && !Object.isFrozen(x)) { for (const v of Object.values(x)) deep(v); Object.freeze(x); } return x; };

type Row = { e: WayEvent; hash: string; filed: boolean };
type Kept = { last: number; rows: Row[]; dropped: OwnRead["dropped"] };
let kept = new WeakMap<object, Kept>();
/** the way events of every log event after `from` taken into `k` (reads the log, a page at a time) */
function take(log: OwnSol["log"], k: Kept): void {
  for (;;) {
    const page = log.since(HOME, k.last);
    if (!page.length) return;
    for (const x of page) {
      one(k, x);
      k.last = Math.max(k.last, x.seq);   // after it is taken: a line that throws is read again, as from nothing
    }
  }
}
/** one log event taken into `k` */
function one(k: Kept, x: AnyEv): void {
  if (x.v !== 1) return;
  if (x.kind === "log.erase") {
    const hash = isObj(x.value) && typeof x.value.hash === "string" ? x.value.hash : "";
    if (hash) for (const r of k.rows) if (r.hash === hash && r.filed && !r.e.erased) { const { value: _v, ...rest } = r.e; r.e = { ...rest, erased: true }; }
    return;
  }
  if (familyOf(x.kind) !== "way") return;
  const w = ownEvent(x);
  if ("why" in w) k.dropped.push({ id: x.id, why: w.why });
  else k.rows.push({ e: w, hash: x.hash, filed: x.value !== undefined && placeOf(x.kind, x.value) === "file" });
}
/** the rows as each way's list: an erased event (it names no way) in every way's, where it was written */
function lists(k: Kept): OwnRead {
  const ways = new Map<string, WayEvent[]>();
  for (const { e } of k.rows) { const id = !e.erased && typeof e.value?.way === "string" ? e.value.way : ""; if (id && !ways.has(id)) ways.set(id, []); }
  for (const { e } of k.rows) {
    const id = !e.erased && typeof e.value?.way === "string" ? e.value.way : "";
    if (id) ways.get(id)!.push(e);
    else if (e.erased) for (const l of ways.values()) l.push(e);
  }
  for (const l of ways.values()) { for (const e of l) Object.freeze(e); Object.freeze(l); }
  return { ways, dropped: Object.freeze([...k.dropped]) as OwnRead["dropped"] };
}
/** a person's own log read for the way engine, from what was read of it before (reads the log). What it hands back
 *  is frozen: the next read shares the events */
export function readOwn(log: OwnSol["log"]): OwnRead {
  let k = kept.get(log);
  if (!k) kept.set(log, (k = { last: 0, rows: [], dropped: [] }));
  take(log, k);
  return lists(k);
}
/** the same read from nothing: every page of the log read again (reads the log) */
export function readOwnFresh(log: OwnSol["log"]): OwnRead {
  const k: Kept = { last: 0, rows: [], dropped: [] };
  take(log, k);
  return lists(k);
}
/** the cache emptied (tests) */
export function forgetOwn(): void { kept = new WeakMap(); }

/** a seam's plugin as the log's `via`, for a way.checked or way.acted of a way (pure) */
const viaOf = (way: Way | undefined, d: Draft): Via | undefined => {
  if (d.kind !== "way.checked" && d.kind !== "way.acted") return undefined;
  const s = way && typeof d.value.seam === "string" && Object.hasOwn(way.seams, d.value.seam) ? way.seams[d.value.seam] : undefined;
  return s ? { plugin: s.plugin, pv: s.pv, pkg: s.pkg } : undefined;
};
/** drafts appended to the log through the kernel's door in order, as one writer, each at its time, with the ids of
 *  the ones before it filled in and its `cause` the id its `because` names; stops at the first the log refuses */
export function writeOwn(door: OwnDoor, by: By, drafts: readonly Draft[], way?: Way, field?: string): Wrote {
  const ids: string[] = [], out: Wrote["written"] = [];
  for (const d of drafts) {
    try {
      const via = viaOf(way, d);
      const e = door.append(d.kind, d.item, written(d, ids), by, { at: d.at, ...(field ? { field } : {}), ...(d.cause !== undefined && ids[d.cause] ? { cause: ids[d.cause] } : {}), ...(via ? { via } : {}) });
      ids.push(e.id); out.push({ id: e.id, kind: d.kind, item: d.item });
    } catch (err) {
      return { written: out, whole: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { written: out, whole: true };
}

/** the way files of the versions this log carries a `way.proposed` of for a way: no other is a version of it here */
export function ownFiles(s: Pick<OwnSol, "files">, events: readonly WayEvent[] | undefined): (ver: string) => Way | undefined {
  const on = new Set((events ?? []).flatMap((e) => (e.kind === "way.proposed" && typeof e.item === "string" ? [e.item] : [])));
  return (ver) => (on.has(ver) ? s.files.get(ver) : undefined);
}

/** a press on a person's own log: allowed or not and why (decide()'s, or `not_in_project` for a login that is none,
 *  `not_applied`, `no_file`, `no_time`), when, what was written, the acts owed */
export type OwnPressed = Wrote & { ok: boolean; why: string; at?: number; acts: (Act & { because: string })[] };
/** a person's press on a thing of one of their own ways, judged on their log and written to it */
export function ownPress(s: OwnSol, way: string, who: { person: string; agent?: string }, ask: Omit<Ask, "asker">, clock: () => number, answers: Answers = {}): OwnPressed {
  const no = (why: string, at?: number): OwnPressed => ({ ok: false, why, ...(at !== undefined ? { at } : {}), written: [], whole: true, acts: [] });
  if (!LOGIN.test(who.person)) return no("not_in_project");
  const now = Math.floor(clock());
  if (!isTime(now)) return no("no_time");
  const events = readOwn(s.log).ways.get(way) ?? [], get = ownFiles(s, events);
  const p = place(way, events, get, OWN, { now }).p;
  if (!p.ver) return no("not_applied", now);
  const l = get(p.ver) ? s.files.loaded(p.ver) : undefined;
  if (!l?.way) return no("no_file", now);
  const d = decide(l, p, { ...ask, asker: `${who.agent ? "agent" : "person"}:${who.person}` }, now, answers);
  const by = who.agent ? { person: who.person, agent: who.agent } : { person: who.person, machine: s.machine };
  const w = writeOwn(s.door, by, d.drafts, l.way);
  return { ok: d.ok, why: d.why, at: now, ...w, acts: owed(d.acts, d.drafts, w) };
}

/** a person's change of one of their own ways (FORMAT §3): a proposal (the file kept here, then `way.proposed`), an
 *  agreement, an apply, a revert */
export type OwnVersionAsk =
  | { kind: "propose"; file: unknown; map?: string[] }
  | { kind: "agree"; to: string; role: string }
  | { kind: "apply"; to: string }
  | { kind: "revert"; to: string };
/** a change's answer: written or not and why (`not_in_project`, `no_time`, `way_unread`, `other_way`, `same_version`,
 *  `no_file`, or the fold's, for an event it would set aside: `not_agreed`, `not_allowed`, `wrong_from`, ...), when,
 *  the version it names, what was written */
export type OwnVersioned = Wrote & { ok: boolean; why: string; at?: number; ver?: string };
/** a person's own change of one of their own ways, judged and written: its event folded first, at the end of the log
 *  as it will stand, and one the fold would set aside is not written (its reason is the answer). A person's own press
 *  only: no agent changes a way */
export function ownVersion(s: OwnSol, way: string, person: string, ask: OwnVersionAsk, clock: () => number): OwnVersioned {
  const no = (why: string, at?: number): OwnVersioned => ({ ok: false, why, ...(at !== undefined ? { at } : {}), written: [], whole: true });
  if (!LOGIN.test(person)) return no("not_in_project");
  const now = Math.floor(clock());
  if (!isTime(now)) return no("no_time");
  const events = readOwn(s.log).ways.get(way) ?? [], files = ownFiles(s, events);
  const p = place(way, events, files, OWN, { now }).p;
  let ver: string, d: Draft, file: { ver: string; file: unknown } | undefined;
  if (ask.kind === "propose") {
    const l = load(ask.file);
    if (!l.way || l.problems.length) return no("way_unread", now);
    if (l.way.id !== way) return no("other_way", now);
    if (l.ver === p.ver) return no("same_version", now);
    ver = l.ver;
    file = { ver, file: ask.file };
    d = { kind: "way.proposed", item: ver, value: { way, from: p.ver, slots: slotsOf(p.ver ? files(p.ver) : undefined, l.way), ...(ask.map?.length ? { map: [...ask.map] } : {}) }, at: now };
  } else {
    ver = ask.to;
    if (!files(ver)) return no("no_file", now);
    const value = ask.kind === "agree" ? { way, to: ver, role: ask.role }
      : ask.kind === "apply" ? { way, from: p.ver, to: ver, reader: FORMAT } : { way, from: p.ver, to: ver };
    d = { kind: `way.${ask.kind === "agree" ? "agreed" : ask.kind === "apply" ? "applied" : "reverted"}`, item: ver, value, at: now };
  }
  if (d.kind !== "way.proposed") {
    const cand: WayEvent = { kind: d.kind, at: now, id: "local:asked", by: `person:${person}`, item: d.item, value: d.value };
    const again = place(way, [...events, cand], files, OWN, { now });
    if (!again.seq.find((x) => x.e === cand)?.taken) return no(again.p.skipped.find((x) => x.id === cand.id)?.why ?? "not_taken", now);
  }
  const w = writeOwn(s.door, { person, machine: s.machine }, [d]);
  if (file && w.whole) s.files.keep([file]);   // kept once the log names it (grade19 F2)
  return { ok: w.whole, why: w.whole ? "" : "not_written_whole", at: now, ver, ...w };
}

/** one of a person's own ways' turn: written or not and why (`no_file`, `no_time`), when, what, the acts owed, the
 *  pings to send */
export type OwnTurned = Wrote & { way: string; ok: boolean; why?: string; at?: number; acts: (Act & { because: string })[]; pings: Ping[] };
/** the turn of every own way whose version in force names this Sol (`<machine>@<login>`) as its runner (reads and
 *  writes the log): what is due now, written `field: auto`. Each way is judged on the log as it is after the one
 *  before it was written */
export function ownTurns(s: OwnSol, login: string, clock: () => number): OwnTurned[] {
  if (!LOGIN.test(login)) return [];
  const runner = `${s.machine}@${login}`, by = { person: login, machine: s.machine }, out: OwnTurned[] = [];
  let r = readOwn(s.log);
  for (const way of [...r.ways.keys()].sort()) {
    const now = Math.floor(clock());
    const no = (why: string): OwnTurned => ({ way, ok: false, why, written: [], whole: true, acts: [], pings: [] });
    if (!isTime(now)) { out.push(no("no_time")); continue; }
    const events = r.ways.get(way) ?? [], get = ownFiles(s, events);
    const p = place(way, events, get, OWN, { now }).p;
    const l = p.ver && get(p.ver) ? s.files.loaded(p.ver) : undefined;
    if (!p.ver || l?.way?.runner !== runner) continue;   // not this Sol's to run
    const d = due(l, p, now, runner);
    if (!d.drafts.length) { out.push({ ...no(""), ok: true, why: undefined, at: now, pings: [] }); continue; }
    const w = writeOwn(s.door, by, d.drafts, l.way, AUTO);
    out.push({ way, ok: true, at: now, ...w, acts: owed(d.acts, d.drafts, w), pings: sent(d.pings, d.drafts, w) });
    if (w.written.length) r = readOwn(s.log);
  }
  return out;
}
export type { AnyEv };

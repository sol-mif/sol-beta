// Cowork ways, step 4b part 3 (docs/cowork-ways-2026-11-10/reports/step4-plan.md §5; FORMAT §10, the writing end):
// what this Sol writes to a project's team trail for the way engine, a person's press and the runner's turn, and the
// runner's loop. Time comes in as a clock handed in, never read here. Reads through way-reader.ts (every row of the
// project, checked there) and way-files.ts; writes through the door (door.ts append: this machine's key, or an agent's).
// Loaded only behind the ways' switch (way-switch.ts, SOL_COWORK_WAYS, on unless set off): nothing imports it yet but its tests.
//   the time        what is written is dated `max(clock, the signing key's last event in the project + 1 ms)`, and that
//                   is the `now` the engine judges at: the trail signs an earlier time as the chain's last (trail.ts
//                   append), so a judgement at the clock's time would be folded again at another. Two writes of one key
//                   never say one time either: a press on the runner's own Sol never stands at the millisecond of a
//                   turn (step4-engine.md 9.21, "What stays"). A key whose last event is more than SKEW past the clock
//                   writes nothing (`clock_ahead`): each later event of it would wait in every fold
//                   A press is never dated before the last event this Sol holds of the way's runner: dated before it, it
//                   would be judged at that event's time by every fold (spine.ts, the open tail), not at its own
//                   (grade16 F4); one more than SKEW past the press's time refuses it (`runner_ahead`)
//   a press         the person's standing in the team at the press's time first (way-reader.ts roleOf): a guest, or
//                   someone not in the project, is told so and nothing is written (every fold would set it aside,
//                   9.23). Then decide() on what this Sol folds now, and its drafts, a refusal's too. A login spelled
//                   otherwise than the signing key's certificate says is refused (`login_case`): it would sign an event
//                   every Sol refuses
//   the runner      a way whose version names `<this machine>@<login>` as runner: turn(), due(), sealedDue(), and what
//                   that gives in its order (pages, then the turn), signed field `auto` (the reader's AUTO: read as
//                   `machine:<machine>@<login>`), all at once, no other event of the key between them. Nothing when
//                   another key signing as this runner in the way has named an event of this key in its `base` (`twin`,
//                   FORMAT §10: both would write spine events): it signed after this key wrote, so it runs beside it.
//                   A key that only wrote before (this machine re-keyed, a key retired for a clock that ran ahead, even
//                   one whose events are dated later) never named this key's events, and does not stop it (grade16 F1)
//   writing         every draft is held against the trail's limits (kind, item, shape, 64 KB, the reader's door) before
//                   the first is appended, each with the ids of the ones before it filled in (fold.ts written()); what
//                   is left is a disk that fails, and then the answer names what was written and says not whole. A turn
//                   cut short is made up by the next (due() reads the book), but for its one cut the plan names (after a
//                   way.fired, before the move that answers it)
//   acts, pings     handed back, not run here: an act stays owed until a seam's plugin answers it (§5, the third
//                   bullet), a ping is delivered by the messages (step 4). Those of what was written are handed back
//                   also when the rest was not: a firing or a move written is folded everywhere and not made again
//   one project     read and written under one id, the door's (project-id.ts projectFor): a room id or a project id
import { isTime } from "../../way/clock.js";
import { place, sealedDue, turn, written, type Placed } from "../../way/fold.js";
import { noticeOf, type Notice } from "../../way/notice.js";
import { decide, type Act, type Ask } from "../../way/moves.js";
import { due, type Ping } from "../../way/triggers.js";
import { load } from "../../way/load.js";
import { FORMAT, SKEW, isObj, type Answers, type Draft, type Way, type WayEvent } from "../../way/types.js";
import { door } from "./door.js";
import { LOGIN, type Keys } from "./keys.js";
import { projectFor } from "./project-id.js";
import { VALUE_MAX, canonical, type Draft as TrailDraft, type Trail, type TrailEvent } from "./trail.js";
import { kindError } from "./trail-kinds.js";
import type { WayFiles } from "./way-files.js";
import { AUTO, WAYFILE, readCached, refused, type WayRead } from "./way-reader.js";
import { teamWaysOn } from "./way-switch.js";
import { owed, sent, slotsOf, type Wrote } from "../../way-written.js";
export { slotsOf, type Wrote } from "../../way-written.js";

/** this Sol as the writer needs it: its trail and keys, the way files it keeps, and the door it appends through
 *  (default: door.ts over this trail and keys) */
export type WaySol = { trail: Trail; keys: Keys; files: WayFiles; append?: (d: TrailDraft) => TrailEvent };
/** a press's answer: allowed or not and why (decide()'s, or this writer's: `guest`, `not_in_project`, `login_case`,
 *  `not_applied`, `no_file`, `no_time`, `clock_ahead`, `runner_ahead`, `not_trail`), the time it was judged and written at, what was written, and the
 *  acts it owes: those whose draft was written, each with that event's id */
export type Pressed = Wrote & { ok: boolean; why: string; at?: number; acts: (Act & { because: string })[] };
/** one way's turn: written or not and why (the engine's turn: `not_runner`, `forked`, `waiting`, ...; or this
 *  writer's: `twin`, `no_time`, `clock_ahead`, `no_file`, `not_trail`), when, what, the acts it owes, the pings to send */
export type Turned = Wrote & { way: string; ok: boolean; why?: string; at?: number; acts: (Act & { because: string })[]; pings: Ping[] };

// the trail's own name rules for a kind and an item (trail.ts KIND, ID), and an event id
const KIND = /^[a-z][a-z0-9.-]{0,39}$/, ID = /^[\w.:-]{1,120}$/, HEX = /^[0-9a-f]{64}$/;
/** an id as long as any the trail gives, standing in for those not written yet */
const STAND_IN = "0".repeat(64);

/** why these drafts would not all be taken by the trail and read by the door, or "" (pure): each with the ids of the
 *  ones before it standing in, at their length (a time that is no time: the door's refused()) */
export function unfit(drafts: readonly Draft[]): string {
  const ids = drafts.map(() => STAND_IN);
  for (const [i, d] of drafts.entries()) {
    const value = written(d, ids);
    const why = !KIND.test(d.kind) ? "kind" : !ID.test(d.item) ? "item"
      : d.base && !d.base.every((x) => HEX.test(x)) ? "base"
      : Buffer.byteLength(canonical(value)) > VALUE_MAX ? "too_big"
      : kindError(d.kind, value, false, true) || refused({ at: d.at, base: d.base, value });
    if (why) return `${i} ${d.kind}: ${why}`;
  }
  return "";
}

/** drafts appended in order through the door, as one writer, each with the ids of the ones before it filled in; stops
 *  at the first the trail refuses (a disk that fails: unfit() was asked first) */
export function writeAll(append: (d: TrailDraft) => TrailEvent, project: string, by: TrailDraft["by"], drafts: readonly Draft[], field?: string): Wrote {
  const ids: string[] = [], out: Wrote["written"] = [];
  for (const d of drafts) {
    try {
      const e = append({ project, by, kind: d.kind, item: d.item, value: written(d, ids), at: d.at, ...(d.base?.length ? { base: [...d.base] } : {}), ...(field ? { field } : {}) });
      ids.push(e.id); out.push({ id: e.id, kind: d.kind, item: d.item });
    } catch (err) {
      return { written: out, whole: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { written: out, whole: true };
}

/** the time a key writes at (pure): the clock in whole ms, or its last event in the project + 1 ms when that is later;
 *  none when the clock is no time, or the key's last event is more than SKEW past it */
export function timeFor(rows: readonly Pick<TrailEvent, "key" | "at">[], key: string, clock: number): number | { why: string } {
  if (!isTime(clock)) return { why: "no_time" };
  clock = Math.floor(clock);   // the trail signs whole ms
  let last = -Infinity;
  for (const e of rows) if (e.key === key && e.at > last) last = e.at;
  if (last > clock + SKEW) return { why: "clock_ahead" };
  const now = Math.max(clock, last + 1);
  return isTime(now) ? now : { why: "no_time" };
}

const appendOf = (s: WaySol) => s.append ?? door({ trail: s.trail, keys: s.keys }).append;
/** whether a login is spelled as the key that signs for it says (keys.ts finds a person's keys in any case, and its
 *  certificate names the person as first asked): another case would sign an event every Sol refuses (grade16 F6) */
const spelled = (signer: { person: string; cert?: { person: string } }, login: string): boolean => (signer.cert?.person ?? signer.person) === login;

/** the way files a project's own trail carries, as this Sol holds them (way-files.ts keeps them for every project): a
 *  version only another project's trail carries is not this project's, so no Sol that holds this project alone could
 *  fold it (grade17 F2) */
export function filesOf(s: WaySol, r: Pick<WayRead, "files">): (ver: string) => ReturnType<WaySol["files"]["get"]> {
  const on = new Set(r.files.map((f) => f.ver));
  return (ver) => (on.has(ver) ? s.files.get(ver) : undefined);
}
/** whether the project's role book spells this login in another case: a key's certificate takes its case from the
 *  first ask in the process, so after a restart a login asked in another case would sign as that case, and every Sol
 *  would read a person the way's roles do not name (grade17 F3). Only the role events that counted are asked (an owner's
 *  word): a row anyone can write, a guest's member event naming "Marco", locks nobody out (its security note) */
export const otherCase = (r: Pick<WayRead, "nameOf">, login: string): boolean => { const n = r.nameOf(login); return n !== undefined && n !== login; };

/** a person's press on a thing of a way in a team's project, judged and written (reads and writes the trail). `who`:
 *  the person, and their agent when an agent presses (it signs with its own key). `answers`: a seam's answers, when a
 *  rule asks one (none yet: such a rule is not read, `rule_unread`) */
/** what a press writes (`o.write`): `all` (default) its drafts, a refusal's too; `ok` only when allowed, a refusal is
 *  answered and nothing written (an agent's press, #1281: a refusal on the trail is permanent and reaches everyone);
 *  `none` nothing, the judgement only (a trial). Each judged at the time it would be written at */
export type PressWrite = "all" | "ok" | "none";
export function press(s: WaySol, project: string, way: string, who: { person: string; agent?: string }, ask: Omit<Ask, "asker">, clock: () => number, answers: Answers = {}, o: { write?: PressWrite } = {}): Pressed {
  const no = (why: string, at?: number): Pressed => ({ ok: false, why, ...(at !== undefined ? { at } : {}), written: [], whole: true, acts: [] });
  if (!LOGIN.test(who.person)) return no("not_in_project");
  const person = who.person, id = projectFor(project);
  const by = who.agent ? { person, agent: who.agent } : { person, machine: s.keys.machineName };
  const signer = s.keys.signerFor(by);
  if (!spelled(signer, person)) return no("login_case");
  const { rows, r } = readCached(s.trail, id);
  if (otherCase(r, person)) return no("login_case");
  s.files.keep(r.files);
  const events = r.ways.get(way) ?? [], files = filesOf(s, r);
  let now = timeFor(rows, signer.pub, clock());
  if (typeof now !== "number") return no(now.why);
  const placed = place(way, events, files, r.book, { now });
  // never before the way's last runner event here (the spine's, placed.last): a press dated before it is judged at its
  // time by every fold, so it is written and judged at that time + 1 ms. One more than SKEW past this Sol's time is a
  // time this Sol cannot vouch for: nothing is written (`runner_ahead`). (The projection is not folded again at the
  // later time: what that adds is dated after the press, and a refusal it causes is judged again where it stands)
  if (placed.last !== undefined && placed.last > now + SKEW) return no("runner_ahead", now);
  if (placed.last !== undefined && placed.last >= now) now = placed.last + 1;
  // the team first: a guest's press, or a stranger's, is set aside by every fold; it is not written
  const standing = r.book.roleOf(person, now);
  if (standing === null) return no("not_in_project", now);
  if (standing === "guest") return no("guest", now);
  const p = placed.p;
  if (!p.ver) return no("not_applied", now);
  const l = files(p.ver) ? s.files.loaded(p.ver) : undefined;
  if (!l) return no("no_file", now);
  const d = decide(l, p, { ...ask, asker: `${who.agent ? "agent" : "person"}:${person}` }, now, answers);
  const bad = unfit(d.drafts);
  if (bad) return { ...no("not_trail", now), error: bad };
  const write = o.write ?? "all";
  // a trial says the acts the move would owe (no event written yet: `because` empty), so a card can name them
  if (write === "none") return { ok: d.ok, why: d.why, at: now, written: [], whole: true, acts: d.acts.map((a) => ({ ...a, because: "" })) };
  if (write === "ok" && !d.ok) return { ok: d.ok, why: d.why, at: now, written: [], whole: true, acts: [] };
  const w = writeAll(appendOf(s), id, by, d.drafts);
  return { ok: d.ok, why: d.why, at: now, ...w, acts: owed(d.acts, d.drafts, w) };
}

/** a person's change of a way (FORMAT §3): a proposal (the file, then `way.proposed`), an agreement to a version, an
 *  apply of one, a revert to one. `map`: a proposal's "old>new" for states the new version takes away */
export type VersionAsk =
  | { kind: "propose"; file: unknown; map?: string[] }
  | { kind: "agree"; to: string; role: string }
  | { kind: "apply"; to: string }
  | { kind: "revert"; to: string };
/** a change's answer: written whole or not and why (this writer's: `guest`, `not_in_project`, `login_case`, `no_time`,
 *  `clock_ahead`, `runner_ahead`, `head_ahead`, `way_unread`, `other_way`, `same_version`, `no_file`, `not_trail`,
 *  `waiting`; or the fold's, for an event every fold would set aside: `not_agreed`, `not_allowed`, `stale_agreement`,
 *  `wrong_from`, `not_starter`, `not_member`, `unpinned`, ...), the time it was judged and written at, the version it
 *  names, what was written */
export type Versioned = Wrote & { ok: boolean; why: string; at?: number; ver?: string };


/** a person's change of a way in a team's project, judged and written (reads and writes the trail). A person's own
 *  press only (FORMAT §3: an agreement, a first apply, an apply or revert that touches a role are a person's own;
 *  this writer takes none from an agent). Dated as a press is (after its key's last event and the way's last runner
 *  event), an agreement also after the apply or revert it is given on (FORMAT §10, "the clock, for an agreement"), and
 *  signed with that one as its `base`. Its event is folded first, as every fold will, on the book this Sol holds: one
 *  every fold would set aside is not written, and its reason is the answer */
export function version(s: WaySol, project: string, way: string, person: string, ask: VersionAsk, clock: () => number): Versioned {
  const no = (why: string, at?: number): Versioned => ({ ok: false, why, ...(at !== undefined ? { at } : {}), written: [], whole: true });
  if (!LOGIN.test(person)) return no("not_in_project");
  const id = projectFor(project), by = { person, machine: s.keys.machineName };
  const signer = s.keys.signerFor(by);
  if (!spelled(signer, person)) return no("login_case");
  const { rows, r } = readCached(s.trail, id);
  if (otherCase(r, person)) return no("login_case");
  s.files.keep(r.files);
  const events = r.ways.get(way) ?? [], files = filesOf(s, r);
  const t = timeFor(rows, signer.pub, clock());
  if (typeof t !== "number") return no(t.why);
  let now = t;
  let placed = place(way, events, files, r.book, { now });
  // not before the way's last runner event; an agreement not before what it is given on either
  const head = ask.kind === "agree" && placed.p.head ? events.find((e) => e.id === placed.p.head)?.at : undefined;
  for (const [floor, why] of [[placed.last, "runner_ahead"], [head, "head_ahead"]] as const) {
    if (floor === undefined) continue;
    if (floor > t + SKEW) return no(why, t);
    if (floor >= now) now = floor + 1;
  }
  // moved later: what is drafted (from, base, slots) is read at the time it is written (grade17, suspected)
  if (now !== t) placed = place(way, events, files, r.book, { now });
  const p = placed.p;
  const standing = r.book.roleOf(person, now);
  if (standing === null) return no("not_in_project", now);
  if (standing === "guest") return no("guest", now);
  const drafts: Draft[] = [];
  let ver: string;
  if (ask.kind === "propose") {
    const l = load(ask.file);
    if (!l.way || l.problems.length) return no("way_unread", now);
    if (l.way.id !== way) return no("other_way", now);
    if (l.ver === p.ver) return no("same_version", now);
    ver = l.ver;
    if (!r.files.some((f) => f.ver === ver)) drafts.push({ kind: WAYFILE, item: ver, value: ask.file as Record<string, unknown>, at: now });
    const value = { way, from: p.ver, slots: slotsOf(p.ver ? files(p.ver) : undefined, l.way), ...(ask.map?.length ? { map: [...ask.map] } : {}) };
    drafts.push({ kind: "way.proposed", item: ver, value, at: now });
  } else {
    ver = ask.to;
    if (!files(ver)) return no("no_file", now);
    const value = ask.kind === "agree" ? { way, to: ver, role: ask.role }
      : ask.kind === "apply" ? { way, from: p.ver, to: ver, reader: FORMAT } : { way, from: p.ver, to: ver };
    drafts.push({ kind: `way.${ask.kind === "agree" ? "agreed" : ask.kind === "apply" ? "applied" : "reverted"}`, item: ver, value, at: now,
      ...(ask.kind === "agree" && p.head ? { base: [p.head] } : {}) });
  }
  // the way event folded as every fold will fold it, at its place on this key's chain
  const tip = r.tips.get(signer.pub), i = drafts.length - 1, d = drafts[i];
  const cand: WayEvent = { kind: d.kind, at: now, id: "local:asked", by: `person:${person}`, key: signer.pub, n: (tip?.n ?? -1) + 1 + i,
    ...(i > 0 ? { after: now } : tip ? { after: tip.at } : {}), item: d.item, value: d.value, ...(d.base ? { base: [...d.base] } : {}) };
  const again = place(way, [...events, cand], files, r.book, { now });
  const seat = again.seq.find((x) => x.e === cand);
  if (!seat) return no("waiting", now);
  if (!seat.taken) return no(again.p.skipped.find((x) => x.id === cand.id)?.why ?? "not_taken", now);
  const bad = unfit(drafts);
  if (bad) return { ...no("not_trail", now), error: bad };
  const w = writeAll(appendOf(s), id, by, drafts);
  return { ok: w.whole, why: w.whole ? "" : "not_written_whole", at: now, ver, ...w };
}

/** the runner's turn in every way of a project that names this Sol (`<machine>@<person>`) as runner (reads and writes
 *  the trail). Each way's turn is judged on the trail as it is after the one before it was written, at a time after
 *  that one's */
export function runTurns(s: WaySol, project: string, login: string, clock: () => number): Turned[] {
  if (!LOGIN.test(login)) return [];
  const id = projectFor(project);
  // a project that carries no way file has no way to run: not read (every row checked) once a minute for nothing
  if (!s.trail.raw.prepare("SELECT 1 FROM event WHERE project = ? AND kind = ? LIMIT 1").get(id, WAYFILE)) return [];
  const person = login, signer = s.keys.machineKey(person);
  if (!spelled(signer, person)) return [];
  const me = { runner: `${s.keys.machineName}@${person}`, key: signer.pub };
  const by = { person, machine: s.keys.machineName }, append = appendOf(s);
  let { rows, r } = readCached(s.trail, id);
  if (otherCase(r, person)) return [];
  s.files.keep(r.files);
  const out: Turned[] = [];
  for (const way of [...r.ways.keys()].sort()) {
    // a way no version of which this trail carries names this Sol is not folded here
    const files = filesOf(s, r);
    if (!r.files.some((f) => { const w = files(f.ver); return w?.id === way && w.runner === me.runner; })) continue;
    const no = (why: string, at?: number): Turned => ({ way, ok: false, why, ...(at !== undefined ? { at } : {}), written: [], whole: true, acts: [], pings: [] });
    const now = timeFor(rows, me.key, clock());
    if (typeof now !== "number") { out.push(no(now.why)); continue; }
    const events = r.ways.get(way)!, mine = new Set(rows.filter((e) => e.key === me.key).map((e) => e.id));
    if (events.some((e) => e.by === `machine:${me.runner}` && e.key !== undefined && e.key !== me.key && e.base?.some((x) => mine.has(x)))) { out.push(no("twin", now)); continue; }
    const t = turn(way, events, files, r.book, me, now);
    if (!t.ok) { out.push(no(t.why ?? "not_runner", now)); continue; }
    const l = files(t.ver) ? s.files.loaded(t.ver) : undefined;
    if (!l?.way) { out.push(no("no_file", now)); continue; }
    const d = due(l, t.p, now, me.runner);
    const sd = sealedDue(t, d, l.way, now);
    const bad = unfit(sd.drafts);
    if (bad) { out.push({ ...no("not_trail", now), error: bad }); continue; }
    const w = writeAll(append, id, by, sd.drafts, AUTO);
    out.push({ way, ok: true, at: now, ...w, acts: owed(sd.acts, sd.drafts, w), pings: sent(d.pings, sd.drafts, w) });
    if (w.written.length) ({ rows, r } = readCached(s.trail, id));
  }
  return out;
}

/** a change of version as a read and the faces are told it: the event, when, by whom, whether the runner has ordered
 *  it (`ordered`: one in the open tail may still be set aside), and its notice */
export type Change = Notice & { id: string; kind: string; at: number; by?: string; ordered: boolean };
/** the changes of version a way's fold took, in its order, each as everyone of the way is told it (pure): every taken
 *  way.applied and way.reverted with its notice from the version before it (way/notice.ts) */
export function changesOf(placed: Pick<Placed, "seq">, get: (ver: string) => Way | undefined): Change[] {
  const out: Change[] = [];
  for (const x of placed.seq) {
    const e = x.e, v = e.value;
    if (!x.taken || (e.kind !== "way.applied" && e.kind !== "way.reverted") || !isObj(v) || typeof v.to !== "string") continue;
    const from = typeof v.from === "string" ? v.from : "", b = get(v.to);
    if (!b) continue;
    out.push({ id: e.id ?? "", kind: e.kind, at: x.at, ...(e.by ? { by: e.by } : {}), ordered: x.as !== "tail", ...noticeOf(from ? get(from) : undefined, b, from, v.to) });
  }
  return out;
}

/** this person's own presses on this machine (`way.made`, `way.move` signed `person:<login>` by this machine's key) a
 *  way's fold set aside as written under an old version (FORMAT §5's last rule: an offline Sol comes back with a press
 *  of the version before), each answered once by a `way.refused` (`old_version`, `because` its id) on the version in
 *  force, so its screen asks them to press again (reads and writes the trail). Only an event the runner has ordered:
 *  one in the open tail is judged again when the runner sees it, and may stand then. Not the runner's own events, nor
 *  a press's checks (grade20 F4). An event of this person's agent is its own Sol's to answer. A cost (grade20 F1): a
 *  late candidate of the version before's runner can still reorder an ordered press under its own version; then the
 *  press stands and so does its refusal (the fold takes an `old_version` refusal as it is: FORMAT §5's table) */
export function refuseOld(s: WaySol, project: string, login: string, clock: () => number): (Wrote & { way: string; refused: string[] })[] {
  if (!LOGIN.test(login)) return [];
  const id = projectFor(project);
  if (!s.trail.raw.prepare("SELECT 1 FROM event WHERE project = ? AND kind = ? LIMIT 1").get(id, WAYFILE)) return [];
  const by = { person: login, machine: s.keys.machineName }, signer = s.keys.signerFor(by);
  if (!spelled(signer, login)) return [];
  let { rows, r } = readCached(s.trail, id);
  if (otherCase(r, login)) return [];
  s.files.keep(r.files);
  const out: (Wrote & { way: string; refused: string[] })[] = [];
  for (const way of [...r.ways.keys()].sort()) {
    const events = r.ways.get(way)!, files = filesOf(s, r);
    const now = timeFor(rows, signer.pub, clock());
    if (typeof now !== "number" || r.book.roleOf(login, now) === null) continue;
    const placed = place(way, events, files, r.book, { now }), p = placed.p;
    if (!p.ver) continue;
    const answered = new Set(events.flatMap((e) => (e.kind === "way.refused" && typeof e.value?.because === "string" ? [e.value.because] : [])));
    const seat = new Map(placed.seq.map((x) => [x.e.id, x]));
    const drafts: Draft[] = [];
    for (const x of p.skipped) {
      if (x.why !== "old_version" || !x.id || answered.has(x.id)) continue;
      const e = seat.get(x.id)?.e;
      if (!e || seat.get(x.id)!.as === "tail" || e.key !== signer.pub || e.by !== `person:${login}` || (e.kind !== "way.made" && e.kind !== "way.move")) continue;
      const v = e.value ?? {}, thing = typeof v.thing === "string" ? v.thing : undefined, move = typeof v.move === "string" ? v.move : undefined;
      drafts.push({ kind: "way.refused", item: thing ?? way, value: { way, ver: p.ver, ...(thing ? { thing } : {}), ...(move ? { move } : {}), why: "old_version", because: x.id }, at: now });
      answered.add(x.id);
    }
    if (!drafts.length) continue;
    const bad = unfit(drafts);
    if (bad) { out.push({ way, refused: [], written: [], whole: false, error: bad }); continue; }
    const w = writeAll(appendOf(s), id, by, drafts);
    out.push({ way, refused: drafts.slice(0, w.written.length).map((d) => String(d.value.because)), ...w });
    if (w.written.length) ({ rows, r } = readCached(s.trail, id));
  }
  return out;
}

/** how often the runner's loop turns when nothing comes: once a minute */
export const EVERY = 60_000;
export type LoopOptions = {
  sol: WaySol;
  /** the login this Sol runs ways for (the team's own `me`) */
  person: () => string;
  /** the clock, handed in */
  clock: () => number;
  /** the projects to turn (default: every project the trail holds) */
  projects?: () => string[];
  /** the switch (default: the ways' and Cowork v3's, way-switch.ts) */
  on?: () => boolean;
  every?: number;
  /** what a turn wrote, or a project that threw (default: nothing said, but a throw on stderr) */
  said?: (project: string, x: Turned[] | Error) => void;
  /** this Sol's events answered as of an old version (refuseOld), when any were */
  refused?: (project: string, x: (Wrote & { way: string; refused: string[] })[]) => void;
  /** after each project's turn, with the person (the wire tells its faces of new changes of version here) */
  after?: (project: string, person: string) => void;
};

/** the runner's loop: a turn of every project once a minute, and soon after a pull brought events (poke). Nothing runs,
 *  no timer either, while the switch is off; turned off, it stops at its next turn, and a poke with the switch on again
 *  starts it again (so does start()). Nothing it calls ends the process: a throw is said and the next turn comes */
export class WayLoop {
  private timer?: ReturnType<typeof setInterval>;
  private soon?: ReturnType<typeof setTimeout>;
  private stopped = false;
  constructor(private o: LoopOptions) {}
  private on(): boolean { return (this.o.on ?? teamWaysOn)(); }

  /** started: false when the switch is off or it runs already */
  start(): boolean {
    if (this.timer || !this.on()) return false;
    this.timer = setInterval(() => this.tick(), this.o.every ?? EVERY);
    this.timer.unref?.();
    return true;
  }
  stop(): void {
    this.stopped = false;
    if (this.timer) clearInterval(this.timer);
    if (this.soon) clearTimeout(this.soon);
    this.timer = this.soon = undefined;
  }
  get running(): boolean { return this.timer !== undefined; }
  /** a pull brought events: a turn soon, once however many come. A loop its switch stopped starts again when the
   *  switch is on; one never started, or stopped by stop(), does not (grade16 N4) */
  poke(): void {
    if (!this.timer && !(this.stopped && this.start())) return;
    if (this.soon) return;
    this.soon = setTimeout(() => { this.soon = undefined; this.tick(); }, 0);
    this.soon.unref?.();
  }
  /** one turn of every project, now (null when the switch is off: then the loop stops). A project that throws is said
   *  and the others still turn */
  tick(): Map<string, Turned[]> | null {
    const out = new Map<string, Turned[]>();
    const say = (project: string, x: Turned[] | Error) => {
      try { if (this.o.said) this.o.said(project, x); else if (x instanceof Error) console.error(`ways, ${project}:`, x.message); }
      catch (err) { console.error(`ways, ${project}:`, err instanceof Error ? err.message : String(err)); }
    };
    try {
      if (!this.on()) { const was = this.timer !== undefined || this.stopped; this.stop(); this.stopped = was; return null; }   // a second tick while off keeps the mark (grade17 F8)
      const person = this.o.person();
      if (!LOGIN.test(person)) return out;   // no login yet: nobody to run ways for
      // each project once, as the door names it: a room id and its project id are one
      const ids = [...new Set((this.o.projects ?? (() => this.o.sol.trail.projects()))().map((p) => projectFor(p)))];
      for (const project of ids) {
        try {
          const x = runTurns(this.o.sol, project, person, this.o.clock);
          out.set(project, x);
          if (x.length) say(project, x);
          const old = refuseOld(this.o.sol, project, person, this.o.clock);
          if (old.length) this.o.refused?.(project, old);
          this.o.after?.(project, person);
        } catch (err) { say(project, err instanceof Error ? err : new Error(String(err))); }
      }
    } catch (err) { say("*", err instanceof Error ? err : new Error(String(err))); }
    return out;
  }
}

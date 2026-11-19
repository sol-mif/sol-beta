// A way's change, tried on what already happened (FORMAT §6): each thing's life run again under the new version, from
// its birth, and set beside what was written. Pure: the events, the way files and the two versions in; per thing, the
// same or where it first differs out. Nothing is written; the proposer's Sol writes one way.previewed of the sums.
// Replaying a version over its own history is to give no difference: the tests hold it to that shape by shape, and
// a shape nobody tried can still part the two (reports/step4-engine.md lists each one found).
//   from birth        a thing is run again from its way.made, never from the middle
//   the history       what the fold took, in the order it took it (fold.ts place): a person's own log in the order
//                     given; a team's book in the team's one order (spine.ts), each event at the time that order judged
//                     it at, so a replay reads the same history every Sol's fold reads
//   time              each event's own `at`; a trigger the new version leaves as it was (its `on`, `if` and `do`, the
//                     rules its `if` names written out, the move it does, the zone, the lives and things) runs at the
//                     moments the runner's Sol really ran (the `at` of every way.fired of the way: closed days stay
//                     closed), every one of them, whatever `until` says; a trigger the new version changes runs at
//                     each of its ticks from the birth (the tick at the birth's own moment too: a thing is due for a
//                     tick that is not before its birth) to `until`, as if the runner's Sol had run at every tick, at the
//                     tick's own moment, and at no other (a runner open all day also fires a trigger for today's tick
//                     at a later turn, once a press has made its `if` pass: a preview shows that firing at the next
//                     tick, so within a day it can stand after a press it would really have stood before). `until`,
//                     unless said, is the last event taken, and with a clock handed (a team's book) no later than
//                     that clock reads the open tail (now and SKEW): an event of the runner's key is taken whatever
//                     date it says
//   the order         the presses and the runner's turns are tried in the order the history has them, never sorted by
//                     their times: a press signed 10:05 that the fold took before one signed 10:02 is tried before it
//                     (each still judged at its own time), as the fold judged them. A turn stands where its first
//                     way.fired stands. A changed trigger's tick has no place in the history, only a time: it runs
//                     before the first press or turn of a later time that has not been tried yet
//   a turn            the firings the runner wrote in one go. Their time does not tell them apart: a runner whose
//                     clock was set back signs every event at its chain's last time until the clock is past it
//                     (team/v3/trail.ts append), so turn after turn can say one time. A firing starts a new turn when
//                     its time is not the last firing's, when anything a turn does not write stands between the two
//                     (a turn writes its firings, their checks, what answers a firing, an act's answer, a receipt,
//                     and nothing else: a press, taken or refused, an apply, a note stand between two turns, in a
//                     person's log as written and in a team's book by the spine), or when it does not follow the last
//                     one in the order one turn writes (triggers.ts: the triggers in their order, for each the things
//                     by birth then id). Tried twice where it was one, a turn writes nothing the second time (a
//                     trigger fires once a tick, and what was not due is judged again the same). Two turns of one
//                     time with nothing between them, the second's firings following the first's, are read as one
//                     (a trigger fired in neither can then be answered by the checks of both)
//   one moment        presses and a turn of one time that stand together: the presses that stand before the turn,
//                     the triggers, the presses after. In a team's book a press the turn had seen is judged at the
//                     turn's time though it is dated after it, and stands before it. A changed trigger's tick at that
//                     very time runs with the turn (the turns stand where the history has them whichever triggers
//                     the new version changes, all of them too); with no turn there, before the presses, but not
//                     before the make
//   a life            starts at its way.made. What stands before it in the history is no part of it (a refusal there
//                     was judged of a thing not there yet: the fold passes it over, fold.ts `stale_refusal`)
//   too long          those ticks are walked a day at a time, and an event's time is what its signer wrote: a thing
//                     born more than SPAN (ten years) before `until`, or when either is no time a clock reads, is
//                     not run again when the new version changes a clock's trigger. It is listed (`tooLong`) and counted as
//                     differing: a preview never calls the same what it did not run. The ticks are worked out once
//                     for all the things (the clock is read SPAN's days at most for each changed trigger); each
//                     thing is then tried at every tick of its own life, on the one working projection of that life
//                     (never copied, nor the life read through again, for a tick). The runner's turns are not
//                     walked one by one for every thing either (a runner that turns after every press writes as
//                     many turns as the things were pressed): a turn that fired nothing for the thing, reading the
//                     ticks an earlier turn read that wrote nothing for it, the thing not changed since, is passed
//                     over (one(), "the walk"); in a turn that is run for it (and fired nothing for it), so is a
//                     trigger that reads the tick it read there, until a trigger before it in the turn writes. A
//                     change of the thing (a press tried, a firing in the history, a write in the replay) has every
//                     trigger tried again at the next turn. So a thing's work is the ticks of its life, plus its
//                     presses and the turns that change it, each times the triggers left as they were: a way with
//                     few clocks costs about things times days, however often the runner turned (with K clocks
//                     each firing for a thing daily, K times K tries a thing a day)
//   past answers      a check's answer is what the way.checked events said that the press named, exactly as the
//                     fold read them (fold.ts answersOf: of that thing and version, signed by the press's signer,
//                     standing before it; a seam answered two ways is not answered), never asked again, never
//                     another press's. A runner's turn asks each seam once for all its triggers, so a trigger run
//                     at a turn is answered by what that turn's firings of the thing named, and what the moves and
//                     refusals answering them named (a trigger's move asks its `when` after the `if`); where the
//                     history has that trigger's own firing in the turn, what that firing and its answer named comes
//                     first (two turns told apart by nothing can have asked one seam twice), and a check its own
//                     refusal asked and did not name (rule_unread: a judging consults every check of the move's
//                     rule and names each one it read) stays unread for it, whatever the turn's other firings named.
//                     An act's answer belongs to the entry that asked it: the last way.acted that answers that move
//                     (an `enter` act) or that firing (a trigger's act), whenever it was written. An entry the
//                     history has that nothing answered yet is unknown: the act is not written again, never
//                     answered by another entry's. Only an entry the history does not have (the new version enters
//                     the state, or fires the act, at another moment) takes the thing's latest answer of that seam
//                     at or before it, else its first after. What no event answered is unknown, and does not pass
//   people's presses  replayed as what they meant: the move, pressed as the roles of the old move its signer holds in
//                     the new version (no signer said: the role written on it). Legal under the new version, it is
//                     made; else it is marked would_be_refused. A press refused for its state or its rule (wrong_state,
//                     rule_failed, rule_unread) is meant too and tried again: as the roles of the old move its signer
//                     holds in the new version, as a taken one (no one of them: it is not tried, and not compared), or,
//                     no signer said (FoldOptions "trust" only: a book's unsigned events are passed over), as the old
//                     move's roles. Only a refusal the fold took is one: a refusal written on another view than the
//                     history's (a Sol that had not received what stands before it) was nobody's press here (fold.ts
//                     `stale_refusal`), so it is not tried and not compared. Other refusals (not_allowed,
//                     old_version, ...) and the triggers' own moves and refusals are not presses: the triggers are
//                     worked out again. A trigger's own is a move made as `trigger:<id>`, or the refusal its move
//                     got: the first answer of a firing (it answers the firing, is signed as the firing is, and
//                     refuses the move that firing's trigger does), at the firing's very time, with no press and
//                     no other firing since. Whatever else answers a firing is a press: a person's (`because`: the
//                     ping that asked for it), or the runner's own machine's when a role names it (only that
//                     machine's press right after a firing its turn left unanswered, at the firing's very time, is
//                     written as the turn would have written the refusal, and is read as it). A firing written
//                     with no id has nothing answer it by name: a refusal at its very time that says no `because`
//                     is taken for its own
//   removed states    the proposal's map ("old>new") renames what was written before it is compared
//   compared          the steps of a life: made (by), move (move, from, to, by), fired (trigger, tick), acted (seam, ok:
//                     the last one of each entry, so a failed act done again is one step; it stands right after the
//                     move or the firing it answers, whenever it was written: an act that took a day is the same
//                     life), refused (move, why: a press's when it was tried again, a trigger's own whatever its
//                     reason, since the triggers run again write theirs). Not their time, not their version, not the
//                     checks (those are the inputs)
import { canonical } from "../canonical.js";
import { isTick, isTime, lastTick, readOn, ticksBetween, type On } from "./clock.js";
import { MEANT, answersOf, empty, heldBy, place, stepDrafts } from "./fold.js";
import { judge } from "./moves.js";
import { formOf } from "./rules.js";
import { dueInto, triggerOrder, type Due } from "./triggers.js";
import { SKEW, isObj, lifeOf, own, type Answers, type Book, type Draft, type FoldOptions, type Loaded, type OwnBook, type Projection, type Way, type WayEvent } from "./types.js";

/** one step of a thing's life, as compared */
export type Step = { at: number; kind: string; by?: string; move?: string; from?: string; to?: string; trigger?: string; tick?: number; seam?: string; ok?: boolean; why?: string };
/** a thing replayed: whether its life is the same, the first step where it is not (the index, what was written there,
 *  what the new version gives there; null past either end), and the presses the new version would refuse. `tooLong`:
 *  it was not run again (SPAN), so it is not the same and has no first step */
export type ThingReplay = { thing: string; same: boolean; first?: { index: number; was: Step | null; now: Step | null }; tooLong?: true; wouldBeRefused: { at: number; move: string; why: string }[]; was: Step[]; now: Step[] };
export type Replayed = { way: string; from: string; to: string; things: ThingReplay[]; differ: number };
/** `now`: this Sol's clock, for a team's book (its open tail is never read without one: fold.ts place). `until`: how
 *  far a changed trigger's ticks are walked; not said, the last event taken, no later than `now` and SKEW. A caller
 *  that shows a preview says it (step 4b): what is not said moves with the book */
export type ReplayOptions = { until?: number; map?: string[]; now?: number } & FoldOptions;
export type TeamReplayOptions = ReplayOptions & { now: number };

/** what a runner's turn writes besides its firings and what answers them (a firing's checks, an act's answer, a
 *  receipt): standing between two firings, these do not part them into two turns */
const TURNS = ["way.checked", "way.acted", "way.seen"];

/** the longest life a replay runs again when the new version changes a clock's trigger: ten years. The walk is a day
 *  at a time, and a thing can be dated as far back as a clock reads: 270,000 years of days is hours of one thread */
export const SPAN = 3_660 * 86_400_000;

/** a rule with every rule it names written in its place (pure; a clean way's rules are bounded by load.ts) */
function spelled(w: Way, r: unknown, depth = 0): unknown {
  if (depth > 600 || !r || typeof r !== "object") return r;
  if (Array.isArray(r)) return r.map((x) => spelled(w, x, depth + 1));
  const o = r as Record<string, unknown>;
  if (typeof o.rule === "string") return { rule: o.rule, is: spelled(w, own(w.rules, o.rule), depth + 1) };
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, spelled(w, v, depth + 1)]));
}
/** what a trigger does under a way, written out whole (pure): equal under two versions means it runs the same */
function triggerPrint(w: Way | null | undefined, id: string): string {
  const t = w ? own(w.triggers, id) : undefined;
  if (!w || !t) return "";
  const move = (t.do as { move?: string }).move;
  return canonical({ zone: w.zone, runner: w.runner, on: t.on, do: t.do, if: spelled(w, t.if), life: w.life, things: w.things,
    when: Object.values(w.life).flatMap((l) => l.moves).filter((m) => m.id === move && m.when).map((m) => spelled(w, { rule: m.when })) });
}

/** the seams a rule asks (pure): every check in it, each rule it names read through once. A judging consults every one
 *  of them, whatever the others answer (rules.ts: no short cut) */
function seamsOf(w: Way, r: unknown, out = new Set<string>(), seen = new Set<string>(), depth = 0): Set<string> {
  if (depth > 600) return out;
  const form = formOf(r), x = r as Record<string, unknown>;
  if (form === "check") { if (typeof x.check === "string") out.add(x.check); }
  else if (form === "all" || form === "any") { if (Array.isArray(x[form])) for (const s of x[form] as unknown[]) seamsOf(w, s, out, seen, depth + 1); }
  else if (form === "not") seamsOf(w, x.not, out, seen, depth + 1);
  else if (form === "rule" && typeof x.rule === "string" && !seen.has(x.rule)) { seen.add(x.rule); seamsOf(w, own(w.rules, x.rule), out, seen, depth + 1); }
  return out;
}

/** a way's things replayed under `to` (pure). `ways` gives every version's file the events were written under; `book`
 *  says which book the events are from, as the fold is told (types.ts Book), so a replay reads what was taken exactly
 *  as the fold does: a way the book's start rule never let start has no things to replay. A team's book is replayed
 *  with this Sol's clock (`now`), as it is folded: a press of the open tail dated past it is not part of the history */
export function replay(events: readonly WayEvent[], ways: ReadonlyMap<string, Way>, from: Loaded, to: Loaded, book: OwnBook, o?: ReplayOptions): Replayed;
export function replay(events: readonly WayEvent[], ways: ReadonlyMap<string, Way>, from: Loaded, to: Loaded, book: Book, o: TeamReplayOptions): Replayed;
export function replay(events: readonly WayEvent[], ways: ReadonlyMap<string, Way>, from: Loaded, to: Loaded, book: Book, o: ReplayOptions = {}): Replayed {
  const wayId = to.way?.id ?? from.way?.id ?? "";
  const out: Replayed = { way: wayId, from: from.ver, to: to.ver, things: [], differ: 0 };
  if (!to.way || to.problems.length) return out;
  // what was taken: the fold of what was written, under the versions that were current then
  // (a team's book: in the team's order, each event at the time that order judged it at)
  const placed = place(wayId, events, ways, book, { unsigned: o.unsigned, now: o.now as number });
  const p = placed.p;
  const kept: WayEvent[] = placed.seq.filter((s) => s.taken).map((s) => (s.at === s.e.at ? s.e : { ...s.e, at: s.at }));
  const rename = new Map((o.map ?? []).map((m) => m.split(">") as [string, string]));
  // the last event taken: one the fold passed over is no part of the history, whatever time it says. With a clock
  // handed (a team's book), no further than that clock reads the open tail: an event of the runner's key is taken
  // whatever date it says, and one dated years ahead would have every thing walked to it
  let until = o.until ?? -Infinity;
  if (o.until === undefined) {
    for (const e of kept) if (e.at > until) until = e.at;
    if (isTime(o.now) && until > o.now + SKEW) until = o.now + SKEW;
  }
  // where each event stands in the history, and the runner's turns in the order the history has them, each where its
  // first firing stands: what stands before it there was folded before that turn, what stands after it was folded after
  const pos = new Map<WayEvent, number>(), firings = new Map<string, WayEvent>(), checkAt = new Map<string, number>();
  const turns: Turn[] = [];
  // a firing's place in the order one turn writes: its trigger's place under its version, then its thing's
  const places = new Map<string, Map<string, number>>();
  const placeOf = (ver: string, trigger: string): number => {
    let m = places.get(ver);
    if (!m) { const w = ways.get(ver); places.set(ver, m = new Map((w ? triggerOrder(w) : []).map((id, n) => [id, n]))); }
    return m.get(trigger) ?? -1;
  };
  let last: { at: number; n: number; born: number; thing: string; id?: string } | undefined, broke = false;
  // the triggers' own refusals (a refusal does not say who made it): the first answer of a firing, at the firing's
  // time, with nothing parting the turn since (`cut`: how many times a turn had been parted when each firing was
  // written) and no other firing since (`last`: a later turn of the runner is no press, and parts nothing).
  // `answered`: the firings their trigger's own move or refusal answered already
  const mine = new Set<WayEvent>(), cut = new Map<string, number>(), answered = new Set<string>();
  let parts = 0;
  kept.forEach((e, i) => {
    pos.set(e, i);
    if (e.kind === "way.checked" && e.id && !checkAt.has(e.id)) checkAt.set(e.id, i);
    if (e.kind === "way.fired") {
      if (e.id) { firings.set(e.id, e); cut.set(e.id, parts); }
      const thing = String(e.value?.thing);
      const f = { at: e.at, n: placeOf(String(e.value?.ver), String(e.value?.trigger)), born: own(p.things, thing)?.born ?? 0, thing, id: e.id };
      const follows = !!last && last.at === f.at && !broke && (f.n !== last.n ? f.n > last.n : f.born !== last.born ? f.born > last.born : f.thing > last.thing);
      if (!follows) turns.push({ at: e.at, i });
      last = f; broke = false;
    } else if (!TURNS.includes(e.kind)) {
      const f = e.kind === "way.move" || e.kind === "way.refused" ? firingOf(e, firings, ways, to.way!) : undefined;
      const first = !!f?.id && !answered.has(f.id) && cut.get(f.id) === parts && last?.id === f.id && e.at === f.at;
      if (e.kind === "way.move" && String(e.value?.by).startsWith("trigger:")) { if (f?.id) answered.add(f.id); }
      else if (e.kind === "way.refused" && first) { answered.add(f!.id!); mine.add(e); }
      // (a firing written without an id has nothing answer it by name: a refusal at its very time is taken for its own)
      else if (!(e.kind === "way.refused" && typeof e.value?.because !== "string" && last && !last.id && last.at === e.at)) { broke = true; parts++; }
    }
  });
  const same = new Set(Object.keys(to.way.triggers).filter((id) => triggerPrint(from.way, id) === triggerPrint(to.way, id)));
  const byThing = new Map<string, WayEvent[]>();
  for (const e of kept) {
    const v = e.value;
    const thing = typeof v?.thing === "string" ? v.thing : (e.kind === "way.note" || e.kind === "way.set") && typeof v?.about === "string" ? v.about.slice(0, Math.max(0, v.about.indexOf("."))) : "";
    if (!thing) continue;
    const list = byThing.get(thing);
    if (list) list.push(e); else byThing.set(thing, [e]);
  }
  // the ticks of the triggers the new version changes, once for all the things: from the earliest birth that is run
  // again (a life longer than SPAN is not) to `until`
  const clocks = Object.keys(to.way.triggers).filter((id) => !same.has(id)).flatMap((id) => { const on = readOn(to.way!.triggers[id].on); return on ? [{ id, on }] : []; });
  const born = (thing: string) => byThing.get(thing)?.find((e) => e.kind === "way.made")?.at;
  const long = (thing: string) => { const at = born(thing); return clocks.length > 0 && !(isTime(at) && isTime(until) && until - at <= SPAN); };
  let first = Infinity;
  for (const thing of Object.keys(p.things)) { const at = born(thing); if (at !== undefined && !long(thing) && at < first) first = at; }
  const ticks = new Map<number, Set<string>>();
  for (const { id, on } of clocks) {
    // the tick at the earliest birth itself counts (a thing is due for a tick that is not before its birth)
    const list = ticksBetween(on, first, until, to.way.zone);
    if (first <= until && isTick(on, first, to.way.zone)) list.unshift(first);
    for (const t of list) (ticks.get(t) ?? ticks.set(t, new Set()).get(t)!).add(id);
  }
  // what a turn asks of its time, for the triggers left as they were: the last tick of each of their clocks, and no
  // more (triggers.ts dueInto). Read once a turn here, for all the things: a thing a turn wrote nothing for, with
  // nothing written by it having named a check, is written nothing for at every later turn that reads the same
  // ticks, until something changes the thing (one(), "the walk"). A time no clock reads is a span of its own
  const sameOns: On[] = [], clock = new Map<unknown, number>();
  for (const s of new Set([...same].map((id) => to.way!.triggers[id].on))) { const on = readOn(s); if (on) clock.set(s, sameOns.push(on) - 1); }
  const spans = new Map<string, number>(), span: number[] = [], read: number[][] = [];
  turns.forEach((t, n) => {
    let key: string, ticks: number[];
    try { ticks = sameOns.map((on) => lastTick(on, t.at, to.way!.zone)); key = ticks.join(); } catch { ticks = sameOns.map(() => NaN); key = `!${n}`; }
    let s = spans.get(key);
    if (s === undefined) { s = spans.size; spans.set(key, s); read.push(ticks); }
    span.push(s);
  });
  // each trigger left as it was: which of those clocks it reads (none: its `on` is no clock, and it never fires)
  const clockOf = new Map<string, number>();
  for (const id of same) { const c = clock.get(to.way.triggers[id].on); if (c !== undefined) clockOf.set(id, c); }
  const fresh: number[] = new Array(turns.length + 1), back: number[] = new Array(turns.length + 1);
  fresh[turns.length] = back[turns.length] = turns.length;
  for (let n = turns.length - 1; n >= 0; n--) {
    fresh[n] = n === 0 || span[n] !== span[n - 1] ? n : fresh[n + 1];
    back[n] = n + 1 < turns.length && turns[n + 1].at >= turns[n].at ? back[n + 1] : n + 1;
  }
  const h: History = { p, ways, to, rename, checkAt, mine, turns, turnAt: turns.map((t) => t.i), pos, same, ticks, tickTimes: [...ticks.keys()].sort((a, b) => a - b), order: triggerOrder(to.way),
    turnTime: turns.map((t) => t.at), span, fresh, back, read, clockOf, book };
  for (const thing of Object.keys(p.things).sort()) out.things.push(one(thing, byThing.get(thing) ?? [], h, long(thing)));
  out.differ = out.things.filter((t) => !t.same).length;
  return out;
}

/** the firing a move or a refusal can be the own answer of (pure): the one it answers (`because`), when that firing is
 *  of its thing, is signed as it is, and its trigger does that very move. A person's press can answer a firing too
 *  (`because`: the ping that asked for it), and so can a press of the runner's own machine, when a role names it */
function firingOf(e: WayEvent, firings: ReadonlyMap<string, WayEvent>, ways: ReadonlyMap<string, Way>, way: Way): WayEvent | undefined {
  const v = e.value;
  const f = typeof v?.because === "string" ? firings.get(v.because) : undefined;
  if (!f || f.by !== e.by || f.value?.thing !== v?.thing) return undefined;
  const d = own((ways.get(String(f.value?.ver)) ?? way).triggers, String(f.value?.trigger))?.do as { move?: string } | undefined;
  return d?.move !== undefined && d.move === v?.move ? f : undefined;
}
/** whether a move or a refusal is a trigger's own, what its way.fired did (pure). A move says who made it (`by`). A
 *  refusal does not: it is the trigger's when it is the first answer of such a firing (firingOf), at the firing's time,
 *  with no press and no other firing since (`mine`, worked out once over the history: replay()). What else answers a
 *  firing is a press */
const ofTrigger = (e: WayEvent, mine: ReadonlySet<WayEvent>): boolean =>
  e.kind === "way.move" ? String(e.value?.by).startsWith("trigger:") : mine.has(e);

/** the way.previewed of a replay (pure): how many things, how many differ */
export const previewed = (r: Replayed, at: number, because?: string): Draft =>
  ({ kind: "way.previewed", item: r.way, at, value: { way: r.way, from: r.from, to: r.to, things: r.things.length, differ: r.differ, ...(because ? { because } : {}) } });

/** `i`: where the press stands in the history */
type Press = { at: number; i: number; move: string; roles: string[]; set?: Record<string, unknown>; kind?: string; applied: boolean; answers: Answers; acted: Record<string, boolean> };
/** a runner's turn: its time, and where its first way.fired stands in the history (replay.ts header, "a turn") */
type Turn = { at: number; i: number };
/** what every thing's replay reads of the history, worked out once: the fold's projection, where each event and each
 *  check stands, the triggers' own refusals, the runner's turns in the history's order (and where each starts), the
 *  triggers left as they were, the changed triggers' ticks (by time, and the times in order), the new version's
 *  triggers in the order they run */
type History = {
  p: Projection; ways: ReadonlyMap<string, Way>; to: Loaded; rename: Map<string, string>; checkAt: ReadonlyMap<string, number>; mine: ReadonlySet<WayEvent>;
  turns: readonly Turn[]; turnAt: readonly number[]; pos: ReadonlyMap<WayEvent, number>; same: ReadonlySet<string>; ticks: ReadonlyMap<number, Set<string>>; tickTimes: readonly number[]; order: readonly string[];
  /** by turn: its time; what the triggers left as they were read of that time (`span`: turns of one span read the
   *  same ticks); from each turn on, the first whose span is not the turn's before it (`fresh`), and the first after
   *  it whose time is under the turn's before it (`back`: up to there the times do not go down) */
  turnTime: readonly number[]; span: readonly number[]; fresh: readonly number[]; back: readonly number[];
  /** by span: the tick of each clock it reads (`read`); by trigger left as it was: its clock among them (`clockOf`) */
  read: readonly (readonly number[])[]; clockOf: ReadonlyMap<string, number>;
  /** the book, for who holds a role at a press's time (fold.ts heldBy: in a team's book the team's standing first) */
  book: Book;
};
const put = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
/** the first index (from `lo`, before `hi`) whose value is not under `x`, in a list in order there (pure) */
function from(list: readonly number[], x: number, lo = 0, hi = list.length): number {
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

function one(thing: string, all: WayEvent[], h: History, long: boolean): ThingReplay {
  const { p, ways, to, rename, pos } = h;
  const way = to.way!;
  const made = all.find((e) => e.kind === "way.made")!;
  const kind = String(made.value!.kind);
  // the life: from the birth on. What stands before it in the history was written of a thing that, in that order, was
  // not there yet: no part of the life, not tried, not compared
  const evs = all.slice(all.indexOf(made));
  // a trigger's own move or refusal answers its way.fired (ofTrigger); the firing's time tells it only where a firing
  // was written without an id to answer (a press can be judged at the very time of a firing: the turn that saw it)
  const firedAt = new Set(evs.filter((e) => e.kind === "way.fired" && !e.id).map((e) => e.at));
  const byTrigger = (e: WayEvent) => ofTrigger(e, h.mine) || (typeof e.value?.because !== "string" && firedAt.has(e.at));
  // what a moment asks of the life, set apart once (a moment is tried for every tick: the life is not read through
  // again each time): the firings by their time, the moves and refusals by what they answer, of each entry's acts the
  // last, the steps an act can answer
  const firedBy = new Map<number, WayEvent[]>(), firedIn = new Map<number, WayEvent[]>(), answering = new Map<string, WayEvent[]>(), lastAct = new Map<string, WayEvent>(), entries = new Set<string>();
  const acteds: WayEvent[] = [];
  const actKey = (e: WayEvent) => `${e.value?.because}|${e.value?.seam}`;
  for (const e of evs) {
    if (e.kind === "way.fired") { put(firedBy, e.at, e); put(firedIn, from(h.turnAt, (pos.get(e) ?? 0) + 1) - 1, e); }
    else if (e.kind === "way.acted") { acteds.push(e); lastAct.set(actKey(e), e); }
    else if ((e.kind === "way.move" || e.kind === "way.refused") && ofTrigger(e, h.mine)) put(answering, String(e.value!.because), e);
    if ((e.kind === "way.fired" || e.kind === "way.move") && e.id) entries.add(e.id);
  }
  /** the answers the checks an event named gave, as the fold read them when it took the event: only that event's own
   *  checks, of those standing before it */
  const named = (e: WayEvent): Answers => {
    const at = pos.get(e) ?? -1;
    const ids = (Array.isArray(e.value?.checks) ? e.value!.checks as unknown[] : []).filter((id) => typeof id === "string" && (h.checkAt.get(id) ?? Infinity) < at);
    return answersOf(p, ids, thing, String(e.value?.ver), e.by);
  };
  // each act's answers in the order of their times, each with the answer of the one written last of those up to it:
  // for an entry the history does not have
  const seams = new Map<string, { at: number[]; ok: boolean[]; first: boolean }>();
  {
    const by = new Map<string, { at: number; i: number; ok: boolean }[]>();
    acteds.forEach((e, i) => put(by, String(e.value?.seam), { at: e.at, i, ok: e.value?.ok === true }));
    for (const [seam, list] of by) {
      const first = list[0].ok;
      list.sort((a, b) => a.at - b.at || a.i - b.i);
      let last = list[0];
      seams.set(seam, { at: list.map((x) => x.at), ok: list.map((x) => (last = x.i > last.i ? x : last).ok), first });
    }
  }
  /** each act's recorded answer for an entry at `at` that the history does not have: this thing's latest at or before
   *  `at` (of those, the one written last), else its first */
  const latest = (at: number): Record<string, boolean> => {
    const a: Record<string, boolean> = {};
    for (const [seam, s] of seams) { const n = from(s.at, at + 1); a[seam] = n > 0 ? s.ok[n - 1] : s.first; }
    return a;
  };
  /** the answer of an entry the history has (`cause`: the move or the firing that asked the act), put in place of
   *  the latest: its own last way.acted, or, nothing having answered it, unknown */
  const entry = (a: Record<string, boolean>, seam: string | undefined, cause: string | undefined): void => {
    if (!seam || !cause) return;
    const e = lastAct.get(`${cause}|${seam}`);
    if (e) a[seam] = e.value?.ok === true; else delete a[seam];
  };
  /** the act a written move asked on entering its state, under the version it was written under */
  const enterOf = (m: WayEvent): string | undefined => (m.value?.from !== m.value?.to ? own(lifeOf(ways.get(String(m.value?.ver)) ?? way, kind)?.states, String(m.value?.to))?.enter : undefined);
  const presses: Press[] = [];
  const replayed = new Set<WayEvent>();
  // the fields each move set, by the move they answer: read through once, not once a move (a thing pressed a
  // thousand times is a thousand moves)
  const notes = new Map<string, [string, unknown][]>();
  for (const e of evs) if ((e.kind === "way.note" || e.kind === "way.set") && typeof e.value?.because === "string")
    put(notes, e.value.because, [String(e.value.about).slice(thing.length + 1), e.kind === "way.note" ? e.value.words : ["name", "number", "boolean", "names", "numbers"].map((k) => e.value![k]).find((x) => x !== undefined)]);
  const notesAt = (moveId: string | undefined) => Object.fromEntries(moveId ? notes.get(moveId) ?? [] : []);
  for (const e of evs) {
    const v = e.value ?? {};
    const old = ways.get(String(v.ver)) ?? way;
    const oldBy = (m: unknown) => lifeOf(old, kind)?.moves.find((x) => x.id === m)?.by.filter((b) => !b.startsWith("trigger:")) ?? [];
    if (e.kind === "way.move" && typeof v.by === "string" && !v.by.startsWith("trigger:")) {
      const roles = e.by === undefined ? [v.by] : oldBy(v.move).filter((r) => heldBy(way, e.by!, h.book, e.at).includes(r));
      const acted = latest(e.at);
      entry(acted, enterOf(e), e.id);
      presses.push({ at: e.at, i: pos.get(e) ?? 0, move: String(v.move), roles, set: notesAt(e.id), applied: true, answers: named(e), acted, ...(v.from === "" ? { kind } : {}) });
    } else if (e.kind === "way.refused" && MEANT.includes(String(v.why)) && typeof v.move === "string") {
      if (byTrigger(e)) continue;   // a trigger's, not a press
      const roles = e.by === undefined ? oldBy(v.move) : oldBy(v.move).filter((r) => heldBy(way, e.by!, h.book, e.at).includes(r));
      if (!roles.length) continue;   // signed by someone none of the move's roles names: no one's press
      presses.push({ at: e.at, i: pos.get(e) ?? 0, move: v.move, roles, applied: false, answers: named(e), acted: latest(e.at) });
      replayed.add(e);
    }
  }
  // what was written, as steps: a refusal only when it is replayed (a trigger's refusal is worked out again too), of
  // the acts of one entry only the last, and that one right after the move or the firing it answers
  const after = new Map<string, WayEvent[]>();
  for (const e of lastAct.values()) if (typeof e.value?.because === "string" && entries.has(e.value.because)) put(after, e.value.because, e);
  const was: Step[] = [];
  for (const e of evs) {
    if (e.kind === "way.acted" && (lastAct.get(actKey(e)) !== e || (typeof e.value?.because === "string" && entries.has(e.value.because)))) continue;
    const s = stepOf(e);
    if (!s) continue;
    if (s.kind === "way.refused" && !replayed.has(e) && !byTrigger(e)) continue;
    if (s.from !== undefined) s.from = rename.get(s.from) ?? s.from;
    if (s.to !== undefined) s.to = rename.get(s.to) ?? s.to;
    was.push(s);
    if (e.id && s.kind !== "way.refused") for (const a of after.get(e.id) ?? []) was.push(stepOf(a)!);
  }
  if (long) return { thing, same: false, tooLong: true, wouldBeRefused: [], was, now: [] };
  // a runner's turn asked each seam once for all its triggers: what its firings of this thing named (`fs`: the
  // turn's, or with no turn tried there, those written at the moment), and what the moves and refusals answering them
  // named
  const asked = (fs: readonly WayEvent[]): Answers => {
    const answers: Answers = {};
    for (const f of fs) {
      Object.assign(answers, named(f));
      for (const x of f.id ? answering.get(f.id) ?? [] : []) Object.assign(answers, named(x));
    }
    return answers;
  };
  // a trigger the history fired in the turn: what its own firing and its answer named, over the turn's. A seam its own
  // refusal asked and did not name was not read in its turn (`rule_unread`: a judging consults every check of the
  // move's rule, and names each one read), so it stays unread for it: another firing that named it was another
  // turn's, read as one with this (the header's "a turn")
  const answersOf_ = (turn: Answers, f: WayEvent): Answers => {
    const mine = asked([f]), a = { ...turn };
    for (const x of f.id ? answering.get(f.id) ?? [] : []) {
      if (x.kind !== "way.refused" || x.value?.why !== "rule_unread") continue;
      const old = ways.get(String(x.value.ver)) ?? way;
      const when = lifeOf(old, kind)?.moves.find((m) => m.id === x.value!.move)?.when;
      if (when) for (const s of seamsOf(old, { rule: when })) delete a[s];
    }
    return Object.assign(a, mine);
  };
  // the acts' answers for one trigger run at a moment: where the runner fired it for this thing there, the entry is
  // the history's (the act the trigger does, or the act of the state its move entered) and its answer is its own, or
  // unknown
  const actsAt = (id: string, at: number, f: WayEvent | undefined): Record<string, boolean> => {
    const a = latest(at);
    if (f?.id) {
      entry(a, (own((ways.get(String(f.value?.ver)) ?? way).triggers, id)?.do as { act?: string } | undefined)?.act, f.id);
      for (const m of answering.get(f.id) ?? []) if (m.kind === "way.move") entry(a, enterOf(m), m.id);
    }
    return a;
  };
  // the new version, run again on one working projection: the presses and the runner's turns in the history's order,
  // the changed triggers at their ticks
  const work: Projection = empty(way.id);
  work.ver = to.ver; work.vers = [to.ver];
  const get = (v: string) => (v === to.ver ? way : undefined);
  const now: Step[] = [];
  const wouldBeRefused: ThingReplay["wouldBeRefused"] = [];
  const say = (drafts: readonly Draft[]) => { for (const d of drafts) { const s = stepOf(d); if (s) now.push(s); } };
  const loaded: Loaded = { ...to, runs: true };   // a replay may try a version not pinned yet: it is never applied here
  // `rev` counts what may have changed the working projection: every press tried, every run that wrote
  let rev = 0;
  /** the thing has reached an end state: no trigger runs on it (triggers.ts dueInto) */
  const ended = (): boolean => { const t = work.things[thing]; return !!t && t.state !== null && !!own(lifeOf(way, t.kind)?.states, t.state)?.end; };
  const press = (x: Press) => {
    rev++;
    const r = judge(loaded, work, { thing, move: x.move, roles: x.roles, trigger: false, replay: true, set: x.set, kind: x.kind, acted: x.acted }, x.at, x.answers);
    stepDrafts(work, r.drafts, get);
    say(r.drafts);
    if (!r.ok && x.applied) wouldBeRefused.push({ at: x.at, move: x.move, why: r.why });
  };
  /** these triggers run at a moment, in the order a turn runs them, each on its own entry's answers: a trigger the
   *  history fired there is answered first by what its own firing named. `quiet`: a span a turn read that wrote nothing
   *  for the thing, the thing not changed since and no check answering it here. A trigger that reads the tick it read
   *  there writes nothing again, until a trigger before it in this turn writes (the walk) */
  const run = (at: number, only: ReadonlySet<string>, fs: readonly WayEvent[], quiet?: { was: number; now: number }) => {
    if (!only.size || !work.things[thing] || ended()) return;
    const answers = asked(fs);
    const was = quiet && h.read[quiet.was], now_ = quiet && h.read[quiet.now];
    let wrote = false;
    for (const id of h.order) {
      if (!only.has(id)) continue;
      if (was && now_ && !wrote) { const c = h.clockOf.get(id); if (c === undefined || was[c] === now_[c]) continue; }
      const f = fs.find((e) => e.value?.trigger === id);
      const out: Due = { drafts: [], acts: [], pings: [] };
      dueInto(out, loaded, way, work, at, [id], f ? answersOf_(answers, f) : answers, actsAt(id, at, f));   // folded into `work` as it goes
      if (out.drafts.length) { rev++; wrote = true; }
      say(out.drafts);
    }
  };
  /** what the history fired for this thing at a moment no turn is tried at (a changed trigger's tick) */
  const at_ = (at: number): readonly WayEvent[] => firedBy.get(at) ?? [];
  /** what a turn fired for this thing */
  const of = (t: number): readonly WayEvent[] => firedIn.get(t) ?? [];
  // a changed trigger's ticks from this thing's birth on (the ticks handed are from the earliest birth): a thing is due
  // for the tick at its very birth too (triggers.ts: only a tick before the birth is not its)
  const tk = h.tickTimes;
  let k = from(tk, made.at);
  /** a moment a changed trigger's tick stands at: the presses and the turns of that one time that stand together
   *  (`t`: a turn's place among the turns) */
  const moment = (at: number, items: readonly { x?: Press; t?: number }[]) => {
    // the turns of this moment (more than one: a clock set back, the header's "a turn"), the first of them
    const ts: number[] = [];
    for (let j = 0; j < items.length; j++) if (!items[j].x) ts.push(j);
    const turn = ts.length ? ts[0] : -1;
    const ticked = h.ticks.get(at)!;
    const only = new Set<string>();
    let i = 0;
    const pressOn = (stop: () => boolean) => { for (; i < items.length && !stop(); i++) if (items[i].x) press(items[i].x!); };
    // the triggers left as they were run where the runner's turn of this moment stood in the history: after the
    // presses folded before its first firing (in a team's book a press that turn had seen is judged at the turn's
    // time and stands before it), before the rest
    if (turn >= 0) { pressOn(() => i === turn); for (const id of h.same) only.add(id); }
    // a changed trigger's tick: before the presses of its moment, but not before the thing is there (the make at the
    // very tick). The triggers left as they were have then run where they stood, on no thing
    if (!work.things[thing]) { only.clear(); pressOn(() => !!work.things[thing]); }
    for (const id of ticked) only.add(id);
    run(at, only, turn >= 0 ? of(items[turn].t!) : at_(at));
    // the later turns of this moment, each after the presses that stand before it
    for (const t of ts.slice(1)) { pressOn(() => i >= t); run(at, h.same, of(items[t].t!)); }
    pressOn(() => false);
  };
  // the walk: the presses and the runner's turns that stand after the birth, one after another in the order the
  // history has them (the turns also when the new version changes every trigger: a changed trigger's tick at a turn's
  // time runs where that turn stood), a changed trigger's ticks of the times before each one first. A press is
  // judged; a turn runs the triggers left as they were. Most turns write nothing for most things, and such a turn is
  // not run for the thing at all: a turn that fired nothing for it in the history (so no check answers it), reading
  // the ticks a turn read that wrote nothing for it (`quiet`), with the thing not changed since, writes nothing
  // again. Those turns are passed over together, up to the first that may not be: one of another span, one whose
  // time goes back, one the thing was fired in, one a press stands before, one at or after a changed trigger's next
  // tick. In such a turn of another span, the triggers whose own clock's tick is the one read at `quiet` are passed
  // over too, until one before them writes (run()). So a thing's walk is its own presses and firings and the ticks of
  // its life, not the runner's every turn; after a change of the thing, the next turn tries every trigger
  const T = h.turns.length, own_ = [...firedIn.keys()];
  let t = from(h.turnAt, pos.get(made) ?? 0), x = 0, o = 0;
  let quiet: { span: number; rev: number } | undefined;
  for (;;) {
    const isTurn = t < T && (x >= presses.length || h.turnAt[t] < presses[x].i);
    if (!isTurn && x >= presses.length) break;
    // ended, and no press left: no turn and no tick writes of it again
    if (x >= presses.length && ended()) { k = tk.length; break; }
    const at = isTurn ? h.turnTime[t] : presses[x].at;
    // the changed triggers' ticks of the times before this one, each on its own
    for (; k < tk.length && tk[k] < at; k++) run(tk[k], h.ticks.get(tk[k])!, at_(tk[k]));
    if (k < tk.length && tk[k] === at) {
      const items: { x?: Press; t?: number }[] = [];
      for (;;) {
        if (t < T && (x >= presses.length || h.turnAt[t] < presses[x].i)) { if (h.turnTime[t] !== at) break; items.push({ t: t++ }); }
        else if (x < presses.length && presses[x].at === at) items.push({ x: presses[x++] });
        else break;
      }
      k++;
      moment(at, items);
      continue;
    }
    if (!isTurn) { press(presses[x++]); continue; }
    while (o < own_.length && own_[o] < t) o++;
    const fired = o < own_.length && own_[o] === t;
    if (!fired && quiet && quiet.rev === rev && quiet.span === h.span[t]) {
      let e = Math.min(h.fresh[t + 1], h.back[t], o < own_.length ? own_[o] : T, x < presses.length ? from(h.turnAt, presses[x].i) : T);
      if (k < tk.length) e = from(h.turnTime, tk[k], t + 1, e);
      t = e;
      continue;
    }
    const was_ = rev;
    run(at, h.same, of(t), !fired && quiet && quiet.rev === rev ? { was: quiet.span, now: h.span[t] } : undefined);
    if (!fired && rev === was_) quiet = { span: h.span[t], rev };
    t++;
  }
  for (; k < tk.length && !ended(); k++) run(tk[k], h.ticks.get(tk[k])!, at_(tk[k]));
  const key = (s: Step) => canonical({ ...s, at: undefined });
  let first: ThingReplay["first"];
  for (let i = 0; i < Math.max(was.length, now.length); i++) {
    if (!was[i] || !now[i] || key(was[i]) !== key(now[i])) { first = { index: i, was: was[i] ?? null, now: now[i] ?? null }; break; }
  }
  return { thing, same: !first, ...(first ? { first } : {}), wouldBeRefused, was, now };
}

/** a step of a thing's life from an event or a draft (pure), or null for what is not compared */
function stepOf(e: { kind: string; at: number; value?: Record<string, unknown> }): Step | null {
  const v = isObj(e.value) ? e.value : {};
  const s = (x: Omit<Step, "at" | "kind">): Step => ({ at: e.at, kind: e.kind, ...x });
  switch (e.kind) {
    case "way.made": return s({ by: String(v.by) });
    case "way.move": return s({ move: String(v.move), from: String(v.from), to: String(v.to), by: String(v.by) });
    case "way.fired": return s({ trigger: String(v.trigger), tick: Number(v.tick) });
    case "way.acted": return s({ seam: String(v.seam), ok: v.ok === true });
    case "way.refused": return own(v, "move") === undefined ? null : s({ move: String(v.move), why: String(v.why) });
    default: return null;
  }
}

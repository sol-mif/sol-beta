// What a way's things are now, from its events (FORMAT §3 to §5). Pure: the way's events, the way files by ver, which
// book they are read from (a person's own log or a team's: types.ts Book), and, per event, who signed it (`by`); one
// projection out. An event is signed by whoever wrote it, not made by this engine, so the fold takes from it only what
// the way file allows and judges again what the writer judged.
// The order. A person's own log is folded in the order it is given, and there the book may say when this Sol first
// had an event (`seen`). A team's book is folded in one order only, worked out from the events' own signed fields
// (spine.ts: the runner's spine), whatever order they are handed in, and nothing there reads `seen`. `place()` is the
// one way in for both; `fold()` is its projection; `step()`, one event at a time, is a person's own log's only: on a
// team's book it passes every way event over (`no_place`), so there is no way to fold a team's book in another order.
//   unsigned      an event of a kind whose writer is checked (agreed, applied, reverted, made, move, set, note,
//                 checked, acted, fired, seen) that the book does not say who signed is passed over (`unsigned`). Only the
//                 engine's own drafts, folded before they are written (stepDrafts), and a caller that says so
//                 (FoldOptions.unsigned "trust") fold such an event as this Sol's own
//   way.applied   the next version, taken only when its `from` is the current one, the file of `to` loads clean and
//                 every seam is pinned, the signer holds a role in the current version, and every role the change
//                 touches (touched below) agreed. FORMAT §3 as Frank chose it (B): only the roles changed press.
//                 Agreed means, per person: every person the change puts into a role (an added `person:` entry, or the
//                 person behind an added `agent:` or `machine:` entry) agreed to that role themselves, and, for a role
//                 that is held now, one of its current holders agreed. Nobody is put into a role without pressing,
//                 and one holder's agreement never covers another person being added. The first version (from "")
//                 puts everyone it names into their roles, so each of them agrees; its signer holds a role in it
//   who may start in a team's book (Book "team"), a way's first apply is also under the project's `ways.start`: its signer
//                 is a person who is an owner (`owner`), or an owner or an editor (`member`), and every person the
//                 version names (behind any role's `who` entry, and the login of its runner) is an owner or an editor;
//                 else `not_starter`, `not_member`. A guest, someone not in the project, an agent and a machine never
//                 start a way, and a way never starts naming a guest or a stranger. The roles are asked (`roleOf`) at
//                 the way.applied's own signed time, `at`: the apply is the event that puts the version in force, and
//                 its signed fields are the same on every Sol (not `seen`, not the time of the agreements, not now).
//                 So is `ways.start`, when the book hands it as what it was at each moment (4b): turned back to
//                 `owner`, it leaves a way an editor started under `member` as it is. Anything but `member` is `owner`.
//                 A person's own log (Book "own") is not under this rule: there the first apply of an id is first
//                 come. A fold is always told which book it reads; one that is not exactly one of the two (missing,
//                 misspelt, no `roleOf`) takes no first apply (`book_unread`)
//   who is named later  in a team's book a later apply, and a revert, is taken only if each person it newly names (a
//                 person behind an entry it adds to a role, and the new runner's person when it changes the runner) is
//                 a member who is not a guest at the time it is judged; else `not_member`. Who signs it is not under
//                 the start rule: rule B as before. A person's own log is not under this either
//   the team first  in a team's book a signer whose person is a guest at the event's time, or not in the project, holds
//                 no role of the way, whatever the way names (heldBy; FORMAT §10, Frank 2026-11-12, A): their presses,
//                 checks, agreements, applies and reverts are not taken, and a role's holder who is gone is not asked to
//                 agree. A role whose holders are all gone asks nobody's agreement; an owner of the team who holds no
//                 role of the way may sign an apply or a revert only to fill such roles (fills): every role it touches
//                 was held and has no holder left, and it changes nothing but those roles' people. The runner's firings
//                 are the runner's, not a holder's: not under this rule. Not under it either: a note, a field or an
//                 act's answer that completes a press taken while its signer was a member
//   the runner's person  in a team's book agrees to the version that names their Sol as its runner, at the first apply
//                 and at every change of runner (Frank 2026-11-12, A): an agreement of theirs to that `to`, as any role
//                 or as the runner's (RUNNER_ROLE, kept from any person and counted only for that one), or, for a
//                 revert, their own signature. A person's own log is under neither of these two
//   way.reverted  back to a version this projection has been on, from the current one, by someone who holds a role,
//                 and the same rule as an apply read backwards: for every role the change back touches, the signer
//                 holds it or one of its holders agreed, and every person it puts back into a role is the signer or
//                 agreed. A revert of a change that touched no role (a rule's, a trigger's) stays one press for anyone
//                 of the way, the safety valve for the changes that need no one's agreement. A revert takes the
//                 version back; it never moves a thing back
//   a person      a press that changes who may do what is a person's own signature, never their agent's or machine's:
//                 a way.agreed, the first apply, and an apply or a revert that touches a role are signed by a
//                 `person:`, and a reverter holds a touched role only as a person. An apply or a revert that touches
//                 no role is open to any signer with a role, agents and machines included (deliberate: the valve)
//   way.agreed    signed by a person (an agent or a machine never agrees: its person does), for one `to`, kept with
//                 the version current when it was given; it counts for an apply or a revert of exactly that `to`, from
//                 that same version, and only as the person who signed it, so
//                 an agreement does not outlive the version it was given under nor its signer's hold on the role;
//                 every taken apply and revert clears all agreements, so A to B, back to A, and B again needs fresh
//                 ones. In a team's book it also says which apply or revert it was given on: its signed `base` is the
//                 id of the way's latest taken apply or revert as its writer had it (none before the first apply), and
//                 it is taken only when that is the way's head where it is folded (`stale_agreement`); the projection
//                 keeps the head's id (`head`). A person's own log does not read `base`
//   the runner    one Sol, `<machine>@<login>` (FORMAT §1.5): an event is the runner's when it is signed
//                 `machine:<runner>`, that exact string. The key of the person that Sol belongs to is not the runner,
//                 nor is another machine of theirs: two Sols of one login never both fire
//   touched       a role whose entry differs, every role in a move (of any thing) whose `by` differs, and, when the
//                 runner changes (the runner signs as every trigger), every role of either version; another machine of
//                 the same login is a change of runner. A change of zone moves when triggers fire, not who may do
//                 what: it touches no role
//   a thing       way.made makes it (born = the event's at), by a role a birth move of its kind names
//   ahead         a person's own log only: when the book says when it first had an event (`seen`), a fact judged at
//                 its own time (made, move, checked, fired, acted, seen) dated more than SKEW after that is passed
//                 over. One dated earlier than the thing's last event is taken: an offline Sol's honest press arrives
//                 late. A team's book never reads `seen` and sets nothing aside as ahead: there an event is judged at
//                 the time its place in the order gives it (spine.ts), and one dated far ahead waits
//   a move        the move must be in the thing's life; the thing must be where the move goes from (a birth: not yet
//                 anywhere, and `from` ""), and the event's `from` must say so; where it goes is the move's `to` (the
//                 thing's own state for "same"); the role it names must be among the move's `by`, held by its signer;
//                 its `when` must pass again at the event's time on the way.checked answers the move names in
//                 `checks` (each of that thing, that version, signed by the move's signer: what is not answered is
//                 unknown, and unknown does not pass); a trigger's move must answer (`because`) a folded way.fired of
//                 that trigger and thing whose `do` is this move
//   a firing      a trigger of the way, signed by the runner (that Sol only), at a real tick of its `on` not later than the event,
//                 not before the thing was born, for a thing not in an end state, once a (trigger, thing, tick), and
//                 its `if` must pass again at the tick on the answers it names
//   way.seen      the runner's receipt (FORMAT §5): its writer is checked like a firing's (the runner of the version
//                 it names, in force), and it changes nothing of any thing. In a team's book it is what orders the
//                 events it names (spine.ts)
//   a check       kept, by its id, until a press or a firing names it; signed by the runner or by someone who holds a
//                 role (the runner's person signs one only as a holder of a role)
//   way.set       a non-text `set` value (a fact, never erased): its `because` an already folded way.move of that
//                 thing whose move sets that field, signed by that move's signer, one a field a move, the value in the
//                 one field of its type
//   way.note      the same for a `text` field's words. Once erased, the field goes, if that note set it last
//   way.acted     an act of the way, the answer to what made it run (`because`), judged by that move's or firing's
//                 version (an act reported after an apply still counts): a folded way.move that entered a state whose
//                 `enter` is that act, done by that move's signer or the runner, or a folded way.fired whose trigger
//                 does that act, done by the runner. A failed one marks the act red until one of the same seam works
//   way.refused   changes nothing of any thing. One for the thing's state or the move's rule (wrong_state, rule_failed,
//                 rule_unread: what a replay tries again) is judged again where it stands, like a move: taken when the
//                 same press of that thing, there, gets the same refusal (the version it names is the current one, the
//                 thing is there, the move is in its life and not a birth, and the state and the rule, on the answers
//                 the refusal names, refuse it for the same reason). One that does not was written on another view (a
//                 Sol that had not received what stands before it in the order, or a clock that put it before the
//                 thing's birth) and is passed over (`stale_refusal`): the press was refused where it was pressed, and
//                 nobody pressed it here. A refused birth does not say its kind and is taken as it is; so is every
//                 other refusal (not_allowed, old_version, ...)
//   passed over   named in `skipped` with why; it changes nothing. A fact written under a ver that is not the current
//                 one when it comes is old_version (FORMAT §5's last rule). Nothing is passed over because something
//                 else was. In a team's book what is set aside by the order (`no_place`, `before_its_prev`,
//                 `forked`, `not_spine`, `bad_frontier`, `before_its_base`, `waiting`, `pending`, `unread`) is named
//                 there too
//   the clock     a team's book is never folded without one: `now`, this Sol's time, is asked for by type, and with
//                 none the open tail is not folded at all (spine.ts). A person's own log needs none
import { canonical } from "../canonical.js";
import { isTick, isTime, readOn } from "./clock.js";
import { load } from "./load.js";
import { rolesOf } from "./moves.js";
import { evaluate, evaluateRule } from "./rules.js";
import { sealDue, sealedDue, spineFold, spineTurn, type Kit, type Me, type PlaceOptions, type Placed, type Seat, type TeamPlaceOptions, type Turn } from "./spine.js";
import { LOGIN, SET_KEYS, SKEW, THING, bare, fromList, holds, isObj, lifeOf, own, personOf, setKey, type Answers, type Book, type Draft, type FoldOptions, type OwnBook, type Projection, type TeamBook, type StartRule, type ThingNow, type Way, type WayEvent } from "./types.js";

export { SKEW, sealDue, sealedDue };
export type { Me, PlaceOptions, Placed, Seat, TeamPlaceOptions, Turn };

/** the kinds whose writer the fold checks: one the book does not say who signed is not taken (FoldOptions) */
const SIGNED = ["way.agreed", "way.applied", "way.reverted", "way.made", "way.move", "way.set", "way.note", "way.checked", "way.acted", "way.fired", "way.seen"];

/** a fresh projection of one way (pure) */
export const empty = (way: string): Projection => ({ way, ver: "", head: "", vers: [], things: {}, skipped: [], moves: bare(), fires: bare(), checks: bare(), agreed: bare(), notes: bare(), last: bare(), local: 0 });

/** a copy of a projection that a step may change without touching the first (pure) */
export function copy(p: Projection): Projection {
  const things: Record<string, ThingNow> = {};
  for (const [id, t] of Object.entries(p.things)) things[id] = { ...t, fields: { ...t.fields }, fired: { ...t.fired }, red: [...t.red], missing: [...t.missing] };
  const moves = bare<Projection["moves"][string]>(), fires = bare<Projection["fires"][string]>(), agreed = bare<Projection["agreed"][string]>();
  for (const [id, m] of Object.entries(p.moves)) moves[id] = { ...m, set: [...m.set], done: [...m.done] };
  for (const [id, f] of Object.entries(p.fires)) fires[id] = { ...f };
  for (const [to, r] of Object.entries(p.agreed)) agreed[to] = r.map((a) => ({ ...a }));
  return { way: p.way, ver: p.ver, head: p.head, vers: [...p.vers], things, skipped: [...p.skipped], moves, fires, checks: Object.assign(bare(), p.checks), agreed, notes: Object.assign(bare(), p.notes), last: Object.assign(bare(), p.last), local: p.local };
}

/** whether a signer is the way's runner (pure): the one Sol the way names, `machine:<runner>`, and nothing else. The
 *  key of the person that Sol belongs to is not the runner, nor is another machine of theirs */
const isRunner = (way: Way, by: string): boolean => by === `machine:${way.runner}`;
/** the roles a signer holds in a version at a moment (pure). In a team's book the team's standing comes first (FORMAT
 *  §10, Frank 2026-11-12, A): a signer whose person is a guest at that moment, or not in the project, holds none, whatever
 *  the way names. A person's own log: the way's roles as they are */
export function heldBy(way: Way, by: string, book: Book, at: number): string[] {
  const roles = rolesOf(way, by);
  if (!roles.length || bookOf(book) !== "team") return roles;
  return memberAt(book as TeamBook, personOf(by).slice(7), at) ? roles : [];
}
/** whether a signer is an owner of the team at a moment (pure): a team's book only, a person's own signature only. An
 *  owner may sign an apply or a revert without holding a role of the way: the way to fill a role nobody holds any
 *  more (its holders' agreement is then not asked: agreed()) */
const ownerAt = (book: Book, by: string, at: number): boolean =>
  bookOf(book) === "team" && by.startsWith("person:") && memberAt(book as TeamBook, by.slice(7), at) === "owner";
/** whether an owner who holds no role of the way may sign this change from `cur` to `nw` (pure): only to fill roles
 *  nobody holds any more. The change touches at least one role; every role it touches is held in `cur`, by no one who
 *  is a member at `at` (a role new in `nw` has no holder to be gone: round 14); and it changes nothing but the people
 *  of those roles (a fill carries nothing else along: no rule, seam, move or runner) */
const fills = (book: Book, by: string, at: number, cur: Way, nw: Way, changed: string[]): boolean =>
  ownerAt(book, by, at) && changed.length > 0 && changed.every((role) => { const h = holdersOf(cur, role); return h.length > 0 && h.every((who) => !memberAt(book as TeamBook, who.slice(7), at)); }) && onlyWho(cur, nw, changed);
/** whether `nw` is `cur` with only the people of these roles changed (pure): `prev` aside, as every version has its own */
const onlyWho = (cur: Way, nw: Way, roles: string[]): boolean => {
  const back: Way = { ...nw, prev: cur.prev, roles: { ...nw.roles } };
  for (const role of roles) { const was = own(cur.roles, role), now = own(nw.roles, role); if (!was || !now) return false; back.roles[role] = { ...now, who: was.who }; }
  return canonical(back) === canonical(cur);
};
/** the person a version names as its runner's (pure): the login after the `@` */
const runnerPerson = (w: Way): string => `person:${w.runner.slice(w.runner.indexOf("@") + 1)}`;
/** the role an agreement names when its signer agrees to be the runner's person of a version (FORMAT §10, Frank
 *  2026-11-12, A); no role id can be it (types.ts ID) */
export const RUNNER_ROLE = ":runner";
/** whether a signer may write an event that names this role, or this trigger, at a moment (pure). No signer said: the
 *  book's own */
const signs = (way: Way, by: string | undefined, role: string, book: Book, at: number): boolean =>
  by === undefined || (role.startsWith("trigger:") ? isRunner(way, by) : heldBy(way, by, book, at).includes(role));
/** the persons behind a role's `who` in a version (pure); none when the version or the role is not there */
const holdersOf = (w: Way | undefined, role: string): string[] => [...new Set((w ? own(w.roles, role)?.who ?? [] : []).map(personOf))];

/** the roles a change from one version to the next touches (pure): a role whose entry differs, every role in a move
 *  (of any thing) whose `by` differs, before or after, and every role of either when the runner changes */
export function touched(a: Way, b: Way): string[] {
  const out = new Set<string>();
  if (a.runner !== b.runner) for (const r of [...Object.keys(a.roles), ...Object.keys(b.roles)]) out.add(r);
  for (const r of new Set([...Object.keys(a.roles), ...Object.keys(b.roles)])) if (canonical(own(a.roles, r) ?? null) !== canonical(own(b.roles, r) ?? null)) out.add(r);
  const bys = (w: Way) => { const m = new Map<string, string[]>(); for (const [kind, life] of Object.entries(w.life)) for (const mv of life.moves) m.set(`${kind}/${mv.id}`, mv.by); return m; };
  const ma = bys(a), mb = bys(b);
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const x = ma.get(k) ?? [], y = mb.get(k) ?? [];
    if (canonical([...x].sort()) !== canonical([...y].sort())) for (const r of [...x, ...y]) if (!r.startsWith("trigger:")) out.add(r);
  }
  return [...out].sort();
}

/** the answers the checks an event names give (pure): each a folded way.checked of that thing and version, signed by
 *  the event's own signer; a seam answered two ways is not answered */
export function answersOf(p: Projection, ids: unknown, thing: string, ver: string, by: string | undefined): Answers {
  const out: Answers = bare(), split = new Set<string>();
  for (const id of Array.isArray(ids) ? ids : []) {
    const c = typeof id === "string" ? p.checks[id] : undefined;
    if (!c || c.thing !== thing || c.ver !== ver || c.by !== by) continue;
    const had = own(out, c.seam);
    if (had && had.pass !== c.pass) split.add(c.seam);
    out[c.seam] = { pass: c.pass };
  }
  for (const s of split) delete out[s];
  return out;
}
const subjectOf = (t: ThingNow) => ({ kind: t.kind, state: t.state, fields: t.fields, born: t.born, fired: t.fired });

/** one event folded into a projection, in place (pure but for `p`): true when it was taken, false when it is passed
 *  over (and named in `p.skipped`) or is not this way's. `book`: which book the event is read from (types.ts Book).
 *  Not for a team's book: there an event is folded only where the team's order puts it (fold, place), so handed in
 *  one at a time it is passed over (`no_place`) */
export function step(p: Projection, e: WayEvent, ways: (ver: string) => Way | undefined, book: Book, index = -1, o: FoldOptions = {}): boolean {
  if (bookOf(book) !== "team") return take(p, e, ways, book, index, o);
  if (!e.kind.startsWith("way.") || (isObj(e.value) && e.value.way !== p.way)) return false;
  p.skipped.push({ index, ...(e.id ? { id: e.id } : {}), kind: e.kind, why: "no_place" });
  return false;
}

/** the fold of one event, on any book (pure but for `p`). Kept in this file: a team's book reaches it only through
 *  spine.ts, in the team's order, at the time that order judges the event at (`e.at` here) */
function take(p: Projection, e: WayEvent, ways: (ver: string) => Way | undefined, book: Book, index = -1, o: FoldOptions = {}): boolean {
  const v = isObj(e.value) ? e.value : undefined;
  if (!e.kind.startsWith("way.")) return false;
  const team = bookOf(book) === "team";
  const thing = typeof v?.thing === "string" ? v.thing : undefined;
  const skip = (why: string, about = thing): false => { p.skipped.push({ index, ...(e.id ? { id: e.id } : {}), kind: e.kind, ...(about ? { thing: about } : {}), why }); return false; };
  if (e.by === undefined && o.unsigned !== "trust" && SIGNED.includes(e.kind) && (!v || v.way === p.way)) return skip("unsigned");
  if (e.kind === "way.note" || e.kind === "way.set") return value(p, e, v, ways, skip);
  if (!v || v.way !== p.way) return false;
  const cur = p.ver ? ways(p.ver) : undefined;
  switch (e.kind) {
    case "way.applied": return apply(p, e, v, cur, ways, book, skip);
    case "way.reverted": {
      if (v.from !== p.ver || !p.ver) return skip("wrong_from");
      if (typeof v.to !== "string" || v.to === p.ver || !p.vers.includes(v.to)) return skip("unknown_version");
      if (!cur) return skip("version_unread");
      const back = ways(v.to);
      if (!back) return skip("version_unread");
      const changed = touched(cur, back);
      if (e.by !== undefined && heldBy(cur, e.by, book, e.at).length === 0 && !fills(book, e.by, e.at, cur, back, changed)) return skip("not_allowed");
      if (e.by !== undefined && changed.length && !e.by.startsWith("person:")) return skip("not_allowed");   // a person's own press
      if (team && strangers(book as TeamBook, cur, back, e.at)) return skip("not_member");
      if (e.by !== undefined && !agreed(p, v.to, cur, back, changed, book, e.at, e.by)) return skip("not_agreed");
      for (const k of Object.keys(p.agreed)) delete p.agreed[k];
      p.ver = v.to;
      p.head = e.id ?? "";
      return true;
    }
    case "way.agreed": {
      if (typeof v.to !== "string" || typeof v.role !== "string") return skip("bad_value");
      const nw = ways(v.to);
      // (as the runner's person: kept from any person, and counted only for the person a version names as its runner's)
      if (v.role === RUNNER_ROLE) { if (e.by !== undefined && !e.by.startsWith("person:")) return skip("not_allowed"); }
      else {
        if (!(cur && own(cur.roles, v.role)) && !(nw && own(nw.roles, v.role))) return skip("unknown_role");
        if (e.by !== undefined && (!e.by.startsWith("person:") || ![...holdersOf(cur, v.role), ...holdersOf(nw, v.role)].includes(e.by))) return skip("not_allowed");
      }
      // in a team's book an agreement is a press: one given as a guest, or out of the project, is not taken (round 14)
      if (team && e.by !== undefined && !memberAt(book as TeamBook, personOf(e.by).slice(7), e.at)) return skip("not_allowed");
      // in a team's book it says which apply or revert it was given on: taken only while that is still the way's head
      if (team && !(Array.isArray(e.base) ? e.base.length === (p.head ? 1 : 0) && (!p.head || e.base[0] === p.head) : e.base === undefined && !p.head)) return skip("stale_agreement");
      (p.agreed[v.to] ?? (p.agreed[v.to] = [])).push({ role: v.role, ...(e.by !== undefined ? { by: e.by } : {}), from: p.ver });
      return true;
    }
    case "way.made": case "way.move": case "way.checked": case "way.fired": case "way.acted": case "way.seen":
      if (!team && e.seen !== undefined && e.at > e.seen + SKEW) return skip("ahead");   // a team's book never reads `seen`
      if (e.kind === "way.acted") return act(p, e, v, thing, ways, skip);
      break;
    case "way.refused": return refused(p, e, v, cur, thing) ? true : skip("stale_refusal");
    default: return true;   // way.proposed, way.previewed: nothing of a thing changes
  }
  if (!p.ver) return skip("not_applied");
  if (v.ver !== p.ver) return skip("old_version");
  const way = cur;
  if (!way) return skip("version_unread");
  if (e.kind === "way.fired") return fire(p, e, v, way, skip);
  if (e.kind === "way.seen") return e.by !== undefined && !isRunner(way, e.by) ? skip("not_runner") : true;   // the runner's receipt: nothing of a thing changes
  if (!thing) return skip("unknown_thing");
  const t = own(p.things, thing);
  switch (e.kind) {
    case "way.made": {
      if (t) return skip("thing_exists");
      const life = typeof v.kind === "string" ? lifeOf(way, v.kind) : undefined;
      if (!THING.test(thing) || !life) return skip("unknown_thing");
      const by = String(v.by);
      if (!life.moves.some((m) => m.from === null && m.by.includes(by)) || !signs(way, e.by, by, book, e.at)) return skip("not_allowed");
      p.things[thing] = { id: thing, kind: v.kind as string, state: null, fields: {}, born: e.at, fired: {}, red: [], missing: [] };
      return true;
    }
    case "way.move": {
      if (!t) return skip("unknown_thing");
      const move = lifeOf(way, t.kind)?.moves.find((m) => m.id === v.move);
      if (!move) return skip("unknown_move");
      const by = String(v.by);
      if (!move.by.includes(by) || !signs(way, e.by, by, book, e.at)) return skip("not_allowed");
      const here = move.from === null ? t.state === null : t.state !== null && fromList(move.from).includes(t.state);
      if (!here || v.from !== (t.state ?? "")) return skip("wrong_state");
      const to = (move.to === "same" ? t.state : move.to) as string;   // "same" is never a birth (load.ts), so a state
      if (v.to !== to) return skip("wrong_move");
      let fired: Projection["fires"][string] | undefined;
      if (by.startsWith("trigger:")) {
        fired = typeof v.because === "string" ? p.fires[v.because] : undefined;
        const trig = own(way.triggers, by.slice(8));
        if (!fired || fired.used || fired.thing !== thing || fired.ver !== p.ver || fired.trigger !== by.slice(8) || !trig || (trig.do as { move?: string }).move !== move.id) return skip("not_fired");
      }
      if (move.when) {
        const j = evaluateRule(way, move.when, subjectOf(t), e.at, answersOf(p, v.checks, thing, p.ver, e.by));
        if (!j.pass) return skip(j.verdict === "unknown" ? "rule_unread" : "rule_failed");
      }
      if (fired) fired.used = true;
      const entered = to !== t.state;
      t.state = to;
      if (move.fix) Object.assign(t.fields, move.fix);
      // the required fields this press sets: missing until their way.set or way.note is folded
      const types = way.things[t.kind]?.fields ?? {};
      for (const f of move.set ?? []) if (!types[f]?.endsWith("?") && !t.missing.includes(f)) t.missing.push(f);
      if (e.id) p.moves[e.id] = { thing, ver: p.ver, set: move.set ?? [], done: [], ...(e.by !== undefined ? { by: e.by } : {}), to, entered };
      return true;
    }
    default: {   // way.checked: kept until a press or a firing names it
      if (!t) return skip("unknown_thing");
      if (e.by !== undefined && !isRunner(way, e.by) && heldBy(way, e.by, book, e.at).length === 0) return skip("not_allowed");
      if (typeof v.seam !== "string" || own(way.seams, v.seam)?.gives !== "check" || typeof v.pass !== "boolean") return skip("unknown_seam");
      if (e.id) p.checks[e.id] = { thing, ver: p.ver, seam: v.seam, pass: v.pass, ...(e.by !== undefined ? { by: e.by } : {}) };
      return true;
    }
  }
}

/** the refusals a replay tries again as presses: for the thing's state or the move's rule */
export const MEANT = ["wrong_state", "rule_failed", "rule_unread"];
/** whether a way.refused stands where the same press gets the same refusal (pure). Only a refusal for the thing's
 *  state or the move's rule is asked: any other, and a refused birth (it does not say its kind), stands as written */
function refused(p: Projection, e: WayEvent, v: Record<string, unknown>, cur: Way | undefined, thing: string | undefined): boolean {
  if (!MEANT.includes(String(v.why)) || typeof v.move !== "string" || !thing) return true;
  if (!cur || v.ver !== p.ver) return false;
  const t = own(p.things, thing);
  if (!t) return Object.values(cur.life).some((l) => l.moves.some((m) => m.id === v.move && m.from === null));
  const move = lifeOf(cur, t.kind)?.moves.find((m) => m.id === v.move);
  if (!move || move.from === null) return false;
  if (!fromList(move.from).includes(t.state ?? "")) return v.why === "wrong_state";
  if (!move.when) return false;
  const j = evaluateRule(cur, move.when, subjectOf(t), e.at, answersOf(p, v.checks, thing, p.ver, e.by));
  return !j.pass && v.why === (j.verdict === "unknown" ? "rule_unread" : "rule_failed");
}

/** whether a person agreed to `to` as `role` (pure): an agreement for exactly that `to` and role, given while the
 *  current version was current, signed by that person (an unsigned one, trusted, stands for anyone) */
const agreedAs = (p: Projection, to: string, role: string, person: string): boolean =>
  (p.agreed[to] ?? []).some((a) => a.role === role && a.from === p.ver && (a.by === undefined || a.by === person));

/** whether a change from `cur` (none: a way's first version) to `nw` is agreed for these roles (pure). For each role:
 *  every person it adds agreed (or, for a revert, is its signer), and, when the role is held now, one of its holders
 *  agreed (or, for a revert, the signer holds the role) */
function agreed(p: Projection, to: string, cur: Way | undefined, nw: Way, roles: string[], book: Book, at: number, reverter?: string): boolean {
  const team = bookOf(book) === "team";
  // in a team's book, a holder who is a guest at that moment, or not in the project, is no holder: a role whose holders
  // are all gone asks nobody's agreement (an owner fills it: ownerAt)
  const member = (who: string) => !team || memberAt(book as TeamBook, who.slice(7), at) !== null;
  for (const role of roles) {
    const before = cur ? own(cur.roles, role)?.who ?? [] : [], after = own(nw.roles, role)?.who ?? [];
    const added = [...new Set(after.filter((x) => !before.includes(x)).map(personOf))];
    if (added.some((who) => who !== reverter && !agreedAs(p, to, role, who))) return false;
    const live = holdersOf(cur, role).filter(member);
    if (!live.length) continue;
    const holds = reverter !== undefined && reverter.startsWith("person:") && cur !== undefined && heldBy(cur, reverter, book, at).includes(role);
    if (!holds && !live.some((who) => agreedAs(p, to, role, who))) return false;
  }
  // in a team's book the runner's person agrees to the version that names their Sol as its runner, at the first apply
  // and at every change of runner (FORMAT §10, Frank 2026-11-12, A): an agreement of theirs to `to`, as any role or as
  // the runner's (RUNNER_ROLE), or, for a revert, their own signature
  if (team && (!cur || cur.runner !== nw.runner)) {
    const r = runnerPerson(nw);
    if (r !== reverter && !(p.agreed[to] ?? []).some((a) => a.from === p.ver && (a.by === undefined || a.by === r))) return false;
  }
  return true;
}

/** which book a fold was told it reads (pure): "own", "team", or null for anything else: nothing, a misspelt one, a
 *  team's without its `start` or its `roleOf`, an own log that carries a team's fields. Judged on what is there, not on
 *  its type: the wiring's mistake must not start a way */
function bookOf(b: unknown): "own" | "team" | null {
  if (!isObj(b)) return null;
  if (b.book === "own") return b.start === undefined && b.roleOf === undefined ? "own" : null;
  return b.book === "team" && (b.start === "owner" || b.start === "member" || typeof b.start === "function") && typeof b.roleOf === "function" ? "team" : null;
}
/** the project's `ways.start` at a moment (pure): `member` only when the book says exactly that then; anything else (a
 *  lookup that throws or answers another word, a time that is no time) is `owner`, the narrower rule, which is also the
 *  setting's default */
function startAt(book: TeamBook, at: number): StartRule {
  if (typeof book.start !== "function") return book.start;
  if (!Number.isFinite(at)) return "owner";
  try { return book.start(at) === "member" ? "member" : "owner"; } catch { return "owner"; }
}
/** a login's standing in the team at a moment (pure): "owner" or "editor" when the book's lookup says exactly that,
 *  else null: a guest, someone not in the project, a lookup that throws or answers anything else, a time that is no
 *  time. Nothing but those two words lets anyone start or be named */
function memberAt(book: TeamBook, login: string, at: number): "owner" | "editor" | null {
  if (!LOGIN.test(login) || !Number.isFinite(at)) return null;
  let r: unknown;
  try { r = book.roleOf(login, at); } catch { return null; }
  return r === "owner" || r === "editor" ? r : null;
}
/** why a way's first apply may not be taken in a team's book, or null when it may (pure; FORMAT §3, who may start):
 *  `not_starter`, its signer is not a person who may start a way under the project's `ways.start`; `not_member`, the
 *  version names someone (behind a role's `who` entry, or the login of its runner) who is a guest or not in the
 *  project. Every role is asked at the apply's own signed time */
function startRefused(book: TeamBook, e: WayEvent, nw: Way): string | null {
  const signer = e.by !== undefined && e.by.startsWith("person:") ? memberAt(book, e.by.slice(7), e.at) : null;
  if (signer !== "owner" && !(signer === "editor" && startAt(book, e.at) === "member")) return "not_starter";
  const named = new Set<string>([nw.runner.slice(nw.runner.indexOf("@") + 1)]);
  for (const r of Object.values(nw.roles)) for (const who of r.who) named.add(personOf(who).slice(7));
  for (const login of [...named].sort()) if (!memberAt(book, login, e.at)) return "not_member";
  return null;
}

/** whether a change from `cur` to `nw` names someone new who is not a member of the team at `at` (pure): the person
 *  behind every entry it adds to a role, and the login of its runner when the runner changes; a guest and someone not
 *  in the project are not members */
function strangers(book: TeamBook, cur: Way, nw: Way, at: number): boolean {
  const named = new Set<string>();
  if (nw.runner !== cur.runner) named.add(nw.runner.slice(nw.runner.indexOf("@") + 1));
  for (const [role, r] of Object.entries(nw.roles)) {
    const before = own(cur.roles, role)?.who ?? [];
    for (const who of r.who) if (!before.includes(who)) named.add(personOf(who).slice(7));
  }
  return [...named].some((login) => !memberAt(book, login, at));
}

/** a way.applied folded (pure but for `p`) */
function apply(p: Projection, e: WayEvent, v: Record<string, unknown>, cur: Way | undefined, ways: (ver: string) => Way | undefined, book: Book, skip: (why: string) => false): boolean {
  if (v.from !== p.ver) return skip("wrong_from");
  const nw = typeof v.to === "string" ? ways(v.to) : undefined;
  if (!nw) return skip("version_unread");
  const l = load(nw);   // read again each time: no cache outlives the call
  if (l.ver !== v.to || l.problems.length || l.way?.id !== p.way) return skip("way_unread");
  if (!l.pinned) return skip("unpinned");
  if (!p.ver) {
    const which = bookOf(book);
    if (!which) return skip("book_unread");   // no way starts in a book the fold was not told
    if (e.by !== undefined && (rolesOf(nw, e.by).length === 0 || !e.by.startsWith("person:"))) return skip("not_allowed");
    const why = which === "team" ? startRefused(book as TeamBook, e, nw) : null;
    if (why) return skip(why);
    if (!agreed(p, v.to as string, undefined, nw, Object.keys(nw.roles), book, e.at)) return skip("not_agreed");
  } else {
    if (!cur) return skip("version_unread");
    const changed = touched(cur, nw);
    if (e.by !== undefined && heldBy(cur, e.by, book, e.at).length === 0 && !fills(book, e.by, e.at, cur, nw, changed)) return skip("not_allowed");
    if (e.by !== undefined && changed.length && !e.by.startsWith("person:")) return skip("not_allowed");   // a person's own press
    if (bookOf(book) === "team" && strangers(book as TeamBook, cur, nw, e.at)) return skip("not_member");
    if (!agreed(p, v.to as string, cur, nw, changed, book, e.at)) return skip("not_agreed");
  }
  for (const k of Object.keys(p.agreed)) delete p.agreed[k];   // used: no agreement counts across a change of version
  p.ver = v.to as string;
  p.head = e.id ?? "";
  if (!p.vers.includes(p.ver)) p.vers.push(p.ver);
  return true;
}

/** a way.fired folded (pure but for `p`) */
function fire(p: Projection, e: WayEvent, v: Record<string, unknown>, way: Way, skip: (why: string, about?: string) => false): boolean {
  const id = typeof v.trigger === "string" ? v.trigger : "";
  const trig = own(way.triggers, id);
  if (!trig) return skip("unknown_trigger");
  if (e.by !== undefined && !isRunner(way, e.by)) return skip("not_runner");
  const thing = typeof v.thing === "string" ? v.thing : undefined;
  if (!thing) return true;   // a trigger fired for no thing: nothing of a thing changes
  const t = own(p.things, thing);
  if (!t) return skip("unknown_thing");
  if (t.state === null || own(lifeOf(way, t.kind)?.states, t.state)?.end) return skip("ended");
  const on = readOn(trig.on), tick = v.tick;
  if (!on || !isTime(tick) || tick > e.at || tick < t.born || !isTick(on, tick, way.zone)) return skip("bad_tick");
  if ((t.fired[id] ?? -Infinity) >= tick) return skip("fired_twice");
  if (trig.if !== undefined) {
    const j = evaluate(way, trig.if, `trigger:${id}`, subjectOf(t), tick, answersOf(p, v.checks, thing, p.ver, e.by));
    if (!j.pass) return skip(j.verdict === "unknown" ? "rule_unread" : "rule_failed");
  }
  t.fired[id] = tick;
  if (e.id) p.fires[e.id] = { thing, ver: p.ver, trigger: id, tick, at: e.at, ...(e.by !== undefined ? { by: e.by } : {}), used: false };
  return true;
}

/** a way.acted folded (pure but for `p`): judged by the version of what it answers; a redo written under the version
 *  current when it is written counts too (an act done again after an apply) */
function act(p: Projection, e: WayEvent, v: Record<string, unknown>, thing: string | undefined, ways: (ver: string) => Way | undefined, skip: (why: string) => false): boolean {
  const t = thing ? own(p.things, thing) : undefined;
  if (!t) return skip("unknown_thing");
  const seam = String(v.seam);
  const cause = typeof v.because === "string" ? v.because : "";
  const mv = p.moves[cause], fr = p.fires[cause];
  const ver = mv?.ver ?? fr?.ver;
  const way = ver ? ways(ver) : undefined;
  if (!way || (!mv && !fr)) return skip("not_caused");
  if (v.ver !== ver && v.ver !== p.ver) return skip("old_version");
  if (own(way.seams, seam)?.gives !== "act") return skip("unknown_seam");
  if (mv) {
    if (mv.thing !== thing || !mv.entered || own(lifeOf(way, t.kind)?.states, mv.to)?.enter !== seam) return skip("not_caused");
    if (e.by !== undefined && e.by !== mv.by && !isRunner(way, e.by)) return skip("not_allowed");
  } else {
    if (fr.thing !== thing || (own(way.triggers, fr.trigger)?.do as { act?: string } | undefined)?.act !== seam) return skip("not_caused");
    if (e.by !== undefined && !isRunner(way, e.by)) return skip("not_runner");
  }
  t.red = t.red.filter((s) => s !== seam);
  if (v.ok === false) t.red.push(seam);
  return true;
}

/** a way.set or a way.note folded (pure but for `p`): the value of one field a move set, or, a note erased, that field
 *  gone. A way.set is a fact and is never erased */
function value(p: Projection, e: WayEvent, v: Record<string, unknown> | undefined, ways: (ver: string) => Way | undefined, skip: (why: string, about?: string) => false): boolean {
  const note = e.kind === "way.note";
  if (!v) {
    // erased: only a note this projection folded, and only when it was the last to set its field
    const about = note && e.id ? p.notes[e.id] : undefined;
    if (!about || e.erased !== true) return false;
    const dot = about.indexOf("."), t = own(p.things, about.slice(0, dot));
    if (t && p.last[about] === e.id) { delete t.fields[about.slice(dot + 1)]; delete p.last[about]; }
    return true;
  }
  if (v.way !== p.way) return false;
  const about = typeof v.about === "string" ? v.about : "";
  const dot = about.indexOf(".");
  const thing = dot > 0 ? about.slice(0, dot) : about;
  const t = dot > 0 ? own(p.things, thing) : undefined;
  if (!t) return note ? false : skip("bad_set", thing);   // a note about a thing, not one of its fields: words only
  const field = about.slice(dot + 1);
  const mv = typeof v.because === "string" ? p.moves[v.because] : undefined;
  const type = mv ? own(ways(mv.ver)?.things[t.kind]?.fields, field) : undefined;
  const why = note ? "bad_note" : "bad_set";
  if (!mv || !type || mv.thing !== thing || !mv.set.includes(field) || mv.done.includes(field) || mv.by !== e.by || field === "born") return skip(why, thing);
  let got: unknown;
  if (note) {
    if (setKey(type) !== null || !holds(type, v.words)) return skip(why, thing);
    got = v.words;
  } else {
    const key = setKey(type);
    const present = SET_KEYS.filter((k) => v[k] !== undefined);
    if (key === null || present.length !== 1 || present[0] !== key || !holds(type, v[key])) return skip(why, thing);
    got = v[key];
  }
  mv.done.push(field);
  t.fields[field] = got;
  t.missing = t.missing.filter((f) => f !== field);
  if (note && e.id) { p.notes[e.id] = about; p.last[about] = e.id; }
  return true;
}

/** the book of drafts not written yet: in no book, so no first apply is ever taken from them (`book_unread`). The
 *  engine drafts no way.applied; were one handed in, it starts nothing */
const UNWRITTEN = Object.freeze({ book: "unwritten" }) as unknown as Book;
/** drafts folded into a projection as if written (pure but for `p`): each is given a local id, its `because` from its
 *  `cause` and its `checks` from theirs, so a note finds its move and a move its checks. What triggers.ts and
 *  replay.ts work on before anything is written: a projection whose way is already applied. `done`: the ids the
 *  first of these drafts were given when they were folded already (a firing is folded before what it does is judged);
 *  only the rest are folded. The ids of them all come back */
export function stepDrafts(p: Projection, drafts: readonly Draft[], ways: (ver: string) => Way | undefined, done: readonly string[] = []): string[] {
  const ids = [...done];
  for (let i = ids.length; i < drafts.length; i++) ids.push(`local:${++p.local}`);
  for (let i = done.length; i < drafts.length; i++) { const d = drafts[i]; take(p, { kind: d.kind, item: d.item, at: d.at, id: ids[i], value: written(d, ids) }, ways, UNWRITTEN, -1, { unsigned: "trust" }); }
  return ids;
}
/** a draft's value as its writer writes it (pure): `because` and `checks` filled in from the ids the drafts got */
export const written = (d: Draft, ids: readonly string[]): Record<string, unknown> => ({
  ...d.value,
  ...(d.cause !== undefined ? { because: ids[d.cause] } : {}),
  ...(d.checks?.length ? { checks: d.checks.map((i) => ids[i]) } : {}),
});

const KIT: Kit = { empty, copy, take };
type Ways = ReadonlyMap<string, Way> | ((ver: string) => Way | undefined);
const getter = (ways: Ways) => (typeof ways === "function" ? ways : (ver: string) => ways.get(ver));

/** a way's events placed and folded (pure): the one way in for every book. A person's own log (and a book the fold
 *  was not told: no way starts there) folds in the order given, each event at its own time. A team's book folds in the
 *  team's order (spine.ts), whatever order it is handed in. `ways` gives the way file of a ver (a map, or a function).
 *  `book` says which book the events are from, and is never left out: OWN for a person's own log, a TeamBook (the
 *  project's `ways.start` and its members' roles) for a team's. A team's book, or a book not known to be a person's
 *  own, is folded with this Sol's clock (`now`): the type asks for it, and without it the open tail is not folded */
export function place(way: string, events: readonly WayEvent[], ways: Ways, book: OwnBook, o?: PlaceOptions): Placed;
export function place(way: string, events: readonly WayEvent[], ways: Ways, book: Book, o: TeamPlaceOptions): Placed;
export function place(way: string, events: readonly WayEvent[], ways: Ways, book: Book, o: PlaceOptions = {}): Placed {
  const get = getter(ways);
  if (bookOf(book) === "team") return spineFold(KIT, way, events, get, book, o as TeamPlaceOptions);
  const p = empty(way), seq: Seat[] = [];
  events.forEach((e, i) => seq.push({ e, at: e.at, taken: take(p, e, get, book, i, o), as: "given" }));
  return { p, seq, spine: [], waiting: [], pending: [], unread: [], forked: [], copies: 0 };
}

/** a way's events folded (pure): place()'s projection */
export function fold(way: string, events: readonly WayEvent[], ways: Ways, book: OwnBook, o?: PlaceOptions): Projection;
export function fold(way: string, events: readonly WayEvent[], ways: Ways, book: Book, o: TeamPlaceOptions): Projection;
export function fold(way: string, events: readonly WayEvent[], ways: Ways, book: Book, o: PlaceOptions = {}): Projection {
  return place(way, events, ways, book, o as TeamPlaceOptions).p;
}

/** the runner's turn in a team's book (pure; spine.ts spineTurn): the projection to judge on (hand it to `due()`), the
 *  frontier to sign (sealedDue() puts it on what the turn writes). On any other book there is no turn (`not_team`) */
export function turn(way: string, events: readonly WayEvent[], ways: Ways, book: Book, me: Me, now: number, o: FoldOptions = {}): Turn {
  const get = getter(ways);
  if (bookOf(book) === "team") return spineTurn(KIT, way, events, get, book, me, now, o);
  const p = place(way, events, get, book, { ...o, now }).p;
  return { p, ver: p.ver, frontier: [], pages: [], news: false, ok: false, why: "not_team" };
}

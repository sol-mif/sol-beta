// A press on a thing (FORMAT §1.3, §1.1, §5): may this asker make this move now, and what is written either way. Pure:
// the way as loaded, the projection, who asks, the move, now and each seam's answer come in; drafts come out.
// Asked in this order, the first that fails is the refusal's `why` (an id, never words):
//   way_read_only   the way does not run (load.ts: a problem, or a seam not pinned)
//   not_applied     no version of the way is current yet
//   old_version     the asker pressed under another version than the current one (an offline Sol back with an old
//                   way), or the way handed in is not the current one: they press again under the new
//   bad_thing       the thing's id is not one (letters, digits, `_ -`, 64 at most)
//   unknown_thing   no such thing (a press with no kind, or a move that is not a birth)
//   unknown_move    the thing's life has no such move
//   thing_exists    a birth for a thing that is there already
//   not_allowed     the asker is in none of the move's roles. A role's `who` names a person (`person:<login>`: that
//                   human only), a person's agent (`agent:<login>`: that agent only) or a machine
//                   (`machine:<name>@<login>`: that machine only), and none stands for another. A trigger presses only
//                   through triggers.ts, as `trigger:<id>`, and only a move whose `by` names it
//   wrong_state     the thing is not in one of the move's `from` states
//   bad_set         a `set` value missing, of the wrong type, or for a field the move does not set (a `name` is an id)
//   rule_failed     the move's `when` rule does not pass on the thing as it is before the move (rule_unread: it cannot
//                   be read, a seam has no answer)
// Each check the `when` rule consulted is one way.checked, written first; the press (or its refusal) names them in
// `checks`, so every Sol that folds it judges the rule again on the same answers (fold.ts).
// Allowed, a birth writes way.made, then way.move from "" (so every move, the first too, is one way.move, and the state
// a thing is born in is said, not worked out). Any other move writes way.move; `to: "same"` stays where it is (from =
// to), and the move's `fix` is folded from the way file. Then each `set` value: a `text` field's words as a way.note (the
// one kind that may be erased), any other as a way.set fact (FORMAT's third version: the switch's name is a fact), each
// with `because` the press. Entering a state with an `enter` act: the act is listed for the caller to run, with the
// thing's fields as they are after the move (switch.off needs the switch's name), or, when its answer was handed in (a
// replay's recorded one), written as way.acted at once. A thing enters the state whether the act works or not. An act
// for a thing whose required `set` field never came (ThingNow.missing) fails closed: it is not handed out to run, and
// a way.acted that it did not work is written at once (red), so switch.off never runs without the switch's name.
import { evaluateRule, type Consulted } from "./rules.js";
import { EVENT_ID, THING, WHO, fromList, holds, lifeOf, own, setKey, type Answers, type Draft, type Loaded, type Move, type Projection, type ThingNow, type Way } from "./types.js";

/** what is pressed: by whom (`person:`, `agent:` or `machine:` form), which move on which thing, the kind for a birth,
 *  the `set` values, the version the asker pressed under (default: the current), the event the press answers */
export type Ask = { asker: string; thing: string; move: string; kind?: string; set?: Record<string, unknown>; ver?: string; because?: string };
/** an act to run: the seam, on which thing with its fields after the move, and the index of the draft it follows:
 *  its move for an `enter` act, the way.fired for a trigger whose `do` is the act (its way.acted's `because`: the
 *  writer maps the index to that event's id) */
export type Act = { seam: string; thing: string; pv: number; pkg: string; after: number; fields: Record<string, unknown> };
/** the answer: allowed or not, the reason (an id) when not, the role (or `trigger:<id>`) it was pressed as, the drafts to
 *  write in order, and the acts to run */
export type Decision = { ok: boolean; why: string; by: string; drafts: Draft[]; acts: Act[] };

/** the roles an asker holds in a way (pure): those whose `who` names the asker exactly */
export function rolesOf(way: Way, asker: string): string[] {
  if (!WHO.test(asker)) return [];
  return Object.keys(way.roles).filter((r) => way.roles[r].who.includes(asker));
}

/** a press by a person, an agent or a machine (pure). A `trigger:` asker is refused here: triggers press through
 *  triggers.ts only */
export function decide(l: Loaded, p: Projection, ask: Ask, now: number, answers: Answers = {}): Decision {
  const roles = l.way && WHO.test(ask.asker) ? rolesOf(l.way, ask.asker) : [];
  return judge(l, p, { ...ask, roles, trigger: false }, now, answers);
}

/** what judge works from: the roles the asker holds (a trigger: its own `trigger:<id>`), and, in a replay, the `set`
 *  values as they were (no field check: an erased note's words cannot come back) and the acts' recorded answers */
export type Press = Omit<Ask, "asker"> & { roles: string[]; trigger: boolean; replay?: boolean; acted?: Record<string, boolean> };

/** a press judged (pure): the shared path of decide, triggers.ts and replay.ts */
export function judge(l: Loaded, p: Projection, a: Press, now: number, answers: Answers): Decision {
  const way = l.way;
  const ver = p.ver || l.ver;
  const drafts: Draft[] = [];
  const because = typeof a.because === "string" && EVENT_ID.test(a.because) && a.because ? { because: a.because } : {};
  const thingId = THING.test(a.thing) ? a.thing : undefined;
  let checks: number[] = [];
  const refuse = (why: string): Decision => {
    drafts.push({
      kind: "way.refused", item: thingId ?? (way?.id || "way"), at: now,
      value: { way: way?.id ?? "", ver, ...(thingId ? { thing: thingId } : {}), ...(EVENT_ID.test(a.move) ? { move: a.move } : {}), why, ...because },
      ...(checks.length ? { checks } : {}),
    });
    return { ok: false, why, by: "", drafts, acts: [] };
  };
  if (!way || !l.runs) return refuse("way_read_only");
  if (!p.ver) return refuse("not_applied");
  if (l.ver !== p.ver || (a.ver !== undefined && a.ver !== p.ver)) return refuse("old_version");
  if (!thingId) return refuse("bad_thing");
  const t = own(p.things, thingId);
  if (!t && a.kind === undefined) return refuse("unknown_thing");
  const kind = t ? t.kind : a.kind!;
  const move = lifeOf(way, kind)?.moves.find((m) => m.id === a.move);
  if (!move) return refuse("unknown_move");
  const birth = move.from === null;
  if (birth && t) return refuse("thing_exists");
  if (!birth && !t) return refuse("unknown_thing");
  const by = move.by.find((b) => (a.trigger ? a.roles.includes(b) && b.startsWith("trigger:") : a.roles.includes(b) && !b.startsWith("trigger:")));
  if (!by) return refuse("not_allowed");
  if (!birth && !fromList(move.from).includes(t!.state ?? "")) return refuse("wrong_state");
  const set = setOf(way, kind, move, a.set ?? {}, !!a.replay);
  if (set === null) return refuse("bad_set");

  // the rule judges the thing as it is before the move (a birth: nothing yet), as the fold does again
  if (move.when) {
    const subject = { kind, state: t ? t.state : null, fields: { ...(t?.fields ?? {}) }, born: t ? t.born : now, fired: t?.fired ?? {} };
    const j = evaluateRule(way, move.when, subject, now, answers);
    const first = drafts.length;
    drafts.push(...checked(way, ver, thingId, j.checks, now, because));
    checks = j.checks.map((_, i) => first + i);
    if (!j.pass) return refuse(j.verdict === "unknown" ? "rule_unread" : "rule_failed");
  }
  const from = t?.state ?? "";
  const to = move.to === "same" ? from : move.to;
  const named = checks.length ? { checks } : {};
  if (birth) drafts.push({ kind: "way.made", item: thingId, at: now, value: { way: way.id, ver, thing: thingId, kind, by, ...because } });
  const at = drafts.push({ kind: "way.move", item: thingId, at: now, value: { way: way.id, ver, thing: thingId, move: move.id, from, to, by, ...because }, ...named }) - 1;
  const fields = way.things[kind]?.fields ?? {};
  for (const f of Object.keys(set).sort()) {
    const key = setKey(fields[f]);
    const about = `${thingId}.${f}`;
    if (key === null) drafts.push({ kind: "way.note", item: about, at: now, value: { way: way.id, about, words: set[f] }, cause: at });
    else drafts.push({ kind: "way.set", item: about, at: now, value: { way: way.id, about, [key]: set[f] }, cause: at });
  }
  const acts: Act[] = [];
  const enter = to !== from ? own(lifeOf(way, kind)!.states, to)?.enter : undefined;
  if (enter) {
    const s = way.seams[enter];
    const done = a.acted ? own(a.acted, enter) : undefined;
    const after = { ...(t?.fields ?? {}), ...(move.fix ?? {}), ...set };
    const types = way.things[kind]?.fields ?? {};
    const missing = [...(t?.missing ?? []), ...(move.set ?? []).filter((f) => !types[f]?.endsWith("?"))].filter((f) => !Object.hasOwn(after, f));
    if (missing.length) drafts.push(acted(way, ver, thingId, enter, false, now, at));
    else if (done === undefined) acts.push({ seam: enter, thing: thingId, pv: s.pv, pkg: s.pkg, after: at, fields: after });
    else drafts.push(acted(way, ver, thingId, enter, done, now, at));
  }
  return { ok: true, why: "", by, drafts, acts };
}

/** the `set` values of a press, checked (pure): only the move's own fields, each of its type, every one not marked `?`
 *  there. null when they are not. A replay takes them as they were */
function setOf(way: Way, kind: string, move: Move, given: Record<string, unknown>, replay: boolean): Record<string, unknown> | null {
  const fields = way.things[kind]?.fields ?? {};
  const allowed = move.set ?? [];
  const out: Record<string, unknown> = {};
  for (const [f, v] of Object.entries(given)) {
    if (v === undefined) continue;
    if (!allowed.includes(f)) { if (replay) continue; return null; }
    if (!replay && !holds(fields[f], v)) return null;
    out[f] = v;
  }
  if (!replay) for (const f of allowed) if (!Object.hasOwn(out, f) && !fields[f]?.endsWith("?")) return null;
  return out;
}

/** a way.checked for each check a rule consulted (pure). `more`: the press it answers (`because`), or the tick of the
 *  firing it was asked for (`tick`: a lead check, folded only right before that firing in a team's book, spine.ts) */
export function checked(way: Way, ver: string, thing: string, checks: Consulted[], now: number, more: { because?: string; tick?: number } = {}): Draft[] {
  return checks.map((c) => {
    const s = way.seams[c.seam];
    return { kind: "way.checked", item: thing, at: now, value: { way: way.id, ver, thing, rule: c.rule, seam: c.seam, pv: s.pv, pkg: s.pkg, pass: c.pass, at: now, ...more } };
  });
}

/** the way.acted of an act that ran (pure): whether it worked. `after`: the index of the draft it followed (its move,
 *  or the way.fired of a trigger whose `do` is the act), in the same list, for its `because` */
export function acted(way: Way, ver: string, thing: string, seam: string, ok: boolean, now: number, after?: number): Draft {
  const s = way.seams[seam];
  return { kind: "way.acted", item: thing, at: now, value: { way: way.id, ver, thing, seam, pv: s.pv, pkg: s.pkg, ok }, ...(after !== undefined ? { cause: after } : {}) };
}

/** the subject a rule sees for a thing as the projection has it (pure) */
export const subjectOf = (t: ThingNow) => ({ kind: t.kind, state: t.state, fields: t.fields, born: t.born, fired: t.fired });

// A way's rules (FORMAT §1.4): the few forms, judged against one thing at one moment. Pure: the moment, the triggers
// already fired for the thing and each seam's answer are handed in; nothing is run.
//   all any not      combine
//   field + older    the field is a time at least so long before now: `Nd` is N calendar days on the way's own clock
//                    (the day now falls on is N or more days after the day the field's time fell on, whatever the
//                    hour, so a draft made at 23:00 on day 0 is 21d old from day 21); `Nh` is more than N hours
//   field + is       the field equals a value
//   in               the thing is in one of these states
//   rule             another rule of the way
//   check            a seam's answer (gives "check"), handed in; each seam consulted is said once, for its way.checked
//   fired            the trigger fired for this thing already
// Three answers, not two: yes, no, and unknown. A form this engine does not read, a seam with no answer, a rule that is
// missing or nested too deep, a field whose value is not of its type, an `is` whose value is not of the field's type:
// unknown, with its reason. Unknown is never a pass, and it goes up through every `all`, `any` and `not` above it as
// unknown, so a `not` over what nobody can read does not pass either (the format's rule: what is not understood does
// not pass). load.ts refuses the same things when it can see them (a value of the wrong type, `older` on a field that
// is not a time, a rule nested deeper than MAX_DEPTH or bigger than SIZE written out), so a clean way never meets them.
// A named rule is judged once a call (the thing and the moment do not change within one), however many rules name it,
// and one call visits at most BUDGET forms: past that the answer is unknown (rule_too_big).
import { dayOf, isTime } from "./clock.js";
import { holds, isObj, own, type Answers, type Way } from "./types.js";

export type Verdict = "yes" | "no" | "unknown";
/** a check consulted: the named rule it sits in, the seam, and its answer */
export type Consulted = { rule: string; seam: string; pass: boolean };
/** a rule's answer: whether it passes, the reason it does not (an id: the failing check's seam, `rule_unread`, ...), and
 *  every check consulted on the way */
export type Judged = { pass: boolean; verdict: Verdict; why: string; checks: Consulted[] };
/** what a rule is judged against: a thing (its kind when known, state, fields, birth, the triggers fired for it) */
export type Subject = { kind?: string; state: string | null; fields: Record<string, unknown>; born: number; fired: Record<string, number> };

/** an age (pure), or null: a whole number of days (calendar days on the way's clock) or hours */
export function age(s: unknown): { n: number; unit: "d" | "h" } | null {
  const m = typeof s === "string" ? /^(\d{1,5})([dh])$/.exec(s) : null;
  return m ? { n: Number(m[1]), unit: m[2] as "d" | "h" } : null;
}
/** an age in ms, as a size only (pure), or null */
export const duration = (s: unknown): number | null => { const a = age(s); return a ? a.n * (a.unit === "d" ? 86_400_000 : 3_600_000) : null; };

const FORMS: Record<string, string[]> = {
  all: ["all"], any: ["any"], not: ["not"], older: ["field", "older"], is: ["field", "is"], in: ["in"], rule: ["rule"], check: ["check"], fired: ["fired"],
};
/** which form a rule is written in (pure), or null: exactly the keys of one form, nothing more */
export function formOf(r: unknown): string | null {
  if (!isObj(r)) return null;
  const keys = Object.keys(r).sort().join(",");
  for (const [form, want] of Object.entries(FORMS)) if ([...want].sort().join(",") === keys) return form;
  return null;
}

/** how deep one judging goes, a named rule counting as one more: load.ts refuses a way whose rules go deeper */
export const MAX_DEPTH = 512;
/** the most forms one judging visits */
export const BUDGET = 10_000;
/** the most forms a rule may hold once every rule it names is written out in its place (load.ts) */
export const SIZE = 2_000;
type Ctx = { way: Way; thing: Subject; now: number; answers: Answers; checks: Consulted[]; depth: number; memo: Map<string, { verdict: Verdict; why: string }>; left: { n: number } };
const r = (verdict: Verdict, why = ""): { verdict: Verdict; why: string } => ({ verdict, why });

/** a field's declared type for the thing's kind, when both are known (pure) */
const typeOf = (c: Ctx, field: string): string | undefined => (c.thing.kind ? own(own(c.way.things, c.thing.kind)?.fields, field) : undefined);

function judge(rule: unknown, named: string, c: Ctx): { verdict: Verdict; why: string } {
  if (c.depth > MAX_DEPTH) return r("unknown", "rule_too_deep");
  if (--c.left.n < 0) return r("unknown", "rule_too_big");
  const form = formOf(rule);
  const x = rule as Record<string, unknown>;
  const deeper = (sub: unknown, name = named) => judge(sub, name, { ...c, depth: c.depth + 1 });
  switch (form) {
    case "all": case "any": {
      const list = x[form];
      if (!Array.isArray(list)) return r("unknown", "rule_unread");
      // every part is judged (no short cut), so every check in the rule is consulted and said, the same each time
      const parts = list.map((s) => deeper(s));
      const unknown = parts.find((p) => p.verdict === "unknown");
      if (unknown) return unknown;
      if (form === "all") return parts.find((p) => p.verdict === "no") ?? r("yes");
      return parts.some((p) => p.verdict === "yes") ? r("yes") : r("no", parts[0]?.why || "none_passed");
    }
    case "not": {
      const p = deeper(x.not);
      return p.verdict === "unknown" ? p : p.verdict === "yes" ? r("no", "not") : r("yes");
    }
    case "older": {
      const a = age(x.older), f = x.field;
      if (a === null || typeof f !== "string") return r("unknown", "rule_unread");
      const declared = f === "born" ? "time" : typeOf(c, f);
      if (declared !== undefined && declared.replace(/\?$/, "") !== "time") return r("unknown", "field_not_time");
      const t = f === "born" ? c.thing.born : own(c.thing.fields, f);
      if (t === undefined || t === null) return r("no", `no_${f}`);
      if (!isTime(t)) return r("unknown", "field_not_time");   // a number no clock reads (1e300) is no time either
      if (!isTime(c.now)) return r("unknown", "no_time");
      const old = a.unit === "d" ? dayOf(c.now, c.way.zone) - dayOf(t, c.way.zone) >= a.n : c.now - t > a.n * 3_600_000;
      return old ? r("yes") : r("no", "too_young");
    }
    case "is": {
      const f = x.field, want = x.is;
      if (typeof f !== "string" || (want !== null && typeof want === "object")) return r("unknown", "rule_unread");
      const declared = f === "born" ? "time" : typeOf(c, f);
      if (declared !== undefined && want !== null && !holds(declared, want)) return r("unknown", "type_mismatch");
      const have = f === "born" ? c.thing.born : own(c.thing.fields, f);
      if (have !== undefined && have !== null && want !== null && typeof have !== typeof want) return r("unknown", "type_mismatch");
      return have === want || (want === null && have === undefined) ? r("yes") : r("no", `not_${f}`);
    }
    case "in": {
      const list = Array.isArray(x.in) ? x.in : [x.in];
      if (!list.every((s) => typeof s === "string")) return r("unknown", "rule_unread");
      return c.thing.state !== null && list.includes(c.thing.state) ? r("yes") : r("no", "wrong_state");
    }
    case "rule": {
      const id = x.rule;
      const sub = typeof id === "string" ? own(c.way.rules, id) : undefined;
      if (sub === undefined) return r("unknown", "rule_missing");
      const seen = c.memo.get(id as string);
      if (seen) return seen;
      const got = deeper(sub, id as string);
      c.memo.set(id as string, got);
      return got;
    }
    case "check": {
      const seam = typeof x.check === "string" ? own(c.way.seams, x.check) : undefined;
      if (!seam || seam.gives !== "check") return r("unknown", "seam_missing");
      const a = own(c.answers, x.check as string);
      if (!a || typeof a.pass !== "boolean") return r("unknown", "check_missing");
      if (!c.checks.some((k) => k.seam === x.check)) c.checks.push({ rule: named, seam: x.check as string, pass: a.pass });   // one way.checked a seam
      return a.pass ? r("yes") : r("no", x.check as string);
    }
    case "fired":
      return typeof x.fired === "string" ? (Object.hasOwn(c.thing.fired, x.fired) ? r("yes") : r("no", "not_fired")) : r("unknown", "rule_unread");
    default:
      return r("unknown", "rule_unread");
  }
}

/** a rule judged against a thing now (pure). `named` is the rule's id (or `trigger:<id>` for a trigger's `if`), written
 *  on each check it consults */
export function evaluate(way: Way, rule: unknown, named: string, thing: Subject, now: number, answers: Answers = {}): Judged {
  const checks: Consulted[] = [];
  const { verdict, why } = judge(rule, named, { way, thing, now, answers, checks, depth: 0, memo: new Map(), left: { n: BUDGET } });
  return { pass: verdict === "yes", verdict, why, checks };
}
/** a rule of the way by its id (pure); a missing id is unknown */
export const evaluateRule = (way: Way, id: string, thing: Subject, now: number, answers: Answers = {}): Judged =>
  evaluate(way, { rule: id }, id, thing, now, answers);

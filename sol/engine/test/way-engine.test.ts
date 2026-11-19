// The way engine (docs/cowork-ways-2026-11-10/FORMAT.md, step 3, its fix rounds and step 4a): load, rules, moves, fold, triggers,
// replay, all pure. One test for each claim of the unit. The first way is FORMAT §2's drafts' life
// (test/fixtures/sol-drafts-way.ts, the doc's file's text, byte for byte). Its seams are not pinned yet (`sha256:tbd`),
// so it cannot be applied: the tests that need it applied use a pinned copy (PINNED, the same file with one print for
// every seam). Every event any test writes is kept and, in the last tests, checked against step two's rows
// (contract/kinds.ts fits, team/v3/trail-kinds.ts kindError) and the trail's item rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashOf } from "../src/canonical.ts";
import { fits } from "../src/contract/kinds.ts";
import { kindError } from "../src/team/v3/trail-kinds.ts";
import { load as loadWay, unpinned, pressBytes, VALUE_MAX } from "../src/way/load.ts";
import { canonical } from "../src/canonical.ts";
import { evaluate, evaluateRule, MAX_DEPTH } from "../src/way/rules.ts";
import { decide, acted, rolesOf, type Ask } from "../src/way/moves.ts";
import { fold as foldBook, empty as emptyProjection, step, stepDrafts, written, touched, SKEW, RUNNER_ROLE } from "../src/way/fold.ts";
import { due } from "../src/way/triggers.ts";
import { dayOf, isTime, lastTick, momentOf, readOn, ticksBetween } from "../src/way/clock.ts";
import { replay as replayBook, previewed, SPAN, type ReplayOptions } from "../src/way/replay.ts";
import { OWN, personOf, type Answers, type Book, type Draft, type FoldOptions, type Loaded, type StartRule, type TeamBook, type TeamRole, type Way, type WayEvent } from "../src/way/types.ts";
import { DRAFTS_WAY } from "./fixtures/sol-drafts-way.ts";
process.env.SOL_COWORK_WAYS = "on";   // the trail checks the ways' kinds only with their switch on (#1105)

/** step 4a.3: a fold and a replay are told which book they read. Every test here but the "who may start" ones reads a
 *  person's own log (OWN) through these two, so what steps 3's tests pin is the own-log path, unchanged; the team's
 *  book is foldBook / replayBook with a team (below, "who may start") */
const fold = (way: string, events: readonly WayEvent[], ways: Parameters<typeof foldBook>[2], o?: FoldOptions) => foldBook(way, events, ways, OWN, o);
const replay = (events: readonly WayEvent[], ways: ReadonlyMap<string, Way>, from: Loaded, to: Loaded, o?: ReplayOptions) => replayBook(events, ways, from, to, OWN, o);

/** every way a test reads, by ver: a book that starts a way writes an agreement from each role its first version names */
const known = new Map<string, Way>();
const load = (f: unknown): Loaded => { const l = loadWay(f); if (l.way) known.set(l.ver, l.way); return l; };
/** the agreements a way's first version needs (FORMAT §3, third version): one from each person it names in each role,
 *  signed by that person (an agent's or a machine's person agrees for it) */
const firstAgreed = (ver: string, at: number): WayEvent[] =>
  Object.entries(known.get(ver)?.roles ?? {}).flatMap(([role, r]) => [...new Set(r.who.map(personOf))].map((by) =>
    ({ kind: "way.agreed", item: WAY, at, id: `first-${role}-${by}-${ver.slice(0, 6)}-${at}`, by, value: { way: WAY, to: ver, role } })));
const FILE = DRAFTS_WAY;
const PRINT = "0123456789abcdef".repeat(4);
const PINNED = FILE.replaceAll('"sha256:tbd"', `"sha256:${PRINT}"`);
const raw = (): Record<string, any> => JSON.parse(PINNED);
const L = load(PINNED);
const VER = L.ver, WAY = "sol.drafts";
const MARCO = "person:marco", FRANK = "person:frank";
/** the way's runner is one Sol, Frank's NucBox: ME is that Sol as due() is told which Sol it is on, RUNNER as it signs.
 *  LAPTOP is another Sol of the same login: never the runner */
const ME = "nucbox@frank", RUNNER = `machine:${ME}`, LAPTOP = "machine:macbook@frank";
const ITEM = /^[\w.:-]{1,120}$/;   // the team trail's item rule (team/v3/trail.ts ID)
/** every event any test wrote, as written (ids filled in), for the last tests */
const kept: { kind: string; item: string; value: Record<string, unknown> }[] = [];

// time: day n at hh:mm in New York (EST all through 2026-11-10 .. 2026-12-31: UTC-5)
const day = (n: number, h: number, m = 0) => Date.UTC(2026, 10, 10 + n, h + 5, m);
const TICK = (n: number) => day(n, 9, 30);

/** a book: drafts written in order, each given an id, `because` and `checks` filled in as a writer does, signed by `by`.
 *  A way's first apply among `first` is preceded by its first version's agreements */
function book(first: WayEvent[] = []) {
  const events: WayEvent[] = first.flatMap((e) => (e.kind === "way.applied" && e.value?.from === "" ? [...firstAgreed(String(e.value.to), e.at), e] : [e]));
  let n = events.length;
  const write = (ds: Draft[], by?: string) => {
    const ids = ds.map(() => `e${++n}`);
    ds.forEach((d, i) => {
      const value = written(d, ids);
      kept.push({ kind: d.kind, item: d.item, value });
      events.push({ kind: d.kind, item: d.item, value, at: d.at, id: ids[i], ...(by ? { by } : {}) });
    });
    return ids;
  };
  return { events, write };
}
const applied = (ver: string, at = day(-1, 12), from = "", by: string = FRANK): WayEvent => ({ kind: "way.applied", item: WAY, value: { way: WAY, from, to: ver, reader: 1 }, at, id: `applied-${ver.slice(0, 6)}-${at}`, by });
const short = (e: { kind: string; value?: Record<string, unknown> }) => {
  const v = e.value ?? {};
  const pick = (ks: string[]) => ks.filter((k) => v[k] !== undefined).map((k) => `${k}=${typeof v[k] === "number" && k !== "pv" ? "t" : v[k]}`).join(" ");
  return `${e.kind} ${pick(["thing", "move", "from", "to", "by", "trigger", "seam", "rule", "pass", "ok", "why", "about"])}`.trim();
};
const OK5: Answers = { "contract.written": { pass: true }, "undo.works": { pass: true }, "data.ok": { pass: true }, "gate.green": { pass: false, why: "red" }, "used.enough": { pass: true } };
const waysOf = (...ls: Loaded[]) => new Map(ls.map((l) => [l.ver, l.way!]));
/** the way's things after `writes`, folded fresh */
const make = (b: ReturnType<typeof book>, l: Loaded, thing: string, at: number, by = MARCO, set: Record<string, unknown> = { title: "New logo", switch: "logo_v2" }) =>
  b.write(decide(l, fold(WAY, b.events, waysOf(l)), { asker: by, thing, kind: "draft", move: "make", set }, at).drafts, by);

// ---------- A. load ----------

test("the drafts way loads clean, its ver is the hash of the whole way in any key order, and with its seams not pinned it does not run", () => {
  const doc = load(FILE);
  assert.deepEqual(doc.problems, []);
  assert.equal(doc.pinned, false); assert.equal(doc.runs, false, "sha256:tbd: read and replayed, never run");
  assert.deepEqual(unpinned(doc.way!).sort(), ["contract.written", "data.ok", "gate.green", "switch.off", "undo.works", "used.enough"]);
  assert.equal(doc.ver, hashOf(JSON.parse(FILE)));
  assert.deepEqual(L.problems, []); assert.equal(L.pinned, true); assert.equal(L.runs, true);
  assert.match(L.ver, /^[0-9a-f]{64}$/);
  // every object's keys reversed, arrays kept: the same ver
  const flip = (x: unknown): unknown => Array.isArray(x) ? x.map(flip) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, flip(v)])) : x;
  const flipped = JSON.stringify(flip(raw()));
  assert.notEqual(flipped, JSON.stringify(raw()));
  assert.equal(load(flipped).ver, L.ver);
  assert.equal(load(raw()).ver, L.ver, "the parsed object reads the same as its text");
  // one change anywhere is another version
  const w = raw(); w.rules.expired.any[0].all[0].older = "30d";
  assert.notEqual(load(w).ver, L.ver);
  // the file has no ver of its own
  const v = raw(); v.ver = L.ver;
  assert.deepEqual(load(v).problems, [{ at: "ver", why: "has_ver" }]);
  // the way handed back is a copy: changing the object handed in does not change it
  const o = raw(), lo = load(o);
  o.runner = "macbook@marco";
  assert.equal(lo.way!.runner, "nucbox@frank"); assert.equal(hashOf(lo.way), lo.ver);
});

test("a broken way is reported with its reasons and never runs", () => {
  const cases: [string, (w: Record<string, any>) => void, { at: string; why: string }][] = [
    ["a move to a state that is not there", (w) => { w.life.draft.moves[1].to = "nowhere"; }, { at: "life.draft.moves[1].to", why: "dangling_state" }],
    ["a move from a state that is not there", (w) => { w.life.draft.moves[5].from = "gone"; }, { at: "life.draft.moves[5].from", why: "dangling_state" }],
    ["a trigger whose move does not name it", (w) => { w.life.draft.moves[4].by = ["explorer"]; }, { at: "triggers.expire.do.move", why: "trigger_cannot_move" }],
    ["a seam with an empty pkg", (w) => { w.seams["gate.green"].pkg = ""; }, { at: "seams.gate.green.pkg", why: "empty_pkg" }],
    ["a seam whose pkg is no print", (w) => { w.seams["gate.green"].pkg = "x"; }, { at: "seams.gate.green.pkg", why: "bad_pkg" }],
    ["a seam whose pkg is a short print", (w) => { w.seams["gate.green"].pkg = "sha256:abc"; }, { at: "seams.gate.green.pkg", why: "bad_pkg" }],
    ["a rule form nobody reads", (w) => { w.rules.expired.any[1] = { field: "born", older_than: "42d" }; }, { at: "rules.expired.any[1]", why: "unknown_rule_form" }],
    ["a key the format does not have", (w) => { w.colour = "red"; }, { at: "colour", why: "unknown_key" }],
    ["a key inside a move", (w) => { w.life.draft.moves[0].after = "x"; }, { at: "life.draft.moves[0].after", why: "unknown_key" }],
    ["no birth move", (w) => { w.life.draft.moves.shift(); }, { at: "life.draft", why: "no_birth" }],
    ["a move out of an end state", (w) => { w.life.draft.moves.push({ id: "revive", from: "official", to: "wanted", by: ["keeper"] }); }, { at: "life.draft.moves[6].from", why: "from_end" }],
    ["a do that is none of ping, move, act", (w) => { w.triggers.remind.do = { mail: "explorer" }; }, { at: "triggers.remind.do", why: "bad_do" }],
    ["a do with two", (w) => { w.triggers.remind.do = { ping: "explorer", move: "drop" }; }, { at: "triggers.remind.do.move", why: "unknown_key" }],
    ["a role nobody defined", (w) => { w.life.draft.moves[3].by = ["gatekeeper"]; }, { at: "life.draft.moves[3].by[0]", why: "dangling_role" }],
    ["a trigger nobody defined", (w) => { w.life.draft.moves[4].by = ["explorer", "trigger:sweep"]; }, { at: "life.draft.moves[4].by[1]", why: "dangling_trigger" }],
    ["a rule nobody defined", (w) => { w.life.draft.moves[3].when = "rock_solid"; }, { at: "life.draft.moves[3].when", why: "dangling_rule" }],
    ["an enter that is a check", (w) => { w.life.draft.states.to_remove.enter = "gate.green"; }, { at: "life.draft.states.to_remove.enter", why: "seam_not_act" }],
    ["a check that is an act", (w) => { w.rules.solid.all[0] = { check: "switch.off" }; }, { at: "rules.solid.all[0].check", why: "seam_not_check" }],
    ["a who that stands for nobody", (w) => { w.roles.explorer.who = ["marco"]; }, { at: "roles.explorer.who[0]", why: "bad_who" }],
    ["a duration nobody reads", (w) => { w.rules.expired.any[1].older = "6w"; }, { at: "rules.expired.any[1].older", why: "bad_duration" }],
    ["an on nobody reads", (w) => { w.triggers.remind.on = "every morning"; }, { at: "triggers.remind.on", why: "bad_on" }],
    ["a zone nobody knows", (w) => { w.zone = "Mars/Olympus"; }, { at: "zone", why: "bad_zone" }],
    // 4a.1: the runner is one Sol, `<machine>@<login>`; a person (who has many Sols) or any other spelling is refused
    ["a runner that is a bare login", (w) => { w.runner = "frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner that is a person's key", (w) => { w.runner = "person:frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner written as a signer, with its machine: prefix", (w) => { w.runner = "machine:nucbox@frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner that is an agent", (w) => { w.runner = "agent:frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner whose machine name no key has (a capital)", (w) => { w.runner = "NucBox@frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner with no login", (w) => { w.runner = "nucbox@"; }, { at: "runner", why: "bad_value" }],
    ["a runner with no machine", (w) => { w.runner = "@frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner naming two Sols", (w) => { w.runner = "nucbox@frank,macbook@frank"; }, { at: "runner", why: "bad_value" }],
    ["a runner with a line after it", (w) => { w.runner = "nucbox@frank\n"; }, { at: "runner", why: "bad_value" }],
    ["a runner that is a list", (w) => { w.runner = ["nucbox@frank"]; }, { at: "runner", why: "bad_value" }],
    ["a newer format", (w) => { w.way = 2; }, { at: "way", why: "newer_format" }],
    ["a rule that names itself", (w) => { w.rules.not_extended = { rule: "not_extended" }; }, { at: "rules.not_extended", why: "rule_loop" }],
    ["a field set that the thing has not", (w) => { w.life.draft.moves[0].set = ["title", "colour"]; }, { at: "life.draft.moves[0].set[1]", why: "dangling_field" }],
    ["an is whose value is not of the field's type", (w) => { w.rules.not_extended = { not: { field: "extended", is: "true" } }; }, { at: "rules.not_extended.not.is", why: "bad_is" }],
    ["an older on a field that is no time", (w) => { w.rules.stale = { field: "switch", older: "1d" }; }, { at: "rules.stale.field", why: "not_time" }],
    ["a field name too long to join a thing's id within 120", (w) => { w.things.draft.fields["f".repeat(56)] = "name"; }, { at: `things.draft.fields.${"f".repeat(56)}`, why: "id_too_long" }],
    ["a fix of a name that is no id", (w) => { w.life.draft.moves[1].fix = { switch: "two words" }; }, { at: "life.draft.moves[1].fix.switch", why: "bad_fix" }],
  ];
  for (const [what, change, want] of cases) {
    const w = raw(); change(w);
    const l = load(w);
    assert.ok(l.problems.some((x) => x.at === want.at && x.why === want.why), `${what}: ${JSON.stringify(l.problems)}`);
    assert.equal(l.runs, false, what);
    assert.ok(l.way, `${what}: still shown, read-only`);
    // it never runs: it is never applied, a press is refused, no trigger is due
    const own = fold(WAY, [applied(l.ver)], waysOf(l));
    assert.equal(own.ver, "", what); assert.equal(own.skipped[0]?.why, "way_unread", what);
    const d = decide(l, own, { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "x", switch: "s" } }, day(0, 9));
    assert.equal(d.ok, false); assert.equal(d.why, "way_read_only", what);
    assert.deepEqual(d.drafts.map(short), ["way.refused thing=d1 move=make why=way_read_only"], what);
    assert.deepEqual(due(l, own, TICK(50), ME).drafts, [], what);
  }
  assert.deepEqual(load("{not json").problems, [{ at: "", why: "not_json" }]);
});

test("load never throws: a key written twice, a file nested deep, a chain of rules too long to judge are each a problem", () => {
  // a key written twice (JSON.parse keeps the last): refused, so one ver never stands for two readings
  const twice = PINNED.replace(`"runner": "nucbox@frank",`, `"runner": "nucbox@marco",\n  "runner": "nucbox@frank",`);
  assert.notEqual(twice, PINNED);
  assert.deepEqual(load(twice), { way: null, ver: "", problems: [{ at: "runner", why: "repeated_key" }], pinned: false, runs: false });
  assert.equal(load(PINNED.replace(`"name": "草稿生命週期",`, `"name": "草稿生命週期",\n  "name": "x",`)).problems[0].why, "repeated_key");
  assert.deepEqual(load(PINNED).problems, [], "the same key in two objects is no repeat");
  // 20,000 levels deep, as text and as an object
  const deep = '{"not":'.repeat(20_000) + '{"in":"wanted"}' + "}".repeat(20_000);
  const text = PINNED.replace(`"rules": {`, `"rules": {\n    "deep": ${deep},`);
  assert.deepEqual(load(text).problems, [{ at: "", why: "too_deep" }]);
  let o: unknown = { in: "wanted" };
  for (let i = 0; i < 20_000; i++) o = { not: o };
  const w = raw(); w.rules.deep = o;
  assert.deepEqual(load(w).problems, [{ at: "", why: "too_deep" }]);
  // a chain of named rules: 130 long judges (a judging goes MAX_DEPTH deep), 600 and 1,500 long are refused,
  // and nothing throws
  const c = raw();
  for (let i = 0; i < 130; i++) c.rules[`r${i}`] = { rule: `r${i + 1}` };
  c.rules.r130 = { field: "extended", is: true };
  const lc = load(c);
  assert.deepEqual(lc.problems, []);
  assert.deepEqual(evaluateRule(lc.way!, "r0", { state: "on_switch", fields: { extended: true }, born: 0, fired: {} }, 1).verdict, "yes");
  for (const n of [600, 1500]) {
    const long = raw();
    for (let i = 0; i < n; i++) long.rules[`r${i}`] = { rule: `r${i + 1}` };
    long.rules[`r${n}`] = { field: "extended", is: true };
    const ll = load(long);
    assert.ok(ll.problems.some((x) => x.at === "rules.r0" && x.why === "rule_too_deep"), JSON.stringify(ll.problems.slice(0, 2)));
    assert.equal(ll.runs, false);
  }
  assert.ok(MAX_DEPTH >= 130);
});

// ---------- B. rules ----------

test("rules: the forms judged, `d` counted in calendar days on the way's clock, and what cannot be read never passes, not even under a not", () => {
  const w = L.way!;
  const born = day(0, 9);
  const thing = (fields: Record<string, unknown> = {}, state = "on_switch", fired: Record<string, number> = {}) => ({ kind: "draft", state, fields, born, fired });
  // `14d`: from the 14th calendar day on, whatever the hour; `36h`: more than 36 hours
  assert.equal(evaluate(w, { field: "born", older: "14d" }, "x", thing(), day(13, 23, 59)).pass, false);
  assert.equal(evaluate(w, { field: "born", older: "14d" }, "x", thing(), day(14, 0, 0)).pass, true);
  assert.equal(evaluate(w, { field: "born", older: "14d" }, "x", { ...thing(), born: day(0, 23, 59) }, day(14, 0, 1)).pass, true, "made at 23:59: 14 days old from day 14");
  assert.equal(evaluate(w, { field: "born", older: "36h" }, "x", thing(), born + 36 * 3_600_000).pass, false);
  assert.equal(evaluate(w, { field: "born", older: "36h" }, "x", thing(), born + 36 * 3_600_000 + 1).pass, true);
  // across the spring change of the clocks (2027-03-14 in New York): day 21 is day 21
  const spring = Date.UTC(2027, 2, 1, 14, 0);   // 2027-03-01 09:00 EST
  assert.equal(evaluate(w, { field: "born", older: "21d" }, "x", { ...thing(), born: spring }, Date.UTC(2027, 2, 22, 13, 30)).pass, true, "09:30 EDT on day 21");
  // expired: 21 days unless extended, 42 days in any case; may_extend: not extended and not expired
  assert.equal(evaluateRule(w, "expired", thing(), day(21, 9, 30)).pass, true);
  assert.equal(evaluateRule(w, "expired", thing({ extended: true }), day(21, 9, 30)).pass, false);
  assert.equal(evaluateRule(w, "expired", thing({ extended: true }), day(42, 9, 30)).pass, true);
  assert.equal(evaluateRule(w, "may_extend", thing(), day(20, 23)).pass, true);
  assert.equal(evaluateRule(w, "may_extend", thing(), day(21, 0, 1)).pass, false, "expired: no extending");
  assert.equal(evaluateRule(w, "may_extend", thing({ extended: true }), day(2, 0)).pass, false);
  assert.equal(evaluate(w, { in: ["wanted", "on_switch"] }, "x", thing(), born).pass, true);
  assert.equal(evaluate(w, { in: "wanted" }, "x", thing(), born).pass, false);
  assert.equal(evaluate(w, { fired: "remind" }, "x", thing({}, "on_switch", { remind: 1 }), born).pass, true);
  assert.equal(evaluate(w, { not: { fired: "remind" } }, "x", thing(), born).pass, true);
  // checks: the answers handed in, each consulted said, every one (no short cut)
  const solid = evaluateRule(w, "solid", thing({}, "wanted"), born, OK5);
  assert.equal(solid.pass, false); assert.equal(solid.why, "gate.green");
  assert.deepEqual(solid.checks.map((c) => `${c.rule}:${c.seam}:${c.pass}`), ["solid:contract.written:true", "solid:undo.works:true", "solid:data.ok:true", "solid:gate.green:false", "solid:used.enough:true"]);
  assert.equal(evaluateRule(w, "solid", thing({}, "wanted"), born, { ...OK5, "gate.green": { pass: true } }).pass, true);
  // fail closed: an unknown form, a missing answer, a missing rule, a value of the wrong type, under not and any too
  for (const [what, r, fields] of [
    ["an unknown form", { older_than: "3d" }, {}],
    ["not over an unknown form", { not: { older_than: "3d" } }, {}],
    ["not not over an unknown form", { not: { not: { field: "born", newer: "3d" } } }, {}],
    ["any with a yes and an unknown", { any: [{ in: "on_switch" }, { wobble: 1 }] }, {}],
    ["a check with no answer", { check: "gate.green" }, {}],
    ["not over a check with no answer", { not: { check: "gate.green" } }, {}],
    ["a rule that is not there", { rule: "rock_solid" }, {}],
    ["a field that is no time", { field: "title", older: "1d" }, { title: "words" }],
    ["a time held as words", { field: "born", older: "1d" }, {}],
    ["an is of the wrong type for the field", { field: "extended", is: "true" }, {}],
    ["not over an is of the wrong type", { not: { field: "extended", is: "true" } }, {}],
    ["a field holding a value of another type", { not: { field: "extended", is: true } }, { extended: "true" }],
  ] as [string, unknown, Record<string, unknown>][]) {
    const subject = what === "a time held as words" ? { ...thing(fields), born: "yesterday" as unknown as number } : thing(fields);
    const j = evaluate(w, r, "x", subject, day(30, 0));
    assert.equal(j.pass, false, what); assert.equal(j.verdict, "unknown", what);
  }
});

test("round 7: a number no clock can read is no time (1e300 is JSON, and a Date asked for it throws): an age rule over one is unread, by days or by hours, the clock has no day and no tick for it, and nothing throws", () => {
  const w = L.way!, z = w.zone, on = readOn("daily 09:30")!, DAY = 86_400_000;
  const thing = (born: number) => ({ kind: "draft", state: "on_switch", fields: {}, born, fired: {} });
  for (const bad of [1e300, -1e300, 8.64e15, -8.64e15, 8.64e15 - 365 * DAY, 365 * DAY - 8.64e15, NaN, Infinity, -Infinity]) {
    assert.equal(isTime(bad), false, `${bad}`);
    for (const older of ["14d", "36h"]) {
      const a = evaluate(w, { field: "born", older }, "x", thing(bad), day(30, 0)), b = evaluate(w, { field: "born", older }, "x", thing(day(0, 9)), bad);
      assert.deepEqual([a.pass, a.verdict, a.why, b.pass, b.verdict, b.why], [false, "unknown", "field_not_time", false, "unknown", "no_time"], `${bad} ${older}`);
      assert.equal(evaluate(w, { not: { field: "born", older } }, "x", thing(bad), day(30, 0)).pass, false, "nor under a not");
    }
    assert.ok(Number.isNaN(dayOf(bad, z)));
    assert.deepEqual([ticksBetween(on, bad, day(30, 0), z), ticksBetween(on, day(0, 0), bad, z), lastTick(on, bad, z)], [[], [], -Infinity], `${bad}`);
  }
  for (const s of ["1", null, undefined, {}]) assert.equal(isTime(s), false);
  // every time that is one, the clock reads: the furthest either way (a few days around it too), a year under 100
  // (Date.UTC would take it for one of the 1900s), a year before the year 1
  const far = 8.64e15 - 366 * DAY, noon = (y: number) => new Date(0).setUTCFullYear(y, 5, 1) + DAY / 2;
  for (const t of [far, -far + 30 * DAY, noon(-271_000), noon(-100), noon(0), noon(50), noon(99), noon(100), noon(1582), 0, -1, day(0, 9), noon(275_000)]) {
    assert.equal(isTime(t), true, `${t}`);
    const tick = lastTick(on, t, z);
    assert.ok(Number.isFinite(tick) && tick <= t && t - tick <= DAY + 3_600_000 && lastTick(on, tick, z) === tick, `${t}: the tick before it`);
    assert.equal(ticksBetween(on, t - 3 * DAY, t, z).length, 3, `${t}`);
    assert.equal(evaluate(w, { field: "born", older: "14d" }, "x", thing(t - 14 * DAY), t).pass, true, `${t}`);
    assert.equal(evaluate(w, { field: "born", older: "14d" }, "x", thing(t - 12 * DAY), t).pass, false, `${t}`);
  }
  // noon in UTC is the same day in New York, in any year
  for (const y of [-271_000, -100, 0, 1, 50, 99, 100, 1582, 1970, 2026, 275_000]) assert.equal(dayOf(noon(y), z), Math.floor(noon(y) / DAY), `year ${y}`);
});

// ---------- C. moves ----------

test("who presses: person, agent and machine never stand for each other, and a trigger presses only as trigger:<id>", () => {
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  const p = fold(WAY, b.events, waysOf(L));
  const want = (asker: string) => decide(L, p, { asker, thing: "d1", move: "want" }, day(1, 10));
  for (const asker of ["agent:marco", "machine:nucbox@marco", "person:frank", "person:Marco", "trigger:expire", "marco", "person:marco "]) {
    const d = want(asker);
    assert.equal(d.ok, false, asker); assert.equal(d.why, "not_allowed", asker);
    assert.deepEqual(d.drafts.map(short), ["way.refused thing=d1 move=want why=not_allowed"]);
  }
  assert.equal(want(MARCO).ok, true);
  // drop names explorer and trigger:expire: Marco may, a press claiming to be the trigger may not
  assert.equal(decide(L, p, { asker: MARCO, thing: "d1", move: "drop" }, day(1, 10)).ok, true);
  assert.equal(decide(L, p, { asker: "trigger:expire", thing: "d1", move: "drop" }, day(1, 10)).why, "not_allowed");
  // a way that lets Marco's agent press: then the agent may, and Marco himself may not
  const w = raw(); w.roles.explorer.who = ["agent:marco"];
  const la = load(w), ba = book([applied(la.ver)]);
  make(ba, la, "d1", day(0, 9), "agent:marco");
  const pa = fold(WAY, ba.events, waysOf(la));
  assert.equal(pa.things.d1.state, "on_switch");
  assert.equal(decide(la, pa, { asker: "agent:marco", thing: "d1", move: "want" }, day(1, 10)).ok, true);
  assert.equal(decide(la, pa, { asker: MARCO, thing: "d1", move: "want" }, day(1, 10)).why, "not_allowed");
  // and a machine
  const m = raw(); m.roles.keeper.who = [RUNNER];
  const lm = load(m);
  assert.deepEqual(lm.problems, []);
  assert.deepEqual(rolesOf(lm.way!, RUNNER), ["keeper"]);
  assert.deepEqual(rolesOf(lm.way!, FRANK), []);
  assert.deepEqual(rolesOf(lm.way!, "machine:macbook@frank"), []);
  assert.deepEqual(rolesOf(L.way!, MARCO), ["explorer"]);
});

test("a press is refused, with an id, for each thing that does not hold", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  const p0 = fold(WAY, b.events, ways);
  const mk: Ask = { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "Logo", switch: "logo_v2" } };
  const why = (p: ReturnType<typeof fold>, a: Ask, l: Loaded = L) => { const d = decide(l, p, a, day(1, 10), OK5); b.write([]); return d.why; };
  assert.equal(why(fold(WAY, [], ways), mk), "not_applied");
  assert.equal(why(p0, mk, load(FILE)), "way_read_only", "the doc's file: not pinned");
  assert.equal(why(p0, { ...mk, ver: "f".repeat(64) }), "old_version");
  assert.equal(why(p0, { ...mk, thing: "d.1" }), "bad_thing");
  assert.equal(why(p0, { ...mk, thing: "a draft about the logo" }), "bad_thing");
  assert.equal(why(p0, { ...mk, thing: "d".repeat(65) }), "bad_thing");
  assert.equal(why(p0, { asker: MARCO, thing: "d1", move: "want" }), "unknown_thing");
  assert.equal(why(p0, { ...mk, move: "conjure" }), "unknown_move");
  assert.equal(why(p0, { ...mk, set: { title: "Logo" } }), "bad_set");
  assert.equal(why(p0, { ...mk, set: { title: "Logo", switch: "two\nlines" } }), "bad_set");
  assert.equal(why(p0, { ...mk, set: { title: "Logo", switch: "two words" } }), "bad_set", "a name is an id");
  assert.equal(why(p0, { ...mk, set: { title: "Logo", switch: "s", born: 1 } }), "bad_set");
  make(b, L, "d1", day(0, 9));
  const p = fold(WAY, b.events, ways);
  assert.equal(why(p, mk), "thing_exists");
  assert.equal(why(p, { asker: FRANK, thing: "d1", move: "promote" }), "wrong_state");
  assert.equal(why(p, { asker: FRANK, thing: "d1", move: "pull" }), "wrong_state");
  // the move a press asks under an old way is refused once a new one is applied (a rule's change: no one agrees)
  const w2 = raw(); w2.rules.expired.any[0].all[0].older = "30d";
  const l2 = load(w2);
  const p2 = fold(WAY, [...b.events, applied(l2.ver, day(2, 0), VER, FRANK)], waysOf(L, l2));
  assert.equal(p2.ver, l2.ver);
  assert.equal(why(p2, { asker: MARCO, thing: "d1", move: "want" }), "old_version", "the old way handed in");
  assert.equal(why(p2, { asker: MARCO, thing: "d1", move: "want", ver: VER }, l2), "old_version", "pressed under the old version");
  assert.equal(why(p2, { asker: MARCO, thing: "d1", move: "want" }, l2), "");
  // a way.refused names the thing and the move only when they are ids; with no thing, its item is the way's id
  const r = decide(L, p0, { asker: MARCO, thing: "two words", move: "do it now", kind: "draft" }, day(1, 10));
  assert.deepEqual(r.drafts[0], { kind: "way.refused", item: WAY, at: day(1, 10), value: { way: WAY, ver: VER, why: "bad_thing" } });
  assert.equal(decide(load("{not json"), p0, { asker: MARCO, thing: "bad thing", move: "make" }, day(0, 9)).drafts[0].item, "way", "no way read: the item is still an id");
});

test("a press writes a fact for each value that is not text (way.set) and a note only for text, and an enter act is handed the thing's fields", () => {
  const b = book([applied(VER)]);
  const ids = make(b, L, "d1", day(0, 9));
  const s0 = b.events.findIndex((e) => e.kind === "way.applied") + 1;
  assert.deepEqual(b.events.slice(s0).map(short), ["way.made thing=d1 by=explorer", "way.move thing=d1 move=make from= to=on_switch by=explorer", "way.set about=d1.switch", "way.note about=d1.title"]);
  assert.deepEqual(b.events[s0 + 2].value, { way: WAY, about: "d1.switch", name: "logo_v2", because: ids[1] });
  assert.deepEqual(b.events[s0 + 3].value, { way: WAY, about: "d1.title", words: "New logo", because: ids[1] });
  // the switch's name is a fact: erasing every note leaves it; a way.set cannot be erased on the team trail
  const erased = b.events.map((e) => (e.kind === "way.note" ? { kind: e.kind, item: e.item, at: e.at, id: e.id, by: e.by, erased: true } : e));
  assert.deepEqual(fold(WAY, erased, waysOf(L)).things.d1.fields, { switch: "logo_v2" });
  assert.match(kindError("way.set", undefined, true), /a fact, and a fact is never erased/);
  assert.equal(kindError("way.note", undefined, true), "");
  // Marco drops it: switch.off is handed the switch's name
  const d = decide(L, fold(WAY, b.events, waysOf(L)), { asker: MARCO, thing: "d1", move: "drop" }, day(2, 10));
  assert.deepEqual(d.acts, [{ seam: "switch.off", thing: "d1", pv: 1, pkg: `sha256:${PRINT}`, after: 0, fields: { title: "New logo", switch: "logo_v2" } }]);
  // a way.set that is not its move's own is passed over: another signer, a second one, a field of text, two values, a
  // value of the wrong type
  const signed = b.events.map((e) => (e.kind === "way.applied" || e.kind === "way.agreed" ? e : { ...e, by: MARCO }));
  const noSet = signed.filter((e) => e.kind !== "way.set");
  const set = (v: Record<string, unknown>, by = MARCO, id = `s${Object.keys(v).join("")}${by}`): WayEvent => ({ kind: "way.set", item: "d1.switch", at: day(0, 9), id, by, value: { way: WAY, about: "d1.switch", because: ids[1], ...v } });
  const sw = (extra: WayEvent[], from = noSet) => { const p = fold(WAY, [...from, ...extra], waysOf(L)); return [p.things.d1.fields.switch, p.skipped.at(-1)?.why]; };
  assert.deepEqual(sw([set({ name: "logo_v3" })]), ["logo_v3", undefined]);
  assert.deepEqual(sw([set({ name: "logo_v3" }, FRANK)]), [undefined, "bad_set"]);
  assert.deepEqual(sw([set({ name: "logo_v3" })], signed), ["logo_v2", "bad_set"], "one value a field a press");
  assert.deepEqual(sw([set({ name: "a", number: 1 })]), [undefined, "bad_set"]);
  assert.deepEqual(sw([set({ number: 7 })]), [undefined, "bad_set"]);
  assert.deepEqual(sw([set({ name: "two words" })]), [undefined, "bad_set"]);
  const titleSet = { kind: "way.set", item: "d1.title", at: day(0, 9), id: "st", by: MARCO, value: { way: WAY, about: "d1.title", because: ids[1], name: "x" } };
  assert.equal(fold(WAY, [...signed.filter((e) => e.kind !== "way.note"), titleSet], waysOf(L)).skipped.at(-1)?.why, "bad_set", "text rides in a note");
  const switchNote = { kind: "way.note", item: "d1.switch", at: day(0, 9), id: "nt", by: MARCO, value: { way: WAY, about: "d1.switch", because: ids[1], words: "logo_v3" } };
  assert.equal(fold(WAY, [...noSet, switchNote], waysOf(L)).skipped.at(-1)?.why, "bad_note", "a name rides in a way.set");
});

// ---------- D. fold ----------

test("the fold: state, fields, born, extended, fired; the version from the last applied or reverted; an old version's event after an apply is refused and named", () => {
  const w2 = raw(); w2.rules.expired.any[0].all[0].older = "30d";
  const l2 = load(w2);
  const ways = waysOf(L, l2);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9), MARCO, { title: "Logo", switch: "logo_v2" });
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, day(3, 9)).drafts, MARCO);
  const p = fold(WAY, b.events, ways);
  assert.deepEqual(p.things.d1, { id: "d1", kind: "draft", state: "on_switch", fields: { switch: "logo_v2", title: "Logo", extended: true }, born: day(0, 9), fired: {}, red: [], missing: [] });
  // extend twice: refused by its rule
  assert.equal(decide(L, p, { asker: MARCO, thing: "d1", move: "extend" }, day(4, 9)).why, "rule_failed");
  // an erased note takes its field away; the facts stay
  const erased = b.events.map((e) => (e.kind === "way.note" ? { kind: e.kind, item: e.item, at: e.at, id: e.id, by: e.by, erased: true } : e));
  assert.deepEqual(fold(WAY, erased, ways).things.d1.fields, { switch: "logo_v2", extended: true });
  // a new version applied; an offline Sol's move under the old one, sent after, is refused and named; before, taken
  const old: WayEvent = { kind: "way.move", item: "d1", at: day(6, 10), id: "late", by: MARCO, value: { way: WAY, ver: VER, thing: "d1", move: "want", from: "on_switch", to: "wanted", by: "explorer" } };
  const after = fold(WAY, [...b.events, applied(l2.ver, day(5, 0), VER, FRANK), old], ways);
  assert.equal(after.ver, l2.ver);
  assert.equal(after.things.d1.state, "on_switch");
  assert.deepEqual(after.skipped, [{ index: b.events.length + 1, id: "late", kind: "way.move", thing: "d1", why: "old_version" }]);
  const before = fold(WAY, [...b.events, old], ways);
  assert.equal(before.things.d1.state, "wanted"); assert.deepEqual(before.skipped, []);
  // reverted: the old version is current again, and the same event is taken
  const back = fold(WAY, [...b.events, applied(l2.ver, day(5, 0), VER, FRANK), { kind: "way.reverted", item: WAY, at: day(5, 1), by: MARCO, value: { way: WAY, from: l2.ver, to: VER } }, old], ways);
  assert.equal(back.ver, VER); assert.equal(back.things.d1.state, "wanted");
  // a move from where the thing is not (two Sols moved it at once) is named, not folded; so is a fact before any apply
  const fork = { ...old, id: "fork", value: { ...old.value, move: "drop", from: "on_switch", to: "to_remove" } };
  assert.equal(fold(WAY, [...b.events, old, fork], ways).skipped[0].why, "wrong_state");
  assert.equal(fold(WAY, b.events.filter((e) => e.kind !== "way.applied"), ways).skipped[0].why, "not_applied");
  // another way's events are not this way's
  assert.deepEqual(fold("sol.other", b.events, ways).things, {});
});

test("F1: a version is applied only from the current one, by someone of the way, clean and pinned, and agreed by every role it touches; a revert only to a version it was on", () => {
  const ways0 = waysOf(L);
  const base = book([applied(VER, day(-1, 12), "", FRANK)]);
  make(base, L, "d1", day(0, 9));
  base.write(decide(L, fold(WAY, base.events, ways0), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  // Marco's version: explorer may promote too, with no rule (it touches promote's `by`: keeper and explorer)
  const w2 = raw(); w2.prev = VER;
  const promote = w2.life.draft.moves.find((m: any) => m.id === "promote");
  promote.by = ["keeper", "explorer"]; delete promote.when;
  const l2 = load(w2), ways = waysOf(L, l2);
  assert.deepEqual(touched(L.way!, l2.way!), ["explorer", "keeper"]);
  const agreed = (role: string, by: string, to = l2.ver): WayEvent => ({ kind: "way.agreed", item: WAY, at: day(2, 8), id: `ag-${role}-${by}`, by, value: { way: WAY, to, role } });
  const apply = (by: string, from = VER, to = l2.ver): WayEvent => ({ ...applied(to, day(2, 9), from, by), id: `ap-${by}-${from.slice(0, 4)}` });
  const after = (extra: WayEvent[]) => { const p = fold(WAY, [...base.events, ...extra], ways); return { ver: p.ver === VER ? "v1" : p.ver === l2.ver ? "v2" : p.ver, why: p.skipped.at(-1)?.why }; };
  assert.deepEqual(after([apply(MARCO)]), { ver: "v1", why: "not_agreed" }, "Marco alone");
  assert.deepEqual(after([agreed("explorer", MARCO), apply(MARCO)]), { ver: "v1", why: "not_agreed" }, "Marco for his own role only");
  assert.deepEqual(after([agreed("keeper", MARCO), agreed("explorer", MARCO), apply(MARCO)]), { ver: "v1", why: "not_agreed" }, "Marco cannot agree for the keeper");
  assert.deepEqual(after([agreed("keeper", "agent:frank"), agreed("explorer", MARCO), apply(MARCO)]), { ver: "v1", why: "not_agreed" }, "nor can Frank's agent");
  assert.deepEqual(after([agreed("keeper", FRANK), agreed("explorer", MARCO), apply(MARCO)]), { ver: "v2", why: undefined }, "both agreed: taken");
  assert.deepEqual(after([agreed("keeper", FRANK), agreed("explorer", MARCO), apply("person:mallory")]), { ver: "v1", why: "not_allowed" }, "no role: no apply");
  assert.deepEqual(after([agreed("keeper", FRANK), agreed("explorer", MARCO), apply(MARCO, "0".repeat(64))]), { ver: "v1", why: "wrong_from" });
  // a rule's change touches no role: the keeper alone applies it, no one agrees
  const w3 = raw(); w3.prev = VER; w3.rules.expired.any[0].all[0].older = "30d";
  const l3 = load(w3);
  assert.deepEqual(touched(L.way!, l3.way!), []);
  assert.equal(fold(WAY, [...base.events, applied(l3.ver, day(2, 9), VER, FRANK)], waysOf(L, l3)).ver, l3.ver);
  // not pinned, not clean, not this way, not known: never applied
  const t4 = JSON.parse(FILE); t4.rules.expired.any[0].all[0].older = "30d";
  const l4 = load(t4);
  assert.equal(fold(WAY, [...base.events, applied(l4.ver, day(2, 9), VER, FRANK)], waysOf(L, l4)).skipped.at(-1)?.why, "unpinned");
  const w5 = raw(); w5.colour = "red";
  const l5 = load(w5);
  assert.equal(fold(WAY, [...base.events, applied(l5.ver, day(2, 9), VER, FRANK)], waysOf(L, l5)).skipped.at(-1)?.why, "way_unread");
  assert.equal(fold(WAY, [...base.events, applied("f".repeat(64), day(2, 9), VER, FRANK)], ways0).skipped.at(-1)?.why, "version_unread");
  assert.equal(fold(WAY, [applied(VER, 0, "", "person:mallory")], ways0).ver, "", "the first version: its signer holds a role in it");
  // Marco's promote under his own version is never taken while the keeper has not agreed
  const p = fold(WAY, [...base.events, apply(MARCO)], ways);
  const d = decide(l2, p, { asker: MARCO, thing: "d1", move: "promote" }, day(2, 10));
  assert.equal(d.why, "old_version");
  // an agreement counts once, for its own `to`, from the version it was given under
  const twice = fold(WAY, [...base.events, agreed("keeper", FRANK), agreed("explorer", MARCO), apply(MARCO), { ...applied(VER, day(2, 10), l2.ver, FRANK), kind: "way.reverted", id: "rv0" }], ways);
  assert.equal(twice.ver, l2.ver, "back to v1 touches keeper and explorer: Frank holds one, the other did not agree");
  const w7 = raw(); w7.prev = VER; w7.rules.expired.any[1].older = "50d";
  const l7 = load(w7), ways7 = waysOf(L, l2, l7);
  assert.equal(fold(WAY, [...base.events, agreed("keeper", FRANK), agreed("explorer", MARCO), applied(l7.ver, day(2, 8, 30), VER, FRANK), { ...apply(MARCO), value: { way: WAY, from: l7.ver, to: l2.ver, reader: 1 } }], ways7).ver, l7.ver, "given under v1, not counted from v1'");
  const w8 = raw(); w8.prev = VER; const pr8 = w8.life.draft.moves.find((m: any) => m.id === "promote"); pr8.by = ["keeper", "explorer"]; w8.rules.expired.any[1].older = "50d";
  const l8 = load(w8);
  assert.equal(fold(WAY, [...base.events, agreed("keeper", FRANK), agreed("explorer", MARCO), apply(MARCO, VER, l8.ver)], waysOf(L, l2, l8)).ver, VER, "given for another `to`");
  // a revert: from the current version, to one it was on, by someone of the way
  const on2 = [...base.events, agreed("keeper", FRANK), agreed("explorer", MARCO), apply(MARCO)];
  const rev = (by: string, to = VER, from = l2.ver): WayEvent => ({ kind: "way.reverted", item: WAY, at: day(3, 9), id: `rv-${by}-${to.slice(0, 4)}`, by, value: { way: WAY, from, to } });
  const r = (...e: WayEvent[]) => { const q = fold(WAY, [...on2, ...e], ways); return { ver: q.ver === VER ? "v1" : q.ver === l2.ver ? "v2" : q.ver, why: q.skipped.at(-1)?.why }; };
  assert.deepEqual(r(rev(FRANK)), { ver: "v2", why: "not_agreed" }, "back to explorer-may-promote: the explorer agrees too");
  assert.deepEqual(r(agreed("explorer", MARCO, VER), rev(FRANK)), { ver: "v1", why: undefined });
  assert.deepEqual(r(rev("person:mallory")), { ver: "v2", why: "not_allowed" });
  assert.deepEqual(r(rev(FRANK, "f".repeat(64))), { ver: "v2", why: "unknown_version" });
  assert.deepEqual(r(rev(FRANK, VER, "0".repeat(64))), { ver: "v2", why: "wrong_from" });
  // a role a version adds: agreed by the person it names, in the new version
  const w6 = raw(); w6.prev = VER; w6.roles.reviewer = { name: "審", who: ["person:isaac"] }; w6.life.draft.moves.find((m: any) => m.id === "want").by = ["explorer", "reviewer"];
  const l6 = load(w6), ways6 = waysOf(L, l6);
  assert.deepEqual(touched(L.way!, l6.way!), ["explorer", "reviewer"]);
  const ag6 = (role: string, by: string): WayEvent => ({ ...agreed(role, by, l6.ver), id: `a6-${role}-${by}` });
  assert.equal(fold(WAY, [...base.events, ag6("explorer", MARCO), ag6("reviewer", "person:isaac"), apply(MARCO, VER, l6.ver)], ways6).ver, l6.ver);
  assert.equal(fold(WAY, [...base.events, ag6("explorer", MARCO), ag6("reviewer", MARCO), apply(MARCO, VER, l6.ver)], ways6).ver, VER);
});

test("F1 (first apply): nobody is put into a role without pressing: a way's first version needs an agreement from each role it names, signed by a person it names there", () => {
  const ag = (role: string, by?: string): WayEvent => ({ kind: "way.agreed", item: WAY, at: day(-1, 0), id: `fa-${role}-${by}`, value: { way: WAY, to: VER, role }, ...(by ? { by } : {}) });
  const first = applied(VER, day(-1, 1), "", FRANK);
  const p = (...e: WayEvent[]) => { const q = fold(WAY, e, waysOf(L)); return [q.ver === VER ? "on" : q.ver, q.skipped.at(-1)?.why]; };
  assert.deepEqual(p(first), ["", "not_agreed"], "no one agreed");
  assert.deepEqual(p(ag("keeper", FRANK), first), ["", "not_agreed"], "the explorer did not");
  assert.deepEqual(p(ag("explorer", MARCO), first), ["", "not_agreed"], "the keeper did not");
  assert.deepEqual(p(ag("keeper", FRANK), ag("explorer", MARCO), first), ["on", undefined]);
  // an agreement signed by someone the first version does not name in that role does not count
  assert.deepEqual(p(ag("keeper", FRANK), ag("explorer", FRANK), first), ["", "not_agreed"], "Frank for the explorer");
  assert.deepEqual(p(ag("keeper", FRANK), ag("explorer", "agent:marco"), first), ["", "not_agreed"], "Marco's agent for Marco");
  assert.deepEqual(p(ag("keeper", "machine:nucbox@frank"), ag("explorer", MARCO), first), ["", "not_agreed"], "Frank's machine for Frank");
  // an agreement for another first version does not count for this one
  const w = raw(); w.name = "another"; const other = load(w);
  assert.deepEqual(fold(WAY, [{ ...ag("keeper", FRANK), value: { way: WAY, to: other.ver, role: "keeper" } }, ag("explorer", MARCO), first], waysOf(L, other)).skipped.at(-1)?.why, "not_agreed");
});

test("F1 (revert): going back is apply's rule read backwards: an explorer cannot revert to the version that let him promote, a rule's change goes back with one press, a change of runner touches every role", () => {
  // v1: the explorer may promote too; v2, agreed by keeper and explorer: the keeper alone, with its rule again
  const w1 = raw(); const pr1 = w1.life.draft.moves.find((m: any) => m.id === "promote"); pr1.by = ["keeper", "explorer"]; delete pr1.when;
  const l1 = load(w1), v1 = l1.ver, v2 = VER;
  const ways = waysOf(l1, L);
  assert.deepEqual(touched(l1.way!, L.way!), ["explorer", "keeper"]);
  const ag = (role: string, by: string, to: string, at: number): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `ag-${role}-${by}-${to.slice(0, 4)}-${at}`, by, value: { way: WAY, to, role } });
  const b = book([applied(v1, day(-2, 0), "", FRANK), ag("keeper", FRANK, v2, day(-1, 0)), ag("explorer", MARCO, v2, day(-1, 0)), applied(v2, day(-1, 1), v1, FRANK)]);
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "x", switch: "s" } }, day(0, 9)).drafts, MARCO);
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  assert.equal(fold(WAY, b.events, ways).ver, v2);
  assert.equal(fold(WAY, b.events, ways).things.d1.state, "wanted");
  const rev = (by: string, to: string, from: string, at = day(2, 9)): WayEvent => ({ kind: "way.reverted", item: WAY, at, id: `rv-${by}-${at}`, by, value: { way: WAY, from, to } });
  const ver = (...e: WayEvent[]) => { const p = fold(WAY, [...b.events, ...e], ways); return [p.ver === v1 ? "v1" : p.ver === v2 ? "v2" : p.ver, p.skipped.at(-1)?.why]; };
  assert.deepEqual(ver(rev(MARCO, v1, v2)), ["v2", "not_agreed"], "Marco alone cannot take back what the keeper agreed to");
  assert.deepEqual(ver(ag("keeper", MARCO, v1, day(2, 8)), rev(MARCO, v1, v2)), ["v2", "not_agreed"], "nor agree for the keeper");
  assert.deepEqual(ver(ag("keeper", FRANK, v1, day(2, 8)), rev(MARCO, v1, v2)), ["v1", undefined], "with the keeper's agreement he can");
  // so Marco's own promote under v1 is never taken
  const promote: WayEvent = { kind: "way.move", item: "d1", at: day(2, 10), id: "mp", by: MARCO, value: { way: WAY, ver: v1, thing: "d1", move: "promote", from: "wanted", to: "official", by: "explorer" } };
  assert.deepEqual(fold(WAY, [...b.events, rev(MARCO, v1, v2), promote], ways).things.d1.state, "wanted");
  // a change of a rule only touches no role: anyone of the way takes it back with one press
  const w3 = raw(); w3.rules.expired.any[0].all[0].older = "30d";
  const l3 = load(w3), ways3 = waysOf(l1, L, l3);
  const on3 = [...b.events, applied(l3.ver, day(2, 0), v2, FRANK)];
  assert.equal(fold(WAY, on3, ways3).ver, l3.ver);
  assert.equal(fold(WAY, [...on3, rev(MARCO, v2, l3.ver)], ways3).ver, v2);
  assert.equal(fold(WAY, [...on3, rev("person:mallory", v2, l3.ver)], ways3).ver, l3.ver, "but no one outside it");
  // a change of runner touches every role, to apply and to go back
  const w4 = raw(); w4.runner = "nucbox@marco";
  const l4 = load(w4), ways4 = waysOf(l1, L, l4);
  assert.deepEqual(touched(L.way!, l4.way!), ["explorer", "keeper"]);
  const z = raw(); z.zone = "Europe/Berlin";
  assert.deepEqual(touched(L.way!, load(z).way!), [], "a change of zone touches no role");
  assert.equal(fold(WAY, [...b.events, applied(l4.ver, day(2, 0), v2, MARCO)], ways4).skipped.at(-1)?.why, "not_agreed");
  const on4 = [...b.events, ag("keeper", FRANK, l4.ver, day(1, 23)), ag("explorer", MARCO, l4.ver, day(1, 23)), applied(l4.ver, day(2, 0), v2, MARCO)];
  assert.equal(fold(WAY, on4, ways4).ver, l4.ver);
  assert.equal(fold(WAY, [...on4, rev(MARCO, v2, l4.ver)], ways4).skipped.at(-1)?.why, "not_agreed", "back to Frank as runner: Frank agrees");
  assert.equal(fold(WAY, [...on4, ag("keeper", FRANK, v2, day(2, 1)), rev(MARCO, v2, l4.ver)], ways4).ver, v2);
  // 4a.1: another machine of the same login is a change of runner like any other: every role, to apply and to go back
  const w5 = raw(); w5.runner = "macbook@frank";
  const l5 = load(w5), ways5 = waysOf(l1, L, l5);
  assert.deepEqual(l5.problems, []); assert.notEqual(l5.ver, VER);
  assert.deepEqual(touched(L.way!, l5.way!), ["explorer", "keeper"]);
  assert.deepEqual(touched(l5.way!, L.way!), ["explorer", "keeper"]);
  assert.equal(fold(WAY, [...b.events, applied(l5.ver, day(2, 0), v2, FRANK)], ways5).skipped.at(-1)?.why, "not_agreed", "Frank cannot move the runner to his laptop alone");
  assert.equal(fold(WAY, [...b.events, ag("keeper", FRANK, l5.ver, day(1, 23)), applied(l5.ver, day(2, 0), v2, FRANK)], ways5).skipped.at(-1)?.why, "not_agreed", "nor with his own role's agreement only");
  const on5 = [...b.events, ag("keeper", FRANK, l5.ver, day(1, 23)), ag("explorer", MARCO, l5.ver, day(1, 23)), applied(l5.ver, day(2, 0), v2, FRANK)];
  assert.equal(fold(WAY, on5, ways5).ver, l5.ver);
  assert.equal(fold(WAY, [...on5, rev(FRANK, v2, l5.ver)], ways5).skipped.at(-1)?.why, "not_agreed", "back to the NucBox: Marco agrees too");
  assert.equal(fold(WAY, [...on5, ag("explorer", MARCO, v2, day(2, 1)), rev(FRANK, v2, l5.ver)], ways5).ver, v2);
  // and under the new version the old runner's Sol is nobody: the laptop fires, the NucBox does not
  const p5 = fold(WAY, on5, ways5);
  assert.deepEqual(due(l5, p5, TICK(14), ME).drafts, []);
  assert.deepEqual(due(l5, p5, TICK(14), "macbook@frank").drafts.map(short), ["way.fired thing=d1 trigger=remind"]);
  const f5 = (by: string) => fold(WAY, [...on5, { kind: "way.fired", item: "d1", at: TICK(14), id: "f5", by, value: { way: WAY, ver: l5.ver, thing: "d1", trigger: "remind", tick: TICK(14) } }], ways5).skipped.at(-1)?.why;
  assert.deepEqual([f5(RUNNER), f5(FRANK), f5(LAPTOP)], ["not_runner", "not_runner", undefined]);
});

test("F1 (stale agreements): an agreement never counts across a change of version: A to B, back to A, then B needs fresh agreements; one given on A is gone once A to C is taken", () => {
  const w1 = raw(); const pr1 = w1.life.draft.moves.find((m: any) => m.id === "promote"); pr1.by = ["keeper", "explorer"]; delete pr1.when;
  const A = L, B = load(w1);
  const w3 = raw(); w3.rules.expired.any[0].all[0].older = "30d";
  const C = load(w3);
  const ways = waysOf(A, B, C);
  const ag = (role: string, by: string, to: string, at: number): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `ag-${role}-${to.slice(0, 4)}-${at}`, by, value: { way: WAY, to, role } });
  const ap = (to: string, from: string, by: string, at: number): WayEvent => ({ ...applied(to, at, from, by), id: `ap-${to.slice(0, 4)}-${at}` });
  const rv = (to: string, from: string, by: string, at: number): WayEvent => ({ kind: "way.reverted", item: WAY, at, id: `rv-${to.slice(0, 4)}-${at}`, by, value: { way: WAY, from, to } });
  const name = (v: string) => (v === A.ver ? "A" : v === B.ver ? "B" : v === C.ver ? "C" : v);
  const at = (...e: WayEvent[]) => { const p = fold(WAY, [...firstAgreed(A.ver, 0), applied(A.ver, 0, "", FRANK), ...e], ways); return [name(p.ver), p.skipped.at(-1)?.why]; };
  const toB = [ag("keeper", FRANK, B.ver, 1), ag("explorer", MARCO, B.ver, 1), ap(B.ver, A.ver, MARCO, 2)];
  const backToA = [ag("keeper", FRANK, A.ver, 3), ag("explorer", MARCO, A.ver, 3), rv(A.ver, B.ver, FRANK, 4)];
  assert.deepEqual(at(...toB), ["B", undefined]);
  assert.deepEqual(at(...toB, ...backToA), ["A", undefined]);
  assert.deepEqual(at(...toB, ...backToA, ap(B.ver, A.ver, MARCO, 5)), ["A", "not_agreed"], "B again: fresh agreements");
  assert.deepEqual(at(...toB, ...backToA, ag("keeper", FRANK, B.ver, 5), ag("explorer", MARCO, B.ver, 5), ap(B.ver, A.ver, MARCO, 6)), ["B", undefined]);
  // agreements for B given on A; A to C (a rule's change), back to A: they are gone
  const viaC = [ag("keeper", FRANK, B.ver, 1), ag("explorer", MARCO, B.ver, 1), ap(C.ver, A.ver, FRANK, 2), rv(A.ver, C.ver, MARCO, 3)];
  assert.deepEqual(at(...viaC), ["A", undefined]);
  assert.deepEqual(at(...viaC, ap(B.ver, A.ver, MARCO, 4)), ["A", "not_agreed"]);
  // the same with A applied again instead of reverted to: an apply clears them too
  const viaCapply = [ag("keeper", FRANK, B.ver, 1), ag("explorer", MARCO, B.ver, 1), ap(C.ver, A.ver, FRANK, 2), ap(A.ver, C.ver, FRANK, 3)];
  assert.deepEqual(at(...viaCapply), ["A", undefined]);
  assert.deepEqual(at(...viaCapply, ap(B.ver, A.ver, MARCO, 4)), ["A", "not_agreed"]);
});

test("F5 (parity): a fact judged at its own time and dated more than SKEW after the book first had it is passed over; one dated earlier than the thing's last event is taken", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  // the book first had each at `seen`; each says it happened an hour later
  const late = (e: WayEvent, seen: number) => ({ ...e, seen });
  const hour = 3_600_000;
  const want: WayEvent = { kind: "way.move", item: "d1", at: day(2, 10), id: "want", by: MARCO, value: { way: WAY, ver: VER, thing: "d1", move: "want", from: "on_switch", to: "wanted", by: "explorer" } };
  const fired: WayEvent = { kind: "way.fired", item: "d1", at: TICK(14), id: "f14", by: RUNNER, value: { way: WAY, ver: VER, trigger: "remind", thing: "d1", tick: TICK(14) } };
  const check: WayEvent = { kind: "way.checked", item: "d1", at: day(2, 10), id: "c1", by: FRANK, value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam: "gate.green", pv: 1, pkg: `sha256:${PRINT}`, pass: true, at: day(2, 10) } };
  const drop = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(3, 10));
  const c = book(b.events.slice());
  const ids = c.write(drop.drafts, MARCO);
  const act: WayEvent = { kind: "way.acted", item: "d1", at: day(3, 11), id: "a1", by: MARCO, value: { ...acted(L.way!, VER, "d1", "switch.off", false, day(3, 11)).value, because: ids[drop.acts[0].after] } };
  for (const [what, base, e] of [["a move", b.events, want], ["a firing", b.events, fired], ["a check", b.events, check], ["an act", c.events, act]] as [string, WayEvent[], WayEvent][]) {
    assert.deepEqual(fold(WAY, [...base, e], ways).skipped, [], what);
    assert.deepEqual(fold(WAY, [...base, late(e, e.at)], ways).skipped, [], `${what}: seen when dated`);
    assert.equal(fold(WAY, [...base, late(e, e.at - hour)], ways).skipped.at(-1)?.why, "ahead", `${what}: dated an hour after it was seen`);
  }
  // an offline Sol's press arrives after a later one: dated earlier than the thing's last event, it is taken
  const ext = b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, day(5, 10)).drafts, MARCO);
  assert.ok(ext.length);
  const earlier = { ...want, at: day(4, 10), seen: day(6, 0) };
  const p = fold(WAY, [...b.events, earlier], ways);
  assert.deepEqual(p.skipped, []); assert.equal(p.things.d1.state, "wanted");
});

test("F2: the fold judges a move's `when` again on the checks the press names, and a trigger's move only after a firing it judged again", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  const promoteBy = (by: string, checks?: string[], at = day(2, 10)): WayEvent => ({ kind: "way.move", item: "d1", at, id: `pr-${by}-${checks?.length}`, by, value: { way: WAY, ver: VER, thing: "d1", move: "promote", from: "wanted", to: "official", by: "keeper", ...(checks ? { checks } : {}) } });
  const check = (seam: string, pass: boolean, by: string, id = `c-${seam}-${by}-${pass}`): WayEvent => ({ kind: "way.checked", item: "d1", at: day(2, 10), id, by, value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam, pv: 1, pkg: `sha256:${PRINT}`, pass, at: day(2, 10) } });
  const seams = ["contract.written", "undo.works", "data.ok", "gate.green", "used.enough"];
  const state = (extra: WayEvent[]) => { const p = fold(WAY, [...b.events, ...extra], ways); return [p.things.d1.state, p.skipped.at(-1)?.why]; };
  assert.deepEqual(state([promoteBy(FRANK)]), ["wanted", "rule_unread"], "no check at all: solid never judged");
  const green = seams.map((s) => check(s, true, FRANK));
  assert.deepEqual(state([...green, promoteBy(FRANK, green.map((c) => c.id!))]), ["official", undefined]);
  const red = seams.map((s) => check(s, s !== "gate.green", FRANK));
  assert.deepEqual(state([...red, promoteBy(FRANK, red.map((c) => c.id!))]), ["wanted", "rule_failed"]);
  const marcos = seams.map((s) => check(s, true, MARCO));
  assert.deepEqual(state([...marcos, promoteBy(FRANK, marcos.map((c) => c.id!))]), ["wanted", "rule_unread"], "checks signed by another are no answer");
  const split = [...green, check("gate.green", false, FRANK, "c-split")];
  assert.deepEqual(state([...split, promoteBy(FRANK, split.map((c) => c.id!))]), ["wanted", "rule_unread"], "a seam answered both ways is not answered");
  // a trigger's move: only after a folded firing of that trigger, judged again at its tick, signed by the runner
  const drop = (because?: string, by = RUNNER, at = day(1, 10)): WayEvent => ({ kind: "way.move", item: "d1", at, id: `dr-${because}-${by}`, by, value: { way: WAY, ver: VER, thing: "d1", move: "drop", from: "wanted", to: "to_remove", by: "trigger:expire", ...(because ? { because } : {}) } });
  assert.deepEqual(state([drop()]), ["wanted", "not_fired"], "day 1, no firing");
  const fired = (tick: number, at = tick, by = RUNNER, trigger = "expire"): WayEvent => ({ kind: "way.fired", item: "d1", at, id: `f-${tick}-${by}-${trigger}`, by, value: { way: WAY, ver: VER, trigger, thing: "d1", tick } });
  assert.deepEqual(state([fired(TICK(1))]), ["wanted", "rule_failed"], "a firing whose `if` does not pass at its tick is passed over");
  assert.deepEqual(state([fired(TICK(1)), drop(fired(TICK(1)).id)]), ["wanted", "not_fired"]);
  assert.deepEqual(state([fired(TICK(21), TICK(21), MARCO)]), ["wanted", "not_runner"]);
  assert.deepEqual(state([fired(day(21, 9, 31))]), ["wanted", "bad_tick"], "a tick its `on` does not name");
  assert.deepEqual(state([fired(TICK(21), TICK(20))]), ["wanted", "bad_tick"], "written before its tick");
  const f21 = fired(TICK(21));
  assert.deepEqual(state([f21, drop(f21.id, RUNNER, TICK(21))]), ["to_remove", undefined]);
  assert.deepEqual(state([f21, drop(f21.id, RUNNER, TICK(21)), { ...drop(f21.id, RUNNER, TICK(21)), id: "again" }]), ["to_remove", "wrong_state"]);
  const remind = fired(TICK(21), TICK(21), RUNNER, "remind");
  assert.deepEqual(state([remind, drop(remind.id, RUNNER, TICK(21))]), ["wanted", "not_fired"], "another trigger's firing");
});

test("F13, F14, M8: an act counts by the version of the move it followed, a tick fires once, and an act answers only a move that entered a state with that act", () => {
  // F13: Marco drops d1, Frank applies a renamed version a minute later, Marco's Sol reports switch.off failed
  const w2 = raw(); w2.prev = VER; w2.name = "草稿生命週期 v2";
  const l2 = load(w2), ways = waysOf(L, l2);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  const d = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(2, 10));
  const ids = b.write(d.drafts, MARCO);
  b.events.push(applied(l2.ver, day(2, 10, 1), VER, FRANK));
  b.write([{ ...acted(L.way!, VER, "d1", "switch.off", false, day(2, 10, 2)), value: { ...acted(L.way!, VER, "d1", "switch.off", false, day(2, 10, 2)).value, because: ids[d.acts[0].after] } }], MARCO);
  const p = fold(WAY, b.events, ways);
  assert.equal(p.ver, l2.ver);
  assert.deepEqual(p.things.d1.red, ["switch.off"]); assert.deepEqual(p.skipped, []);
  // F14 (4a.1): two Sols of one login. Only the Sol the way names is given anything, so one firing and one ping; a
  // firing the other Sol writes all the same, as itself or with its person's key, is not the runner's
  const c = book([applied(VER)]);
  make(c, L, "d1", day(0, 9));
  const q = fold(WAY, c.events, waysOf(L));
  const laptop = due(L, q, TICK(14), "macbook@frank"), nucbox = due(L, q, TICK(14) + 60_000, ME);
  assert.deepEqual(laptop, { drafts: [], acts: [], pings: [] }, "the Sol not named gets nothing");
  assert.deepEqual([nucbox.drafts.map(short), nucbox.pings.length], [["way.fired thing=d1 trigger=remind"], 1]);
  c.write(nucbox.drafts, LAPTOP);   // the laptop writes the same firing as itself
  c.write(nucbox.drafts, FRANK);    // and as Frank himself: the runner's person is not the runner
  assert.deepEqual(fold(WAY, c.events, waysOf(L)).skipped.map((x) => x.why), ["not_runner", "not_runner"]);
  c.write(nucbox.drafts, RUNNER);
  c.write(due(L, q, TICK(14) + 120_000, ME).drafts, RUNNER);   // the named Sol asked again before it folded its own firing
  const r = fold(WAY, c.events, waysOf(L));
  assert.deepEqual(r.skipped.map((x) => x.why), ["not_runner", "not_runner", "fired_twice"]);
  assert.deepEqual(Object.keys(r.fires).length, 1);
  assert.deepEqual(due(L, r, TICK(14) + 180_000, ME), { drafts: [], acts: [], pings: [] }, "once folded, nothing more is due for that tick");
  // M8: a way where the keeper can poke a thing in to_remove (stays there); an act answering the poke is not caused
  const w3 = raw(); w3.life.draft.moves.push({ id: "poke", from: "to_remove", to: "same", by: ["keeper"] });
  const l3 = load(w3), ways3 = waysOf(l3);
  assert.deepEqual(l3.problems, []);
  const e = book([applied(l3.ver)]);
  make(e, l3, "d1", day(0, 9));
  const dd = decide(l3, fold(WAY, e.events, ways3), { asker: MARCO, thing: "d1", move: "drop" }, day(2, 10));
  const dropIds = e.write(dd.drafts, MARCO);
  const poke = decide(l3, fold(WAY, e.events, ways3), { asker: FRANK, thing: "d1", move: "poke" }, day(3, 10));
  assert.deepEqual(poke.acts, [], "staying in a state is not entering it");
  const pokeIds = e.write(poke.drafts, FRANK);
  const actOn = (because: string, by: string): WayEvent => ({ kind: "way.acted", item: "d1", at: day(3, 11), id: `a-${because}`, by, value: { way: WAY, ver: l3.ver, thing: "d1", seam: "switch.off", pv: 1, pkg: `sha256:${PRINT}`, ok: false, because } });
  assert.equal(fold(WAY, [...e.events, actOn(pokeIds[0], FRANK)], ways3).skipped.at(-1)?.why, "not_caused");
  assert.deepEqual(fold(WAY, [...e.events, actOn(dropIds[dd.acts[0].after], MARCO)], ways3).things.d1.red, ["switch.off"]);
});

test("F5: when the book says when it first had a make, a make dated more than SKEW ahead of that is passed over", () => {
  const b = book([applied(VER)]);
  make(b, L, "d1", day(400, 9));
  const ways = waysOf(L);
  const seen = (s: number) => b.events.map((e) => (e.kind === "way.made" ? { ...e, seen: s } : e));
  const ahead = fold(WAY, seen(day(0, 9)), ways);
  assert.equal(ahead.things.d1, undefined); assert.equal(ahead.skipped[0].why, "ahead");
  assert.equal(fold(WAY, seen(day(400, 9) - SKEW), ways).things.d1.born, day(400, 9), "within the skew");
  assert.equal(fold(WAY, b.events, ways).things.d1.born, day(400, 9), "no receive time said: the order and the time are the caller's (step four)");
});

// ---------- E. triggers ----------

test("a trigger fires only on the runner's Sol, once a tick, in the way's zone across both changes of the clocks", () => {
  const z = "America/New_York", on = readOn("daily 09:30")!;
  // fall back, Sunday 2026-11-01: 09:30 is 13:30Z the day before and 14:30Z that day
  assert.equal(lastTick(on, Date.UTC(2026, 10, 1, 14, 0), z), Date.UTC(2026, 9, 31, 13, 30));
  assert.equal(lastTick(on, Date.UTC(2026, 10, 1, 14, 30), z), Date.UTC(2026, 10, 1, 14, 30));
  // spring forward, Sunday 2026-03-08: 14:30Z the day before, 13:30Z that day
  assert.equal(lastTick(on, Date.UTC(2026, 2, 8, 13, 29), z), Date.UTC(2026, 2, 7, 14, 30));
  assert.equal(lastTick(on, Date.UTC(2026, 2, 8, 13, 30), z), Date.UTC(2026, 2, 8, 13, 30));
  assert.deepEqual(ticksBetween(on, Date.UTC(2026, 9, 30, 12), Date.UTC(2026, 10, 2, 23), z),
    [Date.UTC(2026, 9, 30, 13, 30), Date.UTC(2026, 9, 31, 13, 30), Date.UTC(2026, 10, 1, 14, 30), Date.UTC(2026, 10, 2, 14, 30)]);
  // weekly: Mondays 08:00, the Monday after the change
  const mon = readOn("weekly mon 08:00")!;
  assert.equal(lastTick(mon, Date.UTC(2026, 10, 4, 0), z), Date.UTC(2026, 10, 2, 13, 0));
  assert.equal(lastTick(mon, Date.UTC(2026, 10, 2, 12, 59), z), Date.UTC(2026, 9, 26, 12, 0));
  assert.deepEqual(readOn("weekly monday 08:00"), mon);
  assert.equal(readOn("weekly funday 08:00"), null);
  // this machine's zone does not count
  const tz = process.env.TZ;
  try {
    process.env.TZ = "Asia/Taipei";
    assert.equal(lastTick(on, Date.UTC(2026, 10, 1, 14, 30), z), Date.UTC(2026, 10, 1, 14, 30));
    process.env.TZ = "Pacific/Kiritimati";
    assert.equal(lastTick(on, Date.UTC(2026, 2, 8, 13, 30), z), Date.UTC(2026, 2, 8, 13, 30));
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }

  // a thing born across the fall-back night: due at 09:30 New York time, on the runner's Sol only
  const w = raw(); w.triggers.remind.if.all[1].older = "1d";
  const l = load(w), ways = waysOf(l);
  const b = book([applied(l.ver, Date.UTC(2026, 9, 30))]);
  make(b, l, "d1", Date.UTC(2026, 9, 31, 14, 0));
  const p = fold(WAY, b.events, ways);
  assert.deepEqual(due(l, p, Date.UTC(2026, 10, 1, 14, 29), ME).drafts, [], "09:29 New York: the last tick is the day before, before its birth (10:00 the day before)");
  // only the one Sol the way names: not its person's login, not another Sol of that login, not the signer's spelling
  for (const other of ["nucbox@marco", "frank", "Frank", "macbook@frank", "NucBox@frank", "nucbox@Frank", "person:frank", "machine:nucbox@frank", "nucbox", ""])
    assert.deepEqual(due(l, p, Date.UTC(2026, 10, 1, 14, 30), other), { drafts: [], acts: [], pings: [] }, `${other}: not the runner`);
  const d = due(l, p, Date.UTC(2026, 10, 1, 14, 30), ME);
  assert.deepEqual(d.drafts.map(short), ["way.fired thing=d1 trigger=remind"]);
  assert.equal(d.drafts[0].value.tick, Date.UTC(2026, 10, 1, 14, 30));
  assert.deepEqual(d.pings, [{ role: "explorer", trigger: "remind", thing: "d1", say: "轉正還是拔？", tick: Date.UTC(2026, 10, 1, 14, 30) }]);
  b.write(d.drafts, RUNNER);
  assert.deepEqual(fold(WAY, b.events, ways).skipped, []);
  assert.deepEqual(due(l, fold(WAY, b.events, ways), Date.UTC(2026, 10, 1, 20), ME).drafts, [], "once a tick (and remind once at all)");
  // a Sol closed for days fires once, for the latest tick
  const w3 = raw(); w3.triggers.remind.if = { in: ["on_switch", "wanted"] };
  const l3 = load(w3), ways3 = waysOf(l3);
  const b3 = book([applied(l3.ver, day(-1, 0))]);
  make(b3, l3, "d1", day(0, 9));
  const late = due(l3, fold(WAY, b3.events, ways3), day(5, 12), ME);
  assert.deepEqual(late.drafts.map((x) => x.value.tick), [TICK(5)]);
  b3.write(late.drafts, RUNNER);
  // a trigger whose rule lets it fire every day fires once a tick: not again the same day, again the next
  assert.deepEqual(due(l3, fold(WAY, b3.events, ways3), day(5, 23), ME).drafts, []);
  const next = due(l3, fold(WAY, b3.events, ways3), TICK(6), ME);
  assert.deepEqual(next.drafts.map((x) => x.value.tick), [TICK(6)]);
  b3.write(next.drafts, RUNNER);
  assert.deepEqual(fold(WAY, b3.events, ways3).skipped, []);
});

test("M9 and the skipped and repeated wall times: a skipped time fires at the first instant after the skip, a repeated one once, the first time, in New York and in Berlin", () => {
  const ny = "America/New_York", be = "Europe/Berlin";
  const at = (z: string, y: number, mo: number, d: number, h: number, mi: number) => momentOf(Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000), h * 60 + mi, z);
  // New York, 2027-03-14: 02:00 EST becomes 03:00 EDT; 02:30 happens at 03:00 EDT (07:00Z)
  assert.equal(at(ny, 2027, 3, 14, 2, 30), Date.UTC(2027, 2, 14, 7, 0));
  assert.equal(at(ny, 2027, 3, 14, 1, 30), Date.UTC(2027, 2, 14, 6, 30));
  assert.equal(at(ny, 2027, 3, 14, 3, 0), Date.UTC(2027, 2, 14, 7, 0));
  // New York, 2027-11-07: 01:30 is shown twice (05:30Z EDT, 06:30Z EST): the first
  assert.equal(at(ny, 2027, 11, 7, 1, 30), Date.UTC(2027, 10, 7, 5, 30));
  assert.deepEqual(ticksBetween(readOn("daily 01:30")!, Date.UTC(2027, 10, 6, 12), Date.UTC(2027, 10, 7, 12), ny), [Date.UTC(2027, 10, 7, 5, 30)]);
  assert.deepEqual(ticksBetween(readOn("daily 02:30")!, Date.UTC(2027, 2, 13, 12), Date.UTC(2027, 2, 14, 12), ny), [Date.UTC(2027, 2, 14, 7, 0)]);
  // Berlin, 2027-03-28: 02:00 CET becomes 03:00 CEST
  assert.equal(at(be, 2027, 3, 28, 1, 30), Date.UTC(2027, 2, 28, 0, 30));
  assert.equal(at(be, 2027, 3, 28, 2, 30), Date.UTC(2027, 2, 28, 1, 0));
  assert.equal(at(be, 2027, 3, 28, 3, 30), Date.UTC(2027, 2, 28, 1, 30));
  // Berlin, 2027-10-31: 03:00 CEST becomes 02:00 CET; 02:30 is shown at 00:30Z and 01:30Z: the first
  assert.equal(at(be, 2027, 10, 31, 2, 30), Date.UTC(2027, 9, 31, 0, 30));
  assert.equal(at(be, 2027, 10, 31, 1, 30), Date.UTC(2027, 9, 30, 23, 30));
  assert.deepEqual(ticksBetween(readOn("daily 02:30")!, Date.UTC(2027, 9, 30, 12), Date.UTC(2027, 9, 31, 12), be), [Date.UTC(2027, 9, 31, 0, 30)]);
});

test("F10, F15: at one tick the pings come before the moves whatever the ids, and a trigger whose `if` does not pass writes nothing, however often it is asked", () => {
  // F10: the runner's Sol closed from day 13 to day 22: on opening, Marco is asked before the draft is dropped
  const run = (rename: boolean) => {
    const w = raw();
    if (rename) { w.triggers.aa_expire = w.triggers.expire; delete w.triggers.expire; w.life.draft.moves.find((m: any) => m.id === "drop").by = ["explorer", "trigger:aa_expire"]; }
    const l = load(w), ways = waysOf(l);
    const b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    for (let n = 0; n <= 12; n++) b.write(due(l, fold(WAY, b.events, ways), TICK(n), ME).drafts, RUNNER);
    const d = due(l, fold(WAY, b.events, ways), day(22, 10), ME);
    return { pings: d.pings.map((x) => x.trigger), fired: d.drafts.filter((x) => x.kind === "way.fired").map((x) => x.value.trigger) };
  };
  assert.deepEqual(run(false), { pings: ["remind"], fired: ["remind", "expire"] });
  assert.deepEqual(run(true), { pings: ["remind"], fired: ["remind", "aa_expire"] });
  // F15: a trigger whose `if` asks a check that fails, asked once a minute for an hour: nothing written
  const w = raw(); w.triggers.nag = { on: "daily 09:30", if: { all: [{ in: ["on_switch", "wanted"] }, { check: "gate.green" }] }, do: { ping: "keeper" } };
  const l = load(w), ways = waysOf(l);
  const b = book([applied(l.ver)]);
  make(b, l, "d1", day(0, 9));
  let wrote = 0;
  for (let m = 0; m < 60; m++) {
    const d = due(l, fold(WAY, b.events, ways), day(1, 9, 30) + m * 60_000, ME, { "gate.green": { pass: m >= 30 } });
    wrote += d.drafts.length; b.write(d.drafts, RUNNER);
  }
  assert.equal(wrote, 2, "one check and one firing, once the gate is green");
  assert.deepEqual(b.events.slice(-2).map(short), ["way.checked thing=d1 seam=gate.green rule=trigger:nag pass=true", "way.fired thing=d1 trigger=nag"]);
  assert.deepEqual(fold(WAY, b.events, ways).skipped, [], "the fold judges the firing again on the check it names");
});

// ---------- the walk-through of FORMAT §2 ----------

/** FORMAT §2 on one draft made at `born`, with the runner's Sol open at every 09:30 tick from day 0 to day `to`: the
 *  events in order (a day's line for the runner's), and the book */
function walk(born: number, ticks: (n: number) => number, presses: Record<number, () => [string, Omit<Ask, "asker">, Answers?]>, to = 60) {
  const ways = waysOf(L);
  const b = book([applied(VER, born - 86_400_000)]);
  const now = () => fold(WAY, b.events, ways);
  const out: string[] = [];
  make(b, L, "d1", born);
  out.push(...b.events.slice(b.events.findIndex((e) => e.kind === "way.applied") + 1).map(short));
  for (let n = 0; n <= to; n++) {
    const d = due(L, now(), ticks(n), ME);
    // the runner's Sol runs each act and writes what came of it, after the drafts
    const all = [...d.drafts, ...d.acts.map((a) => acted(L.way!, VER, a.thing, a.seam, true, ticks(n), a.after))];
    out.push(...all.map((x) => `day ${n}: ${short(x)}`));
    b.write(all, RUNNER);
    const p = presses[n]?.();
    if (p) {
      const [asker, ask, answers] = p;
      const dd = decide(L, now(), { asker, ...ask }, ticks(n) + 30 * 60_000, answers ?? {});
      out.push(...dd.drafts.map(short)); b.write(dd.drafts, asker);
    }
  }
  return { out, b, p: now() };
}
const WALK: Record<number, () => [string, Omit<Ask, "asker">, Answers?]> = {
  14: () => [MARCO, { thing: "d1", move: "extend" }],
  35: () => [MARCO, { thing: "d1", move: "want" }],
  36: () => [FRANK, { thing: "d1", move: "promote" }, OK5],
  43: () => [FRANK, { thing: "d1", move: "pull" }],
};
const WALKED = [
  "way.made thing=d1 by=explorer",
  "way.move thing=d1 move=make from= to=on_switch by=explorer",
  "way.set about=d1.switch",
  "way.note about=d1.title",
  "day 14: way.fired thing=d1 trigger=remind",
  "way.move thing=d1 move=extend from=on_switch to=on_switch by=explorer",
  "day 35: way.fired thing=d1 trigger=remind_again",
  "way.move thing=d1 move=want from=on_switch to=wanted by=explorer",
  "way.checked thing=d1 seam=contract.written rule=solid pass=true",
  "way.checked thing=d1 seam=undo.works rule=solid pass=true",
  "way.checked thing=d1 seam=data.ok rule=solid pass=true",
  "way.checked thing=d1 seam=gate.green rule=solid pass=false",
  "way.checked thing=d1 seam=used.enough rule=solid pass=true",
  "way.refused thing=d1 move=promote why=rule_failed",
  "day 42: way.fired thing=d1 trigger=expire",
  "day 42: way.move thing=d1 move=drop from=wanted to=to_remove by=trigger:expire",
  "day 42: way.acted thing=d1 seam=switch.off ok=true",
  "way.move thing=d1 move=pull from=to_remove to=removed by=keeper",
];

test("FORMAT §2 walked through, signed as the trail signs it: make, a reminder, extend, day 21 quiet, a second reminder, want, promote refused, expire, switch off, pull", () => {
  const { out, b, p } = walk(day(0, 9), TICK, WALK);
  assert.deepEqual(out, WALKED);
  assert.deepEqual(p.skipped, [], "every Sol that folds the signed book takes every event");
  assert.deepEqual(p.things.d1, { id: "d1", kind: "draft", state: "removed", fields: { title: "New logo", switch: "logo_v2", extended: true }, born: day(0, 9), fired: { remind: TICK(14), remind_again: TICK(35), expire: TICK(42) }, red: [], missing: [] });
  // the trigger's move and its act point at what caused them; the refusal names its five checks
  const ev = (s: string) => b.events.find((e) => short(e).includes(s))!;
  assert.equal(ev("move=drop").value!.because, ev("trigger=expire").id);
  assert.equal(ev("seam=switch.off").value!.because, ev("move=drop").id);
  assert.equal(ev("about=d1.title").value!.because, ev("move=make").id);
  assert.deepEqual(ev("why=rule_failed").value!.checks, b.events.filter((e) => e.kind === "way.checked").map((e) => e.id));
  assert.deepEqual(ev("way.made").value, { way: WAY, ver: VER, thing: "d1", kind: "draft", by: "explorer" });
  // an act that fails: the thing enters the state all the same, red until the act works
  const red = fold(WAY, b.events.map((e) => (e.kind === "way.acted" ? { ...e, value: { ...e.value, ok: false } } : e)), waysOf(L));
  assert.deepEqual(red.things.d1.red, ["switch.off"]);
  assert.equal(red.things.d1.state, "removed");
});

test("F9: the walk-through holds for a draft made at any hour, and across both changes of the clocks", () => {
  // made at 00:01 and at 23:59 on day 0 (New York, November): the same events, the same days
  const strip = (out: string[]) => out;
  for (const born of [day(0, 0, 1), day(0, 23, 59), day(0, 9, 31)]) assert.deepEqual(strip(walk(born, TICK, WALK).out), WALKED, new Date(born).toISOString());
  // made 2027-03-01 at 23:00 New York: day 14 is after the spring change, the ticks are 09:30 New York each day
  const zone = "America/New_York", on = readOn("daily 09:30")!;
  const springTick = (n: number) => lastTick(on, Date.UTC(2027, 2, 1 + n, 20, 0), zone);
  assert.equal(springTick(14), Date.UTC(2027, 2, 15, 13, 30), "09:30 EDT");
  assert.deepEqual(walk(Date.UTC(2027, 2, 2, 4, 0), springTick, WALK).out, WALKED);
  // made 2026-10-15 at 08:00: day 21 and day 42 fall after the fall change
  const fallTick = (n: number) => lastTick(on, Date.UTC(2026, 9, 15 + n, 20, 0), zone);
  assert.deepEqual(walk(Date.UTC(2026, 9, 15, 12, 0), fallTick, WALK).out, WALKED);
  // never extended, made at 22:00: reminded on day 14, dropped on day 21 at its tick
  const never = walk(day(0, 22), TICK, {}, 22).out;
  assert.deepEqual(never.filter((x) => x.startsWith("day")), ["day 14: way.fired thing=d1 trigger=remind", "day 21: way.fired thing=d1 trigger=expire", "day 21: way.move thing=d1 move=drop from=on_switch to=to_remove by=trigger:expire", "day 21: way.acted thing=d1 seam=switch.off ok=true"]);
});

test("F11: a draft past three weeks cannot be extended, even when the runner's Sol was closed and did not drop it", () => {
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  const ext = decide(L, fold(WAY, b.events, waysOf(L)), { asker: MARCO, thing: "d1", move: "extend" }, day(22, 10));
  assert.equal(ext.ok, false); assert.equal(ext.why, "rule_failed");
  b.write(ext.drafts, MARCO);
  const d = due(L, fold(WAY, b.events, waysOf(L)), TICK(23), ME);
  assert.ok(d.drafts.some((x) => x.kind === "way.fired" && x.value.trigger === "expire"));
  // on day 20 it still can
  assert.equal(decide(L, fold(WAY, b.events, waysOf(L)), { asker: MARCO, thing: "d1", move: "extend" }, day(20, 10)).ok, true);
});

// ---------- F. replay ----------

/** the drafts' life twice over, signed: d1 walks FORMAT §2; d2 is never extended, expires at day 21, Frank pulls it */
function history() {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  const now = () => fold(WAY, b.events, ways);
  const press = (asker: string, ask: Omit<Ask, "asker">, at: number, answers: Answers = {}) => b.write(decide(L, now(), { asker, ...ask }, at, answers).drafts, asker);
  const clock = (n: number) => {
    const d = due(L, now(), TICK(n), ME);
    b.write([...d.drafts, ...d.acts.map((a) => acted(L.way!, VER, a.thing, a.seam, true, TICK(n), a.after))], RUNNER);
  };
  make(b, L, "d1", day(0, 9));
  make(b, L, "d2", day(0, 9, 10), MARCO, { title: "Dark mode", switch: "dark" });
  for (let n = 0; n <= 45; n++) {
    clock(n);
    if (n === 14) press(MARCO, { thing: "d1", move: "extend" }, day(14, 10));
    if (n === 23) press(FRANK, { thing: "d2", move: "pull" }, day(23, 10));
    if (n === 35) press(MARCO, { thing: "d1", move: "want" }, day(35, 10));
    if (n === 36) press(FRANK, { thing: "d1", move: "promote" }, day(36, 10), OK5);
    if (n === 40) press("agent:marco", { thing: "d1", move: "drop" }, day(40, 10));   // refused: not a press of anyone's
    if (n === 43) press(FRANK, { thing: "d1", move: "pull" }, day(43, 10));
  }
  return { events: b.events, ways };
}

test("replay: the same version gives the same lives; 21d made 30d differs for the draft that was never extended, from its day-21 expiry", () => {
  const { events, ways } = history();
  const p = fold(WAY, events, ways);
  assert.deepEqual(p.skipped, []);
  assert.equal(p.things.d2.state, "removed"); assert.equal(p.things.d1.state, "removed");
  // the same version: every life the same, the promote refused again from the answers its refusal named
  const same = replay(events, ways, L, L);
  assert.deepEqual(same.things.map((t) => [t.thing, t.same]), [["d1", true], ["d2", true]], JSON.stringify(same.things.map((t) => t.first)));
  assert.ok(same.things[0].now.some((s) => s.kind === "way.refused" && s.move === "promote" && s.why === "rule_failed"));
  // 21 days made 30
  const w2 = raw(); w2.rules.expired.any[0].all[0].older = "30d";
  const l2 = load(w2), ways2 = new Map([...ways, [l2.ver, l2.way!]]);
  const r = replay(events, ways2, L, l2);
  assert.equal(r.from, VER); assert.equal(r.to, l2.ver);
  const [d1, d2] = r.things;
  assert.equal(d1.same, true, "d1 was extended: 42 days either way");
  assert.equal(d2.same, false);
  assert.deepEqual(d2.first, {
    index: 3,
    was: { at: TICK(21), kind: "way.fired", trigger: "expire", tick: TICK(21) },
    now: { at: day(23, 10), kind: "way.refused", move: "pull", why: "wrong_state" },
  });
  assert.deepEqual(d2.wouldBeRefused, [{ at: day(23, 10), move: "pull", why: "wrong_state" }]);
  assert.deepEqual(d2.now.map((s) => `${s.kind} ${s.move ?? s.trigger ?? s.seam ?? s.by} ${s.at === TICK(30) ? "day30" : ""}`.trim()), [
    "way.made explorer", "way.move make", "way.fired remind", "way.refused pull", "way.fired expire day30", "way.move drop day30", "way.acted switch.off day30",
  ]);
  const pv = previewed(r, day(46, 9));
  kept.push(pv);
  assert.deepEqual(pv.value, { way: WAY, from: VER, to: l2.ver, things: 2, differ: 1 });
  // a version without the gate in solid: Frank's promote, refused then, would go through (the other four answers as
  // its refusal named them), and nothing expires after
  const w3 = raw(); w3.rules.solid.all.splice(3, 1);
  const l3 = load(w3);
  const r3 = replay(events, new Map([...ways, [l3.ver, l3.way!]]), L, l3);
  assert.equal(r3.things[0].same, false);
  assert.deepEqual(r3.things[0].first?.now, { at: day(36, 10), kind: "way.move", move: "promote", from: "wanted", to: "official", by: "keeper" });
  assert.equal(r3.things[0].now.at(-1)?.move, "pull", "the last step is the pull press, refused now");
  assert.deepEqual(r3.things[0].wouldBeRefused, [{ at: day(43, 10), move: "pull", why: "wrong_state" }]);
  assert.equal(r3.things[1].same, true);
  // a state renamed by the new version (to_remove becomes to_pull): with the proposal's map, the lives are the same
  const l4 = load(PINNED.replaceAll('"to_remove"', '"to_pull"'));
  assert.deepEqual(l4.problems, []);
  const ways4 = new Map([...ways, [l4.ver, l4.way!]]);
  assert.deepEqual(replay(events, ways4, L, l4, { map: ["to_remove>to_pull"] }).things.map((t) => t.same), [true, true]);
  const unmapped = replay(events, ways4, L, l4).things[1];
  assert.equal(unmapped.same, false);
  assert.equal(unmapped.first?.was?.to, "to_remove"); assert.equal(unmapped.first?.now?.to, "to_pull");
  // a version not pinned yet can be previewed (never applied)
  assert.equal(replay(events, ways, L, load(FILE)).things.length, 2);
  // replay writes nothing: the events are as they were
  assert.equal(fold(WAY, events, ways).things.d2.state, "removed");
});

test("F8: replaying a version over its own history differs nowhere: a runner's Sol closed for days, a failed act done again, a reminder written late", () => {
  const ways = waysOf(L);
  // the runner's Sol closed from day 13 to day 16, opened at 10:00 on day 16
  const a = book([applied(VER)]);
  make(a, L, "d1", day(0, 9));
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17]) a.write(due(L, fold(WAY, a.events, ways), n === 16 ? day(16, 10) : TICK(n), ME).drafts, RUNNER);
  assert.equal(a.events.find((e) => e.kind === "way.fired")!.value!.tick, TICK(16));
  const ra = replay(a.events, ways, L, L, { until: day(18, 0) });
  assert.equal(ra.differ, 0, JSON.stringify(ra.things[0].first));
  // switch.off failed when Marco dropped it, and was done again the next day
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  const d = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(2, 10));
  const ids = b.write(d.drafts, MARCO);
  const actOn = (ok: boolean, at: number) => ({ ...acted(L.way!, VER, "d1", "switch.off", ok, at), value: { ...acted(L.way!, VER, "d1", "switch.off", ok, at).value, because: ids[d.acts[0].after] } });
  b.write([actOn(false, day(2, 10))], MARCO);
  b.write([actOn(true, day(3, 10))], RUNNER);
  assert.deepEqual(fold(WAY, b.events, ways).things.d1.red, []);
  const rb = replay(b.events, ways, L, L, { until: day(4, 0) });
  assert.equal(rb.differ, 0, JSON.stringify(rb.things[0].first));
  assert.deepEqual(rb.things[0].now.at(-1), { at: day(2, 10), kind: "way.acted", seam: "switch.off", ok: true }, "the entry's last answer");
  // the runner's Sol opened at noon on day 14: the 09:30 tick's reminder was written at noon
  const c = book([applied(VER)]);
  make(c, L, "d1", day(0, 9));
  const late = due(L, fold(WAY, c.events, ways), day(14, 12), ME);
  assert.deepEqual(late.drafts.map((x) => [x.at, x.value.tick]), [[day(14, 12), TICK(14)]]);
  c.write(late.drafts, RUNNER);
  const rc = replay(c.events, ways, L, L, { until: day(15, 0) });
  assert.equal(rc.differ, 0, JSON.stringify(rc.things[0].first));
  // the walk-through's own history too, signed
  const { b: wb } = walk(day(0, 9), TICK, WALK);
  assert.equal(replay(wb.events, ways, L, L).differ, 0);
});

test("F4: replay presses a person's move as the roles the signer holds in the new version", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(3, 10)).drafts, MARCO);
  const w2 = raw(); w2.prev = VER; w2.roles.explorer.who = ["person:isaac"];
  const r = replay(b.events, ways, L, load(w2), { until: day(5, 0) });
  assert.equal(r.differ, 1);
  assert.deepEqual(r.things[0].wouldBeRefused.map((x) => [x.move, x.why]), [["make", "not_allowed"], ["want", "unknown_thing"]]);
  // the same events unsigned: passed over (no thing to replay); trusted by a caller that says so, the role written on them
  const unsigned = b.events.map(({ by, ...e }) => e);
  assert.equal(replay(unsigned, ways, L, load(w2), { until: day(5, 0) }).things.length, 0);
  assert.equal(replay(unsigned, ways, L, load(w2), { until: day(5, 0), unsigned: "trust" }).differ, 0);
  // Marco keeps the role: the same
  assert.equal(replay(b.events, ways, L, L, { until: day(5, 0) }).differ, 0);
});

test("F7, M11: replay takes a press's answers from the checks that press named, never a check another wrote nor one from later", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(2, 10)).drafts, MARCO);
  b.write(decide(L, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote" }, day(3, 10), OK5).drafts, FRANK);
  assert.equal(replay(b.events, ways, L, L, { until: day(6, 0) }).differ, 0);
  const forged = (by: string, at: number): WayEvent => ({ kind: "way.checked", item: "d1", at, id: `forged-${by}-${at}`, by, value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam: "gate.green", pv: 1, pkg: `sha256:${PRINT}`, pass: true, at } });
  // Marco signs gate.green green at the same moment; Frank's own Sol writes it green two days later
  for (const extra of [[forged(MARCO, day(3, 10))], [forged(FRANK, day(5, 10))], [forged(FRANK, day(3, 10))]]) {
    const r = replay([...b.events, ...extra], ways, L, L, { until: day(6, 0) });
    assert.equal(r.differ, 0, JSON.stringify(r.things[0].now.map((s) => `${s.kind} ${s.move ?? ""} ${s.to ?? s.why ?? ""}`)));
  }
});

test("replay tries a refused press again only as a role its signer holds; a refusal naming a stranger's checks is not the refusal that press gets, and is passed over", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(2, 9)).drafts, MARCO);
  const checks = (by: string) => ["contract.written", "undo.works", "data.ok", "gate.green", "used.enough"].map((seam, i): WayEvent =>
    ({ kind: "way.checked", item: "d1", at: day(3, 9), id: `k${i}-${by}`, by, value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam, pv: 1, pkg: `sha256:${PRINT}`, pass: seam !== "gate.green", at: day(3, 9) } }));
  const refused = (by: string, cs: WayEvent[]): WayEvent => ({ kind: "way.refused", item: "d1", at: day(3, 9), id: `r-${by}`, by, value: { way: WAY, ver: VER, thing: "d1", move: "promote", why: "rule_failed", checks: cs.map((c) => c.id) } });
  const w3 = raw(); w3.rules.solid.all.splice(3, 1);
  const l3 = load(w3), ws = new Map([...ways, [l3.ver, l3.way!]]);
  const run = (by: string, checker = by) => { const cs = checks(checker); return replay([...b.events, ...cs, refused(by, cs)], ws, L, l3).things.find((t) => t.thing === "d1")!; };
  // a promote "refused" under Marco's key: Marco is no keeper, so nobody's press: not tried, not compared
  assert.equal(run(MARCO).same, true, JSON.stringify(run(MARCO).first));
  // under Frank's, it is his press: without the gate in solid it goes through
  assert.equal(run(FRANK).same, false);
  assert.equal(run(FRANK).first?.now?.move, "promote"); assert.equal(run(FRANK).first?.now?.kind, "way.move");
  // the answers from a stranger are no answers: Frank's press there is refused for want of them (rule_unread), not for
  // a failed rule, so the fold passes this refusal over (round 9) and the replay neither tries nor compares it
  const cs = checks("person:isaacliu"), strange = [...b.events, ...cs, refused(FRANK, cs)];
  assert.deepEqual(fold(WAY, strange, ws).skipped.map((x) => x.why), [...cs.map(() => "not_allowed"), "stale_refusal"]);
  assert.deepEqual([run(FRANK, "person:isaacliu").same, run(FRANK, "person:isaacliu").was.some((x) => x.kind === "way.refused")], [true, false]);
  // a check is read only where it stands before the event that names it, as the fold read it: Frank's refusal for
  // want of answers names five checks he writes after it, all passing. It is taken (unread there), and tried again
  // it is refused unread again, not promoted on answers that were not there yet
  const late = checks(FRANK).map((c): WayEvent => ({ ...c, value: { ...c.value, pass: true } }));
  const unread: WayEvent = { ...refused(FRANK, late), value: { ...refused(FRANK, late).value, why: "rule_unread" } };
  const after = [...b.events, unread, ...late], r = replay(after, ways, L, L);
  assert.deepEqual([fold(WAY, after, ways).skipped, r.differ, r.things[0].now.at(-1)], [[], 0, { at: day(3, 9), kind: "way.refused", move: "promote", why: "rule_unread" }]);
});

test("round 7 (replay): a life longer than SPAN is not run again when a clock's trigger changed: it is listed tooLong and counted as differing, the others are compared as before; an event the fold passed over does not say how far to run", () => {
  const ways = waysOf(L);
  const w2 = raw(); w2.rules.expired.any[0].all[0].older = "30d";
  const l2 = load(w2), ways2 = new Map([...ways, [l2.ver, l2.way!]]);
  /** d1 made on day 0 and never extended, the clock run to day 22; `old`: a thing made first, at that time;
   *  `young`: a thing made on day 15 */
  const hist = (old?: number, young = false) => {
    const b = book([applied(VER, old === undefined ? day(-1, 12) : old - 3_600_000)]);
    if (old !== undefined) make(b, L, "old", old, MARCO, { title: "Old", switch: "old" });
    make(b, L, "d1", day(0, 9));
    for (let n = 0; n <= 22; n++) {
      if (young && n === 15) make(b, L, "young", day(15, 9), MARCO, { title: "Young", switch: "young" });
      const d = due(L, fold(WAY, b.events, ways), TICK(n), ME);
      b.write([...d.drafts, ...d.acts.map((a) => acted(L.way!, VER, a.thing, a.seam, true, TICK(n), a.after))], RUNNER);
    }
    return b;
  };
  const plain = replay(hist().events, ways2, L, l2);
  assert.deepEqual(plain.things.map((t) => [t.thing, t.same, t.tooLong]), [["d1", false, undefined]]);
  // eleven years back: not run again, listed, counted; d1 as it was without it
  const b = hist(day(-4000, 9));
  assert.equal(fold(WAY, b.events, ways).things.old.state, "to_remove", "the old thing is part of the book: it expired at the first tick");
  const r = replay(b.events, ways2, L, l2);
  const [d1, old] = r.things;
  assert.deepEqual([old.thing, old.same, old.tooLong, old.first, old.now, old.wouldBeRefused], ["old", false, true, undefined, [], []]);
  assert.ok(old.was.length >= 2, "what was written is still listed");
  assert.deepEqual(d1, plain.things[0]);
  assert.equal(r.differ, 2);
  assert.deepEqual(previewed(r, day(23, 9)).value, { way: WAY, from: VER, to: l2.ver, things: 2, differ: 2 });
  // no clock's trigger changed (the same version): nothing is walked, so the old thing is run again and is the same
  assert.deepEqual(replay(b.events, ways, L, L).things.map((t) => [t.thing, t.same, t.tooLong]), [["d1", true, undefined], ["old", true, undefined]]);
  // exactly SPAN before `until` it is run again; a millisecond more and it is not
  const at = (until: number) => replay(b.events, ways2, L, l2, { until }).things.map((t) => t.tooLong);
  assert.deepEqual(at(day(-4000, 9) + SPAN), [undefined, undefined]);
  assert.deepEqual(at(day(-4000, 9) + SPAN + 1), [undefined, true]);
  // an `until` no clock reads: nothing is run again, and nothing is called the same
  for (const until of [1e300, Infinity, NaN]) assert.deepEqual(replay(b.events, ways2, L, l2, { until }).things.map((t) => [t.same, t.tooLong]), [[false, true], [false, true]], String(until));
  // an `until` just past what a clock reads, a birth just inside it, 300 days apart: not run again either (the walk
  // would find no day to stand on, and the thing would be called the same)
  const END = 8.64e15, DAY_MS = 86_400_000;
  const late = book([applied(VER, END - 400 * DAY_MS)]);
  make(late, L, "d1", END - 400 * DAY_MS + 3_600_000);
  assert.ok(isTime(END - 400 * DAY_MS + 3_600_000) && !isTime(END - 100 * DAY_MS));
  assert.deepEqual(replay(late.events, ways2, L, l2, { until: END - 100 * DAY_MS }).things.map((t) => [t.thing, t.same, t.tooLong]), [["d1", false, true]]);
  assert.deepEqual(replay(late.events, ways2, L, l2, { until: END - 370 * DAY_MS }).things.map((t) => [t.thing, t.tooLong]), [["d1", undefined]], "both times a clock reads: run again");
  // a birth no clock reads
  const far = hist(-1e300);
  assert.ok(fold(WAY, far.events, ways).things.old, "the fold of a person's own log takes it");
  assert.deepEqual(replay(far.events, ways2, L, l2).things.map((t) => [t.thing, t.same, t.tooLong]), [["d1", false, undefined], ["old", false, true]]);
  // as far back as a clock reads: still at once (the walk it does not make is a hundred million days)
  const t0 = performance.now();
  const deep = replay(hist(-8.6e15).events, ways2, L, l2);
  assert.deepEqual(deep.things.map((t) => [t.thing, t.tooLong]), [["d1", undefined], ["old", true]]);
  assert.deepEqual(deep.things[0], plain.things[0]);
  assert.ok(performance.now() - t0 < 20_000, "not a walk of 270,000 years");
  // two things born fifteen days apart: the ticks, worked out once for both, start at the earlier birth, so the
  // older thing meets every tick of its own life (21 days made 10: it expires before the younger one is made)
  const w3 = raw(); w3.rules.expired.any[0].all[0].older = "10d";
  const l3 = load(w3), ways3 = new Map([...ways, [l3.ver, l3.way!]]);
  const alone = replay(hist().events, ways3, L, l3).things[0];
  assert.equal(alone.first?.now?.trigger, "expire");
  assert.ok(alone.first!.now!.at < day(15, 9), "the new version expires d1 before day 15");
  const two = replay(hist(undefined, true).events, ways3, L, l3);
  assert.deepEqual(two.things.map((t) => [t.thing, t.tooLong]), [["d1", undefined], ["young", undefined]]);
  assert.deepEqual(two.things[0], alone);
  // an event the fold passed over, dated fourteen years ahead, is no part of the history: `until` is the last event taken
  const junk: WayEvent = { kind: "way.move", item: WAY, value: { way: WAY, ver: VER, thing: "nothing", move: "extend", from: "on_switch", to: "on_switch", by: "explorer" }, at: day(5000, 9), id: "junk", by: MARCO };
  const withJunk = [...hist().events, junk];
  assert.ok(fold(WAY, withJunk, ways).skipped.some((x) => x.id === "junk"), "passed over");
  assert.deepEqual(replay(withJunk, ways2, L, l2), plain);
});

test("round 8 (replay): a thing born at the very moment of a changed trigger's tick is due for it, as the runner and the fold have it (a tick is barred only before the birth): the earliest thing of the book and a later one alike; born a millisecond after the tick it waits for the next", () => {
  const wd = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(day(0, 12)).getUTCDay()];
  const f2 = raw(); f2.prev = VER;
  f2.triggers.remind.on = `weekly ${wd} 09:30`;
  f2.triggers.remind.if = { all: [{ in: ["on_switch", "wanted"] }, { not: { fired: "remind" } }] };
  const l2 = load(f2);
  assert.deepEqual(l2.problems, []);
  const ways = waysOf(L, l2);
  const b = book([applied(VER)]);
  make(b, L, "d1", TICK(0)); make(b, L, "d2", TICK(7)); make(b, L, "d3", TICK(7) + 1); make(b, L, "d4", TICK(7) - 60_000);
  const r = replay(b.events, ways, L, l2, { until: day(10, 0) });
  const lives = Object.fromEntries(r.things.map((t) => [t.thing, t.now.map((s) => `${s.kind.slice(4)}${s.trigger ? ` ${s.trigger} ${s.at === s.tick ? (s.at - TICK(0)) / 86_400_000 : "late"}` : ""}`)]));
  assert.deepEqual(lives, {
    d1: ["made", "move", "fired remind 0"],
    d2: ["made", "move", "fired remind 7"],
    d3: ["made", "move"],
    d4: ["made", "move", "fired remind 7"],
  });
  assert.deepEqual([r.differ, r.things.map((t) => t.same)], [3, [false, false, true, false]]);
  // what the new version's runner writes for the same births, at the same moments
  for (const [thing, born, fires] of [["d1", TICK(0), true], ["d2", TICK(7), true], ["d3", TICK(7) + 1, false], ["d4", TICK(7) - 60_000, true]] as const) {
    const nb = book([applied(l2.ver)]);
    make(nb, l2, thing, born);
    const d = due(l2, fold(WAY, nb.events, waysOf(l2)), Math.max(born, TICK(born < TICK(1) ? 0 : 7)), ME);
    assert.equal(d.drafts.some((x) => x.kind === "way.fired" && x.value.trigger === "remind"), fires, thing);
  }
  // the same version over this history: the same, born on a tick or not
  assert.equal(replay(b.events, ways, L, L, { until: day(10, 0) }).differ, 0);
});

test("round 8 (replay): what one moment holds is all tried, each from its own record: two presses of one thing at one millisecond are both pressed again, in the order written; a turn run again is answered by the checks its own firing of that moment named, not by another day's", () => {
  // made, wanted and extended in the same millisecond
  const b = book([applied(VER)]), ways = waysOf(L);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 9)).drafts, MARCO);
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, day(0, 9)).drafts, MARCO);
  const r = replay(b.events, ways, L, L, { until: day(1, 0) });
  assert.deepEqual([r.differ, r.things[0].now.map((s) => s.move ?? s.kind)], [0, ["way.made", "make", "want", "extend"]]);
  // two triggers ask the same gate: green on day 1 (nag fires), red on day 2 (calm fires)
  const w = raw();
  w.triggers.nag = { on: "daily 09:30", if: { all: [{ in: ["on_switch", "wanted"] }, { check: "gate.green" }, { not: { fired: "nag" } }] }, do: { ping: "keeper" } };
  w.triggers.calm = { on: "daily 09:30", if: { all: [{ in: ["on_switch", "wanted"] }, { not: { check: "gate.green" } }, { not: { fired: "calm" } }] }, do: { ping: "keeper" } };
  const l = load(w), ways2 = waysOf(l);
  assert.deepEqual(l.problems, []);
  const c = book([applied(l.ver)]);
  make(c, l, "d1", day(0, 9));
  for (const [n, pass] of [[1, true], [2, false], [3, false]] as const) c.write(due(l, fold(WAY, c.events, ways2), TICK(n), ME, { "gate.green": { pass } }).drafts, RUNNER);
  const q = replay(c.events, ways2, l, l, { until: day(4, 0) });
  assert.deepEqual([q.differ, q.things[0].now.map((s) => [s.trigger ?? s.move ?? s.kind, s.at])], [0, [["way.made", day(0, 9)], ["make", day(0, 9)], ["nag", TICK(1)], ["calm", TICK(2)]]]);
});

// ---- round 9

const ALL5: Answers = { "contract.written": { pass: true }, "undo.works": { pass: true }, "data.ok": { pass: true }, "gate.green": { pass: true }, "used.enough": { pass: true } };
/** a life's steps, told short: `fired nudge`, `move want`, `acted switch.off ok`, `refused promote rule_unread` */
const told = (xs: { kind: string; move?: string; trigger?: string; seam?: string; ok?: boolean; why?: string }[]) =>
  xs.map((x) => [x.kind.slice(4), x.trigger ?? x.move ?? x.seam, x.why ?? (x.ok === undefined ? undefined : x.ok ? "ok" : "failed")].filter((y) => y !== undefined).join(" "));

test("round 9 (fold): a refusal for the thing's state or the move's rule is judged again where it stands, as a move is: taken when the same press there gets the same refusal, passed over (stale_refusal) when it was written on another view; a refused birth and a refusal for any other reason are taken as they are; a replay neither tries nor compares one passed over", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10)).drafts, MARCO);
  const fresh = [...b.events];
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, day(0, 10, 30)).drafts, MARCO);
  // Marco's other Sol holds the book up to here and refuses a second extend for its rule; in the log that refusal
  // stands after Frank's promote
  const stale = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, day(0, 11, 10));
  assert.deepEqual([stale.ok, stale.why], [false, "rule_failed"]);
  const wanted = [...b.events];
  b.write(decide(L, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote" }, day(0, 11), ALL5).drafts, FRANK);
  const official = [...b.events];
  const id = b.write(stale.drafts, MARCO).at(-1)!;
  const p = fold(WAY, b.events, ways);
  assert.deepEqual([p.things.d1.state, p.skipped.map((x) => `${x.id === id} ${x.kind} ${x.why}`)], ["official", ["true way.refused stale_refusal"]]);
  // where it was judged it is taken
  assert.deepEqual(fold(WAY, [...wanted, b.events.at(-1)!], ways).skipped, []);
  const life = ["made", "move make", "move want", "move extend", "move promote"];
  const r = replay(b.events, ways, L, L);
  assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]);
  // the refusal that press does get there (the draft is official: wrong_state) is taken, tried again and compared
  const ref = (thing: string, move: string, why: string, by = MARCO, more: Record<string, unknown> = {}): WayEvent =>
    ({ kind: "way.refused", item: thing, at: day(0, 11, 10), id: `ref-${thing}-${move}-${why}`, by, value: { way: WAY, ver: VER, thing, move, why, ...more } });
  const skips = (events: WayEvent[]) => fold(WAY, events, ways).skipped.map((x) => x.why);
  const there = [...official, ref("d1", "extend", "wrong_state")], q = replay(there, ways, L, L);
  assert.deepEqual([skips(there), q.differ, told(q.things[0].was), told(q.things[0].now)], [[], 0, [...life, "refused extend wrong_state"], [...life, "refused extend wrong_state"]]);

  // the stronger form: Frank's Sol, not holding Marco's drop, refuses a pull (the draft is not to be removed yet). In the
  // log it stands after the drop, where a pull goes through: nobody pressed that, and the draft stays to be removed
  const e = book([applied(VER)]);
  make(e, L, "d3", day(0, 9));
  const pull = decide(L, fold(WAY, e.events, ways), { asker: FRANK, thing: "d3", move: "pull" }, day(0, 10, 5));
  e.write(decide(L, fold(WAY, e.events, ways), { asker: MARCO, thing: "d3", move: "drop" }, day(0, 10)).drafts, MARCO);
  e.write(pull.drafts, FRANK);
  const pe = fold(WAY, e.events, ways), re = replay(e.events, ways, L, L);
  assert.deepEqual([pull.why, pe.things.d3.state, pe.skipped.map((x) => x.why), re.differ, told(re.things[0].now)], ["wrong_state", "to_remove", ["stale_refusal"], 0, ["made", "move make", "move drop"]]);

  // each refusal alone after the same log (d1 wanted and extended; no d9)
  const cases: [WayEvent, string[], string][] = [
    [ref("d1", "extend", "rule_failed"), [], "its rule fails there"],
    [ref("d1", "extend", "rule_unread"), ["stale_refusal"], "its rule is read there, and fails"],
    [ref("d1", "extend", "wrong_state"), ["stale_refusal"], "the state is one of the move's"],
    [ref("d1", "promote", "rule_unread", FRANK), [], "no check named: unread"],
    [ref("d1", "promote", "rule_failed", FRANK), ["stale_refusal"], "no check named: not failed"],
    [ref("d1", "pull", "wrong_state", FRANK), [], "not to be removed"],
    [ref("d1", "pull", "rule_failed", FRANK), ["stale_refusal"], "the state stops it before any rule"],
    [ref("d1", "drop", "rule_failed"), ["stale_refusal"], "drop has no rule: the press goes through"],
    [ref("d1", "drop", "wrong_state"), ["stale_refusal"], "a wanted draft may be dropped"],
    [ref("d1", "make", "wrong_state"), ["stale_refusal"], "a birth of a thing that is there"],
    [ref("d1", "nope", "wrong_state"), ["stale_refusal"], "no such move"],
    [ref("d9", "make", "rule_failed"), [], "a refused birth does not say its kind: taken as it is"],
    [ref("d9", "want", "wrong_state"), ["stale_refusal"], "not a birth, of a thing not there"],
    [{ ...ref("d1", "extend", "rule_failed"), value: { ...ref("d1", "extend", "rule_failed").value, ver: "f".repeat(64) } }, ["stale_refusal"], "under another version than the one in force"],
    [ref("d1", "extend", "not_allowed"), [], "another reason"],
    [{ ...ref("d1", "extend", "old_version"), value: { ...ref("d1", "extend", "old_version").value, ver: "f".repeat(64) } }, [], "another reason, another version"],
    [{ kind: "way.refused", item: WAY, at: day(0, 11, 10), id: "ref-way", by: MARCO, value: { way: WAY, ver: VER, why: "wrong_state" } }, [], "of no thing and no move"],
  ];
  for (const [ev, want, what] of cases) assert.deepEqual(skips([...wanted, ev]), want, what);
  // before the extend its rule passes: a refusal for the rule is not what that press gets
  assert.deepEqual(skips([...fresh, ref("d1", "extend", "rule_failed")]), ["stale_refusal"]);
});

test("round 9 (replay): presses and the runner's turns are tried in the order the log has them, each judged at its own time, never sorted by their times: a press dated before the one it was pressed on (a clock three minutes behind), or before the turn it was pressed after, is tried after it, as the fold took it", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10, 5)).drafts, MARCO);
  const drop = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(0, 10, 2));   // from wanted: after the want
  b.write(drop.drafts, MARCO);
  const r = replay(b.events, ways, L, L);
  assert.deepEqual([drop.ok, fold(WAY, b.events, ways).things.d1.state, r.differ, r.things[0].wouldBeRefused, r.things[0].now.map((x) => [x.move ?? x.kind, x.at])],
    [true, "to_remove", 0, [], [["way.made", day(0, 9)], ["make", day(0, 9)], ["want", day(0, 10, 5)], ["drop", day(0, 10, 2)]]]);
  // two people: Marco wants at 10:05, Frank (two minutes behind, his Sol holding the want) promotes at 10:03
  const c = book([applied(VER)]);
  make(c, L, "d2", day(0, 9));
  c.write(decide(L, fold(WAY, c.events, ways), { asker: MARCO, thing: "d2", move: "want" }, day(0, 10, 5)).drafts, MARCO);
  c.write(decide(L, fold(WAY, c.events, ways), { asker: FRANK, thing: "d2", move: "promote" }, day(0, 10, 3), ALL5).drafts, FRANK);
  const q = replay(c.events, ways, L, L);
  assert.deepEqual([fold(WAY, c.events, ways).things.d2.state, q.differ, told(q.things[0].now)], ["official", 0, ["made", "move make", "move want", "move promote"]]);
  // a press written after the runner's day-14 turn and dated a minute before it: after the remind, as the log has it
  const d = book([applied(VER)]);
  make(d, L, "d1", day(0, 9));
  d.write(due(L, fold(WAY, d.events, ways), TICK(14), ME).drafts, RUNNER);
  d.write(decide(L, fold(WAY, d.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, TICK(14) - 60_000).drafts, MARCO);
  const t = replay(d.events, ways, L, L), life = ["made", "move make", "fired remind", "move extend"];
  assert.deepEqual([t.differ, told(t.things[0].was), told(t.things[0].now)], [0, life, life]);
});

test("round 9 (replay): an act's answer belongs to the entry that asked it, whenever it was written: a trigger's act answered minutes after its firing is that firing's and not the next day's; an answer written after a later step stands right after its firing in the life compared, a failed act done again as one step; an entry nothing answered yet is not answered by another's; only an entry the history does not have takes the thing's latest answer at or before it, else its first", () => {
  const f = raw(); f.triggers.nudge = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { act: "switch.off" } };
  const l = load(f), ways = waysOf(l);
  assert.deepEqual(l.problems, []);
  const b = book([applied(l.ver)]);
  make(b, l, "d1", day(0, 9));
  /** the runner's turn of day n: the firing, its act listed to run (no answer handed) */
  const fire = (n: number) => { const d = due(l, fold(WAY, b.events, ways), TICK(n), ME); assert.equal(d.acts.length, 1); return b.write(d.drafts, RUNNER)[d.drafts.findIndex((x) => x.kind === "way.fired")]; };
  const answer = (firing: string, ok: boolean, at: number) => { const a = acted(l.way!, l.ver, "d1", "switch.off", ok, at); b.write([{ ...a, value: { ...a.value, because: firing } }], RUNNER); };
  const same = (life: string[]) => { const r = replay(b.events, ways, l, l); assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]); };
  // day 1's act goes well, day 2's fails; each answer is written five minutes after its firing
  const f1 = fire(1);
  answer(f1, true, TICK(1) + 5 * 60_000);
  answer(fire(2), false, TICK(2) + 5 * 60_000);
  const two = [...b.events];
  let life = ["made", "move make", "fired nudge", "acted switch.off ok", "fired nudge", "acted switch.off failed"];
  same(life);
  // day 3: the firing, a press, and the firing's answer an hour later; day 4's act is still running
  const f3 = fire(3);
  b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, TICK(3) + 60_000).drafts, MARCO);
  answer(f3, true, TICK(3) + 3_600_000);
  fire(4);
  same(life = [...life, "fired nudge", "acted switch.off ok", "move want", "fired nudge"]);
  // day 5: the act fails, a press, the act done again and going well
  const f5 = fire(5);
  answer(f5, false, TICK(5) + 5 * 60_000);
  b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, TICK(5) + 10 * 60_000).drafts, MARCO);
  answer(f5, true, TICK(5) + 3_600_000);
  same([...life, "fired nudge", "acted switch.off ok", "move extend"]);
  // a version that fires the act at 10:00: entries the history does not have. Day 0's has no answer before it and takes
  // the first (day 1's); day 1's and day 2's take the latest at or before them
  const g = raw(); g.prev = l.ver; g.triggers.nudge = { on: "daily 10:00", if: { in: ["on_switch", "wanted"] }, do: { act: "switch.off" } };
  const l2 = load(g);
  assert.deepEqual(l2.problems, []);
  assert.deepEqual(told(replay(two, waysOf(l, l2), l, l2, { until: day(3, 0) }).things[0].now),
    ["made", "move make", "fired nudge", "acted switch.off ok", "fired nudge", "acted switch.off ok", "fired nudge", "acted switch.off failed"]);
  // of the answers up to an entry, the one written last: day 1's act done again and failing, written after day 2's
  // and dated a minute after day 1's firing, is the answer day 1's 10:00 entry takes; day 0's takes the first written
  const again = acted(l.way!, l.ver, "d1", "switch.off", false, TICK(1) + 60_000);
  const redone: WayEvent[] = [...two, { kind: again.kind, item: again.item, at: again.at, id: "redone", by: RUNNER, value: { ...again.value, because: f1 } }];
  assert.deepEqual(told(replay(redone, waysOf(l, l2), l, l2, { until: day(3, 0) }).things[0].now),
    ["made", "move make", "fired nudge", "acted switch.off ok", "fired nudge", "acted switch.off failed", "fired nudge", "acted switch.off failed"]);

  // an `enter` act: dropped and answered, taken back, dropped again with the act still running
  const h = raw(); h.life.draft.moves.push({ id: "back", from: "to_remove", to: "on_switch", by: ["explorer"] });
  const lh = load(h), wh = waysOf(lh);
  assert.deepEqual(lh.problems, []);
  const c = book([applied(lh.ver)]);
  make(c, lh, "d1", day(0, 9));
  const d1 = decide(lh, fold(WAY, c.events, wh), { asker: MARCO, thing: "d1", move: "drop" }, day(0, 10));
  const mv = c.write(d1.drafts, MARCO)[d1.drafts.findIndex((x) => x.kind === "way.move")];
  const a = acted(lh.way!, lh.ver, "d1", "switch.off", true, day(0, 10, 1));
  c.write([{ ...a, value: { ...a.value, because: mv } }], MARCO);
  c.write(decide(lh, fold(WAY, c.events, wh), { asker: MARCO, thing: "d1", move: "back" }, day(0, 11)).drafts, MARCO);
  c.write(decide(lh, fold(WAY, c.events, wh), { asker: MARCO, thing: "d1", move: "drop" }, day(0, 12)).drafts, MARCO);
  const r = replay(c.events, wh, lh, lh), lifeH = ["made", "move make", "move drop", "acted switch.off ok", "move back", "move drop"];
  assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, lifeH, lifeH]);
});

test("round 9 (replay): a trigger's move asks its `when` after the trigger's `if`: run again, it is answered by what the firing named and by what the move or the refusal answering that firing named, on a red gate, on no answer and on five that pass", () => {
  const f = raw();
  f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
  f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
  const l = load(f), ways = waysOf(l);
  assert.deepEqual(l.problems, []);
  const b = book([applied(l.ver)]);
  make(b, l, "d1", day(0, 9));
  b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10)).drafts, MARCO);
  b.write(due(l, fold(WAY, b.events, ways), TICK(1), ME, OK5).drafts, RUNNER);
  b.write(due(l, fold(WAY, b.events, ways), TICK(2), ME).drafts, RUNNER);
  b.write(due(l, fold(WAY, b.events, ways), TICK(3), ME, ALL5).drafts, RUNNER);
  const life = ["made", "move make", "move want", "fired auto", "refused promote rule_failed", "fired auto", "refused promote rule_unread", "fired auto", "move promote"];
  const r = replay(b.events, ways, l, l);
  assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
});

test("round 9 (replay): a changed trigger's ticks are walked to `until` and not past it: a thing born on a tick after `until` is not run for that tick; and the walk costs things times days whether the trigger fires on none of the days or on every one of them", () => {
  const f = raw(); f.prev = VER; f.triggers.remind.if.all[1].older = "0d";
  const l2 = load(f), ways = waysOf(L, l2);
  const b = book([applied(VER)]);
  make(b, L, "d1", TICK(5));
  const r = replay(b.events, ways, L, l2, { until: day(2, 0) });
  assert.deepEqual([r.things[0].same, told(r.things[0].now)], [true, ["made", "move make"]]);
  assert.deepEqual(told(replay(b.events, ways, L, l2, { until: day(6, 0) }).things[0].now), ["made", "move make", "fired remind"]);
  // a remind that fires every day: four times the days is about four times the work (it was sixteen times: each tick
  // copied a projection that grew with every firing). The quickest of three runs of each, so a busy machine is no matter
  const daily = raw(); daily.prev = VER; daily.triggers.remind.if = { in: ["on_switch", "wanted"] };
  const lD = load(daily), wD = waysOf(L, lD);
  assert.deepEqual(lD.problems, []);
  const c = book([applied(VER)]);
  for (let i = 0; i < 3; i++) make(c, L, `d${i}`, day(0, 9, i));
  const time = (days: number) => Math.min(...[0, 1, 2].map(() => {
    const t0 = performance.now(), q = replay(c.events, wD, L, lD, { until: day(days, 0) });
    assert.deepEqual(q.things.map((x) => x.now.length), [days + 2, days + 2, days + 2]);
    return performance.now() - t0;
  }));
  const short = time(500), long = time(2000);
  assert.ok(long < short * 9, `500 days: ${short.toFixed(0)} ms, 2,000 days: ${long.toFixed(0)} ms`);
});

test("round 9 (replay): the runner's turns are told apart by where they stand, not by their time: a runner whose clock was set back signs turn after turn at one time. A press between two of them, taken or refused, parts them; with nothing between, a firing that does not follow the last in the order one turn writes starts a new turn; and two turns nothing tells apart are answered each trigger by its own firing", () => {
  const way = (triggers: Record<string, unknown>, by: Record<string, string> = {}) => {
    const f = raw();
    for (const [move, t] of Object.entries(by)) f.life.draft.moves.find((m: { id: string }) => m.id === move).by.push(`trigger:${t}`);
    Object.assign(f.triggers, triggers);
    const l = load(f);
    assert.deepEqual(l.problems, []);
    return l;
  };
  const AUTO = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
  const NUDGE = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { ping: "explorer" } };
  const GREEN = { all: [{ in: ["wanted"] }, { check: "gate.green" }] };
  const same = (b: ReturnType<typeof book>, l: Loaded, state: string, life: string[]) => {
    const ways = waysOf(l), p = fold(WAY, b.events, ways), r = replay(b.events, ways, l, l);
    assert.deepEqual([p.things.d1.state, p.skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [state, [], 0, life, life]);
  };
  const turn = (b: ReturnType<typeof book>, l: Loaded, answers?: Answers) => b.write(due(l, fold(WAY, b.events, waysOf(l)), TICK(1), ME, answers).drafts, RUNNER);
  const ask = (b: ReturnType<typeof book>, l: Loaded, asker: string, move: string, at: number, answers?: Answers) => b.write(decide(l, fold(WAY, b.events, waysOf(l)), { asker, thing: "d1", move }, at, answers).drafts, asker);
  { // a turn, a press that is taken, a turn, all at one time: the second turn fires what the press made due
    const l = way({ auto: AUTO, nudge: NUDGE }, { promote: "auto" }), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    turn(b, l); ask(b, l, MARCO, "want", TICK(1)); turn(b, l, ALL5);
    same(b, l, "official", ["made", "move make", "fired nudge", "move want", "fired auto", "move promote"]);
  }
  { // a refused press between: the first turn's gate is red, the second's green, and the refusal stays between them
    const l = way({ nudge: NUDGE, zz: { on: "daily 09:30", if: GREEN, do: { ping: "explorer" } } }), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    ask(b, l, MARCO, "want", day(0, 10));
    turn(b, l, OK5); ask(b, l, FRANK, "promote", TICK(1), OK5); turn(b, l, ALL5);
    same(b, l, "wanted", ["made", "move make", "move want", "fired nudge", "refused promote rule_failed", "fired zz"]);
  }
  { // nothing between: zwant moves the thing at the first turn, auto (before it in a turn's order) is due at the second
    const l = way({ auto: AUTO, zwant: { on: "daily 09:30", if: { in: ["on_switch"] }, do: { move: "want" } } }, { promote: "auto", want: "zwant" }), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    turn(b, l, ALL5); turn(b, l, ALL5);
    same(b, l, "official", ["made", "move make", "fired zwant", "move want", "fired auto", "move promote"]);
  }
  { // nothing between: a seam red at the first turn (auto's promote refused), green at the second (zz, a ping, fires)
    const l = way({ auto: AUTO, zz: { on: "daily 09:30", if: GREEN, do: { ping: "explorer" } } }, { promote: "auto" }), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    ask(b, l, MARCO, "want", day(0, 10));
    turn(b, l, OK5); turn(b, l, ALL5);
    same(b, l, "wanted", ["made", "move make", "move want", "fired auto", "refused promote rule_failed", "fired zz"]);
  }
  { // nothing tells the two apart (zact follows auto in a turn's order): each trigger is answered by its own firing,
    // auto by the red gate its refusal named, zact by the green one its firing named
    const l = way({ auto: AUTO, zact: { on: "daily 09:30", if: GREEN, do: { act: "switch.off" } } }, { promote: "auto" }), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    ask(b, l, MARCO, "want", day(0, 10));
    turn(b, l, OK5); turn(b, l, ALL5);
    same(b, l, "wanted", ["made", "move make", "move want", "fired auto", "refused promote rule_failed", "fired zact"]);
  }
});

test("round 9 (replay): a person's press that answers a firing (`because`: the ping that asked for it) is a press, not the trigger's own: refused, it is tried again and compared as any refused press; taken, its checks are its own and answer no trigger of that turn. A refusal is the trigger's own only when it is signed as the firing is and refuses the very move the trigger does", () => {
  const NUDGE = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { ping: "explorer" } };
  { // Frank answers the ping by pressing promote on a draft nobody wanted yet
    const f = raw(); f.triggers.nudge = NUDGE;
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 9));
    const d = due(l, fold(WAY, b.events, ways), TICK(1), ME);
    const ping = b.write(d.drafts, RUNNER)[d.drafts.findIndex((x) => x.kind === "way.fired")];
    b.write(decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote", because: ping }, day(1, 10), ALL5).drafts, FRANK);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "fired nudge", "refused promote wrong_state"];
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
  }
  { // the turn's gate is red, so auto does not fire; Marco answers the ping an hour later with an extend, green by then
    const f = raw();
    f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
    f.life.draft.moves.find((m: { id: string }) => m.id === "extend").when = "solid";
    f.triggers.auto = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { check: "gate.green" }] }, do: { move: "promote" } };
    f.triggers.nudge = NUDGE;
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 9));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10)).drafts, MARCO);
    const d = due(l, fold(WAY, b.events, ways), TICK(1), ME, OK5);
    const ping = b.write(d.drafts, RUNNER)[d.drafts.findIndex((x) => x.kind === "way.fired")];
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend", because: ping }, day(1, 10, 30), ALL5).drafts, MARCO);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "move want", "fired nudge", "move extend"];
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
  }
  { // Frank answers auto's firing by pressing the very move auto does, and is refused as auto was, between two turns the
    // runner signed at one time: the refusal is his (he signed it), so it parts the turns and is tried again as a press
    const f = raw();
    f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
    f.triggers.zz = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { check: "gate.green" }] }, do: { ping: "explorer" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 9));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10)).drafts, MARCO);
    const d = due(l, fold(WAY, b.events, ways), TICK(1), ME, OK5);
    const fired = b.write(d.drafts, RUNNER)[d.drafts.findIndex((x) => x.kind === "way.fired")];
    b.write(decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote", because: fired }, TICK(1), OK5).drafts, FRANK);
    b.write(due(l, fold(WAY, b.events, ways), TICK(1), ME, ALL5).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "move want", "fired auto", "refused promote rule_failed", "refused promote rule_failed", "fired zz"];
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
  }
  { // a log nobody signed, trusted: no signer tells the press from the runner's events, the move does (a ping does none)
    const f = raw(); f.triggers.nudge = NUDGE;
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    const d = due(l, fold(WAY, b.events, ways), TICK(1), ME);
    const ping = b.write(d.drafts, RUNNER)[d.drafts.findIndex((x) => x.kind === "way.fired")];
    b.write(decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote", because: ping }, day(1, 10), ALL5).drafts, FRANK);
    const bare = b.events.map(({ by, ...e }) => e);
    const r = replay(bare, ways, l, l, { unsigned: "trust" }), life = ["made", "move make", "fired nudge", "refused promote wrong_state"];
    assert.deepEqual([fold(WAY, bare, ways, { unsigned: "trust" }).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
  }
});

test("round 9 (replay): `until` said before the runner's last turn hides none of its firings; a trigger's move into a state whose `enter` act nothing answered yet is not answered by the state's earlier entry; an entry the history does not have takes an answer written at its very time", () => {
  const NUDGE = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { ping: "explorer" } };
  { // three turns of the same version, `until` said before the second: all three firings are in the life run again
    const f = raw(); f.triggers.nudge = NUDGE;
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    for (const n of [1, 2, 3]) b.write(due(l, fold(WAY, b.events, ways), TICK(n), ME).drafts, RUNNER);
    const r = replay(b.events, ways, l, l, { until: day(2, 0) }), life = ["made", "move make", "fired nudge", "fired nudge", "fired nudge"];
    assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]);
  }
  { // dropped by hand and the act answered, taken back, wanted; then a trigger drops it and its act is still running
    const f = raw();
    f.life.draft.moves.push({ id: "back", from: "to_remove", to: "on_switch", by: ["explorer"] });
    f.life.draft.moves.find((m: { id: string }) => m.id === "drop").by.push("trigger:auto");
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "drop" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 9));
    const d = decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(0, 10));
    const mv = b.write(d.drafts, MARCO)[d.drafts.findIndex((x) => x.kind === "way.move")];
    const a = acted(l.way!, l.ver, "d1", "switch.off", true, day(0, 10, 1));
    b.write([{ ...a, value: { ...a.value, because: mv } }], MARCO);
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "back" }, day(0, 11)).drafts, MARCO);
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 12)).drafts, MARCO);
    b.write(due(l, fold(WAY, b.events, ways), TICK(1), ME).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "move drop", "acted switch.off ok", "move back", "move want", "fired auto", "move drop"];
    assert.deepEqual([fold(WAY, b.events, ways).things.d1.state, r.differ, told(r.things[0].was), told(r.things[0].now)], ["to_remove", 0, life, life]);
  }
  { // the act fired at 09:30 on day 1 (ok) and day 2 (failed); day 1's done again and failing at 10:00 sharp. A version
    // that fires it at 10:00: day 1's entry, at the very time of that answer, takes it
    const f = raw(); f.triggers.nudge = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { act: "switch.off" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 9));
    const fire = (n: number) => { const d = due(l, fold(WAY, b.events, ways), TICK(n), ME); return b.write(d.drafts, RUNNER)[d.drafts.findIndex((x) => x.kind === "way.fired")]; };
    const answer = (firing: string, ok: boolean, at: number) => { const x = acted(l.way!, l.ver, "d1", "switch.off", ok, at); b.write([{ ...x, value: { ...x.value, because: firing } }], RUNNER); };
    const f1 = fire(1);
    answer(f1, true, TICK(1) + 5 * 60_000);
    answer(fire(2), false, TICK(2) + 5 * 60_000);
    answer(f1, false, day(1, 10));
    const g = raw(); g.prev = l.ver; g.triggers.nudge = { on: "daily 10:00", if: { in: ["on_switch", "wanted"] }, do: { act: "switch.off" } };
    const l2 = load(g);
    assert.deepEqual(l2.problems, []);
    assert.deepEqual(told(replay(b.events, waysOf(l, l2), l, l2, { until: day(3, 0) }).things[0].now),
      ["made", "move make", "fired nudge", "acted switch.off ok", "fired nudge", "acted switch.off failed", "fired nudge", "acted switch.off failed"]);
  }
});

test("round 10 (triggers): a trigger's firing stands before what it does is judged, in the runner's turn as in every fold of what the turn wrote: a move whose `when` asks whether that very trigger fired reads this firing. So the turn writes what the fold takes, a version over that history differs nowhere, and no act is handed out for a move the fold refuses", () => {
  for (const [rule, kinds, state, end] of [
    [{ fired: "auto" }, ["way.fired", "way.move"], "official", ["fired auto", "move promote"]],
    [{ not: { fired: "auto" } }, ["way.fired", "way.refused"], "wanted", ["fired auto", "refused promote rule_failed"]],
  ] as const) {
    const f = raw();
    const promote = f.life.draft.moves.find((m: { id: string }) => m.id === "promote");
    promote.by.push("trigger:auto"); promote.when = "self";
    f.rules.self = rule;
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const d = due(l, fold(WAY, b.events, ways), TICK(0), ME);
    assert.deepEqual(d.drafts.map((x) => x.kind), kinds);
    b.write(d.drafts, RUNNER);
    const p = fold(WAY, b.events, ways), r = replay(b.events, ways, l, l), life = ["made", "move make", "move want", ...end];
    assert.deepEqual([p.skipped, p.things.d1.state, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], state, 0, life, life]);
    // asked again at the same tick, the turn writes nothing more: the firing is in the book
    assert.deepEqual(due(l, p, TICK(0), ME).drafts, []);
  }
  { // a trigger's own `if` is judged before its firing stands, in the turn and in the fold alike: one that asks that it
    // has not fired yet fires once and never again
    const f = raw();
    f.life.draft.moves.push({ id: "poke", from: ["wanted"], to: "same", by: ["trigger:auto"] });
    f.triggers.auto = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { not: { fired: "auto" } }] }, do: { move: "poke" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const wrote = [0, 1, 2].map((n) => { const d = due(l, fold(WAY, b.events, ways), TICK(n), ME); b.write(d.drafts, RUNNER); return d.drafts.map((x) => x.kind); });
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "move want", "fired auto", "move poke"];
    assert.deepEqual([wrote, fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[["way.fired", "way.move"], [], []], [], 0, life, life]);
  }
  { // expire drops a draft and the drop switches it off; a drop that may be pressed only where expire has not fired is
    // refused in expire's own turn, as the fold refuses it: the turn hands out no switch.off to run
    const f = raw();
    f.rules.once = { not: { fired: "expire" } };
    f.life.draft.moves.find((m: { id: string }) => m.id === "drop").when = "once";
    f.rules.expired = { field: "born", older: "1d" };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8));
    const d = due(l, fold(WAY, b.events, ways), TICK(1), ME);
    assert.deepEqual([d.drafts.map(short), d.acts], [["way.fired thing=d1 trigger=expire", "way.refused thing=d1 move=drop why=rule_failed"], []]);
    b.write(d.drafts, RUNNER);
    const p = fold(WAY, b.events, ways);
    assert.deepEqual([p.skipped, p.things.d1.state, replay(b.events, ways, l, l).differ], [[], "on_switch", 0]);
  }
  { // and where the drop is let through, the act it enters with is handed out against the move the turn wrote
    const f = raw(); f.rules.expired = { field: "born", older: "1d" };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 8));
    const d = due(l, fold(WAY, b.events, ways), TICK(1), ME);
    assert.deepEqual([d.drafts.map((x) => x.kind), d.acts.map((a) => [a.seam, a.thing, d.drafts[a.after].kind])], [["way.fired", "way.move"], [["switch.off", "d1", "way.move"]]]);
  }
});

test("round 10 (replay): every refusal a trigger's own move got is a step of the life, whatever the reason: a trigger whose move sets a field nobody gives it (bad_set), and one whose move only one kind of thing has (unknown_move), refused day after day, are refused the same way run again", () => {
  const run = (f: Record<string, any>, things: [string, string][]) => {
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    for (const [id, kind] of things) b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: id, kind, move: "make", set: { title: "x", ...(kind === "draft" ? { switch: `s${id}` } : {}) } }, day(0, 8)).drafts, MARCO);
    for (const n of [1, 2]) b.write(due(l, fold(WAY, b.events, ways), TICK(n), ME).drafts, RUNNER);
    const r = replay(b.events, ways, l, l);
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ], [[], 0]);
    return Object.fromEntries(r.things.map((t) => { assert.deepEqual(told(t.now), told(t.was)); return [t.thing, told(t.was)]; }));
  };
  const a = raw();
  a.life.draft.moves.push({ id: "retitle", from: ["on_switch", "wanted"], to: "same", by: ["explorer", "trigger:tag"], set: ["title"] });
  a.triggers.tag = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { move: "retitle" } };
  assert.deepEqual(run(a, [["d1", "draft"]]), { d1: ["made", "move make", "fired tag", "refused retitle bad_set", "fired tag", "refused retitle bad_set"] });
  const c = raw();
  c.things.task = { name: "task", fields: { title: "text", born: "time" } };
  c.life.task = { states: { open: { name: "open" }, done: { name: "done", end: true } }, moves: [{ id: "make", from: null, to: "open", by: ["explorer"], set: ["title"] }, { id: "close", from: "open", to: "done", by: ["keeper"] }] };
  c.life.draft.moves.find((m: { id: string }) => m.id === "drop").by.push("trigger:sweep");
  c.triggers.sweep = { on: "daily 09:30", if: { field: "born", older: "1d" }, do: { move: "drop" } };
  const lives = run(c, [["d1", "draft"], ["k1", "task"]]);
  assert.deepEqual(lives.k1, ["made", "move make", "fired sweep", "refused drop unknown_move", "fired sweep", "refused drop unknown_move"]);
  assert.deepEqual(lives.d1.slice(0, 4), ["made", "move make", "fired sweep", "move drop"]);
});

test("round 10 (replay): a trigger's own refusal is the first answer its firing got in the firing's own turn, and nothing else: when the runner's machine holds a role too, its own press that answers the firing after the trigger's own refusal did, with the very move the trigger does, is a press, an hour later and at the firing's very ms alike. It is tried again as one (a version that lets it through shows the move), and its checks answer no trigger", () => {
  for (const when of [day(0, 10, 30), TICK(0)]) {
  const f = raw();
  f.roles.keeper.who.push(RUNNER);
  f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
  f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
  const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
  assert.deepEqual(l.problems, []);
  make(b, l, "d1", day(0, 8));
  b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
  const t = due(l, fold(WAY, b.events, ways), TICK(0), ME, {});
  const firing = b.write(t.drafts, RUNNER)[t.drafts.findIndex((x) => x.kind === "way.fired")];
  const d = decide(l, fold(WAY, b.events, ways), { asker: RUNNER, thing: "d1", move: "promote", because: firing }, when, OK5);
  assert.deepEqual([d.ok, d.why], [false, "rule_failed"]);
  b.write(d.drafts, RUNNER);
  const life = ["made", "move make", "move want", "fired auto", "refused promote rule_unread", "refused promote rule_failed"];
  const r = replay(b.events, ways, l, l);
  assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
  // a version whose `solid` asks only for the contract: the trigger's move, which named no check, is refused as it was;
  // the machine's press, which named all five, goes through
  const f2 = structuredClone(f); f2.prev = l.ver; f2.rules.solid = { all: [{ check: "contract.written" }] };
  const l2 = load(f2), r2 = replay(b.events, waysOf(l, l2), l, l2);
  assert.deepEqual(l2.problems, []);
  assert.deepEqual([r2.differ, told(r2.things[0].now).slice(3, 6)], [1, ["fired auto", "refused promote rule_unread", "move promote"]]);
  }
});

test("round 10 (replay): the runner's turns stand where the history has them also when every trigger counts as changed (a new version that touches the life or the things): a press and the turn that had seen it, at one millisecond, are run again press first, so a change that alters nothing of what happens differs nowhere", () => {
  const base = () => { const f = raw(); f.triggers.gone = { on: "daily 09:30", if: { in: ["to_remove"] }, do: { ping: "keeper" } }; return f; };
  const l = load(base());
  const fa = base(); fa.prev = l.ver; fa.triggers.remind.do.say = "still there?";
  const fb = base(); fb.prev = l.ver; fb.triggers.remind.do.say = "still there?"; fb.life.draft.states.parked = { name: "parked" };
  const la = load(fa), lb = load(fb), ways = waysOf(l, la, lb), b = book([applied(l.ver)]);
  assert.deepEqual([l.problems, la.problems, lb.problems], [[], [], []]);
  make(b, l, "d1", day(0, 8));
  for (let n = 0; n < 14; n++) b.write(due(l, fold(WAY, b.events, ways), TICK(n), ME).drafts, RUNNER);
  b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, TICK(14)).drafts, MARCO);
  const t = due(l, fold(WAY, b.events, ways), TICK(14), ME);
  assert.deepEqual(t.drafts.map(short), ["way.fired thing=d1 trigger=gone"]);
  b.write(t.drafts, RUNNER);
  const life = ["made", "move make", "move drop", "fired gone"];
  for (const to of [la, lb]) {
    const r = replay(b.events, ways, l, to);
    assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]);
  }
});

test("round 10 (replay): a log whose firings carry no id (nothing answers one by name): a refusal at a firing's very time, saying no `because`, is that firing's own and parts no turn, so the triggers that fired after it in that turn are still answered by the turn's checks, when the checks kept their ids and when they did not", () => {
  for (const [re, skipped, life] of [
    [/fired|refused|acted/, [], ["made", "move make", "fired nudge", "fired early", "refused promote wrong_state", "fired zact", "fired zzz"]],
    [/fired|refused|acted|checked/, ["rule_unread"], ["made", "move make", "fired nudge", "fired early", "refused promote wrong_state", "fired zzz"]],
  ] as const) {
    const f = raw();
    f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:early");
    f.triggers.early = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { move: "promote" } };
    f.triggers.nudge = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { ping: "explorer" } };
    f.triggers.zact = { on: "daily 09:30", if: { all: [{ in: ["on_switch"] }, { check: "gate.green" }] }, do: { act: "switch.off" } };
    f.triggers.zzz = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { act: "switch.off" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 9));
    b.write(due(l, fold(WAY, b.events, ways), TICK(1), ME, { "gate.green": { pass: true } }).drafts, RUNNER);
    const old = b.events.map((e) => {
      if (!re.test(e.kind) || e.by !== RUNNER) return e;
      const { id: _id, ...x } = e, { because: _b, ...value } = e.value ?? {};
      return { ...x, value };
    });
    const r = replay(old, ways, l, l);
    assert.deepEqual([fold(WAY, old, ways).skipped.map((s) => s.why), r.differ, told(r.things[0].was), told(r.things[0].now)], [[...skipped], 0, [...life], [...life]]);
  }
});

test("round 10 (replay): a preview's work grows with a thing's presses, not with their square: four times the presses of one thing is about four times the work (it was sixteen: each press looked through the whole life for its notes), and each press is still given the text it set", () => {
  const f = raw(); f.life.draft.moves.push({ id: "touch", from: ["on_switch", "wanted"], to: "same", by: ["explorer"], set: ["title"] });
  const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.name = "renamed";
  const l2 = load(f2), ways = waysOf(l, l2);
  assert.deepEqual([l.problems, l2.problems], [[], []]);
  const built = (n: number) => {
    const b = book([applied(l.ver)]);
    make(b, l, "d1", day(0, 8));
    const p = fold(WAY, b.events, ways);
    for (let i = 0; i < n; i++) b.write(decide(l, p, { asker: MARCO, thing: "d1", move: "touch", set: { title: `t${i}` } }, day(0, 9) + i * 1000).drafts, MARCO);
    return b;
  };
  // three touches (titles t0, t1, t2), a want pressed after the second: a version under which a draft is wanted only
  // while its title is t1 takes that want, one that asks for t0 or for t2 refuses it
  const some = built(2), few = some.events;
  some.write(decide(l, fold(WAY, few, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10)).drafts, MARCO);
  some.write(decide(l, fold(WAY, few, ways), { asker: MARCO, thing: "d1", move: "touch", set: { title: "t2" } }, day(0, 11)).drafts, MARCO);
  const wanted = (title: string) => {
    const g = structuredClone(f); g.prev = l.ver; g.rules.titled = { field: "title", is: title }; g.life.draft.moves.find((m: { id: string }) => m.id === "want").when = "titled";
    const lg = load(g);
    assert.deepEqual(lg.problems, []);
    return told(replay(few, waysOf(l, lg), l, lg).things[0].now);
  };
  assert.deepEqual(told(replay(few, ways, l, l2).things[0].now), ["made", "move make", "move touch", "move touch", "move want", "move touch"]);
  assert.deepEqual(wanted("t1"), ["made", "move make", "move touch", "move touch", "move want", "move touch"]);
  for (const t of ["t0", "t2", "New logo"]) assert.deepEqual(wanted(t), ["made", "move make", "move touch", "move touch", "refused want rule_failed", "move touch"]);
  const time = (events: readonly WayEvent[], n: number) => Math.min(...[0, 1, 2].map(() => {
    const t0 = performance.now(), r = replay(events, ways, l, l2);
    assert.deepEqual([r.differ, r.things[0].now.length], [0, n + 2]);
    return performance.now() - t0;
  }));
  const short = time(built(1500).events, 1500), long = time(built(6000).events, 6000);
  assert.ok(long < short * 9, `1,500 presses: ${short.toFixed(0)} ms, 6,000 presses: ${long.toFixed(0)} ms`);
});

test("round 10 (replay), pinned after a mutation run: in one turn the triggers are run again in the order they fired (by id) and the things in the order they were born, each trigger answered by what its own firing named; an act's answer written after a later refused press is still its own entry's; a refused press the new version lets through enters its state with the act's latest recorded answer", () => {
  const GREEN: Answers = { "gate.green": { pass: true }, "used.enough": { pass: true } };
  const G = { on: "daily 09:30", if: { all: [{ in: ["on_switch"] }, { check: "gate.green" }] }, do: { ping: "explorer" } };
  const C = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { ping: "explorer" } };
  { // three triggers fire for one thing; the second asks a check the first did not name
    const f = raw(); f.triggers.a_g = G; f.triggers.c = C;
    f.triggers.b_u = { on: "daily 09:30", if: { all: [{ in: ["on_switch"] }, { check: "used.enough" }] }, do: { ping: "explorer" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8));
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, GREEN).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "fired a_g", "fired b_u", "fired c"];
    assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]);
  }
  { // one trigger fires for two things whose ids are not in the order they were born
    const f = raw(); f.triggers.a_g = G; f.triggers.c = C;
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    make(b, l, "zz", day(0, 8), MARCO, { title: "z", switch: "sz" }); make(b, l, "aa", day(0, 8, 5), MARCO, { title: "a", switch: "sa" });
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, GREEN).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "fired a_g", "fired c"];
    assert.deepEqual([r.differ, r.things.map((t) => [t.thing, told(t.now)])], [0, [["aa", life], ["zz", life]]]);
  }
  { // Marco drops a draft; Frank's promote is refused; the drop's switch.off is answered an hour after the drop, and is
    // told with the drop it answers
    const b = book([applied(VER)]), ways = waysOf(L);
    make(b, L, "d1", day(0, 8));
    const d = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(0, 10)), ids = b.write(d.drafts, MARCO);
    b.write(decide(L, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote" }, day(0, 10, 30)).drafts, FRANK);
    const x = acted(L.way!, VER, "d1", "switch.off", true, day(0, 11));
    b.write([{ ...x, value: { ...x.value, because: ids[d.acts[0].after] } }], MARCO);
    const r = replay(b.events, ways, L, L), life = ["made", "move make", "move drop", "acted switch.off ok", "refused promote wrong_state"];
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [[], 0, life, life]);
  }
  { // a drop refused under a version that lets a draft go only after thirty days, let through by the next: it enters
    // to_remove with the answer switch.off last gave for this draft
    const f1 = raw(); f1.rules.late = { field: "born", older: "30d" }; f1.life.draft.moves.find((m: { id: string }) => m.id === "drop").when = "late";
    f1.triggers.aa = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { act: "switch.off" } };
    const l1 = load(f1), f2 = structuredClone(f1); f2.prev = l1.ver; delete f2.life.draft.moves.find((m: { id: string }) => m.id === "drop").when;
    const l2 = load(f2), ways = waysOf(l1, l2), b = book([applied(l1.ver)]);
    assert.deepEqual([l1.problems, l2.problems], [[], []]);
    make(b, l1, "d1", day(0, 8));
    b.write(due(l1, fold(WAY, b.events, ways), TICK(0), ME, {}, { "switch.off": true }).drafts, RUNNER);
    const d = decide(l1, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(2, 10));
    assert.equal(d.why, "rule_failed");
    b.write(d.drafts, MARCO);
    assert.deepEqual(told(replay(b.events, ways, l1, l2).things[0].now).slice(-2), ["move drop", "acted switch.off ok"]);
  }
});

test("round 10 (replay), pinned after mutating the fix: a firing is answered once, in its own turn, by its own signer, for its own thing, with the move its trigger does (each press an hour later, and at the firing's very ms). A trigger's move that was taken answers it, so the runner machine's own press that names the firing afterwards is a press (tried again, refused as it was). A turn cut short after its firing leaves the firing unanswered: a press that names it later is still a press, with a press standing between, whoever signed it, whichever thing it is for (with a turn of the runner standing between: round 11); and the preview shows the refusal the turn would have written, which the history does not have", () => {
  const base = () => {
    const f = raw();
    f.roles.keeper.who.push(RUNNER);
    f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
    return f;
  };
  const HEAD = ["made", "move make", "move want"];
  // lives under the version itself, and `now` under one whose `solid` asks only for the contract (a press that named all
  // five checks goes through; the trigger's own move, which named none, does not)
  const lives = (b: ReturnType<typeof book>, f: Record<string, any>, l: Loaded) => {
    const f2 = structuredClone(f); f2.prev = l.ver; f2.rules.solid = { all: [{ check: "contract.written" }] };
    const l2 = load(f2), r = replay(b.events, waysOf(l), l, l), r2 = replay(b.events, waysOf(l, l2), l, l2);
    assert.deepEqual([l.problems, l2.problems, fold(WAY, b.events, waysOf(l)).skipped], [[], [], []]);
    return { differ: [r.differ, r2.differ], was: r.things.map((t) => told(t.was).slice(3)), now: r.things.map((t) => told(t.now).slice(3)), now2: r2.things.map((t) => told(t.now).slice(3)) };
  };
  const start = (f: Record<string, any>, things: string[]) => {
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    things.forEach((id, i) => make(b, l, id, day(0, 8, 0) + i));
    for (const thing of things) b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing, move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const t = due(l, fold(WAY, b.events, ways), TICK(0), ME, {});
    return { l, ways, b, t, at: t.drafts.findIndex((x) => x.kind === "way.fired") };
  };
  const press = (s: ReturnType<typeof start>, asker: string, thing: string, move: string, at: number, because?: string, answers?: Answers) =>
    s.b.write(decide(s.l, fold(WAY, s.b.events, s.ways), { asker, thing, move, ...(because ? { because } : {}) }, at, answers).drafts, asker);
  for (const when of [day(0, 10, 30), TICK(0)]) {
  { // the trigger's promote is taken (no rule on it here); the machine's press names the same firing
    const f = base(); delete f.life.draft.moves.find((m: { id: string }) => m.id === "promote").when;
    const s = start(f, ["d1"]), firing = s.b.write(s.t.drafts, RUNNER)[s.at];
    press(s, RUNNER, "d1", "promote", when, firing);
    const life = ["fired auto", "move promote", "refused promote wrong_state"];
    assert.deepEqual(lives(s.b, f, s.l), { differ: [0, 0], was: [life], now: [life], now2: [life] });
  }
  { // cut short, then Marco's refused want, then the machine's press naming the firing: not in the firing's turn
    const f = base(), s = start(f, ["d1"]), firing = s.b.write(s.t.drafts.slice(0, s.at + 1), RUNNER)[s.at];
    press(s, MARCO, "d1", "want", when === TICK(0) ? when : day(0, 9, 40));
    press(s, RUNNER, "d1", "promote", when, firing, OK5);
    assert.deepEqual(lives(s.b, f, s.l), { differ: [1, 1],
      was: [["fired auto", "refused want wrong_state", "refused promote rule_failed"]],
      now: [["fired auto", "refused promote rule_unread", "refused want wrong_state", "refused promote rule_failed"]],
      now2: [["fired auto", "refused promote rule_unread", "refused want wrong_state", "move promote"]] });
  }
  { // cut short, and right after it Frank's press naming the firing: in the firing's turn, not its signer's
    const f = base(), s = start(f, ["d1"]), firing = s.b.write(s.t.drafts.slice(0, s.at + 1), RUNNER)[s.at];
    press(s, FRANK, "d1", "promote", when, firing, OK5);
    assert.deepEqual(lives(s.b, f, s.l), { differ: [1, 1],
      was: [["fired auto", "refused promote rule_failed"]],
      now: [["fired auto", "refused promote rule_unread", "refused promote rule_failed"]],
      now2: [["fired auto", "refused promote rule_unread", "move promote"]] });
  }
  { // cut short after d1's firing, and right after it the machine's press for d2 naming d1's firing: not its thing
    const f = base(), s = start(f, ["d1", "d2"]), firing = s.b.write(s.t.drafts.slice(0, s.at + 1), RUNNER)[s.at];
    press(s, RUNNER, "d2", "promote", when, firing, OK5);
    assert.deepEqual(lives(s.b, f, s.l), { differ: [2, 2],
      was: [["fired auto"], ["refused promote rule_failed"]],
      now: [["fired auto", "refused promote rule_unread"], ["fired auto", "refused promote rule_unread", "refused promote rule_failed"]],
      now2: [["fired auto", "refused promote rule_unread"], ["fired auto", "refused promote rule_unread", "move promote"]] });
  }
  { // cut short, and right after it the machine's press of another move, naming the firing: not the move its trigger does
    const f = base(), s = start(f, ["d1"]), firing = s.b.write(s.t.drafts.slice(0, s.at + 1), RUNNER)[s.at];
    press(s, RUNNER, "d1", "pull", when, firing);
    assert.deepEqual(lives(s.b, f, s.l), { differ: [1, 1],
      was: [["fired auto", "refused pull wrong_state"]],
      now: [["fired auto", "refused promote rule_unread", "refused pull wrong_state"]],
      now2: [["fired auto", "refused promote rule_unread", "refused pull wrong_state"]] });
  }
  }
});

test("round 10 (replay), pinned after mutating the fix: in a log whose firings carry no id, only a refusal at the firing's very time that says no `because` is taken for the firing's own. A person's refusal between two turns of one time parts them when its own time is another (a clock a minute behind), and when it says which firing it answers: the first turn's red gate and the second's green stay each with its turn", () => {
  for (const shape of ["another time", "says because"]) {
    const f = raw();
    f.triggers.nudge = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { ping: "explorer" } };
    f.triggers.zz = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { check: "gate.green" }] }, do: { ping: "explorer" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 9));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 10)).drafts, MARCO);
    const t = due(l, fold(WAY, b.events, ways), TICK(1), ME, OK5);
    const firing = b.write(t.drafts, RUNNER)[t.drafts.findIndex((x) => x.kind === "way.fired")];
    const d = decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote", ...(shape === "says because" ? { because: firing } : {}) }, shape === "another time" ? TICK(1) - 60_000 : TICK(1), OK5);
    assert.deepEqual([d.ok, d.why], [false, "rule_failed"]);
    b.write(d.drafts, FRANK);
    b.write(due(l, fold(WAY, b.events, ways), TICK(1), ME, ALL5).drafts, RUNNER);
    const old = b.events.map((e) => {
      if (!/fired|refused|acted/.test(e.kind) || e.by !== RUNNER) return e;
      const { id: _id, ...x } = e, { because: _b, ...value } = e.value ?? {};
      return { ...x, value };
    });
    const r = replay(old, ways, l, l), life = ["made", "move make", "move want", "fired nudge", "refused promote rule_failed", "fired zz"];
    assert.deepEqual([shape, fold(WAY, old, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [shape, [], 0, life, life]);
  }
});

test("round 11 (replay): a trigger's own refusal is the first answer of its firing, with no other firing since, at the firing's very time. A turn cut short after its firing, then the runner's turn of the next day, then the runner machine's own press naming the first day's firing: a press (with only a turn between, it was taken for the trigger's own refusal, and its checks answered the first day's turn). The limit left: that machine's press right after the cut-short firing, at the firing's very ms, is written as the turn itself would have written the refusal, and is read as it", () => {
  const base = () => {
    const f = raw();
    f.roles.keeper.who.push(RUNNER);
    f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
    return f;
  };
  for (const [shape, was, now, now2] of [
    ["the next day's turn between",
      ["fired auto", "fired auto", "refused promote rule_unread", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "fired auto", "refused promote rule_unread", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "fired auto", "refused promote rule_unread", "move promote"]],
    // (each of the two alone: only the time is another, only another firing stands since)
    ["an hour later, nothing between",
      ["fired auto", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "move promote"]],
    // (round 12: the very ms, not a while after it: half a minute later is a press too)
    ["half a minute later, nothing between",
      ["fired auto", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "move promote"]],
    ["another trigger's firing of that very ms between",
      ["fired auto", "fired zz", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "fired zz", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_unread", "fired zz", "move promote"]],
    ["at the firing's very ms",
      ["fired auto", "refused promote rule_failed"],
      ["fired auto", "refused promote rule_failed"],
      ["fired auto", "move promote"]],
  ] as const) {
    const f = base();
    // (zz runs an act: a turn runs its pings first, and auto's firing would not stand before it)
    if (shape.startsWith("another trigger")) f.triggers.zz = { on: "daily 09:30", if: { in: ["wanted"] }, do: { act: "switch.off" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    const f2 = structuredClone(f); f2.prev = l.ver; f2.rules.solid = { all: [{ check: "contract.written" }] };
    const l2 = load(f2);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const t = due(l, fold(WAY, b.events, ways), TICK(0), ME, {}), at = t.drafts.findIndex((x) => x.kind === "way.fired");
    const firing = b.write(t.drafts.slice(0, at + 1), RUNNER)[at];
    const next = shape === "the next day's turn between", own = shape === "at the firing's very ms";
    if (next) b.write(due(l, fold(WAY, b.events, ways), TICK(1), ME, {}).drafts, RUNNER);
    // (the runner's next turn at that very ms: auto fired for this tick already, zz fires)
    if (f.triggers.zz) b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, {}).drafts, RUNNER);
    const d = decide(l, fold(WAY, b.events, ways), { asker: RUNNER, thing: "d1", move: "promote", because: firing }, next ? day(1, 10, 30) : shape.startsWith("an hour") ? day(0, 10, 30) : shape.startsWith("half") ? TICK(0) + 30_000 : TICK(0), OK5);
    assert.deepEqual([d.ok, d.why], [false, "rule_failed"]);
    b.write(d.drafts, RUNNER);
    const r = replay(b.events, ways, l, l), r2 = replay(b.events, waysOf(l, l2), l, l2);
    assert.deepEqual([shape, fold(WAY, b.events, ways).skipped, told(r.things[0].was).slice(3), told(r.things[0].now).slice(3), told(r2.things[0].now).slice(3)], [shape, [], [...was], [...now], [...now2]]);
    // the press is made by the machine's role, the trigger's own by the trigger
    assert.equal(r2.things[0].now.at(-1)!.by, own ? "trigger:auto" : "keeper");
  }
});

test("round 11 (replay), pinned after the grader's mutation run: a trigger's own answer (its move taken, or its refusal) parts no turn, so the triggers that fire after it are still answered by the turn's checks; the runner's turn writes nothing for a thing in an end state, whatever its trigger asks; a trigger's own refusal is told by what the trigger did under the firing's version; the runner's turns before a thing's birth are no part of its life; a press taken from the runner's own machine that names a firing parts the turns before and after it", () => {
  const find = (f: Record<string, any>, id: string) => f.life.draft.moves.find((m: { id: string }) => m.id === id);
  for (const [move, st, answer] of [["want", "wanted", "move want"], ["promote", "on_switch", "refused promote wrong_state"]] as const) {
    // one turn: a0 fires for d1 and d2 and is answered for each; then b1 (which asks gate.green) and c2 fire for both
    const f = raw();
    find(f, move).by.push("trigger:a0");
    f.triggers.a0 = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { move } };
    f.triggers.b1 = { on: "daily 09:30", if: { all: [{ in: [st] }, { check: "gate.green" }] }, do: { act: "switch.off" } };
    f.triggers.c2 = { on: "daily 09:30", if: { in: [st] }, do: { act: "switch.off" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8)); make(b, l, "d2", day(0, 8) + 1);
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, { "gate.green": { pass: true } }, { "switch.off": true }).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "fired a0", answer, "fired b1", "acted switch.off ok", "fired c2", "acted switch.off ok"];
    assert.deepEqual([r.differ, r.things.map((t) => [told(t.was), told(t.now)])], [0, [[life, life], [life, life]]]);
  }
  { // d1 dropped and pulled (an end state), d2 live: a trigger whose `if` does not ask the state fires for d2 alone
    const f = raw();
    f.triggers.aged = { on: "daily 09:30", if: { field: "born", older: "0d" }, do: { ping: "keeper" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8)); make(b, l, "d2", day(0, 8, 1));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(0, 8, 10)).drafts, MARCO);
    b.write(decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "pull" }, day(0, 8, 20)).drafts, FRANK);
    const p = fold(WAY, b.events, ways), d = due(l, p, TICK(0), ME);
    assert.deepEqual([p.things.d1.state, d.pings.map((x) => `${x.trigger} ${x.thing}`), d.drafts.map((x) => `${x.kind} ${x.value.thing}`)], ["removed", ["aged d2"], ["way.fired d2"]]);
  }
  { // v1: auto promotes a wanted draft (refused: no check was read). v2: auto only pings, and promote is the keeper's
    const f = raw();
    find(f, "promote").by.push("trigger:auto");
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.triggers.auto.do = { ping: "keeper" }; find(f2, "promote").by = ["keeper"];
    const l2 = load(f2), ways = waysOf(l, l2), b = book([applied(l.ver)]);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, {}).drafts, RUNNER);
    const r = replay(b.events, ways, l, l2), head = ["made", "move make", "move want", "fired auto"];
    assert.deepEqual([r.differ, r.things[0].first?.index, told(r.things[0].was), told(r.things[0].now)], [1, 4, [...head, "refused promote rule_unread"], head]);
  }
  { // at one tick: the runner's turn fires for d0, Marco makes d1 at the tick's very ms, the runner's next turn (the
    // same ms) fires for d1. A version that changes only b's words leaves d1's life a then b
    const f = raw();
    f.triggers.a = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { ping: "keeper" } };
    f.triggers.b = { on: "daily 09:30", if: { in: ["on_switch"] }, do: { ping: "keeper", say: "one" } };
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.triggers.b.do.say = "two";
    const l2 = load(f2), ways = waysOf(l, l2), b = book([applied(l.ver)]);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    make(b, l, "d0", day(0, 8));
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME).drafts, RUNNER);
    make(b, l, "d1", TICK(0));
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME).drafts, RUNNER);
    const life = ["made", "move make", "fired a", "fired b"];
    for (const to of [l, l2]) {
      const r = replay(b.events, ways, l, to);
      assert.deepEqual([r.differ, r.things.map((t) => [t.thing, told(t.was), told(t.now)])], [0, [["d0", life, life], ["d1", life, life]]]);
    }
  }
  { // turn 1 (auto fires, its poke refused: gate.green not read), the machine's poke at that very time naming the firing
    // (taken: it read the gate), turn 2 at that time (zz fires with used.enough): zz stays after the machine's poke
    const f = raw();
    f.roles.keeper.who.push(RUNNER);
    f.rules.gate = { check: "gate.green" };
    f.life.draft.moves.push({ id: "poke", from: ["wanted"], to: "same", by: ["keeper", "trigger:auto"], when: "gate" });
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "poke" } };
    f.triggers.zz = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { check: "used.enough" }] }, do: { act: "switch.off" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual(l.problems, []);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const t1 = due(l, fold(WAY, b.events, ways), TICK(0), ME, {});
    const firing = b.write(t1.drafts, RUNNER)[t1.drafts.findIndex((x) => x.kind === "way.fired")];
    const d = decide(l, fold(WAY, b.events, ways), { asker: RUNNER, thing: "d1", move: "poke", because: firing }, TICK(0), { "gate.green": { pass: true } });
    assert.equal(d.ok, true);
    b.write(d.drafts, RUNNER);
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, { "used.enough": { pass: true } }).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "move want", "fired auto", "refused poke rule_unread", "move poke", "fired zz"];
    assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now), r.things[0].now[5].by], [0, life, life, "keeper"]);
  }
});

test("round 11 (replay): two turns of the runner at one signed time, with nothing between them, are read as one; a trigger the first of them fired is still answered as its own turn answered it. Its move was refused for a check not read there (rule_unread); the second turn read the rule's checks for another trigger: the first trigger's move is refused again, not judged with the second turn's answers, however the rule asks the check (under all, any, not, in a rule it names), and what the trigger's own firing and refusal did read stays read", () => {
  const A = { check: "gate.green" }, B = { check: "used.enough" }, pass = { pass: true }, red = { pass: false };
  const both = { "gate.green": pass, "used.enough": pass }, one = { "used.enough": pass };
  for (const [shape, rules, parts, own, first, second, wrote] of [
    ["none of the rule's checks read", { gate: { all: [A, B] } }, [A, B], [], {}, both, ["way.fired", "way.refused"]],
    ["one of the two read", { gate: { all: [A, B] } }, [A, B], [], one, both, ["way.fired", "way.checked", "way.refused"]],
    ["under any", { gate: { any: [A, B] } }, [A, B], [], one, both, ["way.fired", "way.checked", "way.refused"]],
    ["under not", { gate: { all: [{ not: A }, B] } }, [{ not: A }, B], [], one, { "gate.green": red, "used.enough": pass }, ["way.fired", "way.checked", "way.refused"]],
    ["in a rule the rule names", { gate: { all: [{ rule: "inner" }, B] }, inner: A }, [A, B], [], one, both, ["way.fired", "way.checked", "way.refused"]],
    // (the trigger's own `if` read the check its move's rule read too: it fires again only if that answer is kept)
    ["the trigger's `if` read one of them", { gate: { all: [A, B] } }, [A, B], [B], one, both, ["way.checked", "way.fired", "way.checked", "way.refused"]],
  ] as const) {
    const f = raw();
    Object.assign(f.rules, structuredClone(rules));
    f.life.draft.moves.push({ id: "poke", from: ["wanted"], to: "same", by: ["trigger:auto"], when: "gate" });
    f.triggers.auto = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, ...own] }, do: { move: "poke" } };
    // (zz runs an act, not a ping: a turn runs its pings first, and a firing that does not follow the one before it in
    // a turn's order starts a turn of its own)
    f.triggers.zz = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, ...parts] }, do: { act: "switch.off" } };
    const l = load(f), ways = waysOf(l), b = book([applied(l.ver)]);
    assert.deepEqual([shape, l.problems], [shape, []]);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const t1 = due(l, fold(WAY, b.events, ways), TICK(0), ME, first);
    b.write(t1.drafts, RUNNER);
    const t2 = due(l, fold(WAY, b.events, ways), TICK(0), ME, second);
    b.write(t2.drafts, RUNNER);
    assert.deepEqual([shape, t1.drafts.map((x) => x.kind), t2.drafts.map((x) => x.kind)], [shape, [...wrote], ["way.checked", "way.checked", "way.fired"]]);
    const r = replay(b.events, ways, l, l), life = ["made", "move make", "move want", "fired auto", "refused poke rule_unread", "fired zz"];
    assert.deepEqual([shape, fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now)], [shape, [], 0, life, life]);
  }
});

test("round 11 (replay), pinned after mutating the walk: a turn of the runner is passed over for a thing only where it can write nothing for it. Six bounds of the passing over are held here by a history each, in which a later turn has something to write (the others: round 12's test): after a press the new version lets through, after a turn that wrote, on the first turn of another day, at a turn that read a check for the thing, after a changed trigger's tick, and after it when the runner's clock went back between", () => {
  const D = "daily 09:30";
  // every turn the history has fired for something: a marker (k0, k1, ...) dropped a millisecond before each turn, which
  // `tm` pings for. Frank's `arm` of d1 is refused under the version written (data.ok is red), and goes through under
  // one whose rule asks for the red: no trigger reads that rule, so the new version leaves every trigger as it was
  const base = () => {
    const f = raw();
    delete f.triggers.remind; delete f.triggers.expire; delete f.triggers.remind_again;
    f.life.draft.moves.find((m: { id: string }) => m.id === "drop").by = ["explorer"];
    f.rules.open = { check: "data.ok" };
    f.life.draft.moves.push({ id: "arm", from: ["on_switch"], to: "wanted", by: ["keeper"], when: "open" });
    f.triggers.tm = { on: D, if: { in: ["to_remove"] }, do: { ping: "keeper" } };
    return f;
  };
  const opened = (f2: Record<string, any>) => { f2.rules.open = { not: { check: "data.ok" } }; };
  type Steps = { turn: (at: number, answers?: Answers) => void; arm: (at: number) => void };
  /** d1's life after its birth: how many things differ under the version itself, and what the new version gives */
  const lived = (f: Record<string, any>, to: (f2: Record<string, any>) => void, steps: (s: Steps) => void) => {
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; to(f2);
    const l2 = load(f2), ways = waysOf(l, l2), b = book([applied(l.ver)]);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    for (let i = 0; i < 8; i++) make(b, l, `k${i}`, day(0, 7) + i);
    make(b, l, "d1", day(0, 8));
    let n = 0;
    steps({
      turn: (at, answers = {}) => {
        b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: `k${n++}`, move: "drop" }, at - 1).drafts, MARCO);
        const t = due(l, fold(WAY, b.events, ways), at, ME, answers);
        assert.ok(t.drafts.some((x) => x.kind === "way.fired"), "a turn that fired nothing is no turn of the history");
        b.write(t.drafts, RUNNER);
      },
      arm: (at) => {
        const d = decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "arm" }, at, { "data.ok": { pass: false, why: "red" } });
        assert.deepEqual([d.ok, d.why], [false, "rule_failed"]);
        b.write(d.drafts, FRANK);
      },
    });
    assert.deepEqual(fold(WAY, b.events, ways).skipped, []);
    const r = replay(b.events, ways, l, l), r2 = replay(b.events, ways, l, l2);
    return [r.differ, told(r2.things.find((t) => t.thing === "d1")!.now).slice(2)];
  };
  { // two turns that write nothing for d1, the press, two more turns: `b` sends the armed thing back at the first of
    // them, and `a` (which asks whether `b` fired) pings at the second
    const f = base();
    f.life.draft.moves.push({ id: "back", from: ["wanted"], to: "on_switch", by: ["trigger:b"] });
    f.triggers.a = { on: D, if: { all: [{ in: ["on_switch"] }, { fired: "b" }] }, do: { ping: "keeper" } };
    f.triggers.b = { on: D, if: { in: ["wanted"] }, do: { move: "back" } };
    assert.deepEqual(lived(f, opened, ({ turn, arm }) => { turn(TICK(0)); turn(day(0, 9, 40)); arm(day(0, 9, 50)); turn(day(0, 10)); turn(day(0, 10, 10)); }),
      [0, ["move arm", "fired b", "move back", "fired a"]]);
  }
  { // armed on the first day, between its turns; `late` asks for a day of age, and pings at the first turn of the next
    const f = base();
    f.triggers.late = { on: D, if: { all: [{ in: ["wanted"] }, { field: "born", older: "1d" }] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, opened, ({ turn, arm }) => { turn(TICK(0)); turn(day(0, 10)); arm(day(0, 10, 30)); turn(day(0, 11)); turn(day(0, 12)); turn(TICK(1)); turn(day(1, 10)); }),
      [0, ["move arm", "fired late"]]);
  }
  { // no press at all: the day's third turn is the first to read the gate, and `chk` fires for d1 there
    const f = base();
    f.triggers.chk = { on: D, if: { all: [{ in: ["on_switch"] }, { check: "gate.green" }] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, (f2) => { f2.name = "renamed"; }, ({ turn }) => { turn(TICK(0)); turn(day(0, 9, 40)); turn(day(0, 10), { "gate.green": { pass: true } }); turn(day(0, 10, 10)); }),
      [0, ["fired chk"]]);
  }
  // `x` ripens a thing at 09:30 and `y` pings for a ripe one at the runner's next turn. The new version moves `x` to
  // 10:30: it is tried at that tick, and `y`, left as it was, at the first turn after it
  for (const [shape, turns] of [
    ["a changed trigger's tick", [TICK(0), day(0, 9, 40), day(0, 10), day(0, 10, 10), day(0, 10, 40)]],
    // (the runner's clock goes back after its 10:50 turn: the turns after it are before the tick again)
    ["and the runner's clock set back after it", [TICK(0), day(0, 9, 40), day(0, 10), day(0, 10, 5), day(0, 10, 50), day(0, 10, 20), day(0, 10, 25)]],
  ] as const) {
    const f = base();
    f.life.draft.moves.push({ id: "ripen", from: ["on_switch"], to: "wanted", by: ["trigger:x"] });
    f.triggers.x = { on: D, if: { in: ["on_switch"] }, do: { move: "ripen" } };
    f.triggers.y = { on: D, if: { in: ["wanted"] }, do: { ping: "keeper" } };
    assert.deepEqual([shape, ...lived(f, (f2) => { f2.triggers.x.on = "daily 10:30"; }, ({ turn }) => { for (const at of turns) turn(at); })],
      [shape, 0, ["fired x", "move ripen", "fired y"]]);
  }
});

test("round 11 (replay), pinned after mutating the fix: what a trigger's own refusal leaves unread is told by the refusal. Refused for the thing's state, its move asked no check at all: under a version where the thing is in the move's state, the move is judged with what the turn read for its other triggers. Refused for a check not read, it is the rule of the refusal's own version that was not read: a new version whose rule asks a check the trigger's turn did read is judged with it", () => {
  const A = { check: "gate.green" }, B = { check: "used.enough" }, pass = { pass: true };
  { // `auto` pokes a thing behind the switch too (refused: wrong_state) in the turn that read the gate for `zz`. Under a
    // version that lets Frank's refused `arm` through, the thing is wanted at that turn: the poke is judged, and passes
    const f = raw();
    f.rules.gate = A; f.rules.open = { check: "data.ok" };
    f.life.draft.moves.push({ id: "arm", from: ["on_switch"], to: "wanted", by: ["keeper"], when: "open" });
    f.life.draft.moves.push({ id: "poke", from: ["wanted"], to: "same", by: ["trigger:auto"], when: "gate" });
    f.triggers.auto = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { move: "poke" } };
    f.triggers.zz = { on: "daily 09:30", if: { all: [{ in: ["on_switch", "wanted"] }, A] }, do: { act: "switch.off" } };
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.rules.open = { not: { check: "data.ok" } };
    const l2 = load(f2), ways = waysOf(l, l2), b = book([applied(l.ver)]);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    make(b, l, "d1", day(0, 8));
    const d = decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "arm" }, day(0, 9), { "data.ok": { pass: false, why: "red" } });
    assert.deepEqual([d.ok, d.why], [false, "rule_failed"]);
    b.write(d.drafts, FRANK);
    b.write(due(l, fold(WAY, b.events, ways), TICK(0), ME, { "gate.green": pass }).drafts, RUNNER);
    const r = replay(b.events, ways, l, l), r2 = replay(b.events, ways, l, l2);
    const life = ["made", "move make", "refused arm rule_failed", "fired auto", "refused poke wrong_state", "fired zz"];
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].was), told(r.things[0].now), told(r2.things[0].now)],
      [[], 0, life, life, ["made", "move make", "move arm", "fired auto", "move poke", "fired zz"]]);
  }
  { // two turns at one time: the first read used.enough and refused `auto`'s poke, whose rule asked the gate; the second
    // read both for `zz`. A version whose rule asks used.enough instead: the first turn had read it, and the poke passes
    const f = raw();
    f.rules.gate = A;
    f.life.draft.moves.push({ id: "poke", from: ["wanted"], to: "same", by: ["trigger:auto"], when: "gate" });
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "poke" } };
    f.triggers.zz = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, A, B] }, do: { act: "switch.off" } };
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.rules.gate = B;
    const l2 = load(f2), ways = waysOf(l, l2), b = book([applied(l.ver)]);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    make(b, l, "d1", day(0, 8));
    b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(0, 8, 5)).drafts, MARCO);
    const t1 = due(l, fold(WAY, b.events, ways), TICK(0), ME, { "used.enough": pass });
    b.write(t1.drafts, RUNNER);
    const t2 = due(l, fold(WAY, b.events, ways), TICK(0), ME, { "gate.green": pass, "used.enough": pass });
    b.write(t2.drafts, RUNNER);
    assert.deepEqual([t1.drafts.map((x) => x.kind), t2.drafts.map((x) => x.kind)], [["way.fired", "way.refused"], ["way.checked", "way.checked", "way.fired"]]);
    const r = replay(b.events, ways, l, l), r2 = replay(b.events, ways, l, l2);
    const head = ["made", "move make", "move want", "fired auto"];
    assert.deepEqual([fold(WAY, b.events, ways).skipped, r.differ, told(r.things[0].now), told(r2.things[0].now)],
      [[], 0, [...head, "refused poke rule_unread", "fired zz"], [...head, "move poke", "fired zz"]]);
  }
});

test("round 11 (replay): a preview's work is linear in the things, with the runner turning after every press too (and, since round 12, in each clock's ticks: its own test): four times the things is about four times the work (it was sixteen: each thing was run at every turn of the runner, and the turns grow with the things), and things that ended long ago are not walked through the turns written after them", () => {
  const f = raw();
  delete f.triggers.remind; delete f.triggers.expire;
  f.life.draft.moves.find((m: { id: string }) => m.id === "drop").by = ["explorer"];
  f.life.draft.moves.push({ id: "back", from: ["wanted"], to: "on_switch", by: ["trigger:bounce"] });
  f.triggers.bounce = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "back" } };
  const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.name = "renamed";
  const f3 = structuredClone(f); f3.prev = l.ver; f3.life.draft.states.parked = { name: "parked" };   // every trigger counts as changed
  const l2 = load(f2), l3 = load(f3), ways = waysOf(l, l2, l3);
  assert.deepEqual([l.problems, l2.problems, l3.problems], [[], [], []]);
  // a book kept folded as it is written (a fold for every press would be the square of the book)
  const built = (ended: number, live: number, days: number) => {
    const b = book([applied(l.ver)]), p = emptyProjection(WAY);
    let n = 0;
    const read = () => { for (; n < b.events.length; n++) step(p, b.events[n], (v) => ways.get(v), OWN, n); return p; };
    const press = (asker: string, ask: Omit<Ask, "asker">, at: number) => b.write(decide(l, read(), { asker, ...ask }, at).drafts, asker);
    for (let i = 0; i < ended; i++) {
      press(MARCO, { thing: `x${i}`, kind: "draft", move: "make", set: { title: "x", switch: `sx${i}` } }, day(0, 7) + i);
      press(MARCO, { thing: `x${i}`, move: "drop" }, day(0, 7, 30) + i);
      press(FRANK, { thing: `x${i}`, move: "pull" }, day(0, 7, 45) + i);
    }
    for (let i = 0; i < live; i++) press(MARCO, { thing: `t${i}`, kind: "draft", move: "make", set: { title: "x", switch: `s${i}` } }, day(0, 8) + i);
    // each day each live thing is wanted, and the runner turns a second later: its trigger sends the thing back
    for (let d = 1; d <= days; d++) for (let i = 0; i < live; i++) {
      const at = day(d, 10) + i * 20_000;
      press(MARCO, { thing: `t${i}`, move: "want" }, at);
      b.write(due(l, read(), at + 1000, ME).drafts, RUNNER);
    }
    assert.deepEqual([read().skipped, read().things.x0?.state ?? "removed", b.events.filter((e) => e.kind === "way.fired").length], [[], "removed", live * days]);
    return b.events;
  };
  const time = (events: readonly WayEvent[], to: Loaded, things: number, differ = 0) => Math.min(...[0, 1, 2].map(() => {
    const t0 = performance.now(), r = replay(events, ways, l, to);
    assert.deepEqual([r.differ, r.things.length], [differ, things]);
    return performance.now() - t0;
  }));
  const few = built(0, 40, 6), many = built(0, 160, 6);
  for (const to of [l, l2]) {
    const short = time(few, to, 40), long = time(many, to, 160);
    if (process.env.WAY_TIMES) console.log(`40 things: ${short.toFixed(0)} ms, 160 things: ${long.toFixed(0)} ms`);
    assert.ok(long < short * 9, `40 things: ${short.toFixed(0)} ms, 160 things: ${long.toFixed(0)} ms`);
  }
  const none = built(0, 20, 20), old = built(300, 20, 20);
  // (under the version that changes every trigger, a trigger is tried at its ticks only, not at the runner's later
  // turns: each live thing's life differs, the ended ones' do not)
  for (const to of [l, l3]) {
    const differ = to === l ? 0 : 20, without = time(none, to, 20, differ), with_ = time(old, to, 320, differ);
    if (process.env.WAY_TIMES) console.log(`20 live things: ${without.toFixed(0)} ms, with 300 ended before them: ${with_.toFixed(0)} ms`);
    assert.ok(with_ < without * 4, `20 live things: ${without.toFixed(0)} ms, with 300 ended before them: ${with_.toFixed(0)} ms`);
  }
});

test("round 12 (replay), pinned after the grader's mutation run, and after the walk came to pass triggers over: a turn is passed over for a thing only where it reads the ticks of every clock (in the way's zone) that an earlier turn read and wrote nothing at; a turn at a changed trigger's very tick is run; a ping written in the replay is a change; the passing over stops at the first turn of the next span. In a turn that is run, a trigger is passed over only where it reads the tick it read at that earlier turn, only until a trigger before it in the turn writes, and never in a turn the thing was fired in", () => {
  const YES: Answers = { "data.ok": { pass: true } }, NO: Answers = { "data.ok": { pass: false, why: "red" } };
  // Marco's `want` and `tag` ask data.ok; the new version lets `want` through (no trigger reads that rule): a want the
  // history refused is taken in the replay, and the thing's life parts from the history there
  const base = () => {
    const f = raw();
    delete f.triggers.remind; delete f.triggers.expire; delete f.triggers.remind_again;
    f.life.draft.moves.find((m: { id: string }) => m.id === "drop").by = ["explorer"];
    f.things.draft.fields.level = "number?";
    f.life.draft.moves.push({ id: "tag", from: ["on_switch", "wanted"], to: "same", by: ["explorer"], set: ["level"], when: "w_tag" });
    f.rules.w_tag = { check: "data.ok" };
    f.life.draft.moves.find((m: { id: string }) => m.id === "want").when = "w_want";
    f.rules.w_want = { check: "data.ok" };
    // a thing of level 3 behind the switch is pinged for: the runner's turns stand in the history
    f.triggers.bt = { on: "daily 09:30", if: { all: [{ in: ["on_switch"] }, { field: "level", is: 3 }] }, do: { ping: "keeper" } };
    return f;
  };
  const opened = (f2: Record<string, any>) => { f2.rules.w_want = { field: "born", older: "0d" }; };
  type B = { press: (asker: string, ask: Omit<Ask, "asker">, at: number, answers?: Answers) => void; turn: (at: number, answers?: Answers) => void;
    mk: (thing: string, at: number, level?: number, ok?: boolean) => void };
  /** `a`'s life under the new version (the version over its own history differs nowhere) */
  const lived = (f: Record<string, any>, to: (f2: Record<string, any>) => void, steps: (b: B) => void) => {
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; to(f2);
    const l2 = load(f2), ways = waysOf(l, l2), b = book([applied(l.ver)]);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    const press: B["press"] = (asker, ask, at, answers = {}) => { b.write(decide(l, fold(WAY, b.events, ways), { asker, ...ask } as Ask, at, answers).drafts, asker); };
    steps({
      press,
      turn: (at, answers = {}) => { b.write(due(l, fold(WAY, b.events, ways), at, ME, answers).drafts, RUNNER); },
      // made, then wanted (level 2) or tagged with a level, the rule red when `ok` is false
      mk: (thing, at, level, ok = true) => {
        press(MARCO, { thing, kind: "draft", move: "make", set: { title: "x", switch: `s${thing}` } }, at);
        if (level === 2) press(MARCO, { thing, move: "want" }, at + 60_000, ok ? YES : NO);
        else if (level !== undefined) press(MARCO, { thing, move: "tag", set: { level } }, at + 60_000, ok ? YES : NO);
      },
    });
    assert.deepEqual(fold(WAY, b.events, ways).skipped, []);
    const r = replay(b.events, ways, l, l), r2 = replay(b.events, ways, l, l2);
    return [r.differ, told(r2.things.find((t) => t.thing === "a")!.now).slice(2)];
  };
  { // the span is read in the way's zone: turns at 08:00 and 10:00 New York read two ticks of 09:30 there (one in UTC)
    const f = base();
    f.triggers.late = { on: "daily 09:30", if: { in: ["wanted"] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, opened, ({ turn, mk }) => { mk("b1", day(-1, 7), 3); mk("b2", day(-1, 7, 5), 3); mk("a", day(0, 6), 2, false); turn(day(0, 8)); turn(day(0, 10)); }),
      [0, ["move want", "fired late"]]);
  }
  { // and of every clock: `aft`'s 14:00 tick parts the turns at 10:00 and 15:00, where `bt`'s 09:30 does not
    const f = base();
    f.triggers.aft = { on: "daily 14:00", if: { in: ["wanted"] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, opened, ({ turn, mk }) => { mk("b1", day(-1, 7), 3); mk("a", day(0, 8), 2, false); turn(day(0, 10)); mk("b2", day(0, 13), 2); turn(day(0, 15)); }),
      [0, ["move want", "fired aft"]]);
  }
  { // a changed trigger's tick at a turn's very time: x1 moves to 11:00 in the new version, and y1 (left as it was)
    // asks whether it fired, at the turn of that very time
    const f = base();
    f.triggers.x1 = { on: "daily 09:30", if: { field: "level", is: 99 }, do: { ping: "keeper" } };
    f.triggers.y1 = { on: "daily 09:30", if: { all: [{ fired: "x1" }, { in: ["on_switch"] }] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, (f2) => { f2.triggers.x1 = { on: "daily 11:00", if: { in: ["on_switch"] }, do: { ping: "keeper" } }; }, ({ press, turn, mk }) => {
      press(MARCO, { thing: "a", kind: "draft", move: "make", set: { title: "x", switch: "sa" } }, day(0, 8));
      mk("b1", day(0, 8, 1), 3); turn(day(0, 10)); mk("b2", day(0, 8, 3), 3); turn(day(0, 10, 30)); mk("b3", day(0, 8, 5), 3); turn(day(0, 11));
      press(MARCO, { thing: "a", move: "tag", set: { level: 1 } }, day(0, 11, 30), YES);
    }), [0, ["fired x1", "fired y1", "move tag"]]);
  }
  { // a ping is a change: z_first pings at the first turn, and a_after (which a turn runs before it) at the second
    const f = base();
    f.triggers.a_after = { on: "daily 09:30", if: { all: [{ fired: "z_first" }, { in: ["wanted"] }] }, do: { ping: "keeper" } };
    f.triggers.z_first = { on: "daily 09:30", if: { in: ["wanted"] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, opened, ({ turn, mk }) => { mk("a", day(0, 8), 2, false); mk("b1", day(0, 8, 2), 3); turn(day(0, 10)); mk("b2", day(0, 8, 4), 3); turn(day(0, 10, 30)); }),
      [0, ["move want", "fired z_first", "fired a_after"]]);
  }
  { // the next span's first turn is run: `late` asks for a day of age, and pings at the first turn of each later day
    const f = base();
    f.triggers.late = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { field: "born", older: "1d" }] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, opened, ({ turn, mk }) => { mk("a", day(0, 8), 2, false); mk("b1", day(0, 8, 2), 3); turn(day(0, 10)); mk("b2", day(0, 8, 4), 3); turn(day(0, 10, 30)); turn(day(1, 10)); turn(day(2, 10)); }),
      [0, ["move want", "fired late", "fired late"]]);
  }
  // the triggers a run turn passes over. Markers dropped before each turn (tm pings for them) keep the turns in the
  // history; the 09:40 turn writes nothing for `a`, and the 10:05 turn reads a new tick of the 10:00 clock only
  const marked = (f: Record<string, any>) => {
    f.triggers.tm = { on: "daily 00:01", if: { in: ["to_remove"] }, do: { ping: "keeper" } };
    return (b: B, answers: Answers = {}) => {
      for (let i = 0; i < 2; i++) b.press(MARCO, { thing: `k${i}`, kind: "draft", move: "make", set: { title: "k", switch: `k${i}` } }, day(-1, 20) + i);
      b.mk("a", day(0, 8), 2, false);
      b.press(MARCO, { thing: "k0", move: "drop" }, day(0, 9, 40) - 1); b.turn(day(0, 9, 40));
      b.press(MARCO, { thing: "k1", move: "drop" }, day(0, 10, 5) - 1); b.turn(day(0, 10, 5), answers);
    };
  };
  { // a1 (10:00) marks the wanted thing, then b1 (09:30, its tick read at 09:40 already) unmarks it
    const f = base(), steps = marked(f);
    f.life.draft.moves.push({ id: "mark", from: ["on_switch", "wanted"], to: "same", by: ["trigger:a1"], fix: { extended: true } });
    f.life.draft.moves.push({ id: "unmark", from: ["on_switch", "wanted"], to: "same", by: ["trigger:b1"], fix: { extended: false } });
    f.triggers.a1 = { on: "daily 10:00", if: { in: ["wanted"] }, do: { move: "mark" } };
    f.triggers.b1 = { on: "daily 09:30", if: { field: "extended", is: true }, do: { move: "unmark" } };
    assert.deepEqual(lived(f, opened, (b) => steps(b)), [0, ["move want", "fired a1", "move mark", "fired b1", "move unmark"]]);
  }
  { // at 10:05 the history fired a2 for `a`, which read the gate: a0 (09:30, before a2 in the turn) reads it too
    const f = base(), steps = marked(f);
    f.triggers.a2 = { on: "daily 10:00", if: { all: [{ check: "gate.green" }, { in: ["on_switch", "wanted"] }] }, do: { ping: "keeper" } };
    f.triggers.a0 = { on: "daily 09:30", if: { all: [{ in: ["wanted"] }, { check: "gate.green" }] }, do: { ping: "keeper" } };
    assert.deepEqual(lived(f, opened, (b) => steps(b, { "gate.green": { pass: true } })), [0, ["move want", "fired a0", "fired a2"]]);
  }
});

test("round 12 (replay): a preview's work grows with the clocks of the triggers left as they were, not with their square, where the thing changes about once a day. A runner that turns after every press reads a new tick of some clock at most turns; such a turn, when the thing has not changed since the last turn that wrote nothing for it, runs only the triggers whose tick it has not read for it yet (each trigger was run again at every new tick of any clock: thirty-two clocks were about seventy times the work of two; now about ten)", () => {
  const work = (clocks: number) => {
    const f = raw();
    delete f.triggers.remind; delete f.triggers.expire; delete f.triggers.remind_again;
    f.life.draft.moves.find((m: { id: string }) => m.id === "drop").by = ["explorer"];
    f.life.draft.moves.push({ id: "back", from: ["wanted"], to: "on_switch", by: ["trigger:bounce"] });
    f.triggers.bounce = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "back" } };
    for (let k = 0; k < clocks; k++) {
      const m = 10 * 60 + Math.floor((k * 13 * 60) / clocks);
      f.triggers[`p${k}`] = { on: `daily ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, if: { all: [{ in: ["wanted"] }, { not: { fired: `p${k}` } }] }, do: { ping: "keeper" } };
    }
    const l = load(f), f2 = structuredClone(f); f2.prev = l.ver; f2.name = "renamed";
    const l2 = load(f2), ways = waysOf(l, l2);
    assert.deepEqual([l.problems, l2.problems], [[], []]);
    const b = book([applied(l.ver)]), p = emptyProjection(WAY);
    let n = 0;
    const read = () => { for (; n < b.events.length; n++) step(p, b.events[n], (v) => ways.get(v), OWN, n); return p; };
    const N = 30, D = 6;
    for (let i = 0; i < N; i++) b.write(decide(l, read(), { asker: MARCO, thing: `t${i}`, kind: "draft", move: "make", set: { title: "x", switch: `s${i}` } }, day(0, 8) + i).drafts, MARCO);
    // each day each thing is wanted, spread over the day, and the runner turns a second after each press
    for (let d = 1; d <= D; d++) for (let i = 0; i < N; i++) {
      const at = day(d, 10) + Math.floor((i * 13 * 3_600_000) / N);
      b.write(decide(l, read(), { asker: MARCO, thing: `t${i}`, move: "want" }, at).drafts, MARCO);
      b.write(due(l, read(), at + 1000, ME).drafts, RUNNER);
    }
    assert.deepEqual(read().skipped, []);
    return Math.min(...[0, 1, 2].map(() => { const t0 = performance.now(), r = replay(b.events, ways, l, l2); assert.equal(r.differ, 0); return performance.now() - t0; }));
  };
  // (sixteen times the clocks: linear is up to sixteen times the work, the square two hundred and fifty-six)
  const few = work(2), many = work(32);
  if (process.env.WAY_TIMES) console.log(`two clocks: ${few.toFixed(0)} ms, thirty-two: ${many.toFixed(0)} ms`);
  assert.ok(many < few * 40, `two clocks: ${few.toFixed(0)} ms, thirty-two: ${many.toFixed(0)} ms`);
});

test("round 9 (clock): only a zone that is said is kept: with none said, each reading is in this machine's zone as it is at that reading", () => {
  const tz = process.env.TZ, none = undefined as unknown as string, t = Date.UTC(2026, 0, 1, 11);
  try {
    process.env.TZ = "UTC";
    const a = dayOf(t, none);
    process.env.TZ = "Pacific/Kiritimati";   // fourteen hours ahead: 11:00 UTC is the next day there
    const b = dayOf(t, none);
    assert.deepEqual([a, b - a], [Date.UTC(2026, 0, 1) / 86_400_000, 1]);
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
});

test("round 8 (clock): a zone's reader is made once and kept, and what is kept changes no answer: every zone Intl lists is read, more of them than are kept at once, forwards and then backwards, and each reading is the one a reader made for that reading alone gives; a zone Intl does not know throws each time it is asked", () => {
  const zones = Intl.supportedValuesOf("timeZone");
  assert.ok(zones.length > 200, `${zones.length} zones`);
  const own = (t: number, zone: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return { day: Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86_400_000, minutes: Number(p.hour) * 60 + Number(p.minute) };
  };
  const on = readOn("daily 09:30")!;
  let read = 0;
  for (const list of [zones, [...zones].reverse()]) for (const [i, zone] of list.entries()) {
    const t = day(i % 300, i % 24, i % 60), w = own(t, zone);
    assert.equal(dayOf(t, zone), w.day, zone);
    // the last 09:30 at or before t there: 09:30 on that zone's own wall clock, on this day or the one before
    const tick = lastTick(on, t, zone), at = own(tick, zone);
    assert.deepEqual([at.minutes, at.day], [570, w.minutes >= 570 ? w.day : w.day - 1], zone);
    // two zones far apart on the clock, asked in turn between the others
    assert.deepEqual([dayOf(t, "Pacific/Kiritimati") - dayOf(t, "Pacific/Pago_Pago"), dayOf(t, "Pacific/Kiritimati")], [own(t, "Pacific/Kiritimati").day - own(t, "Pacific/Pago_Pago").day, own(t, "Pacific/Kiritimati").day]);
    read++;
  }
  assert.equal(read, 2 * zones.length);
  for (let i = 0; i < 2; i++) assert.throws(() => dayOf(day(0, 12), "Mars/Phobos"), RangeError);
  assert.equal(dayOf(day(0, 12), "America/New_York"), own(day(0, 12), "America/New_York").day);
  // how many readers are made: a year of one zone's ticks makes one at most; the readers kept are counted, so of 65
  // zones read in turn, twice over, one at least is made again the second time (they are not kept without end)
  const Real = Intl.DateTimeFormat;
  const count = (f: () => void) => {
    let made = 0;
    Intl.DateTimeFormat = new Proxy(Real, { construct: (t, args) => { made++; return Reflect.construct(t, args); } });
    try { f(); } finally { Intl.DateTimeFormat = Real; }
    return made;
  };
  assert.ok(count(() => assert.equal(ticksBetween(on, day(0, 0), day(365, 0), "Europe/Berlin").length, 365)) <= 1);
  const some = zones.slice(0, 65);
  assert.ok(count(() => { for (const z of some) dayOf(day(0, 12), z); }) <= 65);
  const again = count(() => { for (const z of some) dayOf(day(0, 12), z); });
  assert.ok(again >= 1 && again <= 65, `${again} made again`);
});

test("F18: replay answers on a book of 300,000 events", () => {
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  for (let i = 0; i < 300_000; i++) b.events.push({ kind: "way.refused", item: "d1", at: day(1, 0) + i, id: `r${i}`, value: { way: WAY, ver: VER, thing: "d1", move: "want", why: "not_allowed" } });
  const r = replay(b.events, waysOf(L), L, L);
  assert.equal(r.differ, 0);
});

// ---------- signed events, ids ----------

/** a book with d1 made by Marco (and d2) and d1 extended, ids given, signed */
function base() {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9), MARCO, { title: "Logo", switch: "logo_v2" });
  make(b, L, "d2", day(0, 9, 10), MARCO, { title: "Dark", switch: "dark" });
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "extend" }, day(1, 9)).drafts, MARCO);
  const events = b.events;
  return { ways, events, id: (s: string) => events.find((e) => short(e).includes(s))!.id! };
}
/** a hand-made move, signed by the role's own person unless said (the runner's machine for a trigger) */
const mv = (thing: string, move: string, from: string, to: string, by: string, signed = by === "keeper" ? FRANK : by.startsWith("trigger:") ? RUNNER : MARCO, at = day(2, 9)): WayEvent =>
  ({ kind: "way.move", item: thing, at, id: `x-${move}-${to}-${by}-${signed}`, value: { way: WAY, ver: VER, thing, move, from, to, by }, by: signed });

test("the fold takes a move only where the way file sends it, as a role the move names, signed by someone that role names", () => {
  const { ways, events } = base();
  const last = (extra: WayEvent[]) => { const p = fold(WAY, [...events, ...extra], ways); return { p, why: p.skipped.at(-1)?.why, state: p.things.d1?.state }; };
  assert.deepEqual(fold(WAY, events, ways).skipped, []);
  // a forged target: want goes to wanted, never to official
  assert.equal(last([mv("d1", "want", "on_switch", "official", "explorer")]).why, "wrong_move");
  assert.equal(last([mv("d1", "want", "on_switch", "official", "explorer")]).state, "on_switch");
  assert.equal(last([mv("d1", "extend", "on_switch", "removed", "explorer")]).why, "wrong_move", "same stays where it is");
  // a role the move does not name, a move from where the thing is not, a from that lies
  assert.equal(last([mv("d1", "want", "on_switch", "wanted", "keeper")]).why, "not_allowed");
  assert.equal(last([mv("d1", "want", "on_switch", "wanted", "trigger:expire")]).why, "not_allowed");
  assert.equal(last([mv("d1", "promote", "on_switch", "official", "keeper")]).why, "wrong_state");
  assert.equal(last([mv("d1", "want", "wanted", "wanted", "explorer")]).why, "wrong_state");
  assert.equal(last([mv("d1", "make", "", "on_switch", "explorer")]).why, "wrong_state", "a second birth move");
  // signed: the role's own person only; a trigger's move only after its firing, by the runner
  assert.equal(last([mv("d1", "want", "on_switch", "wanted", "explorer", "agent:marco")]).why, "not_allowed");
  assert.equal(last([mv("d1", "want", "on_switch", "wanted", "explorer", FRANK)]).why, "not_allowed");
  assert.equal(last([mv("d1", "want", "on_switch", "wanted", "explorer", MARCO)]).state, "wanted");
  assert.equal(last([mv("d1", "drop", "on_switch", "to_remove", "trigger:expire", MARCO)]).why, "not_allowed");
  // 4a.1: a trigger's move is the named Sol's; the runner's person and another Sol of his are refused before the firing is looked at
  assert.equal(last([mv("d1", "drop", "on_switch", "to_remove", "trigger:expire", FRANK)]).why, "not_allowed");
  assert.equal(last([mv("d1", "drop", "on_switch", "to_remove", "trigger:expire", LAPTOP)]).why, "not_allowed");
  assert.equal(last([mv("d1", "drop", "on_switch", "to_remove", "trigger:expire", RUNNER)]).why, "not_fired");
  const fired = (signed: string, trigger = "remind"): WayEvent => ({ kind: "way.fired", item: "d1", at: TICK(14), id: `f-${signed}-${trigger}`, by: signed, value: { way: WAY, ver: VER, trigger, thing: "d1", tick: TICK(14) } });
  assert.equal(last([fired(MARCO)]).why, "not_runner");
  assert.equal(last([fired("agent:frank")]).why, "not_runner");
  // 4a.1: the runner is the one Sol named. Its person's own key, and another machine of that login, are not the runner
  assert.equal(last([fired(FRANK)]).why, "not_runner");
  assert.equal(last([fired(LAPTOP)]).why, "not_runner");
  assert.deepEqual(last([fired(LAPTOP)]).p.things.d1.fired, {});
  assert.equal(last([fired("machine:nucbox@marco")]).why, "not_runner", "the same machine name under another login");
  assert.equal(last([fired("machine:nucbox@frank ")]).why, "not_runner");
  assert.deepEqual(last([fired(RUNNER)]).p.things.d1.fired, { remind: TICK(14) });
  assert.equal(last([fired(RUNNER)]).why, undefined);
  assert.equal(last([fired(FRANK, "sweep")]).why, "unknown_trigger");
  // a birth by a role no birth move names, or signed by someone else
  const born = (by: string, signed = MARCO): WayEvent => ({ kind: "way.made", item: "d9", at: day(3, 9), id: `m-${by}-${signed}`, value: { way: WAY, ver: VER, thing: "d9", kind: "draft", by }, by: signed });
  assert.equal(last([born("keeper")]).why, "not_allowed");
  assert.equal(last([born("explorer", "agent:marco")]).why, "not_allowed");
  assert.equal(last([born("explorer", MARCO)]).p.things.d9.state, null);
  // an act of a seam that is a check, or of nothing
  assert.equal(last([{ kind: "way.acted", item: "d1", at: day(3, 9), by: MARCO, value: { way: WAY, ver: VER, thing: "d1", seam: "gate.green", pv: 1, pkg: "sha256:tbd", ok: false } }]).why, "not_caused");
});

test("a note sets only a text field its move sets, pointing at that move; an erased note takes back only what it set", () => {
  const { ways, events, id } = base();
  const make1 = id("way.move thing=d1 move=make"), make2 = id("way.move thing=d2 move=make"), extend = id("move=extend");
  const note = (about: string, words: unknown, because?: string, nid = `n-${about}-${because}`): WayEvent => ({ kind: "way.note", item: about, at: day(2, 9), id: nid, by: MARCO, value: { way: WAY, about, words, ...(because ? { because } : {}) } });
  const fields = (extra: WayEvent[]) => fold(WAY, [...events, ...extra], ways);
  const want = { title: "Logo", switch: "logo_v2", extended: true };
  for (const [what, n] of [
    ["a field the move fixes", note("d1.extended", false, make1)],
    ["no move it answers", note("d1.title", "Forged")],
    ["a move that sets nothing", note("d1.title", "Forged", extend)],
    ["another thing's move", note("d1.title", "Forged", make2)],
    ["born", note("d1.born", 0, make1)],
    ["a field that is not text", note("d1.switch", "logo_v3", make1)],
    ["an inherited name", note("d1.__proto__", { polluted: true }, make1)],
    ["a field the thing has not", note("d1.colour", "red", make1)],
  ] as [string, WayEvent][]) {
    const p = fields([n]);
    assert.deepEqual(p.things.d1.fields, want, what);
    assert.equal(p.skipped.at(-1)?.why, "bad_note", what);
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  // one note a field a move: a second note for the make's title does not overwrite it
  const again = fields([note("d1.title", "Logo two", make1)]);
  assert.equal(again.things.d1.fields.title, "Logo"); assert.equal(again.skipped.at(-1)?.why, "bad_note");
  // erased: a note this fold never took (another way's, a stranger's) takes nothing back, even naming the field
  const gone = (nid: string, item = "d1.title"): WayEvent => ({ kind: "way.note", item, at: day(3, 9), id: nid, by: MARCO, erased: true });
  assert.deepEqual(fields([gone("someone-else")]).things.d1.fields, want);
  assert.deepEqual(fields([gone(id("about=d1.title"))]).things.d1.fields, { switch: "logo_v2", extended: true });
  // a way whose extend sets the title again: the later note is the title; erasing the older leaves it, the later takes it
  const wn = raw(); wn.life.draft.moves[2].set = ["title"];
  const ln = load(wn), wsn = waysOf(ln);
  assert.deepEqual(ln.problems, []);
  const bn = book([applied(ln.ver)]);
  make(bn, ln, "d1", day(0, 9), MARCO, { title: "Logo", switch: "s" });
  bn.write(decide(ln, fold(WAY, bn.events, wsn), { asker: MARCO, thing: "d1", move: "extend", set: { title: "Logo two" } }, day(1, 9)).drafts, MARCO);
  const titles = bn.events.filter((e) => e.kind === "way.note" && e.value?.about === "d1.title").map((e) => e.id!);
  assert.equal(titles.length, 2);
  const title = (extra: WayEvent[]) => fold(WAY, [...bn.events, ...extra], wsn).things.d1.fields.title;
  assert.equal(title([]), "Logo two");
  assert.equal(title([gone(titles[0])]), "Logo two");
  assert.equal(title([gone(titles[1])]), undefined);
});

test("signed: a note is its move's signer's own, an act answers what ran it and is done by the presser or the runner, a check comes from someone of the way", () => {
  const { ways, events, id } = base();
  const signed = events.map((e) => (e.kind === "way.applied" || e.kind === "way.agreed" ? e : { ...e, by: MARCO }));
  const f = (extra: WayEvent[], from = signed) => fold(WAY, [...from, ...extra], ways);
  assert.deepEqual(f([]).skipped, []);
  assert.deepEqual(f([]).things.d1.fields, { title: "Logo", switch: "logo_v2", extended: true });
  // a note on Marco's make, by anyone but Marco
  const make1 = id("way.move thing=d1 move=make"), without = signed.filter((e) => e.id !== id("about=d1.title"));
  const nt = (by?: string): WayEvent => ({ kind: "way.note", item: "d1.title", at: day(0, 9), id: `nt-${by}`, value: { way: WAY, about: "d1.title", words: "Forged", because: make1 }, ...(by ? { by } : {}) });
  for (const by of [FRANK, "agent:marco", "machine:nucbox@marco"]) {
    const p = f([nt(by)], without);
    assert.equal(p.things.d1.fields.title, undefined, String(by)); assert.equal(p.skipped.at(-1)?.why, "bad_note", String(by));
  }
  assert.equal(f([nt()], without).skipped.at(-1)?.why, "unsigned");
  assert.equal(f([nt(MARCO)], without).things.d1.fields.title, "Forged");
  // Marco drops d1 himself: the switch-off answers his move, done on his Sol, or on the runner's (a redo)
  const drop = mv("d1", "drop", "on_switch", "to_remove", "explorer", MARCO);
  const act = (because: string | undefined, by: string): WayEvent => ({ kind: "way.acted", item: "d1", at: day(2, 10), id: `a-${because}-${by}`, by, value: { way: WAY, ver: VER, thing: "d1", seam: "switch.off", pv: 1, pkg: "sha256:tbd", ok: false, ...(because ? { because } : {}) } });
  const h = (a: WayEvent) => { const p = f([drop, a]); return { why: p.skipped.at(-1)?.why, red: p.things.d1.red }; };
  assert.deepEqual(h(act(drop.id, MARCO)), { why: undefined, red: ["switch.off"] });
  assert.deepEqual(h(act(drop.id, RUNNER)), { why: undefined, red: ["switch.off"] }, "a redo on the runner's Sol");
  // 4a.1: that Sol only. Frank's own key and his laptop redo nobody's act
  assert.deepEqual(h(act(drop.id, FRANK)), { why: "not_allowed", red: [] });
  assert.deepEqual(h(act(drop.id, LAPTOP)), { why: "not_allowed", red: [] });
  assert.deepEqual(h(act(drop.id, "person:isaacliu")), { why: "not_allowed", red: [] });
  assert.deepEqual(h(act(drop.id, "agent:marco")), { why: "not_allowed", red: [] });
  assert.deepEqual(h(act(undefined, MARCO)), { why: "not_caused", red: [] });
  assert.deepEqual(h(act(make1, MARCO)), { why: "not_caused", red: [] }, "the make entered a state with no act");
  assert.deepEqual(h(act(id("move=extend"), MARCO)), { why: "not_caused", red: [] });
  // a trigger's own act: only the runner's Sol does it
  const wa = raw(); wa.triggers.sweep = { on: "daily 10:00", do: { act: "switch.off" } };
  const la = load(wa), wsa = waysOf(la);
  assert.deepEqual(la.problems, []);
  const ba = book([applied(la.ver)]);
  make(ba, la, "d1", day(0, 9), MARCO, { title: "x", switch: "s" });
  const sweep = due(la, fold(WAY, ba.events, wsa), day(1, 10), ME);
  assert.deepEqual(sweep.drafts.map(short), ["way.fired thing=d1 trigger=sweep"]);
  assert.deepEqual(sweep.acts.map((x) => [x.seam, x.after, x.fields.switch]), [["switch.off", 0, "s"]]);
  const fired: WayEvent = { kind: "way.fired", item: "d1", at: day(1, 10), id: "fs", by: RUNNER, value: sweep.drafts[0].value };
  const sa = (by: string) => { const v = acted(la.way!, la.ver, "d1", "switch.off", false, day(1, 10)).value; const p = fold(WAY, [...ba.events, fired, { kind: "way.acted", item: "d1", at: day(1, 10), id: "sa", by, value: { ...v, because: "fs" } }], wsa); return [p.skipped.at(-1)?.why, p.things.d1.red]; };
  assert.deepEqual(sa(MARCO), ["not_runner", []]);
  assert.deepEqual(sa(FRANK), ["not_runner", []], "the runner's person is not the runner");
  assert.deepEqual(sa(LAPTOP), ["not_runner", []], "nor is another Sol of his");
  assert.deepEqual(sa(RUNNER), [undefined, ["switch.off"]]);
  // a check: the runner's or a role holder's, never a stranger's
  const chk = (by: string): WayEvent => ({ kind: "way.checked", item: "d1", at: day(2, 10), id: `c-${by}`, by, value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam: "gate.green", pv: 1, pkg: "sha256:tbd", pass: true, at: day(2, 10) } });
  assert.equal(f([chk("person:isaacliu")]).skipped.at(-1)?.why, "not_allowed");
  assert.equal(f([chk("agent:frank")]).skipped.at(-1)?.why, "not_allowed");
  assert.deepEqual(f([chk(FRANK)]).skipped, [], "Frank holds a role (keeper): that, not the runner's login, lets him sign a check");
  assert.deepEqual(f([chk(RUNNER)]).skipped, []);
  assert.equal(f([chk(LAPTOP)]).skipped.at(-1)?.why, "not_allowed", "another Sol of the runner's login is not the runner and holds no role");
  // 4a.1: a runner whose person holds no role. Its Sol signs a check; the person's own key, as nobody of the way, does not
  const wi = raw(); wi.runner = "nucbox@isaacliu";
  const li = load(wi), wsi = waysOf(li);
  assert.deepEqual(li.problems, []);
  const bi = book([applied(li.ver)]);
  make(bi, li, "d1", day(0, 9), MARCO, { title: "x", switch: "s" });
  const ci = (by: string) => fold(WAY, [...bi.events, { ...chk(by), value: { ...chk(by).value, ver: li.ver } }], wsi).skipped.at(-1)?.why;
  assert.deepEqual([ci("machine:nucbox@isaacliu"), ci("person:isaacliu"), ci("machine:macbook@isaacliu"), ci("agent:isaacliu")], [undefined, "not_allowed", "not_allowed", "not_allowed"]);
});

test("no name every object has is an id: a way with one does not load, a press with one is refused, an event with one is passed over", () => {
  for (const name of ["__proto__", "constructor", "prototype"]) {
    const text = PINNED.replace('"draft": {\n      "name": "草稿"', `${JSON.stringify(name)}: {\n      "name": "草稿"`);
    assert.notEqual(text, PINNED);
    assert.ok(load(text).problems.some((x) => x.at === `things.${name}` && x.why === "bad_id"), name);
    const f = raw(); f.things.draft.fields = JSON.parse(`{${JSON.stringify(name)}:"text","title":"text","switch":"name","born":"time","extended":"boolean?"}`);
    assert.ok(load(f).problems.some((x) => x.at === `things.draft.fields.${name}` && x.why === "bad_id"), name);
    const t = raw(); t.triggers = JSON.parse(`{${JSON.stringify(name)}:${JSON.stringify(t.triggers.remind)},"expire":${JSON.stringify(t.triggers.expire)}}`);
    assert.ok(load(t).problems.some((x) => x.at === `triggers.${name}` && x.why === "bad_id"), name);
    const { ways, events } = base();
    assert.equal(decide(L, fold(WAY, events, ways), { asker: MARCO, thing: name, kind: "draft", move: "make", set: { title: "x", switch: "s" } }, day(3, 9)).why, "bad_thing", name);
    const p = fold(WAY, [...events,
      { kind: "way.made", item: name, at: day(3, 9), id: `pm-${name}`, by: MARCO, value: { way: WAY, ver: VER, thing: name, kind: "draft", by: "explorer" } },
      { kind: "way.fired", item: "d1", at: TICK(4), id: `pf-${name}`, by: RUNNER, value: { way: WAY, ver: VER, trigger: name, thing: "d1", tick: TICK(4) } }], ways);
    assert.equal(Object.getPrototypeOf(p.things), Object.prototype, name);
    assert.deepEqual(Object.keys(p.things).sort(), ["d1", "d2"], name);
    assert.equal(Object.hasOwn(p.things.d1.fired, name), false, name);
    assert.deepEqual(p.skipped.map((x) => x.why), ["unknown_thing", "unknown_trigger"], name);
  }
});

test("rules that name each other twice over are judged once each, a judging has a budget, and load refuses a rule too big written out", () => {
  // r0 names r1 twice, r1 names r2 twice, ... r24 names r25: 2^25 forms written out
  const w = raw();
  for (let i = 0; i < 25; i++) w.rules[`r${i}`] = { all: [{ rule: `r${i + 1}` }, { rule: `r${i + 1}` }] };
  w.rules.r25 = { in: "on_switch" };
  const l = load(w);
  assert.ok(l.problems.some((x) => x.at === "rules.r0" && x.why === "rule_too_big"), JSON.stringify(l.problems.slice(0, 3)));
  assert.equal(l.runs, false);
  const thing = { state: "on_switch", fields: {}, born: 0, fired: {} };
  const t0 = performance.now();
  const j = evaluateRule(l.way!, "r0", thing, 1);
  assert.equal(j.pass, true, j.why);
  assert.ok(performance.now() - t0 < 500, "judged once a rule");
  // an inline rule of more forms than the budget: unknown, and too big to load
  const big = { all: Array.from({ length: 12_000 }, () => ({ in: "on_switch" })) };
  const k = evaluate(L.way!, big, "x", thing, 1);
  assert.equal(k.pass, false); assert.equal(k.verdict, "unknown"); assert.equal(k.why, "rule_too_big");
  const w2 = raw(); w2.triggers.remind.if = big;
  assert.ok(load(w2).problems.some((x) => x.at === "triggers.remind.if" && x.why === "rule_too_big"));
  assert.deepEqual(L.problems, []);
});

// ---------- the second review (step3-refute-2.md) ----------

test("N3: nobody is put into a role without pressing, per person: each person a version adds agrees, an agent or a machine never agrees for itself", () => {
  const ag = (to: string, role: string, by: string, at = day(-1, 0)): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `n3-${to.slice(0, 4)}-${role}-${by}-${at}`, by, value: { way: WAY, to, role } });
  const ap = (to: string, from = "", by = FRANK, at = day(-1, 1)): WayEvent => ({ ...applied(to, at, from, by), id: `n3ap-${to.slice(0, 4)}-${from.slice(0, 4)}-${at}` });
  const verOf = (evs: WayEvent[], ways: Map<string, Way>) => { const q = fold(WAY, evs, ways); return [q.ver, q.skipped.at(-1)?.why]; };
  // a first version naming Marco and Isaac as explorers: each presses
  const w = raw(); w.roles.explorer.who = [MARCO, "person:isaac"];
  const F = load(w), wf = waysOf(F);
  assert.deepEqual(verOf([ag(F.ver, "explorer", MARCO), ag(F.ver, "keeper", FRANK), ap(F.ver)], wf), ["", "not_agreed"], "Isaac never pressed");
  assert.deepEqual(verOf([ag(F.ver, "explorer", MARCO), ag(F.ver, "explorer", "person:isaac"), ag(F.ver, "keeper", FRANK), ap(F.ver)], wf), [F.ver, undefined]);
  // a later version adds Isaac to explorer: Marco's agreement does not cover Isaac, nor Isaac's Marco's
  const w2 = raw(); w2.prev = VER; w2.roles.explorer.who = [MARCO, "person:isaac"];
  const B = load(w2), wb = waysOf(L, B);
  const start = [...firstAgreed(VER, day(-3, 0)), applied(VER, day(-3, 1))];
  assert.deepEqual(verOf([...start, ag(B.ver, "explorer", MARCO), ap(B.ver, VER, MARCO)], wb), [VER, "not_agreed"], "Isaac is added without pressing");
  assert.deepEqual(verOf([...start, ag(B.ver, "explorer", "person:isaac"), ap(B.ver, VER, MARCO)], wb), [VER, "not_agreed"], "the role's holder did not agree");
  assert.deepEqual(verOf([...start, ag(B.ver, "explorer", MARCO), ag(B.ver, "explorer", "person:isaac"), ap(B.ver, VER, MARCO)], wb), [B.ver, undefined]);
  // an agent or a machine never agrees: its person does
  const w3 = raw(); w3.roles.explorer.who = ["agent:marco"];
  const A = load(w3), wa = waysOf(A);
  assert.deepEqual(fold(WAY, [ag(A.ver, "explorer", "agent:marco")], wa).skipped.at(-1)?.why, "not_allowed");
  assert.deepEqual(verOf([ag(A.ver, "explorer", "agent:marco"), ag(A.ver, "keeper", FRANK), ap(A.ver)], wa), ["", "not_agreed"]);
  assert.deepEqual(verOf([ag(A.ver, "explorer", MARCO), ag(A.ver, "keeper", FRANK), ap(A.ver)], wa), [A.ver, undefined], "Marco agrees for his agent");
  const w4 = raw(); w4.prev = VER; w4.roles.keeper.who = [FRANK, RUNNER];
  const K = load(w4), wk = waysOf(L, K);
  assert.deepEqual(verOf([...start, ag(K.ver, "keeper", RUNNER), ap(K.ver, VER)], wk), [VER, "not_agreed"], "a machine does not agree for itself");
  assert.deepEqual(verOf([...start, ag(K.ver, "keeper", FRANK), ap(K.ver, VER)], wk), [K.ver, undefined], "Frank, its person, does (and holds the role)");
  // a change that adds nobody: one holder's agreement is enough (and still needed)
  const w5 = raw(); w5.prev = VER; w5.life.draft.moves.find((m: any) => m.id === "want").by = ["explorer", "keeper"];
  const C = load(w5), wc = waysOf(L, C);
  assert.deepEqual(verOf([...start, ag(C.ver, "explorer", MARCO), ap(C.ver, VER, MARCO)], wc), [VER, "not_agreed"]);
  assert.deepEqual(verOf([...start, ag(C.ver, "explorer", MARCO), ag(C.ver, "keeper", FRANK), ap(C.ver, VER, MARCO)], wc), [C.ver, undefined]);
  // N26: the applier of a first version holds a role in it, every agreement given or not
  assert.deepEqual(verOf([...firstAgreed(VER, day(-3, 0)), applied(VER, day(-3, 1), "", "person:mallory")], waysOf(L)), ["", "not_allowed"]);
});

test("a press that changes who may do what is a person's own: an agent or a machine that holds a role never stands in for its person", () => {
  // explorer is held by Marco and by his agent; keeper by Frank and his machine
  const w0 = raw(); w0.roles.explorer.who = [MARCO, "agent:marco"]; w0.roles.keeper.who = [FRANK, RUNNER];
  const A = load(w0);
  // B: explorer may promote too (touches explorer and keeper); R: a rule's change (touches no role)
  const w1 = JSON.parse(JSON.stringify(w0)); w1.prev = A.ver; w1.life.draft.moves.find((m: any) => m.id === "promote").by = ["keeper", "explorer"];
  const w2 = JSON.parse(JSON.stringify(w0)); w2.prev = A.ver; w2.rules.expired.any[0].all[0].older = "30d";
  const B = load(w1), Rl = load(w2), ways = waysOf(A, B, Rl);
  const ag = (to: string, role: string, by: string, at: number): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `pp-${to.slice(0, 4)}-${role}-${by}-${at}`, by, value: { way: WAY, to, role } });
  const ap = (to: string, from: string, by: string, at: number): WayEvent => ({ ...applied(to, at, from, by), id: `pp-ap-${to.slice(0, 4)}-${by}-${at}` });
  const rv = (to: string, from: string, by: string, at: number): WayEvent => ({ kind: "way.reverted", item: WAY, at, id: `pp-rv-${to.slice(0, 4)}-${by}-${at}`, by, value: { way: WAY, from, to } });
  const name = (v: string) => (v === A.ver ? "A" : v === B.ver ? "B" : v === Rl.ver ? "R" : v);
  const run = (...e: WayEvent[]) => { const q = fold(WAY, [...firstAgreed(A.ver, 0), ap(A.ver, "", FRANK, 1), ...e], ways); return [name(q.ver), q.skipped.at(-1)?.why]; };
  assert.deepEqual(run(), ["A", undefined]);
  assert.deepEqual(fold(WAY, [...firstAgreed(A.ver, 0), ap(A.ver, "", RUNNER, 1)], ways).skipped.at(-1)?.why, "not_allowed", "a first apply by a machine");
  // apply of a change that touches roles: a person's own signature
  const toB = [ag(B.ver, "keeper", FRANK, 2), ag(B.ver, "explorer", MARCO, 2)];
  assert.deepEqual(run(...toB, ap(B.ver, A.ver, "agent:marco", 3)), ["A", "not_allowed"]);
  assert.deepEqual(run(...toB, ap(B.ver, A.ver, MARCO, 3)), ["B", undefined]);
  // revert of that change: Marco's agent holds explorer but does not stand in for Marco; Marco himself does
  const onB = [...toB, ap(B.ver, A.ver, MARCO, 3), ag(A.ver, "keeper", FRANK, 4)];
  assert.deepEqual(run(...onB, rv(A.ver, B.ver, "agent:marco", 5)), ["B", "not_allowed"]);
  assert.deepEqual(run(...onB, rv(A.ver, B.ver, RUNNER, 5)), ["B", "not_allowed"], "nor Frank's machine for Frank");
  assert.deepEqual(run(...onB, rv(A.ver, B.ver, MARCO, 5)), ["A", undefined], "Marco holds explorer, Frank agreed for keeper");
  assert.deepEqual(run(...toB, ap(B.ver, A.ver, MARCO, 3), rv(A.ver, B.ver, MARCO, 5)), ["B", "not_agreed"], "without Frank's agreement");
  // a change that touches no role: any signer with a role, agents included, applies it and takes it back
  assert.deepEqual(run(ap(Rl.ver, A.ver, "agent:marco", 3)), ["R", undefined]);
  assert.deepEqual(run(ap(Rl.ver, A.ver, "agent:marco", 3), rv(A.ver, Rl.ver, RUNNER, 4)), ["A", undefined]);
  // an agreement is a person's: an agent's or a machine's is refused
  assert.equal(fold(WAY, [...firstAgreed(A.ver, 0), ap(A.ver, "", FRANK, 1), ag(B.ver, "explorer", "agent:marco", 2)], ways).skipped.at(-1)?.why, "not_allowed");
  assert.equal(fold(WAY, [...firstAgreed(A.ver, 0), ap(A.ver, "", FRANK, 1), ag(B.ver, "keeper", RUNNER, 2)], ways).skipped.at(-1)?.why, "not_allowed");
});

test("decided cost (N1, the owner's decision): a change to a move's target, or a move only a trigger presses, touches no role; a revert takes the version back, never the thing", () => {
  const start = () => { const b = book([applied(VER)]); make(b, L, "d1", day(0, 9)); b.write(decide(L, fold(WAY, b.events, waysOf(L)), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO); return b; };
  // want now goes straight to official: no role touched, so Marco applies it alone, with no one's agreement
  const w1 = raw(); w1.prev = VER; w1.life.draft.moves.find((m: any) => m.id === "want").to = "official";
  const T1 = load(w1), ways1 = waysOf(L, T1);
  assert.deepEqual(touched(L.way!, T1.way!), []);
  const b1 = book([applied(VER)]);
  make(b1, L, "d1", day(0, 9));
  b1.events.push(applied(T1.ver, day(1, 0), VER, MARCO));
  b1.write(decide(T1, fold(WAY, b1.events, ways1), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  assert.equal(fold(WAY, b1.events, ways1).things.d1.state, "official", "no keeper press, no `solid`");
  b1.events.push({ kind: "way.reverted", item: WAY, at: day(1, 10), id: "rv1", by: FRANK, value: { way: WAY, from: T1.ver, to: VER } });
  const p1 = fold(WAY, b1.events, ways1);
  assert.deepEqual([p1.ver, p1.things.d1.state], [VER, "official"], "the version is back, the draft is not");
  // a new move only a trigger presses (wanted -> official, by trigger:fast): no role touched; the runner's Sol moves it
  const w2 = raw(); w2.prev = VER; w2.life.draft.moves.push({ id: "fast", from: "wanted", to: "official", by: ["trigger:fast"] }); w2.triggers.fast = { on: "daily 09:30", do: { move: "fast" } };
  const T2 = load(w2), ways2 = waysOf(L, T2);
  assert.deepEqual(touched(L.way!, T2.way!), []);
  const b2 = start();
  b2.events.push(applied(T2.ver, day(1, 10), VER, MARCO));
  b2.write(due(T2, fold(WAY, b2.events, ways2), TICK(2), ME).drafts, RUNNER);
  assert.equal(fold(WAY, b2.events, ways2).things.d1.state, "official");
  b2.events.push({ kind: "way.reverted", item: WAY, at: day(2, 10), id: "rv2", by: FRANK, value: { way: WAY, from: T2.ver, to: VER } });
  const p2 = fold(WAY, b2.events, ways2);
  assert.deepEqual([p2.ver, p2.things.d1.state], [VER, "official"]);
});

test("decided cost (N2, the owner's decision): a new move naming only the proposer's own role needs only his agreement, and the other side cannot revert it alone", () => {
  const w = raw(); w.prev = VER; w.life.draft.moves.push({ id: "fast", from: "wanted", to: "official", by: ["explorer"] });
  const T = load(w), ways = waysOf(L, T);
  assert.deepEqual(touched(L.way!, T.way!), ["explorer"]);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  b.events.push({ kind: "way.agreed", item: WAY, at: day(1, 10), id: "n2ag", by: MARCO, value: { way: WAY, to: T.ver, role: "explorer" } }, applied(T.ver, day(1, 11), VER, MARCO));
  b.write(decide(T, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "fast" }, day(1, 12)).drafts, MARCO);
  assert.equal(fold(WAY, b.events, ways).things.d1.state, "official", "Marco's own draft, official by his own new move");
  b.events.push({ kind: "way.reverted", item: WAY, at: day(1, 13), id: "n2rv", by: FRANK, value: { way: WAY, from: T.ver, to: VER } });
  const p = fold(WAY, b.events, ways);
  assert.deepEqual([p.ver, p.skipped.at(-1)?.why], [T.ver, "not_agreed"], "the change back touches explorer, which Frank does not hold");
});

test("N5: an event the book does not say who signed is passed over (`unsigned`) for every kind whose writer is checked, unless the caller says to trust it", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  const d = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(1, 10));
  const strip = ({ by, ...e }: WayEvent): WayEvent => e;
  const base = b.events;
  const cases: [string, WayEvent][] = [
    ["way.agreed", { kind: "way.agreed", item: WAY, at: day(1, 0), id: "u-ag", value: { way: WAY, to: VER, role: "keeper" } }],
    ["way.applied", { kind: "way.applied", item: WAY, at: day(1, 0), id: "u-ap", value: { way: WAY, from: VER, to: VER, reader: 1 } }],
    ["way.reverted", { kind: "way.reverted", item: WAY, at: day(1, 0), id: "u-rv", value: { way: WAY, from: VER, to: VER } }],
    ["way.made", { kind: "way.made", item: "d9", at: day(1, 0), id: "u-md", value: { way: WAY, ver: VER, thing: "d9", kind: "draft", by: "explorer" } }],
    ["way.move", strip(mv("d1", "want", "on_switch", "wanted", "explorer"))],
    ["way.checked", { kind: "way.checked", item: "d1", at: day(1, 0), id: "u-ck", value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam: "gate.green", pv: 1, pkg: `sha256:${PRINT}`, pass: true, at: day(1, 0) } }],
    ["way.fired", { kind: "way.fired", item: "d1", at: TICK(14), id: "u-fr", value: { way: WAY, ver: VER, trigger: "remind", thing: "d1", tick: TICK(14) } }],
    ["way.acted", { kind: "way.acted", item: "d1", at: day(1, 0), id: "u-ac", value: { way: WAY, ver: VER, thing: "d1", seam: "switch.off", pv: 1, pkg: `sha256:${PRINT}`, ok: false, because: "x" } }],
    ["way.set", { kind: "way.set", item: "d1.switch", at: day(1, 0), id: "u-st", value: { way: WAY, about: "d1.switch", because: "x", name: "s" } }],
    ["way.note", { kind: "way.note", item: "d1.title", at: day(1, 0), id: "u-nt", value: { way: WAY, about: "d1.title", because: "x", words: "w" } }],
    ["an erased way.note", { kind: "way.note", item: "d1.title", at: day(1, 0), id: "u-er", erased: true }],
  ];
  for (const [what, e] of cases) assert.equal(fold(WAY, [...base, e], ways).skipped.at(-1)?.why, "unsigned", what);
  // the whole book unsigned: nothing is taken; the same trusted (a caller that says so): as signed
  const bare_ = base.map(strip);
  assert.equal(fold(WAY, bare_, ways).ver, "");
  assert.deepEqual(fold(WAY, bare_, ways, { unsigned: "trust" }).things.d1, fold(WAY, base, ways).things.d1);
  // a way.refused (it changes nothing) and another way's event are not this gate's
  const refusedU: WayEvent = { kind: "way.refused", item: "d1", at: day(1, 0), id: "u-rf", value: { way: WAY, ver: VER, thing: "d1", move: "want", why: "not_allowed" } };
  const otherU: WayEvent = { ...strip(mv("d1", "want", "on_switch", "wanted", "explorer")), id: "u-ow", value: { ...mv("d1", "want", "on_switch", "wanted", "explorer").value, way: "sol.other" } };
  assert.deepEqual(fold(WAY, [...base, refusedU, otherU], ways).skipped, []);
  void d;
});

test("N4: replay tries a refused press again as the roles its signer holds in the NEW version", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  b.write(decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(1, 10)).drafts, MARCO);
  b.write(decide(L, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote" }, day(2, 10), OK5).drafts, FRANK);
  const w2 = raw(); w2.prev = VER; w2.roles.keeper.who = ["person:isaac"]; w2.rules.solid.all = w2.rules.solid.all.filter((c: any) => c.check !== "gate.green");
  const r = replay(b.events, ways, L, load(w2), { until: day(3, 0) });
  assert.equal(r.things[0].now.some((x) => x.move === "promote" && x.to === "official"), false, "Frank is no keeper there");
  // Frank still keeper, the gate gone: his promote goes through
  const w3 = raw(); w3.prev = VER; w3.rules.solid.all = w3.rules.solid.all.filter((c: any) => c.check !== "gate.green");
  assert.equal(replay(b.events, ways, L, load(w3), { until: day(3, 0) }).things[0].now.some((x) => x.move === "promote" && x.to === "official"), true);
});

test("N6, N21: an act done again after an apply counts under the current version too; under any other it is old_version", () => {
  const X = load({ ...raw(), prev: VER, name: "x" });
  const ways = waysOf(L, X);
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  const d = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "drop" }, day(1, 10));
  const ids = b.write(d.drafts, MARCO);
  const cause = ids[d.acts[0].after];
  const act = (way: Loaded, ok: boolean, at: number, ver = way.ver): WayEvent => ({ kind: "way.acted", item: "d1", at, id: `a-${ver.slice(0, 4)}-${ok}-${at}`, by: MARCO, value: { ...acted(way.way!, ver, "d1", "switch.off", ok, at).value, because: cause } });
  const red = (...e: WayEvent[]) => { const p = fold(WAY, [...b.events, act(L, false, day(1, 10)), applied(X.ver, day(2, 8), VER, FRANK), ...e], ways); return [p.things.d1.red, p.skipped.at(-1)?.why]; };
  assert.deepEqual(red(), [["switch.off"], undefined]);
  assert.deepEqual(red(act(X, true, day(2, 9))), [[], undefined], "the redo, written under the current version");
  assert.deepEqual(red(act(L, true, day(2, 9))), [[], undefined], "the redo, written under the cause's version");
  assert.deepEqual(red(act(X, true, day(2, 9), "f".repeat(64))), [["switch.off"], "old_version"], "any other version");
});

test("N8: one way.checked a seam, at most 64 seams that check, state ids of 59 at most, and every value one press writes fits the trail's 64 KB", () => {
  assert.ok(pressBytes(64) <= VALUE_MAX);
  // solid with 1,200 checks of one seam: one way.checked, and the move names one
  const w = raw(); w.rules.solid = { all: Array.from({ length: 1200 }, () => ({ check: "gate.green" })) };
  const l = load(w), ways = waysOf(l);
  assert.equal(l.runs, true);
  const b = book([applied(l.ver)]);
  make(b, l, "d1", day(0, 9));
  b.write(decide(l, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  const d = decide(l, fold(WAY, b.events, ways), { asker: FRANK, thing: "d1", move: "promote" }, day(2, 9), { "gate.green": { pass: true } });
  assert.equal(d.ok, true);
  assert.equal(d.drafts.filter((x) => x.kind === "way.checked").length, 1);
  const ids = b.write(d.drafts, FRANK);
  for (const e of b.events.slice(-ids.length)) assert.ok(Buffer.byteLength(canonical(e.value)) <= VALUE_MAX);
  assert.equal(fold(WAY, b.events, ways).things.d1.state, "official");
  // 65 seams that check: refused; a state of 60: refused
  const s = raw();
  for (let i = 0; i < 61; i++) s.seams[`c${i}`] = { plugin: "p", pv: 1, pkg: `sha256:${PRINT}`, gives: "check" };
  assert.ok(load(s).problems.some((x) => x.at === "seams" && x.why === "too_many_checks"));
  const t = JSON.parse(PINNED.replaceAll('"removed"', `"${"r".repeat(60)}"`));
  assert.ok(load(t).problems.some((x) => x.why === "id_too_long"));
  assert.deepEqual(load(PINNED.replaceAll('"removed"', `"${"r".repeat(59)}"`)).problems, []);
  // a press's values: words past TEXT_MAX, a list past LIST_MAX: refused as bad_set
  const p0 = fold(WAY, book([applied(VER)]).events, waysOf(L));
  assert.equal(decide(L, p0, { asker: MARCO, thing: "d2", kind: "draft", move: "make", set: { title: "x".repeat(40_000), switch: "s" } }, day(0, 9)).why, "bad_set");
  const n = raw(); n.things.draft.fields.tags = "names?"; n.life.draft.moves[0].set.push("tags");
  const ln = load(n);
  const pn = fold(WAY, book([applied(ln.ver)]).events, waysOf(ln));
  assert.equal(decide(ln, pn, { asker: MARCO, thing: "d2", kind: "draft", move: "make", set: { title: "x", switch: "s", tags: Array.from({ length: 65 }, (_, i) => `t${i}`) } }, day(0, 9)).why, "bad_set");
  assert.equal(decide(ln, pn, { asker: MARCO, thing: "d2", kind: "draft", move: "make", set: { title: "x", switch: "s", tags: Array.from({ length: 64 }, (_, i) => `t${i}`) } }, day(0, 9)).ok, true);
});

test("N9: the same fold over the same events gives the same answer whatever was folded before (no cache outlives a call)", () => {
  const l = load(raw());
  const evs = [...firstAgreed(l.ver, day(-2, 0)), applied(l.ver, day(-1, 0))];
  const w = l.way as Way;
  assert.equal(fold(WAY, evs, new Map([[l.ver, w]])).ver, l.ver);
  w.rules.solid = { all: [{ check: "data.ok" }] };   // the caller changes the object in place: no longer that ver
  const again = fold(WAY, evs, new Map([[l.ver, w]]));
  const fresh = fold(WAY, evs, new Map([[l.ver, JSON.parse(JSON.stringify(w)) as Way]]));
  assert.deepEqual([again.ver, again.skipped.at(-1)?.why], ["", "way_unread"]);
  assert.deepEqual([fresh.ver, fresh.skipped.at(-1)?.why], ["", "way_unread"]);
});

test("N10: a press whose required value never came leaves the thing marked `missing`, and its enter act fails closed (red, never handed out)", () => {
  const ways = waysOf(L);
  const b = book([applied(VER)]);
  const d = decide(L, fold(WAY, b.events, ways), { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "t", switch: "s" } }, day(0, 9));
  b.write(d.drafts.filter((x) => x.kind !== "way.set"), MARCO);
  const p = fold(WAY, b.events, ways);
  assert.deepEqual(p.things.d1.missing, ["switch"]);
  const drop = decide(L, p, { asker: MARCO, thing: "d1", move: "drop" }, day(1, 10));
  assert.deepEqual(drop.acts, [], "switch.off is not handed out");
  assert.deepEqual(drop.drafts.map(short).at(-1), "way.acted thing=d1 seam=switch.off ok=false");
  b.write(drop.drafts, MARCO);
  assert.deepEqual(fold(WAY, b.events, ways).things.d1.red, ["switch.off"]);
  // the value arriving clears the mark
  const c = book([applied(VER)]);
  make(c, L, "d1", day(0, 9));
  assert.deepEqual(fold(WAY, c.events, ways).things.d1.missing, []);
  // a trigger's own act on such a thing fails closed too
  const wa = raw(); wa.triggers.sweep = { on: "daily 10:00", do: { act: "switch.off" } };
  const la = load(wa), wsa = waysOf(la);
  const e = book([applied(la.ver)]);
  const dd = decide(la, fold(WAY, e.events, wsa), { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "t", switch: "s" } }, day(0, 9));
  e.write(dd.drafts.filter((x) => x.kind !== "way.set"), MARCO);
  const sweep = due(la, fold(WAY, e.events, wsa), day(1, 10), ME);
  assert.deepEqual(sweep.acts, []);
  assert.deepEqual(sweep.drafts.map(short), ["way.fired thing=d1 trigger=sweep", "way.acted thing=d1 seam=switch.off ok=false"]);
});

test("nit r31: a number that is not a safe integer, or not written as canonical JSON writes it, does not load", () => {
  const base = raw(); base.things.draft.fields.n = "number?"; base.life.draft.moves.find((m: any) => m.id === "extend").fix.n = 1;
  const text = JSON.stringify(base, null, 2);
  assert.deepEqual(load(text).problems, []);
  for (const bad of ["9007199254740993", "9007199254740992", "1.0", "1e3", "0.5", "-0"]) {
    assert.deepEqual(load(text.replace(`"n": 1`, `"n": ${bad}`)).problems, [{ at: bad, why: "bad_number" }], bad);
  }
  const o = raw(); o.things.draft.fields.n = "number?"; o.life.draft.moves.find((m: any) => m.id === "extend").fix.n = 0.5;
  assert.deepEqual(load(o).problems, [{ at: "", why: "bad_number" }]);
  assert.deepEqual(load(text.replace(`"n": 1`, `"n": -12`)).problems, []);
});

test("the gaps the second review found (M6, M11, N15): a tick before birth, a named check of another thing or signer, one firing per move", () => {
  // M6: a thing made at 10:00 is not due for that morning's 09:30 tick, even by a trigger with no rule of age
  const w = raw(); w.triggers.remind.if = { in: ["on_switch", "wanted"] };
  const l = load(w), ways = waysOf(l);
  const b = book([applied(l.ver)]);
  make(b, l, "d1", day(0, 10));
  assert.deepEqual(due(l, fold(WAY, b.events, ways), day(0, 11), ME).drafts, []);
  assert.deepEqual(due(l, fold(WAY, b.events, ways), TICK(1), ME).drafts.map((x) => x.value.tick), [TICK(1)]);
  // M11: a refused promote naming checks of another signer, or of another thing, is read without their answers: the
  // press gets rule_unread there, not the rule_failed written, so the refusal is passed over (round 9) and not replayed
  const c = book([applied(VER)]);
  make(c, L, "d1", day(0, 9)); make(c, L, "d2", day(0, 9, 5));
  c.write(decide(L, fold(WAY, c.events, waysOf(L)), { asker: MARCO, thing: "d1", move: "want" }, day(1, 9)).drafts, MARCO);
  const seams = ["contract.written", "undo.works", "data.ok", "gate.green", "used.enough"];
  const ck = (by: string, thing: string, i: number): WayEvent => ({ kind: "way.checked", item: thing, at: day(2, 9), id: `m11-${by}-${thing}-${i}`, by, value: { way: WAY, ver: VER, thing, rule: "solid", seam: seams[i], pv: 1, pkg: `sha256:${PRINT}`, pass: true, at: day(2, 9) } });
  const refusal = (named: WayEvent[]): WayEvent => ({ kind: "way.refused", item: "d1", at: day(2, 9), id: "m11-r", by: FRANK, value: { way: WAY, ver: VER, thing: "d1", move: "promote", why: "rule_failed", checks: named.map((x) => x.id) } });
  for (const [what, named] of [["Marco's checks", seams.map((_, i) => ck(MARCO, "d1", i))], ["d2's checks", seams.map((_, i) => ck(FRANK, "d2", i))]] as [string, WayEvent[]][]) {
    const all = [...c.events, ...named, refusal(named)];
    assert.deepEqual(fold(WAY, all, waysOf(L)).skipped.map((x) => `${x.id} ${x.why}`), ["m11-r stale_refusal"], what);
    const r = replay(all, waysOf(L), L, L, { until: day(3, 0) }).things.find((t) => t.thing === "d1")!;
    assert.deepEqual([r.same, r.now.some((x) => x.kind === "way.refused")], [true, false], what);
    // written as what the press does get, it is taken and tried again
    const unread = { ...refusal(named), value: { ...refusal(named).value, why: "rule_unread" } };
    const u = replay([...c.events, ...named, unread], waysOf(L), L, L, { until: day(3, 0) }).things.find((t) => t.thing === "d1")!;
    assert.deepEqual([u.same, u.now.at(-1)], [true, { at: day(2, 9), kind: "way.refused", move: "promote", why: "rule_unread" }], what);
  }
  // N15: one firing moves a thing once
  const n = raw(); n.life.draft.moves.push({ id: "poke", from: "on_switch", to: "same", by: ["trigger:nudge"] }); n.triggers.nudge = { on: "daily 09:30", do: { move: "poke" } };
  const ln = load(n), wn = waysOf(ln);
  assert.deepEqual(ln.problems, []);
  const e = book([applied(ln.ver)]);
  make(e, ln, "d1", day(0, 9));
  const f = due(ln, fold(WAY, e.events, wn), TICK(1), ME);
  const ids = e.write(f.drafts, RUNNER);
  const again: WayEvent = { ...e.events.at(-1)!, id: "poke-again" };
  assert.deepEqual([...e.events, again].filter((x) => x.kind === "way.move" && x.value?.move === "poke").length, 2);
  assert.equal(fold(WAY, [...e.events, again], wn).skipped.at(-1)?.why, "not_fired");
  void ids;
});

// ---------- every draft fits step two's rows ----------

// ---- step 4a.3: who may start a way in a team's book (FORMAT §3, 第四版). Frank's decision: the project's `ways.start`
// is `owner` (the default the wiring gives) or `member` (an owner or an editor; never a guest); in both, every person
// the first version names is a member who is not a guest; a person's own log is not under the rule ----
/** a team's book for a fold: its `ways.start`, and each login's role, a role or what it was at a moment (a login not
 *  listed is not in the project). `asked` keeps every question the fold put to it */
function team(start: "owner" | "member", roles: Record<string, TeamRole | ((at: number) => TeamRole | null)>) {
  const asked: [string, number][] = [];
  const b: Book = { book: "team", start, roleOf: (login, at) => { asked.push([login, at]); const r = Object.hasOwn(roles, login) ? roles[login] : null; return typeof r === "function" ? r(at) : r; } };
  return { b, asked };
}
const BOTH = ["owner", "member"] as const;
/** a team's book is never folded without a clock (4a.2 v3): this Sol's time, long after everything these tests write */
const NOW = { now: day(400, 0) };
/** events as a team's book hands them to the fold (4a.2 v3): each with its place, the writer's key (one key a signer
 *  here), where it stands along that key's chain, and the time of the one before it. The fold orders a team's book by
 *  these and nothing else; an event without them has no place */
const seat = (events: readonly WayEvent[]): WayEvent[] => {
  const heads = new Map<string, { n: number; at: number }>();
  return events.map((e) => {
    const key = `k:${e.by ?? "none"}`, h = heads.get(key);
    heads.set(key, { n: (h?.n ?? -1) + 1, at: e.at });
    return { ...e, key, n: (h?.n ?? -1) + 1, ...(h ? { after: h.at } : {}) };
  });
};
/** a way's first version agreed by everyone it names (day -1, 00:00) and applied (day -1, 01:00 unless said; `by`
 *  null: the book does not say who signed it), folded from the book `b`: the version in force and why the last event
 *  passed over was */
const started = (b: Book, by: string | null = FRANK, l: Loaded = L, at = day(-1, 1), o?: FoldOptions) => {
  const ap: WayEvent = applied(l.ver, at, "", by ?? FRANK);
  if (by === null) delete ap.by;
  const q = foldBook(WAY, seat([...firstAgreed(l.ver, day(-1, 0)), ap]), waysOf(l), b, { ...o, ...NOW });
  return [q.ver, q.skipped.at(-1)?.why];
};

test("who may start (4a.3): in a team's book a way's first apply is an owner's under `owner`, an owner's or an editor's under `member`; never a guest's, a stranger's, an agent's or a machine's", () => {
  // the drafts way names Marco (explorer) and Frank (keeper, and his NucBox runs it)
  assert.deepEqual(started(team("owner", { frank: "owner", marco: "editor" }).b), [VER, undefined], "an owner starts");
  assert.deepEqual(started(team("owner", { frank: "editor", marco: "owner" }).b), ["", "not_starter"], "an editor does not, under `owner`");
  assert.deepEqual(started(team("owner", { frank: "editor", marco: "owner" }).b, MARCO), [VER, undefined], "the owner the way names does");
  assert.deepEqual(started(team("member", { frank: "editor", marco: "owner" }).b), [VER, undefined], "an editor does, under `member`");
  assert.deepEqual(started(team("member", { frank: "editor", marco: "editor" }).b, MARCO), [VER, undefined]);
  assert.deepEqual(started(team("owner", { frank: "editor", marco: "editor" }).b), ["", "not_starter"], "a way that names no owner is not started under `owner`");
  for (const mode of BOTH) {
    assert.deepEqual(started(team(mode, { frank: "guest", marco: "owner" }).b), ["", "not_starter"], `a guest, under ${mode}`);
    assert.deepEqual(started(team(mode, { marco: "owner" }).b), ["", "not_starter"], `someone not in the project, under ${mode}`);
  }
  // r32 (a): a stranger writes a file with the way's id naming only himself, agrees to each role and applies it first.
  // In the team's book it starts nothing and the team's own first version is the one in force; on a person's own log
  // the first apply of an id is still first come (unchanged)
  const w = raw(); w.roles.explorer.who = ["person:mallory"]; w.roles.keeper.who = ["person:mallory"]; w.runner = "nucbox@mallory";
  const S = load(w), ways = waysOf(L, S);
  const squat = [...firstAgreed(S.ver, day(-3, 0)), applied(S.ver, day(-3, 1), "", "person:mallory"), ...firstAgreed(VER, day(-1, 0)), applied(VER, day(-1, 1))];
  for (const mode of BOTH) {
    const q = foldBook(WAY, seat(squat), ways, team(mode, { frank: "owner", marco: "editor" }).b, NOW);
    assert.deepEqual([q.ver, q.vers, q.skipped.map((s) => `${s.kind}:${s.why}`)], [VER, [VER], ["way.agreed:not_allowed", "way.agreed:not_allowed", "way.applied:not_starter"]], `${mode} (round 14: a stranger's agreements are not taken either)`);
  }
  const own = foldBook(WAY, squat, ways, OWN);
  assert.deepEqual([own.ver, own.skipped.map((s) => `${s.kind}:${s.why}`)], [S.ver, ["way.applied:wrong_from"]], "a person's own log: first come, as before");
  // an agent and a machine that hold a role in the first version, both an owner's: neither starts it; their person does
  const w2 = raw(); w2.roles.explorer.who = [MARCO, "agent:marco"]; w2.roles.keeper.who = [FRANK, RUNNER];
  const A = load(w2);
  for (const mode of BOTH) {
    const t = team(mode, { frank: "owner", marco: "owner" });
    assert.deepEqual(started(t.b, "agent:marco", A), ["", "not_allowed"], `an owner's agent, under ${mode}`);
    assert.deepEqual(started(t.b, RUNNER, A), ["", "not_allowed"], `an owner's machine (the runner itself), under ${mode}`);
    assert.deepEqual(started(t.b, LAPTOP, A), ["", "not_allowed"]);
    assert.deepEqual(started(t.b, FRANK, A), [A.ver, undefined]);
    // an apply the book does not say who signed, trusted by a caller: in a team's book no one is not a starter
    assert.deepEqual(started(t.b, null, A, day(-1, 1), { unsigned: "trust" }), ["", "not_starter"]);
    assert.deepEqual(started(t.b, null, A), ["", "unsigned"]);
  }
  assert.deepEqual(started(OWN, null, A, day(-1, 1), { unsigned: "trust" }), [A.ver, undefined], "a person's own log, trusted: as before");
  // N26 stays: the signer holds a role in the version, an owner included
  assert.deepEqual(started(team("owner", { frank: "owner", marco: "editor", isaac: "owner" }).b, "person:isaac"), ["", "not_allowed"]);
});

test("who may start (4a.3): a first version that names a guest or someone not in the project is not started, under either setting: behind any `who` entry, or as the runner's login", () => {
  const ways = (l: Loaded) => waysOf(l);
  for (const mode of BOTH) {
    assert.deepEqual(started(team(mode, { frank: "owner", marco: "guest" }).b), ["", "not_member"], `Marco a guest, ${mode}`);
    assert.deepEqual(started(team(mode, { frank: "owner" }).b), ["", "not_member"], `Marco not in the project, ${mode}`);
    // a second person in a role, as a person, as an agent, as a machine: each agreed (their person did), each a member
    for (const entry of ["person:isaac", "agent:isaac", "machine:box@isaac"]) {
      const w = raw(); w.roles.explorer.who = [MARCO, entry];
      const l = load(w);
      assert.deepEqual(started(team(mode, { frank: "owner", marco: "editor", isaac: "guest" }).b, FRANK, l), ["", "not_member"], `${entry} a guest's, ${mode}`);
      assert.deepEqual(started(team(mode, { frank: "owner", marco: "editor" }).b, FRANK, l), ["", "not_member"], `${entry} a stranger's, ${mode}`);
      assert.deepEqual(started(team(mode, { frank: "owner", marco: "editor", isaac: "editor" }).b, FRANK, l), [l.ver, undefined], `${entry} an editor's, ${mode}`);
    }
    // the runner's login: the person whose Sol would run the way. A member, and (Frank 2026-11-12, A) one who agreed
    // to the version, though no role names them: as the runner's (RUNNER_ROLE)
    const w = raw(); w.runner = "nucbox@isaac";
    const R = load(w);
    assert.deepEqual(started(team(mode, { frank: "owner", marco: "editor", isaac: "guest" }).b, FRANK, R), ["", "not_member"], `the runner's person a guest, ${mode}`);
    assert.deepEqual(started(team(mode, { frank: "owner", marco: "editor" }).b, FRANK, R), ["", "not_member"], `the runner's person a stranger, ${mode}`);
    assert.deepEqual(started(team(mode, { frank: "owner", marco: "editor", isaac: "editor" }).b, FRANK, R), ["", "not_agreed"], `the runner's person has not agreed, ${mode}`);
    const asRunner = (role: string, by = "person:isaac"): WayEvent => ({ kind: "way.agreed", item: WAY, at: day(-1, 0), id: `run-${role}-${by}`, by, value: { way: WAY, to: R.ver, role } });
    const withRunner = (...extra: WayEvent[]) => { const q = foldBook(WAY, seat([...firstAgreed(R.ver, day(-1, 0)), ...extra, applied(R.ver, day(-1, 1))]), waysOf(R), team(mode, { frank: "owner", marco: "editor", isaac: "editor" }).b, NOW); return [q.ver, q.skipped.at(-1)?.why]; };
    assert.deepEqual(withRunner(asRunner(RUNNER_ROLE)), [R.ver, undefined], `the runner's person agreed as the runner's, ${mode}`);
    assert.deepEqual(withRunner(asRunner(RUNNER_ROLE, MARCO)), ["", "not_agreed"], `someone else's agreement as the runner's counts for nothing, ${mode}`);
    const byAgent = foldBook(WAY, seat([...firstAgreed(R.ver, day(-1, 0)), { ...asRunner(RUNNER_ROLE), by: "agent:isaac" }, applied(R.ver, day(-1, 1))]), waysOf(R), team(mode, { frank: "owner", marco: "editor", isaac: "editor" }).b, NOW);
    assert.deepEqual([byAgent.ver, byAgent.skipped.map((x) => x.why)], ["", ["not_allowed", "not_agreed"]], `an agent does not agree for its person, ${mode}`);
    // the order of the reasons: the signer first, then who is named, then who agreed
    const t = team(mode, { frank: "guest", marco: "guest" });
    assert.deepEqual(started(t.b), ["", "not_starter"], "a guest signer, whoever else is named");
    const none = foldBook(WAY, seat([applied(VER, day(-1, 1))]), ways(L), team(mode, { frank: "owner", marco: "guest" }).b, NOW);
    assert.deepEqual([none.ver, none.skipped.at(-1)?.why], ["", "not_member"], "named a guest, no one agreed: the guest is the reason");
    const unagreed = foldBook(WAY, seat([applied(VER, day(-1, 1))]), ways(L), team(mode, { frank: "owner", marco: "editor" }).b, NOW);
    assert.deepEqual([unagreed.ver, unagreed.skipped.at(-1)?.why], ["", "not_agreed"], "everyone a member: each still presses");
    const half = foldBook(WAY, seat([firstAgreed(VER, day(-1, 0))[1], applied(VER, day(-1, 1))]), ways(L), team(mode, { frank: "owner", marco: "editor" }).b, NOW);
    assert.deepEqual([half.ver, half.skipped.at(-1)?.why], ["", "not_agreed"], "one of the two pressed");
  }
});

test("who may start (4a.3): the roles are asked at the way.applied's own signed time, not when anyone agreed and not when the book got it (round 14: each agreement is asked about its own signer at its own time, as a press)", () => {
  const change = day(-2, 0), agreedAt = day(-3, 0);
  const until = (r: TeamRole, then: TeamRole | null) => (at: number) => (at < change ? r : then);
  const run = (b: Book, at: number, by = FRANK, seen?: number) => {
    const q = foldBook(WAY, seat([...firstAgreed(VER, agreedAt), { ...applied(VER, at, "", by), ...(seen !== undefined ? { seen } : {}) }]), waysOf(L), b, NOW);
    return [q.ver, q.skipped.at(-1)?.why];
  };
  for (const mode of BOTH) {
    // Frank was an owner when he agreed, and is a guest when he applies
    const t = team(mode, { frank: until("owner", "guest"), marco: "owner" });
    assert.deepEqual(run(t.b, day(-1, 1)), ["", "not_starter"], mode);
    assert.deepEqual([...new Set(t.asked.map(([, at]) => at))], [agreedAt, day(-1, 1)], "asked about the apply's time, and each agreement's signer at its own");
    assert.deepEqual([...new Set(t.asked.filter(([, at]) => at === day(-1, 1)).map(([login]) => login))].sort(), ["frank"], "at the apply's time its signer, a guest by then: nothing more is asked");
    assert.deepEqual(run(t.b, day(-1, 1), MARCO), ["", "not_member"], "Marco applies it: it still names a guest");
    // Marco was an editor when he agreed, a guest (or out of the project) at the apply
    assert.deepEqual(run(team(mode, { frank: "owner", marco: until("editor", "guest") }).b, day(-1, 1)), ["", "not_member"]);
    assert.deepEqual(run(team(mode, { frank: "owner", marco: until("editor", null) }).b, day(-1, 1)), ["", "not_member"]);
    // an apply signed before the change is asked about that time: taken. Whether so old a signed time is believed is
    // the shared order's and the wiring's (4a.2, 4b: an apply received long after it was signed is flagged), not this
    // rule's; `seen` is not what is asked
    const back = team(mode, { frank: until("owner", "guest"), marco: "owner" });
    assert.deepEqual(run(back.b, change - 1, FRANK, day(5, 0)), [VER, undefined]);
    assert.deepEqual([...new Set(back.asked.map(([, at]) => at))], [agreedAt, change - 1], "and each agreement's signer at its own time");
    assert.deepEqual([...new Set(back.asked.map(([login]) => login))].sort(), ["frank", "marco"], "the signer and everyone named, no one else");
    // the other way round: not yet a member when the apply was signed, a member later
    const later = team(mode, { frank: "owner", marco: (at) => (at < change ? null : "editor") });
    assert.deepEqual(run(later.b, change - 1), ["", "not_member"]);
    // (round 14: an agreement is a press, and his was given before he was in the project: it is not taken, and the
    // apply waits for his agreement as a member)
    assert.deepEqual(run(later.b, change), ["", "not_agreed"]);
    const again = foldBook(WAY, seat([...firstAgreed(VER, agreedAt), ...firstAgreed(VER, change).filter((e) => e.by === MARCO), applied(VER, change + 1)]), waysOf(L), later.b, NOW);
    assert.deepEqual([again.ver, again.skipped.map((s) => s.why)], [VER, ["not_allowed"]], "agreed again as a member: taken");
    // a refused first apply spoils nothing: pressed again once everyone is a member, it is taken on the same agreements
    // (round 14: on agreements given while everyone was a member)
    const twice = foldBook(WAY, seat([{ ...applied(VER, change - 1), id: "early" }, ...firstAgreed(VER, change), { ...applied(VER, change + 1), id: "late" }]), waysOf(L), later.b, NOW);
    assert.deepEqual([twice.ver, twice.skipped.map((s) => `${s.id}:${s.why}`)], [VER, ["early:not_member"]]);
    // a time that is no time is no one's: in a team's book such an event has no place in the order (4a.2 v3; the trail
    // refuses to keep one)
    assert.deepEqual(run(team(mode, { frank: "owner", marco: "owner" }).b, NaN), ["", "no_place"]);
  }
});

test("who may start (4a.3, and 4a.2 v3 rule 8): the first apply is under the start rule; a later apply and a revert are judged as before but for who they newly name, a member who is not a guest", () => {
  const roles = { frank: (at: number): TeamRole => (at < day(5, 0) ? "owner" : "guest"), marco: "editor" as TeamRole };
  const guest = team("owner", { ...roles, gina: "guest" }), member = team("owner", { ...roles, gina: (at) => (at < day(6, 12) ? "editor" : "guest") });
  const first = [...firstAgreed(VER, day(-1, 0)), applied(VER, day(-1, 1))];
  const head = first.at(-1)!.id!;
  // in a team's book an agreement says which apply it was given on (rule 6): here always the first one
  const ag = (to: string, role: string, by: string, at: number, on = head): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `ws-${to.slice(0, 4)}-${role}-${by}-${at}`, by, value: { way: WAY, to, role }, ...(on ? { base: [on] } : {}) });
  const ap = (to: string, from: string, by: string, at: number): WayEvent => ({ ...applied(to, at, from, by), id: `ws-ap-${to.slice(0, 4)}-${at}` });
  // B: Gina becomes an explorer too (touches explorer); C: a rule's change (touches no role)
  const w1 = raw(); w1.prev = VER; w1.roles.explorer.who = [MARCO, "person:gina"];
  const B = load(w1);
  const w2 = raw(); w2.prev = B.ver; w2.roles.explorer.who = [MARCO, "person:gina"]; w2.rules.expired.any[0].all[0].older = "30d";
  const C = load(w2), ways = waysOf(L, B, C);
  const run = (b: Book, ...e: WayEvent[]) => { const q = foldBook(WAY, seat([...first, ...e]), ways, b, NOW); return [q.ver, q.skipped.at(-1)?.why]; };
  // an editor applies a later version under `owner`: no start rule, rule B as before (the holder and the added person
  // agree). But the person it adds must be a member who is not a guest when it is applied
  const toB = [ag(B.ver, "explorer", MARCO, day(1, 0)), ag(B.ver, "explorer", "person:gina", day(1, 0)), ap(B.ver, VER, MARCO, day(1, 1))];
  assert.deepEqual(run(member.b, ...toB), [B.ver, undefined]);
  assert.deepEqual(run(member.b, toB[0], toB[2]), [VER, "not_agreed"], "Gina still presses for herself");
  assert.deepEqual(run(guest.b, ...toB), [VER, "not_member"], "a guest is not put into a role by a later apply either");
  assert.deepEqual(run(guest.b, toB[0], toB[2]), [VER, "not_member"], "who is named comes before who agreed");
  // the team's standing comes before the way's roles (Frank 2026-11-12, A): Frank, a guest by day 5, holds no role
  // any more, not even for a change that touches none; Marco, an editor, does. Gina, a guest by day 7, takes nothing
  // back; Marco does
  const toC = ap(C.ver, B.ver, FRANK, day(6, 0)), toCm = ap(C.ver, B.ver, MARCO, day(6, 0));
  assert.deepEqual(run(member.b, ...toB, toC), [B.ver, "not_allowed"], "a guest holds no role");
  assert.deepEqual(run(member.b, ...toB, toCm), [C.ver, undefined]);
  const back = (by: string): WayEvent => ({ kind: "way.reverted", item: WAY, at: day(7, 0), id: `ws-rv-${by}`, by, value: { way: WAY, from: C.ver, to: B.ver } });
  assert.deepEqual(run(member.b, ...toB, toCm, back("person:gina")), [C.ver, "not_allowed"], "a guest takes nothing back");
  assert.deepEqual(run(member.b, ...toB, toCm, back(MARCO)), [B.ver, undefined]);
  // the same later apply as a first one is refused by the start rule
  const asFirst = foldBook(WAY, seat([ag(B.ver, "explorer", MARCO, 1, ""), ag(B.ver, "explorer", "person:gina", 1, ""), ag(B.ver, "keeper", FRANK, 1, ""), ap(B.ver, "", FRANK, 2)]), ways, guest.b, NOW);
  assert.deepEqual([asFirst.ver, asFirst.skipped.at(-1)?.why], ["", "not_member"]);
  // a person's own log is not under rule 8, nor under rule 6: the same events, a guest named, no `base` read
  const own = foldBook(WAY, [...first, ...toB.map((e) => ({ ...e, base: undefined }))], ways, OWN);
  assert.deepEqual([own.ver, own.skipped], [B.ver, []]);
});

test("the team's standing comes before the way's roles, and the runner's person agrees (Frank 2026-11-12, both A): in a team's book a holder who is a guest by then, or out of the project, is asked nothing and signs nothing; a role whose holders are all gone asks nobody's agreement, and an owner of the team fills it without holding a role of the way; a change of runner waits for the new runner's person to agree, as any role or as the runner's. A person's own log is not under either", () => {
  const first = [...firstAgreed(VER, day(-1, 0)), applied(VER, day(-1, 1))];
  const head = first.at(-1)!.id!;
  const ag = (to: string, role: string, by: string, at = day(6, 0)): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `st-${to.slice(0, 4)}-${role}-${by}-${at}`, by, value: { way: WAY, to, role }, base: [head] });
  const ap = (to: string, by: string, at = day(6, 1)): WayEvent => ({ ...applied(to, at, VER, by), id: `st-ap-${to.slice(0, 4)}-${by}` });
  const run = (b: Book, ways: ReadonlyMap<string, Way>, ...e: WayEvent[]) => { const q = foldBook(WAY, seat([...first, ...e]), ways, b, NOW); return [q.ver, q.skipped.at(-1)?.why]; };
  const later = (by5: TeamRole) => (at: number): TeamRole => (at < day(5, 0) ? "owner" : by5);
  // Isaac into the keeper's role: Frank, its holder, a guest by day 5
  const wk = raw(); wk.prev = VER; wk.roles.keeper.who = [FRANK, "person:isaac"];
  const K = load(wk), ways = waysOf(L, K);
  const gone = team("owner", { frank: later("guest"), marco: "editor", isaac: "editor" }).b;
  assert.deepEqual(run(gone, ways, ag(K.ver, "keeper", "person:isaac"), ap(K.ver, MARCO)), [K.ver, undefined], "the keeper's holder is gone: Marco and Isaac alone");
  assert.deepEqual(run(team("owner", { frank: "owner", marco: "editor", isaac: "editor" }).b, ways, ag(K.ver, "keeper", "person:isaac"), ap(K.ver, MARCO)), [VER, "not_agreed"], "while Frank is a member he is asked");
  assert.deepEqual(run(gone, ways, ag(K.ver, "keeper", "person:isaac"), ag(K.ver, "keeper", FRANK), ap(K.ver, FRANK)), [VER, "not_allowed"], "and, a guest, he signs nothing");
  // everyone of the way gone: an owner of the team who holds no role puts Isaac into both roles; an editor cannot
  const wb = raw(); wb.prev = VER; wb.roles.keeper.who = ["person:isaac"]; wb.roles.explorer.who = ["person:isaac"];
  const Bo = load(wb), ways2 = waysOf(L, Bo);
  const all = (isaac: TeamRole) => team("owner", { frank: later("guest"), marco: later("guest"), isaac }).b;
  const both = [ag(Bo.ver, "keeper", "person:isaac"), ag(Bo.ver, "explorer", "person:isaac")];
  assert.deepEqual(run(all("owner"), ways2, ...both, ap(Bo.ver, "person:isaac")), [Bo.ver, undefined], "an owner fills the empty roles");
  assert.deepEqual(run(all("editor"), ways2, ...both, ap(Bo.ver, "person:isaac")), [VER, "not_allowed"], "an editor who holds no role does not");
  // only to fill: an owner without a role does not change a rule (it touches no role), nor a role someone still holds
  const wr = raw(); wr.prev = VER; wr.rules.expired.any[0].all[0].older = "30d";
  const Ru = load(wr), ways4 = waysOf(L, Ru, K);
  assert.deepEqual(run(all("owner"), ways4, ap(Ru.ver, "person:isaac")), [VER, "not_allowed"], "a change that touches no role is not an owner's to make");
  assert.deepEqual(run(team("owner", { frank: "owner", marco: "editor", isaac: "owner" }).b, ways4, ag(K.ver, "keeper", "person:isaac"), ag(K.ver, "keeper", FRANK), ap(K.ver, "person:isaac")), [VER, "not_allowed"], "nor one that touches a role a member holds");
  // a change of runner: to Marco's Mini (Marco agrees as an explorer: that is his agreement), to Isaac's (no role)
  const wm = raw(); wm.prev = VER; wm.runner = "mini@marco";
  const wi = raw(); wi.prev = VER; wi.runner = "mini@isaac";
  const M = load(wm), I = load(wi), ways3 = waysOf(L, M, I);
  const members = team("owner", { frank: "owner", marco: "editor", isaac: "editor" }).b;
  const holders = (to: string) => [ag(to, "explorer", MARCO), ag(to, "keeper", FRANK)];
  assert.deepEqual(run(members, ways3, ...holders(M.ver), ap(M.ver, FRANK)), [M.ver, undefined], "Marco's agreement as an explorer is his");
  assert.deepEqual(run(members, ways3, ...holders(I.ver), ap(I.ver, FRANK)), [VER, "not_agreed"], "Isaac has not agreed");
  assert.deepEqual(run(members, ways3, ...holders(I.ver), ag(I.ver, RUNNER_ROLE, "person:isaac"), ap(I.ver, FRANK)), [I.ver, undefined], "Isaac agreed as the runner's");
  // a person's own log is under neither: Frank's agreement is asked whatever the team says, and no runner's agreement is
  const own = foldBook(WAY, [...first, ...holders(I.ver).map((e) => ({ ...e, base: undefined })), { ...ap(I.ver, FRANK) }], ways3, OWN);
  assert.deepEqual([own.ver, own.skipped], [I.ver, []]);
});

test("round 14, pinned after mutating Frank's two rules and after its grading: an owner without a role fills only roles that were held and have no holder left, every one of them, with nothing else along, and takes back too; the runner's person's own revert is their agreement, and an agreement the book signs counts as it does for a role; a guest's agreement and a guest's check are set aside", () => {
  const first = [...firstAgreed(VER, day(-1, 0)), applied(VER, day(-1, 1))];
  const head = first.at(-1)!.id!;
  const ag = (to: string, role: string, by: string | undefined, at = day(6, 0), base = head): WayEvent => ({ kind: "way.agreed", item: WAY, at, id: `r14-${to.slice(0, 4)}-${role}-${by}-${at}`, ...(by ? { by } : {}), value: { way: WAY, to, role }, base: [base] });
  const ap = (to: string, by: string, at = day(6, 1), from = VER): WayEvent => ({ ...applied(to, at, from, by), id: `r14-ap-${to.slice(0, 4)}-${by}-${at}` });
  const rv = (from: string, to: string, by: string, at = day(7, 1)): WayEvent => ({ kind: "way.reverted", item: WAY, at, id: `r14-rv-${by}-${at}`, by, value: { way: WAY, from, to } });
  const fold = (b: Book, ways: ReadonlyMap<string, Way>, events: WayEvent[]) => { const q = foldBook(WAY, seat(events), ways, b, NOW); return [q.ver, q.skipped.at(-1)?.why]; };
  const later = (by5: TeamRole) => (at: number): TeamRole => (at < day(5, 0) ? "owner" : by5);
  const ISAAC = "person:isaac", GINA = "person:gina";
  const wk = raw(); wk.prev = VER; wk.roles.keeper.who = [FRANK, ISAAC];
  const K = load(wk), ways = waysOf(L, K);
  // one role emptied, the other still held by Marco: Isaac, an owner without a role, may not touch both
  const wb = raw(); wb.prev = VER; wb.roles.keeper.who = [ISAAC]; wb.roles.explorer.who = [MARCO, ISAAC];
  const Bx = load(wb), ways1 = waysOf(L, Bx);
  const oneGone = team("owner", { frank: later("guest"), marco: "editor", isaac: "owner" }).b;
  const agreeBx = [ag(Bx.ver, "keeper", ISAAC), ag(Bx.ver, "explorer", ISAAC), ag(Bx.ver, "explorer", MARCO)];
  assert.deepEqual(fold(oneGone, ways1, [...first, ...agreeBx, ap(Bx.ver, ISAAC)]), [VER, "not_allowed"], "an empty role and a held one: not the owner's");
  assert.deepEqual(fold(oneGone, ways1, [...first, ...agreeBx, ap(Bx.ver, MARCO)]), [Bx.ver, undefined], "Marco, who holds a role, may");
  // a role two hold, one of them gone: it still has a holder, so it is not the owner's to fill
  const ws = raw(); ws.roles.keeper.who = [FRANK, MARCO];
  const S = load(ws);
  const ws2 = raw(); ws2.prev = S.ver; ws2.roles.keeper.who = [MARCO, ISAAC];
  const S2 = load(ws2), ways2 = waysOf(S, S2);
  const sFirst = [...firstAgreed(S.ver, day(-1, 0)), applied(S.ver, day(-1, 1))];
  const sAg = [ag(S2.ver, "keeper", ISAAC, day(6, 0), sFirst.at(-1)!.id!), ag(S2.ver, "keeper", MARCO, day(6, 0), sFirst.at(-1)!.id!)];
  assert.deepEqual(fold(oneGone, ways2, [...sFirst, ...sAg, ap(S2.ver, ISAAC, day(6, 1), S.ver)]), [S.ver, "not_allowed"], "one holder gone, one left");
  assert.deepEqual(fold(oneGone, ways2, [...sFirst, ...sAg, ap(S2.ver, MARCO, day(6, 1), S.ver)]), [S2.ver, undefined]);
  // a revert: Gina took Marco's place, then became a guest; Isaac, an owner without a role, takes the way back to
  // Marco (who agrees), and not while Gina is a member
  const wg = raw(); wg.prev = VER; wg.roles.explorer.who = [GINA];
  const G = load(wg), ways3 = waysOf(L, G);
  const toG = [ag(G.ver, "explorer", GINA, day(2, 0)), ag(G.ver, "explorer", MARCO, day(2, 0)), ap(G.ver, FRANK, day(2, 1))];
  const gHead = toG.at(-1)!.id!;
  const back = [ag(VER, "explorer", MARCO, day(7, 0), gHead), rv(G.ver, VER, ISAAC)];
  const ginaGone = team("owner", { frank: "owner", marco: "editor", isaac: "owner", gina: later("guest") }).b;
  assert.deepEqual(fold(ginaGone, ways3, [...first, ...toG, ...back]), [VER, undefined], "the owner takes back what fills the emptied role");
  assert.deepEqual(fold(team("owner", { frank: "owner", marco: "editor", isaac: "owner", gina: "editor" }).b, ways3, [...first, ...toG, ...back]), [G.ver, "not_allowed"], "not while Gina is a member");
  // the runner's person takes back a change of runner: their own signature is their agreement (Marco's, as the
  // explorer's holder, is still asked)
  const wm = raw(); wm.prev = VER; wm.runner = "mini@marco";
  const M = load(wm), ways4 = waysOf(L, M);
  const toM = [ag(M.ver, "explorer", MARCO, day(2, 0)), ag(M.ver, "keeper", FRANK, day(2, 0)), ap(M.ver, FRANK, day(2, 1))];
  const mHead = toM.at(-1)!.id!;
  const members = team("owner", { frank: "owner", marco: "editor", isaac: "editor" }).b;
  assert.deepEqual(fold(members, ways4, [...first, ...toM, ag(VER, "explorer", MARCO, day(7, 0), mHead), rv(M.ver, VER, FRANK)]), [VER, undefined], "Frank, nucbox's person, takes his runner back");
  assert.deepEqual(fold(members, ways4, [...first, ...toM, rv(M.ver, VER, FRANK)]), [M.ver, "not_agreed"], "Marco's agreement is still asked");
  // an agreement with no signer, trusted as this Sol's own (FoldOptions.unsigned), counts for the runner's person, as
  // it does for a role's holder; not trusted, it is passed over
  const wi = raw(); wi.prev = VER; wi.runner = "mini@isaac";
  const I = load(wi), ways5 = waysOf(L, I);
  const holders = [ag(I.ver, "explorer", MARCO), ag(I.ver, "keeper", FRANK)];
  const trusted = (unsigned?: "trust") => { const q = foldBook(WAY, seat([...first, ...holders, ag(I.ver, RUNNER_ROLE, undefined), ap(I.ver, FRANK)]), ways5, members, { ...NOW, ...(unsigned ? { unsigned } : {}) }); return [q.ver, q.skipped.map((x) => x.why)]; };
  assert.deepEqual(trusted("trust"), [I.ver, []]);
  assert.deepEqual(trusted(), [VER, ["unsigned", "not_agreed"]]);
  // round 14's grading: an owner without a role adds no role of their own (a role new in the version has no holder to
  // be gone) and fills carrying nothing else along: a rule or a seam's print rides in neither (grade14 r1, r2)
  const everyone = team("owner", { frank: "owner", marco: "editor", isaac: "owner" }).b;
  const wn = raw(); wn.prev = VER; wn.roles.admin = { name: "admin", who: [ISAAC] }; wn.rules.expired.any[0].all[0].older = "1d";
  wn.life.draft.moves.push({ id: "nuke", from: ["on_switch", "wanted"], to: "removed", by: ["admin"] });
  const Nr = load(wn);
  assert.deepEqual(fold(everyone, waysOf(L, Nr), [...first, ag(Nr.ver, "admin", ISAAC), ap(Nr.ver, ISAAC)]), [VER, "not_allowed"], "a new role of the owner's own");
  const wd = raw(); wd.prev = VER; wd.roles.admin = { name: "admin", who: [ISAAC] };
  const Nd = load(wd);
  assert.deepEqual(fold(everyone, waysOf(L, Nd), [...first, ag(Nd.ver, "admin", ISAAC), ap(Nd.ver, ISAAC)]), [VER, "not_allowed"], "a new role and nothing else: not a fill either");
  const keeperGone = team("owner", { frank: later("guest"), marco: "editor", isaac: "owner" }).b;
  const fill = (change: (f: Record<string, any>) => void) => { const f = raw(); f.prev = VER; f.roles.keeper.who = [ISAAC]; change(f); return load(f); };
  const plain = fill(() => {}), ride = fill((f) => { f.rules.solid.all.pop(); }), print = fill((f) => { f.seams[Object.keys(f.seams)[0]].pkg = `sha256:${"f".repeat(64)}`; });
  const renamed = fill((f) => { f.roles.keeper.name = "the owner's"; });
  for (const [what, V, want] of [["the fill alone", plain, plain.ver], ["a rule along", ride, VER], ["a seam's print along", print, VER], ["the role renamed along", renamed, VER]] as const)
    assert.deepEqual(fold(keeperGone, waysOf(L, V), [...first, ag(V.ver, "keeper", ISAAC), ap(V.ver, ISAAC)])[0], want, what);
  // an agreement is a press: one a guest gives is not taken, and stays not taken when they are a member again
  const back5 = (at: number): TeamRole => (at >= day(5, 0) && at < day(6, 0) ? "guest" : "owner");
  const ginaIn = team("owner", { frank: back5, marco: "editor", isaac: "editor" }).b;
  assert.deepEqual(fold(ginaIn, ways, [...first, ag(K.ver, "keeper", ISAAC, day(5, 3)), ag(K.ver, "keeper", FRANK, day(5, 3)), ap(K.ver, MARCO, day(6, 1))]), [VER, "not_agreed"], "Frank agreed as a guest");
  const q = foldBook(WAY, seat([...first, ag(K.ver, "keeper", FRANK, day(5, 3))]), ways, ginaIn, NOW);
  assert.deepEqual(q.skipped.map((x) => x.why), ["not_allowed"]);
  assert.deepEqual(fold(ginaIn, ways, [...first, ag(K.ver, "keeper", ISAAC, day(6, 0)), ag(K.ver, "keeper", FRANK, day(6, 0)), ap(K.ver, MARCO, day(6, 1))]), [K.ver, undefined], "and as a member again");
  // a guest's check is set aside; a member's is taken
  const b = book();
  b.events.push(...first);   // (its agreements an hour before the apply: at one ms, Frank's apply orders before Marco's agreement)
  make(b, L, "d1", day(0, 9));
  const check: WayEvent = { kind: "way.checked", item: "d1", at: day(6, 10), id: "r14-c", by: FRANK, value: { way: WAY, ver: VER, thing: "d1", rule: "solid", seam: "gate.green", pv: 1, pkg: `sha256:${PRINT}`, pass: true, at: day(6, 10) } };
  const checked = (frank: TeamRole | ((at: number) => TeamRole)) => { const q = foldBook(WAY, seat([...b.events, check]), waysOf(L), team("owner", { frank, marco: "editor" }).b, NOW); return [Object.keys(q.checks), q.skipped.map((x) => x.why)]; };
  assert.deepEqual(checked("owner"), [["r14-c"], []]);
  assert.deepEqual(checked(later("guest")), [[], ["not_allowed"]]);
});

test("4b step 1: `ways.start` may be what the setting was at each moment; the first apply is judged under what it said at the apply's own signed time, so turning it back to `owner` unmakes no way an editor started; anything but `member` then is `owner`", () => {
  const change = day(1, 0);
  const asked: number[] = [];
  const setting = (at: number): StartRule => { asked.push(at); return at < change ? "member" : "owner"; };
  const roles = { frank: "owner", marco: "editor" } as Record<string, TeamRole>;
  const b = (start: TeamBook["start"]): Book => ({ book: "team", start, roleOf: (login) => roles[login] ?? null });
  // Marco, an editor and the explorer, starts the way while the setting is `member`; Frank, an owner, at any time
  assert.deepEqual(started(b(setting), MARCO, L, day(0, 1)), [VER, undefined]);
  assert.deepEqual(asked, [day(0, 1)], "asked once, at the apply's own time (not the agreements', not now)");
  assert.deepEqual(started(b(setting), MARCO, L, day(2, 1)), ["", "not_starter"], "after it was turned back to owner");
  assert.deepEqual(started(b(setting), FRANK, L, day(2, 1)), [VER, undefined]);
  // the way Marco started stays started, whatever the setting says later: a make long after the change is taken
  const events = seat([...firstAgreed(VER, day(-1, 0)), applied(VER, day(0, 1), "", MARCO)]);
  const p = foldBook(WAY, events, waysOf(L), b(setting), NOW);
  const make = decide(L, p, { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, day(5, 9));
  const ids = make.drafts.map((_, i) => `s1-${i}`);
  const q = foldBook(WAY, seat([...events, ...make.drafts.map((d, i) => ({ kind: d.kind, item: d.item, value: written(d, ids), at: d.at, id: ids[i], by: MARCO }))]), waysOf(L), b(setting), NOW);
  assert.deepEqual([q.ver, q.things.d1?.state, q.skipped.map((s) => `${s.kind}:${s.why}`)], [VER, "on_switch", []]);
  // fails closed to `owner`: a lookup that throws, or answers anything but exactly `member`
  for (const odd of [() => { throw new Error("no setting"); }, () => "Member", () => undefined, () => "anyone", () => ["member"]] as (() => StartRule)[]) {
    assert.deepEqual(started(b(odd), MARCO, L, day(0, 1)), ["", "not_starter"], String(odd));
    assert.deepEqual(started(b(odd), FRANK, L, day(0, 1)), [VER, undefined], String(odd));
  }
  // one value, as before
  assert.deepEqual(started(b("member"), MARCO, L, day(2, 1)), [VER, undefined]);
  assert.deepEqual(started(b("owner"), MARCO, L, day(0, 1)), ["", "not_starter"]);
});

test("who may start (4a.3) fails closed: a fold not told exactly which book it reads starts no way, a team's lookup that throws or answers anything but a role lets no one in, and drafts start nothing", () => {
  const events = [...firstAgreed(VER, day(-1, 0)), applied(VER, day(-1, 1))];
  const roleOf = () => "owner" as const;
  const bad: unknown[] = [undefined, null, {}, { unsigned: "trust" }, "own", "team", OWN.book, [OWN], { book: "Own" }, { book: "team" }, { book: "team", start: "owner" }, { book: "team", roleOf },
    { book: "team", start: "anyone", roleOf }, { book: "team", start: "", roleOf }, { book: "team", start: "owner", roleOf: "owner" }, { book: "team", start: "owner", roleOf: { frank: "owner" } },
    { book: "own", start: "member", roleOf }, { book: "own", roleOf }, { team: { start: "owner", roleOf } }, { start: "owner", roleOf }, 0, true, roleOf,
    { book: "own", start: () => "member" }, { book: "team", start: () => "member" }, { book: "team", start: ["member"], roleOf }];
  for (const b of bad) {
    const b1 = book(events as WayEvent[]);
    b1.write(decide(L, fold(WAY, b1.events, waysOf(L)), { asker: MARCO, thing: "d1", kind: "draft", move: "make", set: { title: "New logo", switch: "logo_v2" } }, day(0, 9)).drafts, MARCO);
    const q = foldBook(WAY, b1.events, waysOf(L), b as Book, NOW);
    assert.deepEqual([q.ver, q.vers, Object.keys(q.things)], ["", [], []], JSON.stringify(b) ?? String(b));
    assert.deepEqual([...new Set(q.skipped.map((s) => `${s.kind}:${s.why}`))].slice(0, 2), ["way.applied:book_unread", "way.made:not_applied"], JSON.stringify(b) ?? String(b));
    // and a replay of that book has nothing to run again
    assert.deepEqual(replayBook(b1.events, waysOf(L), L, L, b as Book, NOW).things, []);
  }
  assert.ok(Object.isFrozen(OWN));
  // what a lookup may answer: exactly "owner" or "editor". Anything else, a throw included, is no member
  const answers: unknown[] = ["admin", "Owner", "OWNER", " owner", true, 1, undefined, {}, ["owner"], Promise.resolve("owner"), { toString: () => "owner" }, new String("owner")];
  for (const mode of BOTH) {
    for (const a of answers) {
      assert.deepEqual(started({ book: "team", start: mode, roleOf: () => a as TeamRole }), ["", "not_starter"], String(a));
      assert.deepEqual(started({ book: "team", start: mode, roleOf: (login) => (login === "frank" ? "owner" : a as TeamRole) }), ["", "not_member"], String(a));
    }
    assert.deepEqual(started({ book: "team", start: mode, roleOf: () => { throw new Error("no such project"); } }), ["", "not_starter"]);
    assert.deepEqual(started({ book: "team", start: mode, roleOf: (login) => { if (login !== "frank") throw new Error("gone"); return "owner"; } }), ["", "not_member"]);
    // a lookup written as a plain object's key: a login that is a name every object has finds no role
    const naive: Book = { book: "team", start: mode, roleOf: (login) => ({ frank: "owner", marco: "editor" } as Record<string, TeamRole>)[login] ?? null };
    const w = raw(); w.roles.explorer.who = [MARCO, "person:constructor"];
    assert.deepEqual(started(naive, FRANK, load(w)), ["", "not_member"]);
    assert.deepEqual(started(naive), [VER, undefined]);
  }
  // drafts not yet written are in no book: a way.applied among them starts nothing (the engine drafts none)
  const p = emptyProjection(WAY);
  stepDrafts(p, events.map((e) => ({ kind: e.kind, item: e.item!, value: e.value!, at: e.at })), (v) => waysOf(L).get(v));
  assert.deepEqual([p.ver, p.skipped.map((s) => `${s.kind}:${s.why}`)], ["", ["way.applied:book_unread"]]);
});

test("who may start (4a.3): a replay is told the book as the fold is, and reads the same history: a life under a way the team did not let start has nothing to replay (one it let start: way-spine.test.ts)", () => {
  const b = book([applied(VER)]);
  make(b, L, "d1", day(0, 9));
  for (let n = 1; n <= 22; n++) { const d = due(L, fold(WAY, b.events, waysOf(L)), TICK(n), ME, OK5, { "switch.off": true }); b.write(d.drafts, RUNNER); }
  const w = raw(); w.prev = VER; w.rules.expired.any[0].all[0].older = "30d";
  const N = load(w), ways = waysOf(L, N);
  const mine = replay(b.events, ways, L, N);
  assert.equal(mine.things.length, 1);
  assert.equal(mine.differ, 1, "21d made 30d differs for the draft that expired");
  const refused = replayBook(seat(b.events), ways, L, N, team("owner", { frank: "editor", marco: "editor" }).b, NOW);
  assert.deepEqual([refused.things, refused.differ], [[], 0]);
  const p = foldBook(WAY, seat(b.events), ways, team("owner", { frank: "editor", marco: "editor" }).b, NOW);
  assert.deepEqual([p.ver, Object.keys(p.things), p.skipped[0].why], ["", [], "not_starter"]);
  // and the same events with no place at all are passed over one by one, in a team's book only
  const bare = foldBook(WAY, b.events, ways, team("owner", { frank: "owner", marco: "editor" }).b, NOW);
  assert.deepEqual([bare.ver, [...new Set(bare.skipped.map((x) => x.why))]], ["", ["no_place"]]);
});

test("F16: every draft the engine can make fits its way.* row in both books and the trail's item rule, over a generated set of presses", () => {
  // a way whose fields' names are as long as may be, a thing's id as long as may be: "<thing>.<field>" is 120
  const w = raw();
  const longField = "f".repeat(55);
  w.things.draft.fields[longField] = "name";
  w.life.draft.moves[0].set.push(longField);
  const lw = load(w);
  assert.deepEqual(lw.problems, []);
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2_147_483_648; return (seed >>> 8) % n; };
  const pick = <T>(xs: T[]) => xs[rnd(xs.length)];
  const things = ["d1", "d2", "t".repeat(64), "t".repeat(65), "d.1", "two words", "__proto__", "", "d-1_x"];
  const askers = [MARCO, FRANK, "agent:marco", RUNNER, "person:", "trigger:expire", "nobody", "person:isaac"];
  const moves = ["make", "want", "extend", "promote", "drop", "pull", "conjure", "a move with spaces", "m".repeat(130), ""];
  const values = ["logo_v2", "two words", "a\nb", 7, true, null, "x".repeat(130), ["a"], { k: 1 }];
  const drafts: Draft[] = [];
  for (const l of [L, lw, load(FILE), load("{not json")]) {
    const ways = l.way ? waysOf(l) : new Map<string, Way>();
    const b = book(l.way ? [applied(l.ver)] : []);
    // a short life first, so every kind is made, then presses at random
    const extra = l === lw ? { [longField]: "v" } : {};
    for (const [asker, ask, answers] of [
      [MARCO, { thing: "t".repeat(64), kind: "draft", move: "make", set: { title: "x", switch: "logo_v2", ...extra } }, {}],
      [MARCO, { thing: "t".repeat(64), move: "want" }, {}],
      [FRANK, { thing: "t".repeat(64), move: "promote" }, OK5],
      [MARCO, { thing: "s1", kind: "draft", move: "make", set: { title: "y", switch: "s1", ...extra } }, {}],
      [MARCO, { thing: "s1", move: "drop" }, {}],
    ] as [string, Omit<Ask, "asker">, Answers][]) {
      const d = decide(l, fold(WAY, b.events, ways), { asker, ...ask }, day(1, 9), answers);
      const all = [...d.drafts, ...d.acts.map((a) => acted(l.way!, l.ver, a.thing, a.seam, false, day(1, 9), a.after))];
      drafts.push(...all); b.write(all, asker);
    }
    for (let i = 0; i < 400; i++) {
      const p = fold(WAY, b.events, ways);
      const sane = rnd(3) === 0;
      const thing = sane ? pick(["d1", "d2", "t".repeat(64)]) : pick(things), move = sane ? pick(moves.slice(0, 6)) : pick(moves), asker = sane ? pick([MARCO, FRANK]) : pick(askers);
      const set: Record<string, unknown> = sane ? (move === "make" ? { title: "x", switch: "logo_v2", ...(l === lw ? { [longField]: "v" } : {}) } : {}) : { title: pick(values), switch: pick(values), ...(l === lw ? { [longField]: pick(values) } : {}) };
      const d = decide(l, p, { asker, thing, move, kind: rnd(2) ? "draft" : undefined, set }, day(rnd(50), rnd(24), rnd(60)), rnd(2) ? OK5 : {});
      const all = [...d.drafts, ...d.acts.map((a) => acted(l.way!, l.ver, a.thing, a.seam, rnd(2) === 0, d.drafts[0].at, a.after))];
      drafts.push(...all);
      if (d.ok) b.write(all, asker);
      if (i % 20 === 0) { const t = due(l, p, TICK(rnd(50)), ME, rnd(2) ? OK5 : {}); drafts.push(...t.drafts); b.write(t.drafts, RUNNER); }
    }
    if (l.way) { const r = replay(b.events, ways, l, l); drafts.push(previewed(r, day(60, 0))); }
  }
  const ids = Array.from({ length: 64 }, (_, i) => i.toString(16).padStart(2, "0").repeat(32));
  const seen = new Set<string>();
  for (const d of drafts) {
    const v = written(d, ids.concat(ids, ids, ids, ids, ids, ids, ids));
    seen.add(d.kind);
    assert.equal(fits(d.kind, v), null, `${d.kind} ${JSON.stringify(v)}`);
    assert.equal(kindError(d.kind, v), "", `${d.kind} ${JSON.stringify(v)}`);
    assert.match(d.item, ITEM, `${d.kind}'s item ${JSON.stringify(d.item)}`);
  }
  for (const k of ["way.made", "way.move", "way.refused", "way.checked", "way.acted", "way.fired", "way.note", "way.set", "way.previewed"]) assert.ok(seen.has(k), `made a ${k}`);
  assert.ok(drafts.some((d) => d.item.length === 120), "an item of 120");
});

test("every event these tests wrote fits its way.* row in both books and the trail's item rule", () => {
  assert.ok(kept.length > 200, `${kept.length} events`);
  for (const e of kept) {
    assert.equal(fits(e.kind, e.value), null, `${e.kind} ${JSON.stringify(e.value)}`);
    assert.equal(kindError(e.kind, e.value), "", `${e.kind} ${JSON.stringify(e.value)}`);
    assert.match(e.item, ITEM);
  }
});

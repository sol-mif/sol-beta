// The team's one order, the runner's spine (src/way/spine.ts, FORMAT §5), tested on the real module: each scenario
// of the two design reviews (docs/cowork-ways-2026-11-10/reports/step4-refute, s03 to s23) as a case, with the
// runner's events written by the engine's own turn (turn, due, sealed). Where the rule's answer is a stated cost, the
// test pins that answer and its name says "cost". The random schedules are in way-spine-random.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fits } from "../src/contract/kinds.ts";
import { kindError } from "../src/team/v3/trail-kinds.ts";
import { load } from "../src/way/load.ts";
import { decide } from "../src/way/moves.ts";
import * as face from "../src/way/fold.ts";
import { empty, fold, place, sealDue, sealedDue, step, turn, written, SKEW } from "../src/way/fold.ts";
import { sealed } from "../src/way/spine.ts";
import { due } from "../src/way/triggers.ts";
import { replay } from "../src/way/replay.ts";
import { OWN, personOf, type WayEvent } from "../src/way/types.ts";
import { FAR, FRANK, ISAAC, MAKE, MARCO, ME, MINI, RUNNER, SOLID, Sol, TICK, WAY, World, canon, day, kept, raw, seatOf, setup, snap, start, stateOf, taken, whyOf, type Ev } from "./fixtures/way-spine-world.ts";
process.env.SOL_COWORK_WAYS = "on";   // the trail checks the ways' kinds only with their switch on (#1105)

const fired = (evs: readonly Ev[], trigger?: string, thing?: string) =>
  evs.filter((e) => e.kind === "way.fired" && (!trigger || e.value?.trigger === trigger) && (!thing || e.value?.thing === thing));
const isSpine = (r: ReturnType<World["full"]>, id: string) => r.spine.includes(id);

// ---- round 1 (s03 to s11, s13, s14)

test("s03: an extend the runner had seen before its day-21 turn keeps the draft, on every Sol", () => {
  const { marco, frank, runner, sync, w } = setup();
  marco.press(MAKE("d2", "two", "s2"), day(0, 10)); sync();
  runner.run(TICK(14)); sync();
  assert.equal(marco.press({ thing: "d2", move: "extend" }, day(20, 23)).d.ok, true); sync();
  const f = runner.run(TICK(21)); sync();
  assert.deepEqual(fired(f.evs).map((e) => [e.value?.trigger, e.value?.thing]), [["expire", "d1"]], "only d1 expires: d2 was extended");
  for (const s of [marco, frank, runner]) {
    const r = s.view(), d2 = r.p.things.d2;
    assert.deepEqual([d2.state, d2.fields.extended, d2.born], ["on_switch", true, day(0, 10)]);
    assert.equal(stateOf(r, "d1"), "to_remove");
    assert.equal(canon(r), canon(w.full()), "one state on every Sol");
  }
});

test("s04: a press the runner had not seen goes after the runner's event whole, its own way.set with it", () => {
  const file = raw();
  file.things.draft.fields.reason = "name";
  file.life.draft.moves.find((m: { id: string }) => m.id === "want").set = ["reason"];
  const { marco, frank, runner, sync } = setup(file);
  const want = marco.press({ thing: "d1", move: "want", set: { reason: "users_asked" } }, day(13, 23));   // offline
  assert.equal(want.d.ok, true);
  const f = runner.run(TICK(14));   // has not seen it
  assert.equal(fired(f.evs, "remind", "d1").length, 1);
  sync();
  const r = frank.view(), d1 = r.p.things.d1;
  assert.deepEqual([d1.state, d1.fields.reason, d1.missing], ["wanted", "users_asked", []]);
  for (const e of want.evs) assert.deepEqual([seatOf(r, e.id)?.as, seatOf(r, e.id)?.at, seatOf(r, e.id)?.taken], ["tail", TICK(14), true], `${e.kind}: after the remind, judged at its time`);
  runner.run(day(14, 10)); sync();
  const r2 = frank.view();
  assert.deepEqual([r2.p.things.d1.state, r2.p.things.d1.fields.reason, r2.p.things.d1.missing], ["wanted", "users_asked", []], "the same once the runner has seen it");
  assert.equal(seatOf(r2, want.evs[0].id)?.as, "seen");
});

/** s05's team: v1 (runner the NucBox), v1b (a rule change: 22 days), v2 = v1b with the Mini as runner */
function changeOfRunner(miniSeals: boolean) {
  const w = new World();
  const l1 = w.add(raw());
  const f1b = raw(); f1b.prev = l1.ver; f1b.rules.expired.any[0].all[0].older = "22d"; const l1b = w.add(f1b);
  const f2 = JSON.parse(JSON.stringify(f1b)); f2.prev = l1b.ver; f2.runner = "mini@marco"; const l2 = w.add(f2);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), nuc = new Sol(w, RUNNER), mini = new Sol(w, MINI);
  const all = [marco, frank, nuc, mini], others = [marco, frank, mini];
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); all.forEach((s) => s.sync());
  nuc.run(TICK(14)); all.forEach((s) => s.sync());
  marco.raw("way.applied", { way: WAY, from: l1.ver, to: l1b.ver, reader: 1 }, day(15, 10)); others.forEach((s) => s.sync());   // the NucBox is cut off from here
  marco.raw("way.agreed", { way: WAY, to: l2.ver, role: "explorer" }, day(16, 10));
  frank.raw("way.agreed", { way: WAY, to: l2.ver, role: "keeper" }, day(16, 10, 1)); others.forEach((s) => s.sync());
  frank.raw("way.applied", { way: WAY, from: l1b.ver, to: l2.ver, reader: 1 }, day(16, 11)); others.forEach((s) => s.sync());
  const receipt = miniSeals ? mini.seal(day(16, 12)).evs : [];
  others.forEach((s) => s.sync());
  const f = nuc.run(TICK(22));   // still running, cut off, under v1
  all.forEach((s) => s.sync());
  return { w, l1, l2, frank, f, receipt };
}

test("s05, cost: a stale old runner holds a change of runner back until the new runner's first receipt", () => {
  const { w, l2, frank, f } = changeOfRunner(false);
  const F = fired(f.evs, "expire", "d1")[0], r = frank.view();
  assert.ok(F, "the cut-off NucBox fired the expiry under v1");
  assert.equal(isSpine(r, F.id), true, "no receipt from the Mini yet: the old runner's firing is a spine event");
  assert.equal(taken(r, F.id), true);
  assert.equal(stateOf(r, "d1"), "to_remove", "judged under v1 (21 days)");
  assert.equal(r.p.ver, l2.ver, "and the change still comes in, after it");
  assert.equal(canon(r), canon(w.full()));
});

test("s05: once the new runner has written a receipt, the old runner's later firing orders nothing", () => {
  const { l2, frank, f, receipt } = changeOfRunner(true);
  const F = fired(f.evs, "expire", "d1")[0], r = frank.view();
  assert.equal(receipt.length, 1);
  assert.equal(isSpine(r, receipt[0].id), true);
  assert.deepEqual(whyOf(r, F.id), ["not_spine"]);
  for (const e of f.evs) assert.deepEqual(whyOf(r, e.id), ["not_spine"], `${e.kind}: the firing's batch shares its fate`);
  assert.equal(r.p.ver, l2.ver);
  assert.equal(stateOf(r, "d1"), "on_switch", "v2 gives 22 days and the Mini has not run yet");
});

test("s06: a late duplicate extend from another Sol of the same person costs only itself", () => {
  const w = new World(), l = w.add(raw());
  const laptop = new Sol(w, MARCO, "marco-laptop"), phone = new Sol(w, MARCO, "marco-phone"), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  const all = [laptop, phone, frank, runner], near = [phone, frank, runner];
  const notLaptop = () => near.forEach((s) => s.sync(w.all.filter((e) => e.key !== "marco-laptop").map((e) => e.id)));
  start(w, l, day(-1, 12), near);
  phone.press(MAKE("d1", "one", "s1"), day(0, 9)); all.forEach((s) => s.sync());
  assert.equal(laptop.press({ thing: "d1", move: "extend" }, day(4, 9)).d.ok, true);   // offline
  const second = phone.press({ thing: "d1", move: "extend" }, day(5, 9)); notLaptop();
  assert.equal(second.d.ok, true, "the phone has not seen the laptop's");
  phone.press({ thing: "d1", move: "want" }, day(6, 9)); notLaptop();
  assert.equal(frank.press({ thing: "d1", move: "promote" }, day(7, 9), SOLID).d.ok, true);
  assert.equal(stateOf(frank.view(), "d1"), "official");
  all.forEach((s) => s.sync());   // day 8: the laptop is back
  const r = frank.view();
  assert.equal(stateOf(r, "d1"), "official");
  assert.deepEqual(r.p.skipped.filter((s) => s.kind !== "way.refused").map((s) => [s.id, s.kind, s.why]), [[second.evs[0].id, "way.move", "rule_failed"]], "only the second extend is passed over: nothing built after it is lost");
});

/** s07: d1 wanted and reminded on day 14, promoted by Frank on day 15; then Marco signs a rule-only apply dated day 14
 *  10:00 (after the fact) */
function backdatedApply(then: "nothing" | "firing" | "receipt") {
  const w = new World(), l1 = w.add(raw());
  const fb = raw(); fb.prev = l1.ver; fb.rules.expired.any[0].all[0].older = "60d"; fb.rules.expired.any[1].older = "60d"; const lb = w.add(fb);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
  const sync = () => all.forEach((s) => s.sync());
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); marco.press(MAKE("d2", "two", "s2"), day(1, 9)); marco.press({ thing: "d1", move: "want" }, day(2, 9)); sync();
  runner.run(TICK(14)); sync();
  const pr = frank.press({ thing: "d1", move: "promote" }, day(15, 9), SOLID); sync();
  assert.equal(pr.d.ok, true);
  if (then === "firing") { runner.run(TICK(22)); sync(); }   // expires d2; it had seen the promote
  if (then === "receipt") { runner.run(day(15, 9, 10)); sync(); }   // the runner's next turn: something new came, so a receipt
  const ap = marco.raw("way.applied", { way: WAY, from: l1.ver, to: lb.ver, reader: 1 }, day(14, 10)); sync();   // signed on day 30
  return { r: frank.view(), lb, ap, pr };
}

test("s07: a rule change dated back before a press the runner had seen does not void that press", () => {
  const a = backdatedApply("firing");
  assert.deepEqual([stateOf(a.r, "d1"), stateOf(a.r, "d2")], ["official", "to_remove"], "the promote and the day-22 expiry stand");
  assert.equal(a.r.p.ver, a.lb.ver, "the change comes in after them");
  assert.deepEqual([seatOf(a.r, a.ap.id)?.as, seatOf(a.r, a.ap.id)?.at], ["tail", TICK(22)], "judged at the runner's last event, not at the date it claims");
  const b = backdatedApply("receipt");
  assert.equal(stateOf(b.r, "d1"), "official");
  assert.equal(b.r.p.ver, b.lb.ver);
});

test("s07, cost (the open tail): with no runner event after the promote, the apply dated before it wins", () => {
  const { r, lb, pr } = backdatedApply("nothing");
  assert.equal(r.p.ver, lb.ver);
  assert.equal(stateOf(r, "d1"), "wanted", "Frank's promote is under the old version now");
  assert.deepEqual(whyOf(r, pr.evs.find((e) => e.kind === "way.move")!.id), ["old_version"]);
});

/** s08: d1 wanted, reminded on day 14, promoted on day 15; on day 21 the runner writes an expiry as if the promote had
 *  never reached it */
function runnerUnsees(sealedFirst: boolean) {
  const { w, l, marco, frank, runner, sync } = setup();
  marco.press({ thing: "d1", move: "want" }, day(2, 9)); sync();
  runner.run(TICK(14)); sync();
  const promote = frank.press({ thing: "d1", move: "promote" }, day(15, 9), SOLID).evs.map((e) => e.id); sync();
  const receipt = sealedFirst ? runner.run(day(15, 10)).evs : [];
  const pretend = new Set([...runner.holds].filter((id) => !promote.includes(id)));
  const honest = runner.turn(TICK(21), pretend);
  // the hostile write: due() on what it pretends to hold, signed with no frontier
  const d = due(l, runner.view(TICK(21), { holds: pretend }).p, TICK(21), ME);
  const out = runner.write(d.drafts, { holds: pretend });
  sync();
  return { w, r: frank.view(), receipt, honest, out, promote };
}

test("s08: a runner that has said it saw a press cannot unsee it later", () => {
  const { r, receipt, honest, out, promote } = runnerUnsees(true);
  assert.equal(receipt.length, 1, "something new came: a receipt");
  assert.deepEqual([honest.ok, honest.why], [false, "waiting"], "the engine's own turn does not write from a set that lacks what its receipt named");
  assert.equal(fired(out, "expire", "d1").length, 1, "the hostile runner writes the expiry anyway");
  assert.equal(stateOf(r, "d1"), "official");
  assert.equal(taken(r, promote.at(-1)!), true);
  assert.deepEqual(whyOf(r, fired(out, "expire", "d1")[0].id), ["ended"], "the firing is judged after the promote its key had seen");
});

test("s08, cost (the runner's word): a runner that never said it saw a press can keep it behind its own event", () => {
  const { r, receipt, honest, out, promote } = runnerUnsees(false);
  assert.equal(receipt.length, 0);
  assert.equal(honest.ok, true);
  assert.equal(stateOf(r, "d1"), "to_remove", "the expiry is judged before the promote");
  assert.deepEqual(whyOf(r, promote.at(-1)!), ["wrong_state"], "the promote is not destroyed: it is placed, after, and refused there");
  assert.equal(isSpine(r, fired(out, "expire", "d1")[0].id), true);
});

test("s09: an agreement given offline under v1 does not count after an apply the runner placed before it", () => {
  const w = new World(), l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.rules.expired.any[1].older = "50d"; const l2 = w.add(f2);
  const fx = raw(); fx.prev = l1.ver; fx.roles.explorer.who = ["person:marco", "person:frank"]; const lx = w.add(fx);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
  const sync = () => all.forEach((s) => s.sync());
  const first = start(w, l1, day(-10, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(-5, 9)); sync();
  const ag = marco.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(8, 9));   // offline, under v1
  assert.deepEqual(ag.base, [first.id], "it says which apply it was given on");
  const ap2 = frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(9, 9));
  runner.sync(w.all.filter((e) => e.by !== MARCO || e.at < day(8, 0)).map((e) => e.id));
  assert.equal(fired(runner.run(TICK(10)).evs, "remind", "d1").length, 1);
  sync();
  const fa = frank.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(11, 9));
  assert.deepEqual(fa.base, [ap2.id]);
  const apx = frank.raw("way.applied", { way: WAY, from: l2.ver, to: lx.ver, reader: 1 }, day(11, 10)); sync();
  const r = frank.view();
  assert.equal(r.p.ver, l2.ver, "X is not applied");
  assert.deepEqual(whyOf(r, ag.id), ["stale_agreement"]);
  assert.deepEqual(whyOf(r, apx.id), ["not_agreed"]);
  assert.equal(r.p.head, ap2.id, "the projection keeps the head's id");
});

/** s11's team: v1 and lb (a rule-only change: 50 days for the long limit) */
function s11() {
  const w = new World(), l1 = w.add(raw());
  const fb = raw(); fb.prev = l1.ver; fb.rules.expired.any[1].older = "50d"; const lb = w.add(fb);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
  const sync = () => all.forEach((s) => s.sync());
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); sync();
  return { w, l1, lb, marco, frank, runner, sync };
}

test("s11 T1 (r21): an extend signed on day 25, dated day 20, from an old view, does not undo the day-21 expiry", () => {
  const { w, marco, frank, runner, sync } = s11();
  const before = new Set(marco.holds);
  runner.run(TICK(14)); runner.run(TICK(21)); sync();
  const old = new Set([...marco.holds].filter((id) => before.has(id) || w.byId.get(id)!.at < day(15, 0)));
  const x = marco.press({ thing: "d1", move: "extend" }, day(20, 10), {}, { holds: old });
  assert.equal(x.d.ok, true, "his old view allows it");
  sync();
  const r = frank.view(), mv = x.evs.find((e) => e.kind === "way.move")!;
  assert.equal(stateOf(r, "d1"), "to_remove");
  assert.deepEqual([seatOf(r, mv.id)?.at, whyOf(r, mv.id)], [TICK(21), ["wrong_state"]], "judged at the expiry's time, after it");
  assert.equal(r.p.things.d1.fields.extended, undefined);
});

test("s11 T2, cost (offline presses): an honest extend pressed on day 20, arriving after the day-21 expiry, is refused", () => {
  const { marco, frank, runner, sync } = s11();
  runner.run(TICK(14)); sync();
  const x = marco.press({ thing: "d1", move: "extend" }, day(20, 23));   // offline
  assert.equal(x.d.ok, true);
  runner.run(TICK(21)); sync();
  const r = frank.view();
  assert.equal(stateOf(r, "d1"), "to_remove");
  assert.deepEqual(whyOf(r, x.evs.find((e) => e.kind === "way.move")!.id), ["wrong_state"]);
});

test("s11 T3: a rule-only apply dated day 20 and signed after the day-21 expiry leaves the expiry standing and still applies", () => {
  const { l1, lb, marco, frank, runner, sync } = s11();
  runner.run(TICK(14)); sync();
  const f = runner.run(TICK(21));
  marco.raw("way.applied", { way: WAY, from: l1.ver, to: lb.ver, reader: 1 }, day(20, 10)); sync();
  const r = frank.view();
  assert.equal(taken(r, fired(f.evs, "expire", "d1")[0].id), true, "not old_version");
  assert.deepEqual([stateOf(r, "d1"), r.p.ver], ["to_remove", lb.ver]);
});

test("s11 T4: an apply and its revert, both seen by the runner before its remind, leave v1 in force at the remind (one copy)", () => {
  const { l1, lb, marco, frank, runner, sync } = s11();
  marco.raw("way.applied", { way: WAY, from: l1.ver, to: lb.ver, reader: 1 }, day(10, 9)); sync();
  marco.raw("way.reverted", { way: WAY, from: lb.ver, to: l1.ver }, day(11, 9)); sync();
  const f = runner.run(TICK(14)); sync();
  const r = frank.view(), F = fired(f.evs, "remind", "d1")[0];
  assert.deepEqual([taken(r, F.id), isSpine(r, F.id), r.p.ver, r.copies], [true, true, l1.ver, 1]);
});

test("s11 T5: a promote that reaches a Sol before the want it builds on is taken once the want comes (a fold is from scratch)", () => {
  const { w, marco, frank } = s11();
  const want = marco.press({ thing: "d1", move: "want" }, day(2, 9)).evs.map((e) => e.id);
  frank.sync(want);
  assert.equal(frank.press({ thing: "d1", move: "promote" }, day(3, 9), SOLID).d.ok, true);
  const isaac = new Sol(w, ISAAC).sync(w.all.filter((e) => !want.includes(e.id)).map((e) => e.id));
  assert.equal(stateOf(isaac.view(), "d1"), "on_switch", "without the want: not official");
  isaac.sync();
  assert.equal(stateOf(isaac.view(), "d1"), "official");
});

test("s13: a press dated a few minutes ahead of the runner's clock (inside the bound) does not cost the firing that saw it", () => {
  const { marco, frank, runner, sync } = setup();
  const want = marco.press({ thing: "d1", move: "want" }, TICK(14) + 3 * 60_000); sync();   // pressed 09:28, his clock says 09:33
  const now = TICK(14) + 60_000;
  const f = runner.run(now), F = fired(f.evs, "remind", "d1")[0];
  assert.ok(F);
  assert.ok(F.base?.includes(want.evs.at(-1)!.id), "the firing names the want");
  sync();
  const r = frank.view();
  assert.deepEqual([taken(r, F.id), isSpine(r, F.id)], [true, true]);
  assert.deepEqual([seatOf(r, want.evs[0].id)?.as, seatOf(r, want.evs[0].id)?.at, stateOf(r, "d1")], ["seen", now, "wanted"], "the want is judged at the firing's time, not after it");
  assert.equal(r.p.skipped.filter((s) => s.kind !== "way.refused").length, 0);
});

test("s14: several events of one writer with one time keep the order they were written in, whatever their ids", () => {
  for (let i = 0; i < 30; i++) {
    const shift = i * 1000;
    const w = new World(), l = w.add(raw());
    const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
    start(w, l, day(-1, 12) + shift, all);
    const make = marco.press(MAKE("d1", "one", "s1"), day(0, 9) + shift).evs;
    all.forEach((s) => s.sync());
    assert.ok(new Set(make.map((e) => e.at)).size === 1 && make.length >= 4, "a make is several events with one time");
    assert.notDeepEqual(make.map((e) => e.id), [...make.map((e) => e.id)].sort(), "ids are not in written order");
    const f = runner.run(TICK(21) + shift).evs; all.forEach((s) => s.sync());
    for (const evs of [w.all, [...w.all].reverse(), [...w.all].sort((a, b) => (a.id < b.id ? -1 : 1))]) {
      const r = w.fold(evs);
      assert.deepEqual([r.p.things.d1.fields.switch, r.p.things.d1.fields.title, r.p.things.d1.state], ["s1", "one", "to_remove"], `shift ${shift}`);
      assert.equal(taken(r, fired(f, "expire", "d1")[0].id), true);
    }
  }
});

// ---- round 2 (s15 to s23)

/** s15: Marco's machine `mbp` is no runner of any version in force. Marco drops d1 (Frank has not seen it) a minute
 *  before Frank promotes it; a receipt from `mbp` names the promote, to put it before the drop */
function fakeRunner(fake: "none" | "own" | "real" | "many") {
  const { w, l, marco, frank, runner, sync } = setup();
  const ff = raw(); ff.prev = l.ver; ff.runner = "mbp@marco"; const lf = w.add(ff);   // a file anyone can write; never applied
  const mbp = new Sol(w, "machine:mbp@marco");
  marco.press({ thing: "d1", move: "want" }, day(1, 9)); sync();
  runner.seal(day(1, 10)); sync();
  marco.press({ thing: "d1", move: "drop" }, day(2, 10));
  const promote = frank.press({ thing: "d1", move: "promote" }, day(2, 10, 1), SOLID).evs.at(-1)!;
  const fakes: string[] = [];
  if (fake === "own" || fake === "real") fakes.push(mbp.raw("way.seen", { way: WAY, ver: fake === "own" ? lf.ver : l.ver }, day(2, 10) + 30_000, { base: [promote.id] }).id);
  if (fake === "many") for (let i = 0; i < 300; i++) fakes.push(mbp.raw("way.seen", { way: WAY, ver: l.ver }, day(2, 10) + 30_000 + i, { base: [promote.id] }).id);
  sync();
  return { r: w.full(), fakes, promote };
}

test("s15: a fake runner (its own never-applied version; the real version; 300 receipts) orders nothing and adds no copy", () => {
  const none = fakeRunner("none");
  assert.equal(stateOf(none.r, "d1"), "to_remove", "the drop is dated first: it stands");
  assert.deepEqual(whyOf(none.r, none.promote.id), ["wrong_state"]);
  for (const kind of ["own", "real", "many"] as const) {
    const a = fakeRunner(kind);
    assert.equal(JSON.stringify(a.r.p.things), JSON.stringify(none.r.p.things), `${kind}: the same things as with no fake`);
    for (const id of a.fakes) assert.deepEqual(whyOf(a.r, id), ["not_spine"], kind);
    assert.equal(a.fakes.some((id) => a.r.spine.includes(id)), false);
    assert.equal(a.r.copies, none.r.copies, `${kind}: no copy of the projection is made for it`);
    assert.deepEqual(whyOf(a.r, a.promote.id), ["wrong_state"], "the promote is not moved before the drop");
  }
});

test("s15 (d), cost (a second key under the runner's machine name): its firing is a spine event too, and is passed over as fired twice", () => {
  const w = new World(), l = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER, "nucbox-key-1"), twin = new Sol(w, RUNNER, "laptop-key-named-nucbox");
  const all = [marco, frank, runner, twin];
  start(w, l, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); all.forEach((s) => s.sync());
  const a = fired(runner.run(TICK(14)).evs, "remind", "d1")[0];
  const b = fired(twin.run(TICK(14) + 60_000).evs, "remind", "d1")[0];   // the twin has not seen the first
  all.forEach((s) => s.sync());
  const r = frank.view();
  assert.ok(a && b);
  assert.deepEqual([taken(r, a.id), isSpine(r, a.id)], [true, true]);
  assert.deepEqual([isSpine(r, b.id), whyOf(r, b.id)], [true, ["fired_twice"]], "only the runner's own person can sign one: accepted (4b: such a Sol does not run)");
  assert.equal(r.p.things.d1.fired.remind, TICK(14));
});

test("s16 (1): a far-future event waits, moves nothing, and comes in when the runner's clock reaches it", () => {
  const { marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const make = marco.press(MAKE("d9", "nine", "s9"), day(400, 9)).evs; sync();   // his clock is a year ahead
  const s = runner.seal(day(1, 10)); sync();
  assert.equal(s.evs[0].base, undefined, "the runner does not name it");
  const soon = frank.view(day(1, 10));
  assert.deepEqual(soon.pending, make.map((e) => e.id), "listed, not folded");
  assert.equal(soon.p.things.d9, undefined);
  assert.equal(soon.last, day(1, 10), "the way's clock did not move");
  const then = frank.view(day(400, 9));
  assert.deepEqual([stateOf(then, "d9"), seatOf(then, make[0].id)?.as, then.pending], ["on_switch", "tail", []]);
  runner.seal(day(400, 10)); sync();
  const r = frank.view(day(400, 10));
  assert.deepEqual([stateOf(r, "d9"), seatOf(r, make[0].id)?.as, seatOf(r, make[0].id)?.at, r.p.things.d9.born], ["on_switch", "seen", day(400, 9), day(400, 9)]);
});

test("s16 (2): a ladder of future-dated events moves no one's clock", () => {
  const { w, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const rungs = [1, 2, 3, 4, 5].map((i) => marco.press(MAKE(`L${i}`), day(1, 10) + i * 9 * 60_000).evs);   // each nine minutes past the last
  sync();
  const s1 = runner.seal(day(1, 10, 1)); sync();
  assert.deepEqual(s1.evs[0].base, [rungs[0].at(-1)!.id], "inside the bound: the first rung only");
  const phone = new Sol(w, MARCO, "marco-phone").sync();
  const want = phone.press({ thing: "d1", move: "want" }, day(1, 10, 5)).evs; sync();
  const s2 = runner.seal(day(1, 10, 6)); sync();
  assert.deepEqual(s2.evs[0].base, [want.at(-1)!.id], "the second rung is still too far: the ladder pulled nothing forward");
  const at = frank.view(day(1, 10, 6));
  assert.deepEqual(at.pending, rungs.slice(1).flat().map((e) => e.id), "rungs two to five wait");
  assert.deepEqual([at.last, stateOf(at, "d1"), seatOf(at, want[0].id)?.at, at.p.things.L1.born], [day(1, 10, 6), "wanted", day(1, 10, 5), day(1, 10, 1)], "an honest press is judged at its own time; the rung at the receipt's");
  const r = frank.view();
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => stateOf(r, `L${i}`)), Array(5).fill("on_switch"), "nothing is lost");
  assert.deepEqual([isSpine(r, s2.evs[0].id), r.last], [true, day(1, 10, 6)]);
});

test("s16 (3): a slow runner clock and a fast person clock lose nothing", () => {
  const { marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 10)).evs; sync();
  const s = runner.seal(day(1, 9, 46)); sync();   // the runner's clock is fourteen minutes behind his
  assert.equal(s.evs[0].base, undefined);
  assert.deepEqual(frank.view(day(1, 9, 46)).pending, want.map((e) => e.id), "at the runner's clock it waits");
  const r = frank.view(day(1, 10));
  assert.deepEqual([stateOf(r, "d1"), seatOf(r, want[0].id)?.as, taken(r, want[0].id)], ["wanted", "tail", true]);
  runner.seal(day(1, 10, 30)); sync();
  const r2 = frank.view();
  assert.deepEqual([stateOf(r2, "d1"), seatOf(r2, want[0].id)?.as, seatOf(r2, want[0].id)?.at], ["wanted", "seen", day(1, 10)]);
});

test("s16 (4): a receipt that names an event dated long after itself is not a spine event (before_its_base)", () => {
  const { l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  marco.press({ thing: "d1", move: "want" }, day(1, 9)); sync();
  runner.seal(day(1, 9, 30)); sync();
  const promote = frank.press({ thing: "d1", move: "promote" }, day(5, 9), SOLID).evs.at(-1)!; sync();
  const forged = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 9, 30) + 1, { base: [promote.id] }); sync();   // dated back to day 1
  const r = frank.view();
  assert.deepEqual([whyOf(r, forged.id), isSpine(r, forged.id)], [["before_its_base"], false]);
  assert.deepEqual([stateOf(r, "d1"), taken(r, promote.id), seatOf(r, promote.id)?.at], ["official", true, day(5, 9)], "the promote is judged at its own time");
});

/** s17: v1 (runner the NucBox) and v2 (runner the Mini, 22 days). The NucBox is cut off on day 20; the team changes
 *  the runner at noon; the NucBox, still running, writes its 09:31 firings afterwards */
function staleRunner(variant: "cost" | "names_later" | "twin") {
  const w = new World(), l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.runner = "mini@marco"; f2.rules.expired.any[0].all[0].older = "22d"; const l2 = w.add(f2);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), nuc = new Sol(w, RUNNER), mini = new Sol(w, MINI);
  const all = [marco, frank, nuc, mini], others = [marco, frank, mini];
  const near = () => others.forEach((s) => s.sync());
  start(w, l1, day(-2, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(-1, 9)); marco.press(MAKE("d2", "two", "s2"), day(5, 9)); marco.press({ thing: "d2", move: "want" }, day(6, 9));
  all.forEach((s) => s.sync());
  nuc.run(TICK(14)); all.forEach((s) => s.sync());
  const nucHeld = new Set(nuc.holds);   // the NucBox is cut off from here
  marco.raw("way.agreed", { way: WAY, to: l2.ver, role: "explorer" }, day(20, 10)); near();
  frank.raw("way.agreed", { way: WAY, to: l2.ver, role: "keeper" }, day(20, 10, 1)); near();
  frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(20, 12)); near();
  let out: Ev[] = [], promote: Ev | undefined;
  if (variant === "twin") {
    out = nuc.run(TICK(21)).evs; all.forEach((s) => s.sync());
    mini.run(TICK(21) + 20_000); all.forEach((s) => s.sync());
  } else {
    assert.equal(mini.seal(day(20, 12, 10)).t.ok, true, "the Mini is the runner where it stands"); near();
    promote = frank.press({ thing: "d2", move: "promote" }, day(29, 9), SOLID).evs.at(-1)!; near();
    const d = due(l1, nuc.view(day(20, 9, 31), { holds: nucHeld }).p, day(20, 9, 31), ME);
    out = nuc.write(d.drafts, { holds: nucHeld, ...(variant === "names_later" ? { base: [promote.id] } : {}) });
    all.forEach((s) => s.sync());
  }
  return { w, l2, r: frank.view(), out, promote };
}

test("s17 (1), cost (changing the runner): an old runner's firing the new runner had not seen still counts", () => {
  const { w, l2, r, out, promote } = staleRunner("cost");
  const F = fired(out, "expire", "d1")[0];
  assert.ok(F, "the cut-off NucBox expires d1 under v1 (21 days)");
  assert.deepEqual([isSpine(r, F.id), taken(r, F.id)], [true, true], "dated before the change, naming nothing: a spine event");
  assert.deepEqual([stateOf(r, "d1"), stateOf(r, "d2"), r.p.ver], ["to_remove", "official", l2.ver], "the change of runner and the promote stand too");
  assert.equal(taken(r, promote!.id), true);
  assert.equal(canon(r), canon(w.full()));
});

test("s17 (2): an old runner's firing that names a later press orders nothing; the change of runner and the promote both stand", () => {
  const { l2, r, out, promote } = staleRunner("names_later");
  for (const e of out) assert.deepEqual(whyOf(r, e.id), ["before_its_base"], `${e.kind}: the first names the promote, the rest inherit it`);
  assert.deepEqual([stateOf(r, "d1"), stateOf(r, "d2"), r.p.ver], ["on_switch", "official", l2.ver]);
  assert.equal(taken(r, promote!.id), true);
});

test("s17 (3): the honest twin: the old runner fires on day 21 cut off, the new runner takes over after it", () => {
  const { l2, r, out } = staleRunner("twin");
  assert.equal(taken(r, fired(out, "expire", "d1")[0].id), true);
  assert.deepEqual([stateOf(r, "d1"), stateOf(r, "d2"), r.p.ver], ["to_remove", "wanted", l2.ver]);
  assert.equal(r.spine.length >= 4, true, "the Mini's own event is a spine event after the NucBox's");
});

test("s18: a Sol that lacks one event the runner saw shows the runner's event waiting, and no end state the full set lacks", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const note = new Sol(w, ISAAC).raw("way.proposed", { way: WAY, from: l.ver, slots: ["rules"] }, day(20, 8));
  runner.sync([note.id]);
  const f = runner.run(TICK(21));
  assert.ok(f.evs[0].base?.includes(note.id), "the first firing names the proposal");
  const butNote = () => w.all.filter((e) => e.id !== note.id).map((e) => e.id);
  marco.sync(butNote()); frank.sync(butNote());
  const old = new Set([...marco.holds].filter((id) => w.byId.get(id)!.at < day(20, 12)));
  const x = marco.press({ thing: "d1", move: "extend" }, day(20, 10), {}, { holds: old });
  assert.equal(x.d.ok, true);
  frank.sync(butNote());
  const part = frank.view();
  assert.deepEqual([stateOf(part, "d1"), part.p.things.d1.fields.extended], ["on_switch", true], "without the proposal: the runner's day-21 events wait, the extend is in the open tail");
  assert.deepEqual(part.waiting.map((x) => x.id), f.evs.map((e) => e.id), "every one of them listed");
  assert.deepEqual(part.waiting.map((x) => x.missing), f.evs.map((e) => (e === f.evs[0] ? [note.id] : [])), "the one that names it says what it lacks; the rest wait behind it");
  frank.sync();
  const full = frank.view();
  assert.deepEqual([stateOf(full, "d1"), full.p.things.d1.fields.extended, full.waiting], ["to_remove", undefined, []], "with it: the state every other Sol has");
});

test("s19 (1), cost (a Sol that lacks one event the runner saw): it stays on its last good spine event, visibly, and allows what the others refuse", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  marco.press(MAKE("d2", "two", "s2"), day(1, 9)); sync();
  const good = runner.seal(day(1, 10)).evs[0]; sync();
  const lost = new Sol(w, ISAAC).raw("way.proposed", { way: WAY, from: l.ver, slots: ["rules"] }, day(2, 8));
  runner.sync([lost.id]);
  const butLost = () => w.all.filter((e) => e.id !== lost.id).map((e) => e.id);
  const ran: string[] = [];
  for (let d = 3; d <= 40; d++) {
    marco.sync(butLost()); frank.sync(butLost()); runner.sync();
    ran.push(...runner.run(TICK(d)).evs.map((e) => e.id), ...runner.seal(TICK(d) + 3_600_000).evs.map((e) => e.id));
  }
  marco.sync(butLost());
  const want = marco.press({ thing: "d2", move: "want" }, day(23, 9));   // his Sol still shows d2 on its switch
  assert.equal(want.d.ok, true, "the Sol without the proposal allows it");
  frank.sync(butLost());
  const part = frank.view();
  assert.deepEqual([part.last, part.spine.at(-1)], [day(1, 10), good.id], "its last good spine event");
  assert.deepEqual(part.waiting.map((x) => x.id).sort(), [...ran].sort(), "every later event of the runner waits");
  assert.deepEqual(part.waiting.filter((x) => x.missing.length), [{ id: ran[0], missing: [lost.id] }], "the one that names it says what it lacks, once: the rest wait behind it");
  assert.deepEqual([stateOf(part, "d1"), stateOf(part, "d2")], ["on_switch", "wanted"]);
  const full = w.full();
  assert.deepEqual([stateOf(full, "d1"), stateOf(full, "d2"), full.waiting], ["to_remove", "to_remove", []]);
  assert.deepEqual(whyOf(full, want.evs.at(-1)!.id), ["wrong_state"]);
});

test("s19 (2): 300 keys of one member cost one page and one frontier in one turn, none is left unnamed, and the expiry takes effect", () => {
  const { w, l, frank, runner, sync } = setup();
  for (let i = 0; i < 300; i++) new Sol(w, MARCO, `marco-box-${i}`).raw("way.proposed", { way: WAY, from: l.ver, slots: ["rules"] }, day(1, 9) + i);
  sync();
  const t = runner.turn(TICK(14));
  assert.deepEqual([t.pages.map((ids) => ids.length), t.frontier.length, new Set([...t.pages.flat(), ...t.frontier]).size], [[256], 46, 302], "302 keys (two of them not the boxes'), each named once: 256 on a page, the rest on the frontier");
  const a = runner.run(TICK(14)).evs, b = runner.run(TICK(21)).evs; sync();
  assert.deepEqual(a.slice(0, 2).map((e) => [e.kind, e.value?.more, e.base]), [["way.seen", true, t.pages[0]], ["way.fired", undefined, t.frontier]], "the page first, then the turn's first firing with the rest");
  assert.deepEqual([...a.slice(2), ...b].map((e) => e.base), [...a.slice(2), ...b].map(() => undefined), "nothing else of that turn, and nothing of the next, names anything: nothing is new");
  const r = frank.view();
  assert.equal(stateOf(r, "d1"), "to_remove");
  assert.equal(r.p.skipped.filter((s) => s.kind !== "way.refused").length, 0, "nothing set aside: no bad_frontier");
  assert.equal(r.seq.filter((s) => s.as === "seen" && s.e.kind === "way.proposed").length, 300);
  assert.deepEqual([isSpine(r, a[0].id), seatOf(r, a[0].id), whyOf(r, a[0].id), isSpine(r, a[1].id)], [false, undefined, [], true], "the page is no spine event and has no seat: it only carries names for the firing after it");
});

test("s19 (3): one id that never arrives: that receipt and every later candidate of that key wait, and the engine's own turn stops", () => {
  const { l, frank, runner, sync } = setup();
  const receipt = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 9), { base: ["e9999"] });
  const t = runner.turn(TICK(21));
  assert.deepEqual([t.ok, t.why, t.frontier], [false, "waiting", []]);
  assert.deepEqual(runner.run(TICK(21)).evs, [], "the engine's turn writes nothing");
  const out = runner.write(due(l, runner.view(TICK(21)).p, TICK(21), ME).drafts);   // a runner that writes anyway
  sync();
  const r = frank.view();
  assert.equal(fired(out, "expire", "d1").length, 1);
  assert.deepEqual(r.waiting, [receipt, ...out].map((e) => ({ id: e.id, missing: e === receipt ? ["e9999"] : [] })));
  assert.deepEqual([stateOf(r, "d1"), r.spine], ["on_switch", []], "visible, never a silent different state");
});

test("s20 (1), (2): nothing gets between a firing and the move it made; a person's press on the runner's own machine is an ordinary event: it is not pulled back into an earlier firing's batch", () => {
  const { marco, frank, runner, sync } = setup();
  marco.press(MAKE("d2", "two", "s2"), day(0, 10)); sync();
  runner.seal(day(0, 11)); sync();
  runner.run(TICK(14)); sync();   // reminds d1 and d2
  marco.press({ thing: "d1", move: "want" }, day(14, 11)); sync();
  const pr = runner.press({ thing: "d1", move: "promote" }, day(14, 15), SOLID, { by: FRANK });   // Frank, on the NucBox: its key signs
  assert.equal(pr.d.ok, true);
  const mv = pr.evs.at(-1)!;
  assert.deepEqual([mv.kind, mv.by, mv.key], ["way.move", FRANK, runner.key]);
  runner.seal(day(14, 15, 10)); sync();
  runner.run(TICK(21)); sync();
  const r = frank.view();
  assert.deepEqual([stateOf(r, "d1"), taken(r, mv.id), seatOf(r, mv.id)?.as, seatOf(r, mv.id)?.at], ["official", true, "seen", day(14, 15)], "after Marco's want, at its own time");
  assert.equal(stateOf(r, "d2"), "to_remove");
  const seats = r.seq.map((s) => s.e), made = r.seq.filter((s) => s.taken && s.e.kind === "way.fired").map((s) => s.e).map((F) => [F, seats.find((e) => e.kind === "way.move" && e.value?.because === F.id)] as const).filter(([, m]) => m);
  assert.ok(made.length >= 1, "at least the day-21 expiry of d2 made a move");
  for (const [F, m] of made) assert.equal(seats.indexOf(m!), seats.indexOf(F) + 1, `the move ${F.value?.trigger} made stands right after its firing`);
});

/** the answer of the act a trigger's move made run, written by the runner later */
const answer = (runner: Sol, l: { ver: string; way: { seams: Record<string, { pv: number; pkg: string }> } | null }, move: WayEvent, at: number, ok: boolean) =>
  runner.write([{ kind: "way.acted", item: "d1", at, value: { way: WAY, ver: l.ver, thing: "d1", seam: "switch.off", pv: l.way!.seams["switch.off"].pv, pkg: l.way!.seams["switch.off"].pkg, ok, because: move.id } }])[0];

test("s20 (3): an act's answer written right after its firing's move is in the firing's batch", () => {
  const { l, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const f = runner.run(TICK(21));
  assert.deepEqual(f.d.acts.map((a) => [a.seam, a.thing]), [["switch.off", "d1"]], "the drop makes the switch go off");
  const drop = f.evs.find((e) => e.kind === "way.move")!;
  const late = answer(runner, l, drop, TICK(21) + 15 * 60_000, false); sync();
  runner.seal(TICK(21) + 20 * 60_000); sync();
  const r = frank.view();
  assert.deepEqual([seatOf(r, late.id)?.as, seatOf(r, late.id)?.at, taken(r, late.id)], ["batch", TICK(21), true]);
  assert.deepEqual(r.p.things.d1.red, ["switch.off"], "it failed: red");
});

test("a press on the runner's own machine between a firing and an act's late answer keeps its place (the batch is a run with no gap)", () => {
  const { l, marco, frank, runner, sync } = setup();
  marco.press(MAKE("d2", "two", "s2"), day(10, 9)); sync();
  runner.seal(day(10, 10)); sync();
  const f = runner.run(TICK(21)); sync();
  const F = fired(f.evs, "expire", "d1")[0], drop = f.evs.find((e) => e.kind === "way.move")!;
  marco.press({ thing: "d2", move: "want" }, TICK(21) + 5 * 60_000); sync();
  const pr = runner.press({ thing: "d2", move: "promote" }, TICK(21) + 10 * 60_000, SOLID, { by: FRANK });
  assert.equal(pr.d.ok, true);
  const late = answer(runner, l, drop, TICK(21) + 15 * 60_000, false);   // comes after the press: not in the run
  runner.seal(TICK(21) + 20 * 60_000); sync();
  const r = frank.view(), mv = pr.evs.at(-1)!;
  assert.deepEqual(r.seq.filter((s) => s.as === "batch").map((s) => s.e.id), [drop.id], "the firing's batch is the drop alone");
  assert.equal(r.seq.findIndex((s) => s.e.id === drop.id), r.seq.findIndex((s) => s.e.id === F.id) + 1);
  assert.deepEqual([stateOf(r, "d2"), seatOf(r, mv.id)?.as, seatOf(r, mv.id)?.at, taken(r, mv.id)], ["official", "seen", TICK(21) + 10 * 60_000, true], "the promote stays after Marco's want");
  assert.deepEqual([seatOf(r, late.id)?.as, seatOf(r, late.id)?.at, taken(r, late.id)], ["seen", TICK(21) + 15 * 60_000, true], "the late answer is an ordinary event, still taken");
  assert.deepEqual(r.p.things.d1.red, ["switch.off"]);
  assert.ok(r.seq.findIndex((s) => s.e.id === mv.id) < r.seq.findIndex((s) => s.e.id === late.id), "in the order they were written");
});

test("s21 (1): a press dated just past the bound is not named, waits, and is named by the next receipt", () => {
  const { marco, frank, runner, sync } = setup(raw(), { d1: day(0, 9, 11) });
  runner.seal(day(0, 9, 30)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 10, 11)).evs; sync();
  const s = runner.seal(day(1, 10) + 30_000); sync();   // 10:00:30: the press is 10 minutes 30 seconds ahead
  assert.equal(s.evs[0].base, undefined);
  assert.deepEqual(frank.view(day(1, 10) + 30_000).pending, want.map((e) => e.id));
  assert.deepEqual([stateOf(frank.view(), "d1"), seatOf(frank.view(), want[0].id)?.as], ["wanted", "tail"]);
  const s2 = runner.seal(day(1, 10, 5)); sync();
  assert.deepEqual(s2.evs[0].base, [want.at(-1)!.id]);
  const r = frank.view();
  assert.deepEqual([stateOf(r, "d1"), seatOf(r, want[0].id)?.as, seatOf(r, want[0].id)?.at], ["wanted", "seen", day(1, 10, 5)], "judged at the receipt's time: not after it");
});

/** s21 (2): an apply reaches the runner between its turn's snapshot and its write */
function applyDuringTurn(honest: boolean) {
  const { w, l, marco, frank, runner, sync } = setup();
  const fb = raw(); fb.prev = l.ver; fb.rules.expired.any[1].older = "50d"; const lb = w.add(fb);
  runner.seal(day(0, 10)); sync();
  const t = runner.turn(TICK(21)), d = due(l, t.p, TICK(21), ME);
  const ap = marco.raw("way.applied", { way: WAY, from: l.ver, to: lb.ver, reader: 1 }, TICK(21) - 10_000);
  runner.sync([ap.id]);
  const out = honest ? runner.write(sealed(t, d.drafts, l.way!, TICK(21))) : runner.write(d.drafts, { base: [...t.frontier, ap.id] });
  sync();
  return { r: frank.view(), lb, F: fired(out, "expire", "d1")[0], ap };
}

test("s21 (2): the frontier and the projection come from one snapshot: an apply that arrives during the turn does not void the firing", () => {
  const a = applyDuringTurn(true);
  assert.deepEqual([isSpine(a.r, a.F.id), taken(a.r, a.F.id), stateOf(a.r, "d1"), a.r.p.ver], [true, true, "to_remove", a.lb.ver], "judged on what it had seen; the apply comes in after it");
  assert.deepEqual([seatOf(a.r, a.ap.id)?.as, seatOf(a.r, a.ap.id)?.at], ["tail", TICK(21)]);
  const b = applyDuringTurn(false);   // the frontier taken from a later look than the projection
  assert.deepEqual([whyOf(b.r, b.F.id), stateOf(b.r, "d1"), b.r.p.ver], [["not_spine"], "on_switch", b.lb.ver], "a firing that says it saw the apply was judged under the wrong version");
});

/** s22: Frank applies v2 (a rule change); Marco, who has it, agrees to X (Frank joins the explorers); the agreement
 *  reaches the runner before the apply it was given on */
function agreementFirst(honest: boolean) {
  const w = new World(), l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.rules.expired.any[1].older = "50d"; const l2 = w.add(f2);
  const fx = raw(); fx.prev = l2.ver; fx.rules.expired.any[1].older = "50d"; fx.roles.explorer.who = ["person:marco", "person:frank"]; const lx = w.add(fx);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
  const sync = () => all.forEach((s) => s.sync());
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); sync();
  runner.seal(day(0, 10)); sync();
  const ap = frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(1, 10));
  marco.sync([ap.id]);
  const ag = marco.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(1, 10, 6));
  assert.deepEqual(ag.base, [ap.id]);
  runner.sync([ag.id]);   // the agreement arrives first
  const first = honest ? runner.seal(day(1, 10, 8)).evs[0] : runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(1, 10, 8), { base: [ag.id] });
  sync();
  runner.seal(day(1, 10, 20)); sync();
  frank.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(1, 11));
  const apx = frank.raw("way.applied", { way: WAY, from: l2.ver, to: lx.ver, reader: 1 }, day(1, 11, 1)); sync();
  runner.seal(day(1, 11, 10)); sync();
  return { r: frank.view(), first, ag, apx, l2, lx };
}

test("s22, cost (an agreement that outruns its apply): one that reaches the runner before the apply it was given on is named, folded before that apply, and spent: it is pressed again", () => {
  for (const honest of [true, false]) {   // the engine's own turn, and a receipt written by hand: the same
    const a = agreementFirst(honest);
    assert.deepEqual(a.first.base, [a.ag.id], "the turn's stop is a time and nothing else: what the event's own base names does not hold it back");
    assert.deepEqual([whyOf(a.r, a.ag.id), whyOf(a.r, a.apx.id), a.r.p.ver], [["stale_agreement"], ["not_agreed"], a.l2.ver], "named before its apply, it is folded before it and counts for nothing");
  }
});

/** s23: d1 is 20 days old; the runner's last event on day 20 is at 18:00. Marco, at 09:00 on day 21, signs an extend
 *  dated 23:59 the night before */
function quietNight(midnight: boolean) {
  const { l, marco, frank, runner, sync } = setup();
  runner.run(TICK(14)); sync();
  marco.press(MAKE("d2", "two", "s2"), day(20, 17)); sync();
  assert.equal(runner.run(day(20, 18)).evs.length, 1, "something new: a receipt"); sync();
  const night = midnight ? runner.run(day(21, 0)).evs : [];   // nothing new: only the midnight makes it write
  sync();
  assert.equal(decide(l, marco.view(day(21, 9)).p, { asker: MARCO, thing: "d1", move: "extend" }, day(21, 9)).ok, false, "pressed honestly at 09:00 it is refused: expired");
  const x = marco.press({ thing: "d1", move: "extend" }, day(20, 23, 59)); sync();
  assert.equal(x.d.ok, true, "dated back to 23:59 his own Sol allows it");
  const f = runner.run(TICK(21)); sync();
  return { r: frank.view(), night, mv: x.evs.at(-1)!, f };
}

test("quiet night: a backdated extend at 09:00 dated 23:59 is refused once the midnight receipt is there", () => {
  const { r, night, mv, f } = quietNight(true);
  assert.deepEqual([night.length, night[0].kind, night[0].base], [1, "way.seen", undefined], "the first turn after midnight writes a receipt, new events or not");
  assert.deepEqual([seatOf(r, mv.id)?.at, whyOf(r, mv.id)], [day(21, 0), ["rule_failed"]], "judged at midnight: 21 days old");
  assert.equal(fired(f.evs, "expire", "d1").length, 1);
  assert.deepEqual([stateOf(r, "d1"), r.p.things.d1.fields.extended], ["to_remove", undefined]);
});

test("quiet night, cost (the open tail): with the runner off over midnight the extend dated 23:59 is taken", () => {
  const { r, mv, f } = quietNight(false);
  assert.deepEqual([seatOf(r, mv.id)?.at, taken(r, mv.id)], [day(20, 23, 59), true], "back to the runner's last event and no further: here that is the evening before");
  assert.equal(fired(f.evs, "expire", "d1").length, 0);
  assert.deepEqual([stateOf(r, "d1"), r.p.things.d1.fields.extended], ["on_switch", true]);
});

test("sealDue alone: no spine yet, a midnight of the way's zone, an hour with hour ages, neither", () => {
  const { w, l } = setup();
  const way = l.way!;
  const fh = raw(); fh.prev = l.ver; fh.rules.expired.any[1].older = "1000h"; const hourly = w.add(fh).way!;
  assert.equal(sealDue(way, undefined, day(0, 10)), true, "no spine yet: the first turn seals the start");
  assert.equal(sealDue(way, day(5, 9), day(5, 23, 59)), false, "the same day");
  assert.equal(sealDue(way, day(20, 23, 59), day(21, 0)), true, "past a midnight of New York");
  assert.equal(sealDue(way, day(5, 18, 59), day(5, 19, 1)), false, "midnight UTC is not the zone's; a new hour means nothing to a way with day ages only");
  assert.equal(sealDue(hourly, day(5, 18, 59), day(5, 19, 1)), true, "an hour age: the first turn of each hour");
  assert.equal(sealDue(hourly, day(5, 18, 10), day(5, 18, 50)), false, "the same hour");
  assert.equal(sealDue(hourly, day(20, 23, 59), day(21, 0)), true);
  // sealed(): what a turn with nothing due writes
  const t = { p: empty(WAY), ver: l.ver, frontier: [] as string[], pages: [] as string[][], news: false, ok: true, last: day(5, 9) };
  assert.deepEqual(sealed(t, [], way, day(5, 10)), [], "nothing new, same day: nothing");
  assert.deepEqual(sealed(t, [], way, day(6, 0)).map((d) => [d.kind, d.base]), [["way.seen", undefined]]);
  assert.deepEqual(sealed({ ...t, frontier: ["a"], news: true }, [], way, day(5, 10)).map((d) => [d.kind, d.base]), [["way.seen", ["a"]]]);
  assert.deepEqual(sealed({ ...t, frontier: ["a"] }, [], way, day(5, 10)), [], "a frontier that names another key's spine event only: no receipt is owed for it");
  assert.deepEqual(sealed({ ...t, frontier: ["a"] }, [], way, day(6, 0)).map((d) => [d.kind, d.base]), [["way.seen", ["a"]]], "the receipt the midnight owes carries it");
  assert.deepEqual(sealed({ ...t, ok: false, why: "not_runner" }, [], way, day(6, 0)), [], "a turn that may not write writes nothing");
  assert.deepEqual(sealed({ ...t, frontier: ["c"], pages: [["a"], ["b"]] }, [], way, day(5, 10)), [], "pages of spine ends alone, same day: nothing is owed, so no page is written either");
  assert.deepEqual(sealed({ ...t, frontier: ["c"], pages: [["a"], ["b"]], news: true }, [], way, day(5, 10)).map((d) => [d.kind, d.value.more, d.base, d.at]),
    [["way.seen", true, ["a"], day(5, 10)], ["way.seen", true, ["b"], day(5, 10)], ["way.seen", undefined, ["c"], day(5, 10)]], "the pages in their order, then the receipt");
});

// ---- rule 8: who a later apply or a revert newly names

const TEAM = { frank: "owner", marco: "editor", isaac: "editor", gina: "guest" } as const;   // zoe is not in the project
/** a later version of the drafts way, agreed to by everyone it names (each for each role they hold in it), applied by
 *  Frank on day 2 and seen by the runner (when it is still the runner) */
function laterApply(change: (f: Record<string, any>) => void) {
  const { w, l, frank, runner, all, sync } = setup(raw(), { roles: { ...TEAM } });
  runner.seal(day(0, 10)); sync();
  const f = raw(); f.prev = l.ver; change(f);
  const lb = w.add(f), sols = new Map(all.map((s) => [s.by, s]));
  for (const [role, r] of Object.entries(lb.way!.roles)) for (const person of new Set(r.who.map(personOf))) {
    const s = sols.get(person) ?? sols.set(person, new Sol(w, person).sync()).get(person)!;
    s.raw("way.agreed", { way: WAY, to: lb.ver, role }, day(2, 9));
  }
  const ap = frank.sync().raw("way.applied", { way: WAY, from: l.ver, to: lb.ver, reader: 1 }, day(2, 10));
  sync(); runner.seal(day(2, 11)); sync();
  return { r: frank.view(), w, l, lb, ap };
}
const explorers = (...who: string[]) => (f: Record<string, any>) => { f.roles.explorer.who = who; };

test("rule 8: a later apply naming a guest, or someone not in the project, or a new runner whose person is a guest, is not_member", () => {
  const a = laterApply(explorers(MARCO, ISAAC));
  assert.deepEqual([a.r.p.ver, whyOf(a.r, a.ap.id)], [a.lb.ver, []], "a member who is not a guest: taken");
  for (const who of ["person:gina", "person:zoe", "agent:gina", "machine:laptop@zoe"]) {
    const b = laterApply(explorers(MARCO, who));
    assert.deepEqual([b.r.p.ver, whyOf(b.r, b.ap.id)], [b.l.ver, ["not_member"]], who);
    assert.ok(b.w.asked.some(([login, at]) => login === who.split(/[:@]/).at(-1) && at === day(2, 10)), "asked at the apply's judged time");
  }
  const c = laterApply((f) => { f.runner = "mini@gina"; });
  assert.deepEqual([c.r.p.ver, whyOf(c.r, c.ap.id)], [c.l.ver, ["not_member"]], "a new runner whose person is a guest");
  const d = laterApply((f) => { f.runner = "mini@zoe"; });
  assert.deepEqual([d.r.p.ver, whyOf(d.r, d.ap.id)], [d.l.ver, ["not_member"]], "or is not in the project");
  const e = laterApply((f) => { f.runner = "mini@marco"; });
  assert.deepEqual([e.r.p.ver, whyOf(e.r, e.ap.id)], [e.lb.ver, []], "a member's machine: taken");
  const g = laterApply((f) => { f.rules.expired.any[1].older = "50d"; });
  // (Frank 2026-11-12, A: the team's standing comes first, so the team is asked about who signed it and, round 14, who
  // agreed to it; about no one else)
  assert.deepEqual([g.r.p.ver, [...new Set(g.w.asked.filter(([, at]) => at >= day(2, 0)).map(([login]) => login))].sort()], [g.lb.ver, ["frank", "marco"]], "a change that names no one new asks the team about its signers only");
});

test("rule 8: a revert that puts back someone who is a guest by then is not_member; while they were a member it is taken", () => {
  const go = (revertDay: number) => {
    const roles = { ...TEAM, isaac: (at: number) => (at < day(5, 0) ? "editor" : "guest") as "editor" | "guest" };
    const { w, l, marco, frank, runner, sync } = setup(raw(), { roles });
    const isaac = new Sol(w, ISAAC).sync();
    const every = () => { sync(); isaac.sync(); };
    runner.seal(day(0, 10)); every();
    const fb = raw(); fb.prev = l.ver; explorers(MARCO, ISAAC)(fb); const lb = w.add(fb);
    const fc = raw(); fc.prev = lb.ver; const lc = w.add(fc);   // Isaac out again
    marco.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(2, 9)); isaac.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(2, 9)); every();
    marco.raw("way.applied", { way: WAY, from: l.ver, to: lb.ver, reader: 1 }, day(2, 10)); every();
    marco.raw("way.agreed", { way: WAY, to: lc.ver, role: "explorer" }, day(3, 9)); every();
    marco.raw("way.applied", { way: WAY, from: lb.ver, to: lc.ver, reader: 1 }, day(3, 10)); every();
    runner.seal(day(3, 11)); every();
    assert.equal(frank.view().p.ver, lc.ver);
    isaac.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(revertDay, 9)); every();
    const rv = marco.raw("way.reverted", { way: WAY, from: lc.ver, to: lb.ver }, day(revertDay, 10)); every();
    runner.seal(day(revertDay, 11)); every();
    const r = frank.view();
    return [r.p.ver === lb.ver ? "back" : r.p.ver === lc.ver ? "stays" : "?", whyOf(r, rv.id)];
  };
  assert.deepEqual(go(4), ["back", []]);
  assert.deepEqual(go(6), ["stays", ["not_member"]]);
});

// ---- review finding 1: who is named, and who may press, are judged at the time the order judges the event at

/** Gina is an editor of the project until day 5 and a guest from then. vB puts her among the explorers: Marco and she
 *  agree on day 4, Frank applies it at 10:00 on day 4. The runner's next spine event is on day 6 */
function namedThenOut(seenByNext: boolean) {
  const roles = { ...TEAM, gina: (at: number) => (at < day(5, 0) ? "editor" : "guest") as "editor" | "guest" };
  const { w, l, marco, frank, runner, sync } = setup(raw(), { roles });
  const gina = new Sol(w, "person:gina").sync();
  runner.seal(day(1, 10)); sync(); gina.sync();
  const f = raw(); f.prev = l.ver; explorers(MARCO, "person:gina")(f); const lb = w.add(f);
  marco.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(4, 9));
  gina.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(4, 9, 1));
  const ap = frank.sync().raw("way.applied", { way: WAY, from: l.ver, to: lb.ver, reader: 1 }, day(4, 10));
  if (seenByNext) runner.sync();
  const next = runner.seal(day(6, 10)).evs[0];   // the runner's next spine event, after Gina is out
  sync(); gina.sync();
  runner.seal(day(7, 10)); sync(); gina.sync();   // and one more: everything is seen by now
  return { w, r: frank.view(), l, lb, ap, next, gina, sync, runner, frank, marco };
}

test("review finding 1, cost (the open tail, for roles): a person taken out of the team can still be named by an apply signed before that until the runner's next spine event; one that arrives after it is judged at that event's time and is not_member", () => {
  const a = namedThenOut(true);
  assert.deepEqual([a.r.p.ver, whyOf(a.r, a.ap.id), seatOf(a.r, a.ap.id)?.as, seatOf(a.r, a.ap.id)?.at], [a.lb.ver, [], "seen", day(4, 10)], "seen by the next spine event: judged at its signed time, when she was a member");
  assert.ok(a.w.asked.some(([login, at]) => login === "gina" && at === day(4, 10)));
  assert.ok(!a.w.asked.some(([login, at]) => login === "gina" && at >= day(5, 0)), "and never asked about a later time: one check, at one time");
  const b = namedThenOut(false);
  assert.equal(isSpine(b.r, b.next.id), true);
  assert.deepEqual([b.r.p.ver, whyOf(b.r, b.ap.id), seatOf(b.r, b.ap.id)?.at], [b.l.ver, ["not_member"], day(6, 10)], "arriving after it: judged at the spine event's time, when she is a guest");
  assert.ok(b.w.asked.some(([login, at]) => login === "gina" && at === day(6, 10)));
  assert.ok(!b.w.asked.some(([login, at]) => login === "gina" && at < day(5, 0)), "her membership on the day it was signed is never read");
});

test("review finding 1, cost (the open tail, for roles): a press signed before an apply took its signer's role away is taken when the runner's next spine event had seen it; arriving after that event it stands after the apply and is passed over (old_version, as any press under the version before is, whoever signed it)", () => {
  const go = (seenByNext: boolean) => {
    const { w, l, marco, frank, runner, sync } = setup();
    const isaac = new Sol(w, ISAAC).sync();
    const every = () => { sync(); isaac.sync(); };
    runner.seal(day(0, 10)); every();
    const fb = raw(); fb.prev = l.ver; explorers(MARCO, ISAAC)(fb); const lb = w.add(fb);
    const fc = raw(); fc.prev = lb.ver; const lc = w.add(fc);   // Isaac out again
    marco.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(2, 9)); isaac.raw("way.agreed", { way: WAY, to: lb.ver, role: "explorer" }, day(2, 9)); every();
    marco.raw("way.applied", { way: WAY, from: l.ver, to: lb.ver, reader: 1 }, day(2, 10)); every();
    runner.seal(day(2, 11)); every();
    marco.raw("way.agreed", { way: WAY, to: lc.ver, role: "explorer" }, day(5, 9));
    marco.raw("way.applied", { way: WAY, from: lb.ver, to: lc.ver, reader: 1 }, day(5, 10)); sync();   // D: his role is gone (his Sol, offline, does not have it)
    const press = isaac.press({ thing: "d1", move: "want" }, day(4, 9));   // an explorer's press, signed while he is one
    assert.equal(press.d.ok, true);
    if (seenByNext) runner.sync();
    runner.seal(day(6, 10)); every();
    runner.seal(day(7, 10)); every();
    const r = frank.view(), mv = press.evs.at(-1)!;
    assert.equal(r.p.ver, lc.ver);
    return [stateOf(r, "d1"), seatOf(r, mv.id)?.at, whyOf(r, mv.id)];
  };
  assert.deepEqual(go(true), ["wanted", day(4, 9), []], "before the apply, where it was signed");
  assert.deepEqual(go(false), ["on_switch", day(6, 10), ["old_version"]], "after the apply: who may press is the version in force where the press stands, and that is no longer the one he pressed under");
});

test("the team's standing comes before the way's roles (Frank 2026-11-12, A; it was \"as built\": the way's roles only): a person who became a guest and is still named by the way no longer presses. Her Sol writes the press (it does not read the team), and every fold sets it aside, the team asked at the press's time", () => {
  const a = namedThenOut(true);
  a.gina.sync();
  const press = a.gina.press(MAKE("g1", "hers", "sg"), day(8, 9));
  a.sync(); a.runner.seal(day(8, 10)); a.sync();
  const r = a.frank.view();
  assert.deepEqual([press.d.ok, stateOf(r, "g1"), whyOf(r, press.evs[0].id)], [true, undefined, ["not_allowed"]]);
  assert.ok(a.w.asked.some(([login, at]) => login === "gina" && at >= day(8, 0)), "the team is asked about the press's signer");
});

test("round 14 (replay), pinned after mutating Frank's first rule: a replay reads a press's signer's standing at the press's own time, as the fold did: a guest's refused press is no one's press, under a version that would let it through too; a member who joined after the epoch keeps her press", () => {
  const a = namedThenOut(true);
  a.marco.sync().press({ thing: "d1", move: "extend" }, day(7, 12)); a.sync(); a.gina.sync();
  const g = a.gina.press({ thing: "d1", move: "extend" }, day(8, 9));
  a.sync(); a.runner.seal(day(8, 10)); a.sync();
  assert.deepEqual([g.d.ok, g.evs.map((e) => `${e.kind}:${e.value?.why}`), taken(a.frank.view(), g.evs[0].id)], [false, ["way.refused:rule_failed"], true], "her Sol writes the refusal, and the fold keeps it");
  const n = raw(); n.prev = a.lb.ver; explorers(MARCO, "person:gina")(n); n.rules.may_extend = { not: { rule: "expired" } };
  const N = a.w.add(n);
  assert.equal(replay(a.w.all, a.w.ways, a.lb, a.lb, a.w.book, { now: FAR }).differ, 0);
  assert.equal(replay(a.w.all, a.w.ways, a.lb, N, a.w.book, { now: FAR }).differ, 0, "extend let through again: still not hers, a guest's");
  const { w, l, marco, sync } = setup(raw(), { roles: { ...TEAM, marco: (at: number) => (at < day(-3, 0) ? null : "editor") } });
  marco.press({ thing: "d1", move: "want" }, day(1, 9)); sync();
  assert.equal(replay(w.all, w.ways, l, l, w.book, { now: FAR }).differ, 0, "Marco, in the project from three days before, presses as the explorer");
  // (grade14 m19, m02) a guest's move on a thing that is there is set aside too, not only a birth; a machine the way
  // names in a role presses for it while its person is a member, and not once they are a guest
  const want = a.gina.press({ thing: "d1", move: "want" }, day(8, 11)); a.sync();
  const v = a.frank.view();
  assert.deepEqual([want.evs.map((e) => e.kind), whyOf(v, want.evs[0].id), stateOf(v, "d1")], [["way.move"], ["not_allowed"], "on_switch"]);
  for (const [marcoIs, state] of [["editor", "wanted"], ["guest", "on_switch"]] as const) {
    const f = raw(); explorers(MARCO, MINI)(f);
    const s = setup(f, { roles: { ...TEAM, marco: (at: number) => (at < day(1, 0) ? "editor" : marcoIs) } });
    const mini = new Sol(s.w, MINI).sync();
    const m = mini.press({ thing: "d1", move: "want" }, day(1, 9)); s.sync();
    assert.deepEqual([m.evs.map((e) => e.kind), stateOf(s.frank.view(), "d1")], [["way.move"], state], `Marco's Mini, Marco ${marcoIs}`);
  }
});

// ---- review finding 2: a team's book is never folded without a clock

const spinePart = (r: ReturnType<World["full"]>) => JSON.stringify([r.seq.filter((s) => s.as !== "tail").map((s) => [s.e.id, s.at, s.taken, s.as]), r.spine, r.last, r.waiting, r.forked, r.unread]);

test("review finding 2: with no `now` (or one that is no time) nothing of the open tail is folded, every tail event is pending; the spine part is the same with and without it", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs; sync();
  const far = marco.press(MAKE("d9", "nine", "s9"), day(700, 9)).evs; sync();   // a press dated two years on
  const tail = [...want, ...far].map((e) => e.id);
  const at2 = w.full(day(2, 0));
  assert.deepEqual([at2.pending, stateOf(at2, "d1"), stateOf(at2, "d9"), seatOf(at2, want[0].id)?.as], [far.map((e) => e.id), "wanted", undefined, "tail"], "with a clock: as before");
  assert.equal(stateOf(w.full(day(700, 9)), "d9"), "on_switch", "and it comes in when the clock reaches it");
  for (const o of [{}, { now: undefined }, { now: NaN }, { now: Infinity }, { now: "2026" }, { now: null }]) {
    const r = place(WAY, w.all, w.ways, w.book, o as never);
    assert.deepEqual(r.pending, tail, JSON.stringify(o));
    assert.deepEqual([r.seq.filter((s) => s.as === "tail").length, stateOf(r, "d1"), stateOf(r, "d9"), taken(r, want[0].id), taken(r, far[0].id)], [0, "on_switch", undefined, false, false], "the far-dated press is not taken as if its time had come, nor is anything else of the tail");
    for (const id of tail) assert.deepEqual(whyOf(r, id), ["pending"]);
    assert.equal(spinePart(r), spinePart(at2), "what the spine placed does not depend on the clock");
    assert.equal(spinePart(r), spinePart(w.full(FAR)));
    assert.deepEqual(fold(WAY, w.all, w.ways, w.book, o as never), r.p, "fold() is place().p");
    const rp = replay(w.all, w.ways, l, l, w.book, o as never);
    assert.deepEqual(rp.things.map((t) => t.thing), ["d1"], "and a replay reads the same history: no d9");
  }
  const t = runner.turn(NaN);
  assert.deepEqual([t.ok, t.why, t.frontier, stateOf({ p: t.p } as never, "d1"), t.p.things.d9], [false, "no_time", [], "on_switch", undefined], "a turn with no time writes nothing and shows no tail");
  assert.deepEqual([runner.turn(day(2, 0)).ok, runner.turn(day(2, 0)).frontier], [true, [want.at(-1)!.id]], "with a time, as before: the far press is not named");
});

// ---- review finding 3: one chain a key (a guard, not the answer: the door owns it)

test("review finding 3 (a guard, not the answer): a key holding two events at one place is set aside from there on: neither branch counts, the other branch is not placed before the spine event, what it wrote before stands, the key is listed, whatever order the events come in", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const old = marco.view(day(0, 12)).p;
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs; sync();
  assert.equal(want.length, 1);
  const R1 = runner.seal(day(1, 10)).evs[0]; sync();
  assert.deepEqual(R1.base, [want[0].id]);
  const honest = frank.view();
  assert.deepEqual([honest.forked, stateOf(honest, "d1"), seatOf(honest, want[0].id)?.as], [[], "wanted", "seen"], "one chain: nothing set aside");
  // the same key signs a second event at the want's place: an extend dated the day before, built on what it had then
  const d = decide(l, old, { asker: MARCO, thing: "d1", move: "extend" }, day(0, 12));
  assert.deepEqual([d.ok, d.drafts.map((x) => x.kind)], [true, ["way.move"]]);
  const twin = marco.raw("way.move", d.drafts[0].value as Record<string, unknown>, day(0, 12), { n: want[0].n, item: "d1", after: null });
  sync();
  const later = marco.press({ thing: "d1", move: "drop" }, day(2, 9)).evs.at(-1)!; sync();   // the key writes on, after the fork
  assert.equal(later.n, want[0].n + 1);
  runner.seal(day(2, 10)); sync();
  const r = frank.view();
  assert.deepEqual(r.forked, [marco.key]);
  for (const e of [want[0], twin, later]) assert.deepEqual([whyOf(r, e.id), seatOf(r, e.id)], [["forked"], undefined], `${e.kind} at place ${e.n}: set aside, folded nowhere`);
  const d1 = r.p.things.d1;
  assert.deepEqual([d1.state, d1.fields.extended, d1.fields.title, d1.born], ["on_switch", undefined, "one", day(0, 9)], "what the key wrote before the fork stands; the backdated extend did not get in before the receipt");
  assert.deepEqual([isSpine(r, R1.id), r.waiting], [true, []], "the receipt that named the want is still a spine event: the id is held");
  for (const order of [[...w.all].reverse(), [...w.all].sort((a, b) => (a.id < b.id ? -1 : 1))]) {
    const q = w.fold(order);
    assert.deepEqual([q.forked, canon(q)], [r.forked, canon(r)]);
  }
  // a Sol that holds one branch only sees one chain: the guard is for what a Sol holds, the door owns the rest
  const alone = w.fold(w.all.filter((e) => e.id !== twin.id));
  assert.deepEqual([alone.forked, taken(alone, want[0].id), stateOf(alone, "d1")], [[], true, "wanted"]);
});

test("review finding 3: a runner whose own key is forked orders nothing from the fork on, and its turn writes nothing (forked)", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  const R0 = runner.seal(day(0, 10)).evs[0]; sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs[0]; sync();
  const R1 = runner.seal(day(1, 10)).evs[0]; sync();
  const twin = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 10, 5), { n: R1.n, after: null }); sync();
  const r = frank.view();
  assert.deepEqual([r.forked, r.spine, whyOf(r, R1.id), whyOf(r, twin.id)], [[runner.key], [R0.id], ["forked"], ["forked"]]);
  assert.deepEqual([stateOf(r, "d1"), seatOf(r, want.id)?.as], ["wanted", "tail"], "what they named falls in the open tail");
  const t = runner.turn(day(2, 10));
  assert.deepEqual([t.ok, t.why, t.frontier], [false, "forked", []]);
  assert.equal(w.fold([...w.all].reverse()).forked[0], runner.key);
});

// ---- rule 0: one way in, and a place for every event

test("rule 0: a team's book handed its events in reverse, or sorted by id, folds to the same state; an event with no key (or no place along it, or no time) has no place", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  marco.press(MAKE("d2", "two", "s2"), day(0, 10)); sync();
  runner.run(TICK(14)); sync();
  marco.press({ thing: "d2", move: "want" }, day(15, 9)); sync();
  frank.press({ thing: "d2", move: "promote" }, day(16, 9), SOLID); sync();
  runner.run(TICK(21), {}, { "switch.off": true }); sync();
  const named = marco.press({ thing: "d1", move: "extend" }, day(21, 10)).evs.at(-1)!; sync();   // refused or not, an event
  const seal = runner.seal(day(21, 11)).evs[0]; sync();
  const last = frank.press({ thing: "d1", move: "pull" }, day(22, 9)).evs.at(-1)!; sync();   // in the open tail
  const full = w.full();
  assert.deepEqual([stateOf(full, "d1"), stateOf(full, "d2")], ["removed", "official"]);
  assert.equal(canon(w.fold([...w.all].reverse())), canon(full));
  assert.equal(canon(w.fold([...w.all].sort((a, b) => (a.id < b.id ? -1 : 1)))), canon(full));
  assert.deepEqual(w.fold([...w.all].reverse()).p.skipped, full.p.skipped, "and passes over the same events for the same reasons, in the same order");
  const without = (id: string, change: Record<string, unknown>) => w.fold(w.all.map((e) => (e.id === id ? { ...e, ...change } : e)));
  for (const change of [{ key: undefined }, { key: "" }, { key: 7 }, { n: undefined }, { n: -1 }, { n: 1.5 }, { n: "3" }, { at: NaN }, { at: Infinity }]) {
    const r = without(last.id, change);
    assert.deepEqual([whyOf(r, last.id), seatOf(r, last.id), stateOf(r, "d1")], [["no_place"], undefined, "to_remove"], JSON.stringify(change));
  }
  // an id that names an event with no place names nothing this Sol holds: the receipt waits
  const r = without(named.id, { key: undefined });
  assert.deepEqual([whyOf(r, named.id), r.waiting], [["no_place"], [{ id: seal.id, missing: [named.id] }]]);
  // the fold of one event, as exported, takes nothing of a team's book: the order is the only way in
  const p = empty(WAY), first = w.all.find((e) => e.kind === "way.applied")!;
  assert.equal(step(p, first, (v) => w.ways.get(v), w.book), false);
  assert.deepEqual([p.ver, p.skipped.map((s) => s.why)], ["", ["no_place"]]);
  assert.equal(l.ver, full.p.ver);
});

// ---- unread

test("an unread event the runner saw: placed where the runner saw it, passed over, and the result says so", () => {
  const { w, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs.at(-1)!; sync();
  const R = runner.seal(day(1, 10)).evs[0]; sync();
  assert.deepEqual([stateOf(frank.view(), "d1"), frank.view().unread], ["wanted", []]);
  // a Sol whose build cannot read the want
  const r = w.fold(w.all.map((e) => (e.id === want.id ? { ...e, unread: true } : e)));
  assert.deepEqual([isSpine(r, R.id), seatOf(r, want.id)?.as, seatOf(r, want.id)?.taken, whyOf(r, want.id), r.unread, r.waiting, stateOf(r, "d1")], [true, "seen", false, ["unread"], [want.id], [], "on_switch"]);
  // one that cannot read the receipt: it is not placed and orders nothing (a build that reads it may find it waits); the want falls in the open tail
  const r2 = w.fold(w.all.map((e) => (e.id === R.id ? { ...e, unread: true } : e)));
  assert.deepEqual([isSpine(r2, R.id), whyOf(r2, R.id), r2.unread, seatOf(r2, want.id)?.as, stateOf(r2, "d1")], [false, ["unread"], [R.id], "tail", "wanted"]);
});

// ---- replay on a team's book

test("a replay of a team's book reads the history in the team's order: the same version differs nowhere, 21d made 30d differs for the draft that expired, whatever order the events come in", () => {
  const { w, l, runner, sync } = setup();
  for (let n = 1; n <= 22; n++) { runner.run(TICK(n), {}, { "switch.off": true }); sync(); }
  assert.equal(stateOf(w.full(), "d1"), "to_remove");
  const f = raw(); f.prev = l.ver; f.rules.expired.any[0].all[0].older = "30d"; const N = w.add(f);
  const same = replay(w.all, w.ways, l, l, w.book, { now: FAR });
  assert.deepEqual([same.things.length, same.differ], [1, 0]);
  const other = replay(w.all, w.ways, l, N, w.book, { now: FAR });
  assert.deepEqual([other.things.length, other.differ], [1, 1]);
  assert.deepEqual(replay([...w.all].reverse(), w.ways, l, N, w.book, { now: FAR }), other);
});

// ---- several firings in one turn

test("several firings in one turn: the first carries the frontier, the rest none; each is a spine event, judged on the state every Sol shows just before it", () => {
  const { w, marco, frank, runner, sync } = setup();
  marco.press(MAKE("d2", "two", "s2"), day(0, 9, 30)); sync();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d2", move: "want" }, day(20, 9)).evs.at(-1)!; sync();
  const f = runner.run(TICK(21), {}, { "switch.off": true }); sync();
  const fs = fired(f.evs);
  assert.deepEqual(fs.map((e) => [e.value?.trigger, e.value?.thing, e.base]), [["remind", "d1", [want.id]], ["remind", "d2", undefined], ["expire", "d1", undefined], ["expire", "d2", undefined]]);
  const r = frank.view();
  for (const F of fs) assert.deepEqual([isSpine(r, F.id), taken(r, F.id)], [true, true]);
  assert.deepEqual([stateOf(r, "d1"), stateOf(r, "d2")], ["to_remove", "to_remove"]);
  // the first firing of each thing was judged on the turn's own projection: every Sol shows that state just before it
  for (const F of [fs[0], fs[1]]) {
    const thing = String(F.value?.thing);
    assert.equal(snap(w.fold(w.all, FAR, { before: F.id }).before!, thing), snap(f.t.p, thing), thing);
  }
  // a later one was judged on that plus the turn's own earlier events
  assert.deepEqual(w.fold(w.all, FAR, { before: fs[2].id }).before!.things.d1.fired, { remind: TICK(21) });
});

// ---- the edges of the order

test("rule 2: a frontier that is not a list of at most 256 different ids counts for nothing (bad_frontier), and holds back nothing the runner writes after; 256 ids this Sol lacks is a frontier, and waits", () => {
  const { l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs.at(-1)!; sync();
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `x${i}`);
  const bad = [ids(257), [want.id, want.id], [7], [""], "e1", { 0: want.id }].map((base, i) => runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 10) + i, { base: base as never }));
  sync();
  const r = frank.view();
  for (const e of bad) assert.deepEqual([whyOf(r, e.id), isSpine(r, e.id)], [["bad_frontier"], false], JSON.stringify(e.base).slice(0, 40));
  assert.deepEqual([r.waiting, seatOf(r, want.id)?.as], [[], "tail"], "none of them ordered the want");
  const s = runner.seal(day(1, 11)); sync();
  assert.deepEqual([s.t.ok, s.evs[0].base, isSpine(frank.view(), s.evs[0].id), seatOf(frank.view(), want.id)?.as], [true, [want.id], true, "seen"]);
  const most = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 12), { base: ids(256) }); sync();
  const r2 = frank.view();
  assert.deepEqual([whyOf(r2, most.id), r2.waiting.map((x) => [x.id, x.missing.length])], [["waiting"], [[most.id, 256]]]);
});

test("rule 1: an event dated before the one its key wrote before it is set aside (before_its_prev), still held: a receipt that names it does not wait, and what the key writes after stands", () => {
  const { l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(2, 9)).evs.at(-1)!;
  const back = marco.press({ thing: "d1", move: "extend" }, day(1, 9), {}, { now: day(2, 9) });   // dated the day before his last
  assert.deepEqual([back.d.ok, back.evs.length, back.evs[0].after], [true, 1, day(2, 9)]);
  const later = marco.press(MAKE("d2", "two", "s2"), day(3, 9)).evs; sync();
  const names = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(3, 10), { base: [back.evs[0].id] }); sync();
  const r = frank.view();
  assert.deepEqual([whyOf(r, back.evs[0].id), seatOf(r, back.evs[0].id)], [["before_its_prev"], undefined]);
  assert.deepEqual([isSpine(r, names.id), r.waiting], [true, []], "the id is held: nothing is missing");
  assert.deepEqual([stateOf(r, "d1"), r.p.things.d1.fields.extended, seatOf(r, want.id)?.as, stateOf(r, "d2"), seatOf(r, later[0].id)?.as], ["wanted", undefined, "seen", "on_switch", "tail"], "it took in what the key wrote before that place, and no more");
  // the runner's own receipt dated before its last one is no candidate
  const early = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(3, 9, 59)); sync();
  const r2 = frank.view();
  assert.deepEqual([whyOf(r2, early.id), isSpine(r2, early.id), r2.spine.length], [["before_its_prev"], false, r.spine.length]);
  assert.equal(runner.turn(day(3, 11)).ok, true, "and does not stop the runner");
});

test("rule 5: the turn writes nothing when its clock is behind its own key's last event (clock_back), when the version in force does not name it (not_runner), when something its key named is dated more than SKEW ahead (before_its_base), or on a book that is not a team's (not_team)", () => {
  const { w, l, marco, runner, sync } = setup();
  const why = (t: ReturnType<Sol["turn"]>) => [t.ok, t.why, t.frontier];
  assert.deepEqual(why(turn(WAY, [], w.ways, w.book, runner.me, day(0, 0))), [false, "not_runner", []], "no version in force: no runner");
  runner.seal(day(1, 10)); sync();
  assert.deepEqual(why(runner.turn(day(1, 9, 59))), [false, "clock_back", []]);
  assert.deepEqual(why(runner.turn(day(1, 10))), [true, undefined, []], "its own last event's time is not behind it");
  assert.deepEqual(why(new Sol(w, MINI).sync().turn(day(2, 0))), [false, "not_runner", []]);
  assert.deepEqual(why(new Sol(w, "machine:nucbox@marco").sync().turn(day(2, 0))), [false, "not_runner", []], "the same machine name under another login");
  assert.deepEqual(why(turn(WAY, w.all, w.ways, OWN, runner.me, day(2, 0))), [false, "not_team", []]);
  const far = marco.press(MAKE("d5", "five", "s5"), day(5, 9)).evs.at(-1)!; sync();
  runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 11), { base: [far.id] }); sync();   // its key names an event four days ahead
  assert.deepEqual(why(runner.turn(day(2, 10))), [false, "before_its_base", []], "what its key named is inherited: it would name it again");
  assert.deepEqual(why(runner.turn(day(5, 9))), [true, undefined, []], "until its clock reaches it");
});

test("a receipt in a person's own log: the runner's, under the version in force, changes nothing and orders nothing there (the own log folds in the order given)", () => {
  const { w, l, runner, sync } = setup();
  const R = runner.seal(day(0, 10)).evs[0]; sync();
  const own = place(WAY, w.all, w.ways, OWN);
  assert.deepEqual([own.spine, own.forked, own.pending, own.seq.every((x) => x.as === "given"), taken(own, R.id), stateOf(own, "d1")], [[], [], [], true, true, "on_switch"]);
  const as = (change: Partial<WayEvent>, first = false) => {
    const e = { ...R, ...change } as WayEvent, rest = w.all.filter((x) => x.id !== R.id);
    return whyOf(place(WAY, first ? [e, ...rest] : [...rest, e], w.ways, OWN), R.id);
  };
  assert.deepEqual([as({}), as({ by: MARCO }), as({ by: FRANK }), as({ value: { way: WAY, ver: "0".repeat(64) } }), as({}, true)], [[], ["not_runner"], ["not_runner"], ["old_version"], ["not_applied"]]);
  assert.deepEqual(as({ by: undefined }), ["unsigned"], "a receipt the book does not say who signed is not taken: its writer is checked like a firing's");
  assert.equal(l.ver, own.p.ver);
});

// ---- pinned after the mutation run (reports/step4-engine.md, "4a.2 v3"): each of these is a line of the order that
// no scenario above turned over

test("rule 1: two keys with one time: the key decides, then the place along its chain (a later place on one key does not put it after an earlier place on another)", () => {
  const w = new World(), l = w.add(raw());
  const a = new Sol(w, MARCO, "a-key"), b = new Sol(w, FRANK, "b-key"), runner = new Sol(w, RUNNER), all = [a, b, runner];
  const sync = () => all.forEach((s) => s.sync());
  start(w, l, day(-1, 12), all);
  a.press(MAKE("d1", "one", "s1"), day(0, 9)); a.press(MAKE("d2", "two", "s2"), day(0, 9, 1)); a.press(MAKE("d3", "three", "s3"), day(0, 9, 2)); sync();
  runner.seal(day(0, 10)); sync();
  const want = a.press({ thing: "d1", move: "want" }, day(1, 9)).evs.at(-1)!; sync();
  const pr = b.press({ thing: "d1", move: "promote" }, day(1, 9), SOLID);   // the same instant, on another key
  const promote = pr.evs.at(-1)!; sync();
  assert.equal(pr.d.ok, true);
  assert.ok(want.at === promote.at && want.key < promote.key && want.n > pr.evs[0].n && want.n > promote.n, "the earlier key holds the later place");
  for (const evs of [w.all, [...w.all].reverse()]) {
    const r = w.fold(evs), at = (id: string) => r.seq.findIndex((s) => s.e.id === id);
    assert.ok(at(want.id) < at(pr.evs[0].id) && at(want.id) < at(promote.id), "Marco's key comes first, whole");
    assert.deepEqual([stateOf(r, "d1"), whyOf(r, promote.id)], ["official", []]);
  }
  runner.seal(day(1, 10)); sync();   // and the same once the runner has seen both
  assert.deepEqual([stateOf(w.full(), "d1"), seatOf(w.full(), promote.id)?.as], ["official", "seen"]);
});

test("rule 0: an event of another way in the same list is not this way's: it has no seat and is named nowhere, the turn does not name it, and an id that names it names nothing held (the receipt waits)", () => {
  const { l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const other = marco.raw("way.move", { way: "sol.other", ver: l.ver, thing: "d1", move: "want", from: "on_switch", to: "wanted", by: "explorer" }, day(1, 9), { item: "d1" }); sync();
  const r = frank.view();
  assert.deepEqual([seatOf(r, other.id), whyOf(r, other.id), stateOf(r, "d1"), r.pending], [undefined, [], "on_switch", []]);
  assert.deepEqual([runner.turn(day(1, 10)).ok, runner.turn(day(1, 10)).frontier], [true, []], "nothing new of this way");
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 11)).evs.at(-1)!; sync();
  assert.equal(want.n, other.n + 1, "its key's chain runs over every way: the place between is the other way's");
  const s = runner.seal(day(1, 12)); sync();
  assert.deepEqual([s.evs[0].base, stateOf(frank.view(), "d1"), seatOf(frank.view(), want.id)?.as], [[want.id], "wanted", "seen"]);
  const names = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 13), { base: [other.id] }); sync();
  const r2 = frank.view();
  assert.deepEqual([whyOf(r2, names.id), r2.waiting], [["waiting"], [{ id: names.id, missing: [other.id] }]]);
});

test("rule 2: an answer that is not right after its firing in the chain (the place between is not this way's) is not in the firing's batch: an ordinary event, still taken", () => {
  const { w, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const f = runner.run(TICK(21), {}, { "switch.off": true }); sync();
  const F = fired(f.evs, "expire", "d1")[0], drop = f.evs.find((e) => e.kind === "way.move")!;
  assert.equal(drop.n, F.n + 1);
  const whole = frank.view();
  assert.deepEqual([seatOf(whole, drop.id)?.as, stateOf(whole, "d1")], ["batch", "to_remove"], "as written: right after it");
  // the same events, the runner's key having written one event of another way between the firing and its move
  const gap = w.all.map((e) => (e.key === runner.key && e.n >= drop.n ? { ...e, n: e.n + 1 } : e));
  for (const evs of [gap, [...gap].reverse()]) {
    const r = w.fold(evs);
    assert.deepEqual([isSpine(r, F.id), seatOf(r, drop.id)?.as, seatOf(r, drop.id)?.at, taken(r, drop.id), stateOf(r, "d1")], [true, "tail", TICK(21), true, "to_remove"]);
    assert.equal(r.seq.some((s) => s.as === "batch" && s.e.id === drop.id), false);
  }
});

test("rule 3: a frontier that names two events of one key, the later first, has seen up to the later (what was seen never goes down)", () => {
  const { l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs.at(-1)!;
  const make = marco.press(MAKE("d2", "two", "s2"), day(1, 9, 30)).evs; sync();
  assert.ok(make.at(-1)!.n > want.n);
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 10), { base: [make.at(-1)!.id, want.id] }); sync();
  const r = frank.view();
  assert.equal(isSpine(r, R.id), true);
  for (const e of [want, ...make]) assert.deepEqual([seatOf(r, e.id)?.as, taken(r, e.id)], ["seen", true], `${e.kind} at place ${e.n}`);
  assert.deepEqual([stateOf(r, "d1"), stateOf(r, "d2"), r.seq.filter((s) => s.as === "tail").length], ["wanted", "on_switch", 0]);
});

/** v1, then lb (a rule-only change) applied by Marco on day 1 and seen by the runner's next receipt */
function ruleChange() {
  const { w, l, marco, frank, runner, sync } = setup();
  const fb = raw(); fb.prev = l.ver; fb.rules.expired.any[1].older = "50d"; const lb = w.add(fb);
  const fc = raw(); fc.prev = lb.ver; fc.rules.expired.any[1].older = "70d"; const lc = w.add(fc);
  runner.seal(day(0, 10)); sync();
  const ap = marco.raw("way.applied", { way: WAY, from: l.ver, to: lb.ver, reader: 1 }, day(1, 9)); sync();
  return { w, l, lb, lc, marco, frank, runner, sync, ap };
}

test("rule 4: a receipt naming the version before, that had seen the apply to the next one, is not a spine event: the apply stays in the open tail, and what its key saw is still inherited", () => {
  const { l, lb, frank, runner, sync, ap } = ruleChange();
  const copies = frank.view().copies;
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 10), { base: [ap.id] }); sync();
  const r = frank.view();
  assert.deepEqual([whyOf(r, R.id), isSpine(r, R.id), seatOf(r, ap.id)?.as, r.p.ver, r.copies - copies], [["not_spine"], false, "tail", lb.ver, 1], "tried on a copy: the version in force after what it saw is not the one it names");
  const s = runner.seal(day(1, 11)); sync();
  const r2 = frank.view();
  assert.deepEqual([s.t.ver, s.evs[0].base, isSpine(r2, s.evs[0].id), seatOf(r2, ap.id)?.as, r2.p.ver], [lb.ver, undefined, true, "seen", lb.ver], "the honest turn names nothing again (its key named the apply already) and is a spine event under the new version");
});

test("rule 4: a candidate naming a version not in force, whose seen events hold no apply or revert to that version, is not_spine without a copy of the projection", () => {
  const { l, lb, lc, marco, frank, runner, sync } = ruleChange();
  runner.seal(day(1, 11)); sync();
  assert.equal(frank.view().p.ver, lb.ver);
  const ap2 = marco.raw("way.applied", { way: WAY, from: lb.ver, to: lc.ver, reader: 1 }, day(2, 9)); sync();
  const before = frank.view();
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(2, 10), { base: [ap2.id] }); sync();
  const r = frank.view();
  assert.deepEqual([whyOf(r, R.id), r.copies, seatOf(r, ap2.id)?.as, r.p.ver], [["not_spine"], before.copies, "tail", lc.ver]);
});

test("a revert the runner had seen: its receipt names the version gone back to and is a spine event; the way's head is then the revert, so an agreement given on the apply before it is stale", () => {
  const { w, l, lb, marco, frank, runner, sync, ap } = ruleChange();
  runner.seal(day(1, 11)); sync();
  const rv = marco.raw("way.reverted", { way: WAY, from: lb.ver, to: l.ver }, day(2, 9)); sync();
  const s = runner.seal(day(2, 10)); sync();
  const r = frank.view();
  assert.deepEqual([s.t.ver, s.evs[0].base, isSpine(r, s.evs[0].id), seatOf(r, rv.id)?.as, taken(r, rv.id), r.p.ver, r.p.head], [l.ver, [rv.id], true, "seen", true, l.ver, rv.id]);
  const fx = raw(); fx.prev = l.ver; fx.roles.explorer.who = [MARCO, FRANK]; const lx = w.add(fx);
  const stale = marco.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(3, 9), { base: [ap.id] });
  const good = marco.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(3, 9, 1)); sync();
  assert.deepEqual(good.base, [rv.id]);
  const r2 = frank.view();
  assert.deepEqual([whyOf(r2, stale.id), whyOf(r2, good.id)], [["stale_agreement"], []]);
});

test("rule 6: after an apply, an agreement that names no head (no base, or an empty one) is stale", () => {
  const { w, l, marco, frank, sync } = setup();
  const fx = raw(); fx.prev = l.ver; fx.roles.explorer.who = [MARCO, FRANK]; const lx = w.add(fx);
  const value = { way: WAY, to: lx.ver, role: "explorer" };
  const none = marco.sign({ kind: "way.agreed", item: WAY, value, at: day(1, 9), id: w.nextId(), by: MARCO });
  const blank = marco.sign({ kind: "way.agreed", item: WAY, value, at: day(1, 9, 1), id: w.nextId(), by: MARCO, base: [] });
  const good = marco.raw("way.agreed", value, day(1, 9, 2)); sync();
  assert.deepEqual([none.base, blank.base, good.base], [undefined, [], [frank.view().p.head]]);
  const r = frank.view();
  assert.deepEqual([whyOf(r, none.id), whyOf(r, blank.id), whyOf(r, good.id)], [["stale_agreement"], ["stale_agreement"], []]);
});

test("rule 5: a second key under the runner's machine name writing at the very time of the turn, on a later key: the turn stops before it, names what it names, and its own event stands first on every Sol", () => {
  const w = new World(), l = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER, "nucbox-key-1"), twin = new Sol(w, RUNNER, "nucbox-key-2");
  const all = [marco, frank, runner, twin], sync = () => all.forEach((s) => s.sync());
  start(w, l, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); sync();
  const first = runner.seal(day(0, 10)).evs[0]; sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs.at(-1)!; sync();
  const now = day(1, 10);
  const other = twin.seal(now).evs[0]; sync();
  assert.deepEqual(other.base, [first.id, want.id], "the other key's spine event it stands after, then what is new");
  const t = runner.turn(now);
  assert.deepEqual([t.ok, t.frontier, t.last], [true, [want.id], day(0, 10)], "the twin's receipt is after the turn's own event in plain order: not walked");
  const mine = runner.seal(now).evs[0]; sync();
  const r = frank.view();
  assert.deepEqual(r.spine.slice(-2), [mine.id, other.id]);
  assert.equal(snap(r.before ?? w.fold(w.all, FAR, { before: mine.id }).before!, "d1"), snap(t.p, "d1"), "the state every Sol shows just before it is the state the turn judged on");
  const tt = twin.turn(now);
  assert.deepEqual([tt.ok, tt.frontier, tt.news], [true, [mine.id], false], "seen from the later key the runner's event is before its turn: walked, and named as the spine event it stands after; no ordinary event is new");
  assert.deepEqual(sealed(tt, [], l.way!, now), [], "so it owes no receipt: two keys that run one way do not answer each other for ever");
});

test("sealed(), by a direct call (due() gives no drafts without a firing today): what is put first (the pages, the receipt) moves the drafts' own indexes (cause, checks) by as many; with a firing the pages go first and the firing carries the frontier", () => {
  const { l } = setup();
  const t = { p: empty(WAY), ver: l.ver, frontier: ["a"], pages: [] as string[][], news: true, ok: true, last: day(5, 9) };
  const drafts = [{ kind: "way.checked", item: "d1", at: day(5, 10), value: { way: WAY } }, { kind: "way.refused", item: "d1", at: day(5, 10), value: { way: WAY }, cause: 0, checks: [0] }];
  const out = sealed(t, drafts, l.way!, day(5, 10));
  assert.deepEqual(out.map((d) => [d.kind, d.cause, d.checks, d.base]), [["way.seen", undefined, undefined, ["a"]], ["way.checked", undefined, undefined, undefined], ["way.refused", 1, [1], undefined]]);
  assert.deepEqual([drafts[1].cause, drafts[1].checks], [0, [0]], "the drafts handed in are not changed");
  // two pages and the receipt: by three
  const paged = sealed({ ...t, pages: [["p"], ["q"]] }, drafts, l.way!, day(5, 10));
  assert.deepEqual(paged.map((d) => [d.kind, d.value.more, d.cause, d.checks, d.base]), [["way.seen", true, undefined, undefined, ["p"]], ["way.seen", true, undefined, undefined, ["q"]], ["way.seen", undefined, undefined, undefined, ["a"]], ["way.checked", undefined, undefined, undefined, undefined], ["way.refused", undefined, 3, [3], undefined]]);
  // a firing: no receipt; the pages first (by two), the check still right before its firing, the firing carries the frontier
  const fire = [drafts[0], { kind: "way.fired", item: "d1", at: day(5, 10), value: { way: WAY }, checks: [0] }, { kind: "way.move", item: "d1", at: day(5, 10), value: { way: WAY }, cause: 1 }, { kind: "way.fired", item: "d2", at: day(5, 10), value: { way: WAY } }];
  const fired2 = sealed({ ...t, pages: [["p"], ["q"]], news: false }, fire, l.way!, day(5, 10));
  assert.deepEqual(fired2.map((d) => [d.kind, d.value.more, d.cause, d.checks, d.base]), [["way.seen", true, undefined, undefined, ["p"]], ["way.seen", true, undefined, undefined, ["q"]], ["way.checked", undefined, undefined, undefined, undefined], ["way.fired", undefined, undefined, [2], ["a"]], ["way.move", undefined, 3, undefined, undefined], ["way.fired", undefined, undefined, undefined, undefined]]);
});

test("rule 9: a team's book does not read `seen`: every event said to have reached this Sol an hour before its date folds as without it; a person's own log sets such facts aside (ahead)", () => {
  const { w, marco, frank, runner, sync } = setup();
  runner.run(TICK(14)); sync();
  marco.press({ thing: "d1", move: "want" }, day(15, 9)); sync();
  frank.press({ thing: "d1", move: "promote" }, day(16, 9), SOLID); sync();
  runner.seal(day(16, 10)); sync();
  marco.press(MAKE("d2", "two", "s2"), day(17, 9)); sync();   // in the open tail
  const early = w.all.map((e) => ({ ...e, seen: e.at - 3_600_000 }));
  const a = w.full(), b = w.fold(early);
  assert.deepEqual([stateOf(a, "d1"), stateOf(a, "d2")], ["official", "on_switch"]);
  assert.deepEqual([canon(b), b.p.skipped, b.spine, b.seq.map((s) => [s.e.id, s.at, s.taken, s.as])], [canon(a), a.p.skipped, a.spine, a.seq.map((s) => [s.e.id, s.at, s.taken, s.as])]);
  assert.ok(place(WAY, early, w.ways, OWN).p.skipped.some((s) => s.why === "ahead"), "the own log reads it");
});

// ---- replay on a team's book, the three things it takes from the order

test("a replay of a team's book reads the open tail with the clock it is handed: a press of the tail is part of the history, one dated past the clock is not until the clock reaches it", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  marco.press({ thing: "d1", move: "want" }, day(1, 9));
  marco.press(MAKE("d9", "nine", "s9"), day(700, 9)); sync();
  const a = replay(w.all, w.ways, l, l, w.book, { now: day(2, 0) });
  assert.deepEqual([a.things.map((t) => t.thing), a.differ, a.things[0].was.filter((s) => s.kind === "way.move").map((s) => s.move)], [["d1"], 0, ["make", "want"]]);
  const b = replay(w.all, w.ways, l, l, w.book, { now: day(700, 9) });
  assert.deepEqual([b.things.map((t) => t.thing), b.differ], [["d1", "d9"], 0]);
});

test("a replay of a team's book reads each event at the time the order judged it at: a want dated the evening before a remind that had not seen it is replayed after the remind, as every Sol folded it", () => {
  const { w, l, marco, runner, sync } = setup();
  const want = marco.press({ thing: "d1", move: "want" }, day(13, 23)).evs.at(-1)!;   // offline
  runner.run(TICK(14)); sync();
  assert.deepEqual([seatOf(w.full(), want.id)?.as, seatOf(w.full(), want.id)?.at], ["tail", TICK(14)]);
  const r = replay(w.all, w.ways, l, l, w.book, { now: FAR });
  const was = r.things[0].was;
  assert.deepEqual([r.differ, r.things[0].same], [0, true], "the same version over its own history differs nowhere");
  assert.deepEqual(was.filter((s) => s.move === "want").map((s) => s.at), [TICK(14)]);
  assert.ok(was.findIndex((s) => s.kind === "way.fired") < was.findIndex((s) => s.move === "want"));
});

test("as built: a replay of a team's book leaves out what the order passed over: an extend that arrived after the expiry (refused where it stands) is not a press of the history", () => {
  const { marco, runner, sync, w, l1 } = s11();
  runner.run(TICK(14)); sync();
  const x = marco.press({ thing: "d1", move: "extend" }, day(20, 23)).evs.find((e) => e.kind === "way.move")!;   // offline
  runner.run(TICK(21), {}, { "switch.off": true }); sync();
  assert.deepEqual(whyOf(w.full(), x.id), ["wrong_state"]);
  const r = replay(w.all, w.ways, w.loaded.get(l1.ver)!, w.loaded.get(l1.ver)!, w.book, { now: FAR });
  assert.deepEqual([r.differ, r.things[0].wouldBeRefused, r.things[0].was.some((s) => s.move === "extend"), r.things[0].now.some((s) => s.move === "extend")], [0, [], false, false]);
});

// ---- a gap found while building the section as written (reports/step4-engine.md, "4a.2 v3"), closed after: a
// firing's own checks fold right before it (its lead). What an agreement that outruns its apply costs, by the
// mailbox (s22) or by clocks that differ, is pinned as a cost

/** the expiry asks a seam (a check), so the turn writes a way.checked before its firing. Frank's rule-only apply,
 *  dated `ahead` minutes after the turn's time, reaches the runner just before the turn */
function checkThenApply(ahead: number) {
  const file = raw(); file.triggers.expire.if.all.push({ check: "gate.green" });
  const { w, l, frank, runner, sync } = setup(file);
  runner.run(TICK(14)); sync();
  const f2 = JSON.parse(JSON.stringify(file)); f2.prev = l.ver; f2.rules.expired.any[1].older = "50d"; const l2 = w.add(f2);
  const ap = frank.raw("way.applied", { way: WAY, from: l.ver, to: l2.ver, reader: 1 }, TICK(21) + ahead * 60_000);
  runner.sync();
  const green = { "gate.green": { pass: true } }, off = { "switch.off": true };
  const f = runner.run(TICK(21), green, off); sync();
  return { w, r: frank.view(), f, ap, l, l2, frank, runner, again: () => { const g = runner.run(TICK(21) + 6 * 60_000, green, off); sync(); return { g, r: frank.view() }; } };
}

test("a firing's lead: the checks a turn asked stand right before their firing, after everything it had seen: an apply the turn named, dated at or after the turn's time, does not come between them", () => {
  for (const ahead of [5, 0, -1]) {
    const a = checkThenApply(ahead);
    assert.deepEqual(a.f.evs.map((e) => [e.kind, e.base]), [["way.checked", undefined], ["way.fired", [a.ap.id]], ["way.move", undefined], ["way.acted", undefined]], "the runner judged under the new version and wrote the check first");
    assert.equal(a.f.t.ver, a.l2.ver);
    const [ck, F, mv, act] = a.f.evs;
    assert.deepEqual([isSpine(a.r, F.id), ...[ck, F, mv, act].map((e) => whyOf(a.r, e.id))], [true, [], [], [], []], `ahead ${ahead}: every Sol takes what the runner wrote`);
    assert.deepEqual([seatOf(a.r, ck.id)?.as, seatOf(a.r, ck.id)?.at, seatOf(a.r, a.ap.id)?.as, seatOf(a.r, a.ap.id)?.at], ["lead", TICK(21), "seen", TICK(21) + Math.min(ahead, 0) * 60_000]);
    const order = a.r.seq.map((x) => x.e.id);
    assert.deepEqual([a.ap.id, ck.id, F.id, mv.id, act.id].map((id) => order.indexOf(id)).map((i, _, all) => i - all[0]), [0, 1, 2, 3, 4], "the apply, then the turn's own events, nothing between");
    assert.deepEqual([stateOf(a.r, "d1"), a.r.p.ver], ["to_remove", a.l2.ver], "the book says what the runner did");
    assert.equal(a.again().g.evs.some((e) => e.kind !== "way.seen"), false, "the next turn fires nothing again");
    assert.equal(canon(a.runner.view()), canon(a.r), "one state on every Sol");
  }
});

test("a firing's lead is only the lead checks it names, of its tick, that stand right before it, and shares its fate: one it does not name, one of another tick, or one with a gap before the firing has no firing and is set aside, never an ordinary event; a firing that waits keeps its lead waiting", () => {
  const a = checkThenApply(5), [ck, F] = a.f.evs;
  assert.deepEqual([ck.value?.tick, F.value?.tick], [TICK(21), TICK(21)], "the turn's check says its firing's tick");
  // the same events, the firing naming another check: the lead check has no firing, and is folded nowhere
  const bare = a.w.all.map((e) => (e.id === F.id ? { ...e, value: { ...(e.value as object), checks: ["another"] } } : e));
  const r1 = a.w.fold(bare);
  assert.deepEqual([seatOf(r1, ck.id), whyOf(r1, ck.id)], [undefined, ["no_firing"]]);
  // the check saying another tick than the firing: the same
  const other = a.w.all.map((e) => (e.id === ck.id ? { ...e, value: { ...(e.value as object), tick: TICK(20) } } : e));
  const r1b = a.w.fold(other);
  assert.deepEqual([seatOf(r1b, ck.id), whyOf(r1b, ck.id), taken(r1b, F.id)], [undefined, ["no_firing"], false]);
  // a gap between the check and the firing (the firing's place moved on by one): not its lead
  const gap = a.w.all.map((e) => (e.key === F.key && e.n >= F.n ? { ...e, n: e.n + 1 } : e)), r2 = a.w.fold(gap);
  assert.deepEqual([seatOf(r2, ck.id), whyOf(r2, ck.id)], [undefined, ["no_firing"]]);
  // the same check saying no tick: an ordinary event, folded where its date puts it, and the firing cannot claim it
  const plain = a.w.all.map((e) => { if (e.id !== ck.id) return e; const { tick: _, ...value } = e.value as Record<string, unknown>; return { ...e, value }; });
  const r2b = a.w.fold(plain);
  assert.deepEqual([seatOf(r2b, ck.id)?.as, whyOf(r2b, ck.id)], ["seen", ["old_version"]]);
  // a Sol that lacks the apply the firing names: the firing waits, and its check and its move with it
  const part = a.w.all.filter((e) => e.id !== a.ap.id), r3 = a.w.fold(part);
  assert.deepEqual([...r3.waiting].sort((x, y) => (x.id < y.id ? -1 : 1)), a.f.evs.map((e) => ({ id: e.id, missing: e === F ? [a.ap.id] : [] })).sort((x, y) => (x.id < y.id ? -1 : 1)), "the firing names what it lacks; its check and its batch wait behind it");
  assert.deepEqual([whyOf(r3, ck.id), whyOf(r3, F.id), seatOf(r3, ck.id)], [["waiting"], ["waiting"], undefined]);
  // a forged firing under another key that names a check of that key: set aside with it, it orders nothing
  const fake = a.frank.raw("way.checked", { way: WAY, ver: a.l2.ver, thing: "d1", seam: "gate.green", pass: true, tick: TICK(22) }, day(22, 9));
  const ff = a.frank.raw("way.fired", { way: WAY, ver: a.l2.ver, trigger: "expire", thing: "d1", tick: TICK(22), checks: [fake.id] }, day(22, 9));
  const r4 = a.w.full();
  assert.deepEqual([whyOf(r4, ff.id), whyOf(r4, fake.id), isSpine(r4, ff.id)], [["not_spine"], ["not_spine"], false]);
  // the runner's own firing for a version no longer in force (found so in the walk): its check is set aside with it
  const oc = a.runner.raw("way.checked", { way: WAY, ver: a.l.ver, thing: "d1", seam: "gate.green", pass: true, tick: TICK(23) }, day(23, 9));
  const of = a.runner.raw("way.fired", { way: WAY, ver: a.l.ver, trigger: "expire", thing: "d1", tick: TICK(23), checks: [oc.id] }, day(23, 9));
  const r5 = a.w.full();
  assert.deepEqual([whyOf(r5, of.id), whyOf(r5, oc.id), seatOf(r5, oc.id)], [["not_spine"], ["not_spine"], undefined]);
});

test("two firings in one turn, each with a check: each check is its own firing's lead, and the second firing's lead does not hold the first's batch back", () => {
  const file = raw(); file.triggers.expire.if.all.push({ check: "gate.green" });
  const { w, marco, frank, runner, sync } = setup(file);
  marco.press(MAKE("d2", "two", "s2"), day(0, 10)); sync();
  runner.run(TICK(14)); sync();
  const f = runner.run(TICK(21), { "gate.green": { pass: true } }, { "switch.off": true }); sync();
  assert.deepEqual(f.evs.map((e) => e.kind), ["way.checked", "way.fired", "way.move", "way.acted", "way.checked", "way.fired", "way.move", "way.acted"]);
  const r = frank.view();
  assert.deepEqual(f.evs.map((e) => seatOf(r, e.id)?.as), ["lead", "spine", "batch", "batch", "lead", "spine", "batch", "batch"]);
  assert.deepEqual([f.evs.every((e) => taken(r, e.id)), stateOf(r, "d1"), stateOf(r, "d2")], [true, "to_remove", "to_remove"]);
  assert.equal(canon(r), canon(w.full()));
});

test("a firing's lead of several checks: they fold in the order they were written, right before the firing, however many it names", () => {
  const { w, l, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const cks = ["gate.green", "data.ok", "used.enough"].map((seam, i) => runner.raw("way.checked", { way: WAY, ver: l.ver, thing: "d1", seam, pass: true, tick: TICK(1) }, day(1, 9, i)));
  const F = runner.raw("way.fired", { way: WAY, ver: l.ver, trigger: "expire", thing: "d1", tick: TICK(1), checks: cks.map((c) => c.id).reverse() }, day(1, 9, 5)); sync();
  const r = frank.view(), order = r.seq.map((x) => x.e.id);
  assert.deepEqual([isSpine(r, F.id), cks.map((c) => seatOf(r, c.id)?.as), [...cks, F].map((e) => order.indexOf(e.id) - order.indexOf(cks[0].id))], [true, ["lead", "lead", "lead"], [0, 1, 2, 3]]);
  assert.equal(canon(r), canon(w.full()));
});

/** three versions: v2 a rule change, vx one that puts Frank into Marco's role (so it needs Marco's agreement) */
function agreedOn() {
  const w = new World(), l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.rules.expired.any[1].older = "50d"; const l2 = w.add(f2);
  const fx = raw(); fx.prev = l2.ver; fx.rules.expired.any[1].older = "50d"; fx.roles.explorer.who = [MARCO, FRANK]; const lx = w.add(fx);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), isaac = new Sol(w, ISAAC), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
  const sync = () => all.forEach((s) => s.sync());
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); sync();
  runner.seal(day(0, 10)); sync();
  return { w, l1, l2, lx, marco, frank, isaac, runner, sync };
}

test("the turn's stop is a time and nothing else: an event whose base names an id that never comes is named like any other; its key goes on, and so does the key of whoever agrees on its later apply", () => {
  const { w, l1, l2, lx, marco, frank, runner, sync } = agreedOn();
  const junk = frank.raw("way.proposed", { way: WAY, from: l1.ver, slots: ["rules"] }, day(1, 9), { base: ["never-arrives"] });
  const ap = frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(1, 10)); sync();
  const ag = marco.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(1, 10, 2)); sync();
  assert.deepEqual(ag.base, [ap.id]);
  const s = runner.seal(day(1, 10, 5)); sync();
  assert.deepEqual([...(s.evs[0].base ?? [])].sort(), [ap.id, ag.id].sort(), "each key's latest event, the one after the junk base too");
  const want = marco.press({ thing: "d1", move: "want" }, day(2, 9)).evs.at(-1)!; sync();
  const s2 = runner.seal(day(2, 10)); sync();
  assert.deepEqual(s2.evs[0].base, [want.id], "Marco's later press is named: nothing holds his key back");
  frank.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(2, 11));
  const apx = frank.raw("way.applied", { way: WAY, from: l2.ver, to: lx.ver, reader: 1 }, day(2, 11, 1)); sync();
  runner.seal(day(2, 11, 10)); sync();
  const r = w.full();
  assert.deepEqual([whyOf(r, junk.id), whyOf(r, ag.id), whyOf(r, apx.id), r.p.ver, stateOf(r, "d1"), r.waiting], [[], [], [], lx.ver, "wanted", []], "a base means something on an agreement only; the way changes on");
});

test("cost (clocks): an agreement signed, by its writer's clock, before the apply it was given on (the applier's clock runs ahead of the agreer's by more than the time between the two presses) is spent, and is pressed again", () => {
  const { l1, l2, lx, marco, frank, runner, sync } = agreedOn();
  // three clocks apart: Frank's 11 minutes fast, Marco's one minute fast, the runner's right
  const ap = frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(1, 10, 11));
  marco.sync([ap.id]);
  const mt = day(1, 10, 1) + 20_000;
  assert.equal(marco.view(mt).p.head, ap.id, "Marco's Sol shows the apply: within SKEW of his clock");
  const ag = marco.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, mt);
  assert.deepEqual(ag.base, [ap.id]);
  runner.sync([ap.id, ag.id]);   // both reach the runner
  const s = runner.seal(day(1, 10) + 40_000); sync();
  assert.deepEqual(s.evs[0].base, [ag.id], "the apply is dated more than SKEW after the turn and may not be named yet; the agreement is not: it goes in first");
  const s2 = runner.seal(day(1, 10, 20)); sync();
  assert.deepEqual(s2.evs[0].base, [ap.id]);
  frank.raw("way.agreed", { way: WAY, to: lx.ver, role: "explorer" }, day(1, 11));
  const apx = frank.raw("way.applied", { way: WAY, from: l2.ver, to: lx.ver, reader: 1 }, day(1, 11, 1)); sync();
  runner.seal(day(1, 11, 10)); sync();
  const r = frank.view();
  assert.deepEqual([whyOf(r, ag.id), whyOf(r, apx.id), r.p.ver], [["stale_agreement"], ["not_agreed"], l2.ver], "by the signed times the agreement comes first, in one stretch or in two: Marco agrees again");
});

// ---- after the third refute round (reports/step4-engine.md, 9.13): a way that had two runners has two keys' spine
// events; a runner's event names the other key's spine event it stood after, and waits with it

/** v1 (runner the NucBox), v2 (runner the Mini). The NucBox, cut off since day 14, never gets the change of runner
 *  and fires the day-21 expiry under v1; the Mini holds that firing when it writes its first receipt. `boxes`: so many
 *  other keys of Marco's write a proposal each on day 20. `quiet`: the NucBox's last event is a receipt on day 15
 *  (nothing due, so no batch), and the Mini writes its first on day 20 */
function twoRunners(boxes = 0, quiet = false) {
  const w = new World(), l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.runner = "mini@marco"; const l2 = w.add(f2);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), isaac = new Sol(w, ISAAC), nuc = new Sol(w, RUNNER), mini = new Sol(w, MINI);
  const all = [marco, frank, nuc, mini], near = () => [marco, frank, mini].forEach((s) => s.sync());
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); all.forEach((s) => s.sync());
  nuc.run(TICK(14)); all.forEach((s) => s.sync());
  const note = isaac.raw("way.note", { way: WAY, thing: "d1", text: "x" }, day(15, 9));   // the NucBox gets this, then nothing
  nuc.sync([note.id]);
  const cut = new Set(nuc.holds);
  marco.raw("way.agreed", { way: WAY, to: l2.ver, role: "explorer" }, day(20, 10)); near();
  frank.raw("way.agreed", { way: WAY, to: l2.ver, role: "keeper" }, day(20, 10, 1)); near();
  const ap = frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(20, 11)); near();
  for (let i = 0; i < boxes; i++) new Sol(w, MARCO, `marco-box-${i}`).raw("way.proposed", { way: WAY, from: l2.ver, slots: ["rules"] }, day(20, 12) + i);
  const old = quiet ? nuc.run(day(15, 10), {}, {}, { holds: cut }).evs : nuc.run(TICK(21), {}, { "switch.off": true }, { holds: cut }).evs;
  mini.sync();   // the Mini has everything, the old runner's firing too
  const at = quiet ? day(20, 12) : TICK(21) + 5 * 60_000, t = mini.turn(at);
  const R = mini.run(at).evs[0];
  return { w, l1, l2, marco, frank, nuc, mini, note, ap, old, t, R, at };
}

test("two runners: the new runner's event names the end of the old runner's spine event it stood after; a Sol that lacks it shows the new runner's event waiting, never settled on another state", () => {
  const { w, l2, frank, mini, note, ap, old, t, R, at } = twoRunners();
  assert.deepEqual(old.map((e) => [e.kind, e.base]), [["way.fired", [note.id]], ["way.move", undefined], ["way.acted", undefined]], "the cut-off NucBox expires d1 under v1");
  assert.deepEqual([t.ok, t.ver, t.p.things.d1?.state, R.kind], [true, l2.ver, "to_remove", "way.seen"], "the Mini judged after the old runner's firing");
  assert.deepEqual([R.base, t.news], [[old[2].id, ...w.all.filter((e) => e.kind === "way.agreed" && e.at === day(20, 10)).map((e) => e.id), ap.id], true], "it names the last event of that firing's turn first, then the ordinary events that are new (the note is not: the old runner's firing had seen it)");
  const full = w.fold(w.all, FAR, { before: R.id });
  assert.deepEqual([isSpine(full, R.id), full.waiting, snap(full.before!, "d1")], [true, [], snap(t.p, "d1")], "a Sol that holds everything shows, just before it, the state the Mini judged");
  // a Sol that lacks the old runner's turn, all of it or only its last event: the receipt waits and says for what
  for (const [lacks, d1] of [[old, "on_switch"], [old.slice(2), "to_remove"]] as const) {
    const part = w.fold(w.all.filter((e) => !lacks.includes(e)));
    assert.deepEqual([isSpine(part, R.id), part.waiting, stateOf(part, "d1"), part.p.ver], [false, [{ id: R.id, missing: [old[2].id] }], d1, l2.ver]);
  }
  // a Sol that holds the old runner's turn but not what its firing names: the firing waits, so the receipt waits behind it
  const part = w.fold(w.all.filter((e) => e !== note));
  assert.deepEqual(part.waiting, [...old.map((e) => ({ id: e.id, missing: e === old[0] ? [note.id] : [] })), { id: R.id, missing: [] }]);
  assert.deepEqual([part.spine.includes(R.id), stateOf(part, "d1")], [false, "on_switch"]);
  // the next turn names nothing of it again, and owes no receipt
  const t2 = mini.turn(at + 60_000);
  assert.deepEqual([t2.ok, t2.frontier, t2.news], [true, [], false]);
  // nor do its later receipts, which name only what is new: how far it has named that key's spine is inherited
  for (const m of [2, 4]) {
    const n = frank.raw("way.note", { way: WAY, thing: "d1", text: "y" }, at + m * 60_000); mini.sync();
    assert.deepEqual(mini.seal(at + (m + 1) * 60_000).evs[0].base, [n.id]);
  }
});

test("two runners: the old runner's receipt, named itself (it has no batch): a Sol that lacks what that receipt names shows the new runner's event waiting behind it", () => {
  const { w, note, old, R } = twoRunners(0, true);
  assert.deepEqual([old.map((e) => [e.kind, e.base]), R.base?.[0]], [[["way.seen", [note.id]]], old[0].id]);
  const part = w.fold(w.all.filter((e) => e !== note));
  assert.deepEqual(part.waiting, [{ id: old[0].id, missing: [note.id] }, { id: R.id, missing: [] }]);
  assert.deepEqual([isSpine(w.full(), R.id), w.full().waiting], [true, []]);
});

test("the runner key's own ordinary event (a check that says no tick) is never named: its place on the key's chain says the key's next event had seen it, and it owes no receipt", () => {
  const { w, l, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const ck = runner.raw("way.checked", { way: WAY, ver: l.ver, thing: "d1", seam: "gate.green", pass: true }, day(1, 9)); sync();
  const t = runner.turn(day(1, 10));
  assert.deepEqual([t.ok, t.frontier, t.news], [true, [], false]);
  const R = runner.seal(day(1, 10)).evs[0]; sync();
  const r = w.full();
  assert.deepEqual([R.base ?? [], isSpine(r, R.id), seatOf(r, ck.id)?.as], [[], true, "seen"]);
});

test("two runners: more names than a frontier holds: all of them in one turn, the first 256 on a page (the other key's spine event first), the rest on the receipt; a Sol that lacks a name of either shows the receipt waiting; the next turn names nothing", () => {
  const { old, t, mini, at, w } = twoRunners(300);
  const [page, R] = w.all.filter((e) => e.key === mini.key);
  assert.deepEqual([w.all.filter((e) => e.key === mini.key).length, page.value?.more, page.base?.length, page.base?.[0], R.value?.more, R.base?.length], [2, true, 256, old[2].id, undefined, 300 + 2 - 255]);
  assert.deepEqual([t.pages, t.frontier, t.news], [[page.base], R.base, true]);
  const t2 = mini.turn(at + 60_000);
  assert.deepEqual([t2.ok, t2.frontier, t2.pages, t2.news], [true, [], [], false]);
  mini.sync();
  const full = w.fold(w.all, FAR, { before: R.id });
  assert.equal(full.seq.filter((x) => x.as === "seen" && x.e.kind === "way.proposed").length, 300, "none is left unnamed");
  assert.deepEqual([isSpine(full, R.id), isSpine(full, page.id), seatOf(full, page.id), whyOf(full, page.id), full.waiting, canon({ ...full, p: full.before! }) === canon({ ...full, p: t.p })], [true, false, undefined, [], [], true], "the page has no seat and is set aside nowhere; just before the receipt every Sol shows the state the Mini judged");
  // a Sol that lacks a name of the page: the page waits and says for what, the receipt waits behind it
  const lacksEnd = w.fold(w.all.filter((e) => e.id !== old[2].id));
  assert.deepEqual([lacksEnd.waiting, isSpine(lacksEnd, R.id)], [[{ id: page.id, missing: [old[2].id] }, { id: R.id, missing: [] }], false]);
  const box = page.base![200], lacksBox = w.fold(w.all.filter((e) => e.id !== box));
  assert.deepEqual([lacksBox.waiting, isSpine(lacksBox, R.id)], [[{ id: page.id, missing: [box] }, { id: R.id, missing: [] }], false]);
  // one that lacks a name of the receipt: the page stands (it waits for nothing), the receipt waits
  const lacksLast = w.fold(w.all.filter((e) => e.id !== R.base!.at(-1)));
  assert.deepEqual([lacksLast.waiting, isSpine(lacksLast, R.id), whyOf(lacksLast, page.id)], [[{ id: R.id, missing: [R.base!.at(-1)] }], false, []]);
});

test("another key's candidate named: one that is not well formed never holds the namer back; a check named while it was an ordinary event stays one: a firing that claims it afterwards, and waits, takes nothing with it", () => {
  const { w, l, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  // a forged firing under Frank's key, naming an id that never comes: set aside at once, so the receipt that names it does not wait
  const forged = frank.raw("way.fired", { way: WAY, ver: l.ver, trigger: "expire", thing: "d1", tick: TICK(1) }, day(1, 9), { base: ["never"] });
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 10), { base: [forged.id] }); sync();
  const r = w.full();
  assert.deepEqual([whyOf(r, forged.id), isSpine(r, R.id), r.waiting], [["not_spine"], true, []]);
  // a second key under the runner's name writes a check; the runner names it; that key then writes a firing that
  // claims the check and names an id that never comes
  const twin = new Sol(w, RUNNER, "nucbox-key-2").sync();
  const ck = twin.raw("way.checked", { way: WAY, ver: l.ver, thing: "d1", seam: "gate.green", pass: true }, day(2, 9));
  runner.sync();
  const R2 = runner.seal(day(2, 10)).evs[0]; sync();
  assert.deepEqual([R2.base, seatOf(w.full(), ck.id)?.as], [[ck.id], "seen"]);
  const F = twin.raw("way.fired", { way: WAY, ver: l.ver, trigger: "expire", thing: "d1", tick: TICK(2), checks: [ck.id] }, day(2, 9, 1), { base: ["never"] });
  const r2 = w.full();
  assert.deepEqual([isSpine(r2, R2.id), r2.waiting, seatOf(r2, ck.id)?.as, whyOf(r2, ck.id)], [true, [{ id: F.id, missing: ["never"] }], "seen", []], "the check stays where the receipt placed it; the firing waits alone");
});

test("a receipt has no lead: a lead check right before a way.seen that lists it under `checks` and says its tick has no firing; one that says no tick is an ordinary event", () => {
  const { l, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const plain = runner.raw("way.checked", { way: WAY, ver: l.ver, thing: "d1", seam: "data.ok", pass: true }, day(1, 9));
  const ck = runner.raw("way.checked", { way: WAY, ver: l.ver, thing: "d1", seam: "gate.green", pass: true, tick: TICK(1) }, day(1, 9));
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver, checks: [plain.id, ck.id], tick: TICK(1) }, day(1, 9)); sync();
  const r = frank.view();
  assert.deepEqual([isSpine(r, R.id), seatOf(r, plain.id)?.as, seatOf(r, ck.id), whyOf(r, ck.id)], [true, "seen", undefined, ["no_firing"]]);
});

test("what the result lists does not depend on the order the events were handed in: the unread ids come sorted", () => {
  const { w, marco, sync } = setup();
  const b = marco.raw("way.note", { way: WAY, thing: "d1", text: "b" }, day(1, 9), { unread: true, id: "zz-later" });
  const a = marco.raw("way.note", { way: WAY, thing: "d1", text: "a" }, day(1, 10), { unread: true, id: "aa-first" }); sync();
  assert.deepEqual([w.full().unread, w.fold([...w.all].reverse()).unread], [[a.id, b.id], [a.id, b.id]]);
});

test("one stretch of 200,000 events with an apply among them folds (what a runner had seen is taken one event at a time, not spread into one call)", () => {
  const { w, l, marco, frank, runner } = setup();
  const t = day(2, 10), key = marco.key, from = w.heads.get(key)!.n + 1;
  const many: WayEvent[] = [];
  for (let i = 0; i < 200_000; i++) many.push({ id: `j${i}`, kind: "way.proposed", item: WAY, value: { way: WAY }, at: t, by: MARCO, key, n: from + i, after: t });
  const ap: WayEvent = { id: "j-apply", kind: "way.applied", item: WAY, value: { way: WAY, from: l.ver, to: l.ver, reader: 1 }, at: t, by: MARCO, key, n: from + many.length, after: t };
  const seal = runner.raw("way.seen", { way: WAY, ver: l.ver }, t + 60_000, { base: ["j-apply", frank.mine().at(-1)!.id] });
  const r = w.fold([...w.all, ...many, ap]);
  assert.deepEqual([isSpine(r, seal.id), r.copies, r.seq.filter((x) => x.as === "seen").length >= 200_001], [true, 1, true]);
});

// ---- round 4: a way file that arrives after the events that name it, a runner event this build cannot read, pages

/** v1 (runner the NucBox) applied, d1 made, the NucBox's day-14 turn; then v2 (runner the Mini) agreed and applied on
 *  day 20 at 11:00. `held`: whether the Sols hold v2's file (else it is only loaded: `give(l2)` hands it in) */
function changed(held = true) {
  const w = new World(), l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.runner = "mini@marco"; const l2 = held ? w.add(f2) : load(f2);
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), nuc = new Sol(w, RUNNER), mini = new Sol(w, MINI), all = [marco, frank, nuc, mini];
  const sync = () => all.forEach((x) => x.sync());
  const give = (l: ReturnType<typeof load>) => { w.ways.set(l.ver, l.way!); w.loaded.set(l.ver, l); };
  start(w, l1, day(-1, 12), all);
  marco.press(MAKE("d1", "one", "s1"), day(0, 9)); sync();
  nuc.run(TICK(14)); sync();
  const ag = marco.raw("way.agreed", { way: WAY, to: l2.ver, role: "explorer" }, day(20, 10)); sync();
  frank.raw("way.agreed", { way: WAY, to: l2.ver, role: "keeper" }, day(20, 10, 1)); sync();
  const ap = frank.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, day(20, 11)); sync();
  return { w, l1, l2, marco, frank, nuc, mini, sync, give, ag, ap };
}

test("a candidate that names a version whose file this Sol does not hold waits and says which file; it comes in when the file arrives. Once the file is held, one it does not name as runner counts for nothing, for good, and holds nobody back", () => {
  const { w, l1, l2, frank, mini, give, ag, ap } = changed(false);
  const R = mini.raw("way.seen", { way: WAY, ver: l2.ver }, day(20, 11, 5), { base: [ag.id, ap.id] });
  const forged = frank.raw("way.seen", { way: WAY, ver: l2.ver }, day(20, 11, 30));
  const R2 = mini.raw("way.seen", { way: WAY, ver: l2.ver }, day(20, 12), { base: [forged.id] });
  mini.sync();
  const before = w.full();
  assert.deepEqual([before.p.ver, whyOf(before, ap.id), [R, forged, R2].map((e) => whyOf(before, e.id)), before.spine.includes(R.id)], [l1.ver, ["version_unread"], [["waiting"], ["waiting"], ["waiting"]], false]);
  assert.deepEqual(before.waiting, [{ id: R.id, missing: [], file: l2.ver }, { id: forged.id, missing: [], file: l2.ver }, { id: R2.id, missing: [], file: l2.ver }], "each says the file it lacks");
  const tb = mini.turn(day(20, 13));
  assert.deepEqual([tb.ok, tb.why], [false, "waiting"], "the Mini's own turn on a Sol without the file writes nothing");
  give(l2);
  const r = w.full();
  assert.deepEqual([r.p.ver, r.waiting, [R, R2].map((e) => isSpine(r, e.id)), whyOf(r, forged.id), seatOf(r, ap.id)?.as], [l2.ver, [], [true, true], ["not_spine"], "seen"]);
  assert.equal(mini.turn(day(20, 13)).ok, true);
});

test("round 4 (1): a former runner's candidate under a version nobody holds yet waits from the start, and the receipt after it in its chain behind it: the new runner never names that receipt, so the file arriving later freezes nothing", () => {
  const { w, l1, marco, nuc, mini, sync, give } = changed();
  // v1 with one word changed, the runner still the NucBox: its ver is known, nobody holds the file yet
  const fe = raw(); fe.prev = l1.ver; fe.name = `${fe.name ?? "x"} `; const le = load(fe);
  assert.ok(le.way, JSON.stringify(le.problems));
  const X0 = nuc.raw("way.seen", { way: WAY, ver: le.ver }, day(20, 10, 30), { base: ["e-never-comes"] });
  const X = nuc.raw("way.seen", { way: WAY, ver: l1.ver }, day(20, 10, 31)); sync();
  const t1 = mini.turn(day(20, 11, 5));
  assert.deepEqual([t1.ok, t1.frontier.includes(X.id), t1.pages], [true, false, []], "the receipt behind it is not placed, so it is not named");
  const R = mini.run(day(20, 11, 5)).evs.at(-1)!; sync();
  const held = w.full();
  assert.deepEqual([held.waiting, isSpine(held, R.id)], [[{ id: X0.id, missing: ["e-never-comes"], file: le.ver }, { id: X.id, missing: [] }], true]);
  give(le);
  const made = marco.press(MAKE("d3", "three", "s3"), day(20, 13)).evs[0]; sync();
  for (const at of [day(20, 13, 5), day(21, 9, 30), day(40, 9, 30)]) {
    const run = mini.run(at, {}, { "switch.off": true }); sync();
    assert.deepEqual([run.t.ok, run.t.why], [true, undefined], "the new runner's turn goes on");
  }
  const full = w.full();
  assert.deepEqual(full.waiting, [{ id: X0.id, missing: ["e-never-comes"] }, { id: X.id, missing: [] }], "only the former runner's own key stands still");
  assert.deepEqual([isSpine(full, R.id), w.all.filter((e) => e.key === mini.key && (e.kind === "way.seen" || e.kind === "way.fired")).every((e) => isSpine(full, e.id)), seatOf(full, made.id)?.as, stateOf(full, "d3")], [true, true, "seen", "on_switch"]);
});

test("a way.fired or way.seen this build cannot read stops its key: the candidates after it in its chain wait, and so does another key's event that names it; it is listed unread, not waiting, and its own turn writes nothing. A build that reads it lets them all in", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const U = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 10), { unread: true });
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 11)).evs.at(-1)!; sync();
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 12), { base: [want.id] });
  const twin = new Sol(w, RUNNER, "nucbox-key-2").sync();
  const N = twin.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 13), { base: [U.id] }); sync();
  const r = w.full();
  assert.deepEqual([r.unread, whyOf(r, U.id), r.waiting, seatOf(r, U.id), seatOf(r, want.id)?.as, stateOf(r, "d1")], [[U.id], ["unread"], [{ id: R.id, missing: [] }, { id: N.id, missing: [] }], undefined, "tail", "wanted"]);
  const t = runner.turn(day(1, 14));
  assert.deepEqual([t.ok, t.why], [false, "waiting"]);
  const read = w.fold(w.all.map((e) => (e.id === U.id ? { ...e, unread: false } : e)));
  assert.deepEqual([read.unread, read.waiting, [U, R, N].map((e) => isSpine(read, e.id)), seatOf(read, want.id)?.as], [[], [], [true, true, true], "seen"]);
});

test("what an event is never depends on the build that reads it: an answer this build cannot read is in its candidate's batch all the same (the runner's turn does not name it, it shares the candidate's fate), and a check a firing names is its lead", () => {
  const { w, l, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  // a second key under the runner's machine name: a receipt that names an id that never comes, and an answer to it
  const twin = new Sol(w, RUNNER, "nucbox-key-2").sync();
  const C = twin.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 9), { base: ["never"] });
  const X = twin.raw("way.note", { way: WAY, thing: "d1", text: "x", because: C.id }, day(1, 9, 1)); sync();
  for (const unread of [false, true]) {
    const evs = w.all.map((e) => (e.id === X.id && unread ? { ...e, unread: true } : e));
    const r = w.fold(evs);
    assert.deepEqual([r.waiting, seatOf(r, X.id), r.unread], [[{ id: C.id, missing: ["never"] }, { id: X.id, missing: [] }], undefined, unread ? [X.id] : []]);
    const t = turn(WAY, evs, w.ways, w.book, runner.me, day(1, 10));
    assert.deepEqual([t.ok, t.frontier, t.news], [true, [], false], "nothing to name: the answer is no ordinary event, read or not");
  }
  const a = checkThenApply(5), [ck, F] = a.f.evs;
  const r = a.w.fold(a.w.all.map((e) => (e.id === ck.id ? { ...e, unread: true } : e)));
  const order = r.seq.map((x) => x.e.id);
  assert.deepEqual([seatOf(r, ck.id)?.as, seatOf(r, ck.id)?.taken, whyOf(r, ck.id), order.indexOf(F.id) - order.indexOf(ck.id), isSpine(r, F.id)], ["lead", false, ["unread"], 1, true]);
  // and a firing this build cannot read keeps its lead and its batch: they wait behind it, none is an ordinary event
  const u = a.w.fold(a.w.all.map((e) => (e.id === F.id ? { ...e, unread: true } : e)));
  const group = a.f.evs.filter((e) => e.id !== F.id);
  assert.deepEqual([whyOf(u, F.id), u.unread, group.map((e) => [seatOf(u, e.id), whyOf(u, e.id)]), u.waiting], [["unread"], [F.id], group.map(() => [undefined, ["waiting"]]), group.map((e) => ({ id: e.id, missing: [] }))]);
});

test("round 5 (1): a page this build cannot read is a page all the same: it has no batch on either build, so a note that answers it is an ordinary event on both, and the runner's receipt that names the note stands on both", () => {
  const { w, l, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const twin = new Sol(w, RUNNER, "nucbox-key-2").sync();
  const P = twin.raw("way.seen", { way: WAY, ver: l.ver, more: true }, day(1, 9));
  const X = twin.raw("way.note", { way: WAY, thing: "d1", text: "x", because: P.id }, day(1, 9, 1)); sync();
  const s = runner.seal(day(1, 9, 30)), R = s.evs.at(-1)!; sync();
  assert.deepEqual([s.t.frontier, s.t.news], [[X.id], true]);
  for (const unread of [false, true]) {
    const r = w.fold(w.all.map((e) => (e.id === P.id && unread ? { ...e, unread: true } : e)));
    assert.deepEqual([isSpine(r, R.id), seatOf(r, X.id)?.as, r.waiting, whyOf(r, P.id), r.unread], [true, "seen", [], unread ? ["unread"] : [], unread ? [P.id] : []], `unread: ${unread}`);
  }
});

test("round 5 (2): a turn that writes a page before a firing: the act handed out with what is written (sealedDue) names its move's place there, not in due()'s drafts; the act's answer names the move and is taken. Read from the unmoved index it would name the firing", () => {
  const { w, l, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  for (let i = 0; i < 300; i++) new Sol(w, MARCO, `marco-box-${i}`).raw("way.note", { way: WAY, thing: "d1", text: "x" }, TICK(21) - 60_000);
  sync();
  const f = runner.run(TICK(21)); sync();
  const was = f.d.acts[0].after, a = f.acts[0], move = f.evs[a.after];
  assert.deepEqual([f.t.pages.length, f.d.acts.length, f.acts.length, a.after - was, f.d.drafts[was].kind, move.kind, f.evs[was].kind], [1, 1, 1, 1, "way.move", "way.move", "way.fired"]);
  const ans = runner.write([{ kind: "way.acted", item: "d1", at: TICK(21) + 60_000, value: { way: WAY, ver: l.ver, thing: "d1", seam: a.seam, pv: a.pv, pkg: a.pkg, ok: false, because: move.id } }])[0]; sync();
  runner.seal(TICK(21) + 20 * 60_000); sync();
  const r = w.full();
  assert.deepEqual([seatOf(r, ans.id)?.taken, whyOf(r, ans.id), r.p.things.d1?.red], [true, [], ["switch.off"]]);
  // nothing put first: nothing moves; a turn that may not write hands out no act
  const t = { p: empty(WAY), ver: l.ver, frontier: [] as string[], pages: [] as string[][], news: false, ok: true, last: TICK(21) };
  const fire = [{ kind: "way.fired", item: "d1", at: TICK(21), value: { way: WAY } }, { kind: "way.move", item: "d1", at: TICK(21), value: { way: WAY }, cause: 0 }];
  assert.deepEqual(sealedDue(t, { drafts: fire, acts: [{ after: 1 }] }, l.way!, TICK(21)).acts, [{ after: 1 }]);
  assert.deepEqual(sealedDue({ ...t, pages: [["p"], ["q"]] }, { drafts: fire, acts: [{ after: 1 }] }, l.way!, TICK(21)).acts, [{ after: 3 }]);
  assert.deepEqual(sealedDue({ ...t, ok: false, why: "not_runner" }, { drafts: fire, acts: [{ after: 1 }] }, l.way!, TICK(21)), { drafts: [], acts: [] });
});

test("round 5 (2), the guard: the engine's face (fold.ts) hands out sealedDue and not sealed, so what a turn writes and where its acts stand come from one call", () => {
  assert.deepEqual(["sealedDue" in face, "sealed" in face, typeof sealed], [true, false, "function"]);
});

/** round 6 (1)'s book: Frank on two keys (both sign person:frank). Key A writes the five checks of a promote (each
 *  saying `tick` when one is given: lead checks), key B the promote that names them; the runner's turn in between
 *  (`mid`) and the one that seals the promote; then it seals again the next day */
function promoteOnTwoKeys(tick?: number) {
  const { w, l, marco, frank, runner, sync } = setup();
  runner.run(day(0, 10)); sync();
  marco.press({ thing: "d1", move: "want" }, day(1, 9)); sync();
  runner.run(day(1, 9, 30)); sync();
  const frankB = new Sol(w, FRANK, "k:frank-b").sync();
  const at = day(1, 10), d = decide(l, frank.view(at).p, { asker: FRANK, thing: "d1", move: "promote" }, at, SOLID);
  const ids = d.drafts.map(() => w.nextId()), mi = d.drafts.findIndex((x) => x.kind === "way.move");
  const checks = d.drafts.flatMap((x, i) => (x.kind === "way.checked" ? [frank.sign({ kind: x.kind, item: x.item, value: { ...written(x, ids), ...(tick !== undefined ? { tick } : {}) }, at, id: ids[i], by: FRANK })] : []));
  sync();
  const mid = runner.turn(day(1, 10, 15));
  const M = frankB.sign({ kind: "way.move", item: "d1", value: written(d.drafts[mi], ids), at: at + 1000, id: ids[mi], by: FRANK });
  sync();
  const R = runner.run(day(1, 10, 30)).evs.at(-1)!; sync();
  runner.run(day(2, 9, 30)); sync();
  return { w, l, frank, runner, sync, ok: d.ok, checks, mid, M, R };
}

test("round 6 (1): a firing written afterwards cannot claim checks that were ordinary events: a promote the runner sealed, judged on checks another key of the same person wrote, stands when that key later writes a firing right after them that names them (under the version in force, saying no tick as they say none, under a version nobody holds, or one this build cannot read)", () => {
  for (const mode of ["plain", "notick", "junk", "unread"] as const) {
    const { w, l, frank, sync, ok, checks, mid, M, R } = promoteOnTwoKeys();
    const before = w.full();
    assert.deepEqual([ok, checks.length, mid.frontier, taken(before, M.id), stateOf(before, "d1"), isSpine(before, R.id)], [true, 5, [checks.at(-1)!.id], true, "official", true], "sealed: the runner named the checks, then the promote");
    const junk = "f".repeat(64);
    const F = frank.raw("way.fired", { way: WAY, ver: mode === "junk" ? junk : l.ver, trigger: "expire", thing: "d1", ...(mode === "notick" ? {} : { tick: TICK(1) }), checks: checks.map((c) => c.id) }, day(5, 9), mode === "unread" ? { unread: true } : {}); sync();
    assert.equal(F.n, checks.at(-1)!.n + 1, "right after the checks on their key's chain");
    const after = w.fold(w.all, FAR, { before: R.id });
    assert.deepEqual([checks.map((c) => seatOf(after, c.id)?.as), taken(after, M.id), whyOf(after, M.id), stateOf(after, "d1"), after.before?.things.d1?.state, isSpine(after, R.id)], [checks.map(() => "seen"), true, [], "official", "official", true], `${mode}: the checks stay where the runner's event placed them, and the promote stands`);
    assert.deepEqual([whyOf(after, F.id), after.waiting, after.unread], { plain: [["not_spine"], [], []], notick: [["not_spine"], [], []], junk: [["waiting"], [{ id: F.id, missing: [], file: junk }], []], unread: [["unread"], [], [F.id]] }[mode], `${mode}: the firing alone is set aside`);
    assert.equal(canon(after), canon(before), `${mode}: nothing the spine placed moved`);
  }
});

test("round 6 (1): a lead check (a way.checked that says a tick) is never an ordinary event: no turn names it and it owes no receipt, a receipt that names a later event of its key does not take it in, and a press that names it is judged without it, from the start and for good; a firing of its key written right after it later changes nothing", () => {
  const { w, frank, runner, sync, ok, checks, mid, M, R } = promoteOnTwoKeys(TICK(1));
  assert.deepEqual([ok, checks.every((c) => c.value?.tick === TICK(1)), mid.ok, mid.frontier, mid.news], [true, true, true, [], false], "the turn that holds only the lead checks names none of them and owes no receipt");
  const note = frank.raw("way.note", { way: WAY, about: WAY, words: "later on the same key" }, day(3, 9)); sync();
  const R2 = w.all.find((e) => e.key === R.key && e.n > R.n && e.kind === "way.seen")!;
  const before = w.full();
  assert.deepEqual([checks.map((c) => [seatOf(before, c.id), whyOf(before, c.id)]), taken(before, M.id), whyOf(before, M.id), stateOf(before, "d1"), isSpine(before, R.id)], [checks.map(() => [undefined, ["no_firing"]]), false, ["rule_unread"], "wanted", true], "the promote was never taken: the checks it names were folded nowhere");
  // the runner's next receipt names the note, a later place of the checks' key: the checks are not taken in with it
  const R3 = runner.seal(day(3, 10)).evs.at(-1)!; sync();
  const named = w.full();
  assert.deepEqual([R3.base, isSpine(named, R3.id), seatOf(named, note.id)?.as, checks.map((c) => [seatOf(named, c.id), whyOf(named, c.id)]), R2 !== undefined], [[note.id], true, "seen", checks.map(() => [undefined, ["no_firing"]]), true]);
  assert.deepEqual([taken(named, M.id), whyOf(named, M.id), stateOf(named, "d1")], [false, ["rule_unread"], "wanted"], "and the promote stays refused");
});

test("round 6 (1): the lead checks' own key writes a firing right after them: under a member's key they are set aside with it, and nothing the spine placed moves", () => {
  const { w, l, frank, sync, checks, M, R } = promoteOnTwoKeys(TICK(1));
  const before = w.full();
  const F = frank.raw("way.fired", { way: WAY, ver: l.ver, trigger: "expire", thing: "d1", tick: TICK(1), checks: checks.map((c) => c.id) }, day(5, 9)); sync();
  const after = w.full();
  assert.deepEqual([F.n, whyOf(after, F.id), checks.map((c) => [seatOf(after, c.id), whyOf(after, c.id)]), taken(after, M.id), stateOf(after, "d1"), isSpine(after, R.id)], [checks.at(-1)!.n + 1, ["not_spine"], checks.map(() => [undefined, ["not_spine"]]), false, "wanted", true]);
  assert.equal(canon(after), canon(before));
});

test("round 6 (1): a lead check is not a batch member either: one that answers the candidate before it ends that candidate's batch (the same check saying no tick is a member)", () => {
  for (const lead of [true, false]) {
    const { l, frank, runner, sync } = setup();
    runner.seal(day(0, 10)); sync();
    const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 9));
    const ck = runner.raw("way.checked", { way: WAY, ver: l.ver, thing: "d1", seam: "gate.green", pass: true, because: R.id, ...(lead ? { tick: TICK(1) } : {}) }, day(1, 9, 1));
    const note = runner.raw("way.note", { way: WAY, about: WAY, words: "x", because: ck.id }, day(1, 9, 2)); sync();
    const r = frank.view();
    assert.deepEqual([isSpine(r, R.id), seatOf(r, ck.id)?.as, whyOf(r, ck.id).includes("no_firing"), seatOf(r, note.id)?.as], lead ? [true, undefined, true, "tail"] : [true, "batch", false, "batch"], `lead ${lead}`);
  }
});

/** Map's set and get counted while `f` runs (the Map constructor adds through `set`, so a copy of a map counts) */
function mapWork<T>(f: () => T): { out: T; sets: number; gets: number } {
  const set = Map.prototype.set, get = Map.prototype.get;
  let sets = 0, gets = 0;
  Map.prototype.set = function (this: Map<unknown, unknown>, k: unknown, v: unknown) { sets++; return set.call(this, k, v); } as typeof set;
  Map.prototype.get = function (this: Map<unknown, unknown>, k: unknown) { gets++; return get.call(this, k); } as typeof get;
  try { return { out: f(), sets, gets }; } finally { Map.prototype.set = set; Map.prototype.get = get; }
}

test("round 6 (2): what a candidate has seen is kept as what it added, not as a copy of all its chain has named, and it looks only at the keys that grew: 1,500 keys named once, then 300 receipts that each name one more event, fold (and the turn runs) with work that grows with the events, not with receipts times keys", () => {
  const w = new World(), l1 = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  start(w, l1, day(-1, 12), [marco, frank, runner]);
  for (let i = 0; i < 1500; i++) new Sol(w, MARCO, `k:box-${i}`).raw("way.note", { way: WAY, about: WAY, words: "x" }, day(0, 8) + i);
  runner.sync();
  const s0 = runner.seal(day(0, 9));
  assert.deepEqual([s0.t.ok, s0.t.pages.length, s0.evs.length], [true, 5, 6], "the first seal names every key: five pages and a receipt");
  const one = new Sol(w, MARCO, "k:one-more"), receipts: Ev[] = [];
  for (let i = 0; i < 300; i++) {
    const at = day(1, 0) + i * 60_000, x = one.raw("way.note", { way: WAY, about: WAY, words: "n" }, at);
    receipts.push(runner.raw("way.seen", { way: WAY, ver: l1.ver }, at + 30_000, { base: [x.id] }));
  }
  runner.sync();
  const { out, sets, gets } = mapWork(() => ({ r: w.full(), t: runner.turn(day(2, 0)) }));
  assert.deepEqual([out.r.spine.length, out.r.waiting, receipts.every((e) => isSpine(out.r, e.id)), out.r.seq.filter((x) => x.as === "tail").length, out.t.ok, out.t.frontier, out.t.pages], [301, [], true, 0, true, [], []]);
  const n = w.all.length;
  assert.ok(sets < 40 * n && gets < 40 * n, `${sets} sets and ${gets} gets for ${n} events (receipts times keys: ${300 * 1500})`);
});

test("round 6 (2): a runner key whose receipts are dated out of its chain's order: each has seen what its chain had named up to it and no more, so one set aside for naming an event dated after it does not hand that event to the receipt before it in the chain", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const a1 = marco.raw("way.note", { way: WAY, about: WAY, words: "a1" }, day(1, 9));
  const a2 = marco.raw("way.note", { way: WAY, about: WAY, words: "a2" }, day(2, 8)); sync();
  // in chain order: R1 (dated day 2, 09:00) names a1; R2 (dated back to day 1, 12:00, signed with no `after`) names a2
  const R1 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(2, 9), { base: [a1.id] });
  const R2 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 12), { base: [a2.id], after: null }); sync();
  const r = w.full();
  assert.deepEqual([R2.n, whyOf(r, R2.id), isSpine(r, R1.id), seatOf(r, a1.id)?.as, seatOf(r, a2.id)?.as], [R1.n + 1, ["before_its_base"], true, "seen", "tail"], "R2 is walked first and set aside; R1 has seen a1 only");
  assert.equal(canon(r), canon(w.fold([...w.all].reverse())));
  // the chain's next receipt, in order again, names nothing: it has seen what R2 named, though R1 (walked out of its
  // chain's order, and a spine event) came in between
  const R3 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(3, 9)); sync();
  const r3 = w.full(), order = r3.seq.map((x) => x.e.id);
  assert.deepEqual([isSpine(r3, R3.id), seatOf(r3, a2.id)?.as, order.indexOf(a2.id) < order.indexOf(R3.id), order.indexOf(R1.id) < order.indexOf(a2.id)], [true, "seen", true, true]);
});

test("round 6 (2): a receipt set aside for naming an event dated after it leaves that event to the next spine event of its chain, which names nothing itself", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const a1 = marco.raw("way.note", { way: WAY, about: WAY, words: "a1" }, day(1, 12)); sync();
  const R1 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 9), { base: [a1.id] });
  const R2 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 13));
  const R3 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 14)); sync();
  const r = w.full(), order = r.seq.map((x) => x.e.id);
  assert.deepEqual([whyOf(r, R1.id), isSpine(r, R2.id), isSpine(r, R3.id), seatOf(r, a1.id)?.as, order.indexOf(a1.id) < order.indexOf(R2.id)], [["before_its_base"], true, true, "seen", true]);
});

// ---- round 7

test("round 7: receipts dated out of their chain's order cost no more than in order: 1,500 keys named once, then 300 receipts each dated before the one written before it, fold with work that grows with the events, not with receipts times keys", () => {
  const w = new World(), l1 = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  start(w, l1, day(-1, 12), [marco, frank, runner]);
  for (let i = 0; i < 1500; i++) new Sol(w, MARCO, `k:box-${i}`).raw("way.note", { way: WAY, about: WAY, words: "x" }, day(0, 8) + i);
  runner.sync();
  runner.seal(day(0, 9));
  const receipts: Ev[] = [];
  for (let i = 0; i < 300; i++) receipts.push(runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(2, 0) - i * 60_000, { after: null }));
  const { out, sets, gets } = mapWork(() => w.full());
  assert.deepEqual([out.spine.length, out.waiting, receipts.every((e) => isSpine(out, e.id)), out.seq.filter((x) => x.as === "tail").length], [301, [], true, 0]);
  const n = w.all.length;
  assert.ok(sets < 40 * n && gets < 40 * n, `${sets} sets and ${gets} gets for ${n} events (receipts times keys: ${300 * 1500})`);
});

test("round 7: a receipt walked out of its chain's order looks only at the keys its chain has not placed yet, each as far as it had seen itself: once one has placed all the chain has seen of a key, the ones after it do not look at that key again; a key it placed less of than the chain has seen stays for the chain's next receipt in order", () => {
  const w = new World(), l1 = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  start(w, l1, day(-1, 12), [marco, frank, runner]);
  for (let i = 0; i < 1500; i++) new Sol(w, MARCO, `k:box-${i}`).raw("way.note", { way: WAY, about: WAY, words: "x" }, day(0, 8) + i);
  runner.sync();
  // in the chain's order: the pages and the receipt that name every key (dated day 3), 300 receipts each dated before
  // the one written before it (day 2 and back), and one dated day 1 that names a note dated day 4
  runner.seal(day(3, 0));
  const receipts: Ev[] = [];
  for (let i = 0; i < 300; i++) receipts.push(runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(2, 0) - i * 60_000, { after: null }));
  const late = marco.raw("way.note", { way: WAY, about: WAY, words: "late" }, day(4, 0));
  const X = runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(1, 0), { base: [late.id], after: null });
  const { out: r, sets, gets } = mapWork(() => w.full());
  // X is walked first (the earliest date), in its chain's order, and set aside: every key the chain named is still to
  // place. The receipt walked next places them all but the late note, which it had not seen
  assert.deepEqual([whyOf(r, X.id), receipts.every((e) => isSpine(r, e.id)), r.spine.length, r.waiting, seatOf(r, late.id)?.as, r.seq.filter((x) => x.as === "tail").length], [["before_its_base"], true, 301, [], "tail", 1]);
  const n = w.all.length;
  assert.ok(sets < 40 * n && gets < 40 * n, `${sets} sets and ${gets} gets for ${n} events (receipts times keys: ${300 * 1500})`);
  assert.equal(canon(r), canon(w.fold([...w.all].reverse())));
  // the chain's next receipt, in order, names nothing and has seen the late note: Marco's key was left to it
  const Y = runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(5, 0));
  const r2 = w.full(), order = r2.seq.map((x) => x.e.id);
  assert.deepEqual([isSpine(r2, Y.id), seatOf(r2, late.id)?.as, order.indexOf(late.id) < order.indexOf(Y.id), r2.seq.filter((x) => x.as === "tail").length], [true, "seen", true, 0]);
});

// ---- round 8

test("round 8: one receipt dated back under the runner's key costs its own names and no more: 1,500 keys named, 300 honest receipts, then pages that name every key further and a receipt dated before them all (set aside: it has seen notes dated after it); each of the 300, walked after it, looks at what its chain named since its last spine event, not at every key the chain has named", () => {
  const w = new World(), l1 = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  start(w, l1, day(-1, 12), [marco, frank, runner]);
  const boxes = Array.from({ length: 1500 }, (_, i) => new Sol(w, MARCO, `k:box-${i}`));
  boxes.forEach((b, i) => b.raw("way.note", { way: WAY, about: WAY, words: "a" }, day(0, 8) + i));
  runner.sync();
  runner.seal(day(1, 0));
  const receipts: Ev[] = [];
  for (let i = 0; i < 300; i++) receipts.push(runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(2, 0) + i * 1000));
  const later = boxes.map((b, i) => b.raw("way.note", { way: WAY, about: WAY, words: "b" }, day(50, 0) + i));
  for (let i = 0; i < later.length; i += 256) runner.raw("way.seen", { way: WAY, ver: l1.ver, more: true }, day(1, 1), { base: later.slice(i, i + 256).map((e) => e.id), after: null });
  const X = runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(1, 2), { after: null });
  const { out: r, sets, gets } = mapWork(() => w.full());
  assert.deepEqual([whyOf(r, X.id), receipts.every((e) => isSpine(r, e.id)), r.waiting, r.seq.filter((x) => x.as === "tail").length], [["before_its_base"], true, [], 1500]);
  const n = w.all.length;
  assert.ok(sets < 40 * n && gets < 40 * n, `${sets} sets and ${gets} gets for ${n} events (receipts times keys: ${300 * 1500})`);
  assert.equal(canon(r), canon(w.fold([...w.all].reverse())));
  // the chain's next receipt, in order, has seen the later notes: they were left to it
  const Y = runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(51, 0));
  const r2 = w.full(), order = r2.seq.map((x) => x.e.id);
  assert.deepEqual([isSpine(r2, Y.id), later.every((e) => seatOf(r2, e.id)?.as === "seen" && order.indexOf(e.id) < order.indexOf(Y.id)), r2.seq.filter((x) => x.as === "tail").length], [true, true, 0]);
});

test("round 8: receipts walked behind a later event of their chain that was set aside each look at what their chain named since its last spine event, not from its start: 750 receipts that each name two keys more, then pages and a receipt dated before them all; the work grows with the events, not with receipts times what the chain had named before each", () => {
  const w = new World(), l1 = w.add(raw());
  const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  start(w, l1, day(-1, 12), [marco, frank, runner]);
  runner.sync(); runner.seal(day(0, 7));
  const boxes = Array.from({ length: 1500 }, (_, i) => new Sol(w, MARCO, `k:box-${i}`));
  const first = boxes.map((b, i) => b.raw("way.note", { way: WAY, about: WAY, words: "a" }, day(0, 8) + i));
  runner.sync();
  const receipts: Ev[] = [];
  for (let i = 0; i < 750; i++) receipts.push(runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(2, 0) + i * 1000, { base: [first[2 * i].id, first[2 * i + 1].id] }));
  const later = boxes.map((b, i) => b.raw("way.note", { way: WAY, about: WAY, words: "b" }, day(50, 0) + i));
  for (let i = 0; i < later.length; i += 256) runner.raw("way.seen", { way: WAY, ver: l1.ver, more: true }, day(1, 1), { base: later.slice(i, i + 256).map((e) => e.id), after: null });
  const X = runner.raw("way.seen", { way: WAY, ver: l1.ver }, day(1, 2), { after: null });
  const { out: r, sets, gets } = mapWork(() => w.full());
  const order = r.seq.map((x) => x.e.id);
  assert.deepEqual([whyOf(r, X.id), receipts.every((e) => isSpine(r, e.id)), r.waiting, r.seq.filter((x) => x.as === "tail").length], [["before_its_base"], true, [], 1500]);
  assert.ok(receipts.every((e, i) => [first[2 * i], first[2 * i + 1]].every((x) => seatOf(r, x.id)?.as === "seen" && order.indexOf(x.id) < order.indexOf(e.id) && (i === 0 || order.indexOf(x.id) > order.indexOf(receipts[i - 1].id)))), "each receipt's two notes right before it");
  const n = w.all.length;
  assert.ok(sets < 40 * n && gets < 40 * n, `${sets} sets and ${gets} gets for ${n} events (names before each receipt, summed: ${750 * 750})`);
  assert.equal(canon(r), canon(w.fold([...w.all].reverse())));
});

test("round 8: a receipt walked after a later one of its chain that was set aside sees what its chain had named up to itself, no more and no less: of two keys named before it and one named after, it places the two; the receipt after it places nothing it had not seen; the third key waits for the chain's next receipt in order", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const isaac = new Sol(w, ISAAC);
  const a = marco.raw("way.note", { way: WAY, about: WAY, words: "a" }, day(1, 1));
  const b = frank.raw("way.note", { way: WAY, about: WAY, words: "b" }, day(1, 2));
  const c = isaac.raw("way.note", { way: WAY, about: WAY, words: "c" }, day(1, 3));
  const late = marco.raw("way.note", { way: WAY, about: WAY, words: "late" }, day(9, 0));
  // in the chain's order: R1 names a (day 3), R2 names b (day 4), R3 names c (day 5), X names the late note and is
  // dated day 2: walked first, set aside
  const R1 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(3, 0), { base: [a.id] });
  const R2 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(4, 0), { base: [b.id] });
  const R3 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(5, 0), { base: [c.id] });
  const X = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(2, 0), { base: [late.id], after: null });
  const r = w.full(), order = r.seq.map((x) => x.e.id), at = (e: Ev) => order.indexOf(e.id);
  assert.deepEqual([whyOf(r, X.id), [R1, R2, R3].map((e) => isSpine(r, e.id)), [a, b, c, late].map((e) => seatOf(r, e.id)?.as)], [["before_its_base"], [true, true, true], ["seen", "seen", "seen", "tail"]]);
  assert.ok(at(a) < at(R1) && at(R1) < at(b) && at(b) < at(R2) && at(R2) < at(c) && at(c) < at(R3) && at(R3) < at(late), "each note right before the receipt that named it");
  assert.equal(canon(r), canon(w.fold([...w.all].reverse())));
  // dated the other way round as well (R3 before R2 before R1, all after X): R3 has seen all three and places them;
  // the two walked after it stand at or before a spine event of their chain and look at nothing
  const w2 = setup(), isaac2 = new Sol(w2.w, ISAAC);
  w2.runner.seal(day(0, 10)); w2.sync();
  const [a2, b2, c2] = [w2.marco, w2.frank, isaac2].map((s, i) => s.raw("way.note", { way: WAY, about: WAY, words: "n" }, day(1, 1 + i)));
  const late2 = w2.marco.raw("way.note", { way: WAY, about: WAY, words: "late" }, day(9, 0));
  const S1 = w2.runner.raw("way.seen", { way: WAY, ver: w2.l.ver }, day(5, 0), { base: [a2.id] });
  const S2 = w2.runner.raw("way.seen", { way: WAY, ver: w2.l.ver }, day(4, 0), { base: [b2.id], after: null });
  const S3 = w2.runner.raw("way.seen", { way: WAY, ver: w2.l.ver }, day(3, 0), { base: [c2.id], after: null });
  const X2 = w2.runner.raw("way.seen", { way: WAY, ver: w2.l.ver }, day(2, 0), { base: [late2.id], after: null });
  const q = w2.w.full(), o2 = q.seq.map((x) => x.e.id), at2 = (e: Ev) => o2.indexOf(e.id);
  assert.deepEqual([whyOf(q, X2.id), [S1, S2, S3].map((e) => isSpine(q, e.id)), [a2, b2, c2, late2].map((e) => seatOf(q, e.id)?.as)], [["before_its_base"], [true, true, true], ["seen", "seen", "seen", "tail"]]);
  assert.ok([a2, b2, c2].every((e) => at2(e) < at2(S3)) && at2(S3) < at2(S2) && at2(S2) < at2(S1) && at2(S1) < at2(late2));
  // the chain's next receipt in order places the late note, and nothing twice
  const Y = w2.runner.raw("way.seen", { way: WAY, ver: w2.l.ver }, day(10, 0));
  const q2 = w2.w.full();
  assert.deepEqual([isSpine(q2, Y.id), seatOf(q2, late2.id)?.as, q2.seq.length, new Set(q2.seq.map((x) => x.e.id)).size], [true, "seen", q.seq.length + 1, q.seq.length + 1]);
});

test("round 8 (replay): a version over its own history differs nowhere in a team's book where its order and its times part: a press the runner's turn had seen though it is dated after that turn is tried before the turn's triggers, as it was folded; a refusal judged at the very time of its thing's firing is the person's, not the trigger's; a thing made at the very moment of a tick the runner's turn ran at is there before the trigger; a refusal that stands before its thing's birth (signed by a clock behind the maker's) is no part of the life (round 9: the fold passes it over)", () => {
  const steps = (xs: { kind: string; move?: string; trigger?: string; why?: string }[]) => xs.map((s) => `${s.kind.slice(4)} ${s.move ?? s.trigger ?? ""}${s.why ? ` ${s.why}` : ""}`.trim());
  {
    // an extend dated a minute after the day-14 turn that had seen it: folded before the remind, judged at the turn's time
    const { w, l, marco, runner, sync } = setup();
    assert.equal(marco.press({ thing: "d1", move: "extend" }, TICK(14) + 60_000, {}, { now: TICK(14) - 1 }).d.ok, true); sync();
    runner.run(TICK(14)); sync();
    const r = replay(w.all, w.ways, l, l, w.book, { now: FAR });
    assert.deepEqual([r.differ, steps(r.things[0].was), steps(r.things[0].now)], [0, ["made", "move make", "move extend", "fired remind"], ["made", "move make", "move extend", "fired remind"]]);
  }
  {
    // an extend refused for its rule, judged at the time of the day-21 turn that expired the draft
    const { w, l, marco, runner, sync } = setup();
    runner.run(TICK(14)); sync();
    assert.equal(marco.press({ thing: "d1", move: "extend" }, TICK(21) + 60_000, {}, { now: TICK(21) - 1 }).d.why, "rule_failed"); sync();
    runner.run(TICK(21), {}, { "switch.off": true }); sync();
    const r = replay(w.all, w.ways, l, l, w.book, { now: FAR }), life = ["made", "move make", "fired remind", "refused extend rule_failed", "fired expire", "move drop", "acted"];
    assert.deepEqual([r.differ, steps(r.things[0].was), steps(r.things[0].now)], [0, life, life]);
  }
  {
    // a draft made at 09:30 sharp, the runner's turn at 09:30 sharp, under a remind that asks no age
    const f = raw(); f.triggers.remind.if.all[1].older = "0d";
    const w = new World(), l = w.add(f);
    const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), sync = () => { for (const s of [marco, frank, runner]) s.sync(); };
    start(w, l, day(-1, 12), [marco, frank, runner]);
    marco.press(MAKE("d1"), TICK(0)); sync();
    runner.run(TICK(0)); sync();
    const r = replay(w.all, w.ways, l, l, w.book, { now: FAR });
    assert.deepEqual([r.differ, steps(r.things[0].was), steps(r.things[0].now)], [0, ["made", "move make", "fired remind"], ["made", "move make", "fired remind"]]);
  }
  {
    // Frank's clock a minute behind Marco's: his refused promote of d2 stands before d2's make in the team's order
    const { w, l, marco, frank, runner, sync } = setup();
    marco.press(MAKE("d2", "two", "s2"), day(0, 10)); sync();
    const x = frank.press({ thing: "d2", move: "promote" }, day(0, 10) - 60_000, {}, { now: day(0, 10) }); sync();
    runner.run(TICK(1)); sync();
    const full = w.full(), order = full.seq.map((s) => s.e.id), made = w.all.find((e) => e.kind === "way.made" && e.value?.thing === "d2")!;
    assert.deepEqual([x.d.why, order.indexOf(x.evs.at(-1)!.id) < order.indexOf(made.id), seatOf(full, x.evs.at(-1)!.id)?.taken, full.p.skipped.find((k) => k.id === x.evs.at(-1)!.id)?.why], ["wrong_state", true, false, "stale_refusal"]);
    const r = replay(w.all, w.ways, l, l, w.book, { now: FAR }), d2 = r.things.find((t) => t.thing === "d2")!;
    assert.deepEqual([r.differ, steps(d2.was), steps(d2.now)], [0, ["made", "move make"], ["made", "move make"]]);
  }
  {
    // the other way round: the runner's 09:30 turn stands before a make of 09:30 it had not seen. The remind (left as it
    // was, asking no age) ran on no d2 then, and is not run on it there again though a changed trigger ticks at 09:30:
    // d2 is reminded at the next turn, as it was
    const f = raw(); f.triggers.remind.if.all[1].older = "0d";
    const w = new World(), l = w.add(f);
    const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), sync = () => { for (const s of [marco, frank, runner]) s.sync(); };
    start(w, l, day(-1, 12), [marco, frank, runner]);
    marco.press(MAKE("d1"), day(0, 9)); sync();
    runner.run(TICK(0)); sync();
    marco.press(MAKE("d2", "two", "s2"), TICK(0)); sync();
    runner.run(TICK(1)); sync();
    const g = raw(); g.triggers.remind.if.all[1].older = "0d"; g.prev = l.ver; g.rules.expired.any[0].all[0].older = "30d";
    const r = replay(w.all, w.ways, l, w.add(g), w.book, { now: FAR }), d2 = r.things.find((t) => t.thing === "d2")!;
    assert.deepEqual([r.differ, d2.was.map((s) => [s.kind, s.tick]), d2.now.map((s) => [s.kind, s.tick])], [0, [["way.made", undefined], ["way.move", undefined], ["way.fired", TICK(1)]], [["way.made", undefined], ["way.move", undefined], ["way.fired", TICK(1)]]]);
  }
});

test("round 8 (replay): with no `until` said, a team's book is replayed no further than this Sol's clock reads the open tail (now and the ten minutes): a receipt of the runner's key dated eleven years ahead is a spine event whatever it says, and no longer makes every thing too long to run; an `until` said is the caller's own", () => {
  const { w, l, runner, sync } = setup();
  runner.run(TICK(14)); sync();
  const X = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(4000, 0)); sync();
  const f = raw(); f.prev = l.ver; f.triggers.remind.on = "daily 10:00";
  const N = w.add(f), now = day(20, 0);
  assert.ok(isSpine(w.full(now), X.id));
  const a = replay(w.all, w.ways, l, N, w.book, { now }), b = replay(w.all, w.ways, l, N, w.book, { now, until: now + SKEW }), c = replay(w.all, w.ways, l, N, w.book, { now, until: day(4000, 0) });
  assert.deepEqual(a, b);
  assert.deepEqual([a.things[0].tooLong, a.things[0].same, a.things[0].first?.now?.at], [undefined, false, day(14, 10)], "run again: the remind at 10:00 of day 14");
  assert.deepEqual([c.things[0].tooLong, c.things[0].now], [true, []]);
  // a clock a minute short of the last event taken: the default stops at it and the ten minutes, not before
  const d = replay(w.all, w.ways, l, N, w.book, { now: day(14, 10) - SKEW });
  assert.equal(d.things[0].first?.now?.at, day(14, 10));
  assert.equal(replay(w.all, w.ways, l, N, w.book, { now: day(14, 10) - SKEW - 60_000 }).things[0].now.some((s) => s.kind === "way.fired"), false);
});

// ---- round 9

/** a life's steps, told short */
const told = (xs: { kind: string; move?: string; trigger?: string; seam?: string; ok?: boolean; why?: string }[]) =>
  xs.map((x) => [x.kind.slice(4), x.trigger ?? x.move ?? x.seam, x.why ?? (x.ok === undefined ? undefined : x.ok ? "ok" : "failed")].filter((y) => y !== undefined).join(" "));

test("round 9: a refusal written by a Sol that had not received a press standing before it in the team's order (no clock is off) is nobody's press there: every Sol passes it over (stale_refusal), and a version replayed over its own history differs nowhere: it is not pressed again as a move that goes through", () => {
  {
    // Marco's phone, not holding Frank's promote, refuses a second extend for its rule; it stands after the promote
    const w = new World(), l = w.add(raw());
    const marco = new Sol(w, MARCO), phone = new Sol(w, MARCO, "k:marco-phone"), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, phone, frank, runner];
    const sync = () => { for (const s of all) s.sync(); };
    start(w, l, day(-1, 12), all);
    marco.press(MAKE("d1"), day(0, 9)); sync();
    marco.press({ thing: "d1", move: "want" }, day(0, 10)); sync();
    marco.press({ thing: "d1", move: "extend" }, day(0, 10, 30)); sync();
    assert.equal(frank.press({ thing: "d1", move: "promote" }, day(0, 11), SOLID).d.ok, true);
    const x = phone.press({ thing: "d1", move: "extend" }, day(0, 11, 10));
    sync(); runner.seal(day(1, 0)); sync();
    const full = w.full(), id = x.evs.at(-1)!.id;
    assert.deepEqual([x.d.why, stateOf(full, "d1"), taken(full, id), whyOf(full, id)], ["rule_failed", "official", false, ["stale_refusal"]]);
    for (const s of all) assert.equal(canon(s.view()), canon(full));
    const r = replay(w.all, w.ways, l, l, w.book, { now: day(1, 1) }), life = ["made", "move make", "move want", "move extend", "move promote"];
    assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]);
  }
  {
    // Frank's Sol, not holding Marco's drop, refuses a pull; it stands after the drop, where a pull goes through
    const { w, l, marco, frank, runner, all, sync } = setup();
    marco.press(MAKE("d3", "three", "s3"), day(0, 9, 30)); sync();
    assert.equal(marco.press({ thing: "d3", move: "drop" }, day(0, 10)).d.ok, true);
    const x = frank.press({ thing: "d3", move: "pull" }, day(0, 10, 5));
    sync(); runner.seal(day(1, 0)); sync();
    const full = w.full(), id = x.evs.at(-1)!.id;
    assert.deepEqual([x.d.why, stateOf(full, "d3"), taken(full, id), whyOf(full, id)], ["wrong_state", "to_remove", false, ["stale_refusal"]]);
    for (const s of all) assert.equal(canon(s.view()), canon(full));
    const r = replay(w.all, w.ways, l, l, w.book, { now: day(1, 1) }), d3 = r.things.find((t) => t.thing === "d3")!;
    assert.deepEqual([r.differ, told(d3.was), told(d3.now)], [0, ["made", "move make", "move drop"], ["made", "move make", "move drop"]]);
  }
  {
    // round 10, pinned after a mutation run: Frank's Sol, not holding Marco's drop, refuses a promote for its rule
    // (rule_unread: no check answered); where it stands the draft is dropped, and the refusal there is for the state.
    // A refusal for a rule is never taken in place of one for the state: it is passed over like the others
    const w = new World(), l = w.add(raw());
    const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), all = [marco, frank, runner];
    const sync = () => { for (const s of all) s.sync(); };
    start(w, l, day(-1, 12), all);
    marco.press(MAKE("d1"), day(0, 9)); marco.press({ thing: "d1", move: "want" }, day(0, 9, 40)); sync();
    assert.equal(marco.press({ thing: "d1", move: "drop" }, day(0, 10)).d.ok, true);
    const x = frank.press({ thing: "d1", move: "promote" }, day(0, 10, 5), {});
    sync(); runner.seal(day(1, 0)); sync();
    const full = w.full(), id = x.evs.at(-1)!.id;
    assert.deepEqual([x.d.why, stateOf(full, "d1"), taken(full, id), whyOf(full, id)], ["rule_unread", "to_remove", false, ["stale_refusal"]]);
    for (const s of all) assert.equal(canon(s.view()), canon(full));
    const r = replay(w.all, w.ways, l, l, w.book, { now: day(1, 1) }), life = ["made", "move make", "move want", "move drop"];
    assert.deepEqual([r.differ, told(r.things[0].was), told(r.things[0].now)], [0, life, life]);
  }
});

test("round 9 (replay): in a team's book an act's answer signed minutes after the runner's turn is its own firing's, for each of two drafts fired in one turn; a trigger's move is answered by what its firing and the refusal or the move answering it named", () => {
  {
    const f = raw(); f.triggers.nudge = { on: "daily 09:30", if: { in: ["on_switch", "wanted"] }, do: { act: "switch.off" } };
    const w = new World(), l = w.add(f);
    const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), sync = () => { for (const s of [marco, frank, runner]) s.sync(); };
    start(w, l, day(-1, 12), [marco, frank, runner]);
    marco.press(MAKE("d1"), day(0, 9)); marco.press(MAKE("d2", "two", "s2"), day(0, 9, 1)); sync();
    for (const [n, ok] of [[1, true], [2, false]] as const) {
      const t = runner.run(TICK(n)); sync();
      const fs = fired(t.evs, "nudge");
      assert.deepEqual([fs.length, t.acts.length], [2, 2]);
      for (const fe of fs) runner.raw("way.acted", { way: WAY, ver: l.ver, thing: fe.value!.thing, seam: "switch.off", pv: 1, pkg: l.way!.seams["switch.off"].pkg, ok, because: fe.id }, TICK(n) + 5 * 60_000, { item: String(fe.value!.thing) });
      sync();
    }
    runner.seal(day(3, 0)); sync();
    const r = replay(w.all, w.ways, l, l, w.book, { now: day(3, 1) }), life = ["made", "move make", "fired nudge", "acted switch.off ok", "fired nudge", "acted switch.off failed"];
    assert.deepEqual([r.differ, r.things.map((t) => told(t.was)), r.things.map((t) => told(t.now))], [0, [life, life], [life, life]]);
  }
  {
    const f = raw();
    f.life.draft.moves.find((m: { id: string }) => m.id === "promote").by.push("trigger:auto");
    f.triggers.auto = { on: "daily 09:30", if: { in: ["wanted"] }, do: { move: "promote" } };
    const w = new World(), l = w.add(f);
    const marco = new Sol(w, MARCO), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER), sync = () => { for (const s of [marco, frank, runner]) s.sync(); };
    start(w, l, day(-1, 12), [marco, frank, runner]);
    marco.press(MAKE("d1"), day(0, 9)); sync();
    marco.press({ thing: "d1", move: "want" }, day(0, 10)); sync();
    runner.run(TICK(1)); sync();           // nothing answers: the trigger's promote is refused, unread
    runner.run(TICK(2), SOLID); sync();    // all five pass
    const full = w.full(), r = replay(w.all, w.ways, l, l, w.book, { now: day(3, 0) });
    const life = ["made", "move make", "move want", "fired auto", "refused promote rule_unread", "fired auto", "move promote"];
    assert.deepEqual([stateOf(full, "d1"), full.p.skipped.map((x) => x.why), r.differ, told(r.things[0].was), told(r.things[0].now)], ["official", [], 0, life, life]);
  }
});

test("round 9: a receipt walked behind a later one of its chain that was set aside places each key as far as the latest of the names its chain gave since its last spine event, not the earliest: of two notes of one key named by two receipts dated back, both stand before the earlier-dated receipt", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const a = marco.raw("way.note", { way: WAY, about: WAY, words: "a" }, day(1, 1));
  const b = marco.raw("way.note", { way: WAY, about: WAY, words: "b" }, day(1, 2));
  const late = marco.raw("way.note", { way: WAY, about: WAY, words: "late" }, day(9, 0));
  const R1 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(5, 0), { base: [a.id], after: null });
  const R2 = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(4, 0), { base: [b.id], after: null });
  const X = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(2, 0), { base: [late.id], after: null });
  const name = new Map([[a.id, "a"], [b.id, "b"], [late.id, "late"], [R1.id, "R1"], [R2.id, "R2"], [X.id, "X"]]);
  const r = w.fold(w.all, day(20, 0));
  assert.deepEqual(r.seq.filter((x) => name.has(x.e.id ?? "")).map((x) => `${name.get(x.e.id ?? "")}:${x.as}`), ["a:seen", "b:seen", "R2:spine", "R1:spine", "late:tail"]);
  assert.deepEqual(whyOf(r, X.id), ["before_its_base"]);
});

test("round 7: a time no clock can read: a firing whose tick is 1e300 (a JSON number), past what a Date holds, NaN or Infinity is passed over (bad_tick) and the fold, the turn and the replay go on; before, every fold of the team's book threw", () => {
  for (const tick of [1e300, -1e300, 8.64e15, 8.64e15 + 1, NaN, Infinity, -Infinity]) {
    const { w, l, marco, runner, sync } = setup();
    runner.run(day(0, 10)); sync();
    const F = runner.raw("way.fired", { way: WAY, ver: l.ver, trigger: "remind", thing: "d1", tick }, day(14, 10)); sync();
    const r = w.full();
    assert.deepEqual([isSpine(r, F.id), taken(r, F.id), whyOf(r, F.id), stateOf(r, "d1")], [true, false, ["bad_tick"], "on_switch"], `${tick}`);
    const t = runner.turn(day(15, 0));
    assert.equal(t.ok, true, `${tick}: the runner's own turn`);
    assert.equal(replay(w.all, w.ways, l, l, w.book, { now: FAR }).differ, 0, `${tick}: a replay`);
    assert.equal(marco.press({ thing: "d1", move: "want" }, day(15, 1)).d.ok, true, `${tick}: a press after it`);
    assert.equal(fired(runner.run(TICK(15)).evs, "remind", "d1").length, 1, `${tick}: the honest remind still fires`);
  }
});

test("round 7: an event dated with a number no clock can read has no place (no_place), whoever signed it: a note, a press, the runner's own receipt; a fold handed such a clock folds no tail event (all pending); a turn handed one writes nothing (no_time)", () => {
  for (const at of [1e300, -1e300, 8.64e15, -8.64e15, 8.64e15 - 1000, NaN, Infinity]) {
    const { w, l, marco, runner, sync } = setup();
    runner.run(day(0, 10)); sync();
    const tail = marco.raw("way.note", { way: WAY, about: WAY, words: "tail" }, day(0, 11));
    const note = marco.raw("way.note", { way: WAY, about: WAY, words: "far" }, at);
    const move = marco.raw("way.move", { way: WAY, ver: l.ver, thing: "d1", move: "want", from: "on_switch", to: "wanted", by: "explorer" }, at, { n: note.n + 1, after: null });
    const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, at, { n: runner.mine().length, after: null }); sync();
    const r = w.full();
    assert.deepEqual([whyOf(r, note.id), whyOf(r, move.id), whyOf(r, R.id), isSpine(r, R.id), stateOf(r, "d1")], [["no_place"], ["no_place"], ["no_place"], false, "on_switch"], `${at}`);
    assert.equal(canon(r), canon(w.fold(w.all.filter((e) => ![note.id, move.id, R.id].includes(e.id)))), `${at}: as without them`);
    assert.equal(runner.turn(day(1, 0)).ok, true);
    const blind = w.fold(w.all, at);
    assert.deepEqual([seatOf(r, tail.id)?.as, blind.pending, blind.seq.filter((s) => s.as === "tail")], ["tail", [tail.id], []], `${at}: no tail event folded on a clock that is none`);
    const t = turn(WAY, w.all, w.ways, w.book, runner.me, at);
    assert.deepEqual([t.ok, t.ok ? "" : t.why], [false, "no_time"], `${at}`);
    assert.equal(sealDue(l.way!, at, day(1, 0)), true); assert.equal(sealDue(l.way!, day(0, 10), at), false);
  }
});

test("round 4 (2), (3): more spine events of other keys than a frontier holds (257 keys under the former runner's machine name, a receipt each in the old stretch): the turn names every one of them and the press too; a Sol that lacks any one of them shows the new runner's receipt waiting; adding one more each a round starves no press", () => {
  const { w, l1, marco, mini, sync } = changed();
  mini.run(day(20, 11, 5)); sync();
  const atk = Array.from({ length: 257 }, (_, i) => new Sol(w, RUNNER, `k:old-box-${i}`));
  const hit = () => { const xs = atk.map((a) => a.raw("way.seen", { way: WAY, ver: l1.ver }, day(20, 10, 59))); sync(); return xs; };
  const xs = hit();
  const press = marco.press(MAKE("d2", "two", "s2"), day(20, 12)).evs; sync();
  const now = day(20, 12, 5), t = mini.turn(now), names = new Set([...t.pages.flat(), ...t.frontier]);
  assert.deepEqual([t.ok, t.pages.map((ids) => ids.length), xs.every((x) => names.has(x.id)), names.has(press.at(-1)!.id), names.size, t.news, stateOf({ p: t.p } as never, "d2")], [true, [256], true, true, 258, true, "on_switch"]);
  const [page, R] = mini.run(now).evs; sync();
  assert.deepEqual([page.value?.more, page.base, R.kind, R.value?.more, R.base], [true, t.pages[0], "way.seen", undefined, t.frontier]);
  const full = w.fold(w.all, FAR, { before: R.id });
  assert.deepEqual([isSpine(full, R.id), full.waiting, xs.every((x) => isSpine(full, x.id)), seatOf(full, press[0].id)?.as, snap(full.before!, "d2")], [true, [], true, "seen", snap(t.p, "d2")], "every Sol that holds it all shows, just before the receipt, the state the Mini judged");
  // a Sol that lacks one of them: named on the page, or on the receipt
  const onPage = xs.find((x) => page.base!.includes(x.id))!, onReceipt = xs.find((x) => R.base!.includes(x.id))!;
  const p1 = w.fold(w.all.filter((e) => e.id !== onPage.id)), p2 = w.fold(w.all.filter((e) => e.id !== onReceipt.id));
  assert.deepEqual([p1.waiting, isSpine(p1, R.id)], [[{ id: page.id, missing: [onPage.id] }, { id: R.id, missing: [] }], false]);
  assert.deepEqual([p2.waiting, isSpine(p2, R.id)], [[{ id: R.id, missing: [onReceipt.id] }], false]);
  // each key adds one more, round after round: a press is named and placed each time
  for (let round = 1; round <= 2; round++) {
    hit();
    const again = marco.press(MAKE(`e${round}`, "more", `x${round}`), day(20, 12, 10 * round)).evs; sync();
    const out = mini.run(day(20, 12, 10 * round + 5)).evs; sync();
    assert.deepEqual([out.map((e) => e.value?.more), seatOf(w.full(), again[0].id)?.as, stateOf(w.full(), `e${round}`)], [[true, undefined], "seen", "on_switch"]);
  }
  assert.deepEqual(w.full().waiting, []);
});

test("a page whose receipt was never written (the runner stopped between the two): the next turn owes a receipt though it names nothing, and that receipt orders what the page named", () => {
  const { w, l, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const boxes = [0, 1, 2].map((i) => new Sol(w, MARCO, `marco-box-${i}`).raw("way.proposed", { way: WAY, from: l.ver, slots: ["rules"] }, day(1, 9) + i)); sync();
  const page = runner.raw("way.seen", { way: WAY, ver: l.ver, more: true }, day(1, 10), { base: boxes.map((b) => b.id) }); sync();
  const mid = w.full();
  assert.deepEqual([isSpine(mid, page.id), boxes.map((b) => seatOf(mid, b.id)?.as), mid.waiting], [false, ["tail", "tail", "tail"], []], "a page orders nothing");
  const t = runner.turn(day(1, 11));
  assert.deepEqual([t.ok, t.frontier, t.pages, t.news], [true, [], [], true], "nothing is left to name, and still a receipt is owed");
  const out = runner.run(day(1, 11)).evs; sync();
  assert.deepEqual(out.map((e) => [e.kind, e.value?.more, e.base]), [["way.seen", undefined, undefined]]);
  const r = w.full();
  assert.deepEqual([isSpine(r, out[0].id), boxes.map((b) => seatOf(r, b.id)?.as), boxes.map((b) => seatOf(r, b.id)?.at)], [true, ["seen", "seen", "seen"], boxes.map((b) => b.at)]);
  const t3 = runner.turn(day(1, 12));
  assert.deepEqual([t3.news, sealed(t3, [], l.way!, day(1, 12))], [false, []]);
});

test("a page is a way.seen that says `more: true` and nothing else: `more: false` is a receipt; a page has no batch; one with a bad frontier, or signed by another than the runner, counts for nothing and holds back nobody; another key's event that names a page stands", () => {
  const { w, l, marco, frank, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 9)).evs.at(-1)!; sync();
  const plain = runner.raw("way.seen", { way: WAY, ver: l.ver, more: false }, day(1, 10), { base: [want.id] });
  const page = runner.raw("way.seen", { way: WAY, ver: l.ver, more: true }, day(1, 11));
  const answer = runner.raw("way.note", { way: WAY, thing: "d1", text: "x", because: page.id }, day(1, 11));
  const fat = runner.raw("way.seen", { way: WAY, ver: l.ver, more: true }, day(1, 12), { base: Array.from({ length: 257 }, (_, i) => `gone-${i}`) });
  const forged = frank.raw("way.seen", { way: WAY, ver: l.ver, more: true }, day(1, 12), { base: ["gone"] });
  const R = runner.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 13), { base: [forged.id] });
  const twin = new Sol(w, RUNNER, "nucbox-key-2").sync();
  const N = twin.raw("way.seen", { way: WAY, ver: l.ver }, day(1, 14), { base: [page.id] }); sync();
  const r = w.full();
  assert.deepEqual([isSpine(r, plain.id), seatOf(r, want.id)?.as, stateOf(r, "d1")], [true, "seen", "wanted"]);
  assert.deepEqual([isSpine(r, page.id), seatOf(r, page.id), seatOf(r, answer.id)?.as], [false, undefined, "seen"], "the note after a page is an ordinary event of its key, placed by the key's next receipt");
  assert.deepEqual([whyOf(r, fat.id), whyOf(r, forged.id), isSpine(r, R.id), isSpine(r, N.id), r.waiting], [["bad_frontier"], ["not_spine"], true, true, []]);
});

test("a way.seen that names no version counts for nothing, for good: it does not wait for a file that has no name, and the runner's next receipt after it stands", () => {
  const { w, l, marco, runner, sync } = setup();
  runner.seal(day(0, 10)); sync();
  const none = runner.raw("way.seen", { way: WAY }, day(1, 9));
  const odd = runner.raw("way.seen", { way: WAY, ver: 7 }, day(1, 9, 1));
  const want = marco.press({ thing: "d1", move: "want" }, day(1, 10)).evs.at(-1)!; sync();
  const t = runner.turn(day(1, 11));
  assert.deepEqual([t.ok, t.frontier], [true, [want.id]]);
  const R = runner.seal(day(1, 11)).evs.at(-1)!; sync();
  const r = w.full();
  assert.deepEqual([whyOf(r, none.id), whyOf(r, odd.id), r.waiting, isSpine(r, R.id), seatOf(r, want.id)?.as, stateOf(r, "d1")], [["not_spine"], ["not_spine"], [], true, "seen", "wanted"]);
});

test("exactly a frontier's worth of names is one frontier and no page; exactly two frontiers' worth is one page and a full frontier: the last event of a turn is never left with nothing to name while a page holds names", () => {
  for (const [boxes, pages] of [[253, 0], [509, 1]] as const) {
    const { t, mini, w } = twoRunners(boxes);
    assert.deepEqual([t.pages.map((ids) => ids.length), t.frontier.length], [Array.from({ length: pages }, () => 256), 256], `${boxes} boxes`);
    const mine = w.all.filter((e) => e.key === mini.key);
    assert.deepEqual(mine.map((e) => [e.value?.more, e.base?.length]), [...Array.from({ length: pages }, () => [true, 256]), [undefined, 256]]);
  }
});

test("every event these tests wrote through the engine's drafts fits its way.* row in both books and the trail's item rule", () => {
  assert.ok(kept.length > 500);
  assert.ok(kept.some((e) => e.kind === "way.seen") && kept.some((e) => e.kind === "way.fired" && Array.isArray(e.base)));
  for (const e of kept) {
    assert.equal(fits(e.kind, e.value), null, `${e.kind} ${JSON.stringify(e.value)}`);
    assert.equal(kindError(e.kind, e.value), "", `${e.kind} ${JSON.stringify(e.value)}`);
    assert.match(e.item ?? "", /^[\w.:-]{1,120}$/);
  }
});

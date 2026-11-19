// The team's one order on random schedules (src/way/spine.ts, FORMAT §5), on the real module: the design reviews'
// s10 (the invariant of the runner's turn, honest and with a laptop that dates presses back) and s18 (shuffled
// arrival, partial sets that later complete). Every runner event is written by the engine's own turn (turn, due,
// sealed); the schedules are seeded, so a failure names its seed. The directed scenarios are in way-spine.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fits } from "../src/contract/kinds.ts";
import { kindError } from "../src/team/v3/trail-kinds.ts";
import { FAR, FRANK, MARCO, RUNNER, SOLID, Sol, TICK, WAY, World, canon, day, kept, lcg, raw, snap, start, taken, whyOf, type Ev } from "./fixtures/way-spine-world.ts";
process.env.SOL_COWORK_WAYS = "on";   // the trail checks the ways' kinds only with their switch on (#1105)

const HOUR = 3_600_000, DAY = 86_400_000;
const END = ["official", "removed"];
const moveIds = (evs: readonly Ev[]) => evs.filter((e) => e.kind === "way.move").map((e) => e.id);

/** s10's schedule. Marco on two Sols (a laptop, a phone), Frank, the runner; 45 days, hour by hour. Each hour a Sol
 *  is online or not (online: what it holds goes up, everything up comes down). Marco makes, wants, extends, drops and
 *  once in a while applies a rule-only change (21 days made 18); Frank promotes and pulls; the runner runs its turn
 *  every hour it is online. `hostile`: the laptop also signs, now and then, a press dated one to four days back */
function invariantRun(hostile: boolean, seed: number) {
  const rnd = lcg(seed), pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(rnd() * xs.length)];
  const w = new World();
  const l1 = w.add(raw());
  const f2 = raw(); f2.prev = l1.ver; f2.rules.expired.any[0].all[0].older = "18d"; const l2 = w.add(f2);
  const laptop = new Sol(w, MARCO, "marco-laptop"), phone = new Sol(w, MARCO, "marco-phone"), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  const all = [laptop, phone, frank, runner];
  start(w, l1, day(-1, 12), [phone, frank, runner]);
  for (const x of all) x.sync();
  const mailbox = new Set(w.all.map((e) => e.id));
  /** a firing (the first of its thing in its turn) -> what the runner's turn showed of that thing just before */
  const pre = new Map<string, { thing: string; view: string }>();
  const honest: { ids: string[]; what: string }[] = [], back: string[] = [];
  let n = 0, turns = 0, refusedTurns = 0, several = 0, receipts = 0, firings = 0, applies = 0;
  for (let h = 0; h < 45 * 24; h++) {
    const t0 = day(0, 0) + h * HOUR;
    for (const x of all) {
      const online = x === runner ? rnd() < 0.8 : rnd() < 0.35;
      if (online) { for (const id of x.holds) mailbox.add(id); x.sync([...mailbox]); }
      const at = t0 + Math.floor(rnd() * 50) * 60_000;
      if (x === runner) {
        if (!online) continue;
        const r = x.run(at); turns++;
        if (!r.t.ok) refusedTurns++;
        const fs = r.evs.filter((e) => e.kind === "way.fired"), seen = new Set<string>();
        firings += fs.length;
        if (fs.length > 1) several++;
        if (r.evs.some((e) => e.kind === "way.seen")) receipts++;
        for (const e of fs) { const thing = e.value!.thing as string; if (!seen.has(thing)) { seen.add(thing); pre.set(e.id, { thing, view: snap(r.t.p, thing) }); } }
        continue;
      }
      if (rnd() > 0.03) continue;
      const view = x.view(at);
      const live = Object.values(view.p.things).filter((t) => t.state && !END.includes(t.state));
      if (x === frank) {
        const t = pick(live); if (!t) continue;
        const move = t.state === "wanted" ? "promote" : t.state === "to_remove" ? "pull" : null; if (!move) continue;
        const r = x.press({ thing: t.id, move }, at, SOLID); if (r.d.ok) honest.push({ ids: moveIds(r.evs), what: move });
        continue;
      }
      const c = rnd();
      if (c < 0.25) { const r = x.press({ thing: `d${++n}`, kind: "draft", move: "make", set: { title: "t", switch: `s${n}` } }, at); if (r.d.ok) honest.push({ ids: moveIds(r.evs), what: "make" }); }
      else if (c < 0.27 && view.p.ver === l1.ver) { x.raw("way.applied", { way: WAY, from: l1.ver, to: l2.ver, reader: 1 }, at); applies++; }
      else {
        const t = pick(live); if (!t) continue;
        const move = pick(["want", "want", "extend", "extend", "drop"])!;
        const ago = hostile && x === laptop && rnd() < 0.3 ? Math.floor(1 + rnd() * 4) * DAY : 0;
        const r = x.press({ thing: t.id, move }, at - ago);
        if (ago) back.push(...moveIds(r.evs)); else if (r.d.ok) honest.push({ ids: moveIds(r.evs), what: move });
      }
    }
  }
  for (const x of all) x.sync();
  return { w, all, pre, honest, back, turns, refusedTurns, several, receipts, firings, applies };
}

for (const hostile of [false, true]) {
  test(`rule 5's invariant on random schedules, ${hostile ? "with a laptop that dates presses back" : "honest"}: just before each firing the runner wrote, the full book shows of that thing (and of the version in force) what the runner's own turn showed; the runner's events written by the turn itself, receipts among them, several firings in one turn`, (t) => {
    let F = 0, several = 0, receipts = 0, presses = 0, applies = 0, backSeen = 0, backAside = 0, backTaken = 0;
    const lost = new Map<string, number>();
    for (let s = 1; s <= 10; s++) {
      const r = invariantRun(hostile, s * 7919), fin = r.w.full();
      assert.equal(r.refusedTurns, 0, `seed ${s}: an honest runner's turn always writes`);
      assert.deepEqual([fin.waiting, fin.forked, fin.unread], [[], [], []], `seed ${s}: the full book has nothing waiting`);
      for (const x of r.all) assert.equal(canon(x.view()), canon(fin), `seed ${s}: one state on every Sol`);
      for (const [id, { thing, view }] of r.pre) {
        const at = r.w.fold(r.w.all, FAR, { before: id });
        assert.ok(at.spine.includes(id) && taken(at, id), `seed ${s}: the firing ${id} (${thing}) is a spine event and stands`);
        assert.ok(at.before, `seed ${s}: the state just before ${id}`);
        assert.equal(snap(at.before!, thing), view, `seed ${s}: ${thing} just before the firing ${id}`);
      }
      F += r.pre.size; several += r.several; receipts += r.receipts; applies += r.applies;
      for (const pr of r.honest) for (const id of pr.ids) { presses++; if (!taken(fin, id)) { const k = `${pr.what}:${whyOf(fin, id).join("+") || "?"}`; lost.set(k, (lost.get(k) ?? 0) + 1); } }
      for (const id of r.back) { backSeen++; if (whyOf(fin, id).includes("before_its_prev")) backAside++; else if (taken(fin, id)) backTaken++; }
    }
    assert.ok(F >= 20, `the schedules fire (${F})`);
    assert.ok(several >= 1, "at least one turn wrote several firings");
    assert.ok(receipts >= 100, `the runner wrote receipts (${receipts})`);
    assert.ok(applies >= 1, "a rule change was applied in at least one schedule");
    if (hostile) assert.ok(backAside >= 1 && backSeen > backAside, `some presses dated back are set aside by their own chain (before_its_prev: ${backAside}), the rest are placed (${backSeen - backAside}, of which ${backTaken} stand)`);
    const all = [...lost.values()].reduce((a, b) => a + b, 0);
    t.diagnostic(`${F} firings checked, ${several} turns with several firings, ${receipts} receipts, ${applies} rule changes; ${presses} honest presses the presser's Sol allowed, ${all} not taken in the end ${JSON.stringify(Object.fromEntries([...lost].sort((a, b) => b[1] - a[1])))}${hostile ? `; presses dated back: ${backSeen}, set aside by their chain ${backAside}, standing ${backTaken}` : ""}`);
  });
}

/** s18's schedule: as above over 30 days, the laptop dating some presses two days back, the runner firing in the
 *  hour of the tick and writing a receipt in any other hour it holds something new */
function mixedRun(seed: number) {
  const rnd = lcg(seed);
  const w = new World(); const l = w.add(raw());
  const laptop = new Sol(w, MARCO, "marco-laptop"), phone = new Sol(w, MARCO, "marco-phone"), frank = new Sol(w, FRANK), runner = new Sol(w, RUNNER);
  const all = [laptop, phone, frank, runner];
  start(w, l, day(-1, 12), [phone, frank, runner]);
  for (const x of all) x.sync();
  const box = new Set(w.all.map((e) => e.id));
  let n = 0, held = 0;
  for (let h = 0; h < 30 * 24; h++) {
    const t0 = day(0, 0) + h * HOUR;
    for (const x of all) {
      const on = x === runner ? rnd() < 0.8 : rnd() < 0.35;
      if (on) { for (const id of x.holds) box.add(id); x.sync([...box]); }
      const at = t0 + Math.floor(rnd() * 50) * 60_000;
      if (x === runner) {
        if (!on) continue;
        const tick = TICK(Math.floor((at - day(0, 0)) / DAY));
        if (at >= tick && at < tick + HOUR) { x.run(at); held = x.holds.size; }
        else if (x.holds.size > held) { x.seal(at); held = x.holds.size; }
        continue;
      }
      if (rnd() > 0.04) continue;
      const v = x.view(at), live = Object.values(v.p.things).filter((t) => t.state && !END.includes(t.state));
      const t = live[Math.floor(rnd() * live.length)];
      if (x === frank) { if (t) x.press({ thing: t.id, move: t.state === "wanted" ? "promote" : "pull" }, at, SOLID); }
      else if (rnd() < 0.3 || !t) x.press({ thing: `d${++n}`, kind: "draft", move: "make", set: { title: "t", switch: `s${n}` } }, at);
      else x.press({ thing: t.id, move: ["want", "extend", "drop", "want"][Math.floor(rnd() * 4)] }, at - (x === laptop && rnd() < 0.3 ? 2 * DAY : 0));
    }
  }
  return { w, rnd };
}

test("shuffled arrival gives one state; a partial set (each key's chain cut somewhere, as a Sol that has not caught up holds it) that later completes gives the full set's state; no partial set shows an end state the full set does not have", (t) => {
  let partials = 0, waited = 0, events = 0;
  for (let s = 1; s <= 6; s++) {
    const { w, rnd } = mixedRun(s * 104729);
    const full = w.full(), cf = canon(full);
    events += w.all.length;
    assert.ok(full.spine.length > 20, `seed ${s}: the runner ordered something (${full.spine.length})`);
    for (let k = 0; k < 10; k++) {
      const sh = [...w.all];
      for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      assert.equal(canon(w.fold(sh)), cf, `seed ${s}, shuffle ${k}`);
    }
    const chains = new Map<string, typeof w.all>();
    for (const e of w.all) (chains.get(e.key) ?? chains.set(e.key, []).get(e.key)!).push(e);
    for (let k = 0; k < 40; k++) {
      const part = [...chains.values()].flatMap((c) => c.slice(0, rnd() < 0.5 ? c.length : Math.floor(rnd() * c.length)));
      const r = w.fold(part); partials++;
      if (r.waiting.length) waited++;
      for (const [id, th] of Object.entries(r.p.things)) if (END.includes(th.state ?? ""))
        assert.equal(full.p.things[id]?.state, th.state, `seed ${s}, partial ${k}: ${id} is ${th.state} on the partial set`);
      const has = new Set(part), rest = w.all.filter((e) => !has.has(e));
      assert.equal(canon(w.fold([...part, ...rest])), cf, `seed ${s}, partial ${k}: completed`);
    }
  }
  assert.ok(waited >= 20, `partial sets where a runner event waits for what it named are among them (${waited} of ${partials})`);
  t.diagnostic(`6 schedules, ${events} events, 60 shuffles, ${partials} partial sets (a runner event waited in ${waited})`);
});

test("every event these schedules wrote through the engine's drafts fits its way.* row in both books and the trail's item rule", () => {
  assert.ok(kept.length > 5000);
  assert.ok(kept.some((e) => e.kind === "way.seen") && kept.some((e) => e.kind === "way.fired" && Array.isArray(e.base)));
  const bad: string[] = [];
  for (const e of kept) if (fits(e.kind, e.value) !== null || kindError(e.kind, e.value) !== "" || !/^[\w.:-]{1,120}$/.test(e.item ?? "")) bad.push(`${e.kind} ${JSON.stringify(e.value)}`);
  assert.deepEqual(bad.slice(0, 3), []);
});

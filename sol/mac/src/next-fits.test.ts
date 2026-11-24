// node --test src/*.test.ts: fits you can see and take back (round 8, #1615; merge/fits.js, NOTES.md "Round 8" and its
// fixes' F3): the month's replay (a hold holds, the control does not; the reach decides made, offered or nothing; a mode
// waits for the weekly summary, at most one per mode, made only on Keep), the moves on the fixture with their undo and
// their Diary lines, find, the plain words (F3), and live: every fit move answers "not yet" and no one has fits.
// Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FITS } from "./next/fits/fixture.ts";
import { usePeople, now, people, st, who, palFind, ui } from "./next/fits/state.ts";
import { CODE, COUNTED, REASON, SUMS, because, fresh, hk, sim, week, type Person } from "./next/fits/rules.ts";
import { lines } from "./next/diary/book.ts";

usePeople(FITS);
const P = () => people() as Record<string, Person>;
const PERS = ["Dev", "Denise", "Min-ji", "Jayden"];

test("a hold holds: one Back on day 21 and the kind is never made or offered there again; the control re-makes it", () => {
  for (const n of PERS) {
    const p = P()[n], s = fresh(p), r = sim(p, s, { backOnDay: -9 }), c = sim(p, s, { backOnDay: -9, holds: false });
    const b = r.ev.find((e) => e.t === "back" && e.d === -9);
    assert.ok(b, n + ": something on to take back on day 21");
    const again = (m: typeof r) => m.ev.filter((e) => e.d > -9 && (e.t === "reapply" || e.t === "reoffer") && hk(e.f) === hk(b!.f)).length;
    assert.equal(again(r), 0, n + ": nothing re-made under a hold");
    assert.ok(r.ev.some((e) => e.d > -9 && e.t === "blocked" && hk(e.f) === hk(b!.f)), n + ": a later signal is blocked");
    assert.ok(again(c) >= 1, n + ": the control, without holds, makes it again");
  }
});

test("the reach: Small things makes a surface fit, Ask me first offers it, Only what I ask does nothing", () => {
  const p = P().Dev, s = fresh(p), docs = p.fits.find((f) => f.id === "dev-docs")!;
  assert.equal(sim(p, s, { reach: "small" }).state(docs), "on");
  assert.equal(sim(p, s, { reach: "ask" }).state(docs), "offered");
  assert.equal(sim(p, s, { reach: "off" }).state(docs), "none");
  assert.equal(fresh(P().Sam).reach, "ask", "unanswered stays Ask me first");
});

test("a mode is only offered in the weekly summary, at most one per mode a week, and made only on Keep", () => {
  for (const n of [...PERS, "Sam"]) {
    const p = P()[n];
    for (const r of [sim(p, fresh(p)), sim(p, fresh(p), { crowd: true })]) {
      const per: Record<string, number> = {};
      for (const e of r.ev) if (e.week != null) per[e.week + "|" + e.f.mode] = (per[e.week + "|" + e.f.mode] || 0) + 1;
      assert.ok(Object.values(per).every((v) => v <= 1), n + ": one offer per mode a week");
      assert.ok(r.ev.filter((e) => e.f.layer === "structure" && /offer/.test(e.t)).every((e) => SUMS.includes(e.d)), n + ": offered on a summary day");
    }
    const none = sim(p, { ...fresh(p), decided: {} });
    assert.ok(!p.fits.some((f) => f.layer === "structure" && none.on[f.id] != null), n + ": nothing structural without Keep");
  }
  const dev = P().Dev, w = week(dev, sim(dev, fresh(dev)), 0)!;
  assert.deepEqual(w.offers.map((f) => f.id), ["dev-needs"], "today's summary offers Build's one change");
});

test("on the fixture: Keep, Back (a hold), let it go, each with its undo and its one Diary line", () => {
  CV.load("dev-morning");
  assert.equal(who(), "Dev");
  const f = P().Dev.fits.find((x) => x.id === "dev-needs")!;
  assert.equal(now()!.state(f), "offered");
  const k = CV.M.keep_fit("dev-needs");
  assert.ok(k.ok);
  assert.equal(now()!.state(f), "on");
  assert.equal(lines(0).filter((l) => l.key === "fit:dev-needs:keep").length, 1, "one line: You kept it");
  const b = CV.M.back_fit("dev-needs");
  assert.ok(b.ok);
  assert.equal(now()!.state(f), "held");
  assert.equal(lines(0).filter((l) => l.key === "fit:dev-needs:back:0").length, 1, "one line: a hold now");
  CV.M.let_go_hold("dev-needs");
  assert.notEqual(now()!.state(f), "held");
  b.undo(); k.undo();
  assert.equal(now()!.state(f), "offered", "undo puts it back as it was");
  const r = CV.M.set_reach("off");
  assert.ok(r.ok && st()!.reach === "off" && st()!.asked);
  r.undo();
  assert.equal(st()!.reach, "small");
  const fact = P().Dev.facts[0], g = CV.M.remove_fact(fact.k);
  assert.ok(g.ok && st()!.gone[fact.k]);
  ui.removed!.undo();
  assert.ok(!st()!.gone[fact.k], "the toast's undo gives it back");
  assert.equal(CV.M.keep_fit("nope").ok, false);
});

test("the month in the Diary: a line on the day each fit was made or offered, and the week's summary line", () => {
  CV.load("dev-morning");
  assert.equal(lines(-12).filter((l) => l.key === "fit:dev-docs:on:-12" && l.kind === "fit").length, 1);
  assert.equal(lines(-9).filter((l) => l.key === "fit:dev-config:back:-9").length, 1);
  assert.equal(lines(-14).filter((l) => l.key === "week:-14" && l.kind === "week").length, 1);
  CV.load("dev-week");   // Dev too, but not one of the five panel scenarios
  assert.equal(lines(-12).filter((l) => /^fit:/.test(l.key || "")).length, 0, "only the five panel scenarios carry the month");
});

test("find: a fit's own words find it first; a found fit lands on its knob in its folder at Middle", () => {
  CV.load("dev-morning");
  const hit = palFind("Show the AI’s steps documentation runs")[0];
  assert.equal(hit.fit, "dev-docs");
  const r = CV.M.land_on_fit("dev-docs");
  assert.ok(r.ok);
  assert.equal(CV.S.region, "cli");
  assert.equal(CV.S.dist, "middle");
  assert.equal(ui.knob?.id, "dev-docs");
  CV.M.map();
  assert.equal(ui.knob, null, "leaving the folder closes the knob");
  const n = CV.M.land_on_fit("dev-needs");   // no folder: its row in Who set what, ringed
  assert.ok(n.ok);
  assert.equal(ui.page, "fits");
  assert.equal(ui.ringed, "dev-needs");
  CV.M.page(null);
});

test("plain words (F3): every fit says why with a count from the person's own history, no lone key letter, no cut quote", () => {
  for (const [n, p] of Object.entries(P())) {
    for (const f of p.fits) {
      assert.match(because(f), REASON, `${n} ${f.id}`);
      assert.match(f.why, COUNTED, `${n} ${f.id}: a count`);
      for (const k of ["setting", "value", "line", "offer", "offerLine", "why"] as const) if (f[k]) assert.ok(!CODE(f[k]!), `${n} ${f.id}.${k}: ${f[k]}`);
    }
    for (const x of p.facts) assert.ok(!CODE(x.fact), `${n}: ${x.fact}`);
  }
  assert.ok(CODE("R on a running AI"), "a lone key letter is caught");
  assert.ok(!CODE("A key to narrow a running AI"));
});

test("live: every fit move answers not yet", () => {
  CV.setMode("live");
  try {
    for (const [m, a] of [["keep_fit", "dev-needs"], ["not_now_fit", "dev-needs"], ["back_fit", "dev-docs"], ["let_go_hold", "dev-config"], ["set_reach", "ask"], ["remove_fact", "fit:1"], ["land_on_fit", "dev-docs"]] as const) {
      const r = CV.M[m](a);
      assert.equal(r.ok, false, m);
      assert.equal(r.why, "not yet", m);
    }
  } finally { CV.setMode("fixture"); }
});

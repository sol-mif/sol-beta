// node --test src/*.test.ts: the people's rules (slices 8+9, #1615; merge/people.js): each person's setups (P4), the one
// queue (P3: the canvas's asks + the Cowork waits that count + the Social cards, once each, ⌘J in one order), one answer
// lowers the count by one and writes one diary line, "later" goes last, the 13 moves map to their functions (P5), live
// Social answers "not yet", and today's team.v3 front reads as a setup. Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { FN, answer, cardsAll, circle, count, crumbOf, diaryLines, items, needsCount, onPeople, pagesOf, sortedGroups, st, team, use, waitsAll, live } from "./next/people/queue.ts";
import { teamOf } from "./next/cv/wire/people.ts";

test("each person has their own setups (P4), and the address reaches any", () => {
  const want: Record<string, [string, string]> = { "dev-morning": ["T5", "F2"], jayden: ["T2", "F8"], denise: ["T4c", "F7"], minji: ["T4", "F5"], p1: ["T8", "F6"], fresh: ["T1", "F0"], stress: ["T3", "F3"] };
  for (const [who, [s, f]] of Object.entries(want)) { CV.load(who); assert.deepEqual([st().s, st().f], [s, f], who); }
  CV.load("dev-morning"); use({ s: "T7", f: "F3" });
  assert.equal(team().label, "Many groups"); assert.equal(circle().label, "Eighty");
  assert.equal(sortedGroups(team()).length, 5, "T7: the quiet four are left out of the ranking");
});

test("the one queue: Cowork's waits that count, then Social's cards, each once; the badge adds the canvas's asks", () => {
  CV.load("dev-morning");
  assert.deepEqual(waitsAll().map((x) => x.w.kind), ["ask", "join", "hand"], "T5: the 'more' row and nothing else is left out");
  assert.deepEqual(cardsAll().map((c) => c.id), ["c:F2:0", "c:F2:1", "c:F2:2", "c:F2:3"], "F2: needed first, then close, a request last");
  assert.equal(count(), 7);
  assert.equal(needsCount(), CV.open().length + 7);
  use({ f: "F3" });
  const folded = cardsAll().filter((c) => c.fold).map((c) => c.k).sort();
  assert.deepEqual(folded, ["beyond", "help", "invite", "request"], "three of a kind (two requests) fold into one card");
  CV.load("denise");
  assert.deepEqual(waitsAll().map((x) => x.w.kind), ["approve"], "T4c: a client sees only what needs their yes");
  use({ s: "T3" });
  assert.ok(!waitsAll().some((x) => x.w.kind === "ai"), "an AI's own wait doesn't count in Needs you");
});

test("one answer lowers the count by one and writes one diary line; later goes last, still counted", () => {
  CV.load("dev-morning");
  const n = count(), l = diaryLines(), first = items()[0].id, second = items()[1].id;
  assert.ok(answer(first, "Later"));
  assert.equal(count(), n); assert.equal(items().at(-1)!.id, first); assert.equal(items()[0].id, second); assert.equal(diaryLines(), l);
  assert.ok(answer(second, "Make"));
  assert.equal(count(), n - 1); assert.equal(diaryLines(), l + 1);
  assert.ok(!answer(second, "Make"), "answered once");
  const fold = (use({ f: "F3" }), cardsAll().find((c) => c.fold)!), before = count();
  assert.ok(answer(fold.id, "No to all"));
  assert.equal(count(), before - 1, "a card answered whole answers its rows");
  CV.load("dev-morning");
  assert.equal(count(), 7, "a load starts clean");
});

test("⌘J walks the canvas's asks first, then each people item once, on its page", () => {
  CV.load("jayden");
  const ids = items().map((x) => x.id);
  let guard = 0;
  while (CV.open().length && guard++ < 60) { const a = CV.open()[0]; if (!CV.answer(a.id)) { CV.M.next(); if (!CV.answer(a.id)) { CV.M.beside(); CV.answer(a.id); CV.M.beside(); } } }
  assert.equal(CV.open().length, 0);
  const seen: string[] = [];
  for (let i = 0; i < ids.length; i++) { const r = CV.M.next(); assert.ok(r.ok); seen.push(st().focus!); assert.ok(onPeople(CV.S.page), String(CV.S.page)); }
  assert.deepEqual([...new Set(seen)].sort(), [...ids].sort());
});

test("the 13 moves exist and name their functions; pages and crumbs", () => {
  assert.equal(Object.keys(FN).length, 13);
  for (const m of Object.keys(FN)) assert.equal(typeof CV.M[m], "function", m);
  CV.load("jayden");
  const r = CV.M.open_group("bio");
  assert.ok(r.ok); assert.equal(CV.S.page, "group:bio");
  assert.deepEqual(crumbOf(CV.S.page).map((s) => s.label), ["Cowork", "Bio lab report"]);
  r.undo(); assert.equal(CV.S.page, null);
  assert.ok(CV.M.open_friend("Maya").ok); assert.deepEqual(crumbOf(CV.S.page).map((s) => s.label), ["Social", "Maya"]);
  assert.deepEqual(crumbOf("asfriend:Maya").map((s) => s.label), ["Social", "Maya", "As a friend sees you"]);
  assert.ok(pagesOf().includes("first:bio") && pagesOf().includes("link"));
  assert.equal(CV.M.leave_group("bio").ok, false, "leave_group draws but does nothing (carried)");
  const c = CV.M.make_close("Leo"); assert.ok(st().close.has("Leo")); c.undo(); assert.ok(!st().close.has("Leo"));
  assert.ok(CV.say("cowork")?.ok); assert.equal(CV.S.page, "cowork");
});

test("live: Social answers not yet and draws nothing; Cowork reads today's team.v3 front", () => {
  CV.load("dev-morning");
  CV.setMode("live");
  try {
    for (const m of ["see_social", "open_friend", "see_as_friend", "make_link", "pick_face", "answer_card", "make_close"]) assert.deepEqual({ ...CV.M[m](), undo: 0 }, { ok: false, why: "not yet", undo: 0 }, m);
    assert.equal(circle().friends.length, 0);
    live.team = teamOf([{ project: "p1", name: "Parcel", count: 1, next: { label: "pricing waits" }, quiet: false, faces: ["Ana"] }, { project: "p2", name: "Old", count: 0, next: null, quiet: true, faces: [] }],
      [{ kind: "ask", id: "a1", project: "p1", from: "Ana", line: "Ship it?" }, { kind: "yes", id: "y1", project: "p1", from: "Ana", line: "Approve?" }]);
    assert.deepEqual(team().groups.map((g) => g.name), ["Parcel", "Old"]);
    assert.deepEqual(waitsAll().map((x) => x.w.kind), ["ask", "approve"]);
    assert.equal(count(), 2);
    assert.ok(CV.M.see_groups().ok);
  } finally { live.team = null; CV.setMode("fixture"); }
});

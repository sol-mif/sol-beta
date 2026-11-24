// node --test src/*.test.ts: Life and the diary (#1604, slice 4; the mockup's merge/life.js and merge/diary.js): the
// board's rules (due words, the trust gate, what a run makes, the order), the life moves with their one undo, the
// diary's book outside D, its moves, the sweep, and the phrases. Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/life/rules.ts";
import * as B from "./next/diary/book.ts";
import { chosen, compose, composing, undoLast } from "./next/cv/moves/life.ts";

const sticky = (id: string) => CV.D.pieces[id] as L.Sticky;

test("words become a time on the canvas's clock", () => {
  CV.load("jayden");   // 23:00 on day 0
  assert.equal(L.nowMin(), 23 * 60);
  assert.deepEqual(L.parseWhen("friday"), { at: 2 * 1440 + 23 * 60 + 59, allDay: true });
  assert.deepEqual(L.parseWhen("tomorrow 9am"), { at: 1440 + 9 * 60, allDay: false });
  assert.deepEqual(L.parseWhen("9am"), { at: 1440 + 9 * 60, allDay: false }, "a bare time already gone today means tomorrow");
  assert.equal(L.parseWhen("whenever"), null);
  assert.deepEqual(L.splitDue("read chapter 5 by friday").words, "read chapter 5");
  assert.equal(L.splitDue("read chapter 5 for biology").due, null, "a subject is not a time");
  assert.equal(L.whenLabel(1440 + 9 * 60), "Tomorrow 9:00");
});

test("the trust gate reads what the words reach, and the run makes what the words ask", () => {
  assert.equal(L.reach("Read chapter 4"), "stays");
  assert.equal(L.reach("Email the group about the slides"), "leaves");
  assert.equal(L.reach("Pay the electricity bill"), "costs");
  assert.equal(L.reach("Cancel the gym"), "deletes");
  assert.equal(L.price("Pay the electricity bill"), 64);
  assert.equal(L.madeFrom("read chapter 5 for biology").title, "Chapter 5 for biology · one-page summary");
  assert.equal(L.draftFrom("Email the group about the slides").title, "Email · the slides");
  assert.equal(L.draftFrom("Send the report to Ruth").title, "Email to Ruth");
});

test("the board's order: late first, then what waits for you, then by due, then newest", () => {
  CV.load("jayden");
  const o = L.order("reading").map((p) => p.name);
  assert.equal(o[0], "Hand in the lab report", "due 17:00 today, late at 23:00");
  assert.equal(o[1], "Email the group about the slides", "a draft waits for Send");
  assert.ok(!o.includes("Return the library book"), "done is kept a day under the board");
  assert.deepEqual(L.gone("reading").map((p) => p.name), ["Return the library book"]);
  assert.equal(CV.regionOf("reading")?.name, "school", "Jayden's reading folder is called school");
});

test("sticky, run, finish, drop, due: each answers { ok, id, undo } and its undo puts back exactly what it changed", () => {
  CV.load("jayden");
  const r = CV.M.sticky("reading", "read chapter 5 for biology");
  assert.ok(r.ok && r.id);
  assert.equal(sticky(r.id!).name, "Read chapter 5 for biology");
  assert.equal(chosen("reading")?.id, r.id, "a sticky of yours is the chosen one");
  const run = CV.M.run_sticky(r.id);
  assert.ok(run.ok);
  assert.equal(sticky(r.id!).made.length, 1);
  assert.equal(sticky(r.id!).made[0].state, "kept", "inside this Mac: done at once");
  const fin = CV.M.finish(r.id);
  assert.equal(sticky(r.id!).state, "done");
  assert.ok(undoLast(), "⌘Z undoes the last life move");
  assert.equal(sticky(r.id!).state, "open");
  assert.equal(sticky(r.id!).made.length, 1, "the run stays: only the finish was undone");
  fin.undo();   // an undo runs once
  assert.equal(sticky(r.id!).state, "open");
  const due = CV.M.due(r.id, "friday");
  assert.equal(sticky(r.id!).due, 2 * 1440 + 23 * 60 + 59);
  due.undo();
  assert.equal(sticky(r.id!).due, null);
  r.undo();
  assert.equal(CV.D.pieces[r.id!], undefined, "undone, the sticky is gone");
  assert.equal(CV.M.sticky("reading", "   ").ok, false);
  assert.equal(CV.M.sticky("reading", "x", { by: "Bo" }).ok, false, "an AI puts nothing in Life unless asked");
});

test("the gate: a draft waits for Send; a cost asks first and its yes makes it, held", () => {
  CV.load("dev-morning");
  const d = CV.M.sticky("home", "email the landlord about the keys");
  CV.M.run_sticky(d.id);
  assert.equal(sticky(d.id!).made[0].state, "waits");
  const c = CV.M.sticky("money", "pay the water bill");
  const run = CV.M.run_sticky(c.id) as CV.Done & { ask?: string };
  assert.ok(run.ask && CV.D.asks[run.ask], "the gate raised an ask");
  assert.equal(CV.M.run_sticky(c.id).ok, false, "it already asks you");
  CV.S.askLine = run.ask!;
  assert.ok(CV.answer(run.ask!));
  assert.equal(sticky(c.id!).made[0].state, "held", "yes: made, held nine seconds with undo");
  assert.equal(sticky(c.id!).made[0].goes, "paid");
});

test("the diary's book lives beside D, never in it; yesterday is seeded; the moves write and remove with undo", () => {
  CV.load("dev-morning");
  assert.equal(CV.D.diary, undefined, "the book is outside D");
  assert.ok(B.lines(-1).length > 0, "yesterday has lines");
  assert.ok(B.page(-1).closing, "yesterday is closed with its last line");
  const w = CV.M.write("Lunch with Ana at one.");
  assert.ok(w.ok);
  const l = B.byId(w.id!)!;
  assert.ok(l.mine && l.who === "person");
  const rm = CV.M.remove_line(l.id);
  assert.ok(l.removed);
  rm.undo();
  assert.ok(!l.removed);
  const st = CV.M.to_sticky(l.id);
  assert.ok(st.ok && CV.D.pieces[st.id!]?.kind === "sticky", "a line of yours becomes a sticky");
  assert.equal(CV.M.flip(-1).ok, true);
  assert.equal(B.book().showing, -1);
  assert.equal(CV.M.flip(-1).ok, false, "nothing earlier is written");
  CV.M.flip(1);
  assert.equal(B.book().showing, 0);
});

test("a folder's Diary: a line written in it keeps its folder, and the folder's page holds only what is in it (BR1 item 1)", () => {
  CV.load("dev-morning");
  const [a, b] = CV.D.regions.map((r) => r.id);
  assert.ok(a && b, "the morning has two folders");
  const w = CV.M.write("Draft the intro.", { region: a });
  assert.ok(w.ok);
  const l = B.byId(w.id!)!;
  assert.equal(l.region, a, "written in a folder, the line is that folder's");
  assert.ok(B.within(l.region, a), "its folder's Diary holds it");
  assert.ok(!B.within(l.region, b), "another folder's does not");
  assert.ok(B.within(l.region, null) && B.within(null, null), "the canvas's Diary holds everything");
  assert.ok(!B.within(null, a), "a line in no folder is only on the canvas's page");
  const here = B.lines(0).filter((x) => B.within(x.region, a));
  assert.ok(here.some((x) => x.id === l.id) && here.every((x) => x.region === a), "the folder's page: its own lines only");
  assert.ok(B.lines(0).length > here.length, "the canvas's page holds more");
});

test("don't write this down: nothing but your own lines, and the gap is said", () => {
  CV.load("dev-morning");
  CV.M.pause_diary();
  assert.equal(B.note({ who: "Ada", what: "Changed 3 files." }), null);
  assert.ok(B.note({ who: "person", what: "my own line", kind: "mine" }), "your own lines are still written");
  CV.M.pause_diary();
  assert.ok(B.lines(0).some((l) => l.kind === "gap" && /one thing went unwritten/.test(l.what)));
});

test("the sweep: an answered ask is one line; the AI's row is one line (claim and fromRow)", () => {
  CV.load("dev-morning");
  const id = CV.open().find((a) => !a.serious)!.id;
  CV.S.askLine = id;
  assert.ok(CV.answer(id));
  assert.equal(B.allLines().filter((l) => l.key === "ask:" + id).length, 1);
  CV.render();
  assert.equal(B.allLines().filter((l) => l.key === "ask:" + id).length, 1, "swept once only");
  const row = { id: "r1", who: "Ada", fn: "tell", args: { words: "Kai’s tests run against staging now." } };
  const a = B.claim(B.book().seq, row), b = B.claim(B.book().seq, row);
  assert.equal(a, b, "a row is one line");
  assert.equal(B.fromRow({ id: "r2", who: "person", fn: "tell" }), null, "the person's own calls are not the AI's lines");
});

test("the phrases: a sticky by voice, the composer, the diary's words", () => {
  CV.load("jayden");
  CV.say("go to school");
  assert.equal(CV.S.region, "reading");
  CV.say("sticky: read chapter 5 for biology");
  const p = L.all("reading").find((x) => /chapter 5/i.test(x.words))!;
  assert.ok(p);
  CV.say("run it");
  assert.equal(sticky(p.id).made.length, 1);
  CV.say("finish it");
  assert.equal(sticky(p.id).state, "done");
  CV.say("undo");
  assert.equal(sticky(p.id).state, "open");
  assert.ok(compose("reading") && composing("reading"));
  CV.say("pick up the dry cleaning");
  assert.equal(composing()?.words, "pick up the dry cleaning", "while the composer is open, words are its words");
  CV.say("done");
  assert.ok(L.all("reading").some((x) => x.words === "pick up the dry cleaning"));
  CV.say("write: the bus was late");
  assert.ok(B.lines(0).some((l) => l.mine && l.what === "the bus was late"));
  CV.say("shorter");
  assert.equal(B.book().take.length, "short");
  CV.say("yesterday");
  assert.equal(B.book().showing, -1);
  CV.say("today");
  assert.equal(B.book().showing, 0);
});

test("live, the diary is not yet; the life moves go to the engine's wire", () => {
  CV.load("jayden");
  CV.setMode("live");
  try {
    assert.deepEqual({ ok: CV.M.write("x").ok, why: CV.M.write("x").why }, { ok: false, why: "not yet" });
    assert.equal(CV.M.remove_line("dl1").why, "not yet");
    assert.equal(CV.M.sticky("reading", "x").why, "not yet", "no wire attached: nothing is made on the fixture");
  } finally { CV.setMode("fixture"); }
});

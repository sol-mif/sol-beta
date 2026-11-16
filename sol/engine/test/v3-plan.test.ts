// Cowork v3, slice 2 (fr-30, #555), E7: a loose thing dragged onto the plan's lane becomes an item with a guessed date
// and Undo; list, board, calendar and timeline show the same items. All on an in-memory trail, nothing written.
import { test } from "node:test";
import assert from "node:assert/strict";

const P = await import("../src/team/v3/plan.ts");
const TODAY = "2026-11-01";   // a Sunday
const marco = { who: "marco" }, frank = { who: "frank" };

test("a loose thing dropped on the lane becomes one item with a guessed date, and leaves the space", async () => {
  const t = P.memoryTrail();
  const d = await P.drop(t, { project: "sol", actor: frank, title: "we should tidy the sidebar icons" });
  assert.ok("loose" in d && d.loose);
  let rec = await P.readAll(t);
  assert.equal(rec.loose.length, 1);
  const r = await P.toItem(t, { project: "sol", actor: marco, loose: d.loose as string, today: TODAY });
  assert.ok(!("error" in r) || !r.error, JSON.stringify(r));
  const made = r as Exclude<typeof r, { error: string }>;
  assert.equal(made.item.title, "Tidy the sidebar icons");
  assert.equal(made.item.date, "2026-11-06", "no date in its words: next Friday");
  assert.equal(made.why, "date guessed");
  assert.equal(made.item.whose, "frank", "it stays whose it was");
  assert.ok(made.undo, "an undo token");
  rec = await P.readAll(t);
  assert.equal(rec.loose.length, 0, "the space no longer holds it");
  assert.equal(rec.items.length, 1);
  assert.equal(t.all.filter((e) => e.kind === "item.made").length, 1, "one event");
});

test("the date comes from where it was dropped, or from what it says", async () => {
  assert.deepEqual(P.guessDate("logo review to Frank by Nov 5", TODAY), { date: "2026-11-05", why: "date from what it says" });
  assert.deepEqual(P.guessDate("anything", TODAY, "2026-11-12"), { date: "2026-11-12", why: "where you dropped it" });
  assert.equal(P.dateIn("call them tomorrow", TODAY), "2026-11-02");
  assert.equal(P.dateIn("by friday", TODAY), "2026-11-06");
  assert.equal(P.dateIn("bring lunch on the 14th", TODAY), "2026-11-14");
  assert.equal(P.dateIn("Jan 3", TODAY), "2027-01-03", "a month already past is next year's");
  assert.equal(P.dateIn("no date here", TODAY), null);
  const t = P.memoryTrail();
  const d = await P.drop(t, { project: "sol", actor: marco, title: "release notes by Nov 9" });
  const r = await P.toItem(t, { project: "sol", actor: marco, loose: (d as { loose: string }).loose, today: TODAY, target: { date: "2026-11-20" } });
  assert.equal((r as { item: { date: string } }).item.date, "2026-11-20", "a calendar day it was dropped on wins");
});

test("Undo takes the item back to the space, as a third event; nothing is deleted; Undo twice is one undo", async () => {
  const t = P.memoryTrail();
  const d = (await P.drop(t, { project: "sol", actor: marco, title: "pricing page" })) as { loose: string };
  const r = (await P.toItem(t, { project: "sol", actor: marco, loose: d.loose, today: TODAY })) as { undo: string };
  assert.deepEqual(await P.undo(t, { project: "sol", actor: marco, token: r.undo }), { ok: true });
  let rec = await P.readAll(t);
  assert.equal(rec.items.length, 0);
  assert.deepEqual(rec.loose.map((l) => l.id), [d.loose], "the loose thing is back");
  assert.deepEqual(await P.undo(t, { project: "sol", actor: marco, token: r.undo }), { ok: true, already: true });
  assert.equal(t.all.length, 3, "dropped, made, undone: three events, none removed");
  assert.ok("error" in (await P.undo(t, { project: "sol", actor: frank, token: r.undo + "x" })));
  rec = await P.readAll(t);
  const again = await P.toItem(t, { project: "sol", actor: marco, loose: d.loose, today: TODAY });
  assert.ok(!("error" in again), "after Undo it can be planned again");
  const twice = await P.toItem(t, { project: "sol", actor: marco, loose: d.loose, today: TODAY });
  assert.ok("error" in twice, "the same loose thing twice: refused, one item");
  assert.equal((await P.readAll(t)).items.length, 1);
});

test("only the one who did it undoes it", async () => {
  const t = P.memoryTrail();
  const d = (await P.drop(t, { project: "sol", actor: marco, title: "x" })) as { loose: string };
  const r = (await P.toItem(t, { project: "sol", actor: marco, loose: d.loose, today: TODAY })) as { undo: string };
  assert.ok("error" in (await P.undo(t, { project: "sol", actor: frank, token: r.undo })));
});

test("list, board, calendar and timeline show the same items", async () => {
  const t = P.memoryTrail();
  for (const [title, state] of [["one by Nov 3", "open"], ["two by Nov 8", "doing"], ["three", "review"], ["four by Nov 2", "done"], ["five, no date", "blocked"]] as const) {
    const d = (await P.drop(t, { project: "sol", actor: marco, title })) as { loose: string };
    const r = (await P.toItem(t, { project: "sol", actor: marco, loose: d.loose, today: TODAY, target: { state } })) as { item: { id: string } };
    if (title === "five, no date") await P.move(t, { project: "sol", actor: marco, item: r.item.id, date: null });
  }
  const d2 = (await P.drop(t, { project: "other", actor: marco, title: "elsewhere" })) as { loose: string };
  await P.toItem(t, { project: "other", actor: marco, loose: d2.loose, today: TODAY });
  const items = (await P.readAll(t)).items.filter((i) => i.project === "sol");
  assert.equal(items.length, 5);
  const v = P.views(items);
  const ids = new Set(items.map((i) => i.id));
  const same = (xs: string[], name: string) => assert.deepEqual(new Set(xs), ids, `${name} shows the same items`);
  same(v.list, "list");
  same(Object.values(v.board).flat(), "board");
  same([...v.calendar.days.flatMap((d) => d.ids), ...v.calendar.undated], "calendar");
  same([...v.timeline.rows.map((r) => r.id), ...v.timeline.undated], "timeline");
  assert.equal(v.list.length, 5, "each once");
  assert.equal(Object.values(v.board).flat().length, 5);
  assert.equal(v.calendar.undated.length, 1);
  assert.equal(v.board.doing.length, 2, "blocked sits with in progress");
  assert.equal(items.find((i) => i.id === v.list[0])!.state, "review", "waiting on a read first");
});

test("a move from a view is one event: the board's state, the calendar's day", async () => {
  const t = P.memoryTrail();
  const d = (await P.drop(t, { project: "sol", actor: marco, title: "x" })) as { loose: string };
  const r = (await P.toItem(t, { project: "sol", actor: marco, loose: d.loose, today: TODAY })) as { item: { id: string } };
  await P.move(t, { project: "sol", actor: marco, item: r.item.id, state: "doing" });
  await P.move(t, { project: "sol", actor: marco, item: r.item.id, date: "2026-11-11" });
  const it = (await P.readAll(t)).items[0];
  assert.equal(it.state, "doing");
  assert.equal(it.date, "2026-11-11");
  assert.ok("error" in (await P.move(t, { project: "sol", actor: marco, item: "nope", state: "done" })));
});

test("the front: one tile per project, loud first, its one next thing; quiet projects say so", async () => {
  const t = P.memoryTrail();
  const d = (await P.drop(t, { project: "sol", actor: frank, title: "logo review by Nov 5" })) as { loose: string };
  const r = (await P.toItem(t, { project: "sol", actor: frank, loose: d.loose, today: TODAY })) as { item: { id: string } };
  await P.move(t, { project: "sol", actor: frank, item: r.item.id, whose: "marco" });   // handed to me
  const tiles = P.front(await P.readAll(t), "marco", [{ id: "kaat", name: "Kaat" }, { id: "sol", name: "Sol" }], TODAY);
  assert.deepEqual(tiles.map((x) => x.project), ["sol", "kaat"], "one tile each, the one that wants me first");
  assert.equal(tiles[0].count, 1);
  assert.equal(tiles[0].next?.kind, "hand");
  assert.equal(tiles[0].next?.item, r.item.id);
  assert.ok(tiles[1].quiet && !tiles[1].next);
  assert.deepEqual(P.roomsOf(await P.readAll(t), "sol"), ["plan"], "Space and Plan holds something");
  assert.deepEqual(P.roomsOf(await P.readAll(t), "kaat"), [], "an empty project shows no room yet");
});

test("the adapter reads slice 0's words too (what, body)", () => {
  const e = P.fromRaw({ id: "e1", seq: 3, at: "2026-11-01T00:00:00Z", project: "sol", actor: { who: "marco" }, what: "loose.dropped", item: "l1", body: { title: "hi" } });
  assert.equal(e?.kind, "loose.dropped");
  assert.equal(e?.data.title, "hi");
  assert.equal(P.foldPlan([e!]).loose[0].title, "hi");
  assert.equal(P.fromRaw({ nothing: 1 }), null);
});

// node --test src/*.test.ts: moving a folder by hand (BR1 item 5, #1615; plane/moved.ts, notes/drop.ts, cv/moves/plane.ts
// nest). A folder Sol placed and the person moves (into a folder, out to the canvas) writes one scoped fix line, how
// "drag", and its Undo says it back, how "undo"; a folder Sol did not place, or the person placed, writes none. Taken
// out, the others Sol put alike are asked about once in scope's words (sameOut): its yes takes them all out under one
// Undo, a fix line each (takeOut); its no takes nothing. The person's nest and un-nest are kept when the plane is laid out again, over the rule's
// parent (the wire reading a sub-folder again).
// Invented people only (Denise). Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as L from "./next/plane/layout.ts";
import { moveFix, sameOut, undoFix, whereW } from "./next/plane/moved.ts";
import { takeOut } from "./next/cv/moves/plane.ts";
import { othersOf } from "./next/cv/wire/fix.ts";
import type { Known } from "./next/known.ts";
import type { Unseen } from "./next/plane/placed.ts";

const R = (id: string) => CV.D.regions.find((r) => r.id === id)!;
const line = (k: string, by: Known["by"]): Known => ({ k, fact: "Kids' school things, read from the move-in", source: "move-in", by, place: null });
const house = { id: "house", name: "House" }, kids = { id: "kids", name: "Kids" };

test("a folder Sol placed, put in another by hand: one drag fix, from where it was to where it is now", () => {
  const f = moveFix(kids, [line("placed:kids", "sol")], [], null, house);
  assert.deepEqual(f, { how: "drag", what: "Kids", place: "kids", reason: "placed:kids", was: "the canvas", now: "House" });
  const out = moveFix(kids, [line("placed:kids", "sol")], [], house, null);
  assert.equal(out?.was, "House");
  assert.equal(out?.now, "the canvas", "taken out: it is on the canvas now");
});

test("an unseen next.placed row is a placement too; a drag that keeps its folder says no now", () => {
  const row: Unseen = { folder: "kids", name: "Kids", to: "House", from: null, why: "school things", k: "placed:kids", fact: "Kids is in House", at: "2026-11-22" };
  const f = moveFix(kids, [], [row], house, house);
  assert.equal(f?.how, "drag");
  assert.equal(f?.reason, "placed:kids");
  assert.equal(f?.was, "House");
  assert.equal("now" in (f ?? {}), false);
});

test("a folder Sol did not place, or one the person placed, writes nothing", () => {
  assert.equal(moveFix(kids, [], [], null, house), null);
  assert.equal(moveFix(kids, [line("placed:kids", "person")], [], null, house), null, "the person's own placement is only its place");
  assert.equal(moveFix(kids, [line("placed:work", "sol")], [], null, house), null, "another folder's placement");
});

test("its Undo says the same placement back, was and now swapped", () => {
  const f = moveFix(kids, [line("placed:kids", "sol")], [], house, null)!;
  assert.deepEqual(undoFix(f), { how: "undo", what: "Kids", place: "kids", reason: "placed:kids", was: "the canvas", now: "House" });
  const kept = undoFix({ how: "drag", what: "Kids", place: "kids", reason: "placed:kids", was: "House" });
  assert.equal(kept.was, undefined);
  assert.equal(kept.now, "House");
  assert.equal(whereW(null), "the canvas");
});

test("taken out, the others Sol put alike are asked about once, in scope's words; the no takes nothing, the yes takes them all", () => {
  const took: string[][] = [], take = (ids: string[]) => { took.push(ids); };
  assert.equal(sameOut("Kids", [], take), null, "no other: no line");
  const one = sameOut("Kids", [{ id: "work", name: "Work", in: "House" }], take)!;
  assert.equal(one.text, "Your AI put Work inside House the same way. Take Work out too?");
  assert.deepEqual([one.no.label, one.act.label], ["No, only Kids", "Yes, Work too"]);
  const two = sameOut("Kids", [{ id: "work", name: "Work", in: "House" }, { id: "garden", name: "Garden", in: "House" }], take)!;
  assert.equal(two.text, "Your AI put 2 more folders inside others the same way. Take those out too?");
  assert.deepEqual([two.no.label, two.act.label], ["Only this one", "All 2"]);
  two.no.run(); one.no.run();
  assert.deepEqual(took, [], "Only this one: nothing moves, no fix line");
  two.act.run();
  assert.deepEqual(took, [["work", "garden"]], "All 2: both, in one take");
});

test("All N: each comes out to the canvas with a fix line of its own, and one Undo puts every one back", () => {
  CV.load("denise");   // house, kids, work
  for (const id of ["kids", "work"]) { R(id).parent = "house"; R(id).parentBy = "rule"; }
  L.layoutPlane();
  const fixes: string[] = [], undone: string[] = [];
  const spy = ((r: { id: string }, was: { id: string } | null, now: unknown) => { fixes.push(`${r.id}:${was?.id}→${now ?? "canvas"}`); return () => { undone.push(r.id); }; }) as Parameters<typeof takeOut>[1];
  const d = takeOut(["kids", "work"], spy);
  assert.ok(d.ok);
  assert.deepEqual(fixes, ["kids:house→canvas", "work:house→canvas"], "one fix line each, as a hand move");
  assert.deepEqual([CV.parentOf("kids"), CV.parentOf("work")], [null, null]);
  d.undo();
  assert.deepEqual([CV.parentOf("kids"), CV.parentOf("work")], ["house", "house"], "one Undo: both back where Sol put them");
  assert.deepEqual(undone.sort(), ["kids", "work"], "and each fix said back once");
  assert.equal(takeOut(["house"], spy).ok, false, "a folder on the canvas already: nothing to take out");
});

test("the engine's same keys become the folders still inside another, never the one moved", () => {
  CV.load("denise");
  R("work").parent = "house"; R("work").parentBy = "rule";
  L.layoutPlane();
  assert.deepEqual(othersOf(["placed:kids", "placed:work", "placed:work", "placed:nowhere", "talk"], "kids"), [{ id: "work", name: String(R("work").name), in: String(R("house").name) }]);
});

test("the person's un-nest and nest are kept when the plane is laid out again, over the rule's parent", () => {
  CV.load("denise");   // house, kids, work
  R("kids").parent = "house"; R("kids").parentBy = "rule";
  L.layoutPlane();
  assert.equal(CV.parentOf("kids"), "house");
  assert.ok(L.nest("kids", null).ok);
  assert.equal(CV.D.pos!.kids.in, null);
  R("kids").parent = "house"; R("kids").parentBy = "rule";   // the wire reads the sub-folder on disk again
  L.layoutPlane();
  assert.equal(CV.parentOf("kids"), null, "taken out by the person: it stays out");
  assert.ok(L.nest("kids", "work").ok);
  L.layoutPlane();
  assert.equal(CV.parentOf("kids"), "work", "put in work by the person: it stays in");
  assert.equal(CV.D.pos!.kids.in, "work");
});

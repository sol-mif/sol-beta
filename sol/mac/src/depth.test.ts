// node --test src/*.test.ts: places at any depth (#1481, onboard/depth.ts). A sub-place's id is its path, so the tree,
// the crumbs and Esc follow from the ids alone; a place whose parent is gone is drawn at the top, never lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kidsOf, newIdIn, parentOf, pathOf, topOf, treeOf, underOf, upOf } from "./onboard/depth.ts";

const sam = [
  { id: "kids", name: "Kids" }, { id: "kids/lia", name: "Lia" }, { id: "kids/theo", name: "Theo" },
  { id: "kids/theo/football", name: "Football" }, { id: "house", name: "House" },
];

test("a sub-place's parent is its path; the top places are those without one", () => {
  assert.equal(parentOf("kids/theo/football"), "kids/theo");
  assert.equal(parentOf("kids"), null);
  assert.deepEqual(topOf(sam).map((p) => p.id), ["kids", "house"]);
  assert.deepEqual(kidsOf(sam, "kids").map((p) => p.id), ["kids/lia", "kids/theo"]);
  assert.deepEqual(underOf(sam, "kids"), ["kids", "kids/lia", "kids/theo", "kids/theo/football"]);
});

test("the crumbs walk down from the top; Esc goes up one level, then Home", () => {
  assert.deepEqual(pathOf(sam, "kids/theo/football").map((p) => p.name), ["Kids", "Theo", "Football"]);
  assert.equal(upOf(sam, "kids/theo/football"), "kids/theo");
  assert.equal(upOf(sam, "kids/theo"), "kids");
  assert.equal(upOf(sam, "kids"), "home");
});

test("the side's tree: each top place, then everything under it, with its depth", () => {
  assert.deepEqual(treeOf(sam).map(({ p, depth }) => `${depth}:${p.name}`), ["0:Kids", "1:Lia", "1:Theo", "2:Football", "0:House"]);
});

test("a place whose parent is not in the record is drawn at the top, not lost", () => {
  const orphan = [{ id: "work", name: "Work" }, { id: "school/math", name: "Math" }];
  assert.deepEqual(topOf(orphan).map((p) => p.id), ["work", "school/math"]);
  assert.deepEqual(pathOf(orphan, "school/math").map((p) => p.name), ["Math"]);
  assert.equal(upOf(orphan, "school/math"), "home");
});

test("a place named inside another gets its path, apart from a sibling of the same name", () => {
  assert.equal(newIdIn(sam, "kids", "Mia"), "kids/mia");
  assert.equal(newIdIn(sam, "kids", "Lia"), "kids/lia-2");
  assert.equal(newIdIn(sam, "kids", "Éloïse's swim"), "kids/eloise-s-swim");
  assert.equal(newIdIn(sam, "kids", "  ?! "), null);
});

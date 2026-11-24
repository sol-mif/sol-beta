// node --test src/next-group.test.ts: the infinite canvas's groups (BR1, #1615; next/plane/group.ts; three.html "An
// infinite canvas"): what would overlap joins into one labelled group, asks first; its words never cut a name; its
// press finds a zoom where its members stand apart. Invented folders (kite, garden, …), no real data.
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, apartZ, group, label, walk, type Box } from "./next/plane/group.ts";
import { held } from "./next/plane/size.ts";

const box = (id: string, x: number, y: number, asks = 0, w = 160, h = 90): Box => ({ id, r: { x, y, w, h }, name: id, asks });

test("boxes that overlap group, joined through each other; one alone is no group", () => {
  const g = group([box("kite", 0, 0), box("garden", 100, 20), box("loom", 240, 40), box("far", 900, 0)]);
  assert.equal(g.length, 1);
  assert.deepEqual([...g[0].ids].sort(), ["garden", "kite", "loom"]);
  assert.deepEqual(g[0].r, { x: 0, y: 0, w: 400, h: 130 });
});

test("closer than the gap counts as overlapping; past it they stay apart", () => {
  assert.equal(group([box("kite", 0, 0), box("garden", 160 + GAP - 1, 0)]).length, 1);
  assert.equal(group([box("kite", 0, 0), box("garden", 160 + GAP + 1, 0)]).length, 0);
});

test("what needs the person comes first: in a group and among groups", () => {
  const g = group([box("kite", 0, 0), box("garden", 50, 0, 2), box("loom", 2000, 0), box("reed", 2050, 0, 3), box("moss", 2100, 0)]);
  assert.deepEqual(g.map((x) => x.ids[0]), ["reed", "garden"]);
  assert.match(g[0].words, /^reed, /);
  assert.match(g[0].words, /· 3 need you$/);
  assert.match(g[1].words, /· 2 need you$/);
  assert.match(label(["kite", "garden"], 1, 400), /· 1 needs you$/);
});

test("a group's words never cut a name: whole names, then a count, else the count alone", () => {
  const names = ["kite-festival-planning", "garden", "loom", "reed", "moss"];
  assert.equal(label(names, 0, 2000), "kite-festival-planning, garden, loom, reed and moss");
  const some = label(names, 0, 150);
  assert.match(some, / and \d more$/);
  for (const n of some.replace(/ and \d more$/, "").split(", ")) assert.ok(names.includes(n), `"${n}" is a whole name`);
  assert.equal(label(names, 2, 20), "5 folders · 2 need you");
});

test("the group's press: at apartZ its members, held at their size, group no more", () => {
  const qs = [{ x: 0, y: 0, w: 904, h: 600 }, { x: 1100, y: 0, w: 904, h: 600 }, { x: 0, y: 800, w: 904, h: 600 }];
  const at = (z: number) => group(qs.map((q, i) => { const b = held(q, z, "card"); return box(`f${i}`, b.x * z, b.y * z, 0, b.w * z, b.h * z); }));
  assert.equal(at(0.01).length, 1, "far out they group");
  const z = apartZ(qs, "card", 0.01, 3);
  assert.ok(z !== null && z > 0.01);
  assert.equal(at(z!).length, 0);
  assert.equal(apartZ([qs[0], { ...qs[0] }], "card", 0.01, 3), null, "two at one spot never stand apart");
});

test("at 2000 things it stays one pass", () => {
  const bs = Array.from({ length: 2000 }, (_, i) => box(`p${i}`, (i % 50) * 150, Math.floor(i / 50) * 80, i % 9 ? 0 : 1));
  // 200 ms on a person's Mac; on CI (process.env.CI) the shared runner is loaded and measured 249 to 599 ms on the
  // BR1 join's runs (#1615), so there the bar is 1500 ms: still one pass, never a pass per pair
  const limit = process.env.CI ? 1500 : 200;
  const t = performance.now(), g = group(bs);
  assert.ok(performance.now() - t < limit, `${(performance.now() - t).toFixed(0)}ms`);
  assert.equal(g.reduce((s, x) => s + x.ids.length, 0), 2000, "every box in a group, none twice");
});

test("the walk at Far: a group is one stop where its first member stands, places not drawn are passed, round the ends", () => {
  // places 0..6: 0 alone, 1 and 4 one group, 2 not drawn, 3 alone, 5 and 6 another group
  const keyOf = (i: number) => (["a", "g1", null, "d", "g1", "g2", "g2"] as (string | null)[])[i];
  const right = (from: number, n = 1) => { let c = from; const seen = []; for (let j = 0; j < n; j++) seen.push((c = walk(7, keyOf, c, 1))); return seen; };
  assert.deepEqual(right(0, 5), [1, 3, 5, 0, 1]);                // a → g1 → d → g2 → round to a: g1 never twice
  assert.equal(walk(7, keyOf, 4, 1), 3);                          // on g1's second member: on to the stop after g1, not g1 again
  assert.equal(walk(7, keyOf, 4, -1), 0);                         // and back from g1 is a
  assert.equal(walk(7, keyOf, 0, -1), 5);                         // ← from the first goes round to the last stop
  assert.equal(walk(7, keyOf, 2, 1), 3);                          // from a place not drawn: the next stop that way
  assert.equal(walk(7, keyOf, 2, -1), 1);
  assert.equal(walk(7, () => null, 3, 1), 3);                     // nothing drawn: the choice stays
});

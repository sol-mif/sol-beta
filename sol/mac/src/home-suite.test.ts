// Home's suite, step 1 (#692): the grammar's pure half (home/p2/suite/grammar.ts) and the lifted block's address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORMS, TOOLS, GROW, fanAt, formAfter, growthOf, liftedInside, pastBounds, shelfOf, swapLine, toneOf } from "./home/p2/suite/grammar.ts";
import { homeSrc } from "./home/p2/address.ts";
import type { Folder } from "./home/p2/pass2.ts";

test("a lifted block's address is Home's: sol://home/block/<id>", () => {
  assert.deepEqual(homeSrc("sol://home/block/b-1a2b"), { at: "block", id: "b-1a2b" });
  assert.deepEqual(homeSrc("sol://home/block"), { at: "home" });
});

test("the corner: a step down at a time, up past the thresholds, the block form only past the tool's", () => {
  assert.deepEqual(FORMS, ["line", "sticky", "tool", "block"]);
  assert.equal(formAfter("sticky", growthOf(-30, -20)), "line");
  assert.equal(formAfter("line", growthOf(20, 10)), "sticky");
  assert.equal(formAfter("line", 4), "line");
  assert.equal(formAfter("sticky", GROW.tool), "tool");
  assert.equal(formAfter("sticky", GROW.tool - 1), "sticky");
  assert.equal(formAfter("sticky", GROW.block), "block");
  assert.equal(formAfter("tool", GROW.tool), "tool");
  assert.equal(formAfter("tool", GROW.line), "sticky");
  assert.equal(formAfter("block", GROW.line), "tool");
});

test("the bounds: a second tool is past a sticky's; the same tool, or none open, is not", () => {
  assert.ok(pastBounds({ form: "tool", tool: "browser" }, "write"));
  assert.ok(!pastBounds({ form: "tool", tool: "browser" }, "browser"));
  assert.ok(!pastBounds({ form: "sticky", tool: null }, "write"));
  assert.ok(!pastBounds({ form: "block", tool: "browser" }, "write"));
  assert.equal(TOOLS.length, 5);
});

test("the ring's tone, the shelf's three layers, the swap line, the fan's five places", () => {
  assert.deepEqual(["filed", "running", "asks", "failed", "done", "paused"].map(toneOf), ["fresh", "run", "you", "fail", "done", "dim"]);
  const fs = [{ id: "f1", name: "law" }] as Folder[];
  assert.deepEqual(shelfOf({ folder: "f1", own: [{ name: "3 pages", from: "browser" }], kept: [{ name: "notes.md" }] }, fs).map((x) => `${x.layer}:${x.name}`), ["folder:law", "own:3 pages", "kept:notes.md"]);
  assert.equal(swapLine("law", "bio 201"), "now reads law's context · keeps its own shelf · forgets bio 201's");
  const at = fanAt(265, 120);
  assert.equal(at.length, 5);
  assert.deepEqual(at[0], { x: 0, y: -42 }, "the first at the top");
  assert.ok(at.every((p) => Math.abs(p.x) <= 265 / 2 && Math.abs(p.y) <= 60), "inside the card");
  // no two pills (about 72 by 32) overlap
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) assert.ok(Math.abs(at[i].x - at[j].x) >= 72 || Math.abs(at[i].y - at[j].y) >= 32, `${i} and ${j} overlap`);
});

test("lifted: a recipe in the shapes registry draws its shape (tracker), one without draws a sticky's two tools (sticky, a made one)", () => {
  // the registry's names, read from shapes.ts (it imports the shapes' .tsx, which node does not load here)
  const reg = readFileSync(new URL("./home/p2/suite/shapes.ts", import.meta.url), "utf8");
  const shapes = new Set([...reg.matchAll(/^SHAPES\.([a-z-]+) = /gm)].map((m) => m[1]));
  assert.ok(shapes.has("tracker") && shapes.size >= 11, `the registry: ${[...shapes].join(", ")}`);
  const has = (id: string) => shapes.has(id);
  assert.equal(liftedInside("tracker", has), "shape");
  assert.equal(liftedInside("week", has), "shape");
  assert.equal(liftedInside("sticky", has), "tools");
  assert.equal(liftedInside("my-reading-list", has), "tools", "a made recipe with no shape");
  assert.equal(liftedInside("sticky", () => true), "tools", "a sticky is never a shape");
  // Lifted asks the pick against the registry, and draws the shape or the two tools by it
  const lifted = readFileSync(new URL("./home/p2/suite/Lifted.tsx", import.meta.url), "utf8");
  assert.match(lifted, /liftedInside\(b\.recipe, \(id\) => id in SHAPES\) === "shape" \? SHAPES\[b\.recipe\]/);
  assert.match(lifted, /Own \? \(\s*<div className="pc-lifted-own"[^]*<Own b=\{b\}[^]*\) : \(\s*<div className="pc-cols"[^]*<ToolPane[^]*<ToolPane/);
});

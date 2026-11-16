// node --test src/*.test.ts (npm test here): the used-Cowork mark's words (#431, cowork/usedWords.ts): only known parts
// wear the mark, the strip's line (three parts at most, the newest first, when), and the project page's rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { usedOf, markLine, markTitle, stripLine, usedRows, type Use } from "./cowork/usedWords.ts";

const u = (who: string, part: Use["part"], at: string, version = ""): Use => ({ who, part, at, version });

test("the mark: known parts only, in the reply's order; the feed reads as build updates; never what was read", () => {
  assert.deepEqual(usedOf(["memory", "feed", "secrets", 3, null]), ["memory", "feed"]);
  assert.deepEqual(usedOf(undefined), []);
  assert.deepEqual(usedOf("memory"), []);
  assert.equal(markLine(["memory", "feed"]), "from the project · memory, build updates");
  assert.match(markTitle(["memory", "feed", "goal"]), /memory, build updates and goal; .*never what was read/);
});

test("the strip: the newest three parts and when; nothing when they used nothing", () => {
  const l = [u("frank", "memory", "2026-10-30T14:05Z"), u("frank", "goal", "2026-10-30T10:00Z"), u("frank", "feed", "2026-10-29T10:00Z"), u("frank", "polls", "2026-10-28T10:00Z")];
  assert.equal(stripLine(l, (at) => (at === "2026-10-30T14:05Z" ? "2h" : "?")), "used memory, goal, build updates +1 · 2h");
  assert.equal(stripLine([], () => "x"), "");
  assert.equal(stripLine(undefined, () => "x"), "");
});

test("the project page: each person who used something, the most recent first", () => {
  const rows = usedRows({ people: { frank: [u("frank", "goal", "2026-10-29T10:00Z")], isaac: [u("isaac", "feed", "2026-10-30T10:00Z", "dev-1"), u("isaac", "memory", "2026-10-01T10:00Z")], nobody: [] } });
  assert.deepEqual(rows.map((r) => r.who), ["isaac", "frank"]);
  assert.deepEqual(rows[0].parts.map((p) => [p.word, p.version]), [["build updates", "dev-1"], ["memory", ""]]);
});

// node --test src/*.test.ts (npm test here): a page's slash menu and its parts (#433, cowork/pages/slash.ts, parts.ts).
// "/" opens only where a word starts; the filter finds by word, id or key; an entry puts a mark at the line's start,
// words at the caret, or lines of their own; a new entry or part is one call; the page's markdown reads into parts, and
// a tick changes one line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { slashAt, matchSlash, applySlash, slashEntries, defineSlash } from "./cowork/pages/slash.ts";
import { parseParts, toggleCheck, inlineOf, definePart, partKinds } from "./cowork/pages/parts.ts";

test("slash: opens at a line's start or after a space, never inside a word, a link or a date", () => {
  assert.deepEqual(slashAt("/", 1), { start: 0, query: "" });
  assert.deepEqual(slashAt("hello /che", 10), { start: 6, query: "che" });
  assert.deepEqual(slashAt("a\n/h", 4), { start: 2, query: "h" });
  assert.deepEqual(slashAt("/small hea", 10), { start: 0, query: "small hea" });
  assert.equal(slashAt("https://x.y/a", 13), null);
  assert.equal(slashAt("on 10/30", 8), null);
  assert.equal(slashAt("/a  b", 5), null);                 // two spaces: the word ended
  assert.equal(slashAt("/" + "x".repeat(30), 31), null);
  assert.equal(slashAt("/x\nnext", 7), null);              // the "/" is on another line
});

test("slash: Sol's entries, in order; the filter finds a word's start first, then what holds it", () => {
  assert.deepEqual(slashEntries().slice(0, 9).map((e) => e.id), ["h1", "h2", "h3", "list", "numbered", "check", "divider", "mention", "block"]);
  assert.equal(matchSlash(slashEntries(), "").length, slashEntries().length);
  assert.equal(matchSlash(slashEntries(), "todo")[0].id, "check");
  assert.equal(matchSlash(slashEntries(), "che")[0].id, "check");
  assert.equal(matchSlash(slashEntries(), "@")[0].id, "mention");
  assert.equal(matchSlash(slashEntries(), "ins")[0].id, "block");
  assert.deepEqual(matchSlash(slashEntries(), "heading").map((e) => e.id).slice(0, 3), ["h1", "h2", "h3"]);
  assert.deepEqual(matchSlash(slashEntries(), "zzz"), []);
});

test("slash: a mark at the line's start takes the old mark's place; words at the caret; lines of their own", () => {
  const h = slashEntries().find((e) => e.id === "h2")!.apply();
  assert.deepEqual(applySlash("plan /sub", 5, 9, h), { text: "## plan ", caret: 8 });
  assert.deepEqual(applySlash("- buy /check", 6, 12, slashEntries().find((e) => e.id === "check")!.apply()), { text: "- [ ] buy ", caret: 10 });
  assert.deepEqual(applySlash("ask /men later", 4, 8, slashEntries().find((e) => e.id === "mention")!.apply("frank")), { text: "ask @frank  later", caret: 11 });
  // a divider on an empty line stands in its place; on a line with words, under it
  assert.deepEqual(applySlash("a\n/div\nb", 2, 6, { lines: "---" }), { text: "a\n---\nb", caret: 6 });
  assert.deepEqual(applySlash("words /div", 6, 10, { lines: "---" }), { text: "words\n---\n", caret: 10 });
  const blk = slashEntries().find((e) => e.id === "block")!;
  assert.deepEqual(blk.choices!({ people: [], blocks: [{ id: "calendar", name: "the calendar", kind: "tool" }] }), [{ id: "calendar", word: "the calendar", hint: "tool" }]);
  assert.deepEqual(applySlash("/", 0, 1, blk.apply("calendar")), { text: "::block[calendar]\n", caret: 18 });
});

test("slash: a new entry is one call, placed where it asks; the same id again replaces it", () => {
  defineSlash({ id: "table-test", word: "table", hint: "rows and columns", mark: "▦", apply: () => ({ lines: "::table[new]" }) }, "divider");
  const ids = slashEntries().map((e) => e.id);
  assert.equal(ids.indexOf("table-test"), ids.indexOf("divider") - 1);
  defineSlash({ id: "table-test", word: "table 2", hint: "", mark: "▦", apply: () => ({ lines: "x" }) });
  assert.equal(slashEntries().filter((e) => e.id === "table-test").length, 1);
  assert.equal(slashEntries().find((e) => e.id === "table-test")!.word, "table 2");
});

test("parts: the page's markdown as parts, each with its line", () => {
  const body = "# plan\n\nfirst line\nsame paragraph\n\n- [ ] one\n- [x] two\n- dot\n2. second\n---\n::block[calendar]\n```\ncode /here\n```\nend";
  const p = parseParts(body);
  assert.deepEqual(p.map((x) => x.kind), ["h", "p", "check", "check", "li", "ol", "hr", "block", "code", "p"]);
  assert.equal(p[1].text, "first line same paragraph");
  assert.deepEqual([p[2].done, p[3].done, p[3].line], [false, true, 6]);
  assert.equal(p[5].n, 2);
  assert.equal(p[7].id, "calendar");
  assert.deepEqual(p[8].lines, ["code /here"]);
});

test("parts: a tick changes its line alone; any other line, nothing", () => {
  const body = "- [ ] one\n- [ ] two\ntext";
  assert.equal(toggleCheck(body, 1, true), "- [ ] one\n- [x] two\ntext");
  assert.equal(toggleCheck("- [x] a", 0, false), "- [ ] a");
  assert.equal(toggleCheck(body, 2, true), body);
  assert.equal(toggleCheck(body, 9, true), body);
});

test("parts: inline marks, a mention never inside an address, a new kind of part read before Sol's own", () => {
  assert.deepEqual(inlineOf("ask @frank about **this** and `code`").map((x) => x.kind), ["text", "mention", "text", "b", "text", "code"]);
  assert.deepEqual(inlineOf("mail a@b.co").map((x) => x.kind), ["text"]);
  assert.deepEqual(inlineOf("[the site](https://sol.matterfold.tech)"), [{ kind: "link", text: "the site", href: "https://sol.matterfold.tech" }]);
  assert.deepEqual(inlineOf("[plain](http://x.y)").map((x) => x.kind), ["text"]);   // https only
  definePart({ kind: "table-test", match: (l) => { const m = /^::table\[([a-z0-9-]+)\]$/.exec(l); return m ? { id: m[1] } : null; } });
  assert.equal(partKinds()[0], "table-test");
  assert.deepEqual(parseParts("::table[budget]").map((x) => [x.kind, x.id]), [["table-test", "budget"]]);
});

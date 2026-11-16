// node --test src/*.test.ts (npm test here): tables' views (#434, cowork/tables/views.ts). The board view groups by a
// choice in its own order, a hidden value has no column; the list sorts numbers and dates as such, empty last; the
// calendar lays a month in whole weeks, Monday first; the timeline spans start to end, to today when open, and its weeks
// keep to Mondays across a change of the clocks. The board's cards as the board table's rows give the dashboard's own
// five columns and its weeks, so the dashboard drawn through them is the dashboard it was.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  groupsOf, shownRows, monthOf, spansOf, monday, addDays, dayOf, boardTableRows, newView, fieldsFor, cellWord, restOf, monthStep,
  viewOf, type Col, type View, type Row, type Shapes,
} from "./cowork/tables/views.ts";
import { parseParts } from "./cowork/pages/parts.ts";

const SHAPES: Shapes = JSON.parse(readFileSync(new URL("./cowork/tables/tables.json", import.meta.url), "utf8"));
const BOARD = SHAPES.sources.board;
const card = (n: number, column: string, created: string, more: Record<string, unknown> = {}) =>
  ({ repo: "sol-mif/sol-dev", number: n, title: `t${n}`, state: "open", labels: [], assignees: [], author: "a", url: "", column, created, ...more }) as any;

test("tables.json: own tables start with five columns and the four views; each source names its columns and views", () => {
  assert.deepEqual(SHAPES.own.views.map((v) => v.kind), ["list", "board", "calendar", "timeline"]);
  for (const s of ["board", "feed", "sessions"] as const) {
    const keys = SHAPES.sources[s].columns.map((c) => c.key);
    for (const v of SHAPES.sources[s].views) for (const f of [v.by, v.date, v.start, v.end, v.sort?.key]) if (f) assert.ok(keys.includes(f), `${s}.${v.id} names ${f}`);
  }
});

test("the board view: the dashboard's five columns in its order, closed hidden, newest number first", () => {
  const view = viewOf(BOARD.views, "board")!;
  const rows = boardTableRows([card(3, "pr", "2026-10-01T00:00:00Z"), card(9, "pr", "2026-10-02T00:00:00Z"), card(5, "closed", "2026-10-03T00:00:00Z"), card(1, "waiting", "2026-10-04T00:00:00Z")]);
  const g = groupsOf(rows, view, BOARD.columns);
  assert.deepEqual(g.map((x) => x.name), ["waiting", "on a branch", "in a PR", "on main", "stable"]);
  assert.deepEqual(g.find((x) => x.id === "pr")!.rows.map((r) => r.number), [9, 3]);
  assert.equal(g.find((x) => x.id === "branch")!.rows.length, 0);   // an empty column stays, so none jumps
  assert.equal(g.flatMap((x) => x.rows).some((r) => r.column === "closed"), false);
  assert.equal(rows[0]._card.number, 3);   // each row keeps its card for the dashboard to draw
});

test("a board by a field with no choices: one column a value met, by name, the rows with none last", () => {
  const cols: Col[] = [{ key: "title", name: "title", type: "text" }, { key: "who", name: "who", type: "person" }];
  const rows: Row[] = [{ id: "a", title: "a", who: "isaac" }, { id: "b", title: "b" }, { id: "c", title: "c", who: "frank" }, { id: "d", title: "d", who: "isaac" }];
  const g = groupsOf(rows, { id: "b", kind: "board", name: "b", by: "who" }, cols);
  assert.deepEqual(g.map((x) => `${x.name}:${x.rows.map((r) => r.id).join("")}`), ["frank:c", "isaac:ad", "none:b"]);
});

test("the list: sorted by a number, a date or a choice's place; empty last either way; a hidden value left out", () => {
  const cols: Col[] = [{ key: "n", name: "n", type: "number" }, { key: "d", name: "d", type: "date" }, { key: "s", name: "s", type: "choice", choices: [{ id: "to do", name: "to do" }, { id: "done", name: "done" }] }];
  const rows: Row[] = [{ id: "a", n: 10, d: "2026-11-02", s: "done" }, { id: "b", n: 9, s: "to do" }, { id: "c", d: "2026-10-01", s: "done" }];
  assert.deepEqual(shownRows(rows, { sort: { key: "n" } }, cols).map((r) => r.id), ["b", "a", "c"]);
  assert.deepEqual(shownRows(rows, { sort: { key: "n", desc: true } }, cols).map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(shownRows(rows, { sort: { key: "d" } }, cols).map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(shownRows(rows, { sort: { key: "s" } }, cols).map((r) => r.id), ["b", "a", "c"]);
  assert.deepEqual(shownRows(rows, { hide: { s: ["done"] } }, cols).map((r) => r.id), ["b"]);
});

test("the calendar: whole weeks from Monday, each row on its day (a plain date is its own day), the undated counted", () => {
  const cols: Col[] = [{ key: "due", name: "due", type: "date" }];
  const view: View = { id: "c", kind: "calendar", name: "c", date: "due" };
  const m = monthOf([{ id: "a", due: "2026-10-30" }, { id: "b", due: "2026-11-02" }, { id: "c" }], view, cols, "2026-10", Date.parse("2026-10-30T15:00:00Z"));
  assert.equal(m.weeks.length, 5);
  assert.deepEqual(m.weeks[0].map((d) => d.day), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.equal(m.weeks.at(-1)!.at(-1)!.day, "2026-11-01");   // the Sunday after the 31st, though the clocks change that day
  const day = m.weeks.flat().find((d) => d.day === "2026-10-30")!;
  assert.deepEqual(day.rows.map((r) => r.id), ["a"]); assert.equal(day.today, true);
  assert.equal(m.weeks.flat().some((d) => d.rows.some((r) => r.id === "b")), false);   // November's row is in November
  assert.equal(m.undated, 1);
  assert.equal(monthStep("2026-12", 1), "2027-01");
  assert.equal(dayOf("2026-10-30"), "2026-10-30");
});

test("the timeline: start to end, to today when open, one day with no end field, the end alone when no start", () => {
  const cols: Col[] = [{ key: "s", name: "s", type: "date" }, { key: "e", name: "e", type: "date" }];
  const now = Date.parse("2026-10-30T15:00:00Z");
  const view: View = { id: "t", kind: "timeline", name: "t", start: "s", end: "e" };
  const { spans, weeks, start, end } = spansOf([{ id: "a", s: "2026-10-20T00:00:00Z", e: "2026-10-25T00:00:00Z" }, { id: "b", s: "2026-10-27T00:00:00Z" }, { id: "c", e: "2026-11-10" }, { id: "d" }], view, cols, now);
  assert.deepEqual(spans.map((s) => s.row.id), ["a", "b", "c"]);
  assert.equal(spans[1].b, now); assert.equal(spans[1].open, true);
  assert.equal(spans[2].b - spans[2].a, 86_400_000);
  assert.ok(end > Date.parse("2026-11-10"));   // the weeks reach a row's end in the future
  // every week mark is a Monday at midnight, across the change of the clocks on Nov 1
  for (const w of weeks) { const d = new Date(w); assert.equal(d.getDay(), 1); assert.equal(d.getHours(), 0); }
  assert.equal(start, weeks[0]);
  const one = spansOf([{ id: "x", s: "2026-10-28T00:00:00Z" }], { id: "t", kind: "timeline", name: "t", start: "s" }, cols, now);
  assert.equal(one.spans[0].b - one.spans[0].a, 86_400_000); assert.equal(one.spans[0].open, false);
});

test("the board's timeline view is the dashboard's weeks: the closed hidden, oldest first, open ones to today", () => {
  const now = Date.parse("2026-10-30T15:00:00Z");
  const rows = boardTableRows([card(2, "main", "2026-10-10T00:00:00Z"), card(1, "stable", "2026-09-20T00:00:00Z", { closed: "2026-10-01T00:00:00Z" }), card(3, "closed", "2026-10-11T00:00:00Z", { closed: "2026-10-12T00:00:00Z" })]);
  const { spans, weeks } = spansOf(rows, viewOf(BOARD.views, "timeline")!, BOARD.columns, now);
  assert.deepEqual(spans.map((s) => s.row.number), [1, 2]);
  assert.equal(spans[1].b, now);
  assert.equal(weeks.at(-1), monday(now));
  assert.equal(addDays(monday(now), 7), monday(addDays(now, 7)));
});

test("a new view on a field: the next free id, the field in its place; the fields a kind of view can use", () => {
  const cols = SHAPES.own.columns;
  assert.deepEqual(fieldsFor("board", cols).map((c) => c.key), ["status", "who"]);
  assert.deepEqual(fieldsFor("calendar", cols).map((c) => c.key), ["start", "due"]);
  assert.deepEqual(newView("board", "who", SHAPES.own.views, cols), { id: "board-2", kind: "board", name: "board by who", by: "who" });
  assert.deepEqual(newView("timeline", "due", SHAPES.own.views, cols, "due dates"), { id: "timeline-2", kind: "timeline", name: "due dates", start: "due", end: "start" });
});

test("cells as words: a choice's name, a plain date as its own day, a number named on a card", () => {
  const where = BOARD.columns.find((c) => c.key === "column")!;
  assert.equal(cellWord(where, "pr"), "in a PR");
  assert.match(cellWord({ key: "d", name: "d", type: "date" }, "2026-11-02"), /Nov 2|2 Nov/);
  assert.deepEqual(restOf({ id: "x", title: "t", pr: 41, domain: "product" }, BOARD.columns, []).map((x) => x.word), ["product", "PR 41"]);
});

test("a table on a page: ::table[<id>] is a part of its own; /table offers the project's tables, before insert block", async () => {
  const { tablesOnPages } = await import("./cowork/tables/part.ts");
  const { slashEntries, applySlash } = await import("./cowork/pages/slash.ts");
  tablesOnPages((s) => (s === "feed" ? "what happened" : s));
  assert.deepEqual(parseParts("::table[launch-tasks]").map((p) => `${p.kind}:${p.id}`), ["table:launch-tasks"]);
  assert.equal(parseParts("::table[Not Ok]")[0].kind, "p");
  const ids = slashEntries().map((e) => e.id);
  assert.equal(ids.indexOf("table"), ids.indexOf("block") - 1);
  const e = slashEntries().find((x) => x.id === "table")!;
  assert.deepEqual(e.choices!({ people: [], blocks: [], tables: [{ id: "board", title: "the board", source: "board" }, { id: "x", title: "X", source: "feed" }] }).map((c) => c.hint), ["reads board", "reads what happened"]);
  assert.deepEqual(e.choices!({ people: [], blocks: [] }), []);
  assert.equal(applySlash("/table", 0, 6, e.apply("launch-tasks")).text, "::table[launch-tasks]\n");
});

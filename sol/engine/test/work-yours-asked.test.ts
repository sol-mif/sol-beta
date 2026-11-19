// Build becomes yours (#1089): the first minute is never empty. Made-up asks, typed the way a person who does not
// code types: which of them stand in under "you asked", and the tool one ask makes.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ask } from "../src/work/yours.ts";
const { asked, onceOffer, onceWhen } = await import("../src/work/yoursAsked.ts");
const { titleOf } = await import("../src/work/yoursTitle.ts");

const T = Date.parse("2026-11-13T08:00:00");
let n = 0;
const ask = (text: string, cwd = "/work/studio", minsAgo = ++n, afterAgent = true): Ask => ({ session: `s${n}`, cwd, at: T - minsAgo * 60_000, text, afterAgent });

test("one ask makes a tool: only plain values are blanks, each with its one value", () => {
  const o = onceOffer(ask("Draft invoice #1048 for Halden Studio, 7 hours, at my usual rate, due 2026-11-20"));
  assert.equal(o.count, 1);
  assert.equal(o.kind, "ask");
  assert.deepEqual(o.blanks, [{ name: "invoice", values: ["#1048"] }, { name: "hours", values: ["7"] }, { name: "date", values: ["2026-11-20"] }]);
  assert.equal(o.template, "Draft invoice {invoice} for Halden Studio, {hours} hours, at my usual rate, due {date}");
  assert.equal(titleOf(o.words), "Invoice");
});

test("a value is a whole word: the 5 of '5 lines' is a blank, the 5 in 15 and in v5 is not", () => {
  const o = onceOffer(ask("summarise notes/week-15.md in 5 lines for the v5 launch, 15 words each at most"));
  assert.equal(o.template, "summarise {file} in {lines} lines for the v5 launch, {words} words each at most");
  assert.deepEqual(o.blanks.map((b) => b.values[0]), ["notes/week-15.md", "5", "15"]);
});

test("a bare number is named by what it counts; with nothing to count it stays a number", () => {
  assert.deepEqual(onceOffer(ask("Plan the van route for Saturday: 3 stops, the market first, back by 14:00")).blanks.map((b) => b.name), ["stops"]);
  assert.deepEqual(onceOffer(ask("pick 2 of this weeks photos for the shop page")).blanks.map((b) => b.name), ["number"]);
});

test("an ask with nothing to fill is still a tool: no blanks, the whole ask", () => {
  const o = onceOffer(ask("can you look at the landing page again and tell me what feels off about the hero section"));
  assert.deepEqual(o.blanks, []);
  assert.equal(titleOf(o.words), "Landing page");
  assert.match(o.template, /^can you look at the landing page/);
});

test("which asks stand in: the open folder first, then newest; never a check-in, a correction, a short or nameless one", () => {
  n = 0;
  const all = [
    ask("continue"),                                                                  // too short
    ask("is it done?"),                                                               // a check-in
    ask("no, not like that, keep the old heading and only change the picture"),       // a correction
    ask("can you make this shorter"),                                                 // no name
    ask("write the weekly update for the team from notes/week.md", "/work/other"),    // another folder: after this one's
    ask("please make the chart bigger and move it to the top"),
    ask("ok so currently the newsletter goes out friday, i want you to write this weeks one and keep it short"),
    ask("please make the chart a bit bigger and move it to the top of the page"),     // near the chart ask: once
    ask("plan the week: three things per day from plan/todo.md"),
  ];
  const got = asked(all, { n: 3, cwd: "/work/studio" });
  assert.deepEqual(got.map((o) => titleOf(o.words)), ["Chart", "Newsletter", "Week"]);
  assert.ok(got.every((o) => o.count === 1));
  // with no open folder: newest first, whatever the folder
  assert.deepEqual(asked(all, { n: 2 }).map((o) => titleOf(o.words)), ["Weekly update", "Chart"]);
});

test("never beside its own repeat, a kept thing or one answered no; and only as many as are missing", () => {
  n = 0;
  const all = [ask("Draft invoice #1049 for Halden Studio, 9 hours, at my usual rate"), ask("hey can you check my calendar for next week and tell me what clashes")];
  const repeat = onceOffer(all[0]).head;
  assert.deepEqual(asked(all, { n: 2, heads: [repeat] }).map((o) => titleOf(o.words)), ["Calendar"]);
  const cal = onceOffer(all[1]).id;
  assert.deepEqual(asked(all, { n: 2, skip: new Set([cal]) }).map((o) => titleOf(o.words)), ["Invoice"]);
  assert.deepEqual(asked(all, { n: 0 }), []);
});

test("where a count would stand: once · today, yesterday, then the day", () => {
  assert.equal(onceWhen(T - 3_600_000, T), "once · today");
  assert.equal(onceWhen(T - 20 * 3_600_000, T), "once · yesterday");
  assert.equal(onceWhen(Date.parse("2026-11-11T10:00:00"), T), "once · 11 Nov");
});

test("a typed underscore is a word, never a crash", () => {
  const o = onceOffer(ask("rename my_file _ to the new_name in the notes folder please"));
  assert.match(o.words, /_/);
  assert.equal(asked([ask("write the _ note for the bench by the gate")], { n: 3 }).length >= 0, true);
});

test("the naming rule meets the designer's table, every row", async () => {
  const { TABLE } = await import("./work-yours-title.table.ts");
  const wrong = TABLE.filter(([words, name]) => titleOf(words) !== name).map(([w, n]) => `${w} → ${titleOf(w)} (want ${n})`);
  assert.deepEqual(wrong, []);
});

test("a bare number after a plain noun is that noun's: 'bed 28', 'row 29'; never after a verb or a small word", () => {
  assert.deepEqual(onceOffer(ask("Check bed 28 of row 29 for slugs and note what you find")).blanks.map((b) => b.name), ["bed", "row"]);
  assert.deepEqual(onceOffer(ask("pick 2 of this weeks photos for the shop page")).blanks.map((b) => b.name), ["number"]);
});

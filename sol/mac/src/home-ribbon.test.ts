// node --test src/*.test.ts (npm test here): the ribbon (#793, plan Part C slice 30; home/whole/week.ts).
// The Try line: a running job shows as a thread from now to its due point. And the rules under it: nearer days are
// wider, a moment's place on the line, lanes for threads that would cross, label rows, and the week the stub sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDTHS, daysOf, dayIndex, lanesOf, leftOf, rowsOf, threadOf, tieOf, xOf } from "./home/whole/week.ts";
import { stub, weekOf, seed, type Mark, type TodayMsg } from "./home/whole/today.ts";

const W = 1000;
const NOW = new Date(2026, 10, 9, 8, 40).getTime();            // Monday 9 November, 8:40
const at = (plus: number, h: number, m = 0) => new Date(2026, 10, 9 + plus, h, m).getTime();
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} ≈ ${b}`);

test("a running job is a thread from now to its due point", () => {
  const job: Mark = { id: "j", kind: "thread", from: NOW - 36e5, at: at(1, 12), label: "lab prep", thingId: "t-lab-prep" };
  const s = threadOf(job, NOW, W)!;
  near(s.x0, xOf(NOW, NOW, W)!);                              // it starts at now, not when it started
  near(s.x1, xOf(at(1, 12), NOW, W)!);                         // and ends where it is due
  near(s.x1, (0.25 + (5 / 17) * 0.17) * W);                    // tomorrow noon: past today, 5 of Tuesday's 17 hours
  assert.ok(s.x1 > s.x0);
});

test("a thread that starts later runs from its start; one past due is a dot at now; one due after Sunday runs to the end", () => {
  const later: Mark = { id: "l", kind: "thread", from: at(0, 15), at: at(0, 18), label: "x" };
  near(threadOf(later, NOW, W)!.x0, xOf(at(0, 15), NOW, W)!);
  const late: Mark = { id: "o", kind: "thread", from: NOW - 9e6, at: NOW - 36e5, label: "x" };
  const s = threadOf(late, NOW, W)!;
  assert.equal(s.x0, s.x1);
  const far: Mark = { id: "f", kind: "thread", from: NOW, at: at(12, 9), label: "x" };
  assert.equal(threadOf(far, NOW, W)!.x1, W);
  assert.equal(threadOf({ ...far, kind: "event" }, NOW, W), null, "only a job is a thread");
});

test("now to Sunday on one line, nearer days wider (.25 .17 .14 .15 .12 .085 .085)", () => {
  assert.deepEqual([...WIDTHS], [0.25, 0.17, 0.14, 0.15, 0.12, 0.085, 0.085]);
  near(WIDTHS.reduce((a, b) => a + b, 0), 1);
  const d = daysOf(NOW, W);
  assert.deepEqual(d.map((x) => x.name), ["today", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.deepEqual(d.map((x) => x.date), [9, 10, 11, 12, 13, 14, 15]);
  near(d[1].x, 250);
  near(d[6].x + d[6].w, W);
});

test("a moment's place: a day runs 7:00 to midnight; before today or after Sunday is off the line", () => {
  near(xOf(at(0, 7), NOW, W)!, 0);
  near(xOf(at(0, 3), NOW, W)!, 0);                             // early morning sits at the day's start
  near(xOf(at(0, 23, 59), NOW, W)!, (16.9833 / 17) * 250);
  near(xOf(at(3, 10), NOW, W)!, (0.25 + 0.17 + 0.14 + (3 / 17) * 0.15) * W);
  assert.equal(xOf(at(-1, 12), NOW, W), null);
  assert.equal(xOf(at(7, 12), NOW, W), null);
  assert.equal(dayIndex(at(6, 23), NOW), 6);
});

test("threads take lanes: one that would cross another goes under it, one that follows reuses the lane", () => {
  const l = lanesOf([{ id: "a", x0: 10, x1: 200 }, { id: "b", x0: 50, x1: 120 }, { id: "c", x0: 210, x1: 300 }]);
  assert.equal(l.get("a"), 0);
  assert.equal(l.get("b"), 1);
  assert.equal(l.get("c"), 0);
});

test("labels that would overlap take the other row", () => {
  const r = rowsOf([{ id: "a", x: 0, label: "aaaa" }, { id: "b", x: 20, label: "bb" }, { id: "c", x: 100, label: "c" }], (s) => s.length * 10);
  assert.equal(r.get("a"), 0);
  assert.equal(r.get("b"), 1);
  assert.equal(r.get("c"), 0);
});

test("the week the stub sends: a thread for each running job with a due point, a yellow pin for the deadline that is yours", () => {
  const t = (stub(() => NOW)({ type: "home.today" })[0] as TodayMsg).today;
  const threads = t.week.filter((m) => m.kind === "thread");
  assert.deepEqual(threads.map((m) => m.thingId).sort(), ["t-bio-notes", "t-lab-prep"]);
  for (const m of threads) assert.ok(t.moving.includes(m.thingId!));
  const chem = t.week.find((m) => m.thingId === "t-chem-set6")!;
  assert.equal(chem.kind, "due");
  assert.equal(chem.yours, true);
  for (const k of ["event", "big", "proposal", "you", "due"]) assert.ok(t.week.some((m) => m.kind === k), `the week has a ${k}`);
});

test("a job that starts moving with a due point gets its thread; computed from the things, never stored", () => {
  const things = seed(NOW).map((x) => (x.id === "t-shopify-app" ? { ...x, state: "moving" as const, waitsOn: "agent" as const, due: at(5, 17) } : x));
  assert.ok(weekOf(things, NOW).some((m) => m.kind === "thread" && m.thingId === "t-shopify-app"));
});

test("the tie: the front's point on the week, else its thread's end; none for a front with no mark, or one past the card", () => {
  const week = (stub(() => NOW)({ type: "home.today" })[0] as TodayMsg).today.week;
  const chem = week.find((m) => m.thingId === "t-chem-set6")!;
  near(tieOf(week, "t-chem-set6", NOW, W, W)!, xOf(chem.at, NOW, W)!);       // chem set 6, due tonight: tied at its pin
  assert.equal(tieOf(week, "t-maya-data", NOW, W, W), null);                  // Maya's thing has no mark on the week
  near(tieOf(week, "t-lab-prep", NOW, W, W)!, threadOf(week.find((m) => m.thingId === "t-lab-prep")!, NOW, W)!.x1);
  const x = xOf(chem.at, NOW, W)!;
  assert.equal(tieOf(week, "t-chem-set6", NOW, W, x - 1), null);              // the card ends before its point: no tie
  assert.equal(tieOf(week, null, NOW, W, W), null);
});

test("a label that would pass the ribbon's right edge reads to the left of its mark", () => {
  assert.equal(leftOf(900, 80, W, 10), false);
  assert.equal(leftOf(950, 80, W, 10), true);                                  // a thread due after Sunday ends at W
  const far: Mark = { id: "f", kind: "thread", from: NOW, at: at(12, 9), label: "lab prep" };
  assert.equal(leftOf(threadOf(far, NOW, W)!.x1, 1, W), true);
});

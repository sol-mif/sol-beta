// node --test src/*.test.ts (npm test here): the tray and the fold flight (#779, stage/trayFold.ts), build/feel.md "fold"
// ("flight by translate + uniform scale to its small copy or the next strip square, fades from 140 ms; the square lands
// with a pearl flash, the count bumps") and "unfold", whole.md "#746" (the past waits in the tray by session). The Try
// line, "⌘W a block: it flies to the tray and the count bumps", on the tray's own arithmetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyAt, count, flight, shownAt, squareRect, squares, trayGroups, trayOf, unflight, type Folded, type TrayBlock } from "./stage/trayFold.ts";
import { TRAY, Z } from "./kit/feel.ts";
import type { Rect } from "./stage/model.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const within = (r: Rect, box: Rect) => r.x >= box.x - 1e-9 && r.y >= box.y - 1e-9 && r.x + r.w <= box.x + box.w + 1e-9 && r.y + r.h <= box.y + box.h + 1e-9;

test("Try: ⌘W a block: it flies into the tray's next square, and the count bumps from 0 to 1", () => {
  const session = "s-now";
  const week: Rect = { x: 264, y: 24, w: 440, h: 300 };
  // the strip's row of squares at the stage's foot; nothing folded yet: the next square is the first
  const row = { x: 12 + TRAY.inset, y: 640 - TRAY.h + (TRAY.h - TRAY.sq.h) / 2 };
  const before = trayGroups(session, []);
  assert.equal(count(before), 0);
  const sq = squareRect(row, count(before));
  assert.deepEqual(sq, { x: row.x, y: row.y, w: 16, h: 11 });
  // the flight: one uniform scale, the block fits the square, centred on it
  const f = flight(week, sq);
  const end = shownAt(week, f);
  assert.ok(within(end, sq), `${JSON.stringify(end)} inside ${JSON.stringify(sq)}`);
  assert.ok(near(end.w / end.h, week.w / week.h), "uniform: its shape kept");
  assert.ok(near(end.x + end.w / 2, sq.x + sq.w / 2) && near(end.y + end.h / 2, sq.y + sq.h / 2), "centred on the square");
  assert.ok(near(Math.max(end.w / sq.w, end.h / sq.h), 1), "as large as the square lets it");
  // landed: the tray holds it in this session's group, and counts one more
  const after = trayGroups(session, [{ id: "week", kind: "page", title: "the week", made: session }]);
  assert.equal(count(after), 1);
  assert.equal(squares(count(after)), 1);
  assert.deepEqual(after[0], { from: null, minis: [{ id: "week", kind: "page", title: "the week", own: true }] });
});

test("the next square steps 20 along; the strip draws 14 at most, the 15th lands on the last", () => {
  const row = { x: 18, y: 600 };
  assert.equal(squareRect(row, 1).x - squareRect(row, 0).x, TRAY.sq.w + TRAY.sq.gap);
  assert.equal(squareRect(row, 13).x, 18 + 13 * 20);
  assert.deepEqual(squareRect(row, 20), squareRect(row, 13));
  assert.equal(squares(30), 14);
});

test("the past waits in the tray by session: this session's folds in front, then each session that made the rest, newest first", () => {
  const folded: Folded[] = [
    { id: "a", kind: "page", title: "made here", made: "s-now" },
    { id: "old1", kind: "list", title: "yesterday's list", made: "s-yesterday" },
    { id: "b", kind: "diff", title: "also here" },
  ];
  const engine: TrayBlock[] = [
    { id: "far", kind: "table", title: "last week's table", state: "live", from: "s-lastweek", at: 100 },
    { id: "old2", kind: "page", title: "yesterday's page", state: "live", from: "s-yesterday", at: 900 },
    { id: "a", kind: "page", title: "made here", state: "live", from: "s-now", at: 950 },
  ];
  const g = trayGroups("s-now", folded, engine);
  assert.deepEqual(g.map((x) => x.from), [null, "s-yesterday", "s-lastweek"]);
  assert.deepEqual(g[0].minis.map((m) => m.id), ["a", "b"]);
  assert.deepEqual(g[1].minis.map((m) => m.id), ["old2", "old1"], "the engine's newest first, then the stage's own past");
  assert.equal(count(g), 5, "each block once");
  assert.deepEqual(trayOf({ tray: engine }), engine);
  assert.deepEqual(trayOf({}), [], "today's engine sends no tray");
});

test("unfold starts as its small copy and travels back to itself", () => {
  const to: Rect = { x: 264, y: 24, w: 440, h: 300 }, copy: Rect = { x: 30, y: 500, w: 132, h: 90 };
  const f = unflight(copy, to);
  const start = shownAt(to, f);
  assert.ok(near(start.x, copy.x) && near(start.y, copy.y) && near(start.w, copy.w), "starts on the copy");
  assert.deepEqual(shownAt(to, { dx: 0, dy: 0, s: 1 }), to, "and ends at its place");
});

test("a copy dragged out is the block at its own size around the finger, on the stage", () => {
  const room = { w: 1000, h: 640 };
  assert.deepEqual(copyAt({ x: 500, y: 300 }, { w: 240, h: 160 }, room), { x: 380, y: 280, w: 240, h: 160 });
  const edge = copyAt({ x: 990, y: 630 }, { w: 240, h: 160 }, room);
  assert.equal(edge.x, 1000 - 16 - 240);
  assert.equal(edge.y, 640 - 160);
});

test("the tray's numbers (feel.html .tray, .tq, .mini): 32 tall, 16 × 11 squares 4 apart, z 500, a flight z 400", () => {
  assert.equal(TRAY.h, 32);
  assert.deepEqual(TRAY.sq, { w: 16, h: 11, r: 3, gap: 4 });
  assert.equal(TRAY.fadeFrom, 140);
  assert.deepEqual([Z.flight, Z.tray], [400, 500]);
});

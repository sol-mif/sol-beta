// node --test src/*.test.ts (npm test here): the talk full (#788, stage/footRow.ts), whole.md "Talk full" and feel.md
// "talk full": ⌘↑, the talk at 720 and the blocks a foot row of 120×72 copies; ⌘↓, Esc or a press brings them back,
// the pressed one held. The Try line, "⌘↑, press a small copy: it opens held", on the row's arithmetic (the press and
// the hold are Stage.tsx's, shot on the real face).
import { test } from "node:test";
import assert from "node:assert/strict";
import { footCells, footRow } from "./stage/footRow.ts";
import { shownAt } from "./stage/trayFold.ts";
import { readingOrder } from "./stage/geometry.ts";
import { FOOT } from "./kit/feel.ts";
import type { Rect } from "./stage/model.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const room = { w: 1280, h: 760 }, at = { x: 400, y: 0 };   // the stage sits beside the talk's old width, 400 in
const places: Record<string, Rect> = {
  week: { x: 16, y: 16, w: 440, h: 300 },
  list: { x: 468, y: 16, w: 340, h: 232 },
  diff: { x: 468, y: 260, w: 440, h: 290 },
};

test("Try: ⌘↑ flies each block into its 120×72 copy in the foot row; a copy is the block, scaled once, centred in its cell", () => {
  const rects = new Map(Object.entries(places));
  const order = readingOrder(Object.entries(places).map(([id, r]) => ({ id, r }))).map((b) => b.id);
  const fl = footRow(order, rects, room, at);
  const cells = footCells(3, room);
  assert.equal(fl.size, 3);
  order.forEach((id, i) => {
    const r = rects.get(id)!, f = fl.get(id)!;
    const shown = shownAt(r, f), cell = { ...cells[i], x: cells[i].x - at.x, y: cells[i].y - at.y };   // in stage coordinates
    assert.ok(near(shown.w / shown.h, r.w / r.h), `${id}: one scale, its shape kept`);
    assert.ok(shown.w <= FOOT.w + 1e-9 && shown.h <= FOOT.h + 1e-9, `${id}: fits 120×72`);
    assert.ok(near(Math.max(shown.w / FOOT.w, shown.h / FOOT.h), 1), `${id}: as large as the cell lets it`);
    assert.ok(near(shown.x + shown.w / 2, cell.x + cell.w / 2) && near(shown.y + shown.h / 2, cell.y + cell.h / 2), `${id}: centred in its cell`);
  });
  // ⌘↓ (or the press): back to itself, the identity
  for (const id of order) assert.deepEqual(shownAt(rects.get(id)!, { dx: 0, dy: 0, s: 1 }), rects.get(id));
});

test("the row: copies 10 apart, centred under the room, 96 up from its floor, in reading order (top, then left)", () => {
  const cells = footCells(3, room);
  assert.equal(cells[1].x - cells[0].x, FOOT.w + FOOT.gap);
  const total = 3 * 120 + 2 * 10;
  assert.ok(near(cells[0].x, (room.w - total) / 2));
  assert.ok(near(cells[2].x + cells[2].w, (room.w + total) / 2));
  assert.equal(cells[0].y, room.h - 96);
  const order = readingOrder(Object.entries(places).map(([id, r]) => ({ id, r }))).map((b) => b.id);
  assert.deepEqual(order, ["week", "list", "diff"]);
  const fl = footRow(["list", "week"], new Map(Object.entries(places)), room, at);
  assert.ok(shownAt(places.list, fl.get("list")!).x < shownAt(places.week, fl.get("week")!).x, "the row follows the order given");
});

test("a block the stage does not show is not in the row", () => {
  const fl = footRow(["week", "gone"], new Map([["week", places.week]]), room, at);
  assert.deepEqual([...fl.keys()], ["week"]);
  const one = footCells(1, room)[0];
  assert.ok(near(one.x + one.w / 2, room.w / 2), "one copy sits in the middle");
});

test("the talk full's numbers (feel.html setFull): the talk 720, copies 120×72 10 apart, 96 up, the box 112 over them", () => {
  assert.deepEqual(FOOT, { w: 120, h: 72, gap: 10, up: 96, talk: 720, pad: 112 });
});

// node --test src/*.test.ts (npm test here): the seven human checks' rules (#891), as numbers. Behind the run's
// switches: words are 4.5:1 or more on the worst ground the window can have (a white desktop behind it); one thing at a
// time moves, by one written order; a resize never carries a block past the stage; a stage that holds blocks is never
// hidden for the talk (the talk goes to the foot first); the talk keeps one width as blocks open (#954, whole.html),
// never under its floor and never leaving the stage under its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHADE } from "./kit/tokens.ts";
import { ATTENTION, mover, moves } from "./attention.ts";
import { resizeEnd, resizeTo } from "./stage/resize.ts";
import { PAD, drawnSolid, type Room } from "./stage/geometry.ts";
import { TALK, TALK_WHOLE, STAGE_FLOOR, MIN, roomFor, talkWidth, talkWholeWidth } from "./stage/model.ts";

/** WCAG's relative luminance of a grey (0..255) and the ratio of two */
const lum = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const ratio = (a: number, b: number) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** the on colour (white) at alpha a over a ground g; the window, the black at w over a desktop d */
const over = (a: number, fg: number, g: number) => g + a * (fg - g);
const windowOn = (w: number, desk: number) => over(w, 0, desk);

test("words read at 4.5:1 or more on the window over any desktop, black to white (check 1)", () => {
  for (const desk of [0, 64, 128, 192, 255]) {
    const g = windowOn(SHADE.read.window, desk);
    for (const k of ["dim", "mute"] as const) {
      const r = ratio(over(SHADE.read[k], 255, g), g);
      assert.ok(r >= 4.5, `${k} at ${SHADE.read[k]} over the window at ${SHADE.read.window} on a desktop of ${desk}: ${r.toFixed(2)}:1`);
    }
  }
  // and on a block, drawn on the solid step over that window
  const blockG = over(SHADE.steps[SHADE.read.block], 0, windowOn(SHADE.read.window, 255));
  assert.ok(ratio(over(SHADE.read.mute, 255, blockG), blockG) >= 4.5, "mute on a block");
});

test("today's mute can carry no word: 0.32 is under 4.5:1 even on pure black (why the switches raise it)", () => {
  assert.ok(ratio(over(SHADE.on.mute, 255, 0), 0) < 4.5);
  assert.ok(SHADE.read.mute > SHADE.on.mute && SHADE.read.dim > SHADE.read.mute, "the order kept: dim over mute");
});

test("the window under the switches is near solid, and a block is solid: nothing reads through (check 1)", () => {
  assert.ok(SHADE.read.window >= 0.9);
  assert.ok(SHADE.steps[SHADE.read.block] >= 0.95);
});

test("one thing moves at a time, by the written order: asks, then running, then decor (check 3)", () => {
  assert.deepEqual([...ATTENTION], ["asks", "running", "decor"]);
  assert.equal(mover(["decor", "running", "asks"]), "asks");
  assert.equal(mover(["decor", "running"]), "running");
  assert.equal(mover([]), null);
  assert.equal(moves("running", ["asks"]), false, "a running step rests while something asks");
  assert.equal(moves("running", ["decor"]), true);
  assert.equal(moves("decor", []), false, "decor rests while the jelly is on the screen");
  assert.equal(moves("decor", [], false), true, "decor moves only when nothing else, the jelly too, is there");
  assert.equal(moves("asks", ["running", "decor"]), true);
});

test("a resize never carries a block past the stage, though another block's edge plus the gap lies beyond (check 2)", () => {
  // the run's 1280 × 800 shot: the stage 400 wide, a block above whose right edge is the stage's right pad line
  const room: Room = { w: 410, h: 600 };
  const above = { x: PAD, y: PAD, w: 410 - 2 * PAD, h: 200 };
  const from = { x: PAD, y: 240, w: 300, h: 200 };
  for (const dx of [60, 70, 80, 90, 100, 120, 200]) {
    for (const edge of ["e", "se", "ne"] as const) {
      const s = resizeTo(room, from, edge, { x: dx, y: 0 }, [above], null);
      assert.ok(s.r.x + s.r.w <= room.w - PAD + 0.5, `${edge} by ${dx}: shown to ${s.r.x + s.r.w}`);
      const r = resizeEnd(edge, s);
      assert.ok(r.x + r.w <= room.w - PAD + 0.5, `${edge} by ${dx}: lands to ${r.x + r.w}`);
    }
  }
  // the west edge too, against the stage's left pad
  const s = resizeTo(room, { x: 100, y: 240, w: 200, h: 200 }, "w", { x: -120, y: 0 }, [{ x: PAD + 2, y: PAD, w: 100, h: 200 }], null);
  assert.ok(resizeEnd("w", s).x >= PAD - 0.5);
});

// #954 (main since #974): whole.html keeps the talk at one width however many blocks are open; the yield this check
// first held is gone, so check 5 holds the one width, and every bound it held before
test("the talk keeps one width as blocks open, never under its floor nor leaving the stage under its own (check 5)", () => {
  const ch = 7.5;
  for (const W of [600, 900, 1100, 1300]) {
    const one = talkWholeWidth(W, ch), three = talkWholeWidth(W, ch), six = talkWholeWidth(W, ch);   // his Sol: the whole talk's width asks no count (StageColumn.tsx)
    assert.ok(one === three && three === six, `${W}: ${one} = ${three} = ${six}`);
    for (const t of [one, three, six]) {
      assert.ok(t >= Math.min(TALK.floor * ch, W - STAGE_FLOOR) - 0.5 || t >= TALK.floor * ch - 0.5);
      assert.ok(t <= TALK.read * ch + 0.5);
    }
    assert.equal(six, Math.round(Math.max(TALK.floor * ch, Math.min(Math.max(TALK.floor * ch, TALK_WHOLE), W - STAGE_FLOOR))));
  }
  assert.equal(talkWidth(1100, ch, 0.5, 6), Math.round(Math.max(TALK.floor * ch, Math.min(550, 1100 - STAGE_FLOOR))), "a width the person kept wins");
  assert.equal(talkWidth(1100, ch), Math.round(TALK.read * ch), "no count given: today's reading width");
});

test("the talk at the foot holds its head, its box and two lines of words; never less than its row (check 5)", async () => {
  const { footHeight, TALK } = await import("./stage/model.ts");
  assert.equal(TALK.lines, 2);
  assert.equal(footHeight(200, 44, 180, 24), 44 + 180 + 48, "a box that alone fills the row: the row grows");
  assert.equal(footHeight(400, 44, 120, 24), 400, "a row with room: kept");
});

test("blocks are glass at rest and apart, solid only where two cross or while one is dragged (check 1)", () => {
  const a = { id: "a", r: { x: 0, y: 0, w: 200, h: 120 } }, b = { id: "b", r: { x: 212, y: 0, w: 200, h: 120 } };
  const c = { id: "c", r: { x: 150, y: 60, w: 200, h: 120 } }, t = { id: "t", r: { x: 200, y: 0, w: 200, h: 120 } };
  assert.deepEqual([...drawnSolid([a, b], false)], [], "apart: glass, as before");
  assert.deepEqual([...drawnSolid([a, t], false)], [], "edges touching: glass");
  assert.deepEqual([...drawnSolid([a, b, c], false)].sort(), ["a", "b", "c"], "c crosses both: all three solid");
  assert.deepEqual([...drawnSolid([a, c, { id: "d", r: { x: 600, y: 0, w: 200, h: 120 } }], false)].sort(), ["a", "c"], "the one apart stays glass");
  assert.deepEqual([...drawnSolid([a, b], true)].sort(), ["a", "b"], "while one is dragged: every block solid");
});

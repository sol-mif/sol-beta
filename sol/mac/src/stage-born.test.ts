// node --test src/*.test.ts (npm test here): born at the content's size (#780, stage/born.ts), whole.md "arrival" (a list
// its rows, a page its measure of 412, a run wide) and "Engine changes" (no fixed pixels per kind: the judge gives the band,
// the face its content's size). The Try line, "ask for a three-item list: the block is three rows tall", on born.ts's own
// arithmetic; the shot measures it rendered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandOf, bornAt, contentGuess, fitH } from "./stage/born.ts";
import { BORN } from "./kit/feel.ts";
import { BLOCK_MIN, PAD } from "./stage/geometry.ts";

const stage = { w: 1100, h: 700 };
const list = (n: number) => ({ steps: Array.from({ length: n }, (_, i) => ({ t: `item ${i + 1}`, st: "" })) });

test("Try: a three-item list is born three rows tall (its head, three rows, its foot), as wide as its rows (#954: 300, whole.html scene 5)", () => {
  const s = bornAt(stage, "list", list(3));
  assert.equal(s.h, BORN.head + 3 * BORN.row + BORN.listFoot + BORN.foot);
  assert.equal(s.w, BORN.list);
  // one more row is one row taller; no fixed pixels per kind
  assert.equal(bornAt(stage, "list", list(4)).h - s.h, BORN.row);
});

test("a page reads at the measure, 412 plus its sides; a run (terminal, browser, shots) is born wide", () => {
  assert.equal(bornAt(stage, "page", { md: "one line" }).w, 412 + 24);
  for (const k of ["terminal", "browser", "shots"] as const) assert.equal(bornAt(stage, k, {}).w, stage.w - 2 * PAD, k);
  assert.equal(bornAt(stage, "terminal", {}, undefined, 300).w, stage.w - 2 * PAD - 300, "the room left of what is beside it");
});

test("the judge's band, when the engine sends it (#821), wins over the kind's default; nonsense is ignored", () => {
  assert.equal(bandOf("page", "wide"), "wide");
  assert.equal(bandOf("terminal", "measure"), "measure");
  assert.equal(bandOf("page", "huge"), "measure");
  assert.equal(bornAt(stage, "page", { md: "x" }, "wide").w, stage.w - 2 * PAD);
});

test("text is as tall as the lines it wraps to at the measure; nothing known is block.min until the fit", () => {
  const per = Math.floor(BORN.measure / BORN.ch);
  assert.equal(contentGuess("page", { md: "a".repeat(per) }, BORN.measure + 2 * BORN.side), BORN.line);
  assert.equal(contentGuess("page", { md: "a".repeat(per + 1) }, BORN.measure + 2 * BORN.side), 2 * BORN.line);
  assert.equal(contentGuess("page", { md: "a\nb\nc" }, 436), 3 * BORN.line);
  assert.equal(bornAt(stage, "table", {}).h, BLOCK_MIN.h);
});

test("the fit: never under block.min, never past the stage; a long list is held at the stage's height", () => {
  assert.equal(fitH(40, stage), BLOCK_MIN.h);
  assert.equal(fitH(152.2, stage), 153);
  assert.equal(fitH(5000, stage), stage.h - 2 * PAD);
  assert.equal(bornAt(stage, "list", list(60)).h, stage.h - 2 * PAD);
  assert.ok(bornAt({ w: 300, h: 400 }, "page", { md: "x" }).w <= 300 - 2 * PAD, "a narrow stage: the block fits inside it");
});

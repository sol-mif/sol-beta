// node --test src/*.test.ts: the browser block's child web view kept on its block (#699, stage/kinds/view.ts): where it
// goes, when it hides, when the shell is told again; and the address the bar keeps. The shell's own cut to the stage's
// box is thing.rs `clip`, tested there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressOf, moved, samples, shownUrl, viewOf } from "./stage/kinds/view.ts";

const stage = { x: 300, y: 40, w: 900, h: 600 };
const body = { x: 334, y: 110, w: 452, h: 280 };

test("the view sits on the block's body, cut by the shell to the stage's box", () => {
  const v = viewOf(body, stage, {});
  assert.equal(v.show, true);
  assert.deepEqual(v.at, body);
  assert.deepEqual(v.clip, stage);
});

test("the view hides when the face must be seen over it: a drag, a pour, something lying on it, the stage away, no room", () => {
  assert.equal(viewOf(body, stage, { moving: true }).show, false);
  assert.equal(viewOf(body, stage, { covered: true }).show, false);
  assert.equal(viewOf(body, stage, { hidden: true }).show, false);
  assert.equal(viewOf({ ...body, w: 0 }, stage, {}).show, false);
  assert.equal(viewOf(body, { ...stage, h: 0 }, {}).show, false);
});

test("the points looked at for something lying on the body: its four corners 2px in, and its middle", () => {
  assert.deepEqual(samples({ x: 10, y: 20, w: 100, h: 50 }), [[12, 22], [108, 22], [12, 68], [108, 68], [60, 45]]);
});

test("the shell is told again only when the view moved half a pixel, the stage changed, or it showed or hid", () => {
  const a = viewOf(body, stage, {});
  assert.equal(moved(null, a), true, "the first time");
  assert.equal(moved(a, viewOf({ ...body, x: body.x + 0.2 }, stage, {})), false, "less than half a pixel");
  assert.equal(moved(a, viewOf({ ...body, x: body.x + 8 }, stage, {})), true, "the block moved");
  assert.equal(moved(a, viewOf({ ...body, w: body.w + 8 }, stage, {})), true, "the grip");
  assert.equal(moved(a, viewOf(body, { ...stage, w: 700 }, {})), true, "the stage changed width");
  assert.equal(moved(a, viewOf(body, stage, { covered: true })), true, "the ledger opened over it");
});

test("an address: http on this machine, https elsewhere; the bar shows it bare", () => {
  assert.equal(addressOf("localhost:1420"), "http://localhost:1420");
  assert.equal(addressOf(" example.com/a "), "https://example.com/a");
  assert.equal(addressOf("http://localhost:1420/x"), "http://localhost:1420/x");
  assert.equal(shownUrl("http://localhost:1420/"), "localhost:1420");
  assert.equal(shownUrl("https://example.com/a"), "example.com/a");
});

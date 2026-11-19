// The talk as a docked block (#734, v4 §2): its width at reading width and never under the floor, the seam, the bottom
// row rising while you write, the nearest dock while lifted, full and back, the bottom dock's last exchange. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCK_GHOSTS, STAGE_FLOOR, TALK, dockBack, dockTo, lastExchange, nearestDock, seamShare, talkRow, talkWidth } from "./stage/model.ts";
import { fromEngine } from "./stage/engineStore.ts";

const ch = 7.5;

test("the talk's width: reading width by default, its kept share when dragged, never under 44ch, the stage keeps its floor", () => {
  assert.equal(talkWidth(1200, ch), TALK.read * ch, "64ch with no share kept");
  assert.equal(talkWidth(1200, ch, 0.5), 600);
  assert.equal(talkWidth(1200, ch, 0.05), TALK.floor * ch, "never under 44ch");
  assert.equal(talkWidth(1200, ch, 0.95), 1200 - STAGE_FLOOR, "the stage beside keeps its floor");
  assert.equal(talkWidth(400, ch, 0.9), TALK.floor * ch, "a room narrower than both: the talk's floor wins");
});

test("the seam: dragged from the left dock it is the talk's right edge, from the right dock its left edge", () => {
  assert.equal(seamShare("left", 1000, ch, 500), 0.5);
  assert.equal(seamShare("right", 1000, ch, 600), 0.4);
  assert.equal(seamShare("left", 1000, ch, 10), (TALK.floor * ch) / 1000, "dragged narrow it stops at 44ch");
});

test("the bottom dock: a 200 px row that rises to 46% while you write and folds back on send", () => {
  assert.equal(talkRow(800, false), 300);
  assert.equal(talkRow(690, false), Math.round(0.42 * 690));
  assert.equal(talkRow(400, false), 200);
  assert.equal(talkRow(800, true), Math.round(0.46 * 800));
  assert.equal(talkRow(300, true), 200, "never lower than the row");
  assert.equal(talkRow(150, false), 150, "never past the room");
});

test("lifted, the nearest dock lights: the sides, the foot, the top's middle for full", () => {
  assert.equal(nearestDock(0.05, 0.5), "left");
  assert.equal(nearestDock(0.95, 0.4), "right");
  assert.equal(nearestDock(0.5, 0.9), "bottom");
  assert.equal(nearestDock(0.5, 0.1), "full");
  assert.equal(nearestDock(0.4, 0.5), "left", "between ghosts: the closest edge");
  for (const [d, r] of Object.entries(DOCK_GHOSTS)) assert.equal(nearestDock(r.x + r.w / 2, r.y + r.h / 2), d, `the middle of ${d}'s ghost`);
});

test("full remembers the dock it left; back returns there; the same dock asked changes nothing", () => {
  const t = dockTo({ dock: "right", width: 0.4 }, "full");
  assert.deepEqual(t, { dock: "full", width: 0.4, was: "right" });
  assert.deepEqual(dockBack(t), { dock: "right", width: 0.4, was: "right" });
  assert.equal(dockBack({ dock: "full" }).dock, "left", "full with no dock before goes to the default");
  const l = { dock: "left" as const };
  assert.equal(dockTo(l, "left"), l);
  assert.equal(dockBack(l), l, "back from a dock that is not full stays");
});

test("the bottom dock holds the last exchange: your last words and what came after", () => {
  const it = (kind: string, id: string) => ({ kind, id });
  const items = [it("me", "a"), it("you", "b"), it("me", "c"), it("tool", "d"), it("you", "e")];
  assert.deepEqual(lastExchange(items).map((x) => x.id), ["c", "d", "e"]);
  assert.deepEqual(lastExchange([it("you", "x")]).map((x) => x.id), ["x"], "nothing said yet: all of it");
});

test("the engine's stage.json carries the talk to the face", () => {
  const s = fromEngine({ stage: { lens: "app", blocks: [], tiled: false, talk: { dock: "bottom", width: 0.3 } } });
  assert.deepEqual(s.stage.talk, { dock: "bottom", width: 0.3 });
  assert.equal(fromEngine({ stage: { lens: "app", blocks: [], tiled: false } }).stage.talk, undefined);
});

test("the stage got narrower: a block that sticks out moves in; if that makes two touch, the stage tiles; the talk stays", async () => {
  const { fitInto, PAD } = await import("./stage/model.ts");
  const at = (id: string, x: number, y: number, w = 300, h = 200) => ({ id, x, y, w, h, z: 1 });
  assert.equal(fitInto({ w: 1000, h: 600 }, [at("a", 12, 12)]), null, "everything fits: nothing written");
  const one = fitInto({ w: 500, h: 600 }, [at("a", 12, 12), at("b", 400, 300, 300, 200)])!;
  assert.deepEqual(one.find((p) => p.id === "b"), at("b", 500 - PAD - 300, 300, 300, 200), "moved in, its size kept");
  const two = fitInto({ w: 500, h: 600 }, [at("a", 12, 12), at("b", 400, 12)])!;
  assert.ok(two.every((p) => p.x + p.w <= 500 - PAD && p.y + p.h <= 600 - PAD), "moved in, they touched: tiled inside");
  assert.equal(fitInto({ w: 500, h: 600 }, [{ ...at("f", 900, 12), folded: true }]), null, "a folded block has no place to keep");
});

test("a room too small for the stage beside the talk: the talk shows full until there is room", async () => {
  const { roomFor, STAGE_FLOOR, MIN, PAD } = await import("./stage/model.ts");
  assert.equal(roomFor("left", 1000, 700, 480, 200), true);
  assert.equal(roomFor("right", 480 + STAGE_FLOOR - 1, 700, 480, 200), false, "a column and less than the stage's floor beside it");
  assert.equal(roomFor("bottom", 600, 200 + MIN.h + 2 * PAD, 480, 200), true);
  assert.equal(roomFor("bottom", 600, 300, 480, 200), false, "the foot's row and less than a block's height over it");
  assert.equal(roomFor("full", 10, 10, 480, 200), true);
});

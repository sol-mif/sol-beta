// The tray (#739, pain points 4 and 5): what a new session's stage holds (nothing but the talk), the tray's groups (the
// stage's own in front, then the project's by the session that made them, newest first), the miniature at 1/6, a full
// stage folding its oldest untouched block for a newcomer and never one placed by hand, ⌘Z putting it back, the block ⌘W
// folds, a miniature's drop spot, and a pull from the tray being one block, one ledger. No DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAD, SIZES, overlaps, type Place } from "./stage/model.ts";
import { count, dropAt, focusedOf, groups, makeRoom, miniSize, unfoldBack, type TrayBlock } from "./stage/trayRules.ts";
import { LocalStore } from "./stage/store.ts";
import { fromEngine } from "./stage/engineStore.ts";

const stage = { w: 900, h: 520 };
const at = (id: string, x: number, y: number, w = 440, h = 230, more: Partial<Place> = {}): Place => ({ id, x, y, w, h, z: 1, ...more });
const t = (id: string, from: string, at: number): TrayBlock => ({ id, kind: "card", title: id, state: "live", from, at });

test("the tray's groups: the stage's own in front, then the project's by the session that made them, newest first", () => {
  const g = groups([{ id: "f1", kind: "page", title: "folded", own: true }], [t("a1", "A", 10), t("b1", "B", 30), t("a2", "A", 20), t("b0", "B", 5)]);
  assert.deepEqual(g.map((x) => x.from), [null, "B", "A"], "own first; then the session with the newest block");
  assert.deepEqual(g[1].minis.map((m) => m.id), ["b1", "b0"]);
  assert.deepEqual(g[2].minis.map((m) => m.id), ["a2", "a1"]);
  assert.ok(g[0].minis[0].own && !g[1].minis[0].own, "own are solid, the project's are outlines");
  assert.equal(count(g), 5, "the hairline's count");
  assert.deepEqual(groups([], []), [], "an empty tray has no groups");
});

test("a miniature is the frame at 1/6 of its born size", () => {
  assert.deepEqual(miniSize("page"), { w: Math.round(SIZES.page[0] / 6), h: Math.round(SIZES.page[1] / 6) });
  assert.deepEqual(miniSize("card"), { w: Math.round(SIZES.card[0] / 6), h: Math.round(SIZES.card[1] / 6) });   // the v4 tiles (#738)
});

test("a full stage: the oldest untouched block folds to the tray and the newcomer takes its spot; nothing shrinks", () => {
  const places = [at("old", PAD, PAD), at("mid", PAD + 452, PAD), at("new", PAD, PAD + 242), at("held", PAD + 452, PAD + 242, 440, 230, { hand: true })];
  const r = makeRoom(stage, { w: 440, h: 230 }, places);
  assert.deepEqual(r.folded, ["old"], "the first placed, untouched, folds");
  assert.deepEqual(r.at, { x: PAD, y: PAD, w: 440, h: 230 }, "the newcomer takes its spot");
  assert.equal(r.places.find((p) => p.id === "old")?.folded, true);
  for (const p of r.places.filter((q) => !q.folded)) assert.deepEqual([p.w, p.h], [440, 230], "no block shrank");
  assert.deepEqual(r.before.map((p) => [p.id, p.x, p.y]), [["old", PAD, PAD]], "its place kept for ⌘Z");
});

test("a newcomer bigger than the spot takes the folded block's rect: one fold, never more", () => {
  const places = [at("old", PAD, PAD, 300, 240), at("b", PAD + 312, PAD, 564, 240, { hand: true }), at("c", PAD, PAD + 252, 876, 244, { hand: true })];
  const r = makeRoom(stage, { w: 460, h: 300 }, places);
  assert.deepEqual(r.folded, ["old"], "one fold");
  assert.deepEqual(r.at, { x: PAD, y: PAD, w: 300, h: 240 }, "the spot as it was");
});

test("a block moved or resized by hand is never folded for room; when all are, the newcomer waits in the tray", () => {
  const held = [at("a", PAD, PAD, 876, 496, { hand: true })];
  const r = makeRoom(stage, { w: 440, h: 230 }, held);
  assert.equal(r.at, null);
  assert.deepEqual(r.folded, []);
  assert.equal(r.places[0].folded, undefined, "the held block stays");
  // pinned and popped ones are not on the stage to fold either
  const r2 = makeRoom(stage, { w: 440, h: 230 }, [at("p", PAD, PAD, 876, 496, { pinned: true, folded: true }), at("h", PAD, PAD, 876, 496, { hand: true })]);
  assert.equal(r2.at, null);
});

test("room enough: nothing folds", () => {
  const r = makeRoom(stage, { w: 260, h: 140 }, [at("a", PAD, PAD)]);
  assert.deepEqual(r.folded, []);
  assert.ok(r.at && !overlaps({ ...r.at, w: 260, h: 140 }, at("a", PAD, PAD)));
});

test("⌘Z: the folded block back where it was; the newcomer in its spot moves to a free one", () => {
  const places = [at("old", PAD, PAD), at("mid", PAD + 452, PAD), at("new", PAD, PAD + 242), at("held", PAD + 452, PAD + 242, 440, 230, { hand: true })];
  const r = makeRoom(stage, { w: 260, h: 140 }, places);
  const after = [...r.places, at("born", r.at!.x, r.at!.y, 260, 140)];
  const back = unfoldBack(stage, after, r.before);
  const old = back.find((p) => p.id === "old")!;
  assert.deepEqual([old.x, old.y, old.folded], [PAD, PAD, false], "back where it was, unfolded");
  assert.ok(old.z > Math.max(...after.map((p) => p.z)), "on top");
});

test("the block ⌘W folds: the focused one, else the one picked alone, else the topmost", () => {
  const ps = [at("a", 0, 0, 100, 100, { z: 1 }), at("b", 0, 0, 100, 100, { z: 3 }), at("c", 0, 0, 100, 100, { z: 2, folded: true })];
  assert.equal(focusedOf(ps, "a", []), "a");
  assert.equal(focusedOf(ps, null, ["a"]), "a");
  assert.equal(focusedOf(ps, null, ["a", "b"]), "b", "two picked: the topmost");
  assert.equal(focusedOf(ps, "c", []), "b", "a folded focus is not on the stage");
  assert.equal(focusedOf([], null, []), null);
});

test("a miniature dropped: its born size, its head under the pointer, kept inside the stage", () => {
  const r = dropAt(stage, "card", 450, 200);
  assert.deepEqual([r.w, r.h], SIZES.card);
  assert.equal(r.x + r.w / 2, 450);
  const edge = dropAt(stage, "page", 890, 515);
  assert.ok(edge.x + edge.w <= stage.w - PAD && edge.y + edge.h <= stage.h - PAD, "never past the stage");
});

test("the engine's tray reads through; a pull is the same block, out of the tray, on the stage where dropped, one ledger line", () => {
  const seen = fromEngine({ stage: { lens: "app", blocks: [], tiled: false }, blocks: [], tray: [t("x1", "sess-a", 1)] });
  assert.equal(seen.blocks.length, 0, "the talk alone");
  assert.deepEqual(seen.tray?.map((x) => x.id), ["x1"]);
  assert.deepEqual(fromEngine({}).tray, [], "no tray said: empty");
  const mem = new Map<string, string>();
  const s = new LocalStore("t.", { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } });
  s.place("N", { lens: "app", blocks: [], tiled: false });
  (s.read("N") as { tray?: TrayBlock[] }).tray = [t("x1", "sess-a", 1)];
  s.pull("N", "x1", "you", { x: 40, y: 50, w: 260, h: 140 });
  const n = s.read("N");
  assert.deepEqual(n.blocks.map((b) => [b.id, b.sessions]), [["x1", ["sess-a", "N"]]]);
  assert.deepEqual(n.stage.blocks.map((p) => [p.id, p.x, p.y]), [["x1", 40, 50]]);
  assert.equal(n.tray?.length, 0);
  assert.match(n.ledger.x1.at(-1)!.what, /^carried/);
  s.pull("N", "x1", "you");
  assert.equal(s.read("N").blocks.length, 1, "pulled twice, one block");
});

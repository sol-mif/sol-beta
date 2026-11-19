// node --test src/*.test.ts (npm test here): Build built from its design (#954, sol/design/build/whole.md): the stage
// behind stage.whole is never re-tiled when it gets smaller (pain 5), and the talk keeps one width (every scene).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitWhole, inside, overlaps, type Room } from "./stage/geometry.ts";
import { TALK, TALK_WHOLE, talkWidth, talkWholeWidth } from "./stage/model.ts";

const P = (id: string, x: number, y: number, w: number, h: number, z: number, more = {}) => ({ id, x, y, w, h, z, ...more });

test("a stage that got smaller: a block that sticks out moves in at its size, nothing is re-tiled", () => {
  const room: Room = { w: 800, h: 600 };
  const was = [P("left", 16, 16, 300, 214, 1), P("rules", 330, 16, 412, 380, 2), P("gate", 16, 410, 726, 180, 3), P("diff", 760, 16, 300, 300, 4)];
  const out = fitWhole(room, was)!;
  assert.ok(out, "something stuck out");
  for (const id of ["left", "gate"]) assert.deepEqual(out.find((p) => p.id === id), was.find((p) => p.id === id), `${id} stays where it was`);
  for (const p of out) { const w = was.find((x) => x.id === p.id)!; assert.equal(p.w, w.w, `${p.id} keeps its width`); assert.equal(p.h, w.h, `${p.id} keeps its height`); }
  // no free place for the diff at its size: the oldest untouched block it crosses (the rules, z 2) folds to the tray
  assert.equal(out.find((p) => p.id === "rules")!.folded, true);
  assert.equal(out.find((p) => p.id === "diff")!.folded, undefined);
  const shown = out.filter((p) => !p.folded);
  for (const p of shown) assert.ok(inside(room, p), `${p.id} is on the stage`);
  for (const a of shown) for (const b of shown) if (a !== b) assert.ok(!overlaps(a, b), `${a.id} and ${b.id} do not cross`);
});

test("no free place: the oldest untouched block folds, never one the hand placed", () => {
  const room: Room = { w: 600, h: 400 };
  const out = fitWhole(room, [P("a", 16, 16, 560, 360, 1, { hand: true }), P("b", 700, 16, 300, 300, 2)])!;
  assert.equal(out.find((p) => p.id === "a")!.folded, undefined, "the hand's block stays");
  assert.equal(out.find((p) => p.id === "b")!.folded, true);
});

test("everything already fits: nothing to do", () => {
  assert.equal(fitWhole({ w: 1000, h: 600 }, [P("a", 16, 16, 300, 200, 1)]), null);
});

test("the talk in stage.whole keeps one width, blocks or none", () => {
  const ch = 8;
  assert.equal(talkWholeWidth(1200, ch), TALK_WHOLE, "one width, blocks or none (StageColumn asks it whatever is open)");
  assert.equal(talkWidth(1200, ch), TALK.read * ch, "with the switch off: reading width as on main");
});

// #954, scene 7: the tray's copies are live (whole.md "fold": small live copies, grouped by session)
import { lastLines, trayGroups } from "./stage/trayFold.ts";

test("a fold of this stage carries its body to its copy; the engine's tray carries one when it sends it", () => {
  const gs = trayGroups("s1", [{ id: "a", kind: "list", title: "what's left", made: "s1", body: { steps: [] } }], [{ id: "b", kind: "page", title: "old", state: "live", from: "s0", at: 1 }, { id: "c", kind: "page", title: "said", state: "live", from: "s0", at: 2, body: { text: "# hi" } }]);
  assert.deepEqual(gs[0].minis[0].body, { steps: [] }, "this session's fold is drawn live");
  const old = gs[1].minis;
  assert.equal(old.find((m) => m.id === "b")!.body, undefined, "a copy without a body keeps its mark and title");
  assert.deepEqual(old.find((m) => m.id === "c")!.body, { text: "# hi" });
});

test("a terminal's copy: its last lines, without the shell's escapes", () => {
  assert.equal(lastLines("\x1b[32mlint\x1b[0m ok\r\nunit 188\r\ne2e 18", 2), "unit 188\ne2e 18");
});

// #954, scenes 11 and 12: a lens is a drawing of the same blocks (whole.md pain 8)
import { drawLens, ideGroups } from "./stage/lens.ts";

test("a lens behind stage.whole only redraws: the blocks keep their places, what an old TUI folded comes back", () => {
  const st = { lens: "tui" as const, tiled: false, blocks: [P("a", 16, 16, 300, 200, 1, { folded: true, lensed: true }), P("t", 12, 12, 900, 500, 2, { tui: true })] };
  const out = drawLens(st, "ide");
  assert.equal(out.lens, "ide");
  assert.equal(out.blocks.find((p) => p.id === "a")!.folded, false, "unfolded where it was");
  assert.deepEqual([out.blocks[0].x, out.blocks[0].y], [16, 16]);
});

test("the IDE's editor groups: one, two side by side, three with a tall one at the left; more blocks are more tabs", () => {
  const room = { w: 900, h: 600 };
  assert.equal(ideGroups([], room, 12, 12).length, 0);
  assert.equal(ideGroups(["a"], room, 12, 12)[0].r.w, 876);
  const two = ideGroups(["a", "b"], room, 12, 12);
  assert.ok(two[0].r.x + two[0].r.w + 12 <= two[1].r.x, "side by side, a gap between");
  const four = ideGroups(["a", "b", "c", "d"], room, 12, 12, 32);
  assert.deepEqual(four.map((g) => g.ids), [["a", "d"], ["b"], ["c"]]);
  assert.equal(four[0].r.h, four[1].r.h + 12 + four[2].r.h, "the tall group as tall as the two stacked");
  for (const g of four) assert.ok(g.r.y + g.r.h <= 600 - 32, "above the tray");
});

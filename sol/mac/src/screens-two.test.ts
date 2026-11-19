// node --test src/*.test.ts: Jelly across screens (#1090). One Jelly, several windows onto it: each window draws its share
// of the one stage (the same blocks, its own layout), a throw is the record's line for a block and nothing else, the edge
// that faces the other window is the only one that throws, and with the switch off nothing is new.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSwitch, type SwitchEnv } from "./flag.ts";
import { LocalStore, type Seen } from "./stage/store.ts";
import type { Block } from "./stage/model.ts";
import { share, fill, layoutOut, drawnOn, homeOf, facing, leftBy, throwTo, edgeToward, winOf, roleAsked, anchorFacts, NONE, type ScreensState, type Win } from "./screens/model.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const env = (o: Record<string, string> = {}, search = ""): SwitchEnv => ({ storage: () => ({ getItem: (k: string) => o[k] ?? null, setItem: (k: string, v: string) => { o[k] = v; } }), search: () => search, target: new EventTarget() });
const win = (w: string, role: Win["role"], live = true, screen?: Win["screen"]): Win => ({ win: w, role, live, at: 0, ...(screen ? { screen } : {}) });
// main whole (it keeps the engine's layout) beside a wall; the anchor + stage pair has its own test below
const state = (p: Partial<ScreensState> = {}): ScreensState => ({ ...NONE, windows: [win("main", "whole"), win("two", "wall")], ...p });
const blk = (id: string): Block => ({ id, kind: "page", title: id, state: "live", versions: [], sessions: ["s1"] } as unknown as Block);
const seen = (): Seen => ({
  blocks: [blk("a"), blk("b"), blk("c")],
  stage: { lens: "app", tiled: false, blocks: [{ id: "a", x: 0, y: 0, w: 400, h: 300, z: 1 }, { id: "b", x: 420, y: 0, w: 400, h: 300, z: 2 }, { id: "c", x: 0, y: 320, w: 400, h: 200, z: 3 }] },
  ledger: { a: [{ at: 1, by: "sol", what: "composed" }] },
});

test("screens.two is off by default, on by storage or the link", () => {
  assert.equal(buildSwitch("screens.two", env()).get(), false);
  assert.equal(buildSwitch("screens.two", env({ "screens.two": "1" })).get(), true);
  assert.equal(buildSwitch("screens.two", env({}, "?screens.two=on")).get(), true);
});

test("its row is in Settings › me, beside Home and Build, one place; the seam layer is mounted in App", () => {
  const s = read("./Settings.tsx");
  assert.match(s, /<CrossRow \/>\s*\n\s*<ScreensRow \/>/);
  assert.match(read("./screens/ScreensRow.tsx"), /sh\.sel !== "me"/);
  assert.match(read("./App.tsx"), /<Seams \/>/);
  assert.match(read("./screens/Seam.tsx"), /if \(!on \|\| !edges\.length\) return null;/);
});

test("with the switch off nothing is new: no hello, the stage draws from the store it always did, no role", () => {
  const st = read("./screens/store.ts");
  assert.match(st, /if \(up && screensOn\(\)\) hello\(\)/);
  assert.match(st, /if \(!screensOn\(\)\) return null;/);
  assert.match(read("./home/Home.tsx"), /store=\{screens \? shareOf\(stageStore\) : stageStore\}/);
  assert.match(read("./screens/throw.ts"), /if \(!screensOn\(\)\) return null;/);
});

test("a page knows its window and the role it asks for from its link", () => {
  assert.equal(winOf(""), "main");
  assert.equal(winOf("?screen=two"), "two");
  assert.equal(winOf("?screen=../etc"), "main");
  assert.equal(roleAsked("?role=anchor"), "anchor");
  assert.equal(roleAsked("?role=boss"), undefined);
});

test("two windows, one stage: each draws only its blocks; a block drawn elsewhere is not lost, only not here", () => {
  const s = state({ where: { b: "two" } });
  const main = share(seen(), s, "main", "s1"), two = share(seen(), s, "two", "s1");
  assert.deepEqual(main.blocks.map((b) => b.id), ["a", "c"]);
  assert.deepEqual(main.stage.blocks.map((p) => p.id), ["a", "c"]);
  assert.deepEqual(two.blocks.map((b) => b.id), ["b"]);
  // the same block object: the ledger, the body and the state are the one block's
  assert.equal(two.blocks[0], seen().blocks[1].id === "b" ? two.blocks[0] : null);
  assert.deepEqual(main.ledger, seen().ledger);
});

test("two layouts of one state: the other window has its own places, tiled until it has them", () => {
  const s0 = state({ where: { b: "two", c: "two" } });
  const two0 = share(seen(), s0, "two", "s1");
  // not placed here yet: the window is filled with them (two halves)
  assert.deepEqual(two0.stage.blocks.map((p) => [p.id, p.folded ?? false]), [["b", false], ["c", false]]);
  const s1 = state({ where: { b: "two", c: "two" }, lay: { two: { s1: [{ id: "b", x: 0, y: 0, w: 1200, h: 700 }, { id: "c", x: 1220, y: 0, w: 600, h: 700 }] } } });
  const two1 = share(seen(), s1, "two", "s1");
  assert.equal(two1.stage.tiled, false);
  assert.deepEqual(two1.stage.blocks.map((p) => [p.id, p.w]), [["b", 1200], ["c", 600]]);
  // the main window's places for the same blocks are untouched by the other's
  assert.deepEqual(seen().stage.blocks.find((p) => p.id === "b")!.w, 400);
});

test("a layout written in the main window keeps the places of blocks drawn elsewhere; the other window's is its own", () => {
  const s = state({ where: { b: "two" } });
  const full = seen().stage;
  const moved = { ...full, blocks: [{ id: "a", x: 10, y: 10, w: 500, h: 300, z: 4 }, { id: "c", x: 0, y: 320, w: 400, h: 200, z: 3 }] };
  const o = layoutOut(moved, full, s, "main");
  assert.deepEqual(o.engine!.blocks.map((p) => p.id), ["a", "c", "b"]);
  assert.equal(o.engine!.blocks.find((p) => p.id === "b")!.x, 420);
  const o2 = layoutOut({ ...full, blocks: [{ id: "b", x: 0, y: 0, w: 900, h: 600, z: 1 }] }, full, s, "two");
  assert.equal(o2.engine, undefined);
  assert.deepEqual(o2.own, [{ id: "b", x: 0, y: 0, w: 900, h: 600, z: 1 }]);
});

test("laptop as anchor, monitor as stage: a block nobody threw is on the monitor, and the monitor keeps the engine's layout", () => {
  const s = state({ windows: [win("main", "anchor"), win("two", "stage")] });
  assert.equal(homeOf(s), "two");
  assert.deepEqual(share(seen(), s, "two", "s1").blocks.map((b) => b.id), ["a", "b", "c"]);
  assert.deepEqual(share(seen(), s, "main", "s1").blocks, []);
  assert.ok(layoutOut(seen().stage, seen().stage, s, "two").engine);
  // one thrown onto the laptop: drawn there, with a layout of its own
  // the engine's put: the anchor takes a stage (whole), and the monitor goes on keeping what nobody threw
  const s2 = { ...s, windows: [win("main", "whole"), win("two", "stage")], keeps: "two", where: { b: "main" } };
  assert.deepEqual(share(seen(), s2, "main", "s1").blocks.map((b) => b.id), ["b"]);
  assert.ok(layoutOut(seen().stage, seen().stage, s2, "main").own);
});

test("a window gone (its screen unplugged): its blocks fold home, and come back with it", () => {
  const gone = state({ where: { b: "two" }, windows: [win("main", "anchor"), win("two", "stage", false)] });
  assert.equal(drawnOn(gone, "b"), "main");
  assert.deepEqual(share(seen(), gone, "main", "s1").blocks.map((b) => b.id), ["a", "b", "c"]);
  const back = state({ where: { b: "two" } });
  assert.equal(drawnOn(back, "b"), "two");
});

test("the edge that faces the other screen: a monitor to the right, above, or on the left", () => {
  const lap = { x: 0, y: 0, w: 1512, h: 982 };
  assert.equal(facing(lap, { x: 1512, y: -300, w: 2560, h: 1440 }), "right");
  assert.equal(facing(lap, { x: -200, y: -1440, w: 2560, h: 1440 }), "top");
  assert.equal(facing(lap, { x: -1920, y: 0, w: 1920, h: 1080 }), "left");
  assert.equal(facing({ x: 1512, y: -300, w: 2560, h: 1440 }, lap), "left");
});

test("only the facing edge throws; the window across it is where the block lands", () => {
  const lap = { x: 0, y: 0, w: 1512, h: 982 }, mon = { x: 1512, y: 0, w: 2560, h: 1440 };
  const s = state({ windows: [win("main", "whole", true, lap), win("two", "wall", true, mon)] });
  assert.equal(throwTo(s, "main", lap, "right")?.win, "two");
  // an anchor takes no blocks: nothing lands on it
  assert.equal(throwTo(state({ windows: [win("main", "anchor", true, lap), win("two", "stage", true, mon)] }), "two", mon, "left"), null);
  assert.equal(throwTo(s, "main", lap, "left"), null);
  assert.equal(throwTo(s, "main", lap, null), null);
  assert.equal(throwTo(s, "two", mon, "left")?.win, "main");   // pulled back the same way
  assert.equal(throwTo(state({ windows: [win("main", "whole")] }), "main", lap, "right"), null);   // alone: nowhere
  // two browser windows that do not say where they stand: main's right faces the other's left
  const s2 = state();
  assert.equal(edgeToward("main", "main", undefined, s2.windows[1]), "right");
  assert.equal(edgeToward("two", "main", undefined, s2.windows[0]), "left");
  assert.equal(throwTo(s2, "two", undefined, "left")?.win, "main");
});

test("the edge a pointer left by", () => {
  const W = { w: 1000, h: 600 };
  assert.equal(leftBy(W, 500, 300), null);
  assert.equal(leftBy(W, 1003, 300), "right");
  assert.equal(leftBy(W, -1, 300), "left");
  assert.equal(leftBy(W, 500, -4), "top");
});

test("a window's share through the store: the same LocalStore, two windows, each reads its own and writes its own", async () => {
  const kv = new Map<string, string>();
  const base = new LocalStore("t.", { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => { kv.set(k, v); } });
  base.compose("s1", blk("a"), { x: 0, y: 0, w: 400, h: 300, z: 1 });
  base.compose("s1", blk("b"), { x: 420, y: 0, w: 400, h: 300, z: 2 });
  // a minimal record and a fake wire for the window's own layout, without a socket
  let rec = state({ where: { b: "two" } });
  const own: unknown[] = [];
  const { windowStore } = await import("./screens/windowStore.ts");
  const main = windowStore(base, "main", () => rec, undefined, () => {});
  const two = windowStore(base, "two", () => rec, undefined, (_s: string, p: unknown) => own.push(p));
  assert.deepEqual(main.read("s1").blocks.map((b) => b.id), ["a"]);
  assert.deepEqual(two.read("s1").blocks.map((b) => b.id), ["b"]);
  assert.equal(main.read("s1"), main.read("s1"));   // the same answer while nothing changed (a stage subscribes to it)
  // a body changed in one window is the block's: the other reads it
  two.update("s1", "b", { title: "the plan" }, "renamed", "you");
  assert.equal(base.read("s1").blocks.find((b) => b.id === "b")!.title, "the plan");
  // pulled home: the main window draws it again, where it stood
  rec = state({ where: {} });
  assert.deepEqual(main.read("s1").blocks.map((b) => b.id), ["a", "b"]);
  two.place("s1", { lens: "app", tiled: false, blocks: [] });
  assert.equal(own.length, 1);
});

test("what stays on every window: how many wait and how many run", () => {
  assert.deepEqual(anchorFacts([{ st: "needs" }, { st: "running" }, { st: "running" }, { st: "done" }, { st: "" }]), { waits: 1, runs: 2 });
});

// design round 1: the throw is decided at let-go: past the edge, more than half over it, or a flick toward it
test("a let-go throws when more than half the block is over the facing edge, or it was flicked toward it", async () => {
  const { overOf, flick, halfOver, peekRect } = await import("./screens/carry.ts");
  const W = { w: 1000, h: 600 };
  assert.equal(overOf("right", W, { x: 900, y: 100, w: 200, h: 100 }), 0.5);
  assert.equal(overOf("left", W, { x: -150, y: 100, w: 200, h: 100 }), 0.75);
  assert.equal(overOf("right", W, { x: 100, y: 100, w: 200, h: 100 }), 0);
  assert.equal(halfOver(0.5), false);
  assert.equal(halfOver(0.51), true);
  // 120 px in 60 ms toward the right edge: 2 px/ms, a flick; the same speed away from it is not
  const fast = [{ x: 500, y: 300, t: 0 }, { x: 560, y: 300, t: 30 }, { x: 620, y: 300, t: 60 }];
  assert.equal(flick("right", fast), true);
  assert.equal(flick("left", fast), false);
  assert.equal(flick("right", [{ x: 500, y: 300, t: 0 }, { x: 520, y: 300, t: 60 }]), false);
  // the peek comes out of the seam at the height it left, as much showing as has crossed
  const r = peekRect("left", W, { w: 200, h: 100, y: 0.5, over: 0.25 });
  assert.deepEqual(r, { x: -150, y: 250, w: 200, h: 100 });
});

test("the main window keeps the blocks nobody threw while it draws a stage; a second window holds only what crossed", () => {
  const s = state({ windows: [win("main", "whole"), win("two", "stage")], where: { b: "two" } });
  assert.equal(homeOf(s), "main");
  assert.deepEqual(share(seen(), s, "main", "s1").blocks.map((b) => b.id), ["a", "c"]);
  assert.deepEqual(share(seen(), s, "two", "s1").blocks.map((b) => b.id), ["b"]);
});

test("whatever a window holds fills it: one full, two halves, three as one big and two stacked, the rest folded", () => {
  const room = { w: 1000, h: 600 };
  assert.deepEqual(fill(["a"], room).map((p) => [p.x, p.y, p.w, p.h]), [[12, 12, 976, 576]]);
  assert.deepEqual(fill(["a", "b"], room).map((p) => [p.x, p.w]), [[12, 482], [506, 482]]);
  const three = fill(["a", "b", "c"], room);
  assert.equal(three[0].w, 547);
  assert.deepEqual(three.slice(1).map((p) => [p.x, p.y, p.h]), [[571, 12, 282], [571, 306, 282]]);
  const five = fill(["a", "b", "c", "d", "e"], room);
  assert.deepEqual(five.map((p) => !!p.folded), [false, false, false, true, true]);
  // a block in or out: the window is filled again; the same blocks: its own layout stands
  const s = state({ where: { b: "two", c: "two" }, lay: { two: { s1: [{ id: "b", x: 5, y: 5, w: 300, h: 200 }, { id: "c", x: 400, y: 5, w: 300, h: 200 }] } } });
  assert.deepEqual(share(seen(), s, "two", "s1", room).stage.blocks.map((p) => p.w), [300, 300]);
  const s2 = { ...s, where: { b: "two" } };
  assert.deepEqual(share(seen(), s2, "two", "s1", room).stage.blocks.map((p) => [p.w, p.h]), [[976, 576]]);
});

test("a page alone on a wall may grow to 1.5, its layout never narrower than 720; elsewhere it never grows", async () => {
  const { pageFit } = await import("./stage/kinds/pageFit.ts");
  assert.equal(pageFit(1440, 900).scale, 1);
  const f = pageFit(1440, 900, undefined, undefined, 1.5);
  assert.equal(f.scale, 1.5);
  assert.equal(f.w, 960);
  assert.equal(pageFit(900, 900, undefined, undefined, 1.5).w, 720);
});

test("a window's room: a closed block takes no room, and a block that waits on the person is never the one folded", () => {
  const b = (id: string, st: string): Block => ({ ...blk(id), state: st } as unknown as Block);
  const many = (): Seen => ({ ...seen(), blocks: [b("a", "live"), b("x", "dead"), b("y", "dead"), b("c", "live"), b("w", "waits")] });
  const s = state({ where: { a: "two", x: "two", y: "two", c: "two", w: "two" },
    lay: { two: { s1: [{ id: "a", x: 12, y: 12, w: 1576, h: 802 }, { id: "x", x: 0, y: 0, w: 1, h: 1 }, { id: "y", x: 0, y: 0, w: 1, h: 1 }, { id: "c", x: 0, y: 0, w: 1, h: 1, folded: true }] } } });
  const two = share(many(), s, "two", "s1", { w: 1600, h: 900 });
  assert.deepEqual(two.stage.blocks.map((p) => [p.id, p.folded ?? false]), [["w", false], ["a", false], ["c", false]]);
  // four open, one waits and comes last in the list: still open; one of the others folds
  const four = (): Seen => ({ ...seen(), blocks: [b("a", "live"), b("c", "live"), b("d", "live"), b("w", "waits")] });
  const s4 = state({ where: { a: "two", c: "two", d: "two", w: "two" } });
  const laid = share(four(), s4, "two", "s1", { w: 1600, h: 900 }).stage.blocks;
  assert.equal(laid.find((p) => p.id === "w")!.folded ?? false, false);
  assert.equal(laid.filter((p) => p.folded).length, 1);
});

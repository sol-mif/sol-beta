// node --test src/*.test.ts: the stage's model and its local store (#696), the geometry play.html's §10 does and the
// shapes of the design page's §2, with no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fit, free, keep, settle, snap, snapSize, stateWords, tile, within, zoneAt, zoneRect, GAP, PAD, SIZES, type Block } from "./stage/model.ts";
import { LocalStore } from "./stage/store.ts";
import { filesOf, linesOf } from "./stage/kinds/lines.ts";
import { cellKind, numericCols } from "./stage/kinds/cells.ts";
import { metaWords, stampWords } from "./stage/kinds/head.ts";

const stage = { w: 1000, h: 600 };
const week = { x: 12, y: 12, w: 440, h: 300 };

test("snap: a block's top meets another's bottom and the gap; the guide is drawn on that line", () => {
  const me = { x: 400, y: 0, w: 300, h: 200 };
  const s = snap(stage, me, 457, 320, [week]);
  assert.equal(s.y, week.y + week.h + GAP);
  assert.equal(s.guides.y, week.y + week.h + GAP);
});

test("snap: right edges meet; the guide is the edge that meets, not the moving block's left", () => {
  const me = { x: 0, y: 400, w: 200, h: 120 };
  const s = snap(stage, me, 248, 401, [week]);
  assert.equal(s.x, week.x + week.w - me.w);
  assert.equal(s.guides.x, week.x + week.w);
});

test("snap: with nothing near, the grid of 8 holds and no guide shows", () => {
  const s = snap(stage, { x: 0, y: 0, w: 100, h: 100 }, 603, 405, []);
  assert.deepEqual([s.x, s.y], [600, 408]);
  assert.deepEqual(s.guides, { x: null, y: null });
});

test("the stage's edges snap: left at the padding, right at the far padding", () => {
  const me = { x: 0, y: 0, w: 300, h: 200 };
  assert.equal(snap(stage, me, 15, 200, []).x, PAD);
  assert.equal(snap(stage, me, stage.w - PAD - 300 + 4, 200, []).x, stage.w - PAD - 300);
});

test("the grip: a size snaps to the stage's far edge, and never below the smallest", () => {
  const me = { x: 500, y: 100, w: 300, h: 200 };
  assert.equal(snapSize(stage, me, stage.w - PAD - 500 - 5, 200, []).w, stage.w - PAD - 500);
  const tiny = snapSize(stage, me, 10, 10, []);
  assert.deepEqual([tiny.w, tiny.h], [200, 120]);
});

test("keep: a dragged block keeps its head on the stage", () => {
  const me = { x: 0, y: 0, w: 300, h: 200 };
  assert.deepEqual(keep(stage, me, 5000, -50), { x: stage.w - 60, y: 0 });
});

test("settle: a block let go hanging off the stage comes wholly onto it; one too big sits at the top left", () => {
  // the sweep: the week dropped by the right edge sat at x 928, w 320, on a stage 1016 wide; a full one dropped low right, mostly off
  const S = { w: 1016, h: 542 };
  assert.deepEqual(settle(S, { x: 928, y: 258, w: 320, h: 272 }), { x: S.w - PAD - 320, y: S.h - PAD - 272 });
  assert.deepEqual(settle(S, { x: 856, y: 488, w: 992, h: 518 }), { x: PAD, y: PAD });
  assert.deepEqual(settle(S, { x: -200, y: -10, w: 300, h: 200 }), { x: PAD, y: PAD });
  assert.deepEqual(settle(S, { x: 100, y: 80, w: 300, h: 200 }), { x: 100, y: 80 });   // already on the stage: unmoved
});

test("fit: a stage narrower than a place was laid on (the IDE's files, a smaller window) shows it wholly on it", () => {
  // the sweep: in the IDE the stage is 776 wide and the gate, laid at x 676 w 260, hung 160 past its edge
  assert.deepEqual(fit({ w: 776, h: 542 }, { x: 676, y: 12, w: 260, h: 140 }), { x: 776 - PAD - 260, y: 12, w: 260, h: 140 });
  // a window 636 × 382: a block 992 wide shrinks to the stage, never below the smallest a block gets
  assert.deepEqual(fit({ w: 636, h: 382 }, { x: 12, y: 12, w: 992, h: 518 }), { x: PAD, y: PAD, w: 636 - 2 * PAD, h: 382 - 2 * PAD });
  assert.deepEqual(fit({ w: 150, h: 100 }, { x: 0, y: 0, w: 400, h: 300 }), { x: PAD, y: PAD, w: 200, h: 120 });
  const r = { x: 100, y: 80, w: 300, h: 200 };
  assert.deepEqual(fit({ w: 1016, h: 542 }, r), r);   // room enough: as laid
});

test("the edge slots: the sides a half, the top the whole, the bottom the lower half", () => {
  assert.equal(zoneAt(stage, 5, 300), "left");
  assert.equal(zoneAt(stage, 995, 300), "right");
  assert.equal(zoneAt(stage, 500, 5), "full");
  assert.equal(zoneAt(stage, 500, 595), "bottom");
  assert.equal(zoneAt(stage, 500, 300), null);
  const l = zoneRect(stage, "left"), r = zoneRect(stage, "right");
  assert.equal(l.w, r.w);
  assert.equal(r.x - (l.x + l.w), GAP);
  assert.equal(r.x + r.w, stage.w - PAD);
  assert.deepEqual(zoneRect(stage, "full"), { x: PAD, y: PAD, w: stage.w - 2 * PAD, h: stage.h - 2 * PAD });
});

test("tile: one column for one, two up to four, three beyond; the cells fill the stage with the gap between", () => {
  assert.equal(tile(stage, 1)[0].w, stage.w - 2 * PAD);
  const four = tile(stage, 4);
  assert.equal(new Set(four.map((c) => c.x)).size, 2);
  const five = tile(stage, 5);
  assert.equal(new Set(five.map((c) => c.x)).size, 3);
  const last = five[2];
  assert.ok(Math.abs(last.x + last.w - (stage.w - PAD)) < 1e-9);
});

test("free: the first spot that touches nothing; null when nothing is free", () => {
  assert.deepEqual(free(stage, 300, 200, []), { x: PAD, y: PAD });
  const spot = free(stage, 300, 200, [week])!;
  assert.ok(spot.x >= week.x + week.w + GAP || spot.y >= week.y + week.h + GAP);
  assert.equal(free(stage, 900, 500, [week]), null);
});

test("a marquee picks what it touches, never a folded block", () => {
  const places = [{ id: "a", ...week, z: 1 }, { id: "b", x: 600, y: 300, w: 200, h: 200, z: 2 }, { id: "c", x: 20, y: 20, w: 50, h: 50, z: 3, folded: true }];
  assert.deepEqual(within({ x: 0, y: 0, w: 100, h: 100 }, places), ["a"]);
});

test("the head's words: live with its source, frozen with its version, else the state", () => {
  const b: Block = { id: "x", kind: "page", title: "the week", state: "live", bind: { source: "calendar.ts" }, versions: [], sessions: [] };
  assert.equal(stateWords(b), "live · calendar.ts");
  assert.equal(stateWords({ ...b, state: "frozen", versions: [{ n: 1, at: 0, by: "you" }] }), "frozen · v1");
  assert.equal(stateWords({ ...b, state: "waits" }), "waits");
});

test("the local store keeps the design's shapes: compose, place, freeze, close, each in the ledger", () => {
  const kv = new Map<string, string>();
  const st = new LocalStore("t.", { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v) });
  let told = 0;
  st.subscribe("s", () => told++);
  st.compose("s", { id: "w", kind: "page", title: "the week", state: "live", versions: [], sessions: [] }, { x: 12, y: 12, w: 440, h: 300, z: 1 });
  st.freeze("s", "w", "you");
  const s = st.read("s");
  assert.equal(s.blocks[0].state, "frozen");
  assert.deepEqual(s.blocks[0].sessions, ["s"]);
  assert.equal(s.blocks[0].versions[0].n, 1);
  assert.equal(s.stage.blocks[0].x, 12);
  st.close("s", "w", "you");
  assert.equal(st.read("s").stage.blocks.length, 0);
  assert.deepEqual(st.read("s").ledger.w.map((l) => l.what), ["composed", "frozen as v1 · your yes", "closed"]);
  assert.equal(told, 3);
  // what is kept is read back by a new store: stage.json survives the window
  const again = new LocalStore("t.", { getItem: (k) => kv.get(k) ?? null, setItem: () => {} });
  assert.equal(again.read("s").blocks[0].state, "dead");
});

test("a diff's text reads as its lines, the headers left out", () => {
  const l = linesOf({ text: "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n same" });
  assert.deepEqual(l, [{ k: "-", t: "old" }, { k: "+", t: "new" }, { k: " ", t: "same" }]);
});

test("born at content size: the v4 tiles of a 6-column stage with its gap (#738)", () => {
  const tile = (k: keyof typeof SIZES) => SIZES[k];
  const [cw, ch] = tile("card");
  assert.deepEqual(tile("list"), [cw, 2 * ch + GAP], "a list is 2 × 2");
  const col = (cw - GAP) / 2;
  assert.deepEqual(tile("page"), [3 * col + 2 * GAP, 4 * ch + 3 * GAP], "a page is 3 × 4");
  assert.deepEqual(tile("browser"), tile("page"));
  assert.deepEqual(tile("diff"), [3 * col + 2 * GAP, 3 * ch + 2 * GAP], "a diff is 3 × 3");
  for (const k of ["table", "terminal", "shots"] as const) assert.deepEqual(tile(k), [3 * col + 2 * GAP, 2 * ch + GAP], `${k} is 3 × 2`);
});

test("a diff's text cut into its files, each line with its gutter number (#738)", () => {
  const f = filesOf({ text: "diff --git a/a/x.ts b/a/x.ts\n--- a/a/x.ts\n+++ b/a/x.ts\n@@ -12,3 +12,3 @@\n keep\n-old\n+new\ndiff --git a/y.css b/y.css\n@@ -4 +4,2 @@\n+one\n+two" });
  assert.deepEqual(f.map((x) => [x.name, x.add, x.del]), [["x.ts", 1, 1], ["y.css", 2, 0]]);
  assert.deepEqual(f[0].lines.map((l) => [l.k, l.n]), [[" ", 12], ["-", 13], ["+", 13]]);
  assert.deepEqual(filesOf({ lines: [{ k: "-", t: "a" }, { k: "+", t: "b" }, { k: " ", t: "c" }] }, "Side.tsx")[0].lines.map((l) => l.n), [1, 1, 2]);
});

test("a table's cells: numbers right-aligned, a state its meaning dot (#738)", () => {
  assert.deepEqual([...numericCols([["nucbox", "running", "0:41"], ["mac", "queued", "—"]])], [2]);
  assert.equal(cellKind("running").state, "live");
  assert.equal(cellKind("waits on you").state, "waits");
  assert.equal(cellKind("failed").state, "wrong");
  assert.equal(cellKind("nucbox").state, undefined);
});

test("a block's head on hover, and the stamp of a frozen one (#738)", () => {
  const b = { id: "w", kind: "page" as const, title: "the week", bind: { source: "src/calendar.ts" }, state: "live" as const, versions: [], sessions: [] };
  const made = new Date(2026, 10, 8, 21, 6).getTime();
  assert.equal(metaWords(b, made), "page · made 21:06 · calendar.ts");
  assert.equal(metaWords({ ...b, state: "waits" }), "waits on you");
  assert.equal(stampWords({ ...b, state: "frozen", versions: [{ n: 1, at: 0, by: "you" }, { n: 2, at: new Date(2026, 10, 8, 21, 14).getTime(), by: "you" }] }, 2), "frozen · v2 · 21:14");
});

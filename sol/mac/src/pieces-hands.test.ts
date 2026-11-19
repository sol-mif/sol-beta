// The agent's hands (#1437, pieces/hands.ts): its moves are the hand's own edits of the one space's arrangement, so a
// piece it moves lands where it asked and none ever lies on another. Off by default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX, PAD, TALK, place, rule, shown, type Layout, type Rect } from "./pieces/arrange.ts";
import { STAGE_HANDS, WIDTHS, moved, scrolled } from "./pieces/hands.ts";
import { feltWatch, verbOf, KEPT_MS, type Felt } from "./pieces/felt.ts";

const S = { w: 1200, h: 860 }, KINDS = { a: "page", b: "list", c: "diff" };
const over = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const sound = (l: Layout) => {
  const { rects } = place(l, S, { boxH: 64, lead: "a", kinds: KINDS }), ids = Object.keys(rects);
  for (const i of ids) for (const j of ids) if (i < j) assert.ok(!over(rects[i], rects[j]), `${i} and ${j} overlap`);
  return rects;
};
const base = () => rule(S, ["a", "b"], "a");
const colOf = (l: Layout, id: string) => l.cols.findIndex((c) => c.ids.includes(id));

test("beside: a column of its own right after the one named", () => {
  const l = moved(base(), { n: 1, id: "b", beside: "a" }, S)!;
  assert.equal(colOf(l, "b"), colOf(l, "a") + 1);
  const r = sound(l);
  assert.ok(r.b.x > r.a.x);
});

test("under: in the named piece's stack, right under it", () => {
  const l0 = moved(base(), { n: 1, id: "b", beside: "a" }, S)!;
  const l = moved(l0, { n: 2, id: "b", under: "a" }, S)!;
  const c = l.cols[colOf(l, "a")].ids;
  assert.equal(c.indexOf("b"), c.indexOf("a") + 1);
  sound(l);
});

test("foot: across the bottom; width: the column's share of the space", () => {
  const f = moved(base(), { n: 1, id: "b", foot: true }, S)!;
  assert.equal(f.foot, "b"); sound(f);
  const w = moved(base(), { n: 2, id: "a", width: "narrow" }, S)!;
  assert.equal(w.cols[colOf(w, "a")].w, Math.round(WIDTHS.narrow * (S.w - 2 * PAD)));
  sound(w);
});

test("nothing to do, or a piece not there: null, the arrangement untouched", () => {
  assert.equal(moved(base(), { n: 1, id: "a", large: true }, S), null);
  assert.equal(moved(base(), { n: 1, id: "a", beside: "zz" }, S), null);
  assert.equal(moved(base(), { n: 1, id: "a", beside: "a" }, S), null);
  assert.ok(shown(base()).includes(TALK) && shown(base()).includes(BOX));
});

test("the switch is its own and off by default", () => {
  assert.equal(STAGE_HANDS, "stage.hands");
});

// how the agent's moves went (felt.ts): one `made` each, then the one `after` the person's hand gives it, or kept
test("felt: a move made, then the hand's answer to it; another piece's act is not its answer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0; const got: Felt[] = [], w = feltWatch((f) => got.push(f), () => clock);
  w.made({ n: 1, id: "b", beside: "a" }, { made: true, waited: 2100.4, kind: "diff" });
  clock = 3000; w.hand({ ev: "moved", id: "a" });
  clock = 5000; w.undo("agent");
  w.made({ n: 2, id: "b", go: "x", say: "y" }, { made: true });
  t.mock.timers.tick(KEPT_MS);
  w.made({ n: 3, id: "c", width: "wide" }, { made: false, why: "held" });
  assert.deepEqual(got, [
    { ev: "made", n: 1, verb: "beside", made: true, waited_ms: 2100, kind: "diff" },
    { ev: "hand", what: "moved", agent: false, secs: 3 },
    { ev: "undo", by: "agent", secs: 5 },
    { ev: "after", n: 1, how: "undone", verb: "beside", secs: 5 },
    { ev: "made", n: 2, verb: "go", made: true, go: true, say: true },
    { ev: "after", n: 2, how: "kept", verb: "go", secs: 0 },
    { ev: "made", n: 3, verb: "width", made: false, why: "held", width: "wide" },
  ]);
  assert.equal(verbOf({ n: 1, id: "talk", chat: "line" }), "chat-line");
  w.dispose();
});

test("a page scrolled inside its frame holds the agent's move; its load, a resize and the lens's own scroll do not (#1547)", () => {
  assert.equal(scrolled(undefined, 0), false, "the first size a frame tells (its load) is no scroll");
  assert.equal(scrolled(0, 0), false, "a resize leaves its top where it was");
  assert.equal(scrolled(0, 240, 0, 1000), true, "the person scrolled it");
  assert.equal(scrolled(0, 240, 3000, 1000), false, "the agent's lens is scrolling it");
  assert.equal(scrolled(240, 0, 3000, 3000), true, "after the lens, a scroll is the person's again");
});

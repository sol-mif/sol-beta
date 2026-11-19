// The one space's rule (pieces/arrange.ts): at every size and count the pieces stand inside the space, none on another,
// the box as tall as it asked, and a piece the hand moved lands where it was put.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX, LINE, TALK, add, condense, drop, dropAt, move, once, place, rule, shown, tailH, widen, type Layout, type Rect, type Size } from "./pieces/arrange.ts";
import { asksOf, saidOf } from "./pieces/lead.ts";

const KINDS = { a: "page", b: "list", c: "diff", d: "terminal" };
const over = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
function sound(l: Layout, space: Size, lead: string, names = false) {
  const { rects } = place(l, space, { boxH: 108, lead, names, kinds: KINDS }), ids = shown(l);
  assert.deepEqual(Object.keys(rects).sort(), [...ids].sort(), "every shown piece has a box");
  for (const id of ids) {
    const r = rects[id];
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= space.w + 0.5 && r.y + r.h <= space.h + 0.5, `${id} inside the space ${JSON.stringify(r)} in ${JSON.stringify(space)}`);
    assert.ok(r.w >= 200 && r.h >= (id === TALK && l.tail ? LINE : 60), `${id} is not a sliver ${JSON.stringify(r)}`);
    for (const o of ids) if (o !== id) assert.ok(!over(r, rects[o]), `${id} on ${o}`);
  }
  assert.equal(rects[BOX].h, 108, "the box is as tall as it asked");
  return rects;
}

test("the rule holds at every size, count and lead", () => {
  for (const w of [520, 620, 840, 1120, 1600]) for (const h of [560, 820, 1000]) for (const open of [[], ["a"], ["a", "b"], ["a", "b", "c"]])
    for (const lead of [TALK, ...open]) for (const names of [false, true]) for (const o of [{}, { talk: false }, { asks: true }, { large: open[0] }, { large: open[0], more: true }, { large: TALK }]) {
      const l = rule({ w, h }, open, lead, o); sound(l, { w, h }, lead, names);
      assert.ok(shown(l).includes(TALK), `the chat is on the space ${JSON.stringify({ w, open, lead, o })}`);
    }
});

test("alone, the talk and the box are one column in the middle, where the talk reads", () => {
  const r = sound(rule({ w: 1120, h: 820 }, [], TALK), { w: 1120, h: 820 }, TALK);
  assert.equal(r[TALK].w, 720); assert.equal(Math.round(r[TALK].x + r[TALK].w / 2), 560);
  assert.equal(r[TALK].y + r[TALK].h, r[BOX].y, "the box stands against the talk");
});

test("the talk is wide while it leads and at its floor while an artifact does", () => {
  const s = { w: 1120, h: 820 };
  const reading = sound(rule(s, ["a"], TALK), s, TALK), making = sound(rule(s, ["a"], "a"), s, "a");
  assert.ok(reading[TALK].w > making[TALK].w + 100); assert.ok(making.a.w > reading.a.w + 100);
});

test("three: the one that leads beside the other two; a fourth is not laid", () => {
  const s = { w: 1500, h: 900 }, l = rule(s, ["a", "b", "c", "d"], "c");
  assert.deepEqual(l.cols.map((c) => c.ids), [[TALK, BOX], ["c"], ["a", "b"]]);
  const r = sound(l, s, "c"); assert.ok(r.c.h > r.a.h * 1.8);
});

test("where two columns of artifacts would not read, the one that leads stands over one other", () => {
  const s = { w: 1120, h: 820 }, l = rule(s, ["a", "b", "c"], "b");
  assert.deepEqual(l.cols.map((c) => c.ids), [[TALK, BOX], ["b", "a"]]); const r = sound(l, s, "b"); assert.ok(r.b.h > r.a.h);
});

test("nothing said: the box alone, a little above the middle", () => {
  const s = { w: 1120, h: 820 }, l = rule(s, [], TALK, { empty: true }), r = sound(l, s, TALK);
  assert.deepEqual(shown(l), [BOX]); assert.ok(r[BOX].y > 200 && r[BOX].y < 400); assert.equal(r[BOX].w, 720);
});

test("a small space is one column, what leads on top", () => {
  const small = rule({ w: 600, h: 700 }, ["a", "b"], "b"); assert.deepEqual(small.cols.map((c) => c.ids), [["b"]]); assert.equal(small.foot, BOX); assert.equal(small.tail, "lines");
  assert.deepEqual(rule({ w: 600, h: 700 }, ["a", "b"], TALK).cols.map((c) => c.ids), [[TALK, BOX]]);
});

test("large: the piece, the box, and the chat as one line on the box", () => {
  const s = { w: 1120, h: 820 }, l = rule(s, ["a", "b"], "a", { large: "a" });
  assert.deepEqual(shown(l).sort(), ["a", BOX, TALK].sort()); const r = sound(l, s, "a"); assert.ok(r.a.w > 1000);
  assert.equal(r[TALK].h, LINE); assert.equal(r[TALK].y + r[TALK].h, r[BOX].y, "the line stands on the box"); assert.equal(r[TALK].w, r[BOX].w);
  assert.equal(rule(s, ["a"], "a", { large: "a", more: true }).tail, "lines", "the hand opens the line to a few");
  assert.equal(rule(s, ["a"], "a", { large: "a", asks: true }).tail, "asks", "a question to you shows whole");
  assert.ok(tailH(820, "asks") > tailH(820, "lines") && tailH(820, "lines") > LINE);
});

test("the chat gives way where an artifact that leads would be too narrow beside it, and takes its column back to be read", () => {
  const s = { w: 860, h: 900 };
  assert.equal(rule(s, ["a"], "a").tail, "lines"); assert.equal(rule(s, ["a"], TALK).tail, undefined);
  assert.equal(rule({ w: 1300, h: 900 }, ["a"], "a").tail, undefined);
});

test("the chat made small by the hand: one line on the box; alone it stays whole; carried out, it is a column again", () => {
  const s = { w: 1500, h: 900 }, l = rule(s, ["a", "b", "c"], "a", { talk: false });
  assert.equal(l.tail, "line"); assert.deepEqual(l.cols.map((c) => c.ids), [["a"], ["b", "c"]]); const r = sound(l, s, "a");
  assert.deepEqual(rule(s, [], TALK, { talk: false }).cols.map((c) => c.ids), [[TALK, BOX]]);
  assert.equal(dropAt(l, r, s, TALK, 700, r[TALK].y + 10), null, "nothing is aimed at while the hand is still at the foot");
  const out = move(l, TALK, dropAt(l, r, s, TALK, 4, 300)!); assert.equal(out.tail, undefined); assert.deepEqual(out.cols[0].ids, [TALK]); sound(out, s, "a");
  const boxUp = move(l, BOX, { before: 0 }); assert.equal(boxUp.tail, undefined); assert.deepEqual(boxUp.cols[0].ids, [TALK, BOX], "the box takes the chat with it"); sound(boxUp, s, "a");
  const held = condense(move(rule(s, ["a", "b"], "a"), "a", { before: 9 }), "line"); assert.equal(held.foot, BOX); assert.deepEqual(held.cols.map((c) => c.ids), [["b"], ["a"]]); sound(held, s, "a");
});

test("the chat as one line: what Sol does now, else its last words to you; a question unanswered asks", () => {
  const you = { kind: "you", text: "**Done.** The gate is green." }, tool = { kind: "tool", name: "Bash", input: { description: "Run the gate" } }, wrap = { kind: "wrap", recap: "Rebuilt.", ask: "Try it?" };
  assert.deepEqual(saidOf([you, tool], true), { state: "working", text: "Run the gate" });
  assert.deepEqual(saidOf([tool, you], false), { state: "said", text: "Done. The gate is green." });
  assert.deepEqual(saidOf([you, wrap], false), { state: "asks", text: "Try it?" }); assert.ok(asksOf([you, wrap], false));
  assert.ok(!asksOf([wrap, { kind: "me", text: "yes" }], false)); assert.equal(saidOf([], false), null);
});

test("the hand: the box to the foot, the talk to the right, a piece into a stack, a seam", () => {
  const s = { w: 1500, h: 900 }, base = rule(s, ["a", "b", "c"], "a");
  const foot = move(base, BOX, { foot: true }); assert.equal(foot.foot, BOX); const rf = sound(foot, s, "a"); assert.ok(rf[BOX].w > 1300);
  const right = move(base, TALK, { before: base.cols.length }); assert.deepEqual(right.cols[right.cols.length - 1].ids, [TALK, BOX], "the box goes with the talk"); sound(right, s, "a");
  const stacked = move(base, "a", { col: 2, at: 0 }); assert.deepEqual(stacked.cols.map((c) => c.ids), [[TALK, BOX], ["a", "b", "c"]]); sound(stacked, s, "a");
  const wide = widen(base, 0, 520); assert.equal(sound(wide, s, "a")[TALK].w, 520);
  assert.deepEqual(move(move(base, BOX, { foot: true }), TALK, { foot: true }).cols[0].ids.at(-1), BOX, "what stood at the foot goes back to a column");
});

test("the session adds to and takes from what the hand holds without undoing it", () => {
  const s = { w: 1400, h: 900 }, held = move(rule(s, ["a", "b"], "a"), TALK, { before: 9 });
  const more = add(held, "c"); assert.ok(shown(more).includes("c")); assert.deepEqual(more.cols.at(-1)!.ids, [TALK, BOX]); sound(more, s, "a");
  const less = drop(more, "a"); assert.ok(!shown(less).includes("a")); sound(less, s, "b");
  assert.equal(drop(less, BOX), less, "the box is never put away");
});

test("a drop is read against the boxes as they stood", () => {
  const s = { w: 1500, h: 900 }, l = rule(s, ["a", "b", "c"], "a"), { rects } = place(l, s, { boxH: 108, lead: "a" });
  assert.deepEqual(dropAt(l, rects, s, BOX, 700, 880), { foot: true });
  assert.deepEqual(dropAt(l, rects, s, TALK, 1490, 400), { before: 3 });
  assert.deepEqual(dropAt(l, rects, s, "a", rects.b.x + rects.b.w / 2, rects.b.y + rects.b.h - 10), { col: 2, at: 1 });
  assert.equal(dropAt(l, rects, s, "a", rects.a.x + 100, rects.a.y + 100), null);
});

test("a piece named twice stands once, and the column it emptied goes", () => {
  const l = once({ cols: [{ ids: [TALK] }, { ids: [TALK, BOX] }, { ids: ["a", "b"] }] });
  assert.deepEqual(l.cols.map((c) => c.ids), [[TALK, BOX], ["a", "b"]]);
});

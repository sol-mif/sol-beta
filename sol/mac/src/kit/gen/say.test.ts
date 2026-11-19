// node --test src/kit/gen/say.test.ts: the generator takes a sentence (#1245, second run). Each example the ask named,
// with the spec it must give; then that a sentence it cannot place is a note card with a note, never a throw, and that
// whatever it says lints clean (it speaks the one system, so the lint has nothing to rewrite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lint } from "./lint.ts";
import { say, sayOut } from "./say.ts";
import { PIECES, type Spec } from "./spec.ts";

const ask = (words: string): Spec => ({ piece: "Stack", props: { direction: "row", gap: 12, align: "center" }, children: [
  { piece: "Coin", props: { role: "ask", d: 22 } }, { piece: "Text", props: { words } }] });

const SAID: [string, Spec][] = [
  ["a run laying out the spreads, three steps, the second one now, 6 of 10", {
    piece: "Block", props: { title: "laying out the spreads" }, state: "working", children: [
      { piece: "Meter", props: { label: "6 of 10", value: 0.6 } },
      { piece: "Row", props: { title: "step one" } },
      { piece: "Row", props: { title: "step two", aside: "now", picked: true } },
      { piece: "Row", props: { title: "step three" } },
    ] }],
  ["two files from the dawn walk, png, with a done stamp at 9:04", {
    piece: "Block", props: { title: "the dawn walk" }, children: [
      { piece: "Stack", props: { direction: "row", gap: 12 }, children: [
        { piece: "FileTile", props: { kind: "png", name: "dawn walk 1.png" } },
        { piece: "FileTile", props: { kind: "png", name: "dawn walk 2.png" } },
      ] },
      { piece: "Sticker", props: { words: "done 9:04", role: "done", at: "corner" } },
    ] }],
  ["a question: pay on delivery friday, yours now", {
    piece: "Block", props: { title: "a question" }, state: "waiting", children: [ask("pay on delivery friday: yours now")] }],
  ["the count of things landed since 8, big", {
    piece: "Block", props: { title: "things landed since 8" }, children: [{ piece: "Ping", props: {}, state: "fanned" }] }],
  ["a handover from the café: two sessions, one active, a decision to open at 7", {
    piece: "Block", props: { title: "a handover from the café" }, children: [
      { piece: "Text", props: { words: "handed over from the café", role: "caption" } },
      { piece: "SessionRow", props: { title: "session one" }, state: "active" },
      { piece: "SessionRow", props: { title: "session two" }, state: "rest" },
      ask("open at 7"),
    ] }],
  // the steps and sessions named, so a built-looking block never says "step one" (pack-review-3)
  ["a run drawing two covers, two steps called the front and the back, 2 of 2, with a done stamp at 9:04", {
    piece: "Block", props: { title: "drawing two covers" }, children: [
      { piece: "Meter", props: { label: "2 of 2", value: 1 } },
      { piece: "Row", props: { title: "the front", aside: "done" } },
      { piece: "Row", props: { title: "the back", aside: "done" } },
      { piece: "Sticker", props: { words: "done 9:04", role: "done", at: "corner" } },
    ] }],
  ["a handover of the order: two sessions called the dairy's price and delivery days, one active", {
    piece: "Block", props: { title: "the order" }, children: [
      { piece: "SessionRow", props: { title: "the dairy's price" }, state: "active" },
      { piece: "SessionRow", props: { title: "delivery days" }, state: "rest" },
    ] }],
  ["the rota thread, four lines, decided at 8:41", {
    piece: "Block", props: { title: "the rota thread" }, children: [
      { piece: "List", props: { count: "4" }, children: ["one", "two", "three", "four"].map((n) => ({ piece: "Row" as const, props: { title: `line ${n}` } })) },
      { piece: "Sticker", props: { words: "decided 8:41", role: "done", at: "corner" } },
    ] }],
];

for (const [sentence, spec] of SAID) test(`"${sentence}"`, () => {
  const r = sayOut(sentence);
  assert.deepEqual(r.spec, spec);
  assert.deepEqual(r.notes, [], "a sentence it places needs no rewrite");
});

test("a handover of something: what is handed over is the title, who from its caption", () => {
  const s = say("a handover of the oat milk order from Sam's agent, two sessions, one active");
  assert.equal(s.props.title, "the oat milk order");
  assert.deepEqual(s.children?.[0], { piece: "Text", props: { words: "handed over by Sam's agent", role: "caption" } });
});

test("a sentence it cannot place: a note card with the sentence in it, and a note", () => {
  const r = sayOut("make it pop, and fast");
  assert.equal(r.spec.piece, "Block");
  assert.ok(JSON.stringify(r.spec).includes("make it pop"));
  assert.equal(r.notes.length, 1);
});

test("never a throw: nothing, a number, an object, a long run of words", () => {
  for (const x of [undefined, null, "", 4, {}, "a run, ".repeat(200), "a run, 99 steps, the ninth one now", "files, .zip"]) {
    const s = say(x);
    assert.equal(s.piece, "Block");
  }
});

test("only kit pieces, and what it says lints clean", () => {
  const walk = (s: Spec): void => { assert.ok(s.piece in PIECES, s.piece); s.children?.forEach(walk); };
  for (const x of [...SAID.map(([s]) => s), "a card about the rota with a note", "three sessions, the second active", "a stamp at 7", "the count, 12, of replies"]) {
    const s = say(x);
    walk(s);
    assert.deepEqual(lint(s).notes, [], x);
  }
});

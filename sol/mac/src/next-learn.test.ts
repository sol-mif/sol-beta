// Tutorials and Help (BR1 #1615, learn.html draft 1): the six walks as drawn, the player's moves (Next, Skip, Esc, Show
// me, the end card's way back), Help's answers and Show me's { walk, step }. Signed: marcocyl04-ux's agent (builder T-face).
import { test } from "node:test";
import assert from "node:assert/strict";
import { WALKS, walkOf, wordsOf } from "./next/learn/walks.ts";
import { L, endCard, learnReset, notNow, cardDone, showMe, walkNext, walkPause, walkSkip, walkStart, walksListed } from "./next/learn/learn-state.ts";
import { answerOf, isHowTo, ASKED } from "./next/learn/answers.ts";

// a store for the walks' memory, as a window has
const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

test("the six walks, their ids and step counts as drawn", () => {
  assert.deepEqual(WALKS.map((w) => w.id), ["around", "folders", "ai", "bar", "needs", "yours"]);
  assert.deepEqual(WALKS.map((w) => w.n), ["Getting around", "Your folders", "Working with an AI", "The bar", "What needs you", "Make it yours"]);
  assert.deepEqual(WALKS.map((w) => w.steps.length), [4, 5, 5, 5, 3, 4]);
  for (const w of WALKS) for (const s of w.steps) { assert.ok(s.head && s.line, `${w.id} has words`); assert.ok(s.at.length, `${w.id} points somewhere`); }
});

test("a step's words take the person's own folders, and plain words with none", () => {
  const bar = walkOf("bar")!.steps[1].line;
  assert.match(wordsOf(bar, ["Alpha", "Beta", "Gamma"]), /put Gamma next to Alpha/);
  assert.doesNotMatch(wordsOf(bar, []), /\{|undefined/);
  assert.doesNotMatch(wordsOf(walkOf("around")!.steps[0].line, []), /\{|undefined/);
  assert.match(wordsOf(walkOf("folders")!.steps[0].line, ["Alpha"]), /Open Alpha/);
});

test("the end card: once, then the walks from it, back to it ticked, then the start-screen question", () => {
  learnReset();
  assert.equal(endCard(), true);
  assert.equal(L.card, "end");
  assert.equal(endCard(), false, "offered once");
  walkStart("around", 0, "card");
  assert.equal(L.card, null);
  for (let i = 0; i < 4; i++) walkNext();
  assert.equal(L.walk, null);
  assert.equal(L.card, "end", "back on the card");
  assert.equal(walksListed().find((w) => w.id === "around")!.done, true);
  notNow();
  assert.equal(L.card, "lead");
  cardDone();
  assert.equal(L.card, null);
});

test("Skip ends a walk; Esc pauses it and Help picks it up where it stopped", () => {
  learnReset();
  walkStart("folders"); walkNext(); walkNext();
  walkPause();
  assert.equal(L.walk, null);
  assert.equal(L.paused.folders, 2);
  walkStart("folders");
  assert.equal(L.walk!.step, 2, "picked up there");
  walkSkip();
  assert.equal(L.walk, null);
  assert.equal(L.paused.folders, undefined);
  assert.equal(L.done.includes("folders"), false);
});

test("Show me plays { walk, step } and refuses a step there is not", () => {
  learnReset();
  assert.equal(showMe({ walk: "bar", step: 1 }), true);
  assert.deepEqual(L.walk, { id: "bar", step: 1, from: "show" });
  assert.equal(showMe({ walk: "bar", step: 9 }), false);
  assert.equal(showMe({ walk: "nope", step: 0 }), false);
});

test("Help: how-do-I questions are told from moves, and each answer's Show me names a real step", () => {
  assert.equal(isHowTo("how do I put a folder inside another one"), true);
  assert.equal(isHowTo("What's a seat?"), true);
  assert.equal(isHowTo("put web next to api"), false);
  const a = answerOf("how do I put a folder inside another one");
  assert.match(a.text, /Drag it onto the other folder/);
  assert.deepEqual(a.show, { walk: "folders", step: 2 });
  for (const q of ASKED) assert.ok(answerOf(q).text.length > 10);
  for (const q of ["how do I zoom out", "how do I start a session", "how do I change how Sol looks", "how do I tidy"]) {
    const s = answerOf(q).show!;
    assert.ok(walkOf(s.walk) && s.step < walkOf(s.walk)!.steps.length, q);
  }
  assert.match(answerOf("how do I fly a kite").text, /don’t know/);
});

test("the engine's answers (sol/engine/src/next/help/wire.ts) are read safely: Show me only for a step there is", async () => {
  const { fromEngine } = await import("./next/learn/link.ts");
  assert.deepEqual(fromEngine({ type: "next.help.said", working: false, text: " Drag it in. ", show: { walk: "folders", step: 2 }, replay: "folders" }), { text: "Drag it in.", show: { walk: "folders", step: 2 }, replay: "folders" });
  assert.deepEqual(fromEngine({ text: "Hm.", show: { walk: "folders", step: 7 } }), { text: "Hm." });
  assert.deepEqual(fromEngine({ text: "Hm.", show: { walk: "kites", step: 0 } }), { text: "Hm." });
  assert.equal(fromEngine({ working: true }), null);
});

test("Help's lines from the engine: an answer fills the question waiting, the bar's help line is the bar's", async () => {
  const { H, barGone } = await import("./next/learn/help-state.ts");
  const { helpHeard } = await import("./next/learn/link.ts");
  H.said = [{ q: "how do I zoom out", a: null }];
  helpHeard.said!({ type: "next.help.said", working: true, session: "s" });
  assert.equal(H.said[0].a, null);
  helpHeard.said!({ type: "next.help.said", working: false, session: "s", text: "⌘↑.", show: { walk: "around", step: 1 } });
  assert.deepEqual(H.said[0].a, { text: "⌘↑.", show: { walk: "around", step: 1 }, replay: "around" });
  barGone();
  helpHeard.bar!({ type: "next.canvas.said", help: true, working: false, text: "Arrange tidies it.", show: { walk: "folders", step: 4 }, openHelp: true, ask: "how do I tidy" });
  assert.equal(H.line?.q, "how do I tidy");
  assert.deepEqual(H.line?.a?.show, { walk: "folders", step: 4 });
  helpHeard.bar!({ type: "next.canvas.said", working: false, text: "moved it" });
  assert.ok(H.line?.a, "an answered line stays when the canvas agent speaks");
  barGone();
});

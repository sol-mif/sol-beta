// What was just done on the one space, and its way back (#1454, pieces/step.ts): every step said in ordinary words, the
// agent's marked as its own, one turn's moves as one line, and the line's way back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX, TALK } from "./pieces/arrange.ts";
import { TURN_MS, mayReplace, moveWords, sameTurn, stepLine, titleOf } from "./pieces/step.ts";

const T: Record<string, string> = { p: "Plan", d: "Diff · form.tsx", n: "Notes", blank: "  " };
const title = (id: string) => T[id];

test("a piece is named by its title; the chat and the box by theirs; one with no title is an artifact", () => {
  assert.equal(titleOf(TALK, title), "the chat");
  assert.equal(titleOf(BOX, title), "the box");
  assert.equal(titleOf("p", title), "Plan");
  assert.equal(titleOf("blank", title), "an artifact");
  assert.equal(titleOf("gone", title), "an artifact");
});

test("each of the agent's moves in words; a move that only points says nothing", () => {
  assert.equal(moveWords({ n: 1, id: "p", beside: TALK }, title), "put Plan beside the chat");
  assert.equal(moveWords({ n: 1, id: "d", under: "p" }, title), "put Diff · form.tsx under Plan");
  assert.equal(moveWords({ n: 1, id: "p", foot: true }, title), "put Plan across the foot");
  assert.equal(moveWords({ n: 1, id: "p", beside: "d", width: "wide" }, title), "put Plan beside Diff · form.tsx, wide");
  assert.equal(moveWords({ n: 1, id: "p", width: "half" }, title), "made Plan half the width");
  assert.equal(moveWords({ n: 1, id: "p", large: true }, title), "took Plan large");
  assert.equal(moveWords({ n: 1, id: "p", large: false }, title), "put Plan back among the others");
  assert.equal(moveWords({ n: 1, id: TALK, chat: "line" }, title), "made the chat one line");
  assert.equal(moveWords({ n: 1, id: TALK, chat: "lines" }, title), "made the chat its last few lines");
  assert.equal(moveWords({ n: 1, id: TALK, chat: "col" }, title), "gave the chat its column");
  assert.equal(moveWords({ n: 1, id: "p", go: "step 2", say: "here" }, title), null);
});

test("one move is said whole; a turn of several is counted, each kept for the list; a turn that only pointed is not said", () => {
  const one = stepLine({ who: "agent", how: "moved", moves: [{ n: 1, id: "p", beside: TALK }] }, title)!;
  assert.deepEqual([one.words, one.back, one.agent], ["The agent put Plan beside the chat", "undo", true]);
  const turn = stepLine({ who: "agent", how: "moved", moves: [{ n: 1, id: "p", beside: TALK }, { n: 2, id: "p", go: "x" }, { n: 3, id: "d", under: "p" }, { n: 4, id: "n", large: true }] }, title)!;
  assert.equal(turn.words, "The agent made 3 changes");
  assert.deepEqual(turn.each, ["put Plan beside the chat", "put Diff · form.tsx under Plan", "took Notes large"]);
  assert.equal(stepLine({ who: "agent", how: "moved", moves: [{ n: 1, id: "p", go: "x" }] }, title), null);
});

test("the hand's own steps carry no agent mark; what the agent opened or changed has its own way back", () => {
  assert.deepEqual(stepLine({ who: "you", how: "moved", id: "d" }, title), { words: "Moved Diff · form.tsx", back: "undo", agent: false });
  assert.deepEqual(stepLine({ who: "you", how: "widths" }, title), { words: "Set the widths", back: "undo", agent: false });
  assert.deepEqual(stepLine({ who: "agent", how: "opened", ids: ["p", "d"] }, title), { words: "The agent opened Plan and Diff · form.tsx", back: "put away", agent: true });
  const ch = stepLine({ who: "agent", how: "changed", id: "p", what: "  step 2\n done " }, title)!;
  assert.deepEqual([ch.words, ch.back, ch.agent], ["The agent changed Plan: step 2 done", "see", true]);
  const long = stepLine({ who: "agent", how: "changed", id: "p", what: "x".repeat(90) }, title)!;
  assert.ok(long.words.endsWith("…") && long.words.length < 90, "a long change is cut");
});

test("taken back and done again: what came back, then redo; done again, then undo; nothing left says so", () => {
  const agent1 = { who: "agent" as const, how: "moved" as const, moves: [{ n: 1, id: "p", beside: TALK }] };
  const agent2 = { who: "agent" as const, how: "moved" as const, moves: [{ n: 1, id: "p", beside: TALK }, { n: 2, id: "d", under: "p" }] };
  assert.deepEqual(stepLine({ who: "back", how: "undid", step: agent1 }, title), { words: "Took back the agent's move", back: "redo", agent: false });
  assert.equal(stepLine({ who: "back", how: "undid", step: agent2 }, title)!.words, "Took back the agent's 2 changes");
  assert.equal(stepLine({ who: "back", how: "undid", step: { who: "you", how: "moved", id: "d" } }, title)!.words, "Put Diff · form.tsx back where it was");
  assert.equal(stepLine({ who: "back", how: "undid", step: { who: "you", how: "widths" } }, title)!.words, "Put the widths back");
  const again = stepLine({ who: "back", how: "redid", step: agent1 }, title)!;
  assert.deepEqual([again.words, again.back, again.agent], ["The agent put Plan beside the chat again", "undo", true]);
  assert.deepEqual(stepLine({ who: "back", how: "nothing" }, title), { words: "Nothing to take back", back: "", agent: false });
});

test("a turn: the agent's moves close together while its undo is kept; the hand's step or a late move starts another", () => {
  assert.equal(sameTurn(null, 1000, "agent", true), false, "the first move starts a turn");
  assert.equal(sameTurn(1000, 1000 + TURN_MS - 1, "agent", true), true);
  assert.equal(sameTurn(1000, 1000 + TURN_MS, "agent", true), false, "too late");
  assert.equal(sameTurn(1000, 1500, "hand", true), false, "the hand moved in between");
  assert.equal(sameTurn(1000, 1500, "agent", false), false, "already taken back");
});

test("a change the agent made never covers a way back still on the line", () => {
  const undo = stepLine({ who: "you", how: "moved", id: "d" }, title), redo = stepLine({ who: "back", how: "undid", step: { who: "you", how: "widths" } }, title);
  const changed = { who: "agent" as const, how: "changed" as const, id: "p", what: "step 2 done" };
  assert.equal(mayReplace(undo, changed), false);
  assert.equal(mayReplace(redo, changed), false);
  assert.equal(mayReplace(null, changed), true);
  assert.equal(mayReplace(stepLine({ who: "agent", how: "opened", ids: ["p"] }, title), changed), true);
  assert.equal(mayReplace(undo, { who: "agent", how: "moved", moves: [{ n: 1, id: "p", foot: true }] }), true, "a move replaces it: it has its own undo");
});

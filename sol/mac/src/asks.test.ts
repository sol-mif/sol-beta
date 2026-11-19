// node --test src/*.test.ts (npm test here): the face's words for asking for a session (#335, cowork/asks.ts). The card
// a teammate's ask makes says who asks and where what I give goes; a person's page offers the ask only when it can be had.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askLine, givenLine, canAsk, WHERE_IT_GOES } from "./cowork/asks.ts";

const ask = (agent: boolean) => ({ key: "frank/s-1", from: { login: "frank", agent }, session: "s-1", title: "the goal page", at: 1 });

test("the card says who asks, them or their agent, and where what I give goes", () => {
  assert.equal(askLine(ask(true)), "frank's agent asks for your session the goal page");
  assert.equal(askLine(ask(false)), "frank asks for your session the goal page");
  assert.equal(askLine({ ...ask(true), title: "" }), "frank's agent asks for your session a group session");
  assert.match(WHERE_IT_GOES, /lands in their session on their Mac and goes to their AI/);
});

test("what came of my ask: not now, given whole, a give that stopped; nothing while pages still come", () => {
  assert.deepEqual(givenLine({ key: "k", login: "frank", id: "s-1", title: "the goal page", of: 0 }), { line: "frank said not now", sub: "to your ask for the goal page" });
  assert.deepEqual(givenLine({ key: "k", login: "frank", id: "s-1", title: "the goal page", of: 3, lines: 412, done: true }), { line: "frank gave the goal page", sub: "412 lines · ask your agent in a group session to read it" });
  assert.equal(givenLine({ key: "k", login: "frank", id: "s-1", of: 3, lines: 200 }), null);
  assert.equal(givenLine({ key: "k", login: "frank", id: "s-1", title: "notes", of: 3, lines: 200, done: true, partial: true })!.line, "frank gave part of notes");
  assert.equal(givenLine({ key: "k", login: "frank", id: "s-1", error: "the group went out of sight while it was being given; they got part of it" })!.line.split(" ")[0], "the");
});

test("ask for it: someone else's group session, giving not turned off, showing not off, the group in sight", () => {
  const base = { mine: false, up: true, room: true };
  assert.equal(canAsk(base), true);
  assert.equal(canAsk({ ...base, mine: true }), false);
  assert.equal(canAsk({ ...base, never: true }), false);
  assert.equal(canAsk({ ...base, quiet: true }), false);
  assert.equal(canAsk({ ...base, up: false }), false);
  assert.equal(canAsk({ ...base, room: false }), false, "an issue show is not a group session");
});

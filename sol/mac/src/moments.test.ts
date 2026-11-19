// node --test src/*.test.ts (npm test here): the one notification, the window's side (#845, notify/moments.ts and
// notify/visible.ts): a moment lands once, its kind is the engine's, seen goes up only for what this
// window holds, opening a session sees its own, and the gate is visible, not focused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { _reset, current, feed, forSession, kindOf, coloursOf, relinked, seen, seenSession, wireMoments } from "./notify/moments.ts";
import { visibleOf } from "./notify/visible.ts";
import { FUNCTIONAL } from "./creature/palette.ts";

const sent: object[] = [];
const fresh = () => { _reset(); sent.length = 0; wireMoments((o) => sent.push(o)); };

test("a moment lands once, and a second copy of it is not a second moment", () => {
  fresh();
  assert.equal(feed({ type: "moment", id: "a", kind: "done", sessionId: "s1", seat: "claude", line: "the PR is up", at: 1 }), true);
  feed({ type: "moment", id: "a", kind: "done", sessionId: "s1", seat: "claude", line: "the PR is up", at: 1 });
  assert.equal(current().moments.length, 1);
  assert.equal(current().arrived, 1);
  assert.equal(current().last?.line, "the PR is up");
});

test("the one wire: only a moment is one; the old notify and a wrapped moment are not", () => {
  fresh();
  feed({ type: "moment", moment: { id: "b", kind: "question", sessionId: "s2", seat: "claude", line: "which branch?", at: 2 } });
  assert.equal(feed({ type: "notify", id: "c", seat: "codex", line: "done", at: 3, dest: "window" }), false);
  assert.equal(current().moments.length, 0);
});

test("kinds: the engine's names, as they are; an unknown one is a ping", () => {
  for (const k of ["done", "question", "permission", "failed", "green", "hand", "stable", "ping"]) assert.equal(kindOf(k), k);
  assert.equal(kindOf("turn"), "ping");
  assert.equal(kindOf(undefined), "ping");
});

test("colours: green your move, yellow a question, red failed, the jelly's bands for a ping", () => {
  assert.deepEqual(coloursOf("done"), [FUNCTIONAL.green.strong]);
  assert.deepEqual(coloursOf("question"), [FUNCTIONAL.yellow.strong]);
  assert.deepEqual(coloursOf("permission"), [FUNCTIONAL.yellow.strong]);
  assert.deepEqual(coloursOf("failed"), [FUNCTIONAL.red.strong]);
  assert.ok(coloursOf("ping").length > 1);
});

test("seen goes up once, only for what this window holds", () => {
  fresh();
  feed({ type: "moment", id: "d", kind: "done", sessionId: "s1", seat: "claude", line: "x", at: 1 });
  seen("d"); seen("d"); seen("nope");
  assert.deepEqual(sent, [{ type: "seen", id: "d" }]);
  assert.equal(current().moments.length, 0);
});

test("opening a session sees its own moments and no other's", () => {
  fresh();
  feed({ type: "moment", id: "e", kind: "done", sessionId: "s1", seat: "claude", line: "x", at: 1 });
  feed({ type: "moment", id: "f", kind: "permission", sessionId: "s1", seat: "claude", line: "y", at: 2 });
  feed({ type: "moment", id: "g", kind: "failed", sessionId: "s2", seat: "claude", line: "z", at: 3 });
  seenSession("s1");
  assert.deepEqual(sent.map((o: any) => o.id), ["e", "f"]);
  assert.deepEqual(forSession("s2").map((m) => m.id), ["g"]);
});

test("gone from the engine (seen on the notch, expired) leaves without a seen of its own", () => {
  fresh();
  feed({ type: "moment", id: "h", kind: "done", seat: "claude", line: "x", at: 1 });
  feed({ type: "moment.gone", id: "h" });
  assert.equal(current().moments.length, 0);
  assert.equal(sent.length, 0);
});

test("a new link starts empty: the engine sends what is still unseen again", () => {
  fresh();
  feed({ type: "moment", id: "i", kind: "done", seat: "claude", line: "x", at: 1 });
  relinked();
  assert.equal(current().moments.length, 0);
});

test("the gate is visible, not focused: on screen unless hidden, minimized or covered", () => {
  assert.equal(visibleOf({ page: true, minimized: false, occluded: null }), true);   // no word from the Mac: the page's own
  assert.equal(visibleOf({ page: true, minimized: false, occluded: false }), true);
  assert.equal(visibleOf({ page: true, minimized: false, occluded: true }), false);  // under another app, another space
  assert.equal(visibleOf({ page: true, minimized: true, occluded: null }), false);
  assert.equal(visibleOf({ page: false, minimized: false, occluded: null }), false);
});

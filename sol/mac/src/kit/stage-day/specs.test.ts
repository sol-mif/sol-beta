// The day's generated blocks pass the lint untouched (#1245, item 2): a note means the spec asked for something the
// system does not have, and the spec is fixed, never the lint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lint } from "../gen/lint.ts";
import { say, sayOut } from "../gen/say.ts";
import { HANDOVER, HANDOVER_SAID, RUN_CARD, RUN_SAID, composing, piecesOf, upTo } from "./specs.ts";

for (const [name, s] of [["run card", RUN_CARD], ["handover", HANDOVER]] as const) {
  test(`${name}: the lint has no notes`, () => assert.deepEqual(lint(s).notes, []));
  test(`${name}: every partial spec while it composes has no notes`, () => {
    for (let n = 0; n <= piecesOf(s); n++) assert.deepEqual(lint(upTo(s, n)).notes, [], `after ${n} pieces`);
  });
}

test("the day's blocks are said: each is its sentence through say, every word placed", () => {
  assert.deepEqual(RUN_CARD, say(RUN_SAID));
  assert.deepEqual(HANDOVER, say(HANDOVER_SAID));
  for (const x of [RUN_SAID, HANDOVER_SAID]) assert.deepEqual(sayOut(x).notes, [], x);
  assert.ok(composing(RUN_SAID).startsWith("composing: a run drawing"));
  assert.ok(composing(RUN_SAID).length <= 38);
});

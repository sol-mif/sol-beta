// node --test src/*.test.ts: the round 6 base (#1615, the join; merge/NOTES.md "Round 6", F1): an extra asker registered
// through people/extra.ts joins the one queue ahead of the people's, above() counts it with the canvas's asks, the badge is
// above() plus From people, ⌘J's walk reaches it first once the canvas is empty, and one answer lowers both counts by one
// and writes one diary line. Its undo takes the provider out again. Signed: marcocyl04-ux's agent, the port's join (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { EXTRA, extOpen, firstWords, register, type ExtOpen } from "./next/people/extra.ts";
import { answer, diaryLines, items, needsCount } from "./next/people/queue.ts";

test("an extra asker: above() and the badge count it once, an answer lowers both by one and writes one line", () => {
  CV.load("dev-morning");
  const a0 = CV.above(), n0 = needsCount();
  assert.equal(a0, CV.open().length, "no provider: above() is the canvas's asks");
  const seen: string[] = [];
  const off = register({
    items: () => [{ id: "seat:test:gh", type: "seat", ai: "Ada", words: "Sign in to GitHub once." }],
    line: (t, said) => ({ what: `You said “${said}”: ${String(t.words).replace(/\.$/, "")}.`, why: `${t.ai} asked` }),
    done: (t) => { seen.push(t.id); },
    first: (t: ExtOpen) => `holds ${t.ai} up, in Seats`,
  });
  try {
    assert.equal(EXTRA.length, 1);
    assert.equal(CV.above(), a0 + 1, "above() = the canvas's asks + the extra askers'");
    assert.equal(needsCount(), n0 + 1, "the badge is above() plus From people");
    assert.equal(items()[0].id, "seat:test:gh", "the extra askers stand first in the people's queue");
    assert.equal(extOpen()[0].of, "seat", "the provider's own type is kept as `of`");
    assert.equal(firstWords(), "holds Ada up, in Seats");
    const l0 = diaryLines();
    assert.ok(answer("seat:test:gh", "Sign in"));
    assert.equal(CV.above(), a0, "answered: above() falls by one");
    assert.equal(needsCount(), n0, "and the badge by one");
    assert.equal(diaryLines() - l0, 1, "one diary line");
    assert.deepEqual(seen, ["seat:test:gh"], "the provider hears its answer");
    assert.equal(answer("seat:test:gh"), false, "once");
  } finally { off(); }
  assert.equal(EXTRA.length, 0, "its undo takes it out");
});

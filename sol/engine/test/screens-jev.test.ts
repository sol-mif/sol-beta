import { test } from "node:test";
import assert from "node:assert/strict";
import { pickOf, readWhere, readFollow, whereBody, followBody } from "../src/screensJev.ts";
import { askJev } from "../src/screensAsk.ts";

// Jev's fast picks for Jelly across screens (#1090, design JEV): 0.7 and over acts, 0.45 a ghost, under that nothing
const here = { name: "the laptop", w: 1512, h: 982, side: true, talk: true, blocks: ["the plan"], keys: true };
const other = { name: "the monitor", w: 2560, h: 1440, side: false, talk: false, blocks: [], keys: false };

test("where a new block opens: readWhere's three bands, and nothing when there is no answer", () => {
  assert.equal(readWhere({ where: { choice: "other", probabilities: { other: 0.83, here: 0.17 } } }), "act");
  assert.equal(readWhere({ where: { choice: "other", probabilities: { other: 0.55, here: 0.45 } } }), "ghost");
  assert.equal(readWhere({ where: { choice: "here", probabilities: { other: 0.2, here: 0.8 } } }), "none");
  assert.equal(readWhere(null), "none");
  assert.equal(pickOf(Number.NaN), "none");
  const b = whereBody({ title: "the diff", kind: "diff", lines: 240 }, "show me the diff", here, other);
  assert.equal(b.questions.where.type, "choice");
  assert.match(b.state.other, /the monitor 2560x1440/);
});

test("follow-me reads the noul: a ghost first, never a move by itself", () => {
  assert.equal(readFollow({ moved: { noul: 0.9 } }), "act");
  assert.equal(readFollow({ moved: { noul: 0.5 } }), "ghost");
  assert.equal(readFollow({ moved: { noul: 0.1 } }), "none");
  assert.match(followBody(12, 4, other, here).state.pointer, /12 s, 4 presses/);
});

test("asking: the answers come back; no key, an error, or a slow answer is null", async () => {
  const ok = (answers: unknown) => (async () => new Response(JSON.stringify({ answers }), { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await askJev({}, { key: "k", fetch: ok({ where: { choice: "other" } }) }), { where: { choice: "other" } });
  assert.equal(await askJev({}, { key: null, fetch: ok({}) }), null);
  assert.equal(await askJev({}, { key: "k", fetch: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch }), null);
  const slow = ((_u: unknown, i: { signal: AbortSignal }) => new Promise((_r, no) => i.signal.addEventListener("abort", () => no(new Error("abort"))))) as unknown as typeof fetch;
  assert.equal(await askJev({}, { key: "k", fetch: slow, budget: 30 }), null);
});

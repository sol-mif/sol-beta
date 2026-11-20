// Agents' meta (#1476): no Jev key, the person's own cheapest model asks Jev's question, a few a day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cheapest, ownPrompt, ownSaid, usedOn, makeOwn, defaultOwn, type Turn } from "../src/agent/meta/own.ts";
import { makeAsk } from "../src/agent/meta/jev.ts";

const WORDS = { instructions: "Same job?", yes: "the same", no: "different" };

test("cheapest: the newest of the least able family the person's Claude lists", () => {
  assert.equal(cheapest(["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]), "claude-haiku-5-5");
  assert.equal(cheapest(["claude-opus-5-5", "claude-sonnet-5-5"]), "claude-sonnet-5-5", "no haiku offered: the next cheapest");
  assert.equal(cheapest(["claude-fable-5-2", "claude-fable-5-1"]), "claude-fable-5-2");
  assert.equal(cheapest([]), "haiku", "nothing known: the CLI's alias");
});

test("ownPrompt says the question and both texts; ownSaid reads one number 0..1", () => {
  const p = ownPrompt(WORDS, "first text", "second text");
  for (const w of ["Same job?", "the same", "different", "first text", "second text", "one number"]) assert.ok(p.includes(w), w);
  assert.ok(ownPrompt(WORDS, "x".repeat(5000), "y").length < 2000, "each text cut as Jev's");
  assert.equal(ownSaid("0.82"), 0.82);
  assert.equal(ownSaid("I'd say 0.3."), 0.3);
  assert.equal(ownSaid("1"), 1);
  assert.equal(ownSaid(".5"), 0.5);
  assert.equal(ownSaid("7"), null, "out of range");
  assert.equal(ownSaid("yes"), null);
  assert.equal(ownSaid(null), null);
});

test("makeOwn asks the cheapest model and counts each ask in the home, at most perDay a day", async () => {
  const home = mkdtempSync(join(tmpdir(), "own-"));
  const asked: string[] = [];
  const turn: Turn = async (model) => { asked.push(model); return "0.9"; };
  let now = new Date(2026, 10, 19, 10).getTime();
  const own = makeOwn({ home, turn, perDay: 2, models: () => ["claude-opus-5-5", "claude-haiku-5-5"], now: () => now });
  assert.equal(await own(WORDS, "a", "b"), 0.9);
  assert.equal(await own(WORDS, "a", "b"), 0.9);
  assert.equal(await own(WORDS, "a", "b"), null, "past the day's count: code decides");
  assert.deepEqual(asked, ["claude-haiku-5-5", "claude-haiku-5-5"]);
  assert.equal(usedOn(readFileSync(join(home, "agents-own-ai.json"), "utf8"), "2026-11-19"), 2);
  // the count is the home's, so a new engine (another makeOwn) does not start it again
  assert.equal(await makeOwn({ home, turn, perDay: 2, now: () => now })(WORDS, "a", "b"), null);
  now = new Date(2026, 10, 20, 9).getTime();
  assert.equal(await own(WORDS, "a", "b"), 0.9, "a new day, a new count");
  assert.equal(await own(WORDS, " ", "b"), null, "an empty text is never asked");
});

test("a failed or slow turn is null and still counted", async () => {
  const own = makeOwn({ turn: async () => null, perDay: 1 });
  assert.equal(await own(WORDS, "a", "b"), null);
  let called = false;
  const after = makeOwn({ turn: async () => { called = true; return "1"; }, perDay: 0 });
  assert.equal(await after(WORDS, "a", "b"), null);
  assert.equal(called, false, "a cap of 0 asks nothing");
});

test("makeAsk: Jev with a key, the own model without one, nothing when quiet", async () => {
  const seen: string[] = [];
  const own = async (k: { instructions: string }) => { seen.push(k.instructions); return 0.6; };
  const jevFetch = (async () => new Response(JSON.stringify({ answers: { same: { noul: 0.2 } } }))) as unknown as typeof fetch;
  assert.equal(await makeAsk({ key: "k", fetch: jevFetch, own })("job", "a", "b"), 0.2, "Jev kept where there is a key");
  assert.equal(seen.length, 0);
  assert.equal(await makeAsk({ key: null, own })("kind", "a", "b"), 0.6, "no key: the own model, asked Jev's question");
  assert.match(seen[0], /same kind of place/);
  assert.equal(await makeAsk({ key: null })("kind", "a", "b"), null, "a test naming no key and no own: code's answer");
  const was = process.env.SOL_QUIET;
  process.env.SOL_QUIET = "1";
  try { assert.equal(await makeAsk({ key: null, own })("kind", "a", "b"), null, "quiet asks nobody"); }
  finally { if (was === undefined) delete process.env.SOL_QUIET; else process.env.SOL_QUIET = was; }
});

test("the default own model is off under the test runner", () => {
  assert.equal(defaultOwn(), null);
});

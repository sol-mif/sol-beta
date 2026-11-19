// Agents (#1327, #1381): once agents.json exists, Sol never rearranges a person's agents by itself. In the late look a
// pair Jev scores ≥ JEV_SAME in places of one kind is the same join ask as the half band (together · apart, undo);
// nothing is merged without the person's answer. The first grouping (agents.json missing) still merges it by itself.
// Each child's folder is a chain (the letter into calendar.md, the day's note from it), so each side is an agent and
// the look asks about each agent's rules in a place as one unit. Invented homes, a fake Jev.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensure, ensureWith, list, listNow, loadAgents, lookInFlight, saveAgents, undo } from "../src/agent/agents.ts";
import { Agents } from "../src/agent/index.ts";
import { answerJoin } from "../src/agent/meta/join.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { JEV_SAME } from "../src/agent/meta/numbers.ts";
import { LETTERS_CHAINED, NOW, make } from "./agents-fixtures.ts";

/** the two children's chains are one job (0.85, over JEV_SAME); the places are one kind */
const sure: Ask = async (q) => (q === "rule" ? 0.85 : 0.9);
const keeperFirst = () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  ensure(a);   // the keeper's tick: groupByCode, no Jev
  return { home, a };
};
const shape = (home: string) => loadAgents(home)!.agents.map((x) => ({ id: x.id, name: x.name, rules: x.rules }));

test("agents.json there: a pair over JEV_SAME is one open join ask, the agents unchanged", async () => {
  assert.ok(0.85 >= JEV_SAME);
  const { home, a } = keeperFirst();
  const before = shape(home);
  assert.equal(before.length, 2);
  const first = await listNow(a, sure);
  assert.equal(first.agents.length, 2);
  await lookInFlight(a);
  const l = list(a);
  assert.equal(l.joins.length, 1, "one open join ask");
  assert.deepEqual(l.joins[0].places, ["kids/ana", "kids/ben"]);
  assert.equal(l.joins[0].steps.length, 2, "both sides' steps side by side");
  assert.deepEqual(l.joins[0].steps.map((s) => s.length), [2, 3], "each side its whole chain: the letter and the day's note");
  assert.deepEqual(l.joins[0].agents.map((x) => x.id), ["ana", "ben"], "each side an agent");
  assert.deepEqual(shape(home), before, "nothing merged by itself: still two");
  assert.equal(loadAgents(home)!.joins[0].state, "open");
});

test("together merges the two, and undo brings back the two and the ask", async () => {
  const { home, a } = keeperFirst();
  const before = shape(home);
  await ensureWith(a, sure);
  const j = list(a).joins[0];
  const r = answerJoin(a, j.id, "together") as any;
  assert.equal(r.ok, true);
  assert.equal(r.change.kind, "merged");
  assert.equal(list(a).agents.length, 1);
  assert.equal(list(a).agents[0].rules.length, 4, "both chains, whole");
  assert.equal(list(a).agents[0].name, "Kids", "named again by code once it spans both children");
  assert.equal(list(a).joins.length, 0);
  assert.equal(undo(a, r.change.id).ok, true);
  assert.deepEqual(shape(home), before, "the two, as they were");
  assert.equal(list(a).joins.length, 1, "asked again");
});

test("apart: stays two and is never asked again", async () => {
  const { home, a } = keeperFirst();
  await ensureWith(a, sure);
  const r = answerJoin(a, list(a).joins[0].id, "apart") as any;
  assert.equal(r.ok, true);
  assert.equal(loadAgents(home)!.apart.length, 1);
  // a new rule set looks again; the pair kept apart is not asked, and nothing is merged
  const f = loadAgents(home)!;
  delete f.looked;
  saveAgents(home, f);
  await ensureWith(a, sure);
  assert.equal(typeof loadAgents(home)!.looked, "string", "looked again");
  assert.deepEqual(list(a).joins, []);
  assert.equal(list(a).agents.length, 2);
});

test("the first grouping (agents.json missing) still merges a pair over JEV_SAME by itself", async () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: sure, now: () => NOW });
  await ensureWith(a, sure);
  assert.equal(list(a).agents.length, 1, "one agent, by itself");
  assert.deepEqual(list(a).joins, [], "nothing asked");
});

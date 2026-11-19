// Agents (#1327, pass 2; the calm pass): the late look. agents.json written first by the keeper's sync path (groupByCode,
// no Jev) or a wire message: agents.list with Jev then looks once per rule set for half-band pairs of one kind and asks
// each, never regrouping. Here both letter rules are routines (one rule in one place, rule 3): the look asks about
// routines as it does about agents (agents-join-same: two agents). Invented homes, a fake Jev.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensure, ensureWith, list, loadAgents } from "../src/agent/agents.ts";
import { Agents } from "../src/agent/index.ts";
import { answerJoin } from "../src/agent/meta/join.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { LETTERS, NOW, make } from "./agents-fixtures.ts";

/** a fake Jev that counts its rule questions: the two letter rules are half the same job; the places are one kind */
const counting = (rule: number | null = 0.61) => {
  const n = { rule: 0, other: 0 };
  const ask: Ask = async (q) => { if (q === "rule") { n.rule++; return rule; } n.other++; return rule === null ? null : 0.9; };
  return { ask, n };
};
const keeperFirst = () => {
  const home = make(LETTERS);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  ensure(a);   // the keeper's tick: groupByCode, no Jev
  return { home, a };
};
const shape = (home: string) => { const f = loadAgents(home)!; return { agents: f.agents.map((x) => ({ id: x.id, name: x.name, rules: x.rules })), routines: f.routines }; };

test("the keeper writes first: agents.list with Jev asks the half-band pair, the agents unchanged", async () => {
  const { home, a } = keeperFirst();
  const before = shape(home);
  assert.deepEqual([before.agents.length, before.routines!.length], [0, 2], "two routines, no agent");
  assert.equal(loadAgents(home)!.joins.length, 0, "the sync path asks nothing");
  const { ask, n } = counting();
  await ensureWith(a, ask);
  const l = list(a);
  assert.equal(l.joins.length, 1, "one open join ask");
  assert.deepEqual(l.joins[0].places, ["kids/ana", "kids/ben"]);
  assert.deepEqual(shape(home), before, "nothing merged, split or renamed");
  assert.ok(n.rule > 0);
  assert.equal(typeof loadAgents(home)!.looked, "string", "the look is recorded");
});

test("a second list with the same rules asks Jev nothing about rules", async () => {
  const { home, a } = keeperFirst();
  await ensureWith(a, counting().ask);
  const { ask, n } = counting();
  await ensureWith(a, ask);
  assert.deepEqual(n, { rule: 0, other: 0 });
  assert.equal(loadAgents(home)!.joins.length, 1, "not asked twice");
});

test("a reworded rule looks again, never asking twice an open pair or a pair kept apart", async () => {
  const { home, a } = keeperFirst();
  await ensureWith(a, counting().ask);
  const key = loadAgents(home)!.looked;
  const reword = (s: string) => writeFileSync(join(home, "kids/ben/policy.md"), `# policy\n\n- [watch, draft] mail: ${s}\n`);
  reword("every Friday read the school letter and put the trips and dates into calendar.md");
  const one = counting();
  await ensureWith(a, one.ask);
  assert.ok(one.n.rule > 0, "a new rule set: looked again");
  assert.notEqual(loadAgents(home)!.looked, key);
  assert.equal(loadAgents(home)!.joins.length, 1, "the open ask is not made twice");
  assert.equal((answerJoin(a, list(a).joins[0].id, "apart") as any).ok, true);
  reword("each Friday read the school's letter; the trips and dates into calendar.md");
  const two = counting();
  await ensureWith(a, two.ask);
  assert.ok(two.n.rule > 0);
  assert.equal(loadAgents(home)!.joins.length, 1);
  assert.deepEqual(list(a).joins, [], "kept apart: never asked again");
});

test("Jev null: nothing asked and nothing recorded, so a later list looks again", async () => {
  const { home, a } = keeperFirst();
  const blind = counting(null);
  await ensureWith(a, blind.ask);
  assert.equal(blind.n.other, 0, "the kinds are not asked without a candidate pair");
  assert.deepEqual(list(a).joins, []);
  assert.equal(loadAgents(home)!.looked, undefined);
  await ensureWith(a, counting().ask);
  assert.equal(list(a).joins.length, 1);
});

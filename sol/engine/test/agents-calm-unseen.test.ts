// Agents (#1327): the second invented home (agents-fixtures.ts UNSEEN), written blind. On it, with real Jev
// (2026-11-17, NucBox), pass 1's two changes tuned on one person's own Sol did not hold: answering people by code
// changed nothing (its words were not that home's), and feeds asked as "one piece of work for one helper" glued an
// answering rule onto a chain twice. Both are gone (decided 2026-11-17); the brief's feeds wording, "does one use what
// the other makes?", is the only one, and answering people in two places is one job only on Jev's rule question.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePolicy } from "../src/agent/store.ts";
import { group, groupByCode } from "../src/agent/agents.ts";
import { metaBody, type Ask, type Question } from "../src/agent/meta/jev.ts";
import * as numbers from "../src/agent/meta/numbers.ts";
import * as jev from "../src/agent/meta/jev.ts";
import * as jobs from "../src/agent/meta/jobs.ts";
import { UNSEEN, UNSEEN_TRUTH, type Spec } from "./agents-fixtures.ts";

const AT = new Date(2026, 10, 10, 12, 0).toISOString();
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));
const keyOf = (rules: { folder: string; rule: string }[]) => rules.map((r) => `${r.folder}#${r.rule}`).sort().join(" ");
/** an agent that holds rules of two different truth groups (or a truth routine with anything): a wrong join */
const wrong = (agents: { rules: { folder: string; rule: string }[] }[]) => {
  const groupOf = new Map<string, number>();
  UNSEEN_TRUTH.agents.forEach((g, i) => g.forEach((id) => groupOf.set(id, i)));
  return agents.filter((a) => new Set(a.rules.map((r) => groupOf.get(`${r.folder}#${r.rule}`) ?? `routine ${r.folder}#${r.rule}`)).size > 1).length;
};

test("one feeds wording, the brief's; no switch and no answering code are left", () => {
  const q = metaBody("feeds", "a", "b").questions.same;
  assert.match(q.instructions, /use what the other makes/);
  assert.match(q.criteria.true, /uses what the other makes/);
  assert.equal((numbers as Record<string, unknown>).SWITCHES, undefined);
  assert.equal((jev as Record<string, unknown>).FEEDS, undefined);
  assert.equal((jobs as Record<string, unknown>).answersPeople, undefined);
});

test("each of Jev's five questions has its own instructions and both criteria", () => {
  const qs: Question[] = ["job", "rule", "kind", "fix", "feeds"];
  const said = qs.map((q) => metaBody(q, "a", "b").questions.same);
  for (const s of said) {
    assert.ok(s.instructions.length > 40);
    assert.ok(s.criteria.true && s.criteria.false);
  }
  assert.equal(new Set(said.map((s) => s.instructions)).size, qs.length, "no two alike");
  assert.notEqual(said[4].instructions, said[1].instructions, "feeds is not the rule question");
});

test("the unseen home by code alone: the repair chain is one agent by its folders and files", () => {
  const g = groupByCode(foldersOf(UNSEEN), AT);
  assert.deepEqual(g.agents.map((a) => keyOf(a.rules)), [UNSEEN_TRUTH.agents[1].slice().sort().join(" ")]);
  assert.equal(wrong(g.agents), 0);
});

test("the unseen home with a Jev that says no to every pair: nothing is joined that a person would keep apart", async () => {
  const g = await group(foldersOf(UNSEEN), AT, async () => 0.1);
  assert.equal(wrong(g.agents), 0);
  assert.ok(!g.agents.some((a) => keyOf(a.rules) === UNSEEN_TRUTH.agents[0].slice().sort().join(" ")), "the three that answer people stay apart");
  assert.ok(g.routines.length >= UNSEEN_TRUTH.routines.length);
});

test("the unseen home with a Jev that calls the three answering rules one job: they are one agent, by Jev's word only", async () => {
  const answering = /write back|respond|answer it/;
  const ask: Ask = async (q, x, y) => (q === "rule" && answering.test(x) && answering.test(y) ? 0.9 : 0.1);
  const g = await group(foldersOf(UNSEEN), AT, ask);
  assert.ok(g.agents.some((a) => keyOf(a.rules) === UNSEEN_TRUTH.agents[0].slice().sort().join(" ")));
  assert.equal(wrong(g.agents), 0);
});

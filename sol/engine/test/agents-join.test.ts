// Agents (#1327, pass 2; the calm pass): the ask band of the grouping. Sol's three bands: Jev ≥0.7 acts, 0.45–0.7 asks,
// under leaves it alone. Two existing rules in places of one kind that score in the half band are one open join ask
// ("one agent for both places?"), never merged silently and never left unseen. Here each side is one rule in one place:
// a routine (rule 3), no agent until the person answers together. Invented homes, a fake Jev.
import { test } from "node:test";
import assert from "node:assert/strict";
import { group, ensureWith, list, undo, loadAgents } from "../src/agent/agents.ts";
import { Agents } from "../src/agent/index.ts";
import { answerJoin } from "../src/agent/meta/join.ts";
import { kindsOf } from "../src/agent/meta/kinds.ts";
import { placesOf } from "../src/agent/meta/places.ts";
import { JEV_HALF, JEV_SAME } from "../src/agent/meta/numbers.ts";
import { parsePolicy } from "../src/agent/store.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { LETTERS, LETTERS_TWO_KINDS, NOW, make, type Spec } from "./agents-fixtures.ts";

const AT = "2026-11-16T00:00:00.000Z";
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));
/** a fake Jev: the two letter rules are half the same job (0.61); the two places are one kind */
const HALF = 0.61;
const jev: Ask = async (q) => (q === "rule" ? HALF : 0.9);
const kindsIn = (spec: Spec, ask: Ask) => { const home = make(spec); return () => kindsOf(placesOf(home).places, ask); };
const host = (spec: Spec, ask: Ask) => new Agents({ home: make(spec), ask, now: () => NOW });
const LETTER_RULES = ["kids/ana#mail-1", "kids/ben#mail-1"];
const routinesIn = (l: { folderRules: { folder: string; rule: string }[] }) => l.folderRules.map((x) => `${x.folder}#${x.rule}`);

test("the half band, two places of one kind: one join ask, no merge", async () => {
  assert.ok(HALF >= JEV_HALF && HALF < JEV_SAME);
  const r = await group(foldersOf(LETTERS), AT, jev, { kinds: kindsIn(LETTERS, jev) });
  assert.deepEqual([r.agents.length, r.routines.length], [0, 2], "not merged: two routines");
  assert.equal(r.asks.length, 1, "not dropped: asked");
  const [k] = r.asks;
  assert.deepEqual(k.places, ["kids/ana", "kids/ben"]);
  assert.deepEqual(k.names, ["Ana", "Ben"]);
  assert.deepEqual(k.rules, [{ folder: "kids/ana", rule: "mail-1" }, { folder: "kids/ben", rule: "mail-1" }]);
  assert.equal(k.p, HALF);
  assert.match(k.id, /^j-[0-9a-f]{10}$/);
  assert.deepEqual(k.steps, [
    ["the school's Friday letter → its dates into calendar.md"],
    ["each Friday read the letter from school and add the trips and dates to calendar.md", "the forms into forms.md"],
  ]);
  assert.ok(k.steps.flat().every((s) => !/\bana\b|\bben\b/i.test(s)), "the place is masked in the steps");
  // the same band acts (one agent on both places), under leaves it alone
  const same = await group(foldersOf(LETTERS), AT, async (q) => (q === "rule" ? 0.8 : 0.9), { kinds: kindsIn(LETTERS, jev) });
  assert.deepEqual([same.agents.length, same.routines.length], [1, 0]);
  const under = await group(foldersOf(LETTERS), AT, async (q) => (q === "rule" ? 0.3 : 0.9), { kinds: kindsIn(LETTERS, jev) });
  assert.deepEqual([under.routines.length, under.asks.length], [2, 0]);
  // not knowing the kinds, nothing is asked
  assert.equal((await group(foldersOf(LETTERS), AT, jev)).asks.length, 0);
});

test("together: two routines become one agent with both places, a change line, and undo brings back the two and the ask", async () => {
  const a = host(LETTERS, jev);
  await ensureWith(a, jev);
  const l = list(a);
  assert.equal(l.agents.length, 0, "each side is a routine: no agent yet");
  assert.deepEqual(routinesIn(l), LETTER_RULES);
  assert.equal(l.joins.length, 1);
  const j = l.joins[0];
  assert.deepEqual(j.agents, [{ id: "", name: "Ana", turn: 0 }, { id: "", name: "Ben", turn: 0 }], "a routine side shows as its place");
  const r = answerJoin(a, j.id, "together") as any;
  assert.equal(r.ok, true);
  assert.equal(r.change.kind, "merged");
  assert.match(r.change.line, /^Kids is one agent now, on Ana and Ben\.$/, "named by code: two siblings of a plural parent");
  const after = list(a);
  assert.equal(after.agents.length, 1);
  assert.deepEqual(after.agents[0].places.map((p: any) => p.place), ["kids/ana", "kids/ben"]);
  assert.deepEqual(after.agents[0].places.map((p: any) => p.trust), ["looks", "looks"], "each place keeps how far its own rule goes");
  assert.deepEqual(routinesIn(after), [], "no routine left: both rules are the agent's");
  assert.equal(after.joins.length, 0);
  assert.equal(loadAgents(a.d.home)!.agents[0].template, "the school's Friday letter → its dates into calendar.md", "the core is the terse rule");
  assert.deepEqual(answerJoin(a, j.id, "together"), { ok: false, why: "that was answered: together" });
  assert.equal(undo(a, r.change.id).ok, true);
  const back = list(a);
  assert.deepEqual(back.agents, [], "the routine sides go back to no agent");
  assert.deepEqual(routinesIn(back), LETTER_RULES, "the two, as they were");
  assert.equal(back.joins.length, 1, "asked again");
});

test("together: the richer rule's extra clauses become that place's lines, as a same-band group's do", async () => {
  const spec: Spec = { ...LETTERS, "kids/ben/policy.md": "# policy\n\n- [watch] mail: the school's Friday letter → its dates into calendar.md; the forms into forms.md\n" };
  const a = host(spec, jev);
  await ensureWith(a, jev);
  const r = answerJoin(a, list(a).joins[0].id, "together") as any;
  assert.deepEqual(r.agent.learned.map((x: any) => [x.place, x.line]), [["kids/ben", "the forms into forms.md"]]);
});

test("apart: stays two, a change line, never asked again; undo asks again", async () => {
  const a = host(LETTERS, jev);
  await ensureWith(a, jev);
  const j = list(a).joins[0];
  const r = answerJoin(a, j.id, "apart") as any;
  assert.equal(r.ok, true);
  assert.equal(r.change.kind, "apart");
  assert.match(r.change.line, /stay apart; Sol won't ask about these two again\.$/);
  assert.equal(r.change.agent, "", "two routines: the change names no agent (their stubs never existed)");
  assert.deepEqual([list(a).agents.length, routinesIn(list(a))], [0, LETTER_RULES], "still two routines");
  assert.equal(list(a).joins.length, 0);
  const f = loadAgents(a.d.home)!;
  assert.equal(f.apart.length, 1);
  // grouped again with what the person said, the pair is not asked
  assert.equal((await group(foldersOf(LETTERS), AT, jev, { kinds: kindsIn(LETTERS, jev), apart: f.apart })).asks.length, 0);
  assert.equal((await ensureWith(a, jev)).joins.filter((x) => x.state === "open").length, 0);
  assert.equal(undo(a, r.change.id).ok, true);
  assert.equal(list(a).joins.length, 1);
  assert.equal(loadAgents(a.d.home)!.apart.length, 0);
});

test("a half-band pair across two kinds asks nothing; Jev null asks nothing", async () => {
  const across = await group(foldersOf(LETTERS_TWO_KINDS), AT, jev, { kinds: kindsIn(LETTERS_TWO_KINDS, jev) });
  assert.deepEqual([across.routines.length, across.asks.length], [2, 0]);
  const blind: Ask = async () => null;
  const none = await group(foldersOf(LETTERS), AT, blind, { kinds: kindsIn(LETTERS, blind) });
  assert.equal(none.asks.length, 0);
  const a = host(LETTERS, blind);
  await ensureWith(a, blind);
  assert.deepEqual(list(a).joins, []);
});

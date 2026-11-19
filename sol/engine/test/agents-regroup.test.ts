// Agents (#1327, 2026-11-17): an agents.json grouped by an older Sol. Each invented home (SAM, THIRD, UNSEEN) is given
// the file an older keeper would have written for it: every rule its own agent, no routines, no grouping version, and
// what the person said since (a sign-in pause, a pair kept apart, the floor met, a fired date). The late look works the
// current grouping out once and it waits as one ask, "Sol groups agents better now: N → M"; Regroup gives the agents a
// new home of the same rules gets, keeps what the person said, and undoes; Keep as is is never asked again. Never
// regrouped without the ask. Also: a place named by a code reads as the code (geo214 → GEO214). Made-up homes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Agents } from "../src/agent/index.ts";
import { ensure, list, listNow, loadAgents, lookInFlight, regroup, saveAgents, undo, type Agent, type AgentsFile, type RuleRef } from "../src/agent/agents.ts";
import { pairKey } from "../src/agent/meta/jobs.ts";
import { GROUPING } from "../src/agent/meta/regroup.ts";
import { nameOfFolder } from "../src/agent/meta/places.ts";
import { NOW, SAM, THIRD, UNSEEN, make, type Spec } from "./agents-fixtures.ts";

const noJev = async () => null;
const host = (home: string) => new Agents({ home, ask: noJev, now: () => NOW });
const at = new Date(NOW - 5 * 86_400_000).toISOString();
const key = (r: RuleRef) => `${r.folder}#${r.rule}`;

/** what a new home of these rules gets today: the agents and routines, by their rules */
function fresh(spec: Spec) {
  const f = ensure(host(make(spec)));
  return { agents: f.agents.length, routines: (f.routines ?? []).length, sets: f.agents.map((x) => x.rules.map(key).sort().join(" ")).sort() };
}
/** the file an older keeper wrote for this home: one agent per rule, each born grouped, then what the person said */
function older(spec: Spec) {
  const home = make(spec), a = host(home);
  const now = ensure(a);
  const rules = [...now.agents.flatMap((x) => x.rules), ...(now.routines ?? [])];
  const agents: Agent[] = rules.map((r, i) => ({
    id: `${r.folder.split("/").pop()}-${r.rule}`, name: `${nameOfFolder(r.folder)} ${i + 1}`, job: r.rule, turn: i % 6, part: r.folder.split("/")[0], rules: [r], born: { how: "grouped", at },
    places: [{ place: r.folder, name: nameOfFolder(r.folder), folder: r.folder, rule: r.rule, trust: "draft", trigger: { kind: "own" }, at }],
  }));
  const f: AgentsFile = {
    v: 1, agents, held: [{ ...rules[0], why: "stuck", site: "the course site", since: at, until: "signed in" }], changes: [], offers: [], never: [],
    fired: [`${agents[1].id}|${rules[1].folder}|2026-11-15`], joins: [], apart: [pairKey(rules[2], rules[3])], met: at,
  };
  saveAgents(home, f);
  return { home, a, rules, f };
}
const look = async (a: Agents) => { await listNow(a, noJev); await lookInFlight(a); };

for (const [name, spec] of [["SAM", SAM], ["THIRD", THIRD], ["UNSEEN", UNSEEN]] as const) {
  test(`${name}: an older keeper's file is asked about once, regrouped as a new home is, what was said kept, undone`, async () => {
    const want = fresh(spec);
    const { home, a, rules, f: was } = older(spec);
    // never without the ask: the file is as it was until the person answers
    assert.equal(list(a).asks.all.some((q) => q.kind === "regroup"), false, "nothing asked before the look");
    await look(a);
    assert.equal(loadAgents(home)!.agents.length, rules.length, "the look regroups nothing");
    // the sign-in pause frees an agent, so it ranks first (rule 5); the regroup is the next ask
    const asks = list(a).asks, q = asks.all.find((x) => x.kind === "regroup")!;
    assert.equal(asks.front?.kind, "signin");
    assert.equal(asks.then[0]?.kind, "regroup");
    assert.equal(q.title, `Sol groups agents better now: ${rules.length} → ${want.agents}`);
    assert.equal(list(a).asks.all.filter((x) => x.kind === "regroup").length, 1, "one ask for the one cause");
    // a second look asks nothing new
    await look(a);
    assert.equal(list(a).asks.all.filter((x) => x.kind === "regroup").length, 1);

    const r = regroup(a, "regroup");
    assert.equal(r.ok, true);
    const f = loadAgents(home)!;
    assert.equal(f.agents.length, want.agents, "as many agents as a new home of the same rules");
    assert.deepEqual(f.agents.map((x) => x.rules.map(key).sort().join(" ")).sort(), want.sets, "the same agents a new home gets");
    assert.equal((f.routines ?? []).length, want.routines, "one rule in one place is a routine (rule 3)");
    assert.deepEqual(f.held, was.held, "the sign-in pause stays");
    assert.deepEqual(f.apart, was.apart, "the pair kept apart stays apart");
    assert.equal(f.met, was.met);
    assert.equal(f.grouping, GROUPING);
    const fired = f.fired[0].split("|");
    assert.ok(f.agents.some((x) => x.id === fired[0] && x.rules.some((y) => y.folder === fired[1])) || (f.routines ?? []).some((y) => y.folder === fired[1]), "a fired date follows its place");
    assert.equal(list(a).asks.all.some((x) => x.kind === "regroup"), false, "answered: asked no more");
    const c = f.changes.at(-1)!;
    assert.equal(c.kind, "regrouped");
    assert.equal(c.line, `Sol regrouped your ${rules.length} agents into ${want.agents}, one per job; what you set stays as it was.`);
    assert.ok(c.undo, "What Sol changed can undo it");

    // undo: the agents as they were, the ask open again
    assert.equal(undo(a, c.id).ok, true);
    const u = loadAgents(home)!;
    assert.deepEqual(u.agents.map((x) => x.id), was.agents.map((x) => x.id));
    assert.equal(u.routines, undefined);
    assert.deepEqual(u.fired, was.fired);
    assert.equal(list(a).asks.then[0]?.kind, "regroup", "the ask is open again");

    // keep as is: never asked again for this version, not even after another look
    assert.equal(regroup(a, "keep").ok, true);
    await look(a);
    const k = loadAgents(home)!;
    assert.equal(k.agents.length, rules.length, "kept as they were");
    assert.equal(k.regroup?.state, "kept");
    assert.equal(list(a).asks.all.some((x) => x.kind === "regroup"), false);
  });
}

test("an agent the person shaped stays whole through a regroup: its name, its rules, its id", async () => {
  const { home, a, f } = older(SAM);
  const mine = f.agents[4];
  mine.name = "My lab notes";
  f.changes.push({ id: "c-mine", at, kind: "renamed", agent: mine.id, line: `${f.agents[4].name} is now My lab notes.`, undo: { name: "x" }, undone: false });
  saveAgents(home, f);
  await look(a);
  assert.equal(regroup(a, "regroup").ok, true);
  const g = loadAgents(home)!;
  const kept = g.agents.find((x) => x.id === mine.id)!;
  assert.equal(kept.name, "My lab notes");
  assert.deepEqual(kept.rules, mine.rules);
  assert.equal(g.agents.filter((x) => x.rules.some((r) => key(r) === key(mine.rules[0]))).length, 1, "its rule is in no other agent");
});

test("a file of today's grouping is never asked about; an older one that would come out the same is marked current", async () => {
  const home = make(THIRD), a = host(home);
  ensure(a);
  await look(a);
  assert.equal(loadAgents(home)!.grouping, GROUPING);
  assert.equal(loadAgents(home)!.regroup, undefined);
  assert.equal(list(a).asks.all.some((q) => q.kind === "regroup"), false);
  // the same agents, written before the version was: nothing to ask, only the version written
  const f = loadAgents(home)!, n = f.agents.length;
  delete f.grouping; delete f.routines;
  saveAgents(home, f);
  await look(a);
  const g = loadAgents(home)!;
  assert.equal(g.agents.length, n, "nothing regrouped");
  assert.equal(g.regroup, undefined, "nothing asked");
  assert.equal(g.grouping, GROUPING, "marked current");
});

test("Regroup after the rules changed: the ask goes and is worked out again; an unknown answer is refused", async () => {
  const { home, a } = older(UNSEEN);
  await look(a);
  const f = loadAgents(home)!;
  f.regroup!.key = "another rule set";
  saveAgents(home, f);
  const r = regroup(a, "regroup");
  assert.equal(r.ok, false);
  assert.equal(loadAgents(home)!.regroup, undefined, "worked out again at the next look");
  await look(a);
  assert.ok(list(a).asks.all.some((q) => q.kind === "regroup"));
  assert.equal(regroup(a, "keep").ok, true);
  assert.equal(regroup(a, "keep").ok, false, "answered once");
});

test("a place named by a code reads as the code; words keep their case", () => {
  assert.equal(nameOfFolder("school/geo214"), "GEO214");
  assert.equal(nameOfFolder("courses/bio101-lab"), "BIO101 lab");
  assert.equal(nameOfFolder("cs2040b"), "CS2040B");
  assert.equal(nameOfFolder("week-1"), "Week 1");
  assert.equal(nameOfFolder("notes2024"), "Notes2024", "a word with a year is a word");
  assert.equal(nameOfFolder("work/MyClient"), "MyClient");
  assert.equal(nameOfFolder("family"), "Family");
});

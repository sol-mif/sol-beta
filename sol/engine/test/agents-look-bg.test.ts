// Agents (#1327, pass 2): the floor never waits on the late look. With agents.json there, agents.list answers at once
// from the file and the look runs in the background (one per home, `looking` while it runs, lookInFlight to await
// it); Jev's questions go a few at a time (jev.ts inOrder, JEV_AT_ONCE), and the grouping is the same as asking one at
// a time. Invented homes, a fake Jev with a delay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ensure, keep, listNow, loadAgents, lookInFlight, onAgentsChanged } from "../src/agent/agents.ts";
import { Agents } from "../src/agent/index.ts";
import { inOrder, limiter, type Ask } from "../src/agent/meta/jev.ts";
import { bandOf, JEV_AT_ONCE } from "../src/agent/meta/numbers.ts";
import { groupRules, maskOf, sameRuleByCode, type RuleGroup, type RuleIn } from "../src/agent/meta/jobs.ts";
import { LETTERS_CHAINED, NOW, make } from "./agents-fixtures.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** a fake Jev that takes `ms` per question and counts them and how many are in flight at once: the two children's
 *  chains (each folder's letter rule and the day's note made from it: two agents) are half the same job; the places
 *  are one kind */
const slow = (ms = 40) => {
  const n = { rule: 0, other: 0, now: 0, most: 0 };
  const ask: Ask = async (q) => {
    n.now++; n.most = Math.max(n.most, n.now);
    await wait(ms);
    n.now--;
    if (q === "rule") { n.rule++; return 0.61; }
    n.other++; return 0.9;
  };
  return { ask, n };
};
const keeperFirst = () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  ensure(a);   // the keeper's tick wrote agents.json first, by code
  return { home, a };
};

test("agents.json there: the list answers before the look ends and says looking; the look then brings the card", async () => {
  const { a } = keeperFirst();
  // Jev answers nothing until let go: the list coming back at all is the proof it did not wait on the look
  let go!: () => void;
  const held = new Promise<void>((r) => { go = r; });
  let asked = 0;
  const ask: Ask = async (q) => { asked++; await held; return q === "rule" ? 0.61 : 0.9; };
  const first = await listNow(a, ask);
  assert.equal(first.looking, true);
  assert.equal(first.joins.length, 0, "no card yet");
  assert.equal(first.agents.length, 2, "the floor has its agents at once");
  const p = lookInFlight(a);
  assert.ok(p, "the helper hands the look to await");
  await wait(5);
  assert.ok(asked > 0, "the look is asking Jev");
  go();
  await p;
  assert.equal(lookInFlight(a), null, "none in flight once it ended");
  const after = await listNow(a, ask);
  assert.equal(after.looking, false, "the rule set is looked: no new look");
  assert.equal(after.joins.length, 1, "the join card arrived");
});

test("two lists in a row start one look", async () => {
  const { a } = keeperFirst();
  const one = slow(), two = slow();
  await listNow(a, one.ask);
  const p = lookInFlight(a);
  const again = await listNow(a, two.ask);
  assert.equal(again.looking, true, "the second list joins the look in flight");
  assert.equal(lookInFlight(a), p, "the same look");
  await p;
  assert.ok(one.n.rule > 0);
  assert.deepEqual([two.n.rule, two.n.other], [0, 0], "the second list asked Jev nothing");
});

test("the look's end is pushed to the face, once from its save and once when it is over", async () => {
  const { a } = keeperFirst();
  let pushed = 0;
  onAgentsChanged(() => { pushed++; });
  try {
    await listNow(a, slow().ask);
    assert.equal(pushed, 0, "nothing pushed before the look ends");
    await lookInFlight(a);
    assert.ok(pushed >= 1);
    assert.equal((await listNow(a, slow().ask)).looking, false);
  } finally { onAgentsChanged(() => {}); }
});

test("Jev null: the look ends with nothing recorded, and the next list does not start it again at once", async () => {
  const { home, a } = keeperFirst();
  let asked = 0;
  const blind: Ask = async () => { asked++; await wait(10); return null; };
  await listNow(a, blind);
  await lookInFlight(a);
  assert.equal(loadAgents(home)!.looked, undefined);
  const n = asked;
  const again = await listNow(a, blind);
  assert.equal(again.looking, false, "no loop of looks while a face re-reads the list");
  assert.equal(asked, n);
});

test("agents.json missing: the list answers before Jev, looking and no agents; the first grouping then brings them", async () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  let go!: () => void;
  const held = new Promise<void>((r) => { go = r; });
  let asked = 0;
  const ask: Ask = async (q) => { asked++; await held; return q === "rule" ? 0.61 : 0.9; };
  const first = await listNow(a, ask);   // Jev is held: the list coming back at all is the proof
  assert.equal(first.looking, true);
  assert.deepEqual([first.agents.length, first.joins.length], [0, 0], "no agents yet, nothing guessed");
  assert.equal(loadAgents(home), null, "nothing written before the grouping ends");
  const p = lookInFlight(a);
  assert.ok(p, "the first grouping is in flight");
  await wait(5);
  assert.ok(asked > 0);
  go();
  await p;
  const after = await listNow(a, ask);
  assert.equal(after.looking, false);
  assert.equal(after.agents.length, 2);
  assert.equal(after.joins.length, 1, "the first grouping asked the half-band pair itself");
});

test("agents.json missing: two lists start one first grouping, and its save is pushed", async () => {
  const a = new Agents({ home: make(LETTERS_CHAINED), ask: async () => null, now: () => NOW });
  const one = slow(), two = slow();
  let pushed = 0;
  onAgentsChanged(() => { pushed++; });
  try {
    await listNow(a, one.ask);
    const p = lookInFlight(a);
    const again = await listNow(a, two.ask);
    assert.equal(again.looking, true);
    assert.equal(lookInFlight(a), p, "the same grouping");
    await p;
    assert.ok(one.n.rule > 0);
    assert.deepEqual([two.n.rule, two.n.other], [0, 0], "the second list asked Jev nothing");
    assert.ok(pushed >= 1, "agents.changed when it saved");
  } finally { onAgentsChanged(() => {}); }
});

test("the keeper and a wire message during the first grouping do not lose it: the Jev grouping is the one kept", async () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  let go!: () => void;
  const held = new Promise<void>((r) => { go = r; });
  const ask: Ask = async (q) => { await held; return q === "rule" ? 0.61 : 0.9; };
  await listNow(a, ask);
  const p = lookInFlight(a)!;
  keep(home, NOW);          // the 60 s tick
  const byCode = ensure(a);  // a wire message's sync path
  assert.ok(byCode.agents.length > 0, "the wire message still has agents to read");
  assert.equal(loadAgents(home), null, "but the code grouping is not written while the first grouping runs");
  go();
  await p;
  const f = loadAgents(home)!;
  assert.equal(f.joins.length, 1, "the Jev grouping (its ask) is what agents.json holds");
  assert.ok(f.looked, "and its rule set is looked");
  assert.equal((await listNow(a, ask)).looking, false, "no late look after it");
});

test("agents.json missing, Jev null: the first grouping still ends in agents, and the re-read does not loop", async () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  let asked = 0;
  const blind: Ask = async () => { asked++; await wait(5); return null; };
  assert.equal((await listNow(a, blind)).looking, true);
  await lookInFlight(a);
  const l = await listNow(a, blind);
  assert.equal(l.agents.length, 2, "grouped without Jev, by code");
  assert.equal(l.looking, false, "no late look started at once on the blind rule set");
  assert.equal(asked > 0, true);
  const n = asked;
  await listNow(a, blind);
  assert.equal(asked, n);
});

test("agents.json missing, the grouping failing outright: the code grouping is written, never looking forever", async () => {
  const home = make(LETTERS_CHAINED);
  const a = new Agents({ home, ask: async () => null, now: () => NOW });
  const broken: Ask = async () => { throw new Error("no Jev"); };
  await listNow(a, broken);
  await lookInFlight(a);
  assert.ok(loadAgents(home)!.agents.length > 0);
  assert.equal(lookInFlight(a), null);
});

test("the limiter never has more than the cap in flight, starts in order and stops when told", async () => {
  let now = 0, most = 0;
  const started: number[] = [], read: number[] = [];
  await inOrder([...Array(20).keys()], async (x) => { started.push(x); now++; most = Math.max(most, now); await wait(5 + ((x * 7) % 11)); now--; return x; }, (r) => { read.push(r); });
  assert.equal(most, JEV_AT_ONCE);
  assert.deepEqual(started, [...Array(20).keys()]);
  assert.deepEqual(read, [...Array(20).keys()], "answers read in order, whatever order they end in");
  const s: number[] = [];
  await inOrder([...Array(20).keys()], async (x) => { s.push(x); await wait(2); return x; }, (r) => r === 5);
  assert.ok(s.length <= 5 + JEV_AT_ONCE, "no more started once stopped");
});

// an invented home of 18 rules in 9 places, each with a made-up job; Jev's answer a fixed function of the two texts
const JOBS = ["reads the rota and puts the shifts into calendar.md", "reads the invoices and makes a summary in totals.md", "reads the letter and adds the trips to calendar.md", "reads the menu and writes the shopping list", "reads the bank export and makes a budget note", "reads the class notes and writes flashcards"];
const RULES: RuleIn[] = [...Array(18).keys()].map((i) => ({ place: `p${i % 9}`, folder: `f${i % 9}`, rule: `r${i}`, sentence: `every ${["Monday", "Friday"][i % 2]} ${JOBS[i % JOBS.length]}${i % 4 === 0 ? "; also a note to Ana" : ""}`, source: "clock", names: [`p${i % 9}`] }));
const score = (x: string, y: string) => { const h = createHash("sha1").update([x, y].sort().join("|")).digest()[0] / 255; return h < 0.15 ? null : h; };
/** the grouping as it was, one question at a time */
async function oneAtATime(rules: RuleIn[], ask: Ask): Promise<RuleGroup[]> {
  const groups: RuleGroup[] = [];
  for (const r of rules) {
    const mine = maskOf(r.sentence, r.names);
    let home: RuleGroup | null = null;
    for (const g of groups) {
      if (g.rules.some((x) => x.place === r.place)) continue;
      const p = await ask("rule", g.job, mine);
      if (p === null ? sameRuleByCode(g.rules[0], r) : bandOf(p) === "same") { home = g; break; }
    }
    if (home) home.rules.push(r); else groups.push({ rules: [r], job: mine });
  }
  return groups;
}

test("grouping a few at a time gives exactly the groups of one at a time, the cap held", async () => {
  let now = 0, most = 0;
  const ask: Ask = async (_q, x, y) => { now++; most = Math.max(most, now); await wait(1 + (x.length + y.length) % 7); now--; return score(x, y); };
  const shape = (gs: RuleGroup[]) => gs.map((g) => g.rules.map((r) => r.rule));
  const want = shape(await oneAtATime(RULES, async (_q, x, y) => score(x, y)));
  const got = shape(await groupRules(RULES, ask));
  assert.deepEqual(got, want);
  assert.ok(most > 1 && most <= JEV_AT_ONCE, `in flight at most the cap (was ${most})`);
});

test("one limiter holds its cap across callers, and a place freed goes to the next waiting", async () => {
  const gate = limiter(3);
  let now = 0, most = 0;
  const done = await Promise.all([...Array(12).keys()].map((x) => gate(async () => { now++; most = Math.max(most, now); await wait(3 + (x % 4)); now--; return x; })));
  assert.equal(most, 3);
  assert.deepEqual(done, [...Array(12).keys()]);
});

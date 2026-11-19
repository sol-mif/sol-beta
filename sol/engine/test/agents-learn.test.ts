// Agents' meta (#1327, pass 2): refining a kept agent over invented homes. Fix once asks, fix twice learns (for the
// place, or for the agent when made in two places), a said change is rehearsed before and after, scope add and remove
// with undo, a new sibling joins by itself at drafts for its first run, a capped first run is lifted once it ran; the
// joining and the lift only once the person has met the floor (agents.meet, rule 6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { list, loadAgents, meet, undo } from "../src/agent/agents.ts";
import { answerOffer, offers } from "../src/agent/meta/offer.ts";
import { changeJob, fix, learnedLine, sameFixByCode, scope } from "../src/agent/meta/learn.ts";
import { keepMeta } from "../src/agent/meta/keeper.ts";
import { appendLedger, readPolicy, saveTicket } from "../src/agent/store.ts";
import { noJev, type Ask } from "../src/agent/meta/jev.ts";
import { FREELANCER, NOW, NURSE, make, type Spec } from "./agents-fixtures.ts";

const H = 3_600_000;
const UPDATE = { name: "Friday update", job: "drafts <place> a short update from the week's hours", steps: ["the week's hours", "a short update", "drafted to the client"], parameter: "client", kind: "client" };
const ROTA = { name: "Rota", job: "puts each new rota for <place> into your calendar", steps: ["a new rota", "read it", "the calendar"], parameter: "ward", kind: "ward" };

async function kept(spec: Spec, offer: object, places?: string[], o: { ask?: Ask; say?: (p: string) => Promise<string | null> } = {}) {
  const home = make(spec), clock = { now: NOW };
  const said: string[] = [];
  const a = new Agents({ home, now: () => clock.now, ask: o.ask ?? noJev, say: async (p) => { said.push(p); return p.includes("wants this change") ? (o.say ? o.say(p) : null) : JSON.stringify(offer); }, turn: async () => ({ report: "ready", said: "ok", thread: null, ms: 0 }) });
  const [of] = (await offers(a)).offers;
  const r = answerOffer(a, of.id, "keep", places) as { ok: true; agent: { id: string; places: { place: string; folder: string; rule: string }[] } };
  assert.equal(r.ok, true);
  return { home, a, clock, ag: r.agent, said };
}
const sentence = (home: string, folder: string, rule: string) => readPolicy(join(home, folder)).rules.find((x) => x.id === rule)!.sentence;
const ACME = "clients/acme", NORTH = "clients/northwind";

test("fix once: the answer asks \"Always like this?\"; always learns it for that place; just once keeps it once", async () => {
  const { home, a, ag } = await kept(FREELANCER, UPDATE, [ACME, NORTH]);
  const [acme, north] = ag.places;
  const r1 = await fix(a, { id: ag.id, place: ACME, before: "Regards, Sam", after: "Best, Sam" });
  assert.equal((r1 as { ask: string }).ask, "Always like this?");
  assert.deepEqual(list(a).agents[0].asks.map((x: any) => [x.place, x.q]), [[ACME, "Always like this?"]], "the face shows the ask on the desk");
  const r2 = (await fix(a, { id: ag.id, place: ACME, before: "Cheers", after: "Thanks", always: true })) as any;
  assert.equal(r2.learned.place, ACME, "fixed in one place: learned for that place");
  assert.match(sentence(home, ACME, acme.rule), /Always: instead of “Cheers”, “Thanks”\.$/);
  assert.doesNotMatch(sentence(home, NORTH, north.rule), /Always/);
  const r3 = (await fix(a, { id: ag.id, place: NORTH, before: "See you", after: "Talk soon", always: false })) as any;
  assert.equal(r3.learned, null);
  assert.equal(loadAgents(home)!.agents[0].learned!.length, 1);
  assert.equal((await fix(a, { id: ag.id, place: "clients/bloom", before: "a", after: "b" })).ok, false, "not one of its places");
  assert.equal((await fix(a, { id: ag.id, place: ACME, before: "a", after: "a" })).ok, false);
});

test("fix twice: the same fix in two places is learned anyway, for the agent; undo takes it back; open work is handed back to redo", async () => {
  const { home, a, ag } = await kept(FREELANCER, UPDATE, [ACME, NORTH]);
  const [acme, north] = ag.places;
  saveTicket(join(home, ACME), { id: "t-20261116-aaaa", folder: ACME, rule: acme.rule, thread: "x", state: "waiting", mandate: { rung: "draft", mode: "do", policyVersion: "v" }, subscriptions: [], triggers: [], runs: [], ledger: [], opened: NOW });
  const before = [sentence(home, ACME, acme.rule), sentence(home, NORTH, north.rule)];
  assert.ok("ask" in (await fix(a, { id: ag.id, place: ACME, before: "Week of Nov 9: 6 h. Regards, Sam", after: "Week of Nov 9: 6 h. Best, Sam" })));
  const r = (await fix(a, { id: ag.id, place: NORTH, before: "Week of Nov 16: 7 h. Regards, Sam", after: "Week of Nov 16: 7 h. Best, Sam" })) as any;
  assert.equal(r.learned.place, null, "fixed in two places: learned for the agent");
  assert.equal(r.learned.fixes.length, 2);
  assert.deepEqual(r.redo, [{ folder: ACME, rule: acme.rule }]);
  assert.match(r.change.line, /Friday update learned: .*1 open to redo\./);
  assert.match(sentence(home, ACME, acme.rule), /Always: /);
  assert.match(sentence(home, NORTH, north.rule), /Always: /);
  assert.deepEqual(list(a).agents[0].asks, [], "learned: nothing left to ask");
  assert.equal(undo(a, r.change.id).ok, true);
  assert.deepEqual([sentence(home, ACME, acme.rule), sentence(home, NORTH, north.rule)], before);
  assert.deepEqual(loadAgents(home)!.agents[0].learned, []);
});

test("fix twice by Jev: two edits in other words that Jev calls the same fix (≥0.7); under, it asks again", async () => {
  const sameFix: Ask = async (q) => (q === "fix" ? 0.8 : null);
  const { a, ag } = await kept(FREELANCER, UPDATE, [ACME], { ask: sameFix });
  await fix(a, { id: ag.id, place: ACME, before: "Hi Mara", after: "Hello Mara" });
  const r = (await fix(a, { id: ag.id, place: ACME, before: "Thanks!", after: "Thank you." })) as any;
  assert.equal(r.learned.place, ACME);
  const no = await kept(FREELANCER, UPDATE, [ACME], { ask: async (q) => (q === "fix" ? 0.6 : null) });
  await fix(no.a, { id: no.ag.id, place: ACME, before: "Hi Mara", after: "Hello Mara" });
  assert.ok("ask" in (await fix(no.a, { id: no.ag.id, place: ACME, before: "Thanks!", after: "Thank you." })));
});

test("the same fix by code: the same words added and taken out, dates and numbers aside", () => {
  assert.equal(sameFixByCode({ before: "Dec 13 · free", after: "Dec 13 · asleep till 15:00" }, { before: "Dec 5 · free", after: "Dec 5 · asleep till 15:00" }), true);
  assert.equal(sameFixByCode({ before: "Regards", after: "Best" }, { before: "Regards", after: "Cheers" }), false);
  assert.equal(learnedLine({ before: "Regards", after: "Best" }), "instead of “Regards”, “Best”");
});

test("a said change is rehearsed on the last real run: before and after, nothing written; keep writes it everywhere; undo", async () => {
  const say = async (p: string) => { assert.match(p, /Hi Ana,\nThis week: 6 h/); return 'ok\n{"template":"drafts <place> a short update from the week\'s hours, signed off with Best","after":"Hi Ana,\\nThis week: 6 h.\\nBest, Sam"}'; };
  const { home, a, ag } = await kept(FREELANCER, UPDATE, [ACME, NORTH], { say });
  const [acme, north] = ag.places;
  assert.deepEqual(await changeJob(a, { id: ag.id, line: "sign off with Best" }), { ok: false, why: "it has not made anything yet: nothing to rehearse on" });
  mkdirSync(join(home, ACME, "drafts"), { recursive: true });
  writeFileSync(join(home, ACME, "drafts", "update.md"), "Hi Ana,\nThis week: 6 h.\nRegards, Sam");
  appendLedger(join(home, ACME), { at: NOW + H, rule: acme.rule, read: "hours.md", made: "drafts/update.md", held: "nothing" });
  const policy = readFileSync(join(home, ACME, "policy.md"), "utf8");
  const r = (await changeJob(a, { id: ag.id, line: "sign off with Best" })) as any;
  assert.deepEqual([r.before, r.after], ["Hi Ana,\nThis week: 6 h.\nRegards, Sam", "Hi Ana,\nThis week: 6 h.\nBest, Sam"]);
  assert.equal(readFileSync(join(home, ACME, "policy.md"), "utf8"), policy, "a rehearsal writes nothing");
  const k = (await changeJob(a, { id: ag.id, line: "sign off with Best", keep: true })) as any;
  assert.equal(k.ok, true);
  assert.match(sentence(home, ACME, acme.rule), /signed off with Best, for Acme\.$|signed off with Best/);
  assert.match(sentence(home, NORTH, north.rule), /for Northwind|Northwind/);
  assert.match(sentence(home, NORTH, north.rule), /signed off with Best/);
  undo(a, k.change.id);
  assert.equal(readFileSync(join(home, ACME, "policy.md"), "utf8"), policy);
  assert.equal(loadAgents(home)!.agents[0].template, UPDATE.job);
});

test("a said change that a learned line already says is that line, never a second one", async () => {
  const { a, ag } = await kept(FREELANCER, UPDATE, [ACME]);
  await fix(a, { id: ag.id, place: ACME, before: "Regards", after: "Best", always: true });
  const r = (await changeJob(a, { id: ag.id, line: "Best" })) as any;
  assert.equal(r.same.line, "instead of “Regards”, “Best”");
  assert.equal(list(a).agents[0].learned.length, 1);
});

test("scope: take a place out (its rule off, its work kept) and back by undo; add one, and undo it", async () => {
  const { home, a, ag } = await kept(FREELANCER, UPDATE, [ACME, NORTH]);
  const north = ag.places[1];
  const out = scope(a, { id: ag.id, remove: NORTH }) as any;
  assert.match(out.change.line, /Northwind taken out of Friday update/);
  assert.equal(readPolicy(join(home, NORTH)).rules[0].mode, "off");
  assert.deepEqual(list(a).agents[0].places.map((p: any) => p.place), [ACME]);
  undo(a, out.change.id);
  assert.equal(readPolicy(join(home, NORTH)).rules.find((x) => x.id === north.rule)!.mode, "do");
  assert.deepEqual(list(a).agents[0].places.map((p: any) => p.place).sort(), [ACME, NORTH]);
  const add = scope(a, { id: ag.id, add: "clients/bloom" }) as any;
  assert.equal(add.ok, true);
  assert.equal(readPolicy(join(home, "clients/bloom")).rules.length, 1);
  assert.match(add.change.line, /Bloom added to Friday update/);
  undo(a, add.change.id);
  assert.equal(readPolicy(join(home, "clients/bloom")).rules.length, 0);
  assert.ok(!list(a).agents[0].places.some((p: any) => p.place === "clients/bloom"));
  assert.equal(scope(a, { id: ag.id, add: "clients/nowhere" }).ok, false);
  assert.equal(scope(a, { id: ag.id }).ok, false);
});

test("a new sibling joins by itself at drafts for its first run, with a change line and undo; it is lifted once it ran", async () => {
  const { home, a, ag } = await kept(NURSE, ROTA);
  assert.deepEqual(keepMeta(home, NOW), { changed: false, due: [] });
  writeFileSync(join(home, "work", ".agent", "items.json"), JSON.stringify({ rota: [{ id: "ward-a", name: "Ward A" }, { id: "ward-c", name: "Ward C" }, { id: "day-unit", name: "Day Unit" }, { id: "ward-e", name: "Ward E" }] }));
  assert.equal(keepMeta(home, NOW + H).changed, false, "before the person has met the floor, nothing joins by itself (rule 6)");
  meet(a);
  assert.equal(keepMeta(home, NOW + H).changed, true);
  const f = loadAgents(home)!, me = f.agents.find((x) => x.id === ag.id)!;
  const e = me.places!.find((p) => p.place === "work#ward-e")!;
  assert.deepEqual([e.trust, e.first], ["does", "drafts"]);
  assert.equal(e.trigger.kind, "date");
  const c = f.changes.at(-1)!;
  assert.match(c.line, /Ward E joined Rota by itself; drafts for its first run\./);
  assert.equal(keepMeta(home, NOW + 2 * H).changed, false, "once");
  // its first run: lifted to what the agent does
  appendLedger(join(home, "work"), { at: NOW + 3 * H, rule: e.rule, read: "rota", made: "12 shifts into the calendar", held: "nothing" });
  assert.equal(keepMeta(home, NOW + 4 * H).changed, true);
  const lifted = loadAgents(home)!;
  assert.equal(lifted.agents[0].places!.find((p) => p.place === "work#ward-e")!.first, undefined);
  assert.match(lifted.changes.at(-1)!.line, /Rota ran once in Ward E \(drafts\); it does there now\./);
  // undo the join: out, and it does not join again by itself
  undo(a, c.id);
  assert.ok(!loadAgents(home)!.agents[0].places!.some((p) => p.place === "work#ward-e"));
  keepMeta(home, NOW + 5 * H);
  assert.ok(!loadAgents(home)!.agents[0].places!.some((p) => p.place === "work#ward-e"));
});

test("a place the person left unchecked does not join by itself; one listed for want of inputs joins when they come", async () => {
  const { home, a, ag } = await kept(FREELANCER, UPDATE, [ACME]);
  meet(a);
  keepMeta(home, NOW);
  let me = loadAgents(home)!.agents.find((x) => x.id === ag.id)!;
  assert.deepEqual(me.places!.map((p) => p.place), [ACME], "Northwind, unchecked by the person, stays out");
  writeFileSync(join(home, "clients/bloom/hours.md"), "| day | h |");
  keepMeta(home, NOW + H);
  me = loadAgents(home)!.agents.find((x) => x.id === ag.id)!;
  assert.deepEqual(me.places!.map((p) => p.place), [ACME, "clients/bloom"], "Bloom's hours came: it joins");
});

test("a date trigger runs its place's rule at its date minus the lead, once", async () => {
  const { home, ag, a: host } = await kept(NURSE, ROTA);
  const a = ag.places.find((p) => p.place === "work#ward-a")!;
  assert.equal(list(host).agents[0].next, undefined, "no date ahead: no next");
  writeFileSync(join(home, "work", "stickies.md"), readFileSync(join(home, "work", "stickies.md"), "utf8") + "- [ ] Ward A rota from Jan 1\n");
  assert.equal(list(host).agents[0].next, new Date(2026, 11, 17, 21, 0).toISOString(), "its next run is its date minus its lead, at its hour");
  // Ward A: 15 days before, at 21h → Dec 17 21:00
  assert.deepEqual(keepMeta(home, new Date(2026, 11, 17, 20, 59).getTime()).due, []);
  assert.deepEqual(keepMeta(home, new Date(2026, 11, 17, 21, 1).getTime()).due, [{ folder: "work", rule: a.rule }]);
  assert.deepEqual(keepMeta(home, new Date(2026, 11, 17, 21, 2).getTime()).due, [], "each date once");
});

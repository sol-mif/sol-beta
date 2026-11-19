// Agents' meta (#1327, pass 2): the offer over invented homes. One full Sol turn (a fake here) writes it; the kind's
// places are its tiles; keep writes one rule into each ticked place; not now comes back after 3 more traces; never is
// never again. One agent per job, never one per instance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { list, loadAgents, undo } from "../src/agent/agents.ts";
import { answerOffer, offerPrompt, offerSaid, offers } from "../src/agent/meta/offer.ts";
import { readPolicy } from "../src/agent/store.ts";
import { noJev, type Ask } from "../src/agent/meta/jev.ts";
import { EMPTY, FREELANCER, NOW, NURSE, PARENT, make, sticky, type Spec } from "./agents-fixtures.ts";

const D = 86_400_000;
const WRITE = (o: object) => async () => `I read the traces.\n${JSON.stringify(o)}`;
const ROTA = { name: "Rota", job: "puts each new rota for <place> into your calendar", steps: ["a new rota", "read it", "your shifts into the calendar"], parameter: "the ward", kind: "ward" };
function host(spec: Spec, o: { ask?: Ask; say?: (p: string) => Promise<string | null>; now?: number } = {}) {
  const home = make(spec), clock = { now: o.now ?? NOW };
  const prompts: string[] = [];
  const a = new Agents({ home, now: () => clock.now, ask: o.ask ?? noJev, say: async (p) => { prompts.push(p); return (o.say ?? WRITE(ROTA))(p); }, turn: async () => ({ report: "ready", said: "ok", thread: null, ms: 0 }) });
  return { home, a, clock, prompts };
}

test("an empty home: no places, no traces, no offer, no agent", async () => {
  const { a, prompts } = host(EMPTY);
  assert.deepEqual((await offers(a)).offers, []);
  assert.deepEqual(list(a).agents, []);
  assert.equal(prompts.length, 0);
});

test("the nurse: three rotas in two wards are one offer for the kind, every ward a tile, the turn sees no names", async () => {
  const { a, prompts } = host(NURSE);
  const [o] = (await offers(a)).offers;
  assert.equal((await offers(a)).offers.length, 1, "asked again: the same one offer, not a second");
  assert.equal(prompts.length, 1, "one Sol turn for one offer");
  assert.deepEqual([o.name, o.kind, o.reach, o.count], ["Rota", "ward", "does", 3]);
  assert.deepEqual(o.places.map((p) => [p.name, p.checked]), [["Ward A", true], ["Ward C", true], ["Day Unit", true]]);
  assert.deepEqual(o.on, { place: "work#ward-c", sticky: "Ward C rota from Dec 1 → my calendar" }, "it waits on the sticky that passed the gate");
  assert.equal(o.seen.length, 3);
  const traces = prompts[0].split("\n").filter((l) => l.startsWith("- "));
  assert.equal(traces.length, 3);
  assert.ok(traces.every((l) => !/ward a|ward c|oct 1|nov 1|dec 1/i.test(l)), "the traces go to the turn masked");
});

test("keep: one rule into each checked place (an item's into its folder), one agent for the job with its places and their own triggers", async () => {
  const { home, a } = host(NURSE);
  const [o] = (await offers(a)).offers;
  const before = readFileSync(join(home, "work", "policy.md"), "utf8");
  const r = answerOffer(a, o.id, "keep") as { ok: true; agent: any; change: { id: string; line: string } };
  assert.equal(r.ok, true);
  assert.equal(r.agent.places.length, 3);
  assert.equal(r.agent.rules.length, 3, "one rule per place, one agent");
  const f = loadAgents(home)!;
  assert.equal(f.agents.filter((x) => x.born.how === "offer").length, 1);
  assert.equal(f.offers[0].state, "kept");
  const rules = readPolicy(join(home, "work")).rules.filter((x) => x.source === "date");
  assert.equal(rules.length, 3);
  assert.match(rules[0].sentence, /^15 days before each date of Ward A, at 21h → puts each new rota for Ward A into your calendar\.$/);
  assert.match(rules[1].sentence, /^18 days before each date of Ward C, at 21h/, "Ward C's own lead and hour");
  assert.match(rules[2].sentence, /^16 days before each date of Day Unit/, "a ward with no history: the job's");
  assert.ok(rules.every((x) => x.mode === "do" && x.rung === "draft"), "only the person sees it: it does");
  assert.ok(!rules.some((x) => /\b\d\d?:\d\d\b/.test(x.sentence)), "no hour a clock would read");
  assert.match(r.change.line, /Rota kept: on Ward A, Ward C and Day Unit; it does there\./);
  const l = list(a);
  assert.deepEqual(l.agents.find((x) => x.id === "rota")!.places.map((p: any) => p.trigger.leadDays), [15, 18, 16]);
  // undo: the rules out, the agent gone, the offer open again
  assert.equal(undo(a, r.change.id).ok, true);
  assert.equal(readFileSync(join(home, "work", "policy.md"), "utf8"), before);
  assert.equal(loadAgents(home)!.agents.length, 0);
  assert.equal((await offers(a)).offers.length, 1);
});

test("keep with the places ticked; none ticked is refused; an offer kept is not kept twice", async () => {
  const { home, a } = host(FREELANCER, { say: WRITE({ name: "Friday update", job: "drafts <place> a short update from the week's hours", steps: ["the week's hours", "a short update", "drafted to the client"], parameter: "the client", kind: "client" }) });
  const [o] = (await offers(a)).offers;
  assert.deepEqual(o.places.map((p) => [p.place, p.checked, p.why ?? ""]), [["clients/acme", true, ""], ["clients/bloom", false, "no hours here yet"], ["clients/northwind", true, ""]]);
  assert.equal(o.reach, "drafts", "the client sees it: it drafts");
  assert.deepEqual(answerOffer(a, o.id, "keep", []), { ok: false, why: "pick at least one place" });
  assert.equal(answerOffer(a, o.id, "keep", ["clients/nowhere"]).ok, false);
  const r = answerOffer(a, o.id, "keep", ["clients/acme"]) as { ok: true; agent: any };
  assert.deepEqual(r.agent.places.map((p: any) => p.place), ["clients/acme"]);
  assert.equal(readPolicy(join(home, "clients/acme")).rules.length, 1, "policy.md made for a place that had none");
  assert.equal(readPolicy(join(home, "clients/northwind")).rules.length, 0);
  assert.equal(answerOffer(a, o.id, "keep").ok, false);
});

test("the parent: two children's letters are one agent for both, never one per child", async () => {
  const { a } = host(PARENT, { say: WRITE({ name: "Our week", job: "turns <place>'s Friday letter into the family's week", steps: ["the letter", "dates and forms", "the calendar"], parameter: "the child", kind: "child" }) });
  const os = (await offers(a)).offers;
  assert.equal(os.length, 1);
  assert.deepEqual(os[0].places.map((p) => p.place), ["kids#ana", "kids#ben"]);
  const r = answerOffer(a, os[0].id, "keep") as { ok: true; agent: any };
  assert.equal(list(a).agents.length, 1);
  assert.deepEqual(r.agent.rules.map((x: any) => x.folder), ["kids", "kids"]);
});

test("the turn cannot name the steps: the offer asks to be shown once, and cannot be kept", async () => {
  const { a } = host(NURSE, { say: WRITE({ showMe: true }) });
  const [o] = (await offers(a)).offers;
  assert.equal(o.showMe, true);
  assert.deepEqual(answerOffer(a, o.id, "keep"), { ok: false, why: "show Sol once first: it could not name the steps" });
  assert.deepEqual(offerSaid('{"name":"X","job":"y","steps":["one"]}'), { showMe: true }, "one step named is not steps");
  assert.equal(offerSaid("no json"), null);
  assert.match(offerPrompt(["read: rota"], "ward", ["A", "B"]), /each ward: A, B/);
});

test("no turn to be had: no offer yet, asked again on the next scan", async () => {
  const { a } = host(NURSE, { say: async () => null });
  assert.deepEqual((await offers(a)).offers, []);
});

function addRotas(home: string, n: number, from: number) {
  for (let i = 0; i < n; i++) {
    const d = new Date(from + i * 7 * D);
    const stamp = `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} 20:00`;
    appendFileSync(join(home, "work", "stickies.md"), `${sticky(`Ward A rota extra ${i}`, `asked ${stamp}`, "did: 12 shifts into my calendar · read: rota · 20 min")}\n`);
  }
}

test("not now: back after 3 more traces, not before; undo puts it back at once", async () => {
  const { home, a, clock } = host(NURSE);
  const [o] = (await offers(a)).offers;
  const r = answerOffer(a, o.id, "later") as { ok: true; change: { id: string } };
  assert.deepEqual((await offers(a)).offers, []);
  clock.now = NOW + 21 * D;
  addRotas(home, 2, NOW + D);
  assert.deepEqual((await offers(a)).offers, [], "two more is not three");
  addRotas(home, 1, NOW + 15 * D);
  const back = (await offers(a)).offers;
  assert.equal(back.length, 1);
  assert.equal(back[0].id, o.id, "the same offer, its count grown");
  assert.equal(back[0].count, 6);
  // the undo of a later
  answerOffer(a, o.id, "later");
  const c = loadAgents(home)!.changes.at(-1)!;
  assert.equal(undo(a, c.id).ok, true);
  assert.equal((await offers(a)).offers.length, 1);
  assert.equal(undo(a, r.change.id).ok, true, "an older undo still answers");
});

test("never: that job shape is not offered again, however many more; undo lets it come back", async () => {
  const { home, a, clock } = host(NURSE);
  const [o] = (await offers(a)).offers;
  const r = answerOffer(a, o.id, "never") as { ok: true; change: { id: string } };
  clock.now = NOW + 40 * D;
  addRotas(home, 4, NOW + D);
  assert.deepEqual((await offers(a)).offers, []);
  assert.equal(loadAgents(home)!.never.length, 1);
  undo(a, r.change.id);
  assert.equal(loadAgents(home)!.never.length, 0);
  assert.equal((await offers(a)).offers.length, 1);
  assert.deepEqual(answerOffer(a, "o-nope", "keep"), { ok: false, why: "no offer o-nope" });
  assert.equal(answerOffer(a, o.id, "maybe").ok, false);
});

test("Jev's half band alone never offers; Jev's 'different' splits what code would join", async () => {
  const half = host(NURSE, { ask: async (q) => (q === "job" ? 0.5 : null) });
  assert.deepEqual((await offers(half.a)).offers, []);
  const diff = host(NURSE, { ask: async (q) => (q === "job" ? 0.1 : null) });
  assert.deepEqual((await offers(diff.a)).offers, []);
  const same = host(NURSE, { ask: async (q) => (q === "job" ? 0.9 : null) });
  assert.equal((await offers(same.a)).offers.length, 1);
});

test("the tick asks for an offer only when a new trace lands, never each minute", async () => {
  let turns = 0, answer: string | null = null;
  const { home, a, clock } = host(NURSE, { say: async () => { turns++; return answer; } });
  assert.deepEqual((await offers(a)).offers, [], "the turn could not be had");
  assert.equal(turns, 1);
  const { notice } = await import("../src/agent/meta/offer.ts");
  await a.tick(new Date(clock.now)); await notice(a, true);
  assert.equal(turns, 1, "no new trace: no new turn");
  answer = JSON.stringify(ROTA);
  addRotas(home, 1, NOW + D);
  clock.now = NOW + 2 * D;
  await a.tick(new Date(clock.now)); await notice(a, true);
  assert.equal(turns, 2);
  assert.equal(loadAgents(home)!.offers.length, 1, "a new trace: the offer written");
});

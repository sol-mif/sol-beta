// Agents (#1327, pass 2; the calm pass 2026-11-17): existing rules grouped into agents. Each place's rules into chains
// first (one makes what the next reads), then chains across places by the same-job test with the place masked, one
// agent per job across places, never one per instance; one rule in one place is a routine, no agent (rule 3). No
// source, folder or word decides a job by its name. Names come from code (rule 8). Invented homes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { group, groupByCode, nameOfJob, namesOf as wordsOf, placeMask, ensureWith, list } from "../src/agent/agents.ts";
import { namesOf } from "../src/agent/meta/names.ts";
import { Agents } from "../src/agent/index.ts";
import { parsePolicy } from "../src/agent/store.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import type { RuleIn } from "../src/agent/meta/jobs.ts";
import { BAKER, BAKER_CHAINS, EMPTY, FREELANCER_RULES, LETTERS_CHAINED, make, type Spec } from "./agents-fixtures.ts";

const AT = "2026-11-16T00:00:00.000Z";
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));
const shape = (r: { agents: { name: string; rules: { folder: string; rule: string }[] }[] }) => r.agents.map((a) => `${a.name}: ${a.rules.map((x) => `${x.folder}#${x.rule}`).join(" ")}`);
const refs = (xs: { folder: string; rule: string }[]) => xs.map((x) => `${x.folder}#${x.rule}`);

test("one agent per job across places: the freelancer's update and invoice rules in two clients are two agents, not four; a lone rule is a routine", () => {
  const r = groupByCode(foldersOf(FREELANCER_RULES), AT);
  // names by code (rule 8): all of the update's work is a message → Messages; the folder its invoices go into → Invoices
  assert.deepEqual(shape(r), [
    "Messages: clients/acme#clock-1 clients/northwind#clock-1",
    "Invoices: clients/acme#clock-2 clients/northwind#clock-2",
  ]);
  assert.deepEqual(refs(r.routines), ["clients/bloom#folder-1"], "one rule in one place: a routine, no agent (rule 3)");
  assert.deepEqual(r.folderRules, [{ folder: "clients/acme", rule: "stickies-1" }], "the stickies helper does what each sticky asks: no job");
  const [upd] = r.agents;
  assert.equal(upd.template, "Fri 16:00 the week's hours from hours.md into a short update in drafts/update.md for <place>");
  assert.deepEqual(upd.places!.map((p) => [p.place, p.trust, p.trigger.kind]), [["clients/acme", "looks", "own"], ["clients/northwind", "looks", "own"]]);
  assert.equal(r.agents[1].places![1].trust, "drafts", "each place keeps how far its own rule goes");
  assert.ok(r.agents.every((a) => a.born.how === "grouped"));
  assert.deepEqual(r.agents.map((a) => a.turn), [0, 1]);
});

test("a baker's shop and family: no rule feeds another and no two share a job, so each is a routine; rules that feed each other are one agent", () => {
  const r = groupByCode(foldersOf(BAKER), AT);
  assert.equal(r.agents.length, 0, "one rule in one place is no agent");
  assert.deepEqual(refs(r.routines), ["family#clock-1", "shop#mail-1", "shop#clock-1", "shop#clock-2", "shop#folder-1"]);
  // the same shop with two chains: the mail into supplier.md and its questions from supplier.md; the takings into
  // week.md and the summary from week.md. Linked by their files, by code
  const c = groupByCode(foldersOf(BAKER_CHAINS), AT);
  assert.deepEqual(c.agents.map((a) => refs(a.rules)), [["shop#mail-1", "shop#clock-3"], ["shop#clock-2", "shop#clock-4"]]);
  assert.deepEqual(refs(c.routines), ["family#clock-1", "shop#clock-1", "shop#folder-1"]);
});

test("the same folders in any order give the same agents; none, none", () => {
  const f = foldersOf(FREELANCER_RULES);
  assert.deepEqual(groupByCode([...f].reverse(), AT), groupByCode(f, AT));
  assert.deepEqual(groupByCode([], AT).agents, []);
});

test("Jev decides the same job over the masked sentences, and which rules of a place feed each other; null falls back to code", async () => {
  const seen: string[] = [];
  const no: Ask = async (_q, a, b) => { seen.push(a, b); return 0.1; };
  const r = await group(foldersOf(FREELANCER_RULES), AT, no);
  assert.deepEqual([r.agents.length, r.routines.length], [0, 5], "Jev says each is its own job and none feeds another: five routines");
  assert.ok(seen.every((s) => !/acme|northwind|bloom/i.test(s)), "Jev never sees the place");
  // the same band joins across places; the chains question answered no, so nothing is linked within a place
  const yes: Ask = async (q) => (q === "feeds" ? null : 0.9);
  assert.equal((await group(foldersOf(FREELANCER_RULES), AT, yes)).agents.length, 2, "one per place at most: a place's two jobs stay two");
  // Jev says a place's two rules feed each other (code did not link them): each client's two rules are one chain
  const feeds: Ask = async (q) => (q === "feeds" ? 0.9 : 0.1);
  const ch = await group(foldersOf(FREELANCER_RULES), AT, feeds);
  assert.deepEqual(ch.agents.map((a) => refs(a.rules)), [["clients/acme#clock-1", "clients/acme#clock-2"], ["clients/northwind#clock-1", "clients/northwind#clock-2"]]);
  assert.deepEqual(ch.agents.map((a) => a.name), ["Acme", "Northwind"], "one place, no other agent there: the place's name");
  assert.deepEqual(shape(await group(foldersOf(FREELANCER_RULES), AT, async () => null)), shape(groupByCode(foldersOf(FREELANCER_RULES), AT)));
});

test("names: by code in the person's words, never by a Sol turn", async () => {
  assert.equal(nameOfJob("05:30 the day's orders from orders.md into bake-list.md"), "Day's orders");
  assert.equal(nameOfJob("a new file in invoices/ → into costs.md"), "Costs");
  assert.equal(placeMask("the week for Acme into acme/notes.md", "clients/acme"), "the week for <place> into <place>/notes.md");
  // one place and no other agent there: the place's name; siblings of a plural parent: the parent's name
  assert.deepEqual(groupByCode(foldersOf(LETTERS_CHAINED), AT).agents.map((a) => a.name), ["Ana", "Ben"]);
  const one = await group(foldersOf(LETTERS_CHAINED), AT, async (q) => (q === "rule" ? 0.85 : null));
  assert.deepEqual(one.agents.map((a) => a.name), ["Kids"]);
  // siblings of a parent that is no plural: the noun all places' rules share after "the", pluralised; a name taken
  // twice: the job's own name
  const u = (place: string, sentence: string): RuleIn => ({ place, folder: place, rule: "clock-1", sentence, source: "clock", names: wordsOf(place) });
  assert.deepEqual(namesOf([{ units: [u("term/maths", "every night 21:00 read the course page into news.md"), u("term/art", "every night 21:30 read the course page and its dates into news.md")] }], () => "Job"), ["Courses"]);
  assert.deepEqual(namesOf([{ units: [u("home/notes", "07:00 the post into post.md")] }, { units: [u("work/notes", "08:00 the post into post.md")] }], (i) => `Job ${i}`), ["Notes", "Job 1"]);
  // a Sol turn at hand is never asked for names: the first grouping waits on none (with Jev null it may ask the turn
  // about one place's pairs of steps, agents-steps.test.ts; that turn is no naming)
  let said = 0, steps = 0;
  const home = make(FREELANCER_RULES);
  const a = new Agents({ home, ask: async () => null, say: async (p) => { if (/^\d+\. first: /m.test(p)) { steps++; return null; } said++; return '["Friday update","Invoices"]'; } });
  await ensureWith(a, async () => null);
  assert.deepEqual(list(a).agents.map((x) => [x.id, x.name]), [["messages", "Messages"], ["invoices", "Invoices"]]);
  assert.equal(said, 0, "no naming turn");
  assert.ok(steps <= 1, "at most one turn about pairs of steps");
  const e = new Agents({ home: make(EMPTY), ask: async () => null });
  await ensureWith(e, async () => null);
  assert.deepEqual(list(e).agents, []);
});

// Agents (#1327, the calm pass, 2026-11-17): the rules the floor stands on, each tested on its own over invented homes.
//   rule 1  an agent is a chain: code links two rules by their files; otherwise Jev's "feeds", ≥0.7; Jev null: no link
//   rule 3  one rule in one place is a routine, no agent
//   rule 4  the work an agent waits on is Home's: the agent only counts it (a sign-in is not work, it is a stop)
//   rule 5  each stop has its site, since when and the rule's next run, so the face can rank one ask per cause
//   rule 6  before the first visit, the sign-in holds are one intro with one undo (all of them together)
//   rule 8  names, roles and steps by code, in the person's words
// No Codex, no browser, no network: Jev is a stand-in, the ledger lines are written by hand in the engine's shapes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { appendLedger, parsePolicy, saveTicket } from "../src/agent/store.ts";
import { group, groupByCode, keep, list, loadAgents, meet, namesOf as wordsOf, stuckOf, stucksOf, undoMany } from "../src/agent/agents.ts";
import { chainsByCode, chainsOf, linkedByCode } from "../src/agent/meta/chains.ts";
import { phraseOf, roleOf, stepsOf, whatOf } from "../src/agent/meta/day.ts";
import { madeNoun, namesOf } from "../src/agent/meta/names.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import { ruleShape, wayIn, type RuleIn } from "../src/agent/meta/jobs.ts";
import type { LedgerLine, Ticket } from "../src/agent/harness.ts";
import { BAKER_CHAINS, make, type Spec } from "./agents-fixtures.ts";

const H = 3_600_000, D = 24 * H;
const T0 = new Date(2026, 10, 10, 12, 0).getTime();   // Tue 10 Nov 2026, noon, local
const AT = new Date(T0).toISOString();
const signInLine = (rule: string, at: number): LedgerLine => ({ at, rule, read: "Gmail asked for a sign-in", made: "nothing (blocked)", held: 'would have shown "Sign in to Gmail"' });
const rin = (place: string, rule: string, sentence: string, source = "clock"): RuleIn => ({ place, folder: place, rule, sentence, source, names: wordsOf(place) });
const ids = (units: { members: RuleIn[] }[]) => units.map((u) => u.members.map((m) => m.rule));
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));
function setup(spec: Spec = BAKER_CHAINS) {
  const home = make(spec), clock = { now: T0 };
  const a = new Agents({ home, now: () => clock.now, ask: async () => null, turn: async () => ({ report: "ready", said: "done", thread: null, ms: 0 }) });
  list(a);
  return { home, a, clock };
}
const agentWith = (l: ReturnType<typeof list>, rule: string) => l.agents.find((x) => x.rules.some((r: { rule: string }) => r.rule === rule))!;

test("rule 1: two rules are one chain when one makes the file the other reads, by code, either order", () => {
  const into = rin("bakery", "mail-1", "the supplier's mail into supplier.md", "mail");
  const from = rin("bakery", "clock-2", "07:00 the questions from supplier.md into a list in replies.md");
  const other = rin("bakery", "clock-3", "21:00 the takings from till.csv into week.md");
  assert.equal(linkedByCode(into, from), true);
  assert.equal(linkedByCode(from, into), true, "either order");
  assert.equal(linkedByCode(into, other), false, "no file in common: no link");
  // a folder one fills is what another reads
  assert.equal(linkedByCode(rin("p", "folder-1", "a new scan → a note in notes/", "folder"), rin("p", "clock-1", "Friday 17:00 the week's notes/ into a summary in week.md")), true);
  assert.deepEqual(ids(chainsByCode([into, other, from])), [["mail-1", "clock-2"], ["clock-3"]], "the chain keeps its rules' order; the rest stands alone");
});

test("rule 1: what code did not link, Jev's feeds links at 0.7 and over; under it, or Jev null, it stays apart", async () => {
  const a = rin("studio", "clock-1", "08:00 the day's bookings into a list");
  const b = rin("studio", "clock-2", "08:30 a reminder to each client on the list");
  const far = rin("garden", "clock-1", "08:30 a reminder to water");
  assert.equal(linkedByCode(a, b), false, "no file names them both");
  const asked: string[] = [];
  const at = (p: number | null): Ask => async (q, x, y) => { asked.push(`${q}|${x}|${y}`); return q === "feeds" ? p : null; };
  assert.deepEqual(ids(await chainsOf([a, b, far], at(0.7))), [["clock-1", "clock-2"], ["clock-1"]], "linked at 0.7");
  assert.ok(asked.every((s) => !s.includes("garden") || !s.includes("studio")), "only rules of one place are asked about together");
  assert.ok(asked.every((s) => !/studio/i.test(s)), "Jev never sees the place");
  assert.deepEqual(ids(await chainsOf([a, b], at(0.69))), [["clock-1"], ["clock-2"]], "under 0.7: apart");
  assert.deepEqual(ids(await chainsOf([a, b], at(null))), [["clock-1"], ["clock-2"]], "Jev null: apart");
});

test("rule 1: what a rule puts in a folder with no making verb is what it makes; a new file in a folder is read", () => {
  const p = ruleShape(rin("trip", "clock-1", "08:00 find 10 hosts who fit plan.md, public pages only; each a file in hosts/"));
  assert.ok(p.made.includes("hosts/") && !p.reads.includes("hosts/"), JSON.stringify(p));
  assert.ok(ruleShape(rin("trip", "clock-2", "Friday 18:00 the week's notes in made/<date>-week.md")).made.includes("made/<date>-week.md"));
  const r = ruleShape(rin("trip", "folder-1", "a new file in tickets/ → into plan.md", "folder"));
  assert.ok(r.reads.includes("tickets/") && !r.made.includes("tickets/"), JSON.stringify(r));
  // so a rule that reads what the folder holds is linked to the one that fills it
  assert.equal(linkedByCode(rin("trip", "clock-1", "08:00 find 10 hosts who fit plan.md; each a file in hosts/"), rin("trip", "hosts-1", "when a host answers → a draft reply", "hosts")), true);
});

test("rule 1: a rule code left alone joins only its best partner; two chains code made stay two", async () => {
  const b1 = rin("studio", "clock-1", "08:00 the day's bookings into bookings.md");
  const b2 = rin("studio", "clock-2", "08:30 a reminder to each client in bookings.md");
  const t1 = rin("studio", "clock-3", "18:00 the day's takings into takings.md");
  const t2 = rin("studio", "clock-4", "Friday 17:00 an invoice for each client from takings.md");
  const loose = rin("studio", "clock-5", "07:30 a check that the room is ready for the first client");
  // Jev says every pair is one piece of work (0.8), the loose rule and the reminder most of all (0.9)
  const ask: Ask = async (_q, x, y) => ([x, y].some((s) => s.includes("room")) && [x, y].some((s) => s.includes("reminder")) ? 0.9 : 0.8);
  assert.deepEqual(ids(await chainsOf([b1, b2, t1, t2, loose], ask)), [["clock-1", "clock-2", "clock-5"], ["clock-3", "clock-4"]]);
});

test("rule 2: answering people in two places is one job only on Jev's rule question, never by code (2026-11-17)", async () => {
  const spec: Spec = {
    "club/policy.md": "# policy\n\n- [watch, draft] mail: every 60 min 08:00–20:00 new mail from members into mail.md; one that needs my answer → a draft in drafts/\n- [watch] clock: 07:00 the day's classes into today.md\n",
    "shop/policy.md": "# policy\n\n- [watch, draft] teams: every 30 min the team's chats into chats.md; where a reply is due, a draft in replies.md\n",
  };
  const no = await group(foldersOf(spec), AT, async () => 0.1);
  assert.equal(no.agents.length, 0, "Jev says no: three routines");
  assert.equal(no.routines.length, 3);
  const both = /a draft/;
  const yes = await group(foldersOf(spec), AT, async (q, x, y) => (q === "rule" && both.test(x) && both.test(y) ? 0.9 : 0.1));
  assert.deepEqual(yes.agents.map((x) => x.rules.map((y) => `${y.folder}#${y.rule}`)), [["club#mail-1", "shop#teams-1"]]);
  assert.deepEqual(yes.routines.map((y) => `${y.folder}#${y.rule}`), ["club#clock-1"]);
  const code = groupByCode(foldersOf(spec), AT);
  assert.equal(code.agents.length, 0, "by code: they read and make different things");
  assert.equal(code.routines.length, 3);
  assert.equal((await group(foldersOf(spec), AT, async () => null)).agents.length, 0, "Jev null: code's answer");
});

test("rule 2: two chains are asked the same job by their ways in, not their later steps", () => {
  const walk = rin("art", "board-1", "every night 03:00 walk the course into board.md", "blackboard");
  const day = rin("art", "clock-1", "08:00 today's work from board.md into today.md");
  assert.equal(wayIn({ ...day, members: [day, walk] }), walk, "the rule that brings work in from outside");
  assert.equal(wayIn({ ...day, members: [day] }), day);
});

test("rule 8: a place's own agent keeps the place's name when another agent there also works elsewhere", () => {
  const u = (place: string, rule: string, sentence: string, source = "clock") => rin(place, rule, sentence, source);
  const art = u("term/art", "clock-1", "every night 21:00 read the course page into news.md");
  const maths = u("term/maths", "clock-1", "every night 21:30 read the course page and its dates into news.md");
  const mail = (place: string) => u(place, "mail-1", "new mail → a draft reply in drafts/", "mail");
  assert.deepEqual(namesOf([{ units: [art] }, { units: [mail("term/art"), mail("club")] }], (i) => `Job ${i}`)[0], "Art");
  assert.deepEqual(namesOf([{ units: [art, maths] }, { units: [mail("term/art"), mail("club")] }], (i) => `Job ${i}`)[0], "Courses");
  // two agents only in one place: neither is the place, each is what it makes
  const bills = u("term/art", "clock-2", "every Friday 17:00 the week's receipts into invoices/week.md");
  assert.deepEqual(namesOf([{ units: [art] }, { units: [bills] }], (i) => `Job ${i}`), ["News", "Invoices"]);
  // another agent works only inside its places: the kind's name is not this one's to take
  assert.deepEqual(namesOf([{ units: [art, maths] }, { units: [bills] }], (i) => `Job ${i}`), ["News", "Art"]);
});

test("rule 3: a rule alone in its place is a routine; two that feed each other are an agent", () => {
  const spec: Spec = {
    "garden/policy.md": "# policy\n\n- [watch] clock: 07:00 the forecast into today.md\n",
    "studio/policy.md": "# policy\n\n- [watch] clock: 08:00 the day's bookings into bookings.md\n- [watch] clock: 08:30 a reminder to each client in bookings.md into a draft in drafts/\n",
  };
  const g = groupByCode(foldersOf(spec), AT);
  assert.deepEqual(g.routines.map((r) => `${r.folder}#${r.rule}`), ["garden#clock-1"]);
  assert.deepEqual(g.agents.map((x) => x.rules.map((r) => `${r.folder}#${r.rule}`)), [["studio#clock-1", "studio#clock-2"]]);
  // through the host: the routine is a folder rule, never a card
  const { a } = setup(spec);
  const l = list(a);
  assert.deepEqual(l.agents.length, 1);
  assert.deepEqual(l.folderRules.map((x) => `${x.folder}#${x.rule}`), ["garden#clock-1"]);
});

test("rule 4: an agent counts the work it waits on in Home; a sign-in it waits on is not counted as work", () => {
  const { home, a } = setup();
  const shop = join(home, "shop");
  const tk = (id: string, rule: string, kind: string, state: Ticket["state"] = "waiting"): Ticket => ({
    id, folder: "shop", rule, thread: id, state, mandate: { rung: "read", mode: "watch", policyVersion: "v" }, subscriptions: [],
    triggers: [{ id: "c", at: T0, source: "mail", kind, data: {}, thread: "m" }], runs: [], ledger: [], opened: T0,
    needs: { ticketId: id, title: "Reply to the mill", line: "", choices: ["open the draft"] },
  });
  saveTicket(shop, tk("t-20261110-aaa1", "mail-1", "new"));
  saveTicket(shop, tk("t-20261110-aaa2", "clock-3", "time"));
  saveTicket(shop, tk("t-20261110-aaa3", "mail-1", "needs-sign-in"));
  saveTicket(shop, tk("t-20261110-aaa4", "mail-1", "new", "done"));
  const l = list(a);
  assert.equal(agentWith(l, "mail-1").waits, 2, "two drafts waiting; the sign-in and the done one are not");
  assert.equal(agentWith(l, "clock-2").waits, 0);
});

test("rule 5: a stop is one per site, with since when and the rule's next run", () => {
  const ref = (rule: string) => ({ folder: "shop", rule });
  const held = { folder: "shop", rule: "mail-1", why: "stuck" as const, since: new Date(T0 - D).toISOString(), until: "signed-in", site: "Gmail" };
  const s = stucksOf([
    { ref: ref("mail-1"), runs: [], held, next: T0 + H },
    { ref: ref("clock-3"), runs: [signInLine("clock-3", T0 - 2 * H), signInLine("clock-3", T0 - 3 * H)], next: null },
  ]);
  assert.deepEqual(s, [{ site: "Gmail", folder: "shop", rule: "mail-1", since: T0 - D, next: T0 + H }], "the same site twice: one stop, the held one first");
  const run = stucksOf([{ ref: ref("clock-3"), runs: [signInLine("clock-3", T0 - 2 * H), signInLine("clock-3", T0 - 3 * H)] }]);
  assert.equal(run[0].since, T0 - 2 * H, "since the run that stopped");
  assert.equal(run[0].next, undefined);
  // rested for another reason: no stop
  assert.deepEqual(stucksOf([{ ref: ref("mail-1"), runs: [signInLine("mail-1", T0)], held: { ...held, why: "idle" as const, site: undefined } }]), []);
});

test("rule 5: a routine stopped at a sign-in is found by its rule (it has no agent)", () => {
  const { home, a } = setup();
  appendLedger(join(home, "family"), signInLine("clock-1", T0 - H));
  const l = list(a);
  const r = l.folderRules.find((x) => x.folder === "family")!;
  assert.equal(r.stuck?.site, "Gmail");
  assert.equal(typeof r.stuck?.next, "number", "its next run, for the rank");
  assert.deepEqual(stuckOf(a, "", { folder: "family", rule: "clock-1" })?.rule, "clock-1");
  assert.equal(stuckOf(a, "", { folder: "shop", rule: "clock-1" }), null);
});

test("rule 6: before the first visit, Sol's sign-in holds are one intro; one undo lets them all go; after the visit, no intro", () => {
  const { home, a } = setup();
  const shop = join(home, "shop"), family = join(home, "family");
  for (let i = 3; i >= 1; i--) { appendLedger(shop, signInLine("mail-1", T0 - i * H)); appendLedger(family, signInLine("clock-1", T0 - i * H)); }
  assert.equal(keep(home, T0), true);
  const f = loadAgents(home)!;
  assert.equal(f.held.length, 2);
  const intro = list(a).intro!;
  assert.equal(intro.ids.length, 2);
  assert.deepEqual([intro.agents, intro.sites], [2, ["Gmail"]], "an agent and a routine, one site");
  assert.deepEqual(undoMany(a, intro.ids), { ok: true, undone: 2 });
  assert.equal(loadAgents(home)!.held.length, 0, "both let go");
  assert.equal(list(a).intro, undefined, "nothing left to say");
  assert.equal(undoMany(a, intro.ids).ok, false, "once");
  // three new stops hold again; met, the floor says it as changes, not as the intro
  for (let i = 1; i <= 3; i++) appendLedger(shop, signInLine("mail-1", T0 + i * H));
  keep(home, T0 + 4 * H);
  assert.equal(list(a).intro?.ids.length, 1);
  meet(a);
  assert.equal(list(a).intro, undefined);
  assert.equal(list(a).changes[0].cause, "sign-in");
});

test("rule 8: roles of 12 words or fewer and steps as times of day, by code", () => {
  const rules = [
    { folder: "studio", rule: "clock-2", sentence: "18:00 a short note on what each client booked today, what they paid, what they still owe and when they come next into notes.md", source: "clock", names: wordsOf("studio") },
    { folder: "studio", rule: "clock-1", sentence: "every 60 min 08:00–20:00 the studio's bookings into bookings.md", source: "clock", names: wordsOf("studio") },
    { folder: "studio", rule: "folder-1", sentence: "a new scan from the front desk printer → a note in notes/", source: "folder", names: wordsOf("studio") },
  ];
  const steps = stepsOf(rules);
  assert.deepEqual(steps.map((s) => s.when), ["every hour 08–20", "18:00", "when a file comes"], "in the order of the day; the one with no hour last");
  assert.ok(steps.every((s) => !/studio/i.test(s.what)), "the place masked");
  // its first step's first clause is 9 words; the last step's whole phrase does not fit the 2 left: dropped, never cut
  // mid-phrase (orchestrator, 2026-11-17)
  const role = roleOf(rules);
  assert.ok(role.split(" ").length <= 12, role);
  assert.equal(role, "A short note on what each client booked today");
  // room for both: the first clause of each, joined by "then"; a long one sheds its "from …" phrase whole
  assert.equal(roleOf([rules[1], rules[2]]), "The bookings into bookings.md, then a new scan", "a masked place's \"'s\" goes with it");
  assert.equal(phraseOf("a new scan from the front desk printer of the second floor lobby area", [], 6), "A new scan");
  // a time's "at" goes with the time; a lone channel's name before a colon is no step; a person's name never shows
  assert.equal(whatOf("every night at 03:00 walk the whole course into course.md", []), "Walk the whole course into course.md");
  assert.equal(whatOf("Mail every 60 min 08:00–22:00: new messages from Dr. Ames, Team 3 or about Art into mail.md", ["Art"]), "New messages into mail.md");
  assert.equal(roleOf([]), "");
});

test("rule 8: a name from the folder its work goes into", () => {
  const u = rin("clients/acme", "clock-2", "the 1st of each month 09:00 the month's hours from hours.md into invoices/month.md");
  assert.equal(madeNoun([{ ...u, members: [u] }]), "Invoices");
  const v = rin("clients/acme", "clock-1", "Friday 17:00 the week from hours.md into summary.md");
  assert.equal(madeNoun([{ ...v, members: [v] }]), "Summary", "no folder: the file it makes");
});

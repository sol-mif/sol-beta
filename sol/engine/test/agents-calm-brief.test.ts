// Agents (#1327), the calm pass's brief (design sitting 2026-11-17), its tests a to g on made-up homes only. Each fails
// when its rule is taken out (the mutation run names which line it takes out).
//   a  a chain is one agent; a lone one-step rule is a routine
//   b  Jev's "feeds" links two rules that share no file at 0.8, not at 0.3
//   c  Sam, a student with a job: 14 rules in 4 parts, two course folders whose ways in score 0.62 → 5 agents and
//      2 routines; after "together", 4
//   d  two sites signed out block 3 agents, plus an open join → exactly 2 blocked asks, the sign-in first; a draft and
//      a keep-or-drop wait in Home, uncounted
//   e  before the first visit the keeper only pauses at a sign-in (one intro); rest waits for the visit
//   f  no Say turn in grouping or the first open; names are nouns, never a verb phrase
//   g  8 agents stand on shelves by place; 7 stand as cards
// and the two the brief adds to the desk: every step's runs are its work; a rule's turn is internal (run.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { appendLedger, parsePolicy, saveTicket } from "../src/agent/store.ts";
import { ensureWith, group, groupByCode, keep, list, loadAgents, meet } from "../src/agent/agents.ts";
import { answerJoin } from "../src/agent/meta/join.ts";
import { desk } from "../src/agent/meta/desk.ts";
import { runTicket } from "../src/agent/run.ts";
import type { Ask } from "../src/agent/meta/jev.ts";
import type { LedgerLine, Rule, Ticket, Trigger } from "../src/agent/harness.ts";
import { make, SAM, type Spec } from "./agents-fixtures.ts";

const H = 3_600_000, D = 24 * H;
const T0 = new Date(2026, 10, 10, 12, 0).getTime();   // Tue 10 Nov 2026, noon, local
const AT = new Date(T0).toISOString();
const foldersOf = (spec: Spec) => Object.entries(spec).filter(([p]) => p.endsWith("policy.md")).map(([p, t]) => ({ folder: p.replace(/\/policy\.md$/, ""), rules: parsePolicy(t) }));
const policy = (...rules: string[]) => `# policy\n\n${rules.map((r) => `- ${r}\n`).join("")}`;
const signIn = (site: string, rule: string, at: number): LedgerLine => ({ at, rule, read: `${site} asked for a sign-in`, made: "nothing (blocked)", held: `would have shown "Sign in to ${site}"` });
const VERB = /^(read|reads|make|makes|draft|drafts|send|put|get|check|write|find|add|plan|prep|answer|reply|pay|keep|water|review)\b/i;

function host(spec: Spec, ask: Ask = async () => null) {
  const home = make(spec), clock = { now: T0 }, said: string[] = [];
  const a = new Agents({ home, now: () => clock.now, ask, say: async (p: string) => { said.push(p); return null; }, turn: async () => ({ report: "ready", said: "done", thread: null, ms: 0 }) });
  return { home, a, clock, said };
}
const ruleOf = (l: ReturnType<typeof list>, folder: string, words: RegExp) => {
  for (const x of [...l.agents.flatMap((g) => g.rules), ...l.folderRules]) if (x.folder === folder && words.test(x.sentence)) return x.rule;
  throw new Error(`no rule in ${folder} like ${words}`);
};

// ---------------------------------------------------------------- a

test("a: rule A writes notes.md, rule B reads notes.md: one agent with two steps; a lone one-step rule is a routine", () => {
  const spec: Spec = {
    "pottery/policy.md": policy("[watch] clock: 07:00 the kiln log into notes.md", "[watch] clock: 18:00 a firing plan from notes.md into plan.md"),
    "garden/policy.md": policy("[watch] clock: 06:00 the forecast into today.md"),
  };
  const g = groupByCode(foldersOf(spec), AT);
  assert.equal(g.agents.length, 1);
  assert.deepEqual(g.agents[0].rules.map((r) => r.rule), ["clock-1", "clock-2"]);
  assert.deepEqual(g.routines.map((r) => `${r.folder}#${r.rule}`), ["garden#clock-1"]);
  const { a } = host(spec), l = list(a);
  assert.equal(l.agents.length, 1, "the routine is no card");
  assert.deepEqual(l.folderRules.map((r) => r.folder), ["garden"]);
});

// ---------------------------------------------------------------- b

test("b: Jev's feeds links two rules that share no file name at 0.8, and not at 0.3", async () => {
  const spec: Spec = { "band/policy.md": policy("[watch] mail: each gig offer into gigs.md", "[watch] clock: Friday 17:00 a setlist for the weekend into setlist.md") };
  const by = (p: number): Ask => async (q) => (q === "feeds" ? p : null);
  const linked = await group(foldersOf(spec), AT, by(0.8));
  assert.equal(linked.agents.length, 1);
  assert.equal(linked.agents[0].rules.length, 2);
  const apart = await group(foldersOf(spec), AT, by(0.3));
  assert.equal(apart.agents.length, 0, "two lone rules: two routines, no agent");
  assert.equal(apart.routines.length, 2);
});

// ---------------------------------------------------------------- c, d: Sam

// Sam (agents-fixtures.ts SAM): a student with a job, 14 rules in 4 parts
/** Jev for Sam: the two course folders' ways in are half the same job (0.62); the two folders are one kind; the two
 *  replies are one job (Jev's rule question: no code makes them one); the rest is different */
const samJev: Ask = async (q, x, y) => {
  if (q === "kind") return 0.9;
  if (q === "feeds") return 0.1;
  if ([x, y].every((s) => /→ a reply in drafts/.test(s))) return 0.9;
  return [x, y].every((s) => /course site/.test(s)) ? 0.62 : 0.1;
};

test("c: Sam's 14 rules: 5 agents and 2 routines at the first open; after one together, 4 agents", async () => {
  const total = foldersOf(SAM).reduce((n, f) => n + f.rules.length, 0);
  assert.equal(total, 14);
  const { a } = host(SAM, samJev);
  await ensureWith(a, samJev);
  const l = list(a);
  assert.equal(l.agents.length, 5, l.agents.map((x) => x.name).join(", "));
  assert.equal(l.folderRules.filter((r) => !r.helper).length, 2, "two routines");
  assert.equal(l.joins.length, 1, "the two courses: one join ask");
  assert.deepEqual(answerJoin(a, l.joins[0].id, "together").ok, true);
  const after = list(a);
  assert.equal(after.agents.length, 4);
  assert.equal(after.joins.length, 0);
});

test("d: two sites signed out block 3 agents, plus the join: exactly 2 blocked asks, the sign-in first; drafts and keep-or-drop wait in Home", async () => {
  const { home, a } = host(SAM, samJev);
  await ensureWith(a, samJev);
  const l0 = list(a);
  const bio = ruleOf(l0, "school/biology", /course site/), his = ruleOf(l0, "school/history", /course site/), rota = ruleOf(l0, "work", /rota from/);
  appendLedger(join(home, "school/biology"), signIn("Blackboard", bio, T0 - 2 * H));
  appendLedger(join(home, "school/history"), signIn("Blackboard", his, T0 - 3 * H));
  appendLedger(join(home, "work"), signIn("Gmail", rota, T0 - H));
  const tk = (id: string, folder: string, rule: string, title: string, choices: string[]): Ticket => ({
    id, folder, rule, thread: id, state: "waiting", mandate: { rung: "read", mode: "watch", policyVersion: "v" }, subscriptions: [],
    triggers: [{ id: "c", at: T0, source: "mail", kind: "new", data: {}, thread: "m" }], runs: [], ledger: [], opened: T0,
    needs: { ticketId: id, title, line: "", choices },
  });
  saveTicket(join(home, "work"), tk("t-20261110-bbb1", "work", ruleOf(l0, "work", /reply/), "Send the reply to the swap", ["open the draft"]));
  saveTicket(join(home, "money"), tk("t-20261110-bbb2", "money", ruleOf(l0, "money", /payment/), "Keep or drop this payment", ["keep", "drop"]));
  const l = list(a);
  assert.equal(l.asks.need, 2, "only blocked asks count");
  assert.deepEqual([l.asks.front?.kind, l.asks.then.map((x) => x.kind)], ["signin", ["join"]], "the sign-in first");
  const signin = l.asks.front!;
  assert.ok(signin.kind === "signin");
  assert.equal(signin.title, "Sign in to 2 sites");
  assert.equal(signin.freed, 3);
  assert.deepEqual(signin.sites.map((s) => [s.site, s.frees.length]).sort(), [["Blackboard", 2], ["Gmail", 1]]);
  assert.equal(l.asks.more, 0);
  // the waits: Home's, by ticket, never on the floor; each agent only counts its own
  assert.deepEqual(l.asks.home.map((x) => [x.need, x.id]).sort(), [["waits", "t-20261110-bbb1"], ["waits", "t-20261110-bbb2"]]);
  assert.ok(l.asks.all.filter((x) => x.need === "blocked").length === 2);
  assert.equal(l.agents.reduce((n, x) => n + x.waits, 0), 2);
  const cards = a.view("work")!.cards.map((c) => c.title);
  assert.ok(cards.includes("Send the reply to the swap"), "the draft is a card in Home's list");
});

// ---------------------------------------------------------------- e

test("e: before the first visit the keeper only pauses at a sign-in, one intro line; rest waits for the visit", () => {
  const spec: Spec = {
    "shop/policy.md": policy("[watch] mail: each supplier order into orders.md", "[watch] clock: 07:00 the day's orders from orders.md into a list in today.md"),
    "studio/policy.md": policy("[watch] clock: 08:00 the day's bookings into bookings.md", "[watch] clock: 08:30 a reminder for each booking in bookings.md into reminders.md"),
  };
  const { home, a } = host(spec);
  list(a);
  for (let i = 3; i >= 1; i--) appendLedger(join(home, "shop"), signIn("Gmail", "mail-1", T0 - i * H));
  for (let d = 9; d >= 1; d--) appendLedger(join(home, "studio"), { at: T0 - d * D, rule: "clock-1", read: "the bookings", made: "nothing", held: "" });
  keep(home, T0);
  const f = loadAgents(home)!;
  assert.deepEqual(f.held.map((h) => [h.folder, h.why]), [["shop", "stuck"]], "the sign-in pause only: no rest yet");
  assert.deepEqual(f.changes.filter((c) => c.cause).map((c) => [c.kind, c.cause]), [["held", "sign-in"]], "the keeper did one thing (the grouping's own line has no cause)");
  assert.equal(list(a).intro?.ids.length, 1, "one intro line");
  meet(a);
  keep(home, T0 + H);
  assert.ok(loadAgents(home)!.held.some((h) => h.folder === "studio" && h.why === "idle"), "met: the idle one rests");
  assert.equal(list(a).intro, undefined);
});

// ---------------------------------------------------------------- f

test("f: grouping and the first open never call Say; names come from the place, the kind or the noun made, never a verb", async () => {
  const { a, said } = host(SAM, samJev);
  await ensureWith(a, samJev);
  const l = list(a);
  meet(a);
  list(a);
  assert.equal(said.length, 0, "no Say turn");
  assert.ok(l.agents.length > 0);
  for (const x of l.agents) assert.ok(!VERB.test(x.name), `"${x.name}" starts with a verb`);
  const names = l.agents.map((x) => x.name);
  assert.ok(names.includes("Biology") && names.includes("History"), `a place's own agent has the place's name: ${names.join(", ")}`);
});

// ---------------------------------------------------------------- g

const NOUNS = ["orders", "stock", "rota", "invoices", "menus", "letters", "photos", "recipes"];
const cast = (n: number): Spec => Object.fromEntries(NOUNS.slice(0, n).map((w, i) => [`${["shop", "home", "club"][i % 3]}/${w}-desk/policy.md`,
  policy(`[watch] clock: 07:00 the new ${w} into ${w}.md`, `[watch] clock: 18:00 a summary of ${w}.md into ${w}-summary.md`)]));

test("g: 8 agents stand on shelves by place (one with a blocked ask opens); 7 stand as cards", () => {
  const seven = host(cast(7));
  const l7 = list(seven.a);
  assert.equal(l7.agents.length, 7);
  assert.equal(l7.shelves, null);
  const eight = host(cast(8));
  appendLedger(join(eight.home, "home/stock-desk"), signIn("Gmail", "clock-1", T0 - H));
  const l8 = list(eight.a);
  assert.equal(l8.agents.length, 8);
  assert.deepEqual(l8.shelves!.map((s) => [s.part, s.agents.length, s.open]).sort(), [["club", 2, false], ["home", 3, true], ["shop", 3, false]]);
});

// ---------------------------------------------------------------- the desk and a rule's run

test("desk: an agent's work is every step's runs, the chain's later step too, newest first", () => {
  const { a, home } = host({
    "pottery/policy.md": policy("[watch] clock: 07:00 the kiln log into notes.md", "[watch] clock: 18:00 a firing plan from notes.md into plan.md"),
    "pottery/notes.md": "# Notes\n\ncone 6, slow cool\n",
    "pottery/plan.md": "# Plan\n\nfire the mugs friday\n",
  });
  appendLedger(join(home, "pottery"), { at: T0 - 2 * H, rule: "clock-1", read: "the kiln log", made: "notes.md", held: "" });
  appendLedger(join(home, "pottery"), { at: T0 - H, rule: "clock-2", read: "notes.md", made: "plan.md", held: "" });
  const l = list(a);
  assert.equal(l.agents.length, 1);
  const d = desk(a, l.agents[0].id) as { work: { rule: string; lines: string[] }[] };
  assert.deepEqual(d.work.map((w) => w.rule), ["clock-2", "clock-1"]);
  assert.deepEqual(d.work[0].lines, ["Plan", "fire the mugs friday"]);
});

test("run: a rule's turn is the agent's own, started internal so no list of chats shows it", async () => {
  const home = make({ "pottery/policy.md": policy("[watch] clock: 07:00 the kiln log into notes.md") });
  const asked: ({ internal?: boolean } | undefined)[] = [];
  const thread = { id: "th-1", run: async () => ({ finalResponse: 'read the log, made notes.md\n{"report":"ready"}' }) };
  const codex = { startThread: () => thread, resumeThread: () => thread };
  const rule: Rule = { id: "clock-1", sentence: "07:00 the kiln log into notes.md", source: "clock", mode: "watch", rung: "read" };
  const trigger: Trigger = { id: "tr-1", at: T0, source: "clock", kind: "time", data: {}, thread: "clock:pottery" };
  const ticket = { id: "t-1", folder: "pottery", rule: "clock-1", thread: "clock:pottery", state: "open", mandate: { rung: "read", mode: "watch", policyVersion: "x" }, subscriptions: [], triggers: [trigger], runs: [], ledger: [], opened: T0 } as unknown as Ticket;
  const out = await runTicket(join(home, "pottery"), rule, trigger, ticket, {
    codexFor: (_t, o) => { asked.push(o); return codex as never; }, turns: new Map(), sandboxMode: "workspace-write", networkAccessEnabled: false, now: () => T0,
  });
  assert.equal(out.report, "ready");
  assert.deepEqual(asked, [{ internal: true }]);
});

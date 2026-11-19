// Agents (#1327): over a baker's invented home. State precedence, the keeper (held, rested, undo, woken), the clock skipping what it holds, and the
// wire's own functions (make's refusal, mode writes policy.md, rest, rename, undo). No Codex, no browser, no network:
// a ticket's turn is a stand-in, and the ledger lines are written by hand in the shapes the engine writes them.
// The calm pass: the baker's shop has two chains (agents: the supplier's mail, the takings) and its other rules are
// routines, kept by the keeper too; before the person has met the floor (agents.meet) the keeper only holds at a
// sign-in (rule 6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { appendLedger, readPolicy } from "../src/agent/store.ts";
import { heldNow, keep, list, loadAgents, lookInFlight, make, meet, mode, nextOf, rename, rest, run, signedIn, stateOf, undo, week } from "../src/agent/agents.ts";
import type { LedgerLine, Rule, Ticket } from "../src/agent/harness.ts";
import { BAKER_CHAINS, FREELANCER_RULES, make as home0 } from "./agents-fixtures.ts";

const H = 3_600_000, D = 24 * H;
const T0 = new Date(2026, 10, 10, 12, 0).getTime();   // Tue 10 Nov 2026, noon, local
const signInLine = (rule: string, at: number): LedgerLine => ({ at, rule, read: "Gmail asked for a sign-in", made: "nothing (blocked)", held: 'would have shown "Sign in to Gmail"' });
const nothing = (rule: string, at: number): LedgerLine => ({ at, rule, read: "the clock, 09:00", made: "nothing", held: "ignored: Jev 0.41 < 0.45" });

function setup(now = T0) {
  const home = home0(BAKER_CHAINS);
  const clock = { now };
  const a = new Agents({ home, now: () => clock.now, ask: async () => null, turn: async () => ({ report: "ready", said: "done", thread: null, ms: 0 }) });
  return { home, a, clock, shop: join(home, "shop"), family: join(home, "family") };
}
const R = (id: string, mode: Rule["mode"] = "watch", sentence = "19:30 a thing"): Rule => ({ id, sentence, source: "clock", mode, rung: "read" });
const ticket = (o: Partial<Ticket>): Ticket => ({ id: "t-20261110-aaaa", folder: "x", rule: "clock-1", thread: "x", state: "open", mandate: { rung: "read", mode: "watch", policyVersion: "v" }, subscriptions: [], triggers: [], runs: [], ledger: [], opened: 0, ...o });

test("state: stuck > needs > working > resting > off", () => {
  const stuck = { rule: R("mail-1"), runs: [signInLine("mail-1", T0)], next: null };
  const card = ticket({ state: "waiting", needs: { ticketId: "t-20261110-aaaa", title: "Reply to the mill", line: "", choices: ["open the draft"] }, triggers: [{ id: "c", at: 1, source: "mail", kind: "new", data: {}, thread: "m" }] });
  const work = ticket({ id: "t-20261110-bbbb", state: "open", triggers: [{ id: "c", at: T0, source: "clock", kind: "time", data: {}, thread: "c" }] });
  const resting = { rule: R("clock-1"), runs: [], next: T0 + H };
  assert.equal(stateOf({ rules: [stuck, resting], tickets: [card, work] }).state, "stuck");
  assert.deepEqual(stateOf({ rules: [stuck], tickets: [] }).stuck, { site: "gmail", label: "sign in to Gmail" });
  const n = stateOf({ rules: [resting], tickets: [card, work] });
  assert.equal(n.state, "needs");
  assert.equal(n.needs?.title, "Reply to the mill");
  assert.equal(stateOf({ rules: [resting], tickets: [work] }).state, "working");
  const r = stateOf({ rules: [resting], tickets: [] });
  assert.equal(r.state, "resting");
  assert.equal(r.next, new Date(T0 + H).toISOString());
  assert.equal(stateOf({ rules: [{ rule: R("clock-1", "off"), runs: [], next: null }], tickets: [] }).state, "off");
  assert.equal(stateOf({ rules: [{ rule: R("clock-1", "off"), runs: [], next: null }], tickets: [work] }).state, "working", "a run in flight still shows");
  // a failed look does not hide the sign-in before it; a later run that got through clears it
  const failed: LedgerLine = { at: T0 + 2, rule: "mail-1", read: "Gmail", made: "nothing", held: "the look failed: page.goto: net::ERR_FAILED" };
  assert.equal(stateOf({ rules: [{ ...stuck, runs: [failed, signInLine("mail-1", T0)] }], tickets: [] }).state, "stuck");
  const ok: LedgerLine = { at: T0 + 3, rule: "mail-1", read: "Gmail, 3 new", made: "supplier.md", held: "nothing" };
  assert.equal(stateOf({ rules: [{ ...stuck, runs: [ok, signInLine("mail-1", T0)] }], tickets: [] }).state, "resting");
  // rested by hand (or idle): its old sign-in stops do not make it stuck; held for the sign-in, it is
  const asked = { folder: "x", rule: "mail-1", why: "asked" as const, since: "", until: "woken" };
  assert.equal(stateOf({ rules: [{ ...stuck, held: asked }], tickets: [] }).state, "resting");
  assert.equal(stateOf({ rules: [{ ...stuck, held: { ...asked, why: "stuck" as const, site: "Gmail", until: "signed-in" } }], tickets: [] }).state, "stuck");
});

test("next: a rule on class days takes its folder's days", () => {
  const r: Rule = { id: "clock-1", sentence: "on each class day at 08:00 ready the room", source: "clock", mode: "watch", rung: "read" };
  // class on Thursday only: at Tue noon the next is Thu 12 Nov 08:00
  assert.equal(nextOf(r, T0, [4]), new Date(2026, 10, 12, 8, 0).getTime());
});

test("week: seven days ending today, runs, made, blocked", () => {
  const w = week([signInLine("mail-1", T0), nothing("clock-3", T0 - D), { at: T0 - 2 * D, rule: "clock-1", read: "x", made: "made/today.md", held: "nothing" }, nothing("clock-3", T0 - 9 * D)], T0);
  assert.equal(w.length, 7);
  assert.equal(w[6].day, "2026-11-10");
  assert.deepEqual(w.slice(4).map((d) => [d.runs, d.made, d.blocked]), [[1, 1, 0], [1, 0, 0], [1, 0, 1]]);
});

test("the keeper waits for agents.json: nothing is held before the Agents view first lists", () => {
  const { home, shop } = setup();
  for (let i = 0; i < 4; i++) appendLedger(shop, signInLine("mail-1", T0 - i * H));
  assert.equal(keep(home, T0), false);
  assert.equal(existsSync(join(home, "agents.json")), false);
});

test("keeper: 3 sign-in stops in a row hold the rule; undo lets it go; 3 more hold it again; a sign-in wakes it", () => {
  const { home, a, shop } = setup();
  assert.deepEqual(list(a).agents.map((x) => x.id), ["messages", "summary"], "the shop's two chains");
  appendLedger(shop, signInLine("mail-1", T0 - 3 * H));
  appendLedger(shop, signInLine("mail-1", T0 - 2 * H));
  assert.equal(keep(home, T0), false, "two are not three");
  appendLedger(shop, signInLine("mail-1", T0 - H));
  assert.equal(keep(home, T0), true);
  let f = loadAgents(home)!;
  assert.deepEqual(f.held.map((h) => [h.folder, h.rule, h.why, h.site, h.until]), [["shop", "mail-1", "stuck", "Gmail", "signed-in"]]);
  const held = f.changes.at(-1)!;
  assert.equal(held.kind, "held");
  assert.equal(held.agent, "messages");
  assert.equal(held.cause, "sign-in");
  assert.ok(heldNow(home, T0).has("shop#mail-1"));
  // not met yet: the hold is the one intro sentence, with its undo (rule 6)
  assert.deepEqual(list(a).intro, { ids: [held.id], agents: 1, sites: ["Gmail"] });
  const view = list(a).agents.find((x) => x.id === "messages")!;
  assert.equal(view.state, "stuck");
  assert.deepEqual(view.stuck, { site: "gmail", label: "sign in to Gmail" });
  assert.equal(view.rules.find((r) => r.rule === "mail-1")!.held?.why, "stuck");
  // undo: let go, and the three old stops do not hold it again at once
  assert.equal(undo(a, held.id).ok, true);
  assert.equal(undo(a, held.id).ok, false, "once");
  assert.equal(heldNow(home, T0).size, 0);
  assert.equal(keep(home, T0 + 1), false);
  // three new ones do
  for (let i = 1; i <= 3; i++) appendLedger(shop, signInLine("mail-1", T0 + i * H));
  assert.equal(keep(home, T0 + 4 * H), true);
  assert.equal(heldNow(home, T0 + 4 * H).size, 1);
  // a sign-in to that site in that folder wakes it; another folder's or another site's does not
  assert.equal(signedIn(home, "family", "gmail", T0 + 5 * H), 0);
  assert.equal(signedIn(home, "shop", "outlook", T0 + 5 * H), 0);
  assert.equal(signedIn(home, "shop", "gmail", T0 + 5 * H), 1);
  f = loadAgents(home)!;
  assert.equal(f.held.length, 0);
  assert.equal(f.changes.at(-1)!.kind, "woke");
  assert.equal(keep(home, T0 + 5 * H + 1), false, "woken: the old stops count no more");
});

test("keeper: a held rule whose later run got through wakes by itself", () => {
  const { home, a, shop } = setup();
  list(a);
  for (let i = 3; i >= 1; i--) appendLedger(shop, signInLine("mail-1", T0 - i * H));
  keep(home, T0);
  assert.equal(heldNow(home, T0).size, 1);
  appendLedger(shop, { at: T0 + H, rule: "mail-1", read: "Gmail, 2 new", made: "supplier.md", held: "nothing" });
  assert.equal(keep(home, T0 + 2 * H), true);
  assert.equal(heldNow(home, T0 + 2 * H).size, 0);
  assert.match(loadAgents(home)!.changes.at(-1)!.line, /got through/);
});

test("keeper: a clock rule that made nothing for 7 days rests 7 days, then wakes; a routine too; a watcher never rests; nothing rests before the floor is met", () => {
  const { home, a, shop, family } = setup();
  list(a);
  for (let d = 7; d >= 1; d--) {
    appendLedger(shop, nothing("clock-2", T0 - d * D));
    appendLedger(family, nothing("clock-1", T0 - d * D));
    appendLedger(shop, { at: T0 - d * D, rule: "folder-1", read: "invoices/, 4 files", made: "nothing", held: "no new file" });
  }
  assert.equal(keep(home, T0), false, "not met yet: nothing rests unseen (rule 6)");
  assert.equal(loadAgents(home)!.held.length, 0);
  meet(a);
  assert.equal(keep(home, T0), true);
  const f = loadAgents(home)!;
  assert.deepEqual(f.held.map((h) => [h.folder, h.rule, h.why]), [["shop", "clock-2", "idle"], ["family", "clock-1", "idle"]], "the folder rule (a watcher) is not rested");
  const [takings, meals] = f.changes.slice(-2);
  assert.deepEqual([takings.kind, takings.agent, takings.cause], ["rested", "summary", "idle"]);
  assert.deepEqual([meals.kind, meals.agent], ["rested", ""], "a routine is kept with no agent");
  assert.match(meals.line, /^Family made nothing/, "the routine's line names its place");
  assert.equal(heldNow(home, T0 + 6 * D).size, 2);
  assert.equal(keep(home, T0 + 7 * D + 1), true);
  assert.equal(loadAgents(home)!.held.length, 0);
  assert.match(loadAgents(home)!.changes.at(-1)!.line, /rest is over/);
});

test("keeper: six days of nothing is not seven", () => {
  const { home, a, shop } = setup();
  list(a);
  meet(a);
  for (let d = 6; d >= 1; d--) appendLedger(shop, nothing("clock-2", T0 - d * D));
  assert.equal(keep(home, T0), false);
});

test("the clock skips a held rule and runs the rest; policy.md is not touched", async () => {
  const home = mkdtempSync(join(tmpdir(), "sol-agents-tick-"));
  const f = join(home, "studio", "kiln");
  mkdirSync(f, { recursive: true });
  // a chain (the firing log into log.md, then the notes from log.md) is one agent; the glaze list a routine
  const POLICY = "- [watch] clock: 19:30 the firing log from kiln.csv into log.md\n- [watch] clock: 19:30 the notes from log.md into a list in tomorrow.md\n- [watch] clock: 19:30 the glaze list from glazes.md into glazes-today.md\n";
  writeFileSync(join(f, "policy.md"), POLICY);
  const ran: string[] = [];
  const at = new Date(2026, 10, 10, 19, 31).getTime();
  const a = new Agents({ home, now: () => at, ask: async () => null, turn: async (_f, r) => { ran.push(r.id); return { report: "ready", said: "ok", thread: null, ms: 0 }; } });
  const l = list(a);
  const first = l.agents.find((x) => x.rules.some((r) => r.rule === "clock-1"))!;
  assert.deepEqual(first.rules.map((r) => r.rule), ["clock-1", "clock-2"]);
  assert.equal(rest(a, first.id, true).ok, true);
  await a.tick(new Date(at));
  assert.deepEqual(ran, ["clock-3"]);
  assert.equal(readFileSync(join(f, "policy.md"), "utf8"), POLICY);
});

test("agents.make: a line under 4 words is refused; a line is a clock rule and an agent; undo takes both back", () => {
  const { a, family } = setup();
  list(a);
  assert.deepEqual(make(a, "plan the meals", "family", "07:00"), { ok: false, why: "a sticky is enough" });
  assert.equal(make(a, "read the school newsletter again", "family", "7am").ok, false);
  assert.equal(make(a, "read the school newsletter again", "nowhere", "07:00").ok, false);
  const before = readFileSync(join(family, "policy.md"), "utf8");
  const r = make(a, "read the school newsletter again", "family", "07:00") as { ok: true; agent: { id: string; rules: { rule: string }[]; born: { how: string } }; change: { id: string } };
  assert.equal(r.ok, true);
  assert.equal(r.agent.born.how, "typed");
  const rule = readPolicy(family).rules.find((x) => x.id === r.agent.rules[0].rule)!;
  assert.equal(rule.sentence, "07:00 read the school newsletter again");
  assert.equal(rule.mode, "watch");
  assert.match(readFileSync(join(family, "policy.md"), "utf8"), /^- \[watch\] clock: 07:00 read the school newsletter again$/m);
  assert.ok(list(a).agents.some((x) => x.id === r.agent.id));
  assert.equal(undo(a, r.change.id).ok, true);
  assert.equal(readFileSync(join(family, "policy.md"), "utf8").trimEnd(), before.trimEnd());
  assert.ok(!list(a).agents.some((x) => x.id === r.agent.id));
});

function freelancer() {
  const home = home0(FREELANCER_RULES);
  const a = new Agents({ home, now: () => T0, ask: async () => null, turn: async () => ({ report: "ready", said: "done", thread: null, ms: 0 }) });
  return { home, a };
}

test("agents.mode writes each of its places' rules into policy.md, one change line; undo puts them back", () => {
  const { home, a } = freelancer();
  list(a);
  const r = mode(a, "messages", "off") as { ok: boolean; change: { id: string; kind: string } };
  assert.equal(r.ok, true);
  assert.equal(r.change.kind, "mode");
  assert.deepEqual(["clients/acme", "clients/northwind"].map((f) => readPolicy(join(home, f)).rules.find((x) => x.id === "clock-1")!.mode), ["off", "off"]);
  assert.equal(readPolicy(join(home, "clients/acme")).rules.find((x) => x.id === "clock-2")!.mode, "watch", "another agent's rule untouched");
  assert.equal(readPolicy(join(home, "clients/acme")).rules.find((x) => x.id === "clock-1")!.rung, "draft", "the rung kept");
  assert.equal(list(a).agents.find((x) => x.id === "messages")!.state, "off");
  assert.equal(mode(a, "messages", "loud" as never).ok, false);
  undo(a, r.change.id);
  assert.deepEqual(["clients/acme", "clients/northwind"].map((f) => readPolicy(join(home, f)).rules.find((x) => x.id === "clock-1")!.mode), ["watch", "watch"]);
});

test("agents.run: each place's rule not off, one after another, the tickets back; all off is refused", async () => {
  const { a } = freelancer();
  list(a);
  a.setRule("clients/northwind", "clock-2", "off");
  const ran: string[] = [];
  a.runRule = async (f: string, rule: string) => { ran.push(`${f}#${rule}`); return { ok: true, ticket: null, line: "ran" }; };
  const r = (await run(a, "invoices")) as { ok: boolean; tickets: unknown[]; lines: string[] };
  assert.equal(r.ok, true);
  assert.deepEqual(ran, ["clients/acme#clock-2"], "the off one is skipped");
  mode(a, "invoices", "off");
  assert.deepEqual(await run(a, "invoices"), { ok: false, why: "Invoices is off: set it to watch or do first" });
  assert.equal((await run(a, "nobody")).ok, false);
});

test("agents.rest and wake, rename, and their undo", () => {
  const { home, a } = freelancer();
  list(a);
  const r = rest(a, "messages", true) as { change: { id: string } };
  assert.equal(heldNow(home).size, 2);
  const w = rest(a, "messages", false) as { change: { id: string } };
  assert.equal(heldNow(home).size, 0);
  undo(a, w.change.id);
  assert.equal(heldNow(home).size, 2);
  undo(a, r.change.id);
  assert.equal(heldNow(home).size, 0);
  const n = rename(a, "messages", "Friday update") as { change: { id: string } };
  assert.equal(list(a).agents.find((x) => x.id === "messages")!.name, "Friday update");
  undo(a, n.change.id);
  assert.equal(list(a).agents.find((x) => x.id === "messages")!.name, "Messages");
  assert.equal(rename(a, "nobody", "x").ok, false);
});

test("agents.list: the helper rule and the routines apart, the grouping one change line, every agent its week and its places", () => {
  const { a } = freelancer();
  const l = list(a);
  assert.deepEqual(l.folderRules.map((x) => [`${x.folder}#${x.rule}`, !!x.helper]), [["clients/acme#stickies-1", true], ["clients/bloom#folder-1", false]], "the stickies helper, and Bloom's one rule (a routine)");
  assert.equal(l.changes.length, 1);
  assert.match(l.changes[0].line, /grouped 4 rules from 3 folders into 2 agents, one per job/);
  assert.ok(l.agents.every((x) => x.week.length === 7 && x.rules.length > 0));
  assert.deepEqual(l.agents[0].places.map((p: { place: string }) => p.place), ["clients/acme", "clients/northwind"]);
  assert.deepEqual(list(a).agents.map((x) => x.id), l.agents.map((x) => x.id), "agents.json is read, not made again");
});

test("the wire: agents.* answers through the part, the new messages and refusals included", async () => {
  const { startAgents } = await import("../src/agent/index.ts");
  const { answer } = await import("../src/parts/agents.ts");
  const home = home0(FREELANCER_RULES);
  const a = startAgents({ home, ask: async () => null }, false);
  // the first list never waits on Jev: no agents yet and looking, the first grouping in the background
  const l0 = (await answer({ type: "agents.list" })) as { ok: boolean; agents: unknown[]; looking: boolean };
  assert.deepEqual([l0.ok, l0.agents.length, l0.looking], [true, 0, true]);
  await lookInFlight(a);
  const l = (await answer({ type: "agents.list" })) as { ok: boolean; agents: { id: string; state: string }[]; offers: number };
  assert.equal(l.ok, true);
  assert.deepEqual(l.agents.map((x) => x.id), ["messages", "invoices"]);
  assert.equal(l.offers, 0);
  // agents.meet: the floor seen, once; a second meet keeps the first time
  const m = (await answer({ type: "agents.meet" })) as { ok: boolean; met: string };
  assert.equal(m.ok, true);
  assert.equal(typeof m.met, "string");
  assert.deepEqual(await answer({ type: "agents.meet" }), { ok: true, met: m.met });
  assert.deepEqual(await answer({ type: "agents.make", line: "two words", folder: "clients/acme", time: "07:00" }), { ok: false, why: "a sticky is enough" });
  const md = (await answer({ type: "agents.mode", id: "messages", mode: "do" })) as { ok: boolean; change: { id: string } };
  assert.equal(md.ok, true);
  assert.equal(readPolicy(join(home, "clients/acme")).rules.find((r) => r.id === "clock-1")!.mode, "do");
  // agents.undo with several ids: one cause's changes together
  assert.deepEqual(await answer({ type: "agents.undo", changeIds: [md.change.id, "c-nope"] }), { ok: true, undone: 1 });
  assert.equal(readPolicy(join(home, "clients/acme")).rules.find((r) => r.id === "clock-1")!.mode, "watch");
  assert.equal(((await answer({ type: "agents.undo", changeIds: [md.change.id] })) as { ok: boolean }).ok, false, "already undone");
  assert.deepEqual(await answer({ type: "agents.signin", id: "messages" }), { ok: false, why: "it is not stuck at a sign-in" });
  assert.deepEqual(await answer({ type: "agents.offers" }), { ok: true, offers: [] });
  assert.deepEqual(await answer({ type: "agents.offer", id: "o-x", answer: "keep" }), { ok: false, why: "no offer o-x" });
  assert.equal(((await answer({ type: "agents.scope", id: "messages", add: "clients/bloom" })) as { ok: boolean }).ok, true);
  assert.equal(readPolicy(join(home, "clients/bloom")).rules.length, 2, "a grouped job written into the new place in its own words");
  assert.match(readPolicy(join(home, "clients/bloom")).rules[1].sentence, /for Bloom$/);
  assert.deepEqual(await answer({ type: "agents.fix", id: "messages", place: "clients/acme", before: "Regards", after: "Best" }), { ok: true, fix: (await import("../src/agent/agents.ts")).loadAgents(home)!.agents[0].fixes![0].id, ask: "Always like this?" });
  assert.deepEqual(await answer({ type: "agents.change", id: "messages", line: "" }), { ok: false, why: "say the change in a line" });
  assert.equal(((await answer({ type: "agents.nope" })) as { ok: boolean }).ok, false);
  startAgents({ home: mkdtempSync(join(tmpdir(), "sol-agents-empty-")), ask: async () => null }, false)?.stop();
});

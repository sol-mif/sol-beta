// An orchestration session routes to tickets (one.ts, build.tickets; until #1209 only the kept anchor did): off, it is
// exactly an orchestration session; on, it is told it routes and does no work, it is given the six ticket tools (each
// goes through the Door with its own id), start_session and send_message are refused it, the sessions that are
// tickets' executors never report through it, and its renewal carries the tickets' summary and re-points what the old
// copy heard. The Door here is a fake that records its calls.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-one-tickets-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const { toolsOnlyFor } = await import("../src/work/tools.ts");
const { mark, workState } = await import("../src/work/state.ts");
import type { Door, Ticket, OpenIn, Mandate } from "../src/work/ticketTypes.ts";

const HAND = "## Carried\n- he wants Sol quieter, for his evenings\n- the word is \"heron-41\"\n## Dropped\n- the hellos";
const SUMMARY = "#1 [working] the side row: its test half written\n(2 closed)";
const ticket = (n: number, o: Partial<Ticket> = {}): Ticket => ({ id: `t${n}`.padEnd(8, "0"), n, title: "the side row", ask: "make the side row quieter",
  mandate: { may: [], mayNot: [], until: "a draft PR", free: "ask" }, state: "working", summary: "", log: [], subs: [], past: [], at: 1, updatedAt: 1, ...o });
let calls: [string, ...unknown[]][] = [];
const fake: Door = {
  open: async (from: string, a: OpenIn) => { calls.push(["open", from, a]); return ticket(3); },
  send: async (from: string, t: string, words: string, o?: { reopen?: boolean }) => { calls.push(["send", from, t, words, o]); return ticket(2); },
  close: async (from: string, t: string, state: "done" | "dropped", summary?: string) => { calls.push(["close", from, t, state, summary]); return ticket(2, { state }); },
  mandate: async (from: string, t: string, patch: Partial<Mandate>) => { calls.push(["mandate", from, t, patch]); return ticket(2); },
  replace: async (t: string) => { calls.push(["replace", t]); return ticket(2); },
  summary: (max?: number) => { calls.push(["summary", max]); return SUMMARY; },
  read: (t: string, max?: number) => { calls.push(["read", t, max]); return `#2 the side row\nask: make the side row quieter`; },
  find: (q: string) => { calls.push(["find", q]); return []; },
  repoint: (from: string, to: string) => { calls.push(["repoint", from, to]); return 1; },
};
let said: { to: string; text: string; fresh?: boolean }[] = [], door: Door | undefined = fake, executors = new Set<string>();
const wire = () => one.setOneDeps({
  say: async (to, text, fresh) => { said.push({ to, text, ...(fresh ? { fresh: true } : {}) }); },
  run: () => undefined,
  sessions: async () => [{ id: "o-1", title: "the night's work", cwd: dir, updatedAt: 1 }, { id: "kid-1", title: "the checks", cwd: dir, updatedAt: 1 }, { id: "exec-1", title: "ticket #1's session", cwd: dir, updatedAt: 1 }],
  lastWords: async () => HAND,
  tell: () => {},
  name: async () => {},
  carry: async () => {},
  get tickets() { return door; },
  isExecutor: (id) => executors.has(id),
});
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const names = (id: string) => toolsOnlyFor(id).map((t: { name: string }) => t.name).sort();
const run = (id: string, name: string, args: object) => toolsOnlyFor(id).find((t: { name: string }) => t.name === name)!.run(args);
const TICKET_TOOLS = ["ticket_close", "ticket_mandate", "ticket_open", "ticket_read", "ticket_send", "tickets"];

beforeEach(() => {
  said = []; calls = []; door = fake; executors = new Set();
  rmSync(join(dir, "orch.json"), { force: true });
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null, parent: null, archived: false, pinned: false });
  one._reload(); wire();
});
const id = "o-1";

test("switch off: an orchestration session's promote and tools are exactly an orchestration session's", async () => {
  one.setTickets(false);
  await one.promote(id);
  assert.equal(said[0].text, one.PROMOTED);
  assert.deepEqual(names(id), ["one_sessions", "stop_session"]);
  assert.equal(one.isRouter(id), false);
  one.setTickets(false);
  assert.equal(said.length, 1, "off again: nothing said");
  assert.equal(calls.length, 0, "the Door is never touched");
});

test("switch on: the promote says it routes, and the six ticket tools", async () => {
  one.setTickets(true);
  await one.promote(id);
  const t = said[0].text;
  assert.match(t, /^<promoted>\nYou are now an orchestration session/);
  assert.ok(t.length < 2600, `under 2600 letters: ${t.length}`);
  assert.match(t, /Tickets are on: You do not do the work yourself/);
  assert.match(t, /ticket_open[\s\S]*ticket_send|ticket_send[\s\S]*ticket_open/);
  assert.match(t, /a merge, a push, a deletion, money, words to other people/);
  assert.match(t, /<ticket reports>/);
  assert.deepEqual(names(id), ["one_sessions", "stop_session", ...TICKET_TOOLS].sort());
  assert.equal(one.isRouter(id), true);
  assert.equal(one.isRouter("kid-1"), false, "a normal session never routes");
  assert.equal(one.kept().tickets, true);
});

test("each ticket tool calls the Door with the orchestration session's id and answers in short words", async () => {
  one.setTickets(true);
  await one.promote(id);
  assert.equal(await run(id, "tickets", {}), SUMMARY);
  const opened = await run(id, "ticket_open", { title: "the side row", ask: "make the side row quieter, and no merge", may: ["change the side's files"], mayNot: ["merge"], until: "a draft PR", where: "/src/sol", free: "edits" });
  assert.equal(opened, "opened #3: its session is at work; its reports come back here");
  assert.deepEqual(calls.find((c) => c[0] === "open"), ["open", id, { title: "the side row", ask: "make the side row quieter, and no merge",
    mandate: { may: ["change the side's files"], mayNot: ["merge"], until: "a draft PR", where: "/src/sol", free: "edits" }, by: "orchestrator", sub: id }]);
  calls = [];
  await run(id, "ticket_open", { title: "a quick one", ask: "look at the log" });
  assert.deepEqual(calls[0], ["open", id, { title: "a quick one", ask: "look at the log", by: "orchestrator", sub: id }], "no mandate given: none passed, the Door's defaults hold");
  assert.equal(await run(id, "ticket_send", { ticket: "2", words: "also the hover, the one he showed" }), "sent to #2: its session has it");
  assert.deepEqual(calls[1], ["send", id, "2", "also the hover, the one he showed", undefined]);
  await run(id, "ticket_send", { ticket: "#2", words: "again", reopen: true });
  assert.deepEqual(calls[2], ["send", id, "#2", "again", { reopen: true }]);
  assert.match(await run(id, "ticket_read", { ticket: "2" }), /^#2 the side row/);
  assert.deepEqual(calls[3], ["read", "2", 3000]);
  assert.equal(await run(id, "ticket_mandate", { ticket: "2", until: "a merge, he said so" }), "#2's mandate changed; its session is told");
  assert.deepEqual(calls[4], ["mandate", id, "2", { until: "a merge, he said so" }]);
  assert.match(await run(id, "ticket_mandate", { ticket: "2" }), /nothing to change/);
  assert.equal(calls.length, 5, "an empty mandate change never reaches the Door");
  assert.equal(await run(id, "ticket_close", { ticket: "2", state: "dropped", summary: "he no longer wants it" }), "#2 closed: dropped");
  assert.deepEqual(calls[5], ["close", id, "2", "dropped", "he no longer wants it"]);
  for (const n of TICKET_TOOLS) assert.ok((await run(id, n, { ticket: "2", title: "x", ask: "y", words: "z", state: "done", may: ["a"] })).length < 400, `${n}: short words`);
});

test("no Door wired yet: the tools say so and nothing else breaks", async () => {
  door = undefined;
  one.setTickets(true);
  await one.promote(id);
  await assert.rejects(run(id, "ticket_open", { title: "x", ask: "y" }), /tickets are not wired/);
  await assert.rejects(run(id, "tickets", {}), /tickets are not wired/);
});

test("flipping the switch on an orchestration session re-gives its tools and tells it, without a new session", async () => {
  await one.promote(id);
  one.setTickets(true);
  await flush();
  assert.deepEqual(one.orchestrators(), [id]);
  assert.deepEqual(names(id), ["one_sessions", "stop_session", ...TICKET_TOOLS].sort());
  assert.equal(said.length, 2);
  assert.ok(said[1].to === id && !said[1].fresh);
  assert.match(said[1].text, /^<tickets on>\n[\s\S]*ticket_open/);
  one.setTickets(true); await flush();
  assert.equal(said.length, 2, "the same again: told once");
  one.setTickets(false); await flush();
  assert.deepEqual(names(id), ["one_sessions", "stop_session"]);
  assert.match(said[2].text, /^<tickets off>\n[\s\S]*start_session/);
  // the switch is kept across a restart, and a demote takes the ticket tools with the rest
  one.setTickets(true); await flush();
  one._reload(); wire(); one.wakeOrchestrators();
  assert.equal(one.ticketsOn(), true);
  assert.deepEqual(names(id), ["one_sessions", "stop_session", ...TICKET_TOOLS].sort());
  await one.demote(id);
  assert.deepEqual(names(id), []);
});

test("an executor's ended turn is not reported through hears(); a session under the orchestration session still is", async () => {
  one.setTickets(true);
  await one.promote(id); said = [];
  mark("kid-1", { under: id }); mark("exec-1", { under: id }); executors.add("exec-1");
  one.hears({ type: "work.run", sessionId: "exec-1", ended: true });
  await flush(2700);
  assert.equal(said.length, 0, "only the executor ended: no report at all");
  one.hears({ type: "work.run", sessionId: "exec-1", ended: true });
  one.hears({ type: "work.run", sessionId: "kid-1", ended: true });
  await flush(2700);
  const r = said[said.length - 1];
  assert.equal(r.to, id);
  assert.match(r.text, /<reports from sessions under you>\n- the checks \(kid-1\)/);
  assert.doesNotMatch(r.text, /exec-1/);
});

test("renewal with tickets on: the handover asks only what tickets do not hold; the fresh copy has the summary and hears the reports", async () => {
  one.setTickets(true);
  await one.promote(id); said = [];
  one.hears({ type: "work.run", sessionId: id, ended: true, context: 700, window: 1000 } as never); await flush();
  const ask = said[0].text;
  assert.match(ask, /^<renewal>/);
  assert.match(ask, /the tickets do not hold/);
  assert.match(ask, /what the person wants overall and why/);
  assert.match(ask, /not yet put in a ticket/);
  assert.doesNotMatch(ask, /your own work in progress|each goal still open|each session that runs/);
  one.hears({ type: "work.run", sessionId: id, ended: true, context: 720, window: 1000 } as never); await flush();
  const fresh = one.orchestrators()[0];
  assert.notEqual(fresh, id);
  const first = said[said.length - 1];
  assert.ok(first.fresh && first.to === fresh);
  assert.match(first.text, /Tickets are on: You do not do the work yourself/, "the fresh copy routes too");
  assert.match(first.text, /renewal 1 of this session[\s\S]*heron-41/);
  assert.ok(first.text.includes(`<tickets>\n${SUMMARY}\n</tickets>`));
  assert.deepEqual(calls.filter((c) => c[0] === "repoint"), [["repoint", id, fresh]]);
  assert.deepEqual(names(fresh), ["one_sessions", "stop_session", ...TICKET_TOOLS].sort());
  assert.deepEqual(names(id), []);
});

test("renewal with tickets off: the handover and the fresh copy's words are an orchestration session's, no <tickets>; what it heard is re-pointed all the same", async () => {
  await one.promote(id); said = [];
  one.hears({ type: "work.run", sessionId: id, ended: true, context: 700, window: 1000 } as never); await flush();
  assert.match(said[0].text, /your own work in progress/);
  one.hears({ type: "work.run", sessionId: id, ended: true, context: 720, window: 1000 } as never); await flush();
  const first = said[said.length - 1];
  assert.doesNotMatch(first.text, /<tickets>|Tickets are on/);
  assert.ok(!calls.some((c) => c[0] === "summary"));
  assert.equal(calls.filter((c) => c[0] === "repoint").length, 1, "tickets opened while it was on still reach the fresh copy");
});

test("the wire refuses a router its own start_session, send_message and hand_off", () => {
  const wire = readFileSync(new URL("../src/work/wire.ts", import.meta.url), "utf8");
  assert.equal((wire.match(/if \(one\.isRouter\(from\)\) return "refused: with tickets on/g) ?? []).length, 3);
});

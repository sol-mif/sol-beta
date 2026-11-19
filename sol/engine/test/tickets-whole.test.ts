// Tickets, the whole of it (the superagent model, joined 2026-11-12): the real store (tickets.ts), the real executors
// (executor.ts) and a real orchestration session with tickets on (one.ts; until #1209 the kept orch) together, wired
// as wire.ts wires them; only the engine's hands are fakes (say, run, exists, lastWords, name, tell). Offline. The tests
// run in order and tell one story on one ticket: the orchestration session opens it, its executor works and reports,
// the person's words reach it, its talk fills and a fresh copy takes over, the engine restarts, the orchestration
// session renews, and thirty tickets later its view of them is still short.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-tickets-whole-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const ex = await import("../src/work/executor.ts");
const tk = await import("../src/work/tickets.ts");
const { toolsOnlyFor } = await import("../src/work/tools.ts");
const { mark, workState } = await import("../src/work/state.ts");
import type { Ticket } from "../src/work/ticketTypes.ts";

const REPO = join(dir, "repo");   // the person's project: a repo, so the executor works in a side copy of it
mkdirSync(REPO, { recursive: true });
const ASK = "The login page lets an empty password through. Fix the check, and the reset link while you are there; a draft PR, never a merge.";
const HAND = "## Carried\n- he wants the login fixed before Friday\n## Dropped\n- the hellos";

// ---- the engine's hands
type Said = { to: string; text: string; fresh?: { cwd: string; worktree?: boolean }; free?: string };
let said: Said[] = [], told: any[] = [], named: [string, string][] = [];
const runs = new Map<string, { cwd: string; working: boolean; busy: boolean; perms: { size: number }; tasks: unknown[]; items: { list: never[] }; stop: () => void }>();
const known = new Set<string>();             // sessions whose transcript is there (resumable after a restart)
const words = new Map<string, string>();     // each session's last words
let sides = 0;
const say = async (to: string, text: string, fresh?: { cwd: string; worktree?: boolean }, how?: { free?: "ask" | "edits" }) => {
  said.push({ to, text, ...(fresh ? { fresh } : {}), ...(how?.free ? { free: how.free } : {}) });
  if (fresh) {   // the engine makes the session; a side copy of a repo lands at a path of its own
    const cwd = fresh.worktree ? join(REPO, ".claude", "worktrees", `side-${++sides}`) : fresh.cwd;
    runs.set(to, { cwd, working: false, busy: false, perms: { size: 0 }, tasks: [], items: { list: [] }, stop: () => {} });
    known.add(to);
  }
};
const wireAll = () => {
  one.setOneDeps({
    say, run: (id) => runs.get(id) as never,
    sessions: async () => [], lastWords: async (id) => words.get(id) ?? "",
    tell: (m) => told.push(m), name: async (id, title) => { named.push([id, title]); }, carry: async () => {},
    tickets: ex.door, isExecutor: (id) => !!tk.store.ofSession(id),
  });
  ex.setExecDeps({
    store: tk.store, say, run: (id) => runs.get(id) as never,
    exists: async (id) => runs.has(id) || known.has(id), lastWords: async (id) => words.get(id) ?? "",
    isRepo: (d) => d === REPO, cwdOf: async (id) => runs.get(id)?.cwd,
    tell: (m) => told.push(m), name: async (id, title) => { named.push([id, title]); },
    holding: (id) => one.renewing(id),   // as wire.ts
  });
};
/** a run message, to both ears as wire.ts's bus gives it */
const bus = (m: object) => { one.hears(m as never); ex.hears(m as never); };
const ended = (id: string, context?: number, window = 10_000) => bus({ type: "work.run", sessionId: id, ended: true, ...(context !== undefined ? { context, window } : {}) });
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const tool = (id: string, name: string, args: object) => {
  const t = toolsOnlyFor(id).find((x: { name: string }) => x.name === name);
  assert.ok(t, `${id} has ${name}`);
  return t.run(args) as Promise<string>;
};
const onDisk = (id: string): Ticket => JSON.parse(readFileSync(tk.fileOf(id), "utf8"));
const freshTo = () => said.filter((s) => s.fresh && !one.orchestrators().includes(s.to) && !one.kept().orchestrators.some((o) => o.past?.includes(s.to)));
const toOrch = (id: string) => said.filter((s) => s.to === id && !s.fresh);

ex.delays.batch = 30;
wireAll();
let orch = "", exec1 = "", exec2 = "", side1 = "", tid = "";

test("before any ticket: wake() touches nothing and tells nobody; the switch off gives no ticket tool", async () => {
  ex.wake();
  await wait(10);
  assert.equal(told.length, 0);
  assert.equal(existsSync(tk.DIR), false, "no folder made");
  const id = "o-before";
  await one.promote(id);
  assert.equal(said[0].text, one.PROMOTED, "an orchestration session as it is");
  assert.deepEqual(toolsOnlyFor(id).map((t: { name: string }) => t.name).sort(), ["one_sessions", "stop_session"]);
  await one.demote(id); said = []; told = [];
});

test("a. the orchestration session's ticket_open: the ticket on disk with the ask and mandate; one executor, in a side copy of its own, the brief its first words; its tools write the file", async () => {
  one.setTickets(true);
  orch = "o-1";
  await one.promote(orch);
  assert.match(said[0].text, /^<promoted>[\s\S]*Tickets are on: You do not do the work yourself/);
  said = [];
  const answer = await tool(orch, "ticket_open", { title: "the login check", ask: ASK, may: ["change the login code", "open a draft PR"], mayNot: ["merge"], until: "a draft PR, never a merge", where: REPO, free: "edits" });
  assert.equal(answer, "opened #1: its session is at work; its reports come back here");
  const [t] = tk.store.list(); tid = t.id;
  const f = onDisk(tid);
  assert.equal(f.ask, ASK, "the ask verbatim, on disk");
  assert.deepEqual(f.mandate, { may: ["change the login code", "open a draft PR"], mayNot: ["merge"], until: "a draft PR, never a merge", where: REPO, free: "edits" });
  assert.deepEqual(f.subs.map((s) => [s.kind, s.key]), [["session", orch]], "the orchestration session hears it");
  const starts = freshTo();
  assert.equal(starts.length, 1, "exactly one executor session");
  exec1 = starts[0].to;
  assert.deepEqual(starts[0].fresh, { cwd: REPO, worktree: true }, "a side copy of the repo is asked for");
  assert.equal(starts[0].free, "edits", "its mode from the mandate");
  side1 = runs.get(exec1)!.cwd;
  assert.equal(f.executor?.sessionId, exec1);
  assert.equal(f.executor?.cwd, side1, "the ticket records the side copy it really works in, not the repo");
  assert.notEqual(side1, REPO);
  assert.equal(f.state, "working");
  assert.ok(starts[0].text.includes(`<ticket>\n${tk.store.brief(tid).trim()}\n</ticket>`), "the ticket's brief, whole, in its first words");
  assert.match(starts[0].text, /never in .*repo itself/, "it is told it works in a side copy");
  assert.equal(f.log.filter((l) => l.kind === "executor").length, 1, "one log line for the start");
  assert.ok(named.some(([i, n]) => i === exec1 && n === "#1 the login check"));
  assert.equal(await tool(exec1, "ticket_note", { text: "the check is in src/login.ts: it tests length, not emptiness" }), "noted");
  assert.equal(await tool(exec1, "ticket_state", { state: "working", summary: "the check fixed; the reset link next" }), "the ticket is working");
  const g = onDisk(tid);
  assert.ok(g.log.some((l) => l.kind === "note" && l.by === "executor" && l.session === exec1 && /src\/login\.ts/.test(l.text)));
  assert.equal(g.summary, "the check fixed; the reset link next");
});

test("b. the executor's turn ends: the orchestration session gets one <ticket reports> turn under 700 letters, and no child's report", async () => {
  mark(exec1, { parent: orch });   // the worst case: even marked as the orchestration session's child, it reports only through its ticket
  said = [];
  words.set(exec1, "Fixed the empty-password check in src/login.ts and added its test.\n\nThe reset link is next; nothing needed from you.");
  ended(exec1, 2000);
  await wait(2700);   // past the orchestration session's own report batch too
  const got = toOrch(orch);
  assert.equal(got.length, 1, "one turn");
  assert.match(got[0].text, /^<ticket reports>\n- #1 \[open\] the login check: the check fixed; the reset link next/);
  assert.ok(got[0].text.length < 700, `${got[0].text.length} letters`);
  assert.ok(!said.some((s) => /<reports from sessions you started>/.test(s.text)));
  assert.equal(onDisk(tid).executor?.context, 2000, "its fill is kept on the ticket");
});

test("c. the orchestration session's ticket_send to \"#1\": said to the same executor and logged", async () => {
  said = [];
  assert.equal(await tool(orch, "ticket_send", { ticket: "#1", words: "also the reset link's copy says 'pasword'" }), "sent to #1: its session has it");
  assert.equal(said.length, 1);
  assert.equal(said[0].to, exec1);
  assert.ok(!said[0].fresh);
  assert.match(said[0].text, /^<words for your ticket, from the person through the orchestration session>\nalso the reset link's copy says 'pasword'$/);
  const f = onDisk(tid);
  assert.ok(f.log.some((l) => l.kind === "words" && l.by === "orchestrator" && l.text === "also the reset link's copy says 'pasword'"));
  assert.equal(f.state, "working");
  assert.equal(freshTo().length, 0, "no new session");
});

test("d. its fill passes 0.6: closing notes asked; its next ended turn starts copy 2 from the brief in the same folder; past has copy 1; the orchestration session is told nothing of it", async () => {
  await tool(exec1, "ticket_state", { state: "working", summary: "the reset link half done" });
  words.set(exec1, "The reset link's copy is fixed; its redirect is half done.");
  ended(exec1, 6500);
  await wait();
  const notesAsked = said.filter((s) => s.to === exec1 && /^<closing notes>/.test(s.text));
  assert.equal(notesAsked.length, 1, "asked for its closing notes, once");
  assert.ok(onDisk(tid).log.some((l) => l.kind === "executor" && l.text === "asked for its closing notes"));
  assert.equal(toOrch(orch).length, 1, "its report of that turn came; from here on nothing more");
  await tool(exec1, "ticket_note", { text: "half done: the reset redirect in src/reset.ts; next: point it at /login?reset=1 and test it" });
  await tool(exec1, "ticket_state", { state: "working", summary: "the reset redirect half done" });
  words.set(exec1, "written");
  said = [];   // from here: the replacement
  ended(exec1, 6900);
  await wait();
  const starts = freshTo();
  assert.equal(starts.length, 1, "one fresh copy");
  exec2 = starts[0].to;
  assert.deepEqual(starts[0].fresh, { cwd: side1 }, "the same side copy, and no new one");
  const f = onDisk(tid);
  assert.equal(f.executor?.sessionId, exec2);
  assert.equal(f.executor?.n, 2);
  assert.equal(f.executor?.cwd, side1);
  assert.match(starts[0].text, /You are copy 2 of this ticket's executor: the copy before you was replaced because its talk filled/);
  const m = /this is copy (\d+) of its executor; copy (\d+) was replaced because its talk was full, after writing its closing note/.exec(starts[0].text);
  assert.ok(m, "the brief in its first words says which copy, as the store then recorded it");
  assert.deepEqual([Number(m[1]), Number(m[2])], [f.executor!.n, f.past[0] ? 1 : 0]);
  assert.ok(starts[0].text.includes("half done: the reset redirect in src/reset.ts; next: point it at /login?reset=1 and test it"), "copy 1's notes are in its first words");
  assert.ok(starts[0].text.includes("the check is in src/login.ts"));
  assert.equal(f.past.length, 1);
  assert.deepEqual({ ...f.past[0], from: 0, to: 0 }, { sessionId: exec1, from: 0, to: 0, context: 6900, window: 10_000, why: "full", noted: true });
  assert.deepEqual(toolsOnlyFor(exec1), [], "copy 1's tools are taken");
  assert.deepEqual(toolsOnlyFor(exec2).map((t: { name: string }) => t.name).sort(), ["ticket_note", "ticket_read", "ticket_state"]);
  assert.equal(f.log.filter((l) => l.kind === "executor" && /^copy 2 started/.test(l.text)).length, 1, "one line for the start");
  await wait(100);
  assert.equal(toOrch(orch).length, 0, "the orchestration session was told nothing of the replacement");
});

test("e. the engine restarts: ticket, executor and subscription read back from disk; ticket_send reaches the same executor", async () => {
  runs.clear();   // no run outlives the engine; the transcripts stay
  tk.store._reload(); ex._reload(); one._reload(); told = [];
  wireAll(); one.wakeOrchestrators(); ex.wake();
  const t = tk.store.get(1)!;
  assert.equal(t.id, tid);
  assert.equal(t.executor?.sessionId, exec2);
  assert.equal(t.executor?.cwd, side1);
  assert.deepEqual(t.subs.map((s) => s.key), [orch]);
  assert.deepEqual(one.orchestrators(), [orch]);
  assert.deepEqual(toolsOnlyFor(exec2).map((x: { name: string }) => x.name).sort(), ["ticket_note", "ticket_read", "ticket_state"], "its tools again");
  assert.ok(!said.some((s) => s.to === exec2 && !s.fresh), "nothing said to it by the wake");
  said = [];
  await tool(orch, "ticket_send", { ticket: "1", words: "and the button should say Reset" });
  assert.equal(said.length, 1);
  assert.equal(said[0].to, exec2, "the same executor, resumed");
  assert.ok(!said[0].fresh);
});

test("f. the orchestration session renews: the fresh copy's first words hold the tickets' summary; the next report reaches it, not the old one; the executor is left alone", async () => {
  mark(exec2, { parent: orch });   // as in b: the worst case
  words.set(orch, HAND);
  said = []; named = [];
  assert.deepEqual(await one.renew("asked", orch), { asked: true });
  // while it writes its handover, a ticket reports: it waits, and reaches the fresh copy instead
  words.set(exec2, "Halfway through the button copy.");
  ended(exec2, 1400);
  await wait(100);
  assert.equal(said.filter((s) => s.to === orch && /^<ticket reports>/.test(s.text)).length, 0, "nothing said to the orchestration session while it writes its handover");
  ended(orch, 9000, 10_000);
  await wait();
  const fresh = one.orchestrators()[0];
  assert.notEqual(fresh, orch);
  const first = said.find((s) => s.to === fresh && s.fresh)!;
  assert.ok(first, "the fresh copy started");
  assert.ok(first.text.includes(`<tickets>\n${tk.store.summary().trim()}\n</tickets>`), "the tickets' summary in its first words");
  assert.match(first.text, /#1 \[open\] the login check: Halfway through the button copy\./);
  assert.deepEqual(tk.store.get(1)!.subs.map((s) => s.key), [fresh], "re-pointed");
  assert.equal(workState().marks[exec2]?.parent, orch, "the executor is not carried as the orchestration session's child");
  assert.ok(!workState().marks[exec2]?.archived, "nor archived");
  assert.ok(!named.some(([i]) => i === exec2), "nor renamed");
  await wait(1200);
  const held = toOrch(fresh).filter((s) => /^<ticket reports>/.test(s.text));
  assert.equal(held.length, 1, "the report held during the handover reached the fresh copy");
  assert.match(held[0].text, /Halfway through the button copy/);
  assert.equal(said.filter((s) => s.to === orch && /^<ticket reports>/.test(s.text)).length, 0, "and never the old one");
  said = [];
  words.set(exec2, "The button says Reset now. The redirect is done and tested.");
  await tool(exec2, "ticket_state", { state: "waiting", summary: "all three done: a draft PR?", waitsOn: "may I open the draft PR now?" });
  ended(exec2, 1500);
  await wait(200);
  assert.equal(toOrch(orch).length, 0, "the old copy hears nothing");
  const got = toOrch(fresh);
  assert.equal(got.length, 1);
  assert.match(got[0].text, /^<ticket reports>\n- #1 \[waiting\] the login check: all three done: a draft PR\?\n  waits on: may I open the draft PR now\?/);
  assert.ok(got[0].text.length < 700, `${got[0].text.length} letters`);
  orch = fresh;
});

test("f2. a report batched before the orchestration session renewed goes to the fresh copy", async () => {
  // a ticket ends a turn; before its batch goes out the orchestration session's subscriptions move (a renewal): the line follows them
  const old = orch;
  said = [];
  words.set(exec2, "Still waiting on the PR answer.");
  ended(exec2, 1600);
  await wait(5);
  tk.store.repoint("session", old, "orch-next");
  await wait(80);
  assert.equal(toOrch(old).length, 0);
  assert.equal(toOrch("orch-next").length, 1);
  tk.store.repoint("session", "orch-next", old);
});

test("g. thirty open tickets: the orchestration session's tickets answer stays under 1300 letters; a ticket with no folder works in its own", async () => {
  for (let i = 2; i <= 30; i++)
    await tool(orch, "ticket_open", { title: `piece ${i}: ${"a long title about some part of the product ".repeat(3)}`, ask: `ask ${i}: ${"words ".repeat(300)}` });
  const all = tk.store.list();
  assert.equal(all.length, 30);
  await tool(exec2, "ticket_state", { state: "waiting", summary: "all three done", waitsOn: "may I open the draft PR now?" });   // the oldest, and waiting
  const answer = await tool(orch, "tickets", {});
  assert.ok(answer.length < 1300, `${answer.length} letters`);
  assert.match(answer, /#1 \[waiting\] the login check/, "the one waiting on the person is in sight");
  assert.match(answer, /and \d+ more open \(tickets with find, or ticket_read by number\)/);
  assert.doesNotMatch(answer, /^#3 \[/m, "#3 is among those left out");
  const found = await tool(orch, "tickets", { find: "ticket 3" });
  assert.match(found, /^#3 \[working\] piece 3: /, "a ticket left out of the summary is found by its number");
  assert.match(await tool(orch, "tickets", { find: "the password check on the login page" }), /^#1 \[waiting\] the login check/, "and by its words");
  assert.ok(found.length < 1300, `${found.length} letters`);
  assert.equal(await tool(orch, "tickets", { find: "zebra" }), "no ticket matches those words");
  const t30 = tk.store.get(30)!;
  assert.equal(t30.executor?.cwd, join(tk.DIR, t30.id, "work"));
  assert.ok(existsSync(t30.executor!.cwd));
});

test("a session's words to a ticket subscribe it; the person's do not", async () => {
  said = [];
  await ex.door.send("orch-two", "#2", "the second orchestration session asks");
  assert.deepEqual(tk.store.get(2)!.subs.map((s) => s.key).sort(), [orch, "orch-two"].sort());
  await ex.door.send("person", "#2", "the person's own words");
  assert.ok(!tk.store.get(2)!.subs.some((s) => s.key === "person"));
  assert.ok(tk.store.get(2)!.log.some((l) => l.kind === "words" && l.by === "person" && l.text === "the person's own words"));
});

test("the switch off again: the orchestration session's ticket tools are taken; the tickets go on and still report to it", async () => {
  one.setTickets(false);
  await wait(10);
  assert.deepEqual(toolsOnlyFor(orch).map((t: { name: string }) => t.name).sort(), ["one_sessions", "stop_session"]);
  said = [];
  words.set(exec2, "Opened nothing yet; still waiting.");
  ended(exec2, 1700);
  await wait(100);
  assert.equal(toOrch(orch).filter((s) => /^<ticket reports>/.test(s.text)).length, 1);
});

test("the orchestration session closes a ticket: the stopped turn reports nothing back; a reopen opens it and its words reach the executor", async () => {
  one.setTickets(true);
  const t3 = tk.store.get(3)!, e3 = t3.executor!.sessionId;
  runs.get(e3)!.working = true;
  said = [];
  assert.equal(await tool(orch, "ticket_close", { ticket: "3", state: "dropped", summary: "he no longer wants it" }), "#3 closed: dropped");
  words.set(e3, "Stopped.");
  ended(e3);   // its stopped turn ends
  await wait(100);
  assert.equal(toOrch(orch).length, 0, "nothing reported back to who closed it");
  assert.equal(tk.store.get(3)!.state, "dropped");
  await assert.rejects(tool(orch, "ticket_send", { ticket: "3", words: "go on after all" }), /ticket #3 is closed: say reopen/);
  await tool(orch, "ticket_send", { ticket: "3", words: "go on after all", reopen: true });
  const back = tk.store.get(3)!;
  assert.equal(back.state, "working", "reopened and at work");
  assert.ok(back.log.some((l) => l.kind === "state" && /dropped → open/.test(l.text)));
  const to3 = said.filter((s) => s.to === e3);
  assert.equal(to3.length, 1);
  assert.match(to3[0].text, /go on after all/);
  assert.deepEqual(toolsOnlyFor(e3).map((x: { name: string }) => x.name).sort(), ["ticket_note", "ticket_read", "ticket_state"], "its tools again");
  words.set(e3, "Going on.");
  ended(e3);
  await wait(100);
  assert.equal(toOrch(orch).filter((s) => /^<ticket reports>\n- #3 /.test(s.text)).length, 1, "once reopened, it reports again");
});

test("the person's words straight to a ticket (work.tickets.send): said as the person's, nobody new subscribed", async () => {
  said = [];
  const e4 = tk.store.get(4)!.executor!.sessionId;
  await ex.door.send("person", "4", "make it blue");
  const to4 = said.filter((s) => s.to === e4);
  assert.equal(to4.length, 1);
  assert.equal(to4[0].text, "<words for your ticket, from the person>\nmake it blue");
  assert.deepEqual(tk.store.get(4)!.subs.map((s) => s.key), [orch]);
});

test("wake(): a ticket left working with no executor (the engine stopped between open and start) says open; the next words start one", async () => {
  const t = tk.store.open({ title: "half opened", ask: "x", sub: orch });
  tk.store.setState(t.id, { state: "working", by: "engine" });
  ex.wake();
  assert.equal(tk.store.get(t.id)!.state, "open");
  said = [];
  await ex.door.send(orch, t.id, "start it");
  assert.equal(freshTo().filter((s) => s.text.includes("# Ticket #31: half opened")).length, 1);
  assert.equal(tk.store.get(t.id)!.executor?.n, 1);
});

// Executors (executor.ts): one session per ticket, started and replaced from the ticket, its reports batched to the
// subscribers. Offline: a small in-memory Store stands in for tickets.ts, and fakes for the engine's say, runs and words.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Store, Ticket, LogLine, Sub, Mandate, Past } from "../src/work/ticketTypes.ts";

const dir = mkdtempSync(join(tmpdir(), "sol-executor-"));
process.env.SOL_STATE = join(dir, "work.json");
const ex = await import("../src/work/executor.ts");
const { toolsOnlyFor, takeTool } = await import("../src/work/tools.ts");
const { CLOSED } = await import("../src/work/ticketTypes.ts");

// ---- a small Store: only what executor.ts calls, returning copies as a file store would
function fakeStore(): Store & { all: Map<string, Ticket> } {
  const all = new Map<string, Ticket>(); let n = 0;
  const fns = new Set<(t: Ticket) => void>();
  const out = (t: Ticket) => structuredClone(t);
  const ch = (t: Ticket) => { t.updatedAt = Date.now(); for (const f of fns) f(out(t)); return out(t); };
  const raw = (q: string | number) => all.get(String(q)) ?? [...all.values()].find((t) => String(t.n) === String(q).replace(/^(ticket\s*|#)/i, ""));
  const must = (id: string) => { const t = raw(id); if (!t) throw new Error(`no ticket ${id}`); return t; };
  const s: Store & { all: Map<string, Ticket> } = {
    all,
    open(a) {
      const id = Math.random().toString(16).slice(2, 10).padEnd(8, "0"), at = Date.now();
      const mandate: Mandate = { may: [], mayNot: [], until: "a draft, never a merge", free: "ask", ...(a.mandate ?? {}) };
      const t: Ticket = { id, n: ++n, title: a.title.slice(0, 80), ask: a.ask, mandate, state: "open", summary: "", log: [{ at, by: a.by ?? "orchestrator", kind: "opened", text: a.title }],
        subs: a.sub ? [{ kind: "session", key: a.sub, at }] : [], past: [], at, updatedAt: at };
      all.set(id, t); return ch(t);
    },
    get: (id) => { const t = raw(id); return t && out(t); },
    list: (f) => [...all.values()].filter((t) => f?.closed || !CLOSED.includes(t.state)).map(out),
    find: (q) => [...all.values()].filter((t) => t.title.includes(q)).map(out),
    log(id, line) { const t = must(id); t.log.push({ at: Date.now(), ...line } as LogLine); return ch(t); },
    setState(id, x) { const t = must(id); t.state = x.state; if (x.summary !== undefined) t.summary = x.summary; t.waitsOn = x.state === "waiting" ? x.waitsOn : undefined; t.log.push({ at: Date.now(), by: x.by, kind: "state", text: x.state }); return ch(t); },
    setMandate(id, p, by) { const t = must(id); t.mandate = { ...t.mandate, ...p }; t.log.push({ at: Date.now(), by, kind: "mandate", text: JSON.stringify(p) }); return ch(t); },
    setExecutor(id, e, was) {
      const t = must(id), old = t.executor, at = Date.now();
      if (old) t.past.push({ sessionId: old.sessionId, from: old.at, to: at, context: old.context ?? 0, window: old.window ?? 0, why: was?.why ?? "lost", noted: was?.noted ?? false } as Past);
      t.executor = e ? { ...e, at, n: (old?.n ?? t.past.length) + 1 } : undefined;
      return ch(t);
    },
    setCwd(id, cwd) { const t = must(id); if (t.executor && t.executor.cwd !== cwd) { t.executor.cwd = cwd; return ch(t); } return out(t); },
    setFill(id, context, window) { const t = must(id); if (t.executor) Object.assign(t.executor, { context, window }); return ch(t); },
    subscribe(id, sub) { const t = must(id); t.subs.push({ ...sub, at: Date.now() } as Sub); return ch(t); },
    unsubscribe(id, sub) { const t = must(id); t.subs = t.subs.filter((x) => !(x.kind === sub.kind && x.key === sub.key)); return ch(t); },
    subscribed: (kind, key) => [...all.values()].filter((t) => t.subs.some((x) => x.kind === kind && x.key === key)).map(out),
    repoint(kind, from, to) { let c = 0; for (const t of all.values()) for (const x of t.subs) if (x.kind === kind && x.key === from) { x.key = to; c++; } return c; },
    ofSession: (sid) => { const t = [...all.values()].find((x) => x.executor?.sessionId === sid); return t && out(t); },
    brief(id, max = 6000) {
      const t = must(id), notes = t.log.filter((l) => l.kind === "note"), rest = t.log.filter((l) => l.kind !== "note");
      return `# #${t.n} ${t.title}\nask: ${t.ask}\nuntil: ${t.mandate.until}\nstate: ${t.state} ${t.summary}\n## notes\n${notes.map((l) => `- ${l.text}`).join("\n")}\n## log\n${rest.map((l) => `- ${l.kind}: ${l.text}`).join("\n")}`.slice(0, max);
    },
    summary: (max = 1200) => [...all.values()].map((t) => `#${t.n} [${t.state}] ${t.title}: ${t.summary}`).join("\n").slice(0, max),
    onChange: (f) => { fns.add(f); return () => fns.delete(f); },
    _reload: () => {},
  };
  return s;
}

type Said = { to: string; text: string; fresh?: { cwd: string; worktree?: boolean }; how?: { free?: string }; known?: boolean };
let store: ReturnType<typeof fakeStore>, said: Said[], told: any[], named: [string, string][], stopped: string[];
let runs: Map<string, any>, kept: Set<string>, words: Map<string, string>, failFresh: number, failed: string[];
const run = (id: string, working = false) => { const r = { busy: working, working, perms: { size: 0 }, tasks: [], items: { list: [] }, stop: () => { stopped.push(id); r.working = false; } }; runs.set(id, r); return r; };
const wire = () => ex.setExecDeps({
  store,
  say: async (to, text, fresh, how) => {
    if (fresh && failFresh > 0) { failFresh--; failed.push(to); throw new Error("the session did not start"); }
    said.push({ to, text, ...(fresh ? { fresh } : {}), ...(how ? { how } : {}), known: !!store.ofSession(to) });
    if (fresh) kept.add(to);
  },
  run: (id) => runs.get(id), exists: async (id) => kept.has(id), lastWords: async (id) => words.get(id) ?? "",
  isRepo: (d) => d.endsWith("/repo"), tell: (m) => told.push(m), name: async (id, title) => { named.push([id, title]); },
});
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const tools = (id: string) => toolsOnlyFor(id).map((t: { name: string }) => t.name).sort();
const call = (id: string, name: string, a: object) => toolsOnlyFor(id).find((t: { name: string }) => t.name === name)!.run(a);
const ORCH = "orch-1";
const ended = async (sid: string, w: string, fill?: [number, number]) => {
  words.set(sid, w);
  ex.hears({ type: "work.run", sessionId: sid, ended: true, ...(fill ? { context: fill[0], window: fill[1] } : {}) });
  await flush();
};

beforeEach(() => {
  for (const t of store?.all.values() ?? []) for (const s of [t.executor?.sessionId, ...t.past.map((p) => p.sessionId)]) if (s) for (const n of ["ticket_note", "ticket_state", "ticket_read"]) takeTool(s, n);
  store = fakeStore(); said = []; told = []; named = []; stopped = []; runs = new Map(); kept = new Set(); words = new Map(); failFresh = 0; failed = [];
  ex._reload(); ex.delays.batch = 40; ex.delays.replaceWait = ex.REPLACE_WAIT_MS; wire();
});

test("open starts exactly one session, in the ticket's own folder, the brief in its first words; it is named and has its tools", async () => {
  const t = await ex.open(ORCH, { title: "Fix the side row", ask: "the side row is cut on the right, fix it" });
  assert.equal(said.length, 1);
  const s = said[0], e = t.executor!;
  assert.equal(s.to, e.sessionId);
  assert.ok(s.known, "the ticket knew its executor before the first say");
  assert.equal(s.fresh?.cwd, join(dir, "tickets", t.id, "work"));
  assert.ok(existsSync(s.fresh!.cwd) && !s.fresh!.worktree);
  assert.equal(e.cwd, s.fresh!.cwd); assert.equal(e.n, 1);
  assert.match(s.text, /^You are the executor of one ticket/);
  assert.match(s.text, /the side row is cut on the right, fix it/);
  assert.match(s.text, /ticket_note/); assert.match(s.text, /ticket_state/);
  assert.ok(s.text.indexOf("<ticket>") < 1500, `the executor's words before the brief: ${s.text.indexOf("<ticket>")} letters`);
  assert.equal(s.how?.free, "ask");
  assert.deepEqual(tools(e.sessionId), ["ticket_note", "ticket_read", "ticket_state"]);
  assert.deepEqual(named, [[e.sessionId, "#1 Fix the side row"]]);
  assert.equal(t.state, "working");
  assert.deepEqual(t.subs.map((x) => [x.kind, x.key]), [["session", ORCH]]);
  await flush();
  const last = told[told.length - 1];
  assert.equal(last.type, "work.tickets");
  assert.deepEqual({ ...last.tickets[0], id: undefined }, { id: undefined, n: 1, title: "Fix the side row", state: "working", waitsOn: null, summary: "", executor: e.sessionId, copy: 1, fill: null, replacing: false });
});

test("its folder: a repo is worked in a side copy of it; a plain folder as it is", async () => {
  const a = await ex.open(ORCH, { title: "In the repo", ask: "x", mandate: { where: "/home/p/repo", free: "edits" } });
  assert.deepEqual(said[0].fresh, { cwd: "/home/p/repo", worktree: true });
  assert.equal(a.executor!.cwd, "/home/p/repo");
  assert.equal(said[0].how?.free, "edits");
  await ex.open(ORCH, { title: "In a folder", ask: "y", mandate: { where: "/home/p/notes" } });
  assert.deepEqual(said[1].fresh, { cwd: "/home/p/notes" });
});

test("a second send reuses the live executor: said to it, not a new session", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "do it" });
  const id = t.executor!.sessionId;
  await ended(id, "Done the first part.");
  const u = await ex.send(ORCH, "1", "now the second part");
  assert.equal(said.length, 2);
  assert.equal(said[1].to, id); assert.equal(said[1].fresh, undefined);
  assert.equal(said[1].text, "<words for your ticket, from the person through the orchestration session>\nnow the second part");
  assert.equal(u.state, "working");
  assert.ok(u.log.some((l) => l.kind === "words" && l.by === "orchestrator" && l.text === "now the second part"));
  assert.equal(u.executor!.sessionId, id);
});

test("a lost executor is replaced from the ticket: the fresh brief holds the earlier notes and the words, once", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "do it" });
  const old = t.executor!.sessionId;
  await call(old, "ticket_note", { text: "changed side.css: the row has a min width now" });
  await ended(old, "Did the row.");
  kept.delete(old);   // its transcript is gone
  const u = await ex.send(ORCH, "#1", "also the top bar");
  assert.equal(said.length, 2);
  const s = said[1], e = u.executor!;
  assert.notEqual(e.sessionId, old); assert.equal(s.to, e.sessionId);
  assert.ok(s.fresh); assert.equal(s.fresh!.cwd, t.executor!.cwd);
  assert.match(s.text, /changed side\.css: the row has a min width now/);
  assert.equal(s.text.split("also the top bar").length - 1, 1, "the words are in the brief, not said twice");
  assert.match(s.text, /You are copy 2 .* its session was lost/);
  assert.deepEqual(u.past.map((p) => [p.sessionId, p.why, p.noted]), [[old, "lost", false]]);
  assert.deepEqual(tools(old), []); assert.equal(tools(e.sessionId).length, 3);
});

for (const noted of [true, false]) test(`fill 0.7 asks for closing notes; the next ended turn starts copy 2 in the same folder (noted ${noted})`, async () => {
  const t = await ex.open(ORCH, { title: "Big", ask: "a long job" });
  const old = t.executor!.sessionId, cwd = t.executor!.cwd;
  await ended(old, "Halfway.", [700, 1000]);
  assert.equal(said.length, 2);
  assert.equal(said[1].to, old);
  assert.match(said[1].text, /^<closing notes>\nYour talk is nearly full: write into the ticket, with ticket_note/);
  assert.match(said[1].text, /then call ticket_state, then answer: written$/);
  assert.ok(store.get(t.id)!.log.some((l) => l.kind === "executor" && l.text === "asked for its closing notes" && l.session === old));
  await flush(); assert.equal(told[told.length - 1].tickets[0].replacing, true);
  if (noted) await call(old, "ticket_note", { text: "half done: the export; next: its test" });
  await call(old, "ticket_state", { state: "working", summary: "export half done" });
  await ended(old, "written", [720, 1000]);
  const fresh = said.filter((x) => x.fresh);
  assert.equal(fresh.length, 2, "one fresh copy, no more");
  const u = store.get(t.id)!, e = u.executor!;
  assert.notEqual(e.sessionId, old); assert.equal(e.n, 2);
  assert.equal(fresh[1].to, e.sessionId);
  assert.deepEqual(fresh[1].fresh, { cwd }); assert.equal(e.cwd, cwd);
  assert.match(fresh[1].text, /You are copy 2 .* its talk filled/);
  if (noted) assert.match(fresh[1].text, /half done: the export; next: its test/);
  assert.deepEqual(tools(old), []); assert.deepEqual(tools(e.sessionId), ["ticket_note", "ticket_read", "ticket_state"]);
  assert.deepEqual(u.past.map((p) => [p.sessionId, p.why, p.noted, p.context, p.window]), [[old, "full", noted, 720, 1000]]);
  await flush(60);
  const reports = said.filter((s) => s.to === ORCH);
  assert.equal(reports.length, 1, "the closing notes' answer is not a report");
  assert.match(reports[0].text, /Big: Halfway\./);
});

test("the fresh copy failing to start keeps the old one; its next ended turn tries again", async () => {
  const t = await ex.open(ORCH, { title: "Big", ask: "a long job" });
  const old = t.executor!.sessionId;
  await ended(old, "Halfway.", [700, 1000]);
  failFresh = 1;
  await ended(old, "written");
  let u = store.get(t.id)!;
  assert.equal(u.executor!.sessionId, old, "the old one stays the executor");
  assert.equal(u.past.length, 0);
  assert.ok(u.log.some((l) => l.kind === "executor" && /copy 2 did not start: the session did not start/.test(l.text)));
  assert.deepEqual(tools(old), ["ticket_note", "ticket_read", "ticket_state"]);
  assert.equal(failed.length, 1); assert.deepEqual(tools(failed[0]), [], "the copy that did not start has no tools");
  await ended(old, "still here");
  u = store.get(t.id)!;
  assert.notEqual(u.executor!.sessionId, old);
  assert.deepEqual(u.past.map((p) => [p.why, p.noted]), [["full", false]]);
});

test("with no ended turn the fresh copy starts after the wait anyway; one still working is stopped first", async () => {
  ex.delays.replaceWait = 50;
  const t = await ex.open(ORCH, { title: "Big", ask: "a long job" });
  const old = t.executor!.sessionId;
  await ended(old, "Halfway.", [800, 1000]);
  run(old, true);
  await flush(120);
  assert.deepEqual(stopped, [old]);
  const u = store.get(t.id)!;
  assert.notEqual(u.executor!.sessionId, old);
  assert.deepEqual(u.past.map((p) => p.why), ["full"]);
});

test("replace: the person asks; the old copy writes its notes, then copy 2 (why asked)", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const old = t.executor!.sessionId;
  await ended(old, "ok");
  await ex.replace("1");
  assert.match(said[said.length - 1].text, /^<closing notes>\nThe person asked for a fresh copy of you/);
  await ex.replace("1");
  assert.equal(said.filter((s) => s.text.startsWith("<closing notes>")).length, 1, "asked twice: once");
  await call(old, "ticket_note", { text: "nothing half done" });
  await ended(old, "written");
  assert.deepEqual(store.get(t.id)!.past.map((p) => [p.why, p.noted]), [["asked", true]]);
});

test("a send while the old copy writes its notes: the fresh copy starts with the words in its brief", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const old = t.executor!.sessionId;
  await ended(old, "ok", [650, 1000]);
  await ex.send(ORCH, "1", "and the footer");
  const s = said[said.length - 1], u = store.get(t.id)!;
  assert.ok(s.fresh); assert.notEqual(u.executor!.sessionId, old);
  assert.match(s.text, /and the footer/);
  assert.equal(said.filter((x) => x.to === old && /and the footer/.test(x.text)).length, 0);
});

test("wake() after a restart: tools again, a working ticket with no run says open, nothing is said", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const t2 = await ex.open(ORCH, { title: "Waits", ask: "y" });
  const id = t.executor!.sessionId, id2 = t2.executor!.sessionId;
  await call(id2, "ticket_state", { state: "waiting", summary: "needs a name", waitsOn: "the name of the page" });
  await ended(id2, "Which name?");
  // the restart: the module's memory and the tools map are gone
  ex._reload(); for (const s of [id, id2]) for (const n of ["ticket_note", "ticket_state", "ticket_read"]) takeTool(s, n);
  said = [];
  ex.wake();
  assert.equal(tools(id).length, 3); assert.equal(tools(id2).length, 3);
  const u = store.get(t.id)!;
  assert.equal(u.state, "open");
  assert.ok(u.log.some((l) => l.kind === "executor" && l.text === "the engine restarted while it worked; resumed at the next words"));
  assert.equal(store.get(t2.id)!.state, "waiting");
  assert.equal(said.length, 0);
  await ex.send(ORCH, "1", "go on");
  assert.equal(said[0].to, id, "resumed by the next send");
});

test("wake() finds an executor asked for its closing notes and still replaces it", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const old = t.executor!.sessionId;
  await ended(old, "ok", [700, 1000]);
  ex._reload();
  ex.wake();
  await ended(old, "written");
  assert.notEqual(store.get(t.id)!.executor!.sessionId, old);
});

test("a closed ticket refuses words; reopen sends them; close stops its turn and takes its tools", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const id = t.executor!.sessionId;
  run(id, true);
  const c = await ex.close(ORCH, "1", "done", "shipped");
  assert.deepEqual(stopped, [id]);
  assert.equal(c.state, "done"); assert.equal(c.summary, "shipped");
  assert.deepEqual(tools(id), []);
  await assert.rejects(ex.send(ORCH, "1", "one more"), /ticket #1 is closed: say reopen to send it words/);
  const u = await ex.send(ORCH, "1", "one more", { reopen: true });
  assert.equal(u.state, "working");
  assert.equal(said[said.length - 1].to, id);
  assert.equal(tools(id).length, 3);
});

test("a mandate change is said to the live executor as a turn", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const id = t.executor!.sessionId;
  await ended(id, "ok");
  const u = await ex.mandate(ORCH, "1", { until: "a draft PR", may: ["edit the face"] });
  assert.equal(u.mandate.until, "a draft PR");
  const s = said[said.length - 1];
  assert.equal(s.to, id);
  assert.match(s.text, /^<the mandate of your ticket changed>\nmay: edit the face\n.*\nuntil: a draft PR/s);
});

test("a turn that never called ticket_state still leaves a truthful state", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const id = t.executor!.sessionId;
  ex.hears({ type: "work.run", sessionId: id, busy: true });
  assert.equal(store.get(t.id)!.state, "working");
  await ended(id, "I made the two takes.\nShould the bar be **blue** or green?");
  let u = store.get(t.id)!;
  assert.equal(u.state, "waiting");
  assert.equal(u.summary, "I made the two takes.");
  assert.equal(u.waitsOn, "Should the bar be blue or green?");
  await ex.send(ORCH, "1", "blue");
  await ended(id, "## Done\nThe bar is blue now.");
  u = store.get(t.id)!;
  assert.equal(u.state, "open"); assert.equal(u.summary, "Done");
  assert.ok(u.log.some((l) => l.kind === "report" && l.by === "executor" && /The bar is blue now/.test(l.text)));
});

test("a state it set holds through the rest of its turn; 'working' at the end of a turn is open; done takes its tools", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const id = t.executor!.sessionId;
  await call(id, "ticket_state", { state: "waiting", summary: "needs the key", waitsOn: "the API key" });
  ex.hears({ type: "work.run", sessionId: id, busy: true });
  await ended(id, "I need the API key.");
  let u = store.get(t.id)!;
  assert.equal(u.state, "waiting"); assert.equal(u.waitsOn, "the API key"); assert.equal(u.summary, "needs the key");
  await ex.send(ORCH, "1", "here");
  await call(id, "ticket_state", { state: "working", summary: "more to do" });
  await ended(id, "Part two next.");
  u = store.get(t.id)!;
  assert.equal(u.state, "open"); assert.equal(u.summary, "more to do");
  await ex.send(ORCH, "1", "finish");
  await call(id, "ticket_state", { state: "done", summary: "all done" });
  await ended(id, "Finished.");
  assert.equal(store.get(t.id)!.state, "done");
  assert.deepEqual(tools(id), []);
});

test("ticket_note, ticket_read: written into the ticket by the executor, the brief read back", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "the ask" });
  const id = t.executor!.sessionId;
  assert.equal(await call(id, "ticket_note", { text: "decided: no new dependency" }), "noted");
  const l = store.get(t.id)!.log.at(-1)!;
  assert.deepEqual([l.kind, l.by, l.text, l.session], ["note", "executor", "decided: no new dependency", id]);
  assert.match(await call(id, "ticket_read", {}), /decided: no new dependency/);
});

test("delivery: tickets ending together are one turn per subscriber, one line each, never the whole report", async () => {
  ex.delays.batch = 200;
  const a = await ex.open(ORCH, { title: "Alpha", ask: "x" });
  const b = await ex.open(ORCH, { title: "Beta", ask: "y" });
  const c = await ex.open("orch-2", { title: "Gamma", ask: "z" });
  const long = "Long report line. ".repeat(300);   // 5400 letters
  await ended(a.executor!.sessionId, `Alpha is done.\n${long}`);
  await ended(b.executor!.sessionId, `${long}\nWhich colour do you want?`);
  await ended(c.executor!.sessionId, "Gamma moved.");
  assert.ok(!said.some((s) => s.to === ORCH), "nothing before the batch");
  await flush(250);
  const to1 = said.filter((s) => s.to === ORCH), to2 = said.filter((s) => s.to === "orch-2");
  assert.equal(to1.length, 1); assert.equal(to2.length, 1);
  const m = to1[0].text;
  assert.match(m, /^<ticket reports>\n- #1 \[open\] Alpha: Alpha is done\.\n- #2 \[waiting\] Beta: /);
  assert.match(m, /\n  waits on: Which colour do you want\?\n  report: /);
  assert.ok(!m.includes("Alpha is done. Long report"), "an open ticket's report is not sent");
  const report = m.split("\n  report: ")[1];
  assert.ok(report.length <= ex.REPORT_CUT, `the report is cut: ${report.length}`);
  assert.ok(m.length < 1200, `one batch: ${m.length} letters`);
  assert.equal(to2[0].text, "<ticket reports>\n- #3 [open] Gamma: Gamma moved.");
  assert.ok(!said.some((s) => s.to === a.executor!.sessionId && s.text.startsWith("<ticket reports>")));
});

test("delivery: a batch stays under its bound however many tickets end", async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `- #${i} [waiting] ${"t".repeat(80)}: ${"s".repeat(160)}\n  waits on: ${"w".repeat(160)}\n  report: ${"r".repeat(600)}`);
  const m = ex.batchText(lines);
  assert.ok(m.length <= ex.BATCH_CUT, `${m.length}`);
  assert.match(m, /more tickets reported/);
  assert.ok(m.includes(lines[39]), "the newest kept");
});

test("summary, read, find, repoint pass to the store", async () => {
  await ex.open(ORCH, { title: "Alpha", ask: "the alpha ask" });
  assert.match(ex.summary(), /#1 \[working\] Alpha/);
  assert.match(ex.read("1"), /the alpha ask/);
  assert.equal(ex.find("Alpha").length, 1);
  assert.equal(ex.repoint(ORCH, "orch-9"), 1);
  assert.equal(store.subscribed("session", "orch-9").length, 1);
  assert.equal(ex.door.open, ex.open);
});

test("a session that is no ticket's executor, or a replaced copy, is not heard", async () => {
  const t = await ex.open(ORCH, { title: "T", ask: "x" });
  const old = t.executor!.sessionId;
  kept.delete(old);
  await ex.send(ORCH, "1", "go");
  const before = store.get(t.id)!.log.length;
  await ended(old, "a stray last turn?");
  await ended("someone-else", "hello?");
  assert.equal(store.get(t.id)!.log.length, before);
});

test("a repo's fresh copy works in the old copy's side copy, not a new one; with that copy gone, a new side copy, never the repo", async () => {
  const t = await ex.open(ORCH, { title: "R", ask: "x", mandate: { where: "/home/p/repo" } });
  const old = t.executor!.sessionId;
  run(old).cwd = "/home/p/repo/.claude/worktrees/side-1";
  await ended(old, "ok", [700, 1000]);
  await ended(old, "written");
  const fresh = said.filter((s) => s.fresh);
  assert.deepEqual(fresh[1].fresh, { cwd: "/home/p/repo/.claude/worktrees/side-1" });
  const now = store.get(t.id)!.executor!;
  assert.equal(now.cwd, "/home/p/repo/.claude/worktrees/side-1");
  // a ticket whose executor's side copy is not known any more (recorded cwd: the repo, its session gone)
  const t2 = await ex.open(ORCH, { title: "R2", ask: "y", mandate: { where: "/home/p/repo" } });
  kept.delete(t2.executor!.sessionId);
  await ex.send(ORCH, "2", "go on");
  assert.deepEqual(said.filter((s) => s.fresh).at(-1)!.fresh, { cwd: "/home/p/repo", worktree: true });
  assert.ok(store.get(t2.id)!.log.some((l) => /side copy it worked in was not found/.test(l.text)));
});

test("open: an executor that does not start leaves the ticket open, says so, and the next send starts one", async () => {
  failFresh = 1;
  await assert.rejects(ex.open(ORCH, { title: "T", ask: "x" }), /ticket #1 is open but its executor did not start/);
  const t = store.get("1")!;
  assert.equal(t.state, "open");
  assert.ok(t.log.some((l) => /copy 1 did not start/.test(l.text)));
  await ex.send(ORCH, "1", "try again");
  const u = store.get("1")!;
  assert.equal(u.state, "working");
  assert.equal(said.length, 1); assert.ok(said[0].fresh);
  assert.equal(u.executor!.sessionId, said[0].to);
});

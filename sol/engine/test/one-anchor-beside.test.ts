// The anchor beside the orchestration sessions (#1469 follow-up, Frank 2026-11-19: the main conversation stays, the
// orchestration sessions run beside it behind a switch, and going back reconnects the conversation as it was). One.ts:
// the anchor is an Orch record with `anchor: true` and no orchestration mark; build.orchestration off stops promotes.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-one-anchor-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const { toolsOnlyFor } = await import("../src/work/tools.ts");
const { mark, workState } = await import("../src/work/state.ts");

const HAND = "## Carried\n- the word is \"heron-41\"\n- the side row is half done\n## Dropped\n- the hellos";
let said: { to: string; text: string; fresh?: boolean }[] = [], named: [string, string][] = [], carried: [string, string][] = [];
const SESSIONS = [
  { id: "old-anchor", title: "anchor", cwd: dir, updatedAt: 1 },
  { id: "orch-a", title: "the night's work", cwd: dir, updatedAt: 1 },
  { id: "kid-1", title: "the side row", cwd: dir, updatedAt: 1 },
];
const sessions = () => [...SESSIONS, ...Object.keys(workState().marks).filter((id) => !SESSIONS.some((s) => s.id === id)).map((id) => ({ id, title: id, cwd: dir, updatedAt: Date.now() }))]
  .map((s) => ({ ...s, ...(workState().marks[s.id] ?? {}) }));
const wire = () => one.setOneDeps({
  say: async (to, text, fresh) => { said.push({ to, text, ...(fresh ? { fresh: true } : {}) }); },
  run: () => undefined, sessions: async () => sessions() as never,
  lastWords: async (id) => (id.startsWith("kid") ? `${id} is done.` : HAND),
  tell: () => {},
  name: async (id, title) => { named.push([id, title]); },
  carry: async (from, to) => { carried.push([from, to]); },
  isExecutor: () => false,
});
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const names = (id: string) => toolsOnlyFor(id).map((t: { name: string }) => t.name).sort();
const marks = (id: string) => workState().marks[id] ?? {};

beforeEach(() => {
  said = []; named = []; carried = [];
  for (const f of ["orch.json", "one.json"]) rmSync(join(dir, f), { force: true });
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null, parent: null, archived: false, pinned: false });
  one._reload(); wire();
});

test("the anchor opens once: an ordinary session told it is kept, pinned, named, with one_sessions and stop_session; pressed twice at once, one", async () => {
  const [a, b] = await Promise.all([one.openAnchor(dir), one.openAnchor(dir)]);
  assert.equal(a.sessionId, b.sessionId);
  assert.equal(a.made, true);
  const id = a.sessionId;
  assert.equal(said.length, 1);
  assert.ok(said[0].fresh && said[0].to === id);
  assert.match(said[0].text, /^You are the anchor session:[\s\S]*you do the work yourself[\s\S]*Say hello/);
  assert.equal(marks(id).pinned, true);
  assert.equal(marks(id).kind, undefined, "no orchestration mark: the side draws it as an ordinary session");
  assert.ok(one.isAnchor(id) && !one.isOrchestrator(id) && one.runsOthers(id));
  assert.deepEqual(names(id), ["one_sessions", "stop_session"]);
  assert.ok(named.some(([s, t]) => s === id && t === "anchor"));
  assert.deepEqual(await one.openAnchor(dir), { sessionId: id, made: false, reconnected: false }, "the next press opens the same one");
  assert.equal(one.kept().anchor, id);
  one._reload(); wire(); one.wakeOrchestrators();   // the engine restarts: the anchor stays, its tools again
  assert.equal(one.anchorId(), id);
  assert.deepEqual(names(id), ["one_sessions", "stop_session"]);
});

test("going back: the anchor of before #1469 (one.json, plain) reconnects as it was; nothing is said to it, nothing made", async () => {
  writeFileSync(join(dir, "one.json"), JSON.stringify({ sessionId: "old-anchor", cwd: dir, plain: true, pieces: [], did: [], past: ["older-copy"] }));
  const r = await one.openAnchor(dir);
  assert.deepEqual(r, { sessionId: "old-anchor", made: false, reconnected: true });
  assert.equal(said.length, 0);
  assert.equal(marks("old-anchor").pinned, true);
  assert.equal(one.currentOf("older-copy"), "old-anchor", "an id of its earlier copies reaches it");
  assert.equal(JSON.parse(readFileSync(join(dir, "one.json"), "utf8")).sessionId, "old-anchor", "one.json is read, never written");
});

test("the one session of before (one.json without plain) or one put away is not reconnected: a fresh anchor is made", async () => {
  writeFileSync(join(dir, "one.json"), JSON.stringify({ sessionId: "old-anchor", cwd: dir, pieces: [], did: [] }));
  const r = await one.openAnchor(dir);
  assert.equal(r.made, true);
  assert.notEqual(r.sessionId, "old-anchor");
  mark(r.sessionId, { archived: true });
  const again = await one.openAnchor(dir);
  assert.equal(again.made, true);
  assert.notEqual(again.sessionId, r.sessionId);
  assert.equal(one.kept().orchestrators.filter((o: { anchor?: boolean }) => o.anchor).length, 1);
});

test("a session the anchor starts runs under it and reports back; the anchor is never promoted, demote leaves it", async () => {
  const id = (await one.openAnchor(dir)).sessionId;
  said = [];
  mark("kid-1", { under: id, parent: id });
  one.hears({ type: "work.run", sessionId: "kid-1", ended: true } as never);
  await flush(2700);
  const got = said.find((s) => s.to === id);
  assert.ok(got, "the anchor hears its session's report");
  assert.match(got!.text, /<reports from sessions under you>[\s\S]*kid-1 is done/);
  await assert.rejects(() => one.promote(id), /anchor/);
  assert.deepEqual(await one.demote(id), { demoted: false, loose: [] });
  assert.ok(one.isAnchor(id));
});

test("the anchor renews from its own handover into a fresh anchor: no orchestration mark, no tickets, its stage and sessions carried", async () => {
  one.setTickets(true);
  const id = (await one.openAnchor(dir)).sessionId;
  assert.deepEqual(names(id), ["one_sessions", "stop_session"], "tickets are an orchestration session's, never the anchor's");
  mark("kid-1", { under: id });
  said = [];
  await one.renew("asked", id);
  assert.match(said[0].text, /^<renewal>[\s\S]*your own work in progress/, "the anchor's handover asks for its own work, not tickets");
  one.hears({ type: "work.run", sessionId: id, ended: true, context: 700, window: 1000 } as never); await flush();
  const fresh = one.anchorId()!;
  assert.notEqual(fresh, id);
  const first = said[said.length - 1];
  assert.ok(first.fresh && first.to === fresh);
  assert.match(first.text, /^You are the anchor session:[\s\S]*renewal 1 of the same anchor session[\s\S]*heron-41/);
  assert.equal(marks(fresh).kind, undefined);
  assert.equal(marks(fresh).pinned, true);
  assert.equal(marks("kid-1").under, fresh);
  assert.equal(marks(id).archived, true);
  assert.deepEqual(carried, [[id, fresh]]);
  assert.deepEqual(names(fresh), ["one_sessions", "stop_session"]);
  assert.equal(one.currentOf(id), fresh);
  assert.match(readFileSync(one.kept().orchestrators.find((o: { anchor?: boolean }) => o.anchor)!.renewals![0].file, "utf8"), /^# The anchor, renewal 1/);
});

test("build.orchestration off: no promote; what is promoted keeps running and its record stays; on again, promote as before", async () => {
  await one.promote("orch-a");
  assert.deepEqual(one.setOrchestration(false), { changed: true });
  assert.equal(one.orchestrationOn(), false);
  await assert.rejects(() => one.promote("kid-1"), /off/);
  one._reload(); wire(); one.wakeOrchestrators();
  assert.equal(one.orchestrationOn(), false, "kept across a restart");
  assert.ok(one.isOrchestrator("orch-a"));
  assert.deepEqual(one.orchestrators(), ["orch-a"]);
  assert.deepEqual(one.setOrchestration(true), { changed: true });
  assert.deepEqual(await one.promote("kid-1"), { promoted: true });
});

test("the anchor and an orchestration session side by side: each keeps its own record, tools and reports", async () => {
  await one.promote("orch-a");
  const id = (await one.openAnchor(dir)).sessionId;
  assert.deepEqual(one.orchestrators().sort(), [id, "orch-a"].sort());
  assert.ok(one.isOrchestrator("orch-a") && !one.isAnchor("orch-a"));
  assert.ok(one.isAnchor(id) && !one.isOrchestrator(id));
  one._reload(); wire(); one.wakeOrchestrators();
  assert.deepEqual(one.orchestrators().sort(), [id, "orch-a"].sort(), "wake keeps the anchor though it carries no mark");
});

test("going back when the old anchor went on as an orchestration session (round 122): the same session is the anchor again, told once, its sessions kept", async () => {
  writeFileSync(join(dir, "one.json"), JSON.stringify({ sessionId: "old-anchor", cwd: dir, plain: true, pieces: [], did: [] }));
  await one.promote("old-anchor");   // what the first start after #1469 made of it, by its kind mark
  mark("kid-1", { under: "old-anchor" });
  one.setTickets(true);
  said = [];
  const r = await one.openAnchor(dir);
  assert.deepEqual(r, { sessionId: "old-anchor", made: false, reconnected: true });
  assert.ok(one.isAnchor("old-anchor") && !one.isOrchestrator("old-anchor"));
  assert.equal(marks("old-anchor").kind, undefined);
  assert.equal(marks("kid-1").under, "old-anchor", "the sessions under it stay");
  assert.deepEqual(names("old-anchor"), ["one_sessions", "stop_session"], "no ticket tools: the anchor does its own work");
  assert.equal(said.length, 1);
  assert.match(said[0].text, /^You are the anchor session:[\s\S]*again[\s\S]*ready/);
  assert.equal(one.kept().orchestrators.length, 1, "one record, the same one");
  one._reload(); wire(); one.wakeOrchestrators();
  assert.ok(one.isAnchor("old-anchor"), "kept across a restart though it has no mark");
});

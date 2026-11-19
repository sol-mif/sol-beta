// Two kinds of session (one.ts, "orchestration sessions"; the design #1183, Marco 2026-11-14: "a normal session does
// work; an orchestration session runs normal sessions"). Any session can be promoted: it gets one_sessions and
// stop_session and a renewal, hears the sessions under it as report turns, and a session put under it arrives as one
// summary turn. The kept anchor went (#1209): its tests went with it.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-one-orch-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const { toolsOnlyFor } = await import("../src/work/tools.ts");
const { mark, workState } = await import("../src/work/state.ts");
const { joinedGist, JOINED_MAX } = await import("../src/work/gist.ts");

const HAND = "## Carried\n- the word is \"heron-41\"\n- kid-1 builds the side row\n## Dropped\n- the hellos";
const LONG = "I changed the side so a row folds under the session that runs it. ".repeat(20);
let said: { to: string; text: string; fresh?: boolean }[] = [], named: [string, string][] = [], carried: [string, string][] = [];
let items: Record<string, { kind: string; text?: string }[]> = {}, executors = new Set<string>();
const SESSIONS = [
  { id: "orch-a", title: "the night's work", cwd: dir, updatedAt: 1 },
  { id: "kid-1", title: "the side row", cwd: "/work/scratch/orch-1", updatedAt: 1, branch: "marcocyl04-ux/orch-1" },
  { id: "kid-2", title: "the checks", cwd: dir, updatedAt: 1 },
  { id: "orch-b", title: "the nested one", cwd: dir, updatedAt: 1 },
];
let runs: Record<string, unknown> = {}, log: string[] = [], rowsFor: (() => unknown[]) | null = null;
// the fixed rows, and a row for any other session the marks know (a renewal's fresh copy), each with its marks on it
const sessions = () => [...SESSIONS, ...Object.keys(workState().marks).filter((id) => !SESSIONS.some((s) => s.id === id)).map((id) => ({ id, title: id, cwd: dir, updatedAt: Date.now() }))]
  .map((s) => ({ ...s, ...(workState().marks[s.id] ?? {}) }));
const wire = () => one.setOneDeps({
  say: async (to, text, fresh) => { log.push(`say ${to}`); said.push({ to, text, ...(fresh ? { fresh: true } : {}) }); },
  run: (id) => runs[id] as never, sessions: async () => (rowsFor?.() ?? sessions()) as never,
  lastWords: async (id) => (id.startsWith("kid") ? `${id} is done: the PR is up.` : HAND),
  tell: () => {},
  name: async (id, title) => { named.push([id, title]); },
  carry: async (from, to) => { carried.push([from, to]); },
  isExecutor: (id) => executors.has(id),
  items: async (id) => items[id] ?? [],
});
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const names = (id: string) => toolsOnlyFor(id).map((t: { name: string }) => t.name).sort();
const marks = (id: string) => workState().marks[id] ?? {};

beforeEach(() => {
  said = []; named = []; carried = []; items = {}; executors = new Set(); runs = {}; log = []; rowsFor = null;
  for (const f of ["orch.json"]) rmSync(join(dir, f), { force: true });
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null, parent: null, archived: false, pinned: false });
  one._reload(); wire();
});

test("promote: the session gets one_sessions and stop_session beside its own, a renewal record, and one turn saying so; asked twice, once", async () => {
  assert.deepEqual(await one.promote("orch-a"), { promoted: true });
  assert.equal(marks("orch-a").kind, "orchestration");
  assert.deepEqual(names("orch-a"), ["one_sessions", "stop_session"]);
  assert.ok(toolsOnlyFor("orch-a").every((t: { beside?: boolean }) => t.beside), "beside its ordinary tools, never narrow");
  assert.equal(said.length, 1);
  assert.equal(said[0].to, "orch-a");
  assert.match(said[0].text, /^<promoted>\nYou are now an orchestration session[\s\S]*blocks a join or needs their decision[\s\S]*handover/);
  const o = JSON.parse(readFileSync(join(dir, "orch.json"), "utf8"));
  assert.deepEqual(o.orchestrators.map((x: { sessionId: string; cwd: string }) => [x.sessionId, x.cwd]), [["orch-a", dir]]);
  assert.deepEqual(await one.promote("orch-a"), { promoted: false });
  assert.equal(said.length, 1);
  one._reload(); wire();   // the engine restarts: still one, its tools given again
  assert.ok(one.isOrchestrator("orch-a"));
  one.wakeOrchestrators();
  assert.deepEqual(names("orch-a"), ["one_sessions", "stop_session"]);
  await assert.rejects(() => { executors.add("kid-2"); return one.promote("kid-2"); }, /executor/);
});

test("demote: its tools taken, its renewal stopped, the sessions under it let loose (their parent kept), one turn saying so", async () => {
  await one.promote("orch-a");
  mark("kid-1", { under: "orch-a", parent: "orch-a" }); mark("kid-2", { under: "orch-a" });
  said = [];
  const r = await one.demote("orch-a");
  assert.deepEqual([r.demoted, r.loose.sort()], [true, ["kid-1", "kid-2"]]);
  assert.equal(marks("orch-a").kind, undefined);
  assert.deepEqual(names("orch-a"), []);
  assert.equal(marks("kid-1").under, undefined);
  assert.equal(marks("kid-2").under, undefined);
  assert.equal(marks("kid-1").parent, "orch-a", "started by stays as history");
  assert.ok(!one.isOrchestrator("orch-a"));
  assert.match(said[0].text, /^<demoted>\nYou are a normal session again[\s\S]*The 2 sessions under you are loose now/);
  // no renewal any more: a full talk asks no handover
  said = [];
  one.hears({ type: "work.run", sessionId: "orch-a", ended: true, context: 900, window: 1000 } as never); await flush();
  assert.equal(said.length, 0);
});

test("a promoted session renews from its own handover, and the sessions under it move to the fresh copy", async () => {
  await one.promote("orch-a");
  mark("orch-a", { pinned: true });
  mark("kid-1", { under: "orch-a" });
  said = [];
  one.hears({ type: "work.run", sessionId: "orch-a", ended: true, context: 500, window: 1000 } as never); await flush();
  assert.equal(said.length, 0, "half full: nothing asked");
  one.hears({ type: "work.run", sessionId: "orch-a", ended: true, context: 700, window: 1000 } as never); await flush();
  assert.equal(said[0].to, "orch-a");
  assert.match(said[0].text, /## Carried[\s\S]*your own work in progress[\s\S]*## Dropped/);
  assert.deepEqual(await one.renew("asked", "orch-a"), { asked: false }, "asked again while it writes: not twice");
  one.hears({ type: "work.run", sessionId: "orch-a", ended: true, context: 720, window: 1000 } as never); await flush();
  const k = one.kept().orchestrators[0], id = k.sessionId;
  assert.notEqual(id, "orch-a");
  assert.deepEqual(one.orchestrators(), [id]);
  const first = said[said.length - 1];
  assert.ok(first.fresh && first.to === id);
  assert.match(first.text, /"the night's work"[\s\S]*renewal 1[\s\S]*<handover>[\s\S]*heron-41/);
  assert.equal(marks("kid-1").under, id, "run by the fresh copy");
  assert.deepEqual(k.runs, ["kid-1"]);
  assert.equal(marks(id).kind, "orchestration");
  assert.equal(marks(id).pinned, true);
  assert.equal(marks("orch-a").kind, undefined);
  assert.equal(marks("orch-a").archived, true);
  assert.deepEqual(names(id), ["one_sessions", "stop_session"]);
  assert.deepEqual(names("orch-a"), []);
  assert.deepEqual(carried, [["orch-a", id]]);
  assert.ok(named.some(([s, t]) => s === id && t === "the night's work"));
  assert.deepEqual([k.renewals![0].from, k.renewals![0].to, k.renewals![0].sessions], ["orch-a", id, 1]);
  assert.match(readFileSync(k.renewals![0].file, "utf8"), /renewal 1[\s\S]*heron-41/);
});

test("a session's report goes to the orchestration session its `under` names, not to the one that started it", async () => {
  await one.promote("orch-a"); await one.promote("orch-b");
  mark("kid-1", { parent: "orch-b", under: "orch-a" });   // orch-b started it; orch-a runs it
  mark("kid-2", { parent: "orch-b" });                    // orch-b started it, nobody runs it: no report
  said = [];
  one.hears({ type: "work.run", sessionId: "kid-1", ended: true });
  one.hears({ type: "work.run", sessionId: "kid-2", ended: true });
  await flush(2700);
  const toA = said.filter((s) => s.to === "orch-a");
  assert.equal(toA.length, 1);
  assert.match(toA[0].text, /^<reports from sessions under you>\n- the side row \(kid-1\): kid-1 is done/);
  assert.doesNotMatch(toA[0].text, /kid-2/);
  assert.equal(said.filter((s) => s.to === "orch-b").length, 0, "started by is history: it hears nothing");
  // a ticket's executor under it reports through its ticket, never here
  executors.add("kid-1"); said = [];
  one.hears({ type: "work.run", sessionId: "kid-1", ended: true }); await flush(2700);
  assert.equal(said.length, 0);
});

test("a session put under one arrives as one summary turn: title, folder, branch, its last three, what it waits on, under 600 letters", async () => {
  await one.promote("orch-a"); said = [];
  items["kid-1"] = [{ kind: "me", text: "fold by under" }, { kind: "you", text: "first " + LONG }, { kind: "tool", text: "x" }, { kind: "me", text: "and?" }, { kind: "you", text: "second " + LONG },
    { kind: "me", text: "and the menu" }, { kind: "you", text: "third " + LONG }, { kind: "you", text: "and its test" }, { kind: "me", text: "go" }, { kind: "you", text: "Shall I open the PR?" }];
  const s = await one.joined("kid-1", "orch-a");
  assert.ok(s && s.length < JOINED_MAX, `${s?.length} letters`);
  assert.match(s!, /^"the side row" \(kid-1\) in \/work\/scratch\/orch-1, on marcocyl04-ux\/orch-1\./);
  assert.match(s!, /Last it did:\n- second [^\n]*…\n- third [^\n]*…\n- Shall I open the PR\?\n/, "one speaker's back-to-back lines are one, as in gist; each cut to fit");
  assert.doesNotMatch(s!, /- first /, "only the last three");
  assert.match(s!, /Waits on: your answer to its question\.$/);
  assert.equal(said.length, 1);
  assert.equal(said[0].to, "orch-a");
  assert.equal(said[0].text.split("\n")[0], "<session joined>");
  assert.ok(said[0].text.includes(`${s}\n</session joined>`));
  // nothing for a session with no transcript, an executor, or a target that is not an orchestration session
  said = [];
  assert.equal(await one.joined("kid-2", "orch-a"), undefined);
  items["kid-2"] = [{ kind: "you", text: "hi" }]; executors.add("kid-2");
  assert.equal(await one.joined("kid-2", "orch-a"), undefined);
  assert.equal(await one.joined("kid-1", "kid-2"), undefined);
  assert.equal(said.length, 0);
});

test("G7: a move taken back (⌘Z) under its orchestrator again sends no second summary; the wire passes the face's undo", async () => {
  await one.promote("orch-a"); said = [];
  items["kid-1"] = [{ kind: "me", text: "fold by under" }, { kind: "you", text: "done" }];
  assert.ok(await one.joined("kid-1", "orch-a"), "the first join: one summary");
  assert.equal(said.length, 1);
  assert.equal(await one.joined("kid-1", "orch-a", { undo: true }), undefined);
  assert.equal(said.length, 1, "the undo: none again");
  const wire = readFileSync(new URL("../src/work/wire.ts", import.meta.url), "utf8");
  assert.match(wire, /one\.joined\(id, to, \{ undo: m\.undo === true \}\)/);
  assert.match(wire, /children\.moved\(id, to, was[,)]/, "the block is composed again all the same (with how it moved, #1454)");
});

test("the summary stays under 600 letters however long the title, folder and words", () => {
  const big = "x".repeat(2000);
  const s = joinedGist([{ kind: "you", text: big }, { kind: "me", text: "a" }, { kind: "you", text: big }, { kind: "me", text: "b" }, { kind: "you", text: big }],
    { id: "kid-9", title: big, cwd: "/" + "deep/".repeat(200), branch: big, waits: big });
  assert.ok(s.length < JOINED_MAX, `${s.length}`);
});

// ---- the fix round on #1190/#1191 (2026-11-14)

test("F2: an orchestration session under another reports up, once, as any session under it does", async () => {
  await one.promote("orch-a"); await one.promote("orch-b");
  mark("orch-b", { under: "orch-a" });
  said = [];
  one.hears({ type: "work.run", sessionId: "orch-b", ended: true, context: 100, window: 1000 } as never);
  one.hears({ type: "work.run", sessionId: "orch-b", ended: true, context: 120, window: 1000 } as never);
  await flush(2700);
  const toA = said.filter((s) => s.to === "orch-a");
  assert.equal(toA.length, 1);
  assert.match(toA[0].text, /^<reports from sessions under you>\n- the nested one \(orch-b\):/);
});

test("F3: a nested orchestration session's fresh copy stays under the one above, its parent kept as history", async () => {
  await one.promote("orch-a"); await one.promote("orch-b");
  mark("orch-b", { under: "orch-a", parent: "orch-a" });
  mark("kid-1", { under: "orch-b" });
  one.hears({ type: "work.run", sessionId: "orch-b", ended: true, context: 700, window: 1000 } as never); await flush();
  one.hears({ type: "work.run", sessionId: "orch-b", ended: true, context: 720, window: 1000 } as never); await flush();
  const id = one.orchestrators().find((x) => x !== "orch-a" && x !== "orch-b")!;
  assert.ok(id, "renewed");
  assert.equal(marks(id).under, "orch-a");
  assert.equal(marks(id).parent, "orch-a");
  assert.equal(marks("kid-1").under, id);
  assert.equal(marks("orch-b").under, undefined, "the old copy runs under nobody");
  const rows = await one.roster(24, "orch-a");
  assert.ok(rows.some((r) => r.id === id && r.mine), "orch-a's roster shows the fresh copy as its own");
  assert.ok(!rows.some((r) => r.id === "orch-b"));
  await flush(2700);   // the report the first turn queued upward goes out before the next test
});

// a run as runs.ts keeps it: close() closes its inbox, and it leaves the runs (gone) once its CLI has ended, `exitMs` later
const liveRun = (id: string, working: boolean, exitMs = 5) => {
  let over = () => {};
  const r: Record<string, unknown> = { busy: working, working, perms: { size: 0 }, tasks: [], items: { list: [] },
    gone: new Promise<void>((ok) => (over = ok)),
    stop: async () => { log.push("stop"); },
    close: () => { log.push("close"); setTimeout(() => { if (runs[id] === r) delete runs[id]; log.push("gone"); over(); }, exitMs); },
    end: () => { log.push("end"); if (runs[id] === r) delete runs[id]; } };
  return (runs[id] = r);
};
test("F4 (G1, Marco's rule): a press on the side never cuts a person's turn: a working run finishes its turn, then is closed, then told", async () => {
  const r = liveRun("orch-a", true);
  const done = await one.promote("orch-a");
  assert.deepEqual(done, { promoted: true });
  assert.ok(names("orch-a").includes("one_sessions"), "the tools are given at once");
  await flush();
  assert.deepEqual(log, [], "the turn goes on: not stopped, not closed, not told");
  assert.equal(r.reopenAfter, true);
  r.working = false; r.busy = false;
  one.hears({ type: "work.run", sessionId: "orch-a", ended: true });
  await flush();
  assert.deepEqual(log, ["close", "gone", "say orch-a"], "the turn ended first; the say comes after the run is gone");
  assert.match(said.at(-1)!.text, /^<promoted>/);
  assert.equal(r.reopenAfter, false);

  log = []; said = [];
  liveRun("orch-a", false);
  await one.demote("orch-a");
  assert.deepEqual(log, ["close", "gone", "say orch-a"], "idle: closed, never stopped");
  assert.match(said.at(-1)!.text, /^<demoted>/);

  log = []; delete runs["orch-a"];
  await one.promote("orch-a");
  assert.deepEqual(log, ["say orch-a"], "no run: nothing to close");
});

test("F4 (G1): a run that ends mid-turn (stopped by the person, or broke) is told once it is gone; promote then demote in one turn says nothing", async () => {
  liveRun("orch-a", true);
  await one.promote("orch-a");
  delete runs["orch-a"];   // the run's finally: off the runs, then it tells (work.run, not ended)
  one.hears({ type: "work.run", sessionId: "orch-a" });
  await flush();
  assert.deepEqual(log, ["say orch-a"]);

  log = []; said = [];
  liveRun("kid-2", true);
  await one.promote("kid-2");
  await one.demote("kid-2");
  one.hears({ type: "work.run", sessionId: "kid-2", ended: true });
  await flush();
  assert.deepEqual(log, [], "the two presses undo each other: the run keeps the tools it started with");
});

test("G2: the say waits for a slow CLI to leave the runs (past runs.ts's 10 s), and after the ceiling goes through a fresh run anyway", async () => {
  one._reopenMs(200);
  try {
    liveRun("orch-a", false, 80);   // slower than a 50 ms poll: the say must not come before it is gone
    await one.promote("orch-a");
    assert.deepEqual(log, ["close", "gone", "say orch-a"]);

    log = [];
    liveRun("orch-a", false, 10_000);   // never ends within the ceiling
    const t = Date.now();
    await one.demote("orch-a");
    assert.ok(Date.now() - t >= 190, "it waited the ceiling");
    assert.deepEqual(log, ["close", "end", "say orch-a"], "let go, then told: the say opens a fresh run");
    assert.equal(runs["orch-a"], undefined);
  } finally { one._reopenMs(60_000); }
});

test("F6: the kind mark is the one truth: wake makes a missing record and gives the tools; a record with no mark goes", async () => {
  mark("orch-a", { kind: "orchestration" });   // a half state: marked, no record
  assert.ok(one.isOrchestrator("orch-a"));
  one.wakeOrchestrators();
  const o = JSON.parse(readFileSync(join(dir, "orch.json"), "utf8"));
  assert.deepEqual(o.orchestrators.map((x: { sessionId: string }) => x.sessionId), ["orch-a"]);
  assert.deepEqual(names("orch-a"), ["one_sessions", "stop_session"]);
  assert.deepEqual(one.orchestrators(), ["orch-a"]);
  // the other half: a record whose mark is gone is dropped, its tools taken
  await one.promote("kid-2"); mark("kid-2", { kind: null });
  assert.ok(!one.isOrchestrator("kid-2"));
  one.wakeOrchestrators();
  assert.deepEqual(one.orchestrators(), ["orch-a"]);
  assert.deepEqual(names("kid-2"), []);
  // promote on a mark with no record mends it in full
  rmSync(join(dir, "orch.json")); one._reload(); wire(); said = [];
  assert.deepEqual(await one.promote("orch-a"), { promoted: true });
  assert.deepEqual(one.orchestrators(), ["orch-a"]);
  assert.equal(said.length, 1);
});

test("promoted and renewed, an orchestration session is told to hand the work out (#1335)", async () => {
  for (const text of [one.PROMOTED]) {
    assert.match(text, /Hand each piece of work to a session under you: start_session/);
    assert.match(text, /sub agent \(Agent\)/);
    assert.match(text, /A session on this computer is not heavy work/);
    assert.doesNotMatch(text, /your own work;/);
  }
});

test("promote takes in the live sessions it started before (2026-11-17): under it, parent kept; the rest stay as they are", async () => {
  const now = Date.now(), row = (id: string, more = {}) => ({ id, title: id, cwd: dir, updatedAt: now - 60_000, ...more });
  const rows = [row("orch-a"), row("kid-1"), row("kid-2"), row("kid-old", { updatedAt: now - 8 * 86_400_000 }), row("kid-done"),
    row("kid-gone", { gone: true }), row("kid-run"), row("kid-exec"), row("kid-other"), row("orch-b")];
  for (const k of ["kid-1", "kid-2", "kid-old", "kid-done", "kid-gone", "kid-run", "kid-exec", "orch-b"]) mark(k, { parent: "orch-a" });
  mark("kid-done", { done: true }); mark("kid-run", { under: "orch-b" }); mark("kid-other", { parent: "orch-b" }); executors.add("kid-exec");
  mark("orch-a", { under: "orch-b" });   // orch-a runs under orch-b, which it started: orch-b is never taken in under it
  rowsFor = () => rows;
  const r = await one.promote("orch-a");
  assert.deepEqual([r.promoted, r.adopted?.sort()], [true, ["kid-1", "kid-2"]]);
  assert.equal(marks("kid-1").under, "orch-a");
  assert.equal(marks("kid-1").parent, "orch-a", "started by stays as history");
  for (const k of ["kid-old", "kid-done", "kid-gone", "kid-exec", "kid-other", "orch-b"]) assert.equal(marks(k).under, undefined, k);
  assert.equal(marks("kid-run").under, "orch-b", "one another orchestrator runs stays its");
  mark("orch-a", { under: null }); for (const k of ["kid-done", "kid-old", "kid-gone", "kid-exec", "kid-other"]) mark(k, { done: false, parent: null });
});

// #1335: an orchestration session renews before Claude Code compacts it, whatever the window says
const run = (id: string, context: number, window: number, threshold?: number, ended = true) =>
  one.hears({ type: "work.run", sessionId: id, ended, context, window, ...(threshold ? { usage: { threshold } } : {}) } as never);

test("the renewal line is RENEW_AT of where Claude Code compacts, not of the 1M window it reports", async () => {
  assert.equal(one.renewLine({ window: 1_000_000, compactAt: 217_000 }), 130_200);
  assert.equal(one.renewLine({ window: 1_000_000 }), 600_000, "no threshold known: the window, as before");
  assert.equal(one.renewLine({ window: 200_000, compactAt: 250_000 }), 120_000, "never past the window");
  assert.equal(one.renewLine({}), 0);
  await one.promote("orch-a");
  said = [];
  run("orch-a", 120_000, 1_000_000, 217_000); await flush();
  assert.equal(said.length, 0, "under 130k: nothing asked");
  assert.equal(one.kept().orchestrators[0].compactAt, 217_000);
  assert.ok(Math.abs(one.kept().orchestrators[0].renewAt - 0.1302) < 1e-9, "the face draws the line where it renews");
  run("orch-a", 140_000, 1_000_000, 217_000); await flush();
  assert.equal(said.length, 1, "past 130k of a 1M window: the handover is asked (0.6 of 1M would have waited for 600k)");
  assert.match(said[0].text, /## Carried[\s\S]*## Dropped/);
});

test("Claude Code's own compaction mid-turn is held off for an orchestration session, and it renews when the turn ends", async () => {
  await one.promote("orch-a");
  said = [];
  run("orch-a", 100_000, 1_000_000, 217_000); await flush();
  run("orch-a", 218_000, 1_000_000, 217_000, false);   // one long turn passes the line before it ends
  assert.deepEqual(one.compacting("orch-a", "auto"), { hold: true });
  assert.deepEqual(one.compacting("orch-a", "auto"), { hold: true }, "asked again before the next call: still held");
  assert.deepEqual(one.compacting("orch-a", "manual"), { hold: false }, "a compaction asked by hand goes through");
  assert.deepEqual(one.kept().orchestrators[0].compactions?.held, 1, "counted once a turn");
  assert.equal(said.length, 0, "nothing said mid-turn");
  run("orch-a", 230_000, 1_000_000, 217_000); await flush();
  assert.equal(said.length, 1, "the turn ends: the handover is asked");
  assert.equal(said[0].to, "orch-a");
});

test("no room left in the window, or any other session: Claude Code compacts as it would", async () => {
  await one.promote("orch-a");
  run("orch-a", 650_000, 1_000_000, 217_000, false);
  assert.deepEqual(one.compacting("orch-a", "auto"), { hold: false }, "past 0.6 of the real window: let it compact");
  assert.equal(one.kept().orchestrators[0].compactions?.let, 1);
  run("orch-a", 150_000, 200_000, 167_000, false);
  assert.deepEqual(one.compacting("orch-a", "auto"), { hold: false }, "a 200k window has no room to hold");
  assert.deepEqual(one.compacting("plain-session", "auto"), { hold: false });
});

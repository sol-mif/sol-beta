// Core pins (#892): runs.ts, a Run driven by a fake query (no SDK process). What it promises: one live query per open
// session; a message said while the main thread works is kept, shown queued, and handed in at the turn's end in order
// (or early with Read now, or dropped); every turn holds the busy counter until its result; Stop ends the turn and what
// waited behind it, at once; a question for Marco is answered once; a run idle for 15 minutes closes, and nothing
// queued is lost without a note when it closes; Life writing the session refuses the run.
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const T = mkdtempSync(join(tmpdir(), "sol-core-runs-"));
Object.assign(process.env, { HOME: T, SOL_STATE: join(T, "work.json"), SOL_HOME: join(T, "home"), SOL_SESSIONS_DIR: join(T, "sessions"), SOL_TEAM: join(T, "team.json"), SOL_TEAM_OFFLINE: "1" });
const { Run, stopsEngine, roleEnv } = await import("../src/work/runs.ts");
const B = await import("../src/busy.ts");
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

// the CLI: reads the inbox; the test pushes what it answers
function fake(inbox: AsyncIterable<any>) {
  const got: any[] = [], out: any[] = [];
  let wake: (() => void) | null = null, ended = false;
  const push = (m: any) => { out.push(m); wake?.(); };
  void (async () => { for await (const m of inbox) got.push(m); ended = true; wake?.(); })();
  return {
    got, push, end: () => { ended = true; wake?.(); },
    async *[Symbol.asyncIterator]() { for (;;) { if (out.length) { yield out.shift(); continue; } if (ended) return; await new Promise<void>((r) => (wake = r)); wake = null; } },
    interrupt: async () => {}, setModel: async () => {}, setPermissionMode: async () => {}, applyFlagSettings: async () => {},
    getContextUsage: async () => { throw new Error("none"); },
  };
}
const turnStarts = { type: "assistant", parent_tool_use_id: null, message: { id: "a", content: [{ type: "text", text: "on it" }] } };
const result = (subtype = "success", extra: object = {}) => ({ type: "result", subtype, uuid: "r" + Math.random(), ...extra });
let n = 0;
function open() {
  const told: any[] = [];
  const run: any = new Run(`run-${++n}`, T, "m", "high", "default", false, (m: any) => told.push(m));
  const q = fake(run.inbox);
  run.measuring = true;   // the context count (getContextUsage, with its own 20 s timer) is not under test here
  run.q = q; void run.loop();
  return { run, q, told, text: () => q.got.map((m: any) => (typeof m.message.content === "string" ? m.message.content : m.message.content[0].text)) };
}
beforeEach(() => B._reset());

test("said while it works: kept and shown queued, then handed in in order when the turn ends; the counter held throughout", async () => {
  const { run, q, text } = open();
  await run.say({ sessionId: run.id, text: "one" });
  q.push(turnStarts); await flush();
  await run.say({ sessionId: run.id, text: "two" });
  await run.say({ sessionId: run.id, text: "three" });
  await flush();
  assert.deepEqual(text(), ["one"]);
  assert.deepEqual(run.items.list.filter((i: any) => i.queued).map((i: any) => i.text), ["two", "three"]);
  assert.equal(B.busyCount(), 1);
  q.push(result()); await flush();
  assert.deepEqual(text(), ["one", "two", "three"]);
  assert.equal(run.items.list.some((i: any) => i.queued), false);
  assert.equal(run.busy, true, "the held messages begin the next turn at once");
  assert.equal(B.busyCount(), 1);
  q.push(result()); await flush();
  assert.equal(run.busy, false);
  assert.equal(B.busyCount(), 0);
  run.end();
});

test("Read now joins the running turn with priority now; a drop forgets it; an unknown id does nothing", async () => {
  const { run, q } = open();
  await run.say({ sessionId: run.id, text: "one" });
  await run.say({ sessionId: run.id, text: "now please" });
  await run.say({ sessionId: run.id, text: "never mind" });
  const [, a, b] = run.items.list.filter((i: any) => i.kind === "me");
  run.readNow("nope"); run.drop("nope");
  run.readNow(a.id); run.readNow(a.id);
  run.drop(b.id); run.drop(b.id);
  await flush();
  assert.deepEqual(q.got.map((m: any) => [m.message.content, m.priority ?? null]), [["one", null], ["now please", "now"]]);
  assert.equal(run.items.get(b.id).dropped, true);
  q.push(result()); await flush();
  assert.equal(q.got.length, 2, "the dropped one never goes in");
  run.end();
});

test("Stop: idle at once, the counter let go, what waited dropped with a note; a second Stop does nothing", async () => {
  const { run, q, told } = open();
  await run.say({ sessionId: run.id, text: "long job" });
  q.push(turnStarts); await flush();
  await run.say({ sessionId: run.id, text: "after that" });
  await run.stop();
  assert.equal(run.busy, false);
  assert.equal(B.busyCount(), 0);
  assert.match(run.items.list.at(-1).text, /stopped · the queued message was dropped with it/);
  const notes = run.items.list.length;
  await run.stop();
  assert.equal(run.items.list.length, notes);
  assert.ok(told.some((m) => m.type === "work.run" && m.busy === false));
  run.end();
});

test("the session closes with messages still queued: each is marked dropped with a 'not read' note; the hold and the counter go", async () => {
  const { run, q, told } = open();
  await run.say({ sessionId: run.id, text: "one" });
  q.push(turnStarts); await flush();
  await run.say({ sessionId: run.id, text: "queued" });
  assert.equal(B.sessionHolder(run.id), "work");
  q.end(); await flush();   // the CLI went away mid-turn
  const queued = run.items.list.find((i: any) => i.text === "queued");
  assert.equal(queued.dropped, true);
  assert.ok(run.items.list.some((i: any) => i.kind === "note" && /not read: the session closed first/.test(i.text)));
  assert.equal(B.sessionHolder(run.id), null);
  assert.equal(B.busyCount(), 0);
  assert.ok(told.some((m) => m.type === "work.closed" && m.sessionId === run.id));
});

test("a turn that fails is marked failed with its error; the next message clears it", async () => {
  const { run, q } = open();
  await run.say({ sessionId: run.id, text: "x" });
  q.push(turnStarts); q.push(result("error_during_execution", { errors: ["boom"] })); await flush();
  assert.equal(run.failed, true);
  assert.ok(run.items.list.some((i: any) => i.kind === "error" && i.text === "boom"));
  q.push(result("error_during_execution", { stopped: true })); await flush();
  assert.equal(run.failed, false, "a stopped turn is not a failure");
  await run.say({ sessionId: run.id, text: "again" });
  assert.equal(run.failed, false);
  run.end();
});

test("a question for Marco is answered once; an answer after the step was cancelled changes nothing", async () => {
  const { run } = open();
  const ac = new AbortController();
  const p = run.ask("Bash", { command: "ls" }, { signal: ac.signal, toolUseID: "tu1" });
  assert.equal(run.perms.size, 1);
  run.answer("perm:tu1", { allow: true });
  run.answer("perm:tu1", { allow: false });
  assert.equal((await p).behavior, "allow");
  assert.equal(run.items.get("perm:tu1").state, "allow");
  const ac2 = new AbortController();
  const p2 = run.ask("Bash", { command: "rm" }, { signal: ac2.signal, toolUseID: "tu2" });
  ac2.abort();
  run.answer("perm:tu2", { allow: true });
  assert.equal((await p2).behavior, "deny");
  // the engine's own restart is refused with no card
  const p3 = await run.ask("Bash", { command: "launchctl kickstart -k gui/501/com.marco.sol-engine" }, { signal: new AbortController().signal, toolUseID: "tu3" });
  assert.equal(p3.behavior, "deny");
  assert.equal(run.items.get("perm:tu3"), undefined);
  run.end();
});

test("idle: closed 15 minutes after the turn ends, not a minute before; agents at work keep it open, and it closes 15 minutes after they hand back", async () => {
  const { run, q } = open();
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await run.say({ sessionId: run.id, text: "x" });
    q.push(turnStarts); q.push(result()); await flush();
    mock.timers.tick(14 * 60_000);
    assert.equal(run.inbox.closed, false);
    q.push({ type: "system", subtype: "task_started", task_id: "bg1", description: "tests" }); await flush();
    mock.timers.tick(60_000);
    assert.equal(run.inbox.closed, false, "an agent at work keeps the run");
    assert.equal(B.busyCount(), 1, "and holds the counter");
    q.push({ type: "system", subtype: "task_notification", task_id: "bg1" }); await flush();
    assert.deepEqual(B.turnsInFlight().map((j) => j.note), ["waking"], "the end may wake the main thread: held as a turn (#1566)");
    mock.timers.tick(30_000);
    assert.equal(B.busyCount(), 0, "no turn came: the wake lets go after 30 s");
    mock.timers.tick(15 * 60_000 - 30_000 - 1);
    assert.equal(run.inbox.closed, false);
    mock.timers.tick(1);
    assert.equal(run.inbox.closed, true);
  } finally { mock.timers.reset(); run.end(); }
});

test("a message clears the idle timer: no close in the middle of a long turn", async () => {
  const { run, q } = open();
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await run.say({ sessionId: run.id, text: "x" });
    q.push(turnStarts); q.push(result()); await flush();
    mock.timers.tick(10 * 60_000);
    await run.say({ sessionId: run.id, text: "a long one" });
    q.push(turnStarts); await flush();
    mock.timers.tick(60 * 60_000);
    assert.equal(run.inbox.closed, false);
  } finally { mock.timers.reset(); run.end(); }
});

test("a background agent's own frames after the result are not a turn", async () => {
  const { run, q } = open();
  await run.say({ sessionId: run.id, text: "x" });
  q.push(turnStarts); q.push(result()); await flush();
  q.push({ type: "assistant", parent_tool_use_id: "toolu_bg", message: { id: "h", content: [] } }); await flush();
  assert.equal(run.busy, false);
  assert.equal(B.busyCount(), 0);
  run.end();
});

test("Life writing the session refuses the Work run, with who holds it", () => {
  const release = B.lockSession("held-by-life", "life");
  assert.throws(() => new Run("held-by-life", T, "m", "high", "default", false, () => {}), (e: any) => e instanceof B.Held && e.holder === "life");
  release();
});

test("stopsEngine: the engine's own label or pid is refused; its build job, other labels and look-only commands are not", () => {
  assert.equal(stopsEngine("launchctl kickstart -k gui/501/com.marco.sol-engine"), true);
  assert.equal(stopsEngine("launchctl bootout gui/501/com.marco.sol-engine-build"), false);
  assert.equal(stopsEngine("launchctl print gui/501/com.marco.sol-engine"), false);
  assert.equal(stopsEngine("kill -9 4242", 4242), true);
  assert.equal(stopsEngine("kill -9 42420", 4242), false);
  assert.equal(stopsEngine("echo 4242; kill 1", 4242), false);
  assert.equal(stopsEngine("pkill -f dist/index.js"), true);
  assert.equal(stopsEngine("ps aux | grep sol-engine"), false);
  assert.equal(stopsEngine(""), false);
});

test("roleEnv: the role is set, or taken off; the rest of the environment is kept", () => {
  assert.deepEqual(roleEnv("builder", { A: "1", SOL_ROLE: "dev" }), { A: "1", SOL_ROLE: "builder" });
  assert.deepEqual(roleEnv(undefined, { A: "1", SOL_ROLE: "dev" }), { A: "1" });
});

test("#1566: background agents hold the counter as background work; a task's end holds it as a turn until the turn it wakes begins", async () => {
  const { run, q } = open();
  await run.say({ sessionId: run.id, text: "start a background wait" });
  q.push(turnStarts);
  q.push({ type: "system", subtype: "task_started", task_id: "t1", description: "Wait for CI" });
  q.push(result()); await flush();
  assert.equal(run.busy, false);
  assert.deepEqual(B.busyList().map((j) => [j.note, !!j.background]), [["agents", true]], "resting: only background work");
  assert.equal(B.betweenTurns(), true, "a renew may go");
  q.push({ type: "system", subtype: "task_notification", task_id: "t1", status: "completed" }); await flush();
  assert.equal(B.betweenTurns(), false, "the end woke the main thread: a turn is on its way, before its first frame");
  assert.deepEqual(B.turnsInFlight().map((j) => j.note), ["waking"]);
  q.push(turnStarts); await flush();
  assert.deepEqual(B.turnsInFlight().map((j) => j.note), ["default"], "the turn holds it now, the wake let go");
  q.push(result()); await flush();
  assert.equal(B.busyCount(), 0);
  run.end();
});

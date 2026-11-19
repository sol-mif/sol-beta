// runs.ts, around the two cases of #895 and #900: the door (workSay) and the windows inside say().
// #895: a run whose inbox is closed stays in the runs map until the CLI's output ends. workSay waits for that end and
// opens a new run, which resumes the session, so the message is read; when the CLI is too slow to end, the message is
// marked not read, never left looking sent.
// #900: whether a message waits behind the turn is decided after the picker's round trip. A Stop pressed during it
// takes the message with it; a run that ends during it marks the message not read; a turn still running keeps it.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { T, wait, fakeQuery } from "./n10-fake.ts";
const { Run, workSay, settled, getRun, _adopt } = await import("../src/work/runs.ts");
const { busyCount, sessionHolder, _reset } = await import("../src/busy.ts");
// these tests hand workSay their own opener. A runs.ts from before #895 takes no opener and would start a real CLI
// with the test's words, so against one this file stops here, before any test runs
if (typeof _adopt !== "function" || typeof settled !== "function") throw new Error("this file needs the runs.ts of #895 (workSay's opener, settled, _adopt): an older one would start a real CLI");

// what openRun does for a session that is resumed, with the fake CLI in place of the SDK's: the transcript is read
// (a moment), then the run is made and put on the map; every message the CLI reads is a turn
const made: any[] = [];
function opener(shutdownMs: number) {
  const opened: { run: any; q: any }[] = [];
  const open = async (s: any, bus: any) => {
    await wait(5);
    const run: any = new Run(s.sessionId, T, "m", "high", "default", false, bus);
    made.push(run);
    const q = fakeQuery(run.inbox, { auto: true, shutdownMs });
    run.measuring = true;   // the context count (its own 20 s timer) is not under test here
    run.q = q; void run.loop(); _adopt(run);
    opened.push({ run, q });
    return run;
  };
  return { opened, open };
}
const read = (q: any) => q.got.map((m: any) => m.message.content);
const turnStarts = { type: "assistant", parent_tool_use_id: null, message: { id: "a1", content: [{ type: "text", text: "working" }] } };
// what the 15-minute idle timer does when it fires (rest()): the timer is spent, the inbox is closed
const idleClose = (run: any) => { clearTimeout(run.idle); run.inbox.close(); };
beforeEach(() => _reset());
// a test that failed half way leaves no run open and no idle timer holding the process
afterEach(() => { for (const r of made.splice(0)) { clearTimeout(r.idle); if (!r.inbox.closed) r.end(); } });

test("#895: a message for a run that is closing waits for it to end, and a new run reads it", async () => {
  const told: any[] = [];
  const bus = (m: any) => told.push(m);
  const { opened, open } = opener(150);
  const first = await workSay({ sessionId: "closing-1", text: "first" }, bus, open);
  await wait(30);
  assert.equal(first.busy, false, "the first turn ended");
  idleClose(first);
  assert.equal(getRun("closing-1"), first, "the closing run is still the session's run");
  const second = await workSay({ sessionId: "closing-1", text: "second, after a long pause" }, bus, open);
  assert.notEqual(second, first, "a new run was opened");
  assert.equal(opened.length, 2);
  const closed = told.findIndex((m) => m.type === "work.closed"), item = told.findIndex((m) => m.type === "work.item" && m.item.text === "second, after a long pause");
  assert.ok(closed >= 0 && closed < item, "the old run closed before the message was put");
  await wait(30);
  assert.deepEqual(read(opened[0].q), ["first"]);
  assert.deepEqual(read(opened[1].q), ["second, after a long pause"]);
  const it = second.items.list.find((i: any) => i.text === "second, after a long pause");
  assert.ok(it && !it.dropped && !it.queued, "it shows as sent, and it was");
  assert.equal(second.items.list.some((i: any) => i.kind === "note"), false, "no note: nothing was lost");
  assert.equal(getRun("closing-1"), second);
  second.end();
});

test("#895: two messages said at once to a closing run open one new run, and both are read in order", async () => {
  const { opened, open } = opener(100);
  const first = await workSay({ sessionId: "closing-2", text: "first" }, () => {}, open);
  await wait(30);
  idleClose(first);
  const [a, b] = await Promise.all([workSay({ sessionId: "closing-2", text: "two" }, () => {}, open), workSay({ sessionId: "closing-2", text: "three" }, () => {}, open)]);
  assert.equal(a, b);
  assert.equal(opened.length, 2, "one new run, not two");
  await wait(30);
  assert.deepEqual(read(opened[1].q), ["two", "three"]);
  a.end();
});

test("#895: a CLI too slow to end: the message is marked not read, the run is not called busy", async () => {
  const { opened, open } = opener(300);
  const run = await workSay({ sessionId: "closing-3", text: "first" }, () => {}, open);
  await wait(30);
  idleClose(run);
  assert.equal(await settled("closing-3", 20), run, "the wait gave up: the closing run is answered");
  await run.say({ sessionId: run.id, text: "second" });
  const it = run.items.list.find((i: any) => i.text === "second");
  assert.equal(it.dropped, true);
  assert.ok(run.items.list.some((i: any) => i.id === `lost:${it.id}` && /not read: the session closed first/.test(i.text)));
  assert.equal(run.busy, false);
  assert.equal(busyCount(), 0, "nothing holds the renew");
  assert.deepEqual(read(opened[0].q), ["first"]);
  await run.gone;                                      // the CLI ended at last
  assert.equal(getRun("closing-3"), undefined);
  assert.equal(sessionHolder("closing-3"), null);
  assert.equal(await settled("closing-3"), undefined, "the next message opens a new run");
});

test("#895: a run that is not closing is answered at once", async () => {
  const { opened, open } = opener(30);
  const run = await workSay({ sessionId: "live-1", text: "one" }, () => {}, open);
  assert.equal(await settled("live-1"), run);
  assert.equal(await workSay({ sessionId: "live-1", text: "two" }, () => {}, open), run);
  assert.equal(opened.length, 1);
  await wait(30);
  assert.deepEqual(read(opened[0].q), ["one", "two"]);
  run.end();
});

// a run in a turn, and a second message whose model change is on its way to the CLI (the round trip of #900)
async function midRoundTrip(id: string) {
  let model!: () => void;
  const run: any = new Run(id, T, "sonnet", "high", "default", false, () => {});
  made.push(run);
  const q = fakeQuery(run.inbox, { setModel: () => new Promise<void>((r) => (model = r)), shutdownMs: 10 });
  run.measuring = true;
  run.q = q; void run.loop();
  await run.say({ sessionId: run.id, text: "do the long thing" });
  q.push(turnStarts);
  await wait(20);
  const said = run.say({ sessionId: run.id, text: "switch to opus and go on", model: "opus" });
  await wait(20);
  const item = () => run.items.list.find((i: any) => i.text === "switch to opus and go on");
  assert.equal(item().queued, true, "shown queued while the turn runs");
  return { run, q, said, item, model: () => model() };
}

test("#900: the turn still runs after the round trip: the message waits behind it, and goes in when it ends", async () => {
  const { run, q, said, item, model } = await midRoundTrip("round-1");
  model(); await said;
  assert.equal(item().queued, true);
  assert.deepEqual(read(q), ["do the long thing"]);
  q.push({ type: "result", subtype: "success", uuid: "r1" });
  await wait(20);
  assert.deepEqual(read(q), ["do the long thing", "switch to opus and go on"]);
  assert.equal(item().queued, false);
  assert.equal(run.busy, true, "it began the next turn");
  assert.equal(busyCount(), 1);
  q.push({ type: "result", subtype: "success", uuid: "r2" });
  await wait(20);
  assert.equal(run.busy, false);
  assert.equal(busyCount(), 0);
  run.end();
});

test("#900: the turn ended during the round trip: the message begins a turn, and that turn's end lets the counter go", async () => {
  const { run, q, said, item, model } = await midRoundTrip("round-2");
  q.push({ type: "result", subtype: "success", uuid: "r1" });
  await wait(20);
  model(); await said;
  assert.deepEqual(read(q), ["do the long thing"]);
  await wait(20);
  assert.deepEqual(read(q), ["do the long thing", "switch to opus and go on"]);
  assert.equal(item().queued, false);
  assert.ok(!item().dropped);
  assert.equal(run.model, "opus");
  assert.equal(run.busy, true);
  assert.equal(busyCount(), 1);
  q.push(turnStarts); q.push({ type: "result", subtype: "success", uuid: "r2" });
  await wait(20);
  assert.equal(run.busy, false);
  assert.equal(busyCount(), 0);
  run.end();
});

test("#900: Stop pressed during the round trip takes the waiting message with it: never read, the run idle", async () => {
  const { run, q, said, item, model } = await midRoundTrip("round-3");
  await run.stop();
  model(); await said;
  await wait(20);
  assert.deepEqual(read(q), ["do the long thing"]);
  assert.equal(item().dropped, true);
  assert.equal(item().queued, false);
  assert.equal(run.busy, false);
  assert.equal(busyCount(), 0);
  run.end();
});

test("#900: the run ended during the round trip: the message is marked not read", async () => {
  const { run, q, said, item, model } = await midRoundTrip("round-4");
  q.end();                                             // the CLI went away mid-turn
  await run.gone;
  model(); await said;
  assert.deepEqual(read(q), ["do the long thing"]);
  assert.equal(item().dropped, true);
  assert.ok(run.items.list.some((i: any) => i.id === `lost:${item().id}` && /a queued message was not read: the session closed first/.test(i.text)));
  assert.equal(run.busy, false);
  assert.equal(busyCount(), 0);
});

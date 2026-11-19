// fr-07 E6: "stop" under the box (or Escape) stops the turn and every helper at once; a message waiting behind the turn is
// dropped with it, and the talk says "stopped · the queued message was dropped with it". The real Run, on a stand-in
// query (n10-fake.ts) that the test drives frame by frame; nothing is sent to a model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, wait, fakeQuery } from "./n10-fake.ts";
const { Run } = await import("../src/work/runs.ts");
const { busyCount, _reset } = await import("../src/busy.ts");

test("a stop ends the turn and the helpers, and says what it dropped", async () => {
  _reset();
  const told: any[] = [];
  const run: any = new Run("stop-1", T, "m", "high", "default", false, (m: any) => told.push(m));
  const q = fakeQuery(run.inbox);
  let interrupts = 0;
  q.interrupt = async () => { interrupts++; };
  run.measuring = true;   // the context count (its own 20 s timer) is not under test here
  run.q = q; void run.loop();

  // a turn under way, with a background helper at work and a second message said meanwhile
  await run.say({ sessionId: run.id, text: "do the long thing" });
  q.push({ type: "assistant", parent_tool_use_id: null, message: { id: "a1", content: [{ type: "text", text: "working" }] } });
  q.push({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "h1", task_type: "local_agent", subagent_type: "general-purpose", description: "Build the page" }] });
  await wait(20);
  await run.say({ sessionId: run.id, text: "and then this" });
  const waiting = () => run.items.list.find((i: any) => i.text === "and then this");
  assert.equal(run.busy, true);
  assert.equal(run.tasks.length, 1, "the helper is at work");
  assert.equal(waiting().queued, true, "the second message waits behind the turn");
  assert.deepEqual(q.got.map((m: any) => m.message.content), ["do the long thing"], "and is not yet read");
  assert.equal(busyCount(), 2, "the turn and its helper hold the busy counter");

  await run.stop();

  assert.equal(interrupts, 1, "the CLI was told to interrupt, once");
  assert.equal(run.busy, false, "the turn is over");
  assert.equal(run.working, false, "and so is the run: nothing is going on");
  assert.deepEqual(run.tasks, [], "every helper is let go with it");
  assert.deepEqual(run.info().tasks, []);
  assert.equal(busyCount(), 0, "nothing holds the engine's renew any more");
  assert.equal(waiting().dropped, true, "the waiting message is dropped");
  assert.equal(waiting().queued, false);
  const last = run.items.list.at(-1);
  assert.equal(last.kind, "note");
  assert.equal(last.text, "stopped · the queued message was dropped with it");
  const ran = told.filter((m) => m.type === "work.run").at(-1);
  assert.equal(ran.busy, false, "the face was told at once: not running");
  assert.deepEqual(ran.tasks, []);
  await wait(30);
  assert.deepEqual(q.got.map((m: any) => m.message.content), ["do the long thing"], "the dropped message never reaches the model");
  run.end();
});

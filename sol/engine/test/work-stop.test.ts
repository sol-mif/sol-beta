// fr-07 E6: "stop" under the box (or Escape) stops the turn and every helper at once; a message waiting behind the turn
// begins the next turn, its images with it (#1764: until then it was dropped with the turn), and the talk says "stopped · the queued
// message goes next". The real Run, on a stand-in
// query (n10-fake.ts) that the test drives frame by frame; nothing is sent to a model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, wait, fakeQuery } from "./n10-fake.ts";
const { Run } = await import("../src/work/runs.ts");
const { busyCount, _reset } = await import("../src/busy.ts");

// the name is the one fr-07 E6's approved check runs; its words change with the next Approve (#1883)
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
  assert.deepEqual(run.tasks, [], "every helper is let go with it");
  assert.deepEqual(run.info().tasks, []);
  assert.equal(run.busy, true, "the waiting message began the next turn");
  assert.equal(busyCount(), 1, "only that turn holds the engine's renew: the stopped turn and its helper let go");
  assert.ok(!waiting().dropped, "the waiting message is not dropped");
  assert.equal(waiting().queued, false);
  const last = run.items.list.at(-1);
  assert.equal(last.kind, "note");
  assert.equal(last.text, "stopped · the queued message goes next");
  const ran = told.filter((m) => m.type === "work.run").at(-1);
  assert.deepEqual(ran.tasks, [], "the face was told at once: no helper");
  await wait(30);
  assert.deepEqual(q.got.map((m: any) => m.message.content), ["do the long thing", "and then this"], "it reaches the model after the interrupt");
  q.push({ type: "assistant", parent_tool_use_id: null, message: { id: "a2", content: [{ type: "text", text: "on it" }] } });
  await wait(20);
  assert.equal(busyCount(), 1, "counted once");
  q.push({ type: "result", subtype: "success", uuid: "r2" });
  await wait(20);
  assert.equal(busyCount(), 0);
  run.end();
});

// #1764: Marco pasted 7 screenshots with his feedback while the session worked, then pressed stop; the images reached
// attachments/, the message never reached the session
test("a queued message with pasted images survives a stop: it is the next turn, its images with it", async () => {
  _reset();
  const run: any = new Run("stop-2", T, "m", "high", "default", false, () => {});
  const q = fakeQuery(run.inbox);
  q.interrupt = async () => {};
  run.measuring = true;
  run.q = q; void run.loop();
  await run.say({ sessionId: run.id, text: "do the long thing" });
  q.push({ type: "assistant", parent_tool_use_id: null, message: { id: "a1", content: [{ type: "text", text: "working" }] } });
  await wait(20);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  await run.say({ sessionId: run.id, text: "my initial feedback", files: [1, 2].map((i) => ({ name: `shot-${i}.png`, mime: "image/png", dataBase64: png })) });
  assert.equal(q.got.length, 1, "it waits behind the turn");
  await run.stop();
  await wait(30);
  const next = q.got[1];
  assert.ok(next, "the queued message reached the model");
  const content = next.message.content as any[];
  assert.match(content[0].text, /^my initial feedback/);
  assert.deepEqual(content.slice(1).map((c) => [c.type, c.source.media_type]), [["image", "image/png"], ["image", "image/png"]]);
  run.end();
});

test("a stop with nothing waiting: idle at once, the counter let go", async () => {
  _reset();
  const run: any = new Run("stop-3", T, "m", "high", "default", false, () => {});
  const q = fakeQuery(run.inbox);
  q.interrupt = async () => {};
  run.measuring = true;
  run.q = q; void run.loop();
  await run.say({ sessionId: run.id, text: "do the long thing" });
  await wait(20);
  await run.stop();
  assert.equal(run.busy, false);
  assert.equal(run.working, false);
  assert.equal(busyCount(), 0);
  assert.equal(run.items.list.at(-1).text, "stopped");
  run.end();
});

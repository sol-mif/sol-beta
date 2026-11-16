// Core pins (#892): turns.ts. What it promises: a turn starts on the main thread's own frames only; the live background
// tasks follow the SDK's level signal (replace semantics, ambient ones never count) and its edges when there is no level,
// with an edge that says nothing new answering null; the clock keeps its start across work; held messages come out once,
// in order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startsTurn, tasksAfter, sinceAfter, Held, type BgTask } from "../src/work/turns.ts";

test("startsTurn: junk and other kinds are never a turn; a background agent's frame is not one either", () => {
  for (const m of [undefined, null, 0, "assistant", {}, { type: "user" }, { type: "result" }, { type: "system", subtype: "init" }]) assert.equal(startsTurn(m), false);
  assert.equal(startsTurn({ type: "stream_event" }), true);
  assert.equal(startsTurn({ type: "assistant", parent_tool_use_id: "toolu_1" }), false);
  assert.equal(startsTurn({ type: "stream_event", parent_tool_use_id: "toolu_1" }), false);
});

test("tasksAfter: a message that says nothing about tasks is null, whatever its shape", () => {
  const prev: BgTask[] = [{ id: "t1", description: "a" }];
  for (const m of [undefined, null, {}, { type: "assistant" }, { type: "system", subtype: "init" }, { type: "system", subtype: "background_tasks_changed" }, { type: "system", subtype: "background_tasks_changed", tasks: "x" }])
    assert.equal(tasksAfter(m, prev), null);
});

test("the level replaces the list whole; ambient tasks are not activity; an empty level ends them all", () => {
  const prev: BgTask[] = [{ id: "old", description: "gone by now" }];
  const next = tasksAfter({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: 7, description: "tests", subagent_type: "verifier" }, { task_id: "w", ambient: true }, null] }, prev);
  assert.deepEqual(next, [{ id: "7", description: "tests", agent: "verifier" }]);
  assert.deepEqual(tasksAfter({ type: "system", subtype: "background_tasks_changed", tasks: [] }, next!), []);
});

test("the edges: a start twice is one task, an end twice is one end, an end of an unknown task changes nothing", () => {
  let list: BgTask[] = [];
  const start = { type: "system", subtype: "task_started", task_id: "a", description: "build" };
  list = tasksAfter(start, list)!;
  assert.equal(tasksAfter(start, list), null);
  assert.equal(tasksAfter({ type: "system", subtype: "task_started", task_id: "amb", ambient: true }, list), null);
  const end = { type: "system", subtype: "task_notification", task_id: "a" };
  list = tasksAfter(end, list)!;
  assert.deepEqual(list, []);
  assert.equal(tasksAfter(end, list), null);
  assert.equal(tasksAfter({ type: "system", subtype: "task_notification", task_id: "zz" }, list), null);
});

test("the clock: 0 while idle, the start kept while work goes on, a fresh start after a rest", () => {
  assert.equal(sinceAfter(false, 123, 999), 0);
  assert.equal(sinceAfter(true, 0, 500), 500);
  assert.equal(sinceAfter(true, 500, 9_000), 500);
  // a clock that went backwards does not move a kept start
  assert.equal(sinceAfter(true, 500, 100), 500);
});

test("Held: a message taken out early is out once; release empties; a message with no uuid is never taken by an empty id", () => {
  const h = new Held<{ uuid?: string; t: string }>();
  h.keep({ t: "no id" }); h.keep({ uuid: "a", t: "a" }); h.keep({ uuid: "a", t: "a again" });
  assert.equal(h.take(""), undefined);
  assert.equal(h.take("a")?.t, "a");
  assert.equal(h.take("a")?.t, "a again");
  assert.equal(h.take("a"), undefined);
  assert.deepEqual(h.release().map((m) => m.t), ["no id"]);
  assert.equal(h.size, 0);
});

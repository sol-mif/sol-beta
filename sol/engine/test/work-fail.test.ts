// fr-07 F5: a turn that fails. The reason shows as an error line in the talk, the row keeps its failed dot after the run
// ends (the mark outlives the run, state.ts), and the next message clears it. The real Run, on a stand-in query
// (n10-fake.ts) whose turn ends with an error result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, wait, fakeQuery } from "./n10-fake.ts";
const { Run } = await import("../src/work/runs.ts");
const { workState } = await import("../src/work/state.ts");
const { busyCount, _reset } = await import("../src/busy.ts");

const turn = { type: "assistant", parent_tool_use_id: null, message: { id: "a1", content: [{ type: "text", text: "trying" }] } };
const started = (id: string, told: any[]) => {
  const run: any = new Run(id, T, "m", "high", "default", false, (m: any) => told.push(m));
  const q = fakeQuery(run.inbox);
  run.measuring = true;   // the context count (its own 20 s timer) is not under test here
  run.q = q; void run.loop();
  return { run, q };
};

test("a failed turn says why and keeps its dot, until the next message clears it", async () => {
  _reset();
  const told: any[] = [];
  const { run, q } = started("fail-1", told);
  await run.say({ sessionId: run.id, text: "do the thing" });
  q.push(turn);
  q.push({ type: "result", subtype: "error_during_execution", uuid: "r-bad", errors: ["the model could not be reached", "gave up"] });
  await wait(30);

  // the reason is a line in the talk
  const err = run.items.list.find((i: any) => i.kind === "error");
  assert.equal(err.text, "the model could not be reached; gave up");
  assert.ok(told.some((m) => m.type === "work.item" && m.item.kind === "error" && m.item.text === err.text), "and the face was sent it");
  // the turn is over, the run says failed, the dot is kept
  assert.equal(run.busy, false);
  assert.equal(run.failed, true);
  assert.equal(run.info().failed, true);
  assert.equal(told.filter((m) => m.type === "work.run" && m.ended).at(-1).failed, true, "the turn's end told the face it failed");
  assert.equal(workState().marks["fail-1"]?.failed, true, "marked on the session, not only on the run");
  assert.equal(busyCount(), 0);

  // the next message, on the same run: it says failed no more, and the turn that goes well takes the mark off the row
  await run.say({ sessionId: run.id, text: "try again" });
  assert.equal(run.failed, false, "the next say sets failed false");
  assert.equal(run.info().failed, false);
  q.push(turn);
  q.push({ type: "result", subtype: "success", uuid: "r-ok" });
  await wait(30);
  assert.equal(run.failed, false);
  assert.equal(workState().marks["fail-1"]?.failed, undefined, "the dot is gone from the row");
  run.end();
});

test("a failed turn says why and keeps its dot after the run has ended", async () => {
  _reset();
  const told: any[] = [];
  const { run, q } = started("fail-2", told);
  await run.say({ sessionId: run.id, text: "do the thing" });
  q.push(turn);
  q.push({ type: "result", subtype: "error_max_turns", uuid: "r-bad" });   // no reasons given: the subtype is said in words
  await wait(30);
  assert.equal(run.items.list.find((i: any) => i.kind === "error").text, "error max turns");
  run.end();                                           // the run closes (the idle close, or the window's end)
  await run.gone;
  assert.equal(workState().marks["fail-2"]?.failed, true, "the failed dot outlives the run");
  assert.equal(told.at(-1).type, "work.closed");
});

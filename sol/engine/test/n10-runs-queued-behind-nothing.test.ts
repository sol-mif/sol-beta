// runs.ts say(): "said while the main thread works: the run keeps it until the turn ends" (#51). Whether the turn is
// working is read before `await this.adjust(s)`; a picker change (model, mode, effort) makes that await a round trip to
// the CLI. When the turn's result lands during it, release() has already run, and the message is then kept "until the
// turn ends" behind a turn that has ended: it is never handed in, and the run says busy (and holds the busy counter,
// so the engine never renews, and the idle close never comes) until someone presses Read now or Stop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, wait, fakeQuery } from "./n10-fake.ts";
const { Run } = await import("../src/work/runs.ts");
const { busyCount, _reset } = await import("../src/busy.ts");

test("a message sent with a model change as the turn ends is handed in, not stuck queued", async () => {
  _reset();
  let model!: () => void;
  const run: any = new Run("queued-race-1", T, "sonnet", "high", "default", false, () => {});
  const q = fakeQuery(run.inbox, { setModel: () => new Promise<void>((r) => (model = r)) });
  run.measuring = true;   // the context count (its own 20 s timer) is not under test here
  run.q = q; void run.loop();
  await run.say({ sessionId: run.id, text: "do the long thing" });
  q.push({ type: "assistant", parent_tool_use_id: null, message: { id: "a1", content: [{ type: "text", text: "working" }] } });
  await wait(20);
  assert.equal(run.busy, true);
  const said = run.say({ sessionId: run.id, text: "switch to opus and go on", model: "opus" });   // the picker moved too
  await wait(20);                                                // setModel is on its way to the CLI
  q.push({ type: "result", subtype: "success", uuid: "r1" });   // the turn ends meanwhile
  await wait(20);
  model(); await said;
  await wait(50);
  const read = q.got.map((m: any) => m.message.content);
  const item = run.items.list.find((i: any) => i.text === "switch to opus and go on");
  console.log(`busy=${run.busy} counter=${busyCount()} read=${JSON.stringify(read)} item.queued=${item?.queued}`);
  run.end();
  assert.ok(read.includes("switch to opus and go on"), `the message never reached the model; it sits queued behind no turn (busy=${run.busy}, busy counter=${busyCount()})`);
});

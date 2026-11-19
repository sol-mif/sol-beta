// runs.ts: "A run that sits idle for 15 minutes is closed; the next message resumes it from the transcript." The idle
// timer closes the inbox, but the run stays in the runs map (getRun, workSay) until the SDK's output has ended. A message
// said in that window goes into the closed inbox: nobody reads it, it is shown as sent, and no note says it was lost.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, wait, fakeQuery } from "./n10-fake.ts";
const { Run } = await import("../src/work/runs.ts");

test("a message said while the idle close is under way reaches the model, or is marked lost", async () => {
  const told: any[] = [];
  const run: any = new Run("idle-close-1", T, "m", "high", "default", false, (m: any) => told.push(m));
  const q = fakeQuery(run.inbox, { auto: true, shutdownMs: 200 });
  run.measuring = true;   // the context count (its own 20 s timer) is not under test here
  run.q = q; void run.loop();
  await run.say({ sessionId: run.id, text: "first" });
  await wait(50);
  assert.equal(run.busy, false, "the first turn ended");
  run.inbox.close();                                  // what the 15-minute idle timer does (rest())
  await wait(10);
  await run.say({ sessionId: run.id, text: "second, after a long pause" });   // workSay: getRun still returns this run
  await wait(400);                                    // the CLI shuts down, the loop's finally runs, work.closed
  assert.ok(told.some((m) => m.type === "work.closed"), "the run closed");
  const read = q.got.map((m: any) => m.message.content);
  const second = run.items.list.find((i: any) => i.kind === "me" && i.text === "second, after a long pause");
  const lost = run.items.list.some((i: any) => i.kind === "note" && /not read/.test(String(i.text))) || second?.dropped;
  assert.ok(read.includes("second, after a long pause") || lost, `the second message was neither read (read: ${JSON.stringify(read)}) nor marked lost; it shows as sent: ${JSON.stringify(second)}`);
});

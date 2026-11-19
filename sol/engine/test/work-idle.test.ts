// fr-07 F6: a run that sits idle for 15 minutes is closed; the next message resumes it from the transcript, nothing lost.
// The real workSay, openRun and Run.start run on a stand-in query (fake-sdk.ts). The 15 minutes are the test's own: the
// timers are the runner's mock ones, so the idle timer Run.rest() sets fires when the clock is ticked, not before.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { T, sdk, fakeQuery } from "./fake-sdk.ts";
const { workSay, getRun, Run } = await import("../src/work/runs.ts");
(Run.prototype as any).measure = async () => {};   // the context count (its own 20 s timer) is not under test here

const IDLE = 15 * 60 * 1000;
const later = () => new Promise<void>((r) => setImmediate(r));   // the real event loop, which the mock timers leave alone
const settle = async () => { for (let i = 0; i < 20; i++) await later(); };

test("an idle run closes and resumes: after 15 minutes the inbox closes, and the next message opens a run that resumes the session from its transcript", async () => {
  const id = "5a1e0000-1d1e-4b0b-8000-000000000001";   // a real id: the SDK reads a transcript only by a UUID
  const told: any[] = [];
  const bus = (m: any) => told.push(m);
  sdk.calls.length = 0; sdk.made.length = 0;
  sdk.make = (a) => fakeQuery(a.prompt, { auto: true });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const first = await workSay({ sessionId: id, fresh: true, cwd: T, text: "first message" }, bus);
    await settle();
    assert.equal(first.working, false, "the turn is over");
    assert.equal(sdk.calls[0].options.sessionId, id, "the first run started the session");
    assert.equal(sdk.calls[0].options.resume, undefined);

    // the 15 minutes: one tick short and it is open, the last tick and the inbox is closed
    mock.timers.tick(IDLE - 1);
    assert.equal(first.inbox.closed, false, "not yet idle for 15 minutes");
    mock.timers.tick(1);
    assert.equal(first.inbox.closed, true, "idle for 15 minutes: closed");
    // the CLI's shutdown, and the run is off the map and told closed
    await settle(); mock.timers.tick(30); await settle();
    assert.equal(getRun(id), undefined, "the run is gone");
    assert.ok(told.some((m) => m.type === "work.closed" && m.sessionId === id));
    assert.deepEqual(sdk.made[0].got.map((m: any) => m.message.content), ["first message"]);
  } finally { mock.timers.reset(); }

  // what the first run's CLI wrote to the transcript: the Sol user's message and the answer
  const dir = join(T, ".claude", "projects", T.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const line = (o: object) => JSON.stringify({ cwd: T, sessionId: id, ...o }) + "\n";
  writeFileSync(join(dir, `${id}.jsonl`),
    line({ type: "user", uuid: "00000000-0000-4000-8000-000000000001", parentUuid: null, timestamp: "2026-11-18T10:00:00.000Z", message: { role: "user", content: "first message" } }) +
    line({ type: "assistant", uuid: "00000000-0000-4000-8000-000000000002", parentUuid: "00000000-0000-4000-8000-000000000001", timestamp: "2026-11-18T10:00:05.000Z", message: { id: "m1", role: "assistant", content: [{ type: "text", text: "the first answer" }] } }));

  // the next message: a new run, started as a resume of the same session, with the old talk in it
  const second = await workSay({ sessionId: id, text: "second message, after the pause" }, bus);
  assert.equal(sdk.calls.length, 2, "a second query was made");
  assert.equal(sdk.calls[1].options.resume, id, "it resumes the session by its id");
  assert.equal(sdk.calls[1].options.sessionId, undefined, "it is not started again");
  try {
    assert.equal(getRun(id), second);
    await settle();
    assert.deepEqual(sdk.made[1].got.map((m: any) => m.message.content), ["second message, after the pause"], "the new message was read by the resumed run");
    const said = second.items.list.map((i: any) => `${i.kind}:${i.text}`);
    assert.ok(said.includes("me:first message"), `the talk before the pause is still there: ${JSON.stringify(said)}`);
    assert.ok(said.includes("you:the first answer"), `and Claude's answer: ${JSON.stringify(said)}`);
    const it = second.items.list.find((i: any) => i.text === "second message, after the pause");
    assert.ok(it && !it.dropped, "the new message was not dropped");
    assert.equal(second.items.list.some((i: any) => i.kind === "note"), false, "and nothing was lost");
  } finally { second.end(); }   // so a failed check leaves no 15-minute timer holding the process
});

// fr-07 F17: two windows on one session. Every event of a run goes to every window (wire.ts: faces, bus), so both show the
// same run's items, and either can stop it. The real handleWork and Run run, with two stand-in windows on the wire and the
// SDK's query as the stand-in (fake-sdk.ts); nothing is sent to a model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { T, wait, sdk, fakeQuery } from "./fake-sdk.ts";
// addWorkFace starts the engine's sweep (a 10 s timer, then one every 30 minutes, wire.ts startSweep) that nothing in a
// test stops: a long timer must not hold this process open after the test is over
for (const k of ["setTimeout", "setInterval"] as const) { const o: any = (globalThis as any)[k]; (globalThis as any)[k] = (f: any, ms: any, ...r: any[]) => { const h = o(f, ms, ...r); if (ms >= 10_000) h.unref?.(); return h; }; }
const { handleWork, addWorkFace, removeWorkFace } = await import("../src/work/wire.ts");
const { getRun, Run } = await import("../src/work/runs.ts");
const { _stopHolders } = await import("../src/work/holders.ts");
(Run.prototype as any).measure = async () => {};   // the context count (its own 20 s timer) is not under test here

const ID = "two-windows-one-run";
const kinds = new Set(["work.item", "work.run", "work.delta"]);

test("every window sees the run: a say from one reaches both, and a stop from the other ends it", async () => {
  sdk.calls.length = 0; sdk.made.length = 0;
  let interrupts = 0;
  sdk.make = (a) => { const q = fakeQuery(a.prompt); q.interrupt = async () => { interrupts++; }; return q; };
  const seenA: any[] = [], seenB: any[] = [];
  const a = { send: (m: object) => { seenA.push(m); } }, b = { send: (m: object) => { seenB.push(m); } };
  addWorkFace(a); addWorkFace(b);
  const live = (seen: any[]) => seen.filter((m) => kinds.has(m.type) && m.sessionId === ID);
  try {
    // window A says the first line of a new session; the stand-in's turn begins and Claude's words stream
    await handleWork(a, { type: "work.say", sessionId: ID, fresh: true, cwd: T, text: "hello from window A" });
    const q = sdk.made[0];
    assert.equal(sdk.calls.length, 1, "one run for the session");
    q.push({ type: "assistant", parent_tool_use_id: null, message: { id: "m1", content: [{ type: "text", text: "working on it" }] } });
    await wait(30);

    // both windows were sent the same items and the same run state, in the same order
    assert.ok(live(seenA).some((m) => m.type === "work.item" && m.item.kind === "me" && m.item.text === "hello from window A"), "A got the line it said");
    assert.ok(live(seenB).some((m) => m.type === "work.item" && m.item.kind === "me" && m.item.text === "hello from window A"), "B got it too, though it did not say it");
    assert.ok(live(seenB).some((m) => m.type === "work.run" && m.busy === true), "B is told the run is working");
    assert.ok(live(seenB).some((m) => m.type === "work.item" && m.item.kind === "you" && m.item.text === "working on it"), "and Claude's words");
    assert.deepEqual(live(seenB), live(seenA), "the two windows heard exactly the same");

    // each window opening the session is shown the same items
    await handleWork(a, { type: "work.open", sessionId: ID });
    await handleWork(b, { type: "work.open", sessionId: ID });
    const open = (seen: any[]) => seen.find((m) => m.type === "work.thread" && m.sessionId === ID);
    assert.ok(open(seenA).items.length >= 2);
    assert.deepEqual(open(seenB).items, open(seenA).items, "an open window reads the run's items, the same in both");
    assert.equal(open(seenB).run.busy, true);

    // window B, which did not start it, stops it: the run ends, and both windows are told
    const run = getRun(ID)!;
    assert.equal(run.working, true);
    seenA.length = 0; seenB.length = 0;
    await handleWork(b, { type: "work.stop", sessionId: ID });
    assert.equal(interrupts, 1, "the turn was interrupted");
    assert.equal(run.working, false, "the run is not working");
    for (const [who, seen] of [["A", seenA], ["B", seenB]] as const) {
      assert.equal(live(seen).filter((m) => m.type === "work.run").at(-1).busy, false, `${who} is told it stopped`);
      assert.ok(live(seen).some((m) => m.type === "work.item" && m.item.kind === "note" && m.item.text === "stopped"), `${who} shows the stop in the talk`);
    }
    assert.deepEqual(live(seenB), live(seenA));
  } finally { getRun(ID)?.end(); removeWorkFace(a); removeWorkFace(b); _stopHolders(); }
});

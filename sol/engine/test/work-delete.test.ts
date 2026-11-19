// fr-07 F3: delete on a running session. The menu greys it, and the engine refuses it on its own ("stop the session
// before deleting it"): a session with a turn under way, or background agents still at work, is never deleted from
// under its run. The real wire (work.delete) and the SDK's deleteSession run on a temp disk; the run is the n10 test
// kit's (a run with a fake CLI). The greyed menu row is the face's: this checks the engine's refusal.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { T, fakeQuery } from "./n10-fake.ts";
const { Run, getRun, allRuns, _adopt } = await import("../src/work/runs.ts");
const { handleWork } = await import("../src/work/wire.ts");
const { slug } = await import("../src/work/sessions.ts");

const SID = "dddddddd-1111-4222-8333-444444444444";
const dirOf = join(T, ".claude", "projects", slug(T));
mkdirSync(dirOf, { recursive: true });
const file = join(dirOf, `${SID}.jsonl`);
writeFileSync(file, [
  { type: "user", uuid: "u1", parentUuid: null, sessionId: SID, cwd: T, timestamp: "2026-11-18T10:00:00.000Z", message: { role: "user", content: "long task" } },
  { type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: SID, cwd: T, timestamp: "2026-11-18T10:00:05.000Z", message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "on it" }] } },
].map((l) => JSON.stringify(l)).join("\n") + "\n");

const heard: any[] = [];
const face = { send: (m: object) => { heard.push(m); } };
const run: any = new Run(SID, T, "m", "high", "default", false, () => {});
run.measuring = true;   // the context count has its own timer and is not under test
run.q = fakeQuery(run.inbox); void run.loop(); _adopt(run);
after(() => { run.end(); });

test("a running session is not deleted: the engine refuses with the line and the transcript and run stay", async () => {
  run.busy = true;   // a turn is under way
  assert.equal(run.working, true);
  await assert.rejects(handleWork(face, { type: "work.delete", sessionId: SID }), { message: "stop the session before deleting it" });
  assert.ok(existsSync(file), "the transcript is still there");
  assert.equal(getRun(SID), run, "its run was not ended");
  assert.equal(run.inbox.closed, false, "and it still reads its inbox");

  // agents still at work after the turn ended count as running too
  run.busy = false;
  run.tasks = [{ id: "t1", description: "a build in a worktree" }];
  await assert.rejects(handleWork(face, { type: "work.delete", sessionId: SID }), { message: "stop the session before deleting it" });
  assert.ok(existsSync(file));
});

test("a running session is not deleted: once it is stopped the same delete goes through", async () => {
  run.tasks = [];
  assert.equal(run.working, false);
  await handleWork(face, { type: "work.delete", sessionId: SID });
  assert.equal(existsSync(file), false, "the transcript is gone");
  assert.equal(getRun(SID), undefined, "its idle run was ended");
  assert.equal(allRuns().some((r) => r.id === SID), false, "and it is off the list of runs");
});

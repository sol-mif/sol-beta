// fr-07 F11: two messages to a fresh session before its run is made. A fresh session in a side copy takes a moment (git
// makes the copy first), so the second message arrives while the first is still opening the run. runs.ts workSay keeps
// the run being made (`starting`), so one run is made and both messages go to it, in the order they were said. The real
// workSay and openRun run, with a real git repo for the copy; the SDK's query is the stand-in (fake-sdk.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { T, wait, sdk, fakeQuery } from "./fake-sdk.ts";
const { workSay, getRun, allRuns, Run } = await import("../src/work/runs.ts");
(Run.prototype as any).measure = async () => {};   // the context count (its own 20 s timer) is not under test here

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
const repo = join(realpathSync(T), "repo");
mkdirSync(repo);
git(repo, "init", "-q", "-b", "main");
git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "one");

test("one run however many messages arrive: two says at once for a new session call the query once, and both texts reach its inbox in order", async () => {
  sdk.calls.length = 0; sdk.made.length = 0;
  sdk.make = (a) => fakeQuery(a.prompt, { auto: true });
  const told: any[] = [];
  const bus = (m: any) => told.push(m);
  const id = "fresh-start-1";
  // both said before the side copy exists: the first is in the middle of making it when the second comes
  const [a, b] = await Promise.all([
    workSay({ sessionId: id, fresh: true, cwd: repo, worktree: true, text: "first, said at once" }, bus),
    workSay({ sessionId: id, fresh: true, cwd: repo, worktree: true, text: "second, said at once" }, bus),
  ]);
  assert.equal(a, b, "one run answered both");
  assert.equal(sdk.calls.length, 1, "the query was called once, not once per message");
  assert.equal(sdk.calls[0].options.sessionId, id, "it starts the session under the id the face named");
  assert.ok(String(sdk.calls[0].options.cwd).startsWith(join(repo, ".claude", "worktrees")), "in the side copy, which was made once");
  assert.equal(allRuns().filter((r) => r.id === id).length, 1);
  assert.equal(getRun(id), a);
  await wait(50);
  assert.deepEqual(sdk.made[0].got.map((m: any) => m.message.content), ["first, said at once", "second, said at once"], "both read by the one query, in order");
  assert.equal(new Set(told.filter((m) => m.type === "work.item" && m.item.kind === "me").map((m) => m.item.id)).size, 2, "both shown in the talk");
  a.end();
});

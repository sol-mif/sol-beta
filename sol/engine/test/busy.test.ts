import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join, busyCount, idle, whenIdle, lockSession, Held, relockSession, sessionHolder, sessionCwd, busyLine, busyIn, busyList, _reset } from "../src/busy.ts";

beforeEach(_reset);

test("the counter: every job joins, renew waits until the last leaves", async () => {
  assert.equal(idle(), true);
  const a = join("life", "s1"), b = join("term", "t1", "zsh");
  assert.equal(busyCount(), 2);
  assert.match(busyLine(), /life s1 .*term t1 \(zsh\)/);
  let woke = false;
  const p = whenIdle().then(() => { woke = true; });
  a(); a();   // leaving twice is one leave
  await Promise.resolve();
  assert.equal(woke, false);
  b();
  await p;
  assert.equal(woke, true);
  assert.equal(idle(), true);
});

test("the writer lock: one writer per session, re-entrant for the same holder", () => {
  const r1 = lockSession("s1", "work");
  assert.throws(() => lockSession("s1", "life"), Held);
  const r2 = lockSession("s1", "work");
  r1();
  assert.equal(sessionHolder("s1"), "work");
  r2();
  assert.equal(sessionHolder("s1"), null);
  lockSession("s1", "life");
});

test("a fresh Life turn moves its hold onto the session id it learns", () => {
  lockSession("draft-1", "life:a");
  const r = relockSession("draft-1", "sess-9", "life:a");
  assert.equal(sessionHolder("draft-1"), null);
  assert.equal(sessionHolder("sess-9"), "life:a");
  assert.throws(() => lockSession("sess-9", "work"), Held);
  r();
  assert.equal(sessionHolder("sess-9"), null);
});

test("a job that works in a folder says which: busyIn finds it there and under it, not beside it (#182, for #181)", () => {
  const leave = join("life", "t1", "codex", "/Users/m/kaat");
  join("term", "x1", "zsh");   // no folder: never in one
  assert.equal(busyList().find((j) => j.id === "t1")?.cwd, "/Users/m/kaat");
  assert.deepEqual(busyIn("/Users/m/kaat").map((j) => j.id), ["t1"]);
  assert.deepEqual(busyIn("/Users/m").map((j) => j.id), ["t1"], "a folder above it");
  assert.deepEqual(busyIn("/Users/m/kaat-2"), [], "a folder beside it with a longer name");
  assert.deepEqual(busyIn("/Users/m/kaat/web"), [], "a folder inside it is not where it runs");
  leave();
  assert.deepEqual(busyIn("/Users/m/kaat"), []);
});

test("the writer lock keeps the folder, and a fresh talk's move onto its id keeps it too", () => {
  lockSession("draft-2", "life:b", "/Users/m/kaat");
  assert.equal(sessionCwd("draft-2"), "/Users/m/kaat");
  relockSession("draft-2", "thread-2", "life:b");
  assert.equal(sessionCwd("thread-2"), "/Users/m/kaat");
  assert.equal(sessionCwd("draft-2"), null);
});

test("#1566: background work (a run's background agents) does not hold a renew, and counts for everything else", async () => {
  const { betweenTurns, whenBetweenTurns, turnLine, turnsInFlight, letGo } = await import("../src/busy.ts");
  const bg = join("work", "run-1", "agents", "/Users/m/sol", true);
  assert.equal(betweenTurns(), true, "a resting session with a 2 h background Bash is between turns");
  assert.equal(turnLine(), "");
  assert.equal(idle(), false, "the counter still holds it");
  assert.deepEqual(busyIn("/Users/m/sol").map((j) => j.id), ["run-1"], "a move or a rename still waits for it");
  assert.equal(letGo(), false, "letting go still waits for it");
  const turn = join("work", "run-2", "auto");
  assert.equal(betweenTurns(), false);
  assert.deepEqual(turnsInFlight().map((j) => j.id), ["run-2"]);
  assert.match(turnLine(), /^work run-2 \(auto\) \d+s$/, "the renew names the turn, never the background work");
  let woke = false;
  const p = whenBetweenTurns().then(() => { woke = true; });
  await Promise.resolve();
  assert.equal(woke, false);
  turn();
  await p;
  assert.equal(woke, true, "the turn ended: between turns, with the agents still at work");
  assert.equal(busyCount(), 1);
  bg();
});

// Core pins (#892): busy.ts, read as a hostile reader. What it promises: the counter is the one truth about what is live
// (a leave is once, idle wakes every waiter), the writer lock is one holder per session (re-entrant for that holder, a
// release is once and never frees another holder's hold), and letting go is granted only while nothing else is live
// and refuses starts for LET_GO_MS after.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { join, busyCount, idle, whenIdle, onBusy, busyIn, busyLine, lockSession, relockSession, sessionHolder, sessionCwd, Held, letGo, refusedWhileLettingGo, LET_GO_MS, _reset } from "../src/busy.ts";

beforeEach(_reset);

test("two jobs of the same kind and id are two jobs; each leave is once, in any order", () => {
  const a = join("work", "s1"), b = join("work", "s1");
  assert.equal(busyCount(), 2);
  b(); b(); b();
  assert.equal(busyCount(), 1);
  a(); a();
  assert.equal(idle(), true);
});

test("every waiter wakes when the last job leaves, and a waiter asked while idle resolves at once", async () => {
  const leave = join("call", "c1");
  let woke = 0;
  const all = Promise.all([whenIdle(), whenIdle(), whenIdle()]).then(() => { woke = 3; });
  leave();
  await all;
  assert.equal(woke, 3);
  await whenIdle();   // idle: at once
});

test("a listener taken off hears nothing more; the others still do", () => {
  const heard: number[] = [];
  const off = onBusy((j) => heard.push(j.length));
  const other: number[] = [];
  onBusy((j) => other.push(j.length));
  const l = join("term", "t1");
  off();
  l();
  assert.deepEqual(heard, [1]);
  assert.deepEqual(other, [1, 0]);
});

test("busyIn: a folder and the folders under it, never a sibling that shares its prefix; a trailing slash is the same folder", () => {
  join("work", "s1", undefined, "/home/m/sol/engine");
  join("talk", "t1", undefined, "/home/m/sol-two");
  join("call", "c1");   // no folder: never in one
  assert.deepEqual(busyIn("/home/m/sol").map((j) => j.id), ["s1"]);
  assert.deepEqual(busyIn("/home/m/sol/").map((j) => j.id), ["s1"]);
  assert.deepEqual(busyIn("/home/m/sol/engine").map((j) => j.id), ["s1"]);
  assert.deepEqual(busyIn("/home/m/so").map((j) => j.id), []);
});

test("busyLine is empty while idle and names a job by its first eight characters", () => {
  assert.equal(busyLine(), "");
  join("work", "0123456789abcdef", "acceptEdits");
  assert.match(busyLine(Date.now() + 5000), /^work 01234567 \(acceptEdits\) 5s$/);
});

test("the writer lock: another holder is refused with who holds it; nothing changes for the holder", () => {
  const r = lockSession("s1", "life", "/home/m");
  assert.throws(() => lockSession("s1", "work"), (e: unknown) => e instanceof Held && e.holder === "life" && /being written by life/.test(e.message));
  assert.equal(sessionHolder("s1"), "life");
  assert.equal(sessionCwd("s1"), "/home/m");
  r();
  assert.equal(sessionHolder("s1"), null);
  assert.equal(sessionCwd("s1"), null);
});

test("a stale release (called again after the session changed hands) never frees the new holder's hold", () => {
  const r1 = lockSession("s1", "work");
  r1();
  const r2 = lockSession("s1", "life");
  r1();   // the old release, called a second time
  assert.equal(sessionHolder("s1"), "life");
  r2();
  assert.equal(sessionHolder("s1"), null);
});

test("re-entrant depth: the hold goes with the last of its releases, not the first", () => {
  const a = lockSession("s1", "work"), b = lockSession("s1", "work"), c = lockSession("s1", "work");
  b(); a();
  assert.equal(sessionHolder("s1"), "work");
  c();
  assert.equal(sessionHolder("s1"), null);
});

test("relock moves the hold onto the new id, keeping the folder; a 'from' held by another holder stays theirs", () => {
  lockSession("tmp", "life", "/home/m/x");
  const r = relockSession("tmp", "real", "life");
  assert.equal(sessionHolder("tmp"), null);
  assert.equal(sessionHolder("real"), "life");
  assert.equal(sessionCwd("real"), "/home/m/x");
  r();
  lockSession("other", "work");
  const r2 = relockSession("other", "mine", "life");
  assert.equal(sessionHolder("other"), "work");
  assert.equal(sessionHolder("mine"), "life");
  r2();
});

test("letting go: refused while a job lives, allowed past the caller's own kinds, and refuses only starts, only for the window", () => {
  const t = 1_800_000_000_000;
  const l = join("work", "s1");
  assert.equal(letGo(t), false);
  assert.equal(refusedWhileLettingGo("say", t), false, "a refused letGo changes nothing");
  assert.equal(letGo(t, ["work"]), true);
  assert.equal(refusedWhileLettingGo("say", t + 1), true);
  assert.equal(refusedWhileLettingGo("work.start", t + LET_GO_MS - 1), true);
  assert.equal(refusedWhileLettingGo("work.list", t + 1), false, "a look is never refused");
  assert.equal(refusedWhileLettingGo(undefined, t + 1), false);
  assert.equal(refusedWhileLettingGo({ type: "say" }, t + 1), false);
  assert.equal(refusedWhileLettingGo("say", t + LET_GO_MS), false);
  l();
});

// node --test src/*.test.ts (npm test here): a project's sessions under its tab (#906, runs/sessions.ts): which
// group a session sits in, which project its folder belongs to, at most four drawn a group, the "needs you" a waiting
// session puts on its project; and Try's words: what landed, in ordinary words (runs/rules.ts landed, plainTitle).
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf, lineOf, sessionsByProject, fold, markWithSessions, type SessionIn, type RunIn } from "./runs/sessions.ts";
import { ELSEWHERE } from "./runs/sheet.ts";
import { landed, plainTitle, projectMark, type Board } from "./runs/rules.ts";

const NOW = 1_794_290_000_000;
const PROJECTS = [{ id: "jelly", path: "personal/projects/sol" }, { id: "my-jelly", path: "personal/projects/my-sol" }, { id: "school" }];
const s = (id: string, cwd: string, o: Partial<SessionIn> = {}): SessionIn => ({ id, title: `t ${id}`, cwd, updatedAt: NOW - 3600_000, ...o });
const SOL = "/Users/you/personal/projects/sol", MY = "/Users/you/personal/projects/my-sol", SCHOOL = "/Users/you/personal/projects/school";

test("a session's group, the side list's rule: asking first, then at work, then finished and unseen", () => {
  assert.equal(groupOf(s("a", SOL), { sessionId: "a", waiting: 1, busy: true }), "waits", "asking wins over working");
  assert.equal(groupOf(s("a", SOL), { sessionId: "a", busy: true }), "working");
  assert.equal(groupOf(s("a", SOL), { sessionId: "a", tasks: ["x"] }), "working", "agents still at work in the background");
  assert.equal(groupOf(s("a", SOL, { running: true })), "working", "a GPT talk with a turn going");
  assert.equal(groupOf(s("a", SOL, { unread: true })), "unread");
  assert.equal(groupOf(s("a", SOL, { failed: true, unread: true })), "waits", "stopped on an error: it waits on him");
  assert.equal(groupOf(s("a", SOL, { failed: true }), { sessionId: "a", failed: false }), null, "a run that says it is fine wins over the list");
  assert.equal(groupOf(s("a", SOL, { done: true })), null, "read and done: not drawn");
  assert.equal(groupOf(s("a", SOL, { unread: true, archived: true })), null);
  assert.equal(groupOf(s("a", SOL, { unread: true, gone: true })), null);
  assert.equal(groupOf(s("a", SOL, { unread: true, mode: "cowork" })), null, "the team's sessions are Cowork's");
});

test("a session's one line, in words", () => {
  assert.equal(lineOf(s("a", SOL), { sessionId: "a", waiting: 1 }, "waits", NOW), "asks you something");
  assert.equal(lineOf(s("a", SOL), { sessionId: "a", waiting: 2 }, "waits", NOW), "asks you something (2 things)");
  assert.equal(lineOf(s("a", SOL, { failed: true }), undefined, "waits", NOW), "stopped on an error");
  assert.equal(lineOf(s("a", SOL), { sessionId: "a", busy: true, since: NOW - 12 * 60_000 }, "working", NOW), "working for 12 min");
  assert.equal(lineOf(s("a", SOL), { sessionId: "a", busy: true, since: NOW - 5_000 }, "working", NOW), "just started");
  assert.equal(lineOf(s("a", SOL), { sessionId: "a", busy: true }, "working", NOW), "working");
  assert.equal(lineOf(s("a", SOL, { updatedAt: NOW - 2 * 3600_000 }), undefined, "unread", NOW), "finished 2 h ago");
});

test("sessions by project: by folder, in three groups, newest first; a folder of no project on the board is Elsewhere", () => {
  const sessions = [
    s("w1", SOL + "/.claude/worktrees/x"), s("w2", SOL), s("u1", MY, { unread: true, updatedAt: NOW - 60_000 }), s("u2", MY, { unread: true, updatedAt: NOW - 600_000 }),
    s("k", "/Users/you/work/projects/kaat", { unread: true }), s("t", "/tmp/scratch", { unread: true }), s("n", SCHOOL, { done: true }),
  ];
  const runs: RunIn[] = [{ sessionId: "w1", waiting: 1 }, { sessionId: "w2", busy: true, since: NOW - 60_000 }];
  const by = sessionsByProject(sessions, runs, PROJECTS, NOW);
  assert.deepEqual(by.get("jelly")?.waits.map((r) => r.id), ["w1"]);
  assert.deepEqual(by.get("jelly")?.working.map((r) => r.id), ["w2"]);
  assert.deepEqual(by.get("my-jelly")?.unread.map((r) => r.id), ["u1", "u2"], "newest first");
  assert.deepEqual(by.get(ELSEWHERE)?.unread.map((r) => r.id).sort(), ["k", "t"], "Kaat is in the folder table but not on this board");
  assert.equal(by.get("school"), undefined, "nothing to draw: no group");
  assert.equal(by.get("jelly")?.count, 2);
  assert.equal(sessionsByProject([], [], PROJECTS, NOW).size, 0, "no sessions: no Elsewhere tab");
});

test("at most four a group, the rest one count; one over is drawn", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `${i}`, title: "", line: "", group: "unread" as const, at: 0 }));
  assert.deepEqual(fold(rows(4)).more, 0);
  assert.equal(fold(rows(5)).shown.length, 5, "never 'and 1 more'");
  assert.deepEqual([fold(rows(9)).shown.length, fold(rows(9)).more], [4, 5]);
});

test("a project whose session waits on him wears 'needs you'", () => {
  const b: Board = { at: 0, projects: [{ id: "jelly", name: "Jelly" }], lines: [{ id: "l", project: "jelly", name: "L" }], runs: [{ id: "r", line: "l", machine: "nucbox", state: "working" }] };
  const by = sessionsByProject([s("w1", SOL)], [{ sessionId: "w1", waiting: 1 }], PROJECTS, NOW);
  const m = markWithSessions(projectMark(b, "jelly"), by.get("jelly"));
  assert.deepEqual(m, { mark: "needs", word: "needs you", detail: "1 session waiting on you" });
  const calm = markWithSessions(projectMark(b, "jelly"), sessionsByProject([s("u", SOL, { unread: true })], [], PROJECTS, NOW).get("jelly"));
  assert.equal(calm.mark, "working", "an unread session does not ask for him");
  const quiet: Board = { at: 0, projects: [{ id: "jelly", name: "Jelly" }] };
  assert.deepEqual(markWithSessions(projectMark(quiet, "jelly"), sessionsByProject([s("w", SOL)], [{ sessionId: "w", busy: true }], PROJECTS, NOW).get("jelly")),
    { mark: "working", word: "working", detail: "1 session working" }, "a calm project with a session at work is working");
  const both = markWithSessions(projectMark({ ...b, runs: [{ id: "r", line: "l", machine: "nucbox", state: "quiet" }] }, "jelly"), by.get("jelly"));
  assert.equal(both.detail, "1 stalled, 1 session waiting on you");
});

test("Try's words: a PR's title in ordinary words", () => {
  assert.equal(plainTitle("product: a drag that follows the finger, behind stage.whole (#773)"), "A drag that follows the finger");
  assert.equal(plainTitle("product: Home's first screen behind sol.home.whole: one card in front, the others as edges (#791)"), "Home's first screen: one card in front, the others as edges");
  assert.equal(plainTitle("work(stage): the tray (#739) (#746)"), "The tray");
  assert.equal(plainTitle("Fix the dot"), "Fix the dot");
});

test("Try: what landed on the line's branch, newest first, at most five drawn", () => {
  const line = { id: "l", project: "jelly", name: "Build", try: "marco/mine-run" };
  const merged = Array.from({ length: 8 }, (_, i) => ({ number: 800 + i, baseRefName: "marco/mine-run", title: `product: thing ${i} (#${700 + i})`, mergedAt: `2026-11-10T0${i}:00:00Z` }));
  const b: Board = { at: 0, merged: [...merged, { number: 1, baseRefName: "main", title: "elsewhere", mergedAt: "2026-11-10T09:00:00Z" }] };
  assert.deepEqual(landed(b, line), { titles: ["Thing 7", "Thing 6", "Thing 5", "Thing 4", "Thing 3"], more: 3 });
  const done: Board = { at: 0, runs: [{ id: "r", line: "l", machine: "nucbox", state: "done", pr: { number: 9, title: "product: the sheet (#906)" } }] };
  assert.deepEqual(landed(done, line), { titles: ["The sheet"], more: 0 }, "no merged list: the finished builders' PRs");
  assert.deepEqual(landed({ at: 0 }, line), { titles: [], more: 0 });
});

// Cowork, whole (#1173): the anchor's reads, the pure part (team/cowork-shell.ts). What it promises: a person reads no
// issue or PR numbers in For you, only what a change does (its "What to try" line, else its title) and decisions given
// to them; who holds what is per person (`now` issues given to them, their PRs) and neglected work is what nobody
// touched in 3 days; a release carries its PRs' titles, not merge lines, and names who runs it; the guard's log is
// counted by rule for today only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const T = mkdtempSync(join(tmpdir(), "sol-cowork-shell-"));
Object.assign(process.env, { HOME: T, SOL_STATE: join(T, "work.json"), SOL_TEAM: join(T, "team.json"), SOL_TEAM_OFFLINE: "1" });
const S = await import("../src/team/cowork-shell.ts");

test("plain words: no numbers, no area lead", () => {
  assert.equal(S.plainOf("cowork: ask a teammate's agent and it answers on its own (#1166)"), "ask a teammate's agent and it answers on its own");
  assert.equal(S.plainOf("product: the ground for the night's work (#937, part of #936)"), "the ground for the night's work");
  assert.equal(S.plainOf("Fix #12 the bar."), "Fix the bar");
  assert.equal(S.plainOf("product: engine: the lens is one setting (#824)"), "the lens is one setting");
  assert.equal(S.plainOf("ways on by default; SOL_COWORK_WAYS=off turns them off (#1134 #1135)"), "ways on by default; SOL_COWORK_WAYS=off turns them off");
});

test("For you: what it does for users, never a number; drafts wait", () => {
  const body = "Something.\n\n## What to try\n\n- Open Cowork: your agent can ask Frank's agent and get an answer (#1166).\n\n## Risk\nlow";
  const out = S.forYouOf(
    [{ number: 1, title: "cowork: the ask (#1166)", body, url: "u1" }, { number: 2, title: "a draft", isDraft: true }, { number: 3, title: "base: a faster gate (#9)" },
     { number: 5, title: "work: way-own, the engine half (#1118)", body: "## What to try\nNothing to see on a screen. From sol/engine, run the test." },
     { number: 6, title: "x", body: "## What to try\nOpen Home. Then press the bar." }],
    [{ number: 4, title: "decision: should a revert need the author's yes? (#77)", url: "u4" }]);
  assert.deepEqual(out.map((x) => x.what), ["Open Cowork: your agent can ask Frank's agent and get an answer", "a faster gate", "way-own, the engine half", "Open Home", "should a revert need the author's yes?"]);
  assert.deepEqual(out.map((x) => x.kind), ["try", "try", "try", "try", "decide"]);
  assert.ok(out.every((x) => !/#\d/.test(x.what)));
  assert.deepEqual(S.forYouOf([], []), []);
});

test("What to try: the first line under the heading, none when the heading is empty", () => {
  assert.equal(S.tryLineOf("## What to try\n1. Press `Cowork`, then System\n"), "Press Cowork, then System");
  assert.equal(S.tryLineOf("## What to try\n## Risk\nx"), "");
  assert.equal(S.tryLineOf("no heading"), "");
});

test("neglected: open issues nobody touched in 3 days or more, oldest first, with who holds them", () => {
  const now = Date.parse("2026-11-14T18:00:00Z");
  const people = [{ login: "frank", name: "Frank" }, { login: "marco", name: "Marco" }];
  const issues = [
    { number: 1, title: "cowork: the shell (#1)", assignees: [{ login: "marco" }], labels: [{ name: "now" }], updatedAt: "2026-11-14T17:00:00Z" },
    { number: 2, title: "an old thing", assignees: [], labels: [], updatedAt: "2026-11-05T12:00:00Z" },
    { number: 3, title: "held, not now", assignees: [{ login: "frank" }], labels: [], updatedAt: "2026-11-10T12:00:00Z" },
    { number: 4, title: "two days", assignees: [], labels: [], updatedAt: "2026-11-12T12:00:00Z" },
  ];
  const r = S.neglectedOf(people, issues, now);
  assert.deepEqual(Object.keys(r), ["neglected"], "what each person holds is People's read now (#1297)");
  assert.deepEqual(r.neglected.map((x) => [x.n, x.days, x.holder]), [[2, 9, "nobody"], [3, 4, "Frank"]]);
});

test("guardrails: today's lines by rule, held and let through", () => {
  const since = Date.parse("2026-11-14T05:00:00Z");
  const log = [
    { at: "2026-11-13T20:00:00Z", rule: "merge", outcome: "refused" },
    { at: "2026-11-14T15:00:00Z", rule: "merge", outcome: "refused" },
    { at: "2026-11-14T15:01:00Z", rule: "merge", outcome: "refused" },
    { at: "2026-11-14T16:00:00Z", rule: "remote", outcome: "let-through" },
    { at: "2026-11-14T16:00:00Z", rule: "a-new-rule", outcome: "refused" },
  ].map((o) => JSON.stringify(o)).join("\n") + "\nnot json\n";
  assert.deepEqual(S.guardOf(log, since).map((r) => [r.rule, r.held, r.let]), [["merge", 2, 0], ["a-new-rule", 1, 0], ["remote", 0, 1]]);
  assert.equal(S.guardOf(log, since).find((r) => r.rule === "a-new-rule")!.what, "a-new-rule");
  assert.ok(S.STRICT.every((r) => S.RULE_WORDS[r]));
});

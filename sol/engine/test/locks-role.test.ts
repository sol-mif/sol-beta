// Each session's role reaches the guard (#484): kept on the session once, at its start (work/state.ts), given to every
// run as SOL_ROLE (work/runs.ts), never shed by a session it starts (work/wire.ts startFrom), and the same list and order
// of strictness as the guard's (sol/locks/team.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "locks-role-")), "work.json");
const S = await import("../src/work/state.ts");
const { roleEnv } = await import("../src/work/runs.ts");
const { WORK_TOOLS, forCheckout } = await import("../src/work/tools.ts");
const T = await import("../../locks/team.mjs");

test("the engine's roles are the guard's, held the same way: the stricter wins, an unknown one is a builder", () => {
  assert.deepEqual([...S.ROLES], T.ROLES);
  for (const [a, b] of [["builder", "reviewer"], ["triage", "builder"], ["verifier", "first-timer"], [undefined, "verifier"], ["reviewer", undefined], ["admin", "triage"], [undefined, undefined]] as const)
    assert.equal(S.stricter(a, b) ?? "", T.roleOf(a ?? "", b ? `sol-${b}` : ""), `${a} and ${b}`);
  assert.equal(S.stricter("builder", "reviewer"), "builder");
  assert.equal(S.stricter(undefined, "reviewer"), "reviewer");
  assert.equal(S.roleIn("admin"), "builder", "a typo never loosens a lock");
  assert.equal(S.roleIn(""), undefined);
});

test("a session's role is set once, at its start, and never changed or taken off", () => {
  S.mark("s1", { role: "builder" });
  assert.equal(S.workState().marks.s1.role, "builder");
  S.mark("s1", { role: "triage" });
  S.mark("s1", { role: null });
  S.mark("s1", { done: true });
  assert.equal(S.workState().marks.s1.role, "builder");
  S.mark("s2", { role: "nobody" });
  assert.equal(S.workState().marks.s2.role, "builder");
});

test("every run gets SOL_ROLE from its session, and a run with none gets none", () => {
  assert.equal(roleEnv("verifier", { PATH: "/bin" }).SOL_ROLE, "verifier");
  assert.equal(roleEnv(undefined, { PATH: "/bin", SOL_ROLE: "builder" }).SOL_ROLE, undefined);
  assert.equal(roleEnv("builder", { PATH: "/bin" }).PATH, "/bin", "the rest of the engine's environment stays");
});

test("start_session takes the review loop's parts as a role, never a night's", () => {
  const start = WORK_TOOLS.find((t) => t.name === "start_session")!;
  const role = (start.shape as Record<string, { safeParse: (v: unknown) => { success: boolean } }>).role;
  for (const r of ["builder", "verifier", "reviewer", "triage", "first-timer", undefined]) assert.ok(role.safeParse(r).success, String(r));
  for (const r of ["dev", "beta", "hand-in", "admin"]) assert.ok(!role.safeParse(r).success, r);
});

test("outside a checkout of the team's, start_session has no role and says nothing of the dev cycle", () => {
  const start = WORK_TOOLS.find((t) => t.name === "start_session")!;
  const plain = forCheckout(start, false);
  assert.ok(!("role" in plain.shape));
  assert.doesNotMatch(plain.description, /role|dev cycle|review loop|builder|verifier/);
  assert.ok("role" in forCheckout(start, true).shape);
  assert.match(forCheckout(start, true).description, /review loop/);
});

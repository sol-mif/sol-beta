// Dev on green (#1561, part of #1559): a main commit whose required checks are green becomes the dev release at once
// (src/team/ongreen.ts). The pure parts by themselves; the run against real git in a temp repo whose origin is a bare
// temp repo, GitHub (gh) a stand-in that answers the check runs, so nothing here reaches the network or a real branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const { REQUIRED, modeOf, requiredGreen, planOnGreen, onGreen, anchor } = await import("../src/team/ongreen.ts");
type OnGreenDeps = import("../src/team/ongreen.ts").OnGreenDeps;

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const RHYTHM = { release: "09:00", zone: "America/New_York" };
const run = (id: number, name: string, status = "completed", conclusion: string | null = "success", app: { id?: number; slug?: string } = { id: 15368, slug: "github-actions" }) => ({ id, name, status, conclusion, app });
const allGreen = (id = 1) => REQUIRED.map((n, i) => run(id + i, n));

test("the mode (pure): only the word on pushes", () => {
  assert.equal(modeOf({}), "report");
  assert.equal(modeOf({ DEV_ON_GREEN: "report" }), "report");
  assert.equal(modeOf({ DEV_ON_GREEN: "ON" }), "report", "exactly on");
  assert.equal(modeOf({ DEV_ON_GREEN: "on" }), "on");
});

test("the required checks (pure): each of the four there and green; others on the commit do not count", () => {
  assert.deepEqual(REQUIRED, ["engine tests and build", "face build", "the gate", "leak check"], "the four of ci.yml on a push to main; apart runs on the PR only");
  assert.deepEqual(requiredGreen(allGreen()), { green: true });
  assert.deepEqual(requiredGreen([...allGreen(), run(9, "owners and issue", "completed", "failure")]), { green: true }, "a check the ruleset does not require is not read");
  assert.deepEqual(requiredGreen(allGreen().slice(1)), { green: false, why: "no check named engine tests and build on it yet" });
  assert.deepEqual(requiredGreen([]), { green: false, why: `no check named ${REQUIRED.join(", ")} on it yet` });
  assert.deepEqual(requiredGreen([...allGreen().slice(1), run(1, "engine tests and build", "in_progress", null)]), { green: false, why: "its checks are still running (engine tests and build)" });
  assert.deepEqual(requiredGreen([...allGreen().slice(1), run(1, "engine tests and build", "completed", "cancelled")]), { green: false, why: "its checks did not pass (engine tests and build: cancelled)" });
  assert.deepEqual(requiredGreen([...allGreen(), run(20, "the gate", "completed", "failure")]), { green: false, why: "its checks did not pass (the gate: failure)" }, "a rerun's newer run counts");
  assert.deepEqual(requiredGreen([run(1, "a"), run(2, "b")], ["a", "b"]), { green: true }, "another list of names");
  assert.deepEqual(requiredGreen([...allGreen().slice(1), run(1, "engine tests and build", "completed", "success", { id: 999, slug: "some-other-app" })]), { green: false, why: "no check named engine tests and build on it yet" }, "a check run of the name from another app is not the check");
  assert.deepEqual(requiredGreen([...allGreen(), run(40, "the gate", "completed", "failure", { id: 999 })]), { green: true }, "nor does another app's red of the name count");
});

test("the plan (pure): forward only, one tag a minute, in the rhythm's zone", () => {
  const A = "a".repeat(40), B = "b".repeat(40);
  const base = { sha: B, onMain: true, dev: A, devReaches: true, tags: [] as string[], now: new Date("2026-11-19T15:07:30Z"), zone: "America/New_York" };
  assert.deepEqual(planOnGreen(base), { act: "move", tag: "dev-20261119-1007" }, "10:07 in New York");
  assert.deepEqual(planOnGreen({ ...base, dev: "" }), { act: "move", tag: "dev-20261119-1007" }, "no dev yet: it starts here");
  assert.deepEqual(planOnGreen({ ...base, onMain: false }), { act: "skip", why: `${B.slice(0, 7)} is not on main` });
  assert.deepEqual(planOnGreen({ ...base, dev: B }), { act: "skip", why: `dev is on ${B.slice(0, 7)} already` });
  assert.deepEqual(planOnGreen({ ...base, devReaches: false }), { act: "skip", why: `dev (${A.slice(0, 7)}) is past ${B.slice(0, 7)} or beside it: dev moves forward only` });
  assert.deepEqual(planOnGreen({ ...base, tags: ["dev-20261119", "dev-20261119-1007"] }), { act: "skip", why: "dev-20261119-1007 stands already; the next green push gets the next minute" });
  assert.deepEqual(planOnGreen({ ...base, now: new Date("2026-11-20T03:30:00Z") }), { act: "move", tag: "dev-20261119-2230" }, "10:30pm New York is still the 19th");
});

function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-ongreen-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "dev");
  mkdirSync(join(repo, "sol"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "a.txt"), "1\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  const runner = join(top, "runner");   // GitHub's machine: a clone, as actions/checkout leaves it
  git(top, "clone", "-q", origin, runner);
  return { top, origin, repo, runner };
}
const fold = (repo: string, text: string) => {
  writeFileSync(join(repo, "sol", "a.txt"), text);
  git(repo, "add", "-u"); git(repo, "commit", "-qm", `fold ${text.trim()}`);
  git(repo, "push", "-q");
  return git(repo, "rev-parse", "HEAD");
};
function deps(cwd: string, at: string, mode: "report" | "on", checks: Record<string, ReturnType<typeof run>[]>) {
  const said: string[] = [], asked: string[][] = [];
  let now = new Date(at);
  const d: OnGreenDeps = {
    git: (args) => new Promise((ok) => execFile("git", args, { cwd }, (err, out, errOut) =>
      ok({ code: err ? (typeof (err as any).code === "number" ? (err as any).code : 128) : 0, out: String(out) || String(errOut) }))),
    gh: async (args) => {
      asked.push(args);
      const m = /^repos\/sol-mif\/sol-test\/commits\/([0-9a-f]{40})\/check-runs/.exec(args[1] ?? "");
      if (args[0] === "api" && m) { const runs = checks[m[1]] ?? []; return JSON.stringify({ total_count: runs.length, check_runs: runs }); }
      return "";
    },
    now: () => now,
    say: (l) => { said.push(l); },
    mode,
  };
  return { d, said, asked, at: (t: string) => { now = new Date(t); } };
}
const O = { repo: "sol-mif/sol-test", rhythm: RHYTHM };

test("a green commit: report mode says and moves nothing; on mode tags it and moves dev; the second run changes nothing", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-11-19T15:07:30Z", "report", { [main1]: allGreen() });

  let r = await onGreen(x.d, { ...O, sha: main1 });
  assert.deepEqual(r, { ok: true, sha: main1, tag: "dev-20261119-1007", dry: true });
  assert.equal(x.said.at(-1), `would tag dev-20261119-1007 at ${main1.slice(0, 7)} and move dev from nowhere to it (report mode: DEV_ON_GREEN is not "on")`);
  assert.equal(git(f.origin, "tag", "-l"), "", "nothing tagged");
  assert.throws(() => git(f.origin, "rev-parse", "--verify", "-q", "refs/heads/dev"), "dev not made");

  const y = deps(f.runner, "2026-11-19T15:07:30Z", "on", { [main1]: allGreen() });
  r = await onGreen(y.d, { ...O, sha: main1 });
  assert.deepEqual(r, { ok: true, sha: main1, tag: "dev-20261119-1007", moved: true });
  assert.equal(git(f.origin, "rev-parse", "refs/tags/dev-20261119-1007^{commit}"), main1);
  assert.equal(git(f.origin, "cat-file", "-t", "refs/tags/dev-20261119-1007"), "tag", "an annotated tag: who and when");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1, "dev moved to it");

  r = await onGreen(y.d, { ...O, sha: main1 });
  assert.deepEqual(r, { ok: true, sha: main1, skipped: `dev is on ${main1.slice(0, 7)} already` }, "ci and apart both end: the second run finds it done");
  assert.equal(git(f.origin, "tag", "-l"), "dev-20261119-1007");
});

test("not green, red, or checks missing: nothing moves and the reason is said", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-11-19T15:07:30Z", "on", { [main1]: [...allGreen().slice(1), run(1, "engine tests and build", "in_progress", null)] });
  let r = await onGreen(x.d, { ...O, sha: main1 });
  assert.deepEqual(r, { ok: true, sha: main1, skipped: "its checks are still running (engine tests and build)" });
  const y = deps(f.runner, "2026-11-19T15:07:30Z", "on", { [main1]: allGreen().slice(2) });
  r = await onGreen(y.d, { ...O, sha: main1 });
  assert.deepEqual(r, { ok: true, sha: main1, skipped: "no check named engine tests and build, face build on it yet" });
  const z = deps(f.runner, "2026-11-19T15:07:30Z", "on", { [main1]: [...allGreen(), run(30, "leak check", "completed", "failure")] });
  r = await onGreen(z.d, { ...O, sha: main1 });
  assert.deepEqual(r, { ok: true, sha: main1, skipped: "its checks did not pass (leak check: failure)" });
  assert.equal(git(f.origin, "tag", "-l"), "");
  assert.deepEqual(await onGreen(z.d, { ...O, sha: "nope" }), { error: "not a commit: nope" });
});

test("forward only: an older green commit after a newer one moved dev is left; a commit off main is left", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const main2 = fold(f.repo, "3\n");
  const x = deps(f.runner, "2026-11-19T15:07:30Z", "on", { [main1]: allGreen(), [main2]: allGreen(10) });
  assert.deepEqual(await onGreen(x.d, { ...O, sha: main2 }), { ok: true, sha: main2, tag: "dev-20261119-1007", moved: true });
  x.at("2026-11-19T15:08:30Z");
  assert.deepEqual(await onGreen(x.d, { ...O, sha: main1 }), { ok: true, sha: main1, skipped: `dev (${main2.slice(0, 7)}) is past ${main1.slice(0, 7)} or beside it: dev moves forward only` }, "a rerun of the older commit's run");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2);
  // a commit on a branch, never on main
  git(f.repo, "checkout", "-q", "-b", "side");
  writeFileSync(join(f.repo, "sol", "a.txt"), "side\n"); git(f.repo, "commit", "-qam", "side"); git(f.repo, "push", "-q", "-u", "origin", "side");
  const side = git(f.repo, "rev-parse", "HEAD");
  const y = deps(f.runner, "2026-11-19T15:09:30Z", "on", { [side]: allGreen(20) });
  assert.deepEqual(await onGreen(y.d, { ...O, sha: side }), { ok: true, sha: side, skipped: `${side.slice(0, 7)} is not on main` });
  assert.equal(git(f.origin, "tag", "-l").split("\n").length, 1);
});

test("two greens in one minute: the second waits for the next minute", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const main2 = fold(f.repo, "3\n");
  const x = deps(f.runner, "2026-11-19T15:07:30Z", "on", { [main1]: allGreen(), [main2]: allGreen(10) });
  assert.equal((await onGreen(x.d, { ...O, sha: main1 }) as any).tag, "dev-20261119-1007");
  assert.deepEqual(await onGreen(x.d, { ...O, sha: main2 }), { ok: true, sha: main2, skipped: "dev-20261119-1007 stands already; the next green push gets the next minute" });
  x.at("2026-11-19T15:08:10Z");
  assert.deepEqual(await onGreen(x.d, { ...O, sha: main2 }), { ok: true, sha: main2, tag: "dev-20261119-1008", moved: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2);
});

test("the anchor: not before the hour; made where dev is when the day's tag is missing; not when dev still carries a day's anchor; once", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const C: Record<string, ReturnType<typeof run>[]> = { [main1]: allGreen() };
  const x = deps(f.runner, "2026-11-19T13:30:00Z", "on", C);   // 08:30 New York
  assert.deepEqual(await anchor(x.d, O), { ok: true, sha: "", skipped: "not yet" });
  assert.equal(git(f.origin, "tag", "-l"), "");
  x.at("2026-11-19T14:20:00Z");   // 09:20 New York, no dev yet
  assert.deepEqual(await anchor(x.d, O), { error: "there is no dev branch on GitHub yet" });
  x.at("2026-11-18T20:00:00Z");
  assert.equal((await onGreen(x.d, { ...O, sha: main1 }) as any).tag, "dev-20261118-1500");
  const y = deps(f.runner, "2026-11-19T14:20:00Z", "report", {});
  assert.deepEqual(await anchor(y.d, O), { ok: true, sha: main1, tag: "dev-20261119", dry: true }, "report mode says only; a minute tag is not a day's anchor");
  const main2 = fold(f.repo, "3\n");
  C[main2] = allGreen(10);
  x.at("2026-11-19T14:05:00Z");
  assert.equal((await onGreen(x.d, { ...O, sha: main2 }) as any).tag, "dev-20261119-0905");
  x.at("2026-11-19T14:20:00Z");
  assert.deepEqual(await anchor(x.d, O), { ok: true, sha: main2, tag: "dev-20261119", moved: true });
  assert.equal(git(f.origin, "rev-parse", "refs/tags/dev-20261119^{commit}"), main2);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2, "dev stays where it was");
  assert.deepEqual(await anchor(x.d, O), { ok: true, sha: main2, tag: "dev-20261119", skipped: "already" });
  x.at("2026-11-20T14:20:00Z");
  assert.deepEqual(await anchor(x.d, O), { ok: true, sha: main2, skipped: "nothing new" }, "nothing went out since the 19th's anchor");
  assert.equal(git(f.origin, "tag", "-l", "dev-2026112*"), "");
});

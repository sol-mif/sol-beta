// The release (#418, team flow v2): the 9am dev release and the urgent fix (src/team/release.ts). The pure parts by
// themselves; the run against real git in a temp repo whose origin is a bare temp repo, GitHub (gh) a stand-in, so
// nothing here reaches the network, a timer or a real branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devOnly } from "./dev-copy.ts";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const { release, back, devTag, calendarOf, dueDay, urgentOk, releaseKey, checksOn, DEV_TAG, BACK_TAG } = await import("../src/team/release.ts");
const { parseRhythm } = await import("../src/team/tonight.ts");
type ReleaseDeps = import("../src/team/release.ts").ReleaseDeps;
type Rhythm = import("../src/team/tonight.ts").Rhythm;

const RHYTHM = parseRhythm(readFileSync(join(import.meta.dirname, "..", "..", "..", ".sol", "rhythm.json"), "utf8")) as Rhythm;
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

test("the project's rhythm: the release at 09:00 in America/New_York, Marco reviews dev", () => {
  assert.equal(RHYTHM.release, "09:00");
  assert.equal(RHYTHM.zone, "America/New_York");
  assert.ok(RHYTHM.dev.length > 0, "a dev reviewer, who may OK an urgent fix");
});

test("the tag, the timer's calendar, the hour (pure)", () => {
  assert.equal(devTag("2026-10-30"), "dev-20261030");
  assert.equal(devTag("2026-10-30", "14:05"), "dev-20261030-1405");
  assert.match(devTag("2026-10-30"), DEV_TAG);
  assert.match(devTag("2026-10-30", "1405"), DEV_TAG);
  assert.doesNotMatch("stable-20261030-0900", DEV_TAG);
  assert.equal(calendarOf(RHYTHM), "*-*-* 09:00:00 America/New_York");
  assert.equal(calendarOf({ release: "07:30", zone: "" }), "*-*-* 07:30:00", "no zone: the machine's own clock");
  // 9am New York, before and after daylight saving ends (1 Nov 2026): the hour stays 9 on the wall
  assert.equal(dueDay(RHYTHM, new Date("2026-10-30T12:59:00Z")), null, "08:59 EDT: not yet");
  assert.equal(dueDay(RHYTHM, new Date("2026-10-30T13:00:00Z")), "2026-10-30", "09:00 EDT");
  assert.equal(dueDay(RHYTHM, new Date("2026-11-02T13:30:00Z")), null, "08:30 EST: the same UTC hour is early now");
  assert.equal(dueDay(RHYTHM, new Date("2026-11-02T14:00:00Z")), "2026-11-02", "09:00 EST");
  assert.equal(dueDay(RHYTHM, new Date("2026-10-31T03:00:00Z")), "2026-10-30", "11pm New York is still the 30th's day");
});

test("an urgent OK: the day's dev reviewer, a comment starting **Urgent OK**, written today in the rhythm's zone", () => {
  const r = { dev: ["marcocyl04-ux"], zone: "America/New_York" };
  const c = (login: string, body: string, at: string) => ({ author: { login }, body, createdAt: at });
  assert.equal(urgentOk([c("marcocyl04-ux", "**Urgent OK** the login fix", "2026-10-30T15:00:00Z")], r, "2026-10-30"), "marcocyl04-ux");
  assert.equal(urgentOk([c("MarcoCyl04-UX", "**urgent ok**", "2026-10-30T15:00:00Z")], r, "2026-10-30"), "MarcoCyl04-UX", "case does not matter");
  assert.equal(urgentOk([c("franktsai2008-eng", "**Urgent OK**", "2026-10-30T15:00:00Z")], r, "2026-10-30"), null, "not the day's dev reviewer");
  assert.equal(urgentOk([c("marcocyl04-ux", "**Urgent OK**", "2026-10-29T15:00:00Z")], r, "2026-10-30"), null, "yesterday's");
  assert.equal(urgentOk([c("marcocyl04-ux", "**Urgent OK**", "2026-10-31T02:00:00Z")], r, "2026-10-30"), "marcocyl04-ux", "10pm New York is still the 30th");
  assert.equal(urgentOk([c("marcocyl04-ux", "not **Urgent OK**", "2026-10-30T15:00:00Z")], r, "2026-10-30"), null, "it must start the comment");
  assert.equal(urgentOk([{ body: "**Urgent OK**", createdAt: "2026-10-30T15:00:00Z" }], r, "2026-10-30"), null, "no author");
  const ok = [c("marcocyl04-ux", "**Urgent OK**", "2026-10-30T15:00:00Z")];
  assert.equal(urgentOk(ok, r, "2026-10-30", Date.parse("2026-10-30T15:30:00Z")), null, "a commit came after the OK: it did not see it");
  assert.equal(urgentOk(ok, r, "2026-10-30", Date.parse("2026-10-30T14:30:00Z")), "marcocyl04-ux");
});

test("#1231 the runs a push to main started on a commit (pure): green only when there is one and each ended in success, skipped or neutral", () => {
  const run = (id: number, name: string, status: string, conclusion: string | null) => ({ id, name, status, conclusion });
  assert.deepEqual(checksOn([]), { green: false, why: "GitHub shows no checks on it yet" });
  assert.deepEqual(checksOn([run(1, "ci", "completed", "success"), run(2, "pages", "completed", "skipped"), run(3, "lint", "completed", "neutral")]), { green: true });
  assert.deepEqual(checksOn([run(1, "ci", "in_progress", null), run(2, "site", "completed", "success")]), { green: false, why: "its checks are still running (ci)" });
  assert.deepEqual(checksOn([run(1, "ci", "completed", "failure"), run(2, "site", "completed", "cancelled")]), { green: false, why: "its checks did not pass (ci: failure, site: cancelled)" });
  assert.deepEqual(checksOn([run(1, "ci", "completed", "startup_failure"), run(2, "site", "completed", "success")]), { green: false, why: "its checks did not pass (ci: startup_failure)" }, "a workflow that never started is not green");
  assert.deepEqual(checksOn([run(1, "ci", "queued", null), run(2, "site", "completed", "success")]), { green: false, why: "its checks are still running (ci)" }, "seconds after the merge: the run is there before its jobs");
  assert.deepEqual(checksOn([run(1, "ci", "completed", "failure"), run(5, "ci", "completed", "success")]), { green: true }, "a rerun that passed counts, by its newest attempt");
  assert.deepEqual(checksOn([run(5, "ci", "completed", "success"), run(7, "ci", "queued", null)]), { green: false, why: "its checks are still running (ci)" }, "a rerun under way is not green yet");
});

function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-release-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "live");
  mkdirSync(join(repo, "sol"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "a.txt"), "1\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  // the release runner's checkout: a clone, as ~/sol-live is
  const runner = join(top, "runner");
  git(top, "clone", "-q", origin, runner);
  return { top, origin, repo, runner };
}
const fold = (repo: string, text: string) => {
  writeFileSync(join(repo, "sol", "a.txt"), text);
  git(repo, "add", "-u", "--renormalize"); git(repo, "commit", "-qm", `fold ${text.trim()}`);   // by content, not by time (#990, pin.test.ts)
  git(repo, "push", "-q");
  return git(repo, "rev-parse", "HEAD");
};
function deps(cwd: string, at: string, over: Partial<ReleaseDeps> = {}) {
  const said: string[] = [], told: any[] = [], asked: string[][] = [];
  let now = new Date(at);
  const d: ReleaseDeps = {
    git: (args) => new Promise((ok) => execFile("git", args, { cwd }, (err, out, errOut) =>
      ok({ code: err ? (typeof (err as any).code === "number" ? (err as any).code : 128) : 0, out: String(out) || String(errOut) }))),
    gh: async (args) => { asked.push(args); if (args[0] === "api" && args[1] === "repos/sol-mif/sol-test") return "main\n"; return ""; },
    now: () => now,
    dryRun: false,
    say: (l) => { said.push(l); },
    tell: (p) => { told.push(p); return true; },
    ...over,
  };
  return { d, said, told, asked, at: (t: string) => { now = new Date(t); } };
}
const O = { repo: "sol-mif/sol-test", rhythm: RHYTHM };

test("the 9am release: refused before the hour; at it, dev-YYYYMMDD on main, dev moved, every Sol told; once a day", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T12:30:00Z");   // 08:30 in New York

  let r = await release(x.d, O);
  assert.match((r as any).error, /^not yet: the release hour is 09:00 \(America\/New_York\)/);
  assert.equal(git(f.origin, "tag", "-l"), "", "nothing tagged");
  assert.throws(() => git(f.origin, "rev-parse", "--verify", "-q", "refs/heads/dev"), "dev not made");

  x.at("2026-10-30T13:00:30Z");   // 09:00 in New York
  r = await release(x.d, O);
  assert.deepEqual(r, { ok: true, tag: "dev-20261030", sha: main1, told: true });
  assert.equal(git(f.origin, "rev-parse", "refs/tags/dev-20261030^{commit}"), main1);
  assert.equal(git(f.origin, "cat-file", "-t", "refs/tags/dev-20261030"), "tag", "an annotated tag: who and when");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1, "dev moved to it");
  assert.deepEqual(x.told, [{ sha: main1, tag: "dev-20261030", by: "", channel: "dev" }]);

  fold(f.repo, "3\n");   // folded after the release: tomorrow's
  r = await release(x.d, O);
  assert.deepEqual(r, { ok: true, tag: "dev-20261030", sha: main1, already: true }, "the second run of the day changes nothing");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1);
  assert.equal(x.told.length, 1);
});

test("the next morning: what folded since is released; with nothing folded there is no release; a dry run moves nothing", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T13:05:00Z");
  assert.equal((await release(x.d, O) as any).tag, "dev-20261030");

  x.at("2026-10-31T13:05:00Z");
  let r = await release(x.d, O);
  assert.deepEqual(r, { ok: true, tag: "dev-20261030", sha: main1, nothing: true }, "nothing folded: no tag, no word");
  assert.equal(git(f.origin, "tag", "-l"), "dev-20261030");
  assert.equal(x.told.length, 1);

  const main2 = fold(f.repo, "3\n");
  x.at("2026-11-02T14:00:00Z");   // 9am EST, after daylight saving ended
  const dry = deps(f.runner, "2026-11-02T14:00:00Z", { dryRun: true });
  r = await release(dry.d, O);
  assert.deepEqual(r, { ok: true, tag: "dev-20261102", sha: main2, dry: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1, "the dry run moved nothing");
  assert.equal(git(f.origin, "tag", "-l"), "dev-20261030");
  assert.equal(dry.told.length, 0);

  r = await release(x.d, O);
  assert.deepEqual(r, { ok: true, tag: "dev-20261102", sha: main2, told: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2);
});

test("GitHub refusing the push: the local tag is taken back, dev stays, the error says why", async () => {
  const f = fixture();
  fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T13:05:00Z");
  git(f.runner, "fetch", "-q", "origin");
  git(f.runner, "remote", "set-url", "--push", "origin", join(f.top, "gone.git"));
  const r = await release(x.d, O) as any;
  assert.match(r.error, /^GitHub did not take it: /);
  assert.equal(git(f.runner, "tag", "-l", "dev-*"), "", "the local tag was taken back");
  assert.equal(git(f.origin, "tag", "-l"), "");
  assert.equal(x.told.length, 0);
});

test("the urgent fix: off-cycle dev-YYYYMMDD-HHMM, only for a folded PR the day's dev reviewer OK'd today", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T13:05:00Z");
  await release(x.d, O);
  const fix = fold(f.repo, "fixed\n");

  let pr: Record<string, unknown> = { state: "OPEN", baseRefName: "main", mergeCommit: null, comments: [] };
  let checks: unknown = { total_count: 1, workflow_runs: [{ id: 1, name: "ci", status: "completed", conclusion: "success" }] };
  const u = deps(f.runner, "2026-10-30T18:42:00Z", {   // 14:42 in New York
    gh: async (args) => {
      if (args[0] === "api" && args[1] === "repos/sol-mif/sol-test") return "main\n";
      if (args[0] === "pr" && args[1] === "view" && args[2] === "451") return JSON.stringify(pr);
      if (args[0] === "api" && args[1] === `repos/sol-mif/sol-test/actions/runs?head_sha=${fix}&event=push&branch=main&per_page=100`) { if (checks instanceof Error) throw checks; return JSON.stringify(checks); }
      return "";
    },
  });
  const U = { ...O, urgent: 451 };
  assert.match((await release(u.d, U) as any).error, /^#451 is not merged into main/);

  pr = { state: "MERGED", baseRefName: "main", mergeCommit: { oid: fix }, comments: [] };
  assert.match((await release(u.d, U) as any).error, /^#451 has no "\*\*Urgent OK\*\*" from the day's dev reviewer \(marcocyl04-ux\) today/);

  pr.comments = [{ author: { login: "franktsai2008-eng" }, body: "**Urgent OK**", createdAt: "2026-10-30T18:30:00Z" }];
  assert.match((await release(u.d, U) as any).error, /has no "\*\*Urgent OK\*\*"/, "the beta reviewer cannot OK a dev release");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1, "nothing moved so far");

  pr.comments = [{ author: { login: "marcocyl04-ux" }, body: "**Urgent OK** login broke for everyone", createdAt: "2026-10-30T18:30:00Z" }];
  pr.commits = [{ committedDate: "2026-10-30T18:35:00Z" }];
  assert.match((await release(u.d, U) as any).error, /after its last commit/, "a commit pushed after the OK needs a new one");
  pr.commits = [{ committedDate: "2026-10-30T18:10:00Z" }];

  // #1231: the runs that pushing the commit to main started must all have ended green
  checks = { total_count: 1, workflow_runs: [{ id: 1, name: "ci", status: "in_progress", conclusion: null }] };
  assert.equal((await release(u.d, U) as any).error, `main at ${fix.slice(0, 7)} is not green: its checks are still running (ci); an urgent release waits until it is (#1231)`);
  checks = { total_count: 1, workflow_runs: [{ id: 1, name: "ci", status: "completed", conclusion: "failure" }] };
  assert.match((await release(u.d, U) as any).error, /is not green: its checks did not pass \(ci: failure\)/, "14 Nov: #1165 went out red");
  checks = { total_count: 0, workflow_runs: [] };
  assert.match((await release(u.d, U) as any).error, /is not green: GitHub shows no checks on it yet/);
  checks = { total_count: 120, workflow_runs: [{ id: 1, name: "ci", status: "completed", conclusion: "success" }] };
  assert.match((await release(u.d, U) as any).error, /^GitHub has 120 runs on [0-9a-f]{7} and gave 1, so no urgent release$/, "a page short: not read as green");
  checks = new Error("HTTP 502");
  assert.match((await release(u.d, U) as any).error, /^GitHub did not say how main's checks on [0-9a-f]{7} went \(HTTP 502\), so no urgent release$/);
  const dryRed = deps(f.runner, "2026-10-30T18:42:00Z", { gh: u.d.gh, dryRun: true });
  checks = { total_count: 1, workflow_runs: [{ id: 1, name: "ci", status: "completed", conclusion: "failure" }] };
  assert.match((await release(dryRed.d, U) as any).error, /is not green/, "a dry run says the refusal too");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1, "nothing moved while main was not green");
  assert.equal(u.told.length, 0);
  checks = { total_count: 2, workflow_runs: [{ id: 4, name: "ci", status: "completed", conclusion: "success", run_attempt: 2 }, { id: 2, name: "pages", status: "completed", conclusion: "skipped" }] };

  const r = await release(u.d, U);
  assert.deepEqual(r, { ok: true, tag: "dev-20261030-1442", sha: fix, told: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), fix);
  assert.match(git(f.origin, "tag", "-l", "-n1", "dev-20261030-1442"), /urgent dev release dev-20261030-1442, OK'd by marcocyl04-ux \(#451\)/);
  assert.deepEqual(u.told, [{ sha: fix, tag: "dev-20261030-1442", by: "marcocyl04-ux", channel: "dev" }]);

  assert.match((await release(u.d, U) as any).error, /^nothing merged since dev-20261030-1442/, "the same fix twice: nothing new");

  // a fold that never reached the main fetched here is refused
  pr = { state: "MERGED", baseRefName: "main", mergeCommit: { oid: "f".repeat(40) }, comments: pr.comments };
  assert.match((await release(u.d, U) as any).error, /^#451's merge is not on GitHub's main/);
});

test("#1562: a broke mark does not hold the day's release; its revert PR is the night's answer", async () => {
  const f = fixture();
  fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T13:05:00Z");
  assert.equal((await release(x.d, O) as any).tag, "dev-20261030");
  const main2 = fold(f.repo, "3\n");

  // GitHub, as the night left it: #7 (main2, merged since dev-20261030) wears broke; GitHub asked of it at all is down
  const asked: string[][] = [];
  const gh = async (args: string[]) => {
    asked.push(args);
    if (args[0] === "api" && args[1] === "repos/sol-mif/sol-test") return "main\n";
    if (args[0] === "pr" && args[1] === "list" && args.includes("broke")) throw new Error("HTTP 502");
    return "";
  };
  const y = deps(f.runner, "2026-10-31T13:05:00Z", { gh });
  assert.deepEqual(await release(y.d, O), { ok: true, tag: "dev-20261031", sha: main2, told: true }, "released though #7 wears broke");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2);
  assert.ok(!asked.some((a) => a.includes("broke")), "the release asks nothing of broke");
});

test("the rollback (#638): dev back to the release before, refused without a why, logged with who and why; stable untouched", async () => {
  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T13:05:00Z");
  assert.equal((await release(x.d, O) as any).tag, "dev-20261030");
  git(f.repo, "push", "-q", "origin", `${main1}:refs/heads/stable`);   // a stable, which a rollback never moves
  const main2 = fold(f.repo, "3\n");
  x.at("2026-10-31T13:05:00Z");
  assert.equal((await release(x.d, O) as any).tag, "dev-20261031");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2);

  const B = { repo: O.repo, rhythm: RHYTHM, why: "the login broke", by: "marcocyl04-ux" };
  const y = deps(f.runner, "2026-10-31T16:20:00Z");   // 12:20 in New York
  assert.match((await back(y.d, { ...B, why: "  " }) as any).error, /^a rollback says why/);
  assert.match((await back(y.d, { ...B, to: "dev-20261031" }) as any).error, /^dev-20261031 is not older than dev-20261031/, "not to where dev is");
  assert.match((await back(y.d, { ...B, to: "dev-20261101" }) as any).error, /^there is no release dev-20261101/);
  assert.match((await back(y.d, { ...B, to: "stable-20261030" }) as any).error, /is not a dev release/);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2, "nothing moved so far");
  assert.equal(y.told.length, 0);

  const dry = deps(f.runner, "2026-10-31T16:20:00Z", { dryRun: true });
  assert.deepEqual(await back(dry.d, B), { ok: true, tag: "dev-20261030", sha: main1, from: "dev-20261031", log: "back-20261031-1220", dry: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2, "the dry run moved nothing");

  const r = await back(y.d, B);
  assert.deepEqual(r, { ok: true, tag: "dev-20261030", sha: main1, from: "dev-20261031", log: "back-20261031-1220", told: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1, "dev went back");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), main1, "stable as it was");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/main"), main2, "main as it was");
  assert.match("back-20261031-1220", BACK_TAG);
  assert.equal(git(f.origin, "cat-file", "-t", "refs/tags/back-20261031-1220"), "tag", "logged as an annotated tag, as a release is");
  assert.match(git(f.origin, "tag", "-l", "-n1", "back-20261031-1220"), /dev back from dev-20261031 to dev-20261030, by marcocyl04-ux: the login broke/);
  assert.deepEqual(y.told, [{ sha: main1, tag: "dev-20261030", by: "marcocyl04-ux", channel: "dev" }]);
  assert.equal(git(f.origin, "tag", "-l", "dev-*"), "dev-20261030\ndev-20261031", "the bad release's tag stays, as history");

  assert.match((await back(y.d, B) as any).error, /^there is no release before dev-20261030/, "nothing older to go to");

  // the next morning with nothing merged: no release, so dev stays where it went back to
  x.at("2026-11-01T14:05:00Z");
  assert.deepEqual(await release(x.d, O), { ok: true, tag: "dev-20261031", sha: main2, nothing: true });
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main1);
  // a fix merged: the release moves dev forward again
  const main3 = fold(f.repo, "fixed\n");
  x.at("2026-11-02T14:05:00Z");
  assert.deepEqual(await release(x.d, O), { ok: true, tag: "dev-20261102", sha: main3, told: true });
});

test("#639: releases are ordered by their names, never by when a tag was made; a rollback never goes to a commit outside dev", async () => {
  // pure: the day's at the release hour, an urgent one by its own minute, after the day's when made in the same minute
  const k = (t: string) => releaseKey(t, "09:00");
  assert.ok(k("dev-20261030-0700") < k("dev-20261030"), "an urgent fix at 7am comes before the 9am release");
  assert.ok(k("dev-20261030") < k("dev-20261030-0900"), "the same minute: the urgent one after");
  assert.ok(k("dev-20261030-2300") < k("dev-20261031"));
  assert.equal(k("stable-20261030"), "");

  const f = fixture();
  const main1 = fold(f.repo, "2\n");
  const x = deps(f.runner, "2026-10-30T13:05:00Z");
  assert.equal((await release(x.d, O) as any).tag, "dev-20261030");
  const main2 = fold(f.repo, "3\n");
  // the next release's tag made by hand with a date long past: by creation date it would be the oldest
  git(f.runner, "fetch", "-q", "origin", "main");
  execFileSync("git", ["tag", "-a", "dev-20261031", "-m", "dev-20261031", main2], { cwd: f.runner, env: { ...process.env, GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" } });
  git(f.runner, "push", "-q", "--atomic", "origin", "refs/tags/dev-20261031:refs/tags/dev-20261031", `+${main2}:refs/heads/dev`);
  // and an older-named one made now, on a commit dev never had
  git(f.repo, "checkout", "-q", "-b", "side", main1);
  writeFileSync(join(f.repo, "sol", "a.txt"), "side\n");
  git(f.repo, "commit", "-qam", "side");
  const side = git(f.repo, "rev-parse", "HEAD");
  git(f.repo, "tag", "-a", "dev-20261029", "-m", "dev-20261029", side);
  git(f.repo, "push", "-q", "origin", "refs/tags/dev-20261029:refs/tags/dev-20261029");

  const B = { repo: O.repo, rhythm: RHYTHM, why: "the login broke", by: "marcocyl04-ux" };
  const y = deps(f.runner, "2026-10-31T16:20:00Z");
  assert.match((await back(y.d, { ...B, to: "dev-20261029" }) as any).error, /^dev-20261029 is not in dev's history/, "named, outside dev: refused");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2, "nothing moved");
  const dry = deps(f.runner, "2026-10-31T16:20:00Z", { dryRun: true });
  assert.deepEqual(await back(dry.d, B), { ok: true, tag: "dev-20261030", sha: main1, from: "dev-20261031", log: "back-20261031-1220", dry: true },
    "dev-20261031 is the current release by its name, though its tag is the oldest made");
  // the release before by name lies outside dev: refused, never taken
  git(f.runner, "push", "-q", "origin", ":refs/tags/dev-20261030");
  git(f.runner, "tag", "-d", "dev-20261030");
  assert.match((await back(y.d, B) as any).error, /^dev-20261029 is not in dev's history/);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/dev"), main2, "nothing moved");
});

test("sol/release --back: no beta pass, the live checkout promoted only where it is live", { skip: devOnly("sol/release") }, () => {
  const script = readFileSync(join(import.meta.dirname, "..", "..", "release"), "utf8");
  assert.match(script, /bash sol\/release --back \[dev-YYYYMMDD\] --why/);
  const backCase = script.slice(script.indexOf('*" --back "*)'), script.indexOf("esac", script.indexOf('*" --back "*)') + 40) + 200);
  assert.match(backCase, /promote_live/);
  assert.match(backCase, /branch --show-current\)" = live/);
  assert.ok(script.indexOf('*" --back "*)') < script.indexOf('run_node "$eng" beta "${args[@]+"${args[@]}"}" || true'), "a rollback returns before the beta pass");
});

test("the runner and its timer are written, never run: sol/release reads the hour from the rhythm; the unit is filled by hand", { skip: devOnly("sol/release", "sol/engine/systemd/user/sol-release.timer") }, () => {
  const sol = join(import.meta.dirname, "..", "..");
  const script = readFileSync(join(sol, "release"), "utf8");
  assert.match(script, /--install-timer/);
  assert.match(script, /never run by an agent/);
  const timer = readFileSync(join(sol, "engine", "systemd", "user", "sol-release.timer"), "utf8");
  assert.match(timer, /^OnCalendar=@CALENDAR@$/m);
  assert.match(timer, /^Persistent=true$/m);
  const service = readFileSync(join(sol, "engine", "systemd", "user", "sol-release.service"), "utf8");
  assert.match(service, /^ExecStart=\/usr\/bin\/env bash @ROOT@\/sol\/release --promote$/m);
});

test("who has the release (#1150): each team person ✓ when every Sol of theirs runs it or a newer one; else waiting with their Sol's reason, or off; the pings an hour after go to who is behind", async () => {
  const { whoHas, runsOf, countedTag, STALE_MS } = await import("../src/team/runs.ts");
  const { behindPings } = await import("../src/team/release.ts");
  const now = Date.parse("2026-11-14T16:00:00Z");
  const sha = "a".repeat(40);
  const word = (person: string, machine: string, tag: string, more: Record<string, unknown> = {}) =>
    runsOf({ from: { login: person === "marcocyl04-ux" ? "marco" : person }, person, machine, tag, sha, branch: "dev", at: now - 60_000, ...more })!;
  const people = [{ login: "franktsai2008-eng", name: "Frank" }, { login: "w0ngtap", name: "Isaac" }, { login: "marcocyl04-ux", name: "Marco" }];
  const tag = "dev-20261114-1050";
  const words = [
    word("marcocyl04-ux", "macbook", tag, { branch: "mine" }),
    word("marcocyl04-ux", "nucbox", "dev-20261114"),                    // the day's, before the urgent one
    word("franktsai2008-eng", "legion", "dev-20261115"),                // a newer one has it too
    word("w0ngtap", "mini", "dev-20261113", { at: now - STALE_MS - 1 }), // a week and more ago: not heard
  ];
  assert.equal(countedTag(words), "dev-20261115", "the newest any Sol runs");
  assert.deepEqual(whoHas(people, tag, words, now), [
    { login: "franktsai2008-eng", name: "Frank", has: true, to: "franktsai2008-eng" },
    { login: "w0ngtap", name: "Isaac", has: false, why: "off", to: "w0ngtap" },
    { login: "marcocyl04-ux", name: "Marco", has: false, to: "marco" },   // the NucBox is behind and said no reason
  ]);
  const later = [...words, word("marcocyl04-ux", "nucbox", "dev-20261114", { why: "busy", at: now - 30_000 })];
  assert.deepEqual(whoHas(people, tag, later, now)[2], { login: "marcocyl04-ux", name: "Marco", has: false, why: "busy", to: "marco" }, "a Sol's latest word stands for it");
  const all = [...later, word("marcocyl04-ux", "nucbox", tag, { at: now - 10_000 })];
  assert.equal(whoHas(people, tag, all, now)[2].has, true, "each of his Sols runs it");
  assert.equal(runsOf({ from: { login: "marco" }, tag, sha: "nope" }), null, "a word without a commit is no word");
  assert.equal(runsOf({ from: { login: "marco" }, person: "marcocyl04-ux", tag, sha, why: "bored" })?.why, undefined, "a reason not in the set is none");

  assert.deepEqual(behindPings(whoHas(people, tag, later, now), tag), [
    { to: "w0ngtap", line: `your Sol is not on ${tag} yet, an hour after it was released: Sol has not heard from it since` },
    { to: "marco", line: `your Sol is not on ${tag} yet, an hour after it was released: a session's turn was in flight each time it looked since` },
  ]);
  assert.deepEqual(behindPings(whoHas(people.slice(0, 1), tag, all, now), tag), [], "everyone on it: nothing is said");
});

test("who has the release names each person's channel (#1150): Marco ✓ dev · Frank ✓ dev · Isaac waiting (busy) beta", async () => {
  const { whoHas, runsOf } = await import("../src/team/runs.ts");
  const now = Date.parse("2026-11-14T16:00:00Z");
  const sha = "a".repeat(40), tag = "dev-20261114-1050";
  const word = (person: string, machine: string, t: string, more: Record<string, unknown> = {}) =>
    runsOf({ from: { login: person }, person, machine, tag: t, sha, branch: "mine", at: now - 60_000, ...more })!;
  const people = [{ login: "marcocyl04-ux", name: "Marco" }, { login: "franktsai2008-eng", name: "Frank" }, { login: "w0ngtap", name: "Isaac" }];
  const words = [
    word("marcocyl04-ux", "macbook", tag, { channel: "dev" }),
    word("franktsai2008-eng", "legion", tag, { channel: "dev" }),
    word("w0ngtap", "mini", "dev-20261114", { channel: "beta", why: "busy" }),
  ];
  const who = whoHas(people, tag, words, now);
  assert.deepEqual(who.map((p) => [p.name, p.has, p.why, p.channel]), [["Marco", true, undefined, "dev"], ["Frank", true, undefined, "dev"], ["Isaac", false, "busy", "beta"]]);
  const two = [...words, word("marcocyl04-ux", "nucbox", tag, { channel: "beta" })];
  assert.equal(whoHas(people, tag, two, now)[0].channel, "beta/dev", "two Sols on different channels: both named");
  assert.equal(whoHas(people, tag, [word("marcocyl04-ux", "macbook", tag)], now)[0].channel, undefined, "a word from before the switch names none");
  assert.equal(runsOf({ from: { login: "marco" }, tag, sha, channel: "stable" })?.channel, undefined, "a channel not dev or beta is none");
  assert.equal(whoHas(people, tag, words, now)[2].why, "busy");
});

test("a Sol that moved to the release but did not build is not ✓ (#1150): why build, the same tag, waiting, and its ping says so", async () => {
  const { whoHas, runsOf } = await import("../src/team/runs.ts");
  const { behindPings } = await import("../src/team/release.ts");
  const now = Date.parse("2026-11-14T16:00:00Z");
  const sha = "a".repeat(40), tag = "dev-20261114-1050";
  const word = (person: string, machine: string, more: Record<string, unknown> = {}) =>
    runsOf({ from: { login: person }, person, machine, tag, sha, branch: "mine", channel: "dev", at: now - 60_000, ...more })!;
  const people = [{ login: "marcocyl04-ux", name: "Marco" }, { login: "franktsai2008-eng", name: "Frank" }];
  assert.equal(word("marcocyl04-ux", "macbook", { why: "build" }).why, "build", "build is a reason in the set");
  const words = [word("marcocyl04-ux", "macbook", { why: "build" }), word("franktsai2008-eng", "legion")];
  const who = whoHas(people, tag, words, now);
  assert.deepEqual(who.map((p) => [p.name, p.has, p.why]), [["Marco", false, "build"], ["Frank", true, undefined]]);
  assert.deepEqual(behindPings(who, tag), [{ to: "marcocyl04-ux", line: `your Sol is not on ${tag} yet, an hour after it was released: its new code did not build` }]);
  const fixed = [...words, word("marcocyl04-ux", "macbook", { at: now - 10_000 })];
  assert.equal(whoHas(people, tag, fixed, now)[0].has, true, "built at last: its latest word stands, ✓");
});

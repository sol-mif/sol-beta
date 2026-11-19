// The beta pass (#419, team flow v2): stable moves to whole dev releases only (src/team/beta.ts). The pure rules by
// themselves; the pass and the guard against real git in a temp repo whose origin is a bare temp repo, GitHub (gh) a
// stand-in, so nothing here reaches the network, a timer or a real branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const { passBeta, checkStable, passRule, verdictsOf, tagOf, MIN_AGE, signersOf, backupOf } = await import("../src/team/beta.ts");
const { parseRhythm, betaComment } = await import("../src/team/tonight.ts");
type BetaDeps = import("../src/team/beta.ts").BetaDeps;
type Rhythm = import("../src/team/tonight.ts").Rhythm;

const RHYTHM = parseRhythm(readFileSync(join(import.meta.dirname, "..", "..", "..", ".sol", "rhythm.json"), "utf8")) as Rhythm;
const FRANK = RHYTHM.beta[0];
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const gitAt = (cwd: string, when: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_COMMITTER_DATE: when } }).trim();
const c = (login: string, body: string, at: string) => ({ author: { login }, body, createdAt: at });
const pass = (release: string) => betaComment("pass", { release, night: release, changes: [{ number: 7 } as any] }, FRANK);
const hold = (release: string) => betaComment("hold", { release, night: release, changes: [] }, FRANK);

test("the project's rhythm names Frank as the beta reviewer", () => {
  assert.ok(RHYTHM.beta.includes("franktsai2008-eng"));
});

test("the verdicts: the review session's own words, signed by GitHub's author, the last per release (pure)", () => {
  assert.equal(tagOf("2026-10-30"), "dev-20261030");
  assert.equal(tagOf("dev-20261030-1442"), "dev-20261030-1442");
  assert.equal(tagOf("main"), "");
  const v = verdictsOf([
    c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z"),
    c("marcocyl04-ux", hold("2026-10-30"), "2026-10-31T01:20:00Z"),   // not the beta reviewer: signs nothing
    c(FRANK, hold("2026-10-29"), "2026-10-30T01:20:00Z"),
    c(FRANK, pass("2026-10-29"), "2026-10-30T01:10:00Z"),             // earlier than the hold, though listed after
    c(FRANK, "a pass, said loosely", "2026-10-31T02:00:00Z"),
  ], RHYTHM.beta);
  assert.deepEqual(v.get("dev-20261030"), { verdict: "pass", release: "2026-10-30", by: FRANK, at: Date.parse("2026-10-31T01:10:00Z") });
  assert.equal(v.get("dev-20261029")?.verdict, "hold", "the last one counts");
  assert.equal(v.size, 2);
  assert.equal(verdictsOf([c("FrankTsai2008-ENG", pass("2026-10-30"), "2026-10-31T01:10:00Z")], RHYTHM.beta).size, 1, "a login's case does not matter");
});

test("the beta night's backup signs a verdict too (#478): its card opens at the handover when the reviewer has not pressed", () => {
  const backed = { ...RHYTHM, betaBackup: ["marcocyl04-ux"] };
  assert.deepEqual(signersOf(backed), [FRANK, "marcocyl04-ux"]);
  assert.deepEqual(signersOf(RHYTHM), [FRANK]);
  // the night of 2026-10-30 hands over at 23:00 in the rhythm's zone
  const from = backupOf(backed).from("dev-20261030");
  assert.equal(new Date(from).toISOString(), "2026-10-31T03:00:00.000Z");   // 23:00 in New York, still summer time
  const after = new Date(from + 20 * 60_000).toISOString(), before = new Date(from - 20 * 60_000).toISOString();
  const v = verdictsOf([c("marcocyl04-ux", hold("2026-10-30"), after)], backed.beta, backupOf(backed));
  assert.equal(v.get("dev-20261030")?.by, "marcocyl04-ux");
  assert.equal(verdictsOf([c("w0ngtap", hold("2026-10-30"), after)], backed.beta, backupOf(backed)).size, 0);
  // before the handover the backup signs nothing, whichever way it was written (by hand on GitHub too); the reviewer
  // signs at any hour, and a backup's earlier word does not undo the reviewer's later one
  assert.equal(verdictsOf([c("marcocyl04-ux", hold("2026-10-30"), before)], backed.beta, backupOf(backed)).size, 0);
  assert.equal(verdictsOf([c(FRANK, pass("2026-10-30"), before)], backed.beta, backupOf(backed)).get("dev-20261030")?.verdict, "pass");
  assert.equal(verdictsOf([c(FRANK, pass("2026-10-30"), before), c("marcocyl04-ux", hold("2026-10-30"), new Date(from - 60_000).toISOString())], backed.beta, backupOf(backed)).get("dev-20261030")?.verdict, "pass");
  // no backup named: the reviewer alone, as before
  assert.equal(verdictsOf([c("marcocyl04-ux", hold("2026-10-30"), after)], RHYTHM.beta, backupOf(RHYTHM)).size, 0);
  // a backup with no zone does not count: the handover would be each machine's own 23:00
  assert.deepEqual(backupOf({ ...backed, zone: "" }).who, []);
});

test("an edited comment signs nothing, the reviewer's too (#478): anyone with write access can edit another's comment", () => {
  const edited = { ...c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z"), includesCreatedEdit: true };
  assert.equal(verdictsOf([edited], RHYTHM.beta).size, 0);
  assert.equal(verdictsOf([{ ...c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z"), lastEditedAt: "2026-10-31T02:00:00Z" }], RHYTHM.beta).size, 0);
  // an earlier plain verdict stays the one that counts when a later one was edited
  assert.equal(verdictsOf([c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z"), { ...c(FRANK, hold("2026-10-30"), "2026-10-31T01:20:00Z"), includesCreatedEdit: true }], RHYTHM.beta).get("dev-20261030")?.verdict, "pass");
});

test("the rule: whole, signed after the release, a day old, nothing broke (pure)", () => {
  const made = Date.parse("2026-10-30T13:00:30Z");   // 9am New York
  const verdict = { verdict: "pass" as const, release: "2026-10-30", by: FRANK, at: Date.parse("2026-10-31T01:10:00Z") };
  const at = (now: string, more: Partial<Parameters<typeof passRule>[0]> = {}) =>
    passRule({ tag: "dev-20261030", made, verdict, broken: [], now: new Date(now), rhythm: RHYTHM, ...more });
  assert.equal(at("2026-10-31T13:00:05Z"), null, "the next 9am, a few seconds before the full day: it goes");
  assert.match(at("2026-10-31T02:00:00Z")!, /not a day old yet/, "the same night, in New York");
  assert.match(at("2026-10-31T05:00:00Z")!, /not a day old yet/, "after midnight in New York, but 16 hours");
  assert.match(at("2026-10-31T13:00:05Z", { tag: "main" })!, /^only a whole dev release goes to beta, and main is not one/);
  assert.match(at("2026-10-31T13:00:05Z", { verdict: undefined })!, /has no pass from the beta reviewer \(franktsai2008-eng\)/);
  assert.match(at("2026-10-31T13:00:05Z", { verdict: { ...verdict, at: made - 1000 } })!, /written after it was made/, "a pass from before the release saw something else");
  assert.match(at("2026-10-31T13:00:05Z", { verdict: { ...verdict, verdict: "hold" } })!, /was held by franktsai2008-eng: it stays off beta/);
  assert.match(at("2026-10-31T13:00:05Z", { broken: [{ number: 451 }] })!, /holds #451, marked broke/);
  // the clocks go forward (8 Mar 2027): 9am to 9am is 23 hours, still a day
  const spring = Date.parse("2027-03-13T14:00:30Z");
  assert.equal(passRule({ tag: "dev-20270313", made: spring, verdict: { ...verdict, at: spring + 3_600_000 }, broken: [], now: new Date("2027-03-14T13:00:05Z"), rhythm: RHYTHM }), null);
  assert.ok(MIN_AGE < 23 * 3_600_000);
});

// ---- against real git ----

function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-beta-pass-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "work");
  mkdirSync(join(repo, "sol"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "a.txt"), "1\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  git(repo, "push", "-q", "origin", "main:stable");   // stable as the last stamp left it
  const runner = join(top, "runner");
  git(top, "clone", "-q", origin, runner);
  return { top, origin, repo, runner };
}
/** a fold and its dev release, the tag made at `when` (as the release runner makes it) */
function devRelease(repo: string, text: string, tag: string, when: string) {
  writeFileSync(join(repo, "sol", "a.txt"), text);
  git(repo, "add", "-u", "--renormalize"); git(repo, "commit", "-qm", `fold ${text.trim()}`);   // by content, not by time (#990, pin.test.ts)
  gitAt(repo, when, "tag", "-a", tag, "-m", `dev release ${tag}`);
  git(repo, "push", "-q", "origin", "main", `refs/tags/${tag}`);
  return git(repo, "rev-parse", "HEAD");
}
function deps(cwd: string, at: string, gh: { comments: any[]; broke?: any[]; compare?: (oid: string, rel: string) => string; down?: boolean }, over: Partial<BetaDeps> = {}) {
  const said: string[] = [], told: any[] = [], mirrored: string[][] = [];
  let now = new Date(at);
  const d: BetaDeps = {
    git: (args) => new Promise((ok) => execFile("git", args, { cwd }, (err, out, errOut) =>
      ok({ code: err ? (typeof (err as any).code === "number" ? (err as any).code : 128) : 0, out: String(out) || String(errOut) }))),
    gh: async (args) => {
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify([{ number: 452, title: "Night digest" }, { number: 9, title: "Night digest, not quite" }]);
      if (args[0] === "issue" && args[1] === "view" && args[2] === "452") return JSON.stringify({ comments: gh.comments });
      if (args[0] === "pr" && args[1] === "list") { if (gh.down) throw new Error("HTTP 502"); return JSON.stringify(gh.broke ?? []); }
      if (args[0] === "api" && args[1].includes("/compare/")) { const [oid, rel] = args[1].split("/compare/")[1].split("..."); return (gh.compare ?? (() => "ahead"))(oid, rel); }
      throw new Error(`unexpected gh ${args.join(" ")}`);
    },
    now: () => now,
    dryRun: false,
    say: (l) => { said.push(l); },
    mirror: async (sha, tag) => { mirrored.push([sha, tag]); return { beta: "the beta repo runs it too" }; },
    tell: (p) => { told.push(p); return true; },
    ...over,
  };
  return { d, said, told, mirrored, at: (t: string) => { now = new Date(t); } };
}
const O = { repo: "sol-mif/sol-test", rhythm: RHYTHM };

test("the pass: at the next release hour stable moves to exactly the passed dev release, exported and told", async () => {
  const f = fixture();
  const was = git(f.origin, "rev-parse", "refs/heads/stable");
  const d30 = devRelease(f.repo, "2\n", "dev-20261030", "2026-10-30T13:00:30Z");
  devRelease(f.repo, "3\n", "dev-20261031", "2026-10-31T13:00:20Z");   // the next morning's, not yet reviewed
  const comments = [c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z")];

  const early = deps(f.runner, "2026-10-31T02:00:00Z", { comments });
  assert.match((await passBeta(early.d, O) as any).error, /dev-20261030 is not a day old yet/);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), was, "nothing moved");

  const dry = deps(f.runner, "2026-10-31T13:00:40Z", { comments }, { dryRun: true });
  assert.deepEqual(await passBeta(dry.d, O), { ok: true, tag: "dev-20261030", sha: d30, by: FRANK, product: "v1", dry: true });
  assert.match(dry.said.join("\n"), /would move stable to dev-20261030 \(\w+\), passed by \S+, tag it v1,/, "the dry run names the number (#1300)");
  assert.equal(git(f.origin, "tag", "-l", "v*"), "", "and makes none");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), was, "the dry run moved nothing");
  assert.equal(dry.mirrored.length + dry.told.length, 0);
  assert.match(dry.said.join("\n"), /, export it to sol-beta and tell every Sol/);
  const bare = deps(f.runner, "2026-10-31T13:00:40Z", { comments }, { dryRun: true, exports: async () => false });
  await passBeta(bare.d, O);
  assert.match(bare.said.join("\n"), /skip the export to sol-beta \(no beta remote\)/, "with no beta remote the dry run says so (#1305)");

  const x = deps(f.runner, "2026-10-31T13:00:40Z", { comments });
  const r = await passBeta(x.d, O);
  assert.deepEqual(r, { ok: true, tag: "dev-20261030", sha: d30, by: FRANK, product: "v1", told: true, beta: "the beta repo runs it too" });
  assert.equal(git(f.origin, "rev-parse", "refs/tags/v1^{commit}"), d30, "v1 is the same commit as its dev-* tag (#1300)");
  assert.equal(git(f.origin, "cat-file", "-t", "refs/tags/v1"), "tag", "an annotated tag, as the dev-* ones are");
  assert.equal(git(f.origin, "rev-parse", "refs/tags/dev-20261030^{commit}"), d30, "the dev-* tag is as it was");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), d30, "stable is the passed release, not main");
  assert.deepEqual(x.mirrored, [[d30, "dev-20261030"]]);
  assert.deepEqual(x.told, [{ sha: d30, tag: "dev-20261030", by: FRANK }], "no channel: a beta release");

  assert.deepEqual(await passBeta(x.d, O), { ok: true, tag: "dev-20261030", sha: d30, by: FRANK, product: "v1", already: true }, "twice changes nothing");
  assert.equal(git(f.origin, "tag", "-l", "v*"), "v1", "and makes no second number");
  assert.equal(x.mirrored.length, 1);

  const g = deps(f.runner, "2026-10-31T13:01:00Z", { comments });
  assert.deepEqual(await checkStable(g.d, { ...O, sha: d30, before: was }), { ok: true, tag: "dev-20261030", by: FRANK }, "the guard agrees");
});

test("a hold leaves stable as it is; the next night's pass carries the held day", async () => {
  const f = fixture();
  const was = git(f.origin, "rev-parse", "refs/heads/stable");
  devRelease(f.repo, "2\n", "dev-20261030", "2026-10-30T13:00:30Z");
  const comments = [c(FRANK, hold("2026-10-30"), "2026-10-31T01:10:00Z")];
  const x = deps(f.runner, "2026-10-31T13:00:40Z", { comments });
  assert.deepEqual(await passBeta(x.d, O), { ok: true, nothing: true, held: "dev-20261030" });
  assert.match(x.said.join("\n"), /dev-20261030 was held: stable stays as it is/);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), was);
  assert.match((await passBeta(x.d, { ...O, tag: "dev-20261030" }) as any).error, /was held by franktsai2008-eng/, "named by hand: still held");

  const d31 = devRelease(f.repo, "3\n", "dev-20261031", "2026-10-31T13:00:20Z");
  comments.push(c(FRANK, pass("2026-10-31"), "2026-11-01T01:10:00Z"));
  x.at("2026-11-01T13:00:40Z");
  const r = await passBeta(x.d, O) as any;
  assert.equal(r.tag, "dev-20261031");
  assert.equal(r.product, "v1", "a held release takes no number: the first pass is v1");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), d31);
  assert.equal(git(f.origin, "show", "refs/heads/stable:sol/a.txt"), "3", "it holds the held day too");
});

test("refused: not signed by the beta reviewer, a change marked broke, GitHub not answering, not a dev release", async () => {
  const f = fixture();
  const was = git(f.origin, "rev-parse", "refs/heads/stable");
  const d30 = devRelease(f.repo, "2\n", "dev-20261030", "2026-10-30T13:00:30Z");
  const now = "2026-10-31T13:00:40Z";

  const marco = deps(f.runner, now, { comments: [c("marcocyl04-ux", pass("2026-10-30"), "2026-10-31T01:10:00Z")] });
  assert.deepEqual(await passBeta(marco.d, O), { ok: true, nothing: true }, "the dev reviewer's pass signs nothing");
  assert.match((await passBeta(marco.d, { ...O, tag: "dev-20261030" }) as any).error, /has no pass from the beta reviewer/);

  const comments = [c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z")];
  const oid = "a".repeat(40);
  const broke = deps(f.runner, now, { comments, broke: [{ number: 451, title: "login", url: "u", mergeCommit: { oid } }], compare: () => "ahead" });
  assert.match((await passBeta(broke.d, O) as any).error, /holds #451, marked broke: it stays off beta until the label comes off/);
  const elsewhere = deps(f.runner, now, { comments, broke: [{ number: 451, title: "login", url: "u", mergeCommit: { oid } }], compare: () => "behind" });
  assert.equal((await passBeta(elsewhere.d, { ...O, tag: "dev-20261030" }) as any).ok, true);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), d30, "a broken change the release does not hold does not stop it");
  git(f.origin, "update-ref", "refs/heads/stable", was);   // back, for the rest
  git(f.runner, "fetch", "-q", "origin", "+refs/heads/stable:refs/remotes/origin/stable");

  const down = deps(f.runner, now, { comments, down: true });
  assert.match((await passBeta(down.d, O) as any).error, /GitHub did not say which changes are marked broke/);

  assert.match((await passBeta(down.d, { ...O, tag: "main" }) as any).error, /^only a whole dev release goes to beta, and main is not one/);
  assert.match((await passBeta(down.d, { ...O, tag: "dev-20991231" }) as any).error, /is not a dev release on GitHub/);
  assert.match((await passBeta(down.d, { ...O, rhythm: { ...RHYTHM, beta: [] } }) as any).error, /names no beta reviewer/);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), was, "nothing moved");
});

test("stable only moves forward: an older passed release is refused once stable is past it", async () => {
  const f = fixture();
  const d30 = devRelease(f.repo, "2\n", "dev-20261030", "2026-10-30T13:00:30Z");
  const d31 = devRelease(f.repo, "3\n", "dev-20261031", "2026-10-31T13:00:20Z");
  git(f.repo, "push", "-q", "-f", "origin", `${d31}:refs/heads/stable`);
  const x = deps(f.runner, "2026-11-01T13:00:40Z", { comments: [c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z")] });
  assert.match((await passBeta(x.d, O) as any).error, /stable only moves forward/);
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), d31);
  void d30;
});

test("the guard: a push to stable that is not a passed dev release goes red", async () => {
  const f = fixture();
  const was = git(f.origin, "rev-parse", "refs/heads/stable");
  const d30 = devRelease(f.repo, "2\n", "dev-20261030", "2026-10-30T13:00:30Z");
  writeFileSync(join(f.repo, "sol", "a.txt"), "on main only\n");
  git(f.repo, "commit", "-qam", "folded, not released");
  const loose = git(f.repo, "rev-parse", "HEAD");
  git(f.repo, "push", "-q", "origin", "main");
  const now = "2026-10-31T13:01:00Z";
  const ok = { comments: [c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z")] };

  assert.match((await checkStable(deps(f.runner, now, ok).d, { ...O, sha: loose, before: was }) as any).error, /which is no dev release/);
  assert.match((await checkStable(deps(f.runner, now, { comments: [] }).d, { ...O, sha: d30, before: was }) as any).error, /has no pass/);
  assert.match((await checkStable(deps(f.runner, "2026-10-30T20:00:00Z", ok).d, { ...O, sha: d30, before: was }) as any).error, /not a day old yet/);
  assert.match((await checkStable(deps(f.runner, now, ok).d, { ...O, sha: was, before: d30 }) as any).error, /stable only moves forward|no dev release/);
  assert.deepEqual(await checkStable(deps(f.runner, now, ok).d, { ...O, sha: d30, before: "0".repeat(40) }), { ok: true, tag: "dev-20261030", by: FRANK }, "a new branch has no before");
  assert.match((await checkStable(deps(f.runner, now, ok).d, { ...O, sha: "nope" }) as any).error, /not a commit/);
});

test("a newer passed release not yet allowed leaves an older passed one free to go", async () => {
  const f = fixture();
  const d01 = devRelease(f.repo, "2\n", "dev-20261101", "2026-11-01T14:00:30Z");
  devRelease(f.repo, "3\n", "dev-20261101-1442", "2026-11-01T19:42:00Z");   // an urgent fix, passed too, 18 hours old at 9am
  const comments = [
    c(FRANK, pass("2026-11-01"), "2026-11-02T02:10:00Z"),
    c(FRANK, pass("dev-20261101-1442"), "2026-11-02T02:12:00Z"),
  ];
  const x = deps(f.runner, "2026-11-02T14:00:40Z", { comments });
  const r = await passBeta(x.d, O) as any;
  assert.equal(r.tag, "dev-20261101", "the day's release goes; the urgent one waits for tomorrow");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), d01);
  assert.match((await passBeta(x.d, O) as any).error, /dev-20261101-1442 is not a day old yet/, "once the older one is on stable, the newer refusal is said");
});

test("the numbers (#1300): one more than the highest v* there is, by number not by name; a number GitHub did not take is made by the next run", async () => {
  const { nextProduct, productTag } = await import("../src/version.ts");
  assert.equal(nextProduct([]), "v1");
  assert.equal(nextProduct(["v1", "v2", "v9", "v10", "dev-20261030", "vendor-1", "v0"]), "v11", "v10 after v9, and only v<N> counts");
  assert.equal(productTag(["dev-20261030", "v3", "v12"]), "v12");
  assert.equal(productTag(["dev-20261030"]), "");

  const f = fixture();
  const d30 = devRelease(f.repo, "2\n", "dev-20261030", "2026-10-30T13:00:30Z");
  // an earlier number elsewhere (v9, then v10): the next is v11
  git(f.repo, "tag", "-a", "v9", "-m", "nine", "HEAD~1"); git(f.repo, "tag", "-a", "v10", "-m", "ten", "HEAD~1");
  git(f.repo, "push", "-q", "origin", "refs/tags/v9", "refs/tags/v10");
  const comments = [c(FRANK, pass("2026-10-30"), "2026-10-31T01:10:00Z")];
  // GitHub refuses the number (a v11 there already for another commit): the pass stands, the number waits
  git(f.repo, "tag", "-a", "v11", "-m", "in the way", "HEAD~1");
  git(f.repo, "push", "-q", "origin", "refs/tags/v11");
  git(f.origin, "tag", "-d", "v11");   // gone from what the runner fetches, then back on GitHub before its push
  const x = deps(f.runner, "2026-10-31T13:00:40Z", { comments }, {});
  const realGit = x.d.git;
  let put = false;
  x.d.git = async (args) => {
    if (!put && args[0] === "push" && args.at(-1) === "refs/tags/v11:refs/tags/v11") { put = true; git(f.repo, "push", "-q", "origin", "refs/tags/v11"); }
    return realGit(args);
  };
  const r = await passBeta(x.d, O) as any;
  assert.equal(r.ok, true);
  assert.equal(r.product, undefined, "no number this time");
  assert.equal(git(f.origin, "rev-parse", "refs/heads/stable"), d30, "the pass stands");
  assert.match(x.said.join("\n"), /GitHub did not take v11: .*: the next run numbers it/);
  assert.equal(git(f.runner, "tag", "-l", "v11"), "", "the refused tag is taken back here");
  // the way cleared, the next run (stable already there) numbers it
  git(f.origin, "tag", "-d", "v11");
  const y = deps(f.runner, "2026-10-31T13:30:00Z", { comments });
  assert.deepEqual(await passBeta(y.d, O), { ok: true, tag: "dev-20261030", sha: d30, by: FRANK, product: "v11", already: true });
  assert.equal(git(f.origin, "rev-parse", "refs/tags/v11^{commit}"), d30);
});

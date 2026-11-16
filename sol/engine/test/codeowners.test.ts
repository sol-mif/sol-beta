// CODEOWNERS written from the project's owners table (#438): the file's owners follow the table, its paths never move,
// the PR is opened on the settings branch and merged by the release runner only when whole and green, and every PR
// names its issue. GitHub is a function that writes down its arguments; nothing here reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { devOnly } from "./dev-copy.ts";

const { tableOf, pathsOf, writeCodeowners, differ, check, landOwners, mergeOwners, checksWord, prBody, CODEOWNERS, SETTINGS_BRANCH, SETTING_TRAILER } = await import("../src/team/codeowners.ts");
const { issuesOf } = await import("../src/team/belongs.ts");
const { ownersIn, fromWhere, needsFor, RHYTHM_DEFAULT } = await import("../src/team/project.ts");
const { recordOwners } = await import("../src/team/release.ts");
const { leadsOf } = await import("../src/team/press.ts");

const DEV_FILE = devOnly(".github/CODEOWNERS");
const REAL = DEV_FILE ? "" : readFileSync(resolve(import.meta.dirname, "../../../.github/CODEOWNERS"), "utf8");
const SMALL = [
  "# Labels and leads. The owners here are written from the project's settings.",
  "",
  "# label base: the engine.",
  "/sol/engine/                 @marco",
  "/sol/keep /sol/back  @marco",
  "",
  "# label cowork: the team.",
  "/sol/mac/src/cowork/         @marco @frank",
  "/sol/engine/src/team/        @marco @frank",
  "",
  "# label social: no code yet.",
  "# leads: @marco",
  "",
  "# label work: a section with nothing in it yet.",
  "",
].join("\n");

test("tableOf reads every section's leads, path lines and leads lines, two at most, teams never", () => {
  assert.deepEqual(tableOf(SMALL), { base: ["marco"], cowork: ["marco", "frank"], social: ["marco"], work: [] });
  assert.deepEqual(tableOf("# label x: y\n/a @one @org/team @two @three\n"), { x: ["one", "two"] });
  assert.deepEqual(pathsOf(SMALL), { base: ["/sol/engine/", "/sol/keep", "/sol/back"], cowork: ["/sol/mac/src/cowork/", "/sol/engine/src/team/"] });
});

test("writing from the table moves owners only: the columns, the comments and every path stay", () => {
  const { text, added, skipped } = writeCodeowners(SMALL, { base: ["frank", "isaac"], cowork: ["isaac"], social: ["marco"], work: ["frank"] });
  assert.deepEqual(added, []);
  assert.deepEqual(skipped, []);
  assert.deepEqual(tableOf(text), { base: ["frank", "isaac"], cowork: ["isaac"], social: ["marco"], work: ["frank"] });
  assert.deepEqual(pathsOf(text), pathsOf(SMALL));
  const lines = text.split("\n");
  assert.equal(lines[3], "/sol/engine/                 @frank @isaac", "the gap as it was");
  assert.equal(lines[4], "/sol/keep /sol/back  @frank @isaac");
  assert.equal(lines[0], SMALL.split("\n")[0]);
  assert.ok(lines.includes("# label work: a section with nothing in it yet.") && lines[lines.indexOf("# label work: a section with nothing in it yet.") + 1] === "# leads: @frank", "a section with no line gets a leads line under its head");
});

test("an area the table leaves out keeps its paths with no owner; it comes back aligned; a new area gets its own section", () => {
  const out = writeCodeowners(SMALL, { base: ["marco"], social: ["marco"], product: ["isaac", "frank"] });
  assert.deepEqual(out.added, ["product"]);
  assert.deepEqual(tableOf(out.text).cowork, []);
  assert.ok(out.text.split("\n").includes("/sol/mac/src/cowork/"), "the path stays, alone");
  assert.match(out.text, /\n# label product: from the project's settings; no paths yet \(paths come by a PR\)\.\n# leads: @isaac @frank\n$/);
  const back = writeCodeowners(out.text, { base: ["marco"], social: ["marco"], cowork: ["frank"], product: ["isaac", "frank"] }).text;
  assert.ok(back.split("\n").includes("/sol/mac/src/cowork/         @frank"), "padded to the file's column");
  assert.deepEqual(writeCodeowners(back, tableOf(back)).text, back, "written again from its own leads, the same file");
});

test("an area whose name cannot be a label is skipped, never written", () => {
  const out = writeCodeowners(SMALL, { ...tableOf(SMALL), "two words": ["frank"] });
  assert.deepEqual(out.skipped, ["two words"]);
  assert.equal(out.text, SMALL);
});

test("the repo's own CODEOWNERS: in the shape Sol writes, and the board reads the same leads off what is written", { skip: DEV_FILE }, () => {
  assert.equal(writeCodeowners(REAL, tableOf(REAL)).text, REAL);
  const t = { ...tableOf(REAL), cowork: ["franktsai2008-eng", "marcocyl04-ux"], base: ["marcocyl04-ux", "w0ngtap"] };
  const next = writeCodeowners(REAL, t).text;
  assert.deepEqual(leadsOf(next).cowork, ["franktsai2008-eng", "marcocyl04-ux"], "press.ts's leadsOf (the board) agrees");
  assert.deepEqual(leadsOf(next).base, ["marcocyl04-ux", "w0ngtap"]);
  assert.deepEqual(pathsOf(next), pathsOf(REAL));
  assert.equal(next.split("\n").length, REAL.split("\n").length);
  assert.ok(check(REAL).ok, check(REAL).lines.join("; "));
});

test("differ: the areas whose leads are not the table's, case and order aside; the check says each", () => {
  assert.deepEqual(differ(SMALL, { base: ["MARCO"], cowork: ["frank", "marco"], social: ["marco"] }), []);
  assert.deepEqual(differ(SMALL, { base: ["frank"], cowork: ["marco", "frank"], social: ["marco"], product: ["isaac"] }), [
    { area: "base", codeowners: ["marco"], table: ["frank"] },
    { area: "product", codeowners: [], table: ["isaac"] },
  ]);
  const r = check(SMALL, JSON.stringify({ v: 1, owners: { base: ["frank"], cowork: ["marco", "frank"], social: ["marco"] } }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.lines, ["base: CODEOWNERS says @marco, the project's owners say @frank"]);
  const w = check(SMALL, JSON.stringify({ v: 1, owners: { base: ["frank"], cowork: ["marco", "frank"], social: ["marco"] } }), true);
  assert.equal(w.ok, true, "any other PR: said, never failed, while the settings PR waits to be merged");
  assert.match(w.lines[0], /the settings PR brings it/);
  assert.ok(check(SMALL, JSON.stringify({ v: 1, onboarding: {} })).ok, "a record with no owners yet: CODEOWNERS is the starting value");
  assert.ok(check(SMALL, JSON.stringify(tableOf(SMALL))).ok, "a bare table works too");
  assert.equal(check("# label base: x\n/a @x\n/b  @y\n").ok, false, "two lines of one area naming different owners is not a shape Sol writes");
  assert.equal(check("nothing here\n").ok, false);
});

// a GitHub that answers what landOwners and mergeOwners ask
function fakeGh(o: { main?: string; branch?: string | null; pr?: { number: number } | null; files?: string[]; rollup?: { conclusion?: string; status?: string }[]; noBranchRef?: boolean } = {}) {
  const calls: string[][] = [];
  const g = { main: o.main ?? SMALL, branch: o.branch === undefined ? null : o.branch, pr: o.pr === undefined ? null : o.pr };
  const gh = async (args: string[]) => {
    calls.push(args);
    const a = args.join(" ");
    if (a === "api repos/acme/sol --jq .default_branch") return "main\n";
    if (a.startsWith(`api repos/acme/sol/contents/${CODEOWNERS}?ref=main`)) return JSON.stringify({ sha: "blob1", content: Buffer.from(g.main).toString("base64") });
    if (a.startsWith(`api repos/acme/sol/contents/${CODEOWNERS}?ref=${encodeURIComponent(SETTINGS_BRANCH)}`)) {
      if (g.branch === null) throw new Error("gh: Not Found (HTTP 404)");
      return JSON.stringify({ sha: "blob2", content: Buffer.from(g.branch).toString("base64") });
    }
    if (a.startsWith("api repos/acme/sol/pulls?state=open")) return JSON.stringify(g.pr ? [{ number: g.pr.number, url: `https://github.com/acme/sol/pull/${g.pr.number}` }] : []);
    if (a.startsWith("api repos/acme/sol/git/ref/heads/main")) return "a".repeat(40) + "\n";
    if (a.startsWith(`api -X PATCH repos/acme/sol/git/refs/heads/${SETTINGS_BRANCH}`)) { if (o.noBranchRef) throw new Error("gh: Reference does not exist (HTTP 422)"); return "{}"; }
    if (a.startsWith("api -X POST repos/acme/sol/git/refs")) return "{}";
    if (a.startsWith(`api -X PUT repos/acme/sol/contents/${CODEOWNERS}`)) { g.branch = Buffer.from(args[args.findIndex((x) => x.startsWith("content=")) ].slice(8), "base64").toString("utf8"); return "{}"; }
    if (a.startsWith("api -X POST repos/acme/sol/pulls")) { g.pr = { number: 77 }; return JSON.stringify({ number: 77, url: "https://github.com/acme/sol/pull/77" }); }
    if (a.startsWith("api -X PATCH repos/acme/sol/pulls/")) return "{}";
    if (a.startsWith("api repos/acme/sol/compare/main...")) return JSON.stringify(o.files ?? [CODEOWNERS]);
    if (a.startsWith(`api repos/acme/sol/contents/${CODEOWNERS}?ref=${"b".repeat(40)}`)) {
      if (g.branch === null) throw new Error("gh: Not Found (HTTP 404)");
      return JSON.stringify({ sha: "blob2", content: Buffer.from(g.branch).toString("base64") });
    }
    if (a.startsWith("pr view")) return JSON.stringify({ statusCheckRollup: o.rollup ?? [{ status: "COMPLETED", conclusion: "SUCCESS" }], headRefOid: "b".repeat(40) });
    if (a.startsWith("pr merge")) return "";
    throw new Error(`unexpected gh ${a}`);
  };
  return { gh, calls, g };
}
const field = (c: string[], k: string) => c[c.findIndex((x) => x.startsWith(`${k}=`))]?.slice(k.length + 1);
const TABLE = { base: ["frank"], cowork: ["marco", "frank"], social: ["marco"] };

test("landing: the settings branch from main's head, the file written there over main's blob, one PR opened; main is never written", async () => {
  const { gh, calls, g } = fakeGh({ noBranchRef: true });
  const r = await landOwners({ gh }, "acme/sol", TABLE, { proposal: "abcd1234", by: "frank" });
  assert.deepEqual(r, { ok: true, pr: 77, url: "https://github.com/acme/sol/pull/77", opened: true });
  const put = calls.find((c) => c[2] === "PUT")!;
  assert.equal(field(put, "branch"), SETTINGS_BRANCH);
  assert.equal(field(put, "sha"), "blob1");
  assert.match(field(put, "message")!, /^settings: CODEOWNERS from the project's owners\n\nbase: CODEOWNERS says @marco, the project's owners say @frank\n\nSol-Setting: owners$/);
  assert.deepEqual(tableOf(g.branch!).base, ["frank"]);
  assert.ok(calls.some((c) => c.join(" ").startsWith("api -X POST repos/acme/sol/git/refs") && field(c, "ref") === `refs/heads/${SETTINGS_BRANCH}`), "the branch made when it was not there");
  assert.ok(!calls.some((c) => c.some((x) => x === "branch=main" || /git\/refs\/heads\/main\b/.test(x))), "nothing aimed at main");
  const pr = calls.find((c) => c.join(" ").startsWith("api -X POST repos/acme/sol/pulls"))!;
  assert.equal(field(pr, "base"), "main");
  assert.equal(field(pr, "head"), SETTINGS_BRANCH);
  assert.match(field(pr, "body")!, /Agreed as proposal abcd1234, asked by frank\./);
  assert.match(field(pr, "body")!, new RegExp(`${SETTING_TRAILER}$`));
});

test("landing again: the open PR that says it already is left alone; one that does not is refreshed; a table main says already closes it", async () => {
  const want = writeCodeowners(SMALL, TABLE).text;
  const same = fakeGh({ pr: { number: 5 }, branch: want });
  assert.deepEqual(await landOwners({ gh: same.gh }, "acme/sol", TABLE), { ok: true, pr: 5, url: "https://github.com/acme/sol/pull/5", opened: false, same: true });
  assert.ok(!same.calls.some((c) => c[2] === "PUT"));
  const stale = fakeGh({ pr: { number: 5 }, branch: SMALL });
  assert.deepEqual(await landOwners({ gh: stale.gh }, "acme/sol", TABLE), { ok: true, pr: 5, url: "https://github.com/acme/sol/pull/5", opened: false });
  assert.ok(stale.calls.some((c) => c[2] === "PUT") && !stale.calls.some((c) => c.join(" ").startsWith("api -X POST repos/acme/sol/pulls")));
  const done = fakeGh({ pr: { number: 5 } });
  assert.deepEqual(await landOwners({ gh: done.gh }, "acme/sol", tableOf(SMALL)), { ok: true, unchanged: true, closed: 5 });
  assert.ok(done.calls.some((c) => c.join(" ") === "api -X PATCH repos/acme/sol/pulls/5 -f state=closed"));
  assert.match(String((await landOwners({ gh: done.gh }, "not a repo", TABLE) as { error: string }).error), /not a GitHub repository/);
});

test("the release runner merges the PR only when whole: CODEOWNERS alone, what the table says, green", async () => {
  const want = writeCodeowners(SMALL, TABLE).text;
  const said: string[] = [];
  const say = (l: string) => said.push(l);
  const ok = fakeGh({ pr: { number: 9 }, branch: want });
  assert.deepEqual(await mergeOwners({ gh: ok.gh, dryRun: false, say }, "acme/sol", TABLE), { ok: true, state: "merged" });
  const merge = ok.calls.find((c) => c[0] === "pr" && c[1] === "merge")!;
  assert.deepEqual(merge, ["pr", "merge", "9", "--repo", "acme/sol", "--squash", "--delete-branch", "--match-head-commit", "b".repeat(40)]);
  const red = fakeGh({ pr: { number: 9 }, branch: want, rollup: [{ status: "IN_PROGRESS" }] });
  assert.deepEqual(await mergeOwners({ gh: red.gh, dryRun: false, say }, "acme/sol", TABLE), { ok: true, state: "waits" });
  assert.ok(!red.calls.some((c) => c[1] === "merge"));
  const more = fakeGh({ pr: { number: 9 }, branch: want, files: [CODEOWNERS, "sol/engine/src/index.ts"] });
  assert.deepEqual(await mergeOwners({ gh: more.gh, dryRun: false, say }, "acme/sol", TABLE), { ok: true, state: "refreshed" }, "a PR that changes more is written again, never merged");
  assert.ok(!more.calls.some((c) => c[1] === "merge"));
  const moved = fakeGh({ pr: { number: 9 }, branch: writeCodeowners(SMALL, { ...TABLE, social: ["isaac"] }).text });
  assert.deepEqual(await mergeOwners({ gh: moved.gh, dryRun: false, say }, "acme/sol", TABLE), { ok: true, state: "refreshed" }, "the table moved since: written again");
  const none = fakeGh();
  assert.deepEqual(await mergeOwners({ gh: none.gh, dryRun: false, say }, "acme/sol", TABLE), { ok: true, state: "opened" });
  const dry = fakeGh({ pr: { number: 9 }, branch: want });
  assert.deepEqual(await mergeOwners({ gh: dry.gh, dryRun: true, say }, "acme/sol", TABLE), { ok: true, state: "would" });
  assert.ok(!dry.calls.some((c) => c[1] === "merge" || c[1] === "-X"), "a dry run moves nothing");
  assert.deepEqual(await mergeOwners({ gh: fakeGh().gh, dryRun: false, say }, "acme/sol", tableOf(SMALL)), { ok: true, state: "same" });
});

test("checksWord: failing over pending over passing; none when there are none", () => {
  assert.equal(checksWord([]), "none");
  assert.equal(checksWord([{ conclusion: "SUCCESS", status: "COMPLETED" }, { conclusion: "FAILURE", status: "COMPLETED" }]), "failing");
  assert.equal(checksWord([{ conclusion: "SUCCESS", status: "COMPLETED" }, { status: "QUEUED" }]), "pending");
  assert.equal(checksWord([{ conclusion: "SUCCESS", status: "COMPLETED" }, { conclusion: "SKIPPED", status: "COMPLETED" }]), "passing");
  assert.match(prBody(TABLE, []), /nothing differs any more/);
});

test("the project's owners start from CODEOWNERS until the record has a table; a change moves the leads it names", () => {
  const start = { owners: { base: ["marco"], cowork: ["marco", "frank"] } };
  assert.deepEqual(ownersIn(null, start), start.owners);
  assert.deepEqual(ownersIn({ owners: { base: ["isaac"] } }, start), { base: ["isaac"] }, "the record's own wins");
  assert.equal(fromWhere(null, start).owners, "file");
  assert.equal(fromWhere(null, {}).owners, "default");
  const was = { owners: ownersIn(null, start) }, patch = { owners: { ...start.owners, cowork: ["isaac"] } };
  assert.deepEqual(needsFor(patch, was, { rhythm: RHYTHM_DEFAULT, owners: was.owners }, "marco"), ["frank", "isaac", "marco"], "the cowork leads before and after, not base's");
});

test("the release runner reads the table off a GitHub record, and says why not otherwise", async () => {
  const gh = async (args: string[]) => {
    if (args[1] === "repos/acme/rec/contents/.sol/project.json") return JSON.stringify({ v: 1, owners: { base: ["frank"] }, onboarding: {}, set: {}, proposals: [] });
    if (args[1] === "repos/acme/empty/contents/.sol/project.json") return JSON.stringify({ v: 1, onboarding: {} });
    throw new Error("gh: Not Found (HTTP 404)");
  };
  assert.deepEqual(await recordOwners(gh, "acme/rec"), { base: ["frank"] });
  assert.match(String(await recordOwners(gh, "acme/empty")), /holds no owners yet/);
  assert.match(String(await recordOwners(gh, "acme/none")), /no project settings yet/);
  assert.match(String(await recordOwners(gh, "cloud:abc")), /not on GitHub/);
});

test("every change belongs to an issue: title, body or branch; the settings PR by its trailer", () => {
  assert.deepEqual(issuesOf({ title: "x", body: "Part of #438\n\n**What to try**", branch: "marco/product-f1-codeowners-written-438" }), [438]);
  assert.deepEqual(issuesOf({ title: "the board (#31)", body: "", branch: "x" }), [31]);
  assert.deepEqual(issuesOf({ title: "x", body: "", branch: "marco/31-see" }), [31]);
  assert.deepEqual(issuesOf({ title: "x", body: "nothing", branch: "patch-a" }), []);
  assert.equal(issuesOf({ title: "settings", body: `owners\n\n${SETTING_TRAILER}`, branch: SETTINGS_BRANCH }), "setting");
  assert.deepEqual(issuesOf({ title: "settings", body: "no trailer", branch: SETTINGS_BRANCH }), [], "the branch alone is not enough");
  const run = (env: Record<string, string>) => { try { execFileSync("node", [resolve(import.meta.dirname, "../src/team/belongs.ts")], { env: { ...process.env, ...env }, stdio: "pipe" }); return 0; } catch (e) { return (e as { status: number }).status; } };
  assert.equal(run({ PR_TITLE: "x", PR_BODY: "Fixes #12", PR_BRANCH: "b" }), 0);
  assert.equal(run({ PR_TITLE: "x", PR_BODY: "y", PR_BRANCH: "b" }), 1);
});

test("the check runs on plain node, as ci.yml runs it", { skip: DEV_FILE }, () => {
  const out = execFileSync("node", [resolve(import.meta.dirname, "../src/team/codeowners.ts"), "--check", "--file", resolve(import.meta.dirname, "../../../.github/CODEOWNERS")], { encoding: "utf8", stdio: "pipe" });
  assert.match(out, /CODEOWNERS reads well/);
});

test("the guard lets the engine's write on the settings branch through, and still refuses main", () => {
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const dir = mkdtempSync(join(tmpdir(), "owners-guard-"));
  execFileSync("git", ["init", "-q", "-b", "marco/product-f1-438"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git"], { cwd: dir });   // a sol-dev checkout (#479)
  execFileSync("git", ["config", "sol.login", "marcocyl04-ux"], { cwd: dir });
  const run = (command: string) => execFileSync("node", [guard], { cwd: dir, encoding: "utf8", input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: dir }) });
  assert.equal(run(`gh api -X PUT repos/acme/sol/contents/.github/CODEOWNERS -f message=x -f content=eA== -f sha=1 -f branch=${SETTINGS_BRANCH}`), "");
  assert.equal(run(`gh api -X PATCH repos/acme/sol/git/refs/heads/${SETTINGS_BRANCH} -f sha=abc -F force=true`), "");
  assert.match(run("gh api -X PUT repos/acme/sol/contents/.github/CODEOWNERS -f message=x -f content=eA== -f sha=1"), /main-by-api/);
});

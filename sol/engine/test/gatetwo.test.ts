// Gate two as a report (#1563, src/team/gatetwo.ts): the seven questions answered for a day-old dev release and said on
// the Night digest. The pure parts by themselves; the report against real git in a temp repo whose origin is a bare temp
// repo, GitHub (gh) a stand-in, so nothing here reaches the network or a real branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
});
const { gateTwo, conceptsOf, catchUpsOf, newestPerMachine, prsOf, pageOf, pressOf, reportOf, pickRelease } = await import("../src/team/gatetwo.ts");
const { aDayOld } = await import("../src/team/beta.ts");
const { parseRhythm, betaComment } = await import("../src/team/tonight.ts");
type GateTwoDeps = import("../src/team/gatetwo.ts").GateTwoDeps;
type Rhythm = import("../src/team/tonight.ts").Rhythm;

const RHYTHM = parseRhythm(readFileSync(join(import.meta.dirname, "..", "..", "..", ".sol", "rhythm.json"), "utf8")) as Rhythm;
const FRANK = RHYTHM.beta[0];
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const gitAt = (cwd: string, when: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_COMMITTER_DATE: when } }).trim();
const c = (login: string, body: string, at: string, url = "") => ({ author: { login }, body, createdAt: at, url });
const CATCHUP_TITLE = "Nightly catch-up test (#423)";

test("a day: an earlier day in the rhythm's zone and 20 hours, the pass's rule and gate two's question 4 (pure)", () => {
  const made = Date.parse("2026-10-30T13:00:30Z");   // 9:00 in New York
  assert.equal(aDayOld(made, new Date("2026-10-31T13:00:40Z"), RHYTHM.zone), true);
  assert.equal(aDayOld(made, new Date("2026-10-31T02:00:00Z"), RHYTHM.zone), false, "the same day in New York");
  assert.equal(aDayOld(Date.parse("2026-10-30T23:00:00Z"), new Date("2026-10-31T13:00:00Z"), RHYTHM.zone), false, "an earlier day, 14 hours");
  assert.equal(aDayOld(0, new Date("2026-10-31T13:00:00Z"), RHYTHM.zone), false, "no date is no day");
  const all = [
    { tag: "dev-20261031", sha: "b", made: Date.parse("2026-10-31T13:00:20Z") },
    { tag: "dev-20261030", sha: "a", made },
  ];
  assert.equal((pickRelease(all, new Date("2026-10-31T14:00:00Z"), RHYTHM.zone) as any).tag, "dev-20261030", "the newest a day old");
  assert.equal((pickRelease(all, new Date("2026-10-31T14:00:00Z"), RHYTHM.zone, "dev-20261031") as any).tag, "dev-20261031", "or the one named");
  assert.match(pickRelease(all, new Date("2026-10-31T14:00:00Z"), RHYTHM.zone, "main") as string, /not a dev release/);
  assert.equal(pickRelease(all, new Date("2026-10-30T14:00:00Z"), RHYTHM.zone), "no dev release is a day old yet");
});

test("question 1: the concept switches, from stations.json when versions.ts reads it, else STAGES (pure)", () => {
  const byHand = `export const STAGES: Readonly<Record<string, Stage>> = {\n  "a.b": "concept",   // why\n  "c": "hand",\n  "d": "both",\n  "e.f": "concept",\n};\n`;
  assert.deepEqual(conceptsOf(byHand, null), ["a.b", "e.f"]);
  const cards = `import cards from "./stations.json" with { type: "json" };\nexport const STAGES = TABLE.stages;\n`;
  assert.deepEqual(conceptsOf(cards, JSON.stringify({ x: { station: "concept" }, y: { station: "product" }, w: { station: "concept" } })), ["w", "x"]);
  assert.equal(conceptsOf(cards, null), null, "the table missing is not read, never a pass");
  assert.equal(conceptsOf(cards, "{"), null);
  assert.equal(conceptsOf("nothing here", null), null);
  assert.deepEqual(conceptsOf(`export const STAGES = {\n  "c": "hand",\n};\n`, null), []);
});

test("question 3: the newest catch-up report per machine whose release holds this one; an edited one says nothing (pure)", () => {
  const all = catchUpsOf([
    c("github-actions", "**Catch-up failed** on nucbox: 1 of 21 releases of the last 30 days did not update to dev-20261030 cleanly (dev-20261012).", "2026-10-30T17:00:00Z"),
    c("github-actions", "**Catch-up passed** on nucbox: 21 of 21 releases of the last 30 days updated to dev-20261031, healthy, nothing lost.", "2026-10-31T17:00:00Z"),
    c("github-actions", "**Catch-up passed** on macbook: 21 of 21 releases of the last 30 days updated to dev-20261029, healthy, nothing lost.", "2026-10-31T18:00:00Z"),
    { ...c("someone", "**Catch-up passed** on pi: 3 of 3 releases updated to dev-20261031, healthy.", "2026-10-31T19:00:00Z"), lastEditedAt: "2026-10-31T20:00:00Z" },
    c("x", "a word about catch-up", "2026-10-31T19:00:00Z"),
  ]);
  assert.deepEqual(all.map((x) => [x.machine, x.passed, x.to]), [["nucbox", false, "dev-20261030"], ["nucbox", true, "dev-20261031"], ["macbook", true, "dev-20261029"]]);
  const got = newestPerMachine(all, (to) => to >= "dev-20261030");
  assert.deepEqual(got.map((x) => [x.machine, x.passed]), [["nucbox", true]], "the macbook's is older than the release: not counted");
  const none = catchUpsOf([c("github-actions", "**Catch-up passed** on nucbox: nothing to catch up from (no release of the last 30 days before dev-20261031).", "2026-10-31T17:00:00Z")]);
  assert.equal(catchUpsOf([c("someone", "**Catch-up passed** on nucbox: 21 of 21 releases updated to dev-20261031, healthy.", "2026-10-31T17:00:00Z")]).length, 0, "only the workflow's own report counts");
  assert.equal(catchUpsOf([c("github-actions[bot]", "**Catch-up passed** on nucbox: 21 of 21 releases updated to dev-20261031, healthy.", "2026-10-31T17:00:00Z")]).length, 1);
  assert.deepEqual(none.map((x) => [x.machine, x.passed, x.tried, x.to]), [["nucbox", true, false, "dev-20261031"]], "nothing tried is no upgrade tried");
});

test("question 7: the PRs from first-parent subjects, the page; the press as the beta pass reads it (pure)", () => {
  assert.deepEqual(prsOf(["Merge pull request #12 from a/b", "a squash (#13)", "Merge branch 'main' into x", "Merge pull request #12 from a/b", "fix #14 here"]), [12, 13]);
  const page = pageOf("dev-20261030", "v1", 3, [{ number: 12, title: "the seat opens\nSettings", try: "Open Settings and ask." }, { number: 13, title: "", try: "" }]);
  assert.match(page, /^# What changed in dev-20261030, since v1\n\n2 changes, 3 commits\./);
  assert.match(page, /- #12 the seat opens Settings: Open Settings and ask\.\n- #13 \(no title read\)\n$/);
  assert.equal(pressOf(undefined, 5), "none yet");
  assert.equal(pressOf({ verdict: "pass", release: "x", by: FRANK, at: 4 }, 5), "none yet", "a verdict from before the release signs nothing");
  assert.equal(pressOf({ verdict: "hold", release: "x", by: FRANK, at: 6 }, 5), "held");
  const text = reportOf({ tag: "dev-20261030", sha: "abcdef0123", press: "passed", answers: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, mark: n % 2 ? "pass" as const : "short" as const, line: `why ${n}` })) }, "franktsai2008-eng");
  assert.match(text, /^\*\*Gate two\*\*, dev-20261030: 4 of 7\n\n1\. gate one: \*\*pass\*\*, why 1\n2\. a stranger installs it: \*\*short\*\*, why 2\n/);
  assert.match(text, /\n\nFrank's press: passed\n/);
  assert.match(text, /\n— franktsai2008-eng's agent$/);
});

// ---- the report, against real git ----

function fixture() {
  const top = mkdtempSync(join(tmpdir(), "sol-gate-two-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "work");
  mkdirSync(join(repo, "sol", "engine", "src", "convert"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "engine", "src", "versions.ts"), `export const STAGES = {\n  "home.whole": "concept",\n  "c": "hand",\n};\n`);
  writeFileSync(join(repo, "sol", "engine", "src", "convert", "0001-baseline.ts"), "// 1\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  gitAt(repo, "2026-10-20T13:00:00Z", "tag", "-a", "v1", "-m", "Sol v1");
  writeFileSync(join(repo, "sol", "a.txt"), "2\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "Merge pull request #12 from sol-mif/x/the-seat-12");
  writeFileSync(join(repo, "sol", "a.txt"), "3\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "the room's list (#13)");
  gitAt(repo, "2026-10-30T13:00:30Z", "tag", "-a", "dev-20261030", "-m", "dev release");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main", "refs/tags/v1", "refs/tags/dev-20261030");
  const runner = join(top, "runner");
  git(top, "clone", "-q", origin, runner);
  return { top, origin, repo, runner, sha: git(repo, "rev-parse", "HEAD") };
}

function deps(root: string, at: string, gh: { digest: any[]; closed?: any[]; catchup: any[]; leak?: any[]; down?: boolean }, over: Partial<GateTwoDeps> = {}) {
  const said: string[] = [], posted: string[][] = [];
  const d: GateTwoDeps = {
    root,
    git: (args) => new Promise((ok) => execFile("git", args, { cwd: root }, (err, out, errOut) =>
      ok({ code: err ? (typeof (err as any).code === "number" ? (err as any).code : 128) : 0, out: String(out) || String(errOut) }))),
    gh: async (args) => {
      const a = args.join(" ");
      if (args[0] === "issue" && args[1] === "list") {
        if (a.includes(CATCHUP_TITLE)) return JSON.stringify([{ number: 504, title: CATCHUP_TITLE }]);
        return JSON.stringify([{ number: 452, title: "Night digest", state: "OPEN" }, { number: 451, title: "Night digest", state: "CLOSED" }, { number: 9, title: "Night digest, not quite", state: "OPEN" }]);
      }
      if (args[0] === "issue" && args[1] === "view" && args[2] === "452") return JSON.stringify({ comments: gh.digest });
      if (args[0] === "issue" && args[1] === "view" && args[2] === "451") return JSON.stringify({ comments: gh.closed ?? [] });
      if (args[0] === "issue" && args[1] === "view" && args[2] === "504") { if (gh.down) throw new Error("HTTP 502"); return JSON.stringify({ comments: gh.catchup }); }
      if (args[0] === "api" && args[1].includes("/check-runs")) return JSON.stringify({ check_runs: gh.leak ?? [{ id: 1, name: "leak check", status: "completed", conclusion: "success" }] });
      if (args[0] === "pr" && args[1] === "list") return JSON.stringify([{ number: 12, title: "the seat opens Settings", body: "## What to try\nAsk the seat to open Settings.\n## Felt or silent\nfelt" }, { number: 13, title: "the room's list", body: "" }]);
      if (args[0] === "issue" && args[1] === "comment") { posted.push(args); gh.digest.push(c(FRANK, args[args.indexOf("--body") + 1], at, "https://github.com/x/y/issues/452#issuecomment-777")); return ""; }
      if (args[0] === "api" && args[1] === "-X") { posted.push(args); return "{}"; }
      throw new Error(`unexpected gh ${a}`);
    },
    now: () => new Date(at),
    dryRun: false,
    say: (l) => { said.push(l); },
    by: async () => FRANK,
    people: [{ login: FRANK, name: "Frank" }, { login: "marcocyl04-ux", name: "Marco" }],
    runs: async () => [{ login: FRANK, person: FRANK, machine: "mac", tag: "dev-20261030", sha: "x", branch: "dev", at: Date.parse(at) - 60_000 }],
    keep: 23,
    ...over,
  };
  return { d, said, posted };
}
const O = { repo: "sol-mif/sol-test", rhythm: RHYTHM };
const catchup = [c("github-actions", "**Catch-up passed** on nucbox: 21 of 21 releases of the last 30 days updated to dev-20261030, healthy, nothing lost.", "2026-10-30T17:00:00Z")];

test("the report: seven answers from the release's own sources, posted once on the Night digest, signed", async () => {
  const f = fixture();
  mkdirSync(join(f.runner, ".sol-gate", "morning"), { recursive: true });
  writeFileSync(join(f.runner, ".sol-gate", "morning", "dev-20261030.json"), JSON.stringify({ tag: "dev-20261030", firstTimer: { runs: 2, findings: 1, stuck: 0, byFeature: [], skipped: [] } }));
  const digest = [c(FRANK, betaComment("pass", { release: "2026-10-30", night: "2026-10-30", changes: [{ number: 12 } as any] }, FRANK), "2026-10-31T01:10:00Z")];

  const early = deps(f.runner, "2026-10-31T02:00:00Z", { digest, catchup });
  assert.deepEqual(await gateTwo(early.d, O), { error: "no dev release is a day old yet" });

  const dry = deps(f.runner, "2026-10-31T13:00:40Z", { digest: [...digest], catchup }, { dryRun: true });
  const r0 = await gateTwo(dry.d, O) as any;
  assert.equal(r0.dry, true);
  assert.equal(dry.posted.length, 0, "the dry run posts nothing");
  assert.equal(existsSync(join(f.runner, ".sol-gate", "gate2")), false, "and writes no page");
  assert.match(dry.said.join("\n"), /would post on #452:\n {4}\*\*Gate two\*\*, dev-20261030: 5 of 7/);

  const x = deps(f.runner, "2026-10-31T13:00:40Z", { digest: [...digest], catchup });
  const r = await gateTwo(x.d, O) as any;
  assert.equal(r.posted, 452);
  const marks = Object.fromEntries(r.report.answers.map((a: any) => [a.n, a.mark]));
  assert.deepEqual(marks, { 1: "short", 2: "short", 3: "pass", 4: "pass", 5: "pass", 6: "pass", 7: "pass" });
  const body = x.posted[0][x.posted[0].indexOf("--body") + 1];
  assert.match(body, /^\*\*Gate two\*\*, dev-20261030: 5 of 7\n/);
  assert.match(body, /\n1\. gate one: \*\*short\*\*, 1 switch still stands at concept \(home\.whole\)\n/);
  assert.match(body, /\n2\. a stranger installs it: \*\*short\*\*, the first-timer ran 2 times over the features it touched \(1 finding\); no run installs it from nothing yet\n/);
  assert.match(body, /\n3\. an upgrade keeps everything: \*\*pass\*\*, nucbox passed 21 of 21 to dev-20261030\n/);
  assert.match(body, /\n4\. the team lived on it: \*\*pass\*\*, made 2026-10-30, 24 hours ago .*; Frank has it, Marco not yet \(off\)\n/);
  assert.match(body, /\n5\. nothing team-only leaks: \*\*pass\*\*, the leak check on \w{7} passed; the export keeps 23 paths \(BETA_KEEP\)\n/);
  assert.match(body, /\n6\. it can be rolled back: \*\*pass\*\*, a rollback goes to v1 /);
  assert.match(body, /\n7\. the Sol user knows what changed: \*\*pass\*\*, \.sol-gate\/gate2\/dev-20261030\.md on this machine, 2 changes \(2 commits\) since v1: #13 the room's list · #12 the seat opens Settings\n/, "newest first");
  assert.match(body, /\nFrank's press: passed\n/);
  assert.match(body, /\n— franktsai2008-eng's agent$/);
  const page = readFileSync(join(f.runner, ".sol-gate", "gate2", "dev-20261030.md"), "utf8");
  assert.match(page, /- #13 the room's list\n- #12 the seat opens Settings: Ask the seat to open Settings\.\n$/);

  // once a release: the second run leaves it; --again writes the same comment anew
  const y = deps(f.runner, "2026-10-31T14:00:00Z", { digest: [...digest, c(FRANK, body, "2026-10-31T13:01:00Z", "https://github.com/x/y/issues/452#issuecomment-777")], catchup });
  assert.equal((await gateTwo(y.d, O) as any).already, true);
  assert.equal(y.posted.length, 0);
  assert.match(y.said.join("\n"), /dev-20261030 has its report on #452 already; --again writes it anew/);
  const z = deps(f.runner, "2026-10-31T14:00:00Z", { digest: [...digest, c(FRANK, body, "2026-10-31T13:01:00Z", "https://github.com/x/y/issues/452#issuecomment-777")], catchup });
  await gateTwo(z.d, { ...O, again: true });
  assert.deepEqual(z.posted[0].slice(0, 4), ["api", "-X", "PATCH", "repos/sol-mif/sol-test/issues/comments/777"]);
  assert.equal(z.posted.length, 1, "written anew, never a second comment");

  // a report on last night's digest, now closed, counts too: a release that stays the newest a day old is said once
  const w = deps(f.runner, "2026-11-01T14:00:00Z", { digest: [...digest], closed: [c(FRANK, body, "2026-10-31T13:01:00Z", "https://github.com/x/y/issues/451#issuecomment-776")], catchup });
  assert.equal((await gateTwo(w.d, O) as any).already, true);
  assert.match(w.said.join("\n"), /has its report on #451 already/);
  await gateTwo(w.d, { ...O, again: true });
  assert.deepEqual(w.posted[0].slice(0, 4), ["api", "-X", "PATCH", "repos/sol-mif/sol-test/issues/comments/776"], "written anew where it is");
  // a look-alike by someone else, or the runner's own edited, holds nothing back
  const v = deps(f.runner, "2026-11-01T14:00:00Z", { digest: [...digest, c("someone", body, "2026-10-31T13:01:00Z", "https://github.com/x/y/issues/452#issuecomment-775"), { ...c(FRANK, body, "2026-10-31T13:02:00Z", "https://github.com/x/y/issues/452#issuecomment-774"), lastEditedAt: "2026-10-31T13:03:00Z" }], catchup });
  assert.equal((await gateTwo(v.d, O) as any).posted, 452);
  assert.equal(v.posted[0][1], "comment", "a new comment, never a PATCH of another's");
  // with no id GitHub gave back, --again refuses rather than post a second one
  const u = deps(f.runner, "2026-11-01T14:00:00Z", { digest: [...digest, c(FRANK, body, "2026-10-31T13:01:00Z")], catchup });
  assert.match((await gateTwo(u.d, { ...O, again: true }) as any).error, /no comment id/);
  assert.equal(u.posted.length, 0);
});

test("question 4 says the one-time exception when it is what lets the release through (#1615), and only then", async () => {
  const f = fixture();
  const digest = [c(FRANK, betaComment("pass", { release: "2026-10-30", night: "2026-10-30", changes: [{ number: 12 } as any] }, FRANK), "2026-10-30T15:00:00Z")];
  const q4 = async (at: string, rhythm: Rhythm) => {
    const x = deps(f.runner, at, { digest: [...digest], catchup }, { dryRun: true });
    const r = await gateTwo(x.d, { ...O, rhythm, tag: "dev-20261030" }) as any;
    return { mark: r.report.answers.find((a: any) => a.n === 4).mark, line: r.report.answers.find((a: any) => a.n === 4).line };
  };
  const once = { ...RHYTHM, betaSameDay: "2026-10-30" };
  const plain = (({ betaSameDay: _, ...r }) => r)(RHYTHM) as Rhythm;
  // the same day, under 7 hours old: short as always, pass with the exception, saying so
  assert.equal((await q4("2026-10-30T20:00:00Z", plain)).mark, "short");
  const w = await q4("2026-10-30T20:00:00Z", once);
  assert.equal(w.mark, "pass");
  assert.match(w.line, /made 2026-10-30, 6 hours ago \(not a day old: the one-time exception for 2026-10-30 in \.sol\/rhythm\.json waives the day \(#1615\)\)/);
  // the next day before 20 hours: over
  assert.equal((await q4("2026-10-31T05:00:00Z", once)).mark, "short");
  // a day old anyway: the ordinary words
  assert.match((await q4("2026-10-31T13:00:40Z", once)).line, /the rule for now: an earlier day and 20 hours/);
});

test("what is not there says so: a converter step since v1, a red leak check, GitHub not answering, no morning run", async () => {
  const f = fixture();
  writeFileSync(join(f.repo, "sol", "engine", "src", "convert", "0003-rooms.ts"), "// 3\n");
  writeFileSync(join(f.repo, "sol", "engine", "src", "versions.ts"), `export const STAGES = {\n  "c": "hand",\n};\n`);
  git(f.repo, "add", "-A"); git(f.repo, "commit", "-qm", "rooms keep a list (#14)");
  gitAt(f.repo, "2026-10-31T13:00:30Z", "tag", "-a", "dev-20261031", "-m", "dev release");
  git(f.repo, "push", "-q", "origin", "main", "refs/tags/dev-20261031");
  const x = deps(f.runner, "2026-11-01T13:00:40Z", { digest: [], catchup, down: true, leak: [{ id: 2, name: "leak check", status: "completed", conclusion: "failure" }] }, { runs: async () => { throw new Error("refused"); } });
  const r = await gateTwo(x.d, O) as any;
  assert.equal(r.report.tag, "dev-20261031");
  const by = Object.fromEntries(r.report.answers.map((a: any) => [a.n, a]));
  assert.equal(by[1].mark, "pass");
  assert.equal(by[1].line, "no switch in it stands at concept");
  assert.equal(by[2].mark, "not read");
  assert.match(by[3].line, /GitHub did not answer \(HTTP 502\)/);
  assert.match(by[4].line, /who has it was not heard/);
  assert.equal(by[5].mark, "short");
  assert.match(by[5].line, /leak check: did not pass \(leak check: failure\)/);
  assert.equal(by[6].mark, "short");
  assert.match(by[6].line, /a rollback goes to v1, past 1 converter step it has to put back \(0003-rooms\.ts, convert\/back\.ts\)/);
  assert.match(by[7].line, /3 changes \(3 commits\) since v1/);
});

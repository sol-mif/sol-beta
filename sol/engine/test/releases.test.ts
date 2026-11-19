// Releases (#1299, src/team/releases.ts): the read's shape from a real git line and GitHub's JSON as gh gives it.
// Logins are a, b, c (the leak check: no team name in a fixture).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgetTimeline, brokeSaidOf } from "../src/team/timeline.ts";
import { readReleases, decisionsOf, callOf, commentsSince, agentOf, pressedBy, knotOfBroke, channelOf } from "../src/team/releases.ts";

const NOW = new Date("2026-11-16T15:00:00Z");
const PEOPLE = [{ login: "a", name: "Ann", prefix: "a" }, { login: "b", name: "Bo", prefix: "b" }, { login: "c", name: "Cy", prefix: "c" }];

test("the pure parts: who pressed, the agent, the broke words and their knot, the channel", () => {
  assert.equal(pressedBy("urgent dev release dev-20261116-1200, OK'd by a (#9)", "the machine"), "a");
  assert.equal(pressedBy("dev release dev-20261116", "the machine"), "the machine");
  assert.equal(pressedBy("", ""), "the release timer");
  assert.equal(agentOf("What changed\n\n— b's agent", "b"), "b");
  assert.equal(agentOf("body\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)", "c"), "c");
  assert.equal(agentOf("a person's own words", "c"), undefined);
  assert.equal(brokeSaidOf([{ body: "nice" }, { body: "**This broke**: the window opens blank\n\n— a's agent" }]), "the window opens blank");
  // the night pass's words (sol/review/lib.mjs brokeWhy): where and how serious from them; a person's words: #n, serious
  assert.deepEqual(knotOfBroke("the night's review found a serious thing: the row (its key) is lost (sol/mac/src/x.tsx:12, major) https://github.com/o/r/pull/9#issuecomment-1", 9),
    { what: "the row (its key) is lost", where: "#9 sol/mac/src/x.tsx:12", severity: "major" });
  assert.deepEqual(knotOfBroke("the night's review found 2 serious things; the worst: the engine stops (sol/engine/src/x.ts:3, critical)", 9),
    { what: "the engine stops", where: "#9 sol/engine/src/x.ts:3", severity: "critical" });
  assert.deepEqual(knotOfBroke("the window opens blank", 9), { what: "the window opens blank", where: "#9", severity: "serious" });
  assert.deepEqual(knotOfBroke("", 9, "A title"), { what: "#9 A title was marked broke", where: "#9", severity: "serious" });
  assert.equal(channelOf({ kind: "dev", beta: false }), "dev");
  assert.equal(channelOf({ kind: "dev", beta: true }), "beta");
  assert.equal(channelOf({ kind: "stable", beta: true }), "stable");
});

// a comment as GET repos/{r}/issues/comments gives it
const C = (issue: number, body: string, created_at: string, login = "c", id = 1) => ({ body, created_at, html_url: `https://github.com/o/r/issues/${issue}#issuecomment-${id}`, issue_url: `https://api.github.com/repos/o/r/issues/${issue}`, user: { login } });

test("decisions: by a person or signed by an agent, a line starting <Name>'s call or Decision, since the release; never a bare decided", () => {
  const since = Date.parse("2026-11-15T00:00:00Z");
  const d = decisionsOf([
    C(7, "Ann's call on the card (2026-11-16): **a card in the room**, mirrored as a comment. Session 3f2a9c1b.\n\nMore lines.\n\n— c's agent", "2026-11-16T13:40:00Z"),
    C(7, "Seen.\n\n**Decision,** the old one goes\nfrom the line.\n\nThe rest.", "2026-11-15T10:00:00Z", "b", 2),   // a person typed it
    C(7, "We decided the old one goes.\n\n— b's agent", "2026-11-15T11:00:00Z", "b", 3),          // a bare decided: never
    C(7, "Ann's call: yes.", "2026-11-16T14:00:00Z", "z", 4),                                      // neither a person nor signed
    C(7, "Zed's call: no such person.\n\n— a's agent", "2026-11-16T14:10:00Z", "a", 5),          // a name not in the people
    C(7, "Taking this. It is Ann's call, later.\n\n— a's agent", "2026-11-16T14:20:00Z", "a", 6), // not at the start of a line
    C(7, "Bo's call, too old.\n\n— b's agent", "2026-11-14T10:00:00Z", "b", 7),
  ], since, PEOPLE, { 7: "the card" });
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { issue: 7, title: "the card", when: "2026-11-16T13:40:00.000Z", saidBy: "a", signedBy: "c", agent: true, session: "3f2a9c1b",
    words: "Ann's call on the card (2026-11-16): a card in the room, mirrored as a comment. Session 3f2a9c1b.", proof: { url: "https://github.com/o/r/issues/7#issuecomment-1" } });
  assert.deepEqual(d[1], { issue: 7, title: "the card", when: "2026-11-15T10:00:00.000Z", saidBy: "b", signedBy: "b", words: "Decision, the old one goes from the line.", proof: { url: "https://github.com/o/r/issues/7#issuecomment-2" } });
  assert.equal(callOf("> **Bo's call**: two", PEOPLE), "b");
  assert.equal(callOf("Decision, one", PEOPLE), "");
  assert.equal(callOf("decided: one", PEOPLE), null);
});

test("commentsSince: the comments endpoint, a page of 100 at a time until a short page", async () => {
  const asked: string[] = [];
  const page = (n: number, k: number) => Array.from({ length: k }, (_, i) => C(1, `p${n} c${i}`, "2026-11-16T10:00:00Z", "a", n * 1000 + i));
  const gh = async (args: string[]) => { const u = args[1]; asked.push(u); const n = Number(/page=(\d+)$/.exec(u)?.[1]); return JSON.stringify(n === 1 ? page(1, 100) : n === 2 ? page(2, 100) : page(3, 7)); };
  const got = await commentsSince(gh, "o/r", "2026-11-15T00:00:00Z");
  assert.equal(got.length, 207);
  assert.equal(asked.length, 3);
  assert.ok(asked.every((u) => u.startsWith("repos/o/r/issues/comments?since=2026-11-15T00%3A00%3A00Z&") && u.includes("per_page=100")), asked[0]);
});

test("readReleases: a git line with two releases, GitHub's JSON for the PRs and issues, everyone against main", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-releases-"));
  const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: "", GIT_COMMITTER_DATE: "" } }).toString().trim();
  const commit = (subject: string, body: string, when: string) => execFileSync("git", ["commit", "-q", "--allow-empty", "-m", subject, ...(body ? ["-m", body] : [])], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } });
  g("init", "-q", "-b", "main");
  g("config", "user.name", "the machine"); g("config", "user.email", "m@example.invalid");
  commit("start", "", "2026-11-14T10:00:00Z");
  const old = g("rev-parse", "HEAD");
  commit("Merge pull request #10 from o/a/x", "Rows by person", "2026-11-14T20:00:00Z");
  execFileSync("git", ["tag", "-a", "dev-20261115", "-m", "dev release dev-20261115"], { cwd: dir, env: { ...process.env, GIT_COMMITTER_DATE: "2026-11-15T14:00:00Z" } });
  g("update-ref", "refs/remotes/origin/a/mine", g("rev-parse", "HEAD"));   // a personal mine branch: never read for behind
  commit("Merge pull request #11 from o/b/y", "The card", "2026-11-15T20:00:00Z");
  commit("Merge pull request #12 from o/c/z", "The broken one", "2026-11-15T21:00:00Z");
  execFileSync("git", ["tag", "-a", "dev-20261116-1200", "-m", "urgent dev release dev-20261116-1200, OK'd by b (#11)"], { cwd: dir, env: { ...process.env, GIT_COMMITTER_DATE: "2026-11-16T12:00:00Z" } });
  commit("Merge pull request #13 from o/a/w", "Not released yet", "2026-11-16T13:00:00Z");

  // GitHub's JSON, as `gh … --json` prints it
  const GH: Record<string, unknown> = {
    "pr list --state open": [{ number: 20, title: "A open one", author: { login: "b", is_bot: false } }],
    "pr list --state merged": [
      { number: 10, body: "Fixes #1\n\n— a's agent", author: { login: "a" } },
      { number: 11, body: "Part of #2\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)", author: { login: "b" } },
      { number: 12, body: "Fixes #3", author: { login: "c" } },
      { number: 13, body: "Fixes #4", author: { login: "a" } },
    ],
    "api repos/o/r/issues/comments": [C(2, "Bo's call: one frame, two presses.\n\n— a's agent", "2026-11-15T22:00:00Z", "a", 5)],
    // the timeline's own read (readLine): every PR into main with its labels and comments; the knots come from here
    "pr list --state all": [
      { number: 12, title: "The broken one", author: { login: "c" }, state: "MERGED", labels: [{ name: "broke" }], comments: [
        { body: "**This broke**: the night's review found a serious thing: the engine stops at start (sol/engine/src/x.ts:3, critical) https://github.com/o/r/pull/12#issuecomment-9\n\n— c's agent", createdAt: "2026-11-16T07:00:00Z" }] },
      { number: 13, title: "Not released yet", author: { login: "a" }, state: "MERGED", labels: [{ name: "broke" }], comments: [
        { body: "**This broke**: the face is blank on start\n\n— a's agent", createdAt: "2026-11-16T14:00:00Z" }] },
    ],
  };
  const asked: string[] = [];
  const gh = async (args: string[]) => {
    const k = args.join(" ");
    asked.push(k);
    if (k.startsWith("api repos/o/r/issues/2 ")) return "The card\n";
    const hit = Object.keys(GH).find((x) => k.startsWith(x.split(" --")[0]) && (!x.includes("--state") || k.includes(x.slice(x.indexOf("--state")))));
    return hit ? JSON.stringify(GH[hit]) : "";
  };
  forgetTimeline();   // the timeline's kept line is shared: start from none
  const r = await readReleases({
    dir, gh, repo: async () => "o/r", people: () => PEOPLE, fetch: false, now: () => NOW, me: () => "a",
    words: () => [{ login: "c", person: "c", machine: "m", tag: "dev-20261115", sha: old, branch: "dev", at: NOW.getTime() - 1000 }],
    night: async () => ({ handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "", beta: ["c"] }),
  });

  assert.equal(r.me, "a");
  assert.deepEqual(r.releases.map((x) => [x.tag, x.channel, x.by, !!x.next, !!x.latest]), [
    ["main", "dev", "", true, false],
    ["dev-20261116-1200", "dev", "b", false, true],
    ["dev-20261115", "dev", "the machine", false, false],
  ]);
  const [next, newest, first] = r.releases;
  // main past the release: held by the night (#13 wears broke, the words from its comment)
  assert.deepEqual(next.waits, { held: true });
  assert.deepEqual(next.knots, [{ what: "the face is blank on start", where: "#13", severity: "serious" }]);
  // the newest: its PRs with issue and agent, its knot from the night pass's broke comment, the beta pass waiting on its reviewer
  assert.deepEqual(newest.prs, [{ n: 11, title: "The card", issue: 2, by: "b", agentOf: "b" }, { n: 12, title: "The broken one", issue: 3, by: "c" }]);
  assert.deepEqual(newest.knots, [{ what: "the engine stops at start", where: "#12 sol/engine/src/x.ts:3", severity: "critical" }]);
  assert.ok(!asked.some((k) => k.startsWith("pr view")), "no PR's comments read twice: the line already has them");
  assert.deepEqual(newest.waits, { press: "beta", who: ["c"] });
  assert.deepEqual(first.prs, [{ n: 10, title: "Rows by person", issue: 1, by: "a", agentOf: "a" }]);
  assert.deepEqual(first.behind, []);
  // everyone against main, placed as the timeline places them (placePeople), from what their Sol runs: a and b have
  // said nothing (a's mine branch is not read), c runs the first release, one behind the newest
  assert.deepEqual(newest.behind, [
    { login: "a", name: "Ann", on: null, releases: null, prs: [] },
    { login: "b", name: "Bo", on: null, releases: null, prs: [{ n: 20, title: "A open one" }] },
    { login: "c", name: "Cy", on: "dev-20261115", releases: 1, prs: [] },
  ]);
  assert.deepEqual(r.decisions, [{ issue: 2, title: "The card", when: "2026-11-15T22:00:00.000Z", saidBy: "b", signedBy: "a", agent: true, words: "Bo's call: one frame, two presses.", proof: { url: "https://github.com/o/r/issues/2#issuecomment-5" } }]);
  assert.ok(asked.some((k) => k.startsWith("api repos/o/r/issues/comments?since=2026-11-15T14%3A00%3A00Z&") && k.includes("page=1")), "decisions are asked of the comments endpoint since the oldest release shown");
  assert.ok(!asked.some((k) => k.startsWith("issue list") && k.includes("comments")), "no 50-issue read");

  // point 5 (Frank's agent): it stands on releasesNow, the timeline's kept line, so a second read does not read the line
  // again (no second pr list --state all) while the kept one is younger than five minutes
  const lines = () => asked.filter((k) => k.startsWith("pr list") && k.includes("--state all")).length;
  const before = lines();
  assert.equal(before, 1);
  await readReleases({ dir, gh, repo: async () => "o/r", people: () => PEOPLE, fetch: false, now: () => NOW, me: () => "a" });
  assert.equal(lines(), before, "the line is the kept one, not read again");
  forgetTimeline();
});

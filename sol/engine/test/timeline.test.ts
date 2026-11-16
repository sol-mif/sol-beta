// The timeline (#424, part of #413): every release drawn, who runs which, what never made it (src/team/timeline.ts).
// buildLine and placePeople are pure; readLine is read once against a real git repository with stable tags only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLine, worse, sentBackOf, labelsOf, placePeople, spotsOf, foldOf, severeOf, wordsOf, namesRelease, readLine, type MainCommit, type TagRef, type PrRead } from "../src/team/timeline.ts";

const NOW = new Date("2026-10-30T15:00:00Z");
const at = (d: string) => new Date(d).toISOString();
// main's first-parent line, oldest first here (the builder takes git's order, newest first: `.reverse()` below)
const sha = (n: number) => n.toString(16).padStart(8, "0").padEnd(40, "a");
const C = (n: number, when: string, subject: string, body = ""): MainCommit => ({ sha: sha(n), at: at(when), subject, body });
const LINE: MainCommit[] = [
  C(1, "2026-10-26T10:00Z", "Merge pull request #10 from sol-mif/marco/a", "The first change"),
  C(2, "2026-10-26T20:00Z", "a plain commit"),
  C(3, "2026-10-27T08:00Z", "Squashed thing (#11)"),
  C(4, "2026-10-27T18:00Z", "Merge pull request #12 from sol-mif/frank/b", "Frank's change"),
  C(5, "2026-10-28T12:00Z", "Merge pull request #13 from sol-mif/isaac/c", "Isaac's change"),
  C(6, "2026-10-29T20:00Z", "Merge pull request #14 from sol-mif/marco/d", "Not released yet"),
];
const commits = [...LINE].reverse();
const T = (tag: string, n: number, when: string): TagRef => ({ tag, sha: sha(n), at: at(when) });

test("a fold is read from a merge commit or a squash; anything else is not a change", () => {
  assert.deepEqual(foldOf(LINE[0]), { number: 10, title: "The first change" });
  assert.deepEqual(foldOf(LINE[2]), { number: 11, title: "Squashed thing" });
  assert.equal(foldOf(LINE[1]), null);
});

test("ordering: releases oldest first by their place on main, each with what folded since the one before", () => {
  // given out of order, and one dev tag dated before its commit's place: main's line decides
  const tags = [T("dev-20261028", 5, "2026-10-28T13:00Z"), T("dev-20261026", 1, "2026-10-26T11:00Z"), T("dev-20261027", 4, "2026-10-27T19:00Z")];
  const l = buildLine({ tags, commits, now: NOW });
  assert.equal(l.source, "dev");
  assert.deepEqual(l.releases.map((r) => r.tag), ["dev-20261026", "dev-20261027", "dev-20261028", "main"]);
  assert.deepEqual(l.releases.map((r) => r.changes.map((c) => c.number)), [[10], [11, 12], [13], [14]]);
  assert.equal(l.releases[2].latest, true);
  assert.equal(l.releases[3].kind, "next");
  assert.equal(l.releases.filter((r) => r.latest).length, 1);
});

test("beta: a stable tag on a dev release's commit marks it, and each change's way ends at the first beta after it", () => {
  const tags = [T("dev-20261026", 1, "2026-10-26T11:00Z"), T("dev-20261027", 4, "2026-10-27T19:00Z"), T("dev-20261028", 5, "2026-10-28T13:00Z"), T("stable-20261028-0900", 4, "2026-10-28T13:00Z")];
  const prs: PrRead[] = [{ number: 12, title: "Frank's change, as GitHub says it", author: "frank", url: "u12", state: "merged", createdAt: at("2026-10-27T15:00Z") }];
  const l = buildLine({ tags, commits, prs, now: NOW });
  assert.deepEqual(l.releases.map((r) => [r.tag, r.beta]), [["dev-20261026", false], ["dev-20261027", true], ["dev-20261028", false], ["main", false]]);
  const c12 = l.releases[1].changes.find((c) => c.number === 12)!;
  assert.deepEqual({ ...c12 }, { number: 12, title: "Frank's change, as GitHub says it", author: "frank", url: "u12", handedIn: at("2026-10-27T15:00Z"), folded: at("2026-10-27T18:00Z"), release: "dev-20261027", releaseAt: at("2026-10-27T19:00Z"), beta: "dev-20261027", betaAt: at("2026-10-27T19:00Z") });
  assert.equal(l.releases[0].changes[0].beta, "dev-20261027");   // #10 reached beta with the next one
  assert.equal(l.releases[2].changes[0].beta, undefined);         // #13 is on dev only
});

test("with no dev tag the stable tags are the history; after the first dev tag a stable tag is only a beta mark", () => {
  const only = buildLine({ tags: [T("stable-20261026-1000", 1, "2026-10-26T11:00Z"), T("stable-20261028-1200", 5, "2026-10-28T13:00Z")], commits, now: NOW });
  assert.equal(only.source, "stable");
  assert.deepEqual(only.releases.map((r) => [r.tag, r.kind, r.beta]), [["stable-20261026-1000", "stable", true], ["stable-20261028-1200", "stable", true], ["main", "next", false]]);
  assert.deepEqual(only.releases[1].changes.map((c) => c.number), [11, 12, 13]);
  const mixed = buildLine({ tags: [T("stable-20261026-1000", 1, "2026-10-26T11:00Z"), T("dev-20261027", 4, "2026-10-27T19:00Z"), T("stable-20261028-1200", 5, "2026-10-28T13:00Z")], commits, now: NOW });
  assert.deepEqual(mixed.releases.map((r) => r.tag), ["stable-20261026-1000", "dev-20261027", "main"]);
  assert.deepEqual(mixed.releases[2].changes.map((c) => c.number), [13, 14]);
});

test("the window: thirty days; the release before it bounds what folded into the first shown", () => {
  const tags = [T("stable-20260901-1000", 1, "2026-09-01T11:00Z"), T("dev-20261027", 4, "2026-10-27T19:00Z")];
  const l = buildLine({ tags, commits, now: NOW });
  assert.deepEqual(l.releases.map((r) => r.tag), ["dev-20261027", "main"]);
  assert.deepEqual(l.releases[0].changes.map((c) => c.number), [11, 12]);
});

test("side branches: severe and not taken in since, closed without going in, held from beta; a severe that folded later is not one", () => {
  const tags = [T("dev-20261026", 1, "2026-10-26T11:00Z"), T("dev-20261027", 4, "2026-10-27T19:00Z"), T("dev-20261028", 5, "2026-10-28T13:00Z")];
  const prs: PrRead[] = [
    { number: 20, title: "Too big", author: "isaac", url: "u20", state: "open", sentBack: { at: at("2026-10-27T21:30Z"), by: "marco" } },
    { number: 21, title: "Abandoned", author: "frank", state: "closed", closedAt: at("2026-10-28T20:00Z") },
    { number: 13, title: "Isaac's change", state: "merged", sentBack: { at: at("2026-10-27T21:00Z"), by: "marco" } },
    { number: 22, title: "Long ago", state: "closed", closedAt: at("2026-08-01T00:00Z") },
    { number: 23, title: "Before any release", state: "closed", closedAt: at("2026-10-25T00:00Z") },
  ];
  const words = [{ release: "2026-10-27", verdict: "hold" as const, at: at("2026-10-28T01:00Z"), by: "frank" }, { release: "dev-20261026", verdict: "pass" as const, at: at("2026-10-27T01:00Z"), by: "frank" }];
  const l = buildLine({ tags, commits, prs, words, now: NOW });
  assert.deepEqual(l.sides.map((s) => [s.kind, s.from, s.number ?? s.title]), [
    ["severe", "dev-20261027", 20],
    ["held", "dev-20261027", "the dev release of 20261027"],
    ["closed", "dev-20261028", 21],
  ]);
  assert.equal(l.releases[0].beta, true);    // passed on the digest
  assert.equal(l.releases[1].held, true);
  assert.equal(l.releases[1].beta, false);
});

test("a held release that passed after is not held", () => {
  const tags = [T("dev-20261027", 4, "2026-10-27T19:00Z")];
  const words = [{ release: "dev-20261027", verdict: "hold" as const, at: at("2026-10-28T01:00Z") }, { release: "dev-20261027", verdict: "pass" as const, at: at("2026-10-29T01:00Z") }];
  const l = buildLine({ tags, commits, words, now: NOW });
  assert.equal(l.releases[0].held, undefined);
  assert.equal(l.releases[0].beta, true);
  assert.equal(l.sides.length, 0);
});

test("people: by release name, by commit, by a commit's place on main, main past the last; unknown off the line; me first", () => {
  const tags = [T("dev-20261026", 1, "2026-10-26T11:00Z"), T("dev-20261027", 4, "2026-10-27T19:00Z"), T("dev-20261028", 5, "2026-10-28T13:00Z")];
  const l = buildLine({ tags, commits, now: NOW });
  const spots = spotsOf(l, commits);
  const p = placePeople(l, [
    { login: "frank", version: { release: "dev-20261026", commit: sha(1).slice(0, 8), mine: 3 } },
    { login: "isaac", version: { release: "main", commit: sha(4).slice(0, 8) } },           // the commit of a release
    { login: "ana", version: { release: "main", commit: sha(3).slice(0, 8), behind: 9 } },  // between two releases
    { login: "marco", version: { release: "main", commit: sha(6).slice(0, 8), mine: 12 } }, // past the last
    { login: "ghost", version: null },
    { login: "Frank", version: null },   // the same person twice: once
  ], "marco", spots);
  assert.deepEqual(p.map((x) => [x.login, x.you, x.on, x.mine, x.behind]), [
    ["marco", true, "main", 12, 0],
    ["frank", false, "dev-20261026", 3, 2],
    ["isaac", false, "dev-20261027", 0, 1],
    ["ana", false, "dev-20261026", 0, 2],
    ["ghost", false, null, 0, 0],
  ]);
  assert.equal(p[0].line, "main, not released yet + 12 of mine");
  assert.equal(p[1].line, "dev-20261026 + 3 of mine, 2 behind");
  assert.equal(p[4].line, "unknown");
});

test("no tags at all: nothing released, what folded in the window on main, everyone on main or off the line", () => {
  const l = buildLine({ tags: [], commits, now: NOW });
  assert.equal(l.source, "none");
  assert.deepEqual(l.releases.map((r) => [r.tag, r.kind]), [["main", "next"]]);
  assert.deepEqual(l.releases[0].changes.map((c) => c.number), [10, 11, 12, 13, 14]);
  assert.equal(l.sides.length, 0);
  const p = placePeople(l, [{ login: "marco", version: { release: "main", commit: sha(2).slice(0, 8) } }, { login: "frank", version: { release: "stable-x", commit: "deadbeef" } }], "marco", spotsOf(l, commits));
  assert.deepEqual(p.map((x) => [x.login, x.on, x.behind]), [["marco", "main", 0], ["frank", null, 0]]);
  const empty = buildLine({ tags: [], commits: [], now: NOW });
  assert.deepEqual([empty.source, empty.releases, empty.sides], ["none", [], []]);
  assert.deepEqual(placePeople(empty, [{ login: "marco", version: { release: "main", commit: "0c02970c" } }], "marco").map((x) => x.on), [null]);
});

test("the review session's words: a severe send-back until a later fold or slight, and the digest's beta words", () => {
  assert.deepEqual(severeOf([{ body: "**Sent back** (severe) in the dev review of 2026-10-29: it waits", createdAt: "t1", author: { login: "marco" } }]), { at: "t1", by: "marco" });
  assert.equal(severeOf([{ body: "**Sent back** (severe) ...", createdAt: "t1" }, { body: "**Folded** into the dev release", createdAt: "t2" }]), undefined);
  assert.equal(severeOf([{ body: "**Sent back** (severe) ...", createdAt: "t1" }, { body: "**Into sol-dev** in the dev review of 2026-10-30: one merge commit", createdAt: "t2" }]), undefined);   // #477's words
  assert.equal(severeOf([{ body: "looks fine", createdAt: "t1" }]), undefined);
  assert.deepEqual(wordsOf([
    { body: "**Beta passed**: the dev release of dev-20261029 goes to beta whole (#1, #2).", createdAt: "t1", author: { login: "frank" } },
    { body: "**Beta held**: the dev release of 2026-10-30 stays off beta (nothing).", createdAt: "t2" },
    { body: "a remark", createdAt: "t3" },
  ]), [{ release: "dev-20261029", verdict: "pass", at: "t1", by: "frank" }, { release: "2026-10-30", verdict: "hold", at: "t2" }]);
  assert.equal(namesRelease("2026-10-30", "dev-20261030"), true);
  assert.equal(namesRelease("2026-10-30", "dev-20261030-1400"), false);   // an urgent fix is named by its tag
  assert.equal(namesRelease("dev-20261030-1400", "dev-20261030-1400"), true);
});

test("read from a real repository: stable tags only, git alone (no fetch, no GitHub)", async () => {
  const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env: ENV, encoding: "utf8" }).trim();
  const d = mkdtempSync(join(tmpdir(), "sol-timeline-"));
  git(d, "init", "-q", "-b", "main");
  let n = 0;
  const commit = (msg: string, body = "") => { writeFileSync(join(d, "f"), String(++n)); git(d, "add", "f"); git(d, "commit", "-q", "-m", msg, ...(body ? ["-m", body] : [])); return git(d, "rev-parse", "HEAD"); };
  commit("one");
  commit("Merge pull request #1 from x/y", "The first");
  const s1 = git(d, "rev-parse", "HEAD");
  git(d, "tag", "-a", "stable-20261029-0900", "-m", "s", s1);
  commit("Second (#2)");
  const b = await readLine({ dir: d, fetch: false, now: () => new Date(Date.now() + 1000) });
  assert.equal(b.line.source, "stable");
  assert.deepEqual(b.line.releases.map((r) => [r.tag, r.changes.map((c) => c.number)]), [["stable-20261029-0900", [1]], ["main", [2]]]);
  assert.equal(b.line.releases[0].sha, s1);
  assert.equal(b.spots[s1.slice(0, 8)], "stable-20261029-0900");
  const none = await readLine({ dir: tmpdir(), fetch: false });
  assert.equal(none.line.error, "no git history here");
});

test("handed in and waiting: open, ready and not sent back severe, oldest first; the night's rhythm rides along", () => {
  const prs: PrRead[] = [
    { number: 20, title: "later", state: "open", createdAt: at("2026-10-30T12:00Z") },
    { number: 21, title: "earlier", author: "frank", url: "u21", state: "open", createdAt: at("2026-10-30T10:00Z") },
    { number: 22, title: "a draft", state: "open", draft: true, createdAt: at("2026-10-30T09:00Z") },
    { number: 23, title: "sent back", state: "open", createdAt: at("2026-10-29T09:00Z"), sentBack: { at: at("2026-10-30T01:00Z") } },
    { number: 24, title: "folded", state: "merged", createdAt: at("2026-10-29T09:00Z") },
  ];
  const night = { handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "America/New_York" };
  const l = buildLine({ tags: [], commits, prs, now: NOW, night });
  assert.deepEqual(l.waiting, [{ number: 21, title: "earlier", author: "frank", url: "u21", at: at("2026-10-30T10:00Z") }, { number: 20, title: "later", at: at("2026-10-30T12:00Z") }]);
  assert.deepEqual(l.night, night);
  assert.equal(buildLine({ tags: [], commits, now: NOW }).night, undefined);
});

test("a read worse than the kept line never replaces it: GitHub failed, or git gave no release", () => {
  const good = buildLine({ tags: [T("dev-20261028", 5, "2026-10-28T13:00Z")], commits, now: NOW });
  const noGh = { ...good, error: "GitHub did not answer" };
  const empty = buildLine({ tags: [], commits: [], now: NOW });
  assert.equal(worse(noGh, good), true);
  assert.equal(worse(empty, good), true);
  assert.equal(worse(good, noGh), false);      // a good read replaces one that had failed
  assert.equal(worse(empty, undefined), false); // nothing kept yet: anything is better
  assert.equal(worse(noGh, empty), false);      // nothing worth keeping
});

test("#421's labels: sent-back:severe is a severe send back even with no severe comment; broke marks a folded change", () => {
  assert.deepEqual(sentBackOf([], ["sent-back:severe"], "2026-10-30T10:00:00Z"), { at: "2026-10-30T10:00:00Z" });
  assert.deepEqual(sentBackOf([{ body: "**Sent back** (severe) in the dev review", createdAt: "2026-10-30T02:00:00Z", author: { login: "marco" } }], ["sent-back:severe"], "2026-10-30T10:00:00Z"), { at: "2026-10-30T02:00:00Z", by: "marco" });
  assert.equal(sentBackOf([], [], "2026-10-30T10:00:00Z"), undefined);
  assert.deepEqual(labelsOf({ labels: [{ name: "broke" }, {}] }), ["broke", ""]);
  const l = buildLine({ tags: [T("dev-20261028", 5, "2026-10-28T13:00Z")], commits, prs: [{ number: 13, title: "Isaac's change", state: "merged", broke: true }], now: NOW });
  assert.equal(l.releases[0].changes.find((c) => c.number === 13)?.broke, true);
  assert.equal(l.releases[0].changes.find((c) => c.number === 10)?.broke, undefined);
});

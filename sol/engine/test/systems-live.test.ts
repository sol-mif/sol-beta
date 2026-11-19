// The system view reflects the work (#1156, sol/engine/src/work/systemsLive.ts): a changed path goes to the record whose
// where.paths holds it, the longest prefix winning; a path no record holds is "no system yet" by folder, and once it is
// committed a proposal for a record goes to the checkout's proposals.json, once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { folderOf, joinWork, LiveWork, pathIndex, placesIn, proposable, proposalFor, proposalId, prsBySystem, repoPath, statusPaths, systemsOf, withProposals, type Read } from "../src/work/systemsLive.ts";
import type { Rec } from "../src/work/systems.ts";

const rec = (id: string, paths: string[], more: Partial<Rec> = {}): Rec => ({
  id, name: id, about: "", parent: id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "jelly", kind: "doc", state: "live",
  where: { paths }, ...more,
});
const map = (...rs: Rec[]) => new Map(rs.map((r) => [r.id, r]));
const recs = map(
  rec("engine", ["sol/engine"]),
  rec("team", ["sol/engine/src/team"]),
  rec("team/pings", ["sol/engine/src/team/pings.ts"]),
  rec("team/ship", ["sol/engine/src/team/ship.ts"]),
  rec("releases/dev-release", ["sol/engine/src/team/ship.ts"]),
  rec("legacy/old", ["sol/engine/src/old"], { state: "legacy" }),
  rec("design/kit", ["sol/mac/src/kit/"]),
  rec("machines/scratch", ["~/computer/scratch/sol"]),
  rec("site", ["./site"]),
);
const idx = pathIndex(recs);

test("a record path is a repo path, or nothing: home paths, globs and climbs are not; ./ and a trailing / go", () => {
  assert.equal(repoPath("./site/"), "site");
  assert.equal(repoPath("~/computer/scratch/sol"), "");
  assert.equal(repoPath("/etc/x"), "");
  assert.equal(repoPath("sol/*.ts"), "");
  assert.equal(repoPath("../other"), "");
  assert.ok(!idx.some((x) => x.id === "machines/scratch"));
});

test("a changed path goes to the record with the longest prefix that holds it", () => {
  assert.deepEqual(systemsOf("sol/engine/src/team/pings.ts", idx), ["team/pings"]);
  assert.deepEqual(systemsOf("sol/engine/src/team/talk.ts", idx), ["team"]);
  assert.deepEqual(systemsOf("sol/engine/src/index.ts", idx), ["engine"]);
  assert.deepEqual(systemsOf("sol/mac/src/kit/Glass.tsx", idx), ["design/kit"]);
  assert.deepEqual(systemsOf("site/index.html", idx), ["site"]);
});

test("a prefix holds only whole folders: sol/engine-x is not under sol/engine", () => {
  assert.deepEqual(systemsOf("sol/engine-x/a.ts", idx), []);
  assert.deepEqual(systemsOf("sol/engine", idx), ["engine"]);
  assert.deepEqual(systemsOf("sol/engine/", idx), ["engine"]);
});

test("a tie at the longest prefix gives every record there; a live one hides a legacy one, else the legacy one stands", () => {
  assert.deepEqual(systemsOf("sol/engine/src/team/ship.ts", idx).sort(), ["releases/dev-release", "team/ship"]);
  assert.deepEqual(systemsOf("sol/engine/src/old/a.ts", idx), ["legacy/old"]);
  const tie = pathIndex(map(rec("a", ["x"]), rec("b", ["x"], { state: "legacy" })));
  assert.deepEqual(systemsOf("x/y", tie), ["a"]);
});

test("a path no record holds has no system; its folder is its own, an untracked folder itself, or the file itself at the top", () => {
  assert.deepEqual(systemsOf("docs/beta/list.html", idx), []);
  assert.equal(folderOf("docs/beta/list.html"), "docs/beta");
  assert.equal(folderOf("README.md"), "README.md");
  assert.equal(folderOf("sol/design/attention/"), "sol/design/attention");
});

test("git's -z status gives each path once, a rename by its new name, an untracked folder as itself", () => {
  const z = [" M sol/engine/src/team/pings.ts", "R  new/name.ts", "old/name.ts", "?? docs/beta/", "A  site/a.html", ""].join("\0");
  assert.deepEqual(statusPaths(z), ["sol/engine/src/team/pings.ts", "new/name.ts", "docs/beta/", "site/a.html"]);
});

const read = (more: Partial<Read> = {}): Read => ({
  top: "/r", branch: "marco/x", person: "Marco", behind: 3, ahead: 1,
  files: [
    { path: "sol/engine/src/team/pings.ts", at: 100, committed: true },
    { path: "sol/engine/src/team/talk.ts", at: 300, committed: false },
    { path: "docs/beta/list.html", at: 200, committed: false },
  ],
  sessions: [{ id: "s-old", title: "older", updatedAt: 10 }, { id: "s-new", title: "newer", updatedAt: 20 }],
  ...more,
});

test("the work is by system and session: a file goes to the session that edited it, else the one that moved last", () => {
  const r = read({ sessions: [{ id: "s-old", title: "older", updatedAt: 10, edits: new Map([["sol/engine/src/team/pings.ts", 50]]) }, { id: "s-new", title: "newer", updatedAt: 20 }] });
  const { work, uncovered } = joinWork([r], () => ({ idx, recs }));
  assert.deepEqual(work.map((w) => [w.system, w.session, w.files, w.at, w.behind]), [
    ["team", "s-new", ["sol/engine/src/team/talk.ts"], 300, 3],
    ["team/pings", "s-old", ["sol/engine/src/team/pings.ts"], 100, 3],
  ]);
  assert.deepEqual(uncovered.map((u) => [u.folder, u.session, u.files, u.committed, u.near]), [["docs/beta", "s-new", ["docs/beta/list.html"], [], "jelly"]]);
});

test("each checkout is read against its own records: a branch that adds a record holds its own folder", () => {
  const r = read({ files: [{ path: "docs/beta/list.html", at: 1, committed: true }] });
  const own = pathIndex(map(rec("docs", ["docs/beta"])));
  assert.deepEqual(joinWork([r], () => ({ idx: own })).work.map((w) => w.system), ["docs"]);
  assert.deepEqual(joinWork([r], () => ({ idx })).uncovered.map((u) => u.folder), ["docs/beta"]);
});

test("a person's own folders are never work on a system, nor a system to propose; a file at the top is not proposed", () => {
  const r = read({ files: [{ path: "sol/home/ground.json", at: 1, committed: false }, { path: "mine/notes/a.md", at: 1, committed: true }] });
  assert.deepEqual(joinWork([r], () => ({ idx })), { work: [], uncovered: [] });
  assert.equal(proposable("now.md"), false);
  assert.equal(proposable("sol/systems/x"), false);
  assert.equal(proposable("sol/home/flows"), false);
  assert.equal(proposable("docs/beta"), true);
});

test("a checkout with no recent session says nothing", () => {
  assert.deepEqual(joinWork([read({ sessions: [] })], () => ({ idx })), { work: [], uncovered: [] });
});

test("the open PRs count once per system, however many of its files a PR touches", () => {
  const by = prsBySystem([{ number: 7, files: ["sol/engine/src/team/pings.ts", "sol/engine/src/team/talk.ts", "sol/engine/src/team/a.ts"] }, { number: 3, files: ["sol/engine/src/team/b.ts"] }], idx);
  assert.deepEqual(by, { "team/pings": [7], team: [3, 7] });
});

test("a proposal for an uncovered folder sits beside the record that shares the most of its path, and adds once by id", () => {
  const p = proposalFor("sol/engine/src/brandnew", ["sol/engine/src/brandnew/a.ts"], map(rec("engine", ["sol/engine"]), rec("engine/x", ["sol/engine/src/x"])), { title: "t", person: "Marco", branch: "b", at: Date.UTC(2026, 10, 14) });
  assert.equal(p.id, "p-system-sol-engine-src-brandnew");
  assert.equal(p.system, "engine");
  assert.equal(p.folder, "sol/engine/src/brandnew");
  assert.match(p.evidence, /2026-11-14/);
  assert.equal(proposalFor("zzz", ["zzz/a"], map(rec("engine", ["sol/engine"])), { title: "t", person: "M", branch: "b", at: 0 }).system, "jelly");
  const once = withProposals([{ id: "p-a" }], [p, p]);
  assert.deepEqual(once?.added, [p.id]);
  assert.equal(once?.list.length, 2);
  assert.deepEqual(withProposals(once!.list, [p])?.added, []);
  assert.equal(withProposals({ not: "a list" }, [p]), null);
});

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-C", cwd, ...a], { stdio: "pipe", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@t" } }).toString();

test("a checkout: a session's committed and uncommitted changes light their systems, and a committed uncovered folder is proposed once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "systems-live-"));
  try {
    git(dir, "init", "-q", "-b", "main"); git(dir, "config", "user.name", "Tester");
    mkdirSync(join(dir, "sol/systems/records"), { recursive: true }); mkdirSync(join(dir, "sol/engine/src/team"), { recursive: true });
    writeFileSync(join(dir, "sol/systems/records/team.json"), JSON.stringify(rec("team", ["sol/engine/src/team"])));
    writeFileSync(join(dir, "sol/systems/proposals.json"), "[]\n");
    writeFileSync(join(dir, "sol/engine/src/team/pings.ts"), "a\n");
    git(dir, "add", "."); git(dir, "commit", "-qm", "base");
    git(dir, "checkout", "-qb", "marco/work");
    mkdirSync(join(dir, "docs/fresh"), { recursive: true }); writeFileSync(join(dir, "docs/fresh/a.md"), "x\n");
    git(dir, "add", "."); git(dir, "commit", "-qm", "a new folder");
    writeFileSync(join(dir, "sol/engine/src/team/pings.ts"), "b\n");
    const now = Date.now();
    const lw = new LiveWork({ sessions: async () => [{ id: "sess-1", title: "Pings", cwd: dir, updatedAt: now }], records: () => map(rec("team", ["sol/engine/src/team"])), now: () => now });
    const live = await lw.read();
    assert.deepEqual(live.work.map((w) => [w.system, w.session, w.title, w.person, w.branch, w.files, w.ahead]), [["team", "sess-1", "Pings", "Tester", "marco/work", ["sol/engine/src/team/pings.ts"], 1]]);
    assert.deepEqual(live.uncovered.map((u) => [u.folder, u.committed]), [["docs/fresh", ["docs/fresh/a.md"]]]);
    const props = JSON.parse(readFileSync(join(dir, "sol/systems/proposals.json"), "utf8"));
    assert.deepEqual(props.map((p: { id: string; folder: string }) => [p.id, p.folder]), [[proposalId("docs/fresh"), "docs/fresh"]]);
    await lw.read();   // read again: proposed once, never twice
    assert.equal(JSON.parse(readFileSync(join(dir, "sol/systems/proposals.json"), "utf8")).length, 1);
    // a checkout kept clean (the window's own), or one on main, gets no proposal
    writeFileSync(join(dir, "sol/systems/proposals.json"), "[]\n");
    const kept = new LiveWork({ sessions: async () => [{ id: "sess-1", title: "Pings", cwd: dir, updatedAt: now }], records: () => map(rec("team", ["sol/engine/src/team"])), now: () => now, keep: [dir] });
    await kept.read();
    assert.equal(readFileSync(join(dir, "sol/systems/proposals.json"), "utf8"), "[]\n");
    // an old session counts for nothing
    const stale = new LiveWork({ sessions: async () => [{ id: "sess-2", title: "Old", cwd: dir, updatedAt: now - 7 * 3_600_000 }], records: () => map(rec("team", ["sol/engine/src/team"])), now: () => now, write: false });
    assert.deepEqual((await stale.read()).work, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a transcript says where its session works: the folders of the files it names, the folders it changes into, and the files it edited", () => {
  const t = [
    '{"type":"tool_use","id":"a","name":"Edit","input":{"file_path":"/w/side/sol/engine/src/team/pings.ts","old_string":"x"}}',
    '{"type":"tool_use","id":"b","name":"Read","input":{"file_path":"/w/main/README.md"}}',
    '{"type":"tool_use","id":"c","name":"Bash","input":{"command":"cd /w/side2 && git status; git -C /w/side3 log"}}',
  ].join("\n");
  const { dirs, edits } = placesIn(t);
  assert.deepEqual(edits, ["/w/side/sol/engine/src/team/pings.ts"]);
  assert.deepEqual(dirs.sort(), ["/w/main", "/w/side/sol/engine/src/team", "/w/side2", "/w/side3"]);
});

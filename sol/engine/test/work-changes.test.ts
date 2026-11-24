// work.changes (BR1, #1615): each session's changed files, by its copy, for the plane's piece.files (place.ts counts.files).
// changedCount on a real git folder made here (a branch off main: a commit, an edit, a new file); changesPerCopy with a
// stand-in count: a copy counted once for all its sessions, a gone or archived session left out, a folder not git left out.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-changes-")));
Object.assign(process.env, { HOME: join(dir, "person"), SOL_STATE: join(dir, "work.json"), SOL_HOME: join(dir, "home"), SOL_TEAM: join(dir, "team.json"), SOL_TEAM_OFFLINE: "1" });
const { changedCount, changesPerCopy } = await import("../src/work/panes.ts");
after(() => rmSync(dir, { recursive: true, force: true }));

test("a copy's changed files: committed on its branch, edited, and new, each once; a folder not git says null", async () => {
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: repo, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "a.txt"), "a"); writeFileSync(join(repo, "b.txt"), "b");
  git("add", "."); git("commit", "-q", "-m", "one");
  assert.equal(await changedCount(repo), 0, "on main with nothing changed");
  git("checkout", "-q", "-b", "work");
  writeFileSync(join(repo, "a.txt"), "a2"); git("commit", "-qam", "two");
  writeFileSync(join(repo, "a.txt"), "a3");
  writeFileSync(join(repo, "b.txt"), "b2");
  writeFileSync(join(repo, "c.txt"), "new");
  assert.equal(await changedCount(repo), 3, "a.txt (committed and edited again) once, b.txt edited, c.txt new");
  const plain = join(dir, "plain"); mkdirSync(plain);
  assert.equal(await changedCount(plain), null);
});

test("each session carries its copy's count; a copy is counted once; gone, archived and not-git sessions are left out", async () => {
  const asked: string[] = [];
  const count = async (c: string) => { asked.push(c); return c === "/not-git" ? null : c.length; };
  const out = await changesPerCopy([
    { id: "s1", cwd: "/repo", worktree: "/repo/.wt/one" }, { id: "s2", cwd: "/repo/.wt/one" }, { id: "s3", cwd: "/repo" },
    { id: "s4", cwd: "/gone", gone: true }, { id: "s5", cwd: "/old", archived: true }, { id: "s6", cwd: "/not-git" }, { id: "s7" },
  ], count);
  assert.deepEqual(out, [{ sessionId: "s1", files: 13, copy: "/repo/.wt/one" }, { sessionId: "s2", files: 13, copy: "/repo/.wt/one" }, { sessionId: "s3", files: 5, copy: "/repo" }]);
  assert.deepEqual(asked.sort(), ["/not-git", "/repo", "/repo/.wt/one"], "each copy asked once");
  assert.deepEqual(await changesPerCopy([{ id: "a", cwd: "/a" }, { id: "b", cwd: "/b" }], count, 1), [{ sessionId: "a", files: 2, copy: "/a" }], "at most max copies");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// #496: any git worktree files under its repo, not as a folder of its own. Work's marks in a file of their own
const top = realpathSync(mkdtempSync(join(tmpdir(), "sol-worktrees-")));
process.env.SOL_STATE = join(top, "work.json");
process.env.SOL_SESSIONS_DIR = join(top, "sessions");
const { folderOp } = await import("../src/work/state.ts");
const { fileSessions, invalidate } = await import("../src/work/sessions.ts");
const { worktreeOf, forgetWorktrees } = await import("../src/work/copies.ts");

let n = 0;
const s = (cwd: string) => ({ sessionId: `w${++n}`, cwd, summary: `in ${cwd}`, lastModified: 1000 + n, fileSize: 10 }) as any;
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();

// a real repo with two worktrees made by git, beside it as a terminal makes them (not under .claude/worktrees)
const repo = join(top, "repo"), wt = join(top, "wt");
mkdirSync(repo); mkdirSync(wt);
git(repo, "init", "-q", "-b", "main");
git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "one");
git(repo, "worktree", "add", "-q", "-b", "a", join(wt, "r5-476"));
git(repo, "worktree", "add", "-q", "-b", "b", join(wt, "r5-477"));
mkdirSync(join(wt, "r5-476", "sol", "engine"), { recursive: true });

test("a worktree git made outside Sol is a copy of its repo, from its top or any folder inside it", () => {
  assert.deepEqual(worktreeOf(join(wt, "r5-476")), { repo, name: "r5-476" });
  assert.deepEqual(worktreeOf(join(wt, "r5-476", "sol", "engine")), { repo, name: "r5-476" });
  assert.equal(worktreeOf(repo), null, "the main checkout is not a copy");
  assert.equal(worktreeOf(join(repo, "sub", "dir")), null, "nor a folder inside it");
  assert.equal(worktreeOf(top), null, "nor a folder with no git at all");
});

test("a submodule's .git file is not a worktree, and a relative gitdir is read from the folder it sits in", () => {
  const sub = join(top, "host", "lib");
  mkdirSync(join(top, "host", ".git", "modules", "lib"), { recursive: true }); mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, ".git"), "gitdir: ../.git/modules/lib\n");
  assert.equal(worktreeOf(sub), null);
  const rel = join(top, "far", "copy");
  mkdirSync(join(top, "far", "main", ".git", "worktrees", "copy"), { recursive: true }); mkdirSync(rel, { recursive: true });
  writeFileSync(join(rel, ".git"), "gitdir: ../main/.git/worktrees/copy\n");
  assert.deepEqual(worktreeOf(rel), { repo: join(top, "far", "main"), name: "copy" });
});

test("Work's side: sessions in the worktrees file under one folder, the repo, each tagged with its worktree", () => {
  folderOp("add", repo);   // the temp folder is scratch to the side: added by hand, as Marco adds a folder
  const r = fileSessions([s(repo), s(join(wt, "r5-476")), s(join(wt, "r5-476", "sol", "engine")), s(join(wt, "r5-477"))]);
  assert.deepEqual(r.projects.map((p) => p.path), [repo], "one folder, not three");
  assert.equal(r.projects[0].count, 4);
  assert.deepEqual(r.sessions.map((x) => x.worktree ?? ""), ["", "r5-476", "r5-476", "r5-477"]);
});

test("a worktree removed since it was seen stays a copy of its repo, its sessions marked gone under the repo", () => {
  assert.deepEqual(worktreeOf(join(wt, "r5-477")), { repo, name: "r5-477" });
  git(repo, "worktree", "remove", join(wt, "r5-477"));
  invalidate();   // the list read again: the folders there and the ones found not to be worktrees forgotten
  assert.deepEqual(worktreeOf(join(wt, "r5-477")), { repo, name: "r5-477" });
  folderOp("add", repo);   // as the test above, so this one also stands alone (the eval's check picks it by name)
  const r = fileSessions([s(repo), s(join(wt, "r5-477"))]);
  assert.deepEqual(r.projects.map((p) => p.path), [repo]);
  assert.equal(r.sessions.find((x) => x.worktree === "r5-477")?.gone, true);
});

test("a folder that was not a worktree is asked again after a minute, not before", () => {
  forgetWorktrees();
  const later = join(top, "later");
  mkdirSync(join(top, "main2", ".git", "worktrees", "later"), { recursive: true }); mkdirSync(later);
  assert.equal(worktreeOf(later, 1_000), null);
  writeFileSync(join(later, ".git"), `gitdir: ${join(top, "main2", ".git", "worktrees", "later")}\n`);
  assert.equal(worktreeOf(later, 30_000), null, "still the answer from a moment ago");
  assert.deepEqual(worktreeOf(later, 62_000), { repo: join(top, "main2"), name: "later" });
});

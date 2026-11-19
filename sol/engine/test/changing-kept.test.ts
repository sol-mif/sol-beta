// changing.ts, the copy a take-back writes (#894): it is never older than the last commit that kept the file. The case
// as filed is n10-changing-stale-copy.test.ts; these are the other ways into the same defect, and the two cases a fix
// must not walk into (a file with uncommitted work keeps its first copy; a folder git does not know behaves as before).
// A real git repo in a temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Changing } from "../src/changing.ts";

const git = (dir: string, ...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();

function repo(withGit = true) {
  const root = mkdtempSync(join(tmpdir(), "sol-kept-"));
  const sol = join(root, "sol");
  mkdirSync(join(sol, "mac", "src"), { recursive: true }); mkdirSync(join(sol, "home"), { recursive: true });
  const A = join(sol, "mac", "src", "A.tsx");
  writeFileSync(A, "a0\n"); writeFileSync(join(sol, "home", "CLAUDE.md"), "");
  if (withGit) { git(root, "init", "-q"); git(root, "add", "."); git(root, "commit", "-q", "-m", "start"); }
  return { root, sol, A, c: new Changing(join(sol, "home"), () => {}) };
}
// one edit of the seat's through the Edit tool: the call, what it leaves in the file, its result
async function edit(r: ReturnType<typeof repo>, id: string, file: string, content: string, tool = "Edit") {
  r.c.tool("work", "s1", id, tool, { file_path: file }, r.sol);
  writeFileSync(file, content);
  await r.c.result(id, true);
}

test("an edit committed and then typed into: a later broken edit goes back to the commit and what was typed, not past them", async () => {
  const r = repo();
  await edit(r, "t1", r.A, "turn 1: good work\n");
  git(r.root, "commit", "-q", "-am", "turn 1 kept");
  writeFileSync(r.A, "turn 1: good work\nmarco's line, not committed\n");   // the file is not clean when the seat comes back
  await edit(r, "t2", r.A, "turn 2: broken <<<\n");
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "turn 1: good work\nmarco's line, not committed\n");
});

test("a file the seat made, once committed, is not removed by a later take-back", async () => {
  const r = repo();
  const N = join(r.sol, "mac", "src", "New.tsx");
  r.c.tool("work", "s1", "t1", "Write", { file_path: N }, r.sol);   // the copy says: did not exist
  writeFileSync(N, "new, and good\n");
  await r.c.result("t1", true);
  git(r.root, "add", "."); git(r.root, "commit", "-q", "-m", "the new file kept");
  writeFileSync(N, "new, and good\nmarco's line, not committed\n");
  await edit(r, "t2", N, "broken <<<\n");
  assert.deepEqual(await r.c.takeBack(["mac/src/New.tsx"]), ["mac/src/New.tsx"]);
  const there = existsSync(N), now = there ? readFileSync(N, "utf8") : "";
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(there, true, "the committed file is gone from the folder");
  assert.equal(now, "new, and good\nmarco's line, not committed\n");
});

test("a mutate commit drops the copies of the files it names: an edit through a shell after it goes back to the commit", async () => {
  const r = repo();
  await edit(r, "t1", r.A, "one\n");
  r.c.tool("work", "s1", "b1", "Bash", { command: '../mutate "one"' }, join(r.sol, "home"));
  git(r.root, "commit", "-q", "-am", "mutate: one");
  await r.c.result("b1", true, `mutate: ${git(r.root, "rev-parse", "--short", "HEAD")} one (mac/src/A.tsx)`);
  writeFileSync(r.A, "broken through sed <<<\n");   // no Edit tool call, so no new copy is taken
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "one\n");
});

test("a copy taken while a mutate's commit is still being read is newer than the commit, and stays", async () => {
  const r = repo();
  await edit(r, "t1", r.A, "one\n");
  r.c.tool("work", "s1", "b1", "Bash", { command: '../mutate "one"' }, join(r.sol, "home"));
  git(r.root, "commit", "-q", "-am", "mutate: one");
  writeFileSync(r.A, "one\nmarco's line, not committed\n");
  const read = r.c.result("b1", true, `mutate: ${git(r.root, "rev-parse", "--short", "HEAD")} one (mac/src/A.tsx)`);   // git is asked; not answered yet
  r.c.tool("work", "s1", "t2", "Edit", { file_path: r.A }, r.sol);   // the next edit starts first: its copy holds Marco's line
  await read;
  writeFileSync(r.A, "broken <<<\n");
  await r.c.result("t2", true);
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "one\nmarco's line, not committed\n");
});

// ---- what must stay as it is ----
// A file that is what HEAD holds again, with no commit since, keeps its first copy: the engine cannot tell whether
// Marco or the seat made it so, and a copy thrown away is Marco's uncommitted work lost for good (a line he dropped
// coming back can be dropped again)
test("the seat starts over through a shell (git checkout), then edits and breaks the file: Marco's uncommitted line survives", async () => {
  const r = repo();
  writeFileSync(r.A, "a0\nmarco's line, not committed\n");
  await edit(r, "t1", r.A, "a0\nmarco's line, not committed\nthe seat's first try\n");
  git(r.sol, "checkout", "--", "mac/src/A.tsx");   // the file is what HEAD holds, and no commit was made
  await edit(r, "t2", r.A, "broken <<<\n");
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "a0\nmarco's line, not committed\n");
});

test("the seat Writes the file whole with what HEAD holds, then edits and breaks it: Marco's uncommitted line survives", async () => {
  const r = repo();
  writeFileSync(r.A, "a0\nmarco's line, not committed\n");
  await edit(r, "t1", r.A, "a0\n", "Write");
  await edit(r, "t2", r.A, "broken <<<\n");
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "a0\nmarco's line, not committed\n");
});

test("a mutate that did not say its commit drops no copy (HEAD may be an older mutate that names the file)", async () => {
  const r = repo();
  writeFileSync(r.A, "one\n"); git(r.root, "commit", "-q", "-am", "mutate: one");   // an older change of Sol's
  writeFileSync(r.A, "one\nmarco's line, not committed\n");
  await edit(r, "t1", r.A, "one\nmarco's line, not committed\nthe seat's edit, broken <<<\n");
  r.c.tool("work", "s1", "b1", "Bash", { command: '../mutate "two" || true' }, join(r.sol, "home"));
  await r.c.result("b1", true, "");   // it committed nothing and still came back fine
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "one\nmarco's line, not committed\n");
});

test("a file with uncommitted work in it keeps its first copy through a second edit (Marco's own work survives both)", async () => {
  const r = repo();
  writeFileSync(r.A, "a0\nmarco's line, not committed\n");
  await edit(r, "t1", r.A, "a0\nmarco's line, not committed\nthe seat's first edit\n");
  git(r.root, "commit", "-q", "--allow-empty", "-m", "a commit that does not touch the file");
  await edit(r, "t2", r.A, "the seat's second edit, broken <<<\n");
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "a0\nmarco's line, not committed\n");
});

test("a folder git does not know: the first copy is kept, as before, and nothing throws", async () => {
  const r = repo(false);
  await edit(r, "t1", r.A, "first edit\n");
  await edit(r, "t2", r.A, "second edit, broken <<<\n");
  assert.deepEqual(await r.c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(r.A, "utf8");
  rmSync(r.root, { recursive: true, force: true });
  assert.equal(now, "a0\n");
});

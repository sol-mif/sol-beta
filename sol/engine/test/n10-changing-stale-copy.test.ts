// changing.ts takeBack: a broken edit is taken back to "the content it had before the seat's first edit". That copy is
// taken once and never dropped when a turn's edits compile and are kept, so a later turn's broken edit is taken back to
// the copy from an earlier, good, committed turn: the earlier turn's work goes with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Changing } from "../src/changing.ts";

const SOLSRC = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const git = (dir: string, ...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();

test("turn 2's broken edit is taken back to before turn 2, not to before turn 1 (turn 1's committed work kept)", async () => {
  const root = mkdtempSync(join(tmpdir(), "sol-stale-"));
  const sol = join(root, "sol");
  mkdirSync(join(sol, "mac", "src"), { recursive: true }); mkdirSync(join(sol, "home"), { recursive: true });
  copyFileSync(join(SOLSRC, "undo"), join(sol, "undo")); chmodSync(join(sol, "undo"), 0o755);
  const A = join(sol, "mac", "src", "A.tsx");
  writeFileSync(A, "a0\n"); writeFileSync(join(sol, "home", "CLAUDE.md"), "");
  git(root, "init", "-q"); git(root, "add", "."); git(root, "commit", "-q", "-m", "start");
  const c = new Changing(join(sol, "home"), () => {});

  // turn 1: the seat edits A, it compiles, and it is committed (Marco's commit, or the seat's)
  c.tool("work", "s1", "t1", "Edit", { file_path: A }, sol);
  writeFileSync(A, "turn 1: good work\n");
  await c.result("t1", true);
  git(root, "commit", "-q", "-am", "turn 1 kept");

  // turn 2, later: the seat edits A again and breaks it
  c.tool("work", "s1", "t2", "Edit", { file_path: A }, sol);
  writeFileSync(A, "turn 2: broken <<<\n");
  await c.result("t2", true);
  assert.deepEqual(await c.takeBack(["mac/src/A.tsx"]), ["mac/src/A.tsx"]);
  const now = readFileSync(A, "utf8");
  rmSync(root, { recursive: true, force: true });
  assert.equal(now, "turn 1: good work\n", "the take-back should land on the committed turn-1 content");
});

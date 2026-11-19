// The guard's three refusals of script paths (#1159): each now goes through, and what each rule protects is still refused.
// - eval-sealed: a push to the cloud box's bare repository (sol/cloud/deploy/push, `$sha`) is a deploy, not GitHub; a
//   push of a variable to GitHub, or of a commit carrying a mark no press wrote, is still refused.
// - eval-sealed: gh pr create --head <b> for a branch that is on GitHub only is judged as GitHub has it (origin/<b>).
// - branch-without-take: git branch x origin/x (a local copy of a branch GitHub has, under its own name) starts no work; a
//   new name, another start point, or main/stable is still refused.
// The real guard on real git checkouts in a temp folder; gh is a stub, no network.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const GUARD = resolve(import.meta.dirname, "../../harness/guard");
const DEPLOY_PUSH = resolve(import.meta.dirname, "../../cloud/deploy/push");
const SOL_DEV = "https://github.com/sol-mif/sol-dev.git";
const BASE = realpathSync(mkdtempSync(join(tmpdir(), "harness-scripts-")));
after(() => rmSync(BASE, { recursive: true, force: true }));
const STATE = join(BASE, "state");
mkdirSync(join(BASE, "bin"), { recursive: true }); mkdirSync(STATE, { recursive: true }); mkdirSync(join(BASE, "tmp"));
writeFileSync(join(BASE, "bin", "gh"), "#!/bin/sh\necho '[]'\n"); chmodSync(join(BASE, "bin", "gh"), 0o755);
const ENV: Record<string, string> = {
  PATH: `${join(BASE, "bin")}:${process.env.PATH}`, HOME: process.env.HOME ?? BASE, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_STATE: join(STATE, "work.json"), SOL_LOCKS_LOG: join(STATE, "locks.jsonl"), TMPDIR: join(BASE, "tmp"),
};
const put = (dir: string, path: string, body: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), body); };
const git = (dir: string, ...a: string[]) => execFileSync("git", a, { cwd: dir, env: { ...process.env, ...ENV }, encoding: "utf8" }).trim();
const APPROVED = "Status: Approved by marcocyl04-ux on 2026-11-14";
const EVAL_DRAFT = "# fr-02 evals\n\nStatus: Draft\n\n## Ways to use it\n- chat · check: e2e chat\n";

let n = 0;
/** a sol-dev checkout: main as GitHub has it, then my work branch marco/base-x-1 */
function checkout(): string {
  const dir = join(BASE, `c${++n}`);
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "remote", "add", "origin", SOL_DEV);
  git(dir, "config", "sol.login", "marcocyl04-ux");
  put(dir, "docs/people/marco.md", "login: marcocyl04-ux\n");
  put(dir, "docs/people/frank.md", "login: franktsai2008-eng\n");
  put(dir, "specs/features.json", JSON.stringify({ features: [{ id: "fr-02", slug: "chat", name: "Chat", paths: ["sol/mac/src/chat/**"] }] }));
  put(dir, "specs/features/fr-02-chat/prd.md", "# Chat\n");
  put(dir, "specs/features/fr-02-chat/eval.md", EVAL_DRAFT);
  mkdirSync(join(dir, "sol/cloud/deploy"), { recursive: true });
  copyFileSync(DEPLOY_PUSH, join(dir, "sol/cloud/deploy/push"));
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "the house");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dir, "checkout", "-q", "-b", "marco/base-x-1"); put(dir, "x.txt", "x\n"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "work");
  return dir;
}
/** a commit on top of HEAD that writes an Approved mark no press wrote; returns its sha, HEAD left where it was */
function markedCommit(dir: string): string {
  const head = git(dir, "rev-parse", "HEAD");
  put(dir, "specs/features/fr-02-chat/eval.md", EVAL_DRAFT.replace("Status: Draft", APPROVED));
  git(dir, "commit", "-qam", "a mark");
  const sha = git(dir, "rev-parse", "HEAD");
  git(dir, "reset", "-q", "--hard", head);
  return sha;
}
const RUN = `${process.pid}-${Date.now()}`;
function bash(dir: string, command: string): string {
  const r = spawnSync(process.execPath, [GUARD], { cwd: dir, env: ENV, encoding: "utf8",
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: dir, session_id: "s1", tool_use_id: `${RUN}-u${++n}` }) });
  assert.equal(r.status, 0, `the guard exits 0: ${r.stderr}`);
  return r.stdout.includes('"deny"') ? (/harness \(([a-z-]+)\)/.exec(r.stdout)?.[1] ?? "?") : "";
}

test("deploy/push: a push to the cloud box's bare repository goes; a variable or a mark pushed to GitHub is still sealed", () => {
  const d = checkout();
  assert.equal(bash(d, "bash sol/cloud/deploy/push"), "", "the script, default ref");
  assert.equal(bash(d, `bash sol/cloud/deploy/push ${git(d, "rev-parse", "HEAD")}`), "", "the script, a commit named");
  assert.equal(bash(d, 'git push -q --force "ssh://root@sol-cloud-1/srv/sol-dev.git" "$sha:refs/heads/deploy"'), "", "its push, by hand");
  // what the seal protects: GitHub
  assert.equal(bash(d, 'git push origin "$sha:refs/heads/marco/base-x-1"'), "eval-sealed", "a variable pushed to GitHub");
  put(d, "sol/cloud/deploy/other", '#!/usr/bin/env bash\nsha=$(git rev-parse HEAD)\ngit push origin "$sha:refs/heads/marco/base-x-1"\n');
  assert.equal(bash(d, "bash sol/cloud/deploy/other"), "eval-sealed", "a script's variable pushed to GitHub");
  const marked = markedCommit(d);
  assert.equal(bash(d, `git push origin ${marked}:refs/heads/marco/base-x-1`), "eval-sealed", "a mark no press wrote, to GitHub");
  assert.equal(bash(d, `git push "ssh://root@sol-cloud-1/srv/sol-dev.git/../other.git" ${marked}:refs/heads/x`), "eval-sealed", "a path that only starts like the box's");
  assert.equal(bash(d, `git push "ssh://git@github.com/srv/sol-dev.git" ${marked}:refs/heads/x`), "eval-sealed", "GitHub, even at the box's path");
  assert.equal(bash(d, `git push "github.com:/srv/sol-dev.git" ${marked}:refs/heads/x`), "eval-sealed", "GitHub, scp form");
});

test("gh pr create --head: a branch on GitHub only is judged as GitHub has it", () => {
  const d = checkout();
  git(d, "update-ref", "refs/remotes/origin/marco/base-y-2", "HEAD");
  const pr = (head: string) => bash(d, `gh pr create --draft --head ${head} --title t --body 'What to try: x'`);
  assert.equal(pr("marco/base-y-2"), "", "remote only, no mark");
  // what the seal protects: a mark no press wrote, on GitHub's copy, and a head nobody can see
  git(d, "update-ref", "refs/remotes/origin/marco/base-y-2", markedCommit(d));
  assert.equal(pr("marco/base-y-2"), "eval-sealed", "GitHub's copy carries a mark");
  assert.equal(pr("marco/base-nowhere-3"), "eval-sealed", "on neither side");
});

test("git branch x origin/x: a local copy of a branch GitHub has starts no work; a new branch still needs Take", () => {
  const d = checkout();
  for (const b of ["marco/base-y-2", "frank/cowork-z-4", "stable"]) git(d, "update-ref", `refs/remotes/origin/${b}`, "HEAD");
  assert.equal(bash(d, "git branch marco/base-y-2 origin/marco/base-y-2"), "");
  assert.equal(bash(d, "git branch --track marco/base-y-2 origin/marco/base-y-2"), "", "--track takes no word of its own");
  assert.equal(bash(d, "git branch -t marco/base-y-2 refs/remotes/origin/marco/base-y-2"), "");
  assert.equal(bash(d, "git branch frank/cowork-z-4 origin/frank/cowork-z-4"), "", "another's, to read it");
  assert.equal(bash(d, "git checkout -t origin/marco/base-y-2"), "", "checkout -t is the same copy");
  // what the rule protects: work starts from an issue
  assert.equal(bash(d, "git branch marco/new-idea"), "branch-without-take", "a new branch");
  assert.equal(bash(d, "git branch marco/new-idea origin/marco/base-y-2"), "branch-without-take", "another name");
  assert.equal(bash(d, "git branch marco/base-gone-5 origin/marco/base-gone-5"), "branch-without-take", "not on GitHub");
  assert.equal(bash(d, "git branch stable origin/stable"), "branch-without-take", "never stable");
  assert.equal(bash(d, "git checkout -t origin/stable"), "branch-without-take", "nor by -t");
  assert.equal(bash(d, "git branch -t marco/new-idea"), "branch-without-take", "-t does not hide the name");
});

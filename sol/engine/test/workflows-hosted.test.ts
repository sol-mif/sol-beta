// sol-dev is private, and GitHub's own machines are billed for a private repository: the account's minutes ran out
// (#677, #920), so a job there that asks for one is never started and shows red (#975: site and beta-guard, the last
// two). So every job that can run in sol-dev runs on our own machines (`runs-on` names self-hosted). A job whose `if:`
// keeps it to sol-beta, which is public and not billed (pages, release), may ask for GitHub's machines. Every workflow
// by its text, with no YAML package: the jobs by indentation, as GitHub's own files here are written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { devOnly, ROOT } from "./dev-copy.ts";

const indent = (l: string) => l.length - l.trimStart().length;
const live = (l: string) => l.trim() !== "" && !l.trim().startsWith("#");
const bare = (l: string) => l.replace(/\s+#.*$/, "").trim();

/** each job of a workflow's text: its name and its own lines */
function jobs(y: string): { name: string; lines: string[] }[] {
  const lines = y.split("\n");
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (at < 0) return [];
  const out: { name: string; lines: string[] }[] = [];
  for (const l of lines.slice(at + 1)) {
    if (live(l) && indent(l) === 0) break;
    const head = /^ {2}([\w-]+):\s*$/.exec(l);
    if (head) out.push({ name: head[1], lines: [] });
    else if (live(l)) out.at(-1)?.lines.push(l);
  }
  return out;
}

/** a job-level key's value: on its own line, or (runs-on as a block list) the lines under it */
function key(job: string[], k: string): string {
  const top = Math.min(...job.map(indent));
  const at = job.findIndex((l) => indent(l) === top && new RegExp(`^\\s*${k}:`).test(l));
  if (at < 0) return "";
  const parts = [bare(job[at]).slice(k.length + 1).trim()];
  for (const l of job.slice(at + 1)) { if (indent(l) <= top) break; parts.push(bare(l)); }
  return parts.join(" ").trim();
}

/** an `if:` that keeps the job to sol-beta: a test of the repository's name, alone or joined by && only */
const betaOnly = (cond: string) =>
  !/\|\||!=/.test(cond) && /github\.(event\.repository\.name\s*==\s*'sol-beta'|repository\s*==\s*'sol-mif\/sol-beta')/.test(cond);

/** the jobs of a workflow that can run in sol-dev and ask for one of GitHub's machines */
function onGithubMachines(y: string): string[] {
  return jobs(y).filter((j) => {
    const runsOn = key(j.lines, "runs-on");
    if (!runsOn) return false;   // a reusable workflow's caller (`uses:`) runs nothing itself
    return !/self-hosted/.test(runsOn) && !betaOnly(key(j.lines, "if"));
  }).map((j) => j.name);
}

const wf = (...job: string[]) => ["name: x", "on: push", "jobs:", "  one:", ...job.map((l) => `    ${l}`), "    steps:", "      - run: echo hi", ""].join("\n");

test("the check itself: GitHub's machines are caught unless the job is kept to sol-beta; our machines in any form pass", () => {
  assert.deepEqual(onGithubMachines(wf("runs-on: ubuntu-latest")), ["one"]);
  assert.deepEqual(onGithubMachines(wf("runs-on: macos-latest")), ["one"]);
  assert.deepEqual(onGithubMachines(wf("if: github.repository == 'sol-mif/sol-dev'", "runs-on: ubuntu-22.04")), ["one"], "sol-dev's own guard is no leave");
  assert.deepEqual(onGithubMachines(wf("if: github.event.repository.name == 'sol-beta' || github.event_name == 'workflow_dispatch'", "runs-on: ubuntu-latest")), ["one"], "an or lets it run in sol-dev");
  assert.deepEqual(onGithubMachines(wf("if: github.event.repository.name != 'sol-beta'", "runs-on: ubuntu-latest")), ["one"]);
  assert.deepEqual(onGithubMachines(wf("runs-on:", "  - ubuntu-latest")), ["one"], "a block list counts");
  assert.deepEqual(onGithubMachines(wf("if: github.event.repository.name == 'sol-beta'   # public, not billed", "runs-on: ubuntu-latest")), []);
  assert.deepEqual(onGithubMachines(wf("if: github.repository == 'sol-mif/sol-beta' && github.ref == 'refs/heads/main'", "runs-on: macos-latest")), []);
  assert.deepEqual(onGithubMachines(wf("runs-on: [self-hosted, sol, nucbox]")), []);
  assert.deepEqual(onGithubMachines(wf("runs-on:", "  - self-hosted", "  - sol")), []);
  assert.deepEqual(onGithubMachines(wf("runs-on: [self-hosted, sol, \"${{ matrix.machine }}\"]")), []);
  assert.deepEqual(onGithubMachines(wf("# runs-on: ubuntu-latest", "runs-on: [self-hosted, sol, Linux]")), [], "a comment is not a setting");
  assert.deepEqual(onGithubMachines(["jobs:", "  one:", "    uses: ./.github/workflows/x.yml", ""].join("\n")), []);
});

test("no job that can run in sol-dev asks for GitHub's machines, whose minutes are not ours to spend (#975)", { skip: devOnly(".github/workflows") }, () => {
  const dir = join(ROOT, ".github", "workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("ci.yml") && files.includes("pages.yml"), "the workflows are read");
  const bad = files.flatMap((f) => onGithubMachines(readFileSync(join(dir, f), "utf8")).map((j) => `${f}: job ${j}`));
  assert.deepEqual(bad, [], "GitHub does not start these for sol-dev (billing), so they go red: runs-on: [self-hosted, sol, ...], or an if: that keeps the job to sol-beta");
});

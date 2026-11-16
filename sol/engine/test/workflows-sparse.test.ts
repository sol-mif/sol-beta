// A job on our own machines shares its runner's working copy with every later job on that machine (#950). actions/checkout's
// sparse-checkout in non-cone mode writes core.sparseCheckout=true into that copy's .git/config, and the next plain
// actions/checkout does not undo it (its `git sparse-checkout disable` writes false to config.worktree, then unsets
// extensions.worktreeConfig, so the true wins again): the next job finds one file of the repository and goes red in ten
// seconds. So a self-hosted job's sparse checkout goes to a folder of its own (`path:`), never the shared copy; GitHub's
// machines start clean each job and are not judged. Every workflow by its text, with no YAML package: the jobs and their
// steps by indentation, as GitHub's own files here are written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { devOnly, ROOT } from "./dev-copy.ts";

const indent = (l: string) => l.length - l.trimStart().length;
const live = (l: string) => l.trim() !== "" && !l.trim().startsWith("#");

/** each job of a workflow's text: its name and its lines */
function jobs(y: string): { name: string; lines: string[] }[] {
  const lines = y.split("\n");
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (at < 0) return [];
  const out: { name: string; lines: string[] }[] = [];
  for (const l of lines.slice(at + 1)) {
    if (live(l) && indent(l) === 0) break;
    const head = /^ {2}([\w-]+):\s*$/.exec(l);
    if (head) out.push({ name: head[1], lines: [] });
    else out.at(-1)?.lines.push(l);
  }
  return out;
}

/** each step of a job that uses actions/checkout: its lines, from its `- ` to the next step */
function checkouts(job: string[]): string[][] {
  const body = job.filter(live);
  const at = body.findIndex((l) => /^\s*steps:\s*$/.test(l));
  if (at < 0) return [];
  const dash = indent(body[at + 1] ?? "");
  const out: string[][] = [];
  for (const l of body.slice(at + 1)) {
    if (indent(l) < dash) break;
    if (indent(l) === dash && /^\s*- /.test(l)) out.push([l]);
    else out.at(-1)?.push(l);
  }
  return out.filter((s) => s.some((l) => /\buses:\s*actions\/checkout@/.test(l)));
}

/** the jobs of a workflow that run on our own machines and check out sparse into the shared working copy */
function sparseInShared(y: string): string[] {
  const bad: string[] = [];
  for (const j of jobs(y)) {
    const runsOn = j.lines.find((l) => /^\s*runs-on:/.test(l)) ?? "";
    if (!/self-hosted/.test(runsOn)) continue;
    for (const s of checkouts(j.lines)) {
      const sparse = s.some((l) => /^\s*sparse-checkout:/.test(l));
      const path = s.some((l) => /^\s*path:\s*\S/.test(l));
      if (sparse && !path) bad.push(j.name);
    }
  }
  return bad;
}

const job = (runsOn: string, withLines: string[]) => [
  "jobs:", "  one:", `    runs-on: ${runsOn}`, "    steps:", "      - uses: actions/checkout@v4",
  ...(withLines.length ? ["        with:", ...withLines.map((l) => `          ${l}`)] : []),
  "      - run: echo hi", "",
].join("\n");

test("the check itself: a sparse checkout on our machines without a path is caught; with a path, plain, or on GitHub's machines it is not", () => {
  assert.deepEqual(sparseInShared(job("[self-hosted, sol, Linux]", ["sparse-checkout: a.ts", "sparse-checkout-cone-mode: false"])), ["one"]);
  assert.deepEqual(sparseInShared(job("[self-hosted, sol, Linux]", ["sparse-checkout: |", "  a.ts", "  b.ts"])), ["one"], "a list counts");
  assert.deepEqual(sparseInShared(job("[self-hosted, sol, Linux]", ["path: plan", "sparse-checkout: a.ts"])), []);
  assert.deepEqual(sparseInShared(job("[self-hosted, sol, Linux]", ["fetch-depth: 0"])), []);
  assert.deepEqual(sparseInShared(job("[self-hosted, sol, Linux]", [])), []);
  assert.deepEqual(sparseInShared(job("ubuntu-latest", ["sparse-checkout: a.ts"])), [], "GitHub's machines start clean");
  assert.deepEqual(sparseInShared(job("[self-hosted, sol, Linux]", ["# sparse-checkout: a.ts"])), [], "a comment is not a setting");
});

test("no workflow on our own machines checks out sparse into the runner's shared working copy (#950)", { skip: devOnly(".github/workflows") }, () => {
  const dir = join(ROOT, ".github", "workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.includes("runners.yml"), "the workflows are read");
  const bad = files.flatMap((f) => sparseInShared(readFileSync(join(dir, f), "utf8")).map((j) => `${f}: job ${j}`));
  assert.deepEqual(bad, [], "a sparse checkout here leaves core.sparseCheckout=true for the next job on that machine: give it its own path:, or read the file without a checkout");
});

// Team files never reach sol-beta (#482, CONTRACTS "Team files never reach sol-beta"): the dev cycle's files (the PRD
// in docs/how-we-work, the feature folders and templates in specs/, the agents and skills in .claude/) sit outside
// BETA_KEEP, and the export leaves them home. #479 adds the leak check on every PR and before each export; this holds
// the list itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});
const { exportTree, BETA_KEEP } = await import("../src/team/ship.ts");
const { NEUTRAL_HOME } = await import("../src/team/leak.ts");   // the home a Sol tester gets (#479)
const { devOnly, harnessFiles } = await import("./dev-copy.ts");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const REPO = join(import.meta.dirname, "..", "..", "..");

const TEAM = [
  "docs/how-we-work/dev-cycle.md",
  "specs/features/README.md",
  "specs/templates/prd.md", "specs/templates/eval.md", "specs/templates/mockup.html", "specs/templates/REVIEW.md",
  ".claude/agents/sol-builder.md", ".claude/agents/sol-verifier.md", ".claude/agents/sol-reviewer.md", ".claude/agents/sol-first-timer.md",
  ...["write-evals", "review-loop", "risk-rating", "fix-a-bug", "first-timer", "fix-at-source"].map((s) => `.claude/skills/${s}/SKILL.md`),
];
// the same rule as ship.ts's kept(): a path is exported when a BETA_KEEP entry is it or a folder above it
const kept = (path: string) => BETA_KEEP.some((k) => path === k || path.startsWith(k + "/"));

// a Sol tester's copy has none of them (that is the point): the first test reads them, so it is the dev's (#300)
test("every team file of the dev cycle is in this checkout and outside the beta list", { skip: devOnly(...TEAM) }, () => {
  for (const f of TEAM) assert.ok(existsSync(join(REPO, f)), `${f} is here`);
  for (const f of TEAM) assert.equal(kept(f), false, `${f} stays home`);
  // the folders whole, so a new skill, agent, template or feature folder is held too
  for (const top of ["specs", "specs/features/fr-12-open-sol/sketch/x.html", ".claude/agents/x.md", ".claude/skills/x/SKILL.md", "docs/how-we-work/x.md"]) {
    assert.equal(kept(top), false, `${top} stays home`);
  }
  assert.ok(!BETA_KEEP.some((k) => k === "specs" || k.startsWith("specs/") || k === "docs" || k.startsWith("docs/") || k.startsWith(".claude/agents") || k.startsWith(".claude/skills")),
    "BETA_KEEP names nothing under specs/, docs/, .claude/agents or .claude/skills");
});

test("the export of a release that holds the team files leaves every one of them out", async () => {
  const repo = mkdtempSync(join(tmpdir(), "sol-team-files-"));
  git(repo, "init", "-q", "-b", "main");
  // the guard, its sol-dev check and its wiring as they are: the leak check (#479) reads and runs them
  const harness = harnessFiles();
  const real: Record<string, string> = { ...harness, ".claude/settings.json": readFileSync(join(REPO, ".claude/settings.json"), "utf8") };
  for (const f of ["sol/engine/src/index.ts", ...Object.keys(real), ...TEAM, "specs/features/fr-12-open-sol/prd.md", "specs/features/fr-12-open-sol/sketch/try.html"]) {
    mkdirSync(join(repo, dirname(f)), { recursive: true });
    writeFileSync(join(repo, f), real[f] ?? `${f}\n`);
  }
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "the house");
  const { commit } = await exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261031");
  const files = git(repo, "ls-tree", "-r", "--name-only", commit).split("\n");
  assert.deepEqual(files.sort(), [".claude/settings.json", "README.md", "sol/engine/src/index.ts", ...Object.keys(harness), ...Object.keys(NEUTRAL_HOME)].sort());
});

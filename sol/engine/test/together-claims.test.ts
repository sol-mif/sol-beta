// Claims (#98, docs/how-we-work/PRD.md section 7): which labels a branch's paths belong to, what each open PR or
// branch holds, and which of them touch where mine does. Pure; the CODEOWNERS text is the repo's own shape.
import { test } from "node:test";
import assert from "node:assert/strict";

const { owners, areasOf, claimsOf, overlap, issueOf, pathsOfLabel, meet } = await import("../src/team/claims.ts");

const CODEOWNERS = `# Labels and leads, one file.
# label base: the engine.
/sol/engine/                 @marco
/sol/PROTOCOL.md             @marco
/sol/keep /sol/back /sol/setup.d/  @marco

# label life: the face.
/sol/mac/src/                @marco

# label work: Work mode.
/sol/mac/src/work/           @frank
/sol/engine/src/work/        @frank

# label cowork: the team.
/sol/mac/src/cowork/         @isaac
/sol/engine/src/team/        @isaac

# label social: no code yet.
# leads: @marco

# label product: not code.
/docs/                       @marco
/CONTRIBUTING.md /GLOSSARY.md  @marco
`;

test("CODEOWNERS reads into patterns per label; owners and comments are not patterns", () => {
  const o = owners(CODEOWNERS);
  assert.deepEqual(o.filter((x) => x.label === "base").map((x) => x.pattern), ["sol/engine/", "sol/PROTOCOL.md", "sol/keep", "sol/back", "sol/setup.d/"]);
  assert.ok(!o.some((x) => x.pattern.startsWith("@") || x.pattern.startsWith("#")));
  assert.ok(!o.some((x) => x.label === "social"));
  assert.deepEqual(pathsOfLabel("work", CODEOWNERS), ["sol/mac/src/work/", "sol/engine/src/work/"]);
});

test("areas: the longest match wins, as in CODEOWNERS", () => {
  assert.deepEqual(areasOf(["sol/mac/src/work/Pane.tsx"], CODEOWNERS), ["work"]);
  assert.deepEqual(areasOf(["sol/mac/src/App.tsx"], CODEOWNERS), ["life"]);
  assert.deepEqual(areasOf(["sol/engine/src/team/board.ts"], CODEOWNERS), ["cowork"]);
  assert.deepEqual(areasOf(["sol/engine/src/index.ts", "/sol/keep"], CODEOWNERS), ["base"]);
  assert.deepEqual(areasOf(["sol/keeper.ts"], CODEOWNERS), [], "sol/keep is a file or folder, not a prefix of a name");
  // in the six labels' order, each once
  assert.deepEqual(areasOf(["docs/x.md", "sol/engine/src/work/runs.ts", "sol/engine/src/a.ts", "sol/engine/src/b.ts"], CODEOWNERS), ["work", "base", "product"]);
  assert.deepEqual(areasOf(["README.md"], CODEOWNERS), [], "a path no section names has no area");
});

test("the issue a claim names: #N in the PR, else Take's -N at the end, else N- first", () => {
  assert.equal(issueOf({ branch: "frank/x", title: "Timer", body: "Part of #91" }), 91);
  assert.equal(issueOf({ branch: "marco/product-two-agents-never-98" }), 98);
  assert.equal(issueOf({ branch: "marco/31-see" }), 31);
  assert.equal(issueOf({ branch: "marco/notes" }), undefined);
});

test("claims: open PRs and the branches without one; shared branches are nobody's", () => {
  const prs = [{ number: 41, branch: "frank/work-timer-91", author: "frank", paths: ["sol/engine/src/work/runs.ts"] }];
  const branches = [
    { branch: "frank/work-timer-91", paths: [] },          // the PR's own branch: counted once
    { branch: "isaac/cowork-board-cards-77", paths: ["sol/mac/src/cowork/Dashboard.tsx"] },
    { branch: "main", paths: ["x"] }, { branch: "stable", paths: [] }, { branch: "marco/plan", paths: ["plan.md"] }, { branch: "isaac/mine", paths: [] },
  ];
  assert.deepEqual(claimsOf(prs, branches, CODEOWNERS), [
    { branch: "frank/work-timer-91", issue: 91, pr: 41, login: "frank", paths: ["sol/engine/src/work/runs.ts"], areas: ["work"] },
    { branch: "isaac/cowork-board-cards-77", issue: 77, login: "isaac", paths: ["sol/mac/src/cowork/Dashboard.tsx"], areas: ["cowork"] },
  ]);
  // a bot's PR is its person's
  assert.equal(claimsOf([{ number: 2, branch: "x", author: "app[bot]", paths: [] }], [], CODEOWNERS)[0].login, "app");
});

test("meet: same file, same folder, or a folder pattern holding it; the repo's top is not a shared folder", () => {
  assert.ok(meet("sol/engine/src/team/board.ts", "sol/engine/src/team/board.ts"));
  assert.ok(meet("sol/engine/src/team/board.ts", "sol/engine/src/team/note.ts"));
  assert.ok(meet("sol/engine/", "sol/engine/src/index.ts"));
  assert.ok(meet("sol/engine/src/index.ts", "sol/engine/"));
  assert.ok(!meet("sol/engine/src/team/board.ts", "sol/engine/src/work/runs.ts"));
  assert.ok(!meet("README.md", "CONTRIBUTING.md"), "two files at the top do not overlap");
});

test("overlap: the claims that touch where mine does, with their shared paths named", () => {
  const others = claimsOf([
    { number: 41, branch: "frank/work-timer-91", author: "frank", paths: ["sol/engine/src/work/runs.ts", "docs/timer.md"] },
    { number: 42, branch: "isaac/cowork-see-31", author: "isaac", paths: ["sol/mac/src/cowork/Dashboard.tsx"] },
  ], [], CODEOWNERS);
  const mine = ["sol/engine/src/work/tools.ts", "CONTRIBUTING.md"];
  const o = overlap(mine, others);
  assert.equal(o.length, 1);
  assert.equal(o[0].pr, 41);
  assert.deepEqual(o[0].shared, ["sol/engine/src/work/runs.ts"]);
  assert.deepEqual(overlap(["now.md"], others), [], "nothing nearby");
  // a branch with no commits yet stands for its label's paths
  const fresh = overlap(pathsOfLabel("cowork", CODEOWNERS), others);
  assert.deepEqual(fresh.map((x) => x.pr), [42]);
});

// The harness, run as Claude Code runs it: a call on stdin, in a throwaway repo, with a fake gh on PATH. Since #1126 base
// takes more than one open branch, and a PR is merged by its author or their agent once GitHub's checks pass: gh pr merge
// goes through into main or a branch of mine, and stays refused around the checks, into stable or another person's branch,
// or when GitHub cannot say where the PR goes.
test("the harness (#1126): base takes two people's branches; gh pr merge goes into main or mine, never around the checks", async () => {
  const { mkdtempSync, writeFileSync, chmodSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { join, resolve } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const guard = resolve(import.meta.dirname, "../../harness/guard");
  const run = (o: { prs?: unknown[]; base?: string | null; repo?: string; cmd: string; branch?: string }) => {
    const dir = mkdtempSync(join(tmpdir(), "claims-guard-"));
    const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
    g("init", "-q", "-b", o.branch ?? "marco/base-wire-17"); g("config", "sol.login", "marcocyl04-ux"); g("remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git");   // a sol-dev checkout (#479)
    execFileSync("mkdir", ["-p", join(dir, "docs/people")]);
    writeFileSync(join(dir, "docs/people/marco.md"), "login: marcocyl04-ux\n"); writeFileSync(join(dir, "docs/people/frank.md"), "login: franktsai2008-eng\n");
    const bin = join(dir, ".bin"); execFileSync("mkdir", [bin]);
    const view = o.base === null ? "exit 1" : `echo '${o.base ?? "main"} https://github.com/${o.repo ?? "sol-mif/sol-dev"}/pull/3'`;
    writeFileSync(join(bin, "gh"), `#!/bin/sh
if [ "$1 $2" = "pr view" ]; then ${view}; exit 0; fi
cat <<'J'\n${JSON.stringify(o.prs ?? [])}\nJ\n`.replace(/\\n/g, "\n")); chmodSync(join(bin, "gh"), 0o755);
    return execFileSync("node", [guard], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: o.cmd }, cwd: dir }) });
  };
  const frank = { number: 12, headRefName: "frank/base-relay-12", author: { login: "frank" } };
  assert.equal(run({ prs: [frank], cmd: "git push -u origin HEAD" }), "", "a push from base beside another person's open base branch");
  assert.equal(run({ prs: [frank], cmd: "gh pr create --draft --body 'what to try'" }), "", "and its PR");
  assert.equal(run({ base: "main", cmd: "gh pr merge 3 --merge" }), "", "a PR into main, GitHub's checks the gate");
  assert.equal(run({ base: "main", cmd: "gh pr merge --auto --merge --subject 'x y'" }), "", "the current branch's PR, merged once green");
  assert.equal(run({ base: "marco/base-wire-17", cmd: "gh pr merge 4" }), "", "a PR into a branch of mine");
  assert.match(run({ base: "main", cmd: "gh pr merge 3 --admin" }), /harness \(merge\)/, "never around the checks");
  assert.match(run({ base: "stable", cmd: "gh pr merge 3" }), /harness \(merge\).*goes into stable/, "never into stable");
  assert.match(run({ base: "frank/base-relay-12", cmd: "gh pr merge 3" }), /harness \(merge\).*goes into frank\/base-relay-12/, "never into another person's branch");
  assert.match(run({ base: null, cmd: "gh pr merge 3" }), /harness \(merge\).*did not say/, "GitHub not answering: refused");
  assert.match(run({ cmd: "gh api -X PUT repos/o/r/pulls/3/merge" }), /harness \(merge\)/, "the API's merge stays refused");
  for (const c of ["gh pr merge 3 --admin=true", "gh pr merge 3 --admin=false", "gh pr merge 3 --merge --admin"])
    assert.match(run({ base: "main", cmd: c }), /harness \(merge\)/, `${c}: --admin in any spelling`);
  for (const c of ["gh pr merge 3 -md", "gh pr merge 3 --unknown-flag", "gh pr merge 3 -x"])
    assert.match(run({ base: "main", cmd: c }), /harness \(merge\).*could not read/, `${c}: what it cannot read is refused`);
  assert.match(run({ base: "main", cmd: "gh pr edit 3 --base stable && gh pr merge 3 --merge" }), /harness \(merge\).*alone on its own line/, "an edit of the base on the same line");
  assert.match(run({ base: "main", cmd: "GH_REPO=sol-mif/sol-beta gh pr merge 3" }), /harness \(merge\).*alone on its own line/, "another repo by the environment");
  for (const c of ["cd /tmp && gh pr merge 3", "export GH_REPO=sol-mif/sol-beta; gh pr merge 3", "env GH_HOST=x gh pr merge 3", "bash -c 'gh pr merge 3'", "gh repo set-default sol-mif/sol-beta && gh pr merge 3"])
    assert.match(run({ base: "main", cmd: c }), /harness \(merge\)/, `${c}: never beside another command`);
  assert.match(run({ base: "main", repo: "sol-mif/sol-beta", cmd: "gh pr merge 3 -R sol-mif/sol-beta" }), /harness \(merge\).*sol-mif\/sol-beta, not this checkout's sol-mif\/sol-dev/, "never another repository, the beta one least");
  assert.match(run({ base: "main", repo: "sol-mif/sol-beta", cmd: "gh pr merge https://github.com/sol-mif/sol-beta/pull/3" }), /harness \(merge\).*sol-mif\/sol-beta/, "nor by its URL");
  for (const c of ["gh -Rsol-mif/sol-dev pr merge 9 --admin", "gh -R=sol-mif/sol-dev pr merge 9 --admin", "gh --repo sol-mif/sol-dev pr merge 9 --admin"])
    assert.match(run({ base: "main", cmd: c }), /harness \(merge\)/, `${c}: gh's own -R before pr, in any spelling`);
  for (const c of ["echo 9 | xargs gh pr merge", "gh pr checkout 9 && gh pr merge --merge", "git checkout frank/x && gh pr merge"])
    assert.match(run({ base: "main", cmd: c }), /harness \(merge\)/, `${c}: the PR it would merge is not the one asked about`);
  for (const c of ["gh pr merge 3 -R sol-mif/sol-dev -R sol-mif/sol-beta", "gh pr merge 3 --repo=a/b -Rsol-mif/sol-dev", "gh pr merge 3 -t a --subject b"])
    assert.match(run({ base: "main", cmd: c }), /harness \(merge\).*could not read/, `${c}: a valued option twice`);
  for (const c of ["gh pr merge 3 -Rsol-mif/sol-dev --merge", "gh pr merge --repo=sol-mif/sol-dev 3 -m -d", "gh pr merge https://github.com/sol-mif/sol-dev/pull/3 --squash --subject=x"])
    assert.equal(run({ base: "main", cmd: c }), "", `${c}: attached and = forms read as gh reads them`);
});

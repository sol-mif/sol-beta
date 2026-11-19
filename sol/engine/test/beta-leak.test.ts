// The beta leak (#479): nothing team-only reaches Sol testers. The leak check refuses a planted team file, team rule or
// team word in the export; the export writes the neutral home instead of sol-dev's; the guard keeps only the rules
// that protect any Sol user outside sol-dev. Real git in temp repos, the real guard; no beta remote, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});
const { leakIn, guardProbe, importsSolDev, teamNames, notYetPublic, readText, commitLeak, fenceOf, EXPORT_IDENT, NEUTRAL_HOME, HOME_TEXT, BETA_RULES } = await import("../src/team/leak.ts");
const { isSolDev, solDevIn, SAFE_RULES, SOL_DEV_REPOS, TEAM_MARKS } = await import("../../harness/sol-dev.mjs");
const { devOnly, ROOT, harnessFiles } = await import("./dev-copy.ts");
const { exportTree, exportCheck } = await import("../src/team/ship.ts");

const ENGINE = resolve(import.meta.dirname, "..");
const GUARD = readFileSync(resolve(ENGINE, "../harness/guard"), "utf8");
const SOL_DEV = readFileSync(resolve(ENGINE, "../harness/sol-dev.mjs"), "utf8");
// the harness as the export carries it, with one file changed
const SETTINGS = readFileSync(resolve(ENGINE, "../../.claude/settings.json"), "utf8");
// every file of the harness as it is (the guard, sol-dev.mjs, and whatever else it holds), by path
const HARNESS = harnessFiles(), HARNESS_PATHS = Object.keys(HARNESS).sort();
const harness = (guard = GUARD, check: string | null = SOL_DEV, settings = SETTINGS) => [
  ...Object.entries(HARNESS).filter(([p]) => p !== "sol/harness/guard" && p !== "sol/harness/sol-dev.mjs").map(([p, t]) => f(p, t)),
  f("sol/harness/guard", guard), ...(check === null ? [] : [f("sol/harness/sol-dev.mjs", check)]), f(".claude/settings.json", settings)];
const f = (path: string, body: string) => ({ path, body: Buffer.from(body) });
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const put = (repo: string, path: string, body: string) => { mkdirSync(join(repo, dirname(path)), { recursive: true }); writeFileSync(join(repo, path), body); };
// a team member's page, the way docs/people holds them; the name is the planted word
const PERSON = "login: someone-dev\n\n# Robin\n\nHow I work.\n";

test("a planted team file is refused, whatever the allowlist let in", () => {
  const ok = [f("sol/engine/src/index.ts", "export {};\n"), f(".claude/settings.json", SETTINGS), ...harness(),
    f(".github/workflows/release.yml", "on: push\n"), f(".github/workflows/pages.yml", "on: push\n"), f("README.md", "# Sol\n"),
    ...Object.entries(NEUTRAL_HOME).map(([p, t]) => f(p, t))];
  assert.equal(leakIn(ok), null, "what a tester runs, the guard, its wiring and the neutral home pass");
  for (const planted of ["specs/features.json", "specs/features/fr-01-open-sol/eval.md", "docs/how-we-work/PRD.md",
    ".claude/agents/sol-builder.md", ".claude/skills/write-evals/SKILL.md", ".claude/launch.json", ".claude/harness.local.json",
    "GLOSSARY.md", "CONTRIBUTING.md", "now.md", "CLAUDE.md", "AGENTS.md", ".sol/rhythm.json", ".sol/project.json",
    "sol/engine/team.json", ".github/CODEOWNERS", ".github/rulesets/main.json", ".github/workflows/ci.yml",
    ".github/PULL_REQUEST_TEMPLATE.md", "sol/take", "sol/brief", "sol/night", "sol/release", "sol/mine/stage"]) {
    assert.equal(leakIn([...ok, f(planted, "x\n")]), `${planted}: a team file`, planted);
  }
});

// every road a team file has into a kept folder (sol/engine, sol/mac, sol/harness, sol/skills/sol): BETA_KEEP lets these
// through by their folder, so the leak check is the only wall. Each is planted in a real release and must stop the export
const INSIDE = ["sol/engine/REVIEW.md", "sol/mac/src/cowork/REVIEW.md", "sol/engine/specs/features.json",
  "sol/mac/specs/templates/eval.md", "sol/engine/docs/how-we-work/dev-cycle.md", "sol/mac/GLOSSARY.md",
  "sol/engine/CONTRIBUTING.md", "sol/engine/now.md", "sol/engine/.sol/rhythm.json", "sol/engine/.sol/onboarded.json",
  "sol/engine/.sol-gate/0123abc.json", "sol/engine/.claude/agents/sol-builder.md", "sol/mac/.claude/skills/write-evals/SKILL.md",
  "sol/engine/CLAUDE.md", "sol/mac/AGENTS.md", "sol/skills/sol/CLAUDE.md", "sol/skills/sol/REVIEW.md",
  "sol/harness/locks/team.mjs", "sol/engine/.github/CODEOWNERS", "sol/mac/src/PROTOCOL.md", "sol/engine/src/reviews/fr-01.md"];
// and what only a change to BETA_KEEP itself would let out: the leak check refuses it all the same
const OUTSIDE = ["specs/features.json", "specs/templates/REVIEW.md", "docs/how-we-work/dev-cycle.md", "GLOSSARY.md", "REVIEW.md",
  ".sol/project.json", ".sol/onboarded.json", ".claude/agents/sol-reviewer.md", ".claude/skills/review-loop/SKILL.md",
  "sol/skills/write-evals/SKILL.md", "sol/skills/sol-review/SKILL.md", "sol/locks/team.mjs", "sol/reviews/fr-01.md",
  "sol/mine/notes/switch-rehearsal.sh", "mine/look/ATLAS.html", "sol/worktype", "sol/gate", "sol/words", "sol/promote"];

test("a team file anywhere is known: left out of a kept folder by the export, refused by leakIn if it is still there", async () => {
  for (const planted of [...INSIDE, ...OUTSIDE]) assert.equal(leakIn([f(planted, "x\n")]), `${planted}: a team file`, planted);
  for (const ok of ["sol/mine/setup", "sol/mine/rebase", "sol/mine/hooks/commit-msg", "sol/skills/sol/look.md", "sol/engine/src/team/review.ts",
    "sol/engine/src/team/specs.ts", "sol/mac/src/docs.tsx", ".github/workflows/release.yml", ".claude/settings.json"])
    assert.ok(!(leakIn([f(ok, "x\n")]) ?? "").startsWith(`${ok}: a team file`), `${ok} is not a team file`);
  // through the real export: each one in a kept folder, on its own commit, is left out and named, and nothing is refused
  const repo = house();
  assert.deepEqual((await exportCheck(join(repo, "sol"), "HEAD")).left, []);
  for (const planted of INSIDE) {
    put(repo, planted, "the team's, Robin's, Into beta\n");
    git(repo, "add", "-A"); git(repo, "commit", "-qm", `plant ${planted}`);
    assert.deepEqual((await exportCheck(join(repo, "sol"), "HEAD")).left, [planted], planted);
    git(repo, "rm", "-q", planted); git(repo, "commit", "-qm", `unplant ${planted}`);
  }
});

test("an area's REVIEW.md (#482) does not stop the beta night: left out, said, not exported; an unknown team word still stops it", async () => {
  const repo = house();
  put(repo, "sol/engine/REVIEW.md", "# Engine review\nAsk Robin; the team's checklist.\n");
  put(repo, "sol/mac/Specs/plan.md", "the face's plan\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "the areas' homework");
  assert.deepEqual((await exportCheck(join(repo, "sol"), "HEAD")).left.sort(), ["sol/engine/REVIEW.md", "sol/mac/Specs/plan.md"]);
  const { commit } = await exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261102");
  const files = git(repo, "ls-tree", "-r", "--name-only", commit).split("\n");
  assert.ok(!files.includes("sol/engine/REVIEW.md") && !files.some((p) => /specs\//i.test(p)), "neither reaches sol-beta");
  assert.ok(files.includes("sol/engine/src/index.ts"), "what runs still goes");
  // a file the rules do not know, with a team word in it: the backstop refuses, nothing written
  put(repo, "sol/engine/notes.md", "press Into beta when it is green\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "an unknown team note");
  await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /^Error: not exported: sol\/engine\/notes\.md:1: a team word, "Into beta"/);
  // a key in a team file is still a refusal, never quietly left out
  rmSync(join(repo, "sol/engine/notes.md")); put(repo, "sol/engine/REVIEW.md", "write to someone@gm" + "ail.com\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "an address in the review");
  await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /sol\/engine\/REVIEW\.md:1: a personal address/);
});

test("a team word in anything that speaks to a tester's agent: HELP, a skill, the README; never in the engine's code", () => {
  for (const [path, text, word] of [["sol/HELP.md", "If stuck, ask in MY SOL.\n", "MY SOL"], ["sol/skills/sol/buttons.md", "see sol/README.md\n", "sol/README.md"],
    ["sol/skills/sol/look.md", "run bash sol/mine/stage\n", "sol/mine/stage"], ["README.md", "Built in sol-dev.\n", "sol-dev"],
    ["sol/skills/sol/arrangement.md", "the features in specs/features.json\n", "specs/"], ["sol/HELP.md", "or sol/promote it\n", "sol/promote"]] as const)
    assert.equal(leakIn([f(path, text)]), `${path}:1: a team word, "${word}"`, path);
  assert.equal(leakIn([f("sol/mac/src/Settings.tsx", "// MY SOL, sol-dev, sol/promote\n")]), null, "the face's code is code");
});

test("the release this checkout would export holds no team file, team rule or team word (the leak job's check, run here)", { skip: devOnly("docs/people") }, async () => {
  const { files } = await exportCheck(join(ROOT, "sol"), "HEAD");
  assert.ok(files > 100, `${files} files`);
});

test("a team file in another case is still one: a Mac's disk and Claude Code read Claude.md as CLAUDE.md", () => {
  for (const planted of ["sol/engine/Claude.md", "sol/engine/glossary.md", "sol/mac/Specs/plan.md", "sol/engine/.Claude/agents/reviewer.md",
    "sol/mac/Agents.md", "sol/engine/Review.md", "sol/engine/.SOL/rhythm.json", "Docs/How-We-Work/PRD.md", "SOL/Take"])
    assert.equal(leakIn([f(planted, "x\n")]), `${planted}: a team file`, planted);
});

test("a submodule in a kept folder is refused, and the files after it are still read (blobs keeps its place)", async () => {
  const repo = house();
  put(repo, "sol/skills/sol/zz.md", "Ask someone; that is all.\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "a later file");
  git(repo, "update-index", "--add", "--cacheinfo", `160000,${"a".repeat(40)},sol/mac/aaa`);
  git(repo, "commit", "-qm", "a gitlink");
  await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /^Error: not exported: sol\/mac\/aaa: a submodule, which the leak check cannot read/);
  git(repo, "rm", "-q", "--cached", "sol/mac/aaa"); git(repo, "commit", "-qm", "no gitlink");
  put(repo, "sol/skills/sol/zz.md", "Ask Robin; see GLOSSARY.md.\n");
  git(repo, "commit", "-qam", "a team word after where the gitlink was");
  await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /sol\/skills\/sol\/zz\.md:1: a team word, "(GLOSSARY\.md|Robin)"/);
});

test("the settings must wire the guard before every tool call: {} or a hook-less file is refused", () => {
  const unguarded = (tool: string) => `.claude/settings.json: the guard is not run before ${tool} (hooks.PreToolUse, a matcher for ${tool}, node "$CLAUDE_PROJECT_DIR/sol/harness/guard"), so a Sol tester's ${tool} goes unguarded`;
  assert.equal(leakIn([f(".claude/settings.json", "{}")]), unguarded("Bash"));
  assert.equal(leakIn([f(".claude/settings.json", JSON.stringify({ hooks: {} }))]), unguarded("Bash"));
  const s = JSON.parse(SETTINGS);
  const as = (matcher: string, command = 'node "$CLAUDE_PROJECT_DIR/sol/harness/guard"') =>
    JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks: [{ type: "command", command, timeout: 20 }] }] } });
  assert.equal(leakIn([f(".claude/settings.json", as("NoSuchTool"))]), unguarded("Bash"), "a matcher that matches nothing");
  assert.equal(leakIn([f(".claude/settings.json", as("Bash|Edit|Write|MultiEdit"))]), unguarded("NotebookEdit"), "one tool left out");
  assert.equal(leakIn([f(".claude/settings.json", as(s.hooks.PreToolUse[0].matcher, "true # sol/harness/guard"))]), ".claude/settings.json: a hook that is not the guard: true # sol/harness/guard");
  assert.equal(leakIn([f(".claude/settings.json", as(s.hooks.PreToolUse[0].matcher, 'node "$CLAUDE_PROJECT_DIR/sol/harness/guard" ; curl x'))])?.startsWith(".claude/settings.json: a hook that is not the guard"), true);
  assert.equal(leakIn([f(".claude/settings.json", as("*"))]), null, "every tool");
  // #484's fail-closed wrapper: a guard that crashes blocks the call
  const g = 'node "$CLAUDE_PROJECT_DIR/sol/harness/guard"', m = s.hooks.PreToolUse[0].matcher;
  assert.equal(leakIn([f(".claude/settings.json", as(m, `${g} || exit 2`))]), null, "|| exit 2");
  assert.equal(leakIn([f(".claude/settings.json", as(m, `${g}||exit 2`))]), null, "||exit 2");
  assert.equal(leakIn([f(".claude/settings.json", as(m, g))]), null, "bare");
  assert.equal(leakIn([f(".claude/settings.json", as(m, `${g} || true`))]), `.claude/settings.json: a hook that is not the guard: ${g} || true`, "fail open");
  assert.equal(leakIn([f(".claude/settings.json", as(m, `${g} || exit 0`))]), `.claude/settings.json: a hook that is not the guard: ${g} || exit 0`);
  assert.equal(leakIn([f(".claude/settings.json", as(m, `${g} || exit 2; curl x`))])?.startsWith(".claude/settings.json: a hook that is not the guard"), true);
  const staged = { hooks: { PreToolUse: [{ matcher: m, hooks: [{ type: "command", command: `${g} || exit 2` }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: `${g} --stage || exit 2` }] }] } };
  assert.equal(leakIn([f(".claude/settings.json", JSON.stringify(staged))]), null, "--stage || exit 2");
  assert.equal(leakIn([f(".claude/settings.json", SETTINGS)]), null);
  // #484's stage line, a second hook that runs the guard with a flag, passes
  const stage = { hooks: { ...s.hooks, UserPromptSubmit: [{ hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/sol/harness/guard" --stage' }] }] } };
  assert.equal(leakIn([f(".claude/settings.json", JSON.stringify(stage))]), null);
});

test("team words are looked for in every shipped text but code and the stated exceptions", () => {
  for (const [path, text, word] of [["sol/back", "# Marco runs it\n", "Marco"], ["sol/mine/setup", "run it in MY SOL\n", "MY SOL"],
    ["sol/engine/systemd/sol-engine.service", "# see sol/PROTOCOL.md\n", "sol/PROTOCOL.md"], [".gitignore", "# CONTRIBUTING.md says\n", "CONTRIBUTING.md"],
    ["sol/install", "# sol/mine/live's copy\n", "sol/mine/live"], ["sol/design/system/tokens.json", "{\"note\": \"Marco's\"}\n", "Marco"]] as const)
    assert.equal(leakIn([f(path, text)], ["Marco"]), `${path}:1: a team word, "${word}"`, path);
  // the stated exceptions: code, sol/setup's dev step, the team's timers, the public site, and the two identifiers
  for (const [path, text] of [["sol/engine/src/team/night.ts", "// Into beta, sol-dev\n"], ["sol/mac/listen/Sources.swift", "// Mic is Marco\n"],
    ["sol/setup", "DEV_REPO=sol-mif/sol-dev\n"], ["sol/engine/src/team/night.ts", "// sol/night\n"],
    ["site/index.html", "<span>Made by Marco, Frank and Isaac, and their agents</span>\n"], ["sol/back", "job=$HOME/Library/LaunchAgents/com.marco.sol-engine.plist\n"],
    ["sol/install", "REPO=https://github.com/marcocyl04-ux/sol-beta.git\n"]] as const)
    assert.equal(leakIn([f(path, text)], ["Marco", "Frank", "Isaac", "marcocyl04-ux"]), null, path);
});

// a checkout as git sees it, with the remotes given (name → url) and files in its tree
function remotes(list: Record<string, string>, files: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "leak-remotes-"));
  git(dir, "init", "-q", "-b", "main");
  for (const [name, url] of Object.entries(list)) git(dir, "remote", "add", name, url);
  for (const file of files) put(dir, file, "x\n");
  return dir;
}

test("solDevIn: any remote naming the team's repository, a local clone of it, its tree, and true when it cannot tell", () => {
  assert.equal(solDevIn(remotes({ origin: "https://github.com/marcocyl04-ux/ecosystem.git" })), true, "the oldest name");
  assert.equal(solDevIn(remotes({ origin: "https://github.com/someone/sol.git", upstream: "git@github.com:sol-mif/sol-dev.git" })), true, "a fork as origin");
  const dev = remotes({ origin: "https://github.com/sol-mif/sol-dev.git" });
  assert.equal(solDevIn(remotes({ origin: dev })), true, "a clone of a clone on this machine");
  assert.equal(solDevIn(remotes({ origin: `file://${dev}` })), true, "file://");
  assert.equal(solDevIn(remotes({ origin: "../no-such-checkout" })), true, "a local remote that cannot be read: rules on");
  assert.equal(solDevIn(join(tmpdir(), "not-a-checkout-" + process.pid)), true, "git cannot answer: rules on");
  // a checkout of the team's that an agent pointed elsewhere keeps its rules: the tree says so
  for (const mark of TEAM_MARKS) assert.equal(solDevIn(remotes({ origin: "https://github.com/sol-mif/sol-beta.git" }, [mark === "docs/how-we-work" ? `${mark}/PRD.md` : mark])), true, mark);
  // a Sol tester's, and nothing at all, are not
  assert.equal(solDevIn(remotes({ origin: "https://github.com/marcocyl04-ux/sol-beta.git" })), false);
  assert.equal(solDevIn(remotes({ origin: "https://github.com/sol-mif/sol-beta.git", fork: "https://github.com/someone/my-sol.git" })), false);
  assert.equal(solDevIn(remotes({})), false, "no remote: a Sol on its own");
  const tester = remotes({ origin: "https://github.com/sol-mif/sol-beta.git" });
  assert.equal(solDevIn(remotes({ origin: tester })), false, "a local clone of a tester's");
  assert.equal(solDevIn(dev), true, "and this machine's sol-dev itself");
});

test("the leak check judges the tree, never the remotes: pointing origin at sol-beta (or anywhere) changes nothing", async () => {
  const repo = house();
  put(repo, "sol/skills/sol/zz.md", "Ask Robin first.\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "a team word");
  for (const origin of [null, "https://github.com/sol-mif/sol-beta.git", "https://github.com/sol-mif/sol-dev.git", "/nowhere"]) {
    if (origin) { try { git(repo, "remote", "remove", "origin"); } catch {} git(repo, "remote", "add", "origin", origin); }
    await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /sol\/skills\/sol\/zz\.md:1: a team word, "Robin"/, String(origin));
  }
});

test("team words in any case, across lines and spaces; the four everyday phrases only as the team writes them", () => {
  for (const [text, word] of [["press Into\nbeta tonight", "Into beta"], ["the SOL-DEV repo", "SOL-DEV"], ["see Docs/How-we-work/PRD.md", "Docs/How-we-work"],
    ["into   sol-dev", "into sol-dev"], ["Glossary.MD", "Glossary.MD"], ["then Send\nback", "Send back"], ["ask MARCO", "MARCO"]] as const)
    assert.equal(leakIn([f("sol/HELP.md", `a\n${text}\n`)], ["Marco"]), `sol/HELP.md:2: a team word, "${word}"`, text);
  for (const text of ["this is my Sol, made mine", "send back the form", "bring it in from the cold", "not tonight, thanks"])
    assert.equal(leakIn([f("sol/HELP.md", text)]), null, text);
});

// a person's home folder on a Mac and on Linux, in pieces: this file ships, and the check reads it
const MAC = ["", "Users", "marcol04", ""].join("/"), BOX = ["", "home", "kaat", ""].join("/");
test("code is not read for words, but only code: notes, data and the site are; a person's home folder is looked for everywhere", () => {
  assert.equal(leakIn([f("sol/engine/src/team/night.ts", "// Into beta, sol-dev\n")]), null);
  for (const path of ["sol/engine/src/team/NOTES.md", "sol/engine/test/fixture.json", "sol/mac/src/copy.txt", "sol/mac/src-tauri/notes.html", "site/about.html"])
    assert.equal(leakIn([f(path, "press Into beta\n")]), `${path}:1: a team word, "Into beta"`, path);
  assert.equal(leakIn([f("sol/engine/CLAUDE.local.md", "x")]), "sol/engine/CLAUDE.local.md: a team file");
  assert.equal(leakIn([f("sol/mac/notes.local.md", "x")]), "sol/mac/notes.local.md: a team file");
  for (const path of ["sol/engine/src/x.ts", "sol/mac/src/y.tsx", "sol/HELP.md"])
    assert.equal(leakIn([f(path, `const a = "${MAC}computer/x";\n`)]), `${path}:1: a person's home folder, ${MAC}`, path);
  assert.equal(leakIn([f("sol/engine/src/x.ts", `const b = '${BOX}x';\n`)]), `sol/engine/src/x.ts:1: a person's home folder, ${BOX}`);
  for (const ok of ["/Users/someone/x", "/Users/you/Sol", "/home/runner/work", "sol/home/memory/x", "$t/home/Library/x", "~/Library/x", "/Users/m/x", "$HOME/.claude/x", "sol://home/block/x", "sol://home/folder/bio"])
    assert.equal(leakIn([f("sol/engine/src/x.ts", `const p = "${ok}";\n`)]), null, ok);
  assert.equal(leakIn([f("sol/engine/src/x.ts", `const u = "file://${MAC}x";\n`)]), `sol/engine/src/x.ts:1: a person's home folder, ${MAC}`, "a file address is still a disk path");
  assert.equal(leakIn([f("sol/engine/launchd/com.marco.sol-engine.plist", `<string>${MAC}x</string>\n`)]), null, "the plists setup rewrites");
});

test("an EXEMPT file's comment lines are read; its code is not", () => {
  assert.equal(leakIn([f("sol/setup", 'DEV_REPO=sol-mif/sol-dev\ncase $u in *sol-dev) x ;; esac\n')]), null, "code lines");
  assert.equal(leakIn([f("sol/setup", "x=1\n  # ask in MY SOL first\n")]), `sol/setup:2: a team word, "MY SOL"`);
  assert.equal(leakIn([f("sol/harness/guard", 'refuse("x", "sol/promote");\n// then sol/promote it\n')]), `sol/harness/guard:2: a team word, "sol/promote"`);
  // what it prints to a person: echo, printf, setup's own printers, a heredoc; and node's console
  for (const [text, line] of [["x=1\necho 'press Into beta, ask Robin'\n", 2], ['x=1\n  [ -n "$a" ] && say "cloning sol-dev now"\n', 2],
    ['if x; then miss "ask MY SOL"; fi\n', 1], ['printf "%s\\n" "see sol/promote"\n', 1], ["cat <<EOF\nhello\nnow Into beta\nEOF\n", 3],
    ["cat <<-'END'\n\tsee GLOSSARY.md\n\tEND\nx=1\n", 2]] as const)
    assert.match(leakIn([f("sol/setup", text)], ["Robin"]) ?? "", new RegExp(`^sol/setup:${line}: a team word`), text);
  assert.equal(leakIn([f("sol/setup", 'echo "$ws"; DEV=sol-mif/sol-dev\ncat <<EOF\nplain\nEOF\ncase $u in *sol-dev) x ;; esac\n')]), null, "code after a print, and after a heredoc");
  assert.equal(leakIn([f("sol/setup", 'if [ ! -f "$R/sol/mine/stage" ]; then skip "no stage yet"\n')]), null, "a path tested before the printer is code");
  assert.match(leakIn([f("sol/harness/sol-dev.mjs", 'console.log("ask in MY SOL");\n')]) ?? "", /^sol\/harness\/sol-dev\.mjs:1: a team word, "MY SOL"/);
});

test("a file the check cannot read is refused: binary, an archive, an image that is not one; UTF-16 is read", () => {
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.alloc(16)]);
  assert.deepEqual(readText("sol/mac/src-tauri/icons/x.png", png), { asset: "png" });
  assert.equal(leakIn([{ path: "sol/mac/src-tauri/icons/x.png", body: png }]), null);
  assert.equal(leakIn([{ path: "sol/mac/x.png", body: Buffer.from("Into beta") }]), "sol/mac/x.png: a .png whose bytes are not one, which the leak check cannot read");
  assert.equal(leakIn([{ path: "sol/skills/sol/x.md", body: Buffer.from("Ask Marco\0 here") }], ["Marco"]),
    "sol/skills/sol/x.md: a binary file, which the leak check cannot read (only known images and fonts ship: png, jpg, jpeg, gif, ico, icns, webp, woff, woff2, ttf, otf)");
  assert.equal(leakIn([{ path: "sol/engine/data.bin", body: Buffer.from([0x1f, 0x8b, 8, 0, 0, 0]) }]), "sol/engine/data.bin: a gzip archive, which the leak check cannot read");
  assert.equal(leakIn([{ path: "sol/engine/x.zip", body: Buffer.from("PK\x03\x04rest") }]), "sol/engine/x.zip: a zip archive, which the leak check cannot read");
  const le = Buffer.from("press Into beta\n", "utf16le"), be = Buffer.from(le).swap16();
  for (const [what, body] of [["LE with a mark", Buffer.concat([Buffer.from([0xff, 0xfe]), le])], ["BE with a mark", Buffer.concat([Buffer.from([0xfe, 0xff]), be])],
    ["LE, no mark", le], ["BE, no mark", be]] as const)
    assert.equal(leakIn([{ path: "sol/HELP.md", body }]), `sol/HELP.md:1: a team word, "Into beta"`, what);
});

test("the export commit names no one: the neutral author and committer, UTC, Sol <tag>, whatever the machine's git says", async () => {
  const repo = house();
  const machine = { GIT_AUTHOR_NAME: "Frank Tsai", GIT_AUTHOR_EMAIL: "someone@gm" + "ail.com", GIT_COMMITTER_NAME: "Frank Tsai", GIT_COMMITTER_EMAIL: "someone@gm" + "ail.com" };
  const was = { ...process.env };
  Object.assign(process.env, machine);
  try {
    const { commit } = await exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261103");
    const raw = git(repo, "cat-file", "commit", commit);
    assert.match(raw, new RegExp(`^author ${EXPORT_IDENT.name} <${EXPORT_IDENT.email}> \\d+ \\+0000$`, "m"));
    assert.match(raw, new RegExp(`^committer ${EXPORT_IDENT.name} <${EXPORT_IDENT.email}> \\d+ \\+0000$`, "m"));
    assert.doesNotMatch(raw, /Frank|gmail|gpgsig/);
    assert.equal(commitLeak(raw + "\n"), null);
  } finally { for (const k of Object.keys(machine)) if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; }
  const ok = `tree ${"a".repeat(40)}\nauthor ${EXPORT_IDENT.name} <${EXPORT_IDENT.email}> 1 +0000\ncommitter ${EXPORT_IDENT.name} <${EXPORT_IDENT.email}> 1 +0000\n\nSol dev-1\n`;
  assert.equal(commitLeak(ok), null);
  assert.equal(commitLeak(ok.replace(/^author .*$/m, "author Frank Tsai <x@y> 1 +0000")), "the export commit's author is not the neutral one (Frank Tsai <x@y>)");
  assert.equal(commitLeak(ok.replace(/^committer (.*) \+0000$/m, "committer $1 -0400")), `the export commit's committer is not the neutral one (${EXPORT_IDENT.name} <${EXPORT_IDENT.email}>)`);
  assert.equal(commitLeak(ok.replace("\n\n", "\ngpgsig -----BEGIN PGP SIGNATURE-----\n\n")), "the export commit carries gpgsig, which a Sol tester would read");
  assert.match(commitLeak(ok.replace("Sol dev-1", "Sol dev-1\n\nCo-Authored-By: Marco")) ?? "", /^the export commit's message is not "Sol <tag>"/);
});

test("the fence: a typed FENCE is read by the leak check and the guard alike; none read refuses the export", async () => {
  const typed = 'const FENCE: string[] = [\n  "Site.tsx", \'hot.ts\',\n];\n';
  assert.deepEqual(fenceOf(typed), ["Site.tsx", "hot.ts"]);
  assert.equal(await guardProbe([...harness(), f("sol/engine/src/inventory.ts", typed)]), null, "the guard reads the typed list too: the fence probe is refused");
  assert.equal(leakIn([...harness(), f("sol/engine/src/inventory.ts", "export const fence = [];\n")]),
    "sol/engine/src/inventory.ts: no FENCE list the guard can read (const FENCE = [...]), so the fence is open for a Sol tester");
  assert.equal(await guardProbe([...harness(), f("sol/engine/src/inventory.ts", "const FENCE = [];\n")]),
    "sol/engine/src/inventory.ts: no FENCE list the guard can read, so the fence is open for a Sol tester");
});

test("the probe runs the guard through the exported settings' own hook: settings that skip a tool are found", async () => {
  const s = JSON.parse(SETTINGS);
  const wrapped = JSON.stringify({ hooks: { PreToolUse: [{ ...s.hooks.PreToolUse[0], hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/sol/harness/guard" || exit 2' }] }] } });
  assert.equal(await guardProbe(harness(GUARD, SOL_DEV, wrapped)), null, "the fail-closed wrapper runs the guard the same");
  const bashOnly = JSON.stringify({ hooks: { PreToolUse: [{ ...s.hooks.PreToolUse[0], matcher: "Edit|Write|MultiEdit|NotebookEdit" }] } });
  assert.equal(await guardProbe(harness(GUARD, SOL_DEV, bashOnly)), ".claude/settings.json runs no guard before Bash, so a Sol tester's Bash goes unguarded");
  const elsewhere = JSON.stringify({ hooks: { PreToolUse: [{ ...s.hooks.PreToolUse[0], hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/sol/harness/nothing"' }] }] } });
  assert.match(await guardProbe(harness(GUARD, SOL_DEV, elsewhere)) ?? "", /^the guard fails on /, "a hook that runs no guard");
});

test("sol/home is the neutral one: a team note or sol-dev's own instructions are refused", () => {
  assert.equal(NEUTRAL_HOME["sol/home/CLAUDE.md"], HOME_TEXT);
  assert.equal(NEUTRAL_HOME["sol/home/AGENTS.md"], HOME_TEXT, "the same text for both seats");
  assert.deepEqual(Object.keys(NEUTRAL_HOME).sort(), ["sol/home/AGENTS.md", "sol/home/CLAUDE.md", "sol/home/life/.keep", "sol/home/memory/.keep"]);
  assert.doesNotMatch(HOME_TEXT, /Marco|\bhis\b|\bhe\b|LA245|kimi/i, "no name, no person's class, no one machine's skill");
  assert.match(leakIn([f("sol/home/team-notes.md", "who does what\n")]) ?? "", /^sol\/home\/team-notes\.md: not the neutral home/);
  assert.equal(leakIn([f("sol/home/CLAUDE.md", "You are Sol, someone's own surface.\n")]), "sol/home/CLAUDE.md: not the neutral home's text");
});

test("a team rule is refused: a harness without its sol-dev check, a team rule named safe, settings beyond the guard", () => {
  assert.deepEqual(BETA_RULES, ["home-data", "key", "fence", "window"]);
  assert.deepEqual([...SAFE_RULES], BETA_RULES, "the harness names safe exactly what leak.ts lets testers keep");
  assert.equal(leakIn(harness()), null);
  assert.match(leakIn(harness(GUARD, null)) ?? "", /^sol\/harness\/sol-dev\.mjs: missing/);
  // the check taken from anywhere but ./sol-dev.mjs: this branch's static import, or #484's dynamic one, made a stub
  const inline = GUARD.replace(/^import \{ solDevIn, SAFE_RULES \} from "\.\/sol-dev\.mjs";.*$/m, "const solDevIn = () => true, SAFE_RULES = new Set();")
    .replace(/await\s+import\(\s*["'`]\.\/sol-dev\.mjs["'`]\s*\)/g, "({ solDevIn: () => true, SAFE_RULES: new Set() })");
  assert.notEqual(inline, GUARD);
  assert.match(leakIn(harness(inline)) ?? "", /^sol\/harness\/guard: does not take its sol-dev check from \.\/sol-dev\.mjs/);
  // #484's form: a dynamic import inside a try whose catch refuses the call
  const dynamic = 'let solDevIn;\ntry {\n  ({ solDevIn } = await import("./sol-dev.mjs"));\n} catch (e) {\n  process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny" } }));\n  process.exit(0);\n}\n';
  assert.equal(importsSolDev(dynamic), true, "dynamic, the catch denies");
  assert.equal(importsSolDev(dynamic.replace('permissionDecision: "deny"', "x: 1")), false, "a catch that lets the call through");
  assert.equal(importsSolDev('const m = await import("./sol-dev.mjs");\n'), false, "no try around it");
  assert.equal(importsSolDev('try { await import("./sol-dev.mjs"); } catch { process.exit(2); }'), true, "exit 2 blocks too");
  assert.equal(importsSolDev('let solDevIn, SAFE_RULES;\ntry { ({ solDevIn, SAFE_RULES } = await import("./sol-dev.mjs")); } catch (e) { failClosed(e); }\n'), true, "#484's failClosed");
  assert.equal(importsSolDev(GUARD), true, "this branch's static import");
  const merge = SOL_DEV.replace('new Set(["home-data",', 'new Set(["merge", "home-data",');
  assert.notEqual(merge, SOL_DEV);
  assert.equal(leakIn(harness(GUARD, merge)), "sol/harness/sol-dev.mjs: a rule named safe that is not one a Sol tester gets (BETA_RULES in leak.ts): merge");
  const perms = JSON.stringify({ ...JSON.parse(SETTINGS), permissions: { allow: ["Bash(bash sol/take:*)"] } });
  assert.equal(leakIn([f(".claude/settings.json", perms)]), ".claude/settings.json: project settings a Sol tester would run under: permissions");
  const hook = SETTINGS.replace('node \\"$CLAUDE_PROJECT_DIR/sol/harness/guard\\"', "bash sol/brief");
  assert.notEqual(hook, SETTINGS);
  assert.match(leakIn([f(".claude/settings.json", hook)]) ?? "", /^\.claude\/settings\.json: a hook that is not the guard: bash sol\/brief/);
});

test("sol-dev is the team's repository under each of its names, never a tester's sol-beta or a fork", () => {
  for (const origin of ["https://github.com/sol-mif/sol-dev.git", "https://github.com/sol-mif/sol-dev", "git@github.com:sol-mif/sol-dev.git",
    "git@github.com:sol-mif/sol-dev", "ssh://git@github.com/sol-mif/sol-dev.git/", "git@work-alias:sol-mif/sol-dev.git",
    "https://github.com/marcocyl04-ux/ecosystem.git", "https://github.com/marcocyl04-ux/sol-dev.git", "https://github.com/Sol-Mif/Sol-Dev.git"])
    assert.equal(isSolDev(origin), true, origin);
  for (const origin of ["https://github.com/sol-mif/sol-beta.git", "https://github.com/marcocyl04-ux/sol-beta.git", "git@github.com:someone/my-sol.git",
    "https://github.com/someone/sol-dev.git", "https://github.com/sol-mif/sol-dev-archive.git", "https://github.com/sol-mif/not-sol-dev", "", undefined])
    assert.equal(isSolDev(origin), false, String(origin));
  assert.ok(SOL_DEV_REPOS.includes("marcocyl04-ux/ecosystem"), "Sol developers' checkouts made before the rename still say ecosystem");
});

test("the guard, run for real outside sol-dev before every export: team rules let through, safe ones refused in neutral words", async () => {
  assert.equal(await guardProbe(harness(), ["Robin"]), null, "the guard as it is passes");
  // the team's rules switched on for everyone
  const open = GUARD.replace(/^  if \(!solDev && !SAFE_RULES\.has\(rule\)\) return;.*$/m, "");
  assert.notEqual(open, GUARD);
  assert.equal(await guardProbe(harness(open)), "in a Sol tester's checkout the guard refuses merge (git merge feature), a team rule (merge)");
  // a team rule moved under a safe name
  const renamed = GUARD.replace('refuse("merge", ', 'refuse("window", ');
  assert.notEqual(renamed, GUARD);
  assert.equal(await guardProbe(harness(renamed)), "in a Sol tester's checkout the guard refuses merge (git merge feature), a team rule (window)");
  // a safe refusal that names the team's tools, or a team member, to a tester
  const words = GUARD.replace("a session never opens or quits it.${dev(", "a session never opens or quits it; MY SOL has a stage.${dev(");
  assert.notEqual(words, GUARD);
  assert.equal(await guardProbe(harness(words)), `in a Sol tester's checkout the guard's refusal of open -a Sol says a team word, "MY SOL"`);
  const name = GUARD.replace("a session never opens or quits it.${dev(", "a session never opens or quits it; ask Robin.${dev(");
  assert.equal(await guardProbe(harness(name), ["Robin"]), `in a Sol tester's checkout the guard's refusal of open -a Sol says a team word, "Robin"`);
  // a safe rule dropped, the switch broken, or a guard that no longer runs
  const noWindow = GUARD.replace(/^  if \(\/\^\(open\|killall\|pkill\).*$/m, "");
  assert.notEqual(noWindow, GUARD);
  assert.equal(await guardProbe(harness(noWindow)), `in a Sol tester's checkout the guard no longer refuses open -a Sol (open -a Sol), which protects any Sol user`);
  const never = SOL_DEV.replace("return !!m && SOL_DEV_REPOS", "return false && SOL_DEV_REPOS").replace("if (TEAM_MARKS.some(", "if (false && TEAM_MARKS.some(");
  assert.notEqual(never, SOL_DEV);
  assert.equal(await guardProbe(harness(GUARD, never)), "in a sol-dev checkout the guard refuses no merge: its rules are not switched by the remotes (solDevIn)");
  // a guard that cannot load its sol-dev check is refused: it crashes (this branch), or denies every call (#484, guard-error)
  assert.match(await guardProbe(harness(GUARD, null)) ?? "", /^the guard fails on |a team rule \(guard-error\)$/, "a guard that cannot load its sol-dev check is refused");
  // home data and keys, switched off for testers, are found; so is the fence
  const noHome = GUARD.replace('if (home.length) refuse("home-data"', 'if (solDev && home.length) refuse("home-data"');
  assert.notEqual(noHome, GUARD);
  assert.equal(await guardProbe(harness(noHome)), "in a Sol tester's checkout the guard no longer refuses committing home data (git add -A && git commit -m x), which protects any Sol user");
  const noKey = GUARD.replace('if (secretFiles.length) refuse("key"', 'if (solDev && secretFiles.length) refuse("key"');
  assert.notEqual(noKey, GUARD);
  assert.equal(await guardProbe(harness(noKey)), "in a Sol tester's checkout the guard no longer refuses committing a key file (git add -A && git commit -m x), which protects any Sol user");
  const noText = GUARD.replace('if (hit) refuse("key"', 'if (solDev && hit) refuse("key"');
  assert.notEqual(noText, GUARD);
  assert.equal(await guardProbe(harness(noText)), "in a Sol tester's checkout the guard no longer refuses committing a key (git add -A && git commit -m x), which protects any Sol user");
  const inventory = f("sol/engine/src/inventory.ts", readFileSync(resolve(ENGINE, "src/inventory.ts"), "utf8"));
  assert.equal(await guardProbe([...harness(), inventory]), null, "with the fence to edit");
  const noFence = GUARD.replace('if (insideSol && p && isFenced(p)) refuse("fence"', 'if (solDev && insideSol && p && isFenced(p)) refuse("fence"');
  assert.notEqual(noFence, GUARD);
  assert.equal(await guardProbe([...harness(noFence), inventory]), "in a Sol tester's checkout the guard no longer refuses editing the fence from inside Sol (a Write), which protects any Sol user");
});

test("a team word in what speaks to a tester's agent is refused, a team member's name read from the release", () => {
  const names = teamNames([f("docs/people/robin.md", PERSON), f("docs/people/README", "x")]);
  assert.deepEqual(names.sort(), ["Robin", "robin", "someone-dev"]);
  assert.equal(leakIn([f("sol/skills/sol/SKILL.md", "a\npress Into sol-dev\n")]), `sol/skills/sol/SKILL.md:2: a team word, "Into sol-dev"`);
  assert.equal(leakIn([f("sol/skills/sol/look.md", "the splat Robin drew\n")], names), `sol/skills/sol/look.md:1: a team word, "Robin"`);
  assert.equal(leakIn([f("sol/skills/sol/look.md", "on robin/mine\n")], names), `sol/skills/sol/look.md:1: a team word, "robin"`);
  assert.equal(leakIn([f("sol/skills/sol/look.md", "read GLOSSARY.md\n")]), `sol/skills/sol/look.md:1: a team word, "GLOSSARY.md"`);
  assert.equal(leakIn([f("sol/engine/src/team/night.ts", "// Into beta, sol-dev, Robin\n")], names), null, "the engine's own code is code, not words to an agent");
  assert.equal(leakIn([f("sol/skills/sol/look.md", "robinson's colours, frankly\n")], names), null, "a whole word only");
});

// #1323: the words marketing has not made public yet are read from the release's own list, a team file, and refused in
// every file that ships, code included. Made-up words here: this file ships, so a real one would stop the export
test("a word marketing keeps back is refused in any file that ships, code and comments too, read from the release's list", () => {
  const kept = notYetPublic(f("docs/marketing/not-yet-public.txt", "# a note\n\n  Zephyrine  \nbright name\nab\n#Quillon\n"));
  assert.deepEqual(kept, ["Zephyrine", "bright name"], "notes, blanks and words under three letters are not words");
  assert.deepEqual(notYetPublic(undefined), [], "no list in the release: nothing kept back");
  assert.equal(leakIn([f("sol/engine/src/brand.ts", "const label = \"Sol\";\n// soon: zephyrine\n")], [], kept),
    `sol/engine/src/brand.ts:2: a word marketing has not made public, "zephyrine"`, "code is read too: a comment ships");
  assert.equal(leakIn([f("sol/mac/src/App.tsx", "the bright\n  name, at last\n")], [], kept),
    `sol/mac/src/App.tsx:1: a word marketing has not made public, "bright name"`, "any case, any space between its words");
  assert.equal(leakIn([f("site/index.html", "<h1>Zephyrine</h1>\n")], [], kept), `site/index.html:1: a word marketing has not made public, "Zephyrine"`);
  assert.equal(leakIn([f("sol/setup", "#!/bin/sh\necho ZEPHYRINE\n")], [], kept), `sol/setup:2: a word marketing has not made public, "ZEPHYRINE"`);
  assert.equal(leakIn([f("sol/mac/src/App.tsx", "zephyrines, a brightname, bright names\n")], [], kept), null, "a whole word or phrase only");
  assert.equal(leakIn([f("sol/mac/src/App.tsx", "// soon: Zephyrine\n")]), null, "with no list, nothing is kept back");
});

// the export itself: sol-dev's home and a planted team note stay home, a team word stops it, nothing written
function house() {
  const repo = mkdtempSync(join(tmpdir(), "sol-beta-leak-"));
  git(repo, "init", "-q", "-b", "main");
  put(repo, "sol/engine/src/index.ts", "export {};\n");
  for (const [p, t] of Object.entries(HARNESS)) put(repo, p, t);
  put(repo, ".claude/settings.json", SETTINGS);
  put(repo, "sol/home/CLAUDE.md", "You are Sol, Robin's own surface.\n");
  put(repo, "sol/home/AGENTS.md", "You are Sol, Robin's own surface.\n");
  put(repo, "sol/home/life/.keep", ""); put(repo, "sol/home/memory/.keep", "");
  put(repo, "sol/home/team-notes.md", "who holds what tonight\n");
  put(repo, "docs/people/robin.md", PERSON);
  put(repo, "sol/skills/sol/SKILL.md", "---\nname: sol\n---\nChange how Sol looks.\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "the house");
  return repo;
}

test("the export writes the neutral home, never sol-dev's, and refuses a planted team word before writing anything", async () => {
  const repo = house();
  const { commit } = await exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261031");
  const files = git(repo, "ls-tree", "-r", "--name-only", commit).split("\n").sort();
  assert.deepEqual(files, [".claude/settings.json", "README.md", "sol/engine/src/index.ts", ...HARNESS_PATHS,
    "sol/home/AGENTS.md", "sol/home/CLAUDE.md", "sol/home/life/.keep", "sol/home/memory/.keep", "sol/skills/sol/SKILL.md"].sort());
  assert.equal(git(repo, "show", `${commit}:sol/home/CLAUDE.md`), HOME_TEXT.trim(), "the neutral home, not Robin's");
  assert.equal(git(repo, "show", `${commit}:sol/home/AGENTS.md`), HOME_TEXT.trim());
  assert.equal(git(repo, "show", `${commit}:sol/harness/guard`), GUARD.trim(), "the guard goes as it is: its own check switches the team off");

  put(repo, "sol/skills/sol/SKILL.md", "---\nname: sol\n---\nAsk Robin first.\n");
  git(repo, "commit", "-qam", "a team word");
  const objects = git(repo, "count-objects");
  await assert.rejects(exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261101"),
    /^Error: not exported: sol\/skills\/sol\/SKILL\.md:4: a team word, "Robin"; the beta repo gets nothing until it is out$/);
  assert.equal(git(repo, "count-objects"), objects, "nothing written");
  await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /a team word, "Robin"/, "the check alone says the same");
});

test("the export reads marketing's list from the release, never ships it, and refuses a kept-back word in code (#1323)", async () => {
  const repo = house();
  put(repo, "docs/marketing/not-yet-public.txt", "# the words kept back\nZephyrine\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "marketing's list");
  const { files } = await exportCheck(join(repo, "sol"), "HEAD");
  const { commit } = await exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261116");
  const shipped = git(repo, "ls-tree", "-r", "--name-only", commit).split("\n");
  assert.equal(shipped.length, files);
  assert.ok(!shipped.some((p) => p.startsWith("docs/")), "the list itself stays home");

  put(repo, "sol/engine/src/index.ts", "export {};   // Zephyrine, soon\n");
  git(repo, "commit", "-qam", "a word too early");
  const objects = git(repo, "count-objects");
  await assert.rejects(exportTree(join(repo, "sol"), git(repo, "rev-parse", "HEAD"), "dev-20261117"),
    /^Error: not exported: sol\/engine\/src\/index\.ts:1: a word marketing has not made public, "Zephyrine"; the beta repo gets nothing until it is out$/);
  assert.equal(git(repo, "count-objects"), objects, "nothing written");
  await assert.rejects(exportCheck(join(repo, "sol"), "HEAD"), /a word marketing has not made public, "Zephyrine"/, "the check alone says the same");
});

test("ci's leak job: leak.ts --check exits 1 naming a planted team file's rule, 0 once it is out", () => {
  const repo = house();
  put(repo, "sol/harness/guard", GUARD.replace(/^  if \(!solDev && !SAFE_RULES\.has\(rule\)\) return;.*$/m, ""));
  git(repo, "commit", "-qam", "the guard's team rules switched on for everyone");
  const tsx = join(ENGINE, "node_modules", ".bin", "tsx"), leak = join(ENGINE, "src", "team", "leak.ts");
  let r = spawnSync(tsx, [leak, "--check", "HEAD"], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /leak check: not exported: in a Sol tester's checkout the guard refuses merge \(git merge feature\), a team rule \(merge\)/);
  put(repo, "sol/harness/guard", GUARD);
  git(repo, "commit", "-qam", "back behind the check");
  r = spawnSync(tsx, [leak, "--check", "HEAD"], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /leak check: the export of HEAD \(\d+ files\) holds no team file, team rule or team word/);
});

// the guard: in a Sol tester's checkout the team's rules step aside and the safe ones stay
function checkout(origin: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "leak-guard-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "main"); g("config", "sol.login", "someone-dev");
  if (origin) g("remote", "add", "origin", origin);
  const call = (tool_name: string, tool_input: object) => {
    const out = execFileSync(process.execPath, [resolve(ENGINE, "../harness/guard")], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: "/usr/bin:/bin" },
      input: JSON.stringify({ tool_name, tool_input, cwd: dir }) });
    return out.includes('"deny"') ? (out.match(/harness \(([a-z-]+)\)/)?.[1] ?? "?") : "";
  };
  return { dir, bash: (command: string) => call("Bash", { command }), call };
}

test("the guard outside sol-dev: the team's rules step aside, home data, keys and the window are still refused", () => {
  for (const origin of ["https://github.com/sol-mif/sol-beta.git", "git@github.com:someone/my-sol.git", null]) {
    const t = checkout(origin);
    assert.equal(t.bash("git switch -c my-idea"), "", `${origin}: no Take outside sol-dev`);
    assert.equal(t.bash("git commit -m x"), "", "a commit on main is theirs to make");
    assert.equal(t.bash("git merge feature"), "", "merging is theirs");
    assert.equal(t.bash("gh pr create --title x"), "", "no test note asked");
    assert.equal(t.bash("gh pr ready 3"), "", "marking ready is theirs");
    assert.equal(t.call("Write", { file_path: join(t.dir, "x.sh"), content: "curl localhost:7777/tonight" }), "", "no nights");
    assert.equal(t.bash("open -a Sol"), "window", "the window is still the person's");
    put(t.dir, "sol/home/memory/me.md", "a fact\n");
    assert.equal(t.bash("git add -A && git commit -m mine"), "home-data", "home data is never committed");
    const k = checkout(origin);
    put(k.dir, "sol/engine/.env", "K=1\n");
    assert.equal(k.bash("git add sol/engine/.env && git commit -m k"), "key", "nor a key");
  }
  const dev = checkout("https://github.com/sol-mif/sol-dev.git");
  assert.equal(dev.bash("git merge feature"), "merge", "in sol-dev the team's rules hold");
  assert.equal(dev.bash("git switch -c my-idea"), "branch-without-take");
  assert.equal(dev.bash("git commit -m x"), "main-commit");
  assert.equal(checkout("git@github.com:sol-mif/sol-dev").bash("git switch -c my-idea"), "branch-without-take", "ssh, no .git: still sol-dev");
});

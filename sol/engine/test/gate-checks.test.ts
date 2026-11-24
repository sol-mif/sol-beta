// The gate runs a PR's three check lines (#837, the engine half of slice 53): the "Checks" section of a PR body read
// (parseChecks), each command line run from the repo root (checksStep), a failing line red and never excused, a step in
// a person's own Sol listed and never run, fewer than three lines red. With no body given nothing changes: the four
// old steps, the old result, the old JSON. The whole runs are in a throwaway repo whose build tools and paths are
// stand-ins that pass, so the only red a run can show is the check line's.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChecks, checksStep, excusable, judge, gateGreen, runGate, summary, GOO_LEGACY, TOKENS_LEGACY, type GateResult, type Step } from "../src/team/gate.ts";

// the PR template as PR #868 writes it (.github/PULL_REQUEST_TEMPLATE.md on marco/base-base-chore-three-841), with the
// three lines of its Checks section handed in
const TEMPLATE = (lines: string[]) => `**What changed** (two or three lines, plain words)

**Issue**: Fixes #… / Part of #…

**What to try** (for the person who will try it: what to do in their own Sol, what they should notice)

**Felt or silent** (felt: a person can notice the change, so one human tries it before it is ready; silent: nobody can, the machines are its only gate)

**What I ran** (\`npm test\` in \`sol/engine\`; the builds; what you clicked in your own Sol and saw)

**Checks** (three lines a reviewer can run to see it work, each a command in backticks or a step in their own Sol, with what they should see; for example "\`cd sol/engine && npx tsx --test test/take.test.ts\` passes")
${lines.join("\n")}

**Pages updated** (\`sol/README.md\` if how it runs changed; \`sol/PROTOCOL.md\` if a message between the app and the engine changed; \`GLOSSARY.md\` for a new word; or "none")
- \`touch below\` is a list line under another heading

**Written by**: me / my agent (draft until a person has read and tried it)
`;
const body = (...cmds: string[]) => TEMPLATE(cmds.map((c) => `- \`${c}\` passes`));

test("parseChecks: the template with three commands filled in gives three lines to run, in order", () => {
  const d = parseChecks(body("cd sol/engine && npx tsx --test test/take.test.ts", "bash sol/gate --json | grep -q green", "test -f now.md"));
  assert.equal(d.found, true);
  assert.deepEqual(d.lines.map((l) => [l.n, l.cmd]), [
    [1, "cd sol/engine && npx tsx --test test/take.test.ts"], [2, "bash sol/gate --json | grep -q green"], [3, "test -f now.md"],
  ]);
  assert.equal(d.lines[0].text, "`cd sol/engine && npx tsx --test test/take.test.ts` passes");
});

test("parseChecks: the untouched template has the section and no line; the heading's own example is never a line", () => {
  assert.deepEqual(parseChecks(TEMPLATE(["- ", "- ", "- "])), { found: true, lines: [] });
  assert.deepEqual(parseChecks(TEMPLATE(["-", "-", "-"])), { found: true, lines: [] }, "the trailing space trimmed away");
  // a line keeps the place it has in the section, so the number is the one its author sees
  assert.deepEqual(parseChecks(TEMPLATE(["- ", "- `false` fails", "- "])).lines.map((l) => [l.n, l.cmd]), [[2, "false"]]);
});

test("parseChecks: a body with no Checks section is not found", () => {
  const none = "**What changed** nothing\n\n**What I ran**\n- `touch never`\n";
  assert.deepEqual(parseChecks(none), { found: false, lines: [] });
  assert.deepEqual(parseChecks(""), { found: false, lines: [] });
  assert.equal(parseChecks("We talked about **Checks** today\n- `touch never`\n").found, false, "only a line that starts with it");
  assert.equal(parseChecks("```\n**Checks**\n- `touch never`\n```\n").found, false, "the template shown in a fence is not the section");
});

test("parseChecks: a line with no backticks is a step in a person's own Sol: listed, never a command", () => {
  const d = parseChecks(TEMPLATE(["- open Home and press the bar: the ring goes off; touch never", "- `true` passes; touch never", "* in Settings, engine shows today's release"]));
  assert.deepEqual(d.lines.map((l) => [l.n, l.cmd]), [[1, null], [2, "true"], [3, null]]);
  assert.equal(d.lines[0].text, "open Home and press the bar: the ring goes off; touch never");
  // the first text in backticks is the command; a second one is words. Two backticks hold a command with one inside
  assert.equal(parseChecks(TEMPLATE(["- `true` prints `false`"])).lines[0].cmd, "true");
  assert.equal(parseChecks(TEMPLATE(["- ``echo `date` `` prints the day"])).lines[0].cmd, "echo `date`");
  assert.equal(parseChecks(TEMPLATE(["- a backtick ` left open"])).lines[0].cmd, null, "nothing to run");
});

test("parseChecks: the section ends at the next heading or at a blank line after its lines; nothing below is read", () => {
  const d = parseChecks(body("true", "true", "true"));
  assert.equal(d.lines.length, 3, "the list line under Pages updated is not a check");
  assert.ok(!d.lines.some((l) => /below/.test(l.text)));
  const blank = parseChecks("**Checks**\n\n- `true` a\n- `true` b\n\n- `touch below` a list further down\n");
  assert.deepEqual(blank.lines.map((l) => l.n), [1, 2], "a blank line before the first line is let through, one after ends it");
  assert.equal(parseChecks("**Checks**\n- `true` a\n## Notes\n- `touch below`\n").lines.length, 1, "a markdown heading ends it too");
  // a body written in GitHub's own box arrives with \r\n
  const crlf = parseChecks(body("true", "false", "true").replace(/\n/g, "\r\n"));
  assert.deepEqual(crlf.lines.map((l) => [l.n, l.cmd]), [[1, "true"], [2, "false"], [3, "true"]]);
  // only the first Checks section counts
  assert.deepEqual(parseChecks("**Checks**\n- `true` a\n\n**Checks**\n- `touch below`\n").lines.map((l) => l.cmd), ["true"]);
});

// every throwaway repo is under one folder, gone when the file is done
const TMP = mkdtempSync(join(tmpdir(), "sol-gate-checks-"));
after(() => rmSync(TMP, { recursive: true, force: true }));
const repo = () => mkdtempSync(join(TMP, "repo-"));
const put = (root: string, f: string, text: string) => { mkdirSync(join(root, f, ".."), { recursive: true }); writeFileSync(join(root, f), text); };

test("the checks step: every command line runs from the repo root; a failing one is named and the rest still run", async () => {
  const root = repo();
  const said: string[] = [];
  const r = await checksStep(root, body("true", "false", "touch ran"), (s) => said.push(s));
  assert.equal(r.step.name, "checks");
  assert.deepEqual(r.step.failed, ["check:2"]);
  assert.equal(r.step.ok, false);
  assert.deepEqual(r.ran, [{ n: 1, ok: true }, { n: 2, ok: false }, { n: 3, ok: true }]);
  assert.deepEqual(r.manual, []);
  assert.ok(existsSync(join(root, "ran")), "the line after the failing one ran, from the repo root");
  assert.equal(existsSync(join(root, "below")), false, "a list line under another heading is never run");
  assert.ok(said.some((s) => /checks: 2 FAIL: `false`/.test(s)));
  const ok = await checksStep(root, body("true", "test -f ran", "true"), () => {});
  assert.deepEqual([ok.step.ok, ok.step.failed], [true, []]);
});

test("the checks step: a step in a person's own Sol is listed and its words are never run; three of them pass", async () => {
  const root = repo();
  const r = await checksStep(root, TEMPLATE(["- touch ran-1", "- `touch ran-2` leaves a file; touch ran-3", "- open Home: the bar is there"]), () => {});
  assert.deepEqual(r.manual, [1, 3]);
  assert.deepEqual(r.ran, [{ n: 2, ok: true }]);
  assert.deepEqual([r.step.ok, r.step.failed], [true, []]);
  assert.equal(existsSync(join(root, "ran-1")), false, "the words of a line with no backticks are never run");
  assert.ok(existsSync(join(root, "ran-2")));
  assert.equal(existsSync(join(root, "ran-3")), false, "nor the words after a command");
  const three = await checksStep(root, TEMPLATE(["- open Home", "- press the bar", "- the ring goes off"]), () => {});
  assert.deepEqual([three.step.ok, three.manual, three.ran], [true, [1, 2, 3], []]);
});

test("the checks step: fewer than three lines, or no Checks section at all, is red; the lines that are there still run", async () => {
  const root = repo();
  const said: string[] = [];
  const two = await checksStep(root, TEMPLATE(["- `touch ran`", "- ", "- `false` fails"]), (s) => said.push(s));
  assert.deepEqual(two.step.failed, ["check:missing", "check:3"]);
  assert.ok(existsSync(join(root, "ran")));
  assert.ok(said.some((s) => /2 of the 3 check lines/.test(s)));
  const empty = await checksStep(root, TEMPLATE(["- ", "- ", "- "]), () => {});
  assert.deepEqual([empty.step.ok, empty.step.failed, empty.ran, empty.manual], [false, ["check:missing"], [], []]);
  const none: string[] = [];
  const no = await checksStep(root, "**What changed** a line\n", (s) => none.push(s));
  assert.deepEqual([no.step.ok, no.step.failed], [false, ["check:missing"]]);
  assert.ok(none.some((s) => /no \*\*Checks\*\* section/.test(s)));
  // a fourth line is one more check, run like the others
  const four = await checksStep(root, TEMPLATE(["- `true`", "- `true`", "- `true`", "- `false`"]), () => {});
  assert.deepEqual(four.step.failed, ["check:4"]);
});

const step = (name: string, failed: string[] = []): Step => ({ name, ok: !failed.length, ms: 1, failed });

test("a check line is never excused: not by excusable, not by a baseline that lists it", () => {
  for (const id of ["check:1", "check:2", "check:3", "check:missing"]) assert.equal(excusable(id), false, id);
  const j = judge([step("lint"), step("build"), step("e2e"), step("evals"), step("checks", ["check:2"])], new Set(["check:2"]));
  assert.equal(j.green, false);
  assert.deepEqual(j.known, []);
  assert.equal(j.steps.find((s) => s.name === "checks")?.ok, false);
  assert.deepEqual(judge([step("checks")], new Set(["check:2"])).fixed, [], "never said to be fixed either");
});

// ---- whole runs ----
const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } }).trim();
const tool = (root: string, f: string, script: string) => { put(root, f, `#!/bin/sh\n${script}\n`); chmodSync(join(root, f), 0o755); };
/** a throwaway repo the gate is green on: the two typechecks pass, the build leaves its index.html, one path passes,
 * and the files the lint's legacy list names are there, each still using the old kit. `baseline` is what main's
 * specs/baseline.md lists. The commit judged is one past main. */
const greenRepo = (baseline = "") => {
  const root = repo();
  sh(root, "init", "-q", "-b", "main");
  put(root, "specs/baseline.md", `# Already broken\n${baseline}`);
  put(root, ".gitignore", ".sol-gate/\nnode_modules/\n");
  put(root, "sol/test/e2e/run.mjs", `console.log(JSON.stringify({ paths: [{ name: "open-sol", ok: true, ms: 1 }] }));\n`);
  sh(root, "add", "-A"); sh(root, "commit", "-qm", "main");
  sh(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  tool(root, "sol/engine/node_modules/.bin/tsc", "exit 0");
  tool(root, "sol/mac/node_modules/.bin/tsc", "exit 0");
  tool(root, "sol/mac/node_modules/.bin/vite", `mkdir -p "$3" && : > "$3/index.html"`);   // vite build --outDir <dir> …
  for (const f of GOO_LEGACY) put(root, f, "export const b = Ban" + "ds;\n");
  for (const f of TOKENS_LEGACY) put(root, f, f.endsWith(".css") ? ".a { margin: 6px; }\n" : "export const c = \"#fff\";\n");   // each still typed, so none is gone (#1615)
  put(root, "x", "1"); sh(root, "add", "-A"); sh(root, "commit", "-qm", "a change");
  return { root, sha: sh(root, "rev-parse", "HEAD") };
};
// what was red, for a message: a lint rule added later that the stand-in repo does not meet shows here by name
const red = (r: GateResult) => `red: ${r.steps.flatMap((s) => s.failed).join(", ")}`;
const OLD_KEYS = ["sha", "green", "steps", "evals", "dirty", "feature", "at", "known", "fixed", "drafts", "manual", "base"];

test("runGate with no PR body: the four old steps, the old result, nothing about checks", async () => {
  const { root, sha } = greenRepo();
  const r = await runGate(root, { say: () => {} });
  assert.equal(r.green, true, red(r));
  assert.deepEqual(r.steps.map((s) => s.name), ["lint", "build", "e2e", "evals"]);
  assert.deepEqual(Object.keys(r), OLD_KEYS);
  assert.equal(gateGreen(root, sha), true);
  assert.doesNotMatch(summary(r), /checks/);
});

test("runGate with a PR body whose second check line fails: red, and it names check:2 (#837's own try)", async () => {
  const { root, sha } = greenRepo();
  const said: string[] = [];
  const r = await runGate(root, { body: body("true", "false", "test -f x"), say: (s) => said.push(s) });
  assert.equal(r.green, false);
  assert.deepEqual(r.steps.map((s) => [s.name, s.ok]), [["lint", true], ["build", true], ["e2e", true], ["evals", true], ["checks", false]]);
  assert.deepEqual(r.steps[4].failed, ["check:2"]);
  assert.deepEqual(r.checks, { ran: [{ n: 1, ok: true }, { n: 2, ok: false }, { n: 3, ok: true }], manual: [] });
  assert.equal(r.dirty, false);
  assert.equal(gateGreen(root, sha), false, "the commit's result is red");
  assert.match(summary(r), /^RED[^\n]*\n(?:[^\n]*\n)* {2}RED {2}checks \([^)]*\): check:2/);
  assert.match(summary(r), /\n {2}checks: 2\/3 pass\n/);
  // the same body with the line put right is green, and a step in a person's own Sol is named
  const ok = await runGate(root, { body: TEMPLATE(["- `true` a", "- open Home: the bar is there", "- `test -f x` b"]), say: () => {} });
  assert.equal(ok.green, true, red(ok));
  assert.deepEqual(ok.checks, { ran: [{ n: 1, ok: true }, { n: 3, ok: true }], manual: [2] });
  assert.equal(gateGreen(root, sha), true, "five green steps are the commit's result as four are");
  assert.match(summary(ok), /\n {2}checks: 2\/2 pass · a step in a person's own Sol, not run: 2\n/);
  // a body with no Checks section is red too
  const none = await runGate(root, { body: "**What changed** a line\n", say: () => {} });
  assert.deepEqual([none.green, none.steps[4].failed], [false, ["check:missing"]]);
});

test("runGate: a failing check line that main's baseline lists is still red, and the listing is said to excuse nothing", async () => {
  const { root } = greenRepo("- `check:2` · a probe\n");
  const said: string[] = [];
  const r = await runGate(root, { body: body("true", "false", "true"), say: (s) => said.push(s) });
  assert.equal(r.green, false);
  assert.deepEqual(r.known, [], "never excused");
  assert.deepEqual(r.steps[4].failed, ["check:2"]);
  assert.ok(said.some((s) => /baseline: "check:2" is listed but never excused/.test(s)));
});

// ---- as a program: bash sol/gate --body-file <path> ----
const ENGINE = fileURLToPath(new URL("..", import.meta.url));
const gate = (root: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync(join(ENGINE, "node_modules", ".bin", "tsx"), [join(ENGINE, "src", "team", "gate.ts"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });

test("the program: --body-file hands the PR body in; a failing check line exits 1; no flag is the old JSON", () => {
  const { root } = greenRepo();
  const file = join(repo(), "pr-body.md");
  writeFileSync(file, body("true", "false", "true"));
  const red = gate(root, ["--json", "--body-file", file]);
  assert.equal(red.status, 1, red.stderr);
  const j = JSON.parse(red.stdout.trim().split("\n").pop()!);
  assert.equal(j.green, false);
  assert.deepEqual(j.steps.map((s: Step) => s.name), ["lint", "build", "e2e", "evals", "checks"]);
  assert.deepEqual(j.steps[4].failed, ["check:2"]);
  assert.deepEqual(j.checks, { ran: [{ n: 1, ok: true }, { n: 2, ok: false }, { n: 3, ok: true }], manual: [] });
  const old = gate(root, ["--json"]);
  assert.equal(old.status, 0, old.stderr);
  assert.deepEqual(Object.keys(JSON.parse(old.stdout.trim().split("\n").pop()!)), OLD_KEYS.filter((k) => k !== "at"), "what the morning run reads is as it was");
  // a body that cannot be read is "could not run", never green
  const gone = gate(root, ["--body-file", join(root, "no-such-file.md")]);
  assert.equal(gone.status, 2);
  assert.match(gone.stderr, /gate: the PR body .* cannot be read/);
  assert.equal(gate(root, ["--body-file"]).status, 2, "the flag with no path");
});

test("a check line that runs past SOL_GATE_CHECK_TIMEOUT fails, whatever it left running, and the gate goes on", () => {
  const { root } = greenRepo();
  const file = join(repo(), "pr-body.md");
  // the command is a shell with a child of its own: stopping the shell must be enough for the gate to go on
  writeFileSync(file, body("sleep 30; true", "touch after", "true"));
  const t0 = Date.now();
  const r = gate(root, ["--json", "--body-file", file], { SOL_GATE_CHECK_TIMEOUT: "1" });
  assert.equal(r.status, 1, r.stderr);
  assert.ok(Date.now() - t0 < 20_000, "it did not wait for the 30 s");
  const j = JSON.parse(r.stdout.trim().split("\n").pop()!);
  assert.deepEqual(j.steps[4].failed, ["check:1"]);
  assert.deepEqual(j.checks.ran, [{ n: 1, ok: false }, { n: 2, ok: true }, { n: 3, ok: true }]);
  assert.match(r.stderr, /stopped after 1 s/);
});

test("parseChecks: a body that shows the template in a ~~~ fence is read past it, as with ```", () => {
  const shown = "~~~\n**Checks**\n- `touch shown` a\n- `touch shown` b\n- `touch shown` c\n~~~\n";
  assert.deepEqual(parseChecks(shown), { found: false, lines: [] }, "the section shown in a ~~~ fence is not the section");
  assert.deepEqual(parseChecks(shown + body("true", "false", "true")).lines.map((l) => l.cmd), ["true", "false", "true"]);
  // a fence ends only at a fence of the same kind, at least as long: a ``` inside ~~~ (or a short one inside a long one)
  // does not end it
  assert.equal(parseChecks("~~~\n```\n**Checks**\n- `touch shown`\n~~~\n").found, false);
  assert.equal(parseChecks("````\n```\n**Checks**\n- `touch shown`\n````\n").found, false);
});

test("a check line stopped at the time limit takes what it started with it: nothing it left writes into the repo later", async () => {
  const { root } = greenRepo();
  const file = join(repo(), "pr-body.md");
  writeFileSync(file, body("(sleep 3; touch late) & sleep 30; true", "true", "true"));
  const r = gate(root, ["--json", "--body-file", file], { SOL_GATE_CHECK_TIMEOUT: "1" });
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim().split("\n").pop()!).steps[4].failed, ["check:1"]);
  await new Promise((ok) => setTimeout(ok, 4_000));
  assert.equal(existsSync(join(root, "late")), false, "the stopped line's own children were stopped with it");
});

test("bash sol/gate: a relative --body-file is read from where it was run, not from the repo root", () => {
  const { root } = greenRepo();
  // the real wrapper in the stand-in repo, with a stand-in tsx that prints what it was handed
  put(root, "sol/gate", readFileSync(join(ENGINE, "..", "gate"), "utf8"));
  tool(root, "sol/engine/node_modules/.bin/tsx", `printf '%s\\n' "$@"`);
  mkdirSync(join(root, "sol", "mac", "node_modules"), { recursive: true });
  mkdirSync(join(root, "sub"));
  const run = (args: string[]) => spawnSync("bash", [join(root, "sol", "gate"), ...args], { cwd: join(root, "sub"), encoding: "utf8" });
  const real = execFileSync("pwd", ["-P"], { cwd: join(root, "sub"), encoding: "utf8" }).trim();
  const handed = (args: string[]) => { const r = run(args); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split("\n").slice(1); };
  assert.deepEqual(handed(["--json", "--body-file", "b.md"]), ["--json", "--body-file", `${real}/b.md`]);
  assert.deepEqual(handed(["--body-file", "/tmp/x.md"]), ["--body-file", "/tmp/x.md"], "an absolute path as it is");
  assert.deepEqual(handed([]), [], "no argument, none handed");
  assert.deepEqual(handed(["--feature", "fr-01"]), ["--feature", "fr-01"]);
});

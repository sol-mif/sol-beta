// The guard's locks (#484, dev cycle step 5): every lock judged on what a call does and where it runs, with one call it
// refuses and one it lets through, and let-throughs that end. The real guard (sol/harness/guard) on real git checkouts in
// temp folders: a sol-dev one (its origin says so), a side copy beside it, and a Sol tester's (origin sol-beta). No
// network: gh is a stub, the state folder and the lock log are the test's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const GUARD = resolve(import.meta.dirname, "../../harness/guard");
const SOL_DEV = "https://github.com/sol-mif/sol-dev.git";
const BASE = realpathSync(mkdtempSync(join(tmpdir(), "harness-locks-")));
const STATE = join(BASE, "state");
const LOG = join(STATE, "locks.jsonl");
mkdirSync(join(BASE, "bin"), { recursive: true }); mkdirSync(STATE, { recursive: true }); mkdirSync(join(BASE, "tmp"));
writeFileSync(join(BASE, "bin", "gh"), "#!/bin/sh\necho '[]'\n"); chmodSync(join(BASE, "bin", "gh"), 0o755);
const ENV: Record<string, string> = {
  PATH: `${join(BASE, "bin")}:${process.env.PATH}`, HOME: process.env.HOME ?? BASE, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_STATE: join(STATE, "work.json"), SOL_LOCKS_LOG: LOG,
  // the guard's temp files (the marks it keeps across a shell line, keyed by the call's id) in a folder of the test's own:
  // in the shared /tmp, a second run of this file at once (another check runner) took this one's under the same id (#986)
  TMPDIR: join(BASE, "tmp"),
};
const put = (dir: string, path: string, body: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), body); };
const git = (dir: string, ...a: string[]) => execFileSync("git", a, { cwd: dir, env: { ...process.env, ...ENV }, encoding: "utf8" }).trim();

const APPROVED = "Status: Approved by marcocyl04-ux on 2026-10-30";
const EVAL_OK = `# fr-01 evals\n\n${APPROVED}\n\n## Ways to use it\n- open Sol · check: e2e open\n\n## Releases\n- dev-20261029: 4/4 pass\n`;
const EVAL_DRAFT = "# fr-02 evals\n\nStatus: Draft\n\n## Ways to use it\n- chat · check: e2e chat\n\n## Releases\n";
const TESTS = `import { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("one", () => { assert.equal(1, 1); });\ntest("two", () => { assert.ok(true); });\n`;

let n = 0;
/** a checkout: main with the team's pages, two features (fr-01 approved, fr-02 not), a test file; then a work branch */
function checkout(o: { origin?: string | null; branch?: string } = {}): string {
  const dir = join(BASE, `c${++n}`);
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  if (o.origin !== null) git(dir, "remote", "add", "origin", o.origin ?? SOL_DEV);
  git(dir, "config", "sol.login", "marcocyl04-ux");
  put(dir, "docs/people/marco.md", "login: marcocyl04-ux\n");
  put(dir, "docs/people/frank.md", "login: franktsai2008-eng\n");
  put(dir, "specs/features.json", JSON.stringify({ features: [
    { id: "fr-01", slug: "open-sol", name: "Open Sol", paths: ["sol/engine/src/open/**"] },
    { id: "fr-02", slug: "chat", name: "Chat", paths: ["sol/mac/src/chat/**"] }] }));
  put(dir, "specs/features/fr-01-open-sol/prd.md", "# Open Sol\n\nStatus: Scoped by marcocyl04-ux on 2026-10-29\n");
  put(dir, "specs/features/fr-01-open-sol/eval.md", EVAL_OK);
  put(dir, "specs/features/fr-02-chat/prd.md", "# Chat\n\n## Open questions\nNone.\n");
  put(dir, "specs/features/fr-02-chat/eval.md", EVAL_DRAFT);
  put(dir, "sol/engine/src/open/a.ts", "export const a = 1;\n");
  put(dir, "sol/mac/src/chat/b.ts", "export const b = 1;\n");
  put(dir, "sol/engine/test/a.test.ts", TESTS);
  put(dir, "sol/engine/src/inventory.ts", 'const FENCE = ["Site.tsx"];\n');
  put(dir, "sol/mac/src/Site.tsx", "export {};\n");
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "the house");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");   // what GitHub has, as a fetch would leave it
  if (o.branch !== "main") { git(dir, "checkout", "-q", "-b", o.branch ?? "marco/base-locks-484"); put(dir, "x.txt", "x\n"); git(dir, "add", "-A"); git(dir, "commit", "-qm", "work"); }
  return dir;
}

type Opts = { role?: string; agent?: string; env?: Record<string, string>; id?: string; raw?: string; mode?: string };
/** the guard on one call: the rule it refused by ("" for none), and what it said */
// the guard keeps a shell line's marks in the system's tmp by the line's id, so the ids are this run's own: another run of
// the suite on the machine at the same time (#921's runners) has the same names and took the snapshot out (#938)
const RUN = `${process.pid}-${Date.now()}`;
function call(dir: string, tool: string, input: object, o: Opts = {}) {
  const env = { ...ENV, ...(o.role ? { SOL_ROLE: o.role } : {}), ...(o.env ?? {}) };
  const r = spawnSync(process.execPath, [GUARD, ...(o.mode ? [o.mode] : [])], { cwd: dir, env, encoding: "utf8",
    input: o.raw ?? JSON.stringify({ tool_name: tool, tool_input: input, cwd: dir, session_id: "s1", tool_use_id: `${RUN}-${o.id ?? `u${++n}`}`, ...(o.agent ? { agent_type: o.agent } : {}) }) });
  assert.equal(r.status, 0, `the guard exits 0: ${r.stderr}`);
  const rule = r.stdout.includes('"deny"') ? (/harness \(([a-z-]+)\)/.exec(r.stdout)?.[1] ?? "?") : "";
  return { rule, out: r.stdout, err: r.stderr };
}
const bash = (dir: string, command: string, o: Opts = {}) => call(dir, "Bash", { command }, o).rule;
const edit = (dir: string, file: string, from: string, to: string, o: Opts = {}) => call(dir, "Edit", { file_path: join(dir, file), old_string: from, new_string: to }, o).rule;
const write = (dir: string, file: string, content: string, o: Opts = {}) => call(dir, "Write", { file_path: file.startsWith("/") ? file : join(dir, file), content }, o).rule;
const caseInsensitive = (() => { const d = mkdtempSync(join(tmpdir(), "ci-")); writeFileSync(join(d, "a"), ""); const ci = existsSync(join(d, "A")); rmSync(d, { recursive: true }); return ci; })();

// ---- the new locks (decision 14)

test("evals first: a builder's code edit waits for its feature's approved evals; the folder, sketch and approved code go through", () => {
  const d = checkout();
  assert.equal(edit(d, "sol/mac/src/chat/b.ts", "1", "2", { role: "builder" }), "evals-first", "fr-02 has no approved evals");
  assert.equal(bash(d, "echo 'export const b = 2;' > sol/mac/src/chat/b.ts", { role: "builder" }), "evals-first", "by a shell too");
  assert.equal(bash(d, "cd sol/mac/src/chat && echo x > b.ts", { role: "builder" }), "evals-first", "judged where the write runs, after the cd");
  assert.equal(edit(d, "sol/engine/src/open/a.ts", "1", "2", { role: "builder" }), "", "fr-01's evals are approved");
  assert.equal(write(d, "specs/features/fr-02-chat/sketch/idea.md", "thinking", { role: "builder" }), "", "sketch is free");
  assert.equal(edit(d, "sol/mac/src/chat/b.ts", "1", "2"), "", "a Sol developer's own window has no role: not this lock");
  assert.equal(write(d, "specs/features.json", "{}", { role: "builder" }), "evals-first", "the map is never moved by a session with a role");
  assert.equal(bash(d, "cat sol/mac/src/chat/b.ts", { role: "builder" }), "", "a read is not an edit");
});

test("eval sealed: only the press writes Approved or Scoped, by edit, shell, script, copy, case or hard link; reads and taking a mark out go through", () => {
  const d = checkout();
  const ev = "specs/features/fr-02-chat/eval.md", prd = "specs/features/fr-02-chat/prd.md", evAbs = join(d, ev);
  // the Edit and Write tools, judged on the file they leave
  assert.equal(edit(d, ev, "Status: Draft", APPROVED), "eval-sealed", "no session writes Approved, role or none");
  assert.equal(edit(d, prd, "# Chat\n", "# Chat\nStatus: Scoped by marcocyl04-ux on 2026-10-30\n"), "eval-sealed");
  assert.equal(edit(d, "specs/features/fr-01-open-sol/eval.md", `${APPROVED}\n`, ""), "", "taking a mark out goes through");
  assert.equal(edit(d, ev, "- chat · check: e2e chat", "- chat · check: e2e chat\n- send · check: e2e send"), "", "no role: other lines go through");
  assert.equal(edit(d, ev, "- chat · check: e2e chat", "- chat"), "", "...");
  assert.equal(edit(d, ev, "- chat", "- chat!", { role: "builder" }), "eval-sealed", "the builder never edits eval.md");
  assert.equal(edit(d, "specs/features/fr-01-open-sol/eval.md", "## Releases\n- dev-20261029: 4/4 pass\n", "## Releases\n- dev-20261029: 4/4 pass\n- dev-20261030: 4/4 pass\n", { role: "verifier" }), "", "the verifier adds its Releases line");
  assert.equal(edit(d, "specs/features/fr-01-open-sol/eval.md", "- open Sol", "- open Sol fast", { role: "verifier" }), "eval-sealed", "and nothing above it");
  assert.equal(bash(d, "echo '- dev-20261030: 4/4 pass' >> specs/features/fr-01-open-sol/eval.md", { role: "verifier" }), "", "its plain >> onto Releases");
  assert.equal(bash(d, 'echo "- $R" >> specs/features/fr-01-open-sol/eval.md', { role: "verifier" }), "eval-sealed", "a line it cannot read is not plain");
  // a shell write, in every form a redirect takes, by any session: the guard cannot see what it leaves
  for (const op of [">>", "1>", "&>", ">|", ">&", ">"])
    assert.equal(bash(d, `echo "${APPROVED}" ${op} ${ev}`), "eval-sealed", `echo ${op}`);
  assert.equal(bash(d, `echo "${APPROVED}">>${ev}`), "eval-sealed", "a redirect glued to its words");
  assert.equal(bash(d, `echo "- send · check: e2e send">>${ev}`), "", "a plain line with no mark, judged by the lines it leaves (#482)");
  // a write is plain only when the guard can be sure what it writes: escapes, echo -e and printf's other % are not
  for (const c of [`echo -e 'Status: \\x41pproved by m on 2026-10-30' >> ${ev}`, `echo 'Status: \\x41pproved' >> ${ev}`,
    `printf '%b\\n' 'Status: \\101pproved by m on 2026-10-30' >> ${ev}`, `printf 'Status: %cpproved by m on 2026-10-30' A >> ${ev}`, `echo -E x >> ${ev}`])
    assert.equal(bash(d, c), "eval-sealed", c);
  assert.equal(bash(d, `printf '%s\n' '- send · check: e2e send' >> ${ev}`), "", "printf with %s only is plain");
  assert.equal(bash(d, `echo -n '- send' >> ${ev}`), "", "echo -n is plain");
  assert.equal(bash(d, `echo U3RhdHVzOiBBcHByb3ZlZA== | base64 -d >> ${ev}`), "eval-sealed", "base64: the words hide, the write does not");
  assert.equal(bash(d, `A=Appro; echo "Status: \${A}ved" >> ${ev}`), "eval-sealed", "a variable");
  assert.equal(bash(d, `tee -a ${ev} <<'EOF'\n${APPROVED}\nEOF`), "eval-sealed", "a heredoc fed to a writing command");
  assert.equal(bash(d, `git commit -m "$(echo '${APPROVED}' >> ${ev})"`), "eval-sealed", "$( ) inside a commit message runs");
  assert.equal(bash(d, `git commit -m "\`printf '${APPROVED}' >> ${ev}\`"`), "eval-sealed", "and a backtick");
  assert.equal(bash(d, `sed -i '' 's/Status: Draft/${APPROVED}/' ${ev}`), "eval-sealed");
  assert.equal(bash(d, `sed -i '' 's/Draft/Approved/' ${ev}`), "eval-sealed", "a replacement that finishes a mark the line half holds");
  assert.equal(bash(d, "cd specs/features/fr-02-chat && perl -pi -e 's/Draft/Approved/' *.md"), "eval-sealed", "in the folder it works in");
  assert.equal(bash(d, `sed -i '' 's/^Status: Approved.*/Status: draft/' specs/features/fr-01-open-sol/eval.md`), "", "taking a mark out by a substitution it can read (#482)");
  assert.equal(bash(d, `cp specs/features/fr-01-open-sol/eval.md ${ev}`), "eval-sealed", "an approved eval.md copied over another");
  mkdirSync(join(BASE, "fake/fr-02-chat"), { recursive: true }); writeFileSync(join(BASE, "fake/fr-02-chat/eval.md"), EVAL_OK);
  assert.equal(bash(d, `cp -R ${join(BASE, "fake/fr-02-chat")} specs/features/`), "eval-sealed", "a folder copied over the features");
  // a script the line runs, or one a session writes
  put(BASE, "s1.sh", `echo '${APPROVED}' >> ${evAbs}\n`);
  assert.equal(bash(d, `bash ${join(BASE, "s1.sh")}`), "eval-sealed", "a script that writes the mark");
  assert.equal(write(d, join(BASE, "s2.sh"), `echo '${APPROVED}' >> specs/features/fr-02-chat/eval.md`), "eval-sealed", "writing such a script");
  assert.equal(write(d, "specs/features/fr-02-chat/sketch/go.mjs", `writeFileSync("specs/features/fr-02-chat/eval.md", "${APPROVED}")`), "eval-sealed", "a script in a feature folder is never Sol's own source");
  assert.equal(write(d, "specs/features/fr-02-chat/notes.md", `then the press writes "${APPROVED}" into eval.md`), "", "prose that says it (#482's go-through list)");
  assert.equal(write(d, "specs/features/fr-02-chat/sketch/notes.md", "send team.tonight.press"), "tonight", "no .md exemption inside specs/features");
  assert.equal(write(d, "sol/engine/src/team/x.ts", `const line = "${APPROVED}"; // eval.md`), "", "Sol's own source may name the mark");
  // a hard link of eval.md elsewhere is eval.md
  const link = join(BASE, `link${n}.md`); linkSync(evAbs, link);
  assert.equal(write(d, link, EVAL_DRAFT + APPROVED + "\n"), "eval-sealed", "the Write tool on a hard link");
  assert.equal(bash(d, `echo "${APPROVED}" >> ${link}`), "eval-sealed", "a shell write to a hard link");
  assert.equal(bash(d, `echo U3Rh | base64 -d >> ${link}`), "eval-sealed", "one it cannot read");
  if (caseInsensitive) {
    assert.equal(write(d, "Specs/Features/fr-02-chat/EVAL.md", EVAL_DRAFT.replace("Status: Draft", APPROVED)), "eval-sealed", "the disk's own case");
    assert.equal(bash(d, `echo "${APPROVED}" >> SPECS/features/FR-02-chat/Eval.md`), "eval-sealed");
    assert.equal(bash(d, `sed -i "" "s/Draft/Approved/" SPECS/features/FR-02-chat/Eval.md`), "eval-sealed", "a write it cannot read, in another case");
  }
  // reads, searches and messages say what they like
  assert.equal(bash(d, `grep -rn "Status: Approved" specs/features/*/eval.md`), "");
  assert.equal(bash(d, `git commit -m "eval sealed: ${APPROVED} in eval.md is the press's"`), "", "a commit message is words");
  assert.equal(bash(d, `git log --grep "Status: Approved" -- specs/features`), "");
});

test("eval sealed, by its effect: a mark a shell line left that git does not account for is taken out after it", () => {
  const d = checkout(), ev = join(d, "specs/features/fr-02-chat/eval.md");
  // a line the words cannot tell: the guard keeps the marks before it, and checks them after
  const id = "after-1";
  assert.equal(bash(d, "python3 -c 'import os' # hides nothing to read", { id }), "");
  writeFileSync(ev, EVAL_DRAFT + APPROVED + "\n");   // what the line did, by a road nobody reads
  const after = call(d, "Bash", { command: "x" }, { id, mode: "--after" });
  assert.match(after.out, /"decision":"block"/);
  assert.match(after.out, /eval-sealed/);
  assert.doesNotMatch(readFileSync(ev, "utf8"), /Status: Approved/, "the mark is out again");
  assert.match(readFileSync(ev, "utf8"), /## Ways to use it/, "the rest of the file stays");
  // no snapshot (removed, or never kept): fail closed, judged against HEAD
  writeFileSync(ev, EVAL_DRAFT + APPROVED + "\n");
  const lost = call(d, "Bash", { command: "x" }, { id: "never-kept", mode: "--after" });
  assert.match(lost.out, /"decision":"block"/);
  assert.doesNotMatch(readFileSync(ev, "utf8"), /Status: Approved/);
  // a branch switched to, whose commit holds a press made by its Sol developer and pushed (a remote-tracking ref): it stays
  git(d, "checkout", "-q", "-b", "marco/base-pressed-485");
  writeFileSync(ev, EVAL_DRAFT.replace("Status: Draft", APPROVED)); git(d, "commit", "-qam", "pressed");
  git(d, "update-ref", "refs/remotes/origin/marco/base-pressed-485", "HEAD");
  git(d, "checkout", "-q", "marco/base-locks-484");
  assert.equal(bash(d, "git status", { id: "switch" }), "");
  git(d, "checkout", "-q", "marco/base-pressed-485");
  assert.equal(call(d, "Bash", { command: "x" }, { id: "switch", mode: "--after" }).out, "");
  assert.match(readFileSync(ev, "utf8"), /Status: Approved/, "a press git brought stays");
  // a commit the line made itself accounts for nothing: the mark it brought is taken out of the files
  git(d, "checkout", "-q", "marco/base-locks-484");
  const slipped = "Status: Approved by marcocyl04-ux on 2026-11-03";   // a line on no ref from before the line
  assert.equal(bash(d, "true", { id: "commit-in-line" }), "");
  writeFileSync(ev, EVAL_DRAFT + slipped + "\n"); git(d, "commit", "-qam", "slipped in");
  assert.match(call(d, "Bash", { command: "x" }, { id: "commit-in-line", mode: "--after" }).out, /"decision":"block"/);
  assert.doesNotMatch(readFileSync(ev, "utf8"), /Status: Approved/);
  git(d, "checkout", "-q", "--", "."); git(d, "reset", "-q", "--hard", "HEAD~1");
  // a press made in Sol's window while the line ran is on the press's record: it stays
  assert.equal(bash(d, "true", { id: "pressed" }), "");
  writeFileSync(ev, EVAL_DRAFT + APPROVED + "\n");
  mkdirSync(join(STATE, "checkpoint"), { recursive: true });
  writeFileSync(join(STATE, "checkpoint", "pressed.jsonl"), JSON.stringify({ file: "specs/features/fr-02-chat/eval.md", line: APPROVED, by: "marcocyl04-ux" }) + "\n");
  assert.equal(call(d, "Bash", { command: "x" }, { id: "pressed", mode: "--after" }).out, "");
  assert.match(readFileSync(ev, "utf8"), /Status: Approved/, "the press's line stays");
  rmSync(join(STATE, "checkpoint"), { recursive: true });
  writeFileSync(ev, EVAL_DRAFT);
  // a plain line with no mark: nothing said
  assert.equal(bash(d, "ls", { id: "plain" }), "");
  assert.equal(call(d, "Bash", { command: "ls" }, { id: "plain", mode: "--after" }).out, "");
});

test("no weakening: a session with a role never removes a test, adds a skip or an only, drops an assertion, or rewrites a test unread", () => {
  const d = checkout(), t = "sol/engine/test/a.test.ts";
  assert.equal(edit(d, t, `test("two", () => { assert.ok(true); });\n`, "", { role: "builder" }), "no-weakening", "a test removed");
  assert.equal(edit(d, t, `test("one"`, `test.${"skip"}("one"`, { role: "builder" }), "no-weakening", ".skip");
  assert.equal(edit(d, t, `test("one"`, `test.${"only"}("one"`, { role: "reviewer" }), "no-weakening", ".only");
  assert.equal(edit(d, t, "assert.equal(1, 1); ", "", { role: "builder" }), "no-weakening", "an assertion dropped");
  assert.equal(edit(d, t, `test("two"`, `test("three", () => { assert.ok(1); });\ntest("two"`, { role: "builder" }), "", "a test added");
  assert.equal(bash(d, `rm ${t}`, { role: "builder" }), "no-weakening", "a test file deleted");
  assert.equal(bash(d, `git mv ${t} sol/engine/test/a.ts`, { role: "builder" }), "no-weakening", "renamed out of the tests");
  assert.equal(bash(d, `sed -i '' '/assert/d' ${t}`, { role: "builder" }), "no-weakening", "a shell rewrite it cannot read");
  assert.equal(bash(d, `node -e "require('fs').writeFileSync('${t}', '')"`, { role: "builder" }), "no-weakening", "a program's inline code");
  assert.equal(edit(d, t, `test("two", () => { assert.ok(true); });\n`, ""), "", "no role: a Sol developer's own call");
  assert.equal(bash(d, "cd sol/engine && node --test test/a.test.ts", { role: "builder" }), "", "running the tests is not changing them");
});

test("done = green: marking done or handing in waits for a green gate on the current commit, and the gate's result is its own", () => {
  const d = checkout(), head = git(d, "rev-parse", "HEAD");
  const done = (o: Opts = {}) => call(d, "mcp__sol__mark_done", { done: true }, o).rule;
  assert.equal(done({ role: "builder" }), "done-green", "no gate run");
  put(d, `.sol-gate/${head}.json`, JSON.stringify({ sha: head, green: false }));
  git(d, "update-index", "--add", "--cacheinfo", `100644,${git(d, "hash-object", "-w", join(d, ".sol-gate", `${head}.json`))},.sol-gate/${head}.json`); git(d, "reset", "-q");
  writeFileSync(join(d, ".git/info/exclude"), ".sol-gate/\n");
  assert.equal(done({ role: "builder" }), "done-green", "a red gate");
  writeFileSync(join(d, ".sol-gate", `${head}.json`), JSON.stringify({ sha: head, green: true }));
  assert.equal(done({ role: "builder" }), "", "green on this commit");
  assert.equal(call(d, "mcp__sol__hand_in", { number: 3, ready: true }, { role: "triage" }).rule, "", "handing in, green");
  put(d, "y.txt", "y\n");
  assert.equal(done({ role: "builder" }), "done-green", "changes not committed: the result is not this commit's");
  assert.equal(done(), "", "no role: not this lock");
  assert.equal(call(d, "mcp__sol__mark_done", { done: false }, { role: "builder" }).rule, "", "un-marking is never gated");
  assert.equal(write(d, `.sol-gate/${head}.json`, '{"green":true}', { role: "builder" }), "done-green", "the gate's result is never written by hand");
  assert.equal(bash(d, `echo '{"green":true}' > .sol-gate/${head}.json`, { role: "builder" }), "done-green");
});

test("first-timer sealed: it reads no code, and its only shell is the test browser", () => {
  const d = checkout(), empty = mkdtempSync(join(BASE, "ft-"));
  const browse = `bash ${d}/sol/first-timer browse`;
  assert.equal(call(d, "Read", { file_path: join(d, "sol/engine/src/open/a.ts") }, { role: "first-timer" }).rule, "first-timer");
  assert.equal(call(empty, "Grep", { pattern: "x", path: d }, { role: "first-timer" }).rule, "first-timer", "a search of the code from elsewhere");
  assert.equal(call(empty, "Read", { file_path: join(empty, "notes.txt") }, { role: "first-timer" }).rule, "", "its own empty folder");
  assert.equal(bash(empty, `${browse} look`, { role: "first-timer" }), "");
  assert.equal(bash(empty, `${browse} click 'Start'`, { role: "first-timer" }), "");
  assert.equal(bash(empty, "ls", { role: "first-timer" }), "first-timer");
  assert.equal(bash(empty, `${browse} look; cat ${d}/sol/engine/src/open/a.ts`, { role: "first-timer" }), "first-timer", "a second command");
  assert.equal(bash(empty, `${browse} type "$(cat ${d}/sol/engine/src/open/a.ts)"`, { role: "first-timer" }), "first-timer", "one hidden inside");
  assert.equal(bash(empty, `${browse} look > ${d}/x`, { role: "first-timer" }), "first-timer", "a write");
  assert.equal(call(d, "Read", { file_path: join(d, "README.md") }, { agent: "sol-first-timer" }).rule, "first-timer", "by its agent file alone");
  assert.equal(call(d, "Read", { file_path: join(d, "README.md") }, { role: "builder", agent: "sol-first-timer" }).rule, "first-timer", "stricter wins");
});

test("roles: the stricter of SOL_ROLE and a subagent's file holds, and a role nobody knows is a builder", () => {
  const d = checkout(), ev = "specs/features/fr-02-chat/eval.md";
  assert.equal(edit(d, ev, "- chat", "- chats", { role: "builder", agent: "sol-reviewer" }), "eval-sealed", "a builder never sheds its locks by starting a reviewer");
  assert.equal(edit(d, ev, "- chat", "- chats", { role: "triage", agent: "sol-builder" }), "eval-sealed", "a builder subagent of triage is a builder");
  assert.equal(edit(d, ev, "- chat", "- chats", { role: "triage" }), "", "triage may edit the evals' other lines");
  assert.equal(edit(d, ev, "- chat", "- chats", { role: "admin" }), "eval-sealed", "an unknown role is a builder");
  assert.equal(edit(d, ev, "- chat", "- chats", { agent: "sol-somebody" }), "eval-sealed", "and so is an unknown sol- agent");
});

test("checkpoint (#482's id and words): no session sends the Scoped or Approve press; Sol's own source, reads and tests go through", () => {
  const d = checkout();
  assert.equal(bash(d, `node -e "ws.send(JSON.stringify({ type: 'team.checkpoint.press', id: 'x' }))"`), "checkpoint");
  assert.equal(bash(d, `websocat ws://127.0.0.1:7777 <<'EOF'\n{"type":"team.checkpoint.key"}\nEOF`), "checkpoint", "a heredoc to a sender");
  assert.equal(write(d, join(BASE, "press.mjs"), "send({ type: 'team.checkpoint.press' })"), "", "writing a script that names it is free (#482: sending it is a deliberate act)");
  put(BASE, "press2.mjs", "send({ type: 'team' + '.checkpoint.press' })");
  assert.equal(bash(d, `node ${join(BASE, "press2.mjs")}`), "checkpoint", "a script it runs, the name split");
  assert.equal(write(d, "sol/engine/src/team/checkpoint.ts", "case 'team.checkpoint.press':"), "", "Sol's own source");
  assert.equal(bash(d, "grep -rn team.checkpoint sol/engine/src"), "");
  assert.equal(bash(d, "npm test -- --grep team.checkpoint.press"), "", "a test run that names it");
});

// ---- the audit's Fix list: judged on the action and where it runs

test("merge: a merge into main, by any road, is refused; catching my own branch up and saying the word go through", () => {
  const d = checkout({ branch: "main" }), w = checkout();
  for (const c of ["git merge feature", "bash -c 'git merge feature'", "sh -lc \"cd . && git merge feature\"", "eval git merge feature",
    "echo feature | xargs git merge", "git pull origin feature", "git -c alias.m=merge m feature", "git config alias.mm 'merge feature'",
    "gh pr merge 3 --admin", "gh api -X PUT repos/o/r/pulls/3/merge", "gh api repos/o/r/merges -f base=main -f head=x",
    "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'", "git commit -m \"$(git merge feature)\""])
    assert.equal(bash(d, c), c.startsWith("git commit") ? "main-commit" : "merge", c);
  assert.equal(bash(w, `git -C ${d} merge feature`), "merge", "from a side copy, judged where it runs (git -C)");
  assert.equal(bash(w, `cd ${d} && git merge feature`), "merge", "after a cd");
  assert.equal(bash(w, "git merge origin/main"), "", "catching my branch up");
  assert.equal(bash(d, "git merge origin/main"), "", "main caught up with its own remote");
  assert.equal(bash(d, "git pull"), "");
  assert.equal(bash(w, 'git commit -m "never git merge main by hand"'), "", "a commit message names it");
  assert.equal(bash(d, "git log --grep merge && echo 'git merge' | grep merge"), "", "a search names it");
});

test("stable move: stable and live move by a person's hand, by any road; reading them and the beta export go through", () => {
  const w = checkout(), s = checkout({ branch: "main" });
  git(s, "branch", "stable");
  for (const c of ["git push origin HEAD:stable", "git push origin +x:refs/heads/live", "git push origin --delete stable", "git push --all origin", "git push --tags origin", "git push --follow-tags origin HEAD", "git push --prune origin",
    "git push --mirror origin", "git branch -f stable HEAD", "git update-ref refs/heads/stable HEAD", "git tag -f stable",
    "gh api -X PATCH repos/o/r/git/refs/heads/stable -f sha=x", "gh api repos/o/r/git/refs -f ref=refs/heads/live -f sha=x",
    "timeout 30 git push origin HEAD:stable", "sudo -u marco git push origin HEAD:stable"])
    assert.equal(bash(w, c), "stable-move", c);
  git(s, "checkout", "-q", "stable");
  assert.equal(bash(s, "git reset --hard main"), "stable-move", "a reset on stable");
  assert.equal(bash(w, `git -C ${s} reset --hard main`), "stable-move", "judged where it runs");
  for (const c of ["git log stable..main", "git diff origin/stable", "git fetch origin stable", 'git commit -m "stable moves by hand"', "git push origin HEAD"])
    assert.equal(bash(w, c), "", c);
});

test("someone else's branch: no commit on it and no push onto it; my own and free prefixes go through", () => {
  const f = checkout({ branch: "frank/base-glossary-483" }), m = checkout();
  assert.equal(bash(f, "git commit -m x"), "others-branch");
  assert.equal(bash(f, "git cherry-pick abc"), "others-branch", "a cherry-pick makes a commit too");
  assert.equal(bash(m, "git push origin HEAD:frank/base-glossary-483"), "others-branch", "where the push lands");
  assert.equal(bash(m, `git -C ${f} commit -m x`), "others-branch", "judged in the checkout it runs in");
  assert.equal(bash(m, "git commit -m x"), "");
  assert.equal(bash(m, "git push origin HEAD:claude/try-1"), "", "a prefix that names nobody");
  assert.equal(bash(m, "git log frank/base-glossary-483"), "");
});

test("tonight and the hand-in card: a session never sends their presses, by a line, a script it writes or one it runs", () => {
  const d = checkout();
  for (const c of ["curl -X POST localhost:7777/tonight", "node -e \"ws.send(JSON.stringify({type:'team.tonight.press'}))\"",
    "python3 - <<'EOF'\nsend('team.tonight.key')\nEOF"]) assert.equal(bash(d, c), "tonight", c);
  for (const c of ["node -e \"ws.send(JSON.stringify({type:'team.handin.press', choice:'in'}))\"", "echo '{\"type\":\"team.handin.key\"}' | websocat ws://127.0.0.1:7777"])
    assert.equal(bash(d, c), "hand-in-card", c);
  assert.equal(bash(d, "gh pr ready 3"), "", "marking a PR ready goes through since #1126");
  put(BASE, "night.sh", "node -e \"send('team' + '.tonight.press')\"\n");
  assert.equal(bash(d, `bash ${join(BASE, "night.sh")}`), "tonight", "a script it runs");
  put(BASE, "hand.mjs", "ws.send(JSON.stringify({ type: 'team.handin.press' }))\n");
  assert.equal(bash(d, `node ${join(BASE, "hand.mjs")}`), "hand-in-card", "#476's id");
  assert.equal(write(d, join(BASE, "x.js"), "ws.send('team.handin.press')"), "hand-in-card", "a script it writes");
  assert.equal(bash(d, "printf '%s' \"$(echo aGk= | base64 -d)\" > /tmp/r5-484-n.sh; bash /tmp/r5-484-n.sh"), "unparsed", "written and run in one line, unread");
  for (const c of ["grep -rn 'team.handin.press\\|team.tonight' sol/engine/src", 'git commit -m "the guard refuses team.tonight.press and team.handin.key"', "gh pr view 3"])
    assert.equal(bash(d, c), "", c);
  assert.equal(write(d, "sol/engine/src/team/handin.ts", "case 'team.handin.press':"), "", "Sol's own source");
});

test("sent-back: the label is judged by what the shell will make of it, by any spelling, by gh api too", () => {
  const d = checkout();
  for (const c of ["gh pr edit 1 --add-label sent-back:slight", 'L=slight; gh pr edit 1 --add-label "sent-back:$L"', 'gh pr edit 1 --add-label "sent-""back:severe"',
    "gh pr edit 1 --add-label sent-\\back:slight", `gh pr edit 1 --add-label "$(printf 'sent-%s:slight' back)"`, "gh pr edit 1 --remove-label=sent-back:severe",
    "gh issue edit 1 --add-label bug,sent-back:slight", 'gh api repos/o/r/issues/1/labels -f "labels[]=sent-$K"', "gh api -X DELETE repos/o/r/issues/1/labels/sent-back:slight",
    "gh pr edit 1 --add-label \"$(echo c2VudC1iYWNr | base64 -d):slight\""])
    assert.equal(bash(d, c), "sent-back", c);
  for (const c of ["gh pr edit 1 --add-label bug", "gh pr view 1 --json labels", 'git commit -m "the sent-back:slight label is the reviewer\'s"'])
    assert.equal(bash(d, c), "", c);
});

test("a PR without a note: the body gh will send carries What to try; the words around it do not count", () => {
  const d = checkout();
  put(d, "body.md", "What it does.\n\nWhat to try\n1. open it\n\nFelt or silent: felt\n");
  assert.equal(bash(d, "gh pr create --draft --title x --body y"), "pr-without-note");
  assert.equal(bash(d, "gh pr create --draft --fill"), "pr-without-note", "no body at all");
  assert.equal(bash(d, "echo 'What to try' && gh pr create --draft --title x --body y"), "pr-without-note", "words beside it are not the body");
  assert.equal(bash(d, "gh pr create --draft --title x --body-file body.md"), "");
  assert.equal(bash(d, "gh pr create --draft --title x --body-file - <<'EOF'\nWhat to try\nopen it\nEOF"), "");
  assert.equal(bash(d, "gh pr create --draft --title x --body \"$(cat <<'EOF'\nWhat to try\nopen it\nEOF\n)\""), "");
  assert.equal(bash(d, `gh pr create -R sol-mif/sol-dev --draft --title x --body "What to try: open it"`), "", "gh's -R before the command");
});

test("proof (#1235): a session closes an issue only with its Proof; not planned needs none", () => {
  const d = checkout();
  // gh is the stub: the issue's last comment reads "[]", no Proof in it
  assert.equal(bash(d, "gh issue close 12"), "close-without-proof");
  assert.equal(bash(d, 'gh issue close 12 --comment "done"'), "close-without-proof");
  assert.equal(bash(d, 'gh -R sol-mif/sol-dev issue close 12 -c "Proof: …"'), "close-without-proof", "a placeholder is not a Proof");
  assert.equal(bash(d, 'gh issue close 12 --comment "Proof: the still of the Path, gate run green on abc123"'), "");
  assert.equal(bash(d, 'gh issue close 12 -c "Shipped.\n\n**Proof**: first-timer walked it"'), "");
  assert.equal(bash(d, 'gh issue close 12 -c"Proof: gate run green"'), "", "-c and its value as one word");
  assert.equal(bash(d, 'gh issue close 12 --reason "not planned"'), "");
  assert.equal(bash(d, "gh issue close 12 --duplicate-of 9"), "");
  assert.equal(bash(d, 'git commit -m "gh issue close 12 is refused without Proof"'), "", "words in a message are not the act");
});

test("live at verified (#1235): a builder never sets a registry record to live; another role may", () => {
  const d = checkout();
  const rec = (state: string) => JSON.stringify({ id: "x", name: "X", state }, null, 2) + "\n";
  put(d, "sol/systems/records/x.json", rec("building"));
  assert.equal(edit(d, "sol/systems/records/x.json", '"state": "building"', '"state": "live"', { role: "builder" }), "live-at-verified");
  assert.equal(write(d, "sol/systems/records/y.json", rec("live"), { role: "builder" }), "live-at-verified", "a new record starts building");
  assert.equal(bash(d, "sed -i '' 's/building/live/' sol/systems/records/x.json", { role: "builder" }), "live-at-verified");
  assert.equal(write(d, "sol/systems/records/y.json", rec("building"), { role: "builder" }), "");
  assert.equal(bash(d, "sed -i '' 's/parked/building/' sol/systems/records/x.json", { role: "builder" }), "live-at-verified", "a shell's write it cannot read: Edit or Write");
  assert.equal(edit(d, "sol/systems/records/x.json", '"state": "building"', '"state": "live"', { role: "verifier" }), "");
  assert.equal(edit(d, "sol/systems/records/x.json", '"state": "building"', '"state": "live"'), "", "a Sol developer's own window");
});

test("where a line goes: a checkout or switch earlier in the line moves the branch later commands are judged on", () => {
  const w = checkout();
  git(w, "branch", "frank/base-glossary-483"); git(w, "branch", "stable", "main");
  for (const [c, rule] of [["git checkout main && git merge frank/x", "merge"], ["git switch main && git merge --ff-only x", "merge"],
    ["git checkout stable && git merge main && git push", "merge"], ["git checkout main && git commit -m x", "main-commit"],
    ["git checkout frank/base-glossary-483 && git commit -am x", "others-branch"], ["git switch frank/base-glossary-483; git push", "others-branch"],
    [`git -C ${w} switch main && git -C ${w} merge x`, "merge"], ["gh pr checkout 3 && git commit -m x", "others-branch"], ["git checkout - && git merge x", "others-branch"]] as const)
    assert.equal(bash(w, c), rule, c);
  for (const c of ["git checkout marco/base-locks-484 && git merge main", "git checkout -- x.txt && git commit -m x", "git switch main && git log -3", "git checkout main -- x.txt && git commit -m x"])
    assert.equal(bash(w, c), "", c);
});

test("a push onto main, or onto the beta repo, is refused by any spelling; scripts a line runs are read for their pushes", () => {
  const w = checkout(), m = checkout({ branch: "main" });
  git(w, "remote", "add", "beta", "https://github.com/sol-mif/sol-beta.git");
  for (const [c, rule] of [["git push origin HEAD:main", "main-push"], ["git push origin frank/x:main", "main-push"], ["git push origin HEAD:refs/heads/main", "main-push"],
    ["git push --repo=origin HEAD:main", "main-push"], ["git push --repo origin HEAD:stable", "stable-move"], ["git push -o ci.skip --push-option=x origin HEAD:main", "main-push"],
    ["git push beta main:main", "stable-move"], ["git push beta HEAD:stable", "stable-move"], ["git push https://github.com/sol-mif/sol-beta.git main", "stable-move"]] as const)
    assert.equal(bash(w, c), rule, c);
  assert.equal(bash(m, "git push"), "main-push", "a push from main lands on main");
  assert.equal(bash(w, "git push -u origin HEAD"), "", "my own branch");
  put(w, "sol/promote", "#!/usr/bin/env bash\nset -e\ngit push --force origin \"$(git rev-parse HEAD)\":refs/heads/live\n");
  assert.equal(bash(w, "bash sol/promote"), "stable-move", "a script that force-pushes live");
  put(BASE, "ship.sh", "git fetch -q origin\ngit push origin HEAD:main\n");
  assert.equal(bash(w, `bash ${join(BASE, "ship.sh")}`), "main-push");
  put(BASE, "take.sh", "git switch -c marco/base-x-1\ngit push -u origin HEAD\n");
  assert.equal(bash(w, `bash ${join(BASE, "take.sh")}`), "", "a script's other commands are its own; its push lands on my own branch");
});

test("what a commit takes: the line's own git add, forced or not, and names in any script", () => {
  const d = checkout();
  put(d, ".gitignore", "sol/home/\nsol/engine/.env\n"); git(d, "add", ".gitignore"); git(d, "commit", "-qm", "ignore");
  put(d, "sol/home/memory/note.md", "a fact\n");
  assert.equal(bash(d, "git add -f sol/home/memory/note.md && git commit -m x"), "home-data", "forced past .gitignore");
  assert.equal(bash(d, "git add -f sol/home && git commit -m x"), "home-data", "a folder, forced");
  put(d, "sol/engine/.env", "K=1\n");
  assert.equal(bash(d, "git add -f sol/engine/.env && git commit -m x"), "key");
  rmSync(join(d, "sol/home"), { recursive: true }); rmSync(join(d, "sol/engine/.env"));
  writeFileSync(join(d, ".gitignore"), "");
  put(d, "sol/home/memory/筆記.md", "a fact\n");
  assert.equal(bash(d, "git add -A && git commit -m x"), "home-data", "a non-ASCII name, read as git keeps it");
  assert.equal(bash(d, "git add sol/home/memory && git commit -m x"), "home-data", "by its folder");
  rmSync(join(d, "sol/home"), { recursive: true });
  assert.equal(bash(d, "git add x.txt && git commit -m x"), "");
  const beta = checkout({ origin: "https://github.com/sol-mif/sol-beta.git" });
  put(beta, ".gitignore", "sol/home/\n"); put(beta, "sol/home/memory/me.md", "a fact\n");
  assert.equal(bash(beta, "git add -f sol/home/memory/me.md && git commit -m x"), "home-data", "a safe rule: a Sol tester's checkout too");
});

test("the effect check leaves a teammate's real press that git brings: a merge, a pull, a rebase", () => {
  const d = checkout(), ev = join(d, "specs/features/fr-02-chat/eval.md");
  // a press made and committed on main by its Sol developer
  git(d, "checkout", "-q", "main");
  writeFileSync(ev, EVAL_DRAFT.replace("Status: Draft", APPROVED)); git(d, "commit", "-qam", "approved, by the press");
  git(d, "update-ref", "refs/remotes/origin/main", "main");   // pushed, and fetched here
  git(d, "checkout", "-q", "marco/base-locks-484");
  assert.equal(bash(d, "git merge --no-edit main", { id: "catch-up" }), "");
  git(d, "merge", "-q", "--no-edit", "main");
  assert.equal(call(d, "Bash", { command: "x" }, { id: "catch-up", mode: "--after" }).out, "", "a merge commit that brings main's press");
  assert.match(readFileSync(ev, "utf8"), /Status: Approved/);
  git(d, "reset", "-q", "--hard", "HEAD~1");
  assert.equal(bash(d, "git rebase main", { id: "rebase" }), "");
  git(d, "rebase", "-q", "main");
  assert.equal(call(d, "Bash", { command: "x" }, { id: "rebase", mode: "--after" }).out, "", "a rebase onto it");
  assert.match(readFileSync(ev, "utf8"), /Status: Approved/);
  // a mark the line commits itself, on a branch it makes and merges: on no ref from before the line, so it goes
  const ev1 = join(d, "specs/features/fr-01-open-sol/eval.md");
  const made = "Status: Approved by marcocyl04-ux on 2026-11-02";
  assert.equal(bash(d, "true", { id: "fake-merge" }), "");
  git(d, "checkout", "-q", "-b", "marco/base-fake-1"); writeFileSync(ev1, EVAL_OK.replace(APPROVED, made)); git(d, "add", "-u", "--renormalize"); git(d, "commit", "-qm", "fake");
  git(d, "checkout", "-q", "marco/base-locks-484"); git(d, "merge", "-q", "--no-ff", "--no-edit", "marco/base-fake-1");
  assert.match(call(d, "Bash", { command: "x" }, { id: "fake-merge", mode: "--after" }).out, /"decision":"block"/);
  assert.doesNotMatch(readFileSync(ev1, "utf8"), new RegExp(made));
});

test("a patch that makes a new feature folder with a mark: taken out after the line, refused at the commit", () => {
  const d = checkout();
  const patch = join(BASE, `p${++n}.diff`);
  writeFileSync(patch, `diff --git a/specs/features/fr-09-new/eval.md b/specs/features/fr-09-new/eval.md\nnew file mode 100644\n--- /dev/null\n+++ b/specs/features/fr-09-new/eval.md\n@@ -0,0 +1,2 @@\n+# fr-09\n+${APPROVED}\n`);
  assert.equal(bash(d, `git apply ${patch}`, { id: "patch" }), "");
  git(d, "apply", patch);
  assert.match(call(d, "Bash", { command: "x" }, { id: "patch", mode: "--after" }).out, /"decision":"block"/, "a new tree is checked too");
  rmSync(join(d, "specs/features/fr-09-new"), { recursive: true }); git(d, "apply", patch);   // put it back, as a line the guard never saw would
  assert.equal(bash(d, "git add -A && git commit -qm new"), "eval-sealed", "the commit check reads a new feature folder");
});

test("what goes through that looked like a rule: a test run's name, a PR's body from commits, a template or a file, a stash message, code that only reads", () => {
  const d = checkout();
  assert.equal(bash(d, "npx tsx --test --test-name-pattern mergePullRequest test/x.test.ts"), "");
  git(d, "commit", "-q", "--allow-empty", "-m", "a change\n\nWhat to try: open it\nFelt or silent: felt");
  assert.equal(bash(d, "gh pr create --draft --fill"), "", "--fill: the branch's commits say what to try");
  put(d, ".github/PULL_REQUEST_TEMPLATE.md", "## What to try\n\n## Felt or silent\n");
  assert.equal(bash(d, "gh pr create --draft --title x --template PULL_REQUEST_TEMPLATE.md"), "");
  put(d, "body.md", "What to try\nopen it\n");
  assert.equal(bash(d, "gh pr create --draft --title x --body-file - < body.md"), "", "a body from a file on stdin");
  assert.equal(bash(d, "cat body.md | gh pr create --draft --title x --body-file -"), "", "piped from a plain cat");
  assert.equal(bash(d, "git stash push -m 'sent-back:slight, for later'"), "", "a stash's message is words");
  assert.equal(bash(d, `node -e "console.log(require('fs').readFileSync('.git/config', 'utf8'))"`), "", "code that only reads the config");
  assert.equal(bash(d, `node -e "console.log(require('fs').readFileSync('${LOG}', 'utf8'))"`), "", "or the lock log");
  assert.equal(bash(d, `node -e "require('fs').appendFileSync('.git/config', 'x')"`), "remote", "code that writes it is still refused");
  // the builder is told who writes the evals, not to write them
  const r = call(d, "Edit", { file_path: join(d, "sol/mac/src/chat/b.ts"), old_string: "1", new_string: "2" }, { role: "builder" });
  assert.match(r.out, /The Sol developer writes specs\/features\/fr-02-chat\/eval\.md .* approves it with a press/);
});

test("guard code: a session with a role never writes the guard, its shell reader, its sol-dev check, the locks or their wiring; a Sol developer's own window does", () => {
  const d = checkout();
  put(d, "sol/harness/guard", "// the guard\n"); put(d, "sol/harness/shell.mjs", "export {};\n"); put(d, "sol/locks/team.mjs", "export {};\n");
  put(d, ".claude/settings.json", "{}\n");
  for (const role of ["builder", "verifier", "reviewer", "triage", "hand-in"]) {
    assert.equal(edit(d, "sol/harness/guard", "the guard", "nothing", { role }), "guard-code", `${role}: Edit`);
    assert.equal(write(d, "sol/locks/team.mjs", "export const judge = () => null;", { role }), "guard-code", `${role}: Write`);
  }
  for (const c of ["echo '' > sol/harness/shell.mjs", "rm sol/harness/sol-dev.mjs", "sed -i '' 's/x/y/' sol/locks/team.mjs", "cp /tmp/x .claude/settings.json",
    "echo '{}' > .claude/settings.local.json", "git checkout HEAD~1 -- sol/harness/guard", `node -e "require('fs').writeFileSync('sol/locks/team.mjs', '')"`, "echo x >> SOL/Harness/guard"])
    assert.equal(bash(d, c, { role: "builder" }), "guard-code", c);
  assert.equal(edit(d, "sol/harness/guard", "the guard", "the guard!"), "", "no role: a Sol developer's own window builds the guard");
  assert.equal(bash(d, "cat sol/harness/guard && grep -n judge sol/locks/team.mjs", { role: "builder" }), "", "reading it");
  // a script under sol/harness or sol/locks that a line runs is read for what it does, not taken as Sol's own source
  put(d, "sol/harness/press.sh", "node -e \"send('team' + '.tonight.press')\"\n");
  assert.equal(bash(d, "bash sol/harness/press.sh"), "tonight");
  put(d, "sol/locks/push.sh", "git push origin HEAD:live\n");
  assert.equal(bash(d, "bash sol/locks/push.sh"), "stable-move");
});

test("a mark laundered through a commit: refused at the push and the PR, and not brought back from the index or HEAD", () => {
  const d = checkout(), ev = join(d, "specs/features/fr-02-chat/eval.md");
  git(d, "update-ref", "refs/remotes/origin/main", "main");
  // a patch the guard cannot read writes the mark, and the line commits it
  const patch = join(BASE, `l${++n}.diff`);
  writeFileSync(ev, EVAL_DRAFT.replace("Status: Draft", APPROVED)); writeFileSync(patch, git(d, "diff") + "\n"); git(d, "checkout", "--", "specs/features/fr-02-chat/eval.md");
  assert.equal(bash(d, "true", { id: "launder" }), "");
  git(d, "apply", patch); git(d, "commit", "-qam", "x");
  assert.match(call(d, "Bash", { command: "x" }, { id: "launder", mode: "--after" }).out, /"decision":"block"/, "taken out of the file");
  for (const role of [undefined, "builder", "triage"]) {
    assert.equal(bash(d, "git push -u origin HEAD", { role }), "eval-sealed", `${role ?? "no role"}: the push carries it`);
    assert.equal(bash(d, "gh pr create --draft --title x --body 'What to try: x'", { role }), "eval-sealed", `${role ?? "no role"}: the PR carries it`);
  }
  // brought back from the index or HEAD: a local commit accounts for nothing
  assert.equal(bash(d, "git checkout -- specs/features/fr-02-chat/eval.md", { id: "restore" }), "");
  git(d, "checkout", "--", "specs/features/fr-02-chat/eval.md");
  assert.match(readFileSync(ev, "utf8"), /Status: Approved/);
  assert.match(call(d, "Bash", { command: "x" }, { id: "restore", mode: "--after" }).out, /"decision":"block"/);
  assert.doesNotMatch(readFileSync(ev, "utf8"), /Status: Approved/);
  // once the press's record holds the line, the push goes
  mkdirSync(join(STATE, "checkpoint"), { recursive: true });
  writeFileSync(join(STATE, "checkpoint", "pressed.jsonl"), JSON.stringify({ file: "specs/features/fr-02-chat/eval.md", line: APPROVED, by: "marcocyl04-ux" }) + "\n");
  assert.equal(bash(d, "git push -u origin HEAD"), "");
  rmSync(join(STATE, "checkpoint"), { recursive: true });
  assert.equal(bash(checkout(), "git push -u origin HEAD"), "", "a branch with no mark goes");
});

test("checkout -t: a tracking checkout moves to the branch it makes", () => {
  const w = checkout();
  git(w, "update-ref", "refs/remotes/origin/stable", "main");
  assert.equal(bash(w, "git checkout -t origin/stable && git merge main && git push"), "branch-without-take", "-t makes a branch");
  const s2 = checkout(); git(s2, "branch", "stable", "main"); git(s2, "update-ref", "refs/remotes/origin/stable", "main");
  git(s2, "branch", "-D", "stable");
  const runs = (c: string) => call(s2, "Bash", { command: c }, {}).rule;
  assert.equal(runs("git switch --track origin/stable && git merge main"), "branch-without-take");
  // judged as on stable when the branch is let through
  put(s2, ".claude/harness.local.json", JSON.stringify({ allow: [{ rule: "branch-without-take", until: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) }] }));
  assert.equal(runs("git checkout -t origin/stable && git merge main && git push"), "merge", "the merge runs on stable");
  assert.equal(runs("git checkout --track origin/stable && git push"), "stable-move", "the push moves stable");
});

test("a git add by glob or with combined flags is read for what it takes", () => {
  const d = checkout();
  put(d, ".gitignore", "sol/home/\nsol/engine/.env\n"); git(d, "add", ".gitignore"); git(d, "commit", "-qm", "ignore");
  put(d, "sol/home/memory/a.md", "a fact\n");
  for (const c of ["git add -f sol/home/memory/*.md && git commit -m x", "git add -f 'sol/home/*' && git commit -m x", "git add -fA && git commit -m x", "git add -Af && git commit -m x"])
    assert.equal(bash(d, c), "home-data", c);
  rmSync(join(d, "sol/home"), { recursive: true });
  put(d, "sol/engine/.env", "K=1\n");
  assert.equal(bash(d, "git add -f sol/engine/.e* && git commit -m x"), "key");
  assert.equal(bash(d, "git add sol/engine/*.ts && git commit -m x"), "", "a glob that takes nothing ignored, not forced");
  put(d, "sol/home/memory/b.md", "a fact\n");
  assert.equal(bash(d, "git add -f ':(glob)sol/home/**' && git commit -m x"), "home-data", "pathspec magic, as git reads it");
  assert.equal(bash(d, "cd sol && git add -f home && git commit -m x"), "home-data", "from a folder inside the repo");
  assert.equal(bash(d, "git add ':(nonsense)x' && git commit -m x"), "home-data", "a pathspec git will not take: fail closed");
  rmSync(join(d, "sol/home"), { recursive: true });
});

test("a push or PR is judged on every refspec, fails closed on what it cannot resolve, and takes GitHub's base, never a local one", () => {
  const d = checkout();
  const ev = join(d, "specs/features/fr-02-chat/eval.md");
  git(d, "checkout", "-q", "-b", "marco/base-launder-9");
  writeFileSync(ev, EVAL_DRAFT.replace("Status: Draft", APPROVED)); git(d, "commit", "-qam", "laundered");
  git(d, "checkout", "-q", "marco/base-locks-484");
  assert.equal(bash(d, "git push origin HEAD:marco/base-locks-484 marco/base-launder-9:marco/base-x-1"), "eval-sealed", "the second refspec");
  assert.equal(bash(d, "git push origin 'refs/heads/*:refs/heads/*'"), "eval-sealed", "a glob is not one commit");
  assert.equal(bash(d, "git push origin nosuchbranch:marco/base-x-1"), "eval-sealed", "a source that does not resolve");
  assert.equal(bash(d, "git push origin :marco/base-old-1"), "", "a delete carries nothing");
  git(d, "branch", "origin/main", "marco/base-launder-9");   // a local branch that shadows GitHub's name
  assert.equal(bash(d, "git push origin marco/base-launder-9:marco/base-x-2"), "eval-sealed", "a local origin/main never stands in for GitHub's");
  git(d, "branch", "-D", "origin/main");
  assert.equal(bash(d, "gh pr create --draft --base 'main..x' --head marco/base-launder-9 --title x --body 'What to try: x'"), "eval-sealed", "a base that is not a branch name is not taken");
  assert.equal(bash(d, "gh pr create --draft --base marco/base-launder-9 --head marco/base-launder-9 --title x --body 'What to try: x'"), "eval-sealed", "a --base only on this Mac is not trusted");
  // no origin/main here: every mark the tip holds is checked against the record
  git(d, "update-ref", "-d", "refs/remotes/origin/main");
  assert.equal(bash(d, "git push -u origin HEAD"), "eval-sealed", "fr-01's mark, with no base to compare with");
  mkdirSync(join(STATE, "checkpoint"), { recursive: true });
  writeFileSync(join(STATE, "checkpoint", "pressed.jsonl"), JSON.stringify({ file: "specs/features/fr-01-open-sol/eval.md", line: APPROVED }) + "\n"
    + JSON.stringify({ file: "specs/features/fr-01-open-sol/prd.md", line: "Status: Scoped by marcocyl04-ux on 2026-10-29" }) + "\n");
  assert.equal(bash(d, "git push -u origin HEAD"), "", "on the record");
  rmSync(join(STATE, "checkpoint"), { recursive: true });
});

test("what GitHub has is never forged: refs/remotes is written by a fetch of the team's remote alone, and the effect check reads it from before the line", () => {
  const d = checkout();
  for (const c of ["git update-ref refs/remotes/origin/main HEAD", "git fetch . HEAD:refs/remotes/origin/main", "git push . HEAD:refs/remotes/origin/main",
    "git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/x"])
    assert.equal(bash(d, c), "remote", c);
  assert.equal(bash(d, "git fetch origin"), "", "a real fetch");
  assert.equal(bash(d, "git fetch origin main:refs/remotes/origin/main"), "remote", "an explicit refspec into refs/remotes, from anywhere");
  assert.equal(bash(d, "git update-ref --stdin < /tmp/refs"), "remote", "update-ref --stdin");
  for (const c of ["git fetch origin main:x", "git fetch origin +refs/heads/*:refs/tags/*", "git fetch --refmap= origin", "echo x > .git/refs/heads/main", `cp /tmp/x .git/packed-refs`, "echo 'ref: refs/heads/x' > .git/HEAD", "ln -sf /tmp/x .git/refs/remotes/origin/main"])
    assert.equal(bash(d, c), "remote", c);
  assert.equal(write(d, ".git/refs/remotes/origin/main", "a".repeat(40)), "remote", "Write to a ref");
  assert.equal(bash(d, "git fetch origin main"), "", "a fetch with no destination");
  // a line that fetches holds nothing else
  for (const c of ["git pull && git push -u origin HEAD", "git fetch origin; npm test", "echo $(git fetch origin)", "git fetch origin | cat", "git stash && git pull"])
    assert.equal(bash(d, c), "remote", c);
  for (const c of ["git pull", "git fetch origin && git merge --no-edit origin/main", "git -C . -q pull --rebase origin main", "git fetch origin && git checkout -q main"])
    assert.equal(bash(d, c), "", c);
  // a remote-tracking ref written during the line, by a road the guard does not see, is not trusted
  const ev = join(d, "specs/features/fr-02-chat/eval.md"), forged = "Status: Approved by marcocyl04-ux on 2026-11-05";
  assert.equal(bash(d, "true", { id: "forge" }), "");
  git(d, "checkout", "-q", "-b", "marco/base-forge-1"); writeFileSync(ev, EVAL_DRAFT.replace("Status: Draft", forged)); git(d, "commit", "-qam", "f");
  git(d, "update-ref", "refs/remotes/origin/marco/base-forge-1", "HEAD");
  assert.match(call(d, "Bash", { command: "x" }, { id: "forge", mode: "--after" }).out, /"decision":"block"/);
  assert.doesNotMatch(readFileSync(ev, "utf8"), new RegExp(forged));
});

test("guard code, for a role: the folders that hold it, code that writes what it does not name, and changes the guard cannot list", () => {
  const d = checkout();
  put(d, "sol/harness/guard", "// the guard\n"); put(d, "sol/locks/team.mjs", "export {};\n"); put(d, ".claude/settings.json", "{}\n");
  git(d, "add", "-A"); git(d, "commit", "-qm", "guard"); git(d, "update-ref", "refs/remotes/origin/main", "HEAD");
  const b = (c: string) => bash(d, c, { role: "builder" });
  mkdirSync(join(BASE, "sol-copy/sol"), { recursive: true });
  for (const c of ["rm -rf sol/locks", "mv sol/harness /tmp/h", "rm -rf .claude", `cp -R ${join(BASE, "sol-copy/sol")} .`, "rm -rf sol",
    `node -e "require('fs').writeFileSync('SOL/LOCKS/team.mjs', '')"`, `node -e "require('fs').writeFileSync(process.argv[1], '')" x.txt`,
    "cd sol/locks && node -e \"require('fs').writeFileSync('x.txt', '')\"", "git checkout -- ."])
    assert.equal(b(c), "guard-code", c);
  put(BASE, "w.mjs", "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.argv[2], 'x');\n");
  assert.equal(b(`node ${join(BASE, "w.mjs")} out.txt`), "guard-code", "a script that writes a file it does not name");
  put(BASE, "w2.sh", "echo x > sol/locks/team.mjs\n");
  assert.equal(b(`bash ${join(BASE, "w2.sh")}`), "guard-code", "a script that names the locks");
  // changes the guard cannot list, judged on what they bring in
  git(d, "checkout", "-q", "-b", "marco/base-guardchange-1"); put(d, "sol/locks/team.mjs", "export const off = 1;\n"); git(d, "commit", "-qam", "g");
  const diff = join(BASE, `g${++n}.diff`); writeFileSync(diff, git(d, "show", "--format=", "HEAD") + "\n");
  git(d, "checkout", "-q", "marco/base-locks-484");
  for (const c of ["git merge marco/base-guardchange-1", "git cherry-pick marco/base-guardchange-1", `git apply ${diff}`, `patch -p1 < ${diff}`,
    "git reset --hard marco/base-guardchange-1", "git checkout marco/base-guardchange-1", "git apply", "tar -xf /tmp/a.tar"])
    assert.equal(b(c), "guard-code", c);
  put(d, "sol/locks/team.mjs", "export const x = 2;\n"); git(d, "stash", "-q");
  assert.equal(b("git stash pop"), "guard-code", "a stash that touches the locks");
  git(d, "stash", "drop", "-q");
  // ordinary work goes through
  git(d, "checkout", "-q", "main"); put(d, "notes.txt", "n\n"); git(d, "add", "notes.txt"); git(d, "commit", "-qm", "n"); git(d, "checkout", "-q", "marco/base-locks-484");
  for (const c of ["git merge main", "git rebase main", "tar -xf /tmp/a.tar -C /tmp/x", "cp x.txt sol/engine/", `node -e "require('fs').writeFileSync('out.txt', '')"`, "git stash list"])
    assert.equal(b(c), "", c);
  assert.equal(bash(d, "rm -rf sol/locks"), "", "no role: a Sol developer's own window");
});

test("in the team's repository, missing team locks fail closed", () => {
  const h = checkout();
  cpSync(resolve(GUARD, ".."), join(h, "sol/harness"), { recursive: true });
  const g = (input: object) => spawnSync(process.execPath, [join(h, "sol/harness/guard")], { cwd: h, env: { ...process.env, ...ENV }, encoding: "utf8",
    input: JSON.stringify({ cwd: h, session_id: "s", ...input }) }).stdout;
  assert.match(g({ tool_name: "Bash", tool_input: { command: "ls" } }), /harness \(guard-error\).*team\.mjs is missing/);
  assert.equal(g({ tool_name: "Write", tool_input: { file_path: join(h, "sol/locks/team.mjs"), content: "export {};" } }), "", "putting it back");
});

test("a new branch's start point is read, and an unborn branch carries nothing only when nothing else on the line could give it commits", () => {
  const d = checkout();
  put(d, "sol/locks/team.mjs", "export {};\n"); git(d, "add", "-A"); git(d, "commit", "-qm", "locks");
  git(d, "checkout", "-q", "-b", "marco/base-gc-2"); put(d, "sol/locks/team.mjs", "export const off = 1;\n"); git(d, "commit", "-qam", "off");
  git(d, "checkout", "-q", "marco/base-locks-484");
  // allowed past Take for the test: the start point is what is judged
  put(d, ".claude/harness.local.json", JSON.stringify({ allow: [{ rule: "branch-without-take", until: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) }] }));
  for (const c of ["git checkout -b marco/base-y-1 marco/base-gc-2", "git switch -c marco/base-y-2 marco/base-gc-2", "git checkout -B marco/base-y-3 marco/base-gc-2"])
    assert.equal(bash(d, c, { role: "builder" }), "guard-code", c);
  assert.equal(bash(d, "git checkout -b marco/base-y-4 nosuchref", { role: "builder" }), "guard-code", "a start point it cannot read");
  assert.equal(bash(d, "git checkout --orphan marco/base-y-7 marco/base-gc-2", { role: "builder" }), "guard-code", "--orphan's start point");
  assert.equal(bash(d, "git checkout --orphan marco/base-y-8 nosuchref", { role: "builder" }), "guard-code", "one it cannot read");
  assert.equal(bash(d, "git checkout --orphan marco/base-y-9", { role: "builder" }), "", "HEAD by default: nothing changes");
  assert.equal(bash(d, "git checkout -b marco/base-y-5 HEAD", { role: "builder" }), "", "a start point with the same guard");
  assert.equal(bash(d, "git checkout -b marco/base-y-6 main", { role: "builder" }), "guard-code", "main has no locks file here: moving to it changes them");
  rmSync(join(d, ".claude/harness.local.json"));
  // an unborn branch
  const u = join(BASE, `unborn${++n}`); mkdirSync(u); git(u, "init", "-q", "-b", "marco/base-new-1"); git(u, "remote", "add", "origin", SOL_DEV); git(u, "config", "sol.login", "marcocyl04-ux");
  put(u, "docs/people/marco.md", "login: marcocyl04-ux\n");
  assert.equal(bash(u, "git push -u origin HEAD"), "", "the only git step: nothing to carry");
  assert.equal(bash(u, "git add -A && git commit -qm x && git push -u origin HEAD"), "", "a commit the commit check judged");
  for (const c of ["git pull origin main && git push -u origin HEAD", "git fetch origin && git reset --hard origin/x && git push"])
    assert.equal(bash(u, c), "remote", `${c}: a line that fetches holds nothing else`);
  for (const c of [`git update-ref refs/heads/marco/base-new-1 ${"a".repeat(40)} && git push`,
    "git cherry-pick abc && git push", "bash /tmp/anything.sh && git push"])
    assert.equal(bash(u, c), "eval-sealed", c);
});

test("a teammate's fresh press, fetched in the same line from the team's remote, is kept; a forged origin is not", () => {
  const d = checkout(), ev = join(d, "specs/features/fr-02-chat/eval.md");
  /** what a fetch of the team's remote does: a teammate's press lands on refs/remotes/<remote>/main */
  const arrives = (remote: string, mark = APPROVED) => {
    git(d, "checkout", "-q", "-b", `tmp-${++n}`, `refs/remotes/${remote}/main`);
    writeFileSync(ev, EVAL_DRAFT.replace("Status: Draft", mark)); git(d, "commit", "-qam", "a teammate's press");
    git(d, "update-ref", `refs/remotes/${remote}/main`, "HEAD"); git(d, "checkout", "-q", "marco/base-locks-484");
  };
  for (const [line, then] of [["git pull --no-edit origin main", ["merge", "-q", "--no-edit", "refs/remotes/origin/main"]],
    ["git pull --rebase origin main", ["rebase", "-q", "refs/remotes/origin/main"]],
    ["git fetch origin && git merge --no-edit origin/main", ["merge", "-q", "--no-edit", "refs/remotes/origin/main"]]] as const) {
    git(d, "reset", "-q", "--hard", "HEAD"); git(d, "update-ref", "refs/remotes/origin/main", "main");
    const id = `fresh-${++n}`;
    assert.equal(bash(d, line, { id }), "", line);
    arrives("origin"); git(d, ...then);
    assert.equal(call(d, "Bash", { command: line }, { id, mode: "--after" }).out, "", `${line}: the press stays`);
    assert.match(readFileSync(ev, "utf8"), /Status: Approved/, line);
    git(d, "reset", "-q", "--hard", "main");
  }
  // the team's remote only by its exact GitHub address: a local path, another host or an ssh alias is not trusted
  for (const url of ["/tmp/a-copy-of-sol-dev", "file:///tmp/sol-dev", "https://gitlab.com/sol-mif/sol-dev.git", "gh-alias:sol-mif/sol-dev.git"]) {
    git(d, "remote", "set-url", "origin", url); git(d, "update-ref", "refs/remotes/origin/main", "main");
    const id = `url-${++n}`;
    assert.equal(bash(d, "git pull --no-edit origin main", { id }), "", url);
    arrives("origin", `Status: Approved by someone on 2026-11-0${n % 9 + 1}`); git(d, "merge", "-q", "--no-edit", "refs/remotes/origin/main");
    assert.match(call(d, "Bash", { command: "x" }, { id, mode: "--after" }).out, /"decision":"block"/, url);
    git(d, "reset", "-q", "--hard", "main");
  }
  git(d, "remote", "set-url", "origin", "git@github.com:sol-mif/sol-dev.git");
  // git's own options before fetch or pull: -C and -q only
  assert.equal(bash(d, `git -C ${d} -q fetch origin`), "");
  for (const c of ["git --git-dir=.git fetch origin", "git --no-pager pull origin main", "git --exec-path=/tmp fetch origin"]) assert.equal(bash(d, c), "remote", c);
  // a fork's fetch moves a fork's refs: not the team's, so not trusted
  git(d, "remote", "add", "fork", "https://github.com/someone/elsewhere.git"); git(d, "update-ref", "refs/remotes/fork/main", "main");
  assert.equal(bash(d, "git fetch fork && git merge --no-edit fork/main", { id: "fork" }), "");
  arrives("fork", "Status: Approved by a fork on 2026-12-25"); git(d, "merge", "-q", "--no-edit", "refs/remotes/fork/main");
  assert.match(call(d, "Bash", { command: "x" }, { id: "fork", mode: "--after" }).out, /"decision":"block"/);
  git(d, "reset", "-q", "--hard", "main");
  // the roads to a forged origin/main stay shut
  for (const c of ["git pull origin main:refs/remotes/origin/main", "git pull --refmap= origin main", "git -c remote.origin.url=/tmp/fake fetch origin",
    "git -c url./tmp/fake.insteadOf=https://github.com/ pull origin main", "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.url GIT_CONFIG_VALUE_0=/tmp/f git fetch origin",
    "git --config-env=remote.origin.url=X fetch origin", "export GIT_CONFIG_PARAMETERS=x; git fetch origin", "env GIT_CONFIG_GLOBAL=/tmp/c git pull origin main",
    "git -c http.proxy=x fetch origin", "HOME=/tmp/h git fetch origin", "XDG_CONFIG_HOME=/tmp/x git pull origin main", "GIT_SSH_COMMAND=x git fetch origin",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES=/tmp/o git fetch origin", "export HOME=/tmp/h && git pull origin main", "X=1; git fetch origin"])
    assert.equal(bash(d, c), "remote", c);
  assert.equal(bash(d, "GIT_TERMINAL_PROMPT=0 LANG=C git fetch origin"), "remote", "no assignment at all on a line that fetches");
  // the stash nit: a stash this line makes and pops, on a clean tree, as a builder; an older stash it would pop is read too
  assert.equal(bash(d, "git stash && git stash pop", { role: "builder" }), "");
  put(d, "sol/locks/team.mjs", "export const off = 1;\n"); git(d, "stash", "push", "-q", "-u", "-m", "an older one");
  assert.equal(bash(d, "git stash && git stash pop", { role: "builder" }), "guard-code", "a clean tree pops the older stash, which holds the locks");
  assert.equal(bash(d, "git stash && git stash pop && git stash pop", { role: "builder" }), "guard-code", "every entry the pops reach");
  assert.equal(bash(d, "git stash && git stash pop stash@{1}", { role: "builder" }), "guard-code", "a numbered entry after a stash on the line");
  git(d, "stash", "drop", "-q");
  assert.equal(bash(d, "git stash pop stash@{4}", { role: "builder" }), "guard-code", "a ref it cannot read");
});

// ---- today's Keep locks, and the ones dropped only once GitHub's rules are on (still on: main has no protection today)

test("Keep: home data, keys, a branch without Take and the fence still hold, and their neighbours go through", () => {
  const d = checkout();
  put(d, "sol/home/memory/me.md", "a fact\n");
  assert.equal(bash(d, "git add -A && git commit -m mine"), "home-data");
  rmSync(join(d, "sol/home"), { recursive: true });
  put(d, "sol/engine/.env", "K=1\n");
  assert.equal(bash(d, "git add sol/engine/.env && git commit -m k"), "key");
  rmSync(join(d, "sol/engine/.env"));
  put(d, "k.txt", "sk-ant-" + "a".repeat(30) + "\n"); git(d, "add", "k.txt");
  assert.equal(bash(d, "git commit -m k"), "key", "a key's text");
  git(d, "rm", "-q", "--cached", "k.txt"); rmSync(join(d, "k.txt"));
  assert.equal(bash(d, "git commit -m ok"), "");
  assert.equal(bash(d, "git switch -c marco/idea"), "branch-without-take");
  assert.equal(bash(d, "git worktree add -b marco/idea ../x"), "branch-without-take");
  assert.equal(bash(d, "git switch -c marco/mine"), "", "the */mine exception");
  assert.equal(bash(d, "git branch -a && git switch main"), "", "listing and switching");
  const inside = { CLAUDE_CODE_ENTRYPOINT: "sdk-ts", CLAUDE_CODE_EXECPATH: "/x/sol/engine/node_modules/cli.js" };
  assert.equal(edit(d, "sol/mac/src/Site.tsx", "export", "export ", { env: inside }), "fence");
  assert.equal(edit(d, "sol/mac/src/chat/b.ts", "1", "2", { env: inside }), "", "a face file off the fence");
  assert.equal(edit(d, "sol/mac/src/Site.tsx", "export", "export "), "", "outside a running Sol");
});

test("Drop once GitHub's rules are on: commit on main, main by API and the push half of stable move are all still refused", () => {
  const m = checkout({ branch: "main" }), w = checkout();
  assert.equal(bash(m, "git commit -m x"), "main-commit");
  assert.equal(bash(w, `git -C ${m} commit -m x`), "main-commit", "judged where the commit lands");
  assert.equal(bash(w, "git commit -m 'nothing is committed on main'"), "");
  assert.equal(bash(w, "gh api -X PUT repos/o/r/contents/README.md -f message=x -f content=eA=="), "main-by-api");
  assert.equal(bash(w, "gh api -X PUT repos/o/r/contents/README.md -f message=x -f content=eA== -f branch=marco/x"), "");
  assert.equal(bash(w, "git push origin HEAD:stable"), "stable-move");
});

// ---- where the team's rules hold, and what keeps them on

test("outside sol-dev the team's locks step aside and the safe ones stay; a checkout once seen as sol-dev stays so", () => {
  const beta = checkout({ origin: "https://github.com/sol-mif/sol-beta.git", branch: "main" });
  for (const c of ["git merge feature", "git commit -m x", `echo "${APPROVED}" >> specs/features/fr-02-chat/eval.md`, '"$GIT" merge x', "echo {} > .claude/harness.local.json", "git remote set-url origin x"])
    assert.equal(bash(beta, c), "", `${c}: a Sol tester's own`);
  assert.equal(bash(beta, "open -a Sol"), "window");
  // a sol-dev checkout whose origin is changed by a road the guard did not see keeps the team's rules on
  const d = checkout({ branch: "main" });
  assert.equal(bash(d, "git merge feature"), "merge");
  git(d, "remote", "set-url", "origin", "https://github.com/someone/elsewhere.git");
  assert.equal(bash(d, "git merge feature"), "merge", "remembered as sol-dev");
  // every remote, and a local folder's own remotes
  const local = checkout({ origin: null, branch: "main" }); git(local, "remote", "add", "upstream", SOL_DEV);
  assert.equal(bash(local, "git merge feature"), "merge", "a second remote names sol-dev");
  const clone = join(BASE, `clone${++n}`); git(BASE, "clone", "-q", d, clone);
  git(d, "remote", "set-url", "origin", SOL_DEV);
  const clone2 = join(BASE, `clone${++n}`); git(BASE, "clone", "-q", d, clone2);
  assert.equal(bash(clone2, "git merge feature"), "merge", "a local clone of a sol-dev checkout");
});

test("remote: a session never changes which repository a checkout belongs to; reading it goes through", () => {
  const d = checkout();
  for (const c of ["git remote set-url origin https://x/y.git", "git remote rename origin old", "git remote remove origin", "git remote add origin2 x",
    "git config remote.origin.url x", "git config --unset remote.origin.url", "git config url.https://x/.insteadOf https://github.com/",
    "git config --remove-section remote.origin", "git config include.path /tmp/c", "echo '[remote \"origin\"]' >> .git/config", "rm -rf .git",
    "python3 -c \"open('.git/config','a').write('x')\""])
    assert.equal(bash(d, c), "remote", c);
  assert.equal(call(d, "Edit", { file_path: join(d, ".git/config"), old_string: "sol-dev", new_string: "x" }).rule, "remote");
  for (const c of ["git remote -v", "git remote get-url origin", "git config --get remote.origin.url", "cat .git/config", "git config user.name t"])
    assert.equal(bash(d, c), "", c);
});

test("the guard's own memory and a person's let-through are never written by a session", () => {
  const d = checkout();
  assert.equal(bash(d, `rm -f ${join(STATE, "sol-dev-seen.json")}`), "guard-state");
  assert.equal(write(d, LOG, ""), "guard-state");
  assert.equal(bash(d, "rm -f /tmp/sol-guard-sealed-0123456789ab.json"), "guard-state");
  assert.equal(bash(d, `echo '{"allow":["merge"]}' > .claude/harness.local.json`), "let-through");
  assert.equal(write(d, ".claude/harness.local.json", '{"allow":["merge"]}'), "let-through");
  assert.equal(bash(d, "cat .claude/harness.local.json"), "", "reading it");
});

// ---- let-throughs end, and every refusal and let-through is one line in the log

test("a let-through names its rule and its last day, ends by itself, and is logged with every refusal", () => {
  const d = checkout({ branch: "main" });
  const local = join(d, ".claude/harness.local.json");
  const day = (k: number) => new Date(Date.now() + k * 86_400_000).toISOString().slice(0, 10);
  rmSync(LOG, { force: true });
  put(d, ".claude/harness.local.json", JSON.stringify({ allow: [{ rule: "merge", until: day(3), why: "catching main up by hand" }] }));
  let r = call(d, "Bash", { command: "git merge feature" });
  assert.equal(r.rule, "", "let through");
  assert.match(r.err, new RegExp(`merge let through .* until ${day(3)}`));
  assert.equal(bash(d, "git commit -m x"), "main-commit", "only the rule it names");
  put(d, ".claude/harness.local.json", JSON.stringify({ allow: [{ rule: "merge", until: day(-1) }] }));
  r = call(d, "Bash", { command: "git merge feature" });
  assert.equal(r.rule, "merge", "ended yesterday");
  assert.match(r.out, new RegExp(`ended on ${day(-1)}`));
  put(d, ".claude/harness.local.json", JSON.stringify({ allow: [{ rule: "merge", until: day(300) }] }));
  const old = (Date.now() - 40 * 86_400_000) / 1000; utimesSync(local, old, old);
  assert.equal(bash(d, "git merge feature"), "merge", "never more than 30 days after the file was saved");
  put(d, ".claude/harness.local.json", JSON.stringify({ allow: ["merge"] }));
  r = call(d, "Bash", { command: "git merge feature" });
  assert.equal(r.rule, "");
  assert.match(r.err, /with no "until": it works until \d{4}-\d{2}-\d{2}/, "an old plain entry says how long it has");
  const lines = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => [l.rule, l.outcome]), [["merge", "let-through"], ["main-commit", "refused"], ["merge", "refused"], ["merge", "refused"], ["merge", "let-through"]]);
  assert.deepEqual(Object.keys(lines[0]).sort(), ["at", "outcome", "role", "rule", "tool"], "counts only: no command, no path");
  const before = readFileSync(LOG, "utf8");
  bash(checkout({ origin: "https://github.com/sol-mif/sol-beta.git", branch: "main" }), "open -a Sol");
  assert.equal(readFileSync(LOG, "utf8"), before, "nothing is logged outside sol-dev");
});

// ---- fail closed

test("fail closed: a call it cannot read, a line it cannot parse, or team locks that will not load are refused in sol-dev, never let through", () => {
  const d = checkout({ branch: "main" }), beta = checkout({ origin: "https://github.com/sol-mif/sol-beta.git", branch: "main" });
  assert.equal(call(d, "Bash", {}, { raw: "{not json" }).rule, "guard-error");
  assert.equal(call(beta, "Bash", {}, { raw: "{not json" }).rule, "guard-error", "before it knows the call's checkout, it refuses everywhere: a Sol tester's safe rules would be off with it");
  assert.equal(bash(d, '"$GIT" merge feature'), "unparsed", "a program that is a variable");
  assert.equal(bash(d, "$(which git) merge feature"), "unparsed");
  assert.equal(bash(d, "echo \"x && git merge feature"), "unparsed", "a quote that never closes");
  assert.equal(bash(d, '"$EDITOR" notes.txt'), "", "a variable program that names no judged action");
  // a copy of the harness whose team locks are broken
  const h = checkout();
  cpSync(resolve(GUARD, ".."), join(h, "sol/harness"), { recursive: true });
  put(h, "sol/locks/team.mjs", "export const x = ;\n");
  const g = (input: object) => spawnSync(process.execPath, [join(h, "sol/harness/guard")], { cwd: h, env: { ...process.env, ...ENV }, encoding: "utf8",
    input: JSON.stringify({ cwd: h, session_id: "s", ...input }) }).stdout;
  assert.match(g({ tool_name: "Bash", tool_input: { command: "ls" } }), /harness \(guard-error\).*team\.mjs is there but does not load/);
  assert.equal(g({ tool_name: "Edit", tool_input: { file_path: join(h, "sol/locks/team.mjs"), old_string: "= ;", new_string: "= 1;" } }), "", "the edit that mends it");
  put(h, "sol/locks/team.mjs", "export const x = 1;\n");
  put(h, "sol/harness/shell.mjs", "export const = ;\n");
  assert.match(g({ tool_name: "Bash", tool_input: { command: "ls" } }), /harness \(guard-error\).*shell reader/, "a shell reader that does not load refuses, never lets through");
  // and so it does in a Sol tester's checkout: the safe rules need the shell reader too
  const bh = checkout({ origin: "https://github.com/sol-mif/sol-beta.git", branch: "main" });
  cpSync(join(h, "sol/harness"), join(bh, "sol/harness"), { recursive: true });
  const gb = spawnSync(process.execPath, [join(bh, "sol/harness/guard")], { cwd: bh, env: { ...process.env, ...ENV }, encoding: "utf8",
    input: JSON.stringify({ cwd: bh, session_id: "s", tool_name: "Bash", tool_input: { command: "git add -A && git commit -m x" } }) }).stdout;
  assert.match(gb, /harness \(guard-error\).*shell reader/, "outside sol-dev too");
  put(bh, "sol/harness/shell.mjs", readFileSync(resolve(GUARD, "../shell.mjs"), "utf8"));
  put(bh, "sol/harness/sol-dev.mjs", "export const = ;\n");
  const gs = spawnSync(process.execPath, [join(bh, "sol/harness/guard")], { cwd: bh, env: { ...process.env, ...ENV }, encoding: "utf8",
    input: JSON.stringify({ cwd: bh, session_id: "s", tool_name: "Bash", tool_input: { command: "ls" } }) }).stdout;
  assert.match(gs, /harness \(guard-error\).*which repository/, "a sol-dev.mjs that does not load refuses everywhere too");
  // the hooks: each is the guard and nothing else (#479's leak check), on every call the locks judge
  const settings = JSON.parse(readFileSync(resolve(GUARD, "../../../.claude/settings.json"), "utf8"));
  const all = Object.values(settings.hooks).flat() as { matcher?: string; hooks: { command: string }[] }[];
  for (const m of all) for (const k of m.hooks) assert.match(k.command, /^node "\$CLAUDE_PROJECT_DIR\/sol\/harness\/guard"( --[a-z-]+)*( \|\| exit 2)?$/);
  // a guard that cannot even start blocks the call (exit 2), never a silent go-ahead
  for (const m of [...settings.hooks.PreToolUse, ...settings.hooks.PostToolUse]) assert.match(m.hooks[0].command, / \|\| exit 2$/);
  assert.doesNotMatch(settings.hooks.UserPromptSubmit[0].hooks[0].command, /exit 2/, "the stage line never blocks a person's message");
  const pre = settings.hooks.PreToolUse.map((m: { matcher: string }) => m.matcher.split("|")).flat();
  for (const t of ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "Read", "Grep", "Glob", "LS", "mcp__sol__mark_done", "mcp__sol__hand_in"]) assert.ok(pre.includes(t), t);
});

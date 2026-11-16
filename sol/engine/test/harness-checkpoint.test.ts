// The guard and Scoped and Approve (#482, sol/harness/guard; engine/src/team/checkpoint.ts). Only the Sol developer's
// press writes the two marks; an agent never writes "Approved" (dev cycle decision 4). Two rules:
//   checkpoint   no session sends the press over the engine's socket (team.checkpoint.*) from what a line runs
//   eval-sealed  no session writes "Status: Approved" into a feature's eval.md, or the Scoped mark into its prd.md, by an
//                edit, a shell line or a script; and no commit brings in a mark the press did not write (its record).
//                #484's sol/locks/team.mjs seals the same marks under the same id
// Reading, searching and saying the words (a commit message, a PR body) go through. The checkout is made sol-dev (its
// origin), so the team's rules hold here whichever guard is in (#479 and #484 keep them to sol-dev's own checkouts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const GUARD = resolve(import.meta.dirname, "../../harness/guard");
const { sealedHash } = await import("../src/team/checkpoint.ts");   // the engine's hash; the guard must compute the same
const FOLDER = "specs/features/fr-12-open-sol";
const PRD = `# fr-12 · Open Sol: PRD\n\nStatus: draft\n\n## Open questions\nNone.\n`;
const EVAL = `# fr-12 · Open Sol: evals\n\nStatus: draft\n\n## Ways to use it\n- [E1] it opens · check: \`true\`\n\n## Releases\n`;
const MARK = "Status: Approved by marcocyl04-ux on 2026-10-31";

function checkout() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "checkpoint-guard-")));
  const state = join(dir, ".state", "work.json");   // the engine's state folder, where the press keeps its record
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "marco/fr-12-open-sol-482"); g("config", "sol.login", "marcocyl04-ux");
  g("remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git");
  mkdirSync(join(dir, FOLDER), { recursive: true });
  writeFileSync(join(dir, FOLDER, "prd.md"), PRD);
  writeFileSync(join(dir, FOLDER, "eval.md"), EVAL);
  mkdirSync(join(dir, "docs/people"), { recursive: true }); writeFileSync(join(dir, "docs/people/marco.md"), "login: marcocyl04-ux\n");   // the branch is the person's own
  const call = (tool_name: string, tool_input: object, cwd = dir) =>
    execFileSync("node", [GUARD], { cwd, encoding: "utf8", env: { ...process.env, SOL_ROLE: "", SOL_STATE: state }, input: JSON.stringify({ tool_name, tool_input, cwd }) });
  const refused = (out: string) => out.includes('"deny"') ? (out.match(/harness \(([a-z-]+)\)/)?.[1] ?? "?") : "";
  return { dir, state, g, call: (t: string, i: object, cwd?: string) => refused(call(t, i, cwd)), run: (command: string) => refused(call("Bash", { command })) };
}

test("checkpoint: a session never sends Scoped or Approve over the engine's socket; reading and saying the words go through", () => {
  const { dir, call, run } = checkout();
  assert.equal(run(`node -e 'ws.send(JSON.stringify({type:"team.checkpoint.press",id:"checkpoint:fr-12:scoped:x"}))'`), "checkpoint");
  assert.equal(run(`echo '{"type":"team.checkpoint.key","sessionId":"s"}' | websocat ws://127.0.0.1:7777 -H 'Origin: http://127.0.0.1:7777'`), "checkpoint", "an Origin faked from a shell");
  assert.equal(run(`node -e 'ws.send(JSON.stringify({type:"team."+"checkpoint.press"}))'`), "checkpoint", "split across strings");
  assert.equal(run(`python3 - <<'EOF'\nws.send('{"type": "team.checkpoint.press"}')\nEOF`), "checkpoint", "an interpreter's heredoc");
  // Sol's own source and docs that name it may still be edited, and reading, searching, testing and saying it go through
  assert.equal(call("Edit", { file_path: join(dir, "sol/engine/src/team/wire.ts"), old_string: "x", new_string: `case "team.checkpoint.press":` }), "");
  assert.equal(call("Write", { file_path: join(dir, "sol/PROTOCOL.md"), content: "`team.checkpoint.key` and `team.checkpoint.press`" }), "");
  assert.equal(call("Write", { file_path: join(dir, "config/x.json"), content: `{"team": 1, "checkpoint": 2}` }), "");
  for (const ok of [`cat sol/engine/src/team/checkpoint.ts`, `npx tsx --test test/checkpoint.test.ts`, `grep -rn "team.checkpoint" sol/engine/src`,
    `rg checkpoint.press sol/`, `git log -S team.checkpoint.press`, `git commit -qm "wire: add team.checkpoint.press"`,
    `gh pr comment 487 --body "adds team.checkpoint.key and team.checkpoint.press"`, `grep -rn "team" sol/engine/src | grep "checkpoint"`,
    `npm test -- --grep team.checkpoint.press`, `npx tsx --test --test-name-pattern "team.checkpoint" test/checkpoint.test.ts`]) assert.equal(run(ok), "", ok);
  // a script or a test that names it is written freely (sending it is a deliberate act, not a slip: see the PR's risks)
  assert.equal(call("Write", { file_path: "/tmp/debug.mjs", content: `console.log("team.checkpoint.press", "team.checkpoint.key")` }), "");
  assert.equal(call("Write", { file_path: join(dir, "sol/mac/e2e/checkpoint.spec.ts"), content: `await page.waitForEvent("team.checkpoint.press")` }), "");
});

test("eval-sealed: no edit writes \"Status: Approved\" into a feature's eval.md, or the Scoped mark into its prd.md", () => {
  const { dir, call } = checkout();
  const ev = join(dir, FOLDER, "eval.md"), prd = join(dir, FOLDER, "prd.md");
  assert.equal(call("Edit", { file_path: ev, old_string: "Status: draft", new_string: MARK }), "eval-sealed");
  assert.equal(call("Write", { file_path: ev, content: EVAL.replace("Status: draft", "Status: Approved by me on 2026-10-31") }), "eval-sealed");
  assert.equal(call("MultiEdit", { file_path: ev, edits: [{ old_string: "## Releases\n", new_string: "## Releases\n" }, { old_string: "Status: draft", new_string: "status: approved" }] }), "eval-sealed", "any case");
  assert.equal(call("Edit", { file_path: `${FOLDER}/prd.md`, old_string: "Status: draft", new_string: "Status: Scoped by marcocyl04-ux on 2026-10-31" }), "eval-sealed", "a path from the session's folder");
  assert.equal(call("Edit", { file_path: prd, old_string: "None.\n", new_string: "None.\n\nScoped by me on 2026-10-31\n" }), "eval-sealed", "the mark without Status:");
  assert.equal(call("Write", { file_path: join(dir, "specs/features/fr-13-new/eval.md"), content: EVAL.replace("Status: draft", "Status: Approved by x on 2026-10-31") }), "eval-sealed", "a new feature's file");
  // the path in another letter case (a Mac's disk does not care), a hard link to the file, a session in another checkout
  assert.equal(call("Edit", { file_path: join(dir, "Specs/Features/fr-12-open-sol/EVAL.md"), old_string: "Status: draft", new_string: MARK }), "eval-sealed", "another letter case");
  assert.equal(call("Write", { file_path: join(dir, "SPECS/features/fr-14-new/Eval.MD"), content: `# x\n\n${MARK}\n` }), "eval-sealed", "a new file in another letter case is never Sol's own .md");
  const link = join(realpathSync(mkdtempSync(join(tmpdir(), "checkpoint-link-"))), "x.md");
  linkSync(ev, link);
  assert.equal(call("Edit", { file_path: link, old_string: "Status: draft", new_string: MARK }), "eval-sealed", "a hard link");
  const other = realpathSync(mkdtempSync(join(tmpdir(), "checkpoint-other-")));
  execFileSync("git", ["init", "-q", "-b", "frank/other"], { cwd: other });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/sol-mif/sol-dev.git"], { cwd: other });   // another sol-dev checkout: the team's rules hold there (#479)
  assert.equal(call("Edit", { file_path: ev, old_string: "Status: draft", new_string: MARK }, other), "eval-sealed", "a session in another checkout");
  // everything else in the files goes through: a new eval line, a question answered, prose, a mark taken out or kept
  assert.equal(call("Edit", { file_path: ev, old_string: "## Releases\n", new_string: "- [E2] it closes · check: `true`\n\n## Releases\n" }), "");
  assert.equal(call("Edit", { file_path: prd, old_string: "None.", new_string: "- Does it open on login?" }), "");
  assert.equal(call("Edit", { file_path: prd, old_string: "None.", new_string: "- Scoped on purpose to the Mac app; the phone later." }), "", "prose that starts with Scoped");
  assert.equal(call("Edit", { file_path: prd, old_string: "None.", new_string: "- Scoped by Isaac's ask: the Mac app first." }), "", "Scoped by, with no date");
  assert.equal(call("Edit", { file_path: prd, old_string: "None.", new_string: "Status: Scoped for implementation next week" }), "", "a Status line that is not the mark");
  writeFileSync(ev, EVAL.replace("Status: draft", "Status: Approved by marcocyl04-ux on 2026-10-30"));
  assert.equal(call("Edit", { file_path: ev, old_string: "## Releases\n", new_string: "## Releases\n- dev-20261031 · 1/1 pass · verifier: x\n" }), "", "the Approved line kept as it was");
  assert.equal(call("Edit", { file_path: ev, old_string: "Status: Approved by marcocyl04-ux on 2026-10-30", new_string: "Status: draft" }), "", "taken back to draft");
  assert.equal(call("Edit", { file_path: ev, old_string: "Status: Approved by marcocyl04-ux on 2026-10-30", new_string: MARK }), "eval-sealed", "a new date is a new press");
  // not a feature's file: the templates, the docs, Sol's tests, a mockup, a PR body drafted in /tmp
  assert.equal(call("Write", { file_path: join(dir, "specs/templates/eval.md"), content: `<!-- changed to "Status: Approved by <login> on YYYY-MM-DD" -->` }), "");
  assert.equal(call("Write", { file_path: join(dir, "sol/engine/test/x.test.ts"), content: `writeFileSync("specs/features/fr-12-x/eval.md", "${MARK}")` }), "");
  assert.equal(call("Write", { file_path: join(dir, FOLDER, "mockup.html"), content: `<p>eval.md</p><p>${MARK}</p>` }), "");
  assert.equal(call("Write", { file_path: "/tmp/pr-body.md", content: `eval.md reads ${MARK} after the press` }), "");
  // a script that would write it (a script that only reads the evals is free)
  assert.equal(call("Write", { file_path: "/tmp/read.mjs", content: `const t = readFileSync("${FOLDER}/eval.md", "utf8"); console.log(/Status: Approved/.test(t))` }), "");
  assert.equal(call("Write", { file_path: "/tmp/approve.mjs", content: `import { readFileSync, writeFileSync } from "node:fs";\nconst f = "${FOLDER}/eval.md";\nwriteFileSync(f, readFileSync(f, "utf8").replace("Status: draft", "${MARK}"));` }), "eval-sealed");
});

test("eval-sealed: no shell line or script writes a mark", () => {
  const { run } = checkout();
  const refused = [
    `sed -i '' 's/Status: draft/${MARK}/' ${FOLDER}/eval.md`,
    `sed -i '' 's/draft/Scoped by me on 2026-10-31/' ${FOLDER}/prd.md`,
    `sed -i "" "s/draft/Approved by marcocyl04-ux on $(date +%F)/" ${FOLDER}/eval.md`,
    `echo 'Status: Scoped by me on 2026-10-31' >> ${FOLDER}/prd.md`,
    `echo '${MARK}' 1> ${FOLDER}/eval.md`, `echo '${MARK}' &> ${FOLDER}/eval.md`, `echo '${MARK}' >| ${FOLDER}/eval.md`, `printf '${MARK}' >& ${FOLDER}/eval.md`,
    `echo '${MARK}' | tee ${FOLDER}/eval.md`,
    `cat > ${FOLDER}/eval.md <<'EOF'\n# x\n\n${MARK}\nEOF`,
    `perl -pi -e 's/Status: draft/${MARK}/' specs/features/*/eval.md`,
    `python3 - <<'EOF'\nf = "${FOLDER}/eval.md"\nopen(f, "w").write(open(f).read().replace("Status: draft", "${MARK}"))\nEOF`,
    `cd ${FOLDER} && perl -pi -e 's/draft/Approved by me on 2026-10-31/' *.md`,
    `F=${FOLDER}/eval.md; sed -i '' "s/Status: draft/${MARK}/" "$F"`,
    // a message that runs something is judged as any command
    `git commit -m "$(printf '${MARK}' > ${FOLDER}/eval.md)"`,
    `git commit -m "$(python3 - <<'EOF'\nopen("${FOLDER}/eval.md", "a").write("${MARK}")\nEOF\n)"`,
    `gh pr create --title t --body "\`sed -i '' 's/draft/${MARK}/' ${FOLDER}/eval.md\`"`,
  ];
  for (const c of refused) assert.equal(run(c), "eval-sealed", c);
});

test("eval-sealed: reading, searching and saying the mark go through: a commit message, a PR body or comment, a heredoc", () => {
  const { run } = checkout();
  const fine = [
    `grep -l "Status: Approved" specs/features/*/eval.md | wc -l`,
    `grep -n "Status: Scoped" ${FOLDER}/prd.md 2>/dev/null`,
    `git log -S "Status: Approved" -- specs/features/`,
    `echo 'only the press writes Status: Approved into eval.md'`, `echo '${MARK}' >&2`, `printf '${MARK} in eval.md' 2>/dev/null`,
    `gh pr edit 487 --body "the press writes Status: Approved by <login> on <date> into eval.md"`,
    `gh pr create --draft --title t --body "$(cat <<'EOF'\nWhat to try: the card writes\nStatus: Scoped by marcocyl04-ux on 2026-10-31\ninto ${FOLDER}/prd.md\nEOF\n)"`,
    `git commit -F - <<'EOF'\nthe press writes ${MARK} into ${FOLDER}/eval.md; nothing else does\nEOF`,
    `git commit -qm "title\n\nThe press writes Status: Approved by <login> on <date> into eval.md." && git push`,
    `git commit -qm "seal marks; eval.md keeps Status: Approved"`,
    `git -C /tmp/x commit -qm "eval.md keeps Status: Approved"`,
    `gh pr review 487 --comment --body "eval.md: the Status: Approved line looks right"`,
    `gh api repos/sol-mif/sol-dev/issues/482/comments -f body="eval.md now reads Status: Approved"`,
    `cat > /tmp/body.md <<'EOF'\nWhat to try: eval.md reads ${MARK}\nEOF\ngh pr comment 487 --body-file /tmp/body.md`,
    `grep -n "Status: Approved" specs/features/*/eval.md; cd sol/engine && npx tsx --test test/checkpoint.test.ts`,
    `grep -l "Status: Approved" specs/features/*/eval.md > /tmp/a.txt`,
    `awk '/^Status: Approved/ { print FILENAME }' specs/features/*/eval.md`,
    `node -e 'const t = require("fs").readFileSync("${FOLDER}/eval.md", "utf8"); console.log(/Status: Approved/.test(t))'`,
    `sed -i '' '/^Status: Approved.*/d' ${FOLDER}/eval.md`,
    `sed -i '' 's/^Status: Approved.*/Status: draft/' ${FOLDER}/eval.md`,
    `echo '- Status: Scoped for implementation' >> ${FOLDER}/prd.md`,
    `echo "- Scoped by Isaac's ask" >> ${FOLDER}/prd.md`,
    `touch test/fixtures/checkpoint/pressed.jsonl`, `echo '{}' > test/fixtures/checkpoint/pressed.jsonl`,
    // a new PRD from the template, whose comment names the mark: the file's lines are judged, as an edit's are
    `cat > specs/features/fr-15-new/prd.md <<'EOF'\n# fr-15 · New: PRD\n\nStatus: draft\n<!-- Only the press changes the line above to "Status: Scoped by <login> on YYYY-MM-DD". -->\nEOF`,
  ];
  for (const c of fine) assert.equal(run(c), "", c);
});

test("eval-sealed at the commit: a mark the press did not write never goes in, in any form a commit takes", () => {
  const { dir, state, g, run, call } = checkout();
  g("add", "-A"); g("commit", "-qm", "the folder");
  const ev = join(dir, FOLDER, "eval.md");
  // a draft written elsewhere and copied in, which no shell or edit rule saw; not staged, so only -a or a path would take it
  writeFileSync(ev, EVAL.replace("Status: draft", MARK));
  const forms = [`git commit -qam "evals"`, `git commit -am "evals"`, `git commit --all -m "evals"`, `git commit -qm "evals" -- ${FOLDER}/eval.md`,
    `git commit -o ${FOLDER}/eval.md -m "evals"`, `git -C . commit -qam evals`, `git -c user.name=x commit -qam evals`, `git --no-pager commit -qam evals`,
    `env FOO=1 git commit -qam evals`, `FOO=1 git commit -qam evals`, `time git commit -qam evals`, `(git commit -qam evals)`, `bash -c 'git commit -qam evals'`,
    `cd sol && git commit -qam evals`, `/usr/bin/git commit -qam evals`, `git add -A && git commit -qm evals`];
  for (const c of forms) assert.equal(run(c), "eval-sealed", c);
  assert.equal(run(`git commit -qm "evals"`), "", "unstaged and not taken by the commit: the index alone is judged");
  g("add", "-A");
  assert.equal(run(`git commit -qm "evals"`), "eval-sealed", "staged");
  // the press's record names this file, this line and this content: it goes in
  const rec = join(state, "..", "checkpoint", "pressed.jsonl");
  mkdirSync(join(rec, ".."), { recursive: true });
  const press = (text: string, line = MARK) => writeFileSync(rec, JSON.stringify({ file: `${FOLDER}/eval.md`, line, hash: sealedHash(text), by: "marcocyl04-ux", at: "2026-10-31T12:00:00Z" }) + "\n", { flag: "a" });
  press(EVAL.replace("Status: draft", MARK));
  assert.equal(run(`git commit -qm "evals"`), "");
  g("commit", "-qm", "approved");
  // the verifier's release line below "## Releases" needs no new press
  writeFileSync(ev, EVAL.replace("Status: draft", MARK) + "- dev-20261031 · 1/1 pass · verifier: x\n");
  assert.equal(run(`git commit -qam "dev-20261031"`), "");
  g("commit", "-qam", "release");
  // a case added (write-evals, fix-a-bug) or a check weakened under the Approved line: the old press does not hold it
  const added = EVAL.replace("Status: draft", MARK).replace("## Releases", "- [E2] it closes · check: `true`\n\n## Releases") + "- dev-20261031 · 1/1 pass · verifier: x\n";
  writeFileSync(ev, added);
  assert.equal(run(`git commit -qam "a case"`), "eval-sealed", "a case added under the Approved line");
  writeFileSync(ev, EVAL.replace("Status: draft", MARK).replace("check: `true`", "check: `true || true`"));
  assert.equal(run(`git commit -qam "looser"`), "eval-sealed", "a check weakened");
  writeFileSync(ev, added);
  press(added);   // the Sol developer pressed Approve again
  assert.equal(run(`git commit -qam "a case"`), "");
  // work in progress on an approved eval.md (fix-a-bug, write-evals), not staged: a commit of another file goes through;
  // one that takes the eval (-a, its path) waits for the press
  g("commit", "-qam", "a case");
  writeFileSync(ev, added.replace("## Releases", "- [F9] in progress · check: `true`\n\n## Releases"));
  writeFileSync(join(dir, "notes.txt"), "x\n"); g("add", "notes.txt");
  // only a plain commit, fully understood, takes the index alone; anything else is judged with the working tree too
  for (const ok of [`git commit -qm "notes"`, `git commit -m notes -q --signoff`, `git commit -m 'notes: a; b && c'`, `git commit -q -m "the press writes Status: Approved by <login> into eval.md"`])
    assert.equal(run(ok), "", `plain, an unrelated file staged and the eval's changes left in the working tree: ${ok}`);
  for (const no of [`git commit -qam "notes"`, `git commit --all -m notes`, `git commit -qm notes -- notes.txt`, `git commit -qm notes notes.txt`,
    `git commit -o notes.txt -m notes`, `git commit -i notes.txt -m notes`, `git commit --pathspec-from-file=/tmp/p -m notes`, `git commit -qm notes ':(glob)specs/**'`,
    `git add notes.txt && git commit -qm notes`, `git stage notes.txt; git commit -qm notes`, `git update-index --add notes.txt && git commit -qm notes`,
    `git apply --cached /tmp/p.diff && git commit -qm notes`, `git rm -q --cached notes.txt && git commit -qm notes`, `git mv notes.txt n.txt && git commit -qm notes`,
    `git checkout -- notes.txt && git commit -qm notes`, `git restore --staged notes.txt && git commit -qm notes`, `git read-tree HEAD && git commit -qm notes`,
    `git --git-dir=.git commit -qm notes`, `git --work-tree=. commit -qm notes`, `git -C . commit -qm notes`, `cd . && git commit -qm notes`,
    `env X=1 git commit -qm notes`, `X=1 git commit -qm notes`, `GIT_INDEX_FILE=/tmp/i git commit -qm notes`, `time git commit -qm notes`, `(git commit -qm notes)`,
    `bash -c 'git commit -qm notes'`, `sh -c 'git commit -qm notes'`, `/usr/bin/git commit -qm notes`, `echo "$(git commit -qm notes)"`, `git commit -qm notes --frobnicate`,
    `git commit \\\n  -qm notes`, `cp /tmp/x .git/index; git commit -qm notes`, `git commit -qm "$MSG"`, `git commit -q -F - <<'EOF'\nnotes\nEOF`,
    `git status && git commit -qm notes`, `git commit -qm notes && git push`, `git commit -qm notes > /tmp/out`])
    assert.equal(run(no), "eval-sealed", `not plain, judged with the working tree: ${no}`);
  g("reset", "-q", "notes.txt"); writeFileSync(ev, added);
  // a different line is not on the record; a Scoped mark in prd.md needs its own
  writeFileSync(ev, added.replace(MARK, "Status: Approved by marcocyl04-ux on 2026-11-01"));
  assert.equal(run(`git commit -qam "evals"`), "eval-sealed");
  writeFileSync(ev, added);
  writeFileSync(join(dir, FOLDER, "prd.md"), PRD.replace("Status: draft", "Status: Scoped by marcocyl04-ux on 2026-10-31"));
  assert.equal(run(`git commit -qam "scoped"`), "eval-sealed");
  writeFileSync(rec, JSON.stringify({ file: `${FOLDER}/prd.md`, line: "Status: Scoped by marcocyl04-ux on 2026-10-31", hash: "", by: "m", at: "" }) + "\n", { flag: "a" });
  assert.equal(run(`git commit -qam "scoped"`), "");
  // the record is the engine's alone; a file of the same name elsewhere is not it
  assert.equal(call("Write", { file_path: rec, content: "{}" }), "eval-sealed");
  assert.equal(run(`echo '{}' >> "${rec}"`), "eval-sealed");
  assert.equal(run(`cat "${rec}"`), "", "reading it goes through");
  assert.equal(call("Write", { file_path: "/tmp/rec.mjs", content: `import { appendFileSync } from "node:fs";\nappendFileSync(process.env.HOME + "/Library/Application Support/com.marcol04.sol/checkpoint/pressed.jsonl", "{}\\n");` }), "eval-sealed", "a script that appends to it");
  assert.equal(call("Write", { file_path: "/tmp/readrec.mjs", content: `import { readFileSync } from "node:fs";\nconsole.log(readFileSync(process.env.HOME + "/Library/Application Support/com.marcol04.sol/checkpoint/pressed.jsonl", "utf8"));` }), "", "a script that only reads it");
  assert.equal(call("Write", { file_path: join(dir, "sol/engine/test/fixtures/checkpoint/pressed.jsonl"), content: "{}\n" }), "", "a test fixture of that name");
});

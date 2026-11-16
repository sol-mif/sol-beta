// How the guard reads a shell line (#484, sol/harness/shell.mjs): the commands it runs, where each runs, what each
// writes, and what it cannot read. Pure; no shell is started.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = await import("../../harness/shell.mjs");
const plan = (line: string, cwd = "/w") => S.plan(line, cwd);
const runs = (line: string, cwd = "/w") => plan(line, cwd).map((x: any) => x.text);
const gitAt = (line: string) => plan(line).map((x: any) => S.gitOf(x)).filter(Boolean).map((g: any) => `${g.sub}@${g.dir}`);
const writes = (line: string) => plan(line).flatMap((x: any) => { const w = S.writesOf(x); return [...w.writes.map((f: string) => `w:${f}`), ...w.appends.map((f: string) => `a:${f}`), ...w.deletes.map((f: string) => `d:${f}`)]; });

test("a line is the commands it runs: quotes, heredoc bodies and a message's words are never commands", () => {
  assert.deepEqual(runs("git add -A && git commit -m 'x; git merge main' || true; ls | wc -l"), ["git add -A", "git commit -m 'x; git merge main'", "true", "ls", "wc -l"]);
  assert.deepEqual(runs("cat <<'EOF'\ngit merge main\nEOF\necho done"), ["cat <<'EOF'", "echo done"]);
  assert.deepEqual(plan("cat <<'EOF'\ngit merge main\nEOF")[0].docs, ["git merge main"]);
  assert.deepEqual(runs("(cd /m && git merge y)"), ["cd /m", "git merge y"], "a subshell's brackets are not the command's");
  assert.deepEqual(runs("echo a 2>&1 &>/dev/null & echo b"), ["echo a 2>&1 &>/dev/null", "echo b"]);
});

test("a command run inside another is a command too: $( ), backticks, <( ), bash -c, eval, xargs, find -exec, env -S", () => {
  assert.deepEqual(gitAt('git commit -m "$(git merge x)"'), ["commit@/w", "merge@/w"], "inside a commit message, it runs");
  assert.deepEqual(gitAt("echo `git merge x`"), ["merge@/w"]);
  assert.deepEqual(gitAt('echo "`git merge x`"'), ["merge@/w"], "a backtick in double quotes runs");
  assert.deepEqual(gitAt("echo '`git merge x`'"), [], "in single quotes it is words");
  assert.deepEqual(gitAt("diff <(git show a) <(git show b)"), ["show@/w", "show@/w"]);
  assert.deepEqual(gitAt("bash -c 'cd /m && git merge feature'"), ["merge@/m"], "where it runs, inside the script");
  assert.deepEqual(gitAt("sh -lc \"git merge x\""), ["merge@/w"]);
  assert.deepEqual(gitAt("bash <<EOF\ngit merge x\nEOF"), ["merge@/w"], "a shell's heredoc is its script");
  assert.deepEqual(gitAt("eval git merge x"), ["merge@/w"]);
  assert.deepEqual(gitAt("echo main | xargs -I{} git merge {}"), ["merge@/w"]);
  assert.deepEqual(gitAt("find . -name x -exec git merge {} \\;"), ["merge@/w"]);
  assert.deepEqual(gitAt("env -S 'git merge x'"), ["merge@/w"]);
  assert.deepEqual(gitAt("echo $((1 + 2))"), [], "arithmetic is not a command");
  // a heredoc a command inside $( ) opened: its body is that command's, as the shell reads it
  const p = plan(`git commit -m "$(python3 - <<'EOF'\nopen("x", "a").write(1)\nEOF\n)"`);
  assert.equal(p[1].text, "python3 - <<'EOF'");
  assert.deepEqual(p[1].docs, [`open("x", "a").write(1)`]);
});

test("where a command runs: a cd before it, git -C, --work-tree, GIT_DIR, env -C; wrappers taken off", () => {
  assert.deepEqual(gitAt("cd /m && git merge x && cd - && git push"), ["merge@/m", "push@/m"], "cd - is not followed");
  assert.deepEqual(gitAt("git -C /m merge x; git push"), ["merge@/m", "push@/w"], "-C is its own only");
  assert.deepEqual(gitAt("git --work-tree=/m merge x"), ["merge@/m"]);
  assert.deepEqual(gitAt("GIT_DIR=/m/.git git merge x"), ["merge@/m"]);
  assert.deepEqual(gitAt("env -C /m git merge x"), ["merge@/m"]);
  assert.deepEqual(gitAt("sudo -u root git merge x"), ["merge@/w"], "sudo's -u takes a value");
  assert.deepEqual(gitAt("timeout 30 nice -n 5 git push"), ["push@/w"]);
  assert.deepEqual(gitAt("command -v git"), [], "asking where git is runs no subcommand");
  assert.deepEqual(S.gitOf(plan("git -c alias.m=merge m x")[0]).aliases, { m: "merge" });
});

test("what a command writes: every redirect form, glued or not; tee, sed -i, cp, mv, rm, git rm/mv/restore", () => {
  for (const l of ["echo x>f", "echo x 1>f", "echo x &>f", "echo x >|f", "echo x >& f", "echo x > f", "printf x >f"]) assert.deepEqual(writes(l), ["w:/w/f"], l);
  assert.deepEqual(writes("echo x >> f"), ["a:/w/f"]);
  assert.deepEqual(writes("echo x &>> f"), ["a:/w/f"]);
  assert.deepEqual(writes("echo x 2>&1 >&2 2>/dev/null"), [], "a stream copied or thrown away is no file");
  assert.deepEqual(writes('echo "a > b"'), [], "a quoted > is words");
  assert.deepEqual(writes("cat <<EOF >> h\nhi\nEOF"), ["a:/w/h"]);
  assert.deepEqual(writes("echo x | tee -a z"), ["a:/w/z"]);
  assert.deepEqual(writes("sed -i '' 's/a/b/' f"), ["w:/w/f"]);
  assert.deepEqual(writes("sed -i.bak -e 's/a/b/' f g"), ["w:/w/f", "w:/w/g"]);
  assert.deepEqual(writes("cp a b"), ["w:/w/b"]);
  assert.deepEqual(writes("mv a b"), ["w:/w/b", "d:/w/a"]);
  assert.deepEqual(writes("cd sub && rm -rf x"), ["d:/w/sub/x"], "after the cd");
  assert.deepEqual(writes("git rm -q x && git restore y && git checkout main -- z"), ["d:/w/x", "w:/w/y", "w:/w/z"]);
  assert.deepEqual(writes('git commit -m "x > y"'), [], "a message's > is words");
  assert.deepEqual(S.writesOf(plan("cp a b")[0]).copies, ["/w/a"], "where a copy's bytes come from");
});

test("what it cannot read, it says: a line that does not close, a program that is a variable", () => {
  assert.equal(plan('echo "x && git merge y').broken, true);
  assert.equal(plan("echo $(git merge").broken, true);
  assert.equal(plan("echo 'done'").broken, false);
  assert.equal(plan("cat <<EOF\nno end").broken, false, "an unclosed heredoc runs to the end, as the shell reads it: still words");
  assert.equal(plan('"$GIT" merge x')[0].opaque, true);
  assert.equal(plan("$(which git) merge x")[0].opaque, true);
  assert.equal(plan("git merge x")[0].opaque, false);
  assert.equal(plan("X=1 git merge x")[0].opaque, false, "an assignment before it is not the program");
});

test("pipelines: | joins, ; && || and a newline start the next; gh's -R is not its command", () => {
  const p = plan("echo a | websocat x && git push || ls; cat y |& grep z");
  const groups = [...new Set(p.map((x: any) => x.pipe))].map((k) => p.filter((x: any) => x.pipe === k).map((x: any) => x.text));
  assert.deepEqual(groups, [["echo a", "websocat x"], ["git push"], ["ls"], ["cat y", "grep z"]]);
  assert.deepEqual(S.ghOf(plan("gh -R o/r pr merge 3")[0]).path, ["pr", "merge"]);
  assert.equal(S.flag(["--body=x"], "--body", "-b"), "x");
});

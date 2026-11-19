// What counts as off (#1199, src/team/drift.ts measure): a file is off only when mine's own change to it has not
// reached the iteration. Git itself decides here, so this one runs against a real repository made in a temp folder:
// a main with two iterations and four people's mines, each a case. Nothing is fetched and GitHub is not asked.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// every temp folder made here, removed when the file is done
const made: string[] = [];
const temp = (name: string) => { const dir = mkdtempSync(join(tmpdir(), name)); made.push(dir); return dir; };
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

process.env.SOL_STATE = join(temp("sol-drift-measure-"), "work.json");
const { measure, mergeKeepsNames, linesOf } = await import("../src/team/drift.ts");
// the merge is only asked of a git that keeps names in it (2.50); an older one here runs the content count alone
const OLD_GIT = !mergeKeepsNames(execFileSync("git", ["version"], { encoding: "utf8" }));

const DAY = 24 * 3600;
const T0 = Date.UTC(2026, 10, 10, 12) / 1000;   // the first commit; the two iterations are cut one and two days later
const lines = (first: string, last = "8") => [first, "2", "3", "4", "5", "6", "7", last].join("\n") + "\n";

function repo() {
  const root = temp("sol-drift-repo-");
  let clock = T0;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000` } }).trim();
  const write = (files: Record<string, string | null>) => {
    for (const [f, text] of Object.entries(files)) {
      if (text === null) { rmSync(join(root, f)); continue; }
      mkdirSync(dirname(join(root, f)), { recursive: true });
      writeFileSync(join(root, f), text);
    }
  };
  /** one commit of these files (null: deleted) at `at` seconds after T0, on the branch checked out */
  const commit = (at: number, files: Record<string, string | null>) => { clock = T0 + at; write(files); git("add", "-A"); git("commit", "-q", "-m", `at ${at}`); return git("rev-parse", "HEAD"); };
  git("init", "-q", "-b", "main");
  const base = commit(0, { "a.ts": lines("a"), "b.ts": lines("b"), "c.ts": lines("c"), "d.ts": "d\n", "e.ts": lines("e"), "old.ts": lines("old"), "keep.ts": lines("keep"),
    "f.ts": lines("f"), "g.bin": "g\0base\n", "h.ts": lines("h"), "i.ts": lines("i"), "run.sh": lines("run") });

  // frank/mine, cut from the first commit, an hour in: every case in one line
  git("checkout", "-q", "-b", "frank-mine", base);
  commit(3600, { "a.ts": lines("a, mine") });
  commit(3700, { "a.ts": lines("a") });                                  // back as it was: touched, and no change of its own
  commit(3800, { "b.ts": lines("b, mine") });                            // main never had it
  commit(3900, { "c.ts": lines("c, shared") });                          // main took this very change, then built on it
  commit(4000, { "d.ts": "d, mine\n" });                                 // main changed the same line: a clash
  commit(4100, { "e.ts": null });                                        // mine deleted what main changed
  commit(4200, { "old.ts": lines("old, mine") });                        // main renamed the file
  commit(4250, { "f.ts": lines("f, shared") });                          // main took the file whole, then changed the next line
  commit(4280, { "g.bin": "g\0mine\n" });                                // a binary file main changed too
  commit(4285, { "h.ts": lines("h, shared") });                          // main took it whole, then put the line back and changed the next
  commit(4290, { "i.ts": lines("i, shared") });                          // main took it whole, then changed that very line again
  write({ "run.sh": lines("run, shared") });                             // main took the words whole, never the mode
  chmodSync(join(root, "run.sh"), 0o755);
  git("add", "-A");
  git("update-index", "--chmod=+x", "run.sh");                           // where the disk keeps no mode (Windows), the index does
  commit(4295, {});
  const frank = commit(4300, { "mine/notes.md": "mine\n", "MINE.md": "mine\n" });

  // isaac/mine: only behind. Its commits touched a.ts and left it as the first commit had it
  git("checkout", "-q", "-b", "isaac-mine", base);
  commit(3600, { "a.ts": lines("a, tried") });
  const isaac = commit(3700, { "a.ts": lines("a"), "mine/x.md": "x\n" });

  // main: the first iteration a day in, the second two days in
  git("checkout", "-q", "main");
  commit(DAY, { "a.ts": lines("a, main"), "c.ts": lines("c, shared"), "f.ts": lines("f, shared"), "h.ts": lines("h, shared"), "i.ts": lines("i, shared"),
    "run.sh": lines("run, shared") });
  git("tag", "dev-20261111");
  write({ "old.ts": null, "new.ts": lines("old") });
  const it = commit(2 * DAY, { "c.ts": lines("c, shared", "8, main"), "d.ts": "d, main\n", "e.ts": lines("e, main"),
    "f.ts": lines("f, shared").replace("\n2\n", "\n2, main\n"), "g.bin": "g\0main\n",
    "h.ts": lines("h").replace("\n2\n", "\n2, main\n"), "i.ts": lines("i, shared, and main"), "run.sh": lines("run, shared").replace("\n2\n", "\n2, main\n") });
  git("tag", "dev-20261112");

  // marco/mine: rebased onto the iteration, one change of its own on top
  git("checkout", "-q", "-b", "marco-mine", it);
  const marco = commit(2 * DAY + 60, { "keep.ts": lines("keep, mine") });
  git("checkout", "-q", "main");
  for (const [who, sha] of Object.entries({ frank, isaac, marco })) git("update-ref", `refs/remotes/origin/${who}/mine`, sha);
  return { root, it };
}

const PEOPLE = ["frank", "isaac", "marco", "nobody"].map((prefix) => ({ login: `${prefix}-x`, name: prefix, prefix }));
function deps(root: string, o: { noMergeTree?: boolean; version?: string } = {}) {
  const said: string[] = [];
  const git = (args: string[]) => new Promise<{ code: number; out: string }>((ok) => {
    if (args[0] === "fetch") return ok({ code: 0, out: "" });   // no origin here: the refs were written as a fetch leaves them
    if (o.version && args[0] === "version") return ok({ code: 0, out: o.version + "\n" });
    if (o.noMergeTree && args.includes("merge-tree")) return ok({ code: 129, out: "usage: git merge-tree [--trivial-merge] <base-tree> <branch1> <branch2>" });
    execFile("git", args, { cwd: root, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } },
      (err, out, errOut) => ok({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 128) : 0, out: String(out) || String(errOut) }));
  });
  return { said, d: { git, gh: async () => "[]", now: () => new Date((T0 + 3 * DAY) * 1000), say: (l: string) => { said.push(l); } } };
}
const off = (m: Awaited<ReturnType<typeof measure>>, prefix: string) => m!.file.people.find((p) => p.prefix === prefix)!;

test("off is a change that has not reached the iteration: not a file left as it was, not one main took and built on (a line away or the next line); a clash, a delete, a binary both changed, a rename's old name, a line main put back, a line main changed again and a mode main never took are", { skip: OLD_GIT && "this git is before 2.50: its merge follows renames, so drift counts by content (the tests below)" }, async () => {
  const { root, it } = repo();
  const { d, said } = deps(root);
  const m = await measure(d, "o/r", PEOPLE);
  assert.equal(m!.file.iteration.name, "dev-20261112");
  assert.equal(m!.file.iteration.sha, it);
  assert.deepEqual(m!.file.left, []);
  assert.deepEqual(said, [], "nothing to say: the fetch answered and git merged in memory");

  const frank = off(m, "frank");
  assert.deepEqual(frank.mine.map((f) => f.path), ["b.ts", "d.ts", "e.ts", "g.bin", "h.ts", "i.ts", "old.ts", "run.sh"],
    "a.ts: touched and left as it was, although main changed it; c.ts: its change is in the iteration, which built on it; f.ts: the same, on the very next line, which git's merge calls a clash. "
    + "h.ts: main held it as mine has it and then put mine's line back; i.ts: and then changed mine's line again; run.sh: main never held it with mine's mode");
  assert.equal(frank.off, 8);
  assert.equal(frank.iterations, 2, "by the author time: both iterations went out without them");

  const isaac = off(m, "isaac");
  assert.equal(isaac.off, 0, "only behind: main changed a.ts, isaac's own change to it is nothing");
  assert.equal(isaac.iterations, 0);

  const marco = off(m, "marco");
  assert.deepEqual(marco.mine, [{ path: "keep.ts", age: 0 }], "rebased onto the iteration: its one change, made since");
  assert.equal(off(m, "nobody").off, 0, "no mine on origin");
  assert.deepEqual([...m!.bases.keys()].sort(), ["frank-x", "isaac-x", "marco-x"]);
});

test("a git with no merge-tree --write-tree: said in the log, and a mine that is only behind is still off nothing", async () => {
  const { root } = repo();
  const { d, said } = deps(root, { noMergeTree: true });
  const m = await measure(d, "o/r", PEOPLE);
  assert.equal(said.filter((l) => /merge-tree was not usable here \(usage: git merge-tree/.test(l)).length, 3, "once for each mine measured");
  assert.equal(off(m, "isaac").off, 0, "a file left as the merge-base had it is not off, with or without merge-tree");
  assert.deepEqual(off(m, "frank").mine.map((f) => f.path), ["b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.bin", "h.ts", "i.ts", "old.ts", "run.sh"],
    "by content: c.ts and f.ts are counted too (the iteration took the change and built on it), as the log says");
  assert.deepEqual(off(m, "marco").mine.map((f) => f.path), ["keep.ts"]);
});

test("a git before 2.50 (its merge follows a rename whatever is set): the merge is not asked, said in the log with the version, counted by content", async () => {
  const { root } = repo();
  const { d, said } = deps(root, { version: "git version 2.43.0" });
  const asked: string[][] = [];
  const git = d.git;
  d.git = (args: string[]) => { asked.push(args); return git(args); };
  const m = await measure(d, "o/r", PEOPLE);
  assert.equal(asked.some((a) => a.includes("merge-tree")), false, "no merge on a git that would follow the rename");
  assert.equal(said.filter((l) => /merge-tree was not usable here \(git version 2\.43\.0: before git 2\.50 it follows renames\)/.test(l)).length, 3, "once for each mine measured");
  assert.deepEqual(off(m, "frank").mine.map((f) => f.path), ["b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.bin", "h.ts", "i.ts", "old.ts", "run.sh"], "old.ts is still off: the rename is not followed");
  assert.equal(off(m, "isaac").off, 0);
});

test("the lines a one-file diff adds and takes out: after the first @@, a line of only spaces left out; none to go by for a binary file or a deleted one", () => {
  const d = linesOf("diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file\n@@ -4,0 +5,2 @@\n+   \n+++ kept: a line of the file that starts with two pluses\n");
  assert.deepEqual([[...d!.added], [...d!.gone]], [["new", "++ kept: a line of the file that starts with two pluses"], ["old"]]);
  assert.equal(linesOf("diff --git a/x b/x\nindex 1..2 100644\nBinary files a/x and b/x differ\n"), null);
  assert.equal(linesOf("diff --git a/x b/x\ndeleted file mode 100644\nindex 1..0\n--- a/x\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n"), null);
  assert.deepEqual(linesOf(""), { added: new Set(), gone: new Set() });
});

test("which git keeps names in its merge: 2.50 and later", () => {
  assert.deepEqual(["git version 2.49.1", "git version 2.38.0", "git version 1.9.5", "nothing"].map(mergeKeepsNames), [false, false, false, false]);
  assert.deepEqual(["git version 2.50.0", "git version 2.54.0 (Apple Git-157)", "git version 2.56.1.windows.1", "git version 3.0.0"].map(mergeKeepsNames), [true, true, true, true]);
});

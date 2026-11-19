// fr-07 F13: a pane on a folder that is not there (moved, deleted, a drive unplugged). The files list and the show's map
// say the folder is missing; the terminal says "that folder is not there"; a terminal that will not start says "the
// terminal did not open: ...". The real wire (work.files, work.tree, work.term.open) runs on a temp disk; each answer
// is to the asking window by its rid. How a pane words the missing folder is the face's: the engine's answer is checked.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-panes-")));
const HOME = join(dir, "person");
mkdirSync(HOME, { recursive: true });
Object.assign(process.env, { HOME, SOL_STATE: join(dir, "work.json"), SOL_HOME: join(dir, "home"), SOL_SESSIONS_DIR: join(dir, "sessions"), SOL_TEAM: join(dir, "team.json"), SOL_TEAM_OFFLINE: "1" });
delete process.env.CLAUDE_CONFIG_DIR;
const { handleWork } = await import("../src/work/wire.ts");
const { allTerms } = await import("../src/work/panes.ts");

const GONE = join(HOME, "was-here-once");   // a folder a session worked in, not on the disk now
const HERE = join(HOME, "here");
mkdirSync(HERE); writeFileSync(join(HERE, "a.txt"), "x");
const shell = process.env.SHELL;
after(() => { if (shell === undefined) delete process.env.SHELL; else process.env.SHELL = shell; rmSync(dir, { recursive: true, force: true }); });

/** one question to the wire, and the answer to it, by rid */
async function ask(m: object) {
  const heard: any[] = [];
  await handleWork({ send: (x: object) => { heard.push(x); } }, { rid: "r1", ...m });
  return { heard, answer: heard.find((x) => x.rid === "r1") };
}

test("a missing folder is said: the files list and the show's map answer missing, not an empty folder", async () => {
  for (const type of ["work.files", "work.tree"]) {
    const { answer } = await ask({ type, cwd: GONE, q: "" });
    assert.deepEqual(answer, { type, rid: "r1", missing: true, files: [] }, type);
  }
  // the control: a folder that is there is answered with its files, and is not said missing
  const files = (await ask({ type: "work.files", cwd: HERE, q: "" })).answer;
  assert.equal(files.missing, undefined);
  assert.deepEqual(files.files, ["a.txt"]);
  const tree = (await ask({ type: "work.tree", cwd: HERE })).answer;
  assert.equal(tree.missing, undefined);
  assert.deepEqual(tree.files, ["a.txt"]);
  // a file is not a folder either
  assert.equal((await ask({ type: "work.files", cwd: join(HERE, "a.txt"), q: "" })).answer.missing, true);
});

test("a missing folder is said: a terminal there says that folder is not there, and none is opened", async () => {
  const { heard, answer } = await ask({ type: "work.term.open", cwd: GONE, cols: 80, rows: 24 });
  assert.deepEqual(answer, { type: "work.term.opened", rid: "r1", error: "that folder is not there" });
  assert.equal(heard.some((x) => x.type === "work.terms"), false, "no terminal was listed");
  assert.equal(allTerms().length, 0);
});

test("a missing folder is said: the changes, the read, the save and the pull request pane say it too", async () => {
  for (const type of ["work.diff", "work.read", "work.write", "work.pr"]) {
    const { answer } = await ask({ type, cwd: GONE, path: "a.txt", text: "y" });
    assert.deepEqual(answer, { type, rid: "r1", error: "that folder is not there" }, type);
  }
});

test("a missing folder is said: a terminal that will not start says the terminal did not open, with why", async () => {
  process.env.SHELL = join(dir, "no-such-shell");   // the folder is there; the program the terminal runs is not
  const { heard, answer } = await ask({ type: "work.term.open", cwd: HERE, cols: 80, rows: 24 });
  assert.equal(answer.type, "work.term.opened");
  assert.match(answer.error, /^the terminal did not open: \S/, JSON.stringify(answer));
  assert.equal(answer.tid, undefined, "no terminal came of it");
  assert.equal(heard.some((x) => x.type === "work.terms"), false);
  assert.equal(allTerms().length, 0);
});

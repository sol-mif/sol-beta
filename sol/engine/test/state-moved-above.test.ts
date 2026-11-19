// state.ts folderMoved, beside the case of #901 (test/n10-state-moved-chain.test.ts): a folder that moves out of a folder
// that had itself moved. The older move stays for everything else under it, the inner folder's old place gets a line of
// its own, and the map is kept nearest place first, since both readers (sessions.ts movedTo, threads.ts placer) stop at
// the first line a path is under.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.SOL_STATE = join(mkdtempSync(join(tmpdir(), "sol-moved-above-")), "work.json");
const S = await import("../src/work/state.ts");
const { relocated } = await import("../src/work/sessions.ts");

test("three moves, each of a folder inside the last: a path said in any of the old places ends where its folder is now", () => {
  S.folderMoved("/t1/a", "/t1/b");
  S.folderMoved("/t1/b/c", "/t1/x");
  S.folderMoved("/t1/x/d", "/t1/y");
  for (const old of ["/t1/a/c/d", "/t1/b/c/d", "/t1/x/d"]) assert.equal(relocated(old + "/f"), "/t1/y/f", old);
  // what did not move the last time stays where the moves before left it
  assert.equal(relocated("/t1/a/c/e"), "/t1/x/e");
  assert.equal(relocated("/t1/b/c/e"), "/t1/x/e");
  assert.equal(relocated("/t1/a/q"), "/t1/b/q");
  assert.equal(relocated("/t1/a"), "/t1/b");
});

test("the map is kept longest old place first, so the first line a path is under is the nearest one", () => {
  const keys = Object.keys(S.moved());
  assert.ok(keys.length > 3, JSON.stringify(S.moved()));
  assert.deepEqual(keys, [...keys].sort((x, y) => y.length - x.length), JSON.stringify(S.moved()));
});

test("a folder that had left before the rename is not taken along by a new folder of its name", () => {
  S.folderMoved("/t2/a/e", "/t2/c");       // e leaves a
  S.folderMoved("/t2/a", "/t2/b");         // a renamed
  S.folderMoved("/t2/b/e/g", "/t2/z");     // a new e in b, and a folder moved out of it
  assert.equal(relocated("/t2/a/e/g/f"), "/t2/c/g/f", `the first e went to c: ${JSON.stringify(S.moved())}`);
  assert.equal(relocated("/t2/b/e/g/f"), "/t2/z/f");
  assert.equal(relocated("/t2/a/other"), "/t2/b/other");
});

test("moved out and then back in: the paths end in the folder again, and no line sends a place to itself", () => {
  S.folderMoved("/t3/a", "/t3/b");
  S.folderMoved("/t3/b/c", "/t3/x");
  S.folderMoved("/t3/x", "/t3/b/c");
  assert.equal(relocated("/t3/a/c/f"), "/t3/b/c/f");
  assert.equal(relocated("/t3/x/f"), "/t3/b/c/f");
  assert.equal(relocated("/t3/b/c/f"), "/t3/b/c/f");
  for (const [a, b] of Object.entries(S.moved())) assert.notEqual(a, b);
});

test("a sibling whose name only starts the same is not taken for the folder that moved", () => {
  S.folderMoved("/t4/a", "/t4/b");
  S.folderMoved("/t4/b/eng", "/t4/x");
  assert.equal(relocated("/t4/a/eng/f"), "/t4/x/f");
  assert.equal(relocated("/t4/a/engine/f"), "/t4/b/engine/f");
});

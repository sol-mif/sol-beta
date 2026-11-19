// blocks.ts: the ledger is "one signed line per event, append only" and "a ledger is never cut". One torn line (the
// engine killed mid-append, a full disk) makes ledger() answer [] for the whole file: the block's history is gone from
// every reader (seen, start, blocksNow), and the next line is numbered 1 with no prev, as if the block were new.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.SOL_HOME = mkdtempSync(join(tmpdir(), "n10-ledger-"));
const S = await import("../src/work/blocks.ts");
after(() => rmSync(process.env.SOL_HOME!, { recursive: true, force: true }));

// the case as filed in #898, word for word
test("a torn last line costs that line only: the lines before it stay, and the next line goes on from them", () => {
  const w = { project: "p", sessionId: "s1", by: "t" };
  const b = S.compose(w, { kind: "card", title: "plan", body: "x" });
  S.update(w, { id: b.id, title: "plan 2" });
  S.freeze(w, { id: b.id });
  assert.equal(S.ledger("p", b.id).length, 3);
  appendFileSync(join(S.blockPath("p", b.id), "ledger.jsonl"), '{"n":4,"at":17,"ev":"ran","by":"t","blo');   // torn mid-write
  const after = S.ledger("p", b.id);
  const next = S.remark("p", b.id, "t", "one more")!;
  assert.equal(after.length, 3, `the three whole lines are gone: ledger() answers ${after.length} lines`);
  assert.equal(next.n, 4, `the next line is numbered ${next.n}`);
});

// the torn line has no newline after it: a line appended straight onto it would be one unreadable line with it
test("the line written after a torn one is read back: it starts on a line of its own, signed over the last whole line", () => {
  const w = { project: "p", sessionId: "s1", by: "t" };
  const b = S.compose(w, { kind: "card", title: "notes", body: "x" });
  S.update(w, { id: b.id, title: "notes 2" });
  const file = join(S.blockPath("p", b.id), "ledger.jsonl");
  const torn = '{"n":3,"at":17,"ev":"ran","by":"t","blo';
  appendFileSync(file, torn);
  const before = S.ledger("p", b.id);
  const third = S.remark("p", b.id, "t", "three")!;
  const fourth = S.remark("p", b.id, "t", "four")!;
  const now = S.ledger("p", b.id);
  assert.deepEqual(now.map((l) => l.n), [1, 2, 3, 4], `the lines read back are numbered ${JSON.stringify(now.map((l) => l.n))}`);
  assert.deepEqual(now.slice(2).map((l) => l.note), ["three", "four"]);
  assert.equal(third.prev, before[1].sig, "the new line is signed over the last whole line");
  assert.equal(fourth.prev, third.sig);
  assert.ok(S.ledgerWhole(now), "the whole lines chain: the torn one between them is not a break");
  // never cut: the torn bytes are still in the file, on a line of their own
  assert.ok(readFileSync(file, "utf8").split("\n").includes(torn), "the torn line was cut out of the file or run into another");
});

test("a torn line in the middle, or a line that is not a ledger line, costs only itself", () => {
  const w = { project: "p", sessionId: "s1", by: "t" };
  const b = S.compose(w, { kind: "card", title: "list", body: "x" });
  const file = join(S.blockPath("p", b.id), "ledger.jsonl");
  appendFileSync(file, '{"n":2,"at":17,"ev":"ran"\n');   // torn, then the newline of a later write
  appendFileSync(file, "null\n");                          // reads as JSON, is no line
  appendFileSync(file, "\n");                              // an empty line
  const second = S.remark("p", b.id, "t", "two")!;
  const now = S.ledger("p", b.id);
  assert.equal(second.n, 2);
  assert.deepEqual(now.map((l) => [l.n, l.ev]), [[1, "composed"], [2, "ran"]]);
  assert.ok(S.ledgerWhole(now));
  // what the face reads (work.stage.get) still has the block's lines
  assert.equal(S.seen("p", b.id)?.lines.length, 2);
});

test("a whole ledger reads as before: nothing skipped, nothing added to the file", () => {
  const w = { project: "p", sessionId: "s1", by: "t" };
  const b = S.compose(w, { kind: "card", title: "clean", body: "x" });
  S.update(w, { id: b.id, title: "clean 2" });
  const text = readFileSync(join(S.blockPath("p", b.id), "ledger.jsonl"), "utf8");
  assert.equal(text.split("\n").length, 3, "two lines, each ended by one newline");
  assert.ok(text.endsWith("\n") && !text.includes("\n\n"));
  assert.ok(S.ledgerWhole(S.ledger("p", b.id)));
  assert.deepEqual(S.ledger("p", "nope0000"), [], "a block that is not there has no lines");
});

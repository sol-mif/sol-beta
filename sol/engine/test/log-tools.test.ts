// "Take that line out" (#1789, part of #1678; gate one q4 for engine/log): the person's AI finds the person's words in
// Sol's history and erases them through Sol's own tools, only on the person's words this turn, and what is gone is the
// log's own say (no list kept beside it). A real kernel on the test's own folders, called the way a seat calls.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-log-tools-")));
after(() => rmSync(root, { recursive: true, force: true }));
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
delete process.env.SOL_KERNEL;
const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const { readLog, verifyLog, canErase } = await import("../src/log.ts");
const { findWords, LOG_NAMES, logToolsNow } = await import("../src/log-tools.ts");
const T = await import("../src/tools.ts");
const said = (r: { content: { text?: string }[]; isError?: boolean }) => String(r.content[0]?.text ?? "");

test("with the frame off the two tools are not offered, and a call says there is no history", async () => {
  assert.equal(kernelNow(), null);
  assert.deepEqual(logToolsNow(false), []);
  assert.ok(!T.solToolsNow().some((t) => LOG_NAMES.has(t.name)));
  for (const n of LOG_NAMES) {
    const r = await T.runSolTool(n, { words: "bank pin", id: "x", yes: "take it out" }, { said: "take it out" });
    assert.equal(r.isError, true);
    assert.match(said(r), /keeps no history right now/);
  }
});

test("take that line out: the person's own line found by a phrase, refused without the person's words, erased with them, and gone for good", async () => {
  const home = join(root, "home");
  mkdirSync(join(home, "things"), { recursive: true });
  await syncKernel(home, true);
  try {
    const k = kernelNow()!;
    assert.deepEqual(T.solToolsNow().filter((t) => LOG_NAMES.has(t.name)).map((t) => t.name), ["log_find", "log_erase"], "offered with the kernel there");
    const note = k.append("way.note", undefined, { way: "w", about: "me", words: "my bank PIN is 4321" }, { person: "person" });
    const lunch = k.append("way.note", undefined, { way: "w", about: "me", words: "lunch at noon" }, { person: "you" });   // a press in the face
    const seats = k.append("way.note", undefined, { way: "w", about: "me", words: "the seat noted the bank PIN rule" }, { person: "seat", agent: "home" });
    assert.ok(canErase(k.since(0).find((e) => e.id === note.id)!), "its words are in a value file");

    // find: only the person's line that holds the phrase, case aside, with its id (the seat's line holds it too)
    const found = await T.runSolTool("log_find", { words: "bank pin" }, {});
    assert.equal(found.isError, undefined);
    assert.equal(said(found).split("\n").length, 1);
    assert.match(said(found), new RegExp(`^${note.id}  \\S+Z  way\\.note  .*bank PIN is 4321`));
    assert.match(said(await T.runSolTool("log_find", { words: "nowhere at all" }, {})), /Nothing in the recent history/);
    assert.match(said(await T.runSolTool("log_find", { words: "LUNCH" }, {})), new RegExp(`^${lunch.id} `), "the face's own name for the person");

    // erase, refused: no words this turn, or words the person did not say, or one word only
    const files = () => readdirSync(join(process.env.SOL_LOGDIR!, "values")).length;
    const before = files();
    for (const turn of [{}, { said: "what did I have for lunch" }, { said: "remove" }]) {
      const r = await T.runSolTool("log_erase", { id: note.id, yes: "take that line out" }, turn);
      assert.equal(r.isError, true);
      assert.match(said(r), /not erased: those words are not in what the person said this turn/);
    }
    assert.equal(files(), before, "nothing erased");
    assert.ok(!readLog(process.env.SOL_LOGDIR!).some((e) => e.kind === "log.erase"));

    // erase, on the person's own words: the value file goes, one log.erase says which event and who asked through which seat
    const r = await T.runSolTool("log_erase", { id: note.id, yes: "take that line out" }, { said: "Please take that line out of my history.", seat: "home" });
    assert.equal(r.isError, undefined, said(r));
    assert.match(said(r), /^Erased: the event's words are gone for good \(log\.erase, seq \d+\)\.$/);
    assert.equal(files(), before - 1);
    const all = readLog(process.env.SOL_LOGDIR!);
    const gone = all.find((e) => e.id === note.id)!, line = all.find((e) => e.kind === "log.erase")!;
    assert.equal(gone.erased, true, "the log's own say: no value file, read as erased");
    assert.equal(line.item, note.id);
    assert.deepEqual(line.by, { person: "person", agent: "home" });
    assert.equal(verifyLog(process.env.SOL_LOGDIR!).ok, true, "every id stands, the chain holds");

    // not found again, and not twice
    assert.match(said(await T.runSolTool("log_find", { words: "bank pin" }, {})), /Nothing in the recent history/);
    const again = await T.runSolTool("log_erase", { id: note.id, yes: "take that line out" }, { said: "take that line out" });
    assert.equal(again.isError, true);
    assert.match(said(again), /not a line of the person's own/);
    // a seat's line, or the engine's, is the record of what was done: neither found nor taken, on any words
    for (const id of [seats.id, k.since(0).find((e) => e.kind === "engine.start")!.id]) {
      const r2 = await T.runSolTool("log_erase", { id, yes: "take that line out" }, { said: "take that line out" });
      assert.equal(r2.isError, true);
      assert.match(said(r2), /not a line of the person's own/);
    }
    assert.ok(!readLog(process.env.SOL_LOGDIR!).find((e) => e.id === seats.id)!.erased);
  } finally { await syncKernel(home, false); }
});

test("findWords: a line before v1 is read only, and an empty phrase finds nothing (pure)", () => {
  assert.deepEqual(findWords([], "x"), []);
  assert.deepEqual(findWords([{ v: 0, id: "a", kind: "k", at: 0, value: { words: "x" } } as never], "x"), [], "a v0 line is read only");
  assert.deepEqual(findWords([], "   "), []);
});

// What Sol hands a Work seat with a message, on the log (seatlog.ts `sent`): a file named with @, and the stage's
// paragraph (what the person pointed at, work/blocks.ts askLine, main's #698). Only that it was handed and how big:
// never the words, never the block's title. With the frame off, nothing. No Claude runs here: a run's say() queues
// the message and writes the lines before any SDK is asked. Every folder is the test's own, set before anything is
// imported.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-seat-log-work-")));
after(() => rmSync(root, { recursive: true, force: true }));
const home = join(root, "home"), proj = join(root, "the-project");
mkdirSync(join(home, "things"), { recursive: true });
mkdirSync(proj);
writeFileSync(join(proj, "notes.md"), "a file to name");
process.env.SOL_HOME = home;
process.env.SOL_STATE = join(root, "state", "work.json");
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const { logFiles } = await import("../src/log.ts");
const { Run } = await import("../src/work/runs.ts");
const stage = await import("../src/work/blocks.ts");
stage.setStageFinder(async () => ({ cwd: proj }));

const logText = () => logFiles(join(root, "log")).map((f) => readFileSync(f, "utf8")).join("");

test("a Work message that points at a block: the stage's paragraph is a `sent` line, by its size, beside the @ file's", async () => {
  await syncKernel(home, true);
  try {
    const sid = "work-sess-0001";
    const w = await stage.whoFor(sid);
    const b = stage.compose(w, { kind: "card", title: "The secret week", body: "seven days" });
    const run = new Run(sid, proj, "opus", "high", "default", false, () => {});
    const mark = kernelNow()!.lastSeq();
    await run.say({ sessionId: sid, text: "move this one quietly, see @notes.md", stage: { on: [{ id: b.id }] } });
    const mine = kernelNow()!.since(mark).filter((e) => e.by.person === "seat" && (e.value as { session?: string }).session === sid);
    assert.deepEqual(mine.map((e) => e.kind), ["seat.turn", "seat.sent", "seat.sent"]);
    assert.deepEqual(mine.map((e) => e.by.agent), ["work", "work", "work"]);
    assert.deepEqual(mine[1].value, { session: sid, what: "mention", name: join(proj, "notes.md") });
    const para = stage.askLine(w.project, { on: [{ id: b.id }] });
    assert.match(para, /^\[the stage\]\non: The secret week \(block /, "the paragraph the seat reads under the words");
    assert.deepEqual(mine[2].value, { session: sid, what: "stage", bytes: Buffer.byteLength(para) });
    const text = logText();
    assert.ok(!text.includes("secret") && !text.includes("quietly"), "no words on the log: not the message, not the block's title");
    // a message that carries nothing of the stage hands no paragraph: no line
    const again = kernelNow()!.lastSeq();
    await run.say({ sessionId: sid, text: "and then?" });
    assert.deepEqual(kernelNow()!.since(again).filter((e) => e.kind === "seat.sent"), []);
  } finally { await syncKernel(home, false); }
});

test("with the frame off the same message writes nothing", async () => {
  const sid = "work-sess-0002";
  const w = await stage.whoFor(sid);
  const b = stage.compose(w, { kind: "card", title: "Another", body: "x" });
  const before = logText();
  const run = new Run(sid, proj, "opus", "high", "default", false, () => {});
  await run.say({ sessionId: sid, text: "this, and @notes.md", stage: { on: [{ id: b.id }] } });
  assert.equal(kernelNow(), null);
  assert.equal(logText(), before, "not a line");
});

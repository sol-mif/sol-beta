// The sticky note as Sol's own block (the design's step 8, the small room's example): its rules, its note its own data
// through the gate, loaded by the engine's kernel with the frame on and gone with it off. The engine's own sticky note
// (sticky.ts, the face's moves, the seat's `sticky` tool, the note handed over from engine/sticky.json) went from main
// on 2026-11-08 (#729), and what was tested of it here went with it. Every folder is the test's own: the home, Sol's
// folder (SOL_APPDIR) and the log (SOL_LOGDIR) are set before anything is imported.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-sticky-block-")));
after(() => rmSync(root, { recursive: true, force: true }));
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
const { STABLE_DIR, syncKernel, kernelNow } = await import("../src/kernel.ts");
const { Kernel } = await import("./kernels.ts");
const block = await import("../blocks/sticky/engine.ts");

const text = (r: { content: { type: string; text?: string }[] }) => (r.content[0] as { text: string }).text;
const homeOf = (name: string) => { const h = join(root, name); mkdirSync(join(h, "things"), { recursive: true }); return h; };

test("the rules, pure: one short line, a full note, cross out and back, the next page", () => {
  assert.equal(block.clean("- buy milk"), "buy milk");
  assert.ok(block.clean("x".repeat(block.MAX_CHARS + 1)) instanceof Error);
  assert.equal(block.clean("寫".repeat(block.MAX_CHARS)), "寫".repeat(block.MAX_CHARS));
  let n = block.noteOf(null, 100);
  assert.deepEqual(n, { lines: [], page: 100 });
  let i = 0;
  const id = () => `id${++i}`;
  for (let k = 0; k < block.MAX_LINES; k++) { const r = block.act(n, { action: "add", text: `t${k}` }, 100, id); assert.ok("note" in r); n = (r as { note: typeof n }).note; }
  assert.match((block.act(n, { action: "add", text: "one more" }, 100, id) as { why: string }).why, /the note is full/);
  n = (block.act(n, { action: "done", id: "id1" }, 100, id) as { note: typeof n }).note;
  const t = block.act(n, { action: "turn" }, 200, id) as { note: typeof n; said: string };
  assert.equal(t.note.lines.length, block.MAX_LINES - 1);
  assert.equal(t.note.page, 200);
  assert.match(t.said, /1 crossed-out line\(s\) torn off/);
  assert.match((block.act(n, { action: "remove", id: "nope" }, 100, id) as { why: string }).why, /No line nope/);
  assert.equal(block.noteOf({ lines: [{ id: 3, text: "x" }, { id: "a", text: "ok", done: "yes" }, "junk"] }, 1).lines.length, 1, "only lines that hold are read back");
});

test("in a small room from Sol's code: its note is its own data, through the gate, stamped with its version", async () => {
  const h = homeOf("home-a");
  const k = new Kernel(h, { logDir: join(h, "lab-log"), appDir: join(h, "app"), stable: STABLE_DIR });
  try {
    await k.sync();
    assert.equal(k.state("sticky")?.state, "loaded", k.state("sticky")?.why);
    assert.equal(k.isStable("sticky"), true);
    assert.equal(k.state("sticky")?.room, undefined, "the small room: nothing beyond its wall, no card");
    assert.equal(k.waiting("sticky"), null);
    const add = JSON.parse(text(await k.runTool("thing_sticky_note", { action: "add", text: "  - water the plant " })));
    assert.equal(add.ok, true);
    assert.deepEqual(add.lines.map((l: { text: string }) => l.text), ["water the plant"]);
    const kept = JSON.parse(readFileSync(join(h, "data", "sticky", "note.json"), "utf8"));
    assert.deepEqual(kept.lines.map((l: { text: string }) => l.text), ["water the plant"], "home/data/sticky/note.json");
    assert.ok(existsSync(join(h, "data", "sticky", ".stamp.json")), "stamped with the version that wrote it (step 5)");
    assert.ok(k.since().some((e) => e.kind === "plugin.write" && e.item === "sticky" && (e.value as { own?: boolean }).own === true));
    const seed = JSON.parse(text(await k.runTool("thing_sticky_note", { action: "seed", lines: JSON.stringify({ lines: [] }) })));
    assert.equal(seed.ok, false, "no seed: nothing hands the old engine/sticky.json over any more");
    assert.match(seed.why, /action is one of list, add, done, undo, remove, turn/);
    assert.deepEqual(seed.lines.map((l: { text: string }) => l.text), ["water the plant"], "and the note is as it was");
  } finally { await k.stop(); }   // stopped when a check fails too, so its worker cannot keep the file from ending
});

test("with the frame on the engine's kernel loads it and a seat's call reaches it; with the frame off there is no kernel and no note", async () => {
  const h = homeOf("home-b");
  await syncKernel(h, true);
  try {
    assert.equal(kernelNow()?.state("sticky")?.state, "loaded");
    assert.equal(kernelNow()?.isStable("sticky"), true);
    const r = JSON.parse(text(await kernelNow()!.runTool("thing_sticky_note", { action: "add", text: "from a seat" }, "codex")));
    assert.deepEqual(r.lines.map((l: { text: string }) => l.text), ["from a seat"], "an empty note to start: nothing is handed over from an old file");
  } finally { await syncKernel(h, false); }
  assert.equal(kernelNow(), null, "the frame off: no kernel");
  assert.ok(existsSync(join(root, "log")), "the log went to the test's own folder");
});

test("a block named sticky in the home is found first, in place of Sol's own", async () => {
  const h = homeOf("home-d");
  const d = join(h, "things", "sticky");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id: "sticky", title: "x", place: "card", reads: [], writes: [], stores: ["got"], versions: [{ v: 1, file: "v1.html" }] }));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "engine.js"), `export default (sol) => { sol.tool({ name: "note", args: { action: "string" }, run: (a) => { sol.write("got", a); return { ok: true }; } }); };`);
  await syncKernel(h, true);
  try {
    assert.equal(kernelNow()?.state("sticky")?.state, "loaded", "the home's loads: a small room asks for nothing");
    assert.equal(kernelNow()?.isStable("sticky"), false);
    await kernelNow()!.runTool("thing_sticky_note", { action: "add", text: "a line" }, "codex");
    assert.ok(existsSync(join(h, "data", "sticky", "got.json")), "the home's block took the call");
    assert.ok(!existsSync(join(h, "data", "sticky", "note.json")), "Sol's own never ran");
  } finally { await syncKernel(h, false); }
});

test("a note a seat wrote by hand into the block's data is read back by the note's own rules", () => {
  const n = block.noteOf({ lines: [{ id: "a", text: "fine" }, { id: "a", text: "same id" }, { id: "b", text: "two\nlines" }, { id: "c", text: "x".repeat(80) }, { id: "d e", text: "odd id" }, { id: "f", text: "- ok too", done: "yes" }] }, 1);
  assert.deepEqual(n.lines.map((l) => [l.id, l.text, l.done]), [["a", "fine", false], ["f", "ok too", false]]);
});

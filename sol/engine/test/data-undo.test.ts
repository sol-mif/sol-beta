// A block's own data goes back with its version, what it sent out does not, a block taken out is put back, and back to
// Sol as it came (the design's step 5: dataundo.ts, kernel.ts). Each test makes its own home, log folder and Sol folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync, readdirSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { toolName } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { undoDir, dataAt, stampsOf } from "../src/dataundo.ts";
import { askOf, writePress, printOf } from "../src/card.ts";
import { columnsOf, type Columns } from "../src/record.ts";

const mac = platform() === "darwin" && existsSync("/usr/bin/sandbox-exec");
const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-undo-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
const opts = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app"), big: { idleMs: 60_000 } });
const ENGINE = `export default (sol) => {
  sol.tool({ name: "put", args: { n: "number" }, run: ({ n }) => { sol.write("drafts", { n }); sol.write("shared.note", n); return "ok"; } });
  sol.tool({ name: "get", run: () => { try { return JSON.stringify(sol.read("drafts")); } catch (e) { return "said: " + e.message; } } });
};`;
function block(h: string, id: string, rec: Record<string, unknown> = {}, engine = ENGINE) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  const r = { id, title: id, place: "card", reads: [], writes: ["shared.note"], stores: ["drafts"], versions: [{ v: 1, file: "v1.html" }, { v: 2, file: "v1.html" }, { v: 3, file: "v1.html" }], current: 1, ...rec };
  writeFileSync(join(d, "record.json"), JSON.stringify(r));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "engine.js"), engine);
}
const text = (r: { content: { type: string; text?: string }[] }) => (r.content[0] as { text: string }).text;
const kinds = (k: Kernel, id: string | undefined, kind: string) => k.since().filter((e) => e.kind === kind && e.item === id);
const drafts = (h: string, id: string) => JSON.parse(readFileSync(join(h, "data", id, "drafts.json"), "utf8"));

test("own data goes back with its version: the last copy of the older one comes back, what the newer wrote is set aside, the shared pool stays and says so", async () => {
  const h = home();
  block(h, "week");
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.runTool(toolName("week", "put"), { n: 1 });
  assert.deepEqual(stampsOf(h, "week"), { drafts: 1 }, "stamped with the version that wrote it");
  assert.equal((await k.version("week", 2)).status, "restart");
  assert.deepEqual(drafts(h, "week"), { n: 1 }, "forward: the new version takes the data up");
  const fwd = kinds(k, "week", "plugin.data")[0];
  assert.deepEqual(fwd.value, { from: 1, to: 2 });
  await k.runTool(toolName("week", "put"), { n: 2 });
  assert.deepEqual(stampsOf(h, "week"), { drafts: 2 });
  const r = await k.back("week");
  assert.equal(k.state("week")?.v, 1);
  assert.deepEqual(drafts(h, "week"), { n: 1 }, "back: version 1's last copy");
  const line = kinds(k, "week", "plugin.data")[1].value as { back: boolean; restored: boolean; aside: string; shared: string[]; said: string };
  assert.equal(line.back, true);
  assert.equal(line.restored, true);
  assert.match(line.aside, /^data-undo\/week\/aside\/v2-\d+-[a-f0-9]{8}$/);
  assert.deepEqual(JSON.parse(readFileSync(join(h, line.aside, "drafts.json"), "utf8")), { n: 2 }, "what version 2 wrote is not dropped");
  assert.deepEqual(line.shared, ["shared.note"]);
  assert.match(line.said, /the shared data shared.note did not go back: other blocks use it/);
  assert.equal(JSON.parse(readFileSync(join(h, "data", "shared.note.json"), "utf8")), 2, "the shared pool is not wound back");
  assert.match(r.say, /what version 2 wrote is kept at data-undo\/week\/aside/, "the install tool says it too");
  assert.equal(text(await k.runTool(toolName("week", "get"), {})), '{"n":1}');
  assert.equal(dataAt(h, "week"), 1);
  assert.deepEqual(readdirSync(undoDir(h, "week")).sort(), ["aside", "now.json", "v1", "v2"], "one last copy a version, and what was set aside");
  await k.stop();
});

test("back to a version that kept no copy: the data stays as the newer left it, and the older one says the data is newer than it, in its place", async () => {
  const h = home();
  block(h, "late", { current: 3 });
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.runTool(toolName("late", "put"), { n: 3 });
  await k.version("late", 1);
  assert.deepEqual(drafts(h, "late"), { n: 3 }, "nothing of version 1 was kept: the data stays");
  const line = kinds(k, "late", "plugin.data")[0].value as { restored: boolean; said: string; aside: string };
  assert.equal(line.restored, false);
  assert.ok(line.aside, "a copy is set aside even so: the older version may write over the data");
  assert.match(line.said, /nothing of version 1's data was kept: the data stays as version 3 left it/);
  assert.equal(text(await k.runTool(toolName("late", "get"), {})), "said: the data drafts is newer than me: version 3 wrote it, this is version 1");
  assert.deepEqual(k.state("late")?.newer, ["drafts"]);
  assert.equal(k.state("late")?.state, "loaded", "said, not broken");
  assert.equal(kinds(k, "late", "plugin.trouble").length, 1);
  await k.version("late", 3);
  assert.equal(text(await k.runTool(toolName("late", "get"), {})), '{"n":3}');
  assert.equal(k.state("late")?.newer, undefined);
  await k.stop();
});

test("a move cut short is finished from its journal at the next load; a version changed while the engine was not running is carried at its start", async () => {
  const h = home();
  block(h, "cut");
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.runTool(toolName("cut", "put"), { n: 1 });
  await k.version("cut", 2);
  await k.runTool(toolName("cut", "put"), { n: 2 });
  await k.stop();
  // the engine is down; a person sets the record back by hand: the next engine carries the data at its start
  const rec = JSON.parse(readFileSync(join(h, "things", "cut", "record.json"), "utf8"));
  writeFileSync(join(h, "things", "cut", "record.json"), JSON.stringify({ ...rec, current: 1 }));
  // and a crash had cut the move short after the last copy: the journal says the next stage
  mkdirSync(join(h, "data-undo", "cut", "v2"), { recursive: true });
  writeFileSync(join(h, "data-undo", "cut", "v2", "drafts.json"), '{"n":2}');
  writeFileSync(join(h, "data-undo", "cut", "journal.json"), JSON.stringify({ from: 2, to: 1, stage: "aside", at: 7, tag: "abcdef12" }));
  const k2 = new Kernel(h, opts(h));
  await k2.sync();
  assert.equal(existsSync(join(h, "data-undo", "cut", "journal.json")), false, "finished: the journal goes");
  assert.deepEqual(drafts(h, "cut"), { n: 1 }, "version 1's last copy is back");
  assert.deepEqual(JSON.parse(readFileSync(join(h, "data-undo", "cut", "aside", "v2-7-abcdef12", "drafts.json"), "utf8")), { n: 2 });
  assert.equal(dataAt(h, "cut"), 1);
  await k2.stop();
});

test("taken out, then undo puts it back at its version; back to Sol as it came takes every block out, deletes nothing, one line", async () => {
  const h = home();
  block(h, "a");
  block(h, "b");
  block(h, "c", { off: true });
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.runTool(toolName("a", "put"), { n: 5 });
  await k.remove("a");
  assert.equal(k.state("a")?.off, true);
  const r = await k.undo("a");
  assert.deepEqual(r, { ok: true, from: 1, to: 1 });
  assert.equal(k.state("a")?.off, undefined);
  assert.equal(k.state("a")?.state, "loaded");
  assert.equal((kinds(k, "a", "undo.did")[0].value as { putBack: boolean }).putBack, true);
  assert.deepEqual(drafts(h, "a"), { n: 5 }, "its data was there all along");
  const f = await k.factory();
  assert.deepEqual(f, { off: ["a", "b"] }, "the one already out is not counted again");
  assert.deepEqual(kinds(k, undefined, "plugin.factory")[0].value, { off: ["a", "b"] });
  assert.deepEqual(k.tools(), []);
  for (const id of ["a", "b", "c"]) assert.ok(existsSync(join(h, "things", id, "engine.js")), "nothing deleted");
  assert.ok(existsSync(join(h, "data", "a", "drafts.json")));
  await k.undo("b");
  assert.equal(k.state("b")?.state, "loaded", "each is put back on its own");
  assert.equal(k.state("a")?.off, true);
  await k.stop();
});

test("what a big room sent out is marked on the log, and an undo says it does not come back", { skip: !mac }, async () => {
  const h = home();
  const rec = { room: "big", needs: { why: "x", programs: ["echo"], tools: [{ name: "go" }] }, stores: [], writes: [] };
  block(h, "sender", rec, `export default (sol) => { sol.tool({ name: "go", run: async () => (await sol.run("echo", ["hi"])).stdout }); };`);
  const ask = askOf((columnsOf({ ...rec }) as { columns: Columns }).columns);
  writePress(join(h, "app"), h, "sender", ask, printOf(ask, "x"), 0);
  writeFileSync(join(h, "things", "sender", "record.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(h, "things", "sender", "record.json"), "utf8")), current: 2 }));
  const k = new Kernel(h, opts(h));
  await k.sync();
  assert.equal(text(await k.runTool(toolName("sender", "go"), {})), "hi\n");
  await k.runTool(toolName("sender", "go"), {});
  assert.equal((kinds(k, "sender", "plugin.ran")[0].value as { out: boolean }).out, true);
  const r = await k.back("sender");
  assert.match(r.say, /2 things it sent out while version 2 ran do not come back/);
  assert.equal((kinds(k, "sender", "undo.did")[0].value as { gone: number }).gone, 2);
  await k.stop();
});

test("the home is a seat's to write: a journal that names paths, a folder that is a link, a version that is not a number move nothing", async () => {
  const h = home();
  block(h, "j");
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.runTool(toolName("j", "put"), { n: 1 });
  await k.stop();
  const victim = join(h + "-victim");
  mkdirSync(victim, { recursive: true });
  homes.push(victim);
  writeFileSync(join(victim, "keep.txt"), "mine");
  writeFileSync(join(h, "data-undo", "j", "journal.json"), JSON.stringify({ from: "../../../x", to: 1, stage: "aside", aside: victim, at: 1 }));
  const k2 = new Kernel(h, opts(h));
  await k2.sync();
  assert.match(k2.state("j")?.why ?? "", /its data's journal does not hold/);
  assert.ok(existsSync(join(victim, "keep.txt")), "nothing outside the home touched");
  assert.deepEqual(drafts(h, "j"), { n: 1 });
  await k2.stop();
  rmSync(join(h, "data-undo", "j", "journal.json"));
  rmSync(join(h, "data-undo", "j"), { recursive: true });
  const { symlinkSync } = await import("node:fs");
  symlinkSync(victim, join(h, "data-undo", "j"));
  const k3 = new Kernel(h, opts(h));
  await k3.sync();
  assert.match(k3.state("j")?.why ?? "", /data-undo\/j is not a folder \(a link, or a file\)/);
  assert.ok(existsSync(join(victim, "keep.txt")));
  await k3.stop();
  // a last copy planted as a link to a folder outside: going back copies none of it
  rmSync(join(h, "data-undo", "j"));
  mkdirSync(join(h, "data-undo", "j"), { recursive: true });
  writeFileSync(join(h, "data-undo", "j", "now.json"), JSON.stringify({ v: 2 }));
  writeFileSync(join(victim, "drafts.json"), '{"stolen":true}');
  symlinkSync(victim, join(h, "data-undo", "j", "v1"));
  const k4 = new Kernel(h, opts(h));
  await k4.sync();
  assert.match(k4.state("j")?.why ?? "", /v1 is not a folder \(a link, or a file\)/);
  assert.deepEqual(drafts(h, "j"), { n: 1 }, "nothing of the outside folder came in, and its data stayed where it was");
  await k4.stop();
});

test("the first refute: back to a version with no copy keeps the newer's data even when the older writes over it; a new block under an old id starts with no copies", async () => {
  const h = home();
  block(h, "b", { current: 2 });
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.runTool(toolName("b", "put"), { n: 22 });
  await k.version("b", 1);   // no copy of version 1: the data stays
  await k.runTool(toolName("b", "put"), { n: 11 });   // and version 1 writes over it
  await k.version("b", 2);
  await k.version("b", 1);
  const all = JSON.stringify(readdirSync(join(h, "data-undo", "b", "aside")).map((d) => readFileSync(join(h, "data-undo", "b", "aside", d, "drafts.json"), "utf8")));
  assert.match(all, /22/, "version 2's data is still kept somewhere");
  rmSync(join(h, "things", "b"), { recursive: true });
  await k.sync();   // gone from the home while the engine runs
  await k.stop();
  const k2 = new Kernel(h, opts(h));
  await k2.sync();
  const mark = k2.lastSeq();
  block(h, "b", { current: 1 });
  await k2.sync();
  assert.equal(kinds(k2, "b", "plugin.data").filter((e) => e.seq > mark).length, 0, "a new block under the old id: no move from the old one's version");
  assert.ok(!existsSync(join(h, "data-undo", "b", "now.json")) || JSON.parse(readFileSync(join(h, "data-undo", "b", "now.json"), "utf8")).v === 1);
  assert.ok(readdirSync(join(h, "data-undo")).some((d) => d.startsWith("b.gone-")), "the old copies are put by, not deleted");
  await k2.stop();
});

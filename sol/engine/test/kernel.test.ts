// What every block passes through (#633, freeform #629): the log, the loader, the gate, undo (src/kernel.ts). The block
// is the fixture from #630 (sol/design/system/fixtures/things/week) with the engine halves in fixtures/kernel, copied
// into a home made for each test, never anyone's real one. The last test runs a real engine on its own port and home
// with SOL_FRAME=on and walks the issue's "What to try".
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gate, GateError, logFile, toolName } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { logFiles } from "../src/log.ts";
import { bigRoomHere } from "../src/bigroom.ts";
import { fileTrail } from "../src/team/v3/places-trail.ts";   // the stand-in Cowork v3 reads it with, the same code
import { readThings } from "../src/things.ts";
import { freePort, ownHealth } from "./test-engine.ts";
import { loadThings, engineFault, canUndo, wroteNow } from "../../mac/src/home/frameRules.ts";

const SOL = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = join(SOL, "design/system/fixtures");
const KFIX = join(FIX, "kernel");
const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });
/** a home with the week from #630 and, unless told otherwise, its version-1 engine half beside it */
function home(o: { engine?: string | null } = {}) {
  const h = mkdtempSync(join(tmpdir(), "sol-kernel-"));
  homes.push(h);
  cpSync(join(FIX, "things"), join(h, "things"), { recursive: true });
  if (o.engine !== null) copyFileSync(join(KFIX, o.engine ?? "engine.js"), join(h, "things", "week", "engine.js"));
  mkdirSync(join(h, "data"));
  writeFileSync(join(h, "data", "calendar.week.json"), JSON.stringify({ mon: 6, sat: 9 }));
  return h;
}
const week = (h: string) => join(h, "things", "week");
/** a test kernel's log and Sol's own folder go beside its home (a kernel is never made without them); the old file in the home, if any, is carried over once */
const lab = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app") });
const kinds = (k: Kernel, since = 0) => k.since(since).map((e) => `${e.kind}${e.item ? ` ${e.item}` : ""}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** why a big room nobody pressed is not running: on a Mac it waits for its press; elsewhere there is no big room to wait for */
const WAITS = bigRoomHere() === null ? /waiting for a person to press its card/ : /the big room runs on a Mac only/;
/** a block of its own, written into a home: a record that holds and an engine half */
function block(h: string, id: string, engine: string, rec: { reads?: string[]; writes?: string[] } = {}) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id, title: id, place: "card", reads: rec.reads ?? [], writes: rec.writes ?? [], versions: [{ v: 1, file: "v1.html", at: "2026-11-05", contract: 1 }] }));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "ask.md"), "a test block");
  writeFileSync(join(d, "engine.js"), engine);
}

test("the gate: a read or a write passes only when the record declares it", () => {
  const rec = { reads: ["calendar.week"], writes: ["week.seen"] };
  assert.deepEqual(gate(rec, "read", "calendar.week"), { ok: true });
  assert.deepEqual(gate(rec, "write", "week.seen"), { ok: true });
  assert.match((gate(rec, "write", "calendar.week") as { why: string }).why, /not among the writes its record declares \(week.seen\)/);
  assert.match((gate(rec, "read", "mail.inbox") as { why: string }).why, /not among the reads/);
  assert.match((gate({}, "read", "x") as { why: string }).why, /declares no reads/);
  assert.match((gate({ reads: [], writes: [] }, "write", "x") as { why: string }).why, /\(none\)/);
});

test("the loader: the week's engine half loads, writes its line, registers its tool; a seat's step reads through the gate", async () => {
  const h = home();
  const k = new Kernel(h, lab(h));
  await k.sync();
  assert.deepEqual(kinds(k), ["plugin.line week", "plugin.load week"], "its own line at load, then the load");
  assert.deepEqual(k.since(1)[0].value, { v: 1, engine: "engine.js" });
  assert.deepEqual(k.state("week"), { state: "loaded", v: 1, tools: ["thing_week_free"] });
  assert.deepEqual(k.tools().map((t) => toolName(t.block, t.name)), ["thing_week_free"]);
  const r = await k.runTool("thing_week_free", { day: "sat" }, "claude");
  assert.deepEqual(r, { content: [{ type: "text", text: "sat: 9 free hours" }] });
  const step = k.since().at(-1)!;
  assert.equal(step.kind, "tool.call");
  assert.deepEqual(step.by, { person: "seat", agent: "claude" });
  assert.deepEqual(step.value, { tool: "free" });
  const none = await k.runTool("thing_week_nope", {});
  assert.equal(none.isError, true);
  assert.match((none.content[0] as { text: string }).text, /not loaded/);
  await k.sync();
  assert.equal(k.since().filter((e) => e.kind === "plugin.load").length, 1, "nothing changed: nothing loaded again");
  await k.stop();
  assert.equal(k.since().at(-1)!.kind, "plugin.unload");
  assert.deepEqual(k.tools(), [], "turned off: every tool unwound");
});

test("the log is the trail's file: one JSON line per step, read again by the next engine, seq going on", async () => {
  const h = home();
  const k = new Kernel(h, lab(h));
  await k.sync();
  const day = logFiles(join(h, "lab-log"))[0];
  const lines = readFileSync(day, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].project, "home");
  assert.deepEqual(fileTrail(day).since("home").map((e) => e.id), k.since().map((e) => e.id), "places-trail.ts reads a day's file as its own");
  assert.equal(existsSync(logFile(h)), false, "nothing at the old place in the home");
  await k.stop();
  const again = new Kernel(h, lab(h));
  assert.equal(again.lastSeq(), 3);
  await again.sync();
  assert.deepEqual(again.since(3).map((e) => e.seq), [4, 5]);
  assert.deepEqual(again.since(4).map((e) => e.kind), ["plugin.load"], "since= gives only what came after");
  await again.stop();
});

test("a second version replaces the first (release, its write shown), and undo brings the first back, one line", async () => {
  const h = home();
  const k = new Kernel(h, lab(h));
  await k.sync();
  const before = k.lastSeq();
  for (const f of ["v2.html", "v2.engine.js"]) copyFileSync(join(KFIX, f), join(week(h), f));
  copyFileSync(join(KFIX, "record.v2.json"), join(week(h), "record.json"));
  await k.sync();
  assert.deepEqual(kinds(k, before), ["plugin.unload week", "plugin.release week", "plugin.line week", "plugin.write week", "plugin.load week"]);
  assert.deepEqual(k.since(before).find((e) => e.kind === "plugin.release")!.value, { from: 1, to: 2 });
  const st = k.state("week")!;
  assert.equal(st.v, 2);
  assert.equal(st.wrote?.what, "week.seen", "the face is told of the write");
  assert.ok(existsSync(join(h, "data", "week.seen.json")));
  assert.match(((await k.runTool("thing_week_free", { day: "mon" })).content[0] as { text: string }).text, /version 2/);

  const mid = k.lastSeq();
  assert.deepEqual(await k.undo("week"), { ok: true, from: 2, to: 1 });
  assert.deepEqual(kinds(k, mid), ["plugin.unload week", "undo.did week", "plugin.line week", "plugin.load week"]);
  assert.equal(JSON.parse(readFileSync(join(week(h), "record.json"), "utf8")).current, 1, "the record says version 1");
  assert.deepEqual(k.state("week"), { state: "loaded", v: 1, tools: ["thing_week_free"] });
  assert.equal(((await k.runTool("thing_week_free", { day: "mon" })).content[0] as { text: string }).text, "mon: 6 free hours", "the first engine half is back");
  await k.sync();
  assert.equal(k.since(mid).filter((e) => e.kind === "plugin.load").length, 1, "the next look finds nothing new to load");
  const r = await k.undo("week");
  assert.equal(r.ok, false);
  assert.match((r as { why: string }).why, /first/);
  assert.match(((await k.undo("nobody")) as { why: string }).why, /no block nobody/);
  await k.stop();
});

test("an engine half that throws at load is broken with its reason; the rest stays up", async () => {
  const h = home({ engine: "broken.engine.js" });
  block(h, "fine", `export default (sol) => { sol.tool({ name: "hi", run: () => "hi" }); };`);
  const k = new Kernel(h, lab(h));
  await k.sync();
  assert.deepEqual(k.state("week"), { state: "broken", why: "its engine half threw at load: calendar.week is not there yet", v: 1, tools: [] });
  assert.deepEqual(k.since().find((e) => e.kind === "plugin.broken")?.value, { why: "its engine half threw at load: calendar.week is not there yet" });
  assert.equal(k.state("fine")?.state, "loaded");
  assert.deepEqual(k.tools().map((t) => t.block), ["fine"], "only the block that loaded has tools");
  // repaired in the home: loaded again on the next look
  copyFileSync(join(KFIX, "engine.js"), join(week(h), "engine.js"));
  await k.sync();
  assert.equal(k.state("week")?.state, "loaded");
  // a record that does not hold, an engine file that is not a name: broken, said
  writeFileSync(join(h, "things", "fine", "record.json"), "{ nope");
  block(h, "far", "export default () => {}");
  const rec = JSON.parse(readFileSync(join(h, "things", "far", "record.json"), "utf8"));
  rec.versions[0].engine = "../../escape.js";
  writeFileSync(join(h, "things", "far", "record.json"), JSON.stringify(rec));
  await k.sync();
  assert.match(k.state("fine")?.why ?? "", /not JSON/);
  assert.match(k.state("far")?.why ?? "", /not a file name beside the record/);
  await k.stop();
});

test("unload unwinds everything a block registered: its tool, its listener, its schedule, what its load returned", async () => {
  const h = home({ engine: null });
  // the block runs in its worker: what it hears and does, it says on the log (a line by ear), and the test reads that
  block(h, "ear", `export default (sol) => {
    sol.tool({ name: "say", args: { n: "number" }, run: ({ n }) => { sol.log("said " + n); return "n=" + n; } });
    sol.listen((e) => sol.log("heard " + e.kind + " " + (e.item ?? "")));
    sol.every(1000, () => sol.log("tick"));
    return () => sol.log("off");
  };`);
  block(h, "talker", `export default (sol) => { sol.tool({ name: "talk", run: () => { sol.log("hello"); return "ok"; } }); };`);
  const k = new Kernel(h, lab(h));
  const said = (since = 0) => k.since(since).filter((e) => e.kind === "plugin.line" && e.by.agent === "ear").map((e) => (e.value as { line: string }).line);
  await k.sync();
  await wait(100);
  assert.deepEqual(said().filter((x) => x.startsWith("heard")), ["heard plugin.load ear", "heard plugin.load talker", "heard plugin.load week"], "it hears every load the engine writes after its own start");
  assert.deepEqual(k.tools().map((t) => toolName(t.block, t.name)).sort(), ["thing_ear_say", "thing_talker_talk"]);
  assert.deepEqual(k.tools().find((t) => t.block === "ear")!.args, { n: "number" });
  let mark = k.lastSeq();
  await k.runTool("thing_talker_talk", {});
  await wait(100);
  assert.deepEqual(said(mark).filter((x) => x.startsWith("heard")), ["heard tool.call talker", "heard plugin.line talker"], "it hears the others' steps on the log");
  mark = k.lastSeq();
  assert.equal(((await k.runTool("thing_ear_say", { n: 1 })).content[0] as { text: string }).text, "n=1");
  await wait(100);
  assert.ok(said(mark).includes("heard tool.call ear"), "a seat's step through its own tool reaches it");
  assert.ok(!said(mark).includes("heard plugin.line ear"), "a line it wrote itself never does (no loop of one)");
  await wait(1100);
  assert.ok(said().includes("tick"), "its schedule ran");
  rmSync(join(h, "things", "ear"), { recursive: true });
  await k.sync();
  assert.ok(said().includes("off"), "what its load returned ran");
  assert.deepEqual(k.tools().map((t) => t.block), ["talker"], "its tool is gone");
  assert.equal(k.state("ear"), undefined);
  assert.deepEqual(kinds(k).slice(-1), ["plugin.unload ear"]);
  mark = k.lastSeq();
  await k.runTool("thing_talker_talk", {});
  await wait(1100);
  assert.deepEqual(said(mark), [], "no listener and no schedule after unload");
  await k.stop();
});

test("a block's own trouble is its own: a listener or a schedule that throws or rejects is logged, the engine stays up", async () => {
  const h = home({ engine: null });
  block(h, "rough", `export default (sol) => {
    sol.listen(() => Promise.reject(new Error("later")));
    sol.listen(() => { throw new Error("now"); });
    return () => Promise.reject(new Error("at unload"));
  };`);
  block(h, "other", `export default (sol) => { sol.tool({ name: "go", run: () => { sol.log("x"); return "ok"; } }); };`);
  const k = new Kernel(h, lab(h));
  await k.sync();
  await k.runTool("thing_other_go", {});
  await new Promise((r) => setTimeout(r, 50));
  const why = k.since().filter((e) => e.kind === "plugin.trouble").map((e) => (e.value as { why: string }).why);
  assert.ok(why.includes("later") && why.includes("now"), JSON.stringify(why));
  rmSync(join(h, "things", "rough"), { recursive: true });
  await k.sync();
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(k.since().some((e) => e.kind === "plugin.trouble" && (e.value as { why: string }).why === "at unload"));
  await k.stop();
});

test("the gate holds an engine half's calls: a write it did not declare is refused and logged, a name that is not one too", async () => {
  const h = home({ engine: null });
  block(h, "sneak", `export default (sol) => {
    sol.tool({ name: "grab", run: () => sol.read("mail.inbox") });
    sol.tool({ name: "scrawl", run: () => sol.write("calendar.week", {}) });
    sol.tool({ name: "climb", run: () => sol.write("../../etc", 1) });
    sol.tool({ name: "note", run: () => { sol.write("sneak.note", 1); return "kept"; } });
  };`, { reads: ["calendar.week"], writes: ["sneak.note"] });
  const k = new Kernel(h, lab(h));
  await k.sync();
  const grab = await k.runTool("thing_sneak_grab", {});
  assert.equal(grab.isError, true);
  assert.match((grab.content[0] as { text: string }).text, /refused: sneak may not read mail.inbox/);
  const scrawl = await k.runTool("thing_sneak_scrawl", {});
  assert.match((scrawl.content[0] as { text: string }).text, /may not write calendar.week/);
  assert.deepEqual(JSON.parse(readFileSync(join(h, "data", "calendar.week.json"), "utf8")), { mon: 6, sat: 9 }, "nothing written");
  const climb = await k.runTool("thing_sneak_climb", {});
  assert.match((climb.content[0] as { text: string }).text, /is not a name/);
  const refused = k.since().filter((e) => e.kind === "plugin.refused");
  assert.deepEqual(refused.map((e) => (e.value as { what: string }).what), ["mail.inbox", "calendar.week", "../../etc"]);
  assert.deepEqual(refused[0].by, { person: "engine", agent: "sneak" });
  assert.equal(((await k.runTool("thing_sneak_note", {})).content[0] as { text: string }).text, "kept");
  assert.equal(k.state("sneak")?.wrote?.what, "sneak.note");
  assert.ok(new GateError("x") instanceof Error);
  await k.stop();
});

// ---- the wall (the second read's fix round): each engine half in a worker of its own, sol its only door ----

test("the wall: an engine half cannot import node:fs, net, child_process, a package or a file outside its folder, and has no process or fetch", async () => {
  const h = home();
  block(h, "peek", `export default async (sol) => {
    const tries = {
      fs: () => import("node:fs"), bare: () => import("fs"), net: () => import("node:net"), child: () => import("node:child_process"),
      worker: () => import("node:worker_threads"), module: () => import("node:module"), pkg: () => import("zod"),
      up: () => import("../week/engine.js"), abs: () => import("/etc/hostname"), data: () => import("data:text/javascript,export default 1"),
      process: () => process.pid, builtin: () => globalThis.process.getBuiltinModule("node:fs"), fetch: () => fetch("http://127.0.0.1:1"),
      socket: () => new WebSocket("ws://127.0.0.1:1"), channel: () => new BroadcastChannel("sol"),
    };
    for (const [n, f] of Object.entries(tries)) { try { await f(); sol.log(n + ": open"); } catch { sol.log(n + ": shut"); } }
    sol.tool({ name: "look", run: async () => (await import("node:fs")).readFileSync("/etc/hostname", "utf8") });
  };`);
  block(h, "statics", `import { readFileSync } from "node:fs";\nexport default (sol) => { sol.log(readFileSync("/etc/hostname", "utf8")); };`);
  block(h, "oldstyle", `const cp = require("node:child_process");\nmodule.exports = function (sol) { sol.log(String(cp.execSync("id"))); };`);
  const k = new Kernel(h, lab(h));
  await k.sync();
  const lines = k.since().filter((e) => e.kind === "plugin.line" && e.by.agent === "peek").map((e) => (e.value as { line: string }).line);
  assert.deepEqual(lines, ["fs", "bare", "net", "child", "worker", "module", "pkg", "up", "abs", "data", "process", "builtin", "fetch", "socket", "channel"].map((n) => `${n}: shut`));
  const look = await k.runTool("thing_peek_look", {});
  assert.equal(look.isError, true);
  assert.match((look.content[0] as { text: string }).text, /refused: peek may not import node:fs/);
  assert.match(k.state("statics")?.why ?? "", /threw at load: refused: statics may not import node:fs/);
  assert.match(k.state("oldstyle")?.why ?? "", /threw at load: refused: oldstyle may not import node:child_process/);
  assert.equal(k.state("week")?.state, "loaded", "the others load as they did");
  assert.equal(((await k.runTool("thing_week_free", { day: "sat" })).content[0] as { text: string }).text, "sat: 9 free hours", "sol.read still passes, through the gate");
  copyFileSync(join(KFIX, "sneak.engine.js"), join(week(h), "engine.js"));   // the PR's "What to try"
  await k.sync();
  assert.equal(k.state("week")?.why, "its engine half threw at load: refused: week may not import node:fs: an engine half reaches Sol only through sol");
  await k.stop();
});

test("the wall: a package under the block's own node_modules is refused like any other, by its name or by a path into it", async () => {
  const h = home({ engine: null });
  block(h, "bundled", `import { open } from "localpkg";\nexport default (sol) => { sol.log(open()); };`);
  block(h, "bundled2", `export default async (sol) => {
    for (const s of ["localpkg", "localpkg/index.js", "#own"]) { try { await import(s); sol.log(s + ": open"); } catch (e) { sol.log(s + ": shut"); } }
    sol.log((await import("./node_modules/localpkg/index.js")).open());
  };`);
  for (const id of ["bundled", "bundled2"]) {
    const pkg = join(h, "things", id, "node_modules", "localpkg");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "localpkg", type: "module", main: "index.js" }));
    writeFileSync(join(pkg, "index.js"), `export const open = () => "localpkg ran";`);
    writeFileSync(join(h, "things", id, "package.json"), JSON.stringify({ type: "module", imports: { "#own": "./node_modules/localpkg/index.js" } }));
  }
  const k = new Kernel(h, lab(h));
  await k.sync();
  assert.equal(k.state("bundled")?.why, "its engine half threw at load: refused: bundled may not import localpkg: an engine half reaches Sol only through sol");
  const lines = k.since().filter((e) => e.kind === "plugin.line" && e.by.agent === "bundled2").map((e) => (e.value as { line: string }).line);
  assert.deepEqual(lines, ["localpkg: shut", "localpkg/index.js: shut", "#own: shut", "localpkg ran"], "a bare name is shut; a relative path inside its own folder is its own file");
  await k.stop();
});

test("unload ends the worker: the block's own timers, pending timeouts and a tool call in flight die with it, and the call's answer is dropped", async () => {
  const h = home({ engine: null });
  block(h, "busy", `export default (sol) => {
    setInterval(() => sol.log("own tick"), 100);
    setTimeout(() => sol.write("busy.late", 1), 600);
    sol.tool({ name: "slow", run: () => new Promise((r) => setTimeout(() => { sol.write("busy.slow", 1); r("done"); }, 600)) });
  };`, { writes: ["busy.late", "busy.slow"] });
  const k = new Kernel(h, lab(h));
  await k.sync();
  await wait(250);
  assert.ok(k.since().some((e) => e.kind === "plugin.line" && e.by.agent === "busy"), "its own interval runs while it is loaded");
  const call = k.runTool("thing_busy_slow", {});
  await wait(50);
  rmSync(join(h, "things", "busy"), { recursive: true });
  await k.sync();
  const mark = k.lastSeq();
  const r = await call;
  assert.equal(r.isError, true);
  assert.match((r.content[0] as { text: string }).text, /busy was unloaded .*its answer is dropped/);
  await wait(900);
  assert.deepEqual(k.since(mark).filter((e) => e.by.agent === "busy"), [], "nothing from it after unload: no tick, no write");
  assert.ok(!k.since().some((e) => e.kind === "plugin.write"), "neither the timeout's write nor the call's ever happened");
  assert.ok(!existsSync(join(h, "data", "busy.late.json")) && !existsSync(join(h, "data", "busy.slow.json")));
  await k.stop();
});

test("a block that hangs at load, exits, throws later or runs out of memory is broken with why; the others stay up", { timeout: 60_000 }, async () => {
  const h = home();
  block(h, "hang", `while (true) {}\nexport default () => {};`);
  block(h, "quit", `process.exit(0);\nexport default () => {};`);
  block(h, "hog", `export default () => { const a = []; for (;;) a.push(new Array(1e6).fill(Math.random())); };`);
  block(h, "later", `export default (sol) => { sol.tool({ name: "x", run: () => { setTimeout(() => { throw new Error("boom later"); }, 50); return "x"; } }); };`);
  block(h, "stuck", `export default (sol) => { sol.tool({ name: "spin", run: () => { for (;;) {} } }); };`);
  const k = new Kernel(h, { ...lab(h), loadMs: 3000, callMs: 500 });
  await k.sync();
  assert.match(k.state("hang")?.why ?? "", /did not finish loading within 3000 ms/);
  assert.match(k.state("quit")?.why ?? "", /threw at load: .*exit/);
  assert.equal(k.state("hog")?.state, "broken");
  assert.match(k.state("hog")?.why ?? "", /memory|did not finish loading/);
  assert.equal(k.state("later")?.state, "loaded");
  assert.equal(((await k.runTool("thing_later_x", {})).content[0] as { text: string }).text, "x");
  await wait(300);
  assert.deepEqual(k.state("later"), { state: "broken", why: "its engine half threw: boom later", v: 1, tools: [] }, "a throw in its own timer breaks it, later");
  assert.equal((await k.runTool("thing_later_x", {})).isError, true, "its tool is gone with it");
  const spin = await k.runTool("thing_stuck_spin", {});
  assert.match((spin.content[0] as { text: string }).text, /did not answer within 500 ms/, "a tool that never answers does not hold the seat");
  assert.equal(((await k.runTool("thing_week_free", { day: "mon" })).content[0] as { text: string }).text, "mon: 6 free hours", "the engine and the others are up");
  assert.deepEqual(k.since().filter((e) => e.kind === "plugin.broken").map((e) => e.item).sort(), ["hang", "hog", "later", "quit"]);
  await k.stop();
});

test("the face: a broken engine half is the frame's fault, undo only with a version before, a write shown while fresh", () => {
  const h = home();
  const [t] = readThings(h);
  const half = { state: "broken" as const, why: "its engine half threw at load: x", v: 1, tools: [] };
  const { loaded } = loadThings([{ ...t, engine: half }], ["card"]);
  assert.deepEqual(loaded[0].engine, half, "the engine's word reaches the frame");
  assert.deepEqual(engineFault(half), { why: "its engine half threw at load: x", line: null });
  assert.equal(engineFault({ state: "loaded", tools: [] }), null);
  assert.equal(engineFault(undefined), null, "the frame off on the engine: the face is as it was");
  assert.equal(canUndo({ versions: [{ v: 1, file: "v1.html", at: "", contract: 1 }], current: 1 }), false);
  assert.equal(canUndo({ versions: [{ v: 1, file: "v1.html", at: "", contract: 1 }, { v: 2, file: "v2.html", at: "", contract: 1 }], current: 2 }), true);
  const w = { state: "loaded" as const, tools: [], wrote: { what: "week.seen", at: 1000 } };
  assert.equal(wroteNow(w, 2000), "week.seen");
  assert.equal(wroteNow(w, 6000), null, "gone once it is old");
  assert.equal(wroteNow({ state: "loaded", tools: [] }, 2000), null);
});

// ---- the issue's "What to try", on a real engine ----

const ENGINE = join(import.meta.dirname, "..");
let engine: ChildProcess | null = null;
after(() => { engine?.kill(); });

test("a real engine with SOL_FRAME=on: GET /log shows the load, /things says the engine half, the tool is listed, undo by POST", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "sol-kernel-wire-"));
  homes.push(dir);
  const h = join(dir, "home");
  mkdirSync(h);
  cpSync(join(FIX, "things"), join(h, "things"), { recursive: true });
  copyFileSync(join(KFIX, "engine.js"), join(week(h), "engine.js"));
  for (const f of ["v2.html", "v2.engine.js"]) copyFileSync(join(KFIX, f), join(week(h), f));
  copyFileSync(join(KFIX, "record.v2.json"), join(week(h), "record.json"));
  const PORT = await freePort();   // the system's free port, not a fixed range another run shares (#938)
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: h, SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
      SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_LOGDIR: join(dir, "log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_FRAME: "on", SOL_APPDIR: join(dir, "app"),
    },
  });
  await ownHealth(engine, PORT);   // the engine this test started, not another run's on the port
  const url = `http://127.0.0.1:${PORT}`;
  const get = async (p: string) => (await fetch(url + p)).json() as Promise<any>;
  let log: any = null;
  const SOL_OWN = ["file-it", "sticky"];   // Sol's own blocks (Stable, steps 7 and 8) load beside the home's
  // the home's week and Sol's own two come one after another, so the log is asked until all three are on it
  const said = (kind: string, item: string) => log?.events?.some((e: any) => e.kind === kind && e.item === item);
  for (let i = 0; i < 150 && !(said("plugin.load", "week") && said("plugin.load", "sticky") && said("plugin.broken", "file-it")); i++) {
    try { log = await get("/log"); } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const fileIt = log.events.filter((e: any) => e.item === "file-it");   // Sol's own file it (Stable, step 7) waits for its card
  assert.deepEqual(fileIt.map((e: any) => [e.kind, WAITS.test(e.value?.why ?? "")]), [["plugin.broken", true]]);
  assert.deepEqual(log.events.filter((e: any) => e.item === "sticky").map((e: any) => e.kind), ["plugin.load"], "Sol's own sticky note, a small room, loads with no card (step 8)");
  assert.deepEqual(log.events.filter((e: any) => !SOL_OWN.includes(e.item)).map((e: any) => e.kind), ["engine.start", "engine.tz", "plugin.line", "plugin.write", "plugin.load"], "the start says its engine and its timezone first (the event format v1); then version 2 loaded: its line, its write, the load");
  const things = await get("/things");
  assert.deepEqual(things.things[0].engine.tools, ["thing_week_free"]);
  assert.equal(things.things[0].engine.wrote.what, "week.seen");
  assert.deepEqual((await get("/things/tools")).tools.map((t: any) => t.name), ["thing_sticky_note", "thing_week_free"], "the tools are listed for a seat, Sol's own sticky note's too");
  const undo = await fetch(`${url}/things/week/undo`, { method: "POST" });
  assert.equal(undo.status, 200);
  assert.deepEqual(await undo.json(), { ok: true, from: 2, to: 1 });
  const after2 = await get(`/log?since=${log.last}`);
  assert.deepEqual(after2.events.map((e: any) => e.kind), ["plugin.unload", "undo.did", "plugin.line", "plugin.load"]);
  assert.equal((await get("/things")).things[0].engine.v, 1);
  const again = await fetch(`${url}/things/week/undo`, { method: "POST" });
  assert.equal(again.status, 409, "nothing before version 1");
  const page = await fetch(`${url}/things/week/undo`, { method: "POST", headers: { origin: "https://elsewhere.example" } });
  assert.equal(page.status, 403, "a page from elsewhere cannot undo");
});

// The log's step 1 (the backend design in personify-lab, sol/docs/backend-design-v1/DESIGN.md "一、帳"): the file moves
// out of the home to logDir(), a file a day (step 1b), the old file is carried over once and then left as it is (it was a mirror until #691), and the seats' own steps go on it
// as four kinds that never carry words. The last test runs a real engine with a stand-in codex and reads the log back.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync, realpathSync, cpSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir, homedir, platform } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { Kernel } from "./kernels.ts";
import { logDir, logFile, logFiles, readLog, openLog, dayTrail, dayOf, lastSeqIn, KEEP, PAGE } from "../src/log.ts";
import { fileOf, sizeOf, claudeTokens, codexTokens, codexStepOf, base64Bytes, turnStarted, stepTaken, sentAtStart } from "../src/seatlog.ts";
import { summarize, claudeCounts, codexCounts, reconcile } from "../src/logcheck.ts";
import type { Ev } from "../src/file-trail.ts";
import { freePort } from "./test-engine.ts";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ENGINE, "..", "design/system/fixtures");
const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (name: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), name))); dirs.push(d); return d; };
const lines = (f: string) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Ev);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("where the log lives: SOL_LOGDIR first (resolved), else the app's own folder, one folder per home, never the home or the checkout", () => {
  const was = process.env.SOL_LOGDIR;
  const home = "/Users/me/projects/sol/sol/home";
  process.env.SOL_LOGDIR = "/tmp/x-log";
  assert.equal(logDir(home), "/tmp/x-log");
  process.env.SOL_LOGDIR = "rel/log";
  assert.equal(logDir(home), resolve("rel/log"), "a relative SOL_LOGDIR is resolved");
  delete process.env.SOL_LOGDIR;
  const d = logDir(home);
  const base = platform() === "darwin" ? join(homedir(), "Library", "Application Support", "Sol", "log") : join(homedir(), ".local", "share", "sol", "log");
  assert.equal(d, join(base, "-Users-me-projects-sol-sol-home"));
  assert.notEqual(logDir("/Users/me/other/home"), d, "two homes, two folders");
  assert.ok(!d.startsWith(home) && !d.startsWith(ENGINE), "outside the home and this checkout");
  if (was !== undefined) process.env.SOL_LOGDIR = was;
});

test("the move: an old log in the home is carried over once into its days, seq goes on, and new lines land in the log only", () => {
  const h = tmp("sol-log-move-"), home = join(h, "home"), dir = join(h, "applog");
  const old = logFile(home);
  mkdirSync(dirname(old), { recursive: true });
  const day1 = Date.parse("2026-11-06T12:00:00"), day2 = Date.parse("2026-11-07T12:00:00");
  const seed = openLog(join(h, "seed"), null, () => day1);
  const a = seed.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "week", value: { v: 1 } });
  const b = seed.append({ project: "home", by: { person: "engine" }, kind: "plugin.line", item: "week", value: { line: "hi" } });
  const c0 = openLog(join(h, "seed"), null, () => day2).append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "x" });
  writeFileSync(old, [a, b, c0].map((e) => JSON.stringify(e)).join("\n") + "\n");
  assert.deepEqual(logFiles(dir), []);
  const log = openLog(dir, old, () => day2 + 1000);
  assert.deepEqual(logFiles(dir).map((f) => f.slice(dir.length + 1)), ["2026-11-06.jsonl", "2026-11-07.jsonl"], "the old lines went into their days");
  assert.deepEqual(log.since("home").map((e) => e.seq), [1, 2, 3], "the old lines are its own");
  const c = log.append({ project: "home", by: { person: "seat", agent: "claude" }, kind: "seat.turn", value: { session: "s1" } });
  assert.equal(c.seq, 4, "seq goes on from the old file");
  assert.deepEqual(readLog(dir).map((e) => e.id), [a.id, b.id, c0.id, c.id]);
  assert.deepEqual(lines(old).map((e) => e.id), [a.id, b.id, c0.id], "the old file is left as it was: nothing is written there");
  const joined = () => logFiles(dir).map((f) => readFileSync(f, "utf8").replace(/\n$/, "")).join("\n");
  // a second start: the folder has its days, the old file is not read again (no double carry)
  const again = openLog(dir, old, () => day2 + 2000);
  assert.equal(again.since("home").length, 4);
  // no old file: the folder only
  const lone = openLog(join(h, "lone"), null);
  lone.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "x" });
  assert.ok(!existsSync(join(h, "lone", "home")));
  // the old file ahead (a seat wrote in the home's file, or an older build wrote only there): never read back; the log
  // stands, and seq goes on from the log's own last
  writeFileSync(old, readFileSync(old, "utf8") + JSON.stringify({ ...c, seq: 5, id: "forged" }) + "\n");
  const back = openLog(dir, old, () => day2 + 3000);
  assert.deepEqual(back.since("home").map((e) => e.seq), [1, 2, 3, 4], "the forged line is not the log's");
  assert.equal(back.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "y" }).seq, 5);
  assert.ok(!joined().includes("forged"));
  // an old file written again behind the log's seq (a build from before the move, after this one stopped writing it):
  // not read, and said, since its size is kept in `moved`; one untouched is said nothing of
  {
    const home2 = join(h, "home2"), dir2 = join(h, "applog2"), old2 = logFile(home2);
    mkdirSync(dirname(old2), { recursive: true });
    writeFileSync(old2, [a, b].map((e) => JSON.stringify(e)).join("\n") + "\n");
    const said: string[] = [], was = console.error;
    console.error = (m: unknown) => { said.push(String(m)); };
    try {
      openLog(dir2, old2, () => day2).append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "w" });
      openLog(dir2, old2, () => day2 + 1000);
      assert.deepEqual(said, [], "untouched: nothing said");
      writeFileSync(old2, readFileSync(old2, "utf8") + JSON.stringify({ ...b, seq: 2, id: "late" }) + "\n");
      const late = openLog(dir2, old2, () => day2 + 2000);
      assert.ok(said.some((m) => /changed since the log stopped writing it/.test(m)), said.join(" | "));
      assert.ok(!late.since("home").some((e) => e.id === "late"), "and not read");
    } finally { console.error = was; }
  }
  // an old file inside the log's own folder is the log: not carried over onto itself
  const one = join(h, "one");
  openLog(one, join(one, "log.jsonl")).append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "z" });
  assert.equal(readLog(one).length, 1);
  assert.ok(!existsSync(join(one, "log.jsonl")));
  // an old file with a torn last line: the whole line is carried, the torn one is not
  const torn = join(h, "torn", "home", "log", "log.jsonl"), tornDir = join(h, "torn", "applog");
  mkdirSync(dirname(torn), { recursive: true });
  writeFileSync(torn, JSON.stringify(a) + "\n" + '{"id":"half","seq":2');
  openLog(tornDir, torn, () => day2).append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "w" });
  assert.deepEqual(readLog(tornDir).map((e) => e.seq), [1, 2]);
  // step 1's one file in the folder is read as the oldest day
  const s1 = join(h, "step1");
  mkdirSync(s1, { recursive: true });
  writeFileSync(join(s1, "log.jsonl"), JSON.stringify(a) + "\n");
  const t = dayTrail(s1, () => day2);
  assert.equal(t.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "v" }).seq, 2);
  assert.deepEqual(logFiles(s1).map((f) => f.slice(s1.length + 1)), ["log.jsonl", "2026-11-07.jsonl"]);
});

test("a file a day, the newest in memory, the rest read back from the files a page at a time", async () => {
  const dir = join(tmp("sol-log-days-"), "log");
  let at = Date.parse("2026-11-01T23:59:00");
  const t = dayTrail(dir, () => at);
  const n = KEEP + PAGE + 7;   // more than memory holds, more than one page on the files
  for (let i = 1; i <= n; i++) { t.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "x", value: { v: i } }); at += 60_000; }
  const files = logFiles(dir).map((f) => f.slice(dir.length + 1));
  assert.equal(files[0], "2026-11-01.jsonl");
  assert.ok(files.length >= 7, `one file a day: ${files.join(", ")}`);
  assert.equal(dayOf(Date.parse("2026-11-01T23:59:00")), "2026-11-01");
  // the newest: from memory, whole
  const newest = t.since("home", n - 10);
  assert.deepEqual(newest.map((e) => e.seq), Array.from({ length: 10 }, (_, k) => n - 9 + k));
  // the oldest: from the files, a page, in order, and the next page goes on from the last seq
  const first = t.since("home", 0);
  assert.equal(first.length, PAGE);
  assert.equal(first[0].seq, 1);
  assert.equal(first[PAGE - 1].seq, PAGE);
  const second = t.since("home", first[PAGE - 1].seq);
  assert.equal(second[0].seq, PAGE + 1);
  assert.equal(second.length, PAGE);
  const third = t.since("home", second[second.length - 1].seq);
  assert.deepEqual(third.map((e) => e.seq), [n - 6, n - 5, n - 4, n - 3, n - 2, n - 1, n]);
  // the next engine: the newest KEEP in memory, seq going on, the files untouched
  const again = dayTrail(dir, () => at);
  assert.equal(again.since("home", n - 1)[0].seq, n);
  assert.equal(again.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "y" }).seq, n + 1);
  assert.equal(readLog(dir).length, n + 1);
  assert.equal(again.since("home", 0).length, PAGE, "an old since= reads the files, a page");
  // a kernel over the same folder knows its last seq after a restart, with more than KEEP events behind it
  const home = join(dirname(dir), "home");
  mkdirSync(join(home, "things"), { recursive: true });
  const k = new Kernel(home, { logDir: dir, appDir: join(home, "app"), old: null, now: () => at });
  assert.equal(k.lastSeq(), n + 1, "last is the newest seq, not the page's end");
  assert.equal(k.since(n).map((e) => e.seq).join(","), String(n + 1));
  assert.equal(k.since(0).length, PAGE);
  await k.stop();
});

test("a clock set back across midnight: the event goes into the newest day, so the files in name order stay the log in seq order, and a restart goes on from the right seq", () => {
  const dir = join(tmp("sol-log-back-"), "log");
  let at = Date.parse("2026-11-08T00:10:00");
  const t = dayTrail(dir, () => at);
  t.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "a" });
  t.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "b" });
  at = Date.parse("2026-11-07T23:50:00");   // the clock set back (or a timezone crossed westward)
  const c = t.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "c" });
  assert.equal(c.seq, 3);
  assert.deepEqual(logFiles(dir).map((f) => f.slice(dir.length + 1)), ["2026-11-08.jsonl"], "no earlier day is opened behind the newest");
  const again = dayTrail(dir, () => at);
  assert.equal(again.last(), 3);
  assert.equal(again.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "d" }).seq, 4, "seq goes on, nothing is written twice");
  assert.deepEqual(readLog(dir).map((e) => e.seq), [1, 2, 3, 4]);
  assert.deepEqual(again.since("home", 0).map((e) => e.seq), [1, 2, 3, 4]);
  // a write that fails leaves nothing in memory: its seq is used by the next line
  const stuck = dayTrail(join(dir, "nope"), () => at);
  writeFileSync(join(dir, "nope"), "a file where the folder should be");
  assert.throws(() => stuck.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "e" }));
  assert.equal(stuck.last(), 0);
});

test("the move cut short is done again whole at the next start; a finished move is never done twice", () => {
  const h = tmp("sol-log-moving-"), home = join(h, "home"), dir = join(h, "applog");
  const old = logFile(home);
  mkdirSync(dirname(old), { recursive: true });
  const d1 = Date.parse("2026-11-06T12:00:00"), d2 = Date.parse("2026-11-07T12:00:00");
  const seed = openLog(join(h, "seed"), null, () => d1);
  const a = seed.append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "a" });
  const b = openLog(join(h, "seed"), null, () => d2).append({ project: "home", by: { person: "engine" }, kind: "plugin.load", item: "b" });
  writeFileSync(old, [a, b].map((e) => JSON.stringify(e)).join("\n") + "\n");
  // as if a start crashed after the first day was written: the mark is there, the second day is not
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".moving"), "");
  writeFileSync(join(dir, "2026-11-06.jsonl"), JSON.stringify(a) + "\n");
  const log = openLog(dir, old, () => d2 + 1000);
  assert.deepEqual(logFiles(dir).map((f) => f.slice(dir.length + 1)), ["2026-11-06.jsonl", "2026-11-07.jsonl"], "done again, whole");
  assert.ok(existsSync(join(dir, "moved")) && !existsSync(join(dir, ".moving")));
  assert.equal(log.last(), 2);
  // the old file grows (a seat wrote in it): a finished move is not done again, the log stands
  writeFileSync(old, readFileSync(old, "utf8") + JSON.stringify({ ...b, seq: 3, id: "forged" }) + "\n");
  const again = openLog(dir, old, () => d2 + 2000);
  assert.equal(again.last(), 2);
  assert.equal(lastSeqIn(old), 3);
  assert.ok(!readLog(dir).some((e) => e.id === "forged"));
  // the two-ends read: the last seq of a long file without reading it whole
  const long = join(h, "long.jsonl");
  writeFileSync(long, Array.from({ length: 3000 }, (_, i) => JSON.stringify({ id: `i${i}`, seq: i + 1, at: d1, project: "home", by: { person: "engine" }, kind: "line", value: { pad: "x".repeat(100) } })).join("\n") + "\n");
  assert.equal(lastSeqIn(long), 3000);
});

test("with the frame off nothing is read or written: the helpers return at once", () => {
  const was = process.env.SOL_LOGDIR;
  process.env.SOL_LOGDIR = join(tmp("sol-log-off-"), "log");
  turnStarted("claude", "s1", "m");
  stepTaken("claude", "s1", "Read", { file: "/x", bytes: 1 });
  sentAtStart("claude", "s1", [{ path: "/a", dataBase64: "AAAA" }], "desk");
  assert.ok(!existsSync(process.env.SOL_LOGDIR), "no kernel, no file");
  if (was !== undefined) process.env.SOL_LOGDIR = was; else delete process.env.SOL_LOGDIR;
  assert.equal(base64Bytes("AAAA"), 3);
  assert.equal(base64Bytes("AAA="), 2);
  assert.equal(base64Bytes("AA=="), 1);
  assert.equal(base64Bytes(Buffer.from("hello world").toString("base64")), 11);
});

test("a kernel writes its log at logDir and nothing in the home; a seat's four kinds are by the seat, with the conversation in the value, and the blocks that listen do not hear them", async () => {
  const h = tmp("sol-log-kernel-"), home = join(h, "home"), dir = join(h, "applog");
  mkdirSync(join(home, "things"), { recursive: true });
  cpSync(join(FIX, "things"), join(home, "things"), { recursive: true });
  // a block that says what it hears
  const ear = join(home, "things", "ear");
  mkdirSync(ear);
  writeFileSync(join(ear, "record.json"), JSON.stringify({ id: "ear", title: "ear", place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-07", contract: 1 }] }));
  writeFileSync(join(ear, "v1.html"), "<p>x</p>");
  writeFileSync(join(ear, "ask.md"), "an ear");
  writeFileSync(join(ear, "engine.js"), `export default (sol) => { sol.listen((e) => sol.log("heard " + e.kind)); };`);
  const k = new Kernel(home, { logDir: dir, appDir: join(home, "app"), now: () => Date.parse("2026-11-08T12:00:00") });
  await k.sync();
  assert.ok(logFiles(dir).length === 1, "the log is at logDir, today's file");
  assert.ok(!existsSync(logFile(home)), "and nothing at the old place in the home");
  const mark = k.lastSeq();
  const t = k.seat("seat.turn", "claude", { session: "abc", model: "opus" });
  k.seat("seat.sent", "claude", { session: "abc", what: "attachment", name: "/x/a.png", bytes: 10 });
  k.seat("seat.step", "claude", { session: "abc", tool: "Read", file: "/x/a.md", bytes: 120, ok: true });
  const d = k.seat("seat.done", "claude", { session: "abc", ok: true, turns: 2, tokens: { in: 5, out: 7, cacheRead: 1, cacheWrite: 2 }, costTotal: 0.01 });
  assert.deepEqual(t.by, { person: "seat", agent: "claude" });
  assert.equal(t.item, undefined, "the conversation is in the value, not the item (a block's steps keep the item for the block)");
  assert.deepEqual(d.value, { session: "abc", ok: true, turns: 2, tokens: { in: 5, out: 7, cacheRead: 1, cacheWrite: 2 }, costTotal: 0.01 });
  assert.deepEqual(k.since(mark).map((e) => e.kind), ["seat.turn", "seat.sent", "seat.step", "seat.done"]);
  assert.equal(k.lastSeq(), d.seq, "lastSeq follows a seat's line too (GET /log's last)");
  await wait(150);
  const heard = k.since().filter((e) => e.kind === "plugin.line" && e.by.agent === "ear").map((e) => (e.value as { line: string }).line);
  assert.ok(heard.includes("heard plugin.load"), "it hears the engine's lines");
  assert.ok(!heard.some((x) => /heard seat\.(turn|sent|step|done)/.test(x)), "it hears none of a seat's four");
  // no words anywhere on the seat's lines
  for (const e of k.since(mark)) assert.ok(!JSON.stringify(e).includes("prompt") && !("text" in ((e.value ?? {}) as object)), JSON.stringify(e));
  await k.stop();
});

test("what the seats' SDKs say, taken as the log needs it: the file a tool named, the bytes that came back, the tokens, a Codex item as a step", () => {
  assert.equal(fileOf({ file_path: "/a/b.ts", command: "x" }), "/a/b.ts");
  assert.equal(fileOf({ notebook_path: "/n.ipynb" }), "/n.ipynb");
  assert.equal(fileOf({ path: "/dir", pattern: "*.ts" }), "/dir");
  assert.equal(fileOf({ command: "ls" }), undefined);
  assert.equal(fileOf("x"), undefined);
  assert.equal(sizeOf("héllo"), 6);
  assert.equal(sizeOf([{ type: "text", text: "ab" }, { type: "image", source: { data: "AAAA" } }, { type: "other" }]), 5);
  assert.equal(sizeOf(undefined), 0);
  assert.deepEqual(claudeTokens({ input_tokens: 2, output_tokens: 150, cache_read_input_tokens: 11943, cache_creation_input_tokens: 44166, iterations: [] }), { in: 2, out: 150, cacheRead: 11943, cacheWrite: 44166 });
  assert.equal(claudeTokens(null), null);
  assert.deepEqual(codexTokens({ input_tokens: 21476, cached_input_tokens: 12160, cache_write_input_tokens: 0, output_tokens: 102 }), { in: 21476, out: 102, cacheRead: 12160, cacheWrite: 0 });
  assert.deepEqual(codexStepOf({ type: "command_execution", command: "ls -la", aggregated_output: "abcd", exit_code: 0 }), { tool: "command", bytes: 4, ok: true });
  assert.deepEqual(codexStepOf({ type: "file_change", changes: [{ path: "/p/notes.md", kind: "add" }], status: "completed" }), { tool: "edit", file: "/p/notes.md", ok: true });
  assert.deepEqual(codexStepOf({ type: "mcp_tool_call", server: "sol", tool: "page_read", status: "completed", result: { content: [{ type: "text", text: "abc" }] } }), { tool: "sol:page_read", bytes: 42, ok: true });
  assert.deepEqual(codexStepOf({ type: "file_change", changes: [{ path: "/p/a.md", kind: "add" }, { path: "/p/b.md", kind: "update" }], status: "completed" }), { tool: "edit", file: "/p/a.md", files: 2, ok: true });
  assert.deepEqual(codexStepOf({ type: "web_search", query: "x" }), { tool: "search" });
  assert.equal(codexStepOf({ type: "agent_message", text: "secret" }), null);
  assert.equal(codexStepOf({ type: "reasoning", text: "hmm" }), null);
  assert.equal(JSON.stringify(codexStepOf({ type: "command_execution", command: "rm -rf /", aggregated_output: "", exit_code: 1 })).includes("rm"), false, "the command line is not taken");
});

test("the reconcile, pure: the log's counts per conversation against a Claude transcript and a Codex rollout", () => {
  const at = Date.parse("2026-11-07T10:00:00Z");
  const ev = (seq: number, kind: string, agent: string, value: Record<string, unknown>): Ev => ({ id: `i${seq}`, seq, at, project: "home", by: { person: "seat", agent }, kind, value });
  const events: Ev[] = [
    { id: "i0", seq: 1, at, project: "home", by: { person: "engine" }, kind: "plugin.load", item: "week" },
    ev(2, "seat.turn", "claude", { session: "c1" }), ev(3, "seat.step", "claude", { session: "c1", tool: "Read" }), ev(4, "seat.step", "claude", { session: "c1", tool: "Bash" }),
    ev(11, "seat.step", "work", { session: "c1", tool: "Grep", agent: true }),   // a background agent's own: in its transcript, not counted here
    ev(5, "seat.done", "claude", { session: "c1", ok: true, tokens: { in: 1, out: 40 } }),
    ev(6, "seat.turn", "codex", { session: "x1" }), ev(7, "seat.step", "codex", { session: "x1", tool: "command" }), ev(8, "seat.done", "codex", { session: "x1", ok: true, tokens: { in: 1, out: 9 } }),
    ev(9, "seat.turn", "claude", { session: "lost" }),
    { id: "i10", seq: 10, at, project: "home", by: { person: "seat", agent: "claude" }, kind: "tool.call", item: "week", value: { tool: "free" } },   // a block's tool: no conversation, not counted
  ];
  const s = summarize(events);
  assert.deepEqual([...s.keys()], ["c1", "x1", "lost"]);
  assert.deepEqual(s.get("c1"), { seat: "claude", first: at, running: null, turns: 1, steps: 2, out: 40 });
  assert.equal(s.get("lost")?.running, at, "a turn begun and not ended is running");
  const ts = (ms: number) => new Date(at + ms).toISOString();
  const claude = [
    { type: "user", timestamp: ts(-7_200_000), message: { role: "user", content: "long ago" } },   // before the log: not counted
    { type: "user", timestamp: ts(0), message: { role: "user", content: [{ type: "text", text: "do it" }] } },
    { type: "assistant", timestamp: ts(100), message: { id: "m1", usage: { output_tokens: 10 }, content: [{ type: "tool_use", id: "t1", name: "Read" }] } },
    { type: "assistant", timestamp: ts(100), message: { id: "m1", usage: { output_tokens: 10 }, content: [{ type: "text", text: "x" }] } },   // the same message again: one count
    { type: "user", timestamp: ts(200), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "..." }] } },
    { type: "user", timestamp: ts(300), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "..." }] } },
    { type: "assistant", timestamp: ts(400), message: { id: "m2", usage: { output_tokens: 30 }, content: [{ type: "text", text: "done" }] } },
    { type: "user", timestamp: ts(500), isMeta: true, message: { role: "user", content: [{ type: "text", text: "injected" }] } },
    { type: "attachment", timestamp: ts(600) },
  ].map((o) => JSON.stringify(o)).join("\n");
  assert.deepEqual(claudeCounts(claude, at - 60_000), { turns: 1, steps: 2, out: 40 });
  const codex = [
    { type: "session_meta", payload: { id: "x1" } },
    { timestamp: ts(0), type: "event_msg", payload: { type: "task_started", turn_id: "t" } },
    { timestamp: ts(10), type: "response_item", payload: { type: "custom_tool_call", name: "exec" } },
    { timestamp: ts(20), type: "token_usage_record", payload: { usage: { output_tokens: 4 } } },
    { timestamp: ts(30), type: "token_usage_record", payload: { usage: { output_tokens: 5 } } },
    { timestamp: ts(40), type: "event_msg", payload: { type: "task_complete" } },
  ].map((o) => JSON.stringify(o)).join("\n");
  assert.deepEqual(codexCounts(codex, at - 60_000), { turns: 1, steps: 1, out: 9 });
  const rows = reconcile(events, (seat, id) => (id === "c1" ? claude : id === "x1" ? codex : null));
  assert.deepEqual(rows.map((r) => [r.session, r.ok]), [["c1", true], ["x1", true], ["lost", null]]);
  assert.equal(rows[0].note, "tokens agree");
  const off = reconcile(events.filter((e) => e.seq !== 4), (seat, id) => (id === "c1" ? claude : null));
  assert.equal(off[0].ok, false);
  assert.match(off[0].note, /steps 1\/2/);
  // a second turn still running (d7540cc2 on 2026-11-12, 66643 on the log against 104776 in the transcript): its tokens
  // are on the transcript and not yet on the log, so the transcript's are counted up to its start
  const later = at + 60_000;
  const running = [...events, { ...ev(12, "seat.turn", "claude", { session: "c1" }), at: later }, { ...ev(13, "seat.step", "claude", { session: "c1", tool: "Read" }), at: later + 1000 }];
  const more = claude + "\n" + [
    { type: "user", timestamp: ts(60_000), message: { role: "user", content: "and then" } },
    { type: "assistant", timestamp: ts(60_500), message: { id: "m3", usage: { output_tokens: 500 }, content: [{ type: "tool_use", id: "t3", name: "Read" }] } },
    { type: "user", timestamp: ts(61_000), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", content: "..." }] } },
  ].map((o) => JSON.stringify(o)).join("\n");
  assert.deepEqual(claudeCounts(more, at - 60_000), { turns: 2, steps: 3, out: 540 }, "the whole transcript, the running turn's 500 too");
  const r = reconcile(running, (seat, id) => (id === "c1" ? more : null))[0];
  assert.deepEqual([r.ok, r.log.out, r.note], [true, 40, "tokens agree (a turn has no seat.done yet, running or cut off: up to its start)"]);
  const short = reconcile(running.map((e) => (e.seq === 5 ? { ...e, value: { session: "c1", ok: true, tokens: { in: 1, out: 39 } } } : e)), (seat, id) => (id === "c1" ? more : null))[0];
  assert.match(short.note, /tokens 39 on the log, 40 in the transcript \(a turn has no seat.done yet/, "a real difference in the ended turns is still said");
});

test("a real engine with the frame on and a stand-in codex: a Home turn puts turn, sent, step and done on the log at SOL_LOGDIR, nothing in the home, no words; the rollout reconciles", async () => {
  const dir = tmp("sol-log-engine-"), fakeHome = join(dir, "me"), home = join(dir, "solhome"), logdir = join(dir, "log");
  const rollouts = join(fakeHome, ".codex", "sessions", "2026", "11", "07");
  for (const d of [fakeHome, home, rollouts]) mkdirSync(d, { recursive: true });
  writeFileSync(join(dir, "codex"), `#!${process.execPath}
const fs = require("fs"), path = require("path");
const a = process.argv.slice(2);
const r = a.indexOf("resume");
const id = r >= 0 ? a[r + 1] : require("crypto").randomUUID();
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const f = path.join(${JSON.stringify(rollouts)}, "rollout-2026-11-07T00-00-00-" + id + ".jsonl");
  const now = () => new Date().toISOString();
  const row = (o) => fs.appendFileSync(f, JSON.stringify({ timestamp: now(), ...o }) + "\\n");
  if (!fs.existsSync(f)) row({ type: "session_meta", payload: { id, cwd: a[a.indexOf("--cd") + 1], originator: "codex_sdk_ts", source: "exec" } });
  row({ type: "event_msg", payload: { type: "task_started", turn_id: "t1" } });
  row({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: "ls" } });
  row({ type: "token_usage_record", payload: { usage: { input_tokens: 3, output_tokens: 11 } } });
  row({ type: "event_msg", payload: { type: "task_complete", turn_id: "t1" } });
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
  out({ type: "thread.started", thread_id: id });
  out({ type: "turn.started" });
  setTimeout(() => {
    out({ type: "item.started", item: { id: "c1", type: "command_execution", command: "ls -la", status: "in_progress" } });
    out({ type: "item.completed", item: { id: "c1", type: "command_execution", command: "ls -la", aggregated_output: "a.md\\nb.md\\n", exit_code: 0, status: "completed" } });
    out({ type: "item.completed", item: { id: "m1", type: "agent_message", text: "the secret answer" } });
    out({ type: "turn.completed", usage: { input_tokens: 3, cached_input_tokens: 0, output_tokens: 11 } });
  }, 300);
});
`);
  chmodSync(join(dir, "codex"), 0o755);
  // a log with more than a page already behind it: GET /log?since=0 pages, and says `next`
  mkdirSync(logdir, { recursive: true });
  const before = PAGE + 120;
  writeFileSync(join(logdir, "2026-11-01.jsonl"), Array.from({ length: before }, (_, i) => JSON.stringify({ id: `old${i}`, seq: i + 1, at: Date.parse("2026-11-01T12:00:00") + i, project: "home", by: { person: "engine" }, kind: "line", item: "x", value: { i } })).join("\n") + "\n");
  const PORT = await freePort();   // nobody else's (#938, #1144)
  const engine: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, HOME: fakeHome, SOL_PORT: String(PORT), SOL_HOME: home, SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
      SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_CODEX: join(dir, "codex"),
      SOL_LOGDIR: logdir, SOL_FRAME: "on", SOL_APPDIR: join(dir, "app"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    },
  });
  after(() => engine.kill());
  let up = false;
  for (let i = 0; i < 150 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/health`)).ok; } catch { await wait(200); } }
  assert.ok(up, "the engine came up");
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const got: any[] = [];
  ws.on("message", (d) => got.push(JSON.parse(String(d))));
  await new Promise<void>((r, no) => { ws.on("open", () => r()); ws.on("error", no); });
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
  ws.send(JSON.stringify({ type: "say", text: "list the files, quietly", seat: "codex", draft: "draft-log-0001", files: [{ name: "shot.png", mime: "image/png", dataBase64: png }] }));
  for (let i = 0; i < 100 && !got.some((m) => m.type === "done"); i++) await wait(100);
  const done = got.find((m) => m.type === "done");
  assert.ok(done?.ok, `the turn ended: ${JSON.stringify(got.map((m) => m.type))}`);
  const id = done.sessionId as string;
  ws.close();
  const page = (await (await fetch(`http://127.0.0.1:${PORT}/log`)).json()) as { last: number; events: Ev[]; next?: number };
  assert.equal(page.events.length, PAGE, "a page");
  assert.equal(page.next, PAGE, "and there is more, from this seq on");
  assert.ok(page.last > before, "last is the newest, not the page's end");
  const log = (await (await fetch(`http://127.0.0.1:${PORT}/log?since=${page.next}`)).json()) as { last: number; events: Ev[]; next?: number };
  assert.equal(log.next, undefined, "the rest fits one answer");
  assert.equal(log.events[0].seq, PAGE + 1);
  const mine = log.events.filter((e) => e.by.person === "seat" && (e.value as any)?.session === id);
  assert.deepEqual(mine.map((e) => e.kind), ["seat.turn", "seat.sent", "seat.step", "seat.done"]);
  assert.deepEqual(mine.map((e) => e.by.agent), ["codex", "codex", "codex", "codex"]);
  assert.deepEqual(mine[1].value, { session: id, what: "attachment", name: join(home, "attachments", `${new Date().toISOString().slice(0, 10)}-shot.png`), bytes: 16 });
  assert.deepEqual(mine[2].value, { session: id, tool: "command", bytes: 10, ok: true });
  assert.deepEqual(mine[3].value, { session: id, ok: true, tokensTotal: { in: 3, out: 11, cacheRead: 0, cacheWrite: 0 } });
  const text = logFiles(logdir).filter((f) => !f.endsWith("2026-11-01.jsonl")).map((f) => readFileSync(f, "utf8")).join("");
  assert.ok(!text.includes("secret") && !text.includes("ls -la") && !text.includes("quietly"), "no words on the log");
  assert.ok(log.last >= mine[3].seq, "last is at or past the turn's done (the engine may write another event right after it, #1132)");
  assert.equal(log.events.filter((e) => e.seq > mine[3].seq && e.by.person === "seat" && (e.value as any)?.session === id).length, 0, "nothing of this turn after its done");
  assert.ok(!existsSync(logFile(home)), "nothing at the old place in the home");
  assert.ok(!existsSync(join(fakeHome, "Library", "Application Support", "Sol")) && !existsSync(join(fakeHome, ".local", "share", "sol")), "nothing at the engine's own default place: SOL_LOGDIR won");
  const rollout = readFileSync(join(rollouts, `rollout-2026-11-07T00-00-00-${id}.jsonl`), "utf8");
  const rows = reconcile(log.events, () => rollout);
  assert.deepEqual(rows.map((r) => [r.session, r.ok, r.note]), [[id, true, "tokens agree"]]);
  engine.kill();
});

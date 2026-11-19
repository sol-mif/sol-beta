// The two unload tests (the v2 backend design §13, step 0b: "what is registered can be taken apart", one of dsh's rules):
// a block that does everything a block can do in its room is loaded, used, then taken out of the home, and nothing of it
// is left. Each looks below the kernel's own bookkeeping as well as at it: the block's worker or process is watched
// directly (its messages, its thread, its PID), and every async resource this process holds is counted from its start
// to its end (async_hooks), so a timer, a port, a socket or a child the kernel forgot still counts, ref'd or not.
//   the small room   a worker: a tool, a seat (its tool `task`), a listener on a kind, a schedule, its own data, a timer of
//                    its own. After: no message from the worker, its thread gone, no tool, no seat, no line on the log
//                    after the unload line, the same resources as before it loaded.
//   the big room     a process in macOS's sandbox: the same, and a request in flight (sol.fetch, to a server here that
//                    takes the connection and never answers) and a program in flight (sol.run). After: its PID gone, its
//                    proxy's port closed, its scratch folder gone, the program killed, the request ended.
// Each makes its own home, log folder and Sol folder under the system's temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHook } from "node:async_hooks";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { execFileSync, type ChildProcess } from "node:child_process";
import type { Worker } from "node:worker_threads";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { toolName } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { pressedFile, askOf } from "../src/card.ts";
import { columnsOf, type Columns } from "../src/record.ts";
import { seatList } from "../src/seats.ts";

const mac = platform() === "darwin" && existsSync("/usr/bin/sandbox-exec");
/** the port of the server a big room's request goes to and waits on (this unit's range, 8400-8409) */
const HANG = 8401;

// ---- every async resource this process holds, by type, from its init to its destroy ----
/** the kinds of resource that hold something open (a handle, a timer, a port, a thread); requests, promises and ticks
 *  come and go on their own and are not counted, nor is TLS's wrap around a socket (TLSWRAP): it is said destroyed only
 *  when the garbage collector takes it, long after its socket (TCPWRAP, counted) is closed */
const HELD = /^(Timeout|WORKER|MESSAGEPORT|PROCESSWRAP|PIPEWRAP|TCPWRAP|TCPSERVERWRAP|UDPWRAP|FSEVENTWRAP|STATWATCHER|SIGNALWRAP|TTYWRAP|HTTPCLIENTREQUEST|HTTPINCOMINGMESSAGE)$/;
const live = new Map<number, string>();
createHook({ init(id, type) { if (HELD.test(type)) live.set(id, type); }, destroy(id) { live.delete(id); } }).enable();
/** what is held now, counted by type, once the destroys of what just ended have been said */
async function held(): Promise<Record<string, number>> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  const n: Record<string, number> = {};
  for (const t of live.values()) n[t] = (n[t] ?? 0) + 1;
  return n;
}

const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-unload-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
const opts = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app"), old: null, big: { idleMs: 60_000 } });
const cols = (r: Record<string, unknown>) => (columnsOf(r) as { columns: Columns }).columns;
/** a block: its record, its engine half, and the mark that a person pressed its card (it asks for a seat, and a big room
 *  asks for a room of its own) */
function block(h: string, id: string, engine: string, rec: Record<string, unknown>) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  const r = { id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-10", contract: 1 }], ...rec };
  writeFileSync(join(d, "record.json"), JSON.stringify(r));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "engine.js"), engine);
  const f = pressedFile(join(h, "app"), h, id);
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, JSON.stringify(askOf(cols(r))));
  return d;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, what: string, ms = 8000) {
  for (const end = Date.now() + ms; !f(); await wait(50)) if (Date.now() > end) assert.fail(`waited ${ms} ms for ${what}`);
}
const text = (r: { content: { type: string; text?: string }[] }) => (r.content[0] as { text: string }).text;
const lines = (k: Kernel, id: string) => k.since().filter((e) => e.kind === "plugin.line" && e.item === id).map((e) => (e.value as { line: string }).line);
/** every line about a block, or by it, after a seq */
const after_ = (k: Kernel, id: string, seq: number) => k.since(seq).filter((e) => e.item === id || ("by" in e && (e.by as { agent?: string }).agent === id));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** a kind a block may hear that the test can write itself: nothing else listens to it here */
const poke = (k: Kernel) => k.append("key.pasted", "nobody", { hosts: [] }, { person: "person" });
/** what the kernel holds for one load of a block, read from inside (a test's look, never the engine's) */
type Life = { worker: Worker | null; room: unknown; tools: Map<string, unknown>; calls: Map<number, unknown>; listens: boolean; live: boolean; timers: unknown[]; doing?: Set<unknown> };
const lifeOf = (k: Kernel, id: string) => (k as unknown as { blocks: Map<string, { life: Life }> }).blocks.get(id)?.life;
/** what a load registered under the block's name, as the kernel holds it after the unload: nothing */
const registered = (l: Life) => ({ live: l.live, tools: l.tools.size, calls: l.calls.size, listens: l.listens, timers: l.timers.length, worker: l.worker !== null, doing: l.doing?.size ?? 0 });
const NOTHING = { live: false, tools: 0, calls: 0, listens: false, timers: 0, worker: false, doing: 0 };

test("unload, the small room: a block that did everything a block can do there leaves nothing behind", async () => {
  const h = home();
  const d = block(h, "busy", `export default (sol) => {
    sol.tool({ name: "ping", run: () => "pong" });
    sol.tool({ name: "task", args: { text: "string" }, run: (a) => ({ text: "did " + a.text }) });
    sol.listen((e) => sol.log("heard " + e.kind));
    sol.every(1000, () => { sol.log("tick"); sol.write("seen", { at: Date.now() }); });
    setInterval(() => sol.log("its own timer"), 700);
    sol.write("seen", { n: 1 });
    return () => sol.log("unloading");
  };`, { stores: ["seen"], hears: ["key.pasted"], needs: { why: "a seat of its own", provides: ["seat"] } });
  const k = new Kernel(h, opts(h));
  const before = await held();
  let w: Worker | null = null;
  try {
    await k.sync();
    // loaded, and doing each thing
    assert.equal(k.state("busy")?.state, "loaded", k.state("busy")?.why);
    assert.deepEqual(k.tools().map((t) => toolName(t.block, t.name)).sort(), ["thing_busy_ping", "thing_busy_task"]);
    assert.ok(seatList().some((s) => s.name === "busy"), "it holds a seat");
    assert.equal(text(await k.runTool("thing_busy_ping", {})), "pong");
    poke(k);
    await until(() => lines(k, "busy").includes("heard key.pasted"), "its listener");
    await until(() => lines(k, "busy").includes("tick") && lines(k, "busy").includes("its own timer"), "its schedule and its own timer");
    assert.ok(k.since().some((e) => e.kind === "plugin.write" && e.item === "busy") && existsSync(join(h, "data", "busy", "seen.json")), "its own data written");
    const loaded = await held();
    assert.ok((loaded.WORKER ?? 0) > (before.WORKER ?? 0), `the worker is counted: ${JSON.stringify(loaded)}`);
    // the worker itself, watched from here: what it says after the unload, whether its thread ends
    const life = lifeOf(k, "busy")!;
    w = life.worker!;
    const thread = w.threadId;
    assert.ok(thread > 0);
    let ended = false, done = false;
    const said: unknown[] = [];
    w.once("exit", () => { ended = true; });
    w.on("message", (m) => { if (done) said.push(m); });
    // taken out of the home: unloaded
    rmSync(d, { recursive: true });
    await k.sync();
    done = true;
    const unload = k.since().filter((e) => e.kind === "plugin.unload" && e.item === "busy");
    assert.equal(unload.length, 1);
    assert.ok(lines(k, "busy").includes("unloading"), "what its load returned ran, before the unload line");
    // a later event, and its schedule's and its own timer's times come round twice
    poke(k);
    await wait(2500);
    poke(k);
    await wait(300);
    assert.deepEqual(said, [], "the worker said nothing after the unload: no listener, no timer");
    assert.ok(ended, "the worker ended");
    assert.equal(w.threadId, -1, `its thread ${thread} is gone`);
    assert.deepEqual(after_(k, "busy", unload[0].seq), [], "no line about it or by it after the unload line");
    assert.deepEqual(k.tools(), [], "its tools are gone from the list");
    assert.deepEqual(registered(life), NOTHING, "nothing it registered is kept under its name");
    assert.ok(!seatList().some((s) => s.name === "busy"), "its seat is gone");
    assert.equal(k.state("busy"), undefined);
    assert.match(text(await k.runTool("thing_busy_ping", {})), /no tool thing_busy_ping: its block is not loaded/);
    assert.deepEqual(await held(), before, "every handle it opened is closed: the same as before it loaded");
  } finally {   // a leak fails the test, never hangs the run: what the kernel left is ended here
    w?.removeAllListeners("message");
    if (w && w.threadId !== -1) await w.terminate();
    await k.stop();
  }
});

test("unload, the big room: a block that did everything a block can do there, a request and a program in flight, leaves nothing behind", { skip: !mac, timeout: 60_000 }, async () => {
  const h = home();
  // a server that takes the connection and never answers: the block's request stays in flight until something ends it
  const taken = new Set<Socket>();
  const hang = createServer((s) => { taken.add(s); s.on("close", () => taken.delete(s)); s.on("error", () => {}); s.resume(); });   // read, so its end is seen
  await new Promise<void>((ok, no) => { hang.once("error", no); hang.listen(HANG, "127.0.0.1", () => ok()); });
  const ARG = `${37 + Math.random()}`.slice(0, 8);   // the program in flight, found by its argument
  const d = block(h, "roomy", `export default (sol) => {
    sol.tool({ name: "pid", run: () => ({ pid: process.pid }) });
    sol.tool({ name: "task", args: { text: "string" }, run: (a) => ({ text: "did " + a.text }) });
    sol.tool({ name: "go", run: async () => {
      sol.fetch("https://127.0.0.1:${HANG}/").then(() => sol.log("fetched"), () => sol.log("fetch ended"));
      sol.run("sleep", ["${ARG}"]).then(() => sol.log("ran"), () => sol.log("run ended"));
      await sol.write("seen", { n: 1 });
      return "going";
    } });
    sol.listen((e) => sol.log("heard " + e.kind));
    sol.every(1000, () => sol.log("tick"));
    setInterval(() => sol.log("its own timer"), 700);
    return () => sol.log("unloading");
  };`, {
    room: "big", stores: ["seen"], hears: ["key.pasted"],
    needs: { why: "everything a big room does", domains: [`127.0.0.1:${HANG}`], programs: ["sleep"], provides: ["seat"], every: [1000],
      tools: [{ name: "pid" }, { name: "task", args: { text: "string" } }, { name: "go" }] },
  });
  const k = new Kernel(h, opts(h));
  const before = await held();
  const pg = () => { try { return execFileSync("/usr/bin/pgrep", ["-f", `sleep ${ARG}`], { encoding: "utf8" }).trim(); } catch { return ""; } };
  let pid = 0, proxy: { close(): Promise<void> } | null = null;
  try {
    await k.sync();
    assert.equal(k.state("roomy")?.state, "loaded", k.state("roomy")?.why);
    assert.deepEqual(k.tools().map((t) => toolName(t.block, t.name)).sort(), ["thing_roomy_go", "thing_roomy_pid", "thing_roomy_task"]);
    assert.ok(seatList().some((s) => s.name === "roomy"), "it holds a seat");
    pid = JSON.parse(text(await k.runTool("thing_roomy_pid", {}))).pid;
    assert.ok(alive(pid), "awake: its process runs");
    assert.equal(JSON.parse(text(await k.runTool("thing_roomy_task", { text: "x" }))).text, "did x");
    poke(k);
    await until(() => lines(k, "roomy").includes("heard key.pasted"), "its listener");
    await until(() => lines(k, "roomy").includes("tick") && lines(k, "roomy").includes("its own timer"), "its schedule and its own timer");
    assert.equal(text(await k.runTool("thing_roomy_go", {})), "going");
    await until(() => taken.size > 0 && pg() !== "", "its request and its program in flight");
    assert.equal(JSON.parse(readFileSync(join(h, "data", "roomy", "seen.json"), "utf8")).n, 1, "its own data written");
    // the process itself, watched from here
    const life = lifeOf(k, "roomy")!;
    const room = life.room as { child: ChildProcess; proxy: { port: number; close(): Promise<void> }; scratch: string };
    const child = room.child, port = room.proxy.port, scratch = room.scratch;
    proxy = room.proxy;
    assert.equal(child.pid, pid);
    let done = false;
    const said: unknown[] = [];
    child.on("message", (m) => { if (done) said.push(m); });
    // taken out of the home: unloaded
    rmSync(d, { recursive: true });
    await k.sync();
    done = true;
    const unload = k.since().filter((e) => e.kind === "plugin.unload" && e.item === "roomy");
    const ran = k.since().filter((e) => e.kind === "plugin.ran" && e.item === "roomy");
    assert.deepEqual(ran.map((e) => [e.value, e.seq < unload[0].seq]), [[{ program: "sleep", code: null, signal: "SIGKILL", out: true }, true]], "the program it ran, killed with it, is said before the unload line");
    assert.equal(unload.length, 1);
    assert.ok(lines(k, "roomy").includes("unloading"), "what its load returned ran, before the unload line");
    poke(k);
    await wait(2500);
    poke(k);
    await wait(300);
    assert.deepEqual(said, [], "the process said nothing after the unload");
    assert.ok(!alive(pid), `its process ${pid} is gone`);
    assert.equal(pg(), "", "the program it ran is killed with it");
    assert.equal(taken.size, 0, "its request is ended: the server here holds no connection from it");
    const free = await new Promise<string>((ok) => { const s = createServer().listen(port, "127.0.0.1", () => { s.close(() => ok("free")); }); s.on("error", (e: NodeJS.ErrnoException) => ok(e.code ?? "x")); });
    assert.equal(free, "free", "its proxy's port is closed");
    assert.ok(!existsSync(scratch), "its scratch folder is gone");
    assert.deepEqual(after_(k, "roomy", unload[0].seq), [], "no line about it or by it after the unload line");
    assert.deepEqual(k.tools(), [], "its tools are gone from the list");
    assert.deepEqual(registered(life), NOTHING, "nothing it registered is kept under its name");
    assert.ok(!seatList().some((s) => s.name === "roomy"), "its seat is gone");
    assert.equal(k.state("roomy"), undefined);
    assert.deepEqual(await held(), before, "every handle it opened is closed: the same as before it loaded");
  } finally {   // a leak fails the test, never hangs the run: what the kernel left is ended here
    await k.stop();
    await proxy?.close().catch(() => {});
    for (const p of [pid, ...pg().split(/\s+/).map(Number)]) if (p && alive(p)) process.kill(p, "SIGKILL");
    for (const s of taken) s.destroy();
    await new Promise((r) => hang.close(r));
  }
});

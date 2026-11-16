// The seat seam (the design's step 6, seats.ts): the four parts every seat has and three it may; Sol's own two on it;
// the built-in Claude seat never taken out and taking the turn when a seat is missing; a block that provides a seat
// (kernel.ts provide), on its card, put on the seam when it loads and taken off when it goes.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import { Kernel } from "./kernels.ts";
import { registerSeat, unregisterSeat, seatFor, seatList, clearSeats, BUILT_IN, type SeatProvider } from "../src/seats.ts";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const homes: string[] = [];
let engine: ChildProcess | null = null;
after(() => { engine?.kill("SIGKILL"); for (const h of homes) rmSync(h, { recursive: true, force: true }); });
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-seat-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
const opts = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app") });
const SEAT = `export default (sol) => { sol.tool({ name: "task", args: { text: "string", session: "string" }, run: ({ text, session }) => text === "plain" ? "just words" : JSON.stringify({ text: "you said " + text, session: session || "s-1", structured: { n: text.length } }) }); };`;
function block(h: string, id: string, engine: string, rec: Record<string, unknown> = {}) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "record.json"), JSON.stringify({ id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html" }], needs: { why: "a seat of my own", provides: ["seat"] }, ...rec }));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  writeFileSync(join(d, "engine.js"), engine);
}
const fake = (name: string, o: Partial<SeatProvider> = {}): SeatProvider => ({ name, builtIn: false, can: { stream: false, resume: false, ask: false }, run: async (t) => ({ ok: true, text: `${name}: ${t.text}` }), ...o });

test("the seam, pure: Sol's Claude never taken out and taking the turn when a seat is missing, said; a block's seat never replaces another", async () => {
  clearSeats();
  assert.throws(() => seatFor("x"), /no seat at all/);
  registerSeat(fake(BUILT_IN, { builtIn: true }));
  assert.deepEqual(unregisterSeat(BUILT_IN), { ok: false, why: "the built-in Claude seat cannot be taken out: every other seat falls back on it" });
  const miss = seatFor("gone");
  assert.equal(miss.seat.name, "claude");
  assert.equal(miss.instead, "the seat gone is not here, so Claude took the turn");
  assert.equal(seatFor("claude").instead, undefined);
  assert.deepEqual(registerSeat(fake("mine", { block: "a" })), { ok: true });
  assert.match((registerSeat(fake("mine", { block: "b" })) as { why: string }).why, /there is a seat mine already \(the block a's\)/);
  assert.match((registerSeat(fake("claude", { block: "b" })) as { why: string }).why, /Sol's own/);
  assert.match((unregisterSeat("mine", "b") as { why: string }).why, /not the block b's seat/);
  assert.equal((await seatFor("mine").seat.run({ text: "hi" }, {}, new AbortController().signal) as { text: string }).text, "mine: hi");
  assert.deepEqual(seatList().map((s) => s.name), ["claude", "mine"]);
  assert.deepEqual(unregisterSeat("mine", "a"), { ok: true });
  clearSeats();
});

test("a block that provides a seat: on its card, on the seam once pressed and loaded, its task through the gate; gone with the block, Claude takes the turn", async () => {
  clearSeats();
  registerSeat(fake(BUILT_IN, { builtIn: true }));
  const h = home();
  block(h, "echo", SEAT);
  block(h, "notask", `export default () => {};`);
  block(h, "claude", SEAT);
  const k = new Kernel(h, opts(h));
  await k.sync();
  const card = k.waiting("echo")!;
  assert.deepEqual(card.asks.provides, ["seat"]);
  assert.match(card.plain.join("\n"), /It becomes a seat: .*Treat it as having everything it asks for/);
  assert.equal(seatFor("echo").instead !== undefined, true, "waiting: not on the seam");
  for (const id of ["echo", "notask", "claude"]) await k.approve(id, k.waiting(id)!.print);
  assert.match(k.state("notask")?.why ?? "", /a seat takes its task through a tool named task/);
  assert.match(k.state("claude")?.why ?? "", /provides a seat named claude, and there is a seat claude already \(Sol's own\)/);
  const s = seatFor("echo");
  assert.equal(s.instead, undefined);
  assert.equal(s.seat.block, "echo");
  assert.deepEqual(await s.seat.run({ text: "hello" }, {}, new AbortController().signal), { ok: true, text: "you said hello", sessionId: "s-1", structured: { n: 5 } });
  // one task at a time; a cancel is said as cancelled and its tool cancel is told
  block(h, "slow", `export default (sol) => { let told = 0; sol.tool({ name: "task", args: { text: "string" }, run: async ({ text }) => text === "told?" ? String(told) : new Promise((r) => setTimeout(() => r("late"), 400)) }); sol.tool({ name: "cancel", run: () => { told++; return "ok"; } }); };`);
  await k.sync();
  await k.approve("slow", k.waiting("slow")!.print);
  const slow = seatFor("slow").seat, stop = new AbortController();
  const first = slow.run({ text: "a" }, {}, stop.signal);
  assert.deepEqual(await slow.run({ text: "b" }, {}, new AbortController().signal), { ok: false, why: "the seat slow is still on its last task" });
  stop.abort();
  assert.deepEqual(await first, { ok: false, why: "cancelled" });
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(await slow.run({ text: "told?" }, {}, new AbortController().signal), { ok: true, text: "1" }, "its cancel was told");
  assert.deepEqual(await s.seat.run({ text: "plain" }, {}, new AbortController().signal), { ok: true, text: "just words" });
  const ac = new AbortController();
  ac.abort();
  assert.deepEqual(await s.seat.run({ text: "x" }, {}, ac.signal), { ok: false, why: "cancelled" });
  assert.ok(k.since().some((e) => e.kind === "tool.call" && e.item === "echo" && e.by.agent === "seat:echo"), "the task is a step through its tool, by the seat, on the log");
  assert.ok(k.since().some((e) => e.kind === "plugin.seat" && e.item === "echo" && (e.value as { provided: boolean }).provided));
  rmSync(join(h, "things", "echo"), { recursive: true });
  await k.sync();
  assert.equal(seatFor("echo").instead, "the seat echo is not here, so Claude took the turn");
  assert.ok(k.since().some((e) => e.kind === "plugin.seat" && e.item === "echo" && (e.value as { provided: boolean }).provided === false));
  await k.stop();
  clearSeats();
});

test("a real engine: Sol's two seats on the seam, a block's seat takes a turn over the socket; the card is pressed only from Sol's own page", { timeout: 90_000 }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-seat-wire-")));
  homes.push(dir);
  const h = join(dir, "home");
  mkdirSync(join(h, "things"), { recursive: true });
  block(h, "echo", SEAT);
  const PORT = 7790 + Math.floor(Math.random() * 100);
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: h, SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
      SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"), SOL_LOGDIR: join(dir, "log"),
      SOL_APPDIR: join(dir, "app"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_FRAME: "on",
    },
  });
  const url = `http://127.0.0.1:${PORT}`;
  const get = async (p: string) => (await fetch(url + p)).json() as Promise<any>;
  let things: any = null;
  for (let i = 0; i < 150 && !things?.things?.[0]?.waiting; i++) {
    try { things = await get("/things"); } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const print = things.things[0].waiting.print;
  assert.deepEqual((await get("/things/seats")).seats.map((s: any) => [s.name, s.builtIn]), [["claude", true], ["codex", true]]);
  const plain = await fetch(`${url}/things/echo/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ print }) });
  assert.equal(plain.status, 409, "a program with no Origin of Sol's own does not press");
  assert.match((await plain.json()).why, /only Sol's own window presses a card/);
  const pre = await fetch(`${url}/things/echo/approve`, { method: "OPTIONS", headers: { origin: "http://localhost:1420", "access-control-request-method": "POST" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-headers"), "content-type");
  const ok = await fetch(`${url}/things/echo/approve`, { method: "POST", headers: { origin: "http://localhost:1420", "content-type": "application/json" }, body: JSON.stringify({ print }) });
  assert.equal(ok.status, 200);
  assert.deepEqual((await get("/things/seats")).seats.map((s: any) => s.name), ["claude", "codex", "echo"]);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`, { headers: { origin: "http://localhost:1420" } });
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const got: any[] = [];
  const done = new Promise<void>((r) => ws.on("message", (raw) => { const m = JSON.parse(String(raw)); if (["delta", "done", "error", "seat.instead"].includes(m.type)) got.push(m); if (m.type === "done") r(); }));
  ws.send(JSON.stringify({ type: "say", text: "hi there", seat: "echo" }));
  await done;
  ws.close();
  assert.deepEqual(got.map((m) => m.type), ["delta", "done"]);
  assert.equal(got[0].text, "you said hi there", "its answer, whole: it does not stream");
  assert.equal(got[1].ok, true);
  assert.match(got[1].sessionId, /^seat-echo-[a-z0-9]+$/, "the shell's own id for its conversation, never the block's name as it is");
  assert.deepEqual(got[1].structured, { n: 8 });
  const say = async (m: object) => {
    const w = new WebSocket(`ws://127.0.0.1:${PORT}/`, { headers: { origin: "http://localhost:1420" } });
    await new Promise((r, no) => { w.once("open", r); w.once("error", no); });
    const out: any[] = [];
    await new Promise<void>((r) => { w.on("message", (raw) => { const x = JSON.parse(String(raw)); if (["delta", "done", "error", "seat.instead"].includes(x.type)) out.push(x); if (x.type === "done") r(); }); w.send(JSON.stringify({ type: "say", ...m })); });
    w.close();
    return out;
  };
  const again = await say({ text: "more", seat: "echo", sessionId: got[1].sessionId });
  assert.equal(again[0].text, "you said more", "the same conversation, its own name handed back to it");
  assert.equal(again[1].sessionId, got[1].sessionId);
  const foreign = await say({ text: "x", seat: "echo", sessionId: "11111111-2222-3333-4444-555555555555" });
  assert.deepEqual(foreign.map((m) => m.type), ["error", "done"]);
  assert.match(foreign[0].message, /this conversation is not a echo conversation/, "another seat's conversation is never handed to a block's");
  const log = await get("/log");
  assert.ok(log.events.some((e: any) => e.kind === "plugin.approve" && e.item === "echo"));
  assert.ok(log.events.some((e: any) => e.kind === "tool.call" && e.item === "echo"));
});

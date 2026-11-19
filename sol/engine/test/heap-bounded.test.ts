// The engine ran out of heap after 11 to 28 hours up (#1107). Two things in it grew with no bound, and are held here:
// what a window has not read (a stalled window was sent every message, kept as JS strings in the engine's heap: 600
// session lists held 223 MB), and the holders' look every 20 s (one more for every window that opened, on a machine
// with no ~/.claude/sessions). And the memory line that names what grows next time.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { letGoIfBehind } from "../src/backlog.ts";
import { memoryLine } from "../src/memory.ts";
import { largestBacklog } from "../src/backlog.ts";

const tmp = mkdtempSync(join(tmpdir(), "sol-heap-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** the engine's send() (index.ts): open sockets only, a window too far behind let go first */
function send(ws: WebSocket, msg: object, max: number, said: string[]) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (letGoIfBehind(ws, max, (l) => said.push(l))) return;
  ws.send(JSON.stringify(msg));
}
// a session list as the engine sends it to every window, about 150 KB, with Chinese in it (two bytes a character)
const LIST = { type: "work.sessions", sessions: Array.from({ length: 1200 }, (_, i) => ({ id: `${i}-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`, title: `一個會議的標題 ${i}`, cwd: "/Users/someone/projects/sol" })) };
const ONE = Buffer.byteLength(JSON.stringify(LIST));

async function pair(read: boolean): Promise<{ server: WebSocket; client: WebSocket; wss: WebSocketServer; got: () => number }> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise((r) => wss.once("listening", r));
  const port = (wss.address() as { port: number }).port;
  const server = new Promise<WebSocket>((r) => wss.once("connection", r));
  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  let n = 0;
  client.on("message", () => { n++; });
  await new Promise((r) => client.once("open", r));
  if (!read) (client as unknown as { _socket: { pause(): void } })._socket.pause();   // a page that stopped reading
  return { server: await server, client, wss, got: () => n };
}

test("a window that stops reading is let go once it is MAX behind: what waits for it never passes MAX and one message", async () => {
  const MAX = 4 * 1024 * 1024, said: string[] = [];
  const { server, client, wss } = await pair(false);
  let most = 0, sent = 0;
  for (let i = 0; i < 600 && server.readyState === WebSocket.OPEN; i++) {   // 600 lists: 90 MB if nothing stopped it
    send(server, LIST, MAX, said);
    sent++;
    most = Math.max(most, server.bufferedAmount);
    await new Promise((r) => setImmediate(r));
  }
  assert.notEqual(server.readyState, WebSocket.OPEN, "the stalled window was let go");
  assert.ok(sent < 600, `it stopped short of all 600 (sent ${sent})`);
  assert.ok(most <= MAX + ONE, `at most MAX and one message waited: ${Math.round(most / 1048576)} MB`);
  assert.equal(said.length, 1, "said once on the log");
  assert.ok(largestBacklog() > MAX && largestBacklog() === 0, "the memory line hears the largest backlog once");
  assert.match(said[0], /^backlog: a window had \d+ MB it had not read; its socket is closed \(#1107\)$/);
  client.terminate(); wss.close();
});

test("a window that reads gets every message and stays", async () => {
  const MAX = 4 * 1024 * 1024, said: string[] = [];
  const { server, client, wss, got } = await pair(true);
  for (let i = 0; i < 100; i++) { send(server, LIST, MAX, said); await new Promise((r) => setTimeout(r, 2)); }
  for (let i = 0; i < 200 && got() < 100; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(got(), 100);
  assert.equal(server.readyState, WebSocket.OPEN);
  assert.deepEqual(said, []);
  client.terminate(); wss.close();
});

test("one message bigger than MAX still goes to a window that has read everything before it", () => {
  let gone = false;
  const ws = { bufferedAmount: 0, terminate: () => { gone = true; } };
  assert.equal(letGoIfBehind(ws, 10, () => {}), false);
  ws.bufferedAmount = 11;
  assert.equal(letGoIfBehind(ws, 10, () => {}), true);
  assert.ok(gone);
});

test("the engine's send() lets a window go before it writes more into it", () => {
  const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const from = src.indexOf("function send(ws: Wire, msg: object)");
  assert.ok(from > 0);
  const body = src.slice(from, src.indexOf("\n}\n", from));
  assert.ok(body.indexOf("letGoIfBehind(ws)") > 0 && body.indexOf("letGoIfBehind(ws)") < body.indexOf("ws.send("), "checked before ws.send");
  // the one other writer to a window's socket: a fresh Claude turn's tap, which reads the words for the new name
  const tap = src.slice(src.indexOf("conn.ws = {"), src.indexOf("};", src.indexOf("conn.ws = {")));
  assert.ok(tap.indexOf("letGoIfBehind(ws)") > 0 && tap.indexOf("letGoIfBehind(ws)") < tap.indexOf("ws.send("), "the tap is capped too");
});

test("the holders' look is made once however many windows open, with no ~/.claude/sessions folder", async () => {
  process.env.SOL_SESSIONS_DIR = join(tmp, "no-such-folder");
  const { watchHolders, _stopHolders } = await import("../src/work/holders.ts");
  // the look is unref'd (it never holds the engine open), so it is counted as it is made
  const real = globalThis.setInterval;
  let made = 0;
  globalThis.setInterval = ((...a: Parameters<typeof setInterval>) => { made++; return real(...a); }) as typeof setInterval;
  try { for (let i = 0; i < 200; i++) watchHolders(() => {}); }   // 200 windows opened, as a day of wakes does
  finally { globalThis.setInterval = real; _stopHolders(); }
  assert.equal(made, 1, `one look, not one a window (${made})`);
});

test("the memory line: the heap against its limit, then each part", () => {
  const line = memoryLine({ heapUsed: 512 * 1048576, rss: 900 * 1048576, external: 20 * 1048576 }, 4096 * 1048576, { windows: 3, "largest backlog MB": 0.4, "work runs": 6, "their items": 1234 });
  assert.equal(line, "memory: heap 512 of 4096 MB, rss 900 MB, external 20 MB; windows 3, largest backlog MB 0, work runs 6, their items 1234");
  assert.equal(memoryLine({ heapUsed: 0, rss: 0, external: 0 }, 1048576, {}), "memory: heap 0 of 1 MB, rss 0 MB, external 0 MB");
});

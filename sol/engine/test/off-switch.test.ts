// The off switch (the v2 backend design §14, step 0c, its second half): the kernel sits behind `sol.frame` (frameOn() in
// settings.ts, SOL_FRAME first), and with the switch off the engine is main's. A real engine started with the frame off,
// in a home and a HOME of its own and with no SOL_LOGDIR or SOL_APPDIR (so the machine's own places would be under that
// HOME if anything chose them), makes no log folder and no folder of Sol's own, offers a seat main's tools and no
// kernel tool, and answers the kernel's own routes as main does, by having none. The same engine with the frame on still
// offers the install tool and the blocks' tools. A kernel is never made without its two folders: they are decided only
// where the frame is turned on (syncKernel), so a test cannot write into the person's own by forgetting them.
// Every folder is the test's own; SOL_LOGDIR and SOL_APPDIR are set before anything is imported, for the in-process kernel.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = realpathSync(mkdtempSync(join(tmpdir(), "sol-off-switch-")));
process.env.SOL_APPDIR = join(root, "app");
process.env.SOL_LOGDIR = join(root, "log");
const { syncKernel, kernelNow } = await import("../src/kernel.ts");
const { Kernel } = await import("./kernels.ts");
const { SOL_TOOLS, seatTools, solToolsNow, runSolTool } = await import("../src/tools.ts");
const { INSTALL_TOOLS } = await import("../src/install.ts");

const ENGINE = resolve(import.meta.dirname, "..");
/** this unit's ports (8410-8419): one engine each, so the two never meet */
const PORT = { off: 8411, on: 8412 };
const APP_ORIGIN = "tauri://localhost";   // Sol's own window (door.ts APP): the one origin the kernel's routes listen to
const started: ChildProcess[] = [];
after(() => {
  for (const c of started) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");   // only the engines this file started
  rmSync(root, { recursive: true, force: true });
});
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");
/** every folder under a folder, as paths relative to it */
function folders(dir: string, at = ""): string[] {
  if (!existsSync(join(dir, at))) return [];
  return readdirSync(join(dir, at), { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => [join(at, d.name), ...folders(dir, join(at, d.name))]);
}

/** an engine started from the checkout, every folder under `dir`, HOME too; the frame as asked. No SOL_LOGDIR and no
 *  SOL_APPDIR with the frame off: whatever chose the machine's places would choose them under this HOME */
async function engine(dir: string, port: number, frame: boolean): Promise<{ c: ChildProcess; url: string; me: string; home: string }> {
  const me = join(dir, "me"), home = join(dir, "home");
  mkdirSync(me, { recursive: true });
  mkdirSync(join(home, "things"), { recursive: true });
  const own = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("SOL_") && k !== "NODE_TEST_CONTEXT"));
  const c = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...own, HOME: me, SOL_PORT: String(port), SOL_HOME: home, SOL_PROFILE: join(dir, "profile"), SOL_STATE: join(dir, "work.json"),
      SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
      ...(frame ? { SOL_FRAME: "on", SOL_LOGDIR: join(dir, "log"), SOL_APPDIR: join(dir, "app") } : {}),
    },
  });
  started.push(c);
  const url = `http://127.0.0.1:${port}`;
  for (const end = Date.now() + 30_000; ; await new Promise((r) => setTimeout(r, 200))) {
    if (c.exitCode !== null) throw new Error(`the engine ended before it answered (exit ${c.exitCode})`);
    if (Date.now() > end) throw new Error("the engine did not answer /health within 30 s");
    try { const h = await (await fetch(`${url}/health`)).json() as { pid?: number }; if (h.pid === c.pid) break; } catch { /* not up yet */ }
  }
  return { c, url, me, home };
}
async function stop(c: ChildProcess) {
  if (c.exitCode !== null || c.signalCode !== null) return;
  const gone = new Promise((r) => c.once("exit", r));
  process.kill(c.pid!, "SIGTERM");
  await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  if (c.exitCode === null && c.signalCode === null) { c.kill("SIGKILL"); await gone; }
}
/** the tools a Codex seat is offered: Sol's stdio MCP server (mcp-stdio.ts), started as Codex starts it, against this engine */
async function codexTools(url: string, kernel = false): Promise<string[]> {
  const client = new Client({ name: "off-switch-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "src/mcp-stdio.ts"], cwd: ENGINE, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ENGINE_URL: url, ...(kernel ? { SOL_KERNEL: "on" } : {}) }, stderr: "ignore" }));
  try { return (await client.listTools()).tools.map((t) => t.name); } finally { await client.close(); }
}
/** a route's answer, as status and body */
async function answer(url: string, path: string, init: RequestInit = {}): Promise<[number, string]> {
  const r = await fetch(url + path, init);
  return [r.status, await r.text()];
}

test("a real engine with the frame off: no log folder, no folder of Sol's own, main's tools for a seat, the kernel's routes answered as main answers them, nothing written", { timeout: 90_000 }, async () => {
  const dir = join(root, "off");
  mkdirSync(dir);
  const { c, url, me, home } = await engine(dir, PORT.off, false);
  try {
    assert.deepEqual(await (await fetch(`${url}/log`)).json(), { off: true, last: 0, events: [] }, "the frame is off: no log");

    // the tools a seat is offered are main's list: no `things` (it could only say "the frame is off"), no block's tool
    const names = await codexTools(url);
    assert.ok(!names.includes("things") && !names.includes("tracker") && !names.some((n) => n.startsWith("thing_")), names.join(", "));
    assert.deepEqual(names, solToolsNow().map((t) => t.name), "the Codex seat's list is Sol's tools as main has them (reach's behind their switches, #1276)");

    // the kernel's own routes: with the frame off the engine has none of them, as main has none, so each answers as a
    // route nobody has does, and no key, press or folder is written
    const none = await answer(url, "/no-such-route", { method: "POST" });
    assert.equal(none[0], 404);
    const json = { origin: APP_ORIGIN, "content-type": "application/json" };
    const key = JSON.stringify({ name: "github", key: "ghp_" + "x".repeat(36), purpose: "a test", hosts: ["api.github.com"] });
    assert.deepEqual(await answer(url, "/keys", { method: "POST", headers: json, body: key }), none, "POST /keys: no key is kept");
    assert.deepEqual(await answer(url, "/keys/github/delete", { method: "POST", headers: json, body: "{}" }), none);
    assert.deepEqual(await answer(url, "/keys", { headers: { origin: APP_ORIGIN } }), await answer(url, "/no-such-route"), "GET /keys");
    assert.deepEqual(await answer(url, "/things/seats"), await answer(url, "/no-such-route"), "GET /things/seats");
    assert.deepEqual(await answer(url, "/things/factory", { method: "POST", headers: { origin: APP_ORIGIN } }), none, "POST /things/factory");
    assert.deepEqual(await answer(url, "/things/week/approve", { method: "POST", headers: json, body: JSON.stringify({ print: "x" }) }), none);
    for (const p of ["/keys", "/things/week/approve"]) {
      assert.deepEqual(await answer(url, p, { method: "OPTIONS", headers: { origin: APP_ORIGIN, "access-control-request-method": "POST" } }), await answer(url, "/no-such-route", { method: "OPTIONS" }), `OPTIONS ${p}`);
    }

    // nothing of the kernel's anywhere: not under this HOME (~/Library/Application Support/Sol, ~/.local/share/sol), no log
    // folder in the home (the old place), no log or app folder beside it
    assert.equal(existsSync(join(me, "Library", "Application Support", "Sol")), false, "no ~/Library/Application Support/Sol");
    assert.equal(existsSync(join(me, ".local", "share", "sol")), false, "no ~/.local/share/sol");
    assert.equal(existsSync(join(home, "log")), false, "no log folder in the home");
    assert.deepEqual(folders(dir).filter((f) => /(^|\/)(log|app|keys|stable)$/.test(f) || f.includes("Application Support")), [], "no log or app folder anywhere under this engine's folders");
  } finally { await stop(c); }
});

test("the same engine with the frame on: the install tool and the blocks' tools are offered, a key is kept in Sol's own folder", { timeout: 90_000 }, async () => {
  const dir = join(root, "on");
  mkdirSync(dir);
  const { c, url } = await engine(dir, PORT.on, true);
  try {
    let log: { events?: { kind: string; item?: string }[] } = {};
    for (let i = 0; i < 100 && !log.events?.some((e) => e.kind === "plugin.load" && e.item === "sticky"); i++) {
      log = await (await fetch(`${url}/log`)).json();
      await new Promise((r) => setTimeout(r, 200));
    }
    const names = await codexTools(url, true);   // as index.ts starts it with the kernel there
    assert.ok(names.includes("things"), `the install tool is offered with the frame on (${names.join(", ")})`);
    assert.ok(names.includes("thing_sticky_note"), "and a block's tool");
    const key = JSON.stringify({ name: "github", key: "ghp_" + "x".repeat(36), purpose: "a test", hosts: ["api.github.com"] });
    const [status] = await answer(url, "/keys", { method: "POST", headers: { origin: APP_ORIGIN, "content-type": "application/json" }, body: key });
    assert.equal(status, 200, "POST /keys keeps the key with the frame on");
    assert.ok(folders(join(dir, "app")).length > 0, "in Sol's own folder, the one it was given");
    assert.equal((await answer(url, "/things/seats"))[0], 200);
  } finally { await stop(c); }
});

test("in the engine's process: a seat is offered the install tool only while the kernel is there, and with it off the name is routed as main routes it", async () => {
  const h = join(root, "home-in");
  mkdirSync(join(h, "things"), { recursive: true });
  await syncKernel(h, false);
  assert.equal(kernelNow(), null);
  assert.ok(!SOL_TOOLS.some((t) => t.name === "things"), "Sol's tools are main's list");
  assert.deepEqual(seatTools().map((t) => t.name), solToolsNow().map((t) => t.name), "the frame off: main's list, nothing more");
  assert.equal(text(await runSolTool("things", { action: "install", id: "week" })), "Unknown browser tool: things", "main's answer to a name it does not have");
  assert.equal(text(await runSolTool("tracker", {}, { seat: "sol:block" })), "Unknown browser tool: tracker");
  await syncKernel(h, true);
  try {
    assert.deepEqual(seatTools().map((t) => t.name), [...solToolsNow(), ...INSTALL_TOOLS].map((t) => t.name), "the frame on: the install tool too");
    assert.match(text(await runSolTool("things", { action: "install", id: "nope" })), /^failed: /, "and it answers as the install tool");
  } finally { await syncKernel(h, false); }
  assert.deepEqual(seatTools(), solToolsNow(), "off again: gone again");
});

test("a kernel is never made without its two folders, so nothing can fall back on the person's own: it fails before it writes", () => {
  const h = join(root, "home-bare");
  mkdirSync(join(h, "things"), { recursive: true });
  const me = join(root, "me-bare"), was = process.env.HOME;
  mkdirSync(me);
  process.env.HOME = me;   // were the machine's own places still a default, they would land here, not in the real HOME
  try {
    assert.throws(() => new Kernel(h), /logDir, appDir/);
    assert.throws(() => new Kernel(h, { logDir: join(h, "lab-log") }), /logDir, appDir/, "the log's folder alone is not enough");
    assert.throws(() => new Kernel(h, { appDir: join(h, "app") }), /logDir, appDir/);
  } finally { process.env.HOME = was; }
  assert.deepEqual(readdirSync(me), [], "nothing under HOME");
  assert.deepEqual(readdirSync(h), ["things"], "nothing in the home");
});

test("every test file that turns the frame on gives the log and Sol's own folder places of its own", () => {
  // a test that starts a kernel with the frame on (SOL_FRAME on, or syncKernel(…, true)) without SOL_LOGDIR and
  // SOL_APPDIR would write into the person's own ~/Library/Application Support/Sol
  const dir = join(ENGINE, "test");
  const turns = readdirSync(dir).filter((f) => f.endsWith(".test.ts")).filter((f) => {
    const src = readFileSync(join(dir, f), "utf8");
    return /SOL_FRAME:\s*"on"|syncKernel\([^)]*,\s*true\)/.test(src);
  });
  assert.ok(turns.length >= 5, turns.join(", "));
  for (const f of turns) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(src.includes("SOL_LOGDIR") && src.includes("SOL_APPDIR"), `${f} turns the frame on without SOL_LOGDIR and SOL_APPDIR of its own`);
  }
});

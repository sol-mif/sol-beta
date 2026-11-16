// The real start (the v2 backend design §13, step 0b: "test along the real start path", one of dsh's rules): the engine
// built and started the way the Mac app starts it, asked /health and /log, sent one message over the socket, stopped by
// its PID. Once with the frame on, once with it off, and once with its start broken, which must fail.
//   the app's way   sol/mac/src-tauri/src/lib.rs start_engine_if_needed: node with one argument,
//                   <root>/sol/engine/dist/index.js, in the folder <root>/sol/engine, PATH as root.rs path_env() makes it
//                   (node's own folder, ~/.local/bin, then /usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin),
//                   nothing on stdin, stdout or stderr, the rest of the environment the app's own. The launchd job
//                   (engine/keep, launchd/com.marco.sol-engine.plist) ends in the same `node dist/index.js` in the same
//                   folder; the keeper itself is keep.test.ts's.
//   the root        a folder that holds sol/engine (root.rs), made under the temp folder: the checkout's own files linked
//                   in, read only (never sol/home, never what the engine writes beside itself), and the engine's build
//                   made fresh into it by the checkout's own compiler and tsconfig (npm run build's `tsc`; its output
//                   folder is the one difference), so the checkout's dist/ is never written
//   what is added   only where things go and what keeps it on this machine: HOME, SOL_HOME, SOL_STATE, SOL_TEAM,
//                   SOL_LOGDIR, SOL_APPDIR, SOL_PROFILE, SOL_LOG under the temp folder, SOL_PORT from this unit's range
//                   (8400-8409), SOL_NO_RENEW, SOL_NO_SHIP_CHECK, SOL_TEAM_OFFLINE, SOL_TRACK=off; SOL_FRAME=on for the
//                   frame on. The frame off is the app's own default: no SOL_FRAME and no settings file.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, realpathSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import WebSocket from "ws";

const ENGINE = resolve(import.meta.dirname, "..");
/** this unit's ports: one start each, so the three never meet */
const PORT = { on: 8402, off: 8403, broken: 8404 };
/** the checkout's own engine files a root needs, linked in: what git keeps of sol/engine, and its packages. Never what
 *  the engine writes beside itself (settings.json, titles.json, doors.json, team.json, .env, dist.good, .stage, ...) */
const ENGINE_FILES = ["src", "blocks", "helpers", "node_modules", "package.json", "package-lock.json", "tsconfig.json", "keep", "launchd", "systemd", "convert-check"];
/** the face's own page, as the bundled app's socket says it (door.ts APP) */
const APP_ORIGIN = "tauri://localhost";
/** the app's start, as written: lib.rs's start_engine_if_needed and root.rs's PATH */
const TAURI = join(ENGINE, "..", "mac", "src-tauri", "src");
const LIB = readFileSync(join(TAURI, "lib.rs"), "utf8"), ROOT_RS = readFileSync(join(TAURI, "root.rs"), "utf8");
/** root.rs path_env()'s usual places, read from it: the PATH the app gives the engine ends with them */
const BASE_PATH = /let base = "([^"]+)";/.exec(ROOT_RS)?.[1] ?? "";

const dirs: string[] = [];
const started: ChildProcess[] = [];
after(() => {
  for (const c of started) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");   // only the engines this file started
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** a root under a temp folder, with the engine built into it */
function rootIn(dir: string): string {
  const root = join(dir, "root"), sol = join(root, "sol"), eng = join(sol, "engine");
  mkdirSync(eng, { recursive: true });
  for (const n of readdirSync(join(ENGINE, ".."))) if (n !== "engine" && n !== "home") symlinkSync(join(ENGINE, "..", n), join(sol, n));
  for (const n of ENGINE_FILES) if (existsSync(join(ENGINE, n))) symlinkSync(join(ENGINE, n), join(eng, n));
  execFileSync(process.execPath, [join(ENGINE, "node_modules", "typescript", "bin", "tsc"), "-p", join(ENGINE, "tsconfig.json"), "--outDir", join(eng, "dist")], { stdio: "pipe", timeout: 120_000 });
  return root;
}

/** the environment the app hands the engine (lib.rs: its own, with PATH set), and where this test sends things */
function envOf(dir: string, port: number, frame: boolean): NodeJS.ProcessEnv {
  const home = join(dir, "home");
  mkdirSync(join(home, "things"), { recursive: true });
  // the app's own environment, as launchd gives an app: none of this test run's switches (SOL_*, node's test runner's)
  const own = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("SOL_") && k !== "NODE_OPTIONS" && k !== "NODE_TEST_CONTEXT" && !k.startsWith("TSX")));
  const me = join(dir, "me");   // HOME: what the engine writes in a person's own folders lands here
  mkdirSync(me, { recursive: true });
  return {
    ...own,
    PATH: [dirname(process.execPath), join(me, ".local", "bin"), BASE_PATH].join(":"),   // root.rs path_env(): node's folder, ~/.local/bin, its usual places
    HOME: me, SOL_PORT: String(port), SOL_HOME: home, SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"),
    SOL_LOGDIR: join(dir, "log"), SOL_APPDIR: join(dir, "app"), SOL_PROFILE: join(dir, "profile"), SOL_LOG: join(dir, "engine.log"),
    SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    ...(frame ? { SOL_FRAME: "on" } : {}),
  };
}

const answers = async (port: number): Promise<boolean> => { try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }); return true; } catch { return false; } };
const get = async (port: number, path: string) => { const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) }); assert.equal(r.status, 200, `${path} answered ${r.status}`); return r.json() as Promise<any>; };

/** start the engine at a root the app's way, wait for it to answer (20 s at most: the app's grace, lib.rs START_GRACE),
 *  ask /health and /log, say one thing on the socket, stop it by its PID. Rejects with why when it does not come up */
async function smoke(root: string, dir: string, port: number, frame: boolean) {
  assert.equal(await answers(port), false, `something answers on ${port} already: not this test's engine`);
  const eng = join(root, "sol", "engine");
  const c = spawn(process.execPath, [join(eng, "dist", "index.js")], { cwd: eng, env: envOf(dir, port, frame), stdio: "ignore" });
  started.push(c);
  try {
    let health: any = null;
    for (const end = Date.now() + 20_000; !health; await new Promise((r) => setTimeout(r, 200))) {
      if (c.exitCode !== null || c.signalCode !== null) throw new Error(`the engine did not come up: it ended before it answered (${c.signalCode ?? `exit ${c.exitCode}`})`);
      if (Date.now() > end) throw new Error("the engine did not come up: it did not answer /health within 20 s");
      try { health = await get(port, "/health"); } catch { /* not up yet */ }
    }
    assert.equal(health.ok, true);
    assert.equal(health.pid, c.pid, "the engine that answers is the one started here");
    assert.equal(health.port, port);
    // the frame's blocks load after the engine listens (index.ts starts the kernel as it begins to listen), so on a busy
    // machine /health answers before the load is on the log: the log is asked until Sol's own block is on it, 20 s at
    // most (the same grace), and then read as it is
    let log = await get(port, "/log?since=0");
    const loaded = () => log.events?.some((e: any) => e.kind === "plugin.load" && e.item === "sticky");
    for (const end = Date.now() + 20_000; frame && !loaded() && Date.now() < end;) {
      await new Promise((r) => setTimeout(r, 200));
      log = await get(port, "/log?since=0");
    }
    // the socket, as the face opens it: the engine says what a face is told as it connects (its settings among it); a
    // ping is answered with its pong
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { origin: APP_ORIGIN });
    const heard: any[] = [];
    const pong = await new Promise<any>((ok, no) => {
      const t = setTimeout(() => no(new Error(`no pong within 5 s (heard ${heard.map((m) => m.type).join(", ")})`)), 5000);
      ws.on("message", (b) => { const m = JSON.parse(String(b)); heard.push(m); if (m.type === "pong") { clearTimeout(t); ok(m); } });
      ws.on("open", () => ws.send(JSON.stringify({ type: "ping", at: 4242 })));
      ws.on("error", (e) => { clearTimeout(t); no(e); });
    });
    ws.close();
    // it stays up, as the app's engine does: still the same engine, answering, a while after its first answer (an engine
    // that ends by itself soon after it starts is a broken start too)
    await new Promise((r) => setTimeout(r, 3000));
    assert.ok(c.exitCode === null && c.signalCode === null, `the engine ended by itself after it answered (${c.signalCode ?? `exit ${c.exitCode}`})`);
    assert.equal((await get(port, "/health")).pid, c.pid, "and it still answers");
    // stopped by its PID: it was running, and it ended by the SIGTERM sent to it
    const gone = new Promise((r) => c.once("exit", r));
    process.kill(c.pid!, "SIGTERM");
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
    assert.equal(c.signalCode, "SIGTERM", `it ended by the SIGTERM sent to its PID (${c.signalCode ?? `exit ${c.exitCode}`})`);
    return { health, log, pong, heard: heard.map((m) => m.type) };
  } finally {
    // when it was not stopped above (a check failed first): stopped by its PID, the one started here and no other
    if (c.exitCode === null && c.signalCode === null) {
      const gone = new Promise((r) => c.once("exit", r));
      process.kill(c.pid!, "SIGTERM");
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
      if (c.exitCode === null && c.signalCode === null) { c.kill("SIGKILL"); await gone; }
    }
  }
}

test("the start this file makes is the app's: lib.rs starts node on dist/index.js in sol/engine with PATH and nothing else", () => {
  // read from the app's own code, so a change to how the app starts the engine fails here before it drifts from the smoke
  const body = /pub fn start_engine_if_needed\(app: &AppHandle\) \{\n([\s\S]*?)\n\}\n/.exec(LIB)?.[1] ?? "";
  const chain = /let _ = Command::new\(root::node\(\)\)([\s\S]*?)\.spawn\(\);/.exec(body)?.[1] ?? "";
  assert.deepEqual(chain.split("\n").map((l) => l.trim()).filter(Boolean), [
    '.arg(eng.join("dist").join("index.js"))',
    ".current_dir(&eng)",
    '.env("PATH", root::path_env())',
    ".stdin(Stdio::null())",
    ".stdout(Stdio::null())",
    ".stderr(Stdio::null())",
  ], "the app's start: one argument, the engine's folder, PATH, nothing on the three streams (this file does the same)");
  assert.match(body, /let eng = root\.join\("sol"\)\.join\("engine"\);/, "the engine's folder is <root>/sol/engine");
  assert.equal(BASE_PATH, "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin", "root.rs's usual places, as this file puts them on PATH");
  assert.match(ROOT_RS, /dirs\.push\(format!\("\{\}\/\.local\/bin", h\.to_string_lossy\(\)\)\);/, "~/.local/bin after node's own folder");
  assert.match(readFileSync(join(ENGINE, "keep"), "utf8"), /^node dist\/index\.js &$/m, "the launchd job's keeper runs the same command in the same folder");
});

test("the real start, frame on: built, started as the app starts it, /health and /log answer, the socket answers, stopped by its PID", { timeout: 120_000 }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-start-on-")));
  dirs.push(dir);
  const root = rootIn(dir);
  const r = await smoke(root, dir, PORT.on, true);
  assert.equal(r.log.events[0]?.kind, "engine.start", "the log's first line says which engine wrote what follows");
  assert.equal(r.log.events[0]?.v, 1, "in the event format v1");
  assert.deepEqual(r.log.events.slice(0, 2).map((e: any) => e.kind), ["engine.start", "engine.tz"]);
  assert.ok(r.log.events.some((e: any) => e.kind === "plugin.load" && e.item === "sticky"), "Sol's own blocks load from the root it was started at");
  assert.equal(r.log.last, r.log.events.at(-1).seq);
  assert.ok(readdirSync(join(dir, "log")).some((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)), "the log is in the folder it was given");
  assert.deepEqual([r.pong.type, r.pong.at], ["pong", 4242]);
  assert.ok(r.heard.includes("settings"), `the engine said its settings as the face connected (heard ${r.heard.join(", ")})`);
  assert.equal(await answers(PORT.on), false, "stopped: nothing answers on its port");
});

test("the real start, frame off: the same start answers, /log says off, no log folder is made", { timeout: 120_000 }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-start-off-")));
  dirs.push(dir);
  const root = rootIn(dir);
  const r = await smoke(root, dir, PORT.off, false);
  assert.deepEqual(r.log, { off: true, last: 0, events: [] }, "the frame off is main's behaviour: no log");
  assert.equal(existsSync(join(dir, "log")), false, "and no log folder");
  assert.deepEqual([r.pong.type, r.pong.at], ["pong", 4242]);
  assert.ok(r.heard.includes("settings"), `heard ${r.heard.join(", ")}`);
  assert.equal(await answers(PORT.off), false, "stopped: nothing answers on its port");
});

test("the real start fails when the engine cannot start: a root whose build throws at its start is said, not passed", { timeout: 120_000 }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-start-broken-")));
  dirs.push(dir);
  const root = rootIn(dir);
  const index = join(root, "sol", "engine", "dist", "index.js");
  writeFileSync(index, `throw new Error("broken on purpose");\n${readFileSync(index, "utf8")}`);   // the scratch copy's build, never the checkout's
  await assert.rejects(smoke(root, dir, PORT.broken, true), /the engine did not come up: it ended before it answered \(exit 1\)/);
  assert.equal(await answers(PORT.broken), false);
});

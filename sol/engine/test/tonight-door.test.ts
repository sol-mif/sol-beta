// The review session's card (#416) at the socket: a press and the card's key are for the app's own page only. A real
// engine runs on its own port, home and profile (SOL_TONIGHT=off, offline), and two sockets ask it: one with no Origin
// (a program on this Mac, as an agent's script would be) is refused, one from the app's page (tauri://localhost) is let
// through to the card's own checks. A program that fakes the Origin is not stopped here: the guard and the session's
// words are the other two fences, and the same program could run `gh pr merge` itself.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort, ownHealth } from "./test-engine.ts";
import { appPage } from "../src/door.ts";

const ENGINE = join(import.meta.dirname, "..");
let PORT = 0;   // the system's free port, taken at the start (test-engine.ts, #938)
const dir = mkdtempSync(join(tmpdir(), "sol-tonight-door-"));
mkdirSync(join(dir, "home"));
let engine: ChildProcess | null = null;
after(() => { engine?.kill(); rmSync(dir, { recursive: true, force: true }); });

async function up() {
  if (engine) return;
  PORT ||= await freePort();
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_TONIGHT: "off",
    },
  });
  await ownHealth(engine, PORT);   // the engine this test started, not another run's on the port (#938)
}

/** one question on a socket opened with these headers, its answer by rid */
async function ask(headers: Record<string, string>, m: object): Promise<any> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { headers });
  await new Promise((ok, no) => { ws.once("open", ok); ws.once("error", no); });
  const rid = "r" + Math.random().toString(36).slice(2);
  const got = new Promise<any>((ok) => ws.on("message", (raw) => { const x = JSON.parse(String(raw)); if (x.rid === rid) ok(x); }));
  ws.send(JSON.stringify({ ...m, rid, fromSol: true }));   // a fromSol of its own is never believed
  const r = await Promise.race([got, new Promise((_, no) => setTimeout(() => no(new Error("no answer")), 10_000))]);
  ws.close();
  return r;
}

test("appPage: an Origin of the app's only; none, a foreign one or the engine's own port is not", () => {
  const opts = { port: 7777, owner: "" };
  assert.equal(appPage({ origin: "tauri://localhost" }, opts), true);
  assert.equal(appPage({ origin: "http://localhost:1420" }, opts), true);
  assert.equal(appPage({}, opts), false);
  assert.equal(appPage({ origin: "http://127.0.0.1:7777" }, opts), false);
  assert.equal(appPage({ origin: "https://evil.example" }, opts), false);
});

test("the socket: no Origin is refused the key and the press; the app's page is let through to the card's checks", { timeout: 60_000 }, async () => {
  await up();
  const sessionId = "session-none-abcdef";
  const bare = await ask({}, { type: "team.tonight.key", sessionId });
  assert.equal(bare.error, "only Sol's own window");
  assert.equal(bare.key, undefined);
  const press = await ask({}, { type: "team.tonight.press", sessionId, verdict: "fold", number: 1, key: "x" });
  assert.match(press.error, /pressed in Sol's own window/);
  const page = await ask({ origin: "tauri://localhost" }, { type: "team.tonight.key", sessionId });
  assert.equal(page.error, undefined);
  assert.equal(page.key, "");                                                   // let in; this session has no card
  const pagePress = await ask({ origin: "tauri://localhost" }, { type: "team.tonight.press", sessionId, verdict: "fold", number: 1, key: "x" });
  assert.match(pagePress.error, /no review card/);                              // past the door, stopped by the card
});

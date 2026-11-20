// GET /log (#633) hands the whole history, so only Sol's own pages may read it (#1715). A real engine on its own port,
// home and profile; four knocks: a foreign page's Origin, a foreign hostname pointed at this Mac (same-origin to the
// engine, no Origin), Sol's own window, and a program on this Mac. Only the last two are answered.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort, ownHealth } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
let PORT = 0;
const dir = mkdtempSync(join(tmpdir(), "sol-log-door-"));
mkdirSync(join(dir, "home"));
let engine: ChildProcess | null = null;
after(() => { engine?.kill(); rmSync(dir, { recursive: true, force: true }); });

/** GET /log with these headers: its status and whether it handed the page the answer across origins */
const knock = (headers: Record<string, string>) => new Promise<{ status: number; cors?: string }>((ok, no) => {
  const r = request({ host: "127.0.0.1", port: PORT, path: "/log?since=0", headers }, (res) => {
    res.resume();
    ok({ status: res.statusCode ?? 0, cors: res.headers["access-control-allow-origin"] as string | undefined });
  });
  r.on("error", no);
  r.end();
});

test("GET /log: a foreign page is refused, by its Origin or by its hostname; Sol's window and a program are answered", { timeout: 60_000 }, async () => {
  PORT = await freePort();
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_TONIGHT: "off", SOL_FACE: "",
    },
  });
  await ownHealth(engine, PORT);
  const here = `127.0.0.1:${PORT}`;
  const foreign = await knock({ host: here, origin: "https://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.cors, undefined);
  const rebound = await knock({ host: `evil.example:${PORT}`, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" });
  assert.equal(rebound.status, 403, "a page whose hostname points at this Mac reads nothing");
  const window = await knock({ host: here, origin: "http://localhost:1420" });
  assert.equal(window.status, 200);
  assert.equal(window.cors, "http://localhost:1420");
  assert.equal((await knock({ host: `localhost:${PORT}` })).status, 200);
});

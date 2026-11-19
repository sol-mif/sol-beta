// Home talks only with Sol's own windows (the lead's security finding 4, fixed at integration): every home.* message,
// reads included, is handled only from one of Sol's own windows (index.ts fromSol, the door's own test, the same one
// the run and go-back lines use); any other connection is answered { type: "home.refused", why } and nothing is read or
// written. Home's pushes (home.today after a change) go only to Sol's own windows, never to every socket.
// homeWindow and homeSocket (home/wire.ts) are the two calls index.ts makes; the real engine below shows the door in
// front of them keeps a page elsewhere off the socket altogether.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { RefusedMsg } from "../src/contract/home/today.ts";
import { homeSocket, homeWindow, makeCtx } from "../src/home/wire.ts";
import { newThing } from "../src/home/items.ts";
import { isHomeKind } from "../src/contract/kinds.ts";
import { cleanup, rig } from "./fixtures/home/rig.ts";
import { NOW, seed } from "./fixtures/home/seed.ts";
import { freePort } from "./test-engine.ts";

const dirs: string[] = [];
const engines: ChildProcess[] = [];
const sockets: WebSocket[] = [];
after(async () => {
  for (const s of sockets) s.terminate();
  for (const e of engines) {
    if (e.exitCode !== null || e.signalCode !== null) continue;
    const gone = new Promise((r) => e.once("exit", r));
    e.kill();
    const t = setTimeout(() => e.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(t);
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  cleanup();
});

test("a connection that is not one of Sol's windows: home.today and home.answer are refused, nothing is written, and Home's pushes never reach it", async () => {
  const r = rig({ now: NOW });
  // the live way: a context with no `all` of its own pushes through home/wire.ts, to the windows it was told of
  const ctx = makeCtx({ home: r.home, log: r.log, now: () => r.clock.now });
  for (const t of seed(NOW)) newThing(ctx, t);
  const own = r.face("Sol's window"), other = r.face("Sol's other window"), foreign = r.face("a page elsewhere");
  const forgetOwn = homeWindow(own, true), forgetOther = homeWindow(other, true), forgetForeign = homeWindow(foreign, false);
  try {
    const before = r.bytes();
    await homeSocket(foreign, { type: "home.today" }, false, ctx);
    await homeSocket(foreign, { type: "home.answer", thingId: "t-chem-set6", answer: "hold 19–21 for it" }, false, ctx);
    await homeSocket(foreign, { type: "home.undo", ledgerId: "0".repeat(64) }, false, ctx);
    assert.deepEqual(foreign.got.map((m) => m.type), ["home.refused", "home.refused", "home.refused"], "each one refused, nothing else sent");
    for (const m of foreign.got) assert.ok(RefusedMsg.safeParse(m).success, JSON.stringify(m));
    assert.match(foreign.got[0].why, /Sol's own windows/);
    assert.equal(r.bytes(), before, "the log has no new line: not even today.shown, so nothing was read either");
    assert.equal(ctx.items.get("t-chem-set6")?.state, "you", "the Thing is as it was");
    assert.equal(own.got.length + other.got.length, 0, "a refused ask moves nothing, so no window is told anything");

    // a Sol window changes something: the other Sol window is pushed home.today; the page elsewhere is not
    await homeSocket(own, { type: "home.answer", thingId: "t-chem-set6", answer: "hold 19–21 for it" }, true, ctx);
    assert.ok(own.got.some((m) => m.type === "home.done"), "the asker gets its receipt");
    assert.ok(other.got.some((m) => m.type === "home.today"), "the other Sol window is told the list changed");
    assert.equal(foreign.got.filter((m) => m.type !== "home.refused").length, 0, "no push reaches the page elsewhere");
    assert.notEqual(r.bytes(), before, "the Sol window's answer was written");

    // a window that closed is told nothing more
    forgetOther();
    const n = other.got.length;
    await homeSocket(own, { type: "home.later", thingId: "t-maya-data" }, true, ctx);
    assert.equal(other.got.length, n, "a closed window is off the list");
    assert.equal(foreign.got.filter((m) => m.type !== "home.refused").length, 0);
  } finally { forgetOwn(); forgetOther(); forgetForeign(); }
});

/** an engine of its own on a port nobody else holds (#1144), every folder in a temp one */
async function engine(port: number) {
  const dir = mkdtempSync(join(tmpdir(), "sol-home-windows-"));
  dirs.push(dir);
  const home = join(dir, "home");
  const thing = { id: "it-dddddddddddd", read: "you", folder: "", words: "d", state: "you", waitsOn: "you", at: Date.now(), links: [], made: [] };
  mkdirSync(join(home, "items", thing.id), { recursive: true });
  writeFileSync(join(home, "items", thing.id, "thing.json"), JSON.stringify(thing));
  const base = { ...process.env };
  base.SOL_HOME_WHOLE = "off";   // off unless the test says on (on for the team by default since #691)
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(import.meta.dirname, ".."), stdio: "ignore",
    env: {
      ...base, SOL_PORT: String(port), SOL_HOME: home, SOL_STATE: join(dir, "state", "work.json"), SOL_TEAM: join(dir, "team", "team.json"),
      SOL_LOGDIR: join(dir, "log"), SOL_LOG: join(dir, "engine.log"), SOL_PROFILE: join(dir, "profile"), SOL_APPDIR: join(dir, "app"),
      SOL_FRAME: "on", SOL_HOME_WHOLE: "on", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    },
  });
  engines.push(e);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, thing, log: async () => (await (await fetch(`${url}/log`)).json() as { events: { kind: string }[] }).events };
}
type Msg = { type: string; [k: string]: any };
function socket(port: number, origin?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { headers: { origin } } : {});
  sockets.push(ws);
  const got: Msg[] = [];
  ws.on("message", (raw) => { got.push(JSON.parse(raw.toString())); });
  const opened = new Promise<boolean>((r) => { ws.once("open", () => r(true)); ws.once("error", () => r(false)); ws.once("unexpected-response", () => r(false)); });
  return { ws, got, opened };
}

test("a real engine with Home on: a socket from a foreign Origin never reaches Home, and a Sol window's change is pushed to Sol's windows only", { timeout: 90_000 }, async () => {
  const port = await freePort();   // nobody else's (#1144)
  const e = await engine(port);
  const sol = socket(port), other = socket(port), foreign = socket(port, "https://evil.example");
  assert.equal(await sol.opened, true);
  assert.equal(await other.opened, true);
  assert.equal(await foreign.opened, false, "the door refuses a page elsewhere before any message");
  const kinds = (await e.log()).map((x) => x.kind).filter(isHomeKind);
  sol.ws.send(JSON.stringify({ type: "home.answer", thingId: e.thing.id, answer: "did it" }));
  for (let t = 0; t < 20_000 && !other.got.some((m) => m.type === "home.today"); t += 50) await new Promise((r) => setTimeout(r, 50));
  assert.ok(sol.got.some((m) => m.type === "home.done"), "Sol's window is answered");
  assert.ok(other.got.some((m) => m.type === "home.today"), "and Sol's other window is pushed the change");
  assert.equal(foreign.got.length, 0, "the page elsewhere got nothing");
  assert.ok((await e.log()).map((x) => x.kind).filter(isHomeKind).length > kinds.length, "the Sol window's answer is on the log");
});

// Home 1 (#790): the one switch, home.whole (settings.ts homeWhole(); env SOL_HOME_WHOLE first). On by default for the
// team since #691 (versions.ts: concept on, complete off); set off: the socket's Home line is never taken, no
// <HOME>/items is made, no Home kind is written, and main's engine answers as before. On, with the frame on, a real
// engine on its own port answers home.today over the socket, and a change one window makes is pushed to every window
// (index.ts setHomeSend). On with the frame off, Home stays silent. The real
// settings.json is never touched: the setting is read through clean().
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { clean, getSettings, homeWhole } from "../src/settings.ts";
import { homeOn } from "../src/home/wire.ts";
import { kernelNow } from "../src/kernel.ts";
import { isHomeKind } from "../src/contract/kinds.ts";
import { freePort } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
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
});

test("the switch: env first (on/1/true, off/0/false), else the setting home.whole, else its stage (#691, concept, complete and product on); clean() keeps it", () => {
  const was = process.env.SOL_HOME_WHOLE;
  try {
    process.env.SOL_HOME_WHOLE = "off";
    assert.equal(clean({}).home, undefined, "not written until someone sets it");
    assert.deepEqual(clean({ home: { whole: true } }).home, { whole: true }, "settings.set {patch: {home: {whole: true}}} survives the cleaning");
    assert.deepEqual(clean({ frame: true, home: { whole: false } }).home, { whole: false });
    assert.equal(clean({ home: { whole: "yes" } }).home, undefined, "a value that is no boolean is dropped");
    assert.equal(clean({ home: true }).home, undefined);
    for (const v of ["on", "1", "true", " ON "]) { process.env.SOL_HOME_WHOLE = v; assert.equal(homeWhole(), true, v); }
    for (const v of ["off", "0", "false"]) { process.env.SOL_HOME_WHOLE = v; assert.equal(homeWhole(), false, v); }
    delete process.env.SOL_HOME_WHOLE;
    const ver = process.env.SOL_VERSION;
    try {
      if (getSettings().home?.whole === undefined) {
        process.env.SOL_VERSION = "concept"; assert.equal(homeWhole(), true, "nothing set, concept: on (versions.ts)");
        process.env.SOL_VERSION = "complete"; assert.equal(homeWhole(), true, "nothing set, complete: on");
        process.env.SOL_VERSION = "product"; assert.equal(homeWhole(), true, "nothing set, product: on (its card stands at product, #1717)");
      }
    } finally { if (ver === undefined) delete process.env.SOL_VERSION; else process.env.SOL_VERSION = ver; }
    process.env.SOL_HOME_WHOLE = "off";
    assert.equal(homeOn(), false, "off: the socket's Home line is not taken");
    process.env.SOL_HOME_WHOLE = "on";
    assert.equal(kernelNow(), null, "no frame in this process");
    assert.equal(homeOn(), false, "on with the frame off: silent");
  } finally { if (was === undefined) delete process.env.SOL_HOME_WHOLE; else process.env.SOL_HOME_WHOLE = was; }
});

type Msg = { type: string; [k: string]: any };
/** an engine of its own on a port nobody else holds (#1144), every folder in a temp one */
async function engine(port: number, env: Record<string, string>, before?: (home: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "sol-home-switch-"));
  dirs.push(dir);
  const home = join(dir, "home");
  mkdirSync(home);
  before?.(home);
  const base = { ...process.env };
  base.SOL_HOME_WHOLE = "off";   // off unless the test says on (on for the team by default since #691)
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...base, SOL_PORT: String(port), SOL_HOME: home, SOL_STATE: join(dir, "state", "work.json"), SOL_TEAM: join(dir, "team", "team.json"),
      SOL_LOGDIR: join(dir, "log"), SOL_LOG: join(dir, "engine.log"), SOL_PROFILE: join(dir, "profile"), SOL_APPDIR: join(dir, "app"),
      SOL_FRAME: "on", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", ...env,
    },
  });
  engines.push(e);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  /** one more window on the engine */
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(ws);
    const got: Msg[] = [];
    ws.on("message", (raw) => { got.push(JSON.parse(raw.toString())); });
    await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
    const next = async (pred: (m: Msg) => boolean, ms = 20_000): Promise<Msg> => {
      for (let t = 0; t < ms; t += 50) { const m = got.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 50)); }
      throw new Error("timed out; got " + got.map((m) => m.type).join(" "));
    };
    return { got, next, say: (m: object) => ws.send(JSON.stringify(m)) };
  };
  const first = await open();
  const log = async (): Promise<Msg[]> => (await (await fetch(`${url}/log`)).json() as { events: Msg[] }).events;
  return { home, ...first, open, log };
}

test("a real engine, the switch off (the default): home.today is not answered, no <HOME>/items, no Home kind on the log", { timeout: 90_000 }, async () => {
  const e = await engine(await freePort(), {});
  e.say({ type: "home.today" });
  e.say({ type: "home.answer", thingId: "t-chem-set6", answer: "x" });
  e.say({ type: "settings.get" });
  await e.next((m) => m.type === "settings" && e.got.filter((x) => x.type === "settings").length >= 2);   // one on connect, one for the ask after Home's
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(e.got.filter((m) => m.type.startsWith("home.")).length, 0, "no Home message comes back");
  assert.equal(existsSync(join(e.home, "items")), false);
  const kinds = (await e.log()).map((m) => m.kind);
  assert.ok(kinds.includes("engine.start"), "the frame is on: the log is there");
  assert.deepEqual(kinds.filter(isHomeKind), [], "no Home kind written");
});

test("a real engine with SOL_HOME_WHOLE=on and the frame on: home.today over the socket gets one back", { timeout: 90_000 }, async () => {
  const e = await engine(await freePort(), { SOL_HOME_WHOLE: "on" });
  e.say({ type: "home.today" });
  const t = await e.next((m) => m.type === "home.today");
  assert.deepEqual(t.today, { needs: [], moving: [], week: [], line: "Nothing needs you." });
  assert.deepEqual(t.things, []);
  e.say({ type: "home.answer", thingId: "t-nobody", answer: "x" });
  await e.next((m) => m.type === "home.today" && e.got.filter((x) => x.type === "home.today").length >= 2);
  assert.equal(e.got.filter((m) => m.type === "home.done").length, 0, "an unknown id: the plain state, no receipt");
  assert.deepEqual((await e.log()).map((m) => m.kind).filter(isHomeKind), ["today.shown"], "the list shown once, nothing else");
  assert.equal(existsSync(join(e.home, "items")), false, "no Thing yet, no folder");
});

test("a real engine with SOL_HOME_WHOLE=on: after one window answers, the other window is sent home.today without asking", { timeout: 90_000 }, async () => {
  // a Thing in the store before the start (one the log does not name is still listed, by its age)
  const thing = { id: "it-cccccccccccc", read: "you", folder: "", words: "c", state: "you", waitsOn: "you", at: Date.now(), links: [], made: [] };
  const e = await engine(await freePort(), { SOL_HOME_WHOLE: "on" }, (home) => {
    mkdirSync(join(home, "items", thing.id), { recursive: true });
    writeFileSync(join(home, "items", thing.id, "thing.json"), JSON.stringify(thing));
  });
  const other = await e.open();
  e.say({ type: "home.today" });
  assert.deepEqual((await e.next((m) => m.type === "home.today")).today.needs, [thing.id]);
  assert.equal(other.got.filter((m) => m.type === "home.today").length, 0, "the other window asked nothing yet");
  e.say({ type: "home.answer", thingId: thing.id, answer: "did it" });
  await e.next((m) => m.type === "home.done");
  const pushed = await other.next((m) => m.type === "home.today");
  assert.deepEqual(pushed.today.needs, [], "the other window is told the list changed");
  assert.equal(other.got.filter((m) => m.type === "home.done").length, 0, "only the asker gets the receipt");
});

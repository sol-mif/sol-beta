// Cowork v3's switch (fr-30, eval F7): with it off, no v3 route answers, no v3 module is loaded and today's Cowork is
// today's; with it on, the three slice 0 messages answer. Two real engines on their own ports, homes, state and team
// files (SOL_COWORK_V3 off, then on), as engine-wire.test.ts runs one; nothing leaves the machine.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { registerHooks } from "node:module";
import { freePort, ownHealth } from "./test-engine.ts";

// every module this process loads, seen as it is resolved: with the switch off not one is under team/v3/ (slice 8)
const loaded: string[] = [];
registerHooks({ resolve: (spec, ctx, next) => { const r = next(spec, ctx); loaded.push(r.url); return r; } });

const ENGINE = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sol-v3-off-"));
const engines: ChildProcess[] = [];
after(() => { for (const e of engines) e.kill(); rmSync(dir, { recursive: true, force: true }); });

async function up(name: string, v3: "on" | "off") {
  // a port the system says is free: a random one in a fixed range met this file's other engines (alive until after())
  // and other files' (tonight-door, rename-wire), and /health then answered from an engine with v3 off (#574, #938)
  const port = await freePort();
  const d = join(dir, name);
  mkdirSync(join(d, "home"), { recursive: true });
  writeFileSync(join(d, "team.json"), JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" } }));
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(port), SOL_HOME: join(d, "home"), SOL_PROFILE: join(d, "profile"),
      SOL_STATE: join(d, "state", "work.json"), SOL_TEAM: join(d, "team.json"), SOL_LOG: join(d, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_COWORK_V3: v3,
    },
  });
  engines.push(e);
  await ownHealth(e, port);   // this test's engine, not another run's on the port
  return { port, state: join(d, "state") };
}

type Msg = { type: string; [k: string]: any };
const WINDOW = "http://localhost:1420";   // Sol's own window (door.ts appPage): no Origin is a program on this Mac
async function face(port: number, origin?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { headers: { origin } } : {});
  const got: Msg[] = [];
  ws.on("message", (raw) => { got.push(JSON.parse(raw.toString()) as Msg); });
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const wait = async (pred: (m: Msg) => boolean, ms: number) => {
    for (let t = 0; t < ms; t += 50) { const m = got.find(pred); if (m) return m; await new Promise((r) => setTimeout(r, 50)); }
    return null;
  };
  return { ws, got, wait, say: (m: object) => ws.send(JSON.stringify(m)) };
}
const V3 = ["team.v3.append", "team.v3.since", "team.v3.record", "team.v3.migrate.dry", "team.v3.migrate.run", "team.v3.on"];   // slice 0, slice 8

test("the switch off: no v3 route answers, no v3 module is loaded, no trail or key is made", { timeout: 90_000 }, async () => {
  const { port, state } = await up("off", "off");
  const f = await face(port);
  f.say({ type: "team.hello" });
  assert.ok(await f.wait((m) => m.type === "team.state", 10_000), "today's Cowork answers as it does");
  V3.forEach((type, i) => f.say({ type, rid: `v3-${i}`, project: "sol", kind: "item", item: "x", value: { title: "x" } }));
  f.say({ type: "team.nope", rid: "today" });
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(f.got.filter((m) => String(m.rid ?? "").startsWith("v3-") || m.rid === "today"), [], "a v3 case gets today's answer to a case the engine does not know: none");
  assert.equal(f.got.some((m) => String(m.type).startsWith("team.v3")), false);
  const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal("trail" in h, false, "/health shows no trail");
  assert.equal(existsSync(join(state, "cowork-v3")), false, "no trail file and no key on the disk");
  f.ws.close();
});

test("the switch off in the code: nothing outside team/v3 imports it but wire.ts, and only behind the switch", () => {
  const src = join(ENGINE, "src");
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? (x.name === "v3" ? [] : files(join(d, x.name))) : x.name.endsWith(".ts") ? [join(d, x.name)] : []);
  for (const f of files(src)) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /(from|^\s*import)\s+["'][^"']*\/v3\//m, `${f} imports v3 statically`);
  }
  const wire = readFileSync(join(src, "team", "wire.ts"), "utf8");
  assert.match(wire, /await import\("\.\/v3\/index\.js"\)/, "wire.ts loads v3 with a dynamic import");
  assert.match(wire, /if \(!coworkV3\(\)\) return;/, "and answers a v3 case only with the switch on");
});

test("the switch on: append, since and record answer; the event is signed and folds", { timeout: 90_000 }, async () => {
  const { port, state } = await up("on", "on");
  // a program on this Mac (no Origin, #1074): it may read the trail, and it writes nothing as me, however it asks
  const p = await face(port);
  p.say({ type: "team.v3.append", rid: "p1", fromSol: true, project: "sol", kind: "item", item: "forged", value: { title: "not mine" } });
  assert.deepEqual(await p.wait((m) => m.rid === "p1", 10_000), { type: "team.error", rid: "p1", message: "only Sol's own window" });
  p.say({ type: "team.v3.since", rid: "p2", project: "sol", seq: 0 });
  assert.deepEqual((await p.wait((m) => m.rid === "p2", 10_000))?.events, [], "a read answers, and nothing was written");
  p.ws.close();
  const f = await face(port, WINDOW);
  f.say({ type: "team.v3.append", rid: 1, project: "sol", kind: "item", item: "logo", value: { title: "Logo review", due: "2026-11-05" } });
  const a = await f.wait((m) => m.rid === 1, 10_000);
  assert.ok(a && a.type === "team.v3.append" && a.event, JSON.stringify(a));
  assert.equal(a.event.by.person, "marcocyl04-ux");
  assert.ok(a.event.sig && a.event.cert?.kind === "machine");
  f.say({ type: "team.v3.since", rid: 2, project: "sol", seq: 0 });
  const s = await f.wait((m) => m.rid === 2, 10_000);
  assert.deepEqual(s?.events.map((e: Msg) => e.id), [a.event.id]);
  f.say({ type: "team.v3.record", rid: 3, project: "sol" });
  const r = await f.wait((m) => m.rid === 3, 10_000);
  assert.equal(r?.record.items.logo.fields.title, "Logo review");
  assert.equal(r?.record.items.logo.waiting, true, "no cloud yet: waiting to send");
  assert.deepEqual(r?.bad, []);
  f.say({ type: "team.v3.record", rid: 4, project: "../x" });
  assert.match((await f.wait((m) => m.rid === 4, 10_000))?.error ?? "", /which project/);
  const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.deepEqual(h.trail, { projects: 1 });
  assert.ok(existsSync(join(state, "cowork-v3", "trail.db")), "the trail lives under the state dir");
  f.ws.close();
});

test("the switch off in this process: the team wire and the agent's tools answer no v3 case and load no v3 module", async () => {
  const d = join(dir, "in-process");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "team.json"), JSON.stringify({ me: { login: "marcocyl04-ux", name: "Marco" } }));
  Object.assign(process.env, { SOL_TEAM_FILE: join(d, "team.json"), SOL_TEAM: join(d, "team.json"), SOL_STATE: join(d, "state", "work.json"), SOL_TEAM_OFFLINE: "1", SOL_COWORK_V3: "off" });
  const W = await import("../src/team/wire.ts");
  const got: object[] = [];
  const face = { send: (m: object) => got.push(m) };
  for (const type of V3) await W.handleTeam(face, { type, rid: type, project: "sol" });
  assert.deepEqual(got, [], "no v3 case answers");
  assert.equal(W.v3Health(), null, "and /health has no trail to show");
  const T = await import("../src/work/tools.ts");
  assert.equal(T.WORK_TOOLS.some((t) => t.name === "migrate_v3"), false, "migrate_v3 is not offered");
  const r = await T.runWorkTool("migrate_v3", {}, "s1");
  assert.deepEqual([r.isError, r.content[0].text], [true, "unknown tool migrate_v3"], "and refused as any unknown tool");
  assert.ok(loaded.some((u) => u.endsWith("/src/team/wire.ts")), "the hook saw the loads");
  assert.deepEqual(loaded.filter((u) => u.includes("/team/v3/")), [], "not one v3 module loaded");
  assert.equal(existsSync(join(d, "state", "cowork-v3")), false);
});

test("the switch on: the slice 8 cases answer in a real engine; the import's dry run first", { timeout: 90_000 }, async () => {
  const { port } = await up("on8", "on");
  const f = await face(port, WINDOW);
  f.say({ type: "team.v3.migrate.dry", rid: "d" });
  const d = await f.wait((m) => m.rid === "d", 15_000);
  assert.ok(d && d.type === "team.v3.migrate.dry" && Array.isArray(d.report?.groups), JSON.stringify(d));
  assert.equal(d.report.run, false);
  f.say({ type: "team.v3.migrate.run", rid: "r" });
  const r = await f.wait((m) => m.rid === "r", 15_000);
  assert.ok(r && r.report?.run === true, JSON.stringify(r));
  f.say({ type: "team.v3.on", rid: "o" });
  const o = await f.wait((m) => m.rid === "o", 10_000);
  assert.equal(o?.on, true);
  const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.ok("trail" in h, "/health shows the trail once v3 is loaded");
  f.ws.close();
});

// The routes and messages #934 moved out of index.ts into src/parts/, asked of a real engine on its own port, home and
// state: each answers as it did in index.ts (status, type, body), and what no part takes still falls through to the
// engine's own 404. Nothing here signs in, moves a room or reaches past the machine: the cloud routes are asked only
// what they refuse. (POST /letgo is engine-wire.test.ts's.)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const ENGINE = join(import.meta.dirname, "..");
const PORT = await new Promise<number>((ok) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as AddressInfo).port; s.close(() => ok(p)); }); });
const at = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "sol-parts-routes-"));
const HOME = join(dir, "home");
mkdirSync(join(HOME, "pics"), { recursive: true });
writeFileSync(join(HOME, "a.txt"), "hello from the home\n");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
writeFileSync(join(HOME, "pics", "p.png"), PNG);
writeFileSync(join(dir, "accounts.json"), JSON.stringify({ "https://cloud.example.net": { login: "amy", refresh: "r".repeat(43), at: 1 } }));

let engine: ChildProcess | null = null;
after(() => { engine?.kill(); rmSync(dir, { recursive: true, force: true }); });

async function up() {
  if (engine) return;
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: HOME, SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_CODEX: join(dir, "no-codex"), SOL_CLOUD_ACCOUNTS: join(dir, "accounts.json"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
    },
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${at}/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the test engine did not come up");
}
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const plain = { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" };

test("files (parts/files.ts): GET /file, /pane-image, /pane-asset/ answer as before", { timeout: 60_000 }, async () => {
  await up();
  const f = await fetch(`${at}/file?path=${encodeURIComponent(join(HOME, "a.txt"))}`);
  assert.equal(f.status, 200);
  assert.equal(await f.text(), "hello from the home\n");
  assert.equal((await fetch(`${at}/file?path=${encodeURIComponent("/etc/hostname")}`)).status, 403, "only inside home/");
  assert.equal((await fetch(`${at}/file`)).status, 400);
  assert.equal((await fetch(`${at}/file`, { method: "POST" })).status, 404, "GET only");
  const img = await fetch(`${at}/pane-image?path=${encodeURIComponent(join(HOME, "pics", "p.png"))}`);
  assert.equal(img.status, 200);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  assert.equal((await fetch(`${at}/pane-image?path=${encodeURIComponent(join(HOME, "a.txt"))}`)).status, 415, "an image only");
  assert.equal((await fetch(`${at}/pane-image?path=/nowhere.png`)).status, 404);
  assert.equal((await fetch(`${at}/pane-asset/pics/p.png`)).status, 400, "a page's asset needs its page");
  assert.equal((await fetch(`${at}/pane-asset/pics/p.png`, { method: "POST" })).status, 404);
});

test("claim (parts/claim.ts): POST /claim takes JSON only and answers ok", { timeout: 60_000 }, async () => {
  await up();
  assert.equal((await fetch(`${at}/claim`, plain)).status, 415);
  for (const body of ["{}", "not json"]) {
    const r = await fetch(`${at}/claim`, json(body));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.equal(await r.text(), `{"ok":false}`);
  }
  assert.equal((await fetch(`${at}/claim`)).status, 404);
});

test("cloud (parts/cloud.ts): sign in, sign out, move and the accounts answer as before", { timeout: 60_000 }, async () => {
  await up();
  for (const p of ["/cloud/signin", "/cloud/signout", "/cloud/move"]) assert.equal((await fetch(`${at}${p}`, plain)).status, 415, p);
  const which = `{"ok":false,"error":"which cloud? (SOL_HUB, or { hub: \\"wss://…/relay\\" })"}`;
  assert.equal(await (await fetch(`${at}/cloud/signin`, json({ hub: "ws://127.0.0.1:9/relay" }))).text(), which, "not https: no sign-in starts");
  assert.equal(await (await fetch(`${at}/cloud/signout`, json({ hub: "not a hub" }))).text(), which);
  const move = await fetch(`${at}/cloud/move`, json({ room: "nope" }));
  assert.equal(move.status, 200);
  assert.equal(await move.text(), `{"ok":false,"error":"which room? (its id, as Settings shows it)"}`);
  const acc = await fetch(`${at}/cloud/accounts`);
  assert.equal(acc.status, 200);
  assert.equal(await acc.text(), `{"accounts":[{"hub":"https://cloud.example.net","login":"amy"}]}`, "names and hubs, never a token");
  assert.equal((await fetch(`${at}/cloud/accounts`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${at}/cloud/move`)).status, 404);
  assert.equal((await fetch(`${at}/nothing-here`)).status, 404, "what no part takes falls through to the engine's 404");
});

test("messages (parts/arrange.ts, goback.ts, dictations.ts, browser.ts): answered as before", { timeout: 60_000 }, async () => {
  await up();
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const got: any[] = [];
  ws.on("message", (raw) => got.push(JSON.parse(raw.toString())));
  await new Promise((ok, no) => { ws.once("open", ok); ws.once("error", no); });
  const next = async (type: string, ms = 10_000) => {
    for (let t = 0; t < ms; t += 50) { const i = got.findIndex((m) => m.type === type); if (i >= 0) return got.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 50)); }
    throw new Error(`no ${type}; got ${got.map((m) => m.type).join(" ")}`);
  };
  try {
    got.length = 0;
    ws.send(JSON.stringify({ type: "arrange.get" }));
    const a = await next("arrange.changed");
    assert.ok(a.arrangement && typeof a.arrangement === "object");
    ws.send(JSON.stringify({ type: "goback.plan" }));
    const g = await next("goback.plan");
    assert.equal(typeof g.line, "string");
    ws.send(JSON.stringify({ type: "dictated", raw: "hi there", typed: "Hi there.", app: "Notes", title: "a note", seconds: 2, went: true }));
    ws.send(JSON.stringify({ type: "browser.select", tab: "no-such-tab" }));
    const days = join(HOME, "voice", "dictations");
    for (let t = 0; t < 100 && !existsSync(days); t++) await new Promise((r) => setTimeout(r, 50));
    const lines = readdirSync(days).map((f) => readFileSync(join(days, f), "utf8")).join("");
    assert.match(lines, /"typed":"Hi there\."/);
    assert.equal(got.filter((m) => m.type === "error").length, 0, "no error for a tab nobody has");
  } finally { ws.close(); }
});

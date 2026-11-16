// Cowork v3 (fr-30, gap 12 of #574): the cloud trail readied for deploy, not deployed. The real cloud (sol/cloud's
// startCloud, on 127.0.0.1) starts with the trail in rooms.db (its three tables made at start) and answers both its
// routes, the trail and the pair mailbox; the cloud's notes (sol/cloud/README.md) say so, and that deploying is Marco's.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ENGINE = join(import.meta.dirname, "..");
const CLOUD = join(ENGINE, "..", "cloud");
const dir = mkdtempSync(join(tmpdir(), "sol-v3-gap-cloud-"));
const kids: ChildProcess[] = [];
after(() => { for (const k of kids) k.kill(); rmSync(dir, { recursive: true, force: true }); });

test("the cloud's notes say the trail is readied, its tables and routes, and that deploying is Marco's call", () => {
  const notes = readFileSync(join(CLOUD, "README.md"), "utf8");
  const line = notes.slice(notes.indexOf("Cowork v3's trail"), notes.indexOf("- Build updates"));
  assert.match(line, /readied, not deployed; deploying is Marco's call/);
  for (const w of ["`trail`", "`trail_pin`", "`trail_pair`", "rooms.db", "/relay/rooms/<code>/trail", "/relay/pair/<slot>"]) assert.ok(line.includes(w), w);
});

test("the cloud starts with the trail beside rooms.db and answers its routes", { timeout: 60_000 }, async () => {
  const data = join(dir, "cloud");
  mkdirSync(data, { recursive: true });
  const ts = join(dir, "tsconfig.json");
  writeFileSync(ts, JSON.stringify({ compilerOptions: { module: "nodenext", moduleResolution: "nodenext", target: "es2023", allowImportingTsExtensions: true, paths: { "@sol/hub": [join(ENGINE, "src", "hub", "index.ts")] } } }));
  const main = join(dir, "cloud.mts");
  writeFileSync(main, `const { startCloud } = await import(${JSON.stringify(join(CLOUD, "src", "index.ts"))});
const { configOf } = await import(${JSON.stringify(join(CLOUD, "src", "config.ts"))});
const c = await startCloud({ ...configOf({ SOL_CLOUD_DATA: ${JSON.stringify(data)} }), port: 0 }, { heartbeat: 0, sample: 0 });
console.log(JSON.stringify({ port: c.port }));
process.on("SIGTERM", () => { void c.close().then(() => process.exit(0)); });
`);
  const kid = spawn(process.execPath, ["--import", "tsx", main], { cwd: ENGINE, env: { ...process.env, TSX_TSCONFIG_PATH: ts }, stdio: ["ignore", "pipe", "pipe"] });
  kids.push(kid);
  let out = "", err = "";
  kid.stderr!.on("data", (b) => { err += b; });
  const port = await new Promise<number>((ok, no) => {
    kid.stdout!.on("data", (b) => { out += b; const m = /\{"port":(\d+)\}/.exec(out); if (m) ok(Number(m[1])); });
    kid.once("exit", (c) => no(new Error(`the cloud stopped (${c}): ${err.slice(-400)}`)));
  });
  const db = new DatabaseSync(join(data, "rooms", "rooms.db"), { readOnly: true });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  db.close();
  for (const t of ["trail", "trail_pin", "trail_pair"]) assert.ok(tables.includes(t), `${t} in rooms.db`);
  const { Proofs } = await import("../src/hub/index.ts");
  for (let i = 0; i < 50 && !existsSync(join(data, "relay", "proof.key")); i++) await new Promise((r) => setTimeout(r, 100));
  const ticket = new Proofs(join(data, "relay", "proof.key")).sign("marcocyl04-ux", "", Date.now() + 60_000);
  const BASE = `http://127.0.0.1:${port}`, auth = { authorization: `Bearer ${ticket}` };
  assert.equal((await fetch(`${BASE}/relay/rooms/ZZZZZZ/trail?since=0`, { headers: auth })).status, 404, "the trail route answers: no such room");
  const slot = "a".repeat(64);
  assert.equal((await fetch(`${BASE}/relay/pair/${slot}?side=ask`)).status, 403, "the pair route takes the hub's tickets only");
  const put = await fetch(`${BASE}/relay/pair/${slot}?side=ask`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ body: { ask: 1 } }) });
  assert.equal(put.status, 200);
  assert.deepEqual(await (await fetch(`${BASE}/relay/pair/${slot}?side=ask`, { headers: auth })).json(), { body: { ask: 1 } });
});

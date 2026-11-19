// A read through the person's Claude account (index.ts, connectorsGuard and connectedServices; scratch/sol/onb/path.md):
// the face asks which services are connected ({ type: "connectors" }) and a say with `read: true` may use their list and
// read tools only. This machine has none of the person's services, so a made-up mail service stands in: a local stdio MCP
// server (list_threads, get_thread, a readOnly-hinted guide, send_message, delete_thread, export_all) named through
// SOL_CONNECTORS, logging every call. Proven here: the engine reaches it, lists it as connected, and sorts its tools into
// read and refused by the same rule its turns use. With SOL_LIVE=1 (a real Claude sign-in in HOME, costs one short turn):
// a read turn calls list_threads and is refused send_message, by the server's own log. The account's own connectors (the
// "claudeai" source) are the same path but only a Mac with them connected proves them.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
const PORT = await freePort();   // a port nobody holds (#938): a fixed range of nine met another suite on the same runner
const dir = mkdtempSync(join(tmpdir(), "sol-connectors-"));
const home = join(dir, "home"), log = join(dir, "calls.log");
mkdirSync(home, { recursive: true });
const LIVE = process.env.SOL_LIVE === "1";

// ---- the made-up mail service ----
const SDK = join(ENGINE, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");
writeFileSync(join(dir, "mail.mjs"), `
import { McpServer } from ${JSON.stringify(join(SDK, "server", "mcp.js"))};
import { StdioServerTransport } from ${JSON.stringify(join(SDK, "server", "stdio.js"))};
import { appendFileSync } from "node:fs";
const s = new McpServer({ name: "made-up-mail", version: "1.0.0" });
const said = (name) => { appendFileSync(${JSON.stringify(log)}, name + "\\n"); };
const THREADS = [{ id: "t1", subject: "Week 11 reading", from: "Prof. Lomax", date: "2026-11-09" }, { id: "t2", subject: "Your application to Northwind", from: "Northwind Careers", date: "2026-11-10" }];
const text = (o) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
s.registerTool("list_threads", { description: "List recent mail threads", annotations: { readOnlyHint: true } }, async () => { said("list_threads"); return text(THREADS); });
s.registerTool("get_thread", { description: "Read one thread's subject and date" }, async () => { said("get_thread"); return text(THREADS[0]); });
s.registerTool("guide", { description: "How to use this service", annotations: { readOnlyHint: true } }, async () => { said("guide"); return text("use list_threads"); });
s.registerTool("send_message", { description: "Send an email as the person" }, async () => { said("send_message"); return text("sent"); });
s.registerTool("delete_thread", { description: "Delete a thread", annotations: { destructiveHint: true } }, async () => { said("delete_thread"); return text("deleted"); });
s.registerTool("export_all", { description: "Export every thread to a file", annotations: { readOnlyHint: true } }, async () => { said("export_all"); return text("exported"); });
await s.connect(new StdioServerTransport());
`);
const CONNECTORS = join(dir, "connectors.json");
writeFileSync(CONNECTORS, JSON.stringify({ "Made-up Mail": { type: "stdio", command: process.execPath, args: [join(dir, "mail.mjs")] } }));

let engine: ChildProcess | null = null;
async function up() {
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: home, SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_AGENT_CLOCK: "off",
      SOL_CONNECTORS: CONNECTORS,
      // no sign-in unless live: the account's own connectors are not fetched, only the stand-in is there
      HOME: LIVE ? homedir() : join(dir, "nohome"),
    },
  });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the engine did not come up");
}
after(() => { engine?.kill(); rmSync(dir, { recursive: true, force: true }); });

/** one socket: send, then gather messages until `until` says it has what it waits for */
function talk(o: object, until: (m: any, all: any[]) => boolean, ms: number): Promise<any[]> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), all: any[] = [];
    const t = setTimeout(() => { ws.close(); rej(new Error(`no answer in ${ms} ms: ${JSON.stringify(all.slice(-3))}`)); }, ms);
    ws.on("open", () => ws.send(JSON.stringify(o)));
    ws.on("message", (d) => { const m = JSON.parse(String(d)); all.push(m); if (until(m, all)) { clearTimeout(t); ws.close(); res(all); } });
  });
}

test("the face asks which services are connected: the stand-in, connected, its tools sorted into read and refused", async () => {
  await up();
  const all = await talk({ type: "connectors", rid: "c1" }, (m) => m.type === "home.connectors" && m.rid === "c1", 60_000);
  const list = all.find((m) => m.type === "home.connectors").list;
  assert.ok(Array.isArray(list), JSON.stringify(list));
  const mail = list.find((x: any) => x.name === "Made-up Mail");
  assert.ok(mail, JSON.stringify(list));
  assert.equal(mail.status, "connected");
  assert.deepEqual([...mail.read].sort(), ["get_thread", "guide", "list_threads"]);
  assert.deepEqual([...mail.refused].sort(), ["delete_thread", "export_all", "send_message"]);
  if (!LIVE) assert.equal(list.length, 1, "with no sign-in only the stand-in is listed");
  assert.ok(!existsSync(log) || !readFileSync(log, "utf8").trim(), "listing calls no tool");
});

test("a read turn lists through the service and is refused a send (SOL_LIVE=1 only)", { skip: !LIVE }, async () => {
  const text = "Use the Made-up Mail tools only. First call list_threads. Then call send_message once to reply 'ok' to the first thread. Then say in one line what happened to each call.";
  const all = await talk({ type: "say", seat: "claude", effort: "low", fresh: true, read: true, text }, (m) => m.type === "done", 240_000);
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  assert.ok(calls.includes("list_threads"), `calls: ${calls.join(",")}`);
  assert.ok(!calls.includes("send_message"), `calls: ${calls.join(",")}`);
  const said = all.filter((m) => m.type === "delta").map((m) => m.text).join("");
  console.log("live turn said:", said.trim().slice(0, 400), "| calls:", calls.join(","));
});

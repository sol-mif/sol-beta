// One list of every way in (#1520, step 1 of #1222; connections.ts, parts/connections.ts). Proven here: each source's
// word becomes the right state (the Claude account's statuses, gh's and gog's answers, a grant held, ran out or never
// made), unsure is said rather than guessed, a source that throws is one unsure row, and a real engine answers
// { type: "connections" } with the three sources in one list: a made-up mail service as the Claude account's, made-up
// gh and gog (SOL_CONNECTIONS_BIN), and a Drive grant held (SOL_DRIVE_ACCOUNT), whose refresh token never reaches the face.
// Off (SOL_CONNECTIONS=off) the engine answers `off: true` and reads nothing.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { freePort } from "./test-engine.ts";
import { ACCOUNT_PAGE, checkTool, connections, fromAccount, fromGrant, fromTool, listOf, resetConnections, type Connection } from "../src/connections.ts";

const ENGINE = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sol-connections-"));
const engines: ChildProcess[] = [];
after(() => { for (const e of engines) e.kill(); rmSync(dir, { recursive: true, force: true }); });

/** a made-up tool: a shell script that answers by its arguments */
function tool(bin: string, name: string, body: string) {
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}

test("the Claude account: connected, needs-auth lapsed, disabled missing, failed and pending unsure, no answer one unsure row", () => {
  const rows = fromAccount([
    { name: "Gmail", status: "connected" }, { name: "Slack", status: "needs-auth" }, { name: "Notion", status: "disabled" },
    { name: "Google Drive", status: "failed", error: "admin_policy_enforced\nmore" }, { name: "Linear", status: "pending" },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.state]), [["claude:Gmail", "connected"], ["claude:Slack", "lapsed"], ["claude:Notion", "missing"], ["claude:Google Drive", "unsure"], ["claude:Linear", "unsure"]]);
  assert.deepEqual(rows[1].fix, { kind: "page", url: ACCOUNT_PAGE });
  assert.equal(rows[3].why, "admin_policy_enforced", "one line of what it said");
  assert.equal(rows[0].fix, undefined, "connected has nothing to fix");
  const none = fromAccount({ error: "not signed in to Claude" });
  assert.deepEqual(none.map((r) => [r.id, r.state, r.why]), [["claude-account", "unsure", "not signed in to Claude"]]);
});

test("the Mac's tools: not there missing, answered connected, ran out lapsed with the line that signs in again, unknown unsure", () => {
  assert.deepEqual(fromTool({ tool: "gh", there: false }), { id: "tool:gh", name: "GitHub", from: "mac-tool", via: "gh", state: "missing", why: "gh is not on this Mac" });
  assert.equal(fromTool({ tool: "gh", there: true, account: "octo", ok: true }).state, "connected");
  const gh = fromTool({ tool: "gh", there: true, account: "octo", ok: false, said: "X The token in default is invalid." });
  assert.equal(gh.state, "lapsed"); assert.deepEqual(gh.fix, { kind: "run", run: "gh auth login --web" });
  assert.equal(fromTool({ tool: "gh", there: true, ok: false, said: "You are not logged into any GitHub hosts. To log in, run: gh auth login" }).state, "missing");
  const gog = fromTool({ tool: "gog", there: true, account: "me@example.com", ok: false, said: "oauth2: \"invalid_grant\" \"Token has been expired or revoked.\"" });
  assert.equal(gog.state, "lapsed"); assert.deepEqual(gog.fix, { kind: "run", run: "gog auth add me@example.com" });
  assert.equal(fromTool({ tool: "gog", there: true, account: "me@x.com; rm -rf ~", ok: false, said: "invalid_grant" }).fix, undefined, "no shell line from an odd account");
  const empty = fromTool({ tool: "gog", there: true, ok: false, said: "" });
  assert.equal(empty.state, "missing"); assert.equal(empty.fix, undefined, "no account to sign in again with");
  assert.equal(fromTool({ tool: "gh", there: true, ok: false, said: "dial tcp: lookup api.github.com: no such host" }).state, "unsure");
});

test("Sol's own grants: held connected, ran out lapsed with when, never missing; a refresh with no answer unsure", () => {
  const g = { id: "drive", name: "Google Drive", connect: "team.drive.connect" };
  const held = fromGrant({ ...g, grant: { email: "me@example.com" }, ranOut: null });
  assert.deepEqual(held, { id: "sol:drive", name: "Google Drive", from: "sol", account: "me@example.com", state: "connected" });
  const out = fromGrant({ ...g, grant: null, ranOut: { email: "me@example.com", at: 42 } });
  assert.equal(out.state, "lapsed"); assert.equal(out.since, 42); assert.deepEqual(out.fix, { kind: "send", type: "team.drive.connect" });
  assert.equal(fromGrant({ ...g, grant: null, ranOut: null }).state, "missing");
  assert.equal(fromGrant({ ...g, grant: { email: "" }, ranOut: null, refreshed: "no answer" }).state, "unsure");
  assert.equal(fromGrant({ ...g, grant: { email: "" }, ranOut: null, refreshed: true }).state, "connected");
});

test("the list: what needs the person first; a source that throws is one unsure row; kept a minute unless fresh", async () => {
  resetConnections();
  let asked = 0;
  const rows = await connections({
    services: async () => { asked++; return [{ name: "Gmail", status: "connected" }, { name: "Slack", status: "needs-auth" }]; },
    tools: async () => { throw new Error("no shell"); },
    grants: async () => [{ id: "drive", name: "Google Drive", connect: "team.drive.connect", grant: null, ranOut: null }],
  });
  assert.deepEqual(rows.map((r) => `${r.id}:${r.state}`), ["claude:Slack:lapsed", "mac-tools:unsure", "claude:Gmail:connected", "sol:drive:missing"]);
  await connections({ services: async () => { asked++; return []; }, tools: async () => [], grants: async () => [] });
  assert.equal(asked, 1, "kept a minute");
  const again = await connections({ services: async () => { asked++; return []; }, tools: async () => [], grants: async () => [] }, true);
  assert.equal(asked, 2); assert.equal(again.length, 0);
  // a slow ask and a fresh one together: the fresh answer is the one kept
  resetConnections();
  const slow = connections({ services: async () => { await new Promise((r) => setTimeout(r, 50)); return [{ name: "Old", status: "connected" }]; }, tools: async () => [], grants: async () => [] });
  const now = await connections({ services: async () => [{ name: "New", status: "connected" }], tools: async () => [], grants: async () => [] }, true);
  await slow;
  assert.equal(now[0].name, "New");
  assert.equal((await connections({ services: async () => [], tools: async () => [], grants: async () => [] }))[0].name, "New");
  assert.deepEqual(listOf([{ state: "missing" }, { state: "connected" }, { state: "unsure" }, { state: "lapsed" }] as Connection[]).map((r) => r.state), ["lapsed", "unsure", "connected", "missing"]);
});

test("checkTool asks the tools themselves: gh's auth status, gog's account and one item", async () => {
  const bin = join(dir, "bin-unit");
  tool(bin, "gh", `[ "$1 $2" = "auth status" ] && { echo "github.com"; echo "  ✓ Logged in to github.com account octo (keyring)"; exit 0; }; exit 2`);
  tool(bin, "gog", `[ "$1 $2" = "auth list" ] && { printf 'me@example.com\\tdefault\\tgmail,drive\\n'; exit 0; }; echo 'invalid_grant' >&2; exit 1`);
  assert.deepEqual(await checkTool("gh", { bin }), { tool: "gh", there: true, account: "octo", ok: true });
  const gog = await checkTool("gog", { bin });
  assert.equal(gog.there && !gog.ok && fromTool(gog).state, "lapsed");
  assert.deepEqual(await checkTool("gh", { bin: join(dir, "nowhere") }), { tool: "gh", there: false });
  // gh's "token is invalid" said offline: GitHub not reached is unsure; a 401 from GitHub is lapsed
  const off = join(dir, "bin-offline");
  tool(off, "gh", `[ "$1 $2" = "auth status" ] && { echo "X The token in default is invalid. To re-authenticate, run: gh auth login" >&2; exit 1; }; echo "dial tcp: lookup api.github.com: no such host" >&2; exit 1`);
  const a = await checkTool("gh", { bin: off });
  assert.equal(a.there && !a.ok && fromTool(a).state, "unsure");
  const dead = join(dir, "bin-dead");
  tool(dead, "gh", `[ "$1 $2" = "auth status" ] && { echo "X The token in default is invalid." >&2; exit 1; }; echo "gh: Bad credentials (HTTP 401)" >&2; exit 1`);
  const b = await checkTool("gh", { bin: dead });
  assert.equal(b.there && !b.ok && fromTool(b).state, "lapsed");
});

// ---- a real engine ----

async function up(env: Record<string, string>) {
  const port = await freePort(), at = join(dir, `e${port}`);
  mkdirSync(join(at, "home"), { recursive: true });
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, SOL_PORT: String(port), SOL_HOME: join(at, "home"), SOL_PROFILE: join(at, "profile"),
      SOL_STATE: join(at, "work.json"), SOL_TEAM: join(at, "team.json"), SOL_LOG: join(at, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_AGENT_CLOCK: "off",
      HOME: join(at, "nohome"), ...env,
    },
  });
  engines.push(e);
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return port; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the engine did not come up");
}
function ask(port: number, o: object, ms: number): Promise<any> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const t = setTimeout(() => { ws.close(); rej(new Error(`no answer in ${ms} ms`)); }, ms);
    ws.on("open", () => ws.send(JSON.stringify(o)));
    ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.type === "home.connections") { clearTimeout(t); ws.close(); res(m); } });
  });
}

test("a real engine answers connections with all three sources in one list", async () => {
  const bin = join(dir, "bin-engine"), drive = join(dir, "drive", "account.json");
  tool(bin, "gh", `echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2; exit 1`);
  tool(bin, "gog", `[ "$1 $2" = "auth list" ] && { printf 'me@example.com\\tdefault\\tgmail,drive\\n'; exit 0; }; echo '{"files":[]}'; exit 0`);
  mkdirSync(join(dir, "drive"), { recursive: true });
  writeFileSync(drive, JSON.stringify({ hub: "https://cloud.example", refresh: "SECRET-REFRESH-TOKEN", scope: "openid email", email: "me@example.com", at: 1 }));
  // the made-up mail service, as the Claude account's (connectors-read.test.ts's stand-in, trimmed to one tool)
  const SDK = join(ENGINE, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");
  writeFileSync(join(dir, "mail.mjs"), `
import { McpServer } from ${JSON.stringify(join(SDK, "server", "mcp.js"))};
import { StdioServerTransport } from ${JSON.stringify(join(SDK, "server", "stdio.js"))};
const s = new McpServer({ name: "made-up-mail", version: "1.0.0" });
s.registerTool("list_threads", { description: "List threads", annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: "[]" }] }));
await s.connect(new StdioServerTransport());
`);
  writeFileSync(join(dir, "connectors.json"), JSON.stringify({ "Made-up Mail": { type: "stdio", command: process.execPath, args: [join(dir, "mail.mjs")] } }));
  const port = await up({ SOL_CONNECTIONS_BIN: bin, SOL_DRIVE_ACCOUNT: drive, SOL_CONNECTORS: join(dir, "connectors.json") });
  const m = await ask(port, { type: "connections", rid: "k1" }, 60_000);
  assert.equal(m.rid, "k1"); assert.equal(m.v, 1);
  const by = new Map<string, Connection>(m.list.map((r: Connection) => [r.id, r]));
  assert.equal(by.get("sol:drive")?.state, "connected", JSON.stringify(m.list));
  assert.equal(by.get("sol:drive")?.account, "me@example.com");
  assert.equal(by.get("tool:gog")?.state, "connected"); assert.equal(by.get("tool:gog")?.account, "me@example.com");
  assert.equal(by.get("tool:gh")?.state, "missing");
  assert.equal(by.get("claude:Made-up Mail")?.state, "connected");
  assert.equal(m.list.at(-1).id, "tool:gh", "missing comes last");
  assert.ok(!JSON.stringify(m).includes("SECRET"), "the held grant's refresh token never reaches a face");
});

test("off, the engine answers off and reads nothing", async () => {
  const port = await up({ SOL_CONNECTIONS: "off" });
  const m = await ask(port, { type: "connections", rid: "k2" }, 20_000);
  assert.deepEqual(m, { type: "home.connections", rid: "k2", off: true });
});

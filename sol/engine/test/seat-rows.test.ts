// The Seats list's engine half (#1620; connections.ts, parts/connections.ts, parts/agents.ts). Proven here: the AI seats
// and the folder agents' sites as rows, each with the one press that moves it; a seat signed out is missing, never lapsed
// (a sign-out the person chose asks nothing), and says "signed out" when it was seen in, also after a restart (the seen
// seats are on disk); a status the CLI did not say plainly is unsure; a GitHub token's end date is read where GitHub sends it and
// is absent (not counted) for a token with none; a kept list never gives a flagless read seat rows nor a seats read a
// list without them; a read that differs, or a sign-in window closing, is told (connections.changed); what blocks an AI
// is known, known-nothing (null) or not known (absent); and a real engine adds the rows only with the new face on.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { WebSocket } from "ws";
import { freePort } from "./test-engine.ts";
import {
  blockedOf, changedIds, checkTool, connections, connectionsChanged, expiresFrom, fromSeat, fromSite, fromTool, keptWithSeats,
  onConnectionsChanged, resetConnections, type Connection, type Seat, type SeatCheck, type Sources,
} from "../src/connections.ts";
import { seated } from "../src/parts/agents.ts";
import { claudeOut, codexOut } from "../src/team/control.ts";

const ENGINE = join(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "sol-seats-"));
const engines: ChildProcess[] = [];
after(() => { for (const e of engines) e.kill(); rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => resetConnections());

function tool(bin: string, name: string, body: string) {
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}
const base = (): Sources => ({ services: async () => [], tools: async () => [], grants: async () => [] });
const memSeen = (start: Seat[] = []) => { let xs = [...start]; return { read: () => xs, write: (v: Seat[]) => { xs = [...v]; }, get: () => xs }; };
const seat = (s: Seat, x: Partial<SeatCheck>): SeatCheck => ({ seat: s, in: false, run: s === "claude" ? "claude auth login" : "codex login", ...x });

test("a seat: signed in connected, the CLI not here missing with no fix, signed out missing with its sign-in line", () => {
  assert.deepEqual(fromSeat(seat("claude", { in: true, who: "me@example.com, max" }), false), { id: "seat:claude", name: "Claude Code", from: "seat", via: "claude", account: "me@example.com, max", state: "connected" });
  const gone = fromSeat(seat("codex", { missing: true }), true);
  assert.equal(gone.state, "missing"); assert.equal(gone.why, "codex is not on this Mac"); assert.equal(gone.fix, undefined);
  const never = fromSeat(seat("claude", { out: true }), false);
  assert.equal(never.state, "missing"); assert.equal(never.why, "never signed in on this Mac"); assert.deepEqual(never.fix, { kind: "run", run: "claude auth login" });
});

test("a seat signed out on purpose after being seen in is missing, not lapsed, and blocks its AI without asking to renew", () => {
  const out = fromSeat(seat("codex", { out: true }), true);
  assert.equal(out.state, "missing"); assert.equal(out.why, "signed out on this Mac"); assert.deepEqual(out.fix, { kind: "run", run: "codex login" });
  assert.deepEqual(blockedOf("codex", [], [out]), { by: "seat:codex", why: "signed out on this Mac" }, "the AI still cannot run, and the row says why");
});

test("a seat whose CLI did not say plainly (a timeout, a crash) is unsure, never lapsed, and blocks nothing", () => {
  const r = fromSeat(seat("claude", {}), true);
  assert.equal(r.state, "unsure"); assert.equal(r.why, "claude did not say whether it is signed in");
  assert.equal(blockedOf("claude", [], [r]), null);
});

test("signed out, as the CLIs say it: a plain not-logged-in only (tried by hand: an expired or revoked sign-in still says logged in)", () => {
  assert.equal(claudeOut({ code: 1, out: '{\n  "loggedIn": false,\n  "authMethod": "none",\n  "apiProvider": "firstParty"\n}\n' }), true);
  assert.equal(claudeOut({ code: 0, out: '{ "loggedIn": true, "authMethod": "claude.ai", "email": null }' }), false);
  assert.equal(claudeOut({ code: 1, out: "\nError: timed out" }), false);
  assert.equal(claudeOut(null), false);
  assert.equal(codexOut({ code: 1, out: "Not logged in\n" }), true);
  assert.equal(codexOut({ code: 0, out: "Logged in using ChatGPT\n" }), false);
  assert.equal(codexOut({ code: 1, out: "\nerror: could not read auth.json" }), false);
  assert.equal(codexOut(null), false);
});

test("a site: got through connected, stopped at a sign-in lapsed with since, the window open or never read unsure; its fix is agent.signin", () => {
  const c = { folder: "school/la245", site: "blackboard", name: "Blackboard" };
  assert.equal(fromSite({ ...c, found: "in" }).state, "connected");
  const st = fromSite({ ...c, found: "stopped", since: 5 });
  assert.equal(st.id, "site:school/la245:blackboard"); assert.equal(st.state, "lapsed"); assert.equal(st.since, 5);
  assert.deepEqual(st.fix, { kind: "send", type: "agent.signin", with: { folder: "school/la245", site: "blackboard" } });
  assert.equal(fromSite({ ...c, found: "opening" }).state, "unsure");
  assert.equal(fromSite({ ...c, found: "unread" }).why, "no rule has read it yet");
});

test("a GitHub token's end date: read from its header in UTC or an offset; a token with none is not counted", () => {
  assert.equal(expiresFrom("HTTP/2.0 200 OK\nGithub-Authentication-Token-Expiration: 2026-12-01 00:00:00 UTC\nX-Oauth-Scopes: repo"), Date.parse("2026-12-01T00:00:00Z"));
  assert.equal(expiresFrom("github-authentication-token-expiration: 2026-12-01 10:00:00 -0800"), Date.parse("2026-12-01T18:00:00Z"));
  assert.equal(expiresFrom("HTTP/2.0 200 OK\nX-Oauth-Scopes: repo, read:org"), undefined, "gh auth login --web: no end date");
  assert.equal(expiresFrom("github-authentication-token-expiration: soon"), undefined);
  assert.equal(fromTool({ tool: "gh", there: true, ok: true, expires: 7 }).expires, 7);
  assert.equal("expires" in fromTool({ tool: "gh", there: true, ok: true }), false);
});

test("checkTool asks gh for the end date only when told, with each kind of token", async () => {
  const pat = join(dir, "bin-pat"), web = join(dir, "bin-web");
  const status = `[ "$1 $2" = "auth status" ] && { echo "  ✓ Logged in to github.com account octo (keyring)"; exit 0; }`;
  tool(pat, "gh", `${status}; [ "$1 $2 $3" = "api -i user" ] && { printf 'HTTP/2.0 200 OK\\r\\nGithub-Authentication-Token-Expiration: 2026-12-01 00:00:00 UTC\\r\\n\\r\\n{"login":"octo"}\\n'; exit 0; }; exit 2`);
  tool(web, "gh", `${status}; [ "$1 $2 $3" = "api -i user" ] && { printf 'HTTP/2.0 200 OK\\r\\nX-Oauth-Scopes: repo\\r\\n\\r\\n{"login":"octo"}\\n'; exit 0; }; exit 2`);
  assert.deepEqual(await checkTool("gh", { bin: pat, expiry: true }), { tool: "gh", there: true, account: "octo", ok: true, expires: Date.parse("2026-12-01T00:00:00Z") });
  assert.deepEqual(await checkTool("gh", { bin: web, expiry: true }), { tool: "gh", there: true, account: "octo", ok: true });
  assert.deepEqual(await checkTool("gh", { bin: pat }), { tool: "gh", there: true, account: "octo", ok: true }, "not asked: one call, as before");
});

test("the kept list: a flagless read never sees seat rows, a seats read never gets a list without them", async () => {
  let seatsAsked = 0;
  const s: Sources = { ...base(), seats: async () => { seatsAsked++; return [seat("claude", { in: true }), seat("codex", {})]; }, sites: async () => [{ folder: "x", site: "gmail", name: "Gmail", found: "in" }], seen: memSeen() };
  assert.deepEqual(await connections(s), [], "flagless: no seats asked");
  assert.equal(seatsAsked, 0);
  const full = await connections(s, false, true);
  assert.deepEqual(full.map((r) => r.id).sort(), ["seat:claude", "seat:codex", "site:x:gmail"], "a flagless list kept is not enough");
  assert.equal(seatsAsked, 1);
  assert.deepEqual(await connections(s), [], "kept with seats, cut for a flagless read");
  assert.equal((await connections(s, false, true)).length, 3); assert.equal(seatsAsked, 1, "kept a minute");
  // a seats read while a flagless one is out waits, then asks with seats
  resetConnections();
  const slow = connections({ ...s, services: async () => { await new Promise((r) => setTimeout(r, 40)); return []; } });
  const both = await connections(s, false, true);
  assert.equal(both.length, 3); assert.deepEqual(await slow, []);
});

test("a seat signed out after a restart still says signed out: the seats seen in are on disk, not in memory", async () => {
  const seen = memSeen();
  const s = (inn: boolean): Sources => ({ ...base(), seats: async () => [seat("codex", inn ? { in: true } : { out: true })], seen });
  assert.equal((await connections(s(true), true, true))[0].state, "connected");
  assert.deepEqual(seen.get(), ["codex"]);
  resetConnections();   // the engine restarted
  const r = (await connections(s(false), true, true))[0];
  assert.equal(r.state, "missing"); assert.equal(r.why, "signed out on this Mac");
});

test("connections.changed: a read with seats that differs is told with its ids; a sign-in window closing is told and read again", async () => {
  const heard: string[][] = [];
  onConnectionsChanged((ids) => heard.push(ids));
  let codexIn = true;
  const s: Sources = { ...base(), seats: async () => [seat("codex", { in: codexIn })], seen: memSeen() };
  await connections(s, false, true);
  assert.deepEqual(heard, [], "the first read is not a change");
  codexIn = false;
  await connections(s, true, true);
  assert.deepEqual(heard, [["seat:codex"]]);
  connectionsChanged(["site:x:gmail"]);
  assert.deepEqual(heard.at(-1), ["site:x:gmail"]);
  codexIn = true;
  assert.equal((await connections(s, false, true))[0].state, "connected", "the kept list is stale after a change: read again without fresh");
  assert.deepEqual(changedIds([{ id: "a", state: "connected" } as Connection], [{ id: "a", state: "connected", expires: 1 } as Connection, { id: "b", state: "missing" } as Connection]), ["a", "b"]);
});

test("what blocks an AI: not known (undefined), nothing (null), its seat, or a site it is stuck at; agents.list carries it", async () => {
  assert.equal(blockedOf("codex", [], null), undefined);
  const rows = [
    { id: "seat:codex", name: "Codex", from: "seat", state: "connected" },
    { id: "site:school/la245:blackboard", name: "Blackboard", from: "site", state: "lapsed", why: "a sign-in page stopped its last read" },
  ] as Connection[];
  assert.equal(blockedOf("codex", [], rows), null);
  assert.deepEqual(blockedOf("codex", [{ folder: "school/la245", site: "blackboard" }], rows), { by: "site:school/la245:blackboard", why: "a sign-in page stopped its last read" });
  const out = [{ ...rows[0], state: "missing", why: "signed out on this Mac" }, rows[1]] as Connection[];
  assert.equal(blockedOf("codex", [{ folder: "school/la245", site: "blackboard" }], out)?.by, "seat:codex", "the seat first");
  // agents.list: seat always, blocked absent while nothing is kept, then known; a stuck names its site as read ("Blackboard")
  const list = { ok: true, agents: [{ id: "a1", stucks: [{ folder: "school/la245", site: "Blackboard", rule: "r", since: 1 }] }, { id: "a2", stucks: [] }] };
  assert.equal(keptWithSeats(), null);
  const none = seated(list);
  assert.deepEqual(none.agents.map((x) => [x.seat, "blocked" in x]), [["codex", false], ["codex", false]]);
  const known = seated(list, rows);
  assert.deepEqual(known.agents.map((x: any) => x.blocked), [{ by: "site:school/la245:blackboard", why: "a sign-in page stopped its last read" }, null]);
});

// ---- a real engine ----

async function up(env: Record<string, string>) {
  const port = await freePort(), at = join(dir, `e${port}`);
  mkdirSync(join(at, "home"), { recursive: true });
  writeFileSync(join(at, "connectors.json"), "{}");
  const e = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env, SOL_PORT: String(port), SOL_HOME: join(at, "home"), SOL_PROFILE: join(at, "profile"),
      SOL_STATE: join(at, "work.json"), SOL_TEAM: join(at, "team.json"), SOL_LOG: join(at, "engine.log"),
      SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off", SOL_AGENT_CLOCK: "off",
      SOL_CONNECTORS: join(at, "connectors.json"), SOL_SEATS_SEEN: join(at, "seats-seen.json"),
      HOME: join(at, "nohome"), ...env,
    },
  });
  engines.push(e);
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { port, at }; } catch {}
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
/** made-up claude and codex first on PATH, gh and gog for SOL_CONNECTIONS_BIN: Claude Code signed in, Codex not */
function madeUp() {
  const bin = join(dir, "bin-engine");
  tool(bin, "claude", `echo '{"loggedIn": true, "email": "me@example.com", "subscriptionType": "max"}'`);
  tool(bin, "codex", `echo "Not logged in"; exit 1`);
  tool(bin, "gh", `echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2; exit 1`);
  tool(bin, "gog", `exit 1`);
  return { SOL_CONNECTIONS_BIN: bin, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
}

test("a real engine with the new face on: seats: true adds the seat rows and keeps the seen one on disk; without it, as before", async () => {
  const { port, at } = await up({ ...madeUp(), SOL_UI_NEXT: "on" });
  const plain = await ask(port, { type: "connections", rid: "s0" }, 60_000);
  assert.ok(!plain.list.some((r: Connection) => r.from === "seat" || r.from === "site"), JSON.stringify(plain.list));
  const m = await ask(port, { type: "connections", rid: "s1", seats: true }, 60_000);
  const by = new Map<string, Connection>(m.list.map((r: Connection) => [r.id, r]));
  assert.equal(by.get("seat:claude")?.state, "connected", JSON.stringify(m.list));
  assert.equal(by.get("seat:claude")?.account, "me@example.com, max");
  assert.equal(by.get("seat:codex")?.state, "missing"); assert.equal(by.get("seat:codex")?.why, "never signed in on this Mac");
  assert.deepEqual(by.get("seat:codex")?.fix, { kind: "run", run: "codex login" });
  assert.equal(by.get("tool:gh")?.state, "missing"); assert.equal(by.has("seat:github"), false, "GitHub stays tool:gh only");
  assert.deepEqual(JSON.parse(readFileSync(join(at, "seats-seen.json"), "utf8")), { seats: ["claude"] });
});

test("a real engine with the new face off: seats: true is ignored, the answer is today's", async () => {
  const { port } = await up({ ...madeUp(), SOL_UI_NEXT: "off" });
  const m = await ask(port, { type: "connections", rid: "s2", seats: true }, 60_000);
  assert.ok(!m.list.some((r: Connection) => r.from === "seat" || r.from === "site"), JSON.stringify(m.list));
});

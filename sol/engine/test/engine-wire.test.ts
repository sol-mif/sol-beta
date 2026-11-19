// A Stop from another socket on a turn a door started (F2 of the engine review, 2026-10-20). A door's say carries no session
// and no draft; the engine gives it a draft before anything keys on it, so a stop with that id, from any socket, finds
// the turn through its relay, and a stop with no id still stops the socket's own turn. A real engine runs on its own
// port, home and profile, with a stand-in codex (SOL_CODEX) that never answers, so nothing leaves the machine.
// And one ending per turn (F4): a seat that throws still ends its turn with one done, after the error; and an unknown
// work.* type gets an answer.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { freePort, ownHealth } from "./test-engine.ts";

const ENGINE = join(import.meta.dirname, "..");
let PORT = 0;   // the system's free port, taken at the start (test-engine.ts, #938)
const dir = mkdtempSync(join(tmpdir(), "sol-wire-"));
mkdirSync(join(dir, "home"));
// the stand-in: a say with "fail" in it dies at once, any other one waits to be stopped
// two Claude sessions on disk, in the engine's own Claude folder (two kinds of session, the fix round of 2026-11-14): a
// Claude turn there finds no sign-in, so nothing leaves the machine
const SA = "5a5a5a5a-0000-4000-8000-00000000000a", SB = "5b5b5b5b-0000-4000-8000-00000000000b", CWD = join(dir, "proj");
mkdirSync(CWD);
for (const [id, text] of [[SA, "the orchestrator"], [SB, "the worker"]]) {
  const p = join(dir, "claude", "projects", CWD.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, `${id}.jsonl`), JSON.stringify({ type: "user", uuid: randomUUID(), sessionId: id, cwd: CWD, timestamp: new Date().toISOString(), message: { role: "user", content: text } }) + "\n");
}
writeFileSync(join(dir, "codex"), "#!/bin/sh\ncase \"$(cat)\" in *fail*) echo boom >&2; exit 1;; esac\nexec sleep 600\n"); chmodSync(join(dir, "codex"), 0o755);

let engine: ChildProcess | null = null;
let first = "";   // the first test's turn, so the second does not take it for its own
after(() => { engine?.kill(); rmSync(dir, { recursive: true, force: true }); });

async function up() {
  if (engine) return;
  PORT ||= await freePort();
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ENGINE, stdio: "ignore",
    env: {
      ...process.env, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"),
      SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
      CLAUDE_CONFIG_DIR: join(dir, "claude"), ANTHROPIC_API_KEY: "", CLAUDE_CODE_OAUTH_TOKEN: "",
      SOL_CODEX: join(dir, "codex"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",   // #356: nothing counted, no settings written, nothing sent
    },
  });
  await ownHealth(engine, PORT);   // the engine this test started, not another run's on the port (#938)
}

type Msg = { type: string; [k: string]: any };
async function face() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const got: Msg[] = [];
  const waiters: { pred: (m: Msg) => boolean; ok: (m: Msg) => void }[] = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString()) as Msg;
    got.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
  });
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const next = (pred: (m: Msg) => boolean, ms = 10_000) => new Promise<Msg>((ok, no) => {
    const seen = got.find(pred);
    if (seen) return ok(seen);
    const t = setTimeout(() => no(new Error("timed out; got " + got.map((m) => m.type).join(" "))), ms);
    waiters.push({ pred, ok: (m) => { clearTimeout(t); ok(m); } });
  });
  return { ws, got, next, say: (m: object) => ws.send(JSON.stringify(m)) };
}

test("stop: a door's say with no ids is stopped by its own socket's stop", { timeout: 60_000 }, async () => {
  await up();
  const a = await face();
  a.say({ type: "say", text: "hi from the phone", seat: "codex", door: "phone", fresh: true });
  first = (await a.next((m) => m.type === "creature.turn" && !!m.turn)).turn.sessionId;
  a.say({ type: "stop" });
  const done = await a.next((m) => m.type === "done");
  assert.equal(done.stopped, true);
  assert.equal(a.got.filter((m) => m.type === "done").length, 1, "one ending");
  a.ws.close();
});

test("stop: a Stop with the turn's id, from another socket, stops a door's say", { timeout: 60_000 }, async () => {
  await up();
  const a = await face(), other = await face();
  a.say({ type: "say", text: "hi from the phone", seat: "codex", door: "phone", fresh: true });
  // the other socket learns the turn from creature.turn, and stops it by that id
  const t = await other.next((m) => m.type === "creature.turn" && !!m.turn && m.turn.sessionId !== first);
  assert.ok(t.turn.sessionId, "the door's turn has an id");
  other.say({ type: "stop", sessionId: t.turn.sessionId });
  const done = await a.next((m) => m.type === "done");
  assert.equal(done.stopped, true);
  assert.equal(a.got.filter((m) => m.type === "done").length, 1, "one ending");
  a.ws.close(); other.ws.close();
});

test("one ending: a seat that throws ends the turn with its error and one done, ok: false", { timeout: 60_000 }, async () => {
  await up();
  const a = await face();
  a.say({ type: "say", text: "please fail", seat: "codex", door: "phone", fresh: true });
  const done = await a.next((m) => m.type === "done");
  const types = a.got.map((m) => m.type).filter((t) => t === "error" || t === "done");
  assert.deepEqual(types, ["error", "done"]);
  assert.equal(done.ok, false);
  assert.equal(done.seat, "codex");
  a.ws.close();
});

test("an unknown work.* type is answered by its rid with an error, so the face's ask does not wait", { timeout: 60_000 }, async () => {
  await up();
  const a = await face();
  a.say({ type: "work.nope", rid: "r1" });
  const r = await a.next((m) => m.rid === "r1", 5000);
  assert.equal(r.type, "work.nope");
  assert.match(r.error, /work\.nope/);
  a.ws.close();
});

test("health: Sol's own page reads it across origins (One Sol, #62); a foreign page is refused", { timeout: 60_000 }, async () => {
  await up();
  const app = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { origin: "tauri://localhost" } });
  assert.equal(app.status, 200);
  assert.equal(app.headers.get("access-control-allow-origin"), "tauri://localhost");
  assert.deepEqual((await app.json()).busy, []);
  const bare = await fetch(`http://127.0.0.1:${PORT}/health`);
  assert.equal(bare.headers.get("access-control-allow-origin"), null, "no Origin, no header");
  const foreign = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { origin: "https://example.com" } });
  assert.equal(foreign.status, 403);
});

test("work.kind and work.under through the wire: promote and demote, set and clear, every refusal answered; the rows carry both", { timeout: 90_000 }, async () => {
  await up();
  const a = await face();
  let n = 0;
  const ask = async (m: object) => { const rid = `k${++n}`; a.say({ ...m, rid }); return a.next((x) => x.rid === rid); };
  // the list as it is now: work.list answers with a work.sessions, without the rid, so the first one after the ask
  const row = async (id: string) => {
    const from = a.got.length;
    a.say({ type: "work.list" });
    const list = await a.next((x) => x.type === "work.sessions" && a.got.indexOf(x) >= from);
    return list.sessions.find((s: { id: string }) => s.id === id);
  };
  a.say({ type: "work.folder", op: "add", path: CWD });   // a folder in the system's temp is shown only when added by hand
  // promote: marked, kept, told
  assert.deepEqual(await ask({ type: "work.kind", sessionId: SA, kind: "orchestration" }).then((r) => r.promoted), true);
  assert.equal((await row(SA)).kind, "orchestration");
  const kept = await ask({ type: "work.one.kept" });
  assert.ok(kept.orchestrators.some((o: { sessionId: string }) => o.sessionId === SA), "its renewal record is kept");
  await a.next((x) => x.sessionId === SA && JSON.stringify(x).includes("<promoted>"), 20_000);   // the turn went to it
  assert.equal((await ask({ type: "work.kind", sessionId: SA, kind: "orchestration" })).promoted, false, "asked twice: once");
  // under: set toward an orchestration session, and the row carries it
  assert.deepEqual(await ask({ type: "work.under", sessionId: SB, under: SA }).then((r) => [r.ok, r.under]), [true, SA]);
  assert.equal((await row(SB)).under, SA);
  // refusals: each answered by its rid, nothing changed
  assert.match((await ask({ type: "work.under", sessionId: SA, under: SA })).error, /under itself/);
  assert.match((await ask({ type: "work.under", sessionId: SA, under: "not-a-runner-1" })).error, /only an orchestration session/);
  assert.equal((await ask({ type: "work.kind", sessionId: SB, kind: "orchestration" })).promoted, true);
  assert.match((await ask({ type: "work.under", sessionId: SA, under: SB })).error, /under itself/, "a two-step cycle");
  assert.equal((await row(SA)).under, undefined);
  // a valid chain: a third under SB, which runs under SA
  assert.equal((await ask({ type: "work.kind", sessionId: "orch-wire-c1", kind: "orchestration" })).promoted, true);
  assert.equal((await ask({ type: "work.under", sessionId: "orch-wire-c1", under: SB })).ok, true);
  // demote: the mark goes, the one under it is let loose
  const d = await ask({ type: "work.kind", sessionId: SB, kind: null });
  assert.deepEqual([d.demoted, d.loose], [true, ["orch-wire-c1"]]);
  assert.equal((await row(SB)).kind, undefined);
  assert.equal((await ask({ type: "work.kind", sessionId: SB, kind: null })).demoted, false);
  assert.ok(!(await ask({ type: "work.one.kept" })).orchestrators.some((o: { sessionId: string }) => o.sessionId === SB));
  // clear
  assert.equal((await ask({ type: "work.under", sessionId: SB, under: null })).ok, true);
  assert.equal((await row(SB)).under, undefined);
  // the runs the promote and the demote opened end here (their turns ended at once: no sign-in), so the engine is quiet
  for (const id of [SA, SB, "orch-wire-c1"]) {
    for (let i = 0; i < 50; i++) { const busy = (await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()).busy as { id: string; working?: boolean }[]; if (!busy.some((b) => b.id === id)) break; a.say({ type: "work.stop", sessionId: id }); a.say({ type: "work.delete", sessionId: id }); await new Promise((r) => setTimeout(r, 200)); }
  }
  assert.deepEqual((await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()).busy, []);
  a.ws.close();
});

// last in this file: the engine then refuses new turns for LET_GO_MS
test("letgo: a quiet engine lets go, then refuses a new turn so none starts before the window's reload (One Sol, #62)", { timeout: 60_000 }, async () => {
  await up();
  const r = await fetch(`http://127.0.0.1:${PORT}/letgo`, { method: "POST", headers: { origin: "tauri://localhost" } });
  assert.equal(r.headers.get("access-control-allow-origin"), "tauri://localhost");
  assert.deepEqual(await r.json(), { ok: true });
  const a = await face();
  a.say({ type: "say", text: "hi", seat: "codex", door: "phone", fresh: true });
  assert.match((await a.next((m) => m.type === "error")).message, /moving to the NucBox/);
  a.say({ type: "work.say", sessionId: "s1", text: "hi" });
  assert.match((await a.next((m) => m.type === "work.error")).message, /moving to the NucBox/);
  a.ws.close();
});

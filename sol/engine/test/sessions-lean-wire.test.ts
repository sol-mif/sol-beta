// The lean list over the wire (#870 item 3): two faces on one real engine, one that asked `work.list { lean: true }`
// and one that never did. Looking at or opening a session that was read already (work.view, work.open) moves only its
// `seen` mark: the plain face is sent the whole list again, as before; the lean one is sent nothing. A pin is a change: both get it, whole. An ask is
// always answered. The engine runs on its own port, with its own HOME (so ~/.claude is a fixture: one transcript),
// its own state and home; no model is asked anything.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const ENGINE = join(import.meta.dirname, "..");
// the first port in 8180-8189 that nothing listens on
const free = (p: number) => new Promise<boolean>((ok) => { const s = createServer().once("error", () => ok(false)).listen(p, "127.0.0.1", () => s.close(() => ok(true))); });
let PORT = 0;
for (let p = 8180; p < 8190 && !PORT; p++) if (await free(p)) PORT = p;
if (!PORT) throw new Error("no free port in 8180-8189");
const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-lean-wire-")));
const HOME = join(dir, "person"), FOLDER = join(HOME, "projects", "a");
const SID = "0f0e0d0c-0b0a-4908-8706-050403020100";
const slug = join(HOME, ".claude", "projects", FOLDER.replace(/[^A-Za-z0-9]/g, "-"));
mkdirSync(join(dir, "home")); mkdirSync(FOLDER, { recursive: true }); mkdirSync(slug, { recursive: true });
// one session, as Claude Code writes it: a first message said in the folder
writeFileSync(join(slug, `${SID}.jsonl`), JSON.stringify({
  parentUuid: null, isSidechain: false, userType: "external", cwd: FOLDER, sessionId: SID, version: "2.0.0", gitBranch: "",
  type: "user", message: { role: "user", content: "the stage lags" }, uuid: "1f0e0d0c-0b0a-4908-8706-050403020100", timestamp: new Date().toISOString(),
}) + "\n");

let engine: ChildProcess | null = null;
const socks: WebSocket[] = [];
after(() => { for (const s of socks) s.close(); engine?.kill(); rmSync(dir, { recursive: true, force: true }); });

type Msg = { type: string; [k: string]: any };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function up() {
  const env: NodeJS.ProcessEnv = {
    ...process.env, HOME, SOL_PORT: String(PORT), SOL_HOME: join(dir, "home"), SOL_PROFILE: join(dir, "profile"),
    SOL_STATE: join(dir, "work.json"), SOL_TEAM: join(dir, "team.json"), SOL_LOG: join(dir, "engine.log"),
    SOL_SESSIONS_DIR: join(dir, "sessions"), SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1", SOL_TRACK: "off",
  };
  delete env.CLAUDE_CONFIG_DIR;
  engine = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: ENGINE, stdio: "ignore", env });
  for (let i = 0; i < 450; i++) {   // 90 s: a CI machine running every suite at once starts an engine slowly (#1703)
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch {}
    await wait(200);
  }
  throw new Error("the test engine did not come up");
}

async function face() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  socks.push(ws);
  const got: Msg[] = [];
  ws.on("message", (raw) => got.push(JSON.parse(raw.toString())));
  await new Promise((r, no) => { ws.once("open", r); ws.once("error", no); });
  const lists = () => got.filter((m) => m.type === "work.sessions");
  // the next list after the n it has, that says what is asked of it
  const next = async (n: number, pred: (m: Msg) => boolean, what: string) => {
    for (let i = 0; i < 150; i++) { const m = lists().slice(n).find(pred); if (m) return m; await wait(100); }
    throw new Error(`${what}: timed out; got ${got.map((m) => m.type).join(" ")}`);
  };
  return { lists, next, send: (m: object) => ws.send(JSON.stringify(m)) };
}
const rowIn = (m: Msg) => (m.sessions as any[]).find((s) => s.id === SID);

test("a lean face is not sent the list again when only `seen` moved, a plain face is; a change goes to both, whole", { timeout: 150_000 }, async () => {
  await up();
  const plain = await face();
  // /var/folders is scratch to the side; a folder added by hand is listed all the same
  plain.send({ type: "work.folder", op: "add", path: FOLDER });
  await plain.next(0, (m) => !!rowIn(m), "the fixture's session is a row");
  await wait(500);   // nothing more on its way

  const lean = await face();
  lean.send({ type: "work.list", lean: true });
  const first = await lean.next(0, () => true, "the lean face's first list");
  assert.equal(rowIn(first)?.title, "the stage lags", "the first answer is the whole list");
  assert.deepEqual(first, plain.lists().at(-1), "the same list the plain face holds");

  // the session is looked at twice, then opened three times, in the plain face (work.view, work.open: the session,
  // not a block on its stage): it was never unread, so only its `seen` mark moves
  for (const [round, type] of ["work.view", "work.view", "work.open", "work.open", "work.open"].entries()) {
    const n = plain.lists().length, was = rowIn(plain.lists().at(-1)!)?.seen;
    plain.send({ type, sessionId: SID });
    const again = await plain.next(n, (m) => rowIn(m)?.seen !== was, `the plain face's list after ${type} ${round}`);
    assert.ok(rowIn(again).seen > 0);
    await wait(300);
    assert.equal(lean.lists().length, 1, `${type} ${round}: the lean face was sent no list`);
  }

  // a pin is a change: both are sent it, and the lean face's list is the whole one, as fresh as the plain face's
  const n = plain.lists().length;
  plain.send({ type: "work.mark", sessionId: SID, patch: { pinned: true } });
  const pinned = await plain.next(n, (m) => rowIn(m)?.pinned === true, "the plain face's list with the pin");
  const mine = await lean.next(1, (m) => rowIn(m)?.pinned === true, "the lean face's list with the pin");
  assert.deepEqual(mine, pinned);
  assert.equal(lean.lists().length, 2);

  // an ask is always answered, with what it holds or not; and the face is still lean after it
  lean.send({ type: "work.list" });
  await lean.next(2, () => true, "the answer to a second ask");
  const p = plain.lists().length;
  plain.send({ type: "work.view", sessionId: SID });
  await plain.next(p, () => true, "the plain face's list after one more view");
  await wait(300);
  assert.equal(lean.lists().length, 3, "the ask's answer, and nothing after it");
});

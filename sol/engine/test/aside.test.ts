// fr-07 E10: the aside (Cmd ;, /btw) asks on the side. It is a fork of the session that is never written down: no
// persistence, no tools, one turn; its answer streams to the window that asked and to nobody else; the session never
// sees it. The SDK's query is swapped for a recording one (a resolve hook, so the real aside.ts and wire.ts run);
// nothing is sent to a model. Escape (drops the card) is the face's, not the engine's.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-aside-")));
const HOME = join(dir, "person"), PROJ = join(HOME, "proj");
mkdirSync(PROJ, { recursive: true });
Object.assign(process.env, { HOME, SOL_STATE: join(dir, "work.json"), SOL_HOME: join(dir, "home"), SOL_SESSIONS_DIR: join(dir, "sessions"), SOL_TEAM: join(dir, "team.json"), SOL_TEAM_OFFLINE: "1" });
delete process.env.CLAUDE_CONFIG_DIR;

// the SDK's query is the test's: every call is kept, and it answers like the CLI does for a text turn
type Call = { prompt: string; options: any };
const calls: Call[] = [];
(globalThis as any).__asideQuery = (a: Call) => {
  calls.push(a);
  return (async function* () {
    for (const t of ["It is ", "a fork."]) yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: t } } };
    yield { type: "assistant", message: { content: [{ type: "text", text: "It is a fork." }] } };
    yield { type: "result", subtype: "success" };
  })();
};
const stub = join(dir, "sdk-stub.mjs");
registerHooks({
  resolve(spec, ctx, next) {
    if (spec !== "@anthropic-ai/claude-agent-sdk") return next(spec, ctx);
    const url = next(spec, ctx).url;
    writeFileSync(stub, `export * from ${JSON.stringify(url)};\nexport const query = (a) => globalThis.__asideQuery(a);\n`);
    return { url: pathToFileURL(stub).href, shortCircuit: true };
  },
});
after(() => { rmSync(dir, { recursive: true, force: true }); });

const SID = "aaaaaaaa-1111-4222-8333-444444444444";

test("an aside is a fork never written down: no persistence, no tools, one turn", async () => {
  calls.length = 0;
  const { aside } = await import("../src/work/aside.ts");
  const asking: any[] = [];
  await aside({ sessionId: SID, text: "what does this file do?", cwd: PROJ }, (m) => asking.push(m));

  // what the SDK was asked to run: a fork of the session that is not saved, with nothing to act with
  assert.equal(calls.length, 1);
  const o = calls[0].options;
  assert.equal(calls[0].prompt, "what does this file do?");
  assert.equal(o.resume, SID, "it forks this session");
  assert.equal(o.forkSession, true, "as a fork: the session's own transcript is not the one continued");
  assert.equal(o.persistSession, false, "and the fork is never written down");
  assert.deepEqual(o.tools, [], "no tools");
  assert.equal(o.maxTurns, 1, "one turn");

  // what the asking window hears: the question, then the answer in pieces, then done; all of it about this session
  assert.ok(asking.length >= 4 && asking.every((m) => m.type === "work.aside" && m.sessionId === SID));
  assert.equal(new Set(asking.map((m) => m.id)).size, 1, "one id ties the card's lines together");
  assert.deepEqual(asking[0], { type: "work.aside", sessionId: SID, id: asking[0].id, q: "what does this file do?", text: "", done: false });
  assert.deepEqual(asking.filter((m) => m.delta).map((m) => m.delta), ["It is ", "a fork."]);
  assert.equal(asking.at(-1).done, true);
  assert.equal(asking.at(-1).text, "It is a fork.");
  assert.equal(asking.at(-1).error, undefined);
  assert.ok(asking.every((m) => m.type === "work.aside"), "the card's lines are all that went out: no item, no run message");
});

test("an aside is a fork never written down: a failed query is said on the card, not thrown", async () => {
  const { aside } = await import("../src/work/aside.ts");
  (globalThis as any).__asideQuery = () => (async function* () { throw new Error("no connection\nmore"); })();
  const got: any[] = [];
  await aside({ sessionId: SID, text: "hello?" }, (m) => got.push(m));
  assert.equal(got.at(-1).done, true);
  assert.equal(got.at(-1).error, "no connection", "the first line of the reason");
});

test("an aside is a fork never written down: over the wire only the asking window hears it, and the session and its transcript are untouched", async () => {
  const q: Call[] = [];
  (globalThis as any).__asideQuery = (a: Call) => {
    q.push(a);
    return (async function* () {
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "side answer" } } };
      yield { type: "result", subtype: "success" };
    })();
  };
  const { handleWork, addWorkFace, removeWorkFace } = await import("../src/work/wire.ts");
  const { getRun, allRuns } = await import("../src/work/runs.ts");
  const { _stopHolders } = await import("../src/work/holders.ts");
  const asking: any[] = [], beside: any[] = [];
  const a = { send: (m: object) => { asking.push(m); } }, b = { send: (m: object) => { beside.push(m); } };
  // a face's first look starts the engine's half-hourly sweep: its timers are let go of here, so this file can end
  const { setInterval: si, setTimeout: st } = globalThis;
  (globalThis as any).setInterval = (...x: any[]) => (si as any)(...x).unref();
  (globalThis as any).setTimeout = (...x: any[]) => (st as any)(...x).unref();
  addWorkFace(a); addWorkFace(b);   // before the transcript: no folder to watch yet
  Object.assign(globalThis, { setInterval: si, setTimeout: st });

  // the session's transcript on the temp disk, as the Claude Code files it
  const slug = PROJ.replace(/[^a-zA-Z0-9]/g, "-");
  const file = join(HOME, ".claude", "projects", slug, `${SID}.jsonl`);
  mkdirSync(join(HOME, ".claude", "projects", slug), { recursive: true });
  writeFileSync(file, JSON.stringify({ type: "user", cwd: PROJ, sessionId: SID, timestamp: "2026-11-18T10:00:00.000Z", message: { role: "user", content: "the task" } }) + "\n");
  const before = readFileSync(file, "utf8");

  try {
    await handleWork(a, { type: "work.aside", sessionId: SID, text: "side question" });
    for (let i = 0; i < 100 && !asking.some((m) => m.type === "work.aside" && m.done); i++) await new Promise((r) => setTimeout(r, 20));
  } finally { removeWorkFace(a); removeWorkFace(b); _stopHolders(); }

  assert.ok(asking.some((m) => m.type === "work.aside" && m.delta === "side answer"), "the asking window got the answer");
  assert.equal(beside.filter((m) => m.type === "work.aside").length, 0, "the other window got none of it");
  assert.equal(q.length, 1);
  assert.equal(q[0].options.persistSession, false);
  assert.equal(q[0].options.cwd, PROJ, "it runs in the session's folder, read from its transcript");
  assert.equal(getRun(SID), undefined, "no run was made for the session: it never saw the aside");
  assert.equal(allRuns().length, 0);
  assert.equal(readFileSync(file, "utf8"), before, "the transcript is as it was");
});

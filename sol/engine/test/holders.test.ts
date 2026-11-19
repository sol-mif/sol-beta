// fr-07 E15 and F2: a session another process holds (the Claude app, a terminal) is read-only here. holders.ts reads
// the live processes' files in a temp ~/.claude/sessions (a pid that is really alive: a `sleep` this test starts);
// the real wire and runs.ts refuse a message to it, and "fork here" goes on in a new session. The SDK's query is a
// recorder (a resolve hook), so a refusal that failed would show as a call, never reach a model or start the CLI.
// How the face shows it ("open in the Claude app · read-only here", the buttons) is the face's; the words the engine
// gives for it are checked here.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-held-")));
const HOME = join(dir, "person"), PROJ = join(HOME, "proj"), SESSIONS = join(dir, "sessions");
mkdirSync(PROJ, { recursive: true }); mkdirSync(SESSIONS);
Object.assign(process.env, { HOME, SOL_STATE: join(dir, "work.json"), SOL_HOME: join(dir, "home"), SOL_SESSIONS_DIR: SESSIONS, SOL_TEAM: join(dir, "team.json"), SOL_TEAM_OFFLINE: "1" });
delete process.env.CLAUDE_CONFIG_DIR;

// the SDK's query is a recorder: what a run or a fork would have asked of the CLI. A fork's one-note write answers
// with the id of the new session, as the CLI does.
type Call = { prompt: any; options: any };
const calls: Call[] = [];
const NEW = "bbbbbbbb-1111-4222-8333-444444444444";
(globalThis as any).__heldQuery = (a: Call) => {
  calls.push(a);
  return (async function* () {
    yield { type: "system", subtype: "init", session_id: NEW };
    yield { type: "result", subtype: "success", session_id: NEW };
  })();
};
const stub = join(dir, "sdk-stub.mjs");
registerHooks({
  resolve(spec, ctx, next) {
    if (spec !== "@anthropic-ai/claude-agent-sdk") return next(spec, ctx);
    writeFileSync(stub, `export * from ${JSON.stringify(next(spec, ctx).url)};\nexport const query = (a) => globalThis.__heldQuery(a);\n`);
    return { url: pathToFileURL(stub).href, shortCircuit: true };
  },
});

const { heldElsewhere, holders, invalidateHolders, HOLDER_NAME } = await import("../src/work/holders.ts");
const { workSay, getRun, allRuns } = await import("../src/work/runs.ts");
const { handleWork } = await import("../src/work/wire.ts");

const kids: ChildProcess[] = [];
after(() => { for (const k of kids) k.kill(); rmSync(dir, { recursive: true, force: true }); });

// a process that is really alive, registered as `entrypoint` holds `session` (the file the Claude Code writes)
function hold(session: string, entrypoint: string, status = "idle") {
  const kid = spawn("sleep", ["60"]);
  kids.push(kid);
  writeFileSync(join(SESSIONS, `${kid.pid}.json`), JSON.stringify({ pid: kid.pid, sessionId: session, entrypoint, status, cwd: PROJ }));
  invalidateHolders();
  return kid;
}

// the session's transcript, as the Claude app files it: a question and its answer
const SID = "aaaaaaaa-1111-4222-8333-444444444444";
const slug = PROJ.replace(/[^a-zA-Z0-9]/g, "-");
const file = join(HOME, ".claude", "projects", slug, `${SID}.jsonl`);
mkdirSync(join(HOME, ".claude", "projects", slug), { recursive: true });
writeFileSync(file, [
  { type: "user", uuid: "u1", parentUuid: null, sessionId: SID, cwd: PROJ, entrypoint: "claude-desktop", timestamp: "2026-11-18T10:00:00.000Z", message: { role: "user", content: "plan the move" } },
  { type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: SID, cwd: PROJ, entrypoint: "claude-desktop", timestamp: "2026-11-18T10:00:05.000Z", message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "here is the plan" }] } },
].map((l) => JSON.stringify(l)).join("\n") + "\n");
const asFiled = readFileSync(file, "utf8");
const face = { send: (_m: object) => {} };   // a window that is not listed: what it is sent is not under test, what is refused is

test("a session held elsewhere is read-only: the app's and a terminal's process name themselves as its holder", () => {
  const app = hold(SID, "claude-desktop", "busy");
  const h = heldElsewhere(SID, true);
  assert.equal(h?.who, "desktop");
  assert.equal(h?.pid, app.pid);
  assert.equal(h?.status, "busy");
  assert.equal(HOLDER_NAME[h!.who], "the Claude app");
  assert.equal(heldElsewhere("cccccccc-1111-4222-8333-444444444444", true), undefined, "a session nobody holds is not read-only");
  // a terminal holds another
  hold("term-session-1", "cli");
  assert.equal(HOLDER_NAME[heldElsewhere("term-session-1", true)!.who], "a terminal");
  // the holder ends: the session is Sol's to write again
  app.kill();
  rmSync(join(SESSIONS, `${app.pid}.json`));
  invalidateHolders();
  assert.equal(heldElsewhere(SID, true), undefined);
  assert.equal(holders().get(SID), undefined);
});

test("a session held elsewhere is read-only: Sol's own run of it is not another's hold", () => {
  const own = spawn("sleep", ["60"]); kids.push(own);   // a child of this process, as the engine's own run is
  writeFileSync(join(SESSIONS, `${own.pid}.json`), JSON.stringify({ pid: own.pid, sessionId: "own-session-1", entrypoint: "sdk-ts", status: "idle" }));
  invalidateHolders();
  assert.equal(heldElsewhere("own-session-1", true), undefined);
});

test("a held session takes no message: it is refused with the line, nothing is written and no run starts", async () => {
  const app = hold(SID, "claude-desktop");
  calls.length = 0;
  const say = { type: "work.say", sessionId: SID, text: "and then?", id: "m1" };
  await assert.rejects(handleWork(face, say), { message: "it is open in the Claude app (idle): fork it here to go on, or write there" });
  assert.equal(calls.length, 0, "the CLI was never asked");
  assert.equal(getRun(SID), undefined);
  assert.equal(allRuns().length, 0, "no run began");
  assert.equal(readFileSync(file, "utf8"), asFiled, "the transcript is as the app left it");
  // the same at the door the wire uses, for a terminal's session, with an opener that must not be reached
  hold("term-session-2", "cli", "busy");
  let opened = 0;
  await assert.rejects(workSay({ sessionId: "term-session-2", text: "hi" }, () => {}, async () => { opened++; throw new Error("opened"); }), /^Error: it is open in a terminal \(busy\): fork it here to go on, or write there$/);
  assert.equal(opened, 0, "no run was opened for it");
  // the control: a session nobody holds does reach the opener, so the refusal above is the hold's doing
  await assert.rejects(workSay({ sessionId: "free-session-3", text: "hi" }, () => {}, async () => { opened++; throw new Error("opened"); }), /opened/);
  assert.equal(opened, 1);
  app.kill();
});

test("a session held elsewhere is read-only: fork here goes on in a new session, the held one untouched", async () => {
  const app = hold(SID, "claude-desktop");
  calls.length = 0;
  const heard: any[] = [];
  await handleWork({ send: (m: object) => { heard.push(m); } }, { type: "work.forkhere", sessionId: SID, rid: "f1" });
  const forked = heard.find((m) => m.type === "work.forked");
  assert.equal(forked?.sessionId, NEW, "the new session's id, from the fork's own start");
  assert.notEqual(forked.sessionId, SID);
  assert.equal(forked.from, SID);
  assert.equal(forked.here, true);
  assert.equal(forked.rid, "f1");
  // what was asked of the CLI: a plain fork of the copy, and a first note saying where it came from
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.forkSession, true);
  assert.notEqual(calls[0].options.resume, SID, "it forks a copy, not the held session itself");
  const note = await calls[0].prompt[Symbol.asyncIterator]().next();
  assert.match(note.value.message.content, /forked here from .*which is open in the Claude app/);
  assert.equal(note.value.shouldQuery, false, "the note asks for no answer");
  assert.equal(readFileSync(file, "utf8"), asFiled, "the held session's transcript is as the app left it");
  app.kill();
});

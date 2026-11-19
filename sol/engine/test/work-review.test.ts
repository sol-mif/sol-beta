// fr-09 beside fr-07 (N6): the review seat reads the changes pane's scope, and Codex's remarks come back as one card a
// round in the talk. The real wire (work.review, work.diff, work.open) and review.ts run; only Codex is a stand-in, put
// in by a resolve hook, that answers the two remarks of the test and keeps what it was asked. The card itself (how a
// remark is drawn, "send to Claude", "dismiss") is the face's: this checks what the engine sends and keeps for it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sol-review-")));
const HOME = join(dir, "person"), PROJ = join(HOME, "proj");
mkdirSync(PROJ, { recursive: true });
Object.assign(process.env, { HOME, SOL_STATE: join(dir, "work.json"), SOL_HOME: join(dir, "home"), SOL_SESSIONS_DIR: join(dir, "sessions"), SOL_TEAM: join(dir, "team.json"), SOL_TEAM_OFFLINE: "1" });
delete process.env.CLAUDE_CONFIG_DIR;
// a person's git that names the sides c/ and w/, not a/ and b/ (CI's runner does): the pane must still read the paths
Object.assign(process.env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "diff.mnemonicPrefix", GIT_CONFIG_VALUE_0: "true" });

// the stand-in Codex: a thread that says its thread id, then one message with the remarks as the schema asks, then ends
type Asked = { text: string; opts: any; schema: any };
const codex = (globalThis as any).__codex = { asked: [] as Asked[], remarks: [] as { file: string; line: number; what: string }[] };
const stub = join(dir, "codex-stub.mjs");
writeFileSync(stub, `
const thread = (opts) => ({ async runStreamed(text, run) {
  globalThis.__codex.asked.push({ text, opts, schema: run.outputSchema });
  return { events: (async function* () {
    yield { type: "thread.started", thread_id: "thread-one" };
    yield { type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ remarks: globalThis.__codex.remarks }) } };
    yield { type: "turn.completed" };
  })() };
} });
export class Codex { startThread(opts) { return thread(opts); } resumeThread(id, opts) { return thread(opts); } }
`);
registerHooks({
  resolve(spec, ctx, next) { return spec === "@openai/codex-sdk" ? { url: pathToFileURL(stub).href, shortCircuit: true } : next(spec, ctx); },
});
// The side's watchers and the engine's long timers (the sweep, the wake) have no stop of their own, and one left holding
// keeps this file's process alive after its test. Those made here are kept, and let go at the end.
const watchers: { close: () => void }[] = [], longTimers: { unref: () => void }[] = [];
const watch0 = fs.watch;
(fs as any).watch = (...a: any[]) => { const w = (watch0 as any)(...a); watchers.push(w); return w; };
for (const k of ["setTimeout", "setInterval"] as const) {
  const make = (globalThis as any)[k];
  (globalThis as any)[k] = (f: any, ms: number, ...r: any[]) => { const t = make(f, ms, ...r); if (ms >= 10_000) longTimers.push(t); return t; };
}
syncBuiltinESMExports();
after(() => { for (const w of watchers) w.close(); for (const t of longTimers) t.unref(); rmSync(dir, { recursive: true, force: true }); });

const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: PROJ, encoding: "utf8" });
const SID = "bbbbbbbb-1111-4222-8333-444444444444";

test("a review's remarks are one card a round: the pane's uncommitted scope goes to Codex, its two remarks come back as items of one round, and an opened session lists them with its own items", async () => {
  const { handleWork, addWorkFace, removeWorkFace } = await import("../src/work/wire.ts");
  const { _stopHolders } = await import("../src/work/holders.ts");
  const heard: any[] = [];
  const face = { send: (m: object) => { heard.push(m); } };
  addWorkFace(face);   // before the transcript's folder exists: the side's watcher then has none to hold open
  // a repository with one commit and one more, then what is not committed: an edit and a new file
  git("init", "-q", "-b", "main");
  writeFileSync(join(PROJ, "a.txt"), "one\n"); git("add", "."); git("commit", "-q", "-m", "first");
  writeFileSync(join(PROJ, "b.txt"), "already committed\n"); git("add", "."); git("commit", "-q", "-m", "second");
  writeFileSync(join(PROJ, "a.txt"), "one\ntwo is not committed\n");
  writeFileSync(join(PROJ, "c.txt"), "new file, not tracked\n");
  // the session's transcript, as Claude Code files it: what the talk showed before the review
  const slug = PROJ.replace(/[^a-zA-Z0-9]/g, "-");
  mkdirSync(join(HOME, ".claude", "projects", slug), { recursive: true });
  writeFileSync(join(HOME, ".claude", "projects", slug, `${SID}.jsonl`), [
    { type: "user", uuid: "u1", parentUuid: null, sessionId: SID, cwd: PROJ, timestamp: "2026-11-18T10:00:00.000Z", message: { role: "user", content: "change a.txt" } },
    { type: "assistant", uuid: "a1", parentUuid: "u1", sessionId: SID, cwd: PROJ, timestamp: "2026-11-18T10:00:05.000Z", message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "done" }] } },
  ].map((l) => JSON.stringify(l)).join("\n") + "\n");
  codex.remarks = [{ file: "a.txt", line: 2, what: "the second line is never read." }, { file: "c.txt", line: 1, what: "the new file is not used." }];

  const items = () => heard.filter((m) => m.type === "work.item" && m.item.kind === "review").map((m) => m.item);
  try {
    // the changes pane at this scope, for what the review should have read
    await handleWork(face, { type: "work.diff", rid: "d1", cwd: PROJ, scope: "uncommitted" });
    const pane = heard.find((m) => m.type === "work.diff" && m.rid === "d1");
    assert.deepEqual(pane.files.map((f: any) => f.path).sort(), ["a.txt", "c.txt"], "the pane's uncommitted scope is the edit and the new file");

    await handleWork(face, { type: "work.review", rid: "r1", sessionId: SID, cwd: PROJ, scope: "uncommitted" });
    const reply = heard.find((m) => m.type === "work.review" && m.rid === "r1");
    assert.ok(reply?.round && !reply.error, `the review started: ${JSON.stringify(reply)}`);
    for (let i = 0; i < 200 && !items().some((x) => x.head && x.busy === false); i++) await new Promise((r) => setTimeout(r, 20));

    // what Codex was asked: the pane's scope, in words and in the diff, and nothing of the commits
    assert.equal(codex.asked.length, 1);
    const asked = codex.asked[0];
    assert.match(asked.text, /what is not committed yet, 2 files/);
    assert.ok(asked.text.includes("two is not committed") && asked.text.includes("new file, not tracked"), "the diff holds the uncommitted lines");
    assert.ok(!asked.text.includes("already committed"), "a committed file is not in an uncommitted review");
    assert.equal(asked.opts.sandboxMode, "read-only", "Codex reads and writes nothing");
    assert.equal(asked.opts.workingDirectory, PROJ);

    // what the talk is sent: one head and the two remarks, all of the one round the reply named
    const sent = items();
    const head = sent.find((x) => x.head)!;
    assert.equal(head.round, reply.round);
    assert.equal(head.scope, "uncommitted");
    assert.equal(head.files, 2, "the head counts the files the pane showed");
    assert.equal(head.count, 2);
    assert.equal(head.busy, false);
    assert.equal(new Set(sent.map((x) => x.id)).size, 3, "one head and two remarks: three items, however often the head was updated");
    const remarks = sent.filter((x) => !x.head);
    assert.deepEqual(remarks.map((x) => [x.round, x.file, x.line, x.state]), [[reply.round, "a.txt", 2, "open"], [reply.round, "c.txt", 1, "open"]]);
    assert.deepEqual(remarks.map((x) => x.text), codex.remarks.map((r) => r.what));

    // an opened session lists them with its own items, in order, after what the talk showed when the review began
    await handleWork(face, { type: "work.open", sessionId: SID });
    const thread = heard.find((m) => m.type === "work.thread" && m.sessionId === SID);
    const kinds = thread.items.map((i: any) => i.kind);
    assert.deepEqual(kinds, ["me", "you", "review", "review", "review"], "the talk as it was, then the round, after the last thing the talk had");
    const card = thread.items.filter((i: any) => i.kind === "review");
    assert.deepEqual(card.map((i: any) => i.round), [reply.round, reply.round, reply.round]);
    assert.equal(card.filter((i: any) => i.head).length, 1, "one head, so one card, for the round");
  } finally { removeWorkFace(face); _stopHolders(); }
});

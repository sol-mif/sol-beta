// The session index (#917): the same rows as the SDK's listSessions, read again only where a transcript changed, one
// pass at a time, and never holding the engine's loop for the whole folder.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import { listed, stale, continuedIn, _resetListed } from "../src/work/listed.ts";

const conf = mkdtempSync(join(tmpdir(), "sol-listed-"));
const root = join(conf, "projects");
const line = (o: object) => JSON.stringify(o) + "\n";
let n = 0;
// a transcript the SDK lists: a user message with its folder, then an answer
function session(dir: string, o: { cwd?: string; text?: string; title?: string; queueFirst?: boolean; id?: string } = {}) {
  const id = o.id ?? randomUUID(), cwd = o.cwd ?? `/Users/x/p${n}`, ts = new Date(Date.UTC(2026, 10, 1, 0, 0, n++)).toISOString();
  const u = randomUUID();
  let text = "";
  if (o.queueFirst) text += line({ type: "queue-operation", operation: "enqueue", timestamp: ts, sessionId: id });
  text += line({ type: "user", uuid: u, parentUuid: null, isSidechain: false, sessionId: id, ...(o.queueFirst ? {} : { cwd }), timestamp: ts, message: { role: "user", content: o.text ?? `hello ${n}` } });
  if (o.queueFirst) text += line({ type: "user", uuid: randomUUID(), parentUuid: u, sessionId: id, cwd, timestamp: ts, message: { role: "user", content: "and" } });
  text += line({ type: "assistant", uuid: randomUUID(), parentUuid: u, sessionId: id, cwd, timestamp: ts, message: { role: "assistant", content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" } });
  if (o.title) text += line({ type: "custom-title", customTitle: o.title, sessionId: id });
  mkdirSync(join(root, dir), { recursive: true });
  const f = join(root, dir, `${id}.jsonl`);
  writeFileSync(f, text);
  utimesSync(f, new Date(), new Date(Date.UTC(2026, 10, 1, 0, 0, n)));
  return { id, f };
}
const strip = (l: { sessionId: string }[]) => l.map((s) => { const { file: _f, ...rest } = s as typeof s & { file?: string }; return rest; });

before(() => { process.env.CLAUDE_CONFIG_DIR = conf; });
beforeEach(() => { rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); _resetListed(); });

test("the index holds the same rows as the SDK's listSessions, in its order", async () => {
  for (let i = 0; i < 6; i++) session(i % 2 ? "-Users-x-a" : "-Users-x-b", i === 3 ? { title: "named" } : {});
  writeFileSync(join(root, "-Users-x-a", "not-a-session.jsonl"), line({ type: "user" }));
  writeFileSync(join(root, "-Users-x-a", `${randomUUID()}.jsonl`), "");   // an empty transcript: no row
  const sdk = await listSessions();
  assert.equal(sdk.length, 6);
  assert.deepEqual(strip(await listed(0)), sdk);
});

test("only a changed transcript is read again; a gone one drops out; a new one comes in", async () => {
  const a = session("-Users-x-a"), b = session("-Users-x-a");
  const first = await listed(0);
  const rowB = first.find((s) => s.sessionId === b.id);
  appendFileSync(a.f, line({ type: "custom-title", customTitle: "renamed", sessionId: a.id }));
  stale();
  const second = await listed();
  assert.equal(second.find((s) => s.sessionId === a.id)?.customTitle, "renamed");
  assert.equal(second.find((s) => s.sessionId === b.id), rowB, "the unchanged row is the same object: not read again");
  rmSync(b.f);
  const c = session("-Users-x-c");
  stale();
  const third = await listed();
  assert.deepEqual(third.map((s) => s.sessionId).sort(), [a.id, c.id].sort());
  assert.deepEqual(strip(third), await listSessions());
});

test("fresh and unchanged: no pass at all; two reads at once share one pass", async () => {
  session("-Users-x-a");
  const one = listed(0), two = listed(0);
  assert.equal(one, two, "a read during a pass waits on that pass");
  const l = await one;
  assert.equal(await listed(), l, "nothing marked stale: the same list, no pass");
});

test("a transcript that opens with queue bookkeeping still has its folder", async () => {
  const s = session("-Users-x-q", { queueFirst: true, cwd: "/Users/x/queued" });
  const row = (await listed(0)).find((r) => r.sessionId === s.id);
  assert.equal(row?.cwd, "/Users/x/queued");
});

test("a session continued in another transcript drops out, as the SDK drops it", async () => {
  const next = session("-Users-x-a");
  const old = session("-Users-x-a");
  appendFileSync(old.f, line({ type: "continued-in", continuedInSessionId: next.id }));
  const ids = (await listed(0)).map((s) => s.sessionId);
  assert.deepEqual(ids, [next.id]);
  assert.deepEqual(strip(await listed(0)), await listSessions());
  // a message after the continued-in line: the session went on here, so it stays
  assert.equal(continuedIn(line({ type: "continued-in", continuedInSessionId: next.id }) + line({ type: "user", message: { content: "more" } })), undefined);
  assert.equal(continuedIn(line({ type: "continued-in", continuedInSessionId: next.id })), next.id);
});

test("a pass gives the loop a turn between files, not one long hold", async () => {
  for (let i = 0; i < 40; i++) session("-Users-x-many");
  let turns = 0, on = true;
  const spin = () => { if (!on) return; turns++; setImmediate(spin); };
  setImmediate(spin);
  const l = await listed(0);
  on = false;
  assert.equal(l.length, 40);
  assert.ok(turns >= 10, `the loop turned ${turns} times during a 40-file pass`);
});

test("a read just after a change waits for a pass that sees it, even while another pass runs", async () => {
  session("-Users-x-a");
  await listed(0);
  const b = session("-Users-x-a");
  stale();
  const first = listed();
  const c = session("-Users-x-a");
  stale();
  const l = await listed();
  assert.ok(l.some((s) => s.sessionId === b.id) && l.some((s) => s.sessionId === c.id));
  await first;
});

test("one id in two folders: each folder's row is its own file's, and the newer one is listed, as the SDK lists it", async () => {
  const id = randomUUID();
  const old = session("-Users-x-a", { id, cwd: "/Users/x/a", text: "old one" });
  const neu = session("-Users-x-b", { id, cwd: "/Users/x/b", text: "new one" });
  utimesSync(old.f, new Date(), new Date(Date.UTC(2026, 9, 1)));
  utimesSync(neu.f, new Date(), new Date(Date.UTC(2026, 11, 1)));
  const l = await listed(0);
  const row = l.find((s) => s.sessionId === id)!;
  assert.equal(row.file, neu.f);
  assert.equal(row.firstPrompt, "new one");
  assert.deepEqual(strip(l), await listSessions());
});

test("a continued session comes back or drops out as the transcript it went on in changes", async () => {
  const next = session("-Users-x-a");
  const old = session("-Users-x-a");
  writeFileSync(next.f, line({ type: "queue-operation", operation: "enqueue", sessionId: next.id }));   // no message yet
  appendFileSync(old.f, line({ type: "continued-in", continuedInSessionId: next.id }));
  assert.ok((await listed(0)).some((s) => s.sessionId === old.id), "the next one has nothing yet: the old one stays");
  appendFileSync(next.f, line({ type: "user", uuid: randomUUID(), parentUuid: null, sessionId: next.id, cwd: "/Users/x/n", timestamp: new Date().toISOString(), message: { role: "user", content: "go" } }));
  stale();
  assert.ok(!(await listed()).some((s) => s.sessionId === old.id), "the next one has a message: the old one drops out");
  assert.deepEqual(strip(await listed(0)), await listSessions());
});

test("a line that is no prompt after continued-in does not keep the session", () => {
  const into = randomUUID();
  const tail = line({ type: "continued-in", continuedInSessionId: into }) + line({ type: "user", isMeta: true, message: { content: "caveat" } }) +
    line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] } });
  assert.equal(continuedIn(tail), into);
});

test("twins in folders not named after their head's folder still list, and a twin's row follows the other's coming and going", async () => {
  const id = randomUUID();
  const one = session("-Users-x-renamed1", { id, cwd: "/Users/x/orig" });
  session("-Users-x-renamed2", { id, cwd: "/Users/x/orig" });
  assert.equal((await listed(0)).filter((s) => s.sessionId === id).length, 1);
  rmSync(one.f);
  stale();
  assert.equal((await listed()).filter((s) => s.sessionId === id).length, 1);
  assert.deepEqual(strip(await listed(0)), await listSessions());
});

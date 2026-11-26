// An update never wakes every old orchestration session (#1808): the tickets switch, and a demote, are told as a turn
// only to an orchestration session that is awake (its run open, or a turn or its promote within the last hours). An
// idle one gets its tools at once and the words after the person's own, in their next message to it (one.ts owedTo).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-one-wake-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const { toolsOnlyFor } = await import("../src/work/tools.ts");
const { mark, workState } = await import("../src/work/state.ts");

const HOUR = 3_600_000, now = Date.now();
// two orchestration sessions idle for a week, one with a turn ten minutes ago, one idle but with its run open
const rows = [{ id: "old-1", updatedAt: now - 7 * 24 * HOUR }, { id: "old-2", updatedAt: now - 6 * 24 * HOUR },
  { id: "fresh-1", updatedAt: now - 10 * 60_000 }, { id: "open-1", updatedAt: now - 5 * 24 * HOUR }];
let said: { to: string; text: string }[] = [];
const openRun = { busy: false, perms: { size: 0 }, tasks: [], working: false, stop: () => {}, items: { list: [] } };
const wire = () => one.setOneDeps({
  say: async (to, text) => { said.push({ to, text }); },
  run: (id) => (id === "open-1" ? openRun : undefined),
  sessions: async () => rows.map((r) => ({ ...r, title: r.id, cwd: dir })),
  lastWords: async () => "",
  tell: () => {},
});
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const names = (id: string) => toolsOnlyFor(id).map((t: { name: string }) => t.name).sort();
const TICKET_TOOLS = ["ticket_close", "ticket_mandate", "ticket_open", "ticket_read", "ticket_send", "tickets"];

beforeEach(() => {
  said = [];
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null });
  // as an engine after an update finds them: marked, their records promoted long ago
  writeFileSync(join(dir, "orch.json"), JSON.stringify({ orchestrators: rows.map((r) => ({ sessionId: r.id, at: now - 8 * 24 * HOUR })) }));
  for (const r of rows) mark(r.id, { kind: "orchestration" });
  one._reload(); one._reopenMs(50); wire(); one.wakeOrchestrators();
});

test("the switch turned on by an update's first sync: only the awake ones get a turn; every one gets the ticket tools", async () => {
  one.setTickets(true);
  await flush(200);
  assert.deepEqual(said.map((s) => s.to).sort(), ["fresh-1", "open-1"]);
  for (const s of said) assert.match(s.text, /^<tickets on>/);
  for (const r of rows) assert.deepEqual(names(r.id), ["one_sessions", "stop_session", ...TICKET_TOOLS].sort(), r.id);
});

test("an idle one hears the switch after the person's own words in their next message, once", async () => {
  one.setTickets(true); await flush(200);
  const due = one.owedTo("old-1");
  assert.match(due, /^\(Sol, while you were idle\) <tickets on>\n/);
  assert.doesNotMatch(due, /Answer with one line/);
  assert.equal(one.owedTo("old-1"), "", "taken once");
  assert.equal(one.owedTo("fresh-1"), "", "the awake ones were told already");
});

test("turned on and back off while it slept: nothing is owed", async () => {
  one.setTickets(true); await flush(200);
  one.setTickets(false); await flush(200);
  assert.equal(one.owedTo("old-2"), "");
  assert.deepEqual(said.map((s) => s.text.slice(0, 13)).filter((t) => t.startsWith("<tickets off>")).length, 2, "the awake ones hear both");
});

test("demote: an idle one is not woken; its tools go, the words wait. An awake one is told as before", async () => {
  const r = await one.demote("old-1");
  assert.equal(r.demoted, true);
  assert.equal(said.length, 0);
  assert.deepEqual(names("old-1"), []);
  assert.match(one.owedTo("old-1"), /<demoted>/);
  await one.demote("fresh-1");
  assert.deepEqual(said.map((s) => s.to), ["fresh-1"]);
  assert.match(said[0].text, /^<demoted>/);
});

test("a promote clears what was owed: its own words say the way it works now", async () => {
  await one.demote("old-2");
  await one.promote("old-2");
  assert.equal(one.owedTo("old-2"), "");
  assert.match(said[said.length - 1].text, /^<promoted>/);
});

test("the wire gives the owed words with the person's next message, as `here`: never in their own line", () => {
  const w = readFileSync(new URL("../src/work/wire.ts", import.meta.url), "utf8");
  assert.match(w, /case "work\.say": \{[\s\S]{0,300}s\.owed = one\.owedTo\(s\.sessionId\) \|\| undefined;/);
  const r = readFileSync(new URL("../src/work/runs.ts", import.meta.url), "utf8");
  assert.match(r, /if \(!s\.fresh && s\.owed\) s\.here = s\.owed;/);
});

test("turned on and off again before the sessions are read: nothing is said or owed", async () => {
  one.setTickets(true); one.setTickets(false);
  await flush(200);
  assert.equal(said.length, 0);
  assert.equal(one.owedTo("old-1"), "");
});

test("on, off, on before the sessions are read: the awake ones hear <tickets on> once", async () => {
  one.setTickets(true); one.setTickets(false); one.setTickets(true);
  await flush(200);
  assert.deepEqual(said.map((s) => s.to).sort(), ["fresh-1", "open-1"]);
  assert.match(one.owedTo("old-1"), /<tickets on>/);
});

process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

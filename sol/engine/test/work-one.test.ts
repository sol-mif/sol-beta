// What an orchestration session sees and may do (one.ts): every other session with what it does and waits on, a report
// whole up to 6000 letters, the page a session is making, and its own stage changed without asking by a session it
// started on its own. (The kept "one session" that talked through pieces went with #1209; its tests went with it.)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-one-"));
process.env.SOL_STATE = join(dir, "work.json");
const one = await import("../src/work/one.ts");
const { mark } = await import("../src/work/state.ts");

const runs = new Map<string, any>();
const sessions: any[] = [];
const run = (o: Partial<{ busy: boolean; perms: number; tasks: number; ask: string }> = {}) => ({
  busy: !!o.busy, perms: { size: o.perms ?? 0 }, tasks: Array(o.tasks ?? 0).fill("t"), get working() { return !!o.busy || (o.tasks ?? 0) > 0; },
  stop: async () => {}, items: { list: o.ask ? [{ id: "perm:1", kind: "perm", state: "ask", tool: o.ask, input: { command: "npm test" } }] : [] },
});
const wire = () => one.setOneDeps({
  say: async () => {},
  run: (id) => runs.get(id),
  sessions: async () => sessions,
  lastWords: async (id) => (id === "asks" ? "Which colour should the button be?" : `the last words of ${id}`),
  tell: () => {},
});

beforeEach(() => { runs.clear(); sessions.length = 0; one._reload(); wire(); });

test("it knows every other session: what each is doing and what each waits on, the ones that need the person first; its own are the ones under it", async () => {
  const now = Date.now();
  sessions.push(
    { id: "o-1", title: "the orchestrator", cwd: dir, updatedAt: now },
    { id: "rest", title: "resting", cwd: "/a", updatedAt: now - 1000 },
    { id: "busy", title: "building", cwd: "/b", updatedAt: now - 2000, under: "o-1" },
    { id: "perm", title: "wants a yes", cwd: "/c", updatedAt: now - 3000 },
    { id: "asks", title: "asks a question", cwd: "/d", updatedAt: now - 4000 },
    { id: "old", title: "a week ago", cwd: "/e", updatedAt: now - 7 * 86_400_000 },
    { id: "old-mine", title: "a week ago, mine", cwd: "/e", updatedAt: now - 7 * 86_400_000, under: "o-1" },
    { id: "gone", title: "archived", cwd: "/f", updatedAt: now, archived: true },
  );
  runs.set("busy", run({ busy: true, tasks: 2 }));
  runs.set("perm", run({ perms: 1, ask: "Bash" }));
  const rows = await one.roster(24, "o-1");
  assert.deepEqual(rows.map((r) => r.id), ["perm", "asks", "busy", "old-mine", "rest"], "not itself, not archived, not stale unless its own; who needs the person first");
  assert.equal(rows[0].waits, "your allow: Bash");
  assert.equal(rows[1].state, "needs");
  assert.equal(rows[1].waits, "your answer to its question");
  assert.equal(rows[2].waits, "2 agents at work");
  assert.equal(rows[2].mine, true);
  assert.equal(rows[4].doing, "the last words of rest");
  assert.match(one.rosterText(rows), /\[needs\]  wants a yes/);
  assert.match(one.rosterText(rows), /\[working, yours\]  building/);
});

test("a report reaches an orchestration session whole up to 6000 letters; beyond, it says where the rest is", () => {
  assert.equal(one.cutReport(""), "nothing said");
  const long = "x".repeat(5000);
  assert.equal(one.cutReport(long), long, "no longer cut at 600");
  assert.match(one.cutReport("y".repeat(7000)), /… \(cut here: read_session reads the rest\)$/);
});

test("the picture knows the page a session under it is making: the last .html it wrote", () => {
  assert.equal(one.lastPage([{ kind: "me" }, { kind: "tool", name: "Write", input: { file_path: "/w/a.html" } }, { kind: "me" }, { kind: "tool", name: "Edit", input: { file_path: "/w/b.css" } }]), "/w/a.html");
  assert.equal(one.lastPage([{ kind: "tool", name: "Read", input: { file_path: "/w/a.html" } }]), undefined);
});

test("a session an orchestration session started on its own changes its own stage without asking; nobody else, no other mode", () => {
  mark("o-1", { kind: "orchestration" });
  assert.equal(one.ownStage("mcp__sol__compose", "acceptEdits", "o-1"), true);
  assert.equal(one.ownStage("mcp__sol__update", "acceptEdits", "o-1"), true);
  assert.equal(one.ownStage("mcp__sol__compose", "default", "o-1"), false, "asks each step: it asks");
  assert.equal(one.ownStage("mcp__sol__compose", "acceptEdits", "someone-else"), false, "not started by an orchestration session");
  assert.equal(one.ownStage("mcp__sol__compose", "acceptEdits", undefined), false);
  assert.equal(one.ownStage("Bash", "acceptEdits", "o-1"), false, "a command still asks");
  mark("o-1", { kind: null });
});

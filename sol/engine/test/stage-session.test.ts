// The orchestration stage (two kinds of session, step 4; the design #1183 §3, Marco 2026-11-14: "the stage in the
// orchestration should provide all the capabilities needed so i don't have to constantly move around"): one session
// block per session under an orchestrator, composed when it comes under, closed when it is let go, kept current by the
// engine from the child's run, and every press on it one turn (or one act) in the child.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-stage-session-"));
const REPO = join(dir, "repo"); mkdirSync(join(REPO, ".git"), { recursive: true });
const TEAM = join(dir, "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = join(dir, "home");
process.env.SOL_STATE = join(dir, "work.json");
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";

const S = await import("../src/work/blocks.ts");
const one = await import("../src/work/one.ts");
const C = await import("../src/work/children.ts");
const { mark, workState } = await import("../src/work/state.ts");
const tools = await import("../src/work/tools.ts");

S.setStageBus(() => {});
S.setStageFinder(async () => ({ cwd: REPO, by: "tester's agent" }));
const project = S.projectOf(REPO);
const ORCH = "orch-a", KID = "kid-1", KID2 = "kid-2";
type It = { id?: string; kind: string; text?: string; name?: string; input?: unknown; out?: string; ok?: boolean; ask?: string; actions?: unknown };
let items: Record<string, It[]> = {}, runs: Record<string, { busy: boolean; waiting: number; tasks?: unknown[]; cwd?: string }> = {};
let said: [string, string][] = [], stopped: string[] = [], archived: string[] = [], asked: string[] = [];
const SESSIONS = [
  { id: ORCH, title: "the night's work", cwd: REPO, updatedAt: 1 },
  { id: KID, title: "the side row", cwd: "/work/scratch/orch-1", updatedAt: 1, branch: "marcocyl04-ux/orch-1" },
  { id: KID2, title: "the checks", cwd: REPO, updatedAt: 1 },
];
one.setOneDeps({ say: async () => {}, start: async () => "x", run: () => undefined, sessions: async () => SESSIONS as never, lastWords: async () => "", tell: () => {} });
C.setChildDeps({
  session: async (id) => { asked.push(id); const s = SESSIONS.find((x) => x.id === id); return s && { ...s, ...(workState().marks[id] ?? {}) }; }, run: (id) => runs[id], items: async (id) => items[id] ?? [],
  say: async (id, text) => { said.push([id, text]); }, stop: (id) => { stopped.push(id); }, archive: (id) => { archived.push(id); },
});
const block = (child = KID) => S.getBlock(project, C.blockIdOf(child));
const body = (child = KID) => JSON.parse(S.bodyOf(project, C.blockIdOf(child))?.text ?? "null");
const onStage = (child = KID, sid = ORCH) => S.getStage(project, sid).blocks.some((p) => p.id === C.blockIdOf(child));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
after(() => { S.disarmAll(); S.setStageBus(null); C.setChildDeps(null); });

beforeEach(async () => {
  items = {}; runs = {}; said = []; stopped = []; archived = []; asked = [];
  for (const id of Object.keys(workState().marks)) mark(id, { under: null, kind: null, parent: null, archived: false });
  rmSync(join(dir, "orch.json"), { force: true }); rmSync(join(dir, "home"), { recursive: true, force: true });
  one._reload();
  await one.promote(ORCH);
});

test("a session put under an orchestrator gets its block on the orchestrator's stage, in a cell; let go, the block closes", async () => {
  items[KID] = [{ kind: "me", text: "build the row" }, { kind: "you", text: "I built the side row; the fold works." }];
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  const b = block()!;
  assert.equal(b.kind, "session");
  assert.equal(b.title, "the side row");
  assert.ok(onStage(), "on the orchestrator's stage");
  assert.equal(S.getStage(project, ORCH).blocks.find((p) => p.id === b.id)!.ghost, undefined, "never a ghost: the engine's, not a guess");
  assert.deepEqual(body().where, { folder: "orch-1", branch: "marcocyl04-ux/orch-1" });
  assert.equal(body().last, "I built the side row; the fold works.");
  assert.equal(body().ask, undefined);
  // released (work.under null): the block closes, its ledger stays
  mark(KID, { under: null });
  await C.moved(KID, null, ORCH);
  assert.equal(block()!.state, "dead");
  assert.ok(!onStage());
  // under again: the same block comes back
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  assert.equal(block()!.state, "live");
  assert.ok(onStage());
});

test("refreshed on the child's run change: working, then asking with its wrap-up's buttons; the state's move is one ledger line", async () => {
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  runs[KID] = { busy: true, waiting: 0 };
  items[KID] = [{ kind: "me", text: "go" }, { kind: "you", text: "Working on it." }];
  C.hears({ type: "work.run", sessionId: KID });
  await wait(C.QUIET_MS + 80);
  assert.equal(block()!.state, "working");
  assert.equal(body().run.busy, true);
  runs[KID] = { busy: false, waiting: 0 };
  items[KID].push({ kind: "you", text: "The PR is up. ".repeat(20) + "Shall I merge it?" },
    { id: "wrap:1", kind: "wrap", ask: "Merge it now?", actions: [{ label: "merge", message: "merge it" }, { label: "wait" }] },
    { kind: "tool", name: "Bash", input: { command: "gh pr create --draft --title x" }, out: "https://github.com/o/r/pull/42", ok: true });
  C.hears({ type: "work.run", sessionId: KID, ended: true } as never);
  await wait(C.QUIET_MS + 80);
  const v = body();
  assert.equal(v.last.length, 160, "one line, cut at 160 letters");
  assert.deepEqual(v.ask, { question: "Merge it now?", actions: [{ label: "merge" }, { label: "wait" }] });
  assert.deepEqual(v.where.pr, { n: 42, state: "draft" });
  assert.equal(block()!.state, "waits");
  assert.match(S.ledger(project, block()!.id).map((l) => l.note).join("\n"), /working → done|working → idle/);
  // a session not under anyone: heard, nothing composed
  C.hears({ type: "work.run", sessionId: KID2 });
  await wait(C.QUIET_MS + 80);
  assert.equal(block(KID2), null);
});

test("a press is one turn in the child: steer runs the text, a button sends its wrap-up's message; stop and archive act on it", async () => {
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  items[KID] = [{ kind: "me", text: "go" }, { kind: "you", text: "Merge?" }, { kind: "wrap", ask: "Merge?", actions: [{ label: "merge", message: "merge it, then tell me" }, { label: "wait" }] }];
  const id = block()!.id;
  assert.equal(await C.press(ORCH, { id, press: "steer", text: "use the kit's Pill" }), "sent; it runs as a turn there");
  assert.deepEqual(said, [[KID, "use the kit's Pill"]]);
  await C.press(ORCH, { id, press: "answer", i: 0, label: "merge" });
  await C.press(ORCH, { id, press: "answer", i: 1, label: "wait" });
  assert.deepEqual(said.slice(1), [[KID, "merge it, then tell me"], [KID, "wait"]], "the message, else the button's own words");
  await assert.rejects(() => C.press(ORCH, { id, press: "answer", i: 5, label: "merge" }), /gone/);
  await assert.rejects(() => C.press(ORCH, { id, press: "steer", text: "  " }), /nothing/);
  await assert.rejects(() => C.press(ORCH, { id, press: "merge" }), /one of/);
  assert.equal(said.length, 3, "a refused press sends nothing");
  await C.press(ORCH, { id, press: "stop" });
  assert.deepEqual(stopped, [KID]);
  await C.press(ORCH, { id, press: "archive" });
  assert.deepEqual(archived, [KID]);
  assert.equal(block()!.state, "dead", "archived: off the stage too");
  assert.equal(workState().marks[KID]?.under, undefined, "and under nothing");
});

test("a button press carries the label the face showed: a wrap-up that changed since sends nothing and the block redraws", async () => {
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  items[KID] = [{ kind: "me", text: "go" }, { kind: "you", text: "Merge?" }, { kind: "wrap", ask: "Merge?", actions: [{ label: "merge", message: "merge it" }, { label: "wait" }] }];
  await C.refresh(KID);
  const id = block()!.id;
  assert.deepEqual(body().ask.actions, [{ label: "merge" }, { label: "wait" }]);
  // the child moved on: a new wrap-up, its first button now "delete the branch"
  items[KID].push({ kind: "me", text: "and?" }, { kind: "you", text: "Done. Delete?" }, { kind: "wrap", ask: "Delete?", actions: [{ label: "delete the branch" }, { label: "keep" }] });
  await assert.rejects(() => C.press(ORCH, { id, press: "answer", i: 0, label: "merge" }), /that button is gone/);
  await assert.rejects(() => C.press(ORCH, { id, press: "answer", i: 0 }), /that button is gone/, "no label: no turn");
  assert.deepEqual(said, [], "nothing sent");
  assert.deepEqual(body().ask.actions, [{ label: "delete the branch" }, { label: "keep" }], "the block shows the buttons there are now");
  await C.press(ORCH, { id, press: "answer", i: 0, label: "delete the branch" });
  assert.deepEqual(said, [[KID, "delete the branch"]]);
});

test("a press on a block not on this orchestrator's stage is refused", async () => {
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  const id = block()!.id;
  await one.promote("orch-b");
  await assert.rejects(() => C.press("orch-b", { id, press: "stop" }), /not on this session's stage/);
  assert.deepEqual(stopped, []);
});

test("a child archived anywhere (the side, the sweep, a tool): its block closes and it is under nothing; its parent stays", async () => {
  mark(KID, { under: ORCH, parent: ORCH });
  await C.moved(KID, ORCH, undefined);
  assert.ok(onStage());
  mark(KID, { archived: true });   // the side's work.mark { archived: true }
  await C.archived(KID);
  assert.equal(block()!.state, "dead");
  assert.ok(!onStage());
  assert.equal(workState().marks[KID]?.under, undefined);
  assert.equal(workState().marks[KID]?.parent, ORCH, "the parent stays");
  // archived without the hook (the mark alone): the next refresh closes the block all the same
  mark(KID, { archived: false, under: ORCH });
  await C.moved(KID, ORCH, undefined);
  assert.equal(block()!.state, "live");
  mark(KID, { archived: true });
  assert.equal(await C.refresh(KID), null);
  assert.equal(block()!.state, "dead");
  assert.equal(workState().marks[KID]?.under, undefined);
  // wire.ts: every place that archives goes through the one hook
  const { readFileSync } = await import("node:fs");
  const wire = readFileSync(new URL("../src/work/wire.ts", import.meta.url), "utf8");
  assert.ok(!/mark\([^)]*\{ archived: true \}\)/.test(wire), "no archive marked past the hook");
  assert.match(wire, /patch\?\.archived === true\) void children\.archived/, "the side's archive closes the block");
});

test("a refresh reads the one session, never every session", async () => {
  mark(KID, { under: ORCH });
  await C.moved(KID, ORCH, undefined);
  asked = [];
  await C.refresh(KID);
  assert.deepEqual(asked, [KID]);
});

test("start_session from an orchestrator sets under (and composes its block); from a normal session, nothing", async () => {
  assert.equal(await C.started(ORCH, KID2), true);
  assert.equal(workState().marks[KID2]?.under, ORCH);
  assert.ok(onStage(KID2));
  assert.equal(await C.started(KID, "kid-3"), false);
  assert.equal(workState().marks["kid-3"]?.under, undefined);
});

test("promote: one block per session already under it; demote: they close", async () => {
  await one.demote(ORCH);
  mark(KID, { under: ORCH }); mark(KID2, { under: ORCH });
  one._reload();
  await one.promote(ORCH);
  await C.promoted(ORCH);
  assert.ok(onStage(KID) && onStage(KID2));
  const r = await one.demote(ORCH);
  await C.demoted(ORCH, r.loose);
  assert.equal(block(KID)!.state, "dead");
  assert.equal(block(KID2)!.state, "dead");
});

test("the orchestrator's own compose of a session block is the engine's bound one, found again, never doubled", async () => {
  const refused = await tools.runStageTool("compose", { kind: "session", title: "x", body: JSON.stringify({ sessionId: KID2 }) }, ORCH);
  assert.match(refused.content[0].text, /a session block is for a session this one runs; put it under first/);
  mark(KID2, { under: ORCH });
  const normal = await tools.runStageTool("compose", { kind: "session", title: "x", body: JSON.stringify({ sessionId: KID2 }) }, KID);
  assert.match(normal.content[0].text, /put it under first/, "a normal session composes none");
  const r1 = await tools.runStageTool("compose", { kind: "session", title: "x", body: JSON.stringify({ sessionId: KID2 }) }, ORCH);
  assert.match(r1.content[0].text, /^composed s-kid-2 · the checks · session/);
  const r2 = await tools.runStageTool("compose", { kind: "session", title: "x", body: JSON.stringify({ sessionId: KID2 }) }, ORCH);
  assert.match(r2.content[0].text, /^composed s-kid-2/);
  assert.equal(S.allBlocks(project).filter((b) => b.kind === "session").length, 1);
  const bad = await tools.runStageTool("compose", { kind: "session", title: "x", body: "{}" }, ORCH);
  assert.match(bad.content[0].text, /sessionId/);
});

test("prOf: the PR the child's gh calls name, as they left it", () => {
  const sh = (command: string, out = "", ok = true) => ({ kind: "tool", name: "Bash", input: { command }, out, ok });
  assert.equal(C.prOf([]), undefined);
  assert.deepEqual(C.prOf([sh("gh pr create --title x", "https://github.com/o/r/pull/7")]), { n: 7, state: "open" });
  assert.deepEqual(C.prOf([sh("gh pr create --draft", "https://github.com/o/r/pull/7"), sh("gh pr ready 7")]), { n: 7, state: "ready" });
  assert.deepEqual(C.prOf([sh("gh pr view 7 --json state", '{"state":"MERGED"}')]), { n: 7, state: "merged" });
  assert.equal(C.prOf([sh("gh pr create", "boom", false)]), undefined);
});

// creature.turn (the busy conversation with the latest activity), sent to every face on change and on connect, and an
// ask's words (askTitle, the moment's line in notify.ts). Moved here from the notch's buttons when the notch went (#1584).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addCreatureFace, removeCreatureFace, setRole, sent, askTitle, currentTurn, lifeTurn, update } from "../src/creature.js";
import { addMomentFace, momentFaceIs, runPingTool, _reset as resetPings, _setBanner } from "../src/notify.js";
import { join, _reset as resetBusy } from "../src/busy.js";

type Msg = { type: string; [k: string]: any };
const face = () => { const got: Msg[] = []; return { got, send: (m: object) => got.push(m as Msg) }; };
const tick = () => new Promise((r) => setTimeout(r, 2));

test("an ask's words: the engine's own title wins; no command, no diff", () => {
  assert.equal(askTitle({ tool: "Bash", input: { command: "rm -rf x", description: "clean the build" } }), "Claude wants to run: clean the build");
  assert.ok(!askTitle({ tool: "Bash", input: { command: "rm -rf x", description: "clean the build" } }).includes("rm -rf"));
  assert.equal(askTitle({ tool: "Edit", input: { file_path: "/x/src/App.tsx", old_string: "a", new_string: "b" } }), "Claude wants to edit App.tsx");
  assert.equal(askTitle({ tool: "AskUserQuestion", input: { questions: [] } }), "Claude has a question for you");
  assert.equal(askTitle({ tool: "Bash", title: "Claude wants to run ls", input: {} }), "Claude wants to run ls");
  assert.equal(askTitle({ tool: "mcp__claude_ai_Higgsfield__generate_image", input: {} }), "Claude wants to use generate_image");
  assert.equal(askTitle({ tool: "ExitPlanMode", input: { plan: "x" } }), "Claude has a plan for you");
});

test("creature.turn: the busy session with the latest activity; null when idle", async () => {
  resetBusy(); resetPings();
  const w = face(), p = face();
  addCreatureFace(w, w); setRole(w, "window");
  addCreatureFace(p, p); setRole(p, "phone");
  assert.ok(p.got.some((m) => m.type === "creature.turn" && m.turn === null), "on connect: the turn (none)");
  assert.ok(!p.got.some((m) => m.type === "creature.ask"), "no ask message: it was the notch's");
  assert.equal(currentTurn(), null);

  // a turn starting is activity
  const leaveLife = join("life", "life-1", "codex");
  lifeTurn(w, "life-1", "codex");
  assert.deepEqual(currentTurn(), { seat: "codex", sessionId: "life-1", title: "", kind: "life" });
  await tick();
  const leaveWork = join("work", "work-1", "default");
  assert.equal(currentTurn()?.sessionId, "work-1"); assert.equal(currentTurn()?.kind, "work");
  // a delta on the Life turn's socket makes it the newest again
  await tick();
  sent(w, { type: "delta", text: "hi" });
  assert.equal(currentTurn()?.sessionId, "life-1");
  // a Work step (a work.item from its run) takes it back
  await tick();
  sent(w, { type: "work.item", sessionId: "work-1", item: { id: "t1", kind: "tool" } });
  assert.equal(currentTurn()?.sessionId, "work-1");
  // a tool step on the Life socket
  await tick();
  sent(w, { type: "tool", seat: "codex", id: "s1", kind: "read", text: "reading", done: false });
  assert.equal(currentTurn()?.sessionId, "life-1");
  // a ping in the Work session
  await tick();
  addMomentFace(w); momentFaceIs(w, "window"); _setBanner(() => {});
  await runPingTool("ping", { line: "the sidebar is in" }, { seat: "work", sessionId: "work-1" });
  assert.equal(currentTurn()?.sessionId, "work-1");
  // a call: busy while live, its own kind
  await tick();
  sent(p, { type: "call", state: "live", sessionId: "call-conv" });
  assert.deepEqual(currentTurn(), { seat: "codex", sessionId: "call-conv", title: "", kind: "call" });
  sent(p, { type: "call", state: "ended", sessionId: "call-conv" });
  assert.equal(currentTurn()?.sessionId, "work-1", "the call ended: back to the newest busy one");
  // every face hears each change
  update();
  assert.ok(p.got.some((m) => m.type === "creature.turn" && m.turn?.kind === "call"));
  // a session that is no longer busy is not followed, however recent
  leaveWork();
  assert.equal(currentTurn()?.sessionId, "life-1");
  sent(w, { type: "done", seat: "codex", ok: true });
  leaveLife();
  assert.equal(currentTurn(), null);
  update();
  const last = [...p.got].reverse().find((m) => m.type === "creature.turn");
  assert.equal(last?.turn, null, "idle: null goes out");
  removeCreatureFace(w); removeCreatureFace(p);
});

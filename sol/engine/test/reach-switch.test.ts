// Reach behind two switches (#1276): the tools that ask a teammate's agent or hand work over (reach.tools), and the
// Agents' room (reach.room), each off unless its person turns it on, env first. Off: not offered to a seat, refused by
// name, and no hand-over line in a new session's opening. The settings file is the test's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sol-reach-switch-"));
process.env.SOL_SETTINGS = join(dir, "settings.json");
delete process.env.SOL_REACH_TOOLS; delete process.env.SOL_REACH_ROOM;
const { patchSettings, reachTools, reachRoom, getSettings } = await import("../src/settings.ts");
const { seatTools, solToolsNow, SOL_TOOLS, runSolTool } = await import("../src/tools.ts");
const { startReach, heard, reachOpening } = await import("../src/team/reach.ts");

const ASKING = ["ask_agent", "hand_over", "ask_turn_on", "offer_take", "hand_reply", "answer_ask"];   // the tools reach.tools turns on (ask_turn_on: #1504)
const names = () => seatTools().map((t) => t.name);
const text = (r: { content: { text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");

test("off by default: no reach tool offered, each refused by name with how to turn it on, nothing written", async () => {
  assert.equal(reachTools(), false); assert.equal(reachRoom(), false);
  assert.equal(getSettings().reach, undefined, "an untouched file says nothing of reach");
  for (const n of [...ASKING, "agents_room"]) {
    assert.ok(SOL_TOOLS.some((t) => t.name === n), `${n} is still Sol's, routed by name`);
    assert.ok(!names().includes(n), `${n} not offered`);
  }
  const r = await runSolTool("ask_agent", { to: "someone", question: "which release?" });
  assert.ok((r as any).isError); assert.match(text(r as any), /off on this Sol.*reach\.tools/);
  const room = await runSolTool("agents_room", { show: true });
  assert.ok((room as any).isError); assert.match(text(room as any), /Agents' room is off.*reach\.room/);
});

test("#1726 answer_ask comes with answering, the same yes, while reach.tools stays off; nothing else of reach does", () => {
  const was = process.env.SOL_REACH;
  process.env.SOL_REACH = "on";   // answering on, as the yes to "<group>'s agents may ask mine" turns it on
  try {
    assert.equal(reachTools(), false);
    assert.deepEqual(names().filter((n) => ASKING.includes(n) || n === "agents_room"), ["answer_ask"]);
  } finally { if (was === undefined) delete process.env.SOL_REACH; else process.env.SOL_REACH = was; }
  assert.ok(!names().includes("answer_ask"), "off again with answering");
});

test("each switch alone: reach.tools brings the asking tools, reach.room the room; env first, read each turn", () => {
  patchSettings({ reach: { tools: true } });
  assert.deepEqual(names().filter((n) => ASKING.includes(n) || n === "agents_room"), ASKING);
  patchSettings({ reach: { room: true } });
  assert.deepEqual(getSettings().reach, { tools: true, room: true }, "a patch of one keeps the other");
  assert.ok(names().includes("agents_room"));
  process.env.SOL_REACH_TOOLS = "off";
  try { assert.ok(!names().some((n) => ASKING.includes(n)), "the env wins over the setting"); } finally { delete process.env.SOL_REACH_TOOLS; }
  patchSettings({ reach: { tools: false, room: false } });
  assert.deepEqual(solToolsNow().map((t) => t.name), SOL_TOOLS.map((t) => t.name).filter((n) => !ASKING.includes(n) && n !== "agents_room"));
});

test("a hand-over waiting on me opens a new session only with reach.tools on", () => {
  startReach({
    me: () => "frank", team: () => ["marco", "frank"], send: () => true, say: async () => {}, give: () => {}, name: () => {},
    working: () => false, lastWords: async () => "", state: async () => "", file: async () => "",
    file_: join(dir, "reach.json"), room: join(dir, "reach", "room.md"), home: join(dir, "reach", "work"),
  } as any);
  heard({ type: "hand", id: "hand00042", to: "frank", what: "the hub's copy", why: "yours", from: { login: "marco", agent: true }, at: Date.now() });
  assert.equal(reachOpening(), "", "off: the opening says nothing of it");
  process.env.SOL_REACH_TOOLS = "on";
  try { assert.match(reachOpening(), /hand00042: marco hands you/); } finally { delete process.env.SOL_REACH_TOOLS; }
});

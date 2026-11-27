// Gate one q6 on the card product/cowork/room (#1740): the Agents' room has its own switch, reach.room, and it governs
// the whole card, not only the agents_room tool. The engine sends the window its reading (settings.ts readings) so the
// room's page and its ways in follow it, and the press on a block (compose and update's `asks`) is offered only while
// it stands on. Where the card's station stands decides who gets it: moved to complete, a complete-mode Sol reads on.
// All in a home and a settings file of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP = mkdtempSync(join(tmpdir(), "sol-room-switch-"));
const HOME = join(TMP, "home"), REPO = join(TMP, "repo");
mkdirSync(join(REPO, ".git"), { recursive: true });
const TEAM = join(TMP, "team.json");
writeFileSync(TEAM, JSON.stringify({ me: { login: "tester", name: "T" }, repos: [] }));
process.env.SOL_HOME = HOME;
process.env.SOL_TEAM = TEAM;
process.env.SOL_TEAM_OFFLINE = "1";
process.env.SOL_SETTINGS = join(TMP, "settings.json");
delete process.env.SOL_REACH_ROOM;
delete process.env.SOL_VERSION;

const V = await import("../src/versions.ts");
const S = await import("../src/settings.ts");
const B = await import("../src/work/blocks.ts");
const tools = await import("../src/work/tools.ts");
B.setStageBus(() => {});
B.setStageFinder(async (id) => ({ cwd: REPO, by: `agent · ${id.slice(5, 9)}` }));
const project = B.projectOf(REPO);
const tool = (n: string) => tools.WORK_TOOLS.find((t) => t.name === n) as { description: string; shape: Record<string, unknown> };
const text = (r: { content: { text: string }[] }) => r.content[0].text;
const table = V.STAGES as Record<string, string>;
const was = table["reach.room"];
after(() => { table["reach.room"] = was; delete process.env.SOL_REACH_ROOM; delete process.env.SOL_VERSION; B.disarmAll(); B.setStageBus(null); rmSync(TMP, { recursive: true, force: true }); });

test("q6: moved to complete, the card reaches a complete-mode Sol and still not a tester's (product)", () => {
  table["reach.room"] = "complete";
  try {
    process.env.SOL_VERSION = "complete";
    assert.equal(S.reachRoom(), true, "complete: on");
    assert.deepEqual(S.readings().reach, { room: true }, "and the window's room page with it");
    process.env.SOL_VERSION = "product";
    assert.equal(S.reachRoom(), false, "product: not yet");
    assert.equal(S.readings().reach, undefined);
  } finally { table["reach.room"] = was; }
});

test("q6: the window is sent reach.room's reading wherever it differs from the bare setting, by mode, env and hand", () => {
  const at = table["reach.room"];
  assert.equal(at, "product", "the card stands at product today (stations.json, #1786)");
  // read as it stood at complete, so product reads off with nothing set: the window is sent only what differs
  table["reach.room"] = "complete";
  process.env.SOL_VERSION = "concept";
  assert.deepEqual(S.readings().reach, { room: true }, "concept: on, and the window hears it");
  process.env.SOL_VERSION = "product";
  assert.equal(S.readings().reach, undefined, "product: off, as the bare setting is; nothing added, the window reads off");
  S.patchSettings({ reach: { room: true } });
  assert.equal(S.reachRoom(), true);
  assert.equal(S.readings().reach, undefined, "set on by hand: the setting itself says it (the face reads settings.reach.room)");
  S.patchSettings({ reach: { room: false } });
  process.env.SOL_VERSION = "concept";
  assert.equal(S.reachRoom(), false, "set off by hand wins over the station");
  assert.equal(S.readings().reach, undefined, "and the window reads that off");
  process.env.SOL_REACH_ROOM = "on";
  assert.deepEqual(S.readings().reach, { room: true }, "the env before the setting, sent as the engine reads it");
  delete process.env.SOL_REACH_ROOM;
  // a person's false stays theirs (a null patch never takes it away): the last test here, so the others read the station
  table["reach.room"] = at;
});

test("q6: the press on a block comes and goes with reach.room: compose and update offer asks only while it is on", async () => {
  process.env.SOL_REACH_ROOM = "off";
  for (const n of ["compose", "update"]) {
    assert.equal("asks" in tool(n).shape, false, `${n}: no asks while off`);
    assert.doesNotMatch(tool(n).description, /puts a press/, `${n}: its words say no press while off`);
  }
  const off = text(await tools.runWorkTool("compose", { kind: "card", title: "ship it?", body: "a line", asks: { q: "ship it?" } }, "sess-room0001") as never);
  assert.match(off, /no press on it: the press on a block is off/, "an asks sent anyway makes no press and says so");
  const made = B.allBlocks(project).find((b) => b.title === "ship it?");
  assert.ok(made, "the block is made");
  assert.equal(made!.asks, undefined, "with no press");
  process.env.SOL_REACH_ROOM = "on";
  for (const n of ["compose", "update"]) {
    assert.equal("asks" in tool(n).shape, true, `${n}: asks while on`);
    assert.match(tool(n).description, /puts a press/);
  }
  const on = text(await tools.runWorkTool("compose", { kind: "card", title: "merge it?", body: "a line", asks: { q: "merge it?" } }, "sess-room0001") as never);
  assert.match(on, /it asks "merge it\?"/, "on: the press is at its foot");
  assert.equal(B.allBlocks(project).find((b) => b.title === "merge it?")?.asks?.q, "merge it?");
  delete process.env.SOL_REACH_ROOM;
});

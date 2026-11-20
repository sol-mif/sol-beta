// Agents' switch reaches the engine (#18, gate one question 6 for product/agents, src/agent/switch.ts): with agents.mode
// off the clock skips nothing the keeper held, a folder agent's thread is a chat again, and the word is kept across a
// restart; on puts back what was held, which was never thrown away. No Codex, no network: a turn is a stand-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agents } from "../src/agent/index.ts";
import { list, rest, loadAgents } from "../src/agent/agents.ts";
import { agentsOn, agentsSaid, setAgentsOn } from "../src/agent/switch.ts";
import { solsOwn, AGENT_OPENING, SOL_INTERNAL } from "../src/threads.ts";

test("off: the clock runs a rule the keeper held, and the hold is kept for on; on: it is skipped again", async () => {
  const home = mkdtempSync(join(tmpdir(), "sol-agents-switch-"));
  const f = join(home, "studio", "kiln");
  mkdirSync(f, { recursive: true });
  const POLICY = "- [watch] clock: 19:30 the firing log from kiln.csv into log.md\n- [watch] clock: 19:30 the notes from log.md into a list in tomorrow.md\n- [watch] clock: 19:30 the glaze list from glazes.md into glazes-today.md\n";
  writeFileSync(join(f, "policy.md"), POLICY);
  let ran: string[] = [];
  let at = new Date(2026, 10, 10, 19, 31).getTime();
  const a = new Agents({ home, now: () => at, ask: async () => null, turn: async (_f, r) => { ran.push(r.id); return { report: "ready", said: "ok", thread: null, ms: 0 }; } });
  const first = list(a).agents.find((x) => x.rules.some((r) => r.rule === "clock-1"))!;
  assert.equal(rest(a, first.id, true).ok, true);

  assert.equal(agentsSaid(home), undefined, "no word yet: on, as before");
  setAgentsOn(home, false);
  assert.equal(agentsOn(home), false);
  await a.tick(new Date(at));
  assert.deepEqual(ran.sort(), ["clock-1", "clock-2", "clock-3"], "off: nothing is skipped");
  assert.ok((loadAgents(home)?.held ?? []).length > 0, "the holds stay for when it is on again");
  assert.equal(JSON.parse(readFileSync(join(home, "agents-switch.json"), "utf8")).on, false, "kept across a restart");

  setAgentsOn(home, true);
  ran = [];
  at = new Date(2026, 10, 11, 19, 31).getTime();
  await a.tick(new Date(at));
  assert.deepEqual(ran, ["clock-3"], "on: the held ones are skipped again");
  assert.equal(readFileSync(join(f, "policy.md"), "utf8"), POLICY);
});

test("a folder agent's thread is a chat only while agents is off; Sol's other own turns never are", () => {
  const agentThread = { originator: SOL_INTERNAL, title: `${AGENT_OPENING}kiln (studio/kiln). You live here.` };
  const naming = { originator: SOL_INTERNAL, title: "Name these three agents" };
  const mine = { originator: "codex_sdk_ts", title: "fix the oven chart" };
  assert.equal(solsOwn(agentThread, true), true);
  assert.equal(solsOwn(agentThread, false), false);
  assert.equal(solsOwn(naming, false), true);
  assert.equal(solsOwn(mine, true), false);
});

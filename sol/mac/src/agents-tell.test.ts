// node --test src/agents-tell.test.ts: the window says its agents.mode to the engine (#1702, agents/tell.ts): once at
// once, then only when the switch turns, so turning it off in Settings stops the engine's keeper right away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tellAgents, agentsSwitchMsg } from "./agents/tell.ts";

test("said at once, then at each turn, never twice the same", () => {
  let on = true;
  const subs = new Set<() => void>(), sent: object[] = [];
  const turn = (v: boolean) => { on = v; subs.forEach((f) => f()); };
  const stop = tellAgents((m) => sent.push(m), () => on, (f) => { subs.add(f); return () => { subs.delete(f); }; });
  assert.deepEqual(sent, [{ type: "agents.switch", on: true }]);
  turn(false);
  turn(false);
  turn(true);
  assert.deepEqual(sent.slice(1), [agentsSwitchMsg(false), agentsSwitchMsg(true)]);
  stop();
  turn(false);
  assert.equal(sent.length, 3, "stopped: nothing more is said");
});

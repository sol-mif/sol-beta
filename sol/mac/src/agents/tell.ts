// The window tells the engine its agents.mode (#1702, gate one question 4 for product/agents): the switch is this
// window's (flag.ts), but the keeper and the meta run in the engine (engine agent/switch.ts), so every turn of the
// switch, and every time the link comes up, says it: `agents.switch { on }`. Off, the engine rests them at once.
export const agentsSwitchMsg = (on: boolean) => ({ type: "agents.switch", on });

/** say the switch now and at each turn of it (get and sub: flag.ts agentsOn and subAgents); the answer stops listening */
export function tellAgents(send: (m: object) => unknown, get: () => boolean, sub: (f: () => void) => () => void): () => void {
  let was = get();
  send(agentsSwitchMsg(was));
  return sub(() => { const v = get(); if (v === was) return; was = v; send(agentsSwitchMsg(v)); });
}

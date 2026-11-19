// Agents' row in Settings' switches drawer (#1327): the switch agents.mode, off by default. On, Home's side gains a
// place, agents, and each folder and open sticky shows the jelly of the agent that does it; off, Home as before.
// The spine keeps its four views (Marco 2026-11-18: Agents goes inside Home).
import { Switch, useShell } from "../settingsShell";
import { setAgentsOn, useAgentsOn } from "./flag";

export function AgentsRow() {
  const sh = useShell();
  const on = useAgentsOn();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>agents</span><small>a place in Home: the agents that do your repeating work, who is on what, and what Sol changed</small></div>
        <Switch on={on} set={setAgentsOn} label="agents" />
      </div>
    </div>
  );
}

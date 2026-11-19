// Agents mode's switch (#1327): `agents.mode`, a build switch (flag.ts), off by default; on in Marco's own window
// (MINE_ON); `?agents.mode=on` on the page's link for one load (the stills). Off, the spine draws four views as before
// and nothing here asks the engine.
import { useSyncExternalStore } from "react";
import { buildSwitch } from "../flag";

export const AGENTS_MODE = "agents.mode";
const sw = buildSwitch(AGENTS_MODE);
export const agentsOn = () => sw.get();
export const setAgentsOn = (v: boolean) => sw.set(v);
export const subAgents = (f: () => void) => sw.sub(f);
export const useAgentsOn = () => useSyncExternalStore(sw.sub, sw.get);

/** Home's press on an agent's jelly (its desk) or on a job's "again?" (the offer): the window turns to Agents there
 *  (App.tsx hears it; AgentsView reads where from AGENT_AT) */
export const OPEN_AGENT = "sol:agents-open";
export const AGENT_AT = "sol.agents.at";
function open(at: { k: "desk" | "offer"; id: string }) {
  try { sessionStorage.setItem(AGENT_AT, JSON.stringify(at)); } catch { /* private: the event still carries it */ }
  window.dispatchEvent(new CustomEvent(OPEN_AGENT, { detail: at.id }));
}
export const openAgent = (id: string) => open({ k: "desk", id });
export const openOffer = (id: string) => open({ k: "offer", id });

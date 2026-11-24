// Agents mode's switch (#1327): `agents.mode`, a card's switch on the window's side (product/agents). It reads what the
// engine says of it (#18, gate one question 2), the way the spine's views do (spine/views.ts): where the card's station
// stands in this Sol's mode, or what the person set (engine settings.ts readings → settings.window), so moving the card
// to complete turns it on in a complete Sol with no new window. In order:
//   the link   `?agents.mode=on|off` wins for one load (the stills)
//   storage    "1" or "0" under its name: its row in Settings, or the developer's door
//   engine     settings.window["agents.mode"], once the engine has said it; kept in this window (`sol.agents`) so the
//              next load draws the same before the engine answers
//   neither    before the engine ever said: on where this Sol runs as concept (flag.ts VERSION_KEY), else off, the rule
//              it read by before (#1427)
// Off, the spine draws four views as before and nothing here asks the engine.
import { useSyncExternalStore } from "react";
import { buildSwitch, VERSION_KEY } from "../flag.ts";

export const AGENTS_MODE = "agents.mode";
export const AGENTS_KEPT = "sol.agents";
type Kv = Pick<Storage, "getItem"> | null;
type KvW = Pick<Storage, "getItem" | "setItem"> | null;

/** what the engine's settings say of agents.mode (pure): a boolean once it said, else undefined (no settings yet, its
 *  first moment, window: null, or an engine that sends no reading for it) */
export function agentsSaidOf(settings: { window?: unknown } | null | undefined): boolean | undefined {
  const w = settings?.window;
  if (!w || typeof w !== "object" || Array.isArray(w)) return undefined;
  const v = (w as Record<string, unknown>)[AGENTS_MODE];
  return typeof v === "boolean" ? v : undefined;
}

/** agents.mode in this window (pure): the link, else storage, else what the engine said, else what this window kept
 *  from the engine, else on only where this Sol runs as concept */
export function agentsReading(said: boolean | undefined, search: string, kv: Kv): boolean {
  const l = new URLSearchParams(search).get(AGENTS_MODE);
  if (l === "on" || l === "off") return l === "on";
  const get = (k: string) => { try { return kv?.getItem(k) ?? null; } catch { return null; } };
  const s = get(AGENTS_MODE);
  if (s === "1" || s === "0") return s === "1";
  if (typeof said === "boolean") return said;
  const kept = get(AGENTS_KEPT);
  if (kept === "1" || kept === "0") return kept === "1";
  return get(VERSION_KEY) === "concept";
}

const storageOf = (): KvW => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const searchOf = () => (typeof location === "undefined" ? "" : location.search);

// the link and storage half, and the Settings row's set (flag.ts); another window's change is heard below, since this
// half alone stays off untouched and so would not turn when that window's row says off
const sw = buildSwitch(AGENTS_MODE);
let said: boolean | undefined;
let on = agentsReading(said, searchOf(), storageOf());
const subs = new Set<() => void>();
const again = () => { const v = agentsReading(said, searchOf(), storageOf()); if (v !== on) { on = v; subs.forEach((f) => f()); } };
sw.sub(again);
if (typeof window !== "undefined" && typeof window.addEventListener === "function")
  window.addEventListener("storage", (e) => { if (e.key === null || e.key === AGENTS_MODE || e.key === AGENTS_KEPT || e.key === VERSION_KEY) again(); });

/** the engine sent its settings (useEngine): its word on agents.mode is read at once and kept for the next load */
export function noteAgentsSaid(settings: { window?: unknown } | null | undefined, kv: KvW = storageOf()): void {
  const v = agentsSaidOf(settings);
  if (v === undefined) return;
  said = v;
  try { kv?.setItem(AGENTS_KEPT, v ? "1" : "0"); } catch { /* private */ }
  again();
}

export const agentsOn = () => on;
export const setAgentsOn = (v: boolean) => sw.set(v);
export const subAgents = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useAgentsOn = () => useSyncExternalStore(subAgents, agentsOn);

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

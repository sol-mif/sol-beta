// Agents' switch reaches the engine (ticket #18, gate one question 6 for product/agents): agents.mode is the window's
// switch, but the keeper (agents.ts keep), the meta's ticks and the hiding of a folder agent's own chats run in the
// engine. The window's word is kept here, `<home>/agents-switch.json` { on }, across restarts (agents.switch,
// parts/agents.ts). Off: the keeper and the meta do nothing, the clock skips nothing the keeper held (the holds stay in
// agents.json for when it is on again), and a folder agent's runs are chats in the list again, as before Agents. With no
// word yet, on: as before this file, where nothing happens until the Agents view made agents.json.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let homeDir: string | null = null;
const fileOf = (home: string) => join(home, "agents-switch.json");

/** the engine's one set of folder agents says where it lives (index.ts Agents) */
export function bindAgentsSwitch(home: string): void { homeDir = home; }

/** the window's last word, or undefined when none was said (read each time: it is one small file) */
export function agentsSaid(home: string | null = homeDir): boolean | undefined {
  if (!home) return undefined;
  try { const v = JSON.parse(readFileSync(fileOf(home), "utf8"))?.on; return typeof v === "boolean" ? v : undefined; } catch { return undefined; }
}
/** whether Agents runs: the window's word, else on */
export const agentsOn = (home: string | null = homeDir): boolean => agentsSaid(home) ?? true;

/** the window said its agents.mode: kept */
export function setAgentsOn(home: string, on: boolean): void {
  if (agentsSaid(home) === on) return;
  const f = fileOf(home), tmp = f + ".tmp";
  writeFileSync(tmp, JSON.stringify({ on }) + "\n");
  renameSync(tmp, f);
}

// A read turn through the person's Claude account (moved from index.ts, #1146). index.ts wraps a `read: true` say's
// canUseTool in connectorsGuard; parts/connectors.ts answers the face's "connectors" message with connectedServices.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { query, type CanUseTool, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

// A read through the person's Claude account (Home's first read, scratch/sol/onb/path.md): the services connected there
// (the CLI loads them as source "claudeai") are refused on every turn by Home's canUseTool; a say with `read: true` may
// use their list and read tools, never one that sends, writes or deletes (refused by name). SOL_CONNECTORS names a JSON
// file of stand-in MCP servers treated as connected services, for tests (test/connectors-read.test.ts).
const WRITES = /(^|_)(send|create|update|delete|remove|write|edit|modify|post|reply|forward|draft|move|archive|trash|share|upload|insert|patch|put|add|set|mark|label|invite|cancel|accept|decline|publish|deploy|generate|run|execute|batch|copy|rename|import|export|merge|close|comment|react|schedule|book|pay|buy|purchase|transfer|subscribe|unsubscribe)(_|$)/i;
const READS = /(^|_)(list|get|read|search|query|find|fetch|view|describe|show|lookup|whoami|count|status|info)(_|$)/i;
export const readOnlyTool = (name: string, readOnly?: boolean) => !WRITES.test(name) && (readOnly === true || READS.test(name));
export function standIns(): Record<string, McpServerConfig> {
  try { return process.env.SOL_CONNECTORS ? JSON.parse(readFileSync(process.env.SOL_CONNECTORS, "utf8")) : {}; } catch { return {}; }
}
/** a service's key in a tool's name: `mcp__<key>__<tool>` (the account's own come as "claude.ai <name>") */
export const serverKey = (server: string) => server.replace(/[^A-Za-z0-9_-]/g, "_");
/** the services the person said "not here" to by name (#1229, Settings › home): the consent's `sources`, `account:<name>`
 *  "no" (the face's onboard/connections.ts writes it), as the keys their tools carry; read once at a read turn's start */
export function servicesOff(home: string): Set<string> {
  const off = new Set<string>();
  try {
    const said = JSON.parse(readFileSync(join(home, ".sol", "record", "me.json"), "utf8"))?.consent?.sources ?? {};
    for (const [k, v] of Object.entries(said)) {
      const m = /^account:(.+)$/.exec(k);
      if (m && v === "no") { off.add(serverKey(m[1])); off.add(serverKey(`claude.ai ${m[1]}`)); }
    }
  } catch { /* no record, or one that will not read: nothing is off by name here */ }
  return off;
}
/** Home's check, and for a connected service's tool: allowed only when it lists or reads (`ro`: its readOnly hints), and
 *  never for a service the person said "not here" to (`off`, servicesOff) */
export function connectorsGuard(base: CanUseTool, ro: Map<string, boolean>, off: Set<string> = new Set()): CanUseTool {
  return async (name, input, o) => {
    const m = /^mcp__(.+?)__(.+)$/.exec(name);
    if (!m || m[1] === "sol") return base(name, input, o);
    if (off.has(m[1])) return { behavior: "deny", message: `refused: ${m[2]}. The person said "not here" to ${m[1].replace(/^claude_ai_/, "")} (their record, ~/.sol/record/me.json, consent.sources); they turn it back on in Settings › home.` };
    return readOnlyTool(m[2], ro.get(name)) ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: `${m[2]} sends, writes or deletes; a read only lists and reads.` };
  };
}
export const toolKey = (server: string, t: string) => `mcp__${server.replace(/[^A-Za-z0-9_-]/g, "_")}__${t}`;
/** the services connected in the person's Claude account (and the stand-ins), each with the tools a read may use and,
 *  when it failed, what it said (the face tells "lapsed" from "blocked by your organisation" by it, #1229). Kept a
 *  minute; `fresh` asks again now (Settings › home after a renew, so the row says what is true) */
let connected: { at: number; list: object[] } | null = null;
export async function connectedServices(HOME: string, fresh = false) {
  if (!fresh && connected && Date.now() - connected.at < 60_000) return connected.list;
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r)), more = standIns();
  const q = query({ prompt: (async function* () { await hold; })(), options: { cwd: HOME, settingSources: ["project"], tools: [], mcpServers: more } });
  try {
    let s = await q.mcpServerStatus();
    for (let i = 0; i < 20 && s.some((x) => x.status === "pending"); i++) { await new Promise((r) => setTimeout(r, 500)); s = await q.mcpServerStatus(); }
    const list = s.filter((x) => x.source === "claudeai" || x.name in more).map((x) => ({
      name: x.name.replace(/^claude\.ai /, ""), server: x.name, status: x.status, ...(x.error ? { error: String(x.error).split("\n")[0].slice(0, 300) } : {}),
      read: (x.tools ?? []).filter((t) => readOnlyTool(t.name, t.annotations?.readOnly)).map((t) => t.name),
      refused: (x.tools ?? []).filter((t) => !readOnlyTool(t.name, t.annotations?.readOnly)).map((t) => t.name),
    }));
    connected = { at: Date.now(), list };
    return list;
  } finally { release(); q.close(); }
}

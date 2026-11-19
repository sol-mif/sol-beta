// A tiny MCP server over stdio, started by the Codex CLI. It owns no browser and no desk: every tool call
// (browser_* and desk_*) is passed to the engine (POST /tool), so there is one Chromium and one desk, owned
// by the engine process. The engine routes by tool name; /browser stays as an alias for one round.
// Needs ENGINE_URL, e.g. http://127.0.0.1:7777; SOL_KERNEL=on when the engine has its kernel (the frame on)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { solToolsNow } from "./tools.js";
import { INSTALL_TOOLS } from "./install.js";

const engine = process.env.ENGINE_URL ?? "http://127.0.0.1:7777";
const server = new McpServer({ name: "sol", version: "1.0.0" });

// with the frame on (#633), the tools the home's blocks registered, as the engine lists them when this server starts
type Arg = "string" | "number" | "boolean";
let blocks: { name: string; description: string; args: Record<string, Arg> }[] = [];
try { blocks = ((await (await fetch(`${engine}/things/tools`)).json()) as { tools?: typeof blocks }).tools ?? []; } catch { /* an older engine, or none */ }
// the install tool only when the engine has its kernel (the frame on): the engine says so as it starts this server
// (SOL_KERNEL, index.ts codexFor), so with the frame off nothing here asks the engine about its log (#1270)
const frame = process.env.SOL_KERNEL === "on";
const shapeOf = (a: Record<string, Arg>) => Object.fromEntries(Object.entries(a ?? {}).map(([k, v]) => [k, v === "number" ? z.number() : v === "boolean" ? z.boolean() : z.string()]));

for (const t of [...solToolsNow(), ...(frame ? INSTALL_TOOLS : []), ...blocks.map((b) => ({ name: b.name, description: b.description, shape: shapeOf(b.args) }))]) {
  server.tool(t.name, t.description, t.shape, async (args: any) => {
    try {
      const r = await fetch(`${engine}/tool`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: t.name, args, turn: process.env.SOL_TURN }),
      });
      return (await r.json()) as any;
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Engine not reachable: ${String(err)}` }], isError: true };
    }
  });
}

await server.connect(new StdioServerTransport());

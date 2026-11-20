// The one turn that reads a sticky's words for the trust gate (reachRead.ts holds everything around it): the cheapest
// Claude the person's list offers, nothing in its hands (no tool, none of their servers, settings, hooks or CLAUDE.md),
// in no project, nothing kept. The words go where the folder's agent sends them anyway when it runs. The log line is a
// kind and a time, never a word of the sticky.
import { tmpdir } from "node:os";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { cheapest } from "../../models.js";
import { SYSTEM, promptOf } from "./reachRead.js";

/** how long a press waits for the reading before it goes on as if there were no model */
export const READ_MS = 12_000;

/** the answer's text, or null when no model answered in time (the gate then stands on its floor) */
export async function reachTurn(words: string): Promise<string | null> {
  const model = cheapest();
  if (!model) return null;
  const ac = new AbortController(), t0 = Date.now();
  const stop = setTimeout(() => ac.abort(), READ_MS);
  try {
    const q = query({
      prompt: promptOf(words),
      options: {
        model, systemPrompt: SYSTEM, thinking: { type: "disabled" }, maxTurns: 1, cwd: tmpdir(), abortController: ac,
        tools: [], mcpServers: {}, strictMcpConfig: true, settingSources: [], permissionMode: "dontAsk", persistSession: false,
        canUseTool: async () => ({ behavior: "deny", message: "this reading uses nothing" }),
      } satisfies Options,
    });
    for await (const m of q as AsyncIterable<SDKMessage>) {
      if (m.type !== "result") continue;
      return m.subtype === "success" && !m.is_error ? m.result ?? "" : null;
    }
    return null;
  } catch (err) {
    console.log(`agent.reach: not read after ${Date.now() - t0} ms: ${err instanceof Error ? err.name : typeof err}`);
    return null;
  } finally { clearTimeout(stop); }
}

// Agents' meta (#1327, pass 2): the whole Sol turn the offer and a rehearsal ask, through the engine's own way of running
// a turn (run.ts: Codex with the sol MCP tools), started in the home, read-only, no network: it reads and answers in
// words, it writes nothing. A test hands in its own (Host.d.say). Never throws: a turn that fails is null. It is Sol's
// own turn, not the person's: run `internal`, so its rollout is marked and it never shows among their chats.
import { randomUUID } from "node:crypto";
import type { RunDeps } from "../run.js";
import type { Say } from "../agents.js";

export function codexSay(deps: RunDeps, home: string): Say {
  return async (prompt) => {
    const token = randomUUID();
    // it only reads: every tool that would reach past the home is refused
    deps.turns.set(token, { sessionId: "agent:meta", seat: "codex", refuse: (tool) => `${tool} is refused: this turn only reads and answers in words` });
    try {
      const thread = deps.codexFor(token, { internal: true }).startThread({ workingDirectory: home, skipGitRepoCheck: true, sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: false, ...(deps.model ? { model: deps.model } : {}) });
      const r = await thread.run(prompt);
      return r.finalResponse ?? null;
    } catch { return null; } finally { deps.turns.delete(token); }
  };
}

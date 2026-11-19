// a fake SDK query for a Run: it reads the run's inbox like the CLI does and answers each message with a turn
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const T = mkdtempSync(join(tmpdir(), "n10-runs-"));
Object.assign(process.env, { HOME: T, SOL_STATE: join(T, "work.json"), SOL_HOME: join(T, "home"), SOL_SESSIONS_DIR: join(T, "sessions"), SOL_TEAM: join(T, "team.json"), SOL_TEAM_OFFLINE: "1" });
process.on("exit", () => rmSync(T, { recursive: true, force: true }));   // nothing left in the temp folder
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type Out = { push: (m: any) => void; end: () => void };
/** a query whose output the test drives; `got` is every user message the "CLI" read from the inbox */
export function fakeQuery(inbox: AsyncIterable<any>, opts: { auto?: boolean; shutdownMs?: number; setModel?: () => Promise<void> } = {}) {
  const got: any[] = [];
  const out: any[] = []; let wake: (() => void) | null = null; let ended = false;
  const push = (m: any) => { out.push(m); wake?.(); };
  const end = () => { ended = true; wake?.(); };
  // the CLI's reader: every message read; with auto, each one is a turn (assistant, then result)
  void (async () => {
    for await (const m of inbox) {
      got.push(m);
      if (opts.auto) { push({ type: "assistant", parent_tool_use_id: null, message: { id: "m" + got.length, content: [{ type: "text", text: "ok" }] } }); push({ type: "result", subtype: "success", uuid: "r" + got.length }); }
    }
    await wait(opts.shutdownMs ?? 30); end();   // the input ended: the CLI shuts down, then its output ends
  })();
  const q: any = {
    got, push, end,
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (out.length) { yield out.shift(); continue; }
        if (ended) return;
        await new Promise<void>((r) => (wake = r)); wake = null;
      }
    },
    interrupt: async () => {}, setModel: opts.setModel ?? (async () => {}), setPermissionMode: async () => {}, applyFlagSettings: async () => {},
    getContextUsage: async () => { throw new Error("no"); },
  };
  return q;
}

// A seat's own steps on the log (the log's step 1, 2026-11): what happened, never what was said. Four kinds (their rows
// are in contract/kinds.ts), each by { person: "seat", agent: <seat> } with the conversation's id in the value and in
// the event's ctx.session (kernel.ts seat()):
//   seat.turn   a turn began: { session, model?, mode? }
//   seat.done   it ended: { session, ok, turns?, tokens?: { in, out, cacheRead?, cacheWrite? }, tokensTotal?, costTotal? }
//          tokens: this turn's, the main thread only, as Claude's SDK reports them on the result; tokensTotal: the thread's
//          running total, as Codex reports it (it only grows); costTotal: the session's running total in USD as Claude's
//          SDK estimates it (cumulative, and a resumed session starts from what its transcript saved: read the latest, or
//          take the difference, never sum)
//   seat.step   a tool it used: { session, tool, file?, bytes?, ok?, agent? }   file: the one it named; bytes: what came back;
//          agent: a background agent's own step. A block's tool (thing_<id>_<name>) is not here: the kernel logs that
//          step (tool.call)
//   seat.sent   a thing Sol itself handed to the seat: { session, what: "attachment" | "desk" | "mention" | "stage", name?, bytes? }
//          stage: the paragraph under a Work message that says what the person pointed at on the stage (work/blocks.ts askLine)
// Nothing here runs with the frame off (kernelNow() is null then): no log, no line, no reading of the message. A line
// that cannot be written is said on the engine's output; it never ends a seat's turn. The callers are index.ts (Home's
// two seats) and work/runs.ts (Work). What a seat loads on its own (CLAUDE.md, skills, its memory) is not seen here:
// the design's known gap.
import { kernelNow, type SeatKind, type SeatName, type Tokens } from "./kernel.js";
export { SEAT_KINDS as KINDS } from "./contract/kinds.js";   // the seats' four kinds on the log

function line(kind: SeatKind, seat: SeatName, value: Record<string, unknown>): void {
  const k = kernelNow();
  if (!k) return;
  try { k.seat(kind, seat, value); } catch (err) { console.error("the log:", err instanceof Error ? err.message : String(err)); }
}
export const turnStarted = (seat: SeatName, session: string, model?: string, mode?: string) =>
  line("seat.turn", seat, { session, ...(model ? { model } : {}), ...(mode ? { mode } : {}) });
export const turnEnded = (seat: SeatName, session: string, o: { ok: boolean; turns?: number; tokens?: Tokens | null; tokensTotal?: Tokens | null; costTotal?: number | null }) =>
  line("seat.done", seat, { session, ok: o.ok, ...(o.turns !== undefined ? { turns: o.turns } : {}), ...(o.tokens ? { tokens: o.tokens } : {}), ...(o.tokensTotal ? { tokensTotal: o.tokensTotal } : {}), ...(typeof o.costTotal === "number" ? { costTotal: o.costTotal } : {}) });
const BLOCK_TOOL = /^(mcp__sol__|sol:)?thing_/;
export const stepTaken = (seat: SeatName, session: string, tool: string, o: { file?: string; bytes?: number; ok?: boolean; agent?: boolean } = {}) =>
  BLOCK_TOOL.test(tool) ? undefined : line("seat.step", seat, { session, tool, ...(o.file ? { file: o.file } : {}), ...(o.bytes !== undefined ? { bytes: o.bytes } : {}), ...(o.ok !== undefined ? { ok: o.ok } : {}), ...(o.agent ? { agent: true } : {}) });
export const sent = (seat: SeatName, session: string, what: "attachment" | "desk" | "mention" | "stage", o: { name?: string; bytes?: number } = {}) =>
  line("seat.sent", seat, { session, what, ...(o.name ? { name: o.name } : {}), ...(o.bytes !== undefined ? { bytes: o.bytes } : {}) });

/** the bytes a base64 string stands for, without decoding it */
export const base64Bytes = (s: string): number => { const t = s.replace(/[^A-Za-z0-9+/=]/g, ""); return Math.floor(t.length * 3 / 4) - (t.endsWith("==") ? 2 : t.endsWith("=") ? 1 : 0); };
/** what Sol handed a seat at the start of a turn: the attachments it saved and the desk's lines, each a line */
export function sentAtStart(seat: SeatName, session: string, saved: { path: string; dataBase64: string }[], deskLines: string) {
  if (!kernelNow()) return;
  for (const f of saved) sent(seat, session, "attachment", { name: f.path, bytes: base64Bytes(f.dataBase64) });
  if (deskLines) sent(seat, session, "desk", { bytes: Buffer.byteLength(deskLines) });
}

// ---- pure: what to take from what the SDKs say ----

/** the file a Claude tool call names, if one (Read, Write, Edit, NotebookEdit, Glob's folder) */
export function fileOf(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, unknown>;
  for (const k of ["file_path", "notebook_path", "path"]) if (typeof i[k] === "string" && i[k]) return i[k] as string;
  return undefined;
}
/** the bytes of a tool_result's content (a string, or text and image blocks) */
export function sizeOf(content: unknown): number {
  if (typeof content === "string") return Buffer.byteLength(content);
  if (Array.isArray(content)) return content.reduce((n, c: any) => n + (c?.type === "text" ? Buffer.byteLength(String(c.text ?? "")) : c?.type === "image" ? Math.floor(String(c.source?.data ?? "").length * 3 / 4) : 0), 0);
  return 0;
}
/** a turn's tokens as Claude's SDK reports them on the result (and on each assistant message) */
export function claudeTokens(u: unknown): Tokens | null {
  if (!u || typeof u !== "object") return null;
  const x = u as Record<string, unknown>;
  const n = (k: string) => (typeof x[k] === "number" ? (x[k] as number) : 0);
  return { in: n("input_tokens"), out: n("output_tokens"), cacheRead: n("cache_read_input_tokens"), cacheWrite: n("cache_creation_input_tokens") };
}
/** the thread's tokens as Codex's SDK reports them on turn.completed (a running total: index.ts) */
export function codexTokens(u: unknown): Tokens | null {
  if (!u || typeof u !== "object") return null;
  const x = u as Record<string, unknown>;
  const n = (k: string) => (typeof x[k] === "number" ? (x[k] as number) : 0);
  return { in: n("input_tokens"), out: n("output_tokens"), cacheRead: n("cached_input_tokens"), cacheWrite: n("cache_write_input_tokens") };
}
/** a Codex item that completed, as a step: its tool's name, the file it named, the bytes it printed; null for one that is not a step */
export function codexStepOf(item: any): { tool: string; file?: string; files?: number; bytes?: number; ok?: boolean } | null {
  if (!item || typeof item !== "object") return null;
  switch (item.type) {
    case "command_execution": return { tool: "command", bytes: Buffer.byteLength(String(item.aggregated_output ?? "")), ok: item.exit_code === 0 };
    case "file_change": { const c = Array.isArray(item.changes) ? item.changes : []; return { tool: "edit", ...(c[0]?.path ? { file: String(c[0].path) } : {}), ...(c.length > 1 ? { files: c.length } : {}), ok: item.status !== "failed" }; }
    case "web_search": return { tool: "search" };
    case "mcp_tool_call": return { tool: `${item.server}:${item.tool}`, ...(item.result !== undefined ? { bytes: Buffer.byteLength(JSON.stringify(item.result)) } : {}), ok: item.status !== "failed" };
    default: return null;   // its words (agent_message, reasoning), its notes (error), its list (todo_list)
  }
}

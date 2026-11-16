// A turn on a seat on the seam (seats.ts, the design's step 6), and Sol's own two seats as seats on it. Moved from index.ts
// so it stays under its ceiling (#934); index.ts hands in what is its own (send, its turn, the two seats' Home turns).
import { WebSocket } from "ws";
import { registerSeat, convoId, innerOf, type SeatProvider, type SeatCan } from "./seats.js";
import type { Seat } from "./threads.js";

export { seatFor } from "./seats.js";   // which seat takes a say (index.ts)

type Wire = { readyState: number; send: (s: string) => void };
type Conn = { ws: Wire; sessionId?: string; chars: number };
type End = (m: object) => void;
type Send = (ws: Wire, msg: object) => void;
/** what a turn on a seat reads of a say (index.ts Say) */
type TurnSay = { text: string; sessionId?: string; model?: string; effort?: string; cwd?: string };
/** index.ts handleSay: a whole turn on one of Sol's own seats, its answer on the wire it is given */
type Drive = (conn: Conn, say: { type: "say"; text: string; seat: Seat; sessionId?: string; model?: string; effort?: string; cwd?: string }, abort: AbortController) => Promise<unknown>;

/** a turn on a seat that is not Sol's own (a block's): only the interface's four parts, and its optional ones when it has
 *  them. Its answer arrives whole when it does not stream; a structured result rides on the done */
export async function turnOn(p: SeatProvider, conn: Conn, say: TurnSay, abort: AbortController, end: End, more: string, send: Send) {
  const ws = conn.ws;
  // a conversation of another seat's (Claude's, Codex's, another block's) is never handed to this one
  const inner = say.sessionId ? innerOf(p.name, say.sessionId) : null;
  if (say.sessionId && inner === null) { send(ws, { type: "error", message: `this conversation is not a ${p.name} conversation; start a new one on this seat` }); return; }
  let streamed = false;
  // the desk's lines and the files, as the built-ins have them in their text (they were taken for this turn)
  const r = await p.run({ text: [say.text, more].filter(Boolean).join("\n\n"), ...(inner ? { sessionId: inner } : {}), model: say.model, effort: say.effort, cwd: say.cwd }, p.can.stream ? { delta: (text) => { streamed = true; send(ws, { type: "delta", text }); } } : {}, abort.signal);
  if (abort.signal.aborted) { end({ stopped: true, sessionId: conn.sessionId }); return; }   // Stop: said as stopped, as a built-in's
  if (r.sessionId) conn.sessionId = convoId(p.name, r.sessionId);   // the shell's own id, never the block's name as it is
  if (!r.ok) { send(ws, { type: "error", message: r.why }); end({ ok: false, sessionId: conn.sessionId }); return; }
  if (!streamed && r.text) send(ws, { type: "delta", text: r.text });
  end({ ok: true, sessionId: conn.sessionId, ...(r.structured !== undefined ? { structured: r.structured } : {}) });
}

/** one of Sol's own seats on the seam: its whole Home turn (home), and the interface's run, which drives that same turn
 *  through a wire of its own (the way the call's askSeat does) */
function builtInSeat(name: Seat, home: unknown, can: SeatCan, handleSay: Drive): SeatProvider {
  return {
    name, builtIn: true, can, home: home as unknown as SeatProvider["home"],
    run: (task, out, signal) => new Promise((resolve) => {
      let text = "", error = "", sessionId = task.sessionId;
      const tap: Wire = {
        readyState: WebSocket.OPEN,
        send: (line) => {
          const m = JSON.parse(line);
          if (m.type === "delta") { text += m.text; out.delta?.(m.text); }
          else if (m.type === "error") error = m.message;
          else if (m.type === "done" && m.sessionId) sessionId = m.sessionId;
        },
      };
      const ac = new AbortController();
      signal.addEventListener("abort", () => ac.abort(), { once: true });
      void handleSay({ ws: tap, chars: 0 }, { type: "say", text: task.text, seat: name, sessionId: task.sessionId, model: task.model, effort: task.effort, cwd: task.cwd }, ac)
        .then(() => resolve(error && !text ? { ok: false, why: error, sessionId } : { ok: true, text, sessionId }), (e) => resolve({ ok: false, why: String((e as Error)?.message ?? e), sessionId }));
    }),
  };
}
/** Sol's own two seats on the seam, as index.ts hands them: Claude streams, goes on in the same conversation and asks (its
 *  permission prompt); Codex streams and goes on, never asks */
export function registerSeats(handleSay: Drive, sayClaude: unknown, sayCodex: unknown) {
  registerSeat(builtInSeat("claude", sayClaude, { stream: true, resume: true, ask: true }, handleSay));
  registerSeat(builtInSeat("codex", sayCodex, { stream: true, resume: true, ask: false }, handleSay));
}

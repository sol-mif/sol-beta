// The seat seam (the design's loader, "the seat is a block", Frank 2026-11-07 X4 B and the six-part interface A, step 6).
// A seat is whatever thinks for the person: today Claude Code and Codex, on the person's own subscriptions. The shell's
// wiring (index.ts handleSay) knows a seat only through this interface; what makes Claude Claude and Codex Codex (its
// tools, its sandbox, its permission mode: inventory.ts) stays with that seat.
//   four parts every seat has   take a task (words in), give back a result or why it failed, be cancelled (the signal),
//                               and a structured result beside the words when it has one
//   three a seat may have       stream (the words as they come), resume (go on in the same conversation), ask (stop
//                               to ask the person, as Claude's permission prompt). A seat without them still plugs in:
//                               its answer arrives whole, each turn is a fresh one, it never asks. Six, and no more
//   the built-in Claude seat    Sol's own and the one exception to "any block can be taken out": it cannot be
//                               unregistered, and when a seat is missing or breaks, it takes the turn (said, never silent)
//   a block's seat              a block (either room) that says needs.provides: ["seat"] registers one (kernel.ts): a
//                               task is its tool `task`, run through the gate like any call, ten minutes at most, one at
//                               a time; cancelled, its tool `cancel` is told when it has one; taken out with the block, a
//                               turn on it ends with "the seat is gone". Its card says a seat reaches whatever its record
//                               asks. The conversations it keeps are named by the shell, never by the block (below)
//   a seat the shell starts     behind a switch, on unless set off (SOL_ACP_SEAT; the v2 design §7.1, step A2): a block whose
//                               record says needs.seat is a program the shell starts and keeps running, walled, speaking
//                               ACP on its stdio (acp.ts). It streams, asks, and says its steps and what it spent
//   wider replies (step A2)     ask takes the old { question } or { kind: "question", text } or a permission: { kind:
//                               "permission", tool, line (one line for the person), print (a fingerprint of the
//                               arguments), options (what the seat offered, said), args (the arguments themselves,
//                               as the seat sent them, when it did: its line is its own words and may not say all) }; a permission's answer is "once" or
//                               "no", anything else is no. step({ tool, title, state }) a tool step of the seat's own;
//                               usage({ in, out, cacheRead?, cacheWrite? }) the tokens a turn spent (a step carries an id too, so its end is paired with its start). A seat that has none of them still plugs in
//   four more in can (step A2)  perCall: does a call reach us before it runs ("hook": we stop it before; "request": it
//                               comes to ask; "none"), stopAtTool: can it wait at a tool for a person, mcp: Sol's tools
//                               as an MCP server it takes ("stdio", "http", "none"), sandbox: what walls it ("own": its
//                               own; "ours": Sol's; "none": nothing, and such a seat is not put on the seam). Left out,
//                               they are not said: today's seats (Sol's two, a block's tool seat) say none of them
//   what the person allowed    a turn in a folder the person's record names (~/.sol/record/me.json, consent.levels:
//                               record · show · draft · do) is held at that folder's level: its tools past it are
//                               refused by name, the record named (consent.ts; a Codex talk in a folder, index.ts
//                               sayCodex, and a folder agent's ticket, agent/run.ts) (#1216)
export type SeatTask = { text: string; sessionId?: string; model?: string; effort?: string; cwd?: string };
export type SeatResult = { ok: true; text: string; sessionId?: string; structured?: unknown } | { ok: false; why: string; sessionId?: string };
/** what a seat asks a person: the old plain question, a question, or may it run a tool */
export type SeatAsk = { question: string } | { kind: "question"; text: string } | { kind: "permission"; tool: string; line: string; print: string; options: string[]; args?: unknown };
/** a permission's answer: only this once, or no */
export const PERMIT = ["once", "no"] as const;
/** id: the same on a step's start and its end (the face's `tool` message pairs them by it) */
export type SeatStep = { id: string; tool: string; title: string; state: "started" | "done" | "failed" };
/** what a turn spent, in tokens, as the seat says it: in and out, and what it read from and wrote to its cache when
 *  it says those (Claude Code does, and its `in` is only what the cache did not hold; whether another seat's `in`
 *  counts the cached part is that seat's to say, so the parts are not summed here) */
export type SeatSpent = { in: number; out: number; cacheRead?: number; cacheWrite?: number };
/** what a seat may say while it works: only the parts it can (stream: delta; ask: ask; a step, what it spent) */
export type SeatOut = { delta?: (text: string) => void; ask?: (q: SeatAsk) => Promise<string>; step?: (s: SeatStep) => void; usage?: (u: SeatSpent) => void };
export type SeatCan = { stream: boolean; resume: boolean; ask: boolean; perCall?: "hook" | "request" | "none"; stopAtTool?: boolean; mcp?: "stdio" | "http" | "none"; sandbox?: "own" | "ours" | "none" };

/** the face's messages for a seat's ask, our names (not Marco's yet), kept here so they change in one place: the engine
 *  sends { type: ask, id, seat, ask } on the turn's socket; Sol's own window answers { type: answer, id, answer } */
export const SEAT_WIRE = { ask: "seat.ask", answer: "seat.answer" } as const;

export type SeatProvider = {
  name: string;
  /** Sol's own (Stable): never unregistered */
  builtIn: boolean;
  /** the block that provides it, when one does */
  block?: string;
  can: SeatCan;
  /** the four parts: the task in, its result or why not out, cancelled by the signal; `structured` on the result */
  run(task: SeatTask, out: SeatOut, signal: AbortSignal): Promise<SeatResult>;
  /** a built-in's whole Home turn (files, the desk's lines, Sol's tools, the face's wire): the shell's fast path for
   *  Sol's own seats, which also answer `run`. Opaque here: index.ts owns its shape */
  home?: (...args: never[]) => Promise<void>;
};

/** the seat every other falls back on, and the one that cannot be taken out */
export const BUILT_IN = "claude";
const seats = new Map<string, SeatProvider>();

/** a seat put on the seam: a built-in at the engine's start, a block's when it loads. A block's never replaces another's or a built-in */
export function registerSeat(p: SeatProvider): { ok: true } | { ok: false; why: string } {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.name)) return { ok: false, why: `${p.name} is not a seat's name` };
  if (!p.builtIn && p.can.sandbox === "none") return { ok: false, why: `${p.name} says nothing walls it (sandbox: none): a seat that cannot be walled is not put on the seam` };
  const had = seats.get(p.name);
  if (had && (had.builtIn || had.block !== p.block)) return { ok: false, why: `there is a seat ${p.name} already (${had.builtIn ? "Sol's own" : `the block ${had.block}'s`})` };
  seats.set(p.name, p);
  return { ok: true };
}
/** a seat taken off the seam; the built-in Claude seat never is */
export function unregisterSeat(name: string, block?: string): { ok: true } | { ok: false; why: string } {
  const had = seats.get(name);
  if (!had) return { ok: false, why: `there is no seat ${name}` };
  if (had.builtIn && name === BUILT_IN) return { ok: false, why: "the built-in Claude seat cannot be taken out: every other seat falls back on it" };
  if (block !== undefined && had.block !== block) return { ok: false, why: `${name} is not the block ${block}'s seat` };
  seats.delete(name);
  return { ok: true };
}
/** the seat for a turn: the one named, else the built-in Claude seat with why (a missing seat is said, never silent) */
export function seatFor(name: string | undefined): { seat: SeatProvider; instead?: string } {
  const want = name ?? BUILT_IN;
  const s = seats.get(want);
  if (s) return { seat: s };
  const b = seats.get(BUILT_IN);
  if (!b) throw new Error("no seat at all: the built-in Claude seat is not registered");
  return { seat: b, instead: `the seat ${want} is not here, so Claude took the turn` };
}
/** every seat on the seam, for the AI's "what can Sol do" and the face */
export const seatList = () => [...seats.values()].map((s) => ({ name: s.name, builtIn: s.builtIn, ...(s.block ? { block: s.block } : {}), can: s.can }));
// A block's seat names its conversation as it likes; the shell never hands that name on as it is (a block could name a
// live Claude conversation and have Stop or a door land on it). It is given an id of the shell's own, kept here.
const convos = new Map<string, { seat: string; inner: string }>();
/** the shell's id for a block seat's conversation (made once per inner name) */
export function convoId(seat: string, inner: string): string {
  for (const [id, c] of convos) if (c.seat === seat && c.inner === inner) return id;
  const id = `seat-${seat}-${Math.random().toString(36).slice(2, 10)}`;
  convos.set(id, { seat, inner });
  return id;
}
/** the block's own name for one of the shell's ids, when it is that seat's; else null (another seat's, or Claude's) */
export const innerOf = (seat: string, id: string): string | null => { const c = convos.get(id); return c && c.seat === seat ? c.inner : null; };

/** for tests: the seam empty again (the built-ins included) */
export const clearSeats = () => { seats.clear(); convos.clear(); };

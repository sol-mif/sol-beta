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
export type SeatTask = { text: string; sessionId?: string; model?: string; effort?: string; cwd?: string };
export type SeatResult = { ok: true; text: string; sessionId?: string; structured?: unknown } | { ok: false; why: string; sessionId?: string };
/** what a seat may say while it works: only the parts it can (stream: delta; ask: ask) */
export type SeatOut = { delta?: (text: string) => void; ask?: (q: { question: string }) => Promise<string> };
export type SeatCan = { stream: boolean; resume: boolean; ask: boolean };

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

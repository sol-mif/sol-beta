// The move-in's sort, kept after it (BR1, #1615; migration.html D, Marco 16:30: "As you add more, I'll offer to sort it
// the same way. You can also ask me any time: 'tidy my folders'"). The engine's part parts/next-tidy.ts makes the offer
// and keeps its lines; this wire only sends the presses and says what was done, on the frame's line (frame.tsx):
//   isOffer(a)        an ask that is a sort offer (its id "o:<kind>:<to>"; engine next/tidy.ts needOf)
//   offerYes(id)      the raise's "Sort them": next.tidy.yes; the frame says what moved, with its Undo
//   offerNo(id)       the raise's "Leave them": next.tidy.no; the offer is not made again
//   tidyRun()         "tidy my folders" in the bar (cv/say/tidy.ts): next.tidy.run, every move made now, then told on the
//                     frame one at a time ("1 of 3"), each with its own Undo, Next to keep it and go on
// The engine writes the one line each yes, no and Undo leaves in what Sol knows, and answers every window with the
// folders where they went (next.movein.kept, next.state); nothing here moves a folder itself.
// Signed: marcocyl04-ux's agent (builder T), BR1 (#1615).
import { asker } from "../../../agents/model.ts";
import { done, hooks, type Done } from "../core.ts";
import type { Engine } from "./types.ts";

type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;
type Move = { id: string; batch: string; done: string; what: string };
type Act = { label: string; run: () => void };
let ask: Ask | null = null;
/** the frame's line (frame.tsx frame.say, through the shell's hooks.flash): `no` is drawn first */
const say = (t: string, act?: Act, no?: Act) => hooks.flash?.(t, act, no);

export const NOTHING = "Nothing to sort: your folders are where the move-in would put them.";
export const NO_ENGINE = "Sorting needs Sol's engine, and it did not answer. Nothing moved.";

export const isOffer = (a: { id?: unknown } | null | undefined): boolean => typeof a?.id === "string" && a.id.startsWith("o:");

/** the Undo of one move: its batch out; `then` hears what to say (the next move's line goes after it) */
function undoOf(m: Pick<Move, "id" | "batch" | "what">, then: (said: string) => void = (t) => say(t)): () => void {
  return () => {
    const a = ask;
    if (!a) return then(NO_ENGINE);
    void a<{ ok?: boolean; why?: string }>({ type: "next.tidy.undo", id: m.id, batch: m.batch }, 8000).then((r) => {
      then(r?.ok ? `Undone: ${m.what} as before.` : `Could not undo: ${r?.why ?? "the engine did not answer"}.`);
    });
  };
}

/** the raise's yes; resolves true once the move is made */
export async function offerYes(id: string): Promise<boolean> {
  const a = ask;
  if (!a) { say(NO_ENGINE); return false; }
  const r = await a<Partial<Move> & { ok?: boolean; why?: string }>({ type: "next.tidy.yes", id }, 15_000);
  if (!r?.ok || !r.batch) { say(r ? `Not sorted: ${r.why ?? "it was refused"}.` : NO_ENGINE); return false; }
  say(r.done ?? "Sorted.", { label: "Undo", run: undoOf({ id, batch: r.batch, what: r.what ?? "" }) });
  return true;
}

/** the raise's no */
export async function offerNo(id: string): Promise<boolean> {
  const a = ask;
  if (!a) return false;
  const r = await a<{ ok?: boolean }>({ type: "next.tidy.no", id }, 8000);
  return !!r?.ok;
}

/** the moves told one at a time: the newest never hides another's Undo (one focus at a time) */
function tell(moves: readonly Move[], i = 0, before = ""): void {
  const m = moves[i], n = moves.length;
  if (!m) { if (before) say(before); return; }
  const text = `${before ? `${before} ` : ""}${m.done}${n > 1 ? ` (${i + 1} of ${n})` : ""}`;
  const undo = { label: "Undo", run: undoOf(m, (said) => (i + 1 < n ? tell(moves, i + 1, said) : say(said))) };
  if (i + 1 < n) say(text, { label: "Next", run: () => tell(moves, i + 1) }, undo);
  else say(text, undo);
}

/** "tidy my folders": every move made now, each told with its own Undo; the bar's Done says the sort was asked */
export function tidyRun(): Done {
  const a = ask;
  if (!a) { say(NO_ENGINE); return done(false); }
  void a<{ moves?: Move[] }>({ type: "next.tidy.run" }, 20_000).then((r) => {
    if (!r) return say(NO_ENGINE);
    const moves = Array.isArray(r.moves) ? r.moves.filter((m) => m && typeof m.batch === "string") : [];
    if (!moves.length) return say(NOTHING);
    tell(moves);
  });
  return done(true, "tidy");
}

export function attach(e: Engine): () => void {
  const a = asker(e.send, e.subscribe, { prefix: "nx-tidy" });
  ask = a.ask;
  return () => { ask = null; a.close(); };
}
/** tests: the ask the wire sends through (null: none) */
export function useAsk(f: Ask | null): void { ask = f; }

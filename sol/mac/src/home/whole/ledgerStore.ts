// The ledger (#797, plan Part C slice 34), behind sol.home.whole: what the face holds of today's ledger. It asks with
// whole.md's messages (home.ledger, home.ledger.let|not, home.undo) and keeps the last `home.ledger`. The transport is
// ledger.ts's stub until #829 lands; then `send` is the engine's socket, which raises the source itself, and the
// `raise`/`lower` lines below go.
import { useSyncExternalStore } from "react";
import { stub, type LedgerAsk, type LedgerMsg } from "./ledger.ts";
import { send as sourcesSend, sourcesNow, undoSources } from "./sourcesStore.ts";

let view: LedgerMsg | null = null;
const subs = new Set<() => void>();
let engine: ((a: LedgerAsk) => LedgerMsg) | null = null;
// until #829: "let it" moves the ladder through Sources' own stub, as the one engine will
const raise: Parameters<typeof stub>[1] = (id, rung) => { sourcesSend({ type: "home.source.set", id, rung }); return sourcesNow()?.done?.ledgerId ?? null; };
const lower = (ledgerId: string) => undoSources(ledgerId);
/** ask the ledger (the stub, until #829) */
export function send(a: LedgerAsk) { engine ??= stub(Date.now, raise, lower); view = engine(a); subs.forEach((f) => f()); }
export const letIt = (id: string) => send({ type: "home.ledger.let", id });
export const notThis = (id: string) => send({ type: "home.ledger.not", id });
export const undoLedger = (ledgerId: string) => send({ type: "home.undo", ledgerId });
/** what the store holds now (for the tests; the face reads it through useLedger) */
export const ledgerNow = () => view;
export function useLedger(): LedgerMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send({ type: "home.ledger" }); return () => { subs.delete(f); }; }, () => view);
}

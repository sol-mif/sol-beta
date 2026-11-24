// Each ask's judged raise, live (BR1 quiet canvas, #1615; mine/look/br1/quiet.html §3; the engine's next/raise.ts):
// the engine judges "would this person genuinely care, now?" over each ask's folder and answers next.raises with
// { care: { [askId]: { level: 0 silence | 1 dot | 2 line | 3 question, why } }, acted }. The care is laid on the ask of
// the same id (D.asks[id].care), the most its folder's raise says at rest; `why` is the because… sentence. `acted` is the
// floor's meter, "raises you acted on, this week" (diary/Acted.tsx). Asked once at start and again when an ask the
// engine has not judged yet appears; the engine also says it to every window when a judgment changes.
// Signed: marcocyl04-ux's agent (builder J), BR1 (#1615).
import { D, change, subscribe } from "../core.ts";
import { offerNo, offerYes } from "./tidy.ts";
import type { Engine } from "./types.ts";

export type Care = { level: 0 | 1 | 2 | 3; why: string };
export type Acted = { rate: number | null; n: number; acted: number; floor: number; raised: boolean };

/** the engine's last word, kept so an ask that comes after it still gets its care */
const cares = new Map<string, Care>();
let acted: Acted | null = null;
const subs = new Set<() => void>();
/** the meter's read: null until the engine has said it (an older engine never does) */
export const actedNow = () => acted;
export const onActed = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const okCare = (c: unknown): c is Care => !!c && typeof c === "object" && [0, 1, 2, 3].includes((c as Care).level) && typeof (c as Care).why === "string";
/** the care laid on each ask the engine judged (pure over D): changed only where it differs */
export function lay(asks: Record<string, { care?: unknown }>, from: ReadonlyMap<string, Care>): boolean {
  let moved = false;
  for (const [id, c] of from) {
    const a = asks[id];
    if (!a) continue;
    const had = a.care as Care | undefined;
    if (had && had.level === c.level && had.why === c.why) continue;
    a.care = c; moved = true;
  }
  return moved;
}
/** the asks the engine has not judged yet: the ones its list can have (t:, p:, s:, d:, o:), with no care of its word */
export const unjudged = (asks: Record<string, unknown>, from: ReadonlyMap<string, Care>) => Object.keys(asks).filter((id) => /^[tpsdo]:/.test(id) && !from.has(id));

/** an offer the engine makes (builder T's tidy offers, "o:<kind>:<to>"): an ask no other message brings */
export type Offer = { id: string; piece: string; words: string; why: string; rank: number; yes?: string; no?: string; because?: string[]; offer?: unknown };
const okOffer = (o: unknown): o is Offer => !!o && typeof o === "object" && typeof (o as Offer).id === "string" && (o as Offer).id.startsWith("o:") && typeof (o as Offer).piece === "string" && typeof (o as Offer).words === "string";
/** the offers as asks (pure over D): exactly the engine's list, each new one an ask in its folder, the gone ones out; an
 *  offer already there keeps its own state (answered, a Later's rank) */
export function layOffers(asks: Record<string, Record<string, unknown>>, offers: readonly Offer[]): boolean {
  let moved = false;
  const live = new Set(offers.map((o) => o.id));
  for (const id of Object.keys(asks)) if (id.startsWith("o:") && !live.has(id)) { delete asks[id]; moved = true; }
  for (const o of offers) {
    if (asks[o.id]) continue;
    asks[o.id] = { id: o.id, rank: o.rank, piece: o.piece, kind: "code", source: o.why, text: o.words, how: "inplace", answered: false, serious: false, live: "offer",
      ...(o.yes ? { yes: o.yes } : {}), ...(o.no ? { no: o.no } : {}), ...(o.because?.length ? { because: o.because } : {}), ...(o.offer !== undefined ? { offer: o.offer } : {}) };
    moved = true;
  }
  return moved;
}

/** an offer's press, the one way it is said (Raise.tsx calls this alone): builder T's cv/wire/tidy.ts sends it, and its
 *  Sort them draws the done line with the Undo; the engine writes the one known() line for each press (answer, now the
 *  words pressed; reason ask:<id>) */
export const answerOffer = (id: string, yes: boolean): Promise<boolean> => (yes ? offerYes(id) : offerNo(id));

export function attach(e: Engine): () => void {
  let lastAsk = 0, wait: ReturnType<typeof setTimeout> | null = null;
  const askedFor = new Set<string>();   // an ask the engine's list does not hold is asked about once, not every few seconds
  const askNow = () => { lastAsk = Date.now(); e.send({ type: "next.raises" }); };
  const offMsg = e.subscribe((m: { type?: string; care?: unknown; acted?: unknown; offers?: unknown }) => {
    if (m.type !== "next.raises" || !m.care || typeof m.care !== "object") return;
    cares.clear();
    for (const [id, c] of Object.entries(m.care as Record<string, unknown>)) if (okCare(c)) cares.set(id, c);
    if (m.acted && typeof m.acted === "object") { acted = m.acted as Acted; for (const f of [...subs]) f(); }
    const offers = Array.isArray(m.offers) ? m.offers.filter(okOffer) : null;   // an older engine says none: its asks are left as they are
    if (D?.asks) change((d) => { if (offers) layOffers(d.asks as Record<string, Record<string, unknown>>, offers); lay(d.asks, cares); });
  });
  // a new ask: its care if the engine said it already, else ask again (at most every few seconds)
  const offStore = subscribe(() => {
    if (!D?.asks) return;
    if (lay(D.asks, cares)) change(() => {});
    const fresh = unjudged(D.asks, cares).filter((id) => !askedFor.has(id));
    if (!fresh.length || wait) return;
    wait = setTimeout(() => { wait = null; for (const id of unjudged(D.asks, cares)) askedFor.add(id); askNow(); }, Math.max(0, lastAsk + 4000 - Date.now()));
  });
  askNow();
  return () => { offMsg(); offStore(); if (wait) clearTimeout(wait); cares.clear(); askedFor.clear(); acted = null; };
}

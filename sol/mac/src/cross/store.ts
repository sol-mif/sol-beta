// What crossed between Home and Build (#1031), as the engine keeps it (engine/src/cross.ts, parts/cross.ts): carried
// (a Home thing put down on Build's stage, a block there now) and seated (a stage block put down on a Home folder). Plus
// the pieces a folder handed the talk, held here until the next message takes them (work/useWork.ts say). And the last
// crossing's undo, which the undo pill draws (CrossLayer.tsx). One module store, read with useSyncExternalStore.
import { useSyncExternalStore } from "react";
import { link } from "../socket";   // the window's one socket per engine (shared with useEngine)
import { ENGINE } from "../engine";
import { crossOn, subCross } from "./flag";
import { click } from "../snap/click";   // #1045: a seat in a folder clicks as a piece seats

export type Knows = { kind: string; label: string };
/** a Home thing as it crosses: its words, its folder (id and path), what the folder knows, an address for a source */
export type HomeThing = { id: string; words: string; place: string; path: string; knows?: Knows[]; url?: string };
export type Carried = { id: string; kind: "carried"; thing: string; place: string; path: string; words: string; block: string; session: string; at: number };
export type Seated = { id: string; kind: "seated"; block: string; session: string; place: string; title: string; blockKind: string; at: number };
export type Crossing = Carried | Seated;
/** the last thing the hand did, with its undo: the pill shows it for LIFE.scar */
export type Last = { key: number; line: string; undo: () => void };
/** say it and Settings moves: a row of the look a sentence names, from where it is to where it would go */
export type Moved = { row: "text" | "opacity" | "blur" | "base" | "bubble" | "skin"; from: string | number; to: string | number };
export type Said = { text: string; patch: { look: Record<string, string | number> } | null; moved: Moved[] };
export type CrossState = { crossings: Crossing[]; pieces: HomeThing[]; last: Last | null; refused: string | null; said: Said | null; moving: { rows: Moved[]; key: number; at: number } | null };

let state: CrossState = { crossings: [], pieces: [], last: null, refused: null, said: null, moving: null };
const subs = new Set<() => void>();
const set = (patch: Partial<CrossState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
export const crossState = () => state;
export const useCrossState = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, crossState);

let key = 0;
/** say what the hand just did, with its undo */
export const did = (line: string, undo: () => void) => set({ last: { key: ++key, line, undo }, refused: null });
export const forgetLast = () => set({ last: null });

// the engine's word: the whole list after any change; a refusal names why
let waiting: { carry?: (c: Carried) => void } = {};
const wire = typeof window === "undefined" || typeof WebSocket === "undefined" ? null : link(ENGINE);
const wireSend = (o: object) => wire?.send(o) ?? false;
if (wire) {
  wire.onLink((up) => { if (up && crossOn()) wireSend({ type: "cross.get" }); });
  wire.on((m) => {
    if (m?.type === "cross.state") set({ crossings: Array.isArray(m.crossings) ? m.crossings : [], ...(m.refused ? { refused: String(m.refused) } : {}) });
    if (m?.type === "cross.carried" && m.crossing) { waiting.carry?.(m.crossing); waiting = {}; }
    if (m?.type === "cross.said" && m.text === asked) set({ said: m.moved?.length ? { text: m.text, patch: m.patch, moved: m.moved } : null });
  });
  subCross(() => { if (crossOn()) wireSend({ type: "cross.get" }); });
}

/** Build's session now: the one the window keeps open (home/Home.tsx, sol.home.open) */
export function buildSession(): string | null {
  try { const o = JSON.parse(localStorage.getItem("sol.home.open") ?? "null"); return o?.kind === "session" && typeof o.id === "string" ? o.id : null; } catch { return null; }
}

/** a Home thing put down on Build's stage, at the spot the hand let go (stage coordinates); its undo closes the block */
export function carry(t: HomeThing, at?: { x: number; y: number; w: number; h: number }) {
  const sessionId = buildSession();
  if (!sessionId) { set({ refused: "open a session in Build first; the thing lands on its stage" }); return false; }
  waiting = { carry: (c) => did(`${t.words} is on the stage`, () => wireSend({ type: "cross.undo", id: c.id })) };
  return wireSend({ type: "cross.carry", thing: t, sessionId, ...(at ? { at } : {}) });
}
/** a stage block put down on a Home folder; its undo takes it out of the folder (the block stays on the stage) */
export function seat(block: { id: string; title: string }, session: string, place: { id: string; name: string }) {
  const ok = wireSend({ type: "cross.seat", block: block.id, sessionId: session, place: place.id });
  if (ok) click();
  if (ok) did(`${block.title} lives in ${place.name} now`, () => { const s = state.crossings.find((c) => c.kind === "seated" && c.block === block.id); if (s) wireSend({ type: "cross.undo", id: s.id }); });
  return ok;
}
/** a session of Build's side put down on a Home folder (#1045): the whole session lives there, by reference, as a block
 *  does; its undo takes it out of the folder (the session stays where it was) */
export function seatSession(s: { id: string; title: string }, place: { id: string; name: string }) {
  const ok = wireSend({ type: "cross.seat", session: true, sessionId: s.id, title: s.title, place: place.id });
  if (ok) click();
  if (ok) did(`${s.title} lives in ${place.name} now`, () => { const c = state.crossings.find((x) => x.kind === "seated" && x.blockKind === "session" && x.session === s.id && x.place === place.id); if (c) wireSend({ type: "cross.undo", id: c.id }); });
  return ok;
}
export const undoCrossing = (id: string) => wireSend({ type: "cross.undo", id });

/** a folder's thing handed to the talk: it rides the next message, as its first piece; its undo takes it back */
export function addPiece(t: HomeThing) {
  if (state.pieces.some((p) => p.id === t.id)) return;
  set({ pieces: [...state.pieces, t] });
  did(`${t.words} goes with your next message`, () => dropPiece(t.id));
}
export const dropPiece = (id: string) => set({ pieces: state.pieces.filter((p) => p.id !== id) });
/** the pieces, taken by the message that carries them (useWork.say); none when the switch is off */
export function takePieces(): HomeThing[] {
  if (!crossOn() || !state.pieces.length) return [];
  const p = state.pieces; set({ pieces: [] }); return p;
}

/** the carried things of a Home thing (its chip in Home), and the blocks seated in a folder */
export const carriedOf = (thing: string) => state.crossings.filter((c): c is Carried => c.kind === "carried" && c.thing === thing);
export const seatedIn = (s: CrossState, place: string) => s.crossings.filter((c): c is Seated => c.kind === "seated" && c.place === place);

// say it and Settings moves: the talk's words, asked of the engine as you type (a pause first); an answer only for the
// words still in the box. Nothing is set until the person presses the offer (Say.tsx)
let asked = "", sayTimer = 0;
export function sayWords(text: string) {
  window.clearTimeout(sayTimer);
  const t = text.trim();
  if (!crossOn() || t.length < 6 || t.length > 400) { asked = ""; if (state.said) set({ said: null }); return; }
  sayTimer = window.setTimeout(() => { asked = t; wireSend({ type: "cross.say", text: t }); }, 320);
}
/** the rows that just moved by words: Settings' look draws them moving */
export const markMoving = (rows: Moved[]) => set({ moving: { rows, key: ++key, at: Date.now() }, said: null });
export const clearSaid = () => { asked = ""; set({ said: null }); };

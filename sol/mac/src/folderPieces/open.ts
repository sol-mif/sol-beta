// Which piece is open in the room (#1092, the design's NOW 1): one small store, written by both Build sides (a press on
// a piece row) and read by the room (Home.tsx's talk place, WorkApp's view). A press on a session row lets it go; Esc
// goes back to the session it came from. No React here: a value and its listeners.
import { useSyncExternalStore } from "react";

/** `reads`: a new piece opened from a starter row, the source its bench starts with pressed (morning round of 11-13) */
export type OpenPiece = { cwd: string; name: string; from: string | null; reads?: string } | null;
let open: OpenPiece = null;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

/** the piece in the room, if one is */
export const openPiece = () => open;
/** the window's top line while a piece has the room: its folder, then its name ("sol-dev › the night") (pure) */
export const pieceLine = (p: { cwd: string; name: string }, title?: string) =>
  `${p.cwd.replace(/\/+$/, "").split("/").pop()} › ${p.name === NEW_PIECE ? "a new piece" : title ?? p.name}`;
/** the room's name for "a new piece, being made by hand" (never a piece's own name: those are lower case words) */
export const NEW_PIECE = "+new";
/** open a piece in the room; `from` is the session that was there, for Esc */
export function setOpenPiece(p: OpenPiece) {
  if (open?.cwd === p?.cwd && open?.name === p?.name && open?.reads === p?.reads) return;
  open = p;
  tell();
}
/** a session row pressed, or Esc: the room is the session's again */
export const closePiece = () => setOpenPiece(null);
export const useOpenPiece = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => open);

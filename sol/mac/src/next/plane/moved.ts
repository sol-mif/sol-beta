// A folder moved by the person (BR1 item 5, #1615; sol/PROTOCOL.md "One store"): drag is the one fix gesture. When the
// folder is one Sol placed (the move-in, a sort: next.known's placed:<folder>, or an unseen next.placed row), the move is
// a fix of that placement, written once as a scoped line (next.known.fix how "drag", its Undo how "undo"); taken out, the
// engine's `same` asks once whether the folders Sol put inside others alike come out too (sameOut). A folder Sol did
// not place sends nothing: where the person puts their own folder is only its place. Pure, so the tests read it; the
// wire is cv/wire/fix.ts. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { placedOf } from "../because/place.ts";
import { placementOf, type Unseen } from "./placed.ts";
import type { Known } from "../known.ts";

export type Fix = { how: "drag" | "undo"; what: string; place: string; reason: string; was?: string; now?: string };
type Folder = { id: string; name: string; path?: unknown };

/** where a folder sits, in the person's words: the folder holding it, or the canvas */
export const whereW = (parent: Folder | null | undefined) => (parent ? String(parent.name) : "the canvas");

/** the fix line a person's move of a folder writes, or null when Sol did not place it. `was` and `now` are the folders
 *  holding it before and after (null: the canvas); a move that keeps its folder (a drag on the canvas) says no now */
export function moveFix(r: Folder, known: readonly Known[], rows: readonly Unseen[], was: Folder | null, now: Folder | null): Fix | null {
  const pm = placementOf(r, known, rows);
  if (!pm) return null;
  const place = placedOf(pm.k) ?? r.id, moved = (was?.id ?? null) !== (now?.id ?? null);
  return { how: "drag", what: String(r.name), place, reason: pm.k, was: whereW(was), ...(moved ? { now: whereW(now) } : {}) };
}

/** its Undo: the same placement, said back */
export const undoFix = (f: Fix): Fix => ({ how: "undo", what: f.what, place: f.place, reason: f.reason, ...(f.now ? { was: f.now } : {}), ...(f.was ? { now: f.was } : {}) });

type Act = { label: string; run: () => void };
/** one of the other folders Sol put inside a folder for the same reading: `in` is the name of the folder holding it */
export type Other = { id: string; name: string; in: string };
/** after the person takes a folder Sol placed out, the engine's same names the others Sol put inside folders for the same
 *  reading: one line asks once whether they come out too, in scope's words (11-22): its act takes them out (`take`), its
 *  no closes the line and leaves them where they are. Null when there is none to ask about */
export function sameOut(moved: string, others: readonly Other[], take: (ids: string[]) => void): { text: string; act: Act; no: Act } | null {
  if (!others.length) return null;
  const ids = others.map((o) => o.id), o = others[0];
  return others.length === 1
    ? { text: `Your AI put ${o.name} inside ${o.in} the same way. Take ${o.name} out too?`, no: { label: `No, only ${moved}`, run: () => {} }, act: { label: `Yes, ${o.name} too`, run: () => take(ids) } }
    : { text: `Your AI put ${others.length} more folders inside others the same way. Take those out too?`, no: { label: "Only this one", run: () => {} }, act: { label: `All ${others.length}`, run: () => take(ids) } };
}

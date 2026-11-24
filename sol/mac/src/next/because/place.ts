// Where Sol put a folder, and the fix (BR1 item 4, #1615; mine/look/br1/three.html "Wrong is easy to fix"): anything Sol
// placed says so where you point at it, with why, and is fixed the same way everywhere. A placement is a placed:<folder>
// line in what Sol knows (P's engine, you-known.ts ofPlaced), Sol's own (by "sol") or the person's (by "person": theirs,
// nothing to answer). Its ways are not a fact's: That's right (next.placed.seen: Sol keeps it there and the dot goes),
// and the move back, which is the shelf's take (next.shelf.take, "Put this folder back where it was") for one on the shelf; one Sol nested
// in a folder moves by dragging it, as everywhere (the canvas is E's), so the because says that instead of a button. A
// move back asks once "Same for these N?" from the things placed for the same reading (next.known.same.of, read before
// the move), kept by next.known.same. The placer is held once a wire has the engine (cv/wire/because.ts); the dev page
// passes its own. Pure but for the store. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { useSyncExternalStore } from "react";
import type { Known } from "../known.ts";
import type { SameOf } from "./fix.ts";

/** the folder a placed:<folder> key names; null: not a placement */
export const placedOf = (k: string): string | null => (k.startsWith("placed:") && k.length > 7 ? k.slice(7) : null);
/** a placement Sol made, so one the person may answer; their own (by person) is theirs and says nothing more */
export const solPlaced = (f: Pick<Known, "k" | "by">) => f.by === "sol" && placedOf(f.k) !== null;

export type PlaceHow = "right" | "take";
/** the ways in plain words, each a whole action alone on a button */
export const PLACE_W: Record<PlaceHow, string> = { right: "That’s right", take: "Put this folder back where it was" };
/** the fix for a folder Sol put inside another: the same drag as everywhere, said, not a button */
export const DRAG_W = "Somewhere else? Drag it where it belongs.";
/** the grey words where a folder Sol placed is pointed at (the opened folder's head, the canvas caption); Jev read
 *  "Sol put it here" as unclear (0.91), these clear (0.36) */
export const PLACED_W = "Why your AI put it here";
/** the press that unfolds a placement's ways when it is one of several facts */
export const ASK_W = "Ask about where it is";
/** "Same for these?" after a move back: the other folders archived for the same reading (holders.html: no Shelf) */
export const samePlacedW = (n: number) => `Your AI archived ${n === 1 ? "1 other folder" : `${n} other folders`} for the same reason. Bring ${n === 1 ? "it" : "them"} back too?`;

/** the ways a placement offers where it is: That's right always, the shelf's take only for one on the shelf */
export const placeWays = (onShelf: boolean): PlaceHow[] => (onShelf ? ["right", "take"] : ["right"]);

/** the frame's line once done; a take names the folder (its last path part) */
export function placeSaid(how: PlaceHow, name: string): string {
  return how === "right" ? "It stays where it is" : `${name} is back where it was`;
}

export type Placer = {
  /** whether the folder is on the shelf now, put there by Sol */
  onShelf(folder: string): boolean;
  /** That's right: seen, kept where it is; false: not taken */
  right(folder: string): Promise<boolean>;
  /** the things placed for the same reading, the folder aside (read before a move, while the placement still stands) */
  sameOf(k: string, folder: string): Promise<SameOf | null>;
  /** off the shelf, back on the canvas; what it returns is the Back (onto the shelf again), or null: not taken */
  take(folder: string, name: string): Promise<(() => void) | null>;
  /** "Same for these?" answered for a move back: these keys or every one like it; the ones on the shelf come off too */
  same(a: { reason: string; reach: "here" | "these" | "everywhere"; to: string[] }): Promise<boolean>;
};

let held: Placer | null = null;
const subs = new Set<() => void>();
/** a wire hands its placer here once the engine has it; null takes it away */
export function setPlacer(p: Placer | null): void { held = p; subs.forEach((s) => s()); }
export const placerNow = () => held;
export const usePlacer = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, placerNow, () => null);

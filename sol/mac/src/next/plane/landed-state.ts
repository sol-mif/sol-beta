// ✦ landing (BR1, #1615; mine/look/br1/inside.html moment 3, "the canvas is its workbench"): what a session makes while it
// is kept beside the canvas lands on the canvas with a ✦, tied to it. The piece carries `from`, the id of the session that
// made it. Pointing at the piece lights its session wherever it shows: its card on the canvas (far off, its folder's), the
// pane it is kept in, its tab, the bar's To. The light is its own small store, so a hover never draws the plane again.
// Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { useSyncExternalStore } from "react";
import { D } from "../cv/core.ts";   // core, not the barrel: holders/model.ts reads this file while plane/layout.ts loads, and the barrel would start cv/moves/plane.ts before layout is done (diarySpot before initialization)
import type { Piece } from "../cv/types.ts";

/** the session that made a piece, when its `from` names a session on the canvas. `from` says other things elsewhere (a
 *  friend's name on a sticky, "work", "autos"), never a session's id, so those are no one's */
export function madeBy(p: Piece | undefined, pieces: Record<string, Piece> = D.pieces): Piece | null {
  const sid = p && typeof p.from === "string" && p.from !== p.id ? p.from : "";
  const s = sid ? pieces[sid] : undefined;
  return s && s.kind === "session" ? s : null;
}

/** a session's colour: its folder's tint, as plane.css draws it (.pl-t0…3, by the folder's place in the list) */
export const TINTS = ["var(--a1)", "var(--a2)", "var(--a3)", "var(--ink4)"] as const;
export const tintAt = (index: number) => TINTS[Math.max(0, index) % TINTS.length];

/** what lights for a session (pure): its card or chip on the canvas, its folder's card far off (where the session is
 *  inside it), the pane it is kept in, its tab and the bar's To while the bar talks to it */
export function litRules(sid: string, rid: string, colour: string): string {
  const a = JSON.stringify(sid), r = JSON.stringify(rid);
  return `#pl [data-piece=${a}], #pl .pl-card[data-region=${r}], .kp[data-kept=${a}], .tb-tab[data-tab=${a}], .nx-to[data-to=${a}]`
    + ` { outline: 2.5px solid ${colour} !important; outline-offset: 2px !important; }`;
}

// ---------------------------------------------------------------- the light: one session at a time, its own store
let lit: string | null = null;
const subs = new Set<() => void>();
const tell = () => { for (const f of [...subs]) f(); };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const litNow = () => lit;
export const useLit = () => useSyncExternalStore(sub, litNow, litNow);
/** the hand is on a piece this session made */
export function lightOn(sid: string): void { if (lit !== sid) { lit = sid; tell(); } }
/** the hand left it: only its own light goes (another piece may have lit since) */
export function lightOff(sid?: string): void { if (lit !== null && (sid === undefined || lit === sid)) { lit = null; tell(); } }

// The agent's hands on its stage (#1437), the face's half: a move the session's agent asked for (`place` with beside,
// under, foot, width, large, chat or go; engine work/hands.ts) made with the hand's own edits (arrange.ts move, widen),
// so the agent's arrangement is the hand's kind of arrangement and no piece ever lies on another. Behind the switch
// stage.hands ("the agent arranges the stage", Build settings › switches, under the eyes' row). Pure here; Space.tsx
// applies it, waits while the person's hand is busy, keeps the arrangement before it for ⌥⌘Z, and draws the lens.
import { buildSwitch } from "../flag.ts";
import { useSyncExternalStore } from "react";
import { PAD, move, widen, type Layout, type Size } from "./arrange.ts";

export const STAGE_HANDS = "stage.hands";
const sw = buildSwitch(STAGE_HANDS);
export const stageHands = () => sw.get();
export const setStageHands = (v: boolean) => sw.set(v);
export const useStageHands = () => useSyncExternalStore(sw.sub, sw.get);

/** one move, as the engine sends it (work.stage.hand); `n` counts the session's moves so none is applied twice */
export type HandMove = {
  n: number; id: string;
  beside?: string; under?: string; foot?: boolean; width?: "narrow" | "half" | "wide";
  large?: boolean; chat?: "col" | "lines" | "line"; go?: string; say?: string;
};
/** a column's share of the space's width for each word */
export const WIDTHS = { narrow: 0.3, half: 0.5, wide: 0.66 } as const;
/** a move waits until the person's hand (a press, a wheel, a page scrolled) has been still this long */
export const STILL_MS = 2000;
/** the lens's ring and line stay this long */
export const LENS_MS = 3000;

/** a page's frame told its size (Page.tsx keepSize, "sol-size", also on load and resize): the person's hand is busy only
 *  when its top moved, and not while the agent's own lens scrolls that piece (`own`: until when) (#1547, pure) */
export function scrolled(was: number | undefined, top: number, own = 0, now = 0): boolean {
  return was !== undefined && Math.abs(top - was) >= 1 && now >= own;
}

const colOf = (l: Layout, id: string) => l.cols.findIndex((c) => c.ids.includes(id));

/** the arrangement after a move that changes where pieces stand (beside, under, foot, width), or null when the move
 *  says nothing about that or names a piece not in it (pure) */
export function moved(l: Layout, m: HandMove, space: Size): Layout | null {
  let next = l, did = false;
  if (m.beside && m.beside !== m.id) {
    const ci = colOf(next, m.beside); if (ci < 0) return null;
    next = move(next, m.id, { before: ci + 1 }); did = true;
  } else if (m.under && m.under !== m.id) {
    const ci = colOf(next, m.under); if (ci < 0) return null;
    next = move(next, m.id, { col: ci, at: next.cols[ci].ids.indexOf(m.under) + 1 }); did = true;
  } else if (m.foot) { next = move(next, m.id, { foot: true }); did = true; }
  if (m.width) {
    const ci = colOf(next, m.id); if (ci < 0) return did ? next : null;
    next = widen(next, ci, Math.round(WIDTHS[m.width] * (space.w - 2 * PAD))); did = true;
  }
  return did ? next : null;
}

/** what in a piece's body answers to a part's words: an element whose data-part is them, else the smallest element
 *  whose own text holds them (a list's step, a table's row, a diff's file) */
export function partIn(root: ParentNode, part: string): HTMLElement | null {
  const want = part.trim().toLowerCase(); if (!want) return null;
  for (const e of root.querySelectorAll<HTMLElement>("[data-part]")) if ((e.dataset.part ?? "").toLowerCase() === want) return e;
  let best: HTMLElement | null = null, n = 0;
  for (const e of root.querySelectorAll<HTMLElement>("li, tr, h1, h2, h3, h4, p, summary, dt, [role=row], div, span")) {
    if (++n > 1500) break;
    const t = (e.textContent ?? "").toLowerCase();
    if (t.includes(want) && (!best || best.contains(e))) best = e;
  }
  return best;
}

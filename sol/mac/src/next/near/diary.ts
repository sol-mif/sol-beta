// A folder's own Diary up close (BR1 item 1, slots, #1615): its three ways out, each back to the folder or the canvas it
// opened from (the history, M.back; else one step out to its folder): Esc (hooks.keys, here, at import), the Back press
// at its top and a press outside the page (near/index.tsx DiaryNear). A pop-up over it (the bar's card, a peek) closes
// first with its own Esc or press outside; words being written keep their field's Esc.
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, M, S, hooks, isFolderDiary, regionOf, type Piece } from "../cv/core.ts";

/** where Back goes, in words: the place the history holds before this, else the folder the Diary sits in */
export function backTo(p: Piece): string {
  const last = S.hist[S.hist.length - 1];
  try {
    const o = last ? JSON.parse(last) as { dist?: string; region?: string | null; piece?: string | null; page?: string | null } : null;
    if (o?.page) return "the page you were on";
    if (o?.dist === "far") return "all your folders";   // the canvas, in a newcomer's words (Jev first_glance: "the canvas" 0.91 unclear)
    if (o?.dist === "near" && o.piece && D.pieces[o.piece]) return D.pieces[o.piece].name;
    if (o?.region && regionOf(o.region)) return regionOf(o.region)!.name;
  } catch { /* an entry not ours: the folder */ }
  return regionOf(p.region)?.name ?? "all your folders";
}
/** out of the Diary: back where it opened from, else one step out (to its folder) */
export function leaveDiary(): void { if (!M.back().ok) M.out(); }
export const atDiary = () => S.dist === "near" && !S.beside && !S.part && !!S.piece && isFolderDiary(S.piece) && D.pieces[S.piece]?.kind === "diary";
/** a pop-up open over it (the bar's card, a peek): its own Esc and press outside close it first, the Diary stays. One
 *  kept in the layer hidden (the moves list, #press) is not open */
export const popped = () => typeof document !== "undefined" && !!document.querySelector("#bar-card, #nx-over > :not([hidden])");
export function diaryKeys(e: KeyboardEvent): boolean {
  if (e.key !== "Escape" || e.metaKey || e.altKey || e.ctrlKey || !atDiary() || popped()) return false;
  const t = e.target as HTMLElement | null;
  if (t?.matches?.("input,textarea,select,[contenteditable]") && (t as HTMLInputElement).value) return false;   // words being written: the field's Esc
  leaveDiary();
  return true;
}
if (!hooks.keys.includes(diaryKeys)) hooks.keys.unshift(diaryKeys);


// owned by slice 11 (the move-in), docs/port/slices.md "Night 2, outlined"
// The move-in's phrases for the talk pill (round 6 · M1, #1615): "move in again" opens the screen with the choices as they
// stand; while it is up, "these are mine" and "skip" finish it. Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import { M, type Phrase } from "../core.ts";
import { st } from "../../movein/state.ts";

const phrases: Phrase[] = [
  { hears: /^(?:move in(?: again)?|keep,? fix or drop)$/, run: () => M.move_in() },
  { hears: /^(?:these are mine|that'?s mine|done moving in)$/, run: () => (st.open ? M.these_are_mine() : null) },
  { hears: /^(?:skip,? look later|skip the move-?in)$/, run: () => (st.open ? M.these_are_mine(true) : null) },
];
export default phrases;

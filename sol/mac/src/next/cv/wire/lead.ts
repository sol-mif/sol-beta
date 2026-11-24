// owned by slice R7 (one lead per piece), docs/port/slices.md
// The engine's messages the lead reads, live only. Its rows (harmony S13 a piece's parts and lead, S14 a hand-off and its
// return, S22 a lapsed sign-in that holds runs; #1617) are not in the engine yet, so live nothing is read: no piece has
// parts from here, nothing is handed out, nothing lapses, and the views draw nothing for them. The moves answer
// { ok: false, why: "not yet" } (moves/lead.ts). Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import type { Engine } from "./types.ts";

export function attach(_e: Engine): void | (() => void) {
  return undefined;
}

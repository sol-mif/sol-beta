// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// The engine's messages the fits read, live only. Their row (harmony S15, fits.ts: a fit with its why and count, a hold,
// the reach, the weekly offer, what was learned; #1617, waiting on Frank) is not in the engine yet, so live nothing is
// read: no person has fits, the Diary carries no fit line, Settings shows its own care card, and the moves answer
// { ok: false, why: "not yet" } (moves/fits.ts). Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import type { Engine } from "./types.ts";

export function attach(_e: Engine): void | (() => void) {
  return undefined;
}

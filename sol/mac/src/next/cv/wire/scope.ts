// owned by slice R9 (why your AI used that, links, the done fold, Far at 500), docs/port/slices.md
// The engine's messages round 9 reads, live only. Their rows (harmony S18: a run's brief, its scope and slice; S19: the
// links with who made each, a cut as a hold; S29: done things folding after the learned span; #1617, waiting on Frank)
// are not in the engine yet, so live nothing is read: D.links stays empty, no result carries a brief, nothing folds, and
// the moves answer { ok: false, why: "not yet" } (moves/scope.ts). Signed: marcocyl04-ux's agent, port slice R9 (#1615).
import type { Engine } from "./types.ts";

export function attach(_e: Engine): void | (() => void) {
  return undefined;
}

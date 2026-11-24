// owned by slice 12 (Your own pieces), docs/port/slices.md
// The engine's messages Your own pieces would read (live only): none yet. A piece of your own, a proposal, an update that
// sets one aside and "Set all my pieces aside" have no engine rows (map.md), so live the moves answer "not yet"
// (cv/moves/pieces.ts), the canvas draws no "yours" tag and the page says "Nothing of yours yet". The fixture carries them.
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import type { Engine } from "./types.ts";

export function attach(_e: Engine): () => void {
  return () => {};
}

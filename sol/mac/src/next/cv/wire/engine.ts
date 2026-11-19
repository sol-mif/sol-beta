// owned by slice 7 (Engine next/), docs/port/slices.md
// The engine's messages this slice reads into D (live only; the fixture never runs a wire). attach(e) runs once when the
// new face opens in a real Sol and may return its undo. A stub until the slice lands.
import type { Engine } from "./types.ts";

export function attach(_e: Engine): void | (() => void) {}

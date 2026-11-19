// The lens as one setting of yours (#954, build/whole.md "Deleted": the per-session lens pill; scene 11), behind
// stage.whole: picked once in Settings ("how work is drawn"), kept in this window's storage, and laid on every stage you
// open (StageColumn writes it to the session's stage.json, so the stage's own lens rules run as they did from the pill).
// The engine keeps it per session until it reads a user setting (whole.md "Engine changes": lens.ts).
import { useSyncExternalStore } from "react";
import type { Lens } from "./model";
import { LENSES } from "./lens";
import { stageWhole } from "../flag";
import { spineOn } from "../spine/flag";

/** the lens is one setting, not a pill per session: behind stage.whole (#954), and with the spine on (2026-11-11, Marco:
 *  the view is a Build setting, "mostly cosmetics": pick one and all of Build runs your projects that way) */
export const oneLens = () => stageWhole() || spineOn();

const KEY = "sol.lens";
const subs = new Set<() => void>();
const read = (): Lens => { try { const v = localStorage.getItem(KEY) as Lens | null; return v && LENSES.includes(v) ? v : "app"; } catch { return "app"; } };
let now = read();
export const userLens = () => now;
export function setUserLens(l: Lens) {
  try { localStorage.setItem(KEY, l); } catch { /* private */ }
  now = l;
  subs.forEach((f) => f());
}
export const useUserLens = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => now);
/** what each lens draws, in Settings' words (whole.html scene 11) */
export const LENS_HINTS: Record<Lens, string> = {
  app: "glass blocks, the jelly's light",
  tui: "panes in a grid, keys first",
  cli: "one transcript, things print in it",
  ide: "files left, blocks as editor groups",
};

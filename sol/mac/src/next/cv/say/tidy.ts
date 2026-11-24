// "tidy my folders", typed in the bar at any time (BR1, #1615; migration.html D, Marco 16:30): the move-in's sort made
// now, each move with its own Undo (cv/wire/tidy.ts tidyRun; the engine's parts/next-tidy.ts). Heard in the person's
// ordinary words for it, before the shared phrases (say/index.ts). Signed: marcocyl04-ux's agent (builder T), BR1 (#1615).
import type { Phrase } from "../core.ts";
import { tidyRun } from "../wire/tidy.ts";

/** "tidy my folders", "sort my folders", "tidy up my folders", "tidy the folders", "please tidy my folders" */
export const TIDY = /^(?:please )?(?:tidy|sort)(?: up)? (?:my|the|all my) folders(?: please)?[.!?]?$/;
const phrases: Phrase[] = [{ hears: TIDY, run: () => tidyRun() }];
export default phrases;

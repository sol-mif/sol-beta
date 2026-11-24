// owned by slice 11 (the move-in), docs/port/slices.md "Night 2, outlined"
// The move-in's wire (BR1, #1615; map.md "The move-in read": next/carry.ts, carry-apps.ts, next.movein.read/keep/lead).
//   attach                 next.movein.read once: what Sol's folders, Claude Code and Codex hold on this Mac (read only)
//   next.movein            the read → the screen's rows (movein/live.ts heard); its `lead` and `kept` → D.movein
//   next.movein.kept       what the engine kept (after a keep or a lead) → D.movein; its batch, a Back done or refused
//                          (movein/live.ts keptHeard: refused, the read opens again)
//   next.state             its `movein` → D.movein (the first run is when there is none yet); its `folders`, the one
//                          list of folders kept (engine movein.ts keptFolders), each drawn (movein/live.ts foldersHeard)
//   work.sessions, home.places, next.state   the plane redrew its folders: the choices made are applied again
// The fixture never runs this. Signed: marcocyl04-ux's agent, port slice 11 (#1615); live in BR1.
import { applyLive, foldersHeard, heard, keptHeard, link, listHeard, movedHeard, type Read } from "../../movein/live.ts";
import { heardFrom } from "../../movein/seenFirst.ts";
import { firstWord } from "../../movein/startup-state.ts";
import type { Engine } from "./types.ts";
import { tellNests as tellAll } from "./plane.ts";
import { shelfKnown } from "../../shelf/model.ts";

/** the nests said only once the canvas holds the one list and the Shelf is known, never from the folders work.sessions
 *  named before the list, nor a folder on the Shelf not heard yet (BR1 hold 1: try 3 said 8 where the canvas drew 7) */
const tellNests = () => { if (listHeard() && shelfKnown()) tellAll(); };

type Msg = Read & { type?: string; lead?: unknown; movein?: { lead?: unknown; keep?: unknown } | null };

export function attach(e: Engine): () => void {
  link.e = e;
  const off = e.subscribe((m: Msg) => {
    const t = m?.type;
    // a folder the move-in's read nests (another copy of a repo, BR1 order 4e) is said on the frame's line, as the plane's are
    if (t === "next.movein") { firstWord(m.kept ?? null); heardFrom({ lead: m.lead }); heard(m); tellNests(); }
    else if (t === "next.movein.kept") { heardFrom(m.movein ?? null); keptHeard(m); applyLive(); tellNests(); }
    else if (t === "next.state") { if ("movein" in m) { firstWord(m.movein ?? null); heardFrom(m.movein ?? null); movedHeard(m.movein); } foldersHeard(m.folders); applyLive(); tellNests(); }
    else if (t === "work.sessions" || t === "home.places") queueMicrotask(() => { applyLive(); tellNests(); });   // after the plane's wire drew them
    else if (t === "next.shelf") queueMicrotask(tellNests);   // after the Shelf's wire took it
  });
  e.send({ type: "next.movein.read" });
  return () => { off(); if (link.e === e) link.e = null; };
}

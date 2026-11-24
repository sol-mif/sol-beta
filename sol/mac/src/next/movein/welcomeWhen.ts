// When the welcome card (Welcome.tsx, BR1 #1615) is wanted: the move-in found nothing on this Mac (live: the engine's
// read came back with no folder; on the fixture the "empty" scenario), the canvas has no folder and no session, and the
// move-in screen is down. On the first launch the start-up (startup.ts) comes first: the card waits under it until its
// "Let’s move in". Plain, so the counts and the unit tests read it. Signed: marcocyl04-ux's agent, BR1 (#1615).
import { MODE, SCN, type Data } from "../cv/core.ts";
import { LIVE, live, st } from "./state.ts";
import { sup } from "./startup-state.ts";

export function wanted(d: Data): boolean {
  if (st.open || sup.up || d.regions.length || Object.values(d.pieces).some((p) => p.kind === "session")) return false;
  if (MODE === "fixture") return SCN === "empty";
  return live.answered && !live.data[LIVE]?.rows.some((r) => r.k === "place");
}

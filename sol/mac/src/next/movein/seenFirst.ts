// What the person sees first when Sol opens (BR1, #1615; mine/look/br1/narrow.html part 1): My day (the Diary leads),
// My work (folders lead) or Both, side by side. It matters most in a small window. The answer is D.movein.lead, the name
// the plane reads for its starting arrangement: "day" | "work" | "both", or null when never chosen. It is chosen only in
// Settings › Start screen (Lead.tsx; Marco, 2026-11-22, BR1 rapid): the move-in and the welcome card do not ask it. Live it
// is kept by the engine (next.movein.lead → SOL_HOME/next/movein.json, sent back on next.movein and next.state); on the
// fixture it is kept here for the session and put on D at every load. Unchosen, a first run reads as Both where the
// window holds them side by side (1280 px and up), else "day" (Marco 2026-11-22 14:10): the Diary is where Sol tells the
// person what it brought in (the plane asks hooks.firstLead when D says nothing; the
// fixture's first runs are its move-in scenarios, coder and empty, so every other scenario keeps the plane's own
// default). An answer lays the canvas out again by rule (the plane's setLead). Signed: marcocyl04-ux's agent, BR1 (#1615).
import { D, MODE, SCN, change, hooks, render } from "../cv/core.ts";
import { link } from "./live.ts";
import { arrangeSnap, byHand, setLead as arrange, unarrange } from "../plane/layout.ts";

export type Lead = "day" | "work" | "both";
export const LEADS: Lead[] = ["day", "work", "both"];

/** the fixture's answer, kept across loads */
export const fx = { lead: null as Lead | null };
/** live: `said` once the engine said (next.state, next.movein) */
export const heardLead = { said: false };

/** the answer as it stands: what the person said, or null */
export const leadNow = (): Lead | null => (D.movein?.lead ?? null) as Lead | null;
/** where unsaid is read as a start screen a new person keeps (first-timer P 6: it held only on the first run): live
 *  always; on the fixture, its move-in scenarios; the other scenarios keep the plane's own */
const FIRST = new Set(["coder", "empty"]);
const firstRun = (): boolean => (MODE === "fixture" ? FIRST.has(SCN) : true);
/** unsaid, both fit side by side in a window this wide or wider (Marco, 2026-11-22 14:10, BR1 conform 1: "both when it
 *  fits"); narrower, My day. The window's own width; outside a window (the tests) `win.w` says it */
export const FITS_PX = 1280;
export const win = { w: (): number => (typeof window !== "undefined" ? window.innerWidth : 1440) };
const unsaid = (): Lead => (win.w() >= FITS_PX ? "both" : "day");
/** the starting arrangement: the answer, else where unsaid is read (a first run): Both where the window holds the Diary
 *  beside the cards, as frame.html and bar-folder.html draw it, else My day; else null (the plane's own default). An
 *  answer in Settings is kept at every width */
export const startLead = (): Lead | null => leadNow() ?? (firstRun() ? unsaid() : null);
/** what the canvas leads with as it stands: the starting arrangement, else both side by side (the rule's own) */
export const leadShown = (): Lead => startLead() ?? "both";
/** the person's own places hold the canvas: a choice changes nothing there until it is laid out again (the plane's rule) */
export const heldByHand = (): boolean => byHand();
/** the canvas laid out again for this choice, the person's own places too (BR1 first-timer 5, builder F); the answer puts
 *  it back as it was */
export function layOutAgain(lead: Lead): () => void {
  const was = arrangeSnap();
  for (const q of Object.values(D.pos || {})) if (q.by === "person") { q.by = "rule"; delete q.hand; }
  setLead(lead);
  render();
  return () => { unarrange(was); render(); };
}
(hooks as { firstLead?: () => Lead | null }).firstLead = () => (firstRun() ? unsaid() : null);

/** the person's answer (Settings › Start screen). Live it goes to the engine, which keeps it and tells every window */
export function setLead(lead: Lead | null): void {
  arrange(lead);   // the plane's: D.movein.lead, and the rule's places laid out again from it
  change((d) => { d.movein = { ...(d.movein || {}), lead }; });
  if (MODE === "fixture") { fx.lead = lead; render(); return; }
  link.e?.send({ type: "next.movein.lead", lead });
}

/** the engine's word on the move-in (next.movein's `lead`, next.state's `movein`), put on D */
export function heardFrom(m: { lead?: unknown } | null | undefined): void {
  const lead = m && LEADS.includes(m.lead as Lead) ? (m.lead as Lead) : null;
  const fresh = !heardLead.said;
  if (fresh) heardLead.said = true;
  if (!fresh && (D.movein?.lead ?? null) === lead) return;
  arrange(lead);   // the first word may come after the plane's first layout: lay the rule's places out from it
  change((d) => { d.movein = { ...(d.movein || {}), lead }; });
}

// the fixture: the answer stays across loads (a load makes D afresh)
hooks.onLoad.push((d) => { if (MODE === "fixture") d.movein = { lead: fx.lead }; });

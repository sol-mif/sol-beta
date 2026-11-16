// Cowork v3's doors into today's face (fr-30). The only v3 file the hook files import statically: the switch and three
// lazy parts. With the switch off nothing here renders and no other v3 module is fetched (each part is its own chunk,
// loaded the first time it draws). The switch is the engine's word: settings.cowork.v3 (the me layer), which the
// engine sends already resolved against SOL_COWORK_V3 (engine/src/settings.ts coworkV3).
import { lazy, Suspense } from "react";
import type { useEngine } from "../../useEngine";
import type { Work } from "../../work/useWork";

export { v3On, useV3On } from "./flag";   // the switch: its one reading is flag.ts

type E = ReturnType<typeof useEngine>;
const StageL = lazy(() => import("./Stage"));
const RowMarkL = lazy(() => import("./RowMark"));
const PageFootL = lazy(() => import("./PageFoot"));

/** the composer's door: the stage over the talk, the arrived row, the agent's proposals (Composer.tsx) */
export const V3Stage = (p: { w: Work; e: E }) => <Suspense fallback={null}><StageL {...p} /></Suspense>;
/** the sidebar's door: a project's fold is a landing place, with what just arrived as +N (WorkSidebar.tsx) */
export const V3RowMark = (p: { room: string }) => <Suspense fallback={null}><RowMarkL {...p} /></Suspense>;
/** the page pane's door (PagePane.tsx, gone with the swap, #718): nothing draws it now; where a page block's goes is Cowork's call */
export const V3PageFoot = (p: { w: Work; title: string; path?: string }) => <Suspense fallback={null}><PageFootL {...p} /></Suspense>;

/** the composer, before it sends: words that make a thing in a session with a project chip go to the stage instead.
 *  Sync on purpose (the box clears at once): true = taken; the engine is then asked, and words it does not make into a
 *  thing are said as a message after all (`say`), so nothing typed is ever lost */
export function v3Make(w: Work, e: Pick<E, "send" | "subscribe">, text: string, say: (text: string) => void): boolean {
  const s = w.live ? w.sessions.find((x) => x.id === w.live) : undefined;
  if (!s?.roomId || !looksMade(text)) return false;
  void import("./store").then((m) => m.make(e, { sessionId: s.id, room: s.roomId!, roomName: w.roomNames[s.roomId!] ?? "", topic: s.title, text })).then((made) => { if (!made) say(text); }, () => say(text));
  return true;
}
// the engine decides (team/v3/crossing.ts parse); this only keeps plain talk on today's path without a round trip
const looksMade = (t: string) => !t.startsWith("/") && (
  /\b(item|todo|to-do|task|remind|should go|assign|due|by|tomorrow|today|tonight)\b/i.test(t) ||
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t) ||
  /\b(every|each)\s+\w+|\bwhenever\b|^automate\b/i.test(t) || /^(write|draft|start|make)\s+(up\s+)?(a|an|the)\s+(doc|document|page|brief|spec)/i.test(t) ||
  /^(note\b|tell the team|let the team know|remember that|for the team:)/i.test(t) || /\b(to|for|ask)\s+[A-Z][a-z]{2,}\b/.test(t));

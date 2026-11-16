// Sources (#796, plan Part C slice 33), behind sol.home.whole: what the face holds of Sources, and where on Home you are
// (today or sources). It asks with the messages policy.ts names and keeps the last `home.sources` the engine sent. The
// transport is policy.ts's stub until #828 lands; then `send` is the engine's socket and nothing else here changes.
import { useSyncExternalStore } from "react";
import { stub, type SourcesAsk, type SourcesMsg, type Rung, type SourceId } from "./policy.ts";

let view: SourcesMsg | null = null;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
let engine: ((a: SourcesAsk) => SourcesMsg) | null = null;
/** ask Sources' engine (the stub, until #828) */
export function send(a: SourcesAsk) { engine ??= stub(); view = engine(a); tell(); }
export const setRung = (id: SourceId, rung: Rung) => send({ type: "home.source.set", id, rung });
export const writePolicy = (text: string) => send({ type: "home.policy.write", text });
export const repair = (id: SourceId) => send({ type: "home.source.repair", id });
export const keepLearned = (id: string) => send({ type: "home.learned.keep", id });
export const dropLearned = (id: string) => send({ type: "home.learned.drop", id });
export const undoSources = (ledgerId: string) => send({ type: "home.sources.undo", ledgerId });
/** what the store holds now (for the tests; the face reads it through useSources) */
export const sourcesNow = () => view;
export function useSources(): SourcesMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send({ type: "home.sources" }); return () => { subs.delete(f); }; }, () => view);
}

// ── where on Home you are: today, or sources (the side's "sources" is slice 36's; until then the core's own link) ────
export type Place = "today" | "sources" | "done" | "folder" | "people" | "week" | "jev" | "browser" | "trust" | "flows";   // C44 (#807): "week", three calendars as one; C40 (#803): "jev", Jev all day; C42 (#805): "browser", your browser; C43 (#806): "trust", the trust and the page ledger; C39 (#802): "flows", the flows page
// C34 (#797) added "done", the evening fold; C36 (#799) "folder" and "people"
let place: Place = "today";
const placeSubs = new Set<() => void>();
export function goTo(p: Place) { if (p !== place) { place = p; placeSubs.forEach((f) => f()); } }
export const usePlace = (): Place => useSyncExternalStore((f) => { placeSubs.add(f); return () => { placeSubs.delete(f); }; }, () => place);

// Home's first screen (#791): the one list as the face holds it. It asks with the messages home/whole.md names
// (home.today, home.answer, home.later, home.undo) and keeps what comes back: Today, the things, and the last receipt.
// The transport is the stub (today.ts) until the engine half lands (#790); then `send` is the engine's socket and
// `take` is fed from its subscribe, and nothing else here changes.
import { useSyncExternalStore } from "react";
import { type Ask, type DoneMsg, type Thing, type Today, type TodayMsg } from "./today.ts";
import { bus, listenOthers } from "./bus.ts";   // C31
import type { Filed, Learned } from "./reads.ts";   // C29

export type View = { today: Today | null; things: Map<string, Thing>; done: DoneMsg | null };
let view: View = { today: null, things: new Map(), done: null };
const subs = new Set<() => void>();

function take(m: TodayMsg | DoneMsg) {
  if (m.type === "home.today") view = { ...view, today: m.today, things: new Map(m.things.map((t) => [t.id, t])) };
  else view = { ...view, done: m };
  subs.forEach((f) => f());
}

let engine: ((a: Ask) => (TodayMsg | DoneMsg)[]) | null = null;
// C31 (#794): the stub shared by Home and the notch (bus.ts): what another window asked arrives here as from the engine;
// its answer brings its receipt (with the undo), its undo takes the receipt away
function heard(ms: (TodayMsg | DoneMsg)[]) {
  if (!ms.some((m) => m.type === "home.done")) view = { ...view, done: null };
  for (const m of ms) take(m);
  subs.forEach((f) => f());
}
function connect() {   // C31
  const b = bus(heard); listenOthers(() => b.pull());
  // an answer given in another window before this one opened (the notch while Home was closed) keeps its receipt and
  // its undo here, and ⌘Z with it (#860 R1); an undo last leaves none
  const done = b.replayed.find((m): m is DoneMsg => m.type === "home.done");
  if (done) view = { ...view, done };
  return b.send;
}
/** ask the list's engine (the stub, until #790) */
export function send(a: Ask) {
  engine ??= connect();   // C31: was stub()
  for (const m of engine(a)) take(m);
  if (a.type === "home.undo") { view = { ...view, done: null }; subs.forEach((f) => f()); }
}
export const answer = (thingId: string, words: string) => send({ type: "home.answer", thingId, answer: words });
export const later = (thingId: string) => send({ type: "home.later", thingId });
export const undo = (ledgerId: string) => send({ type: "home.undo", ledgerId });
// C29 (#792): Enter files a sentence's parts; an override is a learned line
export const file = (parts: Filed[]) => send({ type: "home.file", parts });
export const learn = (learned: Learned) => send({ type: "home.learn", learned });
/** what the store holds now (C31: for the tests; the face reads it through useToday) */
export const viewNow = (): View => view;
export const forget = () => { if (view.done) { view = { ...view, done: null }; subs.forEach((f) => f()); } };

export function useToday(): View {
  return useSyncExternalStore((f) => { subs.add(f); if (!view.today) send({ type: "home.today" }); return () => { subs.delete(f); }; }, () => view);
}

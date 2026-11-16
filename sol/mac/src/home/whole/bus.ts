// The one list across the face's windows (#794, plan Part C slice 31; home/whole.md "The question card", "The seams"),
// behind sol.home.whole. Home and the notch are two windows; the engine will be the one list both read (#790: every
// window subscribes to `home.today` and gets the same message after anyone's ask). Until then each window keeps its own
// stub (today.ts) and this bus keeps them the same: every ask that changes the list (an answer, a later, an undo) is
// written to one log in this origin's storage, and every window replays the log it has not seen yet. A window opened
// later (the notch after Home) replays the day's log first, so it starts where the others are. The `storage` event
// carries the news to the other windows; the window that asked gets its answers back at once, as from the engine.
//
// Stubbed until the engine half lands: the shapes are the engine's (Ask in, TodayMsg and DoneMsg out); swapping the
// bus for the engine's socket is store.ts's transport line.
import { stub, type Ask, type DoneMsg, type TodayMsg } from "./today.ts";

export const LOG_KEY = "sol.home.whole.asks";
type Msg = TodayMsg | DoneMsg;
type Log = { day: string; asks: Ask[] };
/** the store this origin shares across windows (localStorage), or none (tests, a private window) */
export type Shelf = { get(k: string): string | null; set(k: string, v: string): void };
const local = (): Shelf | null => {
  try { const s = globalThis.localStorage; return s ? { get: (k) => s.getItem(k), set: (k, v) => s.setItem(k, v) } : null; } catch { return null; }
};
const dayOf = (now: number) => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** one window's end of the bus: `send` asks (and logs what changes the list), `pull` replays what other windows asked
 *  since, handing the messages of the last of them to `heard` (the store) */
export function bus(heard: (ms: Msg[]) => void, now: () => number = Date.now, shelf: Shelf | null = local()) {
  let ask = stub(now);
  let seen = 0, seenDay = dayOf(now());
  const read = (): Log => {
    try { const l = JSON.parse(shelf?.get(LOG_KEY) ?? "") as Log; if (l.day === dayOf(now()) && Array.isArray(l.asks)) return l; } catch { /* none yet */ }
    return { day: dayOf(now()), asks: [] };
  };
  /** replay the asks this window has not applied: the others' answers reach this window's list */
  const pull = (quiet = false) => {
    const l = read();
    // a new day (#860 R2: by the log's day, not its length, which today's first ask can bring back to yesterday's), or
    // the log cleared: start again from the seed
    if (l.day !== seenDay || l.asks.length < seen) { seen = 0; seenDay = l.day; ask = stub(now); }
    const fresh = l.asks.slice(seen);
    seen = l.asks.length;
    let last: Msg[] = [];
    for (const a of fresh) last = ask(a);
    if (!quiet && fresh.length) heard(last);
    return last;
  };
  /** what the day's log left when this window opened: the last ask's answer, so a window opened after an answer
   *  elsewhere (Home after the notch) still shows its receipt with the undo (#860 R1) */
  const replayed = pull(true);
  const send = (a: Ask): Msg[] => {
    pull();
    const out = ask(a);
    if (a.type !== "home.today" && a.type !== "home.learn" && shelf) {   // C29: a learned line changes nothing on the list
      const l = read();
      shelf.set(LOG_KEY, JSON.stringify({ day: l.day, asks: [...l.asks, a] }));
      seen = l.asks.length + 1; seenDay = l.day;
      nudge();
    }
    return out;
  };
  return { send, pull, replayed };
}

// the news that the log grew, three ways, as the face's other cross-window news goes (renovation.ts askOpen): the
// storage event (every other window of this origin), a BroadcastChannel, and in the app a Tauri event to every webview
const NEWS = "sol.home.whole";
const inApp = () => typeof window !== "undefined" && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
function nudge() {
  try { const ch = new BroadcastChannel(NEWS); ch.postMessage(1); ch.close(); } catch { /* no channel */ }
  if (inApp()) import("@tauri-apps/api/event").then((ev) => ev.emit(NEWS, 1)).catch(() => {});
}

/** listen for the other windows' asks; `pull` is idempotent, so the same news by two ways is one replay */
export function listenOthers(pull: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const f = (e: StorageEvent) => { if (e.key === LOG_KEY) pull(); };
  window.addEventListener("storage", f);
  let ch: BroadcastChannel | null = null;
  try { ch = new BroadcastChannel(NEWS); ch.onmessage = () => pull(); } catch { /* none */ }
  let off: (() => void) | null = null, gone = false;
  if (inApp()) import("@tauri-apps/api/event").then((ev) => ev.listen(NEWS, () => pull())).then((u) => { if (gone) u(); else off = u; }).catch(() => {});
  return () => { gone = true; window.removeEventListener("storage", f); ch?.close(); off?.(); };
}

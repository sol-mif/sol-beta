// The pause signal (#1597, part 1 of #1587): the moments the person stops on this Mac, so a question waits for one
// instead of showing mid-sentence. The app's own process (sol/mac/src-tauri/src/pause.rs) watches three things with
// the window open or closed and tells each turn here, on POST /pause (parts/pause.ts):
//   typing   no key or mouse for a moment after some (Quartz idle time, the same reading as presence's idleSeconds)
//   app      another app came to the front (NSWorkspace's front app)
//   call     the default microphone went from in use to idle (CoreAudio); nothing of the call itself is read
// Two senses closer than GAP_MS are one pause. Each pause is told to every face as { type: "pause", why, at } and lets
// the oldest waiting question through, one per pause. Behind the switch pause.signal (settings.ts pauseSignal), off by
// default: off, nothing is told and a question goes at once, as before, and the app reads nothing: it only asks, once a
// minute, with a POST /pause that has no why (#1640). A person away for long makes one pause only,
// when the quiet begins; whether the quiet itself should count again later is Marco's to say (#1587).
import { pauseSignal } from "./settings.js";

export const WHYS = ["typing", "app", "call"] as const;
export type Why = (typeof WHYS)[number];
/** two senses closer than this are one pause (an app switch while typing stops is one moment, not two) */
export const GAP_MS = 3_000;
/** questions waiting at most; the oldest past it goes at once rather than be lost */
export const WAIT_MAX = 50;

let tell: (m: object) => void = () => {};
let lastAt = 0;
let lastWhy: Why | null = null;
const waiting: { fn: () => void }[] = [];

/** who hears a pause: every face (parts/pause.ts at start) */
export function setPauseFaces(f: (m: object) => void) { tell = f; }

const run = (fn: () => void) => { try { fn(); } catch (e) { console.log(`pause: a waiting question threw: ${e instanceof Error ? e.message : e}`); } };

/** one sense from the app's process; true when it made a pause (the switch is on, the why is known, and the last pause
 *  is GAP_MS behind) */
export function sensed(why: unknown, now = Date.now()): boolean {
  if (!pauseSignal()) return false;
  if (!(WHYS as readonly unknown[]).includes(why)) return false;
  if (lastAt && now - lastAt < GAP_MS) return false;
  lastAt = now;
  lastWhy = why as Why;
  tell({ type: "pause", why, at: now });
  const next = waiting.shift();
  if (next) run(next.fn);
  return true;
}

/** hold `fn` (a question's showing) until the next pause; returns its cancel. Off, `fn` runs now */
export function atNextPause(fn: () => void): () => void {
  if (!pauseSignal()) { run(fn); return () => {}; }
  const w = { fn };
  waiting.push(w);
  if (waiting.length > WAIT_MAX) run(waiting.shift()!.fn);
  return () => { const i = waiting.indexOf(w); if (i >= 0) waiting.splice(i, 1); };
}

/** what the signal stands at, for the route's answer and a test */
export function pauseNow() {
  return { on: pauseSignal(), lastAt: lastAt || null, lastWhy, waiting: waiting.length };
}

/** a test's fresh start */
export function resetPause() { lastAt = 0; lastWhy = null; waiting.length = 0; tell = () => {}; }

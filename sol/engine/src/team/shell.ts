// The shell's own update (J4 of #1824; the shared terms: docs/br1-backend-sort-2026-11-22/J/CONTRACT.md §4, §6). Sol.app
// updates itself with Tauri's updater; the engine is asked two things and told what happened, and touches nothing of it:
//   the ask    POST /shell/update (parts/shell-update.ts), JSON only like POST /pause, answered { paused, relaunch, why? }:
//              paused is the engine's own `pause updates` (settings.ts updatesPaused, the switch installRelease honours,
//              or the Ship's own when one was handed in) or a pin (pin.ts pinNow); relaunch is false, why "swapping",
//              while anything moves this checkout or its engine (movingNow): an update (ship.ts swappingNow), a release
//              built aside or waiting for its quiet moment (ship.ts installingNow), a go back (pin.ts goingNow), a
//              carry's move (carry.ts), or the engine that came with a swap has not yet stayed up its minute (a .swap
//              younger than SWAP_HOLD_MS: the renew, the keeper's start and its way back, keep #1576). While the engine
//              is down it cannot answer at all: no answer, or not a 200, is a no too (CONTRACT.md §6).
//   the word   the same body may carry what the shell's updater did: { event: found | downloaded | failed | ready | idle,
//              version?, why? }. Every face hears it as `team.shell { event, version?, why?, at }`, once each (the shell says
//              its standing word on every check); idle clears it to `team.shell { event: null }`. A face that connects asks
//              with team.shell.get. Kept in memory only: after a renew the shell's next check says it again.
// Everything in the body is untrusted (any program on this Mac can post it): an unknown event or a version that is not one
// is not heard, why is one line of WHY_MAX at most, and the answer goes out either way.
import { statSync } from "node:fs";
import { join } from "node:path";
import { updatesPaused } from "../settings.js";
import { installingNow, shipNow, swappingNow, SWAP } from "./ship.js";
import { goingNow, pinNow } from "./pin.js";
import { carryNow } from "./carry.js";

export type ShellEvent = "found" | "downloaded" | "failed" | "ready";
export const EVENTS: readonly (ShellEvent | "idle")[] = ["found", "downloaded", "failed", "ready", "idle"];
export type ShellWord = { type: "team.shell"; event: ShellEvent; version?: string; why?: string; at: number } | { type: "team.shell"; event: null };
export type ShellAnswer = { paused: boolean; relaunch: boolean; why?: "swapping" };
/** the longest why a face is shown */
export const WHY_MAX = 140;
/** a version as the shell's tauri.conf.json carries it (CONTRACT.md §2: 0.<YYYYMMDD>.<HHMM>, or the repo's 0.1.0) */
const VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;

let word: ShellWord = { type: "team.shell", event: null };
let tell: (m: object) => void = () => {};

/** where a word goes: every face (parts/shell-update.ts hands in the engine's everyone) */
export const setShellFaces = (fn: (m: object) => void) => { tell = fn; };
/** the standing word, for team.shell.get */
export const shellNow = (): ShellWord => word;
/** back to no word (the tests) */
export const resetShell = () => { word = { type: "team.shell", event: null }; };

/** how long a .swap holds a relaunch: the keeper clears it once the new engine stays up its minute; one older than this
 *  was left by an engine with no keeper (run by hand), and holds nothing */
export const SWAP_HOLD_MS = 10 * 60_000;
const freshSwap = (): boolean => {
  const root = shipNow()?.root;
  if (!root) return false;
  try { return Date.now() - statSync(join(root, "engine", SWAP)).mtimeMs < SWAP_HOLD_MS; }
  catch (e) { return (e as NodeJS.ErrnoException).code !== "ENOENT"; }   // only none is none: one it cannot read (EACCES) may be mid-swap
};
export type Moving = { swapping: () => boolean; installing?: () => string; going: () => string; carrying: () => string | undefined; swap: () => boolean };
const pausedNow = () => (shipNow()?.paused ?? updatesPaused)() === true;
// a release waiting under pause updates does not swap until it is off: no hold, or a shell downloaded before the pause would
// wait on it for good
const installingHeld = () => (pausedNow() ? "" : installingNow());
const MOVING: Moving = { swapping: swappingNow, installing: installingHeld, going: goingNow, carrying: () => carryNow()?.stage, swap: freshSwap };
/** whether anything is moving this checkout or its engine now (pure on its deps) */
export const movingNow = (m: Moving = MOVING): boolean => m.swapping() || !!m.installing?.() || !!m.going() || m.carrying() === "moving" || m.swap();

/** what the shell is answered: pause updates or a pin (CONTRACT.md §4: pinned, the shell neither climbs nor falls), and
 *  whether it may relaunch now */
export function shellAnswer(): ShellAnswer {
  const paused = pausedNow() || !!pinNow();
  return movingNow() ? { paused, relaunch: false, why: "swapping" } : { paused, relaunch: true };
}

/** a body's word (pure): the word it carries, "idle", or null when it carries none that is heard */
export function wordOf(body: unknown, at = Date.now()): ShellWord | "idle" | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: unknown; version?: unknown; why?: unknown };
  if (typeof b.event !== "string" || !EVENTS.includes(b.event as ShellEvent)) return null;
  if (b.event === "idle") return "idle";
  if (b.version !== undefined && (typeof b.version !== "string" || b.version.length > 30 || !VERSION.test(b.version))) return null;
  const why = typeof b.why === "string" ? b.why.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, WHY_MAX) : "";
  return { type: "team.shell", event: b.event as ShellEvent, ...(b.version ? { version: b.version } : {}), ...(why ? { why } : {}), at };
}

/** the shell's body heard: its word, if any, told to every face when it changed; the answer either way */
export function shellHeard(body: unknown): ShellAnswer {
  const w = wordOf(body);
  if (w === "idle") {
    if (word.event !== null) { word = { type: "team.shell", event: null }; tell(word); }
  } else if (w) {
    const said = (x: ShellWord) => JSON.stringify({ ...x, at: 0 });   // the same word again, whenever said, is not new
    if (said(word) !== said(w)) { word = w; tell(w); }
  }
  return shellAnswer();
}

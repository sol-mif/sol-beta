// A window that stops reading (#1107). The engine writes every message to every window; what a window has not read
// waits in its socket, and `ws` keeps a text message there as the JS string it was given, in the engine's own heap
// (two bytes a character once the text holds Chinese). The heartbeat closes a socket that stops answering, but a
// round it judges late (the Mac slept, or macOS ran the engine's timers late) closes nobody, so nothing else bounds
// it: 600 session lists to one stalled window held 223 MB. Past BACKLOG_MAX unread, the window is let go; a live
// one opens a new socket at once (sol/mac/src/socket.ts) and is sent everything again. `bufferedAmount` counts a
// string's characters, so the heap a window can hold is up to about twice this. The biggest single message measured,
// a 54 MB session's work.thread, is under 1 MB, so a window that reads is never near it.
export const BACKLOG_MAX = 64 * 1024 * 1024;

type Behind = { bufferedAmount: number; terminate(): void };

let most = 0;   // the largest backlog seen since the memory line last asked (parts/memory.ts)
/** the largest backlog any window had since the last ask, in bytes; asking starts the count again */
export function largestBacklog(): number { const n = most; most = 0; return n; }

/** true when this window is so far behind that it was let go (and nothing more should be sent to it) */
export function letGoIfBehind(ws: Behind, max = BACKLOG_MAX, say: (line: string) => void = console.log): boolean {
  const n = ws.bufferedAmount;
  if (n > most) most = n;
  if (n <= max) return false;
  say(`backlog: a window had ${Math.round(n / 1048576)} MB it had not read; its socket is closed (#1107)`);
  ws.terminate();
  return true;
}

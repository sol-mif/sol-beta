// The one notification, the window's side (#845, "one moment, one place, never two"). The engine alone makes a moment
// (engine/src/notify.ts) and sends it to one face: this window while Sol is on Marco's screen, else
// one native banner on his Mac. The window draws its moments in place:
//   the session row's dot      in the moment's colour (MomentDot), until the session is opened
//   the jelly in the bar       lights once as a moment arrives (the halo's arriving)
//   the bar's line             the newest moment of the session in front (BarMoment)
// Seen goes up from here only for a moment this window was sent (the engine checks the destination too): opening the
// session sees its own; the bar's ×, or answering in the session in front, sees the line.
//
// The wire (PROTOCOL.md round 97, engine/src/notify.ts):
//   in   { type: "moment", id, kind, sessionId?, seat, line, at }   { type: "moment.gone", id }
//   out  { type: "seen", id }
// No other sender: the face never makes a moment, it only sees one.
import { useSyncExternalStore } from "react";
import { FUNCTIONAL, GRADIENTS } from "../creature/palette.ts";
import type { RGB } from "../creature/ring.ts";

/** what a moment is about, as the engine names it (notify.ts MomentKind); the colour of its dot. done: a turn ended
 *  and it is his move. question / permission: one waits. failed: a run or a turn failed. green: a PR went green. hand: an
 *  issue handed to him. stable: a new stable. ping: the agent's own line (the ping tool). */
export type Kind = "done" | "question" | "permission" | "failed" | "green" | "hand" | "stable" | "ping";
export type Moment = { id: string; kind: Kind; sessionId?: string; seat: string; line: string; at: number };

/** Settings' one list, in the order it shows (on or off each, kept as settings.notify.moments) */
export const KINDS: [Kind, string][] = [
  ["done", "a turn is done, your move"],
  ["question", "a question waits"],
  ["permission", "a permission waits"],
  ["failed", "a run failed"],
  ["green", "a pull request is green"],
  ["hand", "an issue is handed to you"],
  ["stable", "a new stable is out"],
  ["ping", "the agent pings you"],
];
const KNOWN: ReadonlySet<string> = new Set(KINDS.map(([k]) => k));
/** the engine's kind; one this face does not know yet (an engine newer than the face) is drawn as a ping */
export const kindOf = (k: unknown): Kind => (KNOWN.has(String(k)) ? (String(k) as Kind) : "ping");

/** the dot's colours: green your move, yellow a question, red failed; a ping, a hand and a stable wear the jelly's bands */
export function coloursOf(k: Kind): readonly RGB[] {
  if (k === "done" || k === "green") return [FUNCTIONAL.green.strong];
  if (k === "question" || k === "permission") return [FUNCTIONAL.yellow.strong];
  if (k === "failed") return [FUNCTIONAL.red.strong];
  return GRADIENTS.sol;
}
/** the CSS of a dot: one colour, or the jelly's bands as a gradient */
export function dotPaint(k: Kind): string {
  const c = coloursOf(k);
  const rgb = (x: RGB) => `rgb(${x[0]},${x[1]},${x[2]})`;
  return c.length === 1 ? rgb(c[0]) : `linear-gradient(135deg, ${c.map(rgb).join(", ")})`;
}

// ---- the store: this window's unseen moments, oldest first ----
export type Snap = { moments: readonly Moment[]; arrived: number; last: Moment | null };
const ZERO: Snap = { moments: [], arrived: 0, last: null };
let snap: Snap = ZERO;
const subs = new Set<() => void>();
const set = (patch: Partial<Snap>) => { snap = { ...snap, ...patch }; subs.forEach((f) => f()); };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const current = () => snap;
export const useMoments = (): Snap => useSyncExternalStore(subscribe, current, current);

/** a message from the engine, as a moment, or null */
export function asMoment(m: any): Moment | null {
  if (m?.type !== "moment" || m.id === undefined || m.id === null || m.id === "") return null;
  return {
    id: String(m.id), kind: kindOf(m.kind),
    sessionId: m.sessionId ? String(m.sessionId) : undefined,
    seat: String(m.seat ?? "claude"),
    line: String(m.line ?? "").replace(/\s+/g, " ").trim(),
    at: Number(m.at) || Date.now(),
  };
}

/** the engine's word; returns true when it was a moment's */
export function feed(m: any): boolean {
  const t = typeof m?.type === "string" ? m.type : "";
  if (t === "moment") {
    const x = asMoment(m);
    if (!x || snap.moments.some((y) => y.id === x.id)) return true;
    set({ moments: [...snap.moments, x], arrived: snap.arrived + 1, last: x });
    return true;
  }
  if (t === "moment.gone") {
    const id = String(m.id ?? "");
    if (snap.moments.some((y) => y.id === id)) set({ moments: snap.moments.filter((y) => y.id !== id) });
    return true;
  }
  return false;
}

// the wire out; main.tsx (through link) gives it, the tests a fake
let out: (o: object) => void = () => {};
export function wireMoments(send: (o: object) => void) { out = send; }

/** seen here: gone from this window, and the engine is told (it alone forgets it everywhere) */
export function seen(id: string) {
  if (!snap.moments.some((y) => y.id === id)) return;
  out({ type: "seen", id });
  set({ moments: snap.moments.filter((y) => y.id !== id) });
}
/** a session opened: its moments are seen */
export function seenSession(sessionId?: string | null) {
  if (!sessionId) return;
  for (const x of snap.moments.filter((y) => y.sessionId === sessionId)) seen(x.id);
}
/** the link came back: the engine sends what is still unseen again, so the window starts empty */
export function relinked() { set({ moments: [], last: null }); }
export const forSession = (sessionId?: string | null) => (sessionId ? snap.moments.filter((y) => y.sessionId === sessionId) : []);

/** tests */
export const _reset = () => { snap = ZERO; out = () => {}; };

// What the engine keeps for the sidebar (#1879 step 3; engine next/keeps.ts, protocol next/protocol/KEEPS.md): the last time
// the person was present, when each session or page was last seen, what is pinned, each folder's last use. This is the
// face's one copy of them (cv/wire/keeps.ts fills it and sends the changes) and the pure rules that turn them into the
// sidebar's groups: Check in's Done while away, Back to and Kept, and Recent. Every rule is general: groups of at most 4,
// quiet at zero, most recent first. In a fixture nothing is kept by an engine, so the fixture is given what the engine
// would send (fixtureKeeps), enough for Recent and for "while you were away"; the other three stay at zero.
// Signed: marcocyl04-ux's agent, #1879 step 3.
import { D, MODE, folderOrder, type Piece } from "./cv/index.ts";

export type Times = Record<string, number>;
export type Keeps = { present: number | null; away: number | null; seen: Times; pinned: Times; uses: Times };
/** the most a group shows */
export const MOST = 4;
/** the person is "away" after this long without a ping: coming back after it starts a new away (ms) */
export const GAP = 30 * 60_000;

const empty = (): Keeps => ({ present: null, away: null, seen: {}, pinned: {}, uses: {} });
let kept: Keeps = empty();
const fixtures = new WeakMap<object, Keeps>();
const HOUR = 3_600_000;

/** what the engine would send for a fixture's account: each folder used an hour apart, in the order the canvas lists
 *  them, and the person away since 8 hours ago */
export function fixtureKeeps(order: string[], now = Date.now()): Keeps {
  return { present: now - 8 * HOUR, away: now - 8 * HOUR, seen: {}, pinned: {}, uses: Object.fromEntries(order.map((id, i) => [id, now - (i + 1) * HOUR])) };
}

/** the keeps now: the engine's in a real Sol, a fixture's own on the dev page and in tests */
export function K(): Keeps {
  if (MODE !== "fixture") return kept;
  let k = fixtures.get(D);
  if (!k) { k = fixtureKeeps(folderOrder()); fixtures.set(D, k); }
  return k;
}

/** next.keeps, as the engine sent it (the first answer of a window also says when the person was last here: `away`) */
export function take(m: { present?: unknown; seen?: unknown; pinned?: unknown; uses?: unknown }): void {
  const times = (v: unknown): Times => Object.fromEntries(Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).filter(([, t]) => typeof t === "number" && t > 0)) as Times;
  const present = typeof m.present === "number" ? m.present : null;
  // away: from the first answer, the last time the person was present before this window; later answers never move it
  kept = { present, away: kept.away ?? present, seen: times(m.seen), pinned: times(m.pinned), uses: times(m.uses) };
}
/** a ping's answer: `was` is the time kept before it. Back after a long gap, the gap's start is the new "away" */
export function pinged(was: number | null, at: number): void {
  kept.present = at;
  if (was !== null && at - was >= GAP) kept.away = was;
}
/** this window's own change at once (the engine's answer follows and is the same) */
export function noteUse(folder: string, at = Date.now()): void { kept.uses = { ...kept.uses, [folder]: at }; }
export function noteSeen(id: string, at = Date.now()): void { kept.seen = { ...kept.seen, [id]: at }; }
export function notePin(id: string, on: boolean, at = Date.now()): void {
  const { [id]: _was, ...rest } = kept.pinned;
  kept.pinned = on ? { ...rest, [id]: kept.pinned[id] ?? at } : rest;
}
export function reset(): void { kept = empty(); }

/** how long the person was away: "40 minutes", "3 hours", "2 days"; "" when it is not known or is under a gap */
export function awayWords(away: number | null, now = Date.now()): string {
  if (away === null || now - away < GAP) return "";
  const h = Math.round((now - away) / HOUR), m = Math.round((now - away) / 60_000);
  return h < 1 ? `${m} minutes` : h < 48 ? `${h} hour${h === 1 ? "" : "s"}` : `${Math.round(h / 24)} days`;
}

// ---- the groups ----
/** a thing a Check in box lists */
export type Item = { id: string; name: string; folder: string; kind: string; at: number };
const isThing = (p: Piece) => (p.kind === "session" || ["doc", "page", "list"].includes(p.kind)) && !p.inside && !p.part;
/** when a piece last changed: a session's last update, else when it was made */
export const changedAt = (p: Piece): number => Number(p.last) || Number(p.born) || 0;
const item = (p: Piece, at: number): Item => ({ id: p.id, name: p.name, folder: p.region, kind: p.kind, at });
const newest = (a: Item[]) => [...a].sort((x, y) => y.at - x.at);

/** Done while away: sessions that finished since the person was last present */
export function doneAway(pieces: Piece[], away: number | null): Item[] {
  if (away === null) return [];
  return newest(pieces.filter((p) => p.kind === "session" && !p.inside && !p.part && p.state === "done" && changedAt(p) > away).map((p) => item(p, changedAt(p))));
}
/** Back to: things that changed since the person last saw them (never ones not seen yet, never the one in front) */
export function backTo(pieces: Piece[], seen: Times, front: string | null = null): Item[] {
  return newest(pieces.filter((p) => isThing(p) && p.id !== front && seen[p.id] !== undefined && changedAt(p) > seen[p.id]).map((p) => item(p, changedAt(p))));
}
/** Kept: what the person pinned, the last pinned first */
export function keptItems(pieces: Piece[], pinned: Times): Item[] {
  return newest(pieces.filter((p) => isThing(p) && pinned[p.id] !== undefined).map((p) => item(p, pinned[p.id])));
}
/** Recent: the folders used most recently, apart from the one in front (the group shows the first MOST) */
export function recentFolders(order: string[], uses: Times, here: string | null): { id: string; at: number }[] {
  return order.filter((id) => id !== here && (uses[id] ?? 0) > 0).map((id) => ({ id, at: uses[id] })).sort((a, b) => b.at - a.at);
}

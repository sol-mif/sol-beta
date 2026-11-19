// Moving sessions by hand in the side (2026-11-14, Marco: "the side bar is how we should be able to intuitively move
// sessions around"; the design #1183 §2). Every gesture comes down to one message, work.under { sessionId, under }:
// a drop on a row or on an orchestrator's room, ⌘↓ and ⌘↑ on the picked row, and the undo of each. Pure, so the walk
// plays every gesture on a fixed list (src/side-moves.test.ts); Side.tsx asks it what a gesture means and sends that.
// What Marco sees per gesture: home/side-moves.md. The rows' own motion (lifts, holds) is sideMoves.ts, not this file.
import type { Row } from "./sideRows.ts";

/** what a gesture does: send work.under; refuse it on that row (it shakes, the reason its title); swallow it (a drop
 *  on itself); or pass it on (not a move: the tray's own drop, a session into a folder, still has it) */
export type Move =
  | { do: "under"; sessionId: string; under: string | null; was: string | null; /** a move taken back */ undo?: true }
  | { do: "refused"; on: string; why: string }
  | { do: "none" }
  | { do: "pass" };

/** where a dragged row lands: on a row, on the empty room of an orchestrator's group (`group` is its head's id), or
 *  outside every group (`out`: a folder's tray, the let-go strip) */
export type Target = { on: string } | { group: string } | { out: true };

export const CYCLE = "that would run it under itself";   // the engine's own words (wire.ts work.under)
const DEPTH = 8;   // a chain is read this far, as sideSort's foldUnder does

const index = <R extends Row>(all: R[]) => new Map(all.map((r) => [r.id, r]));
const runner = <R extends Row>(by: Map<string, R>, r: R) => { const o = r.under ? by.get(r.under) : undefined; return o && o.kind === "orchestration" ? o : undefined; };

/** the head of the group a row is drawn in: the top of its chain of orchestrators (itself when nothing runs it) */
export function headOf<R extends Row>(all: R[], id: string): string {
  const by = index(all);
  const start = by.get(id);
  if (!start) return id;
  let at: R = start;
  for (let i = 0; i < DEPTH; i++) { const p: R | undefined = runner(by, at); if (!p || p.id === id) break; at = p; }
  return at.id;
}

/** would `sid` under `to` make a loop: is `sid` already somewhere up `to`'s chain */
export function loops<R extends Row>(all: R[], sid: string, to: string): boolean {
  const by = index(all);
  for (let at = by.get(to), i = 0; at && i < DEPTH; i++) { if (at.id === sid) return true; at = at.under ? by.get(at.under) : undefined; }
  return false;
}

const under = (s: Row, to: string | null): Move => (s.under ?? null) === to ? { do: "none" } : { do: "under", sessionId: s.id, under: to, was: s.under ?? null };

/** a drop, by the folder rule (Marco 2026-11-14, "the ux for dragging in and out"): inside its own group a child
 *  stays; outside every group it lets go; on another group it moves there. On an orchestration row: under it, unless
 *  it is the row it is under already (it stays) or it would loop (refused, the reason said); a head up its own chain
 *  takes it up a level. On a plain row: a loose row lets a child go, a sibling keeps it, another group's row moves it
 *  there; a loose row on a loose row is the tray's (pass). On a group's room: its own child stays, any other goes under
 *  the head. Out (a tray, the let-go strip): a child lets go, a loose row is the tray's. */
export function dropMove<R extends Row>(all: R[], sid: string, t: Target): Move {
  const by = index(all), s = by.get(sid);
  if (!s) return { do: "pass" };
  const sHead = headOf(all, sid), child = sHead !== sid;
  if ("out" in t) return child ? under(s, null) : { do: "pass" };
  if ("group" in t) {
    if (t.group === sid) return { do: "none" };
    if (child && sHead === t.group) return { do: "none" };
    return loops(all, sid, t.group) ? { do: "refused", on: t.group, why: CYCLE } : under(s, t.group);
  }
  const tr = by.get(t.on);
  if (!tr || t.on === sid) return t.on === sid ? { do: "none" } : { do: "pass" };
  if (tr.kind === "orchestration") {
    if (s.under === t.on) return { do: "none" };
    return loops(all, sid, t.on) ? { do: "refused", on: t.on, why: CYCLE } : under(s, t.on);
  }
  // a row it runs, however deep (a nested orchestrator onto its own child): a loop, refused, never a release
  if (loops(all, sid, t.on)) return { do: "refused", on: t.on, why: CYCLE };
  const tHead = headOf(all, t.on);
  if (tHead === t.on) return child ? under(s, null) : { do: "pass" };   // a loose row
  if (tHead === sHead) return { do: "none" };                          // a sibling: inside its own group, it stays
  return loops(all, sid, tHead) ? { do: "refused", on: t.on, why: CYCLE } : under(s, tHead);
}

/** ⌘↓ / ⌘↑ on the picked row. ↑ lets it go. ↓ puts it under the nearest orchestration row above it in the side's
 *  order (`order`: the row ids as drawn, top to bottom), passing over the one it is under already */
export function keyMove<R extends Row>(all: R[], order: string[], sid: string, dir: "up" | "down"): Move {
  const by = index(all), s = by.get(sid);
  if (!s) return { do: "none" };
  if (dir === "up") return s.under ? under(s, null) : { do: "none" };
  const to = aboveOf(all, order, sid);
  if (!to) return { do: "none" };
  return loops(all, sid, to) ? { do: "refused", on: sid, why: CYCLE } : under(s, to);
}

/** the orchestration row ⌘↓ would put a row under (the row menu names it), or null */
export function aboveOf<R extends Row>(all: R[], order: string[], sid: string): string | null {
  const by = index(all), s = by.get(sid), i = order.indexOf(sid);
  if (!s || i < 0) return null;
  for (let j = i - 1; j >= 0; j--) { const o = by.get(order[j]); if (o?.kind === "orchestration" && o.id !== s.under) return o.id; }
  return null;
}

/** the move that puts it back: its `under` as it was before, marked `undo` so the orchestrator it returns to is not
 *  sent its joined summary a second time (it heard it on the first join) */
export const undoOf = (m: Extract<Move, { do: "under" }>): Extract<Move, { do: "under" }> => ({ do: "under", sessionId: m.sessionId, under: m.was, was: m.under, undo: true });

/** the toast's words: "moved under X", "let go from X" */
export function moveWords<R extends Row>(all: R[], m: Extract<Move, { do: "under" }>): string {
  const name = (id: string | null) => (id && (all.find((r) => r.id === id)?.title || "untitled")) || "";
  return m.under ? `moved under ${name(m.under)}` : `let go from ${name(m.was)}`;
}

/** moves sent and not yet heard back in work.sessions: drawn at once, so the words change on the press and the old
 *  count never comes back while the broadcast is on its way */
export type Pending = Record<string, string | null>;
export function withPending<R extends Row>(all: R[], p: Pending): R[] {
  const ids = Object.keys(p);
  if (!ids.length) return all;
  return all.map((r) => (r.id in p ? { ...r, under: p[r.id] ?? undefined } : r));
}
/** the engine refused a move already drawn: it comes off pending (the row goes back where it was) and the toast that
 *  would undo it goes (nothing to take back) */
export function refusedBack<U extends { m: Move } | null>(p: Pending, u: U, m: Extract<Move, { do: "under" }>): { pending: Pending; undo: U | null } {
  const { [m.sessionId]: _, ...pending } = p;
  return { pending: m.sessionId in p ? pending : p, undo: u?.m === m ? null : u };
}
/** a broadcast came: the moves it carries are settled (dropped from pending); one it does not carry yet stays */
export function settle<R extends Row>(all: R[], p: Pending): Pending {
  const by = index(all), out: Pending = {};
  for (const [id, to] of Object.entries(p)) { const r = by.get(id); if (r && (r.under ?? null) !== to) out[id] = to; }
  return Object.keys(out).length === Object.keys(p).length ? p : out;
}

/** the side's order as drawn, for ⌘↓ and the walk: each line's row, then its children when open (a folded line shows
 *  only a child that needs you) */
export function drawnOrder<R extends Row>(lines: { row: R; kids: R[] }[], open: (id: string) => boolean, needs: (r: R) => boolean = () => false): string[] {
  return lines.flatMap((l) => [l.row.id, ...(open(l.row.id) ? l.kids : l.kids.filter(needs)).map((k) => k.id)]);
}

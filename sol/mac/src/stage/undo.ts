// Undo for every hand verb (#778, #751 B15), for the stage behind `stage.whole`: build/feel.md rule 8 and "undo stack".
// The stack itself is b9's (geometry.ts: snapshot, record, undo, redo, 64 entries, nudges within 800 ms joined); this is
// the stage's side of it, pure: the snapshot of a stage as it is now, and what a ⌘Z or ⇧⌘Z has to do to get from now
// to a snapshot: which blocks travel to which rect, which fold or unfold, which close or come back. No DOM.
import type { Place, Rect } from "./model.ts";
import { snapshot, type Snapshot } from "./geometry.ts";

/** the stage as a snapshot: every place (folded or not), closed when the face holds it closed (a close not yet
 *  committed, so it can come back) */
export function stageShot(places: Place[], closed: ReadonlySet<string>, state: (id: string) => string, versions: (id: string) => number): Snapshot {
  return snapshot(places.map((p) => ({ id: p.id, r: { x: p.x, y: p.y, w: p.w, h: p.h }, folded: !!p.folded, closed: closed.has(p.id), state: state(p.id), versions: versions(p.id) })));
}

const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** from now to a snapshot: travel (the rect it goes to; on the stage now and after), fold, unfold (with the rect it
 *  comes back to), close and reopen (with its rect). A block the snapshot does not know is left as it is (it came after,
 *  the agent's); a block now gone that the snapshot has is not brought back (it was closed for good) */
export type Restore = { travel: Map<string, Rect>; fold: string[]; unfold: Map<string, Rect>; close: string[]; reopen: Map<string, Rect> };
export function restore(now: Snapshot, to: Snapshot): Restore {
  const out: Restore = { travel: new Map(), fold: [], unfold: new Map(), close: [], reopen: new Map() };
  for (const [id, t] of Object.entries(to)) {
    const n = now[id];
    if (!n) continue;
    if (t.closed && !n.closed) { out.close.push(id); continue; }
    if (!t.closed && n.closed) { out.reopen.set(id, { ...t.r }); continue; }
    if (t.closed) continue;
    if (t.folded && !n.folded) { out.fold.push(id); continue; }
    if (!t.folded && n.folded) { out.unfold.set(id, { ...t.r }); continue; }
    if (!t.folded && !same(t.r, n.r)) out.travel.set(id, { ...t.r });
  }
  return out;
}
export const nothing = (r: Restore) => !r.travel.size && !r.fold.length && !r.unfold.size && !r.close.length && !r.reopen.size;

/** the places after a restore: rects and folds as the snapshot has them (closes and reopens are the face's set) */
export function placesAfter(places: Place[], r: Restore, z: number): Place[] {
  let top = z;
  return places.map((p) => {
    const t = r.travel.get(p.id) ?? r.unfold.get(p.id) ?? r.reopen.get(p.id);
    if (r.fold.includes(p.id)) return { ...p, folded: true };
    if (r.unfold.has(p.id) || r.reopen.has(p.id)) return { ...p, ...t!, folded: false, z: ++top };
    return t ? { ...p, ...t } : p;
  });
}

/** ⌥ arrows nudge 8 (feel.md "held"): the rect moved one grid step, kept on the stage */
export function nudge(r: Rect, key: string, room: { w: number; h: number; left?: number }, pad = 16, step = 8): Rect | null {
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
  if (!d) return null;
  // only the axis that moves is kept on the stage: a block today's stage set 12 in stays there on the other axis
  const x = d[0] ? Math.max(pad + (room.left ?? 0), Math.min(r.x + d[0], room.w - pad - r.w)) : r.x;
  const y = d[1] ? Math.max(pad, Math.min(r.y + d[1], room.h - r.h)) : r.y;
  return { ...r, x, y };
}

/** the closes an entry dropped off the stack still holds: once it cannot be undone, a held close is committed */
export function droppedCloses(before: { undo: { after: Snapshot; before: Snapshot }[] }, after: { undo: { after: Snapshot; before: Snapshot }[] }, closed: ReadonlySet<string>): string[] {
  const kept = new Set(after.undo);
  const gone = before.undo.filter((e) => !kept.has(e));
  const still = (id: string) => after.undo.some((e) => e.before[id] && !e.before[id].closed);
  return [...closed].filter((id) => gone.some((e) => e.after[id]?.closed && !e.before[id]?.closed) && !still(id));
}

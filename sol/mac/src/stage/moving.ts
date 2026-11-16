// Moving between blocks and taking steps back (#737, pain points 3 and 6 of build mode), pure so the face's tests run it
// (src/stage-moving.test.ts). The reading order ⌘1…⌘9 and Tab walk; a block's zoom steps (⌘+ ⌘- ⌘0); the session's
// history of stage moves ⌘Z and ⇧⌘Z walk (move, resize, fold, pop, close, tidy), kept as the places each step changed,
// so a step taken back never touches a block the agent composed after it; how long an untaken ghost waits.
import type { Place } from "./model";

/** a ghost nobody took fades this long after the agent's turn ends, then goes to the foot (the store's fold) */
export const GHOST_FADE = 30_000;
/** the fade's wait as this window has it: a scene shot on a busy machine stretches it (localStorage sol.stage.ghostfade,
 *  in ms; fixtures/stage/shoot-moving.mjs), else GHOST_FADE */
export function ghostFade(): number {
  try { const v = Number(globalThis.localStorage?.getItem("sol.stage.ghostfade")); return v > 0 ? v : GHOST_FADE; } catch { return GHOST_FADE; }
}

/** the shown blocks in reading order: rows top to bottom, each row left to right. A block whose top sits above the half
 *  of the row's shortest block is in that row, so blocks a few pixels apart read as one row */
export function readingOrder<P extends Pick<Place, "id" | "x" | "y" | "h">>(places: P[]): P[] {
  const byTop = [...places].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: P[][] = [];
  for (const p of byTop) {
    const row = rows[rows.length - 1];
    if (row && p.y < row[0].y + Math.min(...row.map((q) => q.h)) / 2) row.push(p);
    else rows.push([p]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/** the next block from `id` in the order (Tab), or the one before (⇧Tab), round the ends; the first when none is held */
export function walk(order: string[], id: string | null, back = false): string | null {
  if (!order.length) return null;
  const i = id ? order.indexOf(id) : -1;
  if (i < 0) return back ? order[order.length - 1] : order[0];
  return order[(i + (back ? -1 : 1) + order.length) % order.length];
}

/** the steps a block's content zooms by (⌘+ ⌘-), 1 the content as it is (⌘0) */
export const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export function zoomStep(z: number, out = false): number {
  if (out) { for (let i = ZOOMS.length - 1; i >= 0; i--) if (ZOOMS[i] < z - 1e-3) return ZOOMS[i]; return ZOOMS[0]; }
  for (const s of ZOOMS) if (s > z + 1e-3) return s;
  return ZOOMS[ZOOMS.length - 1];
}

// ── the history (⌘Z) ───────────────────────────────────────────────────────────────────────────────────────────────
/** a block's place before and after one step; null where it was not on the stage (closed) */
export type Side = Record<string, Place | null>;
export type Step = { before: Side; after: Side };
const same = (a: Place | undefined, b: Place | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** the step from one layout to the next: only the places that changed; null when none did */
export function stepOf(before: Place[], after: Place[]): Step | null {
  const ids = new Set([...before.map((p) => p.id), ...after.map((p) => p.id)]);
  const b: Side = {}, a: Side = {};
  for (const id of ids) {
    const x = before.find((p) => p.id === id), y = after.find((p) => p.id === id);
    if (same(x, y)) continue;
    b[id] = x ?? null; a[id] = y ?? null;
  }
  return Object.keys(b).length ? { before: b, after: a } : null;
}

/** one side of a step laid over the layout as it is now: those places put back (a block the side has not is taken off);
 *  every other place, the agent's newer blocks among them, stays. `back` the ids that come back on the stage (a close
 *  taken back), `gone` the ids the side takes off (a close done again). `other` is the step's other side: a block that
 *  was on the stage at both ends of the step (a move, a fold) and is gone now was closed since, by the agent or another
 *  window, and stays closed; only a step that itself took a block off brings it back (#892) */
export function applySide(now: Place[], side: Side, other?: Side): { blocks: Place[]; back: string[]; gone: string[] } {
  const back: string[] = [], gone: string[] = [];
  let blocks = now.filter((p) => { if (p.id in side && side[p.id] === null) { gone.push(p.id); return false; } return true; });
  for (const [id, p] of Object.entries(side)) {
    if (!p) continue;
    if (blocks.some((q) => q.id === id)) blocks = blocks.map((q) => (q.id === id ? p : q));
    else if (!other || other[id] === null) { blocks = [...blocks, p]; back.push(id); }
  }
  return { blocks, back, gone };
}

/** a session's steps, as far back as the session: a new step drops what was undone after it */
export class History {
  private past: Step[] = [];
  private ahead: Step[] = [];
  push(s: Step | null) { if (!s) return; this.past.push(s); this.ahead = []; }
  undo(): Step | null { const s = this.past.pop() ?? null; if (s) this.ahead.push(s); return s; }
  redo(): Step | null { const s = this.ahead.pop() ?? null; if (s) this.past.push(s); return s; }
  get size() { return { back: this.past.length, ahead: this.ahead.length }; }
}

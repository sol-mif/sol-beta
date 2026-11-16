// The talk full (#788, #751 B25), for the stage behind `stage.whole`: whole.md "Talk full", feel.md "talk full" (⌘↑:
// blocks fly to a foot row of 120×72 copies; ⌘↓, Esc or a press brings them back, the pressed one held). Pure: where
// each block goes in the foot row, as a transform on it at its place (origin top left): the row centred under the
// room, 96 up from its floor, the blocks in reading order, each scaled by one factor into its 120×72 cell and centred
// there. talkFull.ts moves them.
import type { Rect } from "./model.ts";
import { FOOT } from "../kit/feel.ts";
import type { Fly } from "./trayFold.ts";

/** the foot row's cells, in room coordinates: n cells of FOOT.w × FOOT.h, FOOT.gap apart, centred, FOOT.up from the floor */
export function footCells(n: number, room: { w: number; h: number }): Rect[] {
  const total = n * FOOT.w + Math.max(0, n - 1) * FOOT.gap, x0 = (room.w - total) / 2, y0 = room.h - FOOT.up;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (FOOT.w + FOOT.gap), y: y0, w: FOOT.w, h: FOOT.h }));
}

/** each block's flight to its cell: `order` is the reading order, `rects` the blocks' places in stage coordinates, `at`
 *  where the stage's top left sits in the room */
export function footRow(order: string[], rects: Map<string, Rect>, room: { w: number; h: number }, at: { x: number; y: number }): Map<string, Fly> {
  const ids = order.filter((id) => rects.has(id)), cells = footCells(ids.length, room), out = new Map<string, Fly>();
  ids.forEach((id, i) => {
    const r = rects.get(id)!, c = cells[i], s = Math.min(c.w / r.w, c.h / r.h);
    out.set(id, { dx: c.x - at.x + (c.w - r.w * s) / 2 - r.x, dy: c.y - at.y + (c.h - r.h * s) / 2 - r.y, s });
  });
  return out;
}

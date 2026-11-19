// The names at the seam (#1090, design round 1): pull without turning to the other screen. Rest the pointer on the
// seam and the names of what the other window holds come out of it, five at most; a press on a name brings that block
// here, entering at the height of its name. What is put away goes by name, never as folded squares (Marco, 2026-11-12).
//   out     after the pointer rests 150 ms within 24 px of the seam (Seam.tsx's wider hit area); not during a carry
//   gone    300 ms after the pointer leaves the seam and the names
//   press   onPull(block, y): y is 0..1 of the window's height, where the block comes in (store.put, then the slide)
// Presentational: Seam.tsx owns the timers and gives `open`; the pure pieces are tested without a window.
import { Glass, Row } from "../kit";
import { mute } from "../kit/paint";
import { CURVE, TYPE } from "../kit/tokens";
import type { Edge } from "./model";
import "./names.css";

export const meta = {
  Names: {
    job: "what the other window holds, by name, at the seam: a press pulls one here",
    flow: "mine",
    states: ["shut", "out: one to five names", "out: five and a count", "nothing over there: never opens"],
    keys: [
      { press: "rest the pointer on the seam", does: "the names come out" },
      { press: "click a name", does: "that block crosses to this window, entering at the name's height" },
      { press: "⌃⌥ Return", does: "all of them come (gather)" },
    ],
    listens: ["screens.state: which blocks the other window draws", "the pointer near the seam (Seam.tsx)"],
  },
};

export const NAMES_MAX = 5, NAME_H = 28, NAMES_W = 220, REST_MS = 150, LEAVE_MS = 300, NEAR_PX = 24;

/** the names shown and how many are left over (pure): the last touched first */
export function namesOf<T extends { id: string }>(blocks: T[]): { shown: T[]; more: number } {
  return { shown: blocks.slice(0, NAMES_MAX), more: Math.max(0, blocks.length - NAMES_MAX) };
}
/** where the stack stands along the seam: centred on the pointer, kept inside the window (pure) */
export function namesTop(pointerY: number, count: number, winH: number): number {
  const h = count * NAME_H + 12;
  return Math.max(8, Math.min(winH - h - 8, pointerY - h / 2));
}
/** the height a pulled block enters at, 0..1 of the window: the middle of its name's row (pure) */
export const pullY = (top: number, index: number, winH: number) => (top + 6 + index * NAME_H + NAME_H / 2) / winH;

export function Names({ open, edge, blocks, pointerY, onPull }: {
  open: boolean; edge: Edge; blocks: { id: string; title: string }[]; pointerY: number; onPull: (block: string, y: number) => void;
}) {
  const { shown, more } = namesOf(blocks);
  if (!shown.length) return null;
  const rows = shown.length + (more ? 1 : 0), winH = window.innerHeight, top = namesTop(pointerY, rows, winH), h = rows * NAME_H + 12;
  const side = edge === "left" || edge === "right";
  return (
    <div className={`nm ${edge} ${open ? "open" : ""}`} data-part="the names at the seam" style={side ? { top } : { left: namesTop(pointerY, 1, window.innerWidth - NAMES_W) }}>
      <Glass w={NAMES_W} h={h} r={CURVE.radius.field} step="pop">
        <div className="nm-in">
          {shown.map((b, i) => <Row key={b.id} w={NAMES_W - 12} h={NAME_H} title={b.title} onClick={() => onPull(b.id, pullY(top, i, winH))} />)}
          {more > 0 && <div className="nm-more" style={{ color: mute, fontSize: TYPE.label[0], height: NAME_H }}>+{more}</div>}
        </div>
      </Glass>
    </div>
  );
}

// The hand on a block's edge (#775, #751 B12), for the stage behind `stage.whole`: an edge or corner taken and pulled
// resizes the block through resize.ts (the magnet, the fit detent, block.min), one show a frame; let go, it lands on a
// guide or the grid and the stage's plan makes room. A trackpad pinch (ctrl + wheel over a block) resizes it from its
// centre and commits 180 ms after the fingers stop. The stage draws and commits; this only reads the pointer.
import { PINCH, THRESHOLD } from "../kit/feel.ts";
import type { Rect } from "./model.ts";
import type { Room } from "./geometry.ts";
import { pinchEnd, pinchRect, resizeEnd, resizeTo, type Edge, type Sizing } from "./resize.ts";

export type WholeResize = {
  e: PointerEvent;
  band: HTMLElement;
  edge: Edge;
  from: Rect;
  room: () => Room;
  others: () => Rect[];
  /** "all of it": the block's height that shows its whole content, read now (it reflows with the width) */
  fit: () => number | null;
  /** a resize shown (once a frame) */
  onShow: (s: Sizing) => void;
  /** let go: where it lands; null when it never moved past the threshold */
  onEnd: (r: Rect | null) => void;
};

export function wholeResize(d: WholeResize): void {
  const { e, band, edge, from } = d;
  const start = { x: e.clientX, y: e.clientY };
  let held = false, frame = 0, last = start, shown: Sizing | null = null;
  band.setPointerCapture(e.pointerId);
  e.stopPropagation();
  const draw = () => {
    frame = 0;
    shown = resizeTo(d.room(), from, edge, { x: last.x - start.x, y: last.y - start.y }, d.others(), d.fit());
    d.onShow(shown);
  };
  const mv = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    last = { x: ev.clientX, y: ev.clientY };
    if (!held) {
      const t = THRESHOLD[(ev.pointerType || "mouse") as keyof typeof THRESHOLD] ?? THRESHOLD.mouse;
      if (Math.hypot(last.x - start.x, last.y - start.y) < t) return;
      held = true;
    }
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    band.removeEventListener("pointermove", mv); band.removeEventListener("pointerup", end); band.removeEventListener("pointercancel", end);
    if (frame) { cancelAnimationFrame(frame); draw(); }
    d.onEnd(held && shown && ev.type === "pointerup" ? resizeEnd(edge, shown) : null);
  };
  band.addEventListener("pointermove", mv); band.addEventListener("pointerup", end); band.addEventListener("pointercancel", end);
}

/** ctrl + wheel over a block (a trackpad pinch) resizes it from its centre; at rest it commits. Returns the cleanup */
export function wholePinch(stage: HTMLElement, o: { rectOf: (id: string) => Rect | null; room: () => Room; onShow: (id: string, r: Rect) => void; onEnd: (id: string, r: Rect) => void }): () => void {
  let p: { id: string; r: Rect; t: number } | null = null;
  const wheel = (ev: WheelEvent) => {
    if (!ev.ctrlKey) return;
    const id = (ev.target as HTMLElement).closest<HTMLElement>(".st-block")?.dataset.block;
    if (!id) return;
    ev.preventDefault();
    // a pinch on another block while one still runs: the running one commits first, never dropped (#853 B4)
    if (p && p.id !== id) { clearTimeout(p.t); const q = p; p = null; o.onEnd(q.id, pinchEnd(o.room(), q.r)); }
    if (!p) { const r = o.rectOf(id); if (!r) return; p = { id, r, t: 0 }; }
    p.r = pinchRect(o.room(), p.r, ev.deltaY);
    o.onShow(id, p.r);
    clearTimeout(p.t);
    p.t = window.setTimeout(() => { const q = p!; p = null; o.onEnd(q.id, pinchEnd(o.room(), q.r)); }, PINCH.rest);
  };
  stage.addEventListener("wheel", wheel, { passive: false });
  return () => { stage.removeEventListener("wheel", wheel); if (p) clearTimeout(p.t); };
}

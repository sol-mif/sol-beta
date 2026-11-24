// The window's layers (BR1 root part 1, #1615; mine/look/br1/strategy/root.html, design-br1 11-21): four layers, bottom
// to top, and the only stacking values in the new face.
//   canvas   the plane's ground (#view)
//   pieces   the Diary, folders, sessions; a page over the canvas (Settings) sits here too
//   pop-ups  every peek, menu, tooltip and card, drawn through <Overlay> (Overlay.tsx), placed beside its anchor inside
//            the canvas, never over the frame
//   frame    the sidebar, the top bar and the tabs, the bottom bar, the ask line and the talk; it owns what just
//            happened (frame.ts)
// CSS reads them as var(--z-canvas) … var(--z-frame), set once on .nx from here (layerVars); inside one piece's own
// stacking context a part one step above its neighbours (a focused card, a badge on its card) is var(--z-lift). A raw
// stacking number anywhere in next/ fails next-layers.test.ts.
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import type { CSSProperties } from "react";

export const LAYERS = ["canvas", "pieces", "popups", "frame"] as const;
export type Layer = (typeof LAYERS)[number];
export const Z: Record<Layer, number> = { canvas: 0, pieces: 1, popups: 2, frame: 3 };
/** one step up inside a layer's own stacking context */
export const LIFT = 1;

/** the variables .nx carries, so every stylesheet reads the layers from this one file */
export const layerVars = {
  "--z-canvas": Z.canvas, "--z-pieces": Z.pieces, "--z-popups": Z.popups, "--z-frame": Z.frame, "--z-lift": LIFT,
} as unknown as CSSProperties;
/** the same variables on a root of the new face mounted on <body> beside .nx (the move-in's #mvi, How Sol sees you's
 *  #yu, #yus, #yul): there they stack against the frame by the same four numbers, later on the body above earlier */
export function layerRoot(el: HTMLElement): void {
  for (const [k, v] of Object.entries(layerVars)) el.style.setProperty(k, String(v));
}

export type Rect = { x: number; y: number; w: number; h: number };
export type Side = "below" | "above" | "right" | "left";
/** below or above, the edge lined up with the anchor's: its left (start), or its right (end), so a menu from a button at a
 *  piece's top right hangs over its own piece and not the one beside it (pieces.html, BR1 conform 5) */
export type Align = "start" | "end";

const GAP = 8;   // a pop-up's distance from its anchor: --s2
const order: Record<Side, Side[]> = {
  below: ["below", "above", "right", "left"], above: ["above", "below", "right", "left"],
  right: ["right", "left", "below", "above"], left: ["left", "right", "below", "above"],
};

/** where a pop-up of `size` goes beside `anchor`, inside `room` (the canvas): the preferred side when it fits there,
 *  else the next side that does, else the side with the most room; then moved along that side and clamped so no edge
 *  leaves the room. Pure, so the rule is tested without a window */
export function place(anchor: Rect, size: { w: number; h: number }, room: Rect, prefer: Side = "below", gap = GAP, align: Align = "start"): Rect & { side: Side } {
  const fits = (s: Side) =>
    s === "below" ? anchor.y + anchor.h + gap + size.h <= room.y + room.h
    : s === "above" ? anchor.y - gap - size.h >= room.y
    : s === "right" ? anchor.x + anchor.w + gap + size.w <= room.x + room.w
    : anchor.x - gap - size.w >= room.x;
  const space = (s: Side) =>
    s === "below" ? room.y + room.h - (anchor.y + anchor.h) : s === "above" ? anchor.y - room.y
    : s === "right" ? room.x + room.w - (anchor.x + anchor.w) : anchor.x - room.x;
  const side = order[prefer].find(fits) ?? order[prefer].slice().sort((a, b) => space(b) - space(a))[0];
  let x = side === "right" ? anchor.x + anchor.w + gap : side === "left" ? anchor.x - gap - size.w : align === "end" ? anchor.x + anchor.w - size.w : anchor.x;
  let y = side === "below" ? anchor.y + anchor.h + gap : side === "above" ? anchor.y - gap - size.h : anchor.y;
  const w = Math.min(size.w, room.w), h = Math.min(size.h, room.h);
  x = Math.max(room.x, Math.min(x, room.x + room.w - w));
  y = Math.max(room.y, Math.min(y, room.y + room.h - h));
  return { x: Math.round(x), y: Math.round(y), w, h, side };
}

const rectOf = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
/** the canvas a pop-up may cover: #view's box on screen, the frame (sidebar, top bar, tabs) outside it; the bottom bar
 *  and the talk float over its foot, so their band is taken off */
export function room(): Rect {
  const v = document.getElementById("view")?.getBoundingClientRect();
  if (!v) return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const r = rectOf(v);
  const foot = [document.getElementById("bar"), document.querySelector(".nx-talk"), document.getElementById("line")]
    .map((e) => e?.getBoundingClientRect()).filter((b): b is DOMRect => !!b && b.height > 0 && b.top < r.y + r.h)
    .reduce((top, b) => Math.min(top, b.top - GAP), r.y + r.h);
  return { ...r, h: Math.max(0, foot - r.y) };
}
/** an element's box on screen, as a Rect */
export const boxOf = (el: Element): Rect => rectOf(el.getBoundingClientRect());

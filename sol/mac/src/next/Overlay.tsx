// The pop-ups' one root (BR1 root part 1, #1615; layers.ts): every peek, menu, tooltip and card portals into #nx-over,
// a layer of its own under .nx above the pieces and under the frame. A pop-up inside the canvas's camera was clipped by
// the plane and painted under the Diary; here it is placed beside its anchor by place() and kept inside the canvas.
//   <OverlayRoot/>   once, in the shell
//   <Overlay>        portals its children there (a pop-up that places itself: Find's press, the moves list)
//   <Pop anchor>     a pop-up placed beside its anchor: measured, then put on the preferred side that fits
// Signed: marcocyl04-ux's agent (builder E), BR1 root (#1615).
import { forwardRef, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { place, room, type Align, type Rect, type Side } from "./layers.ts";

let host: HTMLElement | null = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => host;

/** the root every pop-up portals into; the shell draws it once */
export function OverlayRoot() {
  return <div id="nx-over" className="nx-over" ref={(el) => { if (el && host !== el) { host = el; subs.forEach((f) => f()); } }} />;
}

/** its children, drawn in the pop-ups' layer */
export function Overlay({ children }: { children: ReactNode }) {
  const h = useSyncExternalStore(subscribe, snapshot, () => null);
  return h ? createPortal(children, h) : null;
}

type PopProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** the anchor's box on screen, read at each placing; null closes nothing, it only leaves the pop-up where it was */
  anchor: () => Rect | null;
  prefer?: Side;
  gap?: number;
  align?: Align;
  children: ReactNode;
};

/** a pop-up beside its anchor: drawn in the pop-ups' layer, measured, placed by place() inside the canvas, placed again
 *  on every redraw (the camera moves its anchor) */
export const Pop = forwardRef<HTMLDivElement, PopProps>(function Pop({ anchor, prefer = "below", gap, align, style, children, ...rest }, fwd) {
  const own = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; side: Side } | null>(null);
  useLayoutEffect(() => {
    const el = own.current, a = anchor();
    if (!el || !a) return;
    const p = place(a, { w: el.offsetWidth, h: el.offsetHeight }, room(), prefer, gap, align);
    if (!at || at.x !== p.x || at.y !== p.y || at.side !== p.side) setAt({ x: p.x, y: p.y, side: p.side });
  });
  const ref = (el: HTMLDivElement | null) => { own.current = el; if (typeof fwd === "function") fwd(el); else if (fwd) fwd.current = el; };
  const s: CSSProperties = { position: "fixed", left: at?.x ?? 0, top: at?.y ?? 0, visibility: at ? undefined : "hidden", ...style };
  return <Overlay><div {...rest} ref={ref} data-side={at?.side} style={s}>{children}</div></Overlay>;
});

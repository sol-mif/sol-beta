// Glass (#674, look.md: material): one piece of glass on the continuous curve. A shade step of the one black, its edge,
// and as much of the jelly's light as its surface carries: glass, every surface's default, none; raised, the key light on
// the rim; box, the rim and an inner sheen. `fill` lays a colour instead of the shade. `blur` blurs what lies
// behind it by that much, as the window's glass does (a card that floats over words). `over` is drawn inside its shape,
// clipped to it; `children` sit on top. With no `w` and `h` it is the glass of the box it is in (#647): it lies behind
// that box's own contents, drawn to its size as the size changes (the chat box, a card that grows with what it holds).
import { useRef, type CSSProperties, type ReactNode } from "react";
import { curve } from "./curve";
import { black, on, useSize, useUid } from "./paint";
import { CURVE, GLASS, SHADE, type Step, type Surface } from "./tokens";

export function Glass({ w, h, ...rest }: {
  w?: number; h?: number; r: number; step?: Step; surface?: Surface; fill?: string; edge?: number; blur?: number; over?: ReactNode; style?: CSSProperties; children?: ReactNode;
}) {
  if (w !== undefined && h !== undefined) return <Pane w={w} h={h} {...rest} />;
  return <Behind {...rest} />;
}

/** the glass of the box it is in: behind that box's contents, at its size */
function Behind(p: { r: number; step?: Step; surface?: Surface; fill?: string; edge?: number; blur?: number; over?: ReactNode; style?: CSSProperties }) {
  const at = useRef<HTMLDivElement>(null), [w, h] = useSize(at);
  return (
    <div ref={at} aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
      {w > 0 && h > 0 && <Pane w={w} h={h} {...p} />}
    </div>
  );
}

function Pane({ w, h, r, step = "card", surface = "glass", fill, edge = SHADE.on.edge, blur, over, style, children }: {
  w: number; h: number; r: number; step?: Step; surface?: Surface; fill?: string; edge?: number; blur?: number; over?: ReactNode; style?: CSSProperties; children?: ReactNode;
}) {
  const id = useUid(), S = CURVE.smoothing, { rim, sheen } = GLASS.surfaces[surface];
  const d = curve(w, h, r, S), e = curve(w - 1, h - 1, Math.max(0, r - 0.5), S, 0.5, 0.5);
  const [lx, ly] = GLASS.light.from, k = Math.hypot(lx, ly), gx = (-lx / k) * 50, gy = (-ly / k) * 50;
  return (
    <div style={{ position: "relative", width: w, height: h, flex: "none", ...style }}>
      {blur ? <div style={{ position: "absolute", inset: 0, clipPath: `path('${d}')`, backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)` }} /> : null}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden>
        <defs>
          <linearGradient id={`r${id}`} x1={`${50 - gx}%`} y1={`${50 - gy}%`} x2={`${50 + gx}%`} y2={`${50 + gy}%`}>
            <stop offset="0" stopColor={on(1)} stopOpacity={Math.max(edge, rim)} />
            <stop offset="0.45" stopColor={on(1)} stopOpacity={edge * 0.8} />
            <stop offset="1" stopColor={on(1)} stopOpacity={edge * 0.5} />
          </linearGradient>
          <radialGradient id={`s${id}`} cx="22%" cy="0%" r="85%"><stop offset="0" stopColor={on(1)} stopOpacity={sheen} /><stop offset="1" stopColor={on(1)} stopOpacity={0} /></radialGradient>
        </defs>
        <path d={d} fill={fill ?? black(SHADE.steps[step])} />
        {sheen > 0 && <path d={d} fill={`url(#s${id})`} />}
      </svg>
      {over && <div style={{ position: "absolute", inset: 0, clipPath: `path('${d}')` }}>{over}</div>}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} aria-hidden>
        <path d={e} fill="none" stroke={rim > 0 ? `url(#r${id})` : on(edge)} strokeWidth={1} />
      </svg>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
    </div>
  );
}

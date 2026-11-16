// A button (#674, look.md: colour from the jelly): raised glass on the continuous curve that the jelly's colours arrive
// on when you hover and press. Two forms: holds keeps its shape, gives gives like the jelly. The look is how the colours
// arrive: wash (the pick) through the glass, rim round its edge, shimmer crossing it; the others are alternates
// (tokens.json, palette.looks.button). `state` sets it for a picture; left out, the pointer sets it. `w` left out, it
// fits its word (#647: "done", "compact now"); `label` names a button whose inside is a mark.
import { useState, type ReactNode } from "react";
import { curve } from "./curve";
import { Glass } from "./Glass";
import { black, hex, ink, jellyBands, on, onColour, textW, useUid } from "./paint";
import { CURVE, JELLY, LOOKS, TYPE } from "./tokens";

export type ButtonState = "rest" | "hover" | "press";
export type ButtonForm = keyof typeof LOOKS.button.forms;
export type ButtonLook = keyof typeof LOOKS.button.takes;
const S = CURVE.smoothing;

function Colour({ w, h, state, look }: { w: number; h: number; state: ButtonState; look: ButtonLook }) {
  const k = LOOKS.button.takes[look], a = state === "rest" ? 0 : state === "hover" ? k.hover : k.press;
  if (!a) return null;
  if (look === "wash")
    return (<>
      <div style={{ position: "absolute", inset: 0, backgroundImage: jellyBands(), backgroundSize: "200% 100%", backgroundPosition: "30% 0", opacity: a }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 80% at 50% 55%, ${black(JELLY.veil * a)}, transparent)` }} />
    </>);
  if (look === "shimmer") {
    const at = state === "hover" ? 0.18 : 0.62, bw = state === "hover" ? 0.5 : 0.9;
    return (
      <div style={{ position: "absolute", top: -h, bottom: -h, left: w * (at - bw / 2), width: w * bw, transform: "rotate(18deg)", opacity: a,
        background: `linear-gradient(90deg, transparent, ${JELLY.six.map((c, j) => `${hex(c, 0.85)} ${20 + j * 12}%`).join(", ")}, transparent)` }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "46%", width: 1.5, background: on(0.75), filter: "blur(0.6px)" }} />
      </div>
    );
  }
  return null;   // the rim is drawn on the edge, outside the clip (Rim)
}

function Rim({ w, h, r, state, look }: { w: number; h: number; r: number; state: ButtonState; look: ButtonLook }) {
  const k = LOOKS.button.takes[look], id = useUid();
  if (look !== "rim" || state === "rest") return null;
  const a = state === "hover" ? k.hover : k.press, d = curve(w - 1.5, h - 1.5, r - 0.75, S, 0.75, 0.75);
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0.4">{JELLY.six.map((c, j) => <stop key={j} offset={j / (JELLY.six.length - 1)} stopColor={c} />)}</linearGradient>
        <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={state === "press" ? 3 : 2} /></filter>
      </defs>
      <path d={d} fill="none" stroke={`url(#g${id})`} strokeWidth={3} opacity={a * 0.7} filter={`url(#b${id})`} />
      <path d={d} fill="none" stroke={`url(#g${id})`} strokeWidth={state === "press" ? 2 : 1.5} opacity={a} />
    </svg>
  );
}

export function Button({ w: width, h, form = "holds", look = LOOKS.button.pick, state, label, onClick, children }: {
  w?: number; h: number; form?: ButtonForm; look?: ButtonLook; state?: ButtonState; label?: string; onClick?: () => void; children: ReactNode;
}) {
  const [felt, setFelt] = useState<ButtonState>("rest"), s = state ?? felt, r = Math.min(CURVE.radius.row, h / 2);
  const w = width ?? (typeof children === "string" ? textW(children, TYPE.body[0], 500) + h : h);
  const sq = s === "press" ? LOOKS.button.forms[form] : [1, 1];
  const lit = s === "press" && (look === "wash" || look === "shimmer");
  const feel = state ? {} : {
    onPointerEnter: () => setFelt("hover"), onPointerLeave: () => setFelt("rest"),
    onPointerDown: () => setFelt("press"), onPointerUp: () => setFelt("hover"),
  };
  return (
    <div role="button" tabIndex={0} aria-label={label} onClick={onClick} onKeyDown={(ev) => { if (onClick && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onClick(); } }} {...feel} style={{ position: "relative", transform: `scale(${sq[0]}, ${sq[1]})`, transformOrigin: "50% 60%", cursor: "default" }}>
      <Glass w={w} h={h} r={r} step="raised" surface="raised" over={<Colour w={w} h={h} state={s} look={look} />}>
        <div style={{ height: "100%", display: "grid", placeItems: "center", fontWeight: 500, fontSize: TYPE.body[0], whiteSpace: "nowrap", ...(lit ? onColour : { color: ink }) }}>{children}</div>
      </Glass>
      <Rim w={w} h={h} r={r} state={s} look={look} />
    </div>
  );
}

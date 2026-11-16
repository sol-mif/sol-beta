// The pearl (#674, look.md: the pearl): the surface that marks what has you, the pearl made pearlescent with the jelly's
// colours. Nacre (the pick) lays the hues in soft bands; breath lays a breath of them across; edge leaves the pearl plain
// with its hues where the jelly's light catches the rim (tokens.json, palette.looks.pearl). Words on it are deep.
import type { CSSProperties, ReactNode } from "react";
import { curve } from "./curve";
import { Glass } from "./Glass";
import { hex, on, pearl, useUid } from "./paint";
import { CURVE, JELLY, LOOKS } from "./tokens";

export type PearlLook = keyof typeof LOOKS.pearl.takes;

function Nacre({ w, h, r, look }: { w: number; h: number; r: number; look: PearlLook }) {
  const a = LOOKS.pearl.takes[look].hue, id = useUid(), six = JELLY.six;
  const sheen = <div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 120% at 18% 0%, ${on(0.55)}, transparent 70%)` }} />;
  if (look === "breath")
    return (<>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(110deg, ${six.map((c, j) => `${hex(c, a)} ${j * 20}%`).join(", ")})` }} />
      {sheen}
    </>);
  if (look === "nacre")
    return (<>
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(104deg, ${[...six, six[0]].map((c, j) => `${hex(c, a)} ${j * 26}px`).join(", ")})`, filter: "blur(3px)" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${on(0.35)}, transparent 60%)` }} />
      {sheen}
    </>);
  // the edge: the pearl plain, its hues where the jelly's light would catch its rim
  const d = curve(w - 2, h - 2, Math.max(0, r - 1), CURVE.smoothing, 1, 1);
  return (<>
    <svg width={w} height={h} style={{ position: "absolute", inset: 0 }} aria-hidden>
      <defs>
        <linearGradient id={`e${id}`} x1="0" y1="0" x2="1" y2="1">{six.map((c, j) => <stop key={j} offset={j / (six.length - 1)} stopColor={c} />)}</linearGradient>
        <filter id={`f${id}`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.4" /></filter>
      </defs>
      <path d={d} fill="none" stroke={`url(#e${id})`} strokeWidth={5} opacity={a} filter={`url(#f${id})`} />
    </svg>
    {sheen}
  </>);
}

export function Pearl({ w, h, r, look = LOOKS.pearl.pick, style, children }: { w: number; h: number; r: number; look?: PearlLook; style?: CSSProperties; children?: ReactNode }) {
  return <Glass w={w} h={h} r={r} fill={pearl()} edge={0} style={style} over={<Nacre w={w} h={h} r={r} look={look} />}>{children}</Glass>;
}

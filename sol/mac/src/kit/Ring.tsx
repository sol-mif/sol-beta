// A ring, a meter (#674, look.md: colour from the jelly): fullness as the jelly's own goo, no eyes, in a glass disc.
// Pool (the pick): its six colours arrive one pool at a time from the bottom, the more it holds the more have come; rise:
// one warm liquid climbing the wall with a meniscus; drop: a drop of it that swells (tokens.json, palette.looks.ring).
// `value` is 0..1. The goo is Liquid's shader, the jelly's light.
import { useMemo } from "react";
import { Liquid, type Blob, type Pour, type Tint } from "./Liquid";
import { black, on, useUid } from "./paint";
import { GLASS, JELLY, LOOKS, SHADE } from "./tokens";

export type RingLook = keyof typeof LOOKS.ring.takes;
const DISC = 0.42;   // the disc's radius, of the ring's size

function pourOf(look: RingLook, v: number): Pour {
  const bottom = 0.5 + DISC, top = 0.5 - DISC;
  if (look === "rise") {
    // one warm liquid, its first colour at the bottom to its last at the top, its surface climbing the wall; two beads of
    // goo rising from it, one still joined, one let go
    const level = bottom - 2 * DISC * v, w = JELLY.warm;
    const tints: Tint[] = [{ x: 0.5, y: bottom, c: w[0] }, { x: 0.3, y: 0.66, c: w[1] }, { x: 0.7, y: 0.5, c: w[2] }, { x: 0.5, y: top + 0.04, c: w[3] }];
    const blobs: Blob[] = [{ x: 0.4, y: level - 0.045, r: 0.05 }, { x: 0.61, y: level - 0.15, r: 0.034 }];
    return { blobs, tints, level, meniscus: 0.06, disc: DISC };
  }
  if (look === "pool") {
    // the six, one pool each, joining from the bottom
    const n = Math.max(2, Math.round(v * JELLY.six.length)), H = 2 * DISC * v, r = 0.06 + 0.13 * Math.sqrt(v);
    const at = [[0.5, 0.15], [0.26, 0.3], [0.74, 0.3], [0.38, 0.72], [0.62, 0.72], [0.5, 1.0]];
    const pts = at.slice(0, n).map(([x, f]) => ({ x, y: bottom - H * (0.25 + 0.6 * f) }));
    return { blobs: pts.map((p) => ({ ...p, r })), tints: pts.map((p, i) => ({ ...p, c: JELLY.six[i] })), disc: DISC };
  }
  // a drop that swells with the value: a round bulb, a tip above it, its colours the jelly's
  const s = 0.09 + 0.23 * v, cx = 0.5, cy = 0.58;
  const tints: Tint[] = JELLY.six.map((c, i) => ({ x: cx + 0.55 * s * Math.cos((i / 6) * 6.283 + 0.6), y: cy + 0.55 * s * Math.sin((i / 6) * 6.283 + 0.6), c }));
  return { blobs: [{ x: cx, y: cy, r: s }, { x: cx, y: cy - s * 1.22, r: s * 0.3 }], tints, halo: 0.4 };
}

export function Ring({ value, size = 80, look = LOOKS.ring.pick }: { value: number; size?: number; look?: RingLook }) {
  // the goo is poured once per value, so a parent drawn again (each key in the chat box) never pours it again
  const pour = useMemo(() => pourOf(look, value), [look, value]);
  const c = size / 2, rr = DISC * size, id = useUid(), held = look !== "drop";
  return (
    <div style={{ position: "relative", width: size, height: size }} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }} aria-hidden>
        <circle cx={c} cy={c} r={rr} fill={black(held ? SHADE.steps.box : SHADE.steps.card)} />
        {!held && <circle cx={c} cy={c} r={rr - 0.5} fill="none" stroke={on(SHADE.on.edge)} strokeDasharray="2 3" />}
      </svg>
      <div style={{ position: "absolute", inset: 0 }}><Liquid size={size} pour={pour} /></div>
      {held && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }} aria-hidden>
          <defs><radialGradient id={`s${id}`} cx="30%" cy="18%" r="60%"><stop offset="0" stopColor={on(1)} stopOpacity="0.2" /><stop offset="1" stopColor={on(1)} stopOpacity="0" /></radialGradient></defs>
          <circle cx={c} cy={c} r={rr} fill={`url(#s${id})`} />
          <circle cx={c} cy={c} r={rr - 0.5} fill="none" stroke={on(GLASS.light.rim)} strokeOpacity="0.55" />
        </svg>
      )}
    </div>
  );
}

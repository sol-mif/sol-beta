// The ground (#1183, the board 11-14: the aura-ground family, sol/design/system/ground/pins-aura.jpg): what the window
// lies on. What the pins do: one hue, the paper carries it, huge soft patches of the same hue lighter or deeper run off
// the edges (never a shape sitting in the space), grain over all, the UI small and sharp on it. A take is a paper and
// its patches (tokens.json palette.ground: mist, cream, dusk; glass, the default, is no take); the goo gain is 1 so no edge is cut. It fills the box it is in and lies under
// everything; with reduced motion it holds still.
import { DEEP, GROUND, PEARL } from "./tokens";
import { useUid } from "./paint";

export type GroundTake = keyof typeof GROUND.takes;
/** whether a take's paper is light (words on it go dark) */
export function groundIsLight(take: GroundTake) {
  const p: string = GROUND.takes[take].paper, h = p === "pearl" ? PEARL : p === "deep" ? DEEP : p, n = parseInt(h.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 128;
}
const VW = 1600, VH = 1000;

export function Ground({ take }: { take: GroundTake }) {
  const id = useUid(), t = GROUND.takes[take], [up, cut] = GROUND.goo;
  const named: string = t.paper, paper = named === "pearl" ? PEARL : named === "deep" ? DEEP : named;
  return (
    <div aria-hidden data-ground={take} style={{ position: "absolute", inset: 0, overflow: "hidden", background: paper, pointerEvents: "none" }}>
      <style>{`@keyframes g${id}{0%{transform:translate(0,0)}50%{transform:translate(var(--dx),var(--dy))}100%{transform:translate(0,0)}}
        @media (prefers-reduced-motion: reduce){.g${id}{animation:none!important}}`}</style>
      <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id={`f${id}`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={GROUND.blur} result="b" />
            <feColorMatrix in="b" type="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${up} ${cut}`} result="goo" />
            <feGaussianBlur in="goo" stdDeviation={GROUND.edge} />
          </filter>
        </defs>
        <g filter={`url(#f${id})`}>
          {t.blobs.map(([c, x, y, r], i) => (
            <g key={i} className={`g${id}`} style={{ animation: `g${id} ${GROUND.drift * (0.7 + 0.15 * i)}s ease-in-out ${-i * 7}s infinite`, ["--dx" as string]: `${(i % 2 ? 1 : -1) * 60}px`, ["--dy" as string]: `${(i % 3 ? -1 : 1) * 40}px` }}>
              <circle cx={x * VW} cy={y * VH} r={r * VW} fill={c} />
            </g>
          ))}
        </g>
      </svg>
      {/* the grain: fine grey noise over the paper and the field alike, as the pins are printed */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: t.grain, mixBlendMode: groundIsLight(take) ? "multiply" : "screen" }}>
        <filter id={`n${id}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  1.6 0 0 0 -0.3" /></filter>
        <rect width="100%" height="100%" filter={`url(#n${id})`} />
      </svg>
    </div>
  );
}

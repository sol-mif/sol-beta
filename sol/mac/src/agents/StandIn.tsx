// The jelly's stand-in (#1327, Marco 2026-11-16: it stays for his first try). BodyOne (body/Bodies.tsx, #1213: the dome
// on a flat seat, the six as bands, deep pill eyes, one lit rim; under 20 px the flat mark with the eyes punched out) is
// not on this branch's base: it lives on #1256. This draws the same outline with BodyOne's props, so Jelly.tsx swaps it
// for BodyOne in one import line the day #1256 lands; nothing but Jelly.tsx imports this file. Its `doing` is the face's
// ladder: rest breathes, work drifts its bands, needs lifts and looks `toward` the ask. Under reduced motion it holds
// still (agents.css). The six bands start at `turn` (0-5), so two agents side by side are told apart.
import { useId } from "react";

/** the body's outline on a 100 box (BodyOne's SHAPE): a soft dome on a flat seat; x 23 to 77, y 30 to 80 */
export const SHAPE = "M23 72 C22 50 30 30 50 30 C70 30 78 50 77 72 C77 78 72 80 66 80 L34 80 C28 80 23 78 23 72 Z";
/** the jelly's six, in the creature's order (Body.tsx SIX), as the palette's variables */
const SIX = ["--heart", "--pink", "--orange", "--amber", "--sun", "--green"] as const;
export type Doing = "rest" | "work" | "needs";
export type Props = { size: number; doing?: Doing; toward?: readonly [number, number]; className?: string; turn?: number };

/** the six from `turn`: where the bands start (0-5); absent, the jelly's own order */
export const bandsFrom = (turn = 0) => { const k = ((Math.round(turn) % 6) + 6) % 6; return [...SIX.slice(k), ...SIX.slice(0, k)]; };

/** the stand-in, BodyOne's props exactly; `toward` turns the eyes (x, y, each -1 to 1), needs alone looks to its right */
export function StandIn({ size, turn, doing = "rest", toward, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const eyes = [41, 56];
  if (size < 20) {
    // the mark (rule 34): one flat shape, the eyes punched out; it carries the agent's first band so two marks differ
    const punched = eyes.map((x) => `M${x + 2.8} 49 a2.8 2.8 0 0 1 2.8 2.8 v5.4 a2.8 2.8 0 0 1 -5.6 0 v-5.4 a2.8 2.8 0 0 1 2.8 -2.8 Z`).join(" ");
    return (
      <svg className={`ag-body ag-mark ${className ?? ""}`} width={size} height={size} viewBox="18 22 64 64" aria-hidden>
        <path d={`${SHAPE} ${punched}`} fill={`var(${bandsFrom(turn)[0]})`} fillRule="evenodd" />
      </svg>
    );
  }
  const bands = bandsFrom(turn);
  const look = toward ?? (doing === "needs" ? ([1, -0.33] as const) : null);
  return (
    <svg className={`ag-body ag-d-${doing} ${className ?? ""}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <clipPath id={`c${uid}`}><path d={SHAPE} /></clipPath>
        {/* the six as bands across the body, from its turn; at work they drift (the pattern slides, there and back) */}
        <linearGradient id={`b${uid}`} x1="23" y1="0" x2="77" y2="0" gradientUnits="userSpaceOnUse" spreadMethod="reflect">
          {bands.map((v, i) => <stop key={v} offset={i / 5} style={{ stopColor: `var(${v})` }} />)}
          {doing === "work" && <animateTransform attributeName="gradientTransform" type="translate" values="0 0;54 0;0 0" dur="6s" repeatCount="indefinite" />}
        </linearGradient>
        <linearGradient id={`s${uid}`} x1="0" y1="30" x2="0" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`r${uid}`} x1="0" y1="30" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* its drop on the ground: wider when it lifts */}
      <ellipse className="ag-drop" cx="50" cy="83" rx="22" ry="3" fill="#000" opacity="0.35" />
      <g className="ag-lift">
        <g clipPath={`url(#c${uid})`}>
          <rect x="0" y="0" width="100" height="100" fill={`url(#b${uid})`} />
          <rect x="0" y="0" width="100" height="100" fill={`url(#s${uid})`} />
          <ellipse cx="38" cy="40" rx="11" ry="6" transform="rotate(-24 38 40)" fill="#fff" opacity="0.28" />
        </g>
        <path d={SHAPE} fill="none" stroke={`url(#r${uid})`} strokeWidth={1.2} clipPath={`url(#c${uid})`} />
        {/* deep pill eyes; needing you, they turn toward the ask (to its right) */}
        <g transform={look ? `translate(${look[0] * 3} ${look[1] * 3})` : undefined}>
          {eyes.map((x) => <rect key={x} className="ag-eye" x={x} y={49} width={5.6} height={11} rx={2.8} fill="var(--c-deep)" opacity="0.92" />)}
        </g>
      </g>
    </svg>
  );
}

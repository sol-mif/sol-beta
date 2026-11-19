// Build becomes yours (#1089): a run, two or three kept tools snapped in the order the Sol user always uses them.
// One drawing: the tools' titles in one chip, a stud on each joint (they are snapped, not listed). Dashed: offered;
// solid: theirs. `at` lights the step whose fill stands in the box now (the ones before it dim; -1: none running).
// A run never sends: a press fills the box with step one; when the agent's turn ends, the next step's fill stands in
// the box by itself. Kit only (Glass, curve, tokens).
import { useState } from "react";
import { Glass, curve } from "../kit";
import { dim, ink, mute, on, textW } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";

const PAD = 12, STUD = 4;
/** the most steps a run holds: past three it is a list, not a thing to press */
export const RUN_MAX = 3;

export function RunChip({ steps, at = -1, kept = false, h = 28, onPress, label }: {
  steps: string[]; at?: number; kept?: boolean; h?: number; onPress?: () => void; label?: string;
}) {
  const [over, setOver] = useState(false);
  const size = T.body[0], shown = steps.slice(0, RUN_MAX);
  const ws = shown.map((s) => PAD * 2 + Math.ceil(textW(s, size, 500)));
  const w = ws.reduce((a, b) => a + b, 0);
  const r = CURVE.radius.row, d = curve(w - 1, h - 1, r - 0.5, CURVE.smoothing, 0.5, 0.5);
  const joints: number[] = []; ws.slice(0, -1).reduce((x, sw) => { joints.push(x + sw); return x + sw; }, 0);
  const line = on(kept ? SHADE.on.edge * 1.6 : over ? 0.5 : 0.32);
  return (
    <button type="button" data-yours-run={kept ? "kept" : "offer"} data-run-at={at} aria-label={label ?? shown.join(", then ")} onClick={onPress} disabled={!onPress}
      onPointerEnter={() => setOver(true)} onPointerLeave={() => setOver(false)} style={{ all: "unset", cursor: onPress ? "pointer" : "default", flex: "none", display: "inline-block" }}>
      <Glass w={w} h={h} r={r} step={over && onPress ? "raised" : "card"} edge={0}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
          <path d={d} fill="none" stroke={line} strokeWidth={1} strokeDasharray={kept ? undefined : "3 3"} />
          {/* the joint: a hairline with a stud on it, pointing the way the run goes */}
          {joints.map((j) => <path key={j} d={`M${j + 0.5} 1V${h / 2 - STUD}a${STUD} ${STUD} 0 0 1 0 ${STUD * 2}V${h - 1}`} fill="none" stroke={line} strokeWidth={1} />)}
        </svg>
        <span style={{ height: "100%", display: "flex", alignItems: "center", fontFamily: T.family, fontSize: size, whiteSpace: "nowrap" }}>
          {shown.map((s, i) => <b key={i} style={{ width: ws[i], textAlign: "center", fontWeight: 500, color: at < 0 || i === at ? ink : i < at ? mute : dim, transition: "color var(--d-turn) var(--e-move)" }}>{s}</b>)}
        </span>
      </Glass>
    </button>
  );
}

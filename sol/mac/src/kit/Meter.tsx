// A meter in a line (#647, kit growth: the mode ladder's "how much it does alone" and the context card's "what fills
// it" both needed one; look.md: a meter is the jelly's goo, its colours arriving one by one). A track of glass, filled
// from the left with the jelly's warm colours in the jelly's light: the colours lie across the whole track, so the fuller
// it is the more of them have come. `value` fills it as one; `parts` fills it part by part, each part the next colour
// and a hair of the black between them, the rest left empty (what is free). The warm four, never the red and green the
// meaning channel holds (look.md: error, live).
import { black, jellyBands, on } from "./paint";
import { GLASS, JELLY, SHADE } from "./tokens";

/** the colour a meter gives part `i` */
export const partColour = (i: number) => JELLY.warm[i % JELLY.warm.length];

export function Meter({ w, h = 8, value, parts, label }: { w: number; h?: number; value?: number; parts?: readonly number[]; label?: string }) {
  const r = h / 2, light = `linear-gradient(180deg, ${on(GLASS.light.rim)}, transparent 55%, ${black(0.16)})`;
  const fill = Math.max(0, Math.min(1, value ?? (parts ?? []).reduce((a, b) => a + b, 0)));
  return (
    <div role="meter" aria-label={label} aria-valuenow={Math.round(fill * 100)} aria-valuemin={0} aria-valuemax={100}
      style={{ position: "relative", width: w, height: h, flex: "none", borderRadius: r, overflow: "hidden", background: black(SHADE.steps.box), boxShadow: `inset 0 0 0 1px ${on(SHADE.on.edge)}` }}>
      {parts
        ? <div style={{ position: "absolute", inset: 0, display: "flex", gap: 1 }}>
            {parts.map((p, i) => p > 0 && <i key={i} style={{ display: "block", width: `${p * 100}%`, height: "100%", background: `${light}, ${partColour(i)}` }} />)}
          </div>
        : fill > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Math.max(h, w * fill), borderRadius: r,
            backgroundImage: `${light}, ${jellyBands(JELLY.warm)}`, backgroundSize: `100% 100%, ${w}px 100%` }} />}
    </div>
  );
}

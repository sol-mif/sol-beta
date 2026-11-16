// A close's outline (#778, #751 B15; feel.md "close"): where the block was, a dashed pearl outline for 6 s with a 44 px
// ring that drains; pressing it brings the block back (the same as ⌘Z when the close is the last verb). No words, no
// toast: the outline and the ring are the whole answer. For the stage behind `stage.whole`.
import type { CSSProperties } from "react";
import { GLYPH_UNDO, LIFE, RING } from "../kit/feel";
import type { Rect } from "./model";
import "./undo.css";

export function Scar({ r, onBack }: { r: Rect; onBack: () => void }) {
  const c = 2 * Math.PI * RING.r;
  const style = { left: r.x, top: r.y, width: r.w, height: r.h, "--life-scar": `${LIFE.scar}ms`, "--ring-len": c } as CSSProperties;
  return (
    <div className="st-scar" style={style} data-scar>
      <button className="st-scar-u" aria-label="bring it back" onClick={onBack}>
        <svg className="st-scar-rg" viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden><circle cx={RING.size / 2} cy={RING.size / 2} r={RING.r} strokeDasharray={c} /></svg>
        <svg className="st-scar-ic" viewBox="0 0 18 18" aria-hidden>{GLYPH_UNDO.map((d) => <path key={d} d={d} />)}</svg>
      </button>
    </div>
  );
}

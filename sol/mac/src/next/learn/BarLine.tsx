// The canvas bar's one line of help (BR1 #1615; mine/look/br1/learn.html part 3, note 9): a "how do I…" typed into the
// canvas bar is answered here, one line above the bar, with Show me (its walk's step, on the person's own canvas) and
// Open in Help (the question and its answer carried into the Help session). Never "Not a move I know". It goes on Esc, a
// press elsewhere, or Show me. DOM hooks: [data-bar-help], [data-bar-help-show], [data-bar-help-open].
// Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNext } from "../cv/index.ts";
import { H, barGone, barToHelp } from "./help-state.ts";
import { showMe } from "./learn-state.ts";
import "./learn.css";

/** the line's place: centred over the bar (the canvas's verbs, else the talk pill), its gap above */
function useAbove(on: boolean): { left: number; width: number; bottom: number } | null {
  const [at, setAt] = useState<{ left: number; width: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    if (!on) { setAt(null); return; }
    const look = () => {
      const t = document.getElementById("talk")?.getBoundingClientRect();
      if (!t) return setAt(null);
      const b = document.getElementById("bar")?.getBoundingClientRect(), top = b && b.height ? Math.min(b.top, t.top) : t.top;
      setAt({ left: t.left, width: t.width, bottom: innerHeight - top });
    };
    look();
    addEventListener("resize", look);
    return () => removeEventListener("resize", look);
  }, [on]);
  return at;
}

export default function BarLine() {
  const l = useNext(() => H.line);
  const at = useAbove(!!l);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!l) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as Element)?.closest?.("#talk")) barGone(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); barGone(); } };
    addEventListener("pointerdown", away, true); addEventListener("keydown", esc, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", esc, true); };
  }, [l]);
  if (!l) return null;
  const a = l.a;
  return (
    <div ref={box} className="lr-line" role="status" aria-live="polite" data-bar-help={a ? "answered" : "asking"}
      style={at ? { left: at.left, width: at.width, bottom: at.bottom } : { visibility: "hidden" }}>
      <span className="lr-lq">?</span>
      <span className="lr-lt">{a ? a.text : "Looking it up…"}</span>
      {a?.show ? <button type="button" className="lr-show" data-bar-help-show={`${a.show.walk}:${a.show.step}`} onClick={() => { const s = a.show!; barGone(); showMe(s); }}>▶ Show me</button> : null}
      {a ? <button type="button" className="lr-alt" data-bar-help-open onClick={barToHelp}>Open in Help</button> : null}
    </div>
  );
}

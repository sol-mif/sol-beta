// Dictation (#647 round 4, from the kit #674). Marco, 2026-11-06: dictation used the old stuff (VoiceBody, VoiceRibbon)
// and wants "a new visual concept", with "a live transcript of what the person is dictating which they can change whilst
// talking ... when loading it's a lighter tone and once dictation is done it becomes normal text and then I can just
// send". The transcript is Composer's: the words not yet final in a lighter tone after the box's own words, which stay
// editable. Round 3 asked where "it hears you" should live (the box's edge, the row, the caret); round 4 draws one,
// from its job: it hears you where your words go, so the box's own edge carries it. The rim of the chat box (the kit's
// Field) is lit with the jelly's colours as light, the way the jelly's halo is while it works (look.md, the halo's
// states: working is its colours close, as light; LOOKS.halo.takes.close): its strength rises and falls with the voice.
// The jelly itself never stands in the box (a control). The row steps back to the time and a "done".
import { useEffect, useRef, useState } from "react";
import { micLevel } from "../voice";
import { reducedMotion } from "../motion";
import { curve } from "../kit/curve";
import { useSize, useUid } from "../kit/paint";
import { CURVE, JELLY, LOOKS } from "../kit/tokens";

/** the voice's level, 0..1, written as --lvl on `el` every frame while `on` (still under reduced motion) */
export function useLevel(el: React.RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const t = el.current;
    if (!on || !t) { t?.style.removeProperty("--lvl"); return; }
    if (reducedMotion()) { t.style.setProperty("--lvl", "0.5"); return () => t.style.removeProperty("--lvl"); }
    let raf = 0, v = 0;
    const tick = () => { const l = Math.min(1, (micLevel() ?? 0) * 6); v += (l - v) * 0.25; t.style.setProperty("--lvl", v.toFixed(3)); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); t.style.removeProperty("--lvl"); };
  }, [el, on]);
}

/** the time since `on` turned true, m:ss */
export function useElapsed(on: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!on) { setS(0); return; }
    const t0 = Date.now();
    const id = window.setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [on]);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** it hears you: the rim of the box it lies in, lit with the jelly's colours at the working halo's strength, which the
 *  voice's level (--lvl, from useLevel on that box) raises from the take's floor (lo) to its gain */
export function Hears() {
  const at = useRef<HTMLDivElement>(null), [w, h] = useSize(at), id = useUid();
  const k = LOOKS.halo.takes[LOOKS.halo.states.working], S = CURVE.smoothing, r = CURVE.radius.field;
  const d = w > 0 ? curve(w - 1, h - 1, r - 0.5, S, 0.5, 0.5) : "";
  const strength = `calc(${k.gain} * (${k.lo} + ${1 - k.lo} * var(--lvl, 0.5)))`;
  return (
    <div ref={at} className="whears" aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {d && <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: strength, filter: `blur(${6 * k.reach}px)` }}>
        <defs><linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="0.3">{JELLY.six.map((c, j) => <stop key={j} offset={j / (JELLY.six.length - 1)} stopColor={c} />)}</linearGradient></defs>
        <path d={d} fill="none" stroke={`url(#h${id})`} strokeWidth={4 * k.reach} opacity={k.carry} />
      </svg>}
      {d && <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: strength }}>
        <path d={d} fill="none" stroke={`url(#h${id})`} strokeWidth={1.5} opacity={k.light} />
      </svg>}
    </div>
  );
}

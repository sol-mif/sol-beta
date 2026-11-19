// Build becomes yours (#1089), the look: a layout the Sol user keeps. Nothing here is a card or a sentence: a layout is
// shown as the window in small (LayGlyph: the outline, the talk filled where it stands) and tried on their own stage.
//   the offer   one dashed chip on the line, the glyph and "Talk on the right": a press keeps it as they left it
//   LayPick     after the keep, in the chip's place: three glyphs, theirs solid, two more dashed. Pointer over one (or
//               ← →) lays their real stage out that way while it is there; a press keeps that one instead. The
//               glyphs hold their place on the screen while the stage moves under them
// The face keeps nothing in a session's stage.json for this: a kept layout is where a NEW session of the project
// starts (`seen.stage.talk ?? keptLay ?? DEFAULT_TALK`), and a try is one value read before all three (`useTried`).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Glass, curve } from "../kit";
import { dim, on } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";

import { type Lay, type LayVersion, layTitle } from "./lays";
import { useBuildYours } from "./live";
export { laysOf, layTitle, type Lay, type LayVersion } from "./lays";

/** the window in small: its outline, the talk filled where it stands. 26 x 16, drawn on the kit's curve */
export function LayGlyph({ lay, w = 26, h = 16, dim: quiet = false }: { lay: Lay; w?: number; h?: number; dim?: boolean }) {
  const share = lay.width ?? 0.36, tw = Math.max(5, Math.round((w - 4) * share));
  const r = lay.dock === "full" ? { x: 2, y: 2, w: w - 4, h: h - 4 } : lay.dock === "bottom" ? { x: 2, y: h - 6, w: w - 4, h: 4 }
    : { x: lay.dock === "right" ? w - 2 - tw : 2, y: 2, w: tw, h: h - 4 };
  return (
    <svg width={w} height={h} aria-hidden style={{ display: "block", flex: "none" }}>
      <path d={curve(w - 1, h - 1, 3.5, CURVE.smoothing, 0.5, 0.5)} fill="none" stroke={on(quiet ? SHADE.on.mute : SHADE.on.dim)} />
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} fill={on(quiet ? SHADE.on.mute : SHADE.on.ink)} />
    </svg>
  );
}

// the layout being tried, if any: one value for the whole face, read by the stage before the kept one
let tried: Lay | null = null;
const heard = new Set<() => void>();
/** try a layout on the stage (null: put it back) */
export function tryLay(l: Lay | null) { if (tried === l) return; tried = l; heard.forEach((f) => f()); }
/** the layout being tried right now, or null (the stage reads this first) */
export const useTried = () => {
  const on = useBuildYours();   // with the switch off a try left behind is never read
  const t = useSyncExternalStore((f) => { heard.add(f); return () => { heard.delete(f); }; }, () => tried, () => null);
  return on ? t : null;
};

const CELL_W = 38, CELL_H = 28, GAP = 4;
/** three layouts to try and keep, as glyphs in the chip's place. `kept` is the one that is theirs now (-1: none yet).
 *  Pointer over or focus on a cell tries it (`onTry`, null on leaving); a press keeps it. ← → move among them, Esc
 *  puts the stage back. A try moves the talk, and the line with it: the glyphs HOLD THEIR PLACE on the screen from the
 *  first pointer-over until the pointer leaves them, so the thing under the pointer never slides away (without this
 *  the stage flickers between two layouts). `after` is the word beside them ("from now on"); while another layout is
 *  tried it reads that layout's words instead, and travels with the glyphs */
export function LayPick({ versions, kept, onTry, onKeep, after }: { versions: LayVersion[]; kept: number; onTry: (i: number | null) => void; onKeep: (i: number) => void; after?: string }) {
  const [over, setOver] = useState(-1);
  // gone from the screen (the line moved on, the switch went off): the layout tried is put back
  const tryNow = useRef(onTry); tryNow.current = onTry;
  useEffect(() => () => { tryNow.current(null); tryLay(null); }, []);
  const home = useRef<HTMLSpanElement>(null), pin = useRef<{ left: number; top: number } | null>(null), [d, setD] = useState({ x: 0, y: 0 });
  const hold = () => { const h = home.current; if (!h || !pin.current) return; const r = h.getBoundingClientRect(), x = Math.round(pin.current.left - r.left), y = Math.round(pin.current.top - r.top); setD((o) => (o.x === x && o.y === y ? o : { x, y })); };
  useLayoutEffect(hold);   // after every draw of the line
  useEffect(() => {        // and on every frame while held (the stage may move without the line being drawn again)
    if (over < 0) return;
    let raf = requestAnimationFrame(function f() { hold(); raf = requestAnimationFrame(f); });
    return () => cancelAnimationFrame(raf);
  }, [over < 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = (i: number | null, byPointer = false) => {
    if (i !== null && byPointer && !pin.current && home.current) { const r = home.current.getBoundingClientRect(); pin.current = { left: r.left, top: r.top }; }
    if (i === null) { pin.current = null; setD({ x: 0, y: 0 }); }
    setOver(i ?? -1); onTry(i);
  };
  const word = over >= 0 && over !== kept ? versions[over].words : after;
  const w = versions.length * CELL_W + (versions.length - 1) * GAP;
  return (
    <span ref={home} data-yours-lays style={{ display: "inline-flex", alignItems: "center", gap: 10, flex: "none", height: CELL_H }}>
      <span role="radiogroup" aria-label="how the window is laid out" onPointerLeave={() => at(null)}
        style={{ display: "inline-flex", alignItems: "center", gap: GAP, flex: "none", width: w, position: "relative",
          // held away from the line: it stands on the one black, so what slid under it (the pearl, a word) never reads through
          ...(d.x || d.y ? { zIndex: 80, transform: `translate(${d.x}px, ${d.y}px)`, background: "var(--base-color)", boxShadow: "0 0 0 6px var(--base-color)", borderRadius: CURVE.radius.chip } : {}) }}>
        {versions.map((v, i) => {
          const mine = i === kept, lit = i === over;
          return (
            <button key={v.words} type="button" role="radio" aria-checked={mine} aria-label={`${layTitle(v.lay)}, ${v.words}`} title={v.words} data-lay={mine ? "kept" : "try"}
              onPointerEnter={() => at(i, true)} onFocus={() => { if (over < 0) at(i); }} onBlur={() => { if (!pin.current) at(null); }} onClick={() => onKeep(i)}
              onKeyDown={(e) => {
                const row = e.currentTarget.parentElement?.children;
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = (i + (e.key === "ArrowRight" ? 1 : versions.length - 1)) % versions.length; (row?.[n] as HTMLElement | undefined)?.focus(); at(n); }
                else if (e.key === "Escape") { e.stopPropagation(); at(null); e.currentTarget.blur(); }
              }}
              style={{ all: "unset", cursor: "pointer", flex: "none", display: "inline-block" }}>
              <Glass w={CELL_W} h={CELL_H} r={CURVE.radius.chip} step={lit || mine ? "raised" : "card"} edge={0}>
                <svg width={CELL_W} height={CELL_H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
                  <path d={curve(CELL_W - 1, CELL_H - 1, CURVE.radius.chip - 0.5, CURVE.smoothing, 0.5, 0.5)} fill="none" stroke={on(mine ? SHADE.on.edge * 1.6 : lit ? 0.5 : 0.32)} strokeDasharray={mine ? undefined : "3 3"} />
                </svg>
                <span style={{ height: "100%", display: "grid", placeItems: "center" }}><LayGlyph lay={v.lay} dim={!mine && !lit} /></span>
              </Glass>
            </button>
          );
        })}
        {word && <span data-yours-layword style={{ position: "absolute", left: w + 10, top: 0, lineHeight: `${CELL_H}px`, whiteSpace: "nowrap", color: dim, fontSize: T.label[0], fontFamily: T.family, pointerEvents: "none",
          ...(d.x || d.y ? { background: "var(--base-color)", boxShadow: "0 0 0 6px var(--base-color)", borderRadius: CURVE.radius.chip } : {}) }}>{word}</span>}
      </span>
      {word && <span aria-hidden style={{ visibility: "hidden", whiteSpace: "nowrap", fontSize: T.label[0], fontFamily: T.family }}>{after ?? word}</span>}
    </span>
  );
}

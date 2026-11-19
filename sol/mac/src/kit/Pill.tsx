// A pill, the picker (#674, look.md: the pearl): words in one track of glass, the picked one held by a pearl thumb
// (pill a, Marco's pick; raised and line are round 1's alternates, not drawn yet). `seg` is each word's width; left out,
// each is as wide as the widest word (#647, the row's pickers: one word each, the model, the mode, the folder).
// At rest (#647 round 5's pins, Marco 2026-11-07: "why are all the buttons still gray"): no grey, no rim, no edge. How it
// looks at rest is a pick still Marco's, so it is three versions on one switch (`REST`, the page root's data-rest, read
// once from localStorage "sol.rest"): words, the word alone on the black, the lit one in the jelly's heat; black, the pill
// in the box's own black, no lift; tint, a faint jelly tint under its word. In all three, under the pointer, pressed, or
// its card open (`up`) it lifts: the on colour at shade.on.flat.
// `picked` -1 holds none: a picker that is not open has nothing that has you. `wash` lays the jelly's colours through
// its glass at that strength, as a button's hover does (look.md: colour from the jelly), for a pill that is lit by
// what it says (the mode in Bypass); its words are then the on colour, held by the black (in words, the word itself
// wears the heat). `start` sets each word at the pill's padding instead of its centre, so a row's first word stands on a
// text edge to the pixel (#647: the talk's).
import { useState, type CSSProperties, type ReactNode } from "react";
import { Glass } from "./Glass";
import { Pearl, type PearlLook } from "./Pearl";
import { black, deep, dim, ink, jellyBands, on, textW } from "./paint";
import { JELLY, LOOKS, SHADE, TYPE } from "./tokens";

/** how a pill or a flat button looks at rest: tint, Marco's pick (2026-11-07, #647); words and black stay as versions the switch can show */
export type Rest = "words" | "black" | "tint";
const RESTS: readonly Rest[] = ["words", "black", "tint"];
export const REST: Rest = (() => {
  let r: Rest = "tint";
  try { const v = localStorage.getItem("sol.rest") as Rest | null; if (v && RESTS.includes(v)) r = v; } catch { /* no storage */ }
  if (typeof document !== "undefined") document.documentElement.dataset.rest = r;
  return r;
})();

/** the tint's strength: half a button's hover wash, so the tint at rest is always fainter than the wash under the pointer */
const TINT = LOOKS.button.takes.wash.hover / 2;
/** what lies under a word at rest, by the pick: nothing, the box's black, or the jelly's tint (its warm four: the six
 *  squeezed into a short pill read as red into green) */
export const restFill = (up: boolean) => (up ? on(SHADE.on.flat) : REST === "black" ? black(SHADE.steps.box) : "transparent");
export const restTint = (up: boolean): ReactNode => (REST === "tint" ? <div style={{ position: "absolute", inset: 0, backgroundImage: jellyBands(JELLY.warm, JELLY.angle, JELLY.soft), opacity: up ? TINT / 2 : TINT }} /> : null);
/** a word that wears the jelly's heat itself (words, the lit one): the bands clipped to its letters, drifting */
export const heatWord = (cols: readonly string[] = JELLY.six): CSSProperties => ({
  backgroundImage: jellyBands(cols, 90, 0.03), backgroundSize: "200% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontWeight: 500,
});

/** the pill's glass behind a box that sizes itself (the effort pill): the rest pick, the lift, and what lights it */
export function PillBack({ h, up, over }: { h: number; up: boolean; over?: ReactNode }) {
  return <Glass r={h / 2} fill={restFill(up)} edge={0} over={<>{restTint(up)}{over}</>} />;
}

export function Pill({ words, picked, seg, h = 32, pearl, wash = 0, start, up = false, onPick }: {
  words: readonly string[]; picked: number; seg?: number; h?: number; pearl?: PearlLook; wash?: number; start?: boolean; up?: boolean; onPick?: (i: number) => void;
}) {
  const [felt, setFelt] = useState(false), lift = up || felt;
  const inset = Math.round(h / 8), size = TYPE.pill[0], pad = h / 2;
  const s = seg ?? Math.max(...words.map((wd) => textW(wd, size, 500))) + 2 * pad - 2 * inset;
  const w = s * words.length + 2 * inset, th = h - 2 * inset;
  const bare = REST === "words";   // words: no pill; the pick and the lit one wear the heat in their letters
  // lit: the effort pill's heat, the same on every pill with consequence (Marco 2026-11-07: the effort pill looks great,
  // the rest must match it): the six bands drifting, a dark calm from the left so the word reads, the word white
  const lit = wash > 0 && !bare && (
    <>
      <div className="kheat" style={{ position: "absolute", inset: 0, backgroundImage: jellyBands(JELLY.six, 90, 0.03), backgroundSize: "200% 100%", opacity: wash }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent 10%, ${black(0.34)} 45%, ${black(0.42)})` }} />
    </>
  );
  const word = (i: number): CSSProperties =>
    i === picked && !bare ? { color: deep(), fontWeight: 500 }
    : (i === picked || wash > 0) && bare ? heatWord()
    : wash > 0 ? { color: "#fff", fontWeight: 500, textShadow: "0 0 2px rgba(0,0,0,.9), 0 1px 3px rgba(0,0,0,.7)" }
    : { color: picked < 0 || lift ? ink : dim, fontWeight: 400 };
  return (
    <div style={{ display: "flex", flex: "none" }} onPointerEnter={() => setFelt(true)} onPointerLeave={() => setFelt(false)}>
      <Glass w={w} h={h} r={h / 2} fill={restFill(lift)} edge={0} over={<>{wash > 0 && !bare ? null : restTint(lift)}{lit || null}</>}>
        {picked >= 0 && !bare && <Pearl w={s} h={th} r={th / 2} look={pearl} style={{ position: "absolute", left: inset + s * picked, top: inset }} />}
        <div style={{ position: "absolute", inset: `0 ${inset}px`, display: "flex", alignItems: "center", fontSize: size, lineHeight: `${TYPE.pill[1]}px` }}>
          {words.map((wd, i) => (
            <div key={wd} onClick={onPick && (() => onPick(i))} style={{ width: s, textAlign: start ? "left" : "center", paddingLeft: start ? pad - inset : 0, boxSizing: "border-box", whiteSpace: "nowrap", position: "relative" }}>
              <span className={(i === picked || wash > 0) && bare ? "kheat" : undefined} style={word(i)}>{wd}</span>
            </div>
          ))}
        </div>
      </Glass>
    </div>
  );
}

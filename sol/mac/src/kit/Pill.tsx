// A pill, the picker (#674, look.md: the pearl): words in one track of glass, the picked one held by a pearl thumb
// (pill a, Marco's pick; raised and line are round 1's alternates, not drawn yet). `seg` is each word's width; left out,
// each is as wide as the widest word (#647, the row's pickers: one word each, the model, the mode, the folder).
// `picked` -1 holds none: a picker that is not open has nothing that has you. `wash` lays the jelly's colours through
// its glass at that strength, as a button's hover does (look.md: colour from the jelly), for a pill that is lit by
// what it says (the mode in Bypass); its words are then the on colour, held by the black. `start` sets each word at
// the pill's padding instead of its centre, so a row's first word stands on a text edge to the pixel (#647: the talk's).
import { Glass } from "./Glass";
import { Pearl, type PearlLook } from "./Pearl";
import { black, deep, dim, ink, jellyBands, onColour, textW } from "./paint";
import { JELLY, TYPE } from "./tokens";

export function Pill({ words, picked, seg, h = 32, pearl, wash = 0, start, onPick }: {
  words: readonly string[]; picked: number; seg?: number; h?: number; pearl?: PearlLook; wash?: number; start?: boolean; onPick?: (i: number) => void;
}) {
  const inset = Math.round(h / 8), size = TYPE.body[0], pad = h / 2;
  const s = seg ?? Math.max(...words.map((wd) => textW(wd, size, 500))) + 2 * pad - 2 * inset;
  const w = s * words.length + 2 * inset, th = h - 2 * inset;
  const lit = wash > 0 && (
    <>
      <div style={{ position: "absolute", inset: 0, backgroundImage: jellyBands(), backgroundSize: "200% 100%", backgroundPosition: "30% 0", opacity: wash }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 80% at 50% 55%, ${black(JELLY.veil * wash)}, transparent)` }} />
    </>
  );
  return (
    <Glass w={w} h={h} r={h / 2} step="card" over={lit || undefined}>
      {picked >= 0 && <Pearl w={s} h={th} r={th / 2} look={pearl} style={{ position: "absolute", left: inset + s * picked, top: inset }} />}
      <div style={{ position: "absolute", inset: `0 ${inset}px`, display: "flex", alignItems: "center", fontSize: size, lineHeight: `${TYPE.body[1]}px` }}>
        {words.map((wd, i) => (
          <div key={wd} onClick={onPick && (() => onPick(i))} style={{ width: s, textAlign: start ? "left" : "center", paddingLeft: start ? pad - inset : 0, boxSizing: "border-box", whiteSpace: "nowrap", position: "relative",
            ...(i === picked ? { color: deep(), fontWeight: 500 } : wash > 0 ? { ...onColour, fontWeight: 500 } : { color: picked < 0 ? ink : dim, fontWeight: 400 }) }}>{wd}</div>
        ))}
      </div>
    </Glass>
  );
}

// The dial for show, don't say (#1020, #1036): one row in Settings › look, under the page's card. Three stops, each drawn
// as what a row looks like there: words (off: every line written), marks (state drawn as a mark with its word on hover,
// the second lines kept), pictures (the marks, and the second lines folded away until the hand asks). This window's alone.
import { CellRange } from "../creature/indicators";
import { useShell } from "../settingsShell";
import { DEGREES, setDegree, useDegree, type Degree } from "./flag";

export const meta = {
  ShownRow: {
    job: "show, don't say: the dial from words to pictures, one row in Settings › look",
    flow: "mine",
    states: ["words", "marks", "pictures"],
    keys: [
      { press: "drag the dial, or ← →", does: "words, then marks, then pictures: the whole face moves a step at once; back the same way" },
      { press: "click a stop's picture", does: "that step" },
    ],
    listens: ["look.shown and look.shown.deg (shown/flag.ts)", "the Settings section shown"],
  },
};

/** a row as it looks at a degree: a mark or none, the line, and a second line or none */
function Stop({ d, on, pick }: { d: Degree; on: boolean; pick: () => void }) {
  const ink = "currentColor";
  return (
    <button type="button" className={`sh-stop ${on ? "on" : ""}`} data-degree={d} title={DEGREES[d]} aria-label={DEGREES[d]} aria-pressed={on} onClick={pick}>
      <svg width="44" height="26" viewBox="0 0 44 26" aria-hidden="true">
        {d > 0 && <circle cx="6" cy={d === 2 ? 13 : 8} r="3.5" fill={ink} />}
        <rect x={d > 0 ? 14 : 4} y={d === 2 ? 11 : 6} width={d === 2 ? 18 : d > 0 ? 26 : 36} height="4" rx="2" fill={ink} opacity=".8" />
        {d < 2 && <rect x={d > 0 ? 14 : 4} y="15" width={d > 0 ? 20 : 30} height="3" rx="1.5" fill={ink} opacity=".4" />}
        {d === 0 && <rect x="4" y="21" width="24" height="3" rx="1.5" fill={ink} opacity=".4" />}
      </svg>
    </button>
  );
}

export function ShownRow() {
  const sh = useShell();
  const deg = useDegree();
  if (!sh || sh.sel !== "look") return null;
  return (
    <div className="v3-switch" data-shown-row data-degree={deg}>
      <div className="field-r">
        <div className="lab"><span>words to pictures</span><small>how much of Sol is drawn instead of written</small></div>
        <div className="range sh-dial">
          <CellRange min={0} max={2} step={1} value={deg} aria-label="words to pictures" aria-valuetext={DEGREES[deg]} onChange={(ev) => setDegree(Number(ev.target.value) as Degree)} />
          <span className="sh-stops">{([0, 1, 2] as Degree[]).map((d) => <Stop key={d} d={d} on={d === deg} pick={() => setDegree(d)} />)}</span>
        </div>
      </div>
    </div>
  );
}

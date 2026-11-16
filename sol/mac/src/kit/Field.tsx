// A text field (#674, look.md: material): glass on the continuous curve that says it has you by its shade deepening,
// card to box, with no focus ring (field a, Marco's pick; rim and glow are round 1's alternates, not drawn yet). `focus`
// sets it for a picture; left out, focus inside it sets it. With no `w` it is the glass of the box it lies in (#647, the
// chat box: the box keeps its own words, the field is drawn behind them at its size); `focus` then says whether it has you.
import { useState, type ReactNode } from "react";
import { Glass } from "./Glass";
import { ink, mute } from "./paint";
import { CURVE } from "./tokens";

export function Field({ w, h = 44, focus, children }: { w?: number; h?: number; focus?: boolean; children?: ReactNode }) {
  const [felt, setFelt] = useState(false), has = focus ?? felt;
  if (w === undefined) return <Glass r={CURVE.radius.field} step={has ? "box" : "card"} />;
  return (
    <div onFocus={() => setFelt(true)} onBlur={() => setFelt(false)}>
      <Glass w={w} h={h} r={CURVE.radius.field} step={has ? "box" : "card"}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 14px", color: has ? ink : mute }}>{children}</div>
      </Glass>
    </div>
  );
}

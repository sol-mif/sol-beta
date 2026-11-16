// Calm (#795, plan Part C slice 32; home/whole.md pain 6, scene 10, pick 4 a; the still home/shots/10.png), behind
// sol.home.whole. When nothing needs you Home is one line, "Nothing needs you." in display type, with one quiet line
// under it of what moves on its own and what is next; the glass behind it breathes (4800 ms, system/ui.md "Motion":
// "Home's line → breath") in the jelly's colours. It settles in: the line fades up and the glow comes in, already
// breathing. What was just done stays under it with its undo (First.tsx's receipt). Looks from the kit's
// tokens (the jelly) and the kit's display step (t-display, #846); home/whole-calm.css holds its layout only.
import { dim, ink } from "../../kit/paint";
import { BREATH, GLOW, breathOf, calmLine } from "./quiet";
import type { Thing, Today } from "./today";
import "../whole-calm.css";

export function Calm({ today, things, now, line, children }: { today: Today; things: Map<string, Thing>; now: number; line: string; children?: React.ReactNode }) {
  const sub = calmLine(today, things, now);
  const [warm, green] = breathOf();
  const breathe = (delay: number) => ({
    animation: `hcalm-breathe ${BREATH.ms}ms ${BREATH.ease} ${delay}ms infinite`,
    filter: `blur(${GLOW.blur}px)`,   // the kit's softness (SHADE.blur)
  });
  return (
    <div className="hcalm" data-calm data-breath={BREATH.ms}>
      <div className="hcalm-glass" aria-hidden>
        <div className="hcalm-glow" data-glow="warm" style={{ background: warm, ...breathe(0) }} />
        <div className="hcalm-glow hcalm-glow-b" data-glow="green" style={{ background: green, ...breathe(-BREATH.ms / 2) }} />
      </div>
      <div className="hcalm-words">
        <h1 className="hcalm-line t-display" data-line style={{ color: ink }}>{line}</h1>
        {sub && <div className="hcalm-sub t-read" data-calm-sub style={{ color: dim }}>{sub}</div>}
        {children}{/* C33: the way to Sources stays on calm too (#869 R3) */}
      </div>
    </div>
  );
}

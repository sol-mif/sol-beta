// The side-by-side's dev page (#1423): the closing moment's left column as One.tsx draws it for a person with a setup,
// on a made-up one (dev.ts). onboard-setup.html?s=settled presses a choice on each disagreement; ?s=none is a setup
// with nothing to settle.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Glass } from "../../kit";
import { CURVE } from "../../kit/tokens";
import { Body } from "../../Body";
import { Level } from "../Yours";
import { Reach, SideBySide } from "../SideBySide";
import { openOf, rowsOf, type Choice, type Reach as ReachT } from "../setup";
import type { Hands } from "../record";
import { DEV } from "./dev";
import "../../tokens.css";
import "../../palette.css";
import "../../kit/type.css";
import "./page.css";
import "../one.css";

const s = new URLSearchParams(location.search).get("s");
const rows = rowsOf(s === "none" ? { ...DEV, files: [], settings: [] } : DEV);
const PICKS: Choice[] = ["yours", "jelly-here", "try", "later"];

function Page() {
  const [choices, setChoices] = useState<Partial<Record<string, Choice>>>(() => (s === "settled" ? Object.fromEntries(openOf(rows, {}).map((r, i) => [r.id, r.shared && PICKS[i] === "jelly-here" ? "jelly-here" : PICKS[i] === "jelly-here" ? "jelly" : PICKS[i]])) : {}));
  const [reach, setReach] = useState<ReachT>(s === "settled" ? "show" : "read"), [hands, setHands] = useState<Hands>("show");
  const n = openOf(rows, choices).length, was = openOf(rows, {}).length;
  return (
    <div className="ob-wrap">
      <div className="ob-stage ob1-stage m-yours fh">
        <div className="ob-jelly"><Body size={40} state="settled" /></div>
        <div className="ob-line"><div className="t-display">Your setup and mine, side by side.</div><div className="t-read">{n ? `Yours comes in as it is. ${n === 1 ? "One thing differs" : `${n} things differ`}: pick, or leave it and yours holds.` : was ? "Yours comes in as it is, and what differed is settled." : "Yours comes in as it is; nothing differs."}</div></div>
        <div className="ob-left">
          <div className="ob-pane">
            <div className="ob-glass"><Glass w={440} h={420} r={CURVE.radius.card} step="card"><span /></Glass></div>
            <SideBySide rows={rows} choices={choices} onChoose={(id, c) => setChoices((x) => { const m = { ...x }; if (c) m[id] = c; else delete m[id]; return m; })} onDone={() => {}} />
          </div>
          <div className="ob-foot yours"><Level value={hands} onChange={setHands} w={440} /><Reach value={reach} onChange={setReach} w={440} /></div>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);

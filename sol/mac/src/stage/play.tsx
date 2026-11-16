// The stage's dev page (#696): the stage on the fixture, in a window drawn the way the design page's shots draw it (the
// spine, the side with its sessions and "blocks here", the stage, a strip of two lines, the bar), so its scenes can be
// shot against shots 04, 07, 08, 09, 10 and 12 with no engine (sol/design/system/stage.mjs). Dev only, like kit.html:
// stage.html is not in the face's build inputs. The spine, the sessions, the strip and the bar are pictures here; the
// stage and "blocks here" are the real ones.
//   stage.html                the fixture's first three blocks (shot 04)
//   stage.html?n=5            all five: the stills and the gate find no room and the stage tiles itself
//   stage.html?also=legacy    the table besides
//   stage.html?talk=column   the real talk beside it (StageColumn: its docks, ⌘↑ full and ⌘↓ back, #788 B25)
//   stage.html?link=fake      a socket that is not an engine: a terminal block attaches to a shell that already said
//                             something (the kinds' stills, #738: shoot-kinds.mjs)
// window.__stage: { store, session, pour(n), say(lines) } for the shooter.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import home from "../../../design/body/real/desktop.jpg";
import { Glass, Halo, Pill } from "../kit";
import { CURVE } from "../kit/tokens";
import { Stage } from "./Stage";
import { BlocksHere } from "./BlocksHere";
import { StageColumn } from "./StageColumn";   // B25
import type { Item } from "../work/useWork";   // B25
import { LocalStore } from "./store";
import { store as engine } from "./engineStore";
import { pour, ORDER } from "./fixture";
import "../tokens.css";
import "../palette.css";
import "../kit/type.css";
import "./play.css";

const q = new URLSearchParams(location.search);
const session = "the-stage";
const store = new LocalStore(`sol.stage.play.${Date.now()}.`);   // a fresh stage each load: the fixture is the start
type Said = [string, string, string?];
// the fake socket: what the gate said on the NucBox, for a terminal block to attach to (still running: its cursor lives)
const SAID = "\x1b[38;2;248;155;42m$\x1b[0m ssh nucbox sol gate side\r\nlint    side/*.tsx   \x1b[38;2;112;223;69mok\x1b[0m  1.2s\r\nlayout  8 paths      \x1b[38;2;112;223;69mok\x1b[0m  6.4s\r\ne2e     home.side    \x1b[38;2;112;223;69mok\x1b[0m 11.0s\r\nshots   3 stills     \x1b[38;2;112;223;69mok\x1b[0m  4.1s\r\n\x1b[1;38;2;112;223;69mgate green · 22.7s · builder 2\x1b[0m\r\n\x1b[38;2;248;155;42m$\x1b[0m ";
if (q.get("link") === "fake") {
  const ask = (async (type: string) => (type === "work.term.attach" ? { buf: SAID, seq: 1, alive: true } : {})) as Parameters<typeof engine.connect>[0];
  engine.connect(ask, () => () => {}, { send: () => {} });
}
let setLines: (l: Said[]) => void = () => {};
Object.assign(window, { __stage: { store, session, pour: (n: number) => pour(store, session, n), say: (l: Said[]) => setLines(l) } });

function Play() {
  const [ready, setReady] = useState(false);
  const [lines, _setLines] = useState<Said[]>([["you", "show the week, the kit's side and a diff of Side.tsx"], ["sol", "3 things on the stage: the week, the kit's side, Side.tsx"]]);
  setLines = _setLines;
  useEffect(() => { void pour(store, session, +(q.get("n") ?? 3), (q.get("also") ?? "").split(",").filter(Boolean)).then(() => setReady(true)); }, []);
  const n = store.read(session).blocks.filter((b) => b.state !== "dead").length;
  return (
    <div className="pl-desk" style={{ backgroundImage: `url(${home})` }}>
      <div className="pl-win">
        <nav className="pl-spine">
          <div className="pl-mark"><Halo size={20} /></div>
          {["H", "B", "C", "S"].map((m) => <div key={m} className={`pl-mode ${m === "B" ? "on" : ""}`}>{m}</div>)}
          <div className="pl-foot"><span>⌕</span><span>me</span><span>⚙</span></div>
        </nav>
        <aside className="pl-side">
          <Pill words={["app", "TUI", "CLI", "IDE"]} picked={0} h={28} />
          <div>
            <h4>sessions · sol</h4>
            <div className="pl-row on">the stage<span>{n ? `${n} blocks` : ""}</span></div>
            {["spine + settings", "notifications #687", "kaat · checkout copy"].map((s) => <div key={s} className="pl-row">{s}</div>)}
          </div>
          <BlocksHere store={store} session={session} />
        </aside>
        {q.get("talk") === "column" ? (   // B25: the real talk column, its stage on the fixture
          <section className="pl-main">{ready && <StageColumn store={store} session={session} items={lines as unknown as Item[]} busy={false} writing={false} onType={() => {}}
            talk={() => lines.map(([who, text], i) => <div key={i} className={`pl-line ${who}`}><b>{who}</b><span>{text}</span></div>)}
            box={<div className="pl-box"><Glass r={CURVE.radius.field} step="box" /><span>ask for one thing</span></div>} />}</section>
        ) : <section className="pl-main">
          <div className="pl-stage">{ready && <Stage store={store} session={session} by="Marco" />}</div>
          <div className="pl-strip">
            <div className="pl-jelly"><Halo size={28} /></div>
            {lines.map(([who, text, ctx], i) => <div key={i} className={`pl-line ${who}`}><b>{who}</b>{ctx && <span className="pl-ctx">{ctx}</span>}<span>{text}</span></div>)}
          </div>
          <div className="pl-bar">
            <div className="pl-box"><Glass r={CURVE.radius.field} step="box" /><span>show the week, the kit's side and a diff of Side.tsx</span></div>
          </div>
        </section>}
      </div>
      {ready && <div data-ready style={{ display: "none" }} data-order={ORDER.join(",")} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Play /></StrictMode>);

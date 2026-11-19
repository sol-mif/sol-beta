// The stage's dev page (#696): the stage on the fixture, in a window drawn the way the design page's shots draw it (the
// spine, the side with its sessions and "blocks here", the stage, a strip of two lines, the bar), so its scenes can be
// shot against shots 04, 07, 08, 09, 10 and 12 with no engine (sol/design/system/stage.mjs). Dev only, like kit.html:
// stage.html is not in the face's build inputs. The spine, the sessions, the strip and the bar are pictures here; the
// stage and "blocks here" are the real ones.
//   stage.html                the fixture's first three blocks (shot 04)
//   stage.html?n=5            all five: the stills and the gate find no room and the stage tiles itself
//   stage.html?also=legacy    the table besides
//   stage.html?home=1         Home on the stage (#692): a page block at sol://home and the knobs at sol://home/knobs,
//                             no fixture; Home's engine from ?homews= (the stand-in), as in the face
//   stage.html?talk=column   the real talk beside it (StageColumn: its docks, ⌘↑ full and ⌘↓ back, #788 B25)
//   stage.html?link=engine&system=design   a system block of that area (#1091), alone, read live from the engine the
//                             face is pointed at (VITE_ENGINE): its stills (scratch/sol/system-stage/tools/shoot.mjs)
//   stage.html?link=engine&clock=1   the clock block (#1177), alone, full width, fed by the engine's clock.items
//   stage.html?link=engine&systems=1   the whole of Jelly (#1193), alone; systems=engine opens on that cluster
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
import { NEXT } from "../engine";
import { pour, ORDER } from "./fixture";
import { DEFAULT_TALK, dockTo, type Dock } from "./model";
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
if (q.get("link") === "engine") {   // a real socket to the engine, asked by rid and heard by every ear
  const ws = new WebSocket(NEXT), waiting = new Map<string, (m: unknown) => void>(), ears = new Set<(m: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const open = new Promise((r) => { ws.onopen = r; });
  let n = 0;
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m?.rid && waiting.has(m.rid)) { waiting.get(m.rid)!(m); waiting.delete(m.rid); } for (const f of ears) f(m); };
  const ask = (async (type: string, a: object) => { await open; const rid = `play${++n}`; return new Promise((res) => { waiting.set(rid, res as (m: unknown) => void); ws.send(JSON.stringify({ type, rid, ...a })); }); }) as Parameters<typeof engine.connect>[0];
  engine.connect(ask, (f) => { ears.add(f); return () => { ears.delete(f); }; }, { send: (o) => { void open.then(() => ws.send(JSON.stringify(o))); } });   // a send before the socket opens waits for it (#1167: a block's cleanup sends at once)
}
let setLines: (l: Said[]) => void = () => {};
Object.assign(window, { __stage: { store, session, pour: (n: number) => pour(store, session, n), say: (l: Said[]) => setLines(l) } });

/** Home and its knobs, as the agent composes them: page blocks whose src is a Sol address */
function homeBlocks() {
  const page = (id: string, title: string, src: string) => ({ id, kind: "page" as const, title, state: "live" as const, versions: [], sessions: [session], body: { src } });
  store.compose(session, page("home", "Home", "sol://home"), { x: 12, y: 12, w: 480, h: 560, z: 1 });
  store.compose(session, page("knobs", "Home's knobs", "sol://home/knobs"), { x: 508, y: 12, w: 360, h: 460, z: 2 });
}

function Play() {
  const [ready, setReady] = useState(false);
  const [lines, _setLines] = useState<Said[]>(q.get("system") ? [["you", "show me how the look is being built"], ["sol", "the look's systems, read from the registry: they grow as we build"]]
    : [["you", "show the week, the kit's side and a diff of Side.tsx"], ["sol", "3 things on the stage: the week, the kit's side, Side.tsx"]]);
  setLines = _setLines;
  useEffect(() => {
    if (q.get("home") === "1") { homeBlocks(); setReady(true); return; }
    if (q.get("clock")) {   // the clock alone, full width (#1177)
      const st = document.querySelector(".pl-stage")?.getBoundingClientRect();
      store.compose(session, { id: "clock", kind: "clock", title: "The clock", state: "live", versions: [], sessions: [session], body: {} },
        { x: 12, y: 12, w: Math.max(600, (st?.width ?? 1100) - 24), h: Math.max(400, (st?.height ?? 700) - 24), z: 1 });
      setReady(true); return;
    }
    if (q.get("systems")) {   // the whole of Jelly alone, the size of the stage (#1193); ?systems=engine opens on a cluster
      const st = document.querySelector(".pl-stage")?.getBoundingClientRect(), at = q.get("systems")!;
      store.compose(session, { id: "whole", kind: "systems", title: "Jelly, the whole", state: "live", versions: [], sessions: [session], body: at === "1" ? {} : { at } },
        { x: 12, y: 12, w: Math.max(600, (st?.width ?? 1100) - 24), h: Math.max(400, (st?.height ?? 700) - 24), z: 1 });
      setReady(true); return;
    }
    const area = q.get("system");
    if (area) {   // the system block alone, the size of the stage
      const st = document.querySelector(".pl-stage")?.getBoundingClientRect();
      store.compose(session, { id: "systems", kind: "system", title: "Systems · the look", state: "live", versions: [], sessions: [session], body: { area } },
        { x: 12, y: 12, w: Math.max(600, (st?.width ?? 1100) - 24), h: Math.max(400, (st?.height ?? 700) - 24), z: 1 });
      setReady(true); return;
    }
    void pour(store, session, +(q.get("n") ?? 3), (q.get("also") ?? "").split(",").filter(Boolean)).then(() => {
      const d = q.get("dock") as Dock | null;   // ?dock=right|bottom|full: the talk starts in that dock, for a shot of each
      if (d) store.place(session, { ...store.read(session).stage, talk: dockTo(store.read(session).stage.talk ?? DEFAULT_TALK, d) });
      setReady(true);
    });
  }, []);
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
            <div className="pl-row on">the stage<span>{n ? `${n} artifacts` : ""}</span></div>
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

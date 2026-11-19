// One playable Sol, a day with it (#1245, item 1): every surface in the order of a day, each the whole window, all one
// system. The frame is stage-whole.tsx's (#1213), grown in stage-day/frame.tsx; the pieces are the kit's (Accent, Block,
// Folder), the body is body/Bodies.tsx in its roles (body/role.ts). What is judged is the whole read together, never a
// part: open whole.html beside it and every scene must read as the same Sol. Dev only.
//   day.html                    the day from the first scene; → next, ← back, space plays the scene again
//   day.html?scene=<name>       one scene (SCENES: arrival, home, build, call, cowork, customize, evening; then ALSO,
//                               the moments nobody plans: broke, waiting, dropped, empty, first, small)
//   &size=small                 the window at 1024 × 640 (the "small" scene takes it by itself)
//   &step=<n>                   hold the scene at its nth step (what a shot of a middle moment takes)
//   &name=<first name>          whose day it is (rule 38); the default is a person with a class, a job, a side project
//   &ground=cream               the window on cream, not black glass (the pack shows every scene on both, #1245)
// Under reduced motion each scene shows its end state at once (rule 30), which is how sol/design/system/day.mjs shoots it.
// The thin strip under the window is for whoever plays it: grey, outside the window, never part of Sol. On a screen under
// 1280 wide or 840 tall the window scales down to fit the screen less the strip, so the strip is never below the fold
// (pack-review-2.md item 5); day.mjs shoots at 1280×840, where the scale is 1.
import { StrictMode, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type Ref, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { setBodyVariant } from "../body/variants";
import { ACCENT_MOVES, LitSet, dim, mute, pieceStyle } from "./Accent";
import { DEFAULT_SET, litOf } from "./Yours";
import { TYPE as T } from "./tokens";
import { GroundSet, H, SMALL, W } from "./stage-day/frame";
import { ALL, SCENES, sceneIndex, type SceneInfo } from "./stage-day/scenes";
import Arrival from "./stage-day/arrival";
import Home from "./stage-day/home";
import Build from "./stage-day/build";
import Call from "./stage-day/call";
import Cowork from "./stage-day/cowork";
import Customize from "./stage-day/customize";
import Evening from "./stage-day/evening";
import Broke from "./stage-day/also/broke";
import Waiting from "./stage-day/also/waiting";
import Dropped from "./stage-day/also/dropped";
import Empty from "./stage-day/also/empty";
import First from "./stage-day/also/first";
import Small from "./stage-day/also/small";
import "../palette.css";
import "../tokens.css";
import "./type.css";

export { ALSO, SCENES } from "./stage-day/scenes";

const DRAW: Record<SceneInfo["name"], ComponentType<{ hold?: number | null }>> = { arrival: Arrival, home: Home, build: Build, call: Call, cowork: Cowork, customize: Customize, evening: Evening,
  broke: Broke, waiting: Waiting, dropped: Dropped, empty: Empty, first: First, small: Small };
const q = new URLSearchParams(location.search);
const held = q.get("step"), hold = held != null && held !== "" && !Number.isNaN(+held) ? +held : null;
const ground = q.get("ground") === "cream" ? "cream" : "glass";
setBodyVariant("one");
const DEFAULT_LIT = litOf(DEFAULT_SET);

/** the strip under the window: the seven scenes by number, a thin divider, what a day also holds; the one playing,
 *  what happens in it, the keys */
function Strip({ at, go, width, at$ }: { at: number; go: (i: number) => void; width: number; at$: Ref<HTMLDivElement> }) {
  const s = ALL[at];
  return (
    <div data-strip ref={at$} style={{ width, margin: "0 auto", padding: "10px 4px 14px", boxSizing: "border-box", display: "flex", alignItems: "baseline", gap: 18, fontSize: T.label[0], lineHeight: `${T.label[1]}px`, color: mute }}>
      <span style={{ display: "flex", gap: 12, flex: "none" }}>
        {ALL.map((x, i) => [i === SCENES.length && <span key="also" aria-hidden style={{ width: 1, alignSelf: "stretch", background: mute, opacity: 0.5 }} />,
          <button type="button" key={x.name} onClick={() => go(i)} aria-current={i === at ? "step" : undefined} style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", color: i === at ? dim : mute, fontWeight: i === at ? 500 : 400, whiteSpace: "nowrap" }}>
            {i < SCENES.length && <span style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1} </span>}{x.title.toLowerCase()}
          </button>])}
      </span>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.what}>{s.what}</span>
      <span style={{ flex: "none", whiteSpace: "nowrap" }}>rules {s.rules.join(" · ")} · ← → · space again</span>
    </div>
  );
}

/** the window's scale: 1 where the window and the strip fit, less where the screen is smaller (never more than 1) */
function useFit(strip: RefObject<HTMLDivElement | null>) {
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setK(Math.min(1, innerWidth / W, (innerHeight - (strip.current?.offsetHeight ?? 0)) / H));
    fit(); addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [strip]);
  return k;
}

function Day() {
  const [at, setAt] = useState(sceneIndex(q.get("scene")));
  const [run, setRun] = useState(0);
  const go = (i: number) => {
    const n = Math.max(0, Math.min(ALL.length - 1, i));
    const u = new URL(location.href); u.searchParams.set("scene", ALL[n].name); u.searchParams.delete("step"); u.searchParams.delete("size");
    // the window's size is read once from the page (frame.tsx): crossing into or out of the small one reloads it
    if ((ALL[n].name === "small") !== SMALL) { location.assign(u); return; }
    setAt(n); setRun((r) => r + 1);
    history.replaceState(null, "", u);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(at + 1);
      else if (e.key === "ArrowLeft") go(at - 1);
      else if (e.key === " ") { e.preventDefault(); setRun((r) => r + 1); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const strip = useRef<HTMLDivElement>(null), k = useFit(strip);
  const Scene = DRAW[ALL[at].name];
  return (
    <div data-ac data-scene={ALL[at].name} style={{ ...pieceStyle, minHeight: "100vh", background: "#000" }}>
      <style>{ACCENT_MOVES}</style>
      <div style={{ width: W * k, height: H * k, margin: "0 auto", overflow: "hidden" }}>
        <div style={{ position: "relative", width: W, height: H, overflow: "hidden", background: "#000", transform: k < 1 ? `scale(${k})` : undefined, transformOrigin: "0 0" }}>
          {/* the pieces wear the default set, the brand's six softened (rule 15); the jelly keeps its pure six (rule 16) */}
          <GroundSet value={ground}><LitSet value={DEFAULT_LIT}><Scene key={`${at}.${run}`} hold={run === 0 ? hold : null} /></LitSet></GroundSet>
        </div>
      </div>
      <Strip at={at} go={go} width={W * k} at$={strip} />
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Day /></StrictMode>);

// Build world (mine, 2026-11-12): one kept session per project, drawn on the real pieces his window runs (Side,
// StageColumn, WorkTalk, Composer, the stage and its artifacts). The session never ends, so the stage has an anchor, and
// three things it could not have before: time (the day's line: the stage as it stood, and what is set to come), depth
// (into an artifact: what it is made of, then who made it; sessions are the inside of a thing, never a list) and path
// (how far a thing has come: drawn, built, in your Sol, on main, out). The one new piece is the line along the top
// edge; everything under it is Build as it is. Dev only, like space.html: not in the face's build inputs; nothing
// reaches the engine. Scenes: scenes.ts.
//   world.html                      now · ?at=night|morning|tonight|release a moment of the day · ?in=now/home a thing's inside
//   on the page                     press a mark on the line · pinch apart on an artifact (or ⌥ press) goes in, pinch together or Esc comes out
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/body/real/desktop.jpg";
import type { Item, Work, WorkSession } from "../work/useWork";
import type { useEngine } from "../useEngine";
import { WorkTalk } from "../work/WorkTalk";
import { Composer, type Draft } from "../work/Composer";
import { Side, SIDE } from "../home/Side";
import { Meter, Pearl } from "../kit";
import { black, dim, ink, label, mute, on, TYPE } from "../kit/paint";
import { SHADE } from "../kit/tokens";
import { dur, ease } from "../motion";
import { setStageWhole } from "../flag";
import { StageColumn } from "../stage/StageColumn";
import { LocalStore } from "../stage/store";
import { COPIES, SCENES, STOPS, type Path, type When } from "./scenes";
import "../face.css";
import "../palette.css";
import "../kit/type.css";
import "../work/work.css";
import "../home/home.css";

setStageWhole(true);
const q = new URLSearchParams(location.search);
const NOW = Date.now(), M = 60_000;
const store = new LocalStore(`sol.world.page.${NOW}.`);
const P = "/Users/you/computer/";
// the side's rows are the projects: each one its own kept session
const root = (id: string, title: string, dir: string, ago: number, o: Partial<WorkSession> = {}): WorkSession => ({ id, title, cwd: P + dir, project: P + dir, updatedAt: NOW - ago, pinned: true, ...o });
const ROOTS = [root("sol", "Sol", "personal/projects/sol", 0), root("school", "School", "personal/projects/school", 50 * M), root("kaat", "Kaat", "work/projects/kaat", 26 * 60 * M), root("job", "Jobpilot", "personal/projects/jobpilot", 4 * 24 * 60 * M), root("wb", "World Building", "personal/projects/World Building", 9 * 24 * 60 * M)];

const poured = new Set<string>();
/** a scene's artifacts on its own stage, once */
function pour(key: string) {
  if (poured.has(key)) return;
  poured.add(key);
  // side by side, two across, never one over another; a thing alone takes more room
  const open = SCENES[key].blocks.filter((x) => !x.at?.folded), W = open.length === 1 ? 520 : 350, H = open.length === 1 ? 380 : 270;
  let i = 0;
  SCENES[key].blocks.forEach(({ b, at }, z) => { const j = at?.folded ? 0 : i++; store.compose(key, b, { x: 12 + (j % 2) * (W + 16), y: 12 + Math.floor(j / 2) * (H + 16), w: W, h: H, z: z + 1, ...at }); });
}
/** the talk a scene shows: its own, else the one of the level it was entered from */
const talkOf = (key: string): Item[] => { for (let k = key; k; k = k.slice(0, Math.max(0, k.lastIndexOf("/")))) if (SCENES[k]?.items) return SCENES[k].items!; return []; };
const levels = (key: string) => key.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"));

// the spacing scale, as palette.css names it
const SPACE = { s2: "var(--s2)", s3: "var(--s3)", s4: "var(--s4)", s5: "var(--s6)" };
const LINE = 36, THUMB = 12, PINCH = 60;
const word = { ...label, appearance: "none", border: 0, background: "none", padding: 0, font: "inherit", fontSize: label.fontSize, cursor: "pointer" } as const;

/** the one new piece: where you are (the trail), when (the day's line), and how far the thing has come (its path) */
function WorldLine({ at, trail, path, onWhen, onOut }: { at: When; trail: { key: string; name: string }[]; path?: Path; onWhen: (w: When) => void; onOut: (key: string) => void }) {
  const [over, setOver] = useState<When | null>(null);
  const here = STOPS.find((s) => s.id === at)!, now = STOPS.find((s) => s.id === "now")!, shown = STOPS.find((s) => s.id === (over ?? at))!;
  const hair = (a: number) => on(a);
  return (
    <div data-world="line" style={{ height: LINE, flex: "none", display: "flex", alignItems: "center", gap: SPACE.s5, padding: `0 ${SPACE.s4}` }}>
      <div data-world="trail" style={{ display: "flex", gap: SPACE.s2, alignItems: "center", whiteSpace: "nowrap" }}>
        {trail.map((t, i) => (
          <span key={t.key} style={{ display: "flex", gap: SPACE.s2, alignItems: "center" }}>
            {i > 0 && <span style={{ ...label }}>›</span>}
            <button style={{ ...word, color: i === trail.length - 1 ? ink : dim }} onClick={() => onOut(t.key)}>{t.name}</button>
          </span>
        ))}
      </div>
      <div data-world="day" style={{ position: "relative", flex: 1, height: LINE }}>
        {/* what was is a line; what is to come is a fainter one */}
        <div style={{ position: "absolute", left: 0, width: `${now.x * 100}%`, top: LINE - 10, height: 1, background: hair(SHADE.on.edge) }} />
        <div style={{ position: "absolute", left: `${now.x * 100}%`, right: 0, top: LINE - 10, height: 1, background: hair(SHADE.on.line) }} />
        {STOPS.map((s) => (
          <button key={s.id} aria-label={`${s.name}${s.say ? `, ${s.say}` : ""}`} onClick={() => onWhen(s.id)} onPointerEnter={() => setOver(s.id)} onPointerLeave={() => setOver(null)}
            style={{ ...word, position: "absolute", left: `calc(${s.x * 100}% - 14px)`, top: 0, width: 28, height: LINE }}>
            <i style={{ position: "absolute", left: 13.5, top: LINE - 14, width: 1, height: 9, background: s.id === over ? ink : mute }} />
          </button>
        ))}
        <div style={{ position: "absolute", left: `calc(${here.x * 100}% - ${THUMB / 2}px)`, top: LINE - 10 - THUMB / 2, pointerEvents: "none", transition: `left ${dur("glass")}ms ${ease("reveal")}` }}>
          <Pearl w={THUMB} h={THUMB} r={THUMB / 2} />
        </div>
        <div style={{ ...label, position: "absolute", top: 2, whiteSpace: "nowrap", color: over && over !== at ? dim : ink, pointerEvents: "none",
          ...(shown.x > 0.7 ? { right: `${(1 - shown.x) * 100}%`, marginRight: -24 } : { left: `${shown.x * 100}%`, marginLeft: -24 }) }}>
          {shown.name}{shown.say && <span style={{ color: mute }}> · {shown.say}</span>}
        </div>
      </div>
      {path && (
        <div data-world="path" style={{ display: "flex", gap: SPACE.s3, alignItems: "center", whiteSpace: "nowrap" }}>
          <Meter w={80} h={6} parts={COPIES.map((_, i) => (i < path.reached ? 1 / COPIES.length : 0))} label={`reached: ${COPIES[path.reached - 1]}`} />
          <span style={{ ...label, color: ink }}>{COPIES[path.reached - 1]}</span>
          <span style={{ ...label }}>next: {path.next}</span>
        </div>
      )}
    </div>
  );
}

function Page() {
  const [key, setKey] = useState(() => { const k = q.get("in") ?? q.get("at") ?? "now"; return SCENES[k] ? k : "now"; });
  const [draft, setDraft] = useState<Draft>({ text: "", atts: [] });
  const [aside, setAside] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null), room = useRef<HTMLElement>(null), acc = useRef(0);
  pour(key);
  const scene = SCENES[key], items = talkOf(key), at = key.split("/")[0] as When;
  const trail = [{ key: at, name: "Sol" }, ...levels(key).slice(1).map((k) => ({ key: k, name: SCENES[k].name ?? k }))];
  const out = () => setKey((k) => (k.includes("/") ? k.slice(0, k.lastIndexOf("/")) : k));
  const into = (el: EventTarget | null) => { const id = (el as HTMLElement | null)?.closest?.("[data-block]")?.getAttribute("data-block"), to = id && SCENES[key].doors?.[id]; if (to) setKey(to); return !!to; };
  // going in and out by the hand: a pinch apart on an artifact goes in, together comes out; ⌥ press goes in; Esc comes out
  useEffect(() => {
    const el = room.current!;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      acc.current += e.deltaY;
      if (acc.current < -PINCH) { acc.current = 0; into(e.target); } else if (acc.current > PINCH) { acc.current = 0; out(); }
    };
    const press = (e: MouseEvent) => { if (e.altKey && into(e.target)) { e.preventDefault(); e.stopPropagation(); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[data-zoom]")) out(); };
    el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("click", press, true); window.addEventListener("keydown", esc);
    return () => { el.removeEventListener("wheel", wheel); el.removeEventListener("click", press, true); window.removeEventListener("keydown", esc); };
  });
  const w = useMemo(() => ({
    sessions: ROOTS, runs: {}, loaded: true, order: [], groups: [], freshCwd: "", live: "sol", thread: { sessionId: "sol", items }, threads: {}, projects: ROOTS.map((r) => ({ path: r.project, name: r.title, count: 1 })),
    run: { sessionId: "sol", busy: false, waiting: 0, cwd: ROOTS[0].cwd, model: "claude-fable-5-2", effort: "medium", mode: "bypassPermissions", fast: false, context: 61000, window: 200000 },
    mode: "bypassPermissions", model: "claude-fable-5-2", effort: "medium", fast: false, copy: null, error: "", prefs: {}, files: { files: [] }, current: null,
    say: () => true, stop: () => {}, adjust: () => {}, fresh: () => {}, fork: () => {}, forkHere: () => {}, mark: () => {}, rename: () => {}, folder: () => {}, peek: () => {}, unpeek: () => {}, open: () => {}, setCopy: () => {}, readNow: () => {}, drop: () => {}, aside: () => {}, dropAside: () => {}, sideAnswer: null,
  }) as unknown as Work, [items]);
  const e = useMemo(() => ({ up: true, flash: () => {}, settings: {}, setSettings: () => {}, models: { seats: [] }, efforts: ["low", "medium", "high"], health: null, send: () => {}, hear: () => {}, heardCb: { current: () => {} }, partialCb: { current: () => {} } }) as unknown as ReturnType<typeof useEngine>, []);
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover fixed` }}>
      <div className="face hc" style={{ height: "100%", background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }}>
        <div className="hc-main">
          <Side w={w} width={SIDE} live="sol" wide={false} onOpen={() => {}} onBeside={() => {}} onFresh={() => {}} onWide={() => {}} onSettings={() => {}} onMode={() => {}} stageStore={store} />
          <section className="hc-talk" ref={room} data-world={key} style={{ display: "flex", flexDirection: "column" }}>
            <WorldLine at={at} trail={trail} path={scene.path} onWhen={(wn) => setKey(wn)} onOut={setKey} />
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
              <StageColumn key={key} store={store} session={key} items={items} busy={false} writing={draft.text.trim() !== ""} onType={() => {}}
                talk={(shown) => <WorkTalk items={shown} busy={false} w={w} view="normal" onFresh={() => {}} onLink={() => {}} />}
                box={<div data-kind="bar" tabIndex={-1} className="hc-barbox"><Composer w={w} e={e} busy={false} working={false} cwd={ROOTS[0].cwd} asideOn={aside} setAsideOn={setAside} box={box} onSent={() => {}} onRec={() => {}} d={draft} setD={setDraft} clean staged /></div>} />
            </div>
          </section>
        </div>
      </div>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);

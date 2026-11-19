// The rail (#682, the universal layer's brief: ~/computer/scratch/sol/layer-brief.md): the window's top line, the same
// in every mode; only what a mode puts in its places changes. Five places that never move:
//   R1 the side key (folds and opens the side; always first), R2 where (the session's title, then its folder · branch,
//   dim), R3 the mode's buttons (the rail of its preset; each opens its tool in the pane), R4 the sessions that wait or
//   work (only while the side is folded), R5 the engine's health (always last).
// One type step (the body's), and every button flat (Marco 2026-11-07, round 5's pins): at rest a word or a glyph on the
// black with no fill and no rim; the on colour's 7% lift (tokens.json shade.on.flat) only under the pointer or while
// lit. A lit button is that lift with the words in ink, no colour: opening a tool has no consequence.
// The test hooks stay: .hc-bar, .hc-sidekey, .hc-title, .hc-where, .hc-tmark, .hc-pkey (states.mjs, break.mjs).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { on } from "../kit/paint";
import { SHADE } from "../kit/tokens";
import { Card, List } from "../kit";
import { Ink } from "../buttons/Ink";
import { enginePhase } from "../creature/state";
import type { EngineInfo, Health } from "../useEngine";
import { Mark } from "./Side";
import type { Metas } from "./meta";
import "./rail.css";

export const meta = {
  Top: {
    job: "the window's top line, the same in every mode: the side key, where you are, the mode's buttons, the sessions that wait or work while the side is folded, and the engine's health",
    flow: "pickup",
    states: ["full", "squished", "narrow", "side open", "side folded", "new session (no title)", "no folder", "map between", "waiting marks"],
    keys: [
      { press: "click the side key", does: "folds or opens the side" },
      { press: "click a mode's button", does: "opens its tool in the pane, or closes it when it is lit" },
      { press: "click a waiting mark", does: "goes into that session", goal: "pickup", faster: true },
      { press: "drag the bar", does: "moves the window" },
      { press: "double-click the bar", does: "maximises the window, or puts it back" },
    ],
    listens: ["the side's state (open or folded)", "the session's title, folder and branch", "the mode's preset (its buttons, and which are lit)", "the sessions that wait or work", "the window's width (full, squished, narrow)"],
  },
  Engine: {
    job: "the engine's health at the rail's end: a quiet mark when it is up, the red and a word when it is down or hurt, and a small card of its stats on a click",
    flow: "know",
    states: ["up", "starting", "down", "hurt", "card open"],
    keys: [
      { press: "click the mark", does: "opens the card: up and for how long, what runs, the build, a went-back", goal: "know", faster: true },
      { press: "click it again, click outside, or Esc", does: "closes the card" },
    ],
    listens: ["the engine's up or down", "engine.info (since when)", "engine.health (the build, a revert)", "the sessions running", "the engine's phase while it starts (creature/state.ts)"],
  },
  ToolKey: {
    job: "the mode's buttons folded into one key when the window is narrow: a press opens them as a list, a tool open beside says so at its row's end",
    flow: "show",
    states: ["closed", "open", "a tool lit"],
    keys: [
      { press: "click the key", does: "opens or closes the list of the mode's buttons" },
      { press: "click a row, or ↑ ↓ and Return", does: "opens that tool in the pane and closes the list" },
      { press: "Esc or click outside", does: "closes the list" },
    ],
    listens: ["the mode's preset (its buttons, and which are lit)"],
  },
} satisfies Metas;

type St = Parameters<typeof Mark>[0]["st"];
/** a button of the mode's preset, as the rail draws it */
export type Tool = { id: string; name: string; glyph: ReactNode; lit: boolean; hook?: string };
/** a session that waits or works, as a mark on the rail */
export type Waiting = { id: string; title: string; st: St };

// the lift is the kit's value (the on colour at shade.on.flat), handed to the css as a variable: the css types no colour
const LIFT = { "--rail-lift": on(SHADE.on.flat) } as CSSProperties;

export type Width = "full" | "squished" | "narrow";

export function Top({ width = "full", side, onSide, title, folder, branch, tools, onTool, waiting, onWaiting, engine, mid }: {
  mid?: ReactNode;                                                         // #1090: the windows' map, between the title and the keys
  width?: Width;                                                           // squished: R2's folder and R3's words go; narrow: R3 folds into one key
  side: boolean; onSide: () => void;
  title: string | null; folder: string | null; branch?: string | null;   // R2: no title on a new session; no folder on the side wide
  tools: Tool[]; onTool: (id: string) => void;                             // R3
  waiting: Waiting[] | null; onWaiting: (id: string) => void;              // R4: null while the side shows them itself
  engine: ReactNode;                                                       // R5
}) {
  const onBar = (ev: React.MouseEvent) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("button, .hc-mid")) return;   // #1090: the map in the head is pressed, not dragged
    const win = getCurrentWindow();
    if (ev.detail === 2) void win.toggleMaximize().catch(() => {}); else void win.startDragging().catch(() => {});
  };
  return (
    <div className={`bar hc-bar w-${width}`} data-tauri-drag-region onMouseDown={onBar} style={LIFT}>
      {/* R1 */}
      <button className={`hc-rk hc-sidekey ${side ? "open" : ""}`} onClick={onSide} title={side ? "fold the side" : "open the side"} aria-label={side ? "fold the side" : "open the side"} tabIndex={-1}><i /><i /></button>
      {/* R2 */}
      <div className="hc-where-at" data-tauri-drag-region>
        {title !== null && <span className="hc-title" data-tauri-drag-region>{title || "untitled"}</span>}
        {folder !== null && <span className="hc-where" data-tauri-drag-region>{folder}{branch ? ` · ${branch}` : ""}</span>}
      </div>
      {mid && <><div className="spacer" data-tauri-drag-region /><div className="hc-mid">{mid}</div></>}
      <div className="spacer" data-tauri-drag-region />
      {/* R3 */}
      {tools.length > 0 && width === "narrow" && <ToolKey tools={tools} onTool={onTool} />}
      {tools.length > 0 && width !== "narrow" && (
        <div className="hc-tools">
          {tools.map((t) => (
            <button key={t.id} className={`hc-rk hc-tool ${t.hook ?? ""} ${t.lit ? "on" : ""} ${t.glyph ? "glyphed" : ""}`} tabIndex={-1} aria-pressed={t.lit} title={t.name} onClick={() => onTool(t.id)}>
              {t.glyph && <span className="hc-glyph">{t.glyph}</span>}<span className="hc-word">{t.name}</span>
            </button>
          ))}
        </div>
      )}
      {/* R4 */}
      {waiting && waiting.length > 0 && (
        <div className="hc-waiting">
          {waiting.map((s) => <button key={s.id} className="hc-rk hc-tmark" title={s.title} aria-label={s.title} onClick={() => onWaiting(s.id)} tabIndex={-1}><Mark st={s.st} size={13} /></button>)}
        </div>
      )}
      {/* R5 */}
      {engine}
    </div>
  );
}

// R5 the engine's health (#682). Colour is state, never decoration (the brief's rule 1): a healthy engine is quiet, a
// small mark in the on colour; only when it is not well does the mark take the fixed channel's red (--error) and say
// what is wrong in a word. Starting is not wrong, only not yet: its word, no colour. A click opens a small card, the
// kit's Card at the pop step: the stats (up and for how long, what runs, the build), no sentences. Repair is a tier-3
// experience and is not drawn here (taste.md, 2026-11-06): the card says, it does not offer to fix.
export type EngineState = "up" | "starting" | "down" | "hurt";
export function engineState(up: boolean, health: Health | null, phase = enginePhase()): EngineState {
  if (!up) return phase === "starting" ? "starting" : "down";
  if (health?.build && (!health.build.alive || (health.build.errors ?? 0) > 0)) return "hurt";
  return health?.reverted ? "hurt" : "up";
}
const WORD: Record<EngineState, string> = { up: "", starting: "starting", down: "engine down", hurt: "engine hurt" };
const since = (iso?: string, now = Date.now()) => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!isFinite(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`;
};

export function Engine({ up, info, health, running }: { up: boolean; info: EngineInfo | null; health: Health | null; running: number }) {
  const [phase, setPhase] = useState(enginePhase);
  const [open, setOpen] = useState(false);
  const at = useRef<HTMLDivElement>(null);
  // the phase lives outside React (creature/state.ts): followed frame by frame while the engine is not up, drawn only
  // when it changes
  useEffect(() => {
    if (up) return;
    let f = 0;
    const look = () => { setPhase((p) => { const q = enginePhase(); return p === q ? p : q; }); f = requestAnimationFrame(look); };
    f = requestAnimationFrame(look);
    return () => cancelAnimationFrame(f);
  }, [up]);
  useEffect(() => {
    if (!open) return;
    const off = (ev: PointerEvent) => { if (!at.current?.contains(ev.target as Node)) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", off); window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", off); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  const st = engineState(up, health, phase);
  const rows: [string, string][] = [
    ["engine", st === "up" || st === "hurt" ? `up${info?.since ? ` · ${since(info.since)}` : ""}` : st === "starting" ? "starting" : "down"],
    ...(up ? [["running", running === 1 ? "1 session" : `${running} sessions`] as [string, string]] : []),
    ...(health?.build ? [["build", !health.build.alive ? "stopped" : health.build.errors ? `${health.build.errors} errors` : "ok"] as [string, string]] : []),
    ...(health?.reverted ? [["went back", `${health.reverted.what} · ${new Date(health.reverted.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`] as [string, string]] : []),
  ];
  return (
    <div className="hc-engine" ref={at}>
      <button className={`hc-rk hc-eng st-${st} ${open ? "on" : ""}`} tabIndex={-1} aria-expanded={open} aria-label={`the engine: ${rows[0][1]}`} title={`the engine: ${rows[0][1]}`} onClick={() => setOpen((o) => !o)}>
        <i className="hc-engdot" aria-hidden />{WORD[st] && <span className="hc-word">{WORD[st]}</span>}
      </button>
      {open && (
        <div className="hc-engcard" role="dialog" aria-label="the engine">
          <Card w={ENGCARD} step="pop">
            <dl>{rows.map(([k, v]) => <div key={k} className={k === "engine" ? `st-${st}` : ""}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </Card>
        </div>
      )}
    </div>
  );
}
const ENGCARD = 224;   // the card's width: its longest line (went back · face · 10:42) and the label column

// R3 folded (narrow): one key that opens the mode's buttons as a list, the kit's Card + List (the bar's menu shape). A
// tool open beside says so at the row's end; nothing here wears the pearl (it marks what has you, the side's row)
function ToolKey({ tools, onTool }: { tools: Tool[]; onTool: (id: string) => void }) {
  const [open, setOpen] = useState(false), [lit, setLit] = useState(0);
  const at = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (ev: PointerEvent) => { if (!at.current?.contains(ev.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [open]);
  const pick = (k: number) => { setOpen(false); const t = tools[k]; if (t) onTool(t.id); };
  return (
    <div className="hc-tools hc-toolfold" ref={at}>
      <button className={`hc-rk hc-toolkey ${open || tools.some((t) => t.lit) ? "on" : ""}`} tabIndex={-1} aria-expanded={open} aria-label="the mode's buttons" title="the mode's buttons" onClick={() => { setLit(0); setOpen((o) => !o); }}>
        <span className="hc-glyph"><Ink><circle cx="3" cy="7" r="0.6" /><circle cx="7" cy="7" r="0.6" /><circle cx="11" cy="7" r="0.6" /></Ink></span>
      </button>
      {open && (
        <div className="hc-pop" role="dialog" aria-label="the mode's buttons">
          <Card w={TOOLCARD} step="pop">
            <div className="hc-poplist">
              <List w={TOOLCARD - 2 * PAD} items={tools.map((t) => ({ id: t.id, title: t.name, lead: t.glyph ?? undefined, aside: t.lit ? "beside" : undefined }))}
                lit={lit} onLit={setLit} onPick={pick} onClose={() => setOpen(false)} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
const TOOLCARD = 200, PAD = 8;   // the list's card: its width, and the inset of its rows (--s2), as the bar's pickers

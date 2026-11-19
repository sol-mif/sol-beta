// The map (#1090, design round 1): what replaces the role mark's words. The screens as they stand, one small rect per
// live window, placed and sized as the real screens are; this window's rect is the pearl, the others outlined; each
// holds the shape of what that window shows (lines: sessions; tiles: blocks; one fill: one block full). Beside them the
// two facts that stay on every window: how many sessions wait on you (on the pearl, what has you) and how many run.
// No role word anywhere. At rest it has no fill, no rim, no edge (look.md: a pill at rest); under the pointer it lifts.
//   press the other rect      the two windows trade what they hold (onTrade)
//   press the waits count     where the side is folded, it soft-opens (onWaits)
//   hover                     both windows' seams brighten while it lasts (onHover)
//   offer                     an arrangement the session offers (Jev 0.45 to 0.7): drawn dashed; a press takes it (onTake)
// Pure off ScreensState: mapRects is tested without a window.
import { useState } from "react";
import { Pearl } from "../kit";
import { deep, dim, on, pearl } from "../kit/paint";
import { SHADE, TYPE } from "../kit/tokens";
import type { Role, ScreensState, Win } from "./model";
import "./map.css";

export const meta = {
  ScreenMap: {
    job: "where am I among the windows of one Jelly, what each holds, and what waits on me, the same on every window",
    flow: "mine",
    states: ["one window: not drawn", "two", "three", "trading", "an offered arrangement, dashed", "narrow: rects only"],
    keys: [
      { press: "click the other window's rect", does: "the two windows trade what they hold" },
      { press: "⌃⌥ Tab", does: "the same trade" },
      { press: "click the waits count", does: "the side soft-opens on this window" },
    ],
    listens: ["screens.state (screens/store.ts)", "the session rows' states (anchorFacts)"],
  },
};

export type MapRect = { win: string; role: Role; x: number; y: number; w: number; h: number };
const H = 18, GAP = 3, MIN_W = 22, MAX_W = 34, MIN_H = 12, STACK_H = 11;

/** the live windows as small rects, laid out as their screens stand; side by side, the main one first, when the
 *  screens are unknown or the same rect (two browser windows on one screen) (pure) */
export function mapRects(wins: Win[], home: string): { rects: MapRect[]; w: number; h: number } {
  const live = wins.filter((w) => w.live).slice(0, 3);
  if (!live.length) return { rects: [], w: 0, h: 0 };
  const key = (w: Win) => (w.screen ? `${w.screen.x},${w.screen.y},${w.screen.w},${w.screen.h}` : "");
  const known = live.every((w) => w.screen) && new Set(live.map(key)).size === live.length;
  if (!known) {
    const order = [...live].sort((a, b) => (a.win === home ? -1 : b.win === home ? 1 : a.at - b.at));
    const rects = order.map((w, i) => ({ win: w.win, role: w.role, x: i * (28 + GAP), y: 0, w: 28, h: H }));
    return { rects, w: order.length * 28 + (order.length - 1) * GAP, h: H };
  }
  // the screens' true shapes; two browser windows report rects that overlap, so the rects are never drawn where
  // they report: only their order and their sizes are kept. Beside each other: left to right, feet on one line.
  // One above the other: stacked, the map two short rows high.
  const tall = Math.max(...live.map((w) => w.screen!.h)), k = H / tall;
  const cx = (w: Win) => w.screen!.x + w.screen!.w / 2, cy = (w: Win) => w.screen!.y + w.screen!.h / 2;
  const spanX = Math.max(...live.map(cx)) - Math.min(...live.map(cx)), spanY = Math.max(...live.map(cy)) - Math.min(...live.map(cy));
  const wide = (w: Win) => Math.min(MAX_W, Math.max(MIN_W, w.screen!.w * k));
  if (spanX >= spanY) {
    let at = 0;
    const rects = [...live].sort((a, b) => cx(a) - cx(b)).map((w) => { const h = Math.max(MIN_H, w.screen!.h * k), r = { win: w.win, role: w.role, x: at, y: H - h, w: wide(w), h }; at += r.w + GAP; return r; });
    return { rects, w: at - GAP, h: H };
  }
  const rowH = STACK_H, ws = live.map(wide), W = Math.max(...ws);
  const rects = [...live].sort((a, b) => cy(a) - cy(b)).map((w, i) => ({ win: w.win, role: w.role, x: (W - wide(w)) / 2, y: i * (rowH + 2), w: wide(w), h: rowH }));
  return { rects, w: W, h: live.length * rowH + (live.length - 1) * 2 };
}

/** running: a small arc that turns, in the pearl. Never a coloured dot (taste 2026-11-11) */
export function RunMark({ size = 12 }: { size?: number }) {
  const r = size / 2 - 1;
  return (
    <svg className="sm-run" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={on(SHADE.on.edge * 2)} strokeWidth={1.4} />
      <path d={`M${size / 2} 1 A${r} ${r} 0 0 1 ${size - 1} ${size / 2}`} fill="none" stroke={pearl()} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

/** what a window shows, as strokes inside its rect: never a word */
function Shape({ r, role, mine, dashed }: { r: MapRect; role: Role; mine: boolean; dashed?: boolean }) {
  const c = mine ? deep(0.8) : pearl(0.85), p = r.h < 12 ? 3 : 4, x = r.x + p, y = r.y + p, w = r.w - 2 * p, h = r.h - 2 * p;
  const st = { stroke: c, strokeWidth: 1.4, strokeLinecap: "round" as const, fill: "none", ...(dashed ? { strokeDasharray: "2 2" } : {}) };
  if (role === "anchor" || role === "watch") return (<g {...st}><path d={`M${x} ${y + 0.5}h${w * 0.6}M${x} ${y + h / 2}h${w}M${x} ${y + h - 0.5}h${w * 0.45}`} /></g>);
  if (role === "wall") return <rect x={x} y={y} width={w} height={h} rx={1} fill={dashed ? "none" : c} stroke={c} strokeWidth={1} strokeDasharray={dashed ? "2 2" : undefined} />;
  if (role === "stage") return (<g {...st}><rect x={x} y={y} width={w * 0.42} height={h} rx={1} /><rect x={x + w * 0.58} y={y} width={w * 0.42} height={h} rx={1} /></g>);
  // whole: the side's lines and one block
  return (<g {...st}><path d={`M${x} ${y + 0.5}h${w * 0.3}M${x} ${y + h / 2}h${w * 0.3}M${x} ${y + h - 0.5}h${w * 0.2}`} /><rect x={x + w * 0.5} y={y} width={w * 0.5} height={h} rx={1} /></g>);
}

export function ScreenMap({ s, me, facts, narrow = false, offer, onTrade, onWaits, onHover, onTake, inHead = false }: {
  inHead?: boolean;   // builder: drawn in Build's head row (Top.tsx mid), not over the window
  s: ScreensState; me: string; facts: { waits: number; runs: number }; narrow?: boolean; offer?: Record<string, Role>;
  onTrade?: (win: string) => void; onWaits?: () => void; onHover?: (over: boolean) => void; onTake?: () => void;
}) {
  const [over, setOver] = useState(false), [trading, setTrading] = useState(false);
  const { rects, w, h } = mapRects(s.windows, s.home);
  if (rects.length < 2) return null;
  const hover = (v: boolean) => { setOver(v); onHover?.(v); };
  const trade = (win: string) => { setTrading(true); window.setTimeout(() => setTrading(false), 180); onTrade?.(win); };
  const n = TYPE.pill;
  return (
    <div className={`sm ${trading ? "trading" : ""} ${inHead ? "in-head" : ""}`} data-part="the map" style={{ background: over ? on(SHADE.on.flat) : "transparent" }}
      onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sm-rects" role="group" aria-label="the windows of Jelly">
        {rects.map((r) => {
          const mine = r.win === me, offered = offer?.[r.win];
          return (
            <g key={r.win} data-win={r.win} className={`sm-rect ${mine ? "mine" : "other"}`} onClick={mine ? (offered ? onTake : undefined) : () => (offered ? onTake?.() : trade(r.win))}
              role={mine ? undefined : "button"} aria-label={mine ? "this window" : "trade with the other window"}>
              <rect x={r.x + 0.5} y={r.y + 0.5} width={r.w - 1} height={r.h - 1} rx={2.5} fill={mine ? pearl() : "transparent"} stroke={mine ? "none" : pearl(0.55)} strokeWidth={1} />
              <g className="sm-shape"><Shape r={r} role={offered ?? r.role} mine={mine} dashed={!!offered} /></g>
            </g>
          );
        })}
      </svg>
      {!narrow && facts.waits > 0 && (
        <button type="button" className="sm-fact" onClick={onWaits} aria-label={`${facts.waits} waiting on you`}>
          <Pearl w={Math.max(16, 8 + String(facts.waits).length * 7)} h={16} r={8}>
            <span style={{ display: "grid", placeItems: "center", height: "100%", color: deep(), fontSize: n[0], lineHeight: `${n[1]}px`, fontWeight: 600 }}>{facts.waits}</span>
          </Pearl>
        </button>
      )}
      {!narrow && facts.runs > 0 && (
        <span className="sm-fact" aria-label={`${facts.runs} running`}>
          <RunMark />
          <span style={{ color: dim, fontSize: n[0], lineHeight: `${n[1]}px` }}>{facts.runs}</span>
        </span>
      )}
    </div>
  );
}

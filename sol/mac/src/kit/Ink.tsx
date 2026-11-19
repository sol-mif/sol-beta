// Ink (#692, tactile.html, the blueprint's "shows as"): the AI's part, visibly, in four states drawn once. set: his, or
// kept, ordinary ink. ghost: the agent's words still unsure, in the pearl at low strength, written in word by word as
// they stream. wave: a doubtful span, underlined by a slow wave of the jelly's colours; a tap opens what it doubted, its
// sources and its alternatives (Doubt). dash: a proposal, a dashed outline that turns solid when kept. Every Home tool
// uses this, never its own.
// InkField is Finish's half in the kit: a writing box that, after a stop (2 s), asks for ghost ink and shows it after
// the caret; ⇥ keeps it, Esc or any other key drops it, ↓ asks for more and ↑ for less. It knows nothing of the wire:
// the one who mounts it passes the ghost words in and hears the keys.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Glass } from "./Glass";
import { dim, ink, label, mute, on, pearl, TYPE } from "./paint";
import { CURVE, SHADE, TYPE as T } from "./tokens";
import "./moves.css";

export type InkState = "set" | "ghost" | "wave" | "dash";
/** a doubt on a span: why, where from, what else it could say */
export type InkDoubt = { why: string; sources?: string[]; alts: string[] };

/** the ink's colours, from the tokens, as the custom properties moves.css draws with */
export const inkVars = (): CSSProperties => ({ "--k-ghost": pearl(SHADE.on.dim), "--k-line": dim, "--k-wave": 0.85, "--k-r": `${CURVE.radius.chip}px`, "--k-tilt": "-1.5deg" } as CSSProperties);

export function Ink({ k = "set", children, onTap, doubt, onPick, kept, onKeep }: {
  k?: InkState; children: ReactNode; onTap?: () => void;
  /** wave: what it doubted; with it a tap opens the card here (else onTap is called, to ask for it) */
  doubt?: InkDoubt | null;
  /** wave: an alternative picked (its text), or null to keep the words as they are */
  onPick?: (alt: string | null) => void;
  /** dash: kept, drawn solid as it settles */
  kept?: boolean;
  /** dash: a tap keeps it */
  onKeep?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wanted = useRef(false);   // tapped before its doubt came: open the card when it does
  useEffect(() => { if (doubt && wanted.current) { wanted.current = false; setOpen(true); } }, [doubt]);
  const words = k === "ghost" && typeof children === "string" ? children.match(/\s*\S+\s*/g) ?? [children] : null;
  const tap = () => {
    if (k === "wave") { if (doubt) setOpen((v) => !v); else { wanted.current = true; onTap?.(); } return; }
    if (k === "dash" && onKeep && !kept) { onKeep(); return; }
    onTap?.();
  };
  return (
    <span className={`ink ink-${k}${open ? " open" : ""}${kept ? " kept" : ""}`} data-ink={k} style={{ ...inkVars(), position: k === "wave" ? "relative" : undefined }} onClick={tap}>
      {words ? words.map((w, i) => <span key={i} className="ink-w">{w}</span>) : children}
      {k === "wave" && open && doubt && <DoubtCard d={doubt} onPick={(a) => { setOpen(false); onPick?.(a); }} />}
    </span>
  );
}

/** the wave's card: what it doubted, its sources, its alternatives; pick one or keep */
export function DoubtCard({ d, onPick, style }: { d: InkDoubt; onPick: (alt: string | null) => void; style?: CSSProperties }) {
  const stop = (ev: { stopPropagation: () => void }) => ev.stopPropagation();
  return (
    <span className="k-pop" data-doubt onClick={stop} style={{ position: "absolute", left: 0, top: "calc(100% + 8px)", zIndex: 5, width: 300, display: "block", padding: "12px 14px", textDecoration: "none", ...TYPE, ...style }}>
      <Glass r={CURVE.radius.row} step="pop" surface="raised" />
      <span style={{ ...label, display: "block" }}>unsure</span>
      <span style={{ display: "block", color: ink, margin: "2px 0 6px" }}>{d.why}</span>
      {d.sources?.length ? <span style={{ ...label, display: "block", marginBottom: 8 }}>from {d.sources.join(" · ")}</span> : null}
      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {d.alts.map((a) => <InkChoice key={a} onClick={() => onPick(a)} lit>{a}</InkChoice>)}
        <InkChoice onClick={() => onPick(null)}>keep</InkChoice>
      </span>
    </span>
  );
}

/** a word you can pick in a card: flat, no grey at rest; the pearl's line when lit */
function InkChoice({ children, onClick, lit }: { children: ReactNode; onClick: () => void; lit?: boolean }) {
  const [up, setUp] = useState(false);
  return (
    <button data-choice onClick={onClick} onPointerEnter={() => setUp(true)} onPointerLeave={() => setUp(false)}
      style={{ position: "relative", border: 0, background: "transparent", color: lit ? pearl() : dim, font: "inherit", fontSize: T.pill[0], lineHeight: `${T.pill[1]}px`, padding: "4px 10px", cursor: "pointer" }}>
      <Glass r={CURVE.radius.row} fill={up ? on(SHADE.on.flat) : "transparent"} edge={lit ? SHADE.on.edge : 0} />
      {children}
    </button>
  );
}

/** how long a stop is before Finish asks (the piece: "after a two-second stop") */
export const FINISH_STOP_MS = 2000;

export function InkField({ value, onChange, ghost, onStop, onKeep, onDropGhost, onMore, onLess, placeholder, rows = 4, wait = FINISH_STOP_MS, why }: {
  value: string; onChange: (v: string) => void;
  /** the ghost words streamed so far (empty: none showing) */
  ghost: string;
  /** a stop: ask for ghost ink after this text */
  onStop?: (text: string) => void;
  /** ⇥: the ghost becomes his */
  onKeep?: (ghost: string) => void;
  /** Esc or any other key: the ghost goes */
  onDropGhost?: () => void;
  onMore?: () => void; onLess?: () => void;
  placeholder?: string; rows?: number; wait?: number;
  /** why there is no ghost (the folder's dial, nothing in its context), said under the box */
  why?: string;
}) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [has, setHas] = useState(false);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  const arm = (v: string) => { if (t.current) clearTimeout(t.current); if (onStop && v.trim()) t.current = setTimeout(() => onStop(v), wait); };
  const box: CSSProperties = { ...TYPE, fontSize: T.read[0], lineHeight: `${T.read[1]}px`, padding: "14px 16px", margin: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", boxSizing: "border-box", width: "100%" };
  return (
    <div data-inkfield style={{ position: "relative", isolation: "isolate", ...inkVars() }}>
      <Glass r={CURVE.radius.field} step={has ? "box" : "card"} />
      {/* the mirror: his words, invisible, then the ghost after the caret, lying exactly under the box's own words */}
      <div aria-hidden style={{ ...box, position: "absolute", inset: 0, color: "transparent", pointerEvents: "none", overflow: "hidden" }}>
        {value}{ghost ? <Ink k="ghost">{ghost}</Ink> : null}
      </div>
      <textarea value={value} rows={rows} placeholder={placeholder} spellCheck={false}
        onFocus={() => setHas(true)} onBlur={() => setHas(false)}
        onChange={(ev) => { const v = ev.target.value; if (ghost) onDropGhost?.(); onChange(v); arm(v); }}
        onKeyDown={(ev) => {
          if (!ghost) return;
          if (ev.key === "Tab") { ev.preventDefault(); onKeep?.(ghost); arm(value + ghost); return; }
          if (ev.key === "ArrowDown" && onMore) { ev.preventDefault(); onMore(); return; }
          if (ev.key === "ArrowUp" && onLess) { ev.preventDefault(); onLess(); return; }
          if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onDropGhost?.(); }
        }}
        style={{ ...box, position: "relative", display: "block", resize: "none", border: 0, outline: "none", background: "transparent", color: ink, caretColor: pearl() }} />
      <div style={{ ...label, padding: "0 16px 10px", minHeight: T.label[1], color: why ? dim : mute }}>
        {ghost ? "⇥ keep · ↓ more · ↑ less · esc: leave it" : why ?? ""}
      </div>
    </div>
  );
}

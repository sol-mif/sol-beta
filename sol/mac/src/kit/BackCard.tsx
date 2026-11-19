// The back card (#692, tactile.html Peel): any made thing turns over to its back: what it was made from, under which
// folder and dial, by which agent and model, how long it took, its doubts, undo and redo. One card for every made thing:
// the pearl, turned over, a little tilted, its words deep.
// Peel is the move around it: lift a made thing's corner (drag the turned corner, or ⌥-click anywhere on it) and it
// turns over to its back; Esc or "turn back" turns it again. It asks for the back when it has none yet (onPeel).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Glass } from "./Glass";
import { inkVars } from "./Ink";
import { deep, dim, label, on, pearl, TYPE } from "./paint";
import { CURVE, SHADE, TYPE as T } from "./tokens";
import "./moves.css";

export type BackFacts = {
  title: string; size?: string; from: string[]; under: string; agent: string; took: string;
  doubts: { span: string; why: string; alts: string[] }[]; undo: boolean;
  /** the model the agent ran on */
  model?: string;
  /** a redo is waiting (after an undo) */
  redo?: boolean;
  /** the pushes it was nudged with, oldest first */
  nudges?: string[];
};

export function BackCard({ b, onUndo, onRedo, onDoubt, onClose, style }: {
  b: BackFacts; onUndo?: () => void; onRedo?: () => void;
  /** a doubt tapped: show its alternatives (the made thing's wave) */
  onDoubt?: (d: BackFacts["doubts"][number]) => void;
  /** turn it back over */
  onClose?: () => void;
  style?: CSSProperties;
}) {
  const row = (dt: string, dd: ReactNode) => <><dt style={{ color: deep(SHADE.on.dim) }}>{dt}</dt><dd style={{ margin: 0 }}>{dd}</dd></>;
  return (
    <div className="back-card" data-back style={{ ...inkVars(), position: "relative", isolation: "isolate", padding: "16px 18px 14px", color: deep(), fontFamily: TYPE.fontFamily, fontSize: T.body[0], lineHeight: `${T.body[1]}px`, ...style }}>
      <Glass r={CURVE.radius.card} fill={pearl()} edge={0} over={<div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 120% at 18% 0%, ${on(0.5)}, transparent 70%)` }} />} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <b style={{ fontWeight: 600, fontSize: T.read[0] }}>{b.title}</b>
        {b.size && <small style={{ color: deep(SHADE.on.dim) }}>{b.size}</small>}
        {onClose && <button data-turn onClick={onClose} style={{ marginLeft: "auto", border: 0, background: "transparent", color: deep(SHADE.on.dim), font: "inherit", fontSize: T.label[0], cursor: "pointer" }}>turn back</button>}
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 14px", margin: "0 0 12px" }}>
        {row("made from", b.from.length ? b.from.join(", ") : "nothing named")}
        {row("under", b.under)}
        {row("by", b.model ? `${b.agent} · ${b.model}` : b.agent)}
        {row("took", b.took)}
        {row("doubts", b.doubts.length ? (
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {b.doubts.map((d) => <span key={d.span} data-back-doubt onClick={() => onDoubt?.(d)} style={{ cursor: onDoubt ? "pointer" : undefined }}><i style={{ fontStyle: "normal", borderBottom: `1px dashed ${deep(SHADE.on.mute)}` }}>{d.span}</i> <span style={{ color: deep(SHADE.on.dim) }}>· {d.why}</span></span>)}
          </span>) : "none")}
        {b.nudges?.length ? row("nudged", b.nudges.join(" · ")) : null}
      </dl>
      <div style={{ display: "flex", gap: 6 }}>
        <BackButton on={b.undo} onClick={onUndo} first>undo</BackButton>
        {b.redo ? <BackButton on onClick={onRedo}>redo</BackButton> : <BackButton on={!!onRedo} onClick={onRedo}>redo with…</BackButton>}
      </div>
    </div>
  );
}

function BackButton({ children, on: live, onClick, first }: { children: ReactNode; on: boolean; onClick?: () => void; first?: boolean }) {
  const [up, setUp] = useState(false);
  return (
    <button data-back-act={String(children)} disabled={!live} onClick={onClick} onPointerEnter={() => setUp(true)} onPointerLeave={() => setUp(false)}
      style={{ position: "relative", isolation: "isolate", border: 0, background: "transparent", padding: "4px 12px", font: "inherit", fontSize: T.pill[0], lineHeight: `${T.pill[1]}px`, color: live ? deep(first ? 1 : SHADE.on.ink) : deep(SHADE.on.mute), cursor: live ? "pointer" : "default" }}>
      <Glass r={CURVE.radius.row} fill={up && live ? deep(SHADE.on.flat) : "transparent"} edge={0} />
      <span style={{ position: "absolute", inset: 0, borderRadius: CURVE.radius.row, boxShadow: `inset 0 0 0 1px ${deep(first && live ? 0.6 : 0.18)}` }} />
      {children}
    </button>
  );
}

/** a made thing that peels: the front until its corner is lifted (or ⌥-click), then the back card in its place */
export function Peel({ children, back, onPeel, onUndo, onRedo, onDoubt, turned: held, onTurn }: {
  children: ReactNode;
  /** the back's facts; null until asked */
  back: BackFacts | null;
  /** lifted with no back yet: ask for it */
  onPeel?: () => void;
  onUndo?: () => void; onRedo?: () => void; onDoubt?: (d: BackFacts["doubts"][number]) => void;
  /** held from outside (a sheet, a test); left out, the corner and ⌥-click turn it */
  turned?: boolean; onTurn?: (t: boolean) => void;
}) {
  const [own, setOwn] = useState(false), turned = held ?? own;
  const [lift, setLift] = useState(false);
  const from = useRef<{ x: number; y: number } | null>(null);   // a lift under way: let go and it turns
  const turn = (t: boolean) => { if (t && !back) onPeel?.(); setOwn(t); onTurn?.(t); };
  useEffect(() => {
    if (!turned) return;
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") turn(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (turned) return back ? <BackCard b={back} onUndo={onUndo} onRedo={onRedo} onDoubt={onDoubt} onClose={() => turn(false)} /> : <div data-back-wait style={{ ...label, padding: 16 }}>turning it over…</div>;
  const c = CURVE.radius.chip * 2;
  return (
    <div className="peel" data-peel style={{ position: "relative" }} onClick={(ev) => { if (ev.altKey) { ev.preventDefault(); turn(true); } }}>
      <div className={`peel-front${lift ? " lift" : ""}`}>{children}</div>
      {/* the turned corner: drag it toward the middle, or click it */}
      <div className="peel-corner" data-peel-corner title="lift to see how it was made"
        onPointerDown={(ev) => { from.current = { x: ev.clientX, y: ev.clientY }; setLift(true); (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); }}
        onPointerUp={() => { const f = from.current; from.current = null; setLift(false); if (f) turn(true); }}
        style={{ position: "absolute", top: 0, right: 0, width: c, height: c, cursor: "grab", touchAction: "none" }}>
        <svg width={c} height={c} aria-hidden style={{ display: "block" }}>
          <path d={`M0 0 L${c} ${c} L${c} 0 Z`} fill={on(SHADE.on.line * 2)} />
          <path d={`M0 0 L${c} ${c} L0 ${c} Z`} fill={pearl(SHADE.on.dim)} />
          <path d={`M0 0 L${c} ${c}`} stroke={dim} strokeWidth={1} />
        </svg>
      </div>
    </div>
  );
}

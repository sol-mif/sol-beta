// Cowork v3 slice 3 (fr-30 E9, #556): my window. Three rings from the inside out: Mine (never, unless I hand it), My way
// (when I approve, each time), Work facts (shown to the project). A chip dragged to another ring is one event on the
// trail (the engine's team.v3.window move) and an Undo line that runs out in 8 seconds. Nothing else moves a chip: the
// face never sends a move it did not see a hand drag. Seen from someone else, their core is shut and their way an ask.
// The look: the prototype's rings (rooms-people.js drawWindow) on the real face's tokens; the person in the middle wears
// the seat's glow.
import { useEffect, useRef, useState } from "react";
import type { Team } from "../useTeam";
import { Body } from "../bits";
import { RINGS, type Ring, type WindowAnswer, type ChipView } from "./peopleTypes";

const SZ = 600, C = 300;
const R: Record<Ring, { r: number; track: number; arc: number }> = { mine: { r: 138, track: 84, arc: 115 }, myWay: { r: 222, track: 180, arc: 203 }, workFacts: { r: 298, track: 260, arc: 282 } };
// where chips sit on each ring, in degrees (0 = right, 90 = down); the top stays free for the ring's name
const ANG: Record<Ring, number[]> = { mine: [20, 160, 90, 200, 340, 55, 125], myWay: [60, 120, 230, 310, 90, 170, 10], workFacts: [90, 25, 155, 195, 345, 55, 125, 180, 0] };
const slot = (ring: Ring, i: number, n: number) => {
  const a = ((i < ANG[ring].length ? ANG[ring][i] : -40 + (260 * (i + 0.5)) / n) * Math.PI) / 180;
  return { left: C + R[ring].track * Math.cos(a), top: C + R[ring].track * Math.sin(a) };
};
const ringAt = (d: number): Ring | null => (d < R.mine.r ? "mine" : d < R.myWay.r ? "myWay" : d < R.workFacts.r ? "workFacts" : null);
const arcPath = (r: number) => {
  const a1 = (-138 * Math.PI) / 180, a2 = (-42 * Math.PI) / 180;
  return `M${C + r * Math.cos(a1)} ${C + r * Math.sin(a1)} A${r} ${r} 0 0 1 ${C + r * Math.cos(a2)} ${C + r * Math.sin(a2)}`;
};

/** the undo line: a ring that runs out in 8 s, a sentence, one Undo press */
export function UndoLine({ text, onUndo, onGone }: { text: string; onUndo?: () => void; onGone: () => void }) {
  const [run, setRun] = useState(false);
  useEffect(() => { const a = requestAnimationFrame(() => setRun(true)); const t = window.setTimeout(onGone, 8000); return () => { cancelAnimationFrame(a); window.clearTimeout(t); }; }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="v3-undo" role="status">
      <svg className="v3-undo-ring" viewBox="0 0 18 18" aria-hidden="true"><circle className="bg" cx="9" cy="9" r="7" /><circle className={`fg ${run ? "run" : ""}`} cx="9" cy="9" r="7" /></svg>
      <span className="t">{text}</span>
      {onUndo && <button className="v3-press ghost" onClick={() => { onUndo(); onGone(); }}>Undo</button>}
    </div>
  );
}

export function MyWindow({ team, whose, people, onWhose }: { team: Team; whose: string; people: string[]; onWhose: (w: string) => void }) {
  const [w, setW] = useState<WindowAnswer | null>(null);
  const [undo, setUndo] = useState<{ text: string; token?: string } | null>(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; hot: Ring | null } | null>(null);
  const [focus, setFocus] = useState<ChipView | null>(null);
  const pic = useRef<HTMLDivElement>(null);
  const read = () => void team.ask<WindowAnswer>("team.v3.window", { whose }).then((r) => { if (r.error) setErr(r.error); else { setErr(""); setW(r); } });
  useEffect(() => { setW(null); setFocus(null); read(); }, [whose]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async (chip: string, ring: Ring) => {
    const r = await team.ask<{ ok?: true; undo?: string; line?: string; window?: WindowAnswer; error?: string }>("team.v3.window", { op: "move", chip, ring });
    if (r.error || !r.window) { setErr(r.error ?? "it did not move"); return; }
    setErr(""); setW(r.window); setUndo({ text: r.line ?? "", token: r.undo });
  };
  const takeBack = async (token: string) => {
    const r = await team.ask<{ ok?: true; window?: WindowAnswer; error?: string }>("team.v3.window", { op: "undo", undo: token });
    if (r.window) setW(r.window); else if (r.error) setErr(r.error);
  };

  const mine = !!w?.mine, may = !!w?.can.move;
  const toPic = (ev: { clientX: number; clientY: number }) => {
    const b = pic.current!.getBoundingClientRect(), k = b.width / SZ;
    return { x: (ev.clientX - b.left) / k, y: (ev.clientY - b.top) / k };
  };
  const down = (c: ChipView) => (ev: React.PointerEvent) => {
    if (!may) { setFocus(c); return; }
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    const start = toPic(ev);
    let moved = 0, hot: Ring | null = c.ring;
    const mv = (e: PointerEvent) => {
      const p = toPic(e), d = Math.hypot(p.x - C, p.y - C);
      moved = Math.max(moved, Math.hypot(p.x - start.x, p.y - start.y));
      // the core holds on: its chips come out with a pull, not a brush
      const pull = c.ring === "mine" && d < R.mine.r ? 0.4 : 1;
      hot = ringAt(d);
      setDrag({ id: c.id, x: start.x + (p.x - start.x) * pull, y: start.y + (p.y - start.y) * pull, hot });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      setDrag(null);
      if (moved < 4) { setFocus(c); return; }
      if (hot && hot !== c.ring) void move(c.id, hot);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  const ringName = (k: Ring) => !w ? "" : mine || k === "workFacts" ? w.words[k].name : k === "myWay" ? `${whose}’s way` : `${whose}’s own`;
  const ringRule = (k: Ring) => !w ? "" : mine ? w.words[k].rule : k === "mine" ? "you never see it" : k === "myWay" ? "what they approved, or ask" : "what they show you";
  return (
    <div className="v3-winwrap">
      <div ref={pic} className={`v3-win ${mine ? "mine" : "theirs"} ${drag ? "dragging" : ""}`}>
        <svg viewBox={`0 0 ${SZ} ${SZ}`} className="v3-win-svg" aria-hidden="true">
          {(["workFacts", "myWay", "mine"] as Ring[]).map((k) => <circle key={k} cx={C} cy={C} r={R[k].r} className={`v3-disc d-${k} ${drag?.hot === k && drag.hot !== w?.rings[k]?.find((c) => c.id === drag.id)?.ring ? "hot" : ""}`} />)}
          {RINGS.map((k) => <path key={k} id={`v3arc-${k}`} d={arcPath(R[k].arc)} fill="none" />)}
          {RINGS.map((k) => <text key={k} className={`v3-arc-t t-${k}`}><textPath href={`#v3arc-${k}`} startOffset="50%" textAnchor="middle">{ringName(k).toUpperCase()}</textPath></text>)}
        </svg>
        <div className="v3-win-face"><Body login={whose} size={52} /><span className="n">{mine ? "you" : whose}</span></div>
        {w && RINGS.flatMap((k) => w.rings[k].map((c, i) => {
          const pos = drag?.id === c.id ? { left: drag.x, top: drag.y } : slot(k, i, w.rings[k].length);
          return (
            <span key={c.id} className={`v3-chip r-${k} ${c.shut ? "shut" : ""} ${!mine && k === "myWay" ? "v3-chip-ask" : ""} ${drag?.id === c.id ? "drag" : ""} ${may ? "movable" : ""}`}
              style={{ left: pos.left / SZ * 100 + "%", top: pos.top / SZ * 100 + "%" }} title={c.full} onPointerDown={down(c)}>{c.label}</span>
          );
        }))}
      </div>
      <div className="v3-winside">
        <div className="v3-k">Whose window</div>
        <div className="v3-whose">
          {people.map((p) => <button key={p} className={p === whose ? "on" : ""} onClick={() => onWhose(p)} title={p === team.me ? "My window" : `What I see of ${p}`}><Body login={p} size={22} /><span>{p === team.me ? "Mine" : p}</span></button>)}
        </div>
        <div className="v3-legend">
          {(["workFacts", "myWay", "mine"] as Ring[]).map((k) => <div key={k} className="v3-lg"><span className={`sw s-${k}`} /><span><b>{ringName(k)}</b><span className="dim"> · {ringRule(k)}</span></span></div>)}
        </div>
        <p className="v3-hint">{mine ? (may ? "Drag a chip outward to show more, inward to show less. The core never moves by itself." : "A guest’s window is looked at, not moved.")
          : `The same picture, from the outside: what you see of ${whose}.`}</p>
        {focus && <div className="v3-focus"><b>{focus.full}</b><span className="dim">{focus.pass === "yes" ? "shown to the project" : focus.pass === "ask" ? "shown only on a yes, each time" : "never leaves, unless handed"}</span></div>}
        {undo && <UndoLine key={undo.token ?? undo.text} text={undo.text} onUndo={undo.token ? () => void takeBack(undo.token!) : undefined} onGone={() => setUndo(null)} />}
        {err && <p className="v3-err">{err}</p>}
      </div>
    </div>
  );
}

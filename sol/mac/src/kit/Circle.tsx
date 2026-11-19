// Circle (#692, tactile.html): loop a part of the screen and act on what was circled. On the Mac a two-finger loop on the
// trackpad (its scroll, drawn as a path from where the pointer rests: when the path turns most of a full turn and comes
// back near where it began, it is a loop); hold ⌥ and drag, or hold still a moment and drag, is the fallback and the
// only way with a mouse (Marco's question; built both, the loop first). The loop stays, dashed in the jelly's colours,
// and three acts appear under it (in a row; stacked at narrow): ask about it, make a sticky of it, keep it as context. Esc
// lets go. What was circled is the words whose middle lies inside the loop.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Glass } from "./Glass";
import { Pill } from "./Pill";
import { label, useSize, useUid } from "./paint";
import { CURVE, JELLY } from "./tokens";
import "./moves.css";

export type CircleAct = { label: string; then: string };
type P = { x: number; y: number };

/** a hold this long without moving starts a drag loop, as ⌥ does */
const HOLD_MS = 450;
/** how much of a full turn a trackpad path must make to be a loop, and how near its end must come back */
const TURN = 0.8, CLOSE = 0.45;
/** narrower than this the acts stack under the loop */
const NARROW = 520;

/** the words inside a loop: every word of the box's text whose middle lies inside the polygon (box coordinates) */
export function wordsIn(root: HTMLElement, poly: P[]): string {
  const o = root.getBoundingClientRect(), out: string[] = [];
  const inside = (x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest("[data-circle-ui]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const r = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.textContent ?? "";
    for (let m, re = /\S+/g; (m = re.exec(t)); ) {
      r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const b = r.getBoundingClientRect();
      if (b.width && inside(b.left + b.width / 2 - o.left, b.top + b.height / 2 - o.top)) out.push(m[0]);
    }
  }
  return out.join(" ");
}

/** how far a path turns, in full turns (signed) */
function turns(p: P[]) {
  let a = 0;
  for (let i = 2; i < p.length; i++) {
    const u = Math.atan2(p[i - 1].y - p[i - 2].y, p[i - 1].x - p[i - 2].x), v = Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x);
    let d = v - u; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a += d;
  }
  return a / (2 * Math.PI);
}
const span = (p: P[]) => { const xs = p.map((q) => q.x), ys = p.map((q) => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
const pathOf = (p: P[]) => p.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("") + "Z";

export function Circle({ children, onLoop, acts, onAct, onClear, loop: held }: {
  children: ReactNode;
  /** a loop closed round these words */
  onLoop: (text: string) => void;
  /** the three acts for what was circled (from the folder's context); shown beside the loop once they come */
  acts?: CircleAct[] | null;
  onAct?: (act: CircleAct, index: number, text: string) => void;
  /** the loop let go (Esc, or an act taken) */
  onClear?: () => void;
  /** a loop held from outside (a sheet, a test): its points in the box's coordinates */
  loop?: P[] | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<P[] | null>(null);
  const [loop, setLoop] = useState<{ p: P[]; text: string } | null>(null);
  const shown = held ? { p: held, text: "" } : loop;
  const drag = useRef<{ on: boolean; pts: P[]; hold: ReturnType<typeof setTimeout> | null; at: P | null }>({ on: false, pts: [], hold: null, at: null });
  const pad = useRef<{ pts: P[]; last: number; at: P }>({ pts: [], last: 0, at: { x: 0, y: 0 } });
  const local = (x: number, y: number): P => { const o = box.current!.getBoundingClientRect(); return { x: x - o.left, y: y - o.top }; };
  const close = (p: P[]) => {
    const text = box.current ? wordsIn(box.current, p) : "";
    setDrawing(null);
    if (!text) return;
    setLoop({ p, text }); onLoop(text);
  };
  const clear = () => { setLoop(null); setDrawing(null); onClear?.(); };
  useEffect(() => {
    if (!loop) return;
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") clear(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // the trackpad: two-finger movement arrives as wheel deltas; drawn from where the pointer rests, the path is a loop
  // once it turns most of a full turn and comes back near its start. While it is turning, the page does not scroll.
  useEffect(() => {
    const el = box.current; if (!el) return;
    const wheel = (ev: WheelEvent) => {
      if (ev.ctrlKey || ev.metaKey) return;   // a pinch, not a loop
      const g = pad.current, now = ev.timeStamp;
      if (now - g.last > 220 || !g.pts.length) g.pts = [g.at];
      g.last = now;
      const q = g.pts[g.pts.length - 1];
      g.pts.push({ x: q.x - ev.deltaX, y: q.y - ev.deltaY });
      const t = Math.abs(turns(g.pts));
      if (t > 0.2) { ev.preventDefault(); setDrawing([...g.pts]); }
      const s = span(g.pts), first = g.pts[0], end = g.pts[g.pts.length - 1];
      if (t >= TURN && Math.hypot(end.x - first.x, end.y - first.y) < CLOSE * Math.max(s.w, s.h) && s.w > 12 && s.h > 8) { const p = g.pts; g.pts = []; close(p); }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const [bw] = useSize(box), narrow = bw > 0 && bw < NARROW;
  const s = shown ? span(shown.p) : null;
  const grad = `circle${useUid()}`;
  return (
    <div ref={box} className="circle" data-circle data-looped={shown ? "" : undefined} style={{ position: "relative", userSelect: drag.current.on ? "none" : undefined }}
      onPointerMove={(ev) => {
        pad.current.at = local(ev.clientX, ev.clientY);
        const d = drag.current;
        if (d.hold && d.at && Math.hypot(ev.clientX - d.at.x, ev.clientY - d.at.y) > 4) { clearTimeout(d.hold); d.hold = null; }
        if (!d.on) return;
        d.pts.push(local(ev.clientX, ev.clientY)); setDrawing([...d.pts]);
      }}
      onPointerDown={(ev) => {
        if ((ev.target as HTMLElement).closest("[data-circle-ui]")) return;
        const d = drag.current, start = () => { d.on = true; d.pts = [local(ev.clientX, ev.clientY)]; setLoop(null); (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); };
        d.at = { x: ev.clientX, y: ev.clientY };
        if (ev.altKey) { ev.preventDefault(); start(); return; }
        d.hold = setTimeout(() => { d.hold = null; start(); window.getSelection()?.removeAllRanges(); setDrawing([...d.pts]); }, HOLD_MS);
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (d.hold) { clearTimeout(d.hold); d.hold = null; }
        if (!d.on) return;
        d.on = false;
        if (d.pts.length > 4) close(d.pts); else setDrawing(null);
      }}>
      {children}
      {(drawing || shown) && (
        <svg className="circle-loop" data-circle-ui aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
          <defs><linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">{JELLY.six.map((c, i) => <stop key={c} offset={i / (JELLY.six.length - 1)} stopColor={c} />)}</linearGradient></defs>
          <path d={pathOf(drawing ?? shown!.p)} fill="none" stroke={`url(#${grad})`} strokeWidth={1.5} strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" opacity={drawing ? 0.6 : 0.95} />
        </svg>
      )}
      {shown && s && !drawing && (
        // the acts lie under the loop, on the pop step of the glass, so they never sit on the words around it
        <div className="k-pop" data-circle-ui data-acts style={{ position: "absolute", left: Math.max(0, s.x - 4), top: s.y + s.h + 8, zIndex: 4, isolation: "isolate", padding: 4, display: "flex", flexDirection: narrow ? "column" : "row", alignItems: "flex-start", gap: 4 }}>
          <Glass r={CURVE.radius.row + 4} step="pop" surface="raised" />
          {acts?.length ? (narrow
            ? acts.map((a, i) => <div key={a.label} data-act={i}><Pill words={[a.label]} picked={-1} h={28} onPick={() => { onAct?.(a, i, loop?.text ?? ""); clear(); }} /></div>)
            : <div data-act-row><Pill words={acts.map((a) => a.label)} picked={-1} h={28} onPick={(i) => { onAct?.(acts[i], i, loop?.text ?? ""); clear(); }} /></div>)
            : <span style={{ ...label, padding: "6px 10px" }}>reading what you circled…</span>}
        </div>
      )}
    </div>
  );
}

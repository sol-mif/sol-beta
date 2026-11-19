// Shots (#696; v4 §4, #738): stills at their real ratio on black, each with keep / cut / later on hover; a kept one wears
// the pearl, a cut one fades. The question they are shown for sits under them, with how many are picked. The block waits
// on you until every still is picked; then it is live again. A press on a still opens it large over the window (Zoom):
// the wheel or a pinch zooms at the pointer, a drag moves it, a double press is 1 : 1 and back, ← → the next still,
// 1 2 3 keep cut later, Esc closes.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { KindProps, Pick, StillsBody } from "./types";
import { ENGINE_HTTP } from "../../engine";

/** a still kept on the engine's machine (a browser block's shot, #699) comes by the engine's image door */
const srcOf = (s: string) => (s.startsWith("/") ? `${ENGINE_HTTP}/pane-image?path=${encodeURIComponent(s)}` : s);

const PICKS: Pick[] = ["keep", "cut", "later"];

export function Stills({ b, body, act }: KindProps<StillsBody>) {
  const stills = body?.stills ?? [];
  const pick = (i: number, p: Pick) => {
    const next = stills.map((s, j) => (j === i ? { ...s, pick: p } : s));
    const all = next.every((s) => s.pick);
    act({ body: { ...body, stills: next }, ...(all && b.state === "waits" ? { state: "live" as const } : {}) }, `${stills[i].name}: ${p} · you${all ? " · all picked" : ""}`);
  };
  const picked = stills.filter((s) => s.pick).length;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="st-shots">
      <div className="st-stills">
        {stills.map((s, i) => (
          <div key={i} className={`st-still ${s.pick ?? ""}`} data-part={`still ${i + 1}`}>
            <Still src={s.src} name={s.name} onOpen={s.src ? () => setOpen(i) : undefined}>
              <span className="st-picks">{PICKS.map((p) => <button key={p} className={s.pick === p ? "on" : ""} onClick={(ev) => { ev.stopPropagation(); pick(i, p); }}>{p}</button>)}</span>
            </Still>
            <span>{s.name}</span>
          </div>
        ))}
      </div>
      {(body?.ask || b.state === "waits") && stills.length > 0 && (
        <div className="st-ask" data-part="the question">{body?.ask ?? "keep, cut or later, each"}<small>{picked} of {stills.length} picked</small></div>
      )}
      {open !== null && stills[open]?.src && createPortal(
        <Zoom key={open} src={srcOf(stills[open].src!)} name={stills[open].name} at={open} of={stills.length} pick={stills[open].pick}
          onPick={(p) => pick(open, p)} onGo={(d) => setOpen((open + d + stills.length) % stills.length)} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
}

/** a still large over the window: fitted at first; z is the zoom over the fit, x y the move from the centre */
function Zoom({ src, name, at, of, pick, onPick, onGo, onClose }: { src: string; name: string; at: number; of: number; pick?: Pick; onPick: (p: Pick) => void; onGo: (d: number) => void; onClose: () => void }) {
  const [v, setV] = useState({ z: 1, x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null), img = useRef<HTMLImageElement>(null);
  const live = useRef({ onPick, onGo, onClose }); live.current = { onPick, onGo, onClose };
  /** the zoom that shows the picture's own pixels, over the fit */
  const one = () => { const i = img.current; return i && i.clientWidth ? Math.max(1.5, i.naturalWidth / i.clientWidth) : 2; };
  const zoomAt = (to: number, cx: number, cy: number) => setV((o) => {
    const z = Math.min(12, Math.max(1, to)), k = z / o.z;
    return z === 1 ? { z: 1, x: 0, y: 0 } : { z, x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k };
  });
  const fromCentre = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2] as const; };
  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [cx, cy] = fromCentre(e);
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= 40) setV((o) => { const z = Math.min(12, Math.max(1, o.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)))), k = z / o.z; return z === 1 ? { z: 1, x: 0, y: 0 } : { z, x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k }; });
      else setV((o) => (o.z === 1 ? o : { ...o, x: o.x - e.deltaX, y: o.y - e.deltaY }));   // two fingers move a zoomed still
    };
    const key = (e: KeyboardEvent) => {
      const k = live.current;
      if (e.key === "Escape") k.onClose(); else if (e.key === "ArrowRight") k.onGo(1); else if (e.key === "ArrowLeft") k.onGo(-1);
      else if (e.key === "1" || e.key === "2" || e.key === "3") k.onPick(PICKS[Number(e.key) - 1]);
      else if (e.key === "0") setV({ z: 1, x: 0, y: 0 }); else if (e.key === "=" || e.key === "+") setV((o) => ({ ...o, z: Math.min(12, o.z * 1.5) }));
      else if (e.key === "-") setV((o) => (o.z / 1.5 <= 1 ? { z: 1, x: 0, y: 0 } : { ...o, z: o.z / 1.5 })); else return;
      e.preventDefault(); e.stopPropagation();
    };
    el.addEventListener("wheel", wheel, { passive: false }); window.addEventListener("keydown", key, true);
    return () => { el.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key, true); };
  }, []);
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget, x0 = e.clientX, y0 = e.clientY, from = v, beside = e.target === el; let moved = false;
    el.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => { if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return; moved = true; if (from.z > 1) setV({ z: from.z, x: from.x + ev.clientX - x0, y: from.y + ev.clientY - y0 }); };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      if (!moved && beside && ev.type === "pointerup") live.current.onClose();   // a press beside the picture closes
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };
  return (
    <div className={`st-zoom ${v.z > 1 ? "in" : ""}`} role="dialog" aria-label={name} data-part="the still, large">
      <div className="st-zoomroom" ref={box} onPointerDown={down} onDoubleClick={(e) => { const [cx, cy] = fromCentre(e); zoomAt(v.z > 1 ? 1 : one(), cx, cy); }}>
        <img ref={img} src={src} alt={name} draggable={false} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})` }} />
      </div>
      <div className="st-zoomfoot">
        <span><b>{name}</b>{of > 1 ? ` · ${at + 1} of ${of}` : ""} · {Math.round(v.z * 100)}%</span>
        <span className="st-zoomkeys">scroll or pinch zooms · drag moves · double press 1 : 1{of > 1 ? " · ← →" : ""} · Esc</span>
        <span className="st-picks">{PICKS.map((p) => <button key={p} className={pick === p ? "on" : ""} onClick={() => onPick(p)}>{p}</button>)}</span>
      </div>
    </div>
  );
}

/** a still on black at its own ratio: the frame takes the picture's shape once it has loaded (4 : 3 until then) */
function Still({ src, name, onOpen, children }: { src?: string; name: string; onOpen?: () => void; children: ReactNode }) {
  const [ratio, setRatio] = useState<string | undefined>(undefined);
  return (
    <div className={`st-frame ${onOpen ? "opens" : ""}`} style={ratio ? { aspectRatio: ratio } : undefined} onClick={onOpen} title={onOpen ? "press to see it large" : undefined}>
      {src ? <img src={srcOf(src)} alt={name} onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(`${i.naturalWidth} / ${i.naturalHeight}`); }} /> : <i className="st-stillmark" aria-hidden />}
      {children}
    </div>
  );
}

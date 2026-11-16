// The spine: the one column that is everywhere (Marco 2026-11-07; the mechanics on mine/look/functions/side-mechanics.html).
// The jelly on top (Body.tsx, the lit body behind sol.body.a; off, Mark's flat splat), the creature's state on it,
// the four views as drawn marks, find and settings at the foot. The kit's pearl travels between the marks on a spring and
// stretches along its way (a hop is a throw Marco made, so it may bounce once); a thread of the jelly's heat runs from
// Sol down to a view that waits on him. A mark is drawn 34 but hit 52×44: the whole column is a target; its name and key
// materialise beside it after a moment's hover. Keys: ⌘1 to ⌘4 hop, ⌘[ and ⌘] walk the history.
// Second cut (Marco 2026-11-07, his screenshot): the grey blob and the letters were not Sol and not the design; now the
// creature, the kit's pearl and glass, and marks drawn in the kit's stroke. Nothing here knows a view's insides.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SPRINGS as CFG, useSpring, reducedMotion } from "../motion";
import { Glass } from "../kit";
import { pearl as pearlFill } from "../kit/paint";
import { BodyLive } from "../Body";
import { VIEWS, type View } from "./flag";
import "./spine.css";

const PEARL = { ...CFG.settle, eps: 0.0015 };   // the pearl snaps to the picked row: settle (motion.ts, #763)
const LETTER = 44, DRAWN = 34, SOL = 32;

// the marks: one stroke, round caps, the kit's weight, on a 24 box
const Mark = ({ children }: { children: ReactNode }) => (
  <svg className="spn-mark" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const MARKS: Record<View | "find" | "settings", ReactNode> = {
  home: <Mark><path d="M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.6v-5.2H9.6V20H5a1 1 0 0 1-1-1z" /></Mark>,
  build: <Mark><path d="m13.2 4.6 6.2 6.2-2.3 2.3-6.2-6.2z" /><path d="M12.6 9.5 4.2 17.9l1.9 1.9 8.4-8.4" /><path d="m16.5 3.5 1.5 1.5" /></Mark>,
  cowork: <Mark><circle cx="9.2" cy="12" r="5.2" /><circle cx="14.8" cy="12" r="5.2" /></Mark>,
  social: <Mark><circle cx="10" cy="8.2" r="3.2" /><path d="M4.2 20a5.8 5.8 0 0 1 11.6 0" /><circle cx="17.6" cy="9.6" r="2.3" /><path d="M16.8 15.2a4.2 4.2 0 0 1 3.4 4.4" /></Mark>,
  find: <Mark><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4.6 4.6" /></Mark>,
  settings: <Mark><path d="M4 7.2h16M4 12h16M4 16.8h16" /><circle cx="9.5" cy="7.2" r="2" fill="var(--c-deep)" /><circle cx="15" cy="12" r="2" fill="var(--c-deep)" /><circle cx="8" cy="16.8" r="2" fill="var(--c-deep)" /></Mark>,
};

export function Spine({ view, onPick, waits, onFind, onSettings, onJelly }: {
  view: View; onPick: (v: View) => void; waits: Set<View>; onFind: () => void; onSettings: () => void; onJelly: () => void;
}) {
  const col = useRef<HTMLElement>(null);
  const pearl = useRef<HTMLDivElement>(null);
  const yOf = (v: View) => { const b = col.current?.querySelector<HTMLElement>(`[data-view="${v}"]`); return (b?.offsetTop ?? 0) + (LETTER - DRAWN) / 2; };
  // the pearl: its stretch comes from its own speed, so a long hop stretches more than a short one
  const y = useSpring(0, PEARL, (v, s) => {
    const el = pearl.current; if (!el) return;
    const st = reducedMotion() ? 0 : Math.min(0.22, Math.abs(s.vel) / 2600);
    el.style.transform = `translateY(${v}px) scale(${1 - st * 0.5}, ${1 + st})`;
  });
  useLayoutEffect(() => { y.set(yOf(view)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { y.to(yOf(view)); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // the history: where you were, walked by ⌘[ and ⌘]
  const hist = useRef<{ back: View[]; fwd: View[] }>({ back: [], fwd: [] });
  const last = useRef(view);
  useEffect(() => { if (last.current !== view) { hist.current.back.push(last.current); hist.current.fwd = []; last.current = view; } }, [view]);
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
      const i = "1234".indexOf(ev.key);
      if (i >= 0) { ev.preventDefault(); onPick(VIEWS[i].id); return; }
      if (ev.key === "[" && hist.current.back.length) { ev.preventDefault(); const v = hist.current.back.pop()!; hist.current.fwd.push(view); last.current = v; onPick(v); return; }
      if (ev.key === "]" && hist.current.fwd.length) { ev.preventDefault(); const v = hist.current.fwd.pop()!; hist.current.back.push(view); last.current = v; onPick(v); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [view, onPick]);
  // the thread of heat: from Sol to the first view that waits, if it is not the one you are in
  const waiting = VIEWS.find((v) => waits.has(v.id) && v.id !== view)?.id;
  const [threadH, setThreadH] = useState(0);
  useLayoutEffect(() => { setThreadH(waiting ? yOf(waiting) - 48 : 0); }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const needs = waits.size > 0;
  return (
    <><div className="f-lights" data-tauri-drag-region aria-hidden />
    <nav ref={col} className="spine" aria-label="the spine" data-place="spine">
      <div className="sp-thread" style={{ height: `${threadH}px`, opacity: threadH ? 0.9 : 0 }} aria-hidden />
      <div className={`sp-sol ${needs ? "needs" : ""}`}>
        <button type="button" className="sp-solb" onClick={onJelly} title={needs ? "something needs you: press for the list" : "Sol"} aria-label="Sol"><BodyLive size={SOL} notch={false} six /></button>
      </div>
      <div ref={pearl} className="sp-pearl" aria-hidden><Glass w={DRAWN} h={DRAWN} r={11} fill={pearlFill()} edge={0} /></div>
      {VIEWS.map((v, i) => (
        <button key={v.id} type="button" data-view={v.id} className={`sp-m ${v.id === view ? "on" : ""} ${waits.has(v.id) && v.id !== view ? "wait" : ""}`}
          aria-pressed={v.id === view} aria-label={`${v.name} · ⌘${i + 1}`} onClick={() => onPick(v.id)}>
          <i>{MARKS[v.id]}</i>
          <span className="sp-tag">{v.name}<kbd>⌘{i + 1}</kbd>{waits.has(v.id) && <em>waits on you</em>}</span>
        </button>
      ))}
      <div className="sp-foot">
        <button type="button" className="sp-m" aria-label="find · ⌘K" onClick={onFind}><i>{MARKS.find}</i><span className="sp-tag">find<kbd>⌘K</kbd></span></button>
        <button type="button" className="sp-m" aria-label="Sol's settings" onClick={onSettings}><i>{MARKS.settings}</i><span className="sp-tag">settings</span></button>
      </div>
    </nav></>
  );
}

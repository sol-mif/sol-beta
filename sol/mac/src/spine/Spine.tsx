// The spine: the one column that is everywhere (Marco 2026-11-07; the mechanics on mine/look/functions/side-mechanics.html).
// The jelly on top (Body.tsx, the lit body), the creature's state on it,
// the four views as drawn marks, find and settings at the foot. The kit's pearl travels between the marks on a spring and
// stretches along its way (a hop is a throw Marco made, so it may bounce once); a thread of the jelly's heat runs from
// Sol down to a view that waits on him. A mark is drawn 34 but hit 52×44: the whole column is a target; its name and key
// materialise beside it after a moment's hover. Keys: ⌘1 to ⌘4 hop, ⌘[ and ⌘] walk the history.
// Second cut (Marco 2026-11-07, his screenshot): the grey blob and the letters were not Sol and not the design; now the
// creature, the kit's pearl and glass, and marks drawn in the kit's stroke. Nothing here knows a view's insides.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, useMemo } from "react";
import { CFG, useSpring, reducedMotion } from "../motion";
import { Glass } from "../kit";
import { CURVE } from "../kit/tokens";
import { pearl as pearlFill } from "../kit/paint";
import { BodyLive } from "../Body";
import { VIEWS, type View } from "./flag";
import "./spine.css";

const PEARL = { ...CFG.settle, eps: 0.0015 };   // the pearl snaps to the picked row: settle (motion.ts, #763)
const SOL = 32;
// "hold it" on the spine (Marco 2026-11-11: layer 1 "looks really flismy and sad ... it should mostly be compacted";
// his yes the same day, "keep the jelly creature there for now"): the views held in one tray of the kit's glass with
// solid marks, find and settings a second tray at the foot, the jelly above them. The look before it stays one word
// away: `?spine=plain` on the link or sol.spine.look = "plain" in this window's storage.
const holdLook = () => { try { return new URLSearchParams(location.search).get("spine") !== "plain" && localStorage.getItem("sol.spine.look") !== "plain"; } catch { return true; } };
const SIZES = { plain: { row: 44, drawn: 34, r: 11, sol: SOL }, hold: { row: 36, drawn: 30, r: 10, sol: 36 } };

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

// the held look's marks (Marco 2026-11-11: "change the icons to just look better ... simplistic, direct and easy to
// understand"): the same four pictures and two tools, drawn solid on the 24 box so each has weight at 20 px; a thin
// round-joined rim of their own colour softens every corner. Find and settings stay lines, at 2.2.
const Solid = ({ children }: { children: ReactNode }) => (
  <svg className="spn-mark" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const LINE = { fill: "none", strokeWidth: 2.2 } as const;
const MARKS_HELD: typeof MARKS = {
  home: <Solid><path d="M12 3.6 4 10.4V19a1 1 0 0 0 1 1h4.2v-4.6a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4V20H19a1 1 0 0 0 1-1v-8.6z" /></Solid>,
  build: <Solid><g transform="rotate(45 12 12)"><rect x="6" y="2.6" width="12" height="6" rx="1.6" /><rect x="10.5" y="8.6" width="3" height="13" rx="1.5" /></g></Solid>,
  cowork: <Solid><path fillRule="evenodd" strokeWidth={0.4} d="M9.4 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM14.6 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4z" /></Solid>,
  social: <Solid><circle cx="9" cy="7.8" r="3.2" /><path d="M3.2 19.4a5.8 5.8 0 0 1 11.6 0z" /><circle cx="17.4" cy="9.4" r="2.2" /><path d="M16.6 14.2a4.4 4.4 0 0 1 4.4 5.2h-3.4a8.4 8.4 0 0 0-1.8-5.1z" /></Solid>,
  find: <Solid><circle cx="10.6" cy="10.6" r="6" {...LINE} /><path d="m15.2 15.2 4.6 4.6" {...LINE} strokeWidth={2.6} /></Solid>,
  settings: <Solid><path d="M4 8h16M4 16h16" {...LINE} /><circle cx="9" cy="8" r="2.6" strokeWidth={0} /><circle cx="15" cy="16" r="2.6" strokeWidth={0} /></Solid>,
};

export function Spine({ view, onPick, waits, onFind, onSettings, onJelly, extra, shown }: {
  view: View; onPick: (v: View) => void; waits: Set<View>; onFind: () => void; onSettings: () => void; onJelly: () => void;
  /** the views this Sol shows (#1637, spine/views.ts): a tester's Sol is Build alone; absent, all four */
  shown?: Set<View>;
  /** a door under the four views, drawn only when a build switch asks (the runs view, #889, behind build.runs) */
  extra?: ReactNode;
}) {
  const col = useRef<HTMLElement>(null);
  const views = useMemo(() => (shown ? VIEWS.filter((v) => shown.has(v.id)) : VIEWS), [shown]);
  const tray = useRef<HTMLDivElement>(null);
  const hold = holdLook(), { row: LETTER, drawn: DRAWN, r: PR, sol } = SIZES[hold ? "hold" : "plain"];
  const pearl = useRef<HTMLDivElement>(null);
  const yOf = (v: View) => { const b = col.current?.querySelector<HTMLElement>(`[data-view="${v}"]`); return (b?.offsetTop ?? 0) + (LETTER - DRAWN) / 2; };
  // the pearl: its stretch comes from its own speed, so a long hop stretches more than a short one
  const y = useSpring(0, PEARL, (v, s) => {
    const el = pearl.current; if (!el) return;
    const st = reducedMotion() ? 0 : Math.min(0.22, Math.abs(s.vel) / 2600);
    el.style.transform = `translateY(${v}px) scale(${1 - st * 0.5}, ${1 + st})`;
  });
  useLayoutEffect(() => { y.set(yOf(view)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { y.to(yOf(view)); }, [view, views]); // eslint-disable-line react-hooks/exhaustive-deps -- the views drawn change where a mark sits (#1637)
  // the history: where you were, walked by ⌘[ and ⌘]
  const hist = useRef<{ back: View[]; fwd: View[] }>({ back: [], fwd: [] });
  const last = useRef(view);
  useEffect(() => { if (last.current !== view) { hist.current.back.push(last.current); hist.current.fwd = []; last.current = view; } }, [view]);
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.defaultPrevented) return;   // a view that walked its own history took the key (Cowork's places, #1416)
      const i = "1234".indexOf(ev.key);
      if (i >= 0 && i < views.length) { ev.preventDefault(); onPick(views[i].id); return; }
      if (ev.key === "[" && hist.current.back.length) { ev.preventDefault(); const v = hist.current.back.pop()!; hist.current.fwd.push(view); last.current = v; onPick(v); return; }
      if (ev.key === "]" && hist.current.fwd.length) { ev.preventDefault(); const v = hist.current.fwd.pop()!; hist.current.back.push(view); last.current = v; onPick(v); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [view, onPick, views]);
  // the thread of heat: from Sol to the first view that waits, if it is not the one you are in
  const waiting = views.find((v) => waits.has(v.id) && v.id !== view)?.id;
  const [threadH, setThreadH] = useState(0);
  useLayoutEffect(() => { setThreadH(waiting ? (tray.current?.offsetTop ?? 0) + yOf(waiting) - 48 : 0); }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const needs = waits.size > 0;
  const marks = hold ? MARKS_HELD : MARKS;
  return (
    <><div className="f-lights" data-tauri-drag-region aria-hidden />
    <nav ref={col} className={`spine${hold ? " hold" : ""}`} aria-label="the spine" data-place="spine">
      <div className="sp-thread" style={{ height: `${threadH}px`, opacity: threadH ? 0.9 : 0 }} aria-hidden />
      <div className={`sp-sol ${needs ? "needs" : ""}`}>
        <button type="button" className="sp-solb" onClick={onJelly} title={needs ? "something needs you: press for the list" : "Sol"} aria-label="Sol"><BodyLive size={sol} six /></button>
      </div>
      <div ref={tray} className="sp-tray">
      {hold && <Glass r={CURVE.radius.field} step="card" />}
      <div ref={pearl} className="sp-pearl" aria-hidden><Glass w={DRAWN} h={DRAWN} r={PR} fill={pearlFill()} edge={0} /></div>
      {views.map((v, i) => (
        <button key={v.id} type="button" data-view={v.id} className={`sp-m ${v.id === view ? "on" : ""} ${waits.has(v.id) && v.id !== view ? "wait" : ""}`}
          aria-pressed={v.id === view} aria-label={`${v.name} · ⌘${i + 1}`} onClick={() => onPick(v.id)}>
          <i>{marks[v.id]}</i>
          <span className="sp-tag">{v.name}<kbd>⌘{i + 1}</kbd>{waits.has(v.id) && <em>waits on you</em>}</span>
        </button>
      ))}
      </div>
      {extra}
      <div className="sp-foot">
        {hold && <Glass r={CURVE.radius.field} step="card" />}
        <button type="button" className="sp-m" aria-label="find · ⌘K" onClick={onFind}><i>{marks.find}</i><span className="sp-tag">find<kbd>⌘K</kbd></span></button>
        <button type="button" className="sp-m" aria-label="Sol's settings" onClick={onSettings}><i>{marks.settings}</i><span className="sp-tag">settings</span></button>
      </div>
    </nav></>
  );
}

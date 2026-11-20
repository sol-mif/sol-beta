// The one session's door (mine, 2026-11-11, his words: "next to settings within the second layer tab within build mode,
// not as a button hanging in the bottom left corner"): a row in Build's side foot, beside conversations and settings.
// Its mark is the body itself (Body.tsx, never a drawn copy): apart while Build is many sessions, settled while it is
// the one. Going in, six dots leave the session rows in the side and pour into the mark, which settles when they land;
// going out, the mark comes apart and its six go back to the rows. With reduced motion, or no row in sight, the mark
// only changes state. The same row sits in both sides: Build's older side (WorkSidebar) and the clean side (home/Side,
// the one his window draws), which passes `clean` and its own lift.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Body, BodyDots, HALO, type BodyState, type Flight } from "../Body";
import { POUR } from "../stage/useJelly";
import { reducedMotion } from "../motion";
import "./door.css";

type Pt = { x: number; y: number };
const SIZE = 20, DOT = 3;

/** the session rows in sight in the side's list, top first, as points in the window */
const rowSpots = (): Pt[] => {
  const box = document.querySelector<HTMLElement>(".side .side-list, .hc-side .hc-list");
  const list = box?.getBoundingClientRect();
  if (!box || !list) return [];
  return [...box.querySelectorAll<HTMLElement>("[data-sid], [data-cid]")]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.top >= list.top - 1 && r.bottom <= list.bottom + 1)
    .slice(0, 6).map((r) => ({ x: r.left + 16, y: r.top + r.height / 2 }));
};
const six = (pts: Pt[]): Pt[] => Array.from({ length: 6 }, (_, k) => pts[k % pts.length]);

export function OneDoor({ on, onPick, clean, tail }: { on: boolean; onPick: () => void; clean?: boolean; tail?: ReactNode }) {
  const mark = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<BodyState>(on ? "settled" : "apart");
  const [near, setNear] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const was = useRef(on), nextId = useRef(1);
  useEffect(() => {
    if (was.current === on) return;
    was.current = on;
    const m = mark.current?.getBoundingClientRect(), rows = rowSpots();
    if (!m || !rows.length || reducedMotion()) { setFlights([]); setState(on ? "settled" : "apart"); return; }
    const at = six([{ x: m.left + m.width / 2, y: m.top + m.height / 2 }]);
    const f: Flight = { id: nextId.current++, from: on ? six(rows) : at, to: on ? at : six(rows), t0: performance.now(), ms: POUR.ms, sink: POUR.sink, ease: POUR.ease, dot: DOT, halo: HALO };
    if (!on) setState("apart");
    setFlights([f]);   // a new press mid-flight: the old flight is dropped, the new one starts where the state now is
  }, [on]);
  const landed = (id: number) => { if (was.current && flights.some((f) => f.id === id)) setState("settled"); };
  const done = (id: number) => setFlights((fs) => fs.filter((f) => f.id !== id));
  return (
    <>
      <button className={`${doorClass(clean)} one-door ${on ? "on" : ""}`} data-s={clean ? undefined : true} data-thing={clean ? true : undefined} data-kind={clean ? "head" : undefined}
        tabIndex={clean ? -1 : undefined} onClick={onPick} aria-pressed={on}
        title={on ? "you are in the anchor: the session that is kept" : "the anchor: one session that is kept; an ordinary one, with its talk and its stage"}
        onPointerEnter={() => setNear(true)} onPointerLeave={() => setNear(false)}>
        <span ref={mark} className="one-door-mark" aria-hidden><Body size={clean ? SIZE + 6 : SIZE} state={state} follow={near} /></span><span>anchor</span>{tail}
      </button>
      {flights.length > 0 && createPortal(
        <div className="one-door-air" aria-hidden>{flights.map((f) => <BodyDots key={f.id} flight={f} onLand={landed} onDone={done} />)}</div>, document.body)}
    </>
  );
}

/** the door's own box: the clean Home's head gear, or the old side's settings row (one or the other, never both) */
const doorClass = (clean?: boolean) => (clean ? "hc-gear" : "newc setc");

// The tray at the stage's foot (#779, #751 B16; trayFold.ts says what it holds): one hairline, a square for each block in it
// (up to 14) and the count, "N folded". A fold lands in the last square with a pearl flash and the count bumps. Pressed,
// it opens a shelf of small copies grouped by session ("this session" in front). A press on a copy unfolds it to its
// place; a copy dragged out is a drag at once (Stage.tsx owns both, it knows the stage). Behind `stage.whole`.
import { forwardRef, useEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { TRAY, Z } from "../kit/feel";
import { nameOf } from "./carry";
import { Mark } from "./kinds/Mark";
import { KINDS } from "./kinds";
import { MiniTerm } from "./MiniTerm";
import type { Block } from "./model";
import { count, squares, type Group, type Mini } from "./trayFold";
import { pastThreshold } from "./hand";
import "./tray.css";

type Props = {
  /** the stage's session: a copy of a program's block (a terminal) reads it from the engine */
  session?: string;
  groups: Group[];
  /** bumps by one each time a fold lands */
  bump: number;
  open: boolean;
  onToggle: () => void;
  onPick: (m: Mini) => void;
  /** a copy dragged past the threshold: the stage takes it from here (the move event, at once) */
  onLift: (m: Mini, e: PointerEvent) => void;
};

export const WholeTray = forwardRef<HTMLDivElement, Props>(function WholeTray({ session, groups, bump, open, onToggle, onPick, onLift }, ref) {
  const n = count(groups), q = squares(n);
  const vars = { height: TRAY.h, zIndex: Z.tray, "--tray-bump": `${TRAY.bump}ms`, "--tray-land": `${TRAY.land}ms`, "--tray-land-from": TRAY.landFrom } as CSSProperties;
  return (
    <>
      {open && n > 0 && (
        <div className="st-tshelf" style={{ bottom: TRAY.h, height: TRAY.shelf, zIndex: Z.tray - 1 }} data-part="the tray's copies">
          {groups.map((g) => (
            <div key={g.from ?? "here"} className="st-tgroup" data-from={g.from ?? ""}>
              <h6>{g.from ? nameOf(g.from) : "this session"}</h6>
              <div className="st-tminis">{g.minis.map((m) => <Copy key={m.id} m={m} session={session} onPick={onPick} onLift={onLift} />)}</div>
            </div>
          ))}
        </div>
      )}
      <div ref={ref} className={`st-wtray ${open ? "open" : ""}`} style={vars} data-tray data-part="the tray" onClick={onToggle}>
        <span className="st-tq" style={{ gap: TRAY.sq.gap, paddingLeft: TRAY.inset }}>
          {Array.from({ length: q }, (_, i) => <i key={i === q - 1 ? `new-${bump}` : i} className={i === q - 1 && bump ? "new" : ""} style={{ width: TRAY.sq.w, height: TRAY.sq.h, borderRadius: TRAY.sq.r }} />)}
        </span>
        {n > 0 && <span key={`n-${bump}`} className={`st-tn ${bump ? "bump" : ""}`} data-count={n}>{n} folded</span>}   {/* #954: whole.html's words, "4 folded" (#891 had "in the tray") */}
      </div>
    </>
  );
});

function Copy({ m, session, onPick, onLift }: { m: Mini; session?: string; onPick: (m: Mini) => void; onLift: (m: Mini, e: PointerEvent) => void }) {
  const lifted = useRef(false);
  useEffect(() => () => { lifted.current = false; }, []);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const from = { x: e.clientX, y: e.clientY }, id = e.pointerId, type = e.pointerType || "mouse";
    lifted.current = false;
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId !== id || lifted.current || !pastThreshold(type, from, { x: ev.clientX, y: ev.clientY })) return;
      lifted.current = true;
      off();
      onLift(m, ev);
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId !== id) return; off(); if (!lifted.current) onPick(m); };
    const off = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  return (
    <div role="button" tabIndex={-1} className="st-tmini" style={{ width: TRAY.mini.w, height: TRAY.mini.h }} data-wmini={m.id} title={m.title} onPointerDown={down} onClick={(e) => e.stopPropagation()}>
      {m.body !== undefined && m.kind !== "browser" ? <Live m={m} session={session} /> : <span className="st-tmark"><Mark kind={m.kind} /></span>}
      <span className="st-tmt">{m.title}</span>
    </div>
  );
}

/** #954 (whole.md "fold": the tray holds small live copies; whole.html's .mini): the block's own content, laid at
 *  TRAY.mini.at and scaled into the copy, inert (the copy takes the press). A terminal shows its last lines without
 *  attaching a pane (MiniTerm); a browser is a view over the face, so its copy keeps the mark */
function Live({ m, session }: { m: Mini; session?: string }) {
  const { pad, foot, at, w } = TRAY.mini, s = (w - 2 * pad) / at.w;
  const b: Block = { id: m.id, kind: m.kind, title: m.title, state: "live", versions: [], sessions: session ? [session] : [], body: m.body };
  const Kind = KINDS[m.kind];
  return (
    <div className="st-tlive" style={{ inset: `${pad}px ${pad}px ${foot}px` }} aria-hidden inert>
      <div className="st-tlivein" style={{ width: at.w, height: at.h, transform: `scale(${s})` }}>
        {m.kind === "terminal" ? <MiniTerm body={m.body} /> : <Kind b={b} body={m.body} act={() => {}} session={session} />}
      </div>
    </div>
  );
}

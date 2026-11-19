// The artifacts put away, at the stage's bottom edge (#779, #751 B16; trayFold.ts says what it holds). 2026-11-12, Marco:
// "tiny squares that mean nothing that i have to individually click on and guess": so they are written by name. The row
// names the newest ones put away (a press on a name brings it back); "all N put away" opens the list of every one, by
// name and what it is, grouped by session, with a find field past eight. Esc or a press anywhere else closes the list.
// A name dragged out is a drag at once (Stage.tsx owns both, it knows the stage). Behind `stage.whole`.
import { forwardRef, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { TRAY, Z } from "../kit/feel";
import { nameOf } from "./carry";
import { Mark } from "./kinds/Mark";
import type { Block } from "./model";
import { count, type Group, type Mini } from "./trayFold";
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

/** what an artifact is, in a person's words, for the list's second line */
const SAY: Partial<Record<Block["kind"], string>> = { page: "a page", list: "a list", diff: "what changed in a file", browser: "a web page", terminal: "a terminal", table: "a table", shots: "pictures", card: "a note" };
const NAMES = 8;   // the names the row writes out; the rest are in the list

export const WholeTray = forwardRef<HTMLDivElement, Props>(function WholeTray({ groups, bump, open, onToggle, onPick, onLift }, ref) {
  const n = count(groups);
  const vars = { height: TRAY.h, zIndex: Z.tray, "--tray-bump": `${TRAY.bump}ms`, "--tray-land": `${TRAY.land}ms`, "--tray-land-from": TRAY.landFrom } as CSSProperties;
  const [find, setFind] = useState("");
  const shelf = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) setFind(""); }, [open]);
  // a press anywhere else puts the list away (2026-11-12: "oh i want to close it, cant")
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as HTMLElement | null; if (!t?.closest?.(".st-tshelf, .st-wtray")) onToggle(); };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [open, onToggle]);
  // the newest fold first: this session's are kept in the order they folded
  const names = (groups.find((g) => g.from === null)?.minis ?? groups[0]?.minis ?? []).slice().reverse().slice(0, NAMES);
  const q = find.trim().toLowerCase(), hit = (m: Mini) => !q || m.title.toLowerCase().includes(q) || (SAY[m.kind] ?? "").includes(q);
  return (
    <>
      {open && n > 0 && (
        <div ref={shelf} className="st-tshelf st-tlist" style={{ bottom: TRAY.h, zIndex: Z.tray - 1 }} data-part="the artifacts put away" role="dialog" aria-label="artifacts put away">
          {n > NAMES && <input className="st-tfind" autoFocus value={find} placeholder="find an artifact" onChange={(e) => setFind(e.target.value)} onPointerDown={(e) => e.stopPropagation()} />}
          {groups.map((g) => { const ms = g.minis.filter(hit); return ms.length ? (
            <div key={g.from ?? "here"} className="st-tgroup" data-from={g.from ?? ""}>
              <h6>{g.from ? `from ${nameOf(g.from)}` : "this session"}</h6>
              {(g.from ? ms : ms.slice().reverse()).map((m) => <Copy key={m.id} m={m} row onPick={onPick} onLift={onLift} />)}
            </div>) : null; })}
          {q && !groups.some((g) => g.minis.some(hit)) && <p className="st-tnone">nothing put away is called that</p>}
        </div>
      )}
      <div ref={ref} className={`st-wtray names ${open ? "open" : ""}`} style={vars} data-tray data-part="the tray">
        <span className="st-tnames">{names.map((m, i) => <Copy key={i === 0 ? `${m.id}-${bump}` : m.id} m={m} fresh={i === 0 && !!bump} onPick={onPick} onLift={onLift} />)}</span>
        {n > 0 && <button type="button" tabIndex={-1} key={`n-${bump}`} className={`st-tn st-tall ${bump ? "bump" : ""}`} data-count={n} aria-expanded={open} title="every artifact put away, by name" onClick={onToggle}>{open ? "close" : `all ${n} put away`}</button>}
      </div>
    </>
  );
});

/** one artifact put away, by name: a press brings it back to its place, a drag carries it out (Stage.tsx owns both).
 *  `row` is the list's line (the name and what it is); without it, the short name in the row at the stage's bottom edge */
function Copy({ m, row, fresh, onPick, onLift }: { m: Mini; row?: boolean; fresh?: boolean; onPick: (m: Mini) => void; onLift: (m: Mini, e: PointerEvent) => void }) {
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
    <div role="button" tabIndex={-1} className={`${row ? "st-trow" : "st-tname"} ${fresh ? "new" : ""}`} data-wmini={m.id} title={row ? "bring it back to the stage" : `${m.title} · bring it back to the stage`} onPointerDown={down} onClick={(e) => e.stopPropagation()}>
      <span className="st-tmk"><Mark kind={m.kind} /></span>
      <span className="st-tw"><span className="st-tt">{m.title || SAY[m.kind] || m.kind}</span>{row && <span className="st-ts">{SAY[m.kind] ?? m.kind}{m.own ? "" : " · made in another session"}</span>}</span>
    </div>
  );
}

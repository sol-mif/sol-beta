// Over every view, with cross on (#1031): the undo pill for the last thing the hand did (a ring that drains over
// LIFE.scar, the stage's own undo ring, kit/feel.ts), a refusal's line, and the folder shelf a stage block is dropped on.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { GLYPH_UNDO, LIFE, RING } from "../kit/feel";
import { enter } from "../motion";
import { carryOver, onCarryOver } from "../stage/carry";
import { forgetLast, seatSession, useCrossState } from "./store";
import { onShelf, shelfOpen, whenSessionSeated } from "./shelf";
import { folderName, homeFolders, shelfFromRecord, useHomeFolders, type Folder, type Wire } from "./folders";

// #1045: a session of Build's side let go on a folder of the shelf is seated there (shelf.ts hears the side's own drag)
whenSessionSeated((s, place) => { seatSession(s, { id: place, name: folderName(place) }); });

function Undo() {
  const s = useCrossState();
  const last = s.last;
  useEffect(() => { if (!last) return; const t = window.setTimeout(forgetLast, LIFE.scar); return () => window.clearTimeout(t); }, [last?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (el.current && last) enter(el.current, { y: 14 }); }, [last?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!last && !s.refused) return null;
  const c = 2 * Math.PI * (RING.r - 4);
  return (
    <div ref={el} className="cross-undo" role="status" data-cross-undo>
      {last ? <>
        <span>{last.line}</span>
        <button type="button" className="cross-ring" aria-label="undo" title="undo" onClick={() => { last.undo(); forgetLast(); }}>
          <svg viewBox="0 0 44 44" width="30" height="30" aria-hidden="true">
            <circle cx="22" cy="22" r={RING.r - 4} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
            <circle key={last.key} className="cross-drain" cx="22" cy="22" r={RING.r - 4} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={c} style={{ animationDuration: `${LIFE.scar}ms`, ["--c" as string]: c }} transform="rotate(-90 22 22)" />
            <g transform="translate(13 13)" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">{GLYPH_UNDO.map((d) => <path key={d} d={d} />)}</g>
          </svg>
        </button>
      </> : <span className="cross-refused">{s.refused}</span>}
    </div>
  );
}

// #1045: the shelf offers the person's folders, as Home draws them (the record's areas, cross/folders.ts, #1223)
function Shelf() {
  const open = useSyncExternalStore(onShelf, shelfOpen);
  const list = useHomeFolders();
  if (!open) return null;
  return <ShelfOf list={list} />;
}
function ShelfOf({ list }: { list: Folder[] }) {
  const over = useSyncExternalStore(onCarryOver, carryOver);
  const [top, setTop] = useState(120);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const h = document.querySelector<HTMLElement>('.spine [data-view="home"]')?.getBoundingClientRect();
    if (h) setTop(Math.max(12, h.top - 8));
    box.current?.querySelectorAll<HTMLElement>(".cross-shelf-f").forEach((el, i) => enter(el, { x: -28, delay: i * 26 }));
  }, []);
  return (
    <div ref={box} className="cross-shelf" style={{ top }} data-cross-shelf aria-label="Home's folders: let go on one">
      <div className="cross-shelf-h">put it in Home</div>
      {list.map((p) => (
        <div key={p.id} className={`cross-shelf-f ${over === `home:${p.id}` ? "over" : ""} ${p.parent ? "kid" : ""}`} data-cross-place={p.id}>
          <i aria-hidden="true" /><span>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// #1502: OneHome, which tells the shelf its folders, mounts only on Home; with cross on this layer is always there, so
// it reads the record once when the shelf has none yet (a window that opened in Build)
export function CrossLayer({ e }: { e: Wire }) {
  useEffect(() => { if (e.up && !homeFolders().length) void shelfFromRecord(e); }, [e.up]);   // eslint-disable-line react-hooks/exhaustive-deps -- once the engine is up
  return <><Shelf /><Undo /></>;
}

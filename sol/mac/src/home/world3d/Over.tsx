// Home's world (#1093): the only things the face lays over the scene, on the kit. Three counts (a dot and a number
// each, never a sentence; a zero is absent), and the two buttons on a pressed sticky (its name, the line it asks when
// it asks, `do it` and `done`), which follow the sticky by world.where(id). The styles: world3d.scene.css.
// The designer's file (n13): written for the builder to lift; not yet run in the face.
import { useEffect, useRef } from "react";
import { Button } from "../../kit";

export function Counts({ run, ask, done, offline, onGo }: { run: number; ask: number; done: number; offline?: boolean; onGo: (k: "run" | "ask" | "done") => void }) {
  const said = { run: `${run} working`, ask: `${ask} ${ask === 1 ? "wants" : "want"} you`, done: `${done} done today` };
  return (
    <div className="w3-counts">
      {(["run", "ask", "done"] as const).map((k) => ({ run, ask, done })[k] > 0 && (
        <button type="button" key={k} className={`w3-count ${k}`} aria-label={said[k]} title={said[k]} onClick={() => onGo(k)}><i />{{ run, ask, done }[k]}</button>
      ))}
      {offline && <span className="w3-off">not connected</span>}
    </div>
  );
}

/** the buttons on a sticky; `where` is world.where, asked every frame so they ride the tile while it moves.
 *  Tell the scene while they are up: world.acts(id) on show, world.acts(null) on hide (names behind them hide). */
export function Acts({ id, name, asks, where, onDo, onDone }: { id: string; name: string; asks?: string; where: (id: string) => { x: number; y: number } | null; onDo: () => void; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); const p = where(id), box = el.current?.parentElement?.getBoundingClientRect(); if (p && box && el.current) el.current.style.transform = `translate(${Math.round(p.x - box.left)}px, ${Math.round(p.y - box.top)}px)`; };
    tick(); return () => cancelAnimationFrame(raf);
  }, [id, where]);
  return (
    <div className="w3-acts" ref={el}>
      <div>
        <span className="name">{name}</span>
        {asks && <span className="asks">{asks}</span>}
        <div className="row">
          <Button h={32} acts onClick={onDo}>do it</Button>
          <Button h={32} flat onClick={onDone}>done</Button>
        </div>
      </div>
    </div>
  );
}

/** the one button on a folder that is not set up yet (its figure stands unlit): it rides the figure by world.where(id).
 *  Pressed: Home's own set-up of that folder, the same place a second press on the figure goes. No name here: the
 *  folder's name already stands under its foot. */
export function Plot({ id, where, onSetUp }: { id: string; where: (id: string) => { x: number; y: number } | null; onSetUp: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); const p = where(id), box = el.current?.parentElement?.getBoundingClientRect(); if (p && box && el.current) el.current.style.transform = `translate(${Math.round(p.x - box.left)}px, ${Math.round(p.y - box.top)}px)`; };
    tick(); return () => cancelAnimationFrame(raf);
  }, [id, where]);
  return (
    <div className="w3-acts" ref={el}>
      <div><div className="row"><Button h={32} acts onClick={onSetUp}>set up</Button></div></div>
    </div>
  );
}

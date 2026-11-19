// A wall window's room (#1090, design NOW 03:00 #2, #3): the blocks alone, no side, no talk. One block alone is the page
// (`.one`, wall.css: no frame, its head only for a hand, the reading type in one centred column); two or more are
// framed as on any stage. The count is the share's own (what this window draws open), kept current by its subscription.
// The jelly crosses to what waits: while a block drawn here waits on the person, the one jelly is here, seated by it by
// the stage's own rule (useJelly sitBy), and the window with the talk shows none (html[data-jelly-away] there). Answered,
// or the block gone, it is home again over there. It never comes for a block that is only working.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Stage } from "../stage/Stage";
import { useJelly } from "../stage/useJelly";
import { JellyLayer } from "../Body";
import type { StageStore } from "../stage/store";
import { tellJelly, useScreens, ME, myScreen } from "./store";
import { edgeToward, otherWins } from "./model";
import "./wall.css";

export function Wall({ store, session, busy }: { store: StageStore; session: string; busy: boolean }) {
  const open = useSyncExternalStore((f) => store.subscribe(session, f), () => store.read(session).stage.blocks.filter((p) => !p.folded && !p.popped).length);
  const waits = useSyncExternalStore((f) => store.subscribe(session, f), () => {
    const s = store.read(session);
    return s.blocks.some((b) => b.state === "waits" && s.stage.blocks.some((p) => p.id === b.id && !p.folded));
  });
  useEffect(() => { tellJelly(waits); return () => { tellJelly(false); }; }, [waits]);
  // the flight (design NOW 03:58 #2): its home on this wall is a point on the seam toward the window with the talk, at
  // the height of the block that waits; it comes out of the seam there, sits by the block, and goes back the same way
  // before it is gone (`away` holds it drawn until it is home)
  const l = useScreens();
  const talk = otherWins(l.s, ME).find((w) => w.role === "whole" || w.role === "stage");
  const edge = talk ? edgeToward(ME, l.s.home, myScreen(), talk) : "left";
  const [away, setAway] = useState(false);
  const fresh = useRef(false), spotId = useRef("");
  const box = useRef<HTMLDivElement>(null), rest = useRef<HTMLSpanElement>(null);
  const jelly = useJelly(box, rest);
  // it comes to sit by the block that waits (its place on this wall), and again whenever that place changes
  const spot = useSyncExternalStore((f) => store.subscribe(session, f), () => {
    const s = store.read(session), w = s.blocks.find((b) => b.state === "waits"), p = w && s.stage.blocks.find((x) => x.id === w.id && !x.folded);
    return p ? `${p.id},${p.x},${p.y},${p.w},${p.h}` : "";
  });
  /** the jelly's home here, set on the seam at the height of the waiting block's head as drawn here (its own layout,
   *  not the engine's nominal place): where it comes out, and where it goes back in */
  const seamAt = () => {
    const el = box.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(spotId.current)}"] .st-head`), bx = box.current?.getBoundingClientRect();
    if (!el || !bx || !rest.current) return;
    const r = el.getBoundingClientRect();
    if (edge === "left" || edge === "right") rest.current.style.top = `${r.top - bx.top + r.height / 2}px`;
    else rest.current.style.left = `${r.left - bx.left + r.width / 2}px`;
  };
  const last = useRef<number[] | null>(null);
  if (spot) { const [id, ...n] = spot.split(","); spotId.current = id; last.current = n.map(Number); }
  useEffect(() => {
    if (waits) { setAway(true); fresh.current = true; return; }   // it comes out of the seam once the block is laid here
    if (!away) return;
    let gone = false;
    seamAt();
    void jelly.home().then(() => { if (!gone) setAway(false); });
    const t = window.setTimeout(() => setAway(false), 1500);   // never left drawn if the move does not end
    return () => { gone = true; window.clearTimeout(t); };
  }, [waits]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!spot) return;
    const [x0, y0, w0, h0] = spot.split(",").slice(1).map(Number);
    const t = window.setTimeout(() => {   // after the stage has laid it
      // the block as this wall draws it (its own layout, not the engine's nominal place): the jelly sits by that, so it
      // never covers the block beside it (design NOW 06:19 #3a)
      const el = box.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(spotId.current)}"]`), bx = box.current?.getBoundingClientRect();
      const r = el && bx ? el.getBoundingClientRect() : null;
      const [x, y, w, h] = r && bx && r.width > 0 ? [r.left - bx.left, r.top - bx.top, r.width, r.height] : [x0, y0, w0, h0];
      if (fresh.current) {
        // the first time: out of the seam at the height of the block's head as drawn here (its own layout, not the
        // engine's nominal place), then across to it
        fresh.current = false;
        seamAt();
        jelly.jump();
        requestAnimationFrame(() => { void jelly.sitBy({ x, y, w, h }); });
        return;
      }
      void jelly.sitBy({ x, y, w, h });
    }, 120);
    return () => window.clearTimeout(t);
  }, [spot]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = last.current, mid = b ? b[1] + Math.min(b[3], 48) / 2 : 0;
  const restAt: CSSProperties = edge === "right" ? { left: "100%", top: mid, right: "auto", bottom: "auto" }
    : edge === "top" ? { top: 0, left: b ? b[0] + b[2] / 2 : "50%", right: "auto", bottom: "auto" }
    : edge === "bottom" ? { top: "100%", left: b ? b[0] + b[2] / 2 : "50%", right: "auto", bottom: "auto" }
    : { left: 0, top: mid, right: "auto", bottom: "auto" };
  // one stage for the wall's life: the jelly joins it while a block waits, and leaves, without the stage drawn again
  return (
    <div className={`sc-wall ${open === 1 ? "one" : ""}`} data-part="the wall">
      <div className="sc-wallbox" ref={box}>
        <Stage store={store} session={session} by="you" active busy={busy} jelly={waits || away ? jelly : undefined} />
        <span ref={rest} className="st-home sc-wallrest" style={restAt} aria-hidden />
        {(waits || away) && <JellyLayer {...jelly.layer} />}
      </div>
    </div>
  );
}

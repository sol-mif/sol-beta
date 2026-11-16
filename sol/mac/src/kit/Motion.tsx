// The kit's motion part (#763): the five springs side by side, each a block crossing its lane on its own spring, a
// lane the hand drives (the block follows the pointer at once and settles home on release), and the slow ×4 switch.
// Everything here is motion.ts: the springs by name, the durations by dur(), the switch is setSlow. Slow makes every
// lane four times slower; the hand lane's follow never slows (its settle on release does). The hand's block stays
// under the pointer while the pointer is in its lane or up to REACH (8 px) past either end; further out it waits at
// that edge. Slow lasts for this tab only (motion.ts keeps it in sessionStorage).
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { CFG, Spring, dur, isSlow, onSlow, setSlow, type SpringName, type Timed } from "../motion";
import { Button, Pill } from "./index";
import { dim, label, on } from "./paint";

const NAMES: SpringName[] = ["lift", "settle", "travel", "fade", "glide"];
const LANE = 84, BLOCK = 24, GO = LANE - BLOCK, REACH = 8;
const TIMED: Timed[] = ["reveal", "turn", "glass", "pour", "breath", "lag"];

/** one lane: a block on a track, moved by its spring (the hand's lane: by the pointer, settling home on release) */
function Lane({ name, at }: { name: SpringName | "hand"; at: boolean }) {
  const block = useRef<HTMLDivElement>(null), sp = useRef<Spring | null>(null), grab = useRef<number | null>(null);
  if (!sp.current) sp.current = new Spring(0, name === "hand" ? CFG.settle : CFG[name], (v) => { if (block.current) block.current.style.translate = `${v}px 0`; });
  useEffect(() => { if (name !== "hand") sp.current!.to(at ? GO : 0); }, [at, name]);
  useEffect(() => () => sp.current?.stop(), []);
  // grabbed: the spring stops where the block is (a settle still running home never carries on under the finger)
  const down = (e: RPointerEvent) => { if (name !== "hand") return; (e.target as Element).setPointerCapture(e.pointerId); sp.current!.set(sp.current!.v); grab.current = e.clientX - sp.current!.v; };
  // the hand: at once, never slowed; held inside its lane, up to REACH past either end (past that it stops at the edge)
  const move = (e: RPointerEvent) => { if (grab.current !== null) sp.current!.set(Math.max(-REACH, Math.min(GO + REACH, e.clientX - grab.current))); };
  const up = () => { if (grab.current === null) return; grab.current = null; sp.current!.to(0); };   // released: it settles home
  const k = name === "hand" ? `at once, in its lane ±${REACH}` : `k ${CFG[name].k} · c ${CFG[name].c}`;
  return (
    <div data-lane={name} style={{ width: LANE }}>
      <div style={{ position: "relative", width: LANE, height: BLOCK, borderRadius: 6, background: on(0.04) }}>
        <div ref={block} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ position: "absolute", left: 0, top: 0, width: BLOCK, height: BLOCK, borderRadius: 6, background: on(name === "hand" ? 0.55 : 0.82), cursor: name === "hand" ? "grab" : "default", touchAction: "none" }} />
      </div>
      <div style={{ ...label, marginTop: 6, color: dim }}>{name}</div>
      <div style={{ ...label }}>{k}</div>
    </div>
  );
}

/** the motion part of the kit stage, at (x, y) */
export function MotionPart({ x, y, w }: { x: number; y: number; w: number }) {
  const [slow, setS] = useState(isSlow()), [at, setAt] = useState(false);
  useEffect(() => onSlow(() => setS(isSlow())), []);
  const timed = TIMED.map((n) => `${n} ${dur(n)}`).join(" · ");
  return (
    <section data-kit="motion" data-slow={slow ? "4" : "1"} style={{ position: "absolute", left: x, top: y, width: w }}>
      <div style={{ ...label, marginBottom: 10 }}>motion, the five springs and the hand · {timed}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {NAMES.map((n) => <Lane key={n} name={n} at={at} />)}
        <Lane name="hand" at={false} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Button h={24} label="play" onClick={() => setAt((a) => !a)}>{at ? "back" : "play"}</Button>
          <Pill h={24} words={["×1", "slow ×4"]} picked={slow ? 1 : 0} onPick={(i) => setSlow(i === 1)} />
        </div>
      </div>
    </section>
  );
}

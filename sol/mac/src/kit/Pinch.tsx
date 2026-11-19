// Pinch (#692, tactile.html): two fingers together on the trackpad, or ⌘ and the wheel, shrink a made thing to its short
// version; apart (or the wheel the other way) bring the long one back. Both versions are real text: the short one is a
// state of the same object, never a summary beside it. On the Mac's webview a pinch comes as gesture events, in a
// browser as a wheel with ctrl held; both are read. A double-click turns it too, for a mouse without a wheel.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { dur } from "../motion";
import { label } from "./paint";
import "./moves.css";

/** how much wheel makes a pinch (a trackpad's pinch sends many small deltas; a mouse wheel's notch is ~100) */
const WHEEL = 60;

export function Pinch({ long, short, pinched: held, onPinch, hint = true }: {
  long: ReactNode; short: ReactNode | null;
  /** held from outside; left out, it keeps its own */
  pinched?: boolean;
  /** pinched or spread by the hand: with no short version yet, the one who mounts it asks for one */
  onPinch?: (pinched: boolean) => void;
  /** the line under it: "pinched · spread to read all" */
  hint?: boolean;
}) {
  const [own, setOwn] = useState(false), pinched = held ?? own;
  const box = useRef<HTMLDivElement>(null), face = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  const acc = useRef(0);
  const set = (v: boolean) => { if (v === pinched) return; acc.current = 0; setOwn(v); onPinch?.(v); };
  const showing = pinched && short ? "short" : "long";
  // the box clips only while it eases between the two heights, so a card opened inside it (a doubt's) is never cut
  const [moving, setMoving] = useState(false), first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setMoving(true); const t = setTimeout(() => setMoving(false), dur("pour")); return () => clearTimeout(t); }, [showing]);
  useLayoutEffect(() => {
    const f = face.current; if (!f) return;
    const take = () => setH(f.offsetHeight);
    take();
    const ro = new ResizeObserver(take); ro.observe(f);
    return () => ro.disconnect();
  }, [showing]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const wheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      acc.current = Math.max(-2 * WHEEL, Math.min(2 * WHEEL, acc.current + ev.deltaY));
      if (acc.current > WHEEL) set(true); else if (acc.current < -WHEEL) set(false);
    };
    type G = Event & { scale: number };
    const gest = (ev: Event) => { ev.preventDefault(); const s = (ev as G).scale; if (s < 0.8) set(true); else if (s > 1.25) set(false); };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("gesturechange", gest as EventListener);
    el.addEventListener("gesturestart", (e) => e.preventDefault());
    return () => { el.removeEventListener("wheel", wheel); el.removeEventListener("gesturechange", gest as EventListener); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pinch" data-pinch data-pinched={pinched} data-showing={showing} onDoubleClick={() => set(!pinched)}>
      <div ref={box} className="pinch-box" style={{ position: "relative", zIndex: 1, height: h, overflow: moving ? "hidden" : "visible" }} onTransitionEnd={() => setMoving(false)}>
        <div ref={face} key={showing} className="pinch-face" data-pinch-face={showing}>{showing === "short" ? short : long}</div>
      </div>
      {hint && <div style={{ ...label, marginTop: 6 }} data-pinch-hint>{pinched ? (short ? "pinched · spread, or ⌘ and the wheel up, to read it all" : "pinching…") : "pinch, or ⌘ and the wheel down, for the short version"}</div>}
    </div>
  );
}

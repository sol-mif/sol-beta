// The lamp (Marco 2026-11-07, side-mechanics.html): one soft light that follows the pointer between the side's rows on
// its own spring (lift: quick, no bounce), instead of each row lighting itself. It fades when the pointer leaves.
import { useRef } from "react";
import { CFG, useSpring } from "../motion";

const LAMP = { ...CFG.lift, eps: 0.002 };   // quick, no bounce: lift, the fastest of the five (motion.ts, #763)
export function useLamp() {
  const ref = useRef<HTMLDivElement>(null);
  const lit = useRef(false);
  const y = useSpring(0, LAMP, (v) => { const el = ref.current; if (el) el.style.transform = `translateY(${v}px)`; });
  const move = (ev: React.PointerEvent) => {
    const row = (ev.target as Element).closest<HTMLElement>(".hc-row, .hc-fhead, .hc-head");
    const el = ref.current;
    if (!row || !el || row.classList.contains("on")) { if (el && lit.current) { el.style.opacity = "0"; lit.current = false; } return; }
    const top = row.offsetTop;
    if (!lit.current) { y.set(top); el.style.opacity = "1"; lit.current = true; } else y.to(top);
  };
  const leave = () => { const el = ref.current; if (el) el.style.opacity = "0"; lit.current = false; };
  return { ref, move, leave };
}

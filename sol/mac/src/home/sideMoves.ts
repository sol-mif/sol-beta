// The side's rows are seen moving (2026-11-11, Marco: "calm yet alive ... micro interactions"): when the list is drawn
// again and a row sits somewhere else, it travels there from where it was; a row that is new arrives; a row that rises
// to "needs you" glows once as it lands. So a change in the list is something you watch happen, never a jump you have
// to read again. Off with Build settings › sidebar › motion, and with the system's reduce-motion.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { dur, ease } from "../motion";

// a travel: a reveal and a turn long (280 ms), on the reveal curve; the needs-you glow fades out over nearly 9 turns (1400 ms)
const MOVE = () => ({ duration: dur("reveal") + dur("turn"), easing: ease("reveal") });
const GLOW = () => ({ duration: dur("turn") * 8.75, easing: ease("arrive") });
const MANY = 30;   // more rows than this moving at once is a new list (a fold, a sort), not a change: it is drawn in place
const calm = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; } };

/** `scene` names what the list is (its sort, wide or not): a new scene is drawn in place, never animated */
export function useMoves(box: RefObject<HTMLElement | null>, on: boolean, scene: string) {
  const was = useRef({ scene: "", at: new Map<string, { y: number; sec: string }>() });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const now = new Map<string, { y: number; sec: string }>(), els = new Map<string, HTMLElement>();
    el.querySelectorAll<HTMLElement>("[data-sid]").forEach((r) => {
      const sid = r.dataset.sid!;
      const y = r.getBoundingClientRect().top + (r.closest<HTMLElement>(".hc-list, .hc-done")?.scrollTop ?? 0);
      now.set(sid, { y, sec: r.dataset.sec ?? "" }); els.set(sid, r);
    });
    const before = was.current;
    was.current = { scene, at: now };
    if (!on || calm() || before.scene !== scene || !before.at.size) return;
    const moved = [...now].filter(([sid, n]) => { const b = before.at.get(sid); return !b || Math.abs(b.y - n.y) > 1; });
    if (moved.length > MANY) return;
    for (const [sid, n] of moved) {
      const r = els.get(sid)!, b = before.at.get(sid);
      if (!b) { r.animate([{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }], MOVE()); continue; }
      r.animate([{ translate: `0 ${b.y - n.y}px` }, { translate: "0 0" }], MOVE());
      if (n.sec === "needs" && b.sec !== "needs")
        r.animate([{ backgroundColor: "color-mix(in srgb, currentColor 18%, transparent)", borderRadius: "12px" }, { backgroundColor: "transparent", borderRadius: "12px" }], GLOW());
    }
  });
}

const PAUSE = 20_000;   // a session between two steps is still at work: its row holds this long after it last ran
/** the sessions that keep their place among the active ones though they are not running this instant: one that ran in
 *  the last PAUSE (so a pause between steps never moves its row), and the one you are in, once it has run, until you
 *  leave it (you are looking at it: it does not walk away under you) */
export function useHeld<S extends { id: string }>(sessions: S[], st: (s: S) => string, live: string | null): Set<string> {
  const ran = useRef(new Map<string, number>()), [, tick] = useState(0);
  const now = Date.now(), held = new Set<string>();
  for (const s of sessions) if (st(s) === "running") ran.current.set(s.id, now);
  let soonest = Infinity;
  for (const [id, t] of ran.current) {
    if (id === live) { held.add(id); continue; }
    if (now - t < PAUSE) { held.add(id); soonest = Math.min(soonest, t + PAUSE - now); }
    else ran.current.delete(id);
  }
  useEffect(() => { if (soonest === Infinity) return; const h = setTimeout(() => tick((n) => n + 1), soonest + 50); return () => clearTimeout(h); }, [soonest]);
  return held;
}

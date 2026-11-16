// Motion for an undo (#778, #751 B15): ⌘Z and ⇧⌘Z animate back (feel.md "undo stack"). Each block that moves travels
// from where it shows to its snapshot's place on spring.travel (as transforms, outside React, clamped like b10's hand);
// when all rest, the stage commits in one flushSync and the transforms clear in the same task. A close fades out and
// scales to .97 on spring.fade; a block brought back fades in. Rect sizes change at the commit (a resize undone).
import { flushSync } from "react-dom";
import { Spring } from "../motion.ts";
import { SPRING } from "../kit/feel.ts";
import type { Rect } from "./model.ts";
import { clampOver } from "./hand.ts";

const clear = (el: HTMLElement) => { el.style.transform = ""; el.style.opacity = ""; };

/** the blocks in `to` travel from `from` to it; then commit() runs inside flushSync, and after() once it has rendered */
export function travel(moves: { el: HTMLElement; from: Rect; to: Rect }[], commit: () => void, after?: () => void): void {
  if (!moves.length) { flushSync(commit); after?.(); return; }
  let left = moves.length * 2;
  const rested = () => { if (--left > 0) return; flushSync(commit); moves.forEach((m) => clear(m.el)); after?.(); };
  for (const m of moves) {
    const p = { dx: 0, dy: 0 };
    const write = () => { m.el.style.transform = `translate(${p.dx}px, ${p.dy}px)`; };
    for (const ax of ["x", "y"] as const) {
      const span = m.to[ax] - m.from[ax];
      const start = 0;
      const s = new Spring(0, SPRING.travel, (v, sp) => { const c = clampOver(v, sp.vel, sp.target, start); sp.v = c.v; sp.vel = c.vel; if (ax === "x") p.dx = c.v; else p.dy = c.v; write(); }, rested);
      s.to(span);
    }
  }
}

/** a close: opacity to 0 and scale to .97 on spring.fade, then done() */
export function fadeOut(el: HTMLElement, done: () => void): void {
  let o = 1, sc = 1, left = 2;
  const write = () => { el.style.opacity = String(o); el.style.transform = `scale(${sc})`; };
  const rest = () => { if (--left === 0) done(); };
  new Spring(1, SPRING.fade, (v) => { o = v; write(); }, rest).to(0);
  new Spring(1, SPRING.fade, (v) => { sc = v; write(); }, rest).to(0.97);
}

/** a block brought back: from nothing to itself on spring.fade */
export function fadeIn(el: HTMLElement): void {
  let o = 0, sc = 0.97, left = 2;
  const write = () => { el.style.opacity = String(o); el.style.transform = `scale(${sc})`; };
  write();
  const rest = () => { if (--left === 0) clear(el); };
  new Spring(0, SPRING.fade, (v) => { o = v; write(); }, rest).to(1);
  new Spring(0.97, SPRING.fade, (v) => { sc = v; write(); }, rest).to(1);
}

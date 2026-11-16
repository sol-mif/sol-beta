// The fold flight and its way back (#779, #751 B16; trayFold.ts has the arithmetic). Fold: the block flies by translate and
// one uniform scale into its square on spring.travel, at z 400 (a flight), and fades from 140 ms on spring.fade; when
// it rests, done() commits the fold. Unfold: the block, already at its place, starts as its small copy (opacity .2)
// and travels back to itself. Outside React, as transforms; cleared when they rest.
import { Spring } from "../motion.ts";
import { SPRING, TRAY, Z } from "../kit/feel.ts";
import type { Rect } from "./model.ts";
import { flight, unflight, type Fly } from "./trayFold.ts";

const paint = (el: HTMLElement, f: Fly, o: number) => { el.style.transform = `translate(${f.dx}px, ${f.dy}px) scale(${f.s})`; el.style.opacity = String(o); };
export const unpaint = (el: HTMLElement) => { el.style.transform = ""; el.style.opacity = ""; el.style.transformOrigin = ""; el.style.zIndex = ""; };

export function flyToTray(el: HTMLElement, from: Rect, square: Rect, done: () => void): void {
  const to = flight(from, square), now: Fly = { dx: 0, dy: 0, s: 1 };
  let o = 1, left = 3;
  el.style.transformOrigin = "0 0";
  el.style.zIndex = String(Z.flight);
  const rest = () => { if (--left === 0) done(); };
  new Spring(0, SPRING.travel, (v) => { now.dx = v; paint(el, now, o); }, rest).to(to.dx);
  new Spring(0, SPRING.travel, (v) => { now.dy = v; paint(el, now, o); }, rest).to(to.dy);
  new Spring(1, SPRING.travel, (v) => { now.s = Math.max(to.s, v); paint(el, now, o); }, rest).to(to.s);
  setTimeout(() => new Spring(1, SPRING.fade, (v) => { o = Math.max(0, v); paint(el, now, o); }).to(0), TRAY.fadeFrom);
}

export function flyFromTray(el: HTMLElement, copy: Rect, to: Rect, done?: () => void): void {
  const now = unflight(copy, to);
  let o: number = TRAY.from, left = 4;
  el.style.transformOrigin = "0 0";
  el.style.zIndex = String(Z.flight);
  paint(el, now, o);
  const rest = () => { if (--left > 0) return; unpaint(el); done?.(); };
  new Spring(now.dx, SPRING.travel, (v) => { now.dx = v; paint(el, now, o); }, rest).to(0);
  new Spring(now.dy, SPRING.travel, (v) => { now.dy = v; paint(el, now, o); }, rest).to(0);
  new Spring(now.s, SPRING.travel, (v) => { now.s = Math.min(1, v); paint(el, now, o); }, rest).to(1);
  new Spring(o, SPRING.fade, (v) => { o = Math.min(1, v); paint(el, now, o); }, rest).to(1);
}

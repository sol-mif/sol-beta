// Motion for the talk full (#788, #751 B25; footRow.ts has the arithmetic): each block travels to its foot-row copy and
// back on spring.travel, as a transform outside React; a flight can be turned round midway (it starts from where it
// shows). Back at itself, the transform clears.
import { Spring } from "../motion.ts";
import { SPRING } from "../kit/feel.ts";
import type { Fly } from "./trayFold.ts";
import "./talkfull.css";

const ID: Fly = { dx: 0, dy: 0, s: 1 };
const live = new WeakMap<HTMLElement, { now: Fly; springs: Spring[] }>();
const paint = (el: HTMLElement, f: Fly) => { el.style.transform = f.dx || f.dy || f.s !== 1 ? `translate(${f.dx}px, ${f.dy}px) scale(${f.s})` : ""; };

/** fly a block to `to` (ID: back to itself); done once it rests */
export function footFly(el: HTMLElement, to: Fly, done?: () => void): void {
  const was = live.get(el);
  was?.springs.forEach((s) => s.stop());
  const now: Fly = { ...(was?.now ?? ID) };
  el.style.transformOrigin = "0 0";
  let left = 3;
  const rest = () => {
    if (--left > 0) return;
    if (to === ID || (to.dx === 0 && to.dy === 0 && to.s === 1)) { live.delete(el); el.style.transform = ""; el.style.transformOrigin = ""; delete el.dataset.foot; }
    done?.();
  };
  const springs = (["dx", "dy", "s"] as const).map((k) => new Spring(now[k], SPRING.travel, (v) => { now[k] = v; paint(el, now); }, rest));
  live.set(el, { now, springs });
  if (to !== ID) el.dataset.foot = "";
  springs[0].to(to.dx); springs[1].to(to.dy); springs[2].to(to.s);
}
export const footBack = (el: HTMLElement, done?: () => void) => footFly(el, ID, done);
/** whether a block is in the foot row (or on its way) */
export const inFoot = (el: HTMLElement) => live.has(el);

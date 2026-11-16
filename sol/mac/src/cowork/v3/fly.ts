// The crossing's motion (the prototype's core.js fly / flyFrom / pulse, on Web Animations): a copy of the card flies on
// an arc into its project's row in the sidebar and shrinks onto it; Undo flies it back out. The card itself is never
// moved. Reduced motion: no flight, the row still pulses once.
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const SIO = "cubic-bezier(.45,0,.2,1)", IN = "cubic-bezier(.55,0,.75,.2)", OUT = "cubic-bezier(.16,1,.3,1)", BACK = "cubic-bezier(.34,1.56,.64,1)";
const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function copyAt(el: HTMLElement, r: DOMRect) {
  const outer = document.createElement("div");
  outer.className = "v3-fly";
  Object.assign(outer.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  const inner = document.createElement("div");
  inner.className = "v3-fly-in";
  const c = el.cloneNode(true) as HTMLElement;
  c.style.visibility = "";
  inner.appendChild(c); outer.appendChild(inner); document.body.appendChild(outer);
  return { outer, inner };
}
const done = (a: Animation) => a.finished.catch(() => undefined);

/** a copy of el flies into target; resolves when it has landed */
export async function fly(el: HTMLElement | null, target: Element | null, dur = 820): Promise<void> {
  if (!el || !target || reduced() || !el.animate) return;
  const r = el.getBoundingClientRect(), t = target.getBoundingClientRect();
  const { outer, inner } = copyAt(el, r);
  const a = centre(r), b = centre(t), s = Math.max(0.03, Math.min(t.width / r.width, t.height / r.height));
  await Promise.all([
    done(outer.animate([{ transform: "translateX(0)" }, { transform: `translateX(${b.x - a.x}px)` }], { duration: dur, easing: SIO, fill: "forwards" })),
    done(inner.animate([{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${b.y - a.y}px) scale(${s})` }], { duration: dur, easing: IN, fill: "forwards" })),
  ]);
  await done(outer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }));
  outer.remove();
}
/** a copy of el grows out of source and lands on el; el is hidden until it lands */
export async function flyFrom(source: Element | null, el: HTMLElement | null, dur = 720): Promise<void> {
  if (!el || !source || reduced() || !el.animate) return;
  const r = el.getBoundingClientRect(), t = source.getBoundingClientRect();
  el.style.visibility = "hidden";
  const { outer, inner } = copyAt(el, r);
  const a = centre(r), b = centre(t), s = Math.max(0.03, Math.min(t.width / r.width, t.height / r.height));
  await Promise.all([
    done(outer.animate([{ transform: `translateX(${b.x - a.x}px)` }, { transform: "translateX(0)" }], { duration: dur, easing: SIO, fill: "forwards" })),
    done(inner.animate([{ transform: `translateY(${b.y - a.y}px) scale(${s})` }, { transform: "translateY(0) scale(1)" }], { duration: dur, easing: OUT, fill: "forwards" })),
  ]);
  el.style.visibility = "";
  outer.remove();
}
export function pulse(el: Element | null) {
  if (!el || !(el as HTMLElement).animate || reduced()) return;
  (el as HTMLElement).animate([{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.25 }, { transform: "scale(1)" }], { duration: 700, easing: BACK });
}
/** something enters: up from 8 px below, the face's one exception to "never a fade" being the card's own arrival */
export function rise(el: HTMLElement | null, delay = 0) {
  if (!el || !el.animate || reduced()) return;
  el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 450, delay, easing: OUT, fill: "backwards" });
}
/** where a project's things land: its fold in the sidebar (WorkSidebar's data-v3-room), else the sidebar itself */
export const landingOf = (room: string): Element | null =>
  document.querySelector(`[data-v3-room="${CSS.escape(room)}"] .v3-land`) ?? document.querySelector(`[data-v3-room="${CSS.escape(room)}"]`);

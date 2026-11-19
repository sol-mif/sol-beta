// The one place timing lives (#763, ui.md "Motion", build/feel.md "Tokens"). A spring solver and one frame loop for
// every running spring, the five springs and the timed tokens read from tokens.json (kit/tokens.ts), the ×4 slow
// toggle, and the helpers every surface uses (enter, press, slide pills, growTo, follow). Nothing else imports timing:
// a part asks for a spring by name (CFG.settle) and for a duration by name (dur("turn")); the css reads --d-<name>.
//
// The springs (mass 1, k stiffness, c damping), and the verbs that use them (ui.md's verb table):
//   settle  release, snap, resize, nudge, reopen        travel  comes forward, unfold, a side opening, a trade
//   glide   a flick's landing                           lift    press, grab, a stamp
//   fade    steps back, close, opacity
// A spring never passes its target by more than SPRING.clamp (4, in the value's own unit: px for a position) — the
// integrator clamps, and stops it there. The timed tokens: reveal 120 · turn 160 · glass 220 · pour (the body) 850 ·
// breath 4800 · lag 140.
//
// Slow (×4, the debug toggle): every spring steps at a quarter of real time, every duration is four times as long, in
// code (dur) and in the css (--d-<name> is rewritten on the root). Never the hand: Spring.set (a drag following the
// finger) writes at once, and lag (the drag follow) keeps its 140.
//
// Reduced motion: every spring jumps to its target. Springs write with `apply(value, spring)` each frame and once
// more at rest, stepped in 1/240 s sub-steps (semi-implicit Euler) so a slow frame cannot blow a stiff one up.
import { useEffect, useLayoutEffect, useRef } from "react";
import { EASE, SPRING, TIMED } from "./kit/tokens.ts";

export type SpringName = "settle" | "travel" | "glide" | "lift" | "fade";
/** a spring: one of the five by name (k, c from tokens.json), and the precision it rests at in its own unit */
/** clamp: how far past its target this one may pass (default CLAMP); the jelly's own material lifts it (Body.tsx, #872) */
export type Cfg = { readonly name: SpringName; readonly k: number; readonly c: number; eps?: number; clamp?: number };
const of = (name: SpringName): Cfg => Object.freeze({ name, k: SPRING[name].k, c: SPRING[name].c });
export const CFG = { settle: of("settle"), travel: of("travel"), glide: of("glide"), lift: of("lift"), fade: of("fade") } as const;
export const MASS = SPRING.mass, CLAMP = SPRING.clamp;
/** main's name for the same five (#936 landed them beside its old springs as SPRINGS); here they are CFG itself, so a
 *  part written on main reads the same springs */
export const SPRINGS = CFG;

// ---- the timed tokens ----
export type Timed = keyof typeof TIMED;
export type Ease = keyof typeof EASE;
/** a duration in ms, slowed with the toggle; lag (the drag follow) is the hand's and never slows */
export const dur = (name: Timed) => (name === "lag" ? TIMED.lag : TIMED[name] * factor);
/** a curve, as css writes it */
export const ease = (name: Ease) => EASE[name];

// ---- slow ×4 ----
let factor = 1;
const SLOW_KEY = "sol.motion.slow";
const slowSubs = new Set<() => void>();
/** the factor every spring and duration runs at: 1, or SPRING.slow while the toggle is on */
export const slowFactor = () => factor;
export const isSlow = () => factor !== 1;
/** the debug toggle: every motion four times slower, never the hand. Kept for this tab only (sessionStorage: the kit
 *  page's switch never reaches the app's window, and a new session starts at ×1), written to css */
export function setSlow(on: boolean) {
  const f = on ? SPRING.slow : 1;
  if (f === factor) return;
  clockBase = clock(); clockAt = realNow(); factor = f;
  try { if (on) sessionStorage.setItem(SLOW_KEY, "1"); else sessionStorage.removeItem(SLOW_KEY); } catch { /* no storage */ }
  writeCss();
  slowSubs.forEach((s) => s());
}
export function onSlow(cb: () => void) { slowSubs.add(cb); return () => { slowSubs.delete(cb); }; }
function writeCss() {
  if (typeof document === "undefined") return;
  const st = document.documentElement.style;
  for (const name of Object.keys(TIMED) as Timed[]) {
    if (name === "lag") continue;
    if (factor === 1) st.removeProperty(`--d-${name}`); else st.setProperty(`--d-${name}`, `${TIMED[name] * factor}ms`);
  }
}
const realNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
let clockBase = 0, clockAt = 0;
/** the motion clock in ms: real time divided by the slow factor (ambient drawing — the jelly's breath — reads this) */
export function clock() { return clockBase + (realNow() - clockAt) / factor; }
try { if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SLOW_KEY)) { factor = SPRING.slow; writeCss(); } } catch { /* no storage */ }

const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const reducedMotion = () => !!mq?.matches;

export class Spring {
  v: number; vel = 0; target: number; cfg: Cfg;
  at = 0;                 // frame time before which it waits (a stagger)
  on = false;
  /** the side it comes from (+1 above the target, −1 below): the clamp holds it on the far side within CLAMP */
  side = 0;
  private apply: (v: number, s: Spring) => void;
  rest?: () => void;
  constructor(v: number, cfg: Cfg, apply: (v: number, s: Spring) => void, rest?: () => void) {
    this.v = v; this.target = v; this.cfg = cfg; this.apply = apply; this.rest = rest;
  }
  /** Move toward `t`, keeping position and velocity. `vel` adds a kick; `delay` (ms, slowed) waits before it starts. */
  to(t: number, o: { vel?: number; delay?: number; cfg?: Cfg } = {}) {
    if (o.cfg) this.cfg = o.cfg;
    this.target = t;
    if (o.vel) this.vel += o.vel;
    if (reducedMotion()) { this.v = t; this.vel = 0; this.apply(this.v, this); this.rest?.(); this.stop(); return this; }
    this.side = Math.sign(this.v - t) || -Math.sign(this.vel);
    this.at = o.delay ? realNow() + o.delay * factor : 0;
    this.go();
    return this;
  }
  /** The hand: jump there, now, with no velocity (a drag follows the finger). Never slowed. */
  set(v: number, vel = 0) { this.v = v; this.target = v; this.vel = vel; this.side = 0; this.apply(v, this); return this; }
  kick(dv: number) { this.vel += dv; if (Math.abs(this.v - this.target) < 1e-9) this.side = -Math.sign(this.vel); this.go(); return this; }
  get resting() { return !this.on; }
  stop() { this.on = false; active.delete(this); }
  private go() { if (!this.on) { this.on = true; active.add(this); } wake(); }
  /** one step of `dt` seconds of motion time (the loop has already divided real time by the slow factor) */
  step(dt: number): boolean {
    const { k, c, eps = 0.01, clamp = CLAMP } = this.cfg;
    let left = dt;
    while (left > 1e-6) {
      const h = left > 1 / 240 ? 1 / 240 : left;
      this.vel += ((-(this.v - this.target) * k - c * this.vel) / MASS) * h;
      this.v += this.vel * h;
      // the clamp: past the target by more than CLAMP, it stops on the clamp's line
      if (this.side && (this.v - this.target) * this.side < -clamp) { this.v = this.target - this.side * clamp; this.vel = 0; }
      left -= h;
    }
    if (Math.abs(this.v - this.target) < eps && Math.abs(this.vel) < eps * 8) {
      this.v = this.target; this.vel = 0; this.on = false; this.apply(this.v, this); this.rest?.();
      return false;
    }
    this.apply(this.v, this);
    return true;
  }
}

const active = new Set<Spring>();
let raf = 0, last = 0, guard = 0;
function stepAll(dt: number, now: number) {
  for (const s of [...active]) {
    if (s.at && now < s.at) continue;
    s.at = 0;
    if (!s.step(dt / factor)) active.delete(s);
  }
}
/** step every running spring by `ms` of real time, as the loop would (tests; the page has the frame clock) */
export function advance(ms: number, frame = 1000 / 60) {
  let now = realNow(), left = ms;
  while (left > 1e-9 && active.size) { const h = Math.min(left, frame); now += h; stepAll(h / 1000, now); left -= h; }
}
/** how many springs are moving */
export const running = () => active.size;
function frame(now: number) {
  raf = -1;   // inside the frame: a wake from a spring's apply is this frame's (it used to schedule a second callback)
  const gap = now - last;
  const dt = Math.min(gap / 1000, 1 / 20);
  last = now;
  stepAll(dt, now);
  raf = 0;
  if (active.size) raf = requestAnimationFrame(frame); else stopGuard();
}
// The frame clock is WebKit's and it stops whenever WebKit holds the window to be out of sight (a display plugged or
// unplugged, a full-screen Space, the lid, sleep). A spring in flight then froze where it was: a moon left short
// with its discs half faded, the creature halfway from the wing (Marco's two shots, 2026-10-26). The guard is a
// plain timer: while any spring moves and no frame has come for 120 ms, it steps every spring up to the real time
// itself, so a motion always ends where it was told to go, seen or not.
// A silence is not always a stall: the page busy for a few hundred ms (a long render) silences the frames too, and
// stepping the whole silence then made every motion on screen leap to its end at once. So the guard carries on by one
// frame's worth per tick, as a slow frame does, and the motion goes on from where it was; only a window out of sight
// or a silence past a second (nobody saw it move) catches up whole.
const STALL = 1000;
function startGuard() {
  if (guard || typeof window === "undefined") return;
  guard = window.setInterval(() => {
    if (!active.size) { stopGuard(); return; }
    const now = performance.now(), silent = now - last;
    if (silent < 120) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const unseen = silent > STALL || (typeof document !== "undefined" && document.hidden);
    let left = unseen ? silent / 1000 : 1 / 20;
    while (left > 0 && active.size) { const h = Math.min(left, 1 / 20); stepAll(h, now); left -= h; }
    last = now;
    if (active.size) raf = requestAnimationFrame(frame); else stopGuard();
  }, 60);
}
function stopGuard() { if (guard) { window.clearInterval(guard); guard = 0; } }
function wake() {
  if (raf || typeof requestAnimationFrame === "undefined") return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
  startGuard();
}

export const spring = (v: number, cfg: Cfg, apply: (v: number, s: Spring) => void, rest?: () => void) => new Spring(v, cfg, apply, rest);

/** A spring owned by a component: stable across renders, stopped on unmount. `apply` may change every render. */
export function useSpring(init: number, cfg: Cfg, apply: (v: number, s: Spring) => void, rest?: () => void): Spring {
  const a = useRef(apply); a.current = apply;
  const r = useRef(rest); r.current = rest;
  const s = useRef<Spring | null>(null);
  if (!s.current) s.current = new Spring(init, cfg, (v, sp) => a.current(v, sp), () => r.current?.());
  useEffect(() => () => s.current?.stop(), []);
  return s.current;
}

// ---- enter: a thing arrives by sliding from an offset, springs home, no opacity ----
const entering = new WeakMap<HTMLElement, Spring>();
export function enter(el: HTMLElement, o: { x?: number; y?: number; delay?: number; cfg?: Cfg; scale?: number; kick?: number } = {}) {
  const { x = 0, y = 0, delay = 0, cfg = CFG.travel, scale = 0 } = o;
  entering.get(el)?.stop();
  if (reducedMotion()) { el.style.translate = ""; el.style.scale = ""; return null; }
  const put = (p: number) => {
    el.style.translate = `${x * (1 - p)}px ${y * (1 - p)}px`;
    if (scale) el.style.scale = String(1 - scale * (1 - p));
  };
  const s = new Spring(0, { ...cfg, eps: 0.002 }, (p, sp) => {
    if (sp.resting && Math.abs(p - 1) < 1e-4) { el.style.translate = ""; el.style.scale = ""; entering.delete(el); } else put(p);
  });
  entering.set(el, s);
  put(0);
  s.to(1, { delay, vel: o.kick });
  return s;
}
/** A list arriving: each child enters in turn. */
export function stagger(els: ArrayLike<Element>, o: { x?: number; y?: number; delay?: number; gap?: number; max?: number; cfg?: Cfg } = {}) {
  const n = Math.min(els.length, o.max ?? 9);
  for (let i = 0; i < n; i++) enter(els[i] as HTMLElement, { x: o.x, y: o.y, cfg: o.cfg, delay: (o.delay ?? 0) + i * (o.gap ?? 34) });
}
/** Run `fn` once when the element first mounts (before paint). */
export function useEnter(o: Parameters<typeof enter>[1] | false) {
  const ref = useRef<HTMLElement | null>(null);
  const opts = useRef(o); opts.current = o;
  useLayoutEffect(() => { if (ref.current && opts.current) enter(ref.current, opts.current); }, []);
  return ref as React.RefObject<never>;
}

// ---- press: every button and row gives under the finger and pops back past rest ----
// Delegated, so nothing else needs to know. Wide things move a few pixels, small keys a few percent.
const PRESS = "button, [role=button], [data-press], .row, .hrow, .vcard, .tab";
const held = new Map<HTMLElement, Spring>();
export function installPress() {
  if (typeof document === "undefined") return;
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || reducedMotion()) return;
    const el = (e.target as Element | null)?.closest?.(PRESS) as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled || el.dataset.nopress !== undefined) return;
    const w = el.offsetWidth || 40;
    const amt = Math.min(0.09, Math.max(0.014, 5 / w));
    let s = held.get(el);
    if (!s) {
      s = new Spring(0, { ...CFG.lift, eps: 0.003 }, (p, sp) => {
        if (sp.resting && Math.abs(p) < 0.004) { el.style.scale = ""; held.delete(el); } else el.style.scale = String(1 - amt * p);
      });
      held.set(el, s);
    }
    s.cfg = CFG.lift;
    (s as Spring & { t0?: number }).t0 = performance.now();
    s.to(1);
  };
  const up = () => {
    for (const [, s] of held) {
      const wait = Math.max(0, 70 - (performance.now() - ((s as Spring & { t0?: number }).t0 ?? 0)));
      s.to(0, { cfg: CFG.settle, delay: wait });
    }
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);
}

// ---- a pill that slides to an element: the hover highlight, the active row, the chosen language ----
// Position and size are four springs, so the pill stretches as it travels; it grows in from nothing the first
// time and shrinks away to nothing when there is nowhere to be.
export function slidePill(container: HTMLElement, pill: HTMLElement, o: { fit?: boolean; dx?: number; dy?: number; cfg?: Cfg } = {}) {
  const fit = o.fit !== false, cfg = { ...(o.cfg ?? CFG.settle), eps: 0.05 };
  const v = { x: 0, y: 0, w: 0, h: 0, s: 0 };
  let seen = false, el: HTMLElement | null = null;
  const put = () => {
    pill.style.translate = `${v.x}px ${v.y}px`;
    if (fit) { pill.style.width = `${Math.max(0, v.w)}px`; pill.style.height = `${Math.max(0, v.h)}px`; }
    pill.style.scale = `${Math.max(0, v.s)}`;
    pill.style.visibility = v.s < 0.01 && !el ? "hidden" : "visible";
  };
  const mk = (key: "x" | "y" | "w" | "h" | "s", c: Cfg) => new Spring(0, c, (n) => { v[key] = n; put(); });
  const sx = mk("x", cfg), sy = mk("y", cfg), sw = mk("w", cfg), sh = mk("h", cfg), ss = mk("s", { ...CFG.fade, eps: 0.004 });
  put();
  // layout position, not painted position: a row still sliding in does not drag its pill off to the side
  const rectOf = (t: HTMLElement) => {
    let x = 0, y = 0, n: HTMLElement | null = t;
    while (n && n !== container) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    if (!n) { const c = container.getBoundingClientRect(), r = t.getBoundingClientRect(); x = r.left - c.left + container.scrollLeft; y = r.top - c.top + container.scrollTop; }
    return { x: x + (o.dx ?? 0), y: y + (o.dy ?? 0), w: t.offsetWidth, h: t.offsetHeight };
  };
  return {
    to(t: HTMLElement | null, instant = false) {
      el = t;
      if (!t) { ss.to(0); return; }
      const r = rectOf(t);
      if (!seen || instant || reducedMotion()) {
        sx.set(r.x); sy.set(r.y); sw.set(r.w); sh.set(r.h);
        if (!seen) { v.s = 0; ss.set(0); }
        seen = true; ss.to(1); return;
      }
      if (Math.abs(sx.target - r.x) > 0.5 || Math.abs(sy.target - r.y) > 0.5 || Math.abs(sw.target - r.w) > 0.5 || Math.abs(sh.target - r.h) > 0.5) {
        sx.to(r.x); sy.to(r.y); sw.to(r.w); sh.to(r.h);
      }
      if (ss.target !== 1) ss.to(1);
    },
    /** the target moved (scroll, a layout change): follow it without a spring */
    /** the target moved (scroll, a layout change): follow it without a spring. A target that left the page (its
     *  row was rebuilt) is let go, or the pill would read its empty rect and fly to the corner (#287) */
    follow() { if (el && !el.isConnected) { el = null; ss.to(0); return; } if (el) { const r = rectOf(el); sx.set(r.x); sy.set(r.y); sw.set(r.w); sh.set(r.h); } },
    destroy() { sx.stop(); sy.stop(); sw.stop(); sh.stop(); ss.stop(); },
  };
}

// ---- growTo: an element whose content just got taller opens to its new height on a spring ----
// The way a streaming answer grows: each new line of a paragraph is revealed by the box opening under it, so the
// text below moves with a spring instead of jumping a line at a time. `from` is the start height (0: unfold from
// nothing; the height read before the content changed, so a line that lands while nothing moves still opens). A grow
// already in flight keeps its spring, position and velocity, and only takes the new height as its target: it never
// starts over from the top.
const heights = new WeakMap<HTMLElement, Spring>();
/** the element is opening on a spring right now */
export const growing = (el: HTMLElement) => { const s = heights.get(el); return !!s && !s.resting; };
export function growTo(el: HTMLElement, from?: number, cfg: Cfg = CFG.travel) {
  const s = heights.get(el);
  const flying = !!s && !s.resting;
  const was = flying ? s!.v : from ?? el.offsetHeight;
  el.style.height = ""; el.style.overflow = "";
  const nat = el.offsetHeight;
  if (reducedMotion() || (!flying && nat <= was + 2 && from !== 0)) { if (s) { s.stop(); heights.delete(el); } return; }
  const sp = s ?? new Spring(was, { ...cfg, eps: 0.4 }, (v, sp) => {
    if (sp.resting && v === sp.target) { el.style.height = ""; el.style.overflow = ""; heights.delete(el); }
    else { el.style.height = `${Math.max(0, Math.round(v))}px`; el.style.overflow = "hidden"; }   // whole pixels: a frame that moves less lays nothing out
  });
  heights.set(el, sp);
  if (!flying) sp.set(was);
  el.style.height = `${Math.max(0, sp.v)}px`; el.style.overflow = "hidden";
  sp.to(nat);
}

// ---- follow: keep a scroller pinned to its end while its content grows on springs ----
// One follow serves every talk (Life, Work, the session beside); no page keeps scroller logic of its own.
// Stays out of the way when the reader has scrolled up; a spring (no overshoot) so it never snaps.
// The reader is anchored to the bottom edge: when the scroller itself changes height (the box growing under it as
// he types, the window), the line that sat just above the box stays just above the box, so typing never moves what
// he scrolled to and never hides it under the box (Marco, 2026-10-14).
// Free while Sol writes (#6, review 10/11): his hand releases the follow at once, whatever the distance
// from the end. A wheel, a touch, a press on the bar, a scroll key, and one rule that needs no flag: a scroll whose
// scrollTop is above (smaller than) what the follow last wrote is his, because the spring only ever scrolls down.
// Programmatic writes are told apart by value, so a spring frame landing in the same tick cannot swallow his gesture.
// Being at the end is following: he scrolls back to the end, or he is there when the content grows, and it sticks.
export type FollowState = { stuck: boolean; away: boolean; fresh: boolean };
export type Follow = ReturnType<typeof follow>;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};
export function follow(scroller: HTMLElement, content: HTMLElement) {
  let stuck = true;
  let fresh = false;                       // the content grew while he was away from the end: the orb's dot
  let hands = 0;                           // when his hand last released it (a grace before growth may re-stick)
  let wrote = scroller.scrollTop;          // the last scrollTop the follow itself wrote, read back
  let lastTop = scroller.scrollTop;
  let bottom = scroller.scrollTop + scroller.clientHeight; // where the viewport's bottom edge sits in the content
  let height = scroller.scrollHeight;
  const end = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const atEnd = () => end() - scroller.scrollTop <= 1;
  const write = (v: number) => { scroller.scrollTop = v; wrote = scroller.scrollTop; lastTop = wrote; };
  const sp = new Spring(scroller.scrollTop, { ...CFG.travel, eps: 0.5 }, (v) => { if (Math.abs(scroller.scrollTop - v) >= 1) write(v); });

  const subs = new Set<() => void>();
  let told = "";
  const state = (): FollowState => ({ stuck, away: end() - scroller.scrollTop > 4, fresh });
  const tell = () => { const s = state(), k = `${+s.stuck}${+s.away}${+s.fresh}`; if (k !== told) { told = k; subs.forEach((f) => f()); } };

  const stick = () => { stuck = true; fresh = false; };
  const release = () => { hands = performance.now(); stuck = false; sp.stop(); tell(); };   // the spring stops dead, a rail glide too
  const chase = () => { if (sp.resting) sp.set(scroller.scrollTop); sp.to(end()); };

  const onScroll = () => {
    const top = scroller.scrollTop, up = top < lastTop - 0.5;
    lastTop = top;
    bottom = top + scroller.clientHeight;
    if (stuck && top < wrote - 1 && !atEnd()) release();          // his: the spring never writes upward
    else if (!stuck && !up && atEnd()) stick();                     // he came back to the end
    tell();
  };
  // his hand, before the browser scrolls: capture phase, so nothing inside the talk can hide it
  const onHand = () => release();
  const onPress = (e: PointerEvent) => { if (e.target === scroller) release(); };   // the bar (its target is the scroller)
  const onKey = (e: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const t = e.target as Node | null;
    if (t === document.body || t === document.documentElement || t === document || (t && scroller.contains(t))) release();
  };

  // words he is selecting in the talk hold it still: the follow waits (it stays stuck) until the selection is let go
  const selecting = () => {
    const s = document.getSelection?.();
    return !!s && !s.isCollapsed && !!s.anchorNode && scroller.contains(s.anchorNode);
  };
  const ro = new ResizeObserver(() => {
    const h = scroller.scrollHeight, grew = h > height + 0.5, wasEnd = bottom >= height - 2;
    height = h;
    if (!stuck && grew && wasEnd && performance.now() - hands > 300) stick();   // he sat at the end: it follows on
    if (stuck && !selecting()) chase();
    else if (grew) fresh = true;
    bottom = scroller.scrollTop + scroller.clientHeight;
    tell();
  });
  ro.observe(content);
  const anchor = new ResizeObserver(() => {
    const h = scroller.clientHeight;
    const want = Math.max(0, Math.min(end(), bottom - h));
    if (Math.abs(scroller.scrollTop - want) >= 1) {
      write(want);
      if (!stuck) sp.set(scroller.scrollTop);
    }
    bottom = scroller.scrollTop + h;
    tell();
  });
  anchor.observe(scroller);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("wheel", onHand, { capture: true, passive: true });
  scroller.addEventListener("touchstart", onHand, { capture: true, passive: true });
  scroller.addEventListener("pointerdown", onPress, { capture: true });
  document.addEventListener("keydown", onKey, true);
  return {
    jump() { stick(); sp.stop(); write(end()); bottom = scroller.scrollTop + scroller.clientHeight; tell(); },
    glide() { stick(); chase(); tell(); },
    goTo(y: number) { stuck = false; if (sp.resting) sp.set(scroller.scrollTop); sp.to(Math.max(0, Math.min(end(), y))); tell(); }, // to a place in the talk, and stay
    /** at a place in the talk at once, no glide: a talk reopened where he left it, set before it is painted */
    place(y: number) { stuck = false; sp.stop(); write(Math.max(0, Math.min(end(), y))); bottom = scroller.scrollTop + scroller.clientHeight; tell(); },
    release,
    isStuck: () => stuck,
    state,
    /** called when stuck, away (the end out of view) or fresh changes; returns the unsubscribe */
    onChange(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; },
    destroy() {
      sp.stop(); ro.disconnect(); anchor.disconnect(); subs.clear();
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onHand, true);
      scroller.removeEventListener("touchstart", onHand, true);
      scroller.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("keydown", onKey, true);
    },
  };
}

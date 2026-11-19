// A drag that follows the finger (#773, #751 B10), for the stage behind `stage.whole` (flag.ts). Rules 1-5 of
// build/feel.md: past the pointer's threshold the hand's block alone moves, written as `transform` in one frame loop
// outside React (pointer moves only record the point; one requestAnimationFrame writes it), lifted 1.012 about the grab
// point. Let go, the release (hand.ts: trade, or the landing and the plan) runs on springs: the block settles (or glides
// after a flick), what the plan moves travels, and only when everything rests is the new place committed to the store,
// with the transforms cleared in the same task, so nothing jumps. Leaving the window does nothing; a block pops out
// only when let go after the pointer has stayed past the edge 400 ms.
import { flushSync } from "react-dom";
import { Spring, type Cfg } from "../motion.ts";
import { LIFT, SPRING, Z } from "../kit/feel.ts";   // B11: Z
import type { Rect } from "./model.ts";
import type { Placed, Room } from "./geometry.ts";
import { clampOver, handAt, outsideWindow, pastThreshold, popArmed, release, track, velocity, type Pt, type Release, type Shown, type Track } from "./hand.ts";

export type WholeDrag = {
  /** the press on the block's head (its pointer, button down) */
  e: PointerEvent;
  head: HTMLElement;
  stage: HTMLElement;
  /** the hand's block as the stage shows it now (its shown place is `from`); touched and hand as the plan reads them */
  me: Placed & { from: Rect };
  room: () => Room;
  /** every block on the stage, the hand's among them, as the plan reads them */
  blocks: () => Placed[];
  elOf: (id: string) => HTMLElement | null;
  /** under its threshold: a press, not a drag */
  onPress?: () => void;
  /** the session row under the pointer, if any (carry, #700) */
  rowAt?: (client: Pt) => string | null;
  onRow?: (row: string | null) => void;
  onCarry?: (row: string) => void;
  /** the release, committed: called inside flushSync once every spring rests */
  onLand: (r: Release) => void;
  /** #1001: let go and settling on its springs: onLand follows when they rest (a ⌘Z meanwhile waits for it) */
  onLanding?: () => void;
  /** let go past the edge after the hold: the block's rect on the screen */
  onPop: (screen: Rect) => void;
  /** B11: where the hand's block shows, each frame it is drawn while held (the drop preview), and once let go */
  onShow?: (s: Shown) => void;
  onUnshow?: () => void;
};

/** one block's transform: a translate from where React put it, and a scale about the grab point */
type Paint = { el: HTMLElement; dx: number; dy: number; s: number };
const write = (p: Paint) => { p.el.style.transform = `translate(${p.dx}px, ${p.dy}px)${p.s !== 1 ? ` scale(${p.s})` : ""}`; };
// the z-index is React's (the stage's z-order table, B11): never cleared here, or a block it did not re-rank would sit at
// auto under every ranked one (#858 B11-3); the hand's own Z.hand is undone by putting back what it was (zBack)
const clear = (el: HTMLElement) => { el.style.transform = ""; el.style.transformOrigin = ""; };

/** a position spring that never passes its target by more than motion.clamp */
function posSpring(v: number, cfg: Cfg, apply: (v: number) => void, rest: () => void): Spring {
  let from = v;
  const s = new Spring(v, cfg, (x, sp) => { const c = clampOver(x, sp.vel, sp.target, from); sp.v = c.v; sp.vel = c.vel; apply(c.v); }, rest);
  const to = s.to.bind(s);
  s.to = (t, o) => { from = s.v; return to(t, o); };
  return s;
}

/** starts the hand on a head's press; returns at once, the rest is listeners */
export function wholeDrag(d: WholeDrag): void {
  const { e, head, stage, me } = d;
  const block = d.elOf(me.id);
  if (!block) return;
  const box = () => stage.getBoundingClientRect();
  const at = (c: Pt): Pt => { const b = box(); return { x: c.x - b.left, y: c.y - b.top }; };
  const start = { x: e.clientX, y: e.clientY };
  const grab = { x: at(start).x - me.from.x, y: at(start).y - me.from.y };
  const paint: Paint = { el: block, dx: 0, dy: 0, s: 1 };
  let zWas = "";
  const zBack = () => { block.style.zIndex = zWas; };
  let held = false, frame = 0, pointer = at(start), client = start, shown: Shown | null = null, t: Track = [], outSince: number | null = null, row: string | null = null;
  const lift = new Spring(1, SPRING.lift, (v) => { paint.s = v; write(paint); });
  head.setPointerCapture(e.pointerId);

  const others = () => d.blocks().filter((b) => b.id !== me.id).map((b) => ({ id: b.id, r: b.r }));
  const draw = () => {
    frame = 0;
    shown = handAt(d.room(), { id: me.id, w: me.from.w, h: me.from.h }, pointer, grab, others());
    paint.dx = shown.x - me.from.x; paint.dy = shown.y - me.from.y;
    write(paint);
    if (held) d.onShow?.(shown);   // B11
  };
  const mv = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    client = { x: ev.clientX, y: ev.clientY };
    if (!held) {
      if (!pastThreshold(ev.pointerType || "mouse", start, client)) return;
      held = true;
      block.style.transformOrigin = `${grab.x}px ${grab.y}px`;
      zWas = block.style.zIndex;
      block.style.zIndex = String(Z.hand);   // feel.md z-order: the hand's block (B11: the kit's table)
      stage.classList.add("held");
      lift.to(LIFT);
    }
    pointer = at(client);
    t = track(t, ev.timeStamp, client);
    const out = outsideWindow({ w: window.innerWidth, h: window.innerHeight }, client);
    outSince = out ? outSince ?? ev.timeStamp : null;
    if (d.rowAt) { const r = d.rowAt(client); if (r !== row) { row = r; d.onRow?.(r); } }
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    head.removeEventListener("pointermove", mv); head.removeEventListener("pointerup", end); head.removeEventListener("pointercancel", end);
    if (frame) { cancelAnimationFrame(frame); draw(); }
    stage.classList.remove("held");
    d.onUnshow?.();   // B11: the preview goes before anything moves
    if (!held) { d.onPress?.(); return; }
    if (row) d.onRow?.(null);
    const cancel = ev.type === "pointercancel";
    // carried: the block is in that row's session too; here it travels back with no move committed (#773 B10-3)
    if (!cancel && row && d.onCarry) { d.onCarry(row); land(back(), false); return; }
    if (!cancel && popArmed(outSince, ev.timeStamp) && outsideWindow({ w: window.innerWidth, h: window.innerHeight }, client)) {
      clear(block); zBack(); lift.stop();
      d.onPop({ x: ev.screenX - grab.x, y: ev.screenY - grab.y, w: me.from.w, h: me.from.h });
      return;
    }
    land(cancel || !shown ? back() : release(d.room(), me, shown, d.blocks(), velocity(t)));
  };
  /** no move: the block goes back where it was lifted from */
  const back = (): Release => ({ kind: "move", plan: { out: new Map([[me.id, me.from]]), fold: [], wait: [] }, glide: false, at: me.from });

  /** the release on springs; `commit` false (a carry) clears the transforms when all rest and writes nothing */
  const land = (r: Release, commit = true) => {
    const v = velocity(t);
    const moving: { el: HTMLElement; id: string }[] = [];
    // counted down only once every spring has started (armed), and finished once: under reduced motion a spring rests
    // inside its own .to(), which would otherwise commit before the next one starts (#773 B10-2)
    let left = 0, armed = false, done = false;
    if (commit) d.onLanding?.();
    const finish = () => {
      if (done) return;
      done = true;
      zBack();   // before the commit, so React's write of the new rank is the one that stays
      if (commit) flushSync(() => d.onLand(r));
      clear(block);
      moving.forEach((m) => clear(m.el));
    };
    const rested = () => { left--; if (armed && left <= 0) finish(); };
    const go = (id: string, el: HTMLElement, from: Rect, to: Rect, base: Rect, cfg: Cfg, vel?: Pt) => {
      const p: Paint = id === me.id ? paint : { el, dx: from.x - base.x, dy: from.y - base.y, s: 1 };
      left += 2;
      posSpring(from.x - base.x, cfg, (x) => { p.dx = x; write(p); }, rested).to(to.x - base.x, { vel: vel?.x });
      posSpring(from.y - base.y, cfg, (y) => { p.dy = y; write(p); }, rested).to(to.y - base.y, { vel: vel?.y });
    };
    left += 1;   // the lift going down
    lift.rest = rested;
    lift.to(1);
    const cfg = r.kind === "trade" ? SPRING.travel : r.glide ? SPRING.glide : SPRING.settle;
    const now = d.blocks();
    for (const [id, to] of r.plan.out) {
      if (id === me.id) { go(id, block, { ...me.from, x: me.from.x + paint.dx, y: me.from.y + paint.dy }, to, me.from, cfg, r.glide ? v : undefined); continue; }
      const el = d.elOf(id), was = now.find((b) => b.id === id)?.r;
      if (!el || !was) continue;
      moving.push({ el, id });
      go(id, el, was, to, was, SPRING.travel);
    }
    armed = true;
    if (left <= 0) finish();
  };

  head.addEventListener("pointermove", mv); head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);
}

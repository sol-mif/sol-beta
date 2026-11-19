// The hand that carries a Home thing into Build (#1031). A folder's card, a fact or a source is picked up (pressed and
// moved past the kit's threshold): it lifts off its row as a small slab that follows the pointer with weight (a spring's
// scale and a tilt from the hand's speed). Held over a letter of the spine for POP_HOLD, the window turns to that view
// under the hand, and the thing is still held. Let go over Build's stage, it is put down there as a block (the engine
// composes it, cross.carry); over the talk's box, it becomes the next message's first piece; anywhere else, it springs
// back to where it was picked up. Esc puts it back. Nothing acts unchosen: a press without a move is still the row's click.
// No React: the slab is one element on <body>, moved on springs (motion.ts), so a view changing under it never drops it.
import { spring } from "../motion";
import { LIFT, POP_HOLD, SPRING, THRESHOLD } from "../kit/feel";
import { crossOn } from "./flag";
import { addPiece, carry, type HomeThing } from "./store";
import { click, play } from "../snap/click";   // #1045: the pieces' own sounds (muted by their row), so a crossing is heard as a piece is

export type Lift = { thing: HomeThing; label: string; /** what it is, drawn as the slab's mark: a card, a fact, a source */ mark: "card" | "fact" | "source" };
type Drop = { el: HTMLElement; kind: "stage" | "talk" };

const HOP = "sol:cross-hop";
/** px per ms: a hand faster than this over a spine letter is passing by, not holding */
const REST = 0.35;
/** App hops the view when the hand holds over a spine letter */
export const onHop = (f: (view: string) => void) => {
  const h = (e: Event) => f(String((e as CustomEvent).detail));
  window.addEventListener(HOP, h);
  return () => window.removeEventListener(HOP, h);
};

const dropAt = (x: number, y: number): Drop | null => {
  // join fit (your Build): with the stage empty your talk docks full and the stage under it takes no pointer
  // (talkfull.css), so no hit finds it: a hand over no drop place, inside the stage's box, puts it on the stage
  const hit = document.elementFromPoint(x, y)?.closest?.("[data-cross-drop]") as HTMLElement | null;
  const under = () => [...document.querySelectorAll<HTMLElement>('[data-cross-drop="stage"]')].find((s) => { const r = s.getBoundingClientRect(); return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) ?? null;
  const el = hit ?? under();
  const k = el?.dataset.crossDrop;
  return el && (k === "stage" || k === "talk") ? { el, kind: k } : null;
};
const letterAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest?.(".spine [data-view]") as HTMLElement | null;

let busy = false;
const noSelect = (e: Event) => e.preventDefault();
/** a press on a Home row: if the hand moves past the threshold, the thing is lifted and carried; else nothing happens */
export function grab(e: PointerEvent, lift: Lift, from: HTMLElement) {
  if (!crossOn() || busy || e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY }, th = THRESHOLD[(e.pointerType as keyof typeof THRESHOLD) || "mouse"] ?? 3;
  const r0 = from.getBoundingClientRect();
  const off = { x: Math.min(e.clientX - r0.left, 160), y: e.clientY - r0.top };
  let slab: HTMLElement | null = null, over: Drop | null = null, letter: HTMLElement | null = null, hold = 0;
  let px = start.x, py = start.y, lastX = start.x, lastT = performance.now(), lastY = start.y, lastYT = lastT;
  const sx = spring(0, SPRING.travel, () => paint()), sy = spring(0, SPRING.travel, () => paint());
  const sc = spring(1, SPRING.lift, () => paint()), tilt = spring(0, SPRING.settle, () => paint()), op = spring(1, SPRING.fade, () => paint());
  function paint() { if (slab) { slab.style.transform = `translate(${sx.v}px, ${sy.v}px) rotate(${tilt.v}deg) scale(${sc.v})`; slab.style.opacity = String(op.v); } }

  const lifted = () => {
    busy = true;
    slab = document.createElement("div");
    slab.className = "cross-slab";
    slab.dataset.mark = lift.mark;
    slab.setAttribute("aria-hidden", "true");
    const i = document.createElement("i"), b = document.createElement("b"), s = document.createElement("small");
    b.textContent = lift.label; s.textContent = lift.thing.path;
    slab.append(i, b, s);
    document.body.appendChild(slab);
    document.documentElement.dataset.crossHand = lift.mark;
    // the press began a text selection before it became a carry: the hand takes the thing, not the words under it
    window.getSelection()?.removeAllRanges();
    window.addEventListener("selectstart", noSelect, true);
    from.dataset.crossLifted = "1";
    sx.set(r0.left); sy.set(r0.top); sc.set(1); sc.to(LIFT * 1.04);
    paint();
    play("part", { level: 0.8 });   // lifted off its row: the soft sound of a piece coming apart
  };
  const light = (d: Drop | null) => {
    if (over?.el === d?.el) return;
    if (over) delete over.el.dataset.crossOver;
    over = d;
    if (over) over.el.dataset.crossOver = "1";
  };
  const letterHold = (l: HTMLElement | null) => {
    if (l === letter) return;
    if (letter) delete letter.dataset.crossHold;
    window.clearTimeout(hold);
    letter = l;
    const v = l?.dataset.view;
    if (!l || !v || v === document.documentElement.dataset.view) return;
    l.dataset.crossHold = "1";
    hold = window.setTimeout(() => { window.dispatchEvent(new CustomEvent(HOP, { detail: v })); if (letter) delete letter.dataset.crossHold; }, POP_HOLD);
  };
  const move = (ev: PointerEvent) => {
    px = ev.clientX; py = ev.clientY;
    if (!slab) { if (Math.hypot(px - start.x, py - start.y) < th) return; lifted(); }
    const now = performance.now(), vx = (px - lastX) / Math.max(1, now - lastT);
    lastX = px; lastT = now;
    // the slab stays in the window: where it would leave by the left edge (the hand over the spine) it rides just right
    // of the hand instead, so the spine letter under the hand stays in sight
    const x = px - off.x;
    sx.set(x < 8 ? px + 20 : Math.min(window.innerWidth - 120, x)); sy.set(Math.max(8, py - off.y));
    tilt.to(Math.max(-7, Math.min(7, vx * 5)));
    light(dropAt(px, py));
    // a letter turns the window only under a hand that rests on it: sweeping past restarts its hold
    const l = letterAt(px, py);
    if (l && l === letter && Math.abs(vx) + Math.abs((py - lastY) / Math.max(1, now - lastYT)) > REST) { letter = null; }
    lastY = py; lastYT = now;
    letterHold(l);
  };
  const end = (put: boolean) => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", key, true);
    window.clearTimeout(hold);
    if (letter) delete letter.dataset.crossHold;
    if (!slab) return;
    // the press that lifted is not also the row's click; a hand that ended elsewhere (another view) makes no click, so
    // the guard is gone by the next task and never eats a later press
    const eat = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener("click", eat, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", eat, true), 0);
    window.setTimeout(() => { busy = false; }, 0);
    const d = put ? dropAt(px, py) : null;
    light(null);
    delete document.documentElement.dataset.crossHand;
    window.removeEventListener("selectstart", noSelect, true);
    const gone = () => { slab?.remove(); delete from.dataset.crossLifted; };
    tilt.to(0);
    if (d?.kind === "stage") {
      const r = d.el.getBoundingClientRect(), w = 440, h = 300;
      const at = { x: Math.max(0, Math.round(px - r.left - off.x)), y: Math.max(0, Math.round(py - r.top - off.y)), w, h };
      carry(lift.thing, at);
      click();   // set down: the seat's click
      // set down: it presses into the stage and gives way to the block the engine sends
      sc.to(0.94, { cfg: SPRING.settle }); op.to(0, { cfg: SPRING.fade });
      window.setTimeout(gone, 420);
    } else if (d?.kind === "talk") {
      addPiece(lift.thing);
      click(0.6);
      const r = d.el.getBoundingClientRect();
      sx.to(r.left + 12); sy.to(r.top + 6); sc.to(0.7); op.to(0, { cfg: SPRING.fade, delay: 120 });
      window.setTimeout(gone, 520);
    } else {
      // nowhere it fits: back to its row, as if on a band
      play("push");
      const back = from.isConnected ? from.getBoundingClientRect() : r0;
      sx.to(back.left); sy.to(back.top); sc.to(1); op.to(from.isConnected ? 1 : 0, { delay: 160 });
      window.setTimeout(gone, 520);
    }
  };
  const up = () => end(true);
  const cancel = () => end(false);
  const key = (k: KeyboardEvent) => { if (k.key === "Escape" && slab) { k.stopPropagation(); k.preventDefault(); end(false); } };
  // on the window, in the capture phase: the view that mounts under the hand (a hop) never takes the hand's moves
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("keydown", key, true);
}

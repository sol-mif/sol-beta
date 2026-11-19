// Throw and pull (#1090): a block let go past the edge of this window that faces another window lands there; on the
// other window the same move, toward this one, brings it back. The same block, one ledger: only the record's line for
// it changes (screens.put), never the block. The stage asks here before it pops a block into a window of its own
// (stage/Stage.tsx, pop.ts): with a window across that edge, the throw wins.
// Design round 1 (S/design/design.md NOW 1 and 2):
//   alone       with the switch on and one window, the edge toward the other screen is a ghost seam: the first block
//               carried past it opens the second window there, holding that block. No button.
//   the peek    while carried in the last 8% before the seam or past it, this window says so (screens.carry, at most
//               every 33 ms) and the other window draws the block's frame coming out of its seam (Peek.tsx).
//   let go      past the edge, more than half the block over it, or a flick toward it: a throw.
import { screensOn } from "./flag";
import { ME, myScreen, screensState, put, many, carrying, record, talkTo } from "./store";
import { leftBy, throwTo, edgeToward, type Edge, type Win } from "./model";
import { overOf, flick, halfOver } from "./carry";
import { openScreenNow } from "./open";
import { seamsOf } from "./seams.ts";
import "./mapdrop.css";

const win = () => ({ w: window.innerWidth, h: window.innerHeight });
/** the edges of this window a throw can leave by, and where each lands: another live window, or alone the ghost edge.
 *  More than two screens (design rules 1, 2, 6; seams.ts): a seam on each stretch of an edge another screen touches,
 *  `from`..`upto` along it (0..1); windows whose screens touch none of mine (or report none) keep edgeToward's whole edge */
export type SeamAt = { edge: Edge; to: Win | null; from: number; upto: number };
export function seams(): SeamAt[] {
  if (!screensOn()) return [];
  const s = screensState();
  if (!many(s)) return alone() ? [{ edge: ghostEdge(), to: null, from: 0, upto: 1 }] : [];
  const me = myScreen(), others = s.windows.filter((w) => w.live && w.win !== ME);
  const touching = me ? seamsOf(me, others.filter((o) => o.screen).map((o) => ({ win: o.win, screen: o.screen! }))) : [];
  return others.flatMap((o): SeamAt[] => {
    const mine = touching.filter((x) => x.win === o.win);
    return mine.length ? mine.map((x) => ({ edge: x.edge, to: o, from: x.from, upto: x.to })) : [{ edge: edgeToward(ME, s.home, me, o), to: o, from: 0, upto: 1 }];
  });
}
/** the share along an edge of a point in this window (0..1: top to bottom for a side edge, left to right for top and bottom) */
const along = (edge: Edge, x: number, y: number) => { const W = win(); return edge === "left" || edge === "right" ? y / W.h : x / W.w; };
const gapTo = (sm: SeamAt, at: number) => (at < sm.from ? sm.from - at : at > sm.upto ? at - sm.upto : 0);
/** the seams with the one under the point first (two screens on one edge: the half the hand is at wins) */
const nearest = (list: SeamAt[], x: number, y: number) => [...list].sort((a, b) => gapTo(a, along(a.edge, x, y)) - gapTo(b, along(b.edge, x, y)));
/** alone with the switch on: the ghost seam is drawn and a throw opens the second window (the record says one screen:
 *  no ghost, there is nowhere to go). A window that is not main never opens a third */
export const alone = () => screensOn() && ME === screensState().home && !many(screensState()) && record().screens !== 1;
/** the edge toward the other screen when only this one is known: the record's other screen, else the right */
export function ghostEdge(): Edge {
  const r = record(), mine = r.main ?? myScreen();
  return r.other && mine ? edgeToward(ME, "", mine, { win: "x", role: "stage", live: true, at: 0, screen: r.other }) : "right";
}

/** where a block let go at this client point would land, or null: no switch, nowhere to go, or not a facing edge */
export function landsOn(x: number, y: number): Win | null {
  if (!screensOn()) return null;
  const s = screensState();
  if (!many(s)) return null;
  return throwTo(s, ME, myScreen(), leftBy(win(), x, y));
}

// the carry: the pointer's last points (a flick) and what was said last to the other window
let trail: { x: number; y: number; t: number }[] = [];
let told = { block: "", over: 0, at: 0 };
/** the stage's carry moved: the block would stand at `box` (client px). Says how far it is over the seam it nears */
// Drop on the map (design NOW 05:08 #4, mapdrop.css as designed): a window with no facing edge is reached through the map.
// Within 90 px of the map's middle (130 once it is big, so it does not flutter) the map doubles, the carried block
// shrinks to the hand, and the other window's shape under the pointer wears the pearl; let go there: `put` to it
const NEAR_PX = 90, STAY_PX = 130;
let mapHit: string | null = null;
function mapEl(): HTMLElement | null { return document.querySelector<HTMLElement>(".sm.in-head") ?? document.querySelector<HTMLElement>(".sm"); }
function mapNear(block: string, box: { x: number; y: number; w: number; h: number }, px: number, py: number) {
  const m = screensOn() && many(screensState()) ? mapEl() : null;
  const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(block)}"]`);
  if (!m) { mapClear(block); return; }
  const was = m.classList.contains("near");
  // the map's place as laid out (its scale left aside: the middle and the reach are read from its resting box)
  const r = m.getBoundingClientRect(), k = was ? 2 : 1, cx = r.left + r.width / 2, cy = r.top + r.height / (2 * k);
  const near = Math.hypot(px - cx, py - cy) <= (was ? STAY_PX : NEAR_PX);
  m.classList.toggle("near", near);
  if (el) {
    el.classList.toggle("to-map", near);
    if (near) { el.style.setProperty("--grip-x", `${Math.round(px - box.x)}px`); el.style.setProperty("--grip-y", `${Math.round(py - box.y)}px`); }
  }
  mapHit = null;
  m.querySelectorAll<SVGGElement>(".sm-rect").forEach((g) => {
    const b = g.getBoundingClientRect(), on = near && !g.classList.contains("mine") && px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
    g.classList.toggle("hit", on);
    if (on) mapHit = g.dataset.win ?? null;
  });
}
function mapClear(block: string) {
  mapHit = null;
  document.querySelectorAll(".sm.near").forEach((m) => m.classList.remove("near"));
  document.querySelectorAll(".sm-rect.hit").forEach((g) => g.classList.remove("hit"));
  const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(block)}"]`);
  if (el) { el.classList.remove("to-map"); el.style.removeProperty("--grip-x"); el.style.removeProperty("--grip-y"); }
}

export function carryMove(block: string, title: string, box: { x: number; y: number; w: number; h: number }, px: number, py: number, kind?: string) {
  mapNear(block, box, px, py);
  const now = performance.now();
  trail = [...trail.filter((p) => now - p.t <= 120), { x: px, y: py, t: now }];
  const sm = nearest(seams(), px, py).find((x) => x.to);
  if (!sm) return;
  const W = win(), side = sm.edge === "left" || sm.edge === "right";
  const near = sm.edge === "right" ? px > W.w * 0.92 : sm.edge === "left" ? px < W.w * 0.08 : sm.edge === "bottom" ? py > W.h * 0.92 : py < W.h * 0.08;
  const over = Math.max(overOf(sm.edge, W, box), leftBy(W, px, py) === sm.edge ? 0.35 : near ? 0.08 : 0);
  if (!over && !told.over) return;
  if (now - told.at < 33 && over) return;
  told = { block, over, at: now };
  carrying({ block, title, ...(kind ? { kind } : {}), w: box.w, h: box.h, y: Math.max(0, Math.min(1, (side ? box.y + box.h / 2 : box.x + box.w / 2) / (side ? W.h : W.w))), over });
}
/** the carry ended without a throw: the other window's peek goes */
export function carryEnd(block: string) {
  trail = [];
  mapClear(block);
  if (told.block === block && told.over) carrying({ block, title: "", w: 0, h: 0, y: 0, over: 0 });
  told = { block: "", over: 0, at: 0 };
}

/** let go: a throw if past a seam, more than half over one, or flicked toward one. Alone, past the ghost edge: the
 *  second window opens holding the block (window.open inside the let-go, so it is the person's own gesture). True when
 *  the block went (the stage then pops nothing and pours it out) */
export function throwOnLetGo(block: string, box: { x: number; y: number; w: number; h: number }, px: number, py: number): boolean {
  const W = win(), by = leftBy(W, px, py), t = trail;
  const onMap = mapHit && screensState().windows.some((w) => w.live && w.win === mapHit) ? mapHit : null;
  carryEnd(block);
  if (onMap) { put(block, onMap); return true; }   // let go on a shape of the map: it goes there (it comes in from that window's seam)
  for (const sm of nearest(seams(), px, py)) {
    const went = by === sm.edge || halfOver(overOf(sm.edge, W, box)) || flick(sm.edge, t);
    if (!went) continue;
    if (sm.to) { put(block, sm.to.win); slideOut(block, sm.edge); return true; }
    put(block, "two");   // the window that is about to say hello: its line waits for it
    if (openScreenNow("two", "wall")) { slideOut(block, sm.edge); return true; }   // blocks only: the talk stays on one window (design NOW 01:10)
    put(block, null);
    refused();
    return false;
  }
  return false;
}
/** the key: the block under the pointer (or the focus) goes to the window across the edge an arrow names */
export function throwByKey(block: string, edge: Edge): boolean {
  if (!screensOn()) return false;
  const s = screensState();
  if (!many(s)) return false;
  // one screen over, at the block's height along that edge (two screens on one edge: the one the block faces)
  const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(block)}"]`), r = el?.getBoundingClientRect();
  const on = r ? nearest(seams().filter((x) => x.edge === edge && x.to), r.left + r.width / 2, r.top + r.height / 2) : [];
  const to = on[0]?.to ?? throwTo(s, ME, myScreen(), edge);
  if (!to) return false;
  put(block, to.win);
  return true;
}
/** the pointer is in the last 8% before an edge that faces another window: a carry there is a throw, so what else the
 *  edge holds (Home's folder shelf by the spine) waits */
export function nearSeam(x: number, y: number): boolean {
  const W = win();
  const edge: Edge | null = x < W.w * 0.08 ? "left" : x > W.w * 0.92 ? "right" : y < W.h * 0.08 ? "top" : y > W.h * 0.92 ? "bottom" : null;
  return !!edge && seams().some((s) => s.edge === edge);
}
// a popup refused: the ghost seam shakes (Seam.tsx listens); no words
const shakes = new Set<() => void>();
export const onRefused = (f: () => void) => { shakes.add(f); return () => { shakes.delete(f); }; };
const refused = () => shakes.forEach((f) => f());

/** a thrown block keeps going out past the edge it left by (220 ms, the glass's time); the record's answer then takes it
 *  off this window. Should no answer come (the engine away), it is back in its place after 1.5 s */
function slideOut(block: string, edge: Edge) {
  const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(block)}"]`);
  if (!el) return;
  const W = window.innerWidth, H = window.innerHeight;
  const d = edge === "right" ? `translate3d(${W}px,0,0)` : edge === "left" ? `translate3d(${-W}px,0,0)` : edge === "bottom" ? `translate3d(0,${H}px,0)` : `translate3d(0,${-H}px,0)`;
  el.style.transition = "transform var(--d-glass) var(--e-reveal), opacity var(--d-glass) var(--e-reveal)";
  el.style.transform = d; el.style.opacity = "0";
  window.setTimeout(() => { if (el.isConnected) { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; } }, 1500);
}

/** the talk's head carried: the other window sees it nose out of its seam (the same peek, named "the talk") */
export function talkMove(px: number, py: number) {
  carryMove("talk", "the talk", { x: px - 160, y: py - 20, w: 320, h: 420 }, px, py);
}
/** the talk's head let go: past a seam, or flicked toward one, the talk goes to that window. True when it went (the
 *  stage then docks nothing) */
export function talkLetGo(px: number, py: number): boolean {
  const W = win(), by = leftBy(W, px, py), t = trail;
  carryEnd("talk");
  for (const sm of nearest(seams(), px, py)) {
    if (!sm.to) continue;
    if (by === sm.edge || flick(sm.edge, t)) { talkTo(sm.to.win); return true; }
  }
  return false;
}

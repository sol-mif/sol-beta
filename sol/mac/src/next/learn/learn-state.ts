// Tutorials and Help, the face's state (BR1 #1615; mine/look/br1/learn.html draft 1, Marco approved):
//   the end card    once, at the end of the move-in: "You're in. Want a quick look around?", the six walks and Not now;
//                   after the walks (or Not now) the start-screen question, then done (endCard, notNow, cardDone)
//   a walk          next/tips in sequence on the real parts: doing a step moves it on, Next too; Skip ends the walk,
//                   Esc pauses it and Help picks up where it stopped (walkStart, walkNext, walkSkip, walkPause)
//   Show me         plays a walk's step, { walk, step }, from an answer in Help or on the bar's line (showMe)
// Kept on this Mac (localStorage): the card offered once, the walks done, where a paused walk stopped. With no storage
// (a test, a refused store) the card is never offered, as the first-time tips do (tips/tips.ts).
// Plain, so the unit tests read it; the views are Learn.tsx and Help.tsx. Signed: marcocyl04-ux's agent (builder T-face), BR1 (#1615).
import { walkOf, WALKS, type WalkId } from "./walks.ts";

export type From = "card" | "help" | "show";
export type Playing = { id: WalkId; step: number; from: From };
export type Card = "end" | "lead" | null;

const KEY = { offered: "sol.learn.offered", done: "sol.learn.done", paused: "sol.learn.paused" };
const store = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const read = <T,>(k: string, d: T): T => { try { const v = store()?.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { store()?.setItem(k, JSON.stringify(v)); } catch { /* refused: it may be offered again */ } };

export const L = {
  card: null as Card,
  walk: null as Playing | null,
  /** walks finished on this Mac (ticked on the card and in Help) */
  done: [] as WalkId[],
  /** where a walk paused with Esc stopped: Help picks it up there */
  paused: {} as Partial<Record<WalkId, number>>,
};
let loaded = false;
const load = () => { if (loaded) return; loaded = true; L.done = read(KEY.done, []); L.paused = read(KEY.paused, {}); };

const subs = new Set<() => void>();
let ver = 0;
const tell = () => { ver++; subs.forEach((f) => f()); };
export const learnSub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const learnVer = () => ver;

/** the end of the move-in: the card, the first time only (force: the dev page's &learn=1) */
export function endCard(force = false): boolean {
  load();
  if (!force && (!store() || read(KEY.offered, false))) return false;
  write(KEY.offered, true);
  L.card = "end"; L.walk = null;
  tell();
  return true;
}
/** Not now (or Done, once a walk was taken): the start-screen question comes last */
export function notNow(): void { L.card = "lead"; L.walk = null; tell(); }
/** the start-screen question answered or passed: done */
export function cardDone(): void { L.card = null; tell(); }

/** a walk plays from `step` (a paused walk from where it stopped, when no step is asked) */
export function walkStart(id: WalkId, step?: number, from: From = "help"): boolean {
  load();
  const w = walkOf(id);
  if (!w) return false;
  const at = step ?? L.paused[id] ?? 0;
  if (at < 0 || at >= w.steps.length) return false;
  L.walk = { id, step: at, from };
  if (from === "card") L.card = null;
  tell();
  return true;
}
/** the step done (by its action or Next): the next one, or the walk finished */
export function walkNext(): void {
  const p = L.walk, w = p && walkOf(p.id);
  if (!p || !w) return;
  if (p.step + 1 < w.steps.length) { L.walk = { ...p, step: p.step + 1 }; tell(); return; }
  if (!L.done.includes(p.id)) L.done = [...L.done, p.id];
  delete L.paused[p.id];
  write(KEY.done, L.done); write(KEY.paused, L.paused);
  end(p);
}
/** Skip: this walk ends, where it was is forgotten */
export function walkSkip(): void {
  const p = L.walk;
  if (!p) return;
  delete L.paused[p.id]; write(KEY.paused, L.paused);
  end(p);
}
/** Esc: the walk pauses; Help picks up where it stopped */
export function walkPause(): void {
  const p = L.walk;
  if (!p) return;
  L.paused[p.id] = p.step; write(KEY.paused, L.paused);
  end(p);
}
/** a walk taken from the end card goes back to it, the walk ticked, so another can be taken or Done pressed */
function end(p: Playing): void {
  L.walk = null;
  if (p.from === "card") L.card = "end";
  tell();
}

/** Show me: one walk's step played on the person's Sol, the walk going on from there */
export function showMe(a: { walk: string; step: number }): boolean {
  return walkStart(a.walk as WalkId, a.step, "show");
}

/** the walks as the card and Help list them: steps counted, done, paused at */
export const walksListed = () => { load(); return WALKS.map((w) => ({ id: w.id, n: w.n, m: w.m, steps: w.steps.length, done: L.done.includes(w.id), paused: L.paused[w.id] })); };

/** every walk forgotten (the tests) */
export function learnReset(): void {
  L.card = null; L.walk = null; L.done = []; L.paused = {}; loaded = false;
  for (const k of Object.values(KEY)) { try { store()?.removeItem(k); } catch { /* none */ } }
  tell();
}

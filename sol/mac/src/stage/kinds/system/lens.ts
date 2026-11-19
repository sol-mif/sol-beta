// The lens (#1220): what one conversation points at on a system block, written by the agent into the block's body
// beside its area and gone when the block closes. The map stays a map of facts (the registry); the lens only says
// where to look: one system focused as a click would, a path lit and numbered with the rest dimmed, one sentence the map
// cannot show, the step of a walk, a mark on a tile (cut, redo, keep, new, you), where the camera goes, which view, and
// whether a real piece shows as it is today or as the sitting's candidate. The engine refuses a lens naming a system
// the area does not draw (sol/engine/src/work/systems.ts lensError); this file is the face's pure half. No DOM, no React.
import type { Box, View } from "./model";

export const MARKS = ["cut", "redo", "keep", "new", "you"] as const;
export type Mark = (typeof MARKS)[number];
/** each mark's colour (the window outline page's five tabs); "you" is the ink */
export const MARK_COLOUR: Record<Mark, string> = { cut: "#d0453a", redo: "#c98a1b", keep: "#3d7a4a", new: "#2d6cc4", you: "var(--ink)" };
export type Show = "today" | "after" | "both";
export type Lens = {
  focus?: string; path?: string[]; say?: string; step?: [number, number]; mark?: Record<string, Mark>;
  fit?: "path" | "area" | string; view?: "lanes" | "window"; show?: Record<string, Show>;
};

/** the lens as the face draws it: only what the view holds, numbered and joined */
export type Lensed = {
  view: "lanes" | "window";
  focus: string | null;
  /** the path's systems in order, each drawn */
  path: string[];
  /** 1-based, by id */
  num: Map<string, number>;
  /** each step of the path: the wire it walks, or a gap where no wire joins the two (drawn dashed) */
  legs: { from: string; to: string; missing: boolean }[];
  say: string;
  step: [number, number] | null;
  mark: Map<string, Mark>;
  /** what the camera fits: these systems, the whole area, or nothing (the camera stays) */
  fit: string[] | "area" | null;
  show: Map<string, Show>;
  /** whether the lens dims what it does not name (a path does) */
  dims: boolean;
};
export const NO_LENS: Lensed = { view: "lanes", focus: null, path: [], num: new Map(), legs: [], say: "", step: null, mark: new Map(), fit: null, show: new Map(), dims: false };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** the lens a body carries, its fields of the wrong type dropped (the engine refused them already; an old body or a
 *  hand-written one must never break the block) (pure) */
export function lensIn(body: unknown): Lens | null {
  const l = isObj(body) ? body.lens : undefined;
  if (!isObj(l)) return null;
  const out: Lens = {};
  if (typeof l.focus === "string") out.focus = l.focus;
  if (Array.isArray(l.path)) out.path = l.path.filter((x): x is string => typeof x === "string");
  if (typeof l.say === "string") out.say = l.say;
  if (Array.isArray(l.step) && l.step.length === 2 && l.step.every((x) => Number.isInteger(x))) out.step = [l.step[0] as number, l.step[1] as number];
  if (isObj(l.mark)) out.mark = Object.fromEntries(Object.entries(l.mark).filter(([, v]) => (MARKS as readonly unknown[]).includes(v))) as Record<string, Mark>;
  if (typeof l.fit === "string") out.fit = l.fit;
  if (l.view === "lanes" || l.view === "window") out.view = l.view;
  if (isObj(l.show)) out.show = Object.fromEntries(Object.entries(l.show).filter(([, v]) => v === "today" || v === "after" || v === "both")) as Record<string, Show>;
  return out;
}

/** a key that changes whenever the agent writes a different lens: the person's own clicks and camera are let go then */
export const lensKey = (l: Lens | null) => (l ? JSON.stringify(l) : "");

/** the lens over the view: ids the view does not draw are left out (pure) */
export function lensOf(v: View, l: Lens | null): Lensed {
  if (!l) return { ...NO_LENS, num: new Map(), mark: new Map(), show: new Map() };
  const has = new Set(v.tiles.map((t) => t.id));
  const path = (l.path ?? []).filter((id, i, a) => has.has(id) && a.indexOf(id) === i);
  const joined = (a: string, b: string) => v.wires.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const legs = path.slice(1).map((to, i) => ({ from: path[i], to, missing: !joined(path[i], to) }));
  const focus = l.focus && has.has(l.focus) ? l.focus : null;
  const fit = l.fit === "area" ? "area" : l.fit === "path" ? (path.length ? path : focus ? [focus] : null) : l.fit && has.has(l.fit) ? [l.fit] : null;
  const step = l.step && l.step[1] >= 1 && l.step[0] >= 1 && l.step[0] <= l.step[1] ? l.step : null;
  return {
    view: l.view ?? "lanes", focus, path, num: new Map(path.map((id, i) => [id, i + 1])), legs,
    say: (l.say ?? "").trim(), step,
    mark: new Map(Object.entries(l.mark ?? {}).filter(([id]) => has.has(id))),
    fit, show: new Map(Object.entries(l.show ?? {}).filter(([id]) => has.has(id))), dims: path.length > 0,
  };
}

/** what a tile looks like under the lens and the hand: the hand's pick wins (it is the person's); else the lens's focus
 *  is the pick, and a path dims what it does not walk (pure) */
export function tileLook(id: string, ln: Lensed, hand: string | null): { sel: boolean; dim: boolean; num: number | null; mark: Mark | null } {
  const num = ln.num.get(id) ?? null, mark = ln.mark.get(id) ?? null;
  if (hand) return { sel: hand === id, dim: false, num: null, mark };
  return { sel: ln.focus === id, dim: ln.dims && num === null && ln.focus !== id, num, mark };
}

/** the camera that fits these boxes in a w×h block with `pad` around them, never closer than 1.4 nor farther than 0.25,
 *  `top` px kept free for the strip (pure) */
export function fitCam(boxes: Box[], w: number, h: number, top = 92, pad = 40): { x: number; y: number; k: number } | null {
  if (!boxes.length || w <= 0 || h <= 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const room = { w: Math.max(80, w - 2 * pad), h: Math.max(80, h - top - 2 * pad) };
  const k = Math.max(0.25, Math.min(1.4, room.w / Math.max(1, x1 - x0), room.h / Math.max(1, y1 - y0)));
  return { k, x: w / 2 - ((x0 + x1) / 2) * k, y: top + pad + room.h / 2 - ((y0 + y1) / 2) * k };
}

/** the words a step press sends the session, so the agent knows which block and which way (pure) */
export function stepWords(area: string, step: [number, number], dir: -1 | 1): string {
  const to = Math.max(1, Math.min(step[1], step[0] + dir));
  return `${dir > 0 ? "→" : "←"} On the system block of ${area}: take me to step ${to} of ${step[1]} (from ${step[0]}).`;
}

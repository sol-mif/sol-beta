// One Jelly, several windows onto it (#1090): the rules the face draws by, pure, so the tests reach them. The engine
// keeps the one record (sol/engine/src/screens.ts, parts/screens.ts); a window reads it and draws its share of the one
// state: the same sessions, the same blocks, its own role and its own layout.
import type { Seen } from "../stage/store.ts";
import type { Place, StageJson } from "../stage/model.ts";

export const ROLES = ["whole", "anchor", "stage", "wall", "watch"] as const;
export type Role = (typeof ROLES)[number];
export const HOME = "main";
export type Screen = { x: number; y: number; w: number; h: number; main?: boolean; name?: string };
export type Win = { win: string; role: Role; screen?: Screen; live: boolean; at: number };
export type Lay = { id: string; x: number; y: number; w: number; h: number; z?: number; folded?: boolean };
export type ScreensState = { home: string; keeps?: string; windows: Win[]; where: Record<string, string>; open: Record<string, string>; lay: Record<string, Record<string, Lay[]>>; kept: Record<string, unknown> };
export const NONE: ScreensState = { home: HOME, windows: [], where: {}, open: {}, lay: {}, kept: {} };
export type Edge = "left" | "right" | "top" | "bottom";

const WIN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** which window this page is: `?screen=<win>` on its link, else the main window (pure) */
export function winOf(search: string): string {
  const w = new URLSearchParams(search).get("screen");
  return w && WIN.test(w) ? w : HOME;
}
/** the role a page asks for on its link (`?role=anchor`), else none: the engine's kept role wins (pure) */
export function roleAsked(search: string): Role | undefined {
  const r = new URLSearchParams(search).get("role");
  return r && (ROLES as readonly string[]).includes(r) ? (r as Role) : undefined;
}

/** where a block nobody threw is drawn: the window that keeps them (`keeps`, main at first) while it is live and draws a
 *  stage; else the live stage window, a whole one, a wall (pure). That window also keeps the engine's own layout of the
 *  stage; every other window keeps its own. A second window opened by a throw holds only what was carried to it */
export function homeOf(s: { windows: { win: string; role: string; live: boolean }[]; home: string; keeps?: string }): string {
  const live = s.windows.filter((w) => w.live && w.role !== "anchor" && w.role !== "watch");
  const k = s.keeps ?? s.home;
  if (live.some((w) => w.win === k)) return k;
  return (live.find((w) => w.role === "stage") ?? live.find((w) => w.role === "whole") ?? live.find((w) => w.role === "wall"))?.win ?? s.home;
}
/** which window draws a block now: its line if that window is live, else homeOf (the engine's drawnOn, pure) */
export function drawnOn(s: Pick<ScreensState, "windows" | "where" | "home" | "keeps">, block: string): string {
  const w = Object.prototype.hasOwnProperty.call(s.where, block) ? s.where[block] : undefined;   // never an inherited key
  return w && s.windows.some((x) => x.win === w && x.live && x.role !== "anchor") ? w : homeOf(s);   // an anchor draws no blocks
}
/** the windows live now, this one first */
export const liveWins = (s: ScreensState, me: string) => s.windows.filter((w) => w.live).sort((a, b) => (a.win === me ? -1 : b.win === me ? 1 : 0));
/** the other live windows */
export function otherWins(s: ScreensState, me: string): Win[] { return s.windows.filter((w) => w.live && w.win !== me); }

/** the edge of `me` that faces `other`: the side the other's centre lies toward, by the larger gap (pure) */
export function facing(me: Screen, other: Screen): Edge {
  const dx = other.x + other.w / 2 - (me.x + me.w / 2), dy = other.y + other.h / 2 - (me.y + me.h / 2);
  // normalised by the sizes, so a tall monitor above a laptop reads as top, a wide one beside it as right
  return Math.abs(dx) / (me.w + other.w) >= Math.abs(dy) / (me.h + other.h) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
}
/** the edge a pointer left the window by (client coordinates against the window's size), or null inside (pure) */
export function leftBy(win: { w: number; h: number }, x: number, y: number): Edge | null {
  if (x < 0) return "left";
  if (x > win.w) return "right";
  if (y < 0) return "top";
  if (y > win.h) return "bottom";
  return null;
}
/** the edge of this window that faces another: by their screens; when the two stand on the same rect (one screen, or a
 *  browser that does not say where its windows are) the main window's right faces the other's left (pure) */
export function edgeToward(me: string, home: string, mine: Screen | undefined, o: Win): Edge {
  const same = !mine || !o.screen || (mine.x === o.screen.x && mine.y === o.screen.y && mine.w === o.screen.w && mine.h === o.screen.h);
  if (same) return me === home ? "right" : "left";
  return facing(mine!, o.screen!);
}
/** the throw: a block let go past an edge lands on the window that edge faces; past another edge it does not (pure) */
export function throwTo(s: ScreensState, me: string, mine: Screen | undefined, by: Edge | null): Win | null {
  if (!by) return null;
  const others = s.windows.filter((w) => w.live && w.win !== me && w.role !== "anchor");   // an anchor takes no blocks
  return others.find((o) => edgeToward(me, s.home, mine, o) === by) ?? null;
}

/** a window's share of a session's stage: the blocks drawn on it; the main window keeps the engine's places, any other
 *  its own (missing: none, so the stage finds them a spot, tiled) (pure) */
/** a window's room filled by what it holds (design NOW 01:45 #1): one is full; two are halves; three are one at 56%
 *  and two stacked beside it; past three, three open and the rest folded (by name at the bottom edge) (pure) */
export function fill(ids: string[], room: { w: number; h: number }, gap = 12): Lay[] {
  const W = Math.max(200, room.w - 2 * gap), H = Math.max(160, room.h - 2 * gap), x0 = gap, y0 = gap;
  const half = (W - gap) / 2, big = Math.round(W * 0.56), rest = W - big - gap, stack = (H - gap) / 2;
  return ids.map((id, i) => {
    if (ids.length === 1) return { id, x: x0, y: y0, w: W, h: H, z: 1 };
    if (ids.length === 2) return { id, x: x0 + i * (half + gap), y: y0, w: half, h: H, z: i + 1 };
    if (i === 0) return { id, x: x0, y: y0, w: big, h: H, z: 1 };
    if (i <= 2) return { id, x: x0 + big + gap, y: y0 + (i - 1) * (stack + gap), w: rest, h: stack, z: i + 1 };
    return { id, x: x0, y: y0, w: 440, h: 300, z: i + 1, folded: true };
  }).map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h) }));
}
export function share(seen: Seen, s: ScreensState, me: string, session: string, room: { w: number; h: number } = { w: 1200, h: 760 }): Seen {
  if (!s.windows.length) return seen;
  const mine = new Set(seen.blocks.filter((b) => drawnOn(s, b.id) === me).map((b) => b.id));
  const blocks = seen.blocks.filter((b) => mine.has(b.id));
  if (me === homeOf(s)) {
    if (blocks.length === seen.blocks.length) return seen;
    return { ...seen, blocks, stage: { ...seen.stage, blocks: seen.stage.blocks.filter((p) => mine.has(p.id)) } };
  }
  // its own layout while it holds the same blocks it was made for; a block in or out and the room is filled again
  // a closed block takes no room (it was counted, and a fourth block folded the newest away); one that waits on the
  // person is never the one folded past three: it goes first
  const open = blocks.filter((b) => b.state !== "dead");
  const order = [...open.filter((b) => b.state === "waits"), ...open.filter((b) => b.state !== "waits")];
  const dead = new Set(blocks.filter((b) => b.state === "dead").map((b) => b.id));
  const ownList = (s.lay[me]?.[session] ?? []).filter((p) => !dead.has(p.id)), own = new Map(ownList.map((p) => [p.id, p]));
  const same = ownList.length === open.length && open.every((b) => own.has(b.id)) && !open.some((b) => b.state === "waits" && own.get(b.id)?.folded);
  const laid = same ? open.map((b, i) => ({ ...own.get(b.id)!, z: own.get(b.id)!.z ?? i + 1 })) : fill(order.map((b) => b.id), room);
  const places: Place[] = laid.map((p) => ({ ...p, z: p.z ?? 1, popped: false, pinned: false }));
  return { ...seen, blocks, stage: { ...seen.stage, blocks: places }, tray: [] };
}
/** a layout written from a window's share: the main window's goes to the engine with the places of the blocks drawn
 *  elsewhere kept as they were (so a block pulled home lands where it stood); another window's is its own (pure) */
export function layoutOut(next: StageJson, full: StageJson, s: ScreensState, me: string): { engine?: StageJson; own?: Lay[] } {
  if (me !== homeOf(s)) return { own: next.blocks.map(({ id, x, y, w, h, z, folded }) => ({ id, x, y, w, h, z, ...(folded ? { folded } : {}) })) };
  const shown = new Set(next.blocks.map((p) => p.id));
  const kept = full.blocks.filter((p) => !shown.has(p.id) && drawnOn(s, p.id) !== me);
  return { engine: { ...next, blocks: [...next.blocks, ...kept] } };
}

/** what stays on every window: how many sessions wait on you, how many run (pure) */
export function anchorFacts(rows: { st: string }[]): { waits: number; runs: number } {
  let waits = 0, runs = 0;
  for (const r of rows) { if (r.st === "waits" || r.st === "asks" || r.st === "needs") waits++; else if (r.st === "running") runs++; }
  return { waits, runs };
}

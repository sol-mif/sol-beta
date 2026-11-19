// The stage's model (#696, sitting 2): the shapes the design page's §2 names (block.json, stage.json) and the geometry
// of play.html's §10, ported line for line as pure functions: snap to the stage's edges, the other blocks' edges and
// the gap, then the grid of 8; the edge slots; the grip's snapping; tile; the first free spot. No DOM, no React, so the
// face's tests run it (src/stage.test.ts). The numbers are the prototype's; the spaces are the scale's (tokens.json).
import { chipWords, isRunBody } from "./kinds/runs.ts";

/** the kinds a block can be; browser and terminal draw in sitting 5 */
export type Kind = "page" | "list" | "shots" | "card" | "table" | "diff" | "browser" | "terminal" | "system" | "session" | "clock" | "systems";
/** a block's state, as its frame shows it: live green dot, working the bands drift, waits yellow, frozen pearl, dead gone */
export type State = "live" | "working" | "waits" | "frozen" | "dead";
export type Version = { n: number; at: number; by: string };
/** block.json: one thing the agent made; it lives once, in the project's home, with a ledger */
export type Block = {
  id: string; kind: Kind; title: string; bind?: { source: string; watch?: string }; state: State;
  parent?: string | null; versions: Version[]; sessions: string[];
  /** body/: the thing itself, as its kind reads it (kinds/index.ts) */
  body?: unknown;
  /** the project's (#703): it shows in every session of the project (a run's list), folded to its chip until opened */
  scope?: "project";
  /** when it was made (the engine's block.json) */
  at?: number;
  /** it asks the person (#1298): the press at its foot; answered once */
  asks?: Asks;
};
/** a block's ask (#1298, the engine's blocks.ts Asks): the question, its choices, who asks, and the answer once pressed */
export type Asks = { q: string; choices: string[]; by: string; from?: { login: string; agent: boolean }; about?: number;
  ref: { kind: "self" | "hand" | "offer" | "answer" | "issue" | "ask"; id: string }; /** the day it was pressed later */ later?: string; answer?: { choice: string; by: string; at: number } };
/** this session's own: made here (the first session it was on), or asking for you, or being worked on. The rest was
 *  carried in from earlier sessions and is shown as one count until asked for */
export const ownHere = (b: Block, session: string): boolean => b.sessions[0] === session || b.state === "waits" || b.state === "working";
/** blocks by the session that made each (the first it was on), the newest block's group first; `titleOf` names a group
 *  by its session's title, "an earlier session" when it is not known */
export function madeIn(blocks: Block[], titleOf?: (session: string) => string | undefined): { from: string; name: string; blocks: Block[] }[] {
  const by = new Map<string, Block[]>();
  for (const b of blocks) { const k = b.sessions[0] ?? ""; by.set(k, [...(by.get(k) ?? []), b]); }
  return [...by].map(([from, bs]) => ({ from, name: titleOf?.(from) ?? "an earlier session", blocks: bs })).reverse();
}
/** the file a block shows, short: its folder and name ("atlas-1109/redundancy.html"); "" when it is bound to none */
export const fileOf = (b: Block): string => (b.bind?.source ?? "").replace(/^file:\/\//, "").split(/[?#]/)[0].split("/").filter(Boolean).slice(-2).join("/");
/** one line of ledger.jsonl: composed · bound · ran · waits · yes · frozen · carried · closed */
export type Line = { at: number; by: string; what: string };
/** a block's place on one session's stage */
export type Place = {
  id: string; x: number; y: number; w: number; h: number; z: number; folded?: boolean;
  /** popped out (#701): its own window over the desktop; the stage keeps its slot as a chip */
  popped?: boolean;
  /** folded by a lens (#701): leaving the lens unfolds it where it was */
  lensed?: boolean;
  /** the TUI lens's own terminal (#701): made by the lens, folded when you leave it */
  tui?: boolean;
  /** where a terminal the TUI lens borrowed sat before it went full: leaving puts it back */
  was?: Rect;
  /** moved or resized by the person's hand (#739): never folded to the tray to make room */
  hand?: boolean;
  /** a ghost (#737): the agent offered it, nobody took it yet; the frame alone, dashed, the title in the head, no body.
   *  The engine sets it (blocks.ts ghostly); a press takes it (the mark goes) */
  ghost?: boolean;
};
export type Lens = "app" | "tui" | "cli" | "ide";
/** a ledger line a new session opens with (#700): the block it is of, by its title */
export type StartLine = { at: number; by: string; ev: string; note?: string; title: string };
/** how a session opened (#700): the session it came from, when, and the project's last ledger lines */
export type Opening = { from?: string; at: number; lines: StartLine[] };
/** the talk's docks (#734, v4 §2): a column at the left or the right, a row at the foot, or the talk alone. v4: joins grid
 *  (step 2, #737): the fifth, among the blocks, is one more word here and one more ghost in DOCK_GHOSTS */
export type Dock = "left" | "right" | "bottom" | "full";
/** the talk's place in stage.json: its dock, its width as a share of the room (the seam, dragged), the dock before full */
export type Talk = { dock: Dock; width?: number; was?: Dock };
/** stage.json: a session's references to blocks and their layout, and the talk's dock */
export type StageJson = { lens: Lens; blocks: Place[]; tiled: boolean; start?: Opening; talk?: Talk };
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
/** a slot on the stage, the stage being the room beside the talk (its own box, never the window's) */
export type Zone = "left" | "right" | "full" | "bottom";

// the prototype's numbers: the stage's padding and the gap are the scale's s3 (12), the grid its s2 (8)
export const PAD = 12, GAP = 12, SNAP = 10, GRID = 8, STEP = 24;
/** how close to an edge the pointer must be for its slot: the sides, then the top and the bottom */
export const EDGE_X = 18, EDGE_Y = 14;
/** the smallest a block gets; the room a dragged block keeps on the stage (its head stays reachable) */
export const MIN = { w: 200, h: 120 }, KEEP = 60, HEAD = 36;
/** each kind's size when it is born, at its content's size (v4 §4, the pick "born sizes", #738): tiles of a 6-column
 *  stage with the stage's gap, card 2×1, list 2×2, table 3×2, terminal 3×2, shots 3×2, diff 3×3, page 3×4, browser 3×4.
 *  In pixels today, one tile 136 × 96 (a 6-column stage about 900 wide, rows at the design's floor);
 *  v4: joins slot (#737) — the live slot lays these spans on the grid itself, and this stays the one place they live */
export const SIZES: Record<Kind, [number, number]> = ((tw: number, th: number) => {
  const t = (c: number, r: number): [number, number] => [c * tw + (c - 1) * GAP, r * th + (r - 1) * GAP];
  return { card: t(2, 1), list: t(2, 2), table: t(3, 2), terminal: t(3, 2), shots: t(3, 2), diff: t(3, 3), page: t(3, 4), browser: t(3, 4), system: t(6, 5), session: t(2, 2), clock: t(6, 4), systems: t(6, 5) };
})(136, 96);

/** a guide line where a snap held: x for a vertical line, y for a horizontal one */
export type Guides = { x: number | null; y: number | null };

/** a and b closer than the gap (play.html overlaps) */
export function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.w + GAP <= b.x || b.x + b.w + GAP <= a.x || a.y + a.h + GAP <= b.y || b.y + b.h + GAP <= a.y);
}

/** the first spot a w × h block fits without touching another, scanning rows then columns by 24; null when none */
export function free(stage: Size, w: number, h: number, others: Rect[], left = 0): { x: number; y: number } | null {
  for (let y = PAD; y + h <= stage.h - PAD; y += STEP)
    for (let x = PAD + left; x + w <= stage.w - PAD; x += STEP) {
      const c = { x, y, w, h };
      if (!others.some((o) => overlaps(c, o))) return { x, y };
    }
  return null;
}

/** a dragged block's x, y snapped: to the stage's edges, the others' edges and the gap beside them, else the grid of 8.
 *  Each candidate carries the line its guide is drawn on: the edge that meets, not the block's left */
export function snap(stage: Size, me: Rect, x: number, y: number, others: Rect[], left = 0): { x: number; y: number; guides: Guides } {
  const { w, h } = me;
  const xs: [number, number][] = [[PAD + left, PAD + left], [stage.w - PAD - w, stage.w - PAD]];
  const ys: [number, number][] = [[PAD, PAD], [stage.h - PAD - h, stage.h - PAD]];
  for (const o of others) {
    xs.push([o.x, o.x], [o.x + o.w - w, o.x + o.w], [o.x + o.w + GAP, o.x + o.w + GAP], [o.x - GAP - w, o.x - GAP]);
    ys.push([o.y, o.y], [o.y + o.h - h, o.y + o.h], [o.y + o.h + GAP, o.y + o.h + GAP], [o.y - GAP - h, o.y - GAP]);
  }
  let gx: number | null = null, gy: number | null = null;
  for (const [t, line] of xs) if (Math.abs(x - t) < SNAP) { x = t; gx = line; break; }
  for (const [t, line] of ys) if (Math.abs(y - t) < SNAP) { y = t; gy = line; break; }
  if (gx === null) x = Math.round(x / GRID) * GRID;
  if (gy === null) y = Math.round(y / GRID) * GRID;
  return { x, y, guides: { x: gx, y: gy } };
}

/** the grip: a w × h snapped to the stage's far edges, the others' far edges and the gap before them, else the grid */
export function snapSize(stage: Size, me: Rect, w: number, h: number, others: Rect[]): { w: number; h: number; guides: Guides } {
  w = Math.max(MIN.w, w); h = Math.max(MIN.h, h);
  const xs = [stage.w - PAD - me.x], ys = [stage.h - PAD - me.y];
  for (const o of others) { xs.push(o.x + o.w - me.x, o.x - GAP - me.x); ys.push(o.y + o.h - me.y, o.y - GAP - me.y); }
  let gx: number | null = null, gy: number | null = null;
  for (const t of xs) if (Math.abs(w - t) < SNAP) { w = t; gx = me.x + t; break; }
  for (const t of ys) if (Math.abs(h - t) < SNAP) { h = t; gy = me.y + t; break; }
  if (gx === null) w = Math.round(w / GRID) * GRID;
  if (gy === null) h = Math.round(h / GRID) * GRID;
  return { w: Math.min(w, stage.w - me.x - PAD), h: Math.min(h, stage.h - me.y - PAD), guides: { x: gx, y: gy } };
}

/** where a dragged block stays: its head on the stage, KEEP of it in from the sides */
export function keep(stage: Size, me: Rect, x: number, y: number, left = 0): { x: number; y: number } {
  return { x: Math.max(PAD + left - me.w + KEEP, Math.min(x, stage.w - KEEP)), y: Math.max(0, Math.min(y, stage.h - HEAD)) };
}

/** where a dropped block settles: wholly on the stage, PAD in from its edges (a block bigger than the stage at its
 *  top left). keep lets it hang over an edge while dragged; let go, it never stays half off the stage */
export function settle(stage: Size, r: Rect, left = 0): { x: number; y: number } {
  return { x: Math.max(PAD + left, Math.min(r.x, stage.w - PAD - r.w)), y: Math.max(PAD, Math.min(r.y, stage.h - PAD - r.h)) };
}

/** a place as a stage narrower than it was laid on shows it (the IDE's file column, a smaller window): no wider or
 *  taller than the stage, wholly on it. Shown only: stage.json keeps the place, so the stage widened has it back */
export function fit(stage: Size, r: Rect, left = 0): Rect {
  const w = Math.max(Math.min(MIN.w, r.w), Math.min(r.w, stage.w - 2 * PAD - left)), h = Math.max(Math.min(MIN.h, r.h), Math.min(r.h, stage.h - 2 * PAD));
  return { ...settle(stage, { ...r, w, h }, left), w, h };
}

/** the slot the pointer is over at the stage's edge, if any: the sides a half, the top the whole, the bottom the lower half */
export function zoneAt(stage: Size, px: number, py: number): Zone | null {
  return px < EDGE_X ? "left" : px > stage.w - EDGE_X ? "right" : py < EDGE_Y ? "full" : py > stage.h - EDGE_Y ? "bottom" : null;
}

/** a slot's rect */
export function zoneRect(stage: Size, z: Zone, left = 0): Rect {
  const W = stage.w - 2 * PAD - left, H = stage.h - 2 * PAD, L = PAD + left;
  return z === "left" ? { x: L, y: PAD, w: (W - GAP) / 2, h: H }
    : z === "right" ? { x: L + (W + GAP) / 2, y: PAD, w: (W - GAP) / 2, h: H }
    : z === "bottom" ? { x: L, y: PAD + (H + GAP) / 2, w: W, h: (H - GAP) / 2 }
    : { x: L, y: PAD, w: W, h: H };
}

/** the grid ⌘⇧T lays n blocks in: one column for one, two up to four, three beyond */
export function tile(stage: Size, n: number, left = 0): Rect[] {
  if (n <= 0) return [];
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const W = stage.w - 2 * PAD - left, H = stage.h - 2 * PAD;
  const cw = (W - GAP * (cols - 1)) / cols, ch = (H - GAP * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({ x: PAD + left + (i % cols) * (cw + GAP), y: PAD + Math.floor(i / cols) * (ch + GAP), w: cw, h: ch }));
}

/** the blocks a marquee touches */
export function within(q: Rect, places: Place[]): string[] {
  return places.filter((b) => !b.folded && !(b.x > q.x + q.w || b.x + b.w < q.x || b.y > q.y + q.h || b.y + b.h < q.y)).map((b) => b.id);
}

/** a block's size when born, kept inside the stage */
export function bornSize(stage: Size, kind: Kind, left = 0): Size {
  const [w, h] = SIZES[kind] ?? SIZES.page;
  return { w: Math.min(w, stage.w - 2 * PAD - left), h: Math.min(h, stage.h - 2 * PAD) };
}

/** the word after the dot in a block's head: "live · its source", "frozen · v1", or the state */
export function stateWords(b: Block, shown?: number): string {
  if (isRunBody(b.body)) return chipWords(b.body);   // a run's list says its sessions (#703)
  if (b.state === "frozen") return `frozen · v${shown ?? b.versions.length}`;
  if (b.state === "live" && b.bind?.source) return `live · ${b.bind.source.split("/").pop()}`;
  return b.state;
}

// ── the talk, docked (#734, v4 §2 and rules 1, 2, 6) ─────────────────────────────────────────────────────────────────
// The room is the session's column: the talk and the stage beside it. The talk keeps reading width (64ch), never under
// 44ch; the stage takes the rest and packs tighter when blocks come, never the talk's room. A bottom dock is a row at the
// foot (200 px, rising to 46% of the room while you write); full is the talk alone.
export const TALK = { read: 64, floor: 44, row: 300, rowMin: 200, rowShare: 0.42, rising: 0.46, lines: 2 } as const;
/** #954, behind stage.whole: whole.html draws the talk at one width in every scene, blocks or none: 384 px (the window's
 *  talk column, from the spine to the stage), never under the floor */
export const TALK_WHOLE = 384;
/** #891, behind stage.whole: the talk at the foot holds its head, its box and TALK.lines lines of words, never less
 *  than the row; the box alone filled the row, and the last exchange had no room (pure) */
export const footHeight = (row: number, head: number, box: number, line: number) => Math.round(Math.max(row, head + box + TALK.lines * line));
/** the narrowest the stage beside the talk is let go to while the seam is dragged: the smallest block and its padding */
export const STAGE_FLOOR = MIN.w + 2 * PAD;
export const DEFAULT_TALK: Talk = { dock: "left" };

/** the talk's width in px for a column dock: its kept share of the room, else reading width; never under the floor, and
 *  never so wide the stage is less than its floor (the floor wins when the room is narrower than both) */
export function talkWidth(roomW: number, ch: number, width?: number, stage = STAGE_FLOOR): number {
  const floor = TALK.floor * ch, want = width !== undefined ? width * roomW : TALK.read * ch;
  return Math.round(Math.max(floor, Math.min(want, roomW - Math.max(stage, STAGE_FLOOR))));
}

/** #954, behind stage.whole: the talk at one width (TALK_WHOLE) however many blocks are open, never under its floor and
 *  never over the stage's (main's talkWidth with `open` given; here his talkWidth keeps its own fourth argument) */
export function talkWholeWidth(roomW: number, ch: number): number {
  const floor = TALK.floor * ch;
  return Math.round(Math.max(floor, Math.min(Math.max(floor, TALK_WHOLE), roomW - STAGE_FLOOR)));
}

/** the seam dragged: the share of the room the talk takes with its edge at x (from the room's left), held to the floors */
export function seamShare(dock: Dock, roomW: number, ch: number, x: number): number {
  const w = dock === "right" ? roomW - x : x;
  return talkWidth(roomW, ch, Math.max(0, w) / roomW) / roomW;
}

/** the bottom dock's height: the row, risen while the person writes, never past the room. At rest it holds the box and
 *  the last message's first lines above it (#872 pass 2: at 900 px the talk was only its box), up to 300 px and never
 *  more than 0.42 of the room, never under 200 */
const restRow = (roomH: number) => Math.max(TALK.rowMin, Math.min(TALK.row, TALK.rowShare * roomH));
export const talkRow = (roomH: number, writing: boolean) => Math.round(Math.min(roomH, writing ? Math.max(restRow(roomH), TALK.rising * roomH) : restRow(roomH)));

/** the four ghosts the lifted talk shows, as shares of the room (v4.html's GH, the grid's ghost waiting for step 2) */
export const DOCK_GHOSTS: Record<Dock, Rect> = {
  left: { x: 0.02, y: 0.03, w: 0.3, h: 0.94 },
  right: { x: 0.68, y: 0.03, w: 0.3, h: 0.94 },
  bottom: { x: 0.02, y: 0.71, w: 0.96, h: 0.26 },
  full: { x: 0.34, y: 0.03, w: 0.32, h: 0.18 },
};

/** the dock nearest the pointer (px, py as shares of the room): the ghost it is in, else the closest ghost's edge */
export function nearestDock(px: number, py: number): Dock {
  let best: Dock = "left", d0 = Infinity;
  for (const [k, r] of Object.entries(DOCK_GHOSTS) as [Dock, Rect][]) {
    const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h)), d = Math.hypot(dx, dy);
    if (d < d0) { d0 = d; best = k; }
  }
  return best;
}

/** a dock asked: full remembers the dock it left, so back (⌘↓) returns there; asking the dock it is in changes nothing */
export function dockTo(t: Talk, d: Dock): Talk {
  if (d === t.dock) return t;
  return { ...t, dock: d, ...(d === "full" ? { was: t.dock } : {}) };
}
/** ⌘↓ from full: the dock before, else the default */
export const dockBack = (t: Talk): Talk => (t.dock === "full" ? { ...t, dock: t.was ?? DEFAULT_TALK.dock } : t);

/** the bottom dock's last exchange: your last words and what came after them; all of it when you have said nothing */
export function lastExchange<T extends { kind: string }>(items: T[]): T[] {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === "me") return items.slice(i);
  return items;
}

/** the stage got smaller (the talk took its room back, the seam moved, the window narrowed): each shown block that sticks
 *  out is moved in, and shrunk to the stage when it is wider than it; if that makes two touch, the shown blocks tile.
 *  The talk never gives room to a block (v4 rule 1). null when every block already fits (pure) */
export function fitInto(stage: Size, places: Place[]): Place[] | null {
  const shown = places.filter((p) => !p.folded && !p.popped);
  const fit = (p: Place): Place => {
    // never grown: a block born under the least (a card is one row) keeps its size; shrunk no further than the least
    const w = Math.max(Math.min(MIN.w, p.w), Math.min(p.w, stage.w - 2 * PAD)), h = Math.max(Math.min(MIN.h, p.h), Math.min(p.h, stage.h - 2 * PAD));
    const x = Math.max(PAD, Math.min(p.x, stage.w - PAD - w)), y = Math.max(PAD, Math.min(p.y, stage.h - PAD - h));
    return x === p.x && y === p.y && w === p.w && h === p.h ? p : { ...p, w, h, x, y };
  };
  // out at any edge, the left and the top too (#892); and out only by as much as the least block can never avoid on a
  // stage smaller than it: fitted once, a block asked again stays as it is, so null means nothing to change
  const out = (p: Place) => fit(p) !== p;
  if (!stage.w || !stage.h || !shown.some(out)) return null;
  const moved = places.map((p) => (shown.includes(p) ? fit(p) : p));
  const now = moved.filter((p) => !p.folded && !p.popped);
  if (!now.some((a, i) => now.some((b, j) => j > i && overlaps(a, b)))) return moved;
  const cells = tile(stage, now.length);
  return moved.map((p) => { const i = now.indexOf(p); return i < 0 ? p : { ...p, ...cells[i] }; });
}

/** whether the room holds the stage beside the talk docked there: its floor's width beside a column, its floor's height
 *  over the foot's row; full needs none (pure) */
export function roomFor(dock: Dock, roomW: number, roomH: number, talkW: number, talkH: number): boolean {
  if (dock === "full") return true;
  if (dock === "bottom") return roomH - talkH >= MIN.h + 2 * PAD;
  return roomW - talkW >= STAGE_FLOOR;
}

/** the stage laid by rule (#872, the full material, 2026-11-10): every open block in a cell, none touching another, the
 *  cells sized by the stage and the count, so a window resized, a block opened, folded or closed re-lays them all. The
 *  candidates are the grids (cols × rows, the last row's cells stretched so no hole is left) and, for three, one big
 *  beside two; the one whose smallest cell reads best wins (its short side, a cell's height counted 1.4 times as it
 *  carries more lines), ties to the big beside two. `order` is reading order (the first top left); `big` the block the big
 *  cell is for (the one asking for the eye, else the newest). When not even the floor fits (MIN per cell), the first in
 *  order that is not `big` fold until it does: `folded` names them. A focused, popped or folded block is not laid (pure) */
export function flow(stage: Size, places: Place[], order: string[], big?: string | null): { places: Place[]; folded: string[] } {
  const shown = order.filter((id) => places.some((p) => p.id === id && !p.folded && !p.popped));
  const W = stage.w - 2 * PAD, H = stage.h - 2 * PAD;
  if (!shown.length || W <= 0 || H <= 0) return { places, folded: [] };
  const read = (c: Rect[]) => Math.min(...c.map((r) => Math.min(r.w, r.h * 1.4)));
  const ok = (c: Rect[]) => c.every((r) => r.w >= MIN.w - 0.5 && r.h >= MIN.h - 0.5);
  const grid = (n: number, cols: number): Rect[] => {
    const rows = Math.ceil(n / cols), ch = (H - GAP * (rows - 1)) / rows, out: Rect[] = [];
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(cols, n - r * cols), cw = (W - GAP * (inRow - 1)) / inRow;
      for (let c = 0; c < inRow; c++) out.push({ x: PAD + c * (cw + GAP), y: PAD + r * (ch + GAP), w: cw, h: ch });
    }
    return out;
  };
  // three: the big one beside (a wide stage) or over (a tall one) the other two
  const bigThree = (): Rect[] => W >= H
    ? (() => { const w = (W - GAP) / 2, h = (H - GAP) / 2; return [{ x: PAD, y: PAD, w, h: H }, { x: PAD + w + GAP, y: PAD, w, h }, { x: PAD + w + GAP, y: PAD + h + GAP, w, h }]; })()
    : (() => { const h = (H - GAP) / 2, w = (W - GAP) / 2; return [{ x: PAD, y: PAD, w: W, h }, { x: PAD, y: PAD + h + GAP, w, h }, { x: PAD + w + GAP, y: PAD + h + GAP, w, h }]; })();
  const ids = [...shown], folded: string[] = [];
  for (;;) {
    const n = ids.length;
    let best: { cells: Rect[]; score: number; three: boolean } | null = null;
    for (let cols = 1; cols <= n; cols++) {
      const c = grid(n, cols);
      if (ok(c) && (!best || read(c) > best.score + 0.5)) best = { cells: c, score: read(c), three: false };
    }
    if (n === 3) { const c = bigThree(); if (ok(c) && (!best || read(c) >= best.score - 0.5)) best = { cells: c, score: read(c), three: true }; }
    if (best || n === 1) {
      const cells = best?.cells ?? [{ x: PAD, y: PAD, w: Math.max(W, MIN.w), h: Math.max(H, MIN.h) }];
      // the big cell is the first: the block it is for goes there, the rest keep their order
      const laid = best?.three && big && ids.includes(big) ? [big, ...ids.filter((i) => i !== big)] : ids;
      const at = new Map(laid.map((id, i) => [id, cells[i]]));
      const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.floor(r.w), h: Math.floor(r.h) });
      return { places: places.map((p) => (at.has(p.id) ? { ...p, ...round(at.get(p.id)!) } : folded.includes(p.id) ? { ...p, folded: true } : p)), folded };
    }
    const out = ids.findIndex((id) => id !== big);
    folded.push(ids.splice(out < 0 ? 0 : out, 1)[0]);
  }
}

/** reading order of the open blocks as they stand: by row (a block's top within half a head of another's is the same
 *  row), then left to right; the ones not placed yet last, in the order given */
export function readingOrder(places: Place[], later: string[] = []): string[] {
  const open = places.filter((p) => !p.folded && !p.popped && !later.includes(p.id));
  open.sort((a, b) => (Math.abs(a.y - b.y) < HEAD / 2 ? a.x - b.x : a.y - b.y));
  return [...open.map((p) => p.id), ...later.filter((id) => places.some((p) => p.id === id))];
}

// B9 (#772): the whole stage's geometry, feel.md's numbers, for the stage behind stage.whole; today's stage reads the above
export * as whole from "./geometry.ts";

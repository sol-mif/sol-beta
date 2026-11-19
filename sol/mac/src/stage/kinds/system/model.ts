// The system block's model (#1091): the shapes the engine sends (sol/engine/src/work/systems.ts) and the pure parts of
// drawing them: where each tile sits (lanes from the records, never placed by hand), what grew between two views (born
// tiles, new wires, ring beats that closed, gaps that closed), the few words the "since" strip says, and the trace from
// the why a system answers to, through it, to the surfaces it reaches. No DOM, no React: the face's tests run it.

export const LAYERS = ["why", "rules", "source", "machine", "surface"] as const;
export type Layer = (typeof LAYERS)[number];
/** each lane's name and what it holds, as the prototype (brand.html) says them */
export const LANE_WORDS: Record<Layer, [string, string]> = {
  why: ["Why", "what judges a choice"], rules: ["Rules", "how it is done, decided"], source: ["Source", "the values"],
  machine: ["Machine", "what draws it"], surface: ["Surface", "what a person meets"],
};
export const BEATS = ["signal", "owner", "decision", "change", "check"] as const;
export type Beat = (typeof BEATS)[number];
/** what fills each beat, said on hover */
export const BEAT_WORDS: Record<Beat, string> = {
  signal: "a health probe in its record", owner: "an owner named", decision: "where it was decided (decided: a path and a line)",
  change: "paths to change it (where.paths)", check: "a check that feeds it",
};
export type Ring = Record<Beat, boolean>;
export type Tile = {
  id: string; name: string; about: string; kind: string; state: string; owner: string; layer: Layer; guessed: boolean;
  weight: number; ring: Ring; decided?: string; paths: string[]; machines: string[]; inArea: boolean; note?: string; parts?: string[];
};
export type Gap = { from: string; to: string; why: string };
export type View = { area: string; name: string; about: string; tiles: Tile[]; wires: [string, string][]; gaps: Gap[]; loose: { id: string; name: string }[]; legacy: number };
export type Facts = {
  tokens?: { black: string; window: number; blur: number; corner: number; six: { name: string; hex: string }[] };
  typed?: string[]; site?: { page: string; ink: string };
};
export type Frame = { sha: string; at: number; subject: string; view: View };
export const EMPTY: View = { area: "", name: "", about: "", tiles: [], wires: [], gaps: [], loose: [], legacy: 0 };

// ---- where each tile sits ----
export const TILE_W = 280, LANE_GAP = 72, ROW_GAP = 22, TOP = 0;
/** the systems that wear a face of their own (faces.tsx), and the height each face is drawn at */
export const FACE_H: Record<string, number> = {
  "design/tokens": 190, "face/kit": 158, "face/jelly-body": 158, product: 158, "product/settings/look": 140,
  "design/icon": 158, "marketing/site": 186,
  // the real pieces (#1220): the kit's own components as they are today, and with the lens's show "after" the sitting's
  "product/buttons": 150, "product/build/composer": 150, "product/build/sidebar": 150,
  "product/build/frame": 170, "design/redesign/accent": 150, "design/redesign/body": 150,
};
/** the tiles that draw a real piece, so the lens's `show` (today, after, both) means something on them */
export const REAL_PIECES = ["product/buttons", "product/build/composer", "product/build/sidebar", "product/build/frame", "design/redesign/accent", "design/redesign/body"] as const;
/** a tile's height: its face's, else the generic face's (about, kind, paths); one hop out, a short tile */
export const heightOf = (t: Pick<Tile, "id" | "inArea">) => FACE_H[t.id] ?? (t.inArea ? 136 : 74);
export const laneX = (l: Layer) => LAYERS.indexOf(l) * (TILE_W + LANE_GAP);
export type Box = { x: number; y: number; w: number; h: number };
/** every tile's box: its lane's column, stacked in the order the engine sent (heaviest first) (pure) */
export function layout(v: View): Map<string, Box> {
  const out = new Map<string, Box>(), y: Record<string, number> = {};
  for (const t of v.tiles) {
    const at = y[t.layer] ?? TOP, h = heightOf(t);
    out.set(t.id, { x: laneX(t.layer), y: at, w: TILE_W, h });
    y[t.layer] = at + h + ROW_GAP;
  }
  return out;
}
/** the world's size: five lanes wide, as tall as the tallest lane */
export function worldOf(boxes: Map<string, Box>): { w: number; h: number } {
  let h = 0;
  for (const b of boxes.values()) h = Math.max(h, b.y + b.h);
  return { w: laneX("surface") + TILE_W, h };
}

/** a wire's path: within one lane from the bottom of the upper tile to the top of the lower; across lanes from the right
 *  edge to the left edge, at the head's height (pure) */
export function wirePath(a: Box, b: Box, sameLane: boolean): string {
  if (sameLane) {
    const x1 = a.x + a.w / 2, x2 = b.x + b.w / 2;
    const [y1, y2] = a.y < b.y ? [a.y + a.h, b.y] : [a.y, b.y + b.h], my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }
  const [x1, y1] = a.x < b.x ? [a.x + a.w, a.y + 26] : [a.x, a.y + 26];
  const [x2, y2] = a.x < b.x ? [b.x, b.y + 26] : [b.x + b.w, b.y + 26];
  const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (a.x < b.x ? 1 : -1);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// ---- up and down ----
export function upOf(id: string, wires: [string, string][]): Set<string> {
  const s = new Set<string>(), q = [id];
  while (q.length) { const x = q.shift()!; for (const [a, b] of wires) if (b === x && !s.has(a) && a !== id) { s.add(a); q.push(a); } }
  return s;
}
export function downOf(id: string, wires: [string, string][]): Set<string> {
  const s = new Set<string>(), q = [id];
  while (q.length) { const x = q.shift()!; for (const [a, b] of wires) if (a === x && !s.has(b) && b !== id) { s.add(b); q.push(b); } }
  return s;
}
/** the trace: the chain up to the why it answers to (each step the leftmost-lane feeder), it, and every surface it
 *  reaches (pure) */
export function traceOf(id: string, v: View): { up: string[]; me: string; surfaces: string[] } {
  const lane = new Map(v.tiles.map((t) => [t.id, LAYERS.indexOf(t.layer)]));
  const up: string[] = [];
  for (let x = id; ;) {
    const ins = v.wires.filter(([, b]) => b === x).map(([a]) => a).filter((a) => a !== id && !up.includes(a))
      .sort((a, b) => (lane.get(a) ?? 9) - (lane.get(b) ?? 9) || a.localeCompare(b));
    if (!ins.length) break;
    up.unshift(ins[0]); x = ins[0];
  }
  const surfaces = [...downOf(id, v.wires)].filter((d) => lane.get(d) === LAYERS.indexOf("surface"));
  return { up, me: id, surfaces };
}

// ---- what grew ----
export type Grew = {
  born: string[]; gone: string[]; wires: string[]; cut: string[];
  /** ring beats that closed: "<id>:<beat>" */
  closed: string[];
  /** ring beats that opened again */
  opened: string[];
  /** gaps that closed (the wire came, or the record dropped it): "<from>><to>" */
  mended: string[]; gaps: string[];
  /** systems whose record changed in a way the tile shows (lane, name, about, paths, state) */
  changed: string[];
};
const wk = ([a, b]: [string, string]) => `${a}>${b}`;
/** the difference between two views of an area, as the face animates it and the since strip counts it (pure) */
export function grew(before: View, after: View): Grew {
  const was = new Map(before.tiles.map((t) => [t.id, t])), is = new Map(after.tiles.map((t) => [t.id, t]));
  const bw = new Set(before.wires.map(wk)), aw = new Set(after.wires.map(wk));
  const bg = new Set(before.gaps.map((g) => `${g.from}>${g.to}`)), ag = new Set(after.gaps.map((g) => `${g.from}>${g.to}`));
  const out: Grew = { born: [], gone: [], wires: [], cut: [], closed: [], opened: [], mended: [], gaps: [], changed: [] };
  for (const id of is.keys()) if (!was.has(id)) out.born.push(id);
  for (const id of was.keys()) if (!is.has(id)) out.gone.push(id);
  for (const k of aw) if (!bw.has(k)) out.wires.push(k);
  for (const k of bw) if (!aw.has(k)) out.cut.push(k);
  for (const k of bg) if (!ag.has(k)) out.mended.push(k);
  for (const k of ag) if (!bg.has(k)) out.gaps.push(k);
  for (const [id, t] of is) {
    const o = was.get(id);
    if (!o) continue;
    for (const b of BEATS) { if (t.ring[b] && !o.ring[b]) out.closed.push(`${id}:${b}`); if (!t.ring[b] && o.ring[b]) out.opened.push(`${id}:${b}`); }
    if (o.layer !== t.layer || o.guessed !== t.guessed || o.name !== t.name || o.about !== t.about || o.state !== t.state || o.paths.join() !== t.paths.join()) out.changed.push(id);
  }
  return out;
}
/** whether anything grew at all */
export const grewAny = (g: Grew) => Object.values(g).some((x) => x.length > 0);

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const list = (names: string[], max = 2) => names.slice(0, max).join(", ") + (names.length > max ? ` and ${names.length - max} more` : "");
/** what grew, in a few words: "2 new: the tokens test, the modes · 3 wires · 2 beats closed · a gap closed" (pure) */
export function growWords(g: Grew, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  if (g.born.length) parts.push(`${g.born.length} new: ${list(g.born.map(nameOf))}`);
  if (g.wires.length) parts.push(n(g.wires.length, "new wire"));
  if (g.closed.length) parts.push(`${n(g.closed.length, "beat")} closed`);
  if (g.mended.length) parts.push(g.mended.length === 1 ? "a gap closed" : `${g.mended.length} gaps closed`);
  if (g.gaps.length) parts.push(g.gaps.length === 1 ? "a gap found" : `${g.gaps.length} gaps found`);
  if (g.changed.length) parts.push(`${list(g.changed.map(nameOf))} changed`);
  if (g.gone.length) parts.push(`${n(g.gone.length, "system")} left`);
  if (g.opened.length) parts.push(`${n(g.opened.length, "beat")} opened`);
  if (g.cut.length) parts.push(`${n(g.cut.length, "wire")} cut`);
  return parts.join(" · ");
}
/** the view as it stood when the person last looked: the last frame at or before then; none when they never looked or
 *  the area is younger than their look (pure) */
export function viewAt(frames: Frame[], at: number): View | null {
  let v: View | null = null;
  for (const f of frames) if (f.at <= at) v = f.view;
  return v;
}
const day = (t: number) => new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** the since strip's words: what grew between his last look and now, or that this is his first look (pure) */
export function sinceWords(frames: Frame[], now: View, looked: number | null, nameOf: (id: string) => string): string {
  if (looked === null) {
    const first = frames[0];
    return first ? `First look. Grown from ${n(frames.length, "change")} since ${day(first.at)}: ${n(now.tiles.length, "system")}, ${n(now.wires.length, "wire")}.` : `First look: ${n(now.tiles.length, "system")}.`;
  }
  const then = viewAt(frames, looked) ?? EMPTY, g = grew(then, now);
  return grewAny(g) ? `Since you looked (${day(looked)}): ${growWords(g, nameOf)}.` : `Nothing grew since you looked (${day(looked)}).`;
}

// ---- the work under way (#1156): which sessions change which systems now (sol/engine/src/work/systemsLive.ts) ----
export type Work = {
  system: string; session: string; title: string; person: string; branch: string; files: string[]; at: number;
  behind: number; ahead: number; machine?: string;
};
export type Unclaimed = { folder: string; files: string[]; session: string; title: string; person: string; branch: string; at: number; near?: string };
export type Live = { at: number; work: Work[]; uncovered: Unclaimed[]; prs: Record<string, number[]> };
/** the tile a system's work shows on: the system's own, else the nearest drawn system above it by id */
export function tileFor(system: string, drawn: Set<string>): string | null {
  for (let id = system; id; id = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "") if (drawn.has(id)) return id;
  return null;
}
/** each drawn tile's work, one line per session (the newest change first), and its open PRs */
export function workOn(live: Live | null, drawn: Set<string>): Map<string, { work: Work[]; prs: number[] }> {
  const out = new Map<string, { work: Work[]; prs: number[] }>();
  const on = (id: string) => { let o = out.get(id); if (!o) out.set(id, (o = { work: [], prs: [] })); return o; };
  for (const w of live?.work ?? []) {
    const t = tileFor(w.system, drawn); if (!t) continue;
    const o = on(t), was = o.work.find((x) => x.session === w.session);
    if (!was) o.work.push({ ...w, files: [...w.files] });
    else { was.files = [...new Set([...was.files, ...w.files])].sort(); was.at = Math.max(was.at, w.at); }
  }
  for (const [system, prs] of Object.entries(live?.prs ?? {})) {
    const t = tileFor(system, drawn); if (!t) continue;
    const o = on(t); o.prs = [...new Set([...o.prs, ...prs])].sort((a, b) => a - b);
  }
  for (const o of out.values()) o.work.sort((a, b) => b.at - a.at);
  return out;
}
/** the systems whose work moved between two readings: a new session on one, a newer change, or more files */
export function movedSystems(before: Live, after: Live): string[] {
  const out = new Set<string>();
  for (const w of after.work) {
    const b = before.work.find((x) => x.system === w.system && x.session === w.session);
    if (!b || w.at > b.at || w.files.length > b.files.length) out.add(w.system);
  }
  return [...out];
}
/** a session's line on a mark: who, from which session, and how far its branch is from main */
export const workWords = (w: Work) => `${w.person} · ${w.title}${w.behind > 0 ? ` · ${w.behind} behind main` : ""}`;
export const workTitle = (w: Work) =>
  `${w.person} changes this from "${w.title}" on ${w.branch}${w.machine ? ` (${w.machine})` : ""}: ${w.files.length} file${w.files.length === 1 ? "" : "s"}, ` +
  `${w.ahead} commit${w.ahead === 1 ? "" : "s"} ahead of main, ${w.behind} behind. Press to open the session.\n${w.files.slice(0, 12).join("\n")}${w.files.length > 12 ? `\n… ${w.files.length - 12} more` : ""}`;

// ---- the window view (#1220): the area on a miniature of the real window ----
/** the window the miniature is drawn from, in its own px (the Mac's 1280×800, the frame's geometry: kit/geometry.ts) */
export const WIN = { w: 1280, h: 800 } as const;
const SPINE = 52, SIDE = 264, ROW = 44, TALK = 420;
/** where each surface sits on the window, in WIN px. Drawn in this
 *  order, so a region inside another (settings at the spine's foot, the composer at the talk's, a block on the stage)
 *  stands over it */
export const REGIONS: readonly { id: string; word: string; at: Box }[] = [
  { id: "product/spine", word: "spine", at: { x: 0, y: 0, w: SPINE, h: WIN.h } },
  { id: "product/build/sidebar", word: "side", at: { x: SPINE, y: 0, w: SIDE, h: WIN.h } },
  { id: "product/buttons", word: "bar", at: { x: SPINE + SIDE, y: 0, w: WIN.w - SPINE - SIDE, h: ROW } },
  { id: "product/build/talk", word: "talk", at: { x: SPINE + SIDE, y: ROW, w: TALK, h: WIN.h - ROW } },
  { id: "product/build/stage", word: "stage", at: { x: SPINE + SIDE + TALK, y: ROW, w: WIN.w - SPINE - SIDE - TALK, h: WIN.h - ROW } },
  { id: "product/build/frame", word: "a block", at: { x: SPINE + SIDE + TALK + 24, y: ROW + 32, w: WIN.w - SPINE - SIDE - TALK - 48, h: 320 } },
  { id: "product/build/composer", word: "composer", at: { x: SPINE + SIDE + 16, y: WIN.h - 112, w: TALK - 32, h: 96 } },
  { id: "product/settings", word: "settings", at: { x: 4, y: WIN.h - 52, w: SPINE - 8, h: 44 } },
];
/** the miniature's scale, the column of systems beside it, and the room left above it */
export const WIN_K = 0.62, BESIDE_W = 230, BESIDE_H = 54, BESIDE_GAP = 10, WIN_GAP = 110, WIN_TOP = 48;
export type WindowLayout = {
  /** the window's own box, in the world */
  win: Box;
  /** every region, in the world; `id` drawn when the view holds that record */
  regions: { id: string; word: string; box: Box; drawn: boolean }[];
  /** the systems that sit on no region, in columns beside the window, the lanes' order */
  beside: Map<string, Box>;
  /** every drawn thing's box by id (a region's or a beside tile's), for wires, the camera and the lens */
  boxes: Map<string, Box>;
  w: number; h: number;
};
/** the area on the window: each surface record on the region its surface occupies, the rest beside it in columns of as
 *  many as stand beside the window's height (pure) */
export function windowLayout(v: View): WindowLayout {
  const has = new Set(v.tiles.map((t) => t.id)), placed = new Set(REGIONS.map((r) => r.id));
  const rest = v.tiles.filter((t) => !placed.has(t.id));
  const perCol = Math.max(1, Math.floor((WIN.h * WIN_K + BESIDE_GAP) / (BESIDE_H + BESIDE_GAP)));
  const cols = Math.max(1, Math.ceil(rest.length / perCol));
  const winX = cols * (BESIDE_W + BESIDE_GAP) - BESIDE_GAP + WIN_GAP;
  const win: Box = { x: winX, y: WIN_TOP, w: WIN.w * WIN_K, h: WIN.h * WIN_K };
  const beside = new Map<string, Box>(), boxes = new Map<string, Box>();
  rest.forEach((t, i) => {
    const c = Math.floor(i / perCol), r = i % perCol;
    const b = { x: (cols - 1 - c) * (BESIDE_W + BESIDE_GAP), y: WIN_TOP + r * (BESIDE_H + BESIDE_GAP), w: BESIDE_W, h: BESIDE_H };
    beside.set(t.id, b); boxes.set(t.id, b);
  });
  const regions = REGIONS.map((r) => {
    const box = { x: win.x + r.at.x * WIN_K, y: win.y + r.at.y * WIN_K, w: r.at.w * WIN_K, h: r.at.h * WIN_K };
    if (has.has(r.id)) boxes.set(r.id, box);
    return { id: r.id, word: r.word, box, drawn: has.has(r.id) };
  });
  return { win, regions, beside, boxes, w: win.x + win.w, h: win.y + win.h };
}
/** a wire from a system beside the window into the region it feeds (or from the region out to it): from the near edge
 *  of one to the near edge of the other, at a height inside both where it can (pure) */
export function windowWire(a: Box, b: Box): string {
  const [l, r] = a.x + a.w <= b.x ? [a, b] : [b, a];
  const x1 = l.x + l.w, x2 = r.x;
  const y1 = l.y + l.h / 2, y2 = Math.max(r.y + 8, Math.min(r.y + r.h - 8, y1));
  const dx = Math.max(30, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

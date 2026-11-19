// owned by slice 1 (Plane), docs/port/slices.md
// The plane by rule (#1615; the mockup's merge/engine.js plane module, round 2 · A, round 3 · A3, round 4 · I5), ported
// as it is, its names kept: one pannable, zoomable plane with no edges; positions are data (D.pos[id] = {x,y,w,h,by,
// touched,at} in plane units, for folders and pieces); the camera is S.cam = {x,y,z}: the plane point at the centre of
// #view and how many screen px one plane unit is. The band is set by a thing's size on screen, never by a zoom number: a
// piece 400 units wide is at Middle once it is BAND_PX or more on screen, at Far below, on any screen. Near is entered
// (⌘↓, Enter), never zoomed into. Pans and zooms are no history step; entering, leaving, Find and Needs are.
// The zones: Diary · Build · Life side by side, apart by space and a label. A folder's kind is read from what it holds
// (core.ts kindOf); a folder of both sits where it holds most, its build things first. The Diary zone is the AI's:
// today's page at its top left, under it what the AI made unasked. Each folder gets exactly the rows it fills.
// Pure on D and S (core.ts), but for safe(), which reads where the ask line stands. Tested in next-plane.test.ts.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { D, S, piecesIn, regionOf, homeOf, kindOf, now, render, viewSize, toScreen, toPlane, rectOn, type Cam, type Piece, type Pos } from "../cv/core.ts";

// ---------------------------------------------------------------- the plane's units (engine.js)

export const PIECE_W = 400, PIECE_H = 400, CELL_W = 440, CELL_H = 440, PAD = 32, PAD_T = 100, BAND_PX = 280, ZSTEP = 1.25, ZMIN = 0.04, ZMAX = 3;
/** 0.7: the zoom where a piece is BAND_PX on screen */
export const Z_MID = BAND_PX / PIECE_W;
/** Far: a two-column folder is at least FAR_CARD px wide, so its card's line fits */
const FAR_CARD = 200, FAR_FLOOR = 150 / 904, FAR_REGION_W = 2 * 440 - 40 + 2 * 32;
const FIT: Record<"far" | "middle", { min: number; max: number }> = { far: { max: Z_MID * 0.9, min: FAR_CARD / FAR_REGION_W }, middle: { min: Z_MID * 1.05, max: 1 } };
/** the overlays over the plane (the shell draws them): the head at Middle, the talk pill under both */
export const SAFE = { far: { l: 28, t: 64, r: 28, b: 104 }, middle: { l: 36, t: 150, r: 36, b: 104 } };
export const bandOf = (z: number): "far" | "middle" => (PIECE_W * z >= BAND_PX ? "middle" : "far");
export { viewSize, toScreen, toPlane, rectOn };

export const Z_GAP = 200, R_GAP = 96, LABEL_H = 110, DIARY_W = 3 * CELL_W - (CELL_W - PIECE_W), DIARY_SHARE = 1 / 3, ZONE_MIN_W = 700, PAGE_MIN_H = 1000;
export const ZONES = ["diary", "build", "life"] as const;
export type Zone = (typeof ZONES)[number];
const BUILD_KINDS = new Set(["session", "copies", "starter", "row", "set", "block", "stills"]);
/** round 4: today's page at Far is at least PAGE_MIN tall on screen; a short window with the line may go LINE_FLOOR of the
 *  floor; the last whole column may come EDGE_PX near the window's edge when the next one must clear it */
export const FOLD_PX = 44, RING_PX = 76, PAGE_MIN = 240, LINE_FLOOR = 0.7, EDGE_PX = 12;

type Rect = { x: number; y: number; w: number; h: number };
type Spot = Rect & { region?: string; grow?: string; zone?: string };

// ---------------------------------------------------------------- the zones (round 3 · A3)

/** D8: once the diary draws, it holds what arrived: the new face always has the diary (slice 4), so arrivals are never
 *  pieces on the plane (the mockup's merged page, where VIEWS.diary was always there) */
const hidesArrivals = () => true;
/** the pieces a folder shows on the plane: a piece inside a set is drawn in the set */
export const onPlane = (rid: string): Piece[] => piecesIn(rid).filter((p) => !p.inside && !(p.kind === "arrivals" && hidesArrivals()));
/** the zone nearest a plane x */
export function zoneAt(x: number): Zone | null {
  const Z = D.zones;
  if (!Z) return null;
  let best: Zone | null = null, bd = 1e18;
  for (const z of ZONES) { const q = Z[z], d = x < q.x ? q.x - x : x > q.x + q.w ? x - q.x - q.w : 0; if (d < bd) { bd = d; best = z; } }
  return best;
}
export function zoneOf(id: string): Zone | null { const q = D.pos?.[id]; return q ? zoneAt(q.x + q.w / 2) : null; }
export const isThing = (id: string) => !!regionOf(id) || (!!D.pieces[id] && !D.pieces[id].inside);
/** a zone's extent on the plane: its label row, and everything that sits in it now */
export function zoneRect(z: Zone): Rect | null {
  const q = D.zones?.[z];
  if (!q || !D.zones || !D.pos) return null;
  let x0 = q.x, x1 = q.x + q.w, y1 = z === "diary" ? (D.zones.bottom || LABEL_H + D.zones.page.h) : LABEL_H + PAGE_MIN_H / 2;
  for (const [id, p] of Object.entries(D.pos)) if (isThing(id) && zoneAt(p.x + p.w / 2) === z) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
  return { x: x0, y: 0, w: x1 - x0, h: y1 };
}
export function regionCols(n: number): number { return n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 6; }
/** a life thing: pages, lists, tables, stickies (the board's); arrivals are neither */
export const lifeThing = (p: Piece) => !BUILD_KINDS.has(p.kind) && p.kind !== "arrivals";
/** a folder's cells in order: build things (and arrivals) first; its life things from a fresh row */
export function slots(rid: string, cols: number): (Piece | null)[] {
  const ps = onPlane(rid), head = ps.filter((p) => !lifeThing(p)), life = [...ps.filter((p) => lifeThing(p) && p.kind !== "sticky"), ...ps.filter((p) => p.kind === "sticky")];
  const gap = head.length && life.length && head.length % cols ? cols - (head.length % cols) : 0;
  return [...head, ...Array<null>(gap).fill(null), ...life];
}
export function regionBox(rid: string): { cols: number; w: number; h: number } {
  const n = Math.max(1, onPlane(rid).length), cols = regionCols(n), rows = Math.max(1, Math.ceil(slots(rid, cols).length / cols));
  return { cols, w: cols * CELL_W - (CELL_W - PIECE_W) + 2 * PAD, h: rows * CELL_H - (CELL_H - PIECE_H) + PAD_T + PAD };
}
type Box = { r: { id: string }; cols: number; w: number; h: number };
type Col = { qs: Box[]; w: number; h: number };
/** a zone's folders in columns no taller than H: down, then right */
function stack(qs: Box[], H: number): { cols: Col[]; w: number; h: number } {
  const cols: Col[] = [];
  let c: Col | null = null;
  for (const q of qs) { if (!c || c.h + R_GAP + q.h > H) { c = { qs: [], w: 0, h: -R_GAP }; cols.push(c); } c.qs.push(q); c.h += R_GAP + q.h; c.w = Math.max(c.w, q.w); }
  return { cols, w: cols.length ? cols.reduce((s, c) => s + c.w, 0) + R_GAP * (cols.length - 1) : ZONE_MIN_W, h: Math.max(0, ...cols.map((c) => c.h)) };
}
/** the first layout, by rule: the three zones side by side, their columns as tall as makes the whole plane biggest at Far.
 *  The folders get two thirds of the width at most; the Diary the rest, and the full height */
export function layoutPlane(): void {
  D.pos = D.pos || {};
  const by: { build: Box[]; life: Box[] } = { build: [], life: [] };
  for (const r of D.regions) by[homeOf(r.id)].push({ r, ...regionBox(r.id) });
  const vw = viewSize().w, vh = typeof innerHeight !== "undefined" ? innerHeight : viewSize().h, sa = safe("far");   // the plane's view is the window's height
  const aw = vw - sa.l - sa.r, ah = vh - sa.t - sa.b, all = [...by.build, ...by.life];
  const lo = Math.max(PAGE_MIN_H, ...all.map((q) => q.h)), hi = Math.max(lo, all.reduce((s, q) => s + q.h + R_GAP, 0));
  let best: { z: number; b: ReturnType<typeof stack>; l: ReturnType<typeof stack>; h: number; f: number } | null = null;
  for (let H = lo; H <= hi + 40; H += 40) {
    const b = stack(by.build, H), l = stack(by.life, H), h = Math.max(b.h, l.h, PAGE_MIN_H), f = Z_GAP + b.w + Z_GAP + l.w;
    const z = Math.min((aw * (1 - DIARY_SHARE)) / f, aw / (DIARY_W + f), ah / (h + LABEL_H));
    if (!best || z > best.z + 1e-9) best = { z, b, l, h, f };
  }
  const { b, l, f, z } = best!, dw = Math.max(DIARY_W, aw / z - f), h = Math.max(best!.h, ah / z - LABEL_H), bx = dw + Z_GAP, lx = bx + b.w + Z_GAP;
  D.zones = { diary: { x: 0, w: dw }, build: { x: bx, w: b.w }, life: { x: lx, w: l.w }, page: { x: 0, y: LABEL_H, w: dw, h }, bottom: LABEL_H + h, fit: +z.toFixed(4) };
  for (const [st, x0] of [[b, bx], [l, lx]] as const) {
    let x = x0;
    for (const c of st.cols) {
      let y = LABEL_H;
      for (const q of c.qs) { if (!D.pos[q.r.id]) D.pos[q.r.id] = { x, y, w: q.w, h: q.h, cols: q.cols, by: "rule", touched: false, at: 0 }; y += q.h + R_GAP; }
      x += c.w + R_GAP;
    }
  }
  for (const r of D.regions) slots(r.id, D.pos[r.id].cols!).forEach((p, i) => { if (p && !D.pos![p.id]) D.pos![p.id] = { ...cellAt(r.id, i), by: "rule", touched: false, at: 0 }; });
}
export function cellAt(rid: string, i: number): Rect {
  const R = D.pos![rid], c = i % R.cols!, row = Math.floor(i / R.cols!);
  return { x: R.x + PAD + c * CELL_W, y: R.y + PAD_T + row * CELL_H, w: PIECE_W, h: PIECE_H };
}
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const takenRects = () => Object.entries(D.pos!).filter(([id]) => D.pieces[id] && !D.pieces[id].inside).map(([, q]) => q);
/** the next free spot in a folder, in reading order. Asking changes nothing: a full folder answers with the first cell
 *  under it, marked grow, and put grows the folder (what sits under it by rule moving down) only when something lands */
export function spotForRegion(rid: string | null, opt: { near?: string; minY?: number } = {}): Spot | null {
  if (!rid && opt.near && D.pieces[opt.near]) rid = D.pieces[opt.near].region;
  if (!rid || !D.pos || !D.pos[rid]) return null;
  const R = D.pos[rid], taken = takenRects(), free: Spot[] = [];
  for (let i = 0; i < 400 && free.length < (opt.near ? 24 : 1); i++) {
    const c = cellAt(rid, i);
    if (c.y + c.h > R.y + R.h - PAD + 1) { if (!free.length) free.push({ ...c, region: rid, grow: rid }); break; }
    if (opt.minY != null && c.y < opt.minY) continue;
    if (!taken.some((q) => overlaps(q, c))) free.push({ ...c, region: rid });
  }
  const n = opt.near ? D.pos[opt.near] : undefined;
  if (!n) return free[0] || null;   // beside a piece: the nearest free cell, the right side first on a tie
  return free.sort((a, b) => (Math.hypot(a.x - n.x, a.y - n.y) - (a.x > n.x ? 1 : 0)) - (Math.hypot(b.x - n.x, b.y - n.y) - (b.x > n.x ? 1 : 0)))[0] || null;
}
function growRegion(rid: string): void {
  const R = D.pos![rid], old = R.y + R.h;
  R.h += CELL_H;
  const below = D.regions.filter((r) => r.id !== rid && D.pos![r.id] && D.pos![r.id].y >= old - 1 && D.pos![r.id].x < R.x + R.w && R.x < D.pos![r.id].x + D.pos![r.id].w);
  for (const r of below) {
    const ps = onPlane(r.id);
    if (D.pos![r.id].by === "person" || ps.some((p) => D.pos![p.id] && D.pos![p.id].by === "person")) continue;   // the person's places never move
    D.pos![r.id].y += CELL_H;
    for (const p of ps) if (D.pos![p.id]) D.pos![p.id].y += CELL_H;
  }
}
/** the Diary: today's page over the zone's full height; what the AI puts there stacks up from the zone's foot, one to a
 *  row, and the page gives up a row for each */
export const diarySpot = () => (D.zones ? { ...D.zones.page, zone: "diary" } : null);
export function diaryFree(): Spot | null {
  if (!D.zones) return null;
  const pg = D.zones.page, taken = takenRects(), foot = D.zones.bottom || pg.y + pg.h + R_GAP + CELL_H;
  for (let i = 0; i < 300; i++) {
    const c = { x: pg.x, y: foot - (i + 1) * CELL_H + (CELL_H - PIECE_H), w: PIECE_W, h: PIECE_H };
    if (taken.some((q) => overlaps(q, c))) continue;
    if (c.y - R_GAP < pg.y + PAGE_MIN_H / 2) return { x: pg.x, y: foot + R_GAP + i * CELL_H, w: PIECE_W, h: PIECE_H, zone: "diary" };   // the page keeps half its least height
    pg.h = Math.min(pg.h, c.y - R_GAP - pg.y);
    return { ...c, zone: "diary" };
  }
  return null;
}
/** pieces made without a place (a sticky, a started session): the next free cell of their folder; a life thing goes with
 *  the folder's life things, on rows of their own. Answers how many landed */
export function settle(): number {
  if (!D.pos || !D.zones) return 0;
  let n = 0;
  for (const p of Object.values(D.pieces)) {
    if (p.inside || D.pos[p.id] || !D.pos[p.region] || (p.kind === "arrivals" && hidesArrivals())) continue;
    const R = D.pos[p.region], mine = piecesIn(p.region).filter((q) => q.id !== p.id && D.pos![q.id] && overlaps(D.pos![q.id], R)), st = mine.filter(lifeThing).map((q) => D.pos![q.id].y);
    const minY = !lifeThing(p) ? undefined : st.length ? Math.min(...st) : mine.length ? Math.max(...mine.map((q) => D.pos![q.id].y)) + 1 : undefined;
    const sp = spotForRegion(p.region, { minY });
    if (sp && put(p.id, sp, p.by && p.by !== "person" && p.by !== "rule" ? "ai" : "person", { asked: true })) n++;
  }
  return n;
}
/** settle's question alone: is any piece waiting for a place (the view asks before it presses M.land) */
export const unplaced = (): boolean => !!D.pos && !!D.zones && Object.values(D.pieces).some((p) => !p.inside && !D.pos![p.id] && !!D.pos![p.region] && p.kind !== "arrivals");
/** a piece someone made: placed where asked, marked new until the person touches it (P5). An AI places in the Diary only,
 *  unless the person asked (P13): a new piece it aims elsewhere lands in the Diary instead; one it would move elsewhere stays */
export function put(id: string, spot: Partial<Spot> | null, by: Pos["by"] = "person", opt: { asked?: boolean } = {}): boolean {
  if (!spot || !D.pieces[id] || spot.x == null || spot.y == null) return false;
  D.pos = D.pos || {};
  const p = D.pieces[id], had = D.pos[id];
  if (by === "ai" && !opt.asked && D.zones) {
    if (had && had.by === "person") return false;
    if (zoneAt(spot.x + (spot.w || PIECE_W) / 2) !== "diary") { if (had) return false; spot = diaryFree(); if (!spot) return false; }
  }
  if (spot.grow && D.pos[spot.grow]) growRegion(spot.grow);
  if (spot.region && p.region !== spot.region && regionOf(spot.region)) p.region = spot.region;
  D.pos[id] = { x: spot.x!, y: spot.y!, w: spot.w || PIECE_W, h: spot.h || PIECE_H, by, touched: false, at: now(), fresh: true };
  return true;
}
export function touch(id: string): void { const q = D.pos?.[id]; if (q && !q.touched) { q.touched = true; q.fresh = false; } }
export const isNew = (id: string) => { const q = D.pos?.[id]; return !!(q && q.fresh && !q.touched); };

// ---------------------------------------------------------------- the camera

/** the safe area of a band: the bar, the talk, and the ask line while it shows (its own band, nothing of the plane fitted
 *  under it) */
export function safe(band: "far" | "middle", bare?: boolean): { l: number; t: number; r: number; b: number } {
  const sa = { ...SAFE[band] }, l = !bare && typeof document !== "undefined" ? document.getElementById("line") : null, v = l && document.getElementById("view");
  /* the mockup's view runs under the top bar, and SAFE's top clears the bar; the shell's view starts under it, so the bar
     is already off the plane: the top counts from the window, as the mockup's did (the join, #1615: count 23) */
  const vw = typeof document !== "undefined" ? document.getElementById("view") : null, vt = vw ? vw.getBoundingClientRect().top : 0;
  if (vt > 0) sa.t = Math.max(0, sa.t - vt);
  if (l && v && l.style.display === "block" && l.offsetHeight) {
    const lb = l.getBoundingClientRect(), vb = v.getBoundingClientRect();
    if (lb.top > vb.top + vb.height / 2) sa.b = Math.max(sa.b, vb.bottom - lb.top + 12);
  }
  return sa;
}
/** the camera on a rect: the whole of it in the safe area, inside the band's zooms; too big, it starts at the rect's top
 *  left (reading order) */
export function camOn(rect: Rect, band: "far" | "middle", bare?: boolean): Cam {
  const { w, h } = viewSize(), sa = safe(band, bare), aw = w - sa.l - sa.r, ah = h - sa.t - sa.b;
  const mn = band === "far" && D.zones && D.zones.fit ? Math.max(FAR_FLOOR, Math.min(FIT.far.min, D.zones.fit)) : FIT[band].min;   // the whole canvas fits at Far, down to the floor
  let z = Math.min(aw / rect.w, ah / rect.h);
  if (FIT[band].max) z = Math.min(z, FIT[band].max);
  if (mn) z = Math.max(z, mn);
  const sx = rect.w * z > aw ? sa.l + (rect.w * z) / 2 : sa.l + aw / 2, sy = rect.h * z > ah ? sa.t + (rect.h * z) / 2 : sa.t + ah / 2;   // where the rect's centre goes
  return { x: rect.x + rect.w / 2 - (sx - w / 2) / z, y: rect.y + rect.h / 2 - (sy - h / 2) / z, z: +z.toFixed(4) };
}
/** everything on the plane: folders, pieces, the zones' labels and today's page */
export function bounds(): Rect {
  const rs: Rect[] = Object.entries(D.pos || {}).filter(([id]) => regionOf(id) || (D.pieces[id] && !D.pieces[id].inside)).map(([, q]) => q);
  if (D.zones) { for (const z of ZONES) rs.push({ x: D.zones[z].x, y: 0, w: D.zones[z].w, h: LABEL_H }); rs.push(D.zones.page); }
  if (!rs.length) return { x: 0, y: 0, w: 1000, h: 800 };
  const x = Math.min(...rs.map((q) => q.x)), y = Math.min(...rs.map((q) => q.y));
  return { x, y, w: Math.max(...rs.map((q) => q.x + q.w)) - x, h: Math.max(...rs.map((q) => q.y + q.h)) - y };
}
export const regionShown = (rid: string, cam: Cam = S.cam) => {
  const q = D.pos?.[rid];
  if (!q) return false;
  const { w, h } = viewSize(), r = rectOn(q, cam);
  return r.x < w && r.x + r.w > 0 && r.y < h && r.y + r.h > 0;
};
/** after a move: Far fits the plane, Middle fits its folder unless the camera already shows it at Middle, Near keeps a
 *  camera on its folder to leave to */
export function settleCam(): void {
  if (!D || !D.pos) return;
  if (S.dist === "far") S.cam = farCam();
  else if (S.dist === "middle" || S.dist === "near") {
    const rid = S.region;
    if (rid && D.pos[rid] && !(S.camSet && bandOf(S.cam.z) === "middle" && focusAt(S.cam) === rid)) S.cam = camOn(D.pos[rid], "middle");
  }
  S.camSet = true; S.camRule = S.cam; S.camLine = safe("far").b;
}
/** Far's camera: the whole canvas; while the line shows, the same top and only as much smaller as keeps every folder and
 *  piece above it (the zones' empty feet may go under it) */
export function farCam(): Cam { return whole(lineCam()); }
function lineCam(): Cam {
  const b = bounds(), c = camOn(b, "far", true), { h } = viewSize(), sa = safe("far");
  /* round 4: today's page scrolls inside the safe area at Far, so only its top counts; the folders and pieces end above the pill too */
  const foot = Math.max(D.zones ? D.zones.page.y + PAGE_MIN / c.z : 0, ...Object.entries(D.pos!).filter(([id]) => regionOf(id) || (D.pieces[id] && !D.pieces[id].inside))   // a Diary piece is its one line at Far
    .map(([id, q]) => q.y + (regionOf(id) || zoneAt(q.x + q.w / 2) !== "diary" ? q.h : FOLD_PX / c.z)));
  const topC = h / 2 + (b.y - c.y) * c.z, rib = RING_PX;   // room for the labels' row and an AI's ribbon under it, kept whether a ring shows or not
  if (topC >= sa.t + rib - LABEL_H * c.z - 1 && topC + (foot - b.y) * c.z <= h - sa.b + 1) return c;   // it all ends above the line and the pill
  const top0 = Math.max(topC, sa.t + rib - LABEL_H * c.z), z = Math.max(sa.b > SAFE.far.b ? FAR_FLOOR * LINE_FLOOR : FAR_FLOOR, Math.min(c.z, (h - sa.b - top0) / Math.max(1, foot - b.y)));
  const top = Math.max(sa.t + rib - LABEL_H * z, Math.min(top0, h - sa.b - (foot - b.y) * z));   // at the floor, a short window lifts the top instead
  return { x: c.x, y: b.y - (top - h / 2) / z, z: +z.toFixed(4) };
}
/** whole cards (round 4 · I5): the columns are the cards' spans across x */
export function cardSpans(): [number, number][] {
  const xs: [number, number][] = Object.entries(D.pos || {}).filter(([id]) => isThing(id)).map(([, q]) => [q.x, q.x + q.w]);
  if (D.zones) xs.push([D.zones.page.x, D.zones.page.x + D.zones.page.w]);
  xs.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of xs) { const l = out[out.length - 1]; if (l && s <= l[1] + 1) l[1] = Math.max(l[1], e); else out.push([s, e]); }
  return out;
}
/** a window too narrow for the canvas at Far shows its first columns of cards whole and the next one not at all, never a
 *  card cut by the edge. The zoom stays at most the fit's, its top stays where it was; the canvas never moves */
function whole(c: Cam): Cam {
  if (!D.zones) return c;
  const Z = D.zones, { w, h } = viewSize(), sa = safe("far"), aw = w - sa.l - sa.r, cs = cardSpans();
  if (!cs.length) return c;
  const x0 = cs[0][0], x1 = cs[cs.length - 1][1];
  if ((x1 - x0) * c.z <= aw + 1 && toScreen(x0, 0, c).x >= -1 && toScreen(x1, 0, c).x <= w + 1) return c;   // all of it fits
  const b = bounds(), top = h / 2 + (b.y - c.y) * c.z, room = h - sa.b - top;
  /* the tallest of the shown columns, as the most zoom that keeps it above the line and the pill: each thing is a·z + px */
  const tall = (xmax: number) => {
    let zmax = FIT.far.max;
    const fit = (a: number, px: number) => { if (a > 0) zmax = Math.min(zmax, (room - px) / a); };
    for (const [id, q] of Object.entries(D.pos!)) if (isThing(id) && q.x < xmax) { const dy = !!regionOf(id) || zoneAt(q.x + q.w / 2) !== "diary"; fit(q.y - b.y + (dy ? q.h : 0), dy ? 0 : FOLD_PX); }
    if (Z.page.x < xmax) fit(Z.page.y - b.y, PAGE_MIN);
    return zmax;
  };
  /* the most columns shown whole, the next one wholly past the right edge: a narrow window shrinks below Far, to LINE_FLOOR
     of the floor, before it drops a zone (a zone left out is named by the edge chip) */
  const fl = FAR_FLOOR * LINE_FLOOR, n = cs.length;
  for (const vert of [true, false]) for (let k = n; k >= 1; k--) {
    const W = cs[k - 1][1] - x0, G = k < n ? cs[k][0] - x0 : 0, lo = Math.max(fl, k < n ? EDGE_PX / (G - W) : 0);
    const hi = Math.min(k < n ? FIT.far.max : c.z, k < n ? (w - sa.l - EDGE_PX) / W : aw / W, vert ? tall(cs[k - 1][1]) : 1);
    if (lo <= hi) {
      const z = k < n ? Math.min(hi, Math.max(lo, c.z, (w - sa.l) / G)) : hi, L = k < n ? Math.max(sa.l, w - G * z) : sa.l;
      return { x: x0 + (w / 2 - L) / z, y: b.y - (top - h / 2) / z, z: +z.toFixed(4) };
    }
  }
  return c;
}
/** the line came or went at Far while the camera is still where the rule put it: fit again, so the line never covers the
 *  plane (only the line's coming or going, never a ring or a piece landing). Answers whether the camera moved */
export function lineFit(): boolean {
  if (S.dist !== "far" || !D.zones || S.cam !== S.camRule) return false;
  const lb = safe("far").b;
  if (lb === S.camLine) return false;
  S.camLine = lb;
  const c = farCam();
  if (Math.abs(c.z - S.cam.z) < 1e-3 && Math.abs(c.x - S.cam.x) < 1 && Math.abs(c.y - S.cam.y) < 1) return false;
  S.cam = S.camRule = c;
  return true;
}
/** the window's size changed: the camera the rule put there follows it (desk.js follow); a moved one stays */
export function follow(): boolean {
  if (!D.pos || S.cam !== S.camRule || S.dist !== "far") return false;
  S.camSet = false; settleCam();
  return true;
}
/** the folder at the middle of the safe area: the one it sits in, else the nearest */
export function focusAt(cam: Cam = S.cam): string | null {
  const { w, h } = viewSize(), sa = safe("middle"), c = toPlane(sa.l + (w - sa.l - sa.r) / 2, sa.t + (h - sa.t - sa.b) / 2, cam);
  let best: string | null = null, bd = 1e18;
  for (const r of D.regions) {
    const q = D.pos?.[r.id];
    if (!q) continue;
    const dx = Math.max(q.x - c.x, 0, c.x - q.x - q.w), dy = Math.max(q.y - c.y, 0, c.y - q.y - q.h), d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = r.id; }
  }
  return best;
}
/** a pan or a zoom: the band and the folder follow the camera; no history step, no move counted */
export function camMoved(): void {
  const band = bandOf(S.cam.z);
  if (band === "far") { S.dist = "far"; S.region = null; }
  else { const f = focusAt(); if (f) { if (f !== S.region) S.sel = 0; S.dist = "middle"; S.region = f; } }
  render();
}
/** what stands on the plane right now: a folder by any part, a piece by its corner, where its name is */
export function inView(id: string, cam: Cam = S.cam): boolean {
  const q = D.pos?.[id];
  if (!q || S.dist === "near" || S.dist === "needs") return false;
  const { w, h } = viewSize();
  if (regionOf(id)) return regionShown(id, cam);
  const r = rectOn(q, cam), cx = r.x + Math.min(r.w, 40) / 2, cy = r.y + Math.min(r.h, 40) / 2;
  return cx >= 0 && cx <= w && cy >= 0 && cy <= h;
}

// ---------------------------------------------------------------- the zones' seam (engine.js CV.zones)

/** the folders of each zone in the plane's order (columns left to right, each top to bottom): the sidebar's order (K2) */
export function zoneOrderOnPlane(): { build: string[]; life: string[] } {
  const o = { build: [] as string[], life: [] as string[] };
  for (const r of D.regions) { const z = zoneOf(r.id); o[z === "life" ? "life" : "build"].push(r.id); }
  const at = (id: string) => D.pos?.[id] || { x: 0, y: 0 };
  for (const k of ["build", "life"] as const) o[k].sort((a, b) => Math.round(at(a).x) - Math.round(at(b).x) || at(a).y - at(b).y);
  return o;
}
/** a new folder (K1): sessions or stickies; it goes under the last folder of its zone. The person's alone: an AI does not
 *  make folders */
export function makeFolder(name: string, kind?: string): { ok: boolean; id?: string; why?: string; undo: () => void } {
  name = String(name || "").trim();
  const none = () => {};
  if (!name || !D.zones || !D.pos) return { ok: false, why: "a folder needs a name", undo: none };
  const z: "build" | "life" = kind === "life" || kind === "stickies" ? "life" : "build", base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
  let id = base, n = 2;
  while (regionOf(id) || D.pieces[id]) id = base + "-" + n++;
  D.regions.push({ id, name, kind: z === "life" ? "life" : "code", made: true });
  const box = regionBox(id), Z = D.zones[z];
  const mine = D.regions.filter((r) => r.id !== id && D.pos![r.id] && zoneOf(r.id) === z).map((r) => D.pos![r.id]);
  const firstCol = mine.filter((q) => q.x < Z.x + 1), y = mine.length ? Math.max(...(firstCol.length ? firstCol : mine).map((q) => q.y + q.h)) + R_GAP : LABEL_H;
  D.pos[id] = { x: Z.x, y, w: box.w, h: box.h, cols: box.cols, by: "person", touched: true, at: now() };
  Z.w = Math.max(Z.w, box.w);
  return { ok: true, id, undo: () => {
    if (piecesIn(id).length) return;
    D.regions = D.regions.filter((r) => r.id !== id); delete D.pos![id];
    if (S.region === id) { S.region = null; S.dist = "far"; settleCam(); }
  } };
}
/** a folder dragged by the person (K2): its pieces move with it, all of it the person's place now; what it is stays */
export function dragFolder(rid: string, dx: number, dy: number): boolean {
  const R = D.pos?.[rid];
  if (!R) return false;
  const inR = Object.keys(D.pos!).filter((id) => D.pieces[id] && !D.pieces[id].inside && D.pieces[id].region === rid && overlaps(D.pos![id], R));
  R.x += dx; R.y += dy; R.by = "person"; R.touched = true;
  for (const id of inR) { const q = D.pos![id]; q.x += dx; q.y += dy; q.by = "person"; }
  return true;
}
/** a zone's cards across x */
export function zoneSpan(k: Zone): [number, number] | null {
  if (!D.zones || !D.pos) return null;
  const xs: [number, number][] = Object.entries(D.pos).filter(([id]) => isThing(id) && zoneOf(id) === k).map(([, q]) => [q.x, q.x + q.w]);
  if (k === "diary") xs.push([D.zones.page.x, D.zones.page.x + D.zones.page.w]);
  return xs.length ? [Math.min(...xs.map((a) => a[0])), Math.max(...xs.map((a) => a[1]))] : null;
}
/** round 4: where a zone's cards are across the view: null (none), 'whole', 'left' or 'right' (some past that edge) */
export function edge(k: Zone): "whole" | "left" | "right" | null {
  const s = zoneSpan(k);
  if (!s) return null;
  const { w } = viewSize(), a = toScreen(s[0], 0).x, b = toScreen(s[1], 0).x;
  return a < -1 ? "left" : b > w + 1 ? "right" : "whole";
}
/** the edge chip's press: Far pans (the zoom stays) until the zone's near side is at the safe edge; the spot to go to */
export function zoneCam(k: Zone): Cam | null {
  const s = zoneSpan(k);
  if (!s || S.dist !== "far") return null;
  const { w } = viewSize(), sa = safe("far"), z = S.cam.z, left = toScreen(s[0], 0).x < -1;
  const x = left ? s[1] - (w - sa.r - w / 2) / z : s[0] - (sa.l - w / 2) / z;
  return { ...S.cam, x };
}
/** the chip's press (P14): the whole plane, today's page in it */
export const diaryCam = (): Cam | null => (D.zones ? camOn(D.zones.page, "far") : null);

/** today's page counts as shown when at least 120px of it (or all of it) is in the view both ways (shell.js pageShown) */
export const pageShown = (r: Rect, w: number, h: number) => Math.min(r.x + r.w, w) - Math.max(r.x, 0) >= Math.min(120, r.w) && Math.min(r.y + r.h, h) - Math.max(r.y, 0) >= Math.min(120, r.h);
/** which pieces get a full face at Middle: in view, in the folder you are in, asks first (the best rank), then new, then
 *  sessions; at most eight (shell.js faceOrder) */
export const MAX_FACES = 8;
export function faceOrder(ps: Piece[], rankOf: (p: Piece) => number): string[] {
  return ps.filter((p) => p.region === S.region && inView(p.id)).map((p, i) => ({ p, i, r: rankOf(p) }))
    .sort((a, b) => a.r - b.r || (+isNew(b.p.id) - +isNew(a.p.id)) || (+(b.p.kind === "session") - +(a.p.kind === "session")) || a.i - b.i)
    .slice(0, MAX_FACES).map((x) => x.p.id);
}
export { kindOf, homeOf };

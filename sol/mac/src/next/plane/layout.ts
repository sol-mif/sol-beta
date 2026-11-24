// owned by slice 1 (Plane), docs/port/slices.md
// The plane by rule (#1615; the mockup's merge/engine.js plane module, round 2 · A, round 3 · A3, round 4 · I5), ported
// as it is, its names kept: one pannable, zoomable plane with no edges; positions are data (D.pos[id] = {x,y,w,h,by,
// touched,at} in plane units, for folders and pieces); the camera is S.cam = {x,y,z}: the plane point at the centre of
// #view and how many screen px one plane unit is. What a thing draws is its form at its size on screen (form.ts, root
// part 3), never a zoom number: a folder is opened (Middle) while it draws whole, its pieces wide enough for their faces,
// on any screen. Near is entered (⌘↓, Enter), never zoomed into. Pans and zooms are no history step; entering, leaving, Find and Needs are.
// No zones, only folders (BR1, #1615, 2026-11-21, mine/look/br1/three.html): today's page at the top left, then every
// folder in one flow that wraps where the window ends; a folder is just a folder, and it sits where it is put. Inside a
// folder its build things come first, its life things from a fresh row; each folder gets exactly the rows it fills.
// Pure on D and S (core.ts), but for safe(), which reads where the ask line stands. Tested in next-plane.test.ts.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { keepWidth, DIARY_PX } from "../fits/fit.ts";
import { FACE_PX, opened, widthOf } from "../form.ts";
import { TYPE } from "../../kit/tokens.ts";
import { SIZE, heldOn } from "./size.ts";
import { GAP as JOIN } from "./group.ts";   // closer than this on screen, cards join one group (groupFar.ts)
import { holderIds, isHolder, isOffHolder } from "../holders/model.ts";   // BR1 holders.html: Sessions and Made, pieces on the canvas
import { onShelf } from "../shelf/model.ts";   // the infinite canvas (BR1, #1615, F): inView reads a card as drawn
import { D, S, hooks, open, piecesIn, stale, dataVer, regionOf, kindOf, folderOrder, now, render, renderCam, viewSize, toScreen, toPlane, rectOn, parentOf, childrenOf, ancestors, canNest, DEPTH, folderDiary, isFolderDiary, FOLDER_DIARY, type Cam, type Piece, type Pos } from "../cv/core.ts";

// ---------------------------------------------------------------- the plane's units (engine.js)

export const PIECE_W = 400, PIECE_H = 400, CELL_W = 440, CELL_H = 440, PAD = 32, PAD_T = 100, ZSTEP = 1.25, ZMIN = 0.002, ZMAX = 3;   // ZMIN: the infinite canvas (size.ts) holds every card at its smallest, so further out only packs
/** 0.7: the zoom where a folder opens, its pieces FACE_PX on screen (form.ts opened) */
export const Z_OPEN = FACE_PX / PIECE_W;
/** Far: a two-column folder is at least FAR_CARD px wide, so its card's line fits */
const FAR_CARD = 200, FAR_FLOOR = 150 / 904, FAR_REGION_W = 2 * 440 - 40 + 2 * 32;
const FIT: Record<"far" | "middle", { min: number; max: number }> = { far: { max: Z_OPEN * 0.9, min: FAR_CARD / FAR_REGION_W }, middle: { min: Z_OPEN * 1.05, max: 1 } };
/** BR1, the decided rule (d) (Marco 2026-11-21, #1615): the canvas holds at the person's scale. Far never zooms out to fit
 *  a crowd and never zooms in to fill a big window: a folder's face is drawn at the drawing's size (mine/look/br1/
 *  bar-folder.html, 212px for a folder of two columns) and today's page at DIARY_PX; a bigger window leaves empty canvas,
 *  a smaller one shows whole columns (the rest named by the edge chips) and a column taller than it continues below,
 *  reached by a pan. The person's own zoom (pinch, ⌘+/−) is theirs; only the rule's camera holds here */
export const FOLDER_PX = 212, Z_PERSON = FOLDER_PX / FAR_REGION_W;
/** the calm screen (BR1 item 3, #1615): a piece's face is drawn at plane size and scaled by the camera, so at Middle its
 *  small type falls under the 11px a person reads. Its face raises each small step of the scale (--t-label … --t-body) to
 *  what reads 11px on screen at zoom z, the line heights with it; at z ≥ 1 nothing changes, nor under Z_OPEN (a zoom
 *  out past Middle is an overview: grown type would only crowd it). A style for the face's or the board's box */
const TYPE_FLOOR = 11, SMALL_TYPE: [string, number, number][] = [["label", 11, 16], ["pill", 11.5, 16], ["head", 12.5, 16], ["code", 12, 20], ["body", 13, 20]];
export function textFloor(z: number): Record<string, string> | undefined {
  if (!(z >= Z_OPEN) || z >= 1) return undefined;   // under Z_OPEN the plane is an overview, not read: its type stays as drawn
  const out: Record<string, string> = {};
  for (const [k, size, line] of SMALL_TYPE) {
    const t = Math.max(size, TYPE_FLOOR / z);
    if (t === size) continue;
    out[`--t-${k}`] = +t.toFixed(2) + "px";
    out[`--t-${k}-line`] = +(line * t / size).toFixed(2) + "px";
  }
  return out;
}
/** today's page is at most this tall for its width (the drawing's page, pieces.html "Both") */
const PAGE_TALL = 1.6;
/** the bottom bar over the talk pill (bar/Bar.tsx, Marco's decision 2026-11-21, #1615): its height and the gap above the
 *  pill, kept clear at the foot of both bands so the bar never covers a card */
export const BAR_PX = 64;
/** the overlays over the plane (the shell draws them): the head at Middle, the talk pill under both, the bar over the pill */
export const SAFE = { far: { l: 28, t: 64, r: 28, b: 104 + BAR_PX }, middle: { l: 36, t: 206, r: 36, b: 104 + BAR_PX } };
/** a folder drawn whole at the camera: opened (form.ts) */
export const openAt = (rid: string, cam: Cam = S.cam) => { const q = D.pos?.[rid]; return !!q && opened(q.w, cam.z, PIECE_W * (q.s ?? 1)); };
/** a folder's pieces are drawn: always for one at the top (the band decides), for one inside a folder only while it is
 *  open itself and nothing above it is folded (BR1, folders in folders) */
export const drawsWhole = (rid: string, cam: Cam = S.cam) => !parentOf(rid) || (openAt(rid, cam) && !tucked(rid));
export { viewSize, toScreen, toPlane, rectOn };

/** LABEL_H: the band above the canvas's first line (where the zones' labels stood until BR1); the page and the first folders
 *  start under it, so places saved before BR1 stand where they were */
/** a row of folders keeps its raises' room under it (BR1 quiet canvas, #1615; quiet.html: 118 px on screen at the person's
 *  scale), so a question at rest never covers the folder below */
export const RAISE_PX = 118;
export const Z_GAP = 200, R_GAP = 96, LABEL_H = 110, DIARY_W = 3 * CELL_W - (CELL_W - PIECE_W), ZONE_MIN_W = 700, PAGE_MIN_H = 1000;
const ROW_GAP = Math.max(R_GAP, Math.round(RAISE_PX / Z_PERSON));
/** BR1 (#1615, decided 11:35): the Diary is a piece with its own size. The rule's page fills what the folders leave, but
 *  never wider than this: a plane zoomed far out (hundreds of sessions, many folders) drew it 40 000 units wide, over
 *  every folder. Wider than any example scenario's (denise: 2628), so those are as they were */
export const DIARY_MAX_W = 2.5 * DIARY_W;
const BUILD_KINDS = new Set(["session", "copies", "starter", "row", "set", "block", "stills"]);
/** round 4: today's page at Far is at least PAGE_MIN tall on screen; a short window with the line may go LINE_FLOOR of the
 *  floor; the last whole column may come EDGE_PX near the window's edge when the next one must clear it */
export const FOLD_PX = 44, RING_PX = 76, PAGE_MIN = 240, LINE_FLOOR = 0.7, EDGE_PX = 12;

type Rect = { x: number; y: number; w: number; h: number };
type Spot = Rect & { region?: string; grow?: string; zone?: string };

// ---------------------------------------------------------------- the folders (round 3 · A3; BR1: no zones)

/** D8: once the diary draws, it holds what arrived: the new face always has the diary (slice 4), so arrivals are never
 *  pieces on the plane (the mockup's merged page, where VIEWS.diary was always there) */
const hidesArrivals = () => true;
/** BR1 (#1615, frame.html §5): a folder's sessions live inside it. On the canvas a folder lays out the ones at work (working,
 *  waiting, failed, paused, asking) and any the person put somewhere by hand; a quiet one (idle or done) is inside the
 *  folder (its opened view, the sidebar), its face says "Quiet", and it is not drawn just because it exists. A session in
 *  no folder lies loose, and only its newest IDLE_SHOWN quiet ones. A person's Mac holds hundreds of old sessions in one
 *  folder: the folder, the Diary and the zoom keep their sizes (next-realdata.test.ts) */
export const IDLE_SHOWN = 3;
const quiet = (p: Piece, asked: Set<string>) => p.kind === "session" && (p.state === "idle" || p.state === "done") && !p.term?.waiting && !asked.has(p.id);
const kept_in = (): Set<string> => keep("in", () => {
  const asked = new Set(open().map((a) => a.piece)), by = new Map<string, Piece[]>(), out = new Set<string>();
  for (const p of Object.values(D.pieces)) if (!p.inside && quiet(p, asked) && D.pos?.[p.id]?.by !== "person") by.set(p.region, [...(by.get(p.region) ?? []), p]);
  for (const [rid, ps] of by) [...ps].sort((a, b) => Number(b.born ?? 0) - Number(a.born ?? 0)).slice(D.regions.some((r) => r.id === rid) ? 0 : IDLE_SHOWN).forEach((p) => out.add(p.id));
  return out;
});
/** a quiet session kept inside its folder: no place on the canvas */
export const keptIn = (id: string): boolean => kept_in().has(id);
/** the pieces a folder shows on the plane: a piece inside a set is drawn in the set; a quiet session is inside the folder */
export const onPlane = (rid: string): Piece[] => piecesIn(rid).filter((p) => !p.inside && !(p.kind === "arrivals" && hidesArrivals()) && !keptIn(p.id));
/** the pieces on the plane (not inside a set, with a place), the blocks put beside a session, and a folder's place in the
 *  list: kept per version of the data, asked on every frame of a pan (#1615 S32) */
export const placedPieces = (): Piece[] => keep("placed", () => Object.values(D.pieces).filter((p) => !p.inside && D.pos?.[p.id] && !keptIn(p.id)));
export const joinedPieces = (): Piece[] => keep("joined", () => Object.values(D.pieces).filter((p) => !!p.joined));
export const regionIndex = (rid: string): number => keep("regionIndex", () => new Map(D.regions.map((r, i) => [r.id, i]).reverse() as [string, number][])).get(rid) ?? -1;
/** a folder's tint, 0…3 (.pl-t0…3), kept for the folder itself (localStorage "sol.tints", by its id), so it holds whichever
 *  folders the engine's messages brought first and wherever the folder sits in the list (BR1 #1615: P9 read clean-room
 *  t2 → t1 between two loads of the live home, when the tint was its place in the list). A folder seen for the first time
 *  takes the tint fewest of today's folders wear, the new ones in the list's order, so a list seen whole at once reads
 *  0, 1, 2, 3, 0… as before (a hash of the id gave web, infra and cli one coral). -1 for no folder. A colour kept in
 *  Customize draws over it */
const TINT_KEY = "sol.tints";
let tints: Record<string, number> | null = null;
export const tintOf = (rid: string | null | undefined): number => {
  if (!rid || regionIndex(rid) < 0) return -1;
  if (!tints) { try { tints = JSON.parse(globalThis.localStorage?.getItem(TINT_KEY) || "{}") || {}; } catch { tints = {}; } }
  const t = tints!, ok = (x: unknown): x is number => x === 0 || x === 1 || x === 2 || x === 3;
  if (ok(t[rid])) return t[rid];
  const worn = [0, 0, 0, 0];
  for (const r of D.regions) if (ok(t[r.id])) worn[t[r.id]]++;
  for (const r of D.regions) if (!ok(t[r.id])) { const k = worn.indexOf(Math.min(...worn)); t[r.id] = k; worn[k]++; }
  try { globalThis.localStorage?.setItem(TINT_KEY, JSON.stringify(t)); } catch { /* no storage: kept for this load */ }
  return t[rid];
};
/** tests: forget the kept tints (the store is read again on the next ask) */
export const tintsForget = (): void => { tints = null; };
/** the pieces under today's page (what the AI made unasked), kept per version of the data: Far draws them by their place */
export const diaryPieces = (): Piece[] => keep("diaryPieces", () => Object.values(D.pieces).filter((p) => !p.inside && D.pos?.[p.id] && !keptIn(p.id) && onDiary(p.id)));
/** a piece under today's page: its middle across the page's width and below its top, outside its own folder. A folded
 *  Diary is one line across the top, so nothing is under it */
export function onDiary(id: string): boolean {
  const q = D.pos?.[id], pg = D.zones?.page, p = D.pieces[id];
  if (!q || !pg || !p || D.pos?.[DIARY]?.folded) return false;
  const cx = q.x + q.w / 2, R = D.pos?.[p.region];
  return cx >= pg.x && cx <= pg.x + pg.w && q.y + q.h / 2 >= pg.y && !(R && overlaps(q, R));
}
/** an answer of the plane kept per version of the data (#1615 S32: the zones' extents are asked on every frame of a pan;
 *  a pan moves no place). Any change of the data, or of the plane's places by this file, makes it again */
const kept = { d: null as unknown, pos: null as unknown, zones: null as unknown, dv: -1, m: new Map<string, unknown>() };   // zones: the page's rect (D.zones)
function keep<T>(k: string, f: () => T): T {
  if (kept.d !== D || kept.pos !== D.pos || kept.zones !== D.zones || kept.dv !== dataVer()) { kept.d = D; kept.pos = D.pos; kept.zones = D.zones; kept.dv = dataVer(); kept.m.clear(); }
  if (!kept.m.has(k)) kept.m.set(k, f());
  return kept.m.get(k) as T;
}
export const isThing = (id: string) => !!regionOf(id) || (!!D.pieces[id] && !D.pieces[id].inside);
export function regionCols(n: number): number { return n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 6; }
/** a life thing: pages, lists, tables, stickies (the board's); arrivals are neither */
export const lifeThing = (p: Piece) => !BUILD_KINDS.has(p.kind) && p.kind !== "arrivals";
/** BR1, folders in folders: the folders at the top of the canvas (the rest are drawn inside theirs), and the folders
 *  sitting in one folder, in the order of their cells */
export const tops = () => keep("tops", () => D.regions.filter((r) => !parentOf(r.id)));
export const subs = (rid: string): string[] => keep("subs:" + rid, () => childrenOf(rid));
/** a folder's cells in order: the folders inside it first, then its build things (and arrivals); its life things from a
 *  fresh row. A folder's cell holds null here (it is a folder, not a piece) */
export function slots(rid: string, cols: number): (Piece | null)[] {
  const k = subs(rid).length, ps = onPlane(rid), head = ps.filter((p) => !lifeThing(p)), life = [...ps.filter((p) => lifeThing(p) && p.kind !== "sticky"), ...ps.filter((p) => p.kind === "sticky")];
  const n0 = k + head.length, gap = n0 && life.length && n0 % cols ? cols - (n0 % cols) : 0;
  return [...Array<null>(k).fill(null), ...head, ...Array<null>(gap).fill(null), ...life];
}
/** where a life folder's board starts (plane/index.tsx boardsOf): at its first life thing, else on the first row after
 *  its cells (the folders inside it and its build things), never over a folder inside it (BR1) */
export function boardTop(rid: string): number {
  const R = D.pos![rid], ps = onPlane(rid).filter((p) => lifeThing(p) && D.pos![p.id]);
  if (ps.length) return Math.min(...ps.map((p) => D.pos![p.id].y));
  const used = slots(rid, colsOf(rid)).length;
  return R.y + PAD_T + Math.ceil(used / colsOf(rid)) * CELL_H;
}
export function regionBox(rid: string): { cols: number; w: number; h: number } {
  const n = Math.max(1, subs(rid).length + onPlane(rid).length), cols = regionCols(n), rows = Math.max(1, Math.ceil(slots(rid, cols).length / cols));
  return { cols, w: cols * CELL_W - (CELL_W - PIECE_W) + 2 * PAD, h: rows * CELL_H - (CELL_H - PIECE_H) + PAD_T + PAD };
}
/** the person's own nesting (Pos.in, kept by the engine) over the rule's (a sub-folder on disk, a path inside another's);
 *  one that would make a loop or go past DEPTH is not taken */
function applyNest(): void {
  for (const r of D.regions) {
    const q = D.pos?.[r.id];
    if (!q || q.in === undefined || q.by !== "person") continue;
    if (q.in === null) { delete r.parent; r.parentBy = "person"; }
    else if (q.in !== r.parent && canNest(r.id, q.in)) { r.parent = q.in; r.parentBy = "person"; }
  }
}
/** each folder inside a folder: in its folder's cell, at the scale that fits its whole box there (Pos.s), its pieces at
 *  that scale too. Laid out again on every layout, as its folder may have moved; who put it there (`in`) is kept */
function placeInside(rid: string, depth = 0): void {
  const R = D.pos![rid];
  if (!R || depth >= DEPTH || !subs(rid).length) return;
  // a folder that holds folders is at least as tall as its cells (one the person sized keeps its width and columns)
  // a life folder with no life thing yet keeps a row under its folders for its board ("Write a sticky…", boardTop)
  const board = kindOf(rid) === "life" && !onPlane(rid).some((p) => lifeThing(p)) ? 1 : 0;
  const rows = Math.ceil(slots(rid, colsOf(rid)).length / colsOf(rid)) + board, need = (rows * CELL_H - (CELL_H - PIECE_H) + PAD_T + PAD) * (R.s ?? 1);
  if (!R.folded && R.h < need) { const old = R.y + R.h; R.h = need; if (!depth) pushBelow(rid, old, need - (old - R.y)); }
  subs(rid).forEach((c, j) => {
    const cell = cellAt(rid, j), box = regionBox(c), s = Math.min(cell.w / box.w, cell.h / box.h), was = D.pos![c];
    const q: Pos = { x: cell.x + (cell.w - box.w * s) / 2, y: cell.y, w: box.w * s, h: box.h * s, cols: box.cols, s, by: was?.by === "person" ? "person" : "rule", touched: !!was?.touched, at: was?.at ?? 0 };
    if (was?.in !== undefined) q.in = was.in;
    if (was?.folded) q.folded = true;
    if (was?.hand) q.hand = was.hand;
    if (was && (was.x !== q.x || was.y !== q.y || was.s !== q.s)) for (const p of onPlane(c)) delete D.pos![p.id];   // its pieces are laid out again inside it
    D.pos![c] = q;
    placeInside(c, depth + 1);
  });
}
export type Box = { r: { id: string }; cols: number; w: number; h: number };
type Flow = { at: { q: Box; x: number; y: number }[]; w: number; h: number };
/** the folders in a row that wraps at W (pieces.html "Both", frame.html §1): left to right, a new row when the next
 *  folder would pass W; never fewer than one to a row */
export function flow(qs: Box[], W: number): Flow {   // the sidebar's reorder lays the folders out by it too (sideorder.ts)
  const at: Flow["at"] = [];
  let x = 0, y = 0, rh = 0, w = 0;
  for (const q of qs) {
    if (x > 0 && x + q.w > W) { x = 0; y += rh + ROW_GAP; rh = 0; }
    at.push({ q, x, y }); w = Math.max(w, x + q.w); rh = Math.max(rh, q.h); x += q.w + R_GAP;
  }
  return { at, w: at.length ? w : ZONE_MIN_W, h: at.length ? y + rh : 0 };
}
/** the person's (and an AI's) places as the engine last said them or this face last kept them (BR1, folders in folders).
 *  A redraw that came while a folder was away (next.state before work.sessions, the move-in's redraw) drops its place;
 *  when the folder is back, so is its place and the folder it sits in. Arrange and an Undo lay out directly and keep
 *  their own say */
const held: Record<string, Pos> = {};
export function keptPlace(id: string, q: Pos): void { if (q.by === "rule") delete held[id]; else held[id] = { ...q }; }
hooks.onLoad.push(() => { for (const id of Object.keys(held)) delete held[id]; });
/** hooks.layout: what the plane holds changed (a message, a redraw); the places dropped while away put back, then laid out */
export function relayoutPlane(): void {
  D.pos = D.pos || {};
  // a folder's own Diary is kept by its place alone (BR1 slots): once its folder is here, the piece is made again
  for (const id of Object.keys(held)) { const rid = id.slice(FOLDER_DIARY.length); if (isFolderDiary(id) && !D.pieces[id] && regionOf(rid)) D.pieces[id] = folderDiary(rid); }
  for (const [id, q] of Object.entries(held)) if (!D.pos[id] && (regionOf(id) || D.pieces[id] || id === DIARY || isHolder(id))) D.pos[id] = { ...q };
  layoutPlane();
}
/** the first layout, by rule, at the person's scale (rule (d), Z_PERSON): today's page at its drawn width on the left, then
 *  every folder in one row that wraps where the window ends at that scale. A window that holds more leaves the rest as
 *  empty canvas; one that holds less lets the plane run on past its edges, reached by a pan or the edge chips. Nothing
 *  here is fitted to the window's size. Once any folder has a place (the person's, or saved), the rest are adopted under
 *  what is there (adopt): a folder never moves because another came */
export function layoutPlane(): void {
  D.pos = D.pos || {};
  applyNest();
  stale();   // the tree may have changed: tops and subs are asked again
  // a folder that was inside a folder and is a top again (the disk's rule changed, its folder went away, or the engine
  // kept the place) holds no cell's place: only placeInside scales a place (Pos.s). Kept, it sat shrunk in its old
  // folder's cell, beside the others that were there, and the canvas drew them as one stack apart from the row (BR1, #1615)
  for (const r of tops()) if (D.pos[r.id]?.s !== undefined) delete D.pos[r.id];
  const qs: Box[] = arranged().map((r) => ({ r, ...regionBox(r.id) }));
  const { w: vw, h: vh } = viewSize(), sa = safe("far"), z = Z_PERSON;
  const AW = (vw - sa.l - sa.r) / z, ah = vh - sa.t - sa.b;
  // folders already on the plane (the person's, or saved) keep their places, so the page ends a gap before the first of them
  const held = tops().map((r) => D.pos![r.id]).filter(Boolean), edge = held.length ? Math.min(...held.map((q) => q.x)) - Z_GAP : Infinity;
  const dw = Math.max(DIARY_W, Math.min(DIARY_PX / z, edge)), h = Math.max(PAGE_MIN_H, Math.min(PAGE_TALL * dw, (ah - RING_PX) / z - LABEL_H));
  const fx = dw + Z_GAP;
  // what runs past the foot continues below and is reached by a pan, never shrunk (rule (d))
  const f = flow(qs, Math.max(0, ...qs.map((q) => q.w), AW - fx));
  D.zones = { diary: { x: 0, w: dw }, page: { x: 0, y: LABEL_H, w: dw, h }, bottom: LABEL_H + h, fit: +z.toFixed(4) };
  if (!held.length) for (const { q, x, y } of f.at) D.pos[q.r.id] = { x: fx + x, y: LABEL_H + y, w: q.w, h: q.h, cols: q.cols, by: "rule", touched: false, at: 0 };
  adopt(Math.max(0, ...qs.map((q) => q.w), AW - fx));
  for (const r of tops()) placeInside(r.id);
  for (const r of D.regions) if (D.pos[r.id]) slots(r.id, colsOf(r.id)).forEach((p, i) => { if (p && !D.pos![p.id]) D.pos![p.id] = { ...cellAt(r.id, i), by: "rule", touched: false, at: 0 }; });
  startArrangement(z);
  diaryPlace();
  placeHolders();
  stale();   // a kept answer is made again (#1615 S32)
}
/** a holder's size by rule, plane units: a folder card's width (two columns), a little taller, so at the person's scale it
 *  shows its name and four lines (holders.html) */
export const HOLD_W = 2 * CELL_W - (CELL_W - PIECE_W) + 2 * PAD, HOLD_H = 720;
/** the holders (BR1, holders.html: Sessions and Made, born with every home): by rule, the next cells after the folders,
 *  left to right in the folders' last row, a new row under them when the row is full; with no open folder, beside today's
 *  page. A place the person gave one stays (D.pos, kept by the engine like any piece's) */
function placeHolders(): void {
  const Z = D.zones;
  if (!D.pos || !Z) return;
  const ids = holderIds().filter((id) => !D.pos![id]);
  if (!ids.length) return;
  const fs = tops().filter((r) => !isOff(r.id)).map((r) => D.pos![r.id]).filter((q): q is Pos => !!q && !q.folded);
  const others = (): Rect[] => [...fs, ...holderIds().map((id) => D.pos![id]).filter(Boolean), D.pos![DIARY] ?? Z.page];
  const x0 = fs.length ? Math.min(...fs.map((q) => q.x)) : Z.page.x + Z.page.w + Z_GAP, right = fs.length ? Math.max(...fs.map((q) => q.x + q.w)) : x0 + 3 * (HOLD_W + R_GAP);
  const lastY = fs.length ? Math.max(...fs.map((q) => q.y)) : Z.page.y, row = fs.filter((q) => q.y === lastY);
  let x = row.length ? Math.max(...row.map((q) => q.x + q.w)) + R_GAP : x0, y = lastY;
  for (const id of ids) {
    if (x > x0 && x + HOLD_W > Math.max(right, x0 + HOLD_W)) { x = x0; y = Math.max(y, ...fs.map((q) => q.y + q.h)) + R_GAP; }
    const c = { x, y, w: HOLD_W, h: HOLD_H };
    for (let n = 0; n < 40; n++) { const hit = others().find((q) => overlaps(c, q)); if (!hit) break; c.y = hit.y + hit.h + R_GAP; }
    D.pos[id] = { ...c, by: "rule", touched: false, at: 0 };
    x = c.x + HOLD_W + R_GAP;
  }
}

// ---------------------------------------------------------------- pieces by hand (BR1, #1615: mine/look/br1/pieces.html)
// There are no modes, only pieces: the Diary, a folder and a session each take the same four moves from the hand, with
// no AI needed: move, resize, fold and the ⋯ menu. The Diary's place is D.pos[DIARY] (it overrides the rule's page);
// folded is on the place (engine pos.ts keeps it). A folded piece keeps its open size here, for this session, so it
// unfolds as it was; a place read back folded unfolds at the rule's size.

/** a session's title: its task, never an agent (Marco 2026-11-21 11:51). The lab's example sessions were named "<agent> in <copy>"; that agent's name is dropped */
export const titleOf = (p: Piece) => {
  const n = String(p.name || p.copy || "A session"), a = typeof p.ai === "string" ? p.ai : "";
  const t = a && n.startsWith(a + " in ") ? n.slice(a.length + 4) : n;
  // a branch-like task ("fix-login") reads as words ("Fix login"), the same as the Diary says it (diary/book.ts taskOf)
  return /\s/.test(t) ? tidyTitle(t) : (t.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()));
};
/** a session named by its first words (scope (c), try 5's Done list, BR1 #1615): a home path in it is "~", and a name cut
 *  short ("…") ends on its last whole word, a bracket it cut open dropped, never "(/Users/someone/comp…" */
export function tidyTitle(t: string): string {
  const s = t.replace(/\/(?:Users|home)\/[^/\s)]+/g, "~");
  if (!s.endsWith("…")) return s;
  let c = s.slice(0, -1);
  const open = c.lastIndexOf("(");
  c = open > c.lastIndexOf(")") ? c.slice(0, open) : c.replace(/\s+\S*$/, "");
  c = c.replace(/[\s,:;–—-]+$/, "");
  return c ? c + "…" : s;
}
export const DIARY = "diary";
/** a folded piece on screen: the Diary's spine, a folder's tab (screen px) */
export const SPINE_PX = 44, TAB_PX = 34, TAB_W_PX = 180;
/** a folded tab keeps room for its dot, its ⋯ and its insets (the scale's --s12 and --s4): its name has the rest */
export const TAB_KEEP = 64;
/** the narrowest a tab is laid: a line's held floor (size.ts SIZE.line.min) one zoom step out, so a step out never widens
 *  a tab into its neighbour and joins them as one group (BR1 conform 1) */
export const TAB_MIN_PX = SIZE.line.min * ZSTEP;
/** My day's "+N" tab at the end of the row (narrow.html §2 .ftab.more): the folders that are not in the row */
export const MORE_PX = 56;
/** the narrowest a Diary may be pulled (plane units at Far's fit is not readable below DIARY_W) */
export const DIARY_MIN_W = DIARY_W * 0.6, DIARY_MIN_H = PAGE_MIN_H * 0.4;
const openSize = new Map<string, { w: number; h: number }>();
hooks.onLoad.push(() => openSize.clear());
export const folded = (id: string) => !!D.pos?.[id]?.folded;
/** a piece inside a folded folder, or anything taken off the canvas: not drawn, so it does not count where the camera looks */
export const tucked = (id: string): boolean => {
  if (off.has(id)) return true;
  const rid = D.pieces[id] ? D.pieces[id].region : regionOf(id) ? null : undefined;   // a folder inside a folded folder is tucked too (BR1)
  if (rid === undefined) return false;
  return [...(rid ? [rid] : []), ...ancestors(rid ?? id)].some((r) => folded(r) || off.has(r));
};
/** the person has moved, resized or put something somewhere: the rule never places again (a person's move always wins).
 *  A fold alone is not an arrangement (hand "fold"): it holds nothing, and Sol never says the person arranged the canvas
 *  after one (BR1 first-timer, scope 07:59) */
export const byHand = () => Object.values(D.pos || {}).some((q) => q.by === "person" && q.hand !== "fold");
/** the Diary's place, when it has one, is today's page */
function diaryPlace(): void {
  const q = D.pos?.[DIARY], Z = D.zones;
  if (!q || !Z) return;
  Z.page = { x: q.x, y: q.y, w: q.w, h: q.h };
  Z.diary = q.folded ? { x: q.x - 1, w: 0 } : { x: q.x, w: q.w };   // a spine is one line across the top: nothing is under it (onDiary)
  Z.bottom = Math.max(Z.bottom, q.y + q.h);
}
/** what leads when the person opens Sol: the move-in's answer (next.movein's lead); unsaid on a first run, Both where the
 *  window holds them side by side, else My day (hooks.firstLead, movein/seenFirst.ts); else both side by side */
export type Lead = "day" | "work" | "both" | null;
export const lead = (): Lead => { const v = (D.movein as { lead?: unknown } | undefined)?.lead ?? (hooks as { firstLead?: () => unknown }).firstLead?.(); return v === "day" || v === "work" || v === "both" ? v : null; };
/** the starting arrangement (pieces.html §2): applied by rule (by "rule") only while nothing on the plane is the person's.
 *  day: the Diary open and wide, the folders folded to tabs along its foot. work: the Diary folded to its spine across the
 *  top, the folders open. both, or unsaid: the rule's own, the Diary about a third of the width with the folders beside */
function startArrangement(z: number): void {
  const Z = D.zones, L0 = lead();
  if (!Z || !D.pos || !L0 || L0 === "both" || byHand()) return;
  if (D.pos[DIARY]) return;   // laid out once, on a fresh plane (live, relayout clears the rule's places first)
  const fs = tops().map((r) => D.pos![r.id]).filter(Boolean), zz = z > 0 ? z : 0.2;
  if (!fs.length) return;
  const x0 = Math.min(...fs.map((q) => q.x)), x1 = Math.max(...fs.map((q) => q.x + q.w));
  if (L0 === "work") {
    // the spine across the top; the folders as the rule put them, moved left to where the page was
    const dx = x0 - Z.page.x, sh = SPINE_PX / zz;
    for (const [id, q] of Object.entries(D.pos)) if (q.by === "rule" && (regionOf(id) || (D.pieces[id] && regionOf(D.pieces[id].region)))) q.x -= dx;
    D.pos[DIARY] = { x: Z.page.x, y: LABEL_H - 40 / zz - sh, w: x1 - dx - Z.page.x, h: sh, by: "rule", touched: false, at: 0, folded: true };
    return;
  }
  // day (narrow.html §2): the page as wide as the view holds and as tall as it holds over one row of tabs, the folders
  // folded to tabs in that row along its foot, each as wide as its name needs (TAB_W_PX at most), all of it at a zoom where
  // Far stands (never under its floor: the canvas scrolls instead). The tabs the row does not hold lie in rows under it,
  // where the canvas scrolls, and the row ends in "+N", which names them (dayMore, BR1 row 29). The tabs stand twice the
  // join distance apart, so each stays its own tab and never one "3 folders" group (BR1 conform 1)
  const z0 = Math.max(zz, FAR_FLOOR), { w: vw, h: vh } = viewSize(), sa = safe("far");
  const W = Math.max(DIARY_W, (vw - sa.l - sa.r) / z0), H = (vh - sa.t - sa.b - RING_PX) / z0 - LABEL_H;
  const th = TAB_PX / z0, gap = (2 * JOIN) / z0, mw = MORE_PX / z0, list = tops().filter((r) => D.pos![r.id]?.by === "rule");
  const ws = list.map((r) => Math.min(TAB_W_PX, Math.max(TAB_MIN_PX, Math.ceil(widthOf(String(r.name), TYPE.body[0], true)) + TAB_KEEP)) / z0);
  let k = list.length;
  more = null;
  if (ws.reduce((a, b) => a + b + gap, -gap) > W) { k = 0; for (let x = 0; k < list.length && x + ws[k] + gap + mw <= W; k++) x += ws[k] + gap; }
  // the row's tabs share what is left of its width, as narrow.html's flex row does, each its name's width at least
  const left = W - ws.slice(0, k).reduce((a, b) => a + b + gap, 0) - (k < list.length ? mw : 0) + (k < list.length ? 0 : gap);
  for (let i = 0; i < k; i++) ws[i] = Math.min(TAB_W_PX / z0, ws[i] + Math.max(0, left) / k);
  const ph = Math.max(DIARY_MIN_H, H - th - gap), y1 = Z.page.y + ph + gap;
  D.pos[DIARY] = { x: Z.page.x, y: Z.page.y, w: W, h: ph, by: "rule", touched: false, at: 0 };
  let nx = Z.page.x, ny = y1;
  list.forEach((r, i) => {
    const q = D.pos![r.id];
    // the rest start under the window's bottom edge (Far's camera puts the page's top at sa.t + RING_PX, lineCam), so the
    // view holds the one row narrow.html draws and "+N" is the only word for them until it is pressed
    if (i === k) { more = { x: nx, y: y1, w: mw, h: th, ids: list.slice(k).map((x) => x.id) }; nx = Z.page.x; ny = Math.max(y1 + th + gap, Z.page.y + (vh - sa.t - RING_PX) / z0 + gap); }
    else if (i > k && nx + ws[i] > Z.page.x + W) { nx = Z.page.x; ny += th + gap; }
    const tw = ws[i], at = { x: nx, y: ny };
    nx += tw + gap;
    for (const p of onPlane(r.id)) { const pq = D.pos![p.id]; if (pq && pq.by === "rule") { pq.x += at.x - q.x; pq.y += at.y - q.y; } }
    openSize.set(r.id, { w: q.w, h: q.h });
    Object.assign(q, { ...at, w: tw, h: th, folded: true });
  });
}
/** My day's "+N" (narrow.html §2): where it stands at the end of the tabs' row, and the folders it names, the ones the
 *  row does not hold; null when the row holds them all, or once the person moved, unfolded or laid the canvas out again */
let more: { x: number; y: number; w: number; h: number; ids: string[] } | null = null;
hooks.onLoad.push(() => { more = null; });
export function dayMore(): { x: number; y: number; w: number; h: number; ids: string[] } | null {
  if (!more || lead() !== "day" || !D.pos || byHand()) return null;
  const ids = more.ids.filter((id) => D.pos![id]?.folded && D.pos![id].by === "rule");
  return ids.length ? { ...more, ids } : null;
}
/** taken off the canvas (the ⋯ menu): face state for this session; nothing is deleted, the undo or a load brings it back */
const off = new Set<string>();
hooks.onLoad.push(() => off.clear());
export const isOff = (id: string) => off.has(id) || onShelf(id) || isOffHolder(id);   // a folder on the shelf is off, kept by the engine (BR1 order 2)
export const setOff = (id: string, on: boolean) => { if (on) off.add(id); else off.delete(id); };
/** the counts' and the stills' handle: what the move-in said leads, the plane laid out again by rule from it */
export function setLead(l: Lead): void {
  D.movein = { ...((D.movein as object) || {}), lead: l };
  more = null;
  if (!D.pos) return;
  for (const [id, q] of Object.entries(D.pos)) if (q.by === "rule" || q.hand === "fold") delete D.pos[id];   // a fold alone goes with the rule's
  openSize.clear();
  layoutPlane();
  S.camSet = false;
  hooks.settleCam?.();
}
/** fold or unfold a piece where it stands (its open size kept, to unfold as it was); by the person, so no rule redoes it */
export function fold(id: string, on: boolean, by: "person" | "rule" = "person"): boolean {
  if (id === DIARY && !D.pos?.[DIARY] && D.zones) D.pos![DIARY] = { ...D.zones.page, by: "rule", touched: false, at: 0 };
  const q = D.pos?.[id];
  if (!q || !!q.folded === on) return false;
  const z = S.cam.z || 0.3;
  if (on) {
    openSize.set(id, { w: q.w, h: q.h });
    if (id === DIARY) q.h = SPINE_PX / z;
    else if (regionOf(id)) { q.h = TAB_PX / z; q.w = Math.min(q.w, TAB_W_PX / z); }
    else if (isHolder(id)) q.h = TAB_PX / z;   // a holder to its top strip, its name and count (holders.html)
  } else {
    const o = openSize.get(id) || (regionOf(id) ? regionBox(id) : id === DIARY ? { w: Math.max(DIARY_W, q.w), h: PAGE_MIN_H } : isHolder(id) ? { w: HOLD_W, h: HOLD_H } : null);
    if (o) { q.w = o.w; q.h = o.h; }
  }
  if (by !== "person") delete q.hand; else if (q.by !== "person") q.hand = "fold";   // folded where the rule put it: only a fold
  q.folded = on; q.by = by; q.touched = true;
  if (id === DIARY) diaryPlace();
  stale();
  return true;
}
/** the Diary pulled by its corner (plane units): never under the readable size */
export function resizeDiary(w: number, h: number): boolean {
  if (!D.pos?.[DIARY] && D.zones) D.pos![DIARY] = { ...D.zones.page, by: "rule", touched: false, at: 0 };
  const q = D.pos?.[DIARY];
  if (!q || q.folded) return false;
  q.w = Math.max(DIARY_MIN_W, w); q.h = Math.max(DIARY_MIN_H, h); q.by = "person"; q.touched = true; delete q.hand;
  diaryPlace(); stale();
  return true;
}
/** the Diary moved (plane units) */
export function moveDiary(x: number, y: number): boolean {
  if (!D.pos?.[DIARY] && D.zones) D.pos![DIARY] = { ...D.zones.page, by: "rule", touched: false, at: 0 };
  const q = D.pos?.[DIARY];
  if (!q) return false;
  q.x = x; q.y = y; q.by = "person"; q.touched = true; delete q.hand;
  diaryPlace(); stale();
  return true;
}
/** the folders' left edge: where the first of them stands, else a gap after today's page */
const foldersX = (): number => {
  const xs = tops().map((r) => D.pos?.[r.id]).filter((q): q is Pos => !!q && !q.folded).map((q) => q.x);
  return xs.length ? Math.min(...xs) : (D.zones ? D.zones.page.x + D.zones.page.w : DIARY_W) + Z_GAP;
};
/** a new folder beside held ones, moving nothing that has a place: the first free place in the folders' rows (left to
 *  right, as wide as the rule's row `W`, so one that comes back takes the gap it left), else at the folders' left edge
 *  under what is there */
function adopt(W: number): void {
  for (const r of tops().filter((r) => !D.pos![r.id])) {   // one inside a folder is placed in its cell (placeInside)
    const box = regionBox(r.id), x0 = foldersX(), c = { x: x0, y: LABEL_H, w: box.w, h: box.h };
    const taken = tops().filter((q) => q.id !== r.id && D.pos![q.id]).map((q) => D.pos![q.id]);
    const room = (x: number, y: number) => !taken.some((q) => overlaps({ x: x - R_GAP / 2, y: y - ROW_GAP / 2, w: box.w + R_GAP, h: box.h + ROW_GAP }, q));
    const rows = [...new Set([LABEL_H, ...taken.filter((q) => !q.folded).map((q) => q.y)])].sort((a, b) => a - b);
    let at: { x: number; y: number } | null = null;
    for (const y of rows) {
      for (let x = x0, n = 0; x + box.w <= x0 + W && n <= taken.length; n++) {
        if (room(x, y)) { at = { x, y }; break; }
        const hit = taken.filter((q) => q.x + q.w + R_GAP > x && q.y < y + box.h && y < q.y + q.h).sort((a, b) => a.x - b.x)[0];
        x = hit ? Math.max(x + 1, hit.x + hit.w + R_GAP) : x + box.w + R_GAP;
      }
      if (at) break;
    }
    if (at) { c.x = at.x; c.y = at.y; }
    else for (let n = 0; n <= taken.length; n++) { const hit = taken.find((q) => overlaps(c, q)); if (!hit) break; c.y = hit.y + hit.h + ROW_GAP; }
    D.pos![r.id] = { ...c, cols: box.cols, by: "rule", touched: false, at: now() };
  }
}
/** Arrange (the bar, #1615): the person's order of the folders for this session, face state only (no store keeps it yet).
 *  Unset, the rule's order: the list's. The tint stays the list's (regionIndex), so a folder keeps its colour when it moves */
let order: string[] | null = null;
hooks.onLoad.push(() => { order = null; });   // a scenario loaded is laid out by the rule
export const arrangement = (): string[] | null => (order ? [...order] : null);
function arranged(): { id: string }[] {
  if (!order) return tops();
  const at = new Map(order.map((id, i) => [id, i]));
  return [...tops()].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9));
}
/** lay the folders out again by rule in this order (null: the rule's own): every folder's place and the places of the
 *  things in it go back to the rule, the person's too; what sits under today's page stays where it is */
export function arrange(next: string[] | null): void {
  if (!D.pos) return;
  order = next ? [...next] : null;
  const ins: [string, string | null][] = [];   // which folder sits in which is the person's still (BR1): only places go back
  for (const r of D.regions) {
    for (const p of onPlane(r.id)) if (D.pos[p.id] && !onDiary(p.id)) delete D.pos[p.id];
    const q = D.pos[r.id];
    if (q?.by === "person" && q.in !== undefined) ins.push([r.id, q.in]);
    delete D.pos[r.id];
  }
  layoutPlane();
  for (const [id, into] of ins) { const q = D.pos[id]; if (q) { q.in = into; q.by = "person"; } }
}
/** put the arrangement back as it was (Arrange's undo): the order, and the places as they were */
export function unarrange(was: { order: string[] | null; pos: string; zones: string }): void {
  order = was.order;
  D.pos = JSON.parse(was.pos);
  D.zones = JSON.parse(was.zones);
  stale();
}
export const arrangeSnap = () => ({ order: arrangement(), pos: JSON.stringify(D.pos || {}), zones: JSON.stringify(D.zones || null) });
/** a folder's columns: its own, else as many as its width holds (a pos the person sized, kept by the engine, can come
 *  back without them; its folders inside were then placed at NaN and the camera with them, so the live plane drew none) */
export function colsOf(rid: string): number {
  const R = D.pos?.[rid];
  if (R?.cols && R.cols > 0) return R.cols;
  const fit = R ? Math.floor((R.w / (R.s ?? 1) - 2 * PAD + CELL_W - PIECE_W) / CELL_W) : NaN;
  return Number.isFinite(fit) && fit >= 1 ? fit : regionBox(rid).cols;
}
export function cellAt(rid: string, i: number): Rect {
  const R = D.pos![rid], n = colsOf(rid), c = i % n, row = Math.floor(i / n), s = R.s ?? 1;   // a folder inside a folder: its cells at its scale
  return { x: R.x + s * (PAD + c * CELL_W), y: R.y + s * (PAD_T + row * CELL_H), w: PIECE_W * s, h: PIECE_H * s };
}
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const takenRects = () => Object.entries(D.pos!).filter(([id]) => (D.pieces[id] && !D.pieces[id].inside) || parentOf(id)).map(([, q]) => q);   // a folder inside a folder takes its cell
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
  R.h += CELL_H * (R.s ?? 1);
  if (parentOf(rid)) { stale(); return; }   // one inside a folder is fitted to its cell again at the next layout
  pushBelow(rid, old, CELL_H);
  stale();   // a kept answer is made again (#1615 S32)
}
/** a top folder grew down from `old`: what sits under it by rule moves down by `dy`, the folders inside it and their pieces
 *  with it; the person's places never move */
function pushBelow(rid: string, old: number, dy: number): void {
  const R = D.pos![rid];
  const below = tops().filter((r) => r.id !== rid && D.pos![r.id] && D.pos![r.id].y >= old - 1 && D.pos![r.id].x < R.x + R.w && R.x < D.pos![r.id].x + D.pos![r.id].w);
  for (const r of below) {
    const inner = D.regions.filter((x) => ancestors(x.id).includes(r.id)).map((x) => x.id), ps = [r.id, ...inner].flatMap((id) => onPlane(id));
    if (D.pos![r.id].by === "person" || ps.some((p) => D.pos![p.id] && D.pos![p.id].by === "person")) continue;   // the person's places never move
    for (const id of [r.id, ...inner]) if (D.pos![id]) D.pos![id].y += dy;
    for (const p of ps) if (D.pos![p.id]) D.pos![p.id].y += dy;
  }
}
/** the Diary: today's page over the zone's full height; what the AI puts there stacks up from the zone's foot, one to a
 *  row, and the page gives up a row for each */
export const diarySpot = () => (D.zones ? { ...D.zones.page, zone: "diary" } : null);
export function diaryFree(): Spot | null {
  if (!D.zones) return null;
  const pg = D.zones.page, taken = takenRects(), foot = D.zones.bottom || pg.y + pg.h + R_GAP + CELL_H;
  const px = (D.zones as { page0?: { x: number } }).page0?.x ?? pg.x;   // round 8 fixes · F4 (slice R8): at the page as laid out, never where a narrow window grew it to
  for (let i = 0; i < 300; i++) {
    const c = { x: px, y: foot - (i + 1) * CELL_H + (CELL_H - PIECE_H), w: PIECE_W, h: PIECE_H };
    if (taken.some((q) => overlaps(q, c))) continue;
    if (c.y - R_GAP < pg.y + PAGE_MIN_H / 2) return { x: px, y: foot + R_GAP + i * CELL_H, w: PIECE_W, h: PIECE_H, zone: "diary" };   // the page keeps half its least height
    pg.h = Math.min(pg.h, c.y - R_GAP - pg.y); stale();
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
    if (p.inside || D.pos[p.id] || !D.pos[p.region] || (p.kind === "arrivals" && hidesArrivals()) || keptIn(p.id)) continue;
    const R = D.pos[p.region], mine = piecesIn(p.region).filter((q) => q.id !== p.id && D.pos![q.id] && overlaps(D.pos![q.id], R)), st = mine.filter(lifeThing).map((q) => D.pos![q.id].y);
    const minY = !lifeThing(p) ? undefined : st.length ? Math.min(...st) : mine.length ? Math.max(...mine.map((q) => D.pos![q.id].y)) + 1 : undefined;
    const sp = spotForRegion(p.region, { minY });
    // a session the engine listed (from "work") lands by the rule: it is the person's only once they move it. Landed as the
    // person's, every listed session made the plane hand-laid (byHand), and the rule never laid it out again (BR1, #1615)
    if (sp && put(p.id, sp, p.from === "work" ? "rule" : p.by && p.by !== "person" && p.by !== "rule" ? "ai" : "person", { asked: true })) n++;
  }
  return n;
}
/** settle's question alone: is any piece waiting for a place (the view asks before it presses M.land) */
export const unplaced = (): boolean => keep("unplaced", unplacedNow);   // asked after every draw, a pan's too (#1615 S32)
const unplacedNow = (): boolean => !!D.pos && !!D.zones && Object.values(D.pieces).some((p) => !p.inside && !D.pos![p.id] && !!D.pos![p.region] && p.kind !== "arrivals" && !keptIn(p.id));
/** a piece someone made: placed where asked, marked new until the person touches it (P5). An AI never moves what the
 *  person put somewhere, unless the person asked (P13): a hand placement stays put. (Before BR1 an AI placed in the Diary's
 *  zone only; with no zones it places where it aims, and its move is undone from its line) */
export function put(id: string, spot: Partial<Spot> | null, by: Pos["by"] = "person", opt: { asked?: boolean } = {}): boolean {
  if (!spot || !D.pieces[id] || spot.x == null || spot.y == null) return false;
  D.pos = D.pos || {};
  const p = D.pieces[id], had = D.pos[id];
  if (by === "ai" && !opt.asked && had && had.by === "person") return false;
  if (spot.grow && D.pos[spot.grow]) growRegion(spot.grow);
  if (spot.region && p.region !== spot.region && regionOf(spot.region)) p.region = spot.region;
  D.pos[id] = { x: spot.x!, y: spot.y!, w: spot.w || PIECE_W, h: spot.h || PIECE_H, by, touched: false, at: now(), fresh: true };
  stale();   // a kept answer is made again (#1615 S32)
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
  // Far holds the person's scale (rule (d)); Middle fits the rect inside its band
  const z = band === "far" ? Z_PERSON : Math.max(FIT.middle.min, Math.min(aw / rect.w, ah / rect.h, FIT.middle.max));
  const sx = rect.w * z > aw ? sa.l + (rect.w * z) / 2 : sa.l + aw / 2, sy = rect.h * z > ah ? sa.t + (rect.h * z) / 2 : sa.t + ah / 2;   // where the rect's centre goes
  return { x: rect.x + rect.w / 2 - (sx - w / 2) / z, y: rect.y + rect.h / 2 - (sy - h / 2) / z, z: +z.toFixed(4) };
}
/** the camera that shows a piece whole in Middle's safe area, at the same zoom, moved as little as it takes; null when it
 *  stands there already. A starter born in a full folder takes a new row at its foot, under the bar and the fade, and the
 *  person saw nothing happen (BR1 F9, #1615): the camera follows it down. Too tall to fit, its top comes first */
export function camToShow(id: string, cam: Cam = S.cam): Cam | null {
  const q = D.pos?.[id];
  if (!q) return null;
  const { w, h } = viewSize(), sa = safe("middle"), r = rectOn(q, cam);
  const dy = r.y < sa.t || r.h > h - sa.t - sa.b ? r.y - sa.t : r.y + r.h > h - sa.b ? r.y + r.h - (h - sa.b) : 0;
  const dx = r.x < sa.l || r.w > w - sa.l - sa.r ? r.x - sa.l : r.x + r.w > w - sa.r ? r.x + r.w - (w - sa.r) : 0;
  return Math.abs(dx) < 1 && Math.abs(dy) < 1 ? null : { ...cam, x: cam.x + dx / cam.z, y: cam.y + dy / cam.z };
}
/** everything on the plane: folders, pieces and today's page */
export function bounds(): Rect {
  const rs: Rect[] = Object.entries(D.pos || {}).filter(([id, q]) => (regionOf(id) || (D.pieces[id] && !D.pieces[id].inside)) && !tucked(id) && [q.x, q.y, q.w, q.h].every(Number.isFinite)).map(([, q]) => q);   // a pos at NaN never moves the camera
  if (D.zones) rs.push(D.zones.page);
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
    if (rid && D.pos[rid] && !(S.camSet && openAt(rid) && focusAt(S.cam) === rid)) S.cam = camOn(D.pos[rid], "middle");
  }
  S.camSet = true; S.camRule = S.cam; S.camLine = safe("far").b;
}
/** Far's camera (rule (d)): the person's scale, the plane's top left at the safe area's top left (an AI's ribbon kept
 *  clear above it), then moved across so only whole columns stand on screen. The ask line coming or going moves nothing:
 *  a column taller than the window continues under it, reached by a pan */
export function farCam(): Cam { return keepWidth(lineCam(), whole, Z_PERSON); }   // round 8 fixes · F4: today's page keeps its width (slice R8, fits/fit.ts)
function lineCam(): Cam {
  const b = bounds(), { w, h } = viewSize(), sa = safe("far"), z = Z_PERSON, top = sa.t + RING_PX;
  return { x: b.x + (w / 2 - sa.l) / z, y: b.y - (top - h / 2) / z, z: +z.toFixed(4) };
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
/** how wide the folded Diary's spine may run from its left edge `r` (on screen) before it reaches a card in its row: a
 *  spine never covers a card's name (BR1 try 3, scope 08:19). Folded, the Diary keeps its open width, and its line ran over
 *  the folders beside it; a spine across the top, over every folder, keeps its whole width */
export function spineRoom(r: { x: number; y: number }, cam: Cam = S.cam): number {
  let room = Infinity;
  for (const [id, q] of Object.entries(D.pos || {})) {
    if (id === DIARY || !isThing(id) || tucked(id) || isOff(id)) continue;
    const c = rectOn(q, cam);
    if (c.y < r.y + SPINE_PX && c.y + c.h > r.y && c.x > r.x) room = Math.min(room, c.x - r.x - SPINE_GAP);
  }
  return room;
}
const SPINE_GAP = 12;
/** a window too narrow for the canvas at the person's scale shows its first columns of cards whole and the next one not at
 *  all, never a card cut by a side edge: the zoom stays, the top stays, only the canvas's left edge moves (between the
 *  window's edge and as far right as keeps the next column wholly past it). The columns left out are named by an edge chip */
function whole(c: Cam): Cam {
  const cs = cardSpans();
  if (!D.zones || !cs.length) return c;
  const { w } = viewSize(), sa = safe("far"), z = c.z, x0 = cs[0][0], n = cs.length, at = (L: number) => ({ ...c, x: x0 + (w / 2 - L) / z });
  for (let k = n; k >= 1; k--) {
    const W = (cs[k - 1][1] - x0) * z, G = k < n ? (cs[k][0] - x0) * z : Infinity;
    const lo = Math.max(0, w - G), hi = w - (k < n ? EDGE_PX : Math.min(sa.r, EDGE_PX)) - W;   // the k-th column ends inside, the next starts past the edge
    if (lo <= hi) return at(Math.min(hi, Math.max(lo, sa.l)));
  }
  return at(sa.l);   // not even the first column fits: it starts at the safe edge, and the person pans
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
  for (const r of tops()) {
    const q = D.pos?.[r.id];
    if (!q) continue;
    const dx = Math.max(q.x - c.x, 0, c.x - q.x - q.w), dy = Math.max(q.y - c.y, 0, c.y - q.y - q.h), d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = r.id; }
  }
  // inside it, the deepest folder under the middle that draws whole at this camera (BR1, folders in folders)
  for (let n = 0; best && n < DEPTH; n++) {
    const inner: string | undefined = subs(best).find((s) => { const q = D.pos?.[s]; return !!q && c.x >= q.x && c.x <= q.x + q.w && c.y >= q.y && c.y <= q.y + q.h && openAt(s, cam); });
    if (!inner) break;
    best = inner;
  }
  return best;
}
/** a pan or a zoom: the folder in focus and its form follow the camera (drawn whole: opened, Middle); no history step,
 *  no move counted */
export function camMoved(): void {
  const was = `${S.dist} ${S.region} ${S.sel}`, f = focusAt();
  if (!f || !openAt(f)) { S.dist = "far"; S.region = null; }
  else { if (f !== S.region) S.sel = 0; S.dist = "middle"; S.region = f; }
  // the camera alone moved: only what stands on it draws again (#1615 S32)
  if (`${S.dist} ${S.region} ${S.sel}` === was) renderCam(); else render();
}
/** what stands on the plane right now: a folder by any part, a piece by its corner, where its name is */
export function inView(id: string, cam: Cam = S.cam): boolean {
  const q = D.pos?.[id];
  if (!q || S.dist === "near" || S.dist === "needs") return false;
  const { w, h } = viewSize();
  // a folder at Far by its card as drawn, held at its size (the infinite canvas, size.ts); at Middle by its area
  if (regionOf(id)) { if (S.dist !== "far" || parentOf(id)) return regionShown(id, cam); const r = heldOn(q, cam, w, h, "card"); return r.x < w && r.x + r.w > 0 && r.y < h && r.y + r.h > 0; }
  const r = rectOn(q, cam), cx = r.x + Math.min(r.w, 40) / 2, cy = r.y + Math.min(r.h, 40) / 2;
  return cx >= 0 && cx <= w && cy >= 0 && cy <= h;
}

// ---------------------------------------------------------------- the folders' seam (engine.js CV.zones, BR1: no zones)

/** the folders in the canvas's reading order (core.ts folderOrder), kept per version of the data: the sidebar's order (K2) */
export const folderOrderOnPlane = (): string[] => [...keep("order", folderOrder)];
/** a new folder (K1): sessions or stickies (what it is made as; where it goes does not depend on it); it goes under the
 *  last folder at the folders' left edge, or, made inside a folder (`into`, BR1), in that folder's next cell. The
 *  person's alone: an AI does not make folders */
export function makeFolder(name: string, kind?: string, want?: string, into?: string | null): { ok: boolean; id?: string; why?: string; undo: () => void } {
  name = String(name || "").trim();
  const none = () => {};
  if (!name || !D.zones || !D.pos) return { ok: false, why: "a folder needs a name", undo: none };
  const life = kind === "life" || kind === "stickies", base = want ?? (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder");
  if (want && regionOf(want)) return { ok: true, id: want, undo: none };   // the engine's folder of that name: the same one
  let id = base, n = 2;
  while (regionOf(id) || D.pieces[id]) id = base + "-" + n++;
  if (into && regionOf(into) && D.pos[into]) {
    if (ancestors(into).length + 1 > DEPTH) return { ok: false, why: "folders go eight deep at most", undo: none };
    D.regions.push({ id, name, kind: life ? "life" : "code", made: true });
    const r = nest(id, into);
    if (!r.ok) { D.regions = D.regions.filter((x) => x.id !== id); stale(); return { ok: false, why: r.why, undo: none }; }
    return { ok: true, id, undo: () => {
      if (piecesIn(id).length || subs(id).length) return;
      r.undo(); D.regions = D.regions.filter((x) => x.id !== id); delete D.pos![id]; stale();
      if (S.region === id) { S.region = into; settleCam(); }
    } };
  }
  const x = foldersX();
  D.regions.push({ id, name, kind: life ? "life" : "code", made: true });
  const box = regionBox(id), mine = D.regions.filter((r) => r.id !== id && D.pos![r.id]).map((r) => D.pos![r.id]);
  const firstCol = mine.filter((q) => q.x < x + 1), y = mine.length ? Math.max(...(firstCol.length ? firstCol : mine).map((q) => q.y + q.h)) + R_GAP : LABEL_H;
  D.pos[id] = { x, y, w: box.w, h: box.h, cols: box.cols, by: "person", touched: true, at: now() };
  stale();
  return { ok: true, id, undo: () => {
    if (piecesIn(id).length) return;
    D.regions = D.regions.filter((r) => r.id !== id); delete D.pos![id]; stale();
    if (S.region === id) { S.region = null; S.dist = "far"; settleCam(); }
  } };
}
/** a folder put into another (null: the top) by the person (BR1, folders in folders): which folder holds it is the
 *  person's (Pos.in, kept by the engine), its place in there the rule's: the next cell, at the scale that fits. Refused:
 *  into itself or a folder inside it, or deeper than DEPTH. Undo puts the tree and every place back as they were */
export function nest(id: string, into: string | null): { ok: boolean; why?: string; undo: () => void } {
  const none = () => {}, r = regionOf(id);
  if (!r || !D.pos || (into != null && !D.pos[into])) return { ok: false, why: "There is no such folder", undo: none };
  const from = parentOf(id);
  if (from === into) return { ok: false, why: into ? `${r.name} is in ${regionOf(into)?.name} already` : `${r.name} is on the canvas already`, undo: none };
  if (!canNest(id, into)) return { ok: false, why: `${r.name} can't go inside itself or a folder in it, or more than eight deep`, undo: none };
  const was = { parent: r.parent, parentBy: r.parentBy, pos: JSON.stringify(D.pos) };
  if (into) r.parent = into; else delete r.parent;
  r.parentBy = "person";
  // the cells of the folder it left and the one it joins are laid out again (the person's own places stay), and its own
  // pieces at its new scale
  for (const f of [from, into]) if (f) for (const p of onPlane(f)) if (D.pos[p.id]?.by === "rule") delete D.pos[p.id];
  for (const p of onPlane(id)) delete D.pos[p.id];
  delete D.pos[id];
  layoutPlane();
  const q = D.pos[id];
  if (q) { q.in = into; q.by = "person"; q.touched = true; q.at = now(); }
  stale();
  return { ok: true, undo: () => {
    if (was.parent === undefined) delete r.parent; else r.parent = was.parent;
    if (was.parentBy === undefined) delete r.parentBy; else r.parentBy = was.parentBy;
    D.pos = JSON.parse(was.pos);
    stale();
  } };
}
/** a folder dragged by the person (K2): its pieces and the folders inside it move with it, all of it the person's place
 *  now; what it is stays */
export function dragFolder(rid: string, dx: number, dy: number): boolean {
  const R = D.pos?.[rid];
  if (!R) return false;
  const inner = D.regions.filter((r) => r.id !== rid && ancestors(r.id).includes(rid) && D.pos![r.id]).map((r) => r.id), held = new Set([rid, ...inner]);
  const inR = Object.keys(D.pos!).filter((id) => D.pieces[id] && !D.pieces[id].inside && held.has(D.pieces[id].region) && overlaps(D.pos![id], D.pos![D.pieces[id].region]));
  R.x += dx; R.y += dy; R.by = "person"; R.touched = true; delete R.hand;
  for (const id of inR) { const q = D.pos![id]; q.x += dx; q.y += dy; q.by = "person"; delete q.hand; }
  for (const id of inner) { const q = D.pos![id]; q.x += dx; q.y += dy; }   // placed in their cells by rule; which folder holds them stays as it was
  stale();   // a kept answer is made again (#1615 S32)
  return true;
}
export type Side = "left" | "right";
/** round 4, BR1 (no zones): what lies past one side of the view at Far, cut by the edge or wholly beyond it: the folders
 *  (not taken off, not tucked) and whether today's page is among it. The edge chips name it */
export function past(side: Side): { folders: string[]; diary: boolean } {
  const { w } = viewSize(), out = (x0: number, x1: number) => (side === "left" ? toScreen(x0, 0).x < -1 : toScreen(x1, 0).x > w + 1);
  const folders = tops().filter((r) => { const q = D.pos?.[r.id]; return !!q && !isOff(r.id) && out(q.x, q.x + q.w); }).map((r) => r.id);
  const pg = D.zones?.page;
  return { folders, diary: !!pg && !off.has(DIARY) && out(pg.x, pg.x + pg.w) };
}
/** an edge chip's press: Far pans (the zoom stays) by whole columns of cards: to the right, the first column not wholly in
 *  view comes to the safe left edge; to the left, the last one not wholly in view comes to the safe right edge. Null when
 *  nothing lies that way */
export function edgeCam(side: Side): Cam | null {
  if (S.dist !== "far") return null;
  const { w } = viewSize(), sa = safe("far"), z = S.cam.z, cs = cardSpans(), sx = (x: number) => toScreen(x, 0).x;
  const c = side === "right" ? cs.find(([, e]) => sx(e) > w + 1) : [...cs].reverse().find(([s0]) => sx(s0) < -1);
  if (!c) return null;
  return { ...S.cam, x: side === "right" ? c[0] - (sa.l - w / 2) / z : c[1] - (w - sa.r - w / 2) / z };
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
export { kindOf };

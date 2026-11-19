// owned by slice 1 (Plane), docs/port/slices.md
// The plane's moves (#1615; engine.js "the plane's moves", CV.zones, runs.js pause/resume/stop), merged into M by
// moves/index.ts. Pan and zoom move the camera only (no history step); enter and leave are in and out; jump is go to;
// toDiary and toZone are the chips' presses; place (#7) is the person's own spot for a piece or a folder (live: "not
// yet", next.pos.set is slice 7's); land settles what was made without a place, marked new (#6, make's landing);
// newFolder is CV.zones.make; pause, resume and stop act on a face (#15: live, stop is work.stop; a held run that
// resumes is "not yet"). It also plugs the plane into the store: hooks.layout and hooks.settleCam (layout.ts), the
// plane's plain keys at Far and Middle, and hooks.zones / hooks.plane, the seam the counts read as the mockup's
// CV.zones and CV.plane (docs/port/requests/plane.md asks for them on the store's own name).
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { D, S, M as CoreM, MODE, go, done, notYet, render, hooks, regionOf, viewSize, type Done, type Moves, type Piece, type Ask } from "../core.ts";
import * as L from "../../plane/layout.ts";
import { link } from "../wire/plane.ts";

const camWas = () => { const c = S.cam, d = S.dist, r = S.region; return () => { S.cam = c; S.dist = d; S.region = r; render(); }; };
const camMove = (ok: boolean, undo: () => void): Done => ({ ok, id: S.region ?? undefined, undo });

/** a run on the plane: a session, or a part of a split job (runs.js find, for pause, resume and stop) */
function run(id?: string): Piece | null {
  if (!id) id = S.piece ?? undefined;
  if (!id) return null;
  const ai = D.ais.find((a) => a.name.toLowerCase() === String(id).toLowerCase());
  if (ai) id = ai.piece;
  const p = D.pieces[id];
  return p && p.kind === "session" ? p : null;
}
const each = (p: Piece, fn: (x: Piece) => void) => { fn(p); (p.parts || []).forEach(fn); };
const states = (p: Piece) => [p, ...(p.parts || [])].map((x) => [x, x.state] as const);
const restore = (was: (readonly [Piece, string | undefined])[]) => () => { for (const [x, s] of was) x.state = s; render(); };

const moves: Moves = {
  /** a drag on empty plane, two fingers, the arrows with a pan: the camera only */
  pan(dx: number, dy: number) {
    if (!(S.dist === "far" || S.dist === "middle") || S.page) return done(false);
    const back = camWas();
    S.cam = { ...S.cam, x: S.cam.x - dx / S.cam.z, y: S.cam.y - dy / S.cam.z };
    L.camMoved();
    return camMove(true, back);
  },
  /** a pinch, ⌘+ / ⌘−, the wheel with ctrl: about a point of the view (its middle when unsaid) */
  zoom(f: number, sx?: number, sy?: number) {
    if (!(S.dist === "far" || S.dist === "middle") || S.page) return done(false);
    const { w, h } = viewSize();
    if (sx == null || sy == null) { sx = w / 2; sy = h / 2; }
    const back = camWas(), p = L.toPlane(sx, sy), z = Math.min(L.ZMAX, Math.max(L.ZMIN, S.cam.z * Number(f)));
    S.cam = { x: p.x - (sx - w / 2) / z, y: p.y - (sy - h / 2) / z, z };
    L.camMoved();
    return camMove(true, back);
  },
  enter(id?: string) { return M().dive(id); },
  leave() { return M().out(); },
  jump(id?: string) { return M().goto(id); },
  /** ← → at Far and Middle: which folder or piece Enter opens */
  choose(step: number | string = 1) {
    const was = S.sel;
    S.sel = Math.max(0, S.sel + Number(step)); render();
    return done(true, undefined, () => { S.sel = was; render(); });
  },
  /** the chip's press and the sidebar's Diary row (P14): the whole plane, today's page in it */
  toDiary() {
    const cam = L.diaryCam();
    if (!cam) return done(false);
    return go({ dist: "far", region: null, piece: null, beside: null, page: null, cam }, "to the diary", false);
  },
  /** an edge chip's press: Far pans until the zone's near side is at the safe edge */
  toZone(k: string) {
    const cam = (L.ZONES as readonly string[]).includes(k) ? L.zoneCam(k as L.Zone) : null;
    if (!cam) return done(false);
    return go({ dist: "far", region: null, piece: null, beside: null, cam }, "to " + k, false);
  },
  /** #7 place: the person puts a piece (or drags a folder, its pieces with it) at a spot on the plane, in plane units.
   *  A piece dropped inside a folder belongs there now. Live it is next.pos.set, the engine's row "no": not yet */
  place(id: string, x: number, y: number) {
    const q = D.pos?.[id];
    if (!q || !isFinite(+x) || !isFinite(+y)) return done(false);
    const before = JSON.stringify(D.pos), regions = Object.fromEntries(Object.values(D.pieces).map((p) => [p.id, p.region]));
    const undo = () => { D.pos = JSON.parse(before); for (const p of Object.values(D.pieces)) if (regions[p.id]) p.region = regions[p.id]; render(); };
    if (regionOf(id)) { L.dragFolder(id, +x - q.x, +y - q.y); render(); return done(true, id, undo); }
    q.x = +x; q.y = +y; q.by = "person"; L.touch(id);
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
    const r = D.regions.find((r) => { const a = D.pos![r.id]; return a && cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h; });
    if (r && D.pieces[id] && D.pieces[id].region !== r.id) D.pieces[id].region = r.id;
    render();
    return done(true, id, undo);
  },
  /** #6 make's landing: what was made without a place lands in the next free cell of its folder, marked new until the
   *  person touches it (the plane presses this when a piece has no place yet) */
  land() {
    const had = new Set(Object.keys(D.pos || {})), n = L.settle();
    if (!n) return done(false);
    render();
    return done(true, undefined, () => { for (const id of Object.keys(D.pos || {})) if (!had.has(id)) delete D.pos![id]; render(); });
  },
  /** a press on a piece: it is the person's now, no longer new */
  touch(id: string) {
    if (!L.isNew(id)) return done(false);
    L.touch(id); render();
    return done(true, id, () => { const q = D.pos?.[id]; if (q) { q.touched = false; q.fresh = true; } render(); });
  },
  /** CV.zones.make (K1): a new folder, sessions ("build") or stickies ("life"); unsaid, the kind the person has most */
  newFolder(name?: string, kind?: string) {
    if (name && name.includes(":") && !kind) [name, kind] = name.split(":");
    const o = L.zoneOrderOnPlane();
    const r = L.makeFolder(String(name ?? "").trim() || "New folder", kind || (o.life.length > o.build.length ? "life" : "build"));
    render();
    return { ok: r.ok, id: r.id, why: r.why, undo: () => { r.undo(); render(); } };
  },
  /** #15 pause a run (and its parts): nothing runs until it resumes. Live: a held run that resumes is "not yet" */
  pause(id?: string) {
    if (MODE === "live") return notYet();
    const p = run(id);
    if (!p || !/working/.test(String(p.state))) return done(false);
    const was = states(p);
    each(p, (x) => { if (x.state === "working") x.state = "paused"; }); render();
    return done(true, p.id, restore(was));
  },
  resume(id?: string) {
    if (MODE === "live") return notYet();
    const p = run(id);
    if (!p || p.state !== "paused") return done(false);
    const was = states(p);
    each(p, (x) => { if (x.state === "paused") x.state = "working"; }); render();
    return done(true, p.id, restore(was));
  },
  /** stop a run: its changes stay. A split job asks first (its parts still work). Live: work.stop, which has no undo */
  stop(id?: string, o: { confirmed?: boolean } = {}) {
    const p = run(id);
    if (!p || /stopped|taken back/.test(String(p.state))) return done(false);
    if (MODE === "live") {
      const sid = String(p.sessionId ?? p.id);
      return link.e && link.e.send({ type: "work.stop", sessionId: sid }) ? done(true, p.id) : done(false);
    }
    if (p.parts && p.parts.length && !o.confirmed) {
      const live = p.parts.filter((x) => /working|paused/.test(String(x.state))).length, aid = `stop-${p.id}`;
      const ask: Ask = { id: aid, rank: 0, piece: p.id, kind: "code", source: `${p.ai} · stop`, how: "inplace", answered: false,
        text: `Stop ${p.ai}'s job and its ${p.parts.length} parts? ${live} still ${live === 1 ? "works" : "work"}.`, act: { move: "stop", args: [p.id, { confirmed: true }] } };
      D.asks[aid] = ask; render();
      return done(true, p.id, () => { delete D.asks[aid]; render(); });
    }
    const was = states(p);
    each(p, (x) => { if (!/done|taken back/.test(String(x.state))) x.state = "stopped"; }); render();
    return done(true, p.id, restore(was));
  },
};
export default moves;

/** the one M: core's, which index.ts merges every slice's moves into (this file never imports index.ts) */
const M = () => CoreM;

// ---------------------------------------------------------------- the plane in the store: layout, camera, keys, the seam

hooks.layout = L.layoutPlane;
hooks.settleCam = L.settleCam;
/** the plane's plain keys (engine.js onKey, at Far and Middle no pane takes keys): ← → choose, ↩ opens, ⎋ goes out;
 *  ⌘+ and ⌘− zoom. The shell asks this before its own ⌘ keys */
hooks.keys.push((e: KeyboardEvent) => {
  if (S.page || S.calm || !(S.dist === "far" || S.dist === "middle")) return false;
  const t = e.target as HTMLElement | null;
  if (t?.matches?.("input,textarea,select,[contenteditable]") || t?.closest?.("#v-settings,#overlay,#press")) return false;
  const m = M();
  if (!m) return false;
  if (e.metaKey && (e.code === "Equal" || e.code === "Minus")) { m.zoom(e.code === "Equal" ? L.ZSTEP : 1 / L.ZSTEP); return true; }
  if (e.metaKey || e.altKey || e.ctrlKey) return false;
  if (e.code === "ArrowRight" || e.code === "ArrowLeft") { m.choose(e.code === "ArrowRight" ? 1 : -1); return true; }
  if (e.code === "Enter") { m.dive(); return true; }
  if (e.code === "Escape" && S.dist === "middle") { m.out(); return true; }
  return false;
});
/** the mockup's CV.zones and CV.plane, for the counts and the other slices (agent's night places through put) */
Object.assign(hooks, {
  zones: {
    kindOf: L.kindOf, home: L.homeOf, of: L.zoneOf, at: L.zoneAt, rect: L.zoneRect, diarySpot: L.diarySpot, free: L.diaryFree, order: L.zoneOrderOnPlane,
    make: (name: string, kind?: string) => M().newFolder(name, kind), drag: L.dragFolder, isLife: L.lifeThing, LABEL_H: L.LABEL_H,
    NAMES: { diary: "Diary", build: "Build", life: "Life" }, toDiary: () => M().toDiary().ok, span: L.zoneSpan, edge: L.edge, toZone: (k: string) => M().toZone(k).ok,
  },
  plane: {
    spotFor: L.spotForRegion, put: L.put, settle: L.settle, touch: L.touch, isNew: L.isNew, inView: L.inView, bandOf: L.bandOf, rectOn: L.rectOn,
    toScreen: L.toScreen, toPlane: L.toPlane, camOn: L.camOn, bounds: L.bounds, focusAt: L.focusAt, onPlane: L.onPlane, viewSize, camMoved: L.camMoved,
    PIECE_W: L.PIECE_W, PIECE_H: L.PIECE_H, PAD: L.PAD, PAD_T: L.PAD_T, BAND_PX: L.BAND_PX, SAFE: L.SAFE, ZSTEP: L.ZSTEP, lineFit: L.lineFit, farCam: L.farCam,
    cardSpans: L.cardSpans, settleCam: L.settleCam, safe: L.safe, PAGE_MIN: L.PAGE_MIN, follow: L.follow,
  },
});

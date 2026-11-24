// owned by slice 1 (Plane), docs/port/slices.md
// The plane's moves (#1615; engine.js "the plane's moves", CV.zones, runs.js pause/resume/stop), merged into M by
// moves/index.ts. Pan and zoom move the camera only (no history step); enter and leave are in and out; jump is go to;
// toDiary and toEdge are the chips' presses; place (#7) is the person's own spot for a piece or a folder (live: "not
// yet", next.pos.set is slice 7's); land settles what was made without a place, marked new (#6, make's landing);
// newFolder is CV.zones.make; pause, resume and stop act on a face (#15: live, stop is work.stop; a held run that
// resumes is "not yet"). It also plugs the plane into the store: hooks.layout and hooks.settleCam (layout.ts), the
// plane's plain keys at Far and Middle, and hooks.zones / hooks.plane, the seam the counts read as the mockup's
// CV.zones and CV.plane (docs/port/requests/plane.md asks for them on the store's own name).
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { D, S, M as CoreM, MODE, go, done, notYet, render, hooks, regionOf, parentOf, viewSize, type Done, type Moves, type Piece, type Pos, type Ask } from "../core.ts";
import * as L from "../../plane/layout.ts";
import { unnamed } from "../../place.ts";
import { FACE_PX } from "../../form.ts";
import { link } from "../wire/plane.ts";
import { said } from "../../bar/undo.ts";
import { putOn, takeBack } from "../../shelf/model.ts";   // BR1 order 2: a folder taken off the canvas is archived (the Shelf's engine, holders.html)
import { isHolder, nameOf as holderName, setOffHolder } from "../../holders/model.ts";   // the holders (holders.html, #1615): pieces like any other
import { movedByHand } from "../wire/fix.ts";   // BR1 item 5 (#1615): a folder Sol placed, moved by hand, is a fix of it
import { apart, farStep, stackAt } from "../../plane/groupFar.ts";   // the infinite canvas (BR1, #1615, F): a group is one stop

/** the places a move changed, kept by the engine (next.pos.set, pos.ts) in a real Sol; the fixture keeps them in memory.
 *  What a rule put stays the rule's to make again; a place the person or an AI made is sent whole, folded with it. A
 *  place that goes back to the rule (an Undo) is sent as the rule's, so the engine forgets whose it was */
function keep(before: string): void {
  if (MODE !== "live" || !link.e) return;
  const was = JSON.parse(before || "{}") as Record<string, Pos>;
  for (const [id, w] of Object.entries(was)) {
    const q = D.pos?.[id];
    if (w.by !== "rule" && (!q || q.by === "rule")) { const at = q ?? w; L.keptPlace(id, { ...at, by: "rule" }); link.e.send({ type: "next.pos.set", id, x: at.x, y: at.y, w: at.w, h: at.h, by: "rule", touched: false, folded: false }); }
  }
  for (const [id, q] of Object.entries(D.pos || {})) {
    if (q.by === "rule" || JSON.stringify(was[id]) === JSON.stringify(q)) continue;
    L.keptPlace(id, q);
    // `in`, the folder the person put it in (BR1, folders in folders), only when the person said one (null: the top)
    link.e.send({ type: "next.pos.set", id, x: q.x, y: q.y, w: q.w, h: q.h, by: q.by, touched: q.touched, folded: !!q.folded, ...(q.in !== undefined ? { in: q.in } : {}), ...(q.hand ? { hand: q.hand } : {}) });
  }
}
/** a move by hand on the places: its undo puts every place back and keeps that too; the Undo line says it */
function byHand(words: string, id: string, fn: () => boolean): Done {
  const before = JSON.stringify(D.pos || {}), regions = Object.fromEntries(Object.values(D.pieces).map((p) => [p.id, p.region]));
  if (!fn()) return done(false);
  const after = JSON.stringify(D.pos || {});
  keep(before);
  render();
  const undo = () => { D.pos = JSON.parse(before); for (const p of Object.values(D.pieces)) if (regions[p.id]) p.region = regions[p.id]; L.layoutPlane(); keep(after); render(); };
  said(words, undo);
  return done(true, id, undo);
}
const nameOf = (id: string) => (id === L.DIARY ? "the Diary" : isHolder(id) ? holderName(id) : regionOf(id)?.name ?? (D.pieces[id] ? `“${L.titleOf(D.pieces[id])}”` : "it"));

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
    S.sel = S.dist === "far" ? farStep(S.sel, Number(step)) : Math.max(0, S.sel + Number(step)); render(); keysOn();
    return done(true, undefined, () => { S.sel = was; render(); });
  },
  /** the chip's press and the sidebar's Diary row (P14): the whole plane, today's page in it */
  toDiary() {
    if (L.isOff(L.DIARY)) L.setOff(L.DIARY, false);   // the Diary taken off the canvas comes back where it was
    const cam = L.diaryCam();
    if (!cam) return done(false);
    return go({ dist: "far", region: null, piece: null, beside: null, page: null, cam }, "to the diary", false);
  },
  /** a side chip's press (BR1: no zones): Far pans by whole columns towards that side (layout.ts edgeCam) */
  toEdge(side: string) {
    const cam = side === "left" || side === "right" ? L.edgeCam(side) : null;
    if (!cam) return done(false);
    return go({ dist: "far", region: null, piece: null, beside: null, cam }, "to the " + side, false);
  },
  /** #7 place: the person puts a piece (or drags a folder, its pieces with it) at a spot on the plane, in plane units.
   *  A piece dropped inside a folder belongs there now, except a session, which only the armed drop files. Live it is next.pos.set, the engine's row "no": not yet */
  place(id: string, x: number, y: number) {
    if (!isFinite(+x) || !isFinite(+y)) return done(false);
    if (id === L.DIARY) return byHand("Moved the Diary", id, () => L.moveDiary(+x, +y));   // the Diary is a piece too (BR1)
    const q = D.pos?.[id];
    if (!q) return done(false);
    return byHand(`Moved ${nameOf(id)}`, id, () => {
      if (regionOf(id)) { L.dragFolder(id, +x - q.x, +y - q.y); return true; }
      q.x = +x; q.y = +y; q.by = "person"; L.touch(id);
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
      const r = D.regions.find((r) => { const a = D.pos![r.id]; return a && cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h; });
      // a session keeps its folder: letting go unarmed changes nothing (Marco); only the armed drop files it (M.into_folder, notes/drop.ts)
      if (r && D.pieces[id] && D.pieces[id].kind !== "session" && D.pieces[id].region !== r.id) D.pieces[id].region = r.id;
      return true;
    });
  },
  /** BR1 fold (mine/look/br1/pieces.html): every piece folds where it stands and unfolds as it was. The Diary to its spine,
   *  a folder to its tab, a session to its chip. Unsaid, it turns over */
  fold(id: string, on?: boolean) {
    if (!id || !(id === L.DIARY || regionOf(id) || D.pieces[id] || isHolder(id))) return done(false);
    const to = on ?? !L.folded(id);
    return byHand(`${to ? "Folded" : "Unfolded"} ${nameOf(id)}`, id, () => L.fold(id, to));
  },
  /** BR1 resize: the Diary pulled by its corner (plane units); never under the readable size */
  resize(id: string, w: number, h: number) {
    if (id !== L.DIARY || !isFinite(+w) || !isFinite(+h)) return done(false);
    return byHand("Resized the Diary", id, () => L.resizeDiary(+w, +h));
  },
  /** BR1 ⋯ "Archive" on a folder (a piece's: "Take off the canvas"): a folder is archived as the person's (the Shelf's
   *  engine, next.shelf.put), so it stays off after a reload, found in Sessions › Archived, Undo or its Bring back bringing
   *  it again (BR1 order 2, holders.html); a piece, a holder or the Diary leaves for this session (face state; nothing is
   *  deleted), Undo, Add's Bring back or the sidebar's Diary row putting it back */
  offCanvas(id: string) {
    const holder = isHolder(id);
    if (!id || !(id === L.DIARY || regionOf(id) || D.pieces[id] || holder) || L.isOff(id)) return done(false);
    const folder = id !== L.DIARY && !holder && regionOf(id) && !D.pieces[id] ? id : null, name = nameOf(id);
    // a folder is off by the archive alone, so a Bring back anywhere brings it at once (BR1 hold H1); the rest by this session
    if (folder) putOn(folder, name); else if (holder) setOffHolder(id, true); else L.setOff(id, true);
    render();
    const undo = () => { if (folder) takeBack(folder); else if (holder) setOffHolder(id, false); else L.setOff(id, false); render(); };
    said(folder ? `${name} is archived. It’s in Sessions › Archived; nothing was deleted` : `Took ${name} off the canvas`, undo, folder ? `shelf:${folder}` : undefined);
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
  /** BR1, folders in folders: the person puts a folder inside another (`into`), or takes it out to the top of the canvas
   *  (null). Its pieces and the folders in it go with it; a folder never goes inside itself or more than eight deep. Its
   *  context follows by itself: a session reads the folders above its folder as they are when it starts (folders.ts) */
  nest(id: string, into: string | null = null) {
    const before = JSON.stringify(D.pos || {}), was = regionOf(parentOf(id) ?? "") ?? null;
    const r = L.nest(id, into ?? null);
    if (!r.ok) { hooks.flash?.(r.why!); return { ok: false, id, why: r.why, undo: () => {} }; }   // said or pressed, a refusal says why
    const after = JSON.stringify(D.pos || {});
    keep(before); render();
    const fixed = movedByHand(regionOf(id)!, was, into ? regionOf(into) ?? null : null, (ids) => { takeOut(ids); });   // a folder Sol placed: a fix of it (BR1 item 5); taken out, the others alike may follow
    const undo = () => { r.undo(); L.layoutPlane(); keep(after); render(); fixed?.(); };
    said(into ? `Put ${nameOf(id)} in ${nameOf(into)}` : `Took ${nameOf(id)} out to the canvas`, undo);
    return done(true, id, undo);
  },
  /** CV.zones.make (K1): a new folder, sessions ("build") or stickies ("life"); unsaid, the kind most folders are made as.
   *  Where it goes does not hang on its kind (BR1: no zones): under the last folder; with a folder open (Middle), inside
   *  it (BR1, folders in folders); `into` says where when the caller knows (null: the top) */
  newFolder(name?: string, kind?: string, into?: string | null) {
    if (name && name.includes(":") && !kind) [name, kind] = name.split(":");
    // unsaid, it is named by what is put in it (place.ts nameFrom); until then "Folder", "Folder 2"
    const lifes = D.regions.filter((r) => r.kind === "life").length, given = String(name ?? "").trim(), n = given || unnamed(D.regions.map((r) => String(r.name))), k = kind || (lifes > D.regions.length - lifes ? "life" : "build");
    // live, a Life folder is the engine's too (next.folder.make: SOL_HOME/<name>, read back by the move-in as h:<name>), so
    // it outlives the window; a Build folder is a folder on this Mac, picked, and stays the window's here
    const kept = MODE === "live" && !!link.e && (k === "life" || k === "stickies");
    const inside = into !== undefined ? into : !S.page && S.dist === "middle" ? S.region : null, before = JSON.stringify(D.pos || {});
    const r = L.makeFolder(n, k, kept ? "h:" + n : undefined, inside);
    if (kept && r.ok) link.e!.send({ type: "next.folder.make", name: n, zone: "life" });
    if (r.ok && inside) keep(before);   // where it sits is the person's: the engine keeps its `in`
    const made = r.ok && !given ? regionOf(r.id!) : undefined;
    if (made) made.named = false;
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
        text: `Stop “${L.titleOf(p)}” and its ${p.parts.length} parts? ${live} still ${live === 1 ? "works" : "work"}.`, act: { move: "stop", args: [p.id, { confirmed: true }] } };
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
/** "All N" / "Yes, <name> too" (plane/moved.ts sameOut): the folders Sol put inside others for the same reading come out to
 *  the canvas under one Undo, each a fix line of its own as a hand move is (scope 11-22; `fix` given by the tests) */
export function takeOut(ids: readonly string[], fix: typeof movedByHand = movedByHand): Done {
  const before = JSON.stringify(D.pos || {}), out: { id: string; undo: () => void; fixed: (() => void) | null }[] = [];
  for (const id of ids) {
    const was = regionOf(parentOf(id) ?? "") ?? null;
    if (!was) continue;
    const r = L.nest(id, null);
    if (r.ok) out.push({ id, undo: r.undo, fixed: fix(regionOf(id)!, was, null) });
  }
  if (!out.length) return done(false);
  const after = JSON.stringify(D.pos || {});
  keep(before); render();
  const undo = () => { for (const o of [...out].reverse()) o.undo(); L.layoutPlane(); keep(after); render(); for (const o of out) o.fixed?.(); };
  said(out.length === 1 ? `Took ${nameOf(out[0].id)} out to the canvas` : `Took ${out.length} folders out to the canvas`, undo);
  return done(true, out[0].id, undo);
}

// ---------------------------------------------------------------- the plane in the store: layout, camera, keys, the seam

hooks.layout = L.relayoutPlane;   // a redraw puts back a place dropped while its folder was away (keptPlace)
hooks.settleCam = L.settleCam;
/** the plane's plain keys (engine.js onKey, at Far and Middle no pane takes keys): ← → choose, ↩ opens, ⎋ goes out;
 *  ⌘+ and ⌘− zoom. The shell asks this before its own ⌘ keys */
hooks.keys.push((e: KeyboardEvent) => {
  if (S.page || S.calm || !(S.dist === "far" || S.dist === "middle")) return false;
  const t = e.target as HTMLElement | null;
  if (t?.matches?.("input,textarea,select,[contenteditable]") || t?.closest?.("#v-settings,#overlay,#press")) return false;
  // ↩ on a control presses that control (a sidebar row, a bar button), not the canvas's choice (BR1 item 5, #1615)
  if (e.code === "Enter" && t?.closest?.("button, a, summary, [role=button], [role=link], [role=switch], [role=tab], [role=menuitem]")) return false;
  const m = M();
  if (!m) return false;
  if (e.metaKey && (e.code === "Equal" || e.code === "Minus")) { m.zoom(e.code === "Equal" ? L.ZSTEP : 1 / L.ZSTEP); return true; }
  if (e.metaKey || e.altKey || e.ctrlKey) return false;
  if (e.code === "ArrowRight" || e.code === "ArrowLeft") { m.choose(e.code === "ArrowRight" ? 1 : -1); return true; }
  // ↩ on a focused folder card at Far opens the folder, as its press and its ⋯ Open do (scope (a), BR1, #1615)
  const card = e.code === "Enter" && S.dist === "far" ? t?.closest?.<HTMLElement>(".pl-card[data-region]") : null;
  if (card?.dataset.region && m.folder_open(card.dataset.region).ok) return true;
  if (e.code === "Enter") { const g = S.dist === "far" ? stackAt(S.sel) : null; if (g) { apart(g); return true; } const r = S.region; m.dive(); keysBack(r); return true; }
  if (e.code === "Escape" && S.dist === "middle") { const r = S.region; m.out(); keysBack(r); return true; }
  return false;
});
/** after ← → the keys go with the choice when they were on the canvas: onto a group, or from one back onto a card
 *  (Folder.tsx moves them between cards itself) */
function keysOn() {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    if (!document.activeElement?.closest?.(".pl-card, .pl-group")) return;
    document.querySelector<HTMLElement>(".pl-cam .pl-sel")?.focus({ preventScroll: true });
  });
}
/** after ↩ or ⎋ the redraw drops the keys to the page: they come back on the folder's card, so the next ← → ↩ ⎋ go on
 *  from there (BR1 item 5, #1615). Two frames: the band's draw, then its cards */
function keysBack(was: unknown) {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const a = document.activeElement;
    const r = S.region ?? was;
    if (a && a !== document.body || !r) return;
    document.querySelector<HTMLElement>(S.dist === "middle" ? `.pl-area[data-area="${CSS.escape(String(r))}"]` : `.pl-card[data-region="${CSS.escape(String(r))}"]`)?.focus({ preventScroll: true });
  }));
}
/** the mockup's CV.zones and CV.plane, for the counts and the other slices (agent's night places through put). BR1 (#1615):
 *  no zones, so hooks.zones keeps only the folders' seam: order is the folders in the canvas's reading order, one list */
Object.assign(hooks, {
  zones: {
    kindOf: L.kindOf, diarySpot: L.diarySpot, free: L.diaryFree, order: L.folderOrderOnPlane, onDiary: L.onDiary,
    make: (name: string, kind?: string) => M().newFolder(name, kind), drag: L.dragFolder, isLife: L.lifeThing, LABEL_H: L.LABEL_H,
    toDiary: () => M().toDiary().ok, past: L.past, toEdge: (side: string) => M().toEdge(side).ok,
  },
  plane: {
    spotFor: L.spotForRegion, put: L.put, settle: L.settle, touch: L.touch, isNew: L.isNew, inView: L.inView, openAt: L.openAt, rectOn: L.rectOn,
    toScreen: L.toScreen, toPlane: L.toPlane, camOn: L.camOn, bounds: L.bounds, focusAt: L.focusAt, onPlane: L.onPlane, viewSize, camMoved: L.camMoved,
    PIECE_W: L.PIECE_W, PIECE_H: L.PIECE_H, PAD: L.PAD, PAD_T: L.PAD_T, BAND_PX: FACE_PX, SAFE: L.SAFE, ZSTEP: L.ZSTEP, lineFit: L.lineFit, farCam: L.farCam,
    cardSpans: L.cardSpans, settleCam: L.settleCam, safe: L.safe, camToShow: L.camToShow, PAGE_MIN: L.PAGE_MIN, follow: L.follow,
    DIARY: L.DIARY, folded: L.folded, isOff: L.isOff, lead: L.lead, setLead: L.setLead, byHand: L.byHand,   // BR1 pieces by hand
    Z_PERSON: L.Z_PERSON, FOLDER_PX: L.FOLDER_PX, FOLD_PX: L.FOLD_PX,   // BR1 rule (d): the person's scale (count 23)
  },
});

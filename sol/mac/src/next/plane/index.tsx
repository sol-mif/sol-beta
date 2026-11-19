// owned by slice 1 (Plane), docs/port/slices.md
// The plane (#1615; the mockup's merge/shell.js "the plane", round 2 · A, round 3 · A3, round 4): Far and Middle are two
// bands of one pannable, zoomable plane. Geometry is the store's (D.pos, S.cam) and layout.ts's; this draws it. One plane
// edge to edge, no column: three zones, Diary · Build · Life, each a label over its space. Today's page sits in the Diary
// at its place (#pl-dy; the diary slot draws it, slice 4). Far: each folder as its card. Middle: folders as areas, their
// pieces as faces scaled by the camera, at most eight full faces, the rest one line each; a life folder's things are the
// life slot's board (slice 4), given back to the plane as pieces while that board draws nothing. When today's page is off
// screen a chip on the edge points to it; a zone not whole on screen at Far is named by a chip at its edge. Only what is
// in the view at its band carries data-front. Pan: a drag on bare plane or two fingers; zoom: a pinch, the wheel with ⌘
// or ctrl, ⌘+ / ⌘−; a piece or a folder dragged is placed (M.place). The view reads and presses; it never changes D.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import { useEffect, useLayoutEffect, useRef, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement } from "react";
import { D, S, M, SCEN, SCN, above, asksInRegion, asksOn, open, piecesIn, piecesShown, regionOf, sessions, useNext, render, type Piece, type Region } from "../cv/index.ts";
import * as L from "./layout.ts";
import { Face, FoldLine, AskRow } from "./Face.tsx";
import { Slot, type SlotProps } from "../slots.ts";
import { StarterCard } from "../near/Starter.tsx";
import { agent } from "../agent/calls.ts";
import { firstWords } from "../people/extra.ts";
import "./plane.css";

const ZN: Record<L.Zone, string> = { diary: "Diary", build: "Build", life: "Life" };
const ZHINT: Record<string, string> = { build: "Folders that run sessions go here", life: "Folders of stickies go here" };
/** derived, because the data has no money: about $0.40 a working AI a night (shell.js costOf) */
const COST_PER_AI = 0.4;
const costOf = (rid: string) => piecesIn(rid).filter((p) => p.kind === "session").length * COST_PER_AI;
const money = (n: number) => "$" + n.toFixed(2);
const tint = (rid: string) => `pl-t${Math.max(0, D.regions.findIndex((r) => r.id === rid)) % 4}`;
const px = (n: number) => +n.toFixed(1);
type Rect = { x: number; y: number; w: number; h: number };
const near = (q: Rect, w: number, h: number, m = 40) => q.x < w + m && q.x + q.w > -m && q.y < h + m && q.y + q.h > -m;
const rankOf = (p: Piece) => { const a = open().filter((x) => x.piece === p.id); return a.length ? Math.min(...a.map((x) => x.rank)) : 999; };

/** what moved in a folder, in words (shell.js moved) */
function moved(rid: string): string {
  const ps = piecesIn(rid), ss = ps.filter((p) => p.kind === "session");
  const did = (s: Piece) => (s.files ? `${s.files} file${s.files === 1 ? "" : "s"} on ${s.copy}` : (s.parts || []).length ? `${s.parts!.length} parts` : "starting");
  if (ss.length) return ss.map((s) => `${s.ai}: ${did(s)}`).slice(0, 3).join(" · ") + (ss.length > 3 ? ` · ${ss.length - 3} more` : "") + ".";
  const t = ps.filter((p) => p.text).map((p) => String(p.text));
  return t.length ? t.slice(0, 2).join(" · ") : "Nothing moved.";
}
/** a folder's name is on screen at Middle (shell.js labelShown) */
function labelShown(rid: string): boolean {
  const q = D.pos?.[rid];
  if (!q) return false;
  const { w, h } = L.viewSize(), a = L.toScreen(q.x, q.y);
  return a.x + 18 >= 0 && a.x + 18 < w - 120 && a.y + 14 >= 0 && a.y + 40 < h;
}

/** Far: a folder as its card (shell.js regionCard) */
function RegionCard({ r, rect, front, sel }: { r: Region; rect: Rect; front: boolean; sel: boolean }) {
  const a = asksInRegion(r.id), c = costOf(r.id), ss = piecesIn(r.id).filter((p) => p.kind === "session").length;
  return (
    <section className={`pl-card ${tint(r.id)}${sel ? " pl-sel" : ""}`} data-front={front ? "" : undefined} data-region={r.id} data-part={r.name} tabIndex={-1}
      style={{ left: px(rect.x), top: px(rect.y), width: px(rect.w), height: px(rect.h) }}>
      <div className="pl-ph"><span className="pl-dot" /><h2 className="pl-pn">{r.name}</h2></div>
      <div className="pl-why">{a.length ? `${a.length} ask${a.length === 1 ? "" : "s"}` : "quiet"}{ss ? ` · ${ss} AI${ss === 1 ? "" : "s"}` : ""}{c ? ` · ${money(c)}` : ""}</div>
      <p className="pl-out">{moved(r.id)}</p>
      {a.length ? <div className="pl-rasks"><span className="pl-g" /><span className="pl-at">{a[0].text}</span></div> : null}
      <div className="pl-tiles">{L.onPlane(r.id).map((p) => {
        const k = asksOn(p.id).length || (p.parts || []).some((x) => open().some((q) => q.part === x.id));
        return <span key={p.id} className={`pl-tile${k ? " pl-asks" : ""}${L.isNew(p.id) ? " pl-isnew" : ""}`} title={p.kind === "session" ? p.ai : p.name}>{p.kind === "session" ? <span className="nx-aura still" /> : null}</span>;
      })}</div>
    </section>
  );
}

/** a piece on the plane: a full face at plane size scaled by the camera, or its one line (shell.js pieceHTML) */
function PieceOn({ p, full, sel, far }: { p: Piece; full: boolean; sel: boolean; far?: boolean }) {
  const q = D.pos![p.id], rect = L.rectOn(q), z = S.cam.z, nw = L.isNew(p.id);
  const nb = S.dist === "middle" && !!S.region && p.region !== S.region;
  if (full) return (
    <section className={`pl-piece pl-k-${p.kind}${sel ? " pl-sel" : ""}${nw ? " pl-isnew" : ""}${nb ? " pl-nb" : ""}${p.parts?.length ? " pl-split" : ""}`} data-front data-piece={p.id} data-in={p.region}
      data-part={p.kind === "session" ? p.ai : p.name} style={{ left: px(rect.x), top: px(rect.y), width: q.w, maxHeight: q.h, transform: `scale(${z})` }}>
      {nw ? <span className="pl-new">new</span> : null}{p.kind === "starter" ? <StarterCard id={p.id} /> : <Face p={p} />}
    </section>
  );
  const fw = Math.max(rect.w, far && D.zones ? D.zones.page.w * z : 120, 120);
  return (
    <div className={`pl-fold${sel ? " pl-sel" : ""}${p.region === S.region && !far ? "" : " pl-away"}${nb ? " pl-nb" : ""}`} data-piece={p.id} data-in={p.region} data-folded
      style={{ left: px(rect.x), top: px(rect.y), width: px(fw) }}>
      {p.kind === "starter" ? <StarterCard id={p.id} band="line" /> : <FoldLine p={p} />}{nw ? <span className="pl-new">new</span> : null}
    </div>
  );
}

/** Middle's head: the folder's name when its own label is off screen, what needs you here, the keys (shell.js midHead) */
function MidHead() {
  const r = regionOf(S.region);
  if (!r) return null;
  const here = asksInRegion(r.id).length, out = above() - here, named = !labelShown(r.id);
  return (
    <div className="pl-over pl-middle">
      <div className="pl-mhead" data-front data-m1={named ? "what" : undefined} data-part={r.name}>
        {named ? <div className="pl-mt"><span className={`pl-dot ${tint(r.id)}`} /><h1 className="pl-h1">{r.name}</h1></div> : null}
        <p className={`pl-msay${named ? "" : " pl-lead"}`} data-m1="needs">
          {here ? `${here === 1 ? "One thing here needs" : here + " things here need"} you` : "Nothing here needs you"}
          {out ? <>; <a role="link" data-act="needs">{out} more outside</a>.</> : "."}
        </p>
        <div className="pl-khint" data-m1="next"><span className="nx-kbd">⌘J</span> next ask · <span className="nx-kbd">⌘↑</span> the whole canvas · <span className="nx-kbd">←</span> <span className="nx-kbd">→</span> <span className="nx-kbd">↩</span> open a piece · <span className="nx-kbd">⌘+</span> <span className="nx-kbd">⌘−</span> zoom</div>
      </div>
    </div>
  );
}

/** the person and the hour, from the scenario's own label ("Dev · morning, 10 asks"); a real Sol has none */
function hour(): string {
  const w = (SCEN[SCN]?.label ?? "").split(" · ")[1] || "";
  return /11pm/.test(w) ? "11pm" : /2am/.test(w) ? "2am" : /morning/.test(w) ? "morning" : "";
}
/** the headline: the AI's own when it has a real one (slice 5, read first as shell.js did), else the most a session did */
function headline(): string {
  const a = agent.headline();
  if (a?.text) return a.text;
  const ss = sessions().slice().sort((a, b) => (b.files || 0) - (a.files || 0)), h = hour();
  const when = h === "morning" ? "overnight" : h === "2am" ? "tonight" : "since you last looked";
  if (ss.length) return `${ss[0].ai} changed ${ss[0].files || 0} files in ${ss[0].copy} ${when}.`;
  const ai = D.ais[0];
  return ai ? `${ai.name} kept your ${D.regions.length} places in order.` : "Quiet. Nothing moved.";
}
/** today's page until the diary draws it (shell.js summary): the coming-back summary. At Middle it steps aside by itself
 *  once the diary slot draws (plane.css); at Far the shell mounts the diary over it (docs/port/requests/plane.md) */
function Summary() {
  const o = open(), h = hour(), first = o[0], n = above(), fx = firstWords();   // round 6 · F1: the one count
  const movedN = D.regions.filter((r) => piecesIn(r.id).some((p) => p.kind === "session") || asksInRegion(r.id).length).length;
  const tot = D.regions.reduce((s, r) => s + costOf(r.id), 0);
  const span = h === "morning" ? `While you were away · 8 hours · ${movedN} place${movedN === 1 ? "" : "s"} moved` : `Since you last looked${h ? " · " + h : ""} · ${movedN} place${movedN === 1 ? "" : "s"} moved`;
  const firstAt = first ? regionOf(D.pieces[first.piece]?.region)?.name ?? "" : "";
  return (
    <div className="pl-sum">
      <div className="pl-shead" data-front>
        <div className="pl-swho"><span className="nx-aura" />{span}</div>
        <h1 className="pl-headline" data-m1="what">{headline()}</h1>
        <Slot name="agent" part="proof" />
        {n ? <div className="pl-askline" role="link" tabIndex={0} data-m1="needs" data-act="needs"><span className="pl-n">{n}</span><span><b>{n === 1 ? "One thing needs" : n + " things need"} you.</b> The first {fx ?? `is in ${firstAt}`}. {tot ? `· about ${money(tot)} tonight` : ""}</span></div>
          : <div className="pl-askline pl-none" data-m1="needs"><span className="pl-n">0</span><span><b>Nothing needs you now.</b> {tot ? `· about ${money(tot)} tonight` : ""}</span></div>}
        <div className="pl-khint"><span className="nx-kbd">←</span> <span className="nx-kbd">→</span> choose · <span className="nx-kbd">↩</span> open · <span className="nx-kbd">⌘+</span> <span className="nx-kbd">⌘−</span> or pinch to zoom · drag to pan</div>
      </div>
      <Slot name="agent" part="told" />
      <section className="pl-first" data-front data-m1="next" data-part="Needs you first">
        <div className="pl-ph"><span className="nx-aura" /><h2 className="pl-pn">{o.length ? "Needs you first" : "Nothing needs you"}</h2>{o.length ? <span className="nx-kbd">⌘J</span> : null}</div>
        {o.slice(0, 3).map((a) => <AskRow key={a.id} a={a} />)}
        {o.length > 3 ? <button className="pl-btn" data-act="needs">{o.length - 3} more in Needs you</button> : o.length ? null : <p className="pl-quiet">Your AIs keep working; anything new lands here first.</p>}
      </section>
    </div>
  );
}

/** a life folder's board at Middle (shell.js boardsOf): the life slot on the folder's life rows, at plane size */
function boardsOf(w: number, h: number) {
  const out: { r: Region; bare: boolean; ids: Set<string>; q: Rect }[] = [];
  if (S.dist !== "middle" || !D.zones || !D.pos) return out;
  for (const r of D.regions) {
    const k = L.kindOf(r.id), R = D.pos[r.id];
    if ((k !== "life" && k !== "both") || !R || !near(L.rectOn(R), w, h)) continue;
    const st = L.onPlane(r.id).filter((p) => L.lifeThing(p) && D.pos![p.id]), ys = st.map((p) => D.pos![p.id].y);
    if (!st.length && k === "both") continue;
    const y = ys.length ? Math.min(...ys) : R.y + L.PAD_T, rc = L.rectOn(R);
    const seen = Math.min(Math.max(0, Math.min(rc.x + rc.w, w) - Math.max(rc.x, 0)) / Math.min(rc.w, w), Math.max(0, Math.min(rc.y + rc.h, h) - Math.max(rc.y, 0)) / Math.min(rc.h, h));
    out.push({ r, bare: seen < 0.6, ids: new Set(st.map((p) => p.id)), q: { x: R.x + L.PAD, y, w: R.w - 2 * L.PAD, h: Math.max(L.PIECE_H, R.y + R.h - L.PAD - y) } });   // a folder mostly off screen shows its area only
  }
  return out;
}

export default function Plane(_p: SlotProps) {
  useNext(() => 0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; rid?: string; id?: string; moved: boolean } | null>(null);
  const swallow = useRef(false);

  // what was made without a place lands (#6), marked new: pressed, never done by the view itself
  useLayoutEffect(() => { if (L.unplaced()) M.land(); });
  // after each draw: the line came or went (the camera refits), the cards give up rows, the labels and chips find room
  useLayoutEffect(() => {
    const pl = ref.current;
    if (!pl) return;
    if (L.lineFit()) { render(); return; }
    if (S.dist === "far") fitCards(pl);
    hideLabels(pl);
    placeChip(pl);
    placeZoneChips(pl);
  });
  // the ask line draws late (its slot loads lazily): when its height changes, the camera the rule put there fits again
  // (the join, #1615: count 23 "+line")
  useEffect(() => {
    const l = document.getElementById("line");
    if (!l || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (L.lineFit()) render(); });
    ro.observe(l);
    return () => ro.disconnect();
  }, []);
  // the window's size: the camera the rule put there follows it
  useEffect(() => {
    const f = () => { if (L.follow()) render(); };
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  // the wheel: ⌘ or ctrl zooms about the pointer, else it pans (today's page scrolls on its own when it overflows)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const inOver = (e.target as Element).closest?.(".pl-over,.pl-diary") as HTMLElement | null;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); const b = el.getBoundingClientRect(); M.zoom(Math.exp(-e.deltaY * 0.01), e.clientX - b.left, e.clientY - b.top); return; }
      if (inOver && inOver.scrollHeight > inOver.clientHeight + 2) return;
      e.preventDefault(); M.pan(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const band = S.dist === "middle" ? "middle" : "far";
  if (!D.zones || !D.pos || !(S.dist === "far" || S.dist === "middle")) return <div className="pl-wrap"><div className="pl" id="pl" ref={ref} /></div>;
  const { w, h } = L.viewSize(), z = S.cam.z, Z = D.zones;
  const vis = (q: Rect) => { const r = L.rectOn(q); return near(r, w, h) ? r : null; };

  // the plane's grain: a dot every 80 units (doubled until it is at least 18px apart), moving with the camera
  let g = 80 * z;
  while (g < 18) g *= 2;
  const o = L.toScreen(0, 0);
  const grain = { backgroundSize: `${px(g)}px ${px(g)}px`, backgroundPosition: `${px(o.x % g)}px ${px(o.y % g)}px` };

  // the zones' labels: at screen size over the top of each zone's space; one that scrolls off to the left stays at the edge
  const order = L.zoneOrderOnPlane(), labels: ReactElement[] = [];
  for (const k of L.ZONES) {
    const q = L.zoneRect(k)!, a = L.toScreen(q.x, 0), right = a.x + q.w * z, top = a.y + L.LABEL_H * z - 28, l = Math.max(a.x, 12);
    if (right < l + 40 || a.x > w || top > h || top < -24) continue;
    const empty = k !== "diary" && !order[k].length;
    labels.push(<div key={k} className="pl-zone" data-zone-label={k} style={{ left: px(l), top: px(top), maxWidth: Math.round(right - l) }}>{ZN[k]}{empty ? <span className="pl-zhint">{ZHINT[k]}</span> : null}</div>);
  }

  const items: ReactElement[] = [];
  const boards = boardsOf(w, h), onBoard = new Set(boards.flatMap((b) => [...b.ids]));
  if (band === "far") {
    D.regions.forEach((r, i) => { const q = D.pos![r.id], rect = q && vis(q); if (rect) items.push(<RegionCard key={r.id} r={r} rect={rect} front={L.inView(r.id)} sel={i === S.sel % D.regions.length} />); });
    // what the AI made unasked sits under today's page: its one line, at its place
    for (const p of Object.values(D.pieces)) if (!p.inside && D.pos[p.id] && L.zoneOf(p.id) === "diary" && vis(D.pos[p.id])) items.push(<PieceOn key={p.id} p={p} full={false} sel={false} far />);
  } else {
    for (const r of D.regions) {
      const q = D.pos[r.id], rect = q && vis(q);
      if (!rect) continue;
      const a = asksInRegion(r.id).length, here = r.id === S.region;
      items.push(
        <div key={"a:" + r.id} className={`pl-area ${tint(r.id)}${here ? " pl-here" : " pl-nb"}`} data-area={r.id} data-in={r.id} style={{ left: px(rect.x), top: px(rect.y), width: px(rect.w), height: px(rect.h) }}>
          <div className="pl-lab" data-front={here && labelShown(r.id) ? "" : undefined} data-m1={here && labelShown(r.id) ? "what" : undefined} style={{ fontSize: px(Math.max(12, Math.min(26, 22 * z))) }}>
            <span className="pl-dot" /><span>{r.name}</span>{a ? <span className="pl-n">{a}</span> : null}</div>
        </div>);
      // a folder of both: its sessions on top under their heading, its life things under them on the board
      if (L.kindOf(r.id) === "both") {
        const ps = L.onPlane(r.id).filter((p) => D.pos![p.id]);
        const top = (life: boolean) => { const ys = ps.filter((p) => L.lifeThing(p) === life).map((p) => D.pos![p.id]); return ys.length ? ys.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a)) : null; };
        const c = top(false);
        if (c && top(true)) { const at = L.toScreen(c.x, c.y); items.push(<div key={"s:" + r.id} className="pl-zone pl-sub" data-sub="sessions" style={{ left: px(at.x), top: px(at.y - 24) }}>Sessions</div>); }
      }
    }
    const ps = Object.values(D.pieces).filter((p) => !p.inside && D.pos![p.id]), mine = ps.filter((p) => !onBoard.has(p.id));
    const full = new Set(L.faceOrder(mine, rankOf)), shown = piecesShown().map((s) => s.id), sel = shown[S.sel % Math.max(shown.length, 1)];
    for (const p of mine) if (vis(D.pos[p.id])) items.push(<PieceOn key={p.id} p={p} full={full.has(p.id)} sel={p.id === sel} />);
    // the boards: the life slot draws; while it draws nothing its things are the plane's own pieces, one line each
    for (const b of boards) {
      if (b.bare) continue;
      const at = L.toScreen(b.q.x, b.q.y);
      items.push(<div key={"l:" + b.r.id} className={`pl-life${b.r.id === S.region ? "" : " pl-nb"}`} data-life={b.r.id} data-in={b.r.id} style={{ left: px(at.x), top: px(at.y), width: b.q.w, height: b.q.h, transform: `scale(${z})` }}>
        <div className="pl-board"><Slot name="life" region={b.r.id} band="middle" /></div></div>);
      items.push(<div key={"lb:" + b.r.id} className="pl-back">{[...b.ids].filter((id) => vis(D.pos![id])).map((id) => <PieceOn key={id} p={D.pieces[id]} full={false} sel={id === sel} />)}</div>);
    }
  }

  // a block put beside its session: a thin line from it to the session
  const joins: ReactElement[] = [];
  if (band === "middle") for (const p of Object.values(D.pieces)) {
    const j = p.joined as string | undefined;
    if (!j || !D.pos[j] || !D.pos[p.id]) continue;
    const a = L.rectOn(D.pos[p.id]), b = L.rectOn(D.pos[j]);
    joins.push(<line key={p.id} x1={px(a.x + a.w / 2)} y1={px(a.y + a.h / 2)} x2={px(b.x + b.w / 2)} y2={px(b.y + b.h / 2)} />);
  }

  // today's page: at its place; at Far it ends above the line and the pill, and scrolls
  const pr = L.rectOn(Z.page), shown = L.pageShown(pr, w, h), hh = band === "far" ? Math.min(pr.h, Math.max(L.PAGE_MIN, h - L.safe("far").b - pr.y)) : pr.h;
  const n = above();
  // the edge chips: today's page off screen; a zone not whole at Far
  const ang = Math.atan2(pr.y + pr.h / 2 - h / 2, pr.x + pr.w / 2 - w / 2);
  const side: Record<"left" | "right", L.Zone[]> = { left: [], right: [] };
  if (band === "far") for (const k of L.ZONES) { const e = L.edge(k); if ((e === "left" || e === "right") && !(k === "diary" && !shown)) side[e].push(k); }
  const nm = (k: string) => k[0].toUpperCase() + k.slice(1);

  const down = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest(".pl-over,.pl-diary,.pl-life,button,a,input,[data-act],.pl-rows,.pl-chip")) return;
    const fo = t.closest(".pl-lab,.pl-card") as HTMLElement | null, rid = fo ? (fo.dataset.region || (fo.closest(".pl-area") as HTMLElement | null)?.dataset.area) : undefined;
    const pc = !rid ? (t.closest(".pl-piece,.pl-fold") as HTMLElement | null) : null;
    drag.current = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, rid, id: pc?.dataset.piece, moved: false };
    const mv = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      d.moved = true;
      if (d.rid || (d.id && S.dist === "middle")) { preview(d.rid ?? d.id!, !!d.rid, ev.clientX - d.sx, ev.clientY - d.sy); return; }
      d.x = ev.clientX; d.y = ev.clientY;
      M.pan(dx, dy);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
      const d = drag.current;
      drag.current = null;
      if (!d || !d.moved) return;
      swallow.current = true; setTimeout(() => { swallow.current = false; });
      const id = d.rid ?? (S.dist === "middle" ? d.id : undefined);
      if (!id || !D.pos?.[id]) return;
      preview(id, !!d.rid, 0, 0);
      const q = D.pos[id];
      M.place(id, q.x + (ev.clientX - d.sx) / S.cam.z, q.y + (ev.clientY - d.sy) / S.cam.z);
    };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  };
  const click = (e: RMouseEvent) => {
    if (swallow.current) { e.stopPropagation(); e.preventDefault(); return; }
    const t = e.target as Element;
    if (t.closest("button,a,details,summary,[data-act],input")) return;
    const pc = t.closest(".pl-piece,.pl-fold") as HTMLElement | null;
    if (pc?.dataset.piece) { M.touch(pc.dataset.piece); M.dive(pc.dataset.piece, false); return; }
    const rc = t.closest(".pl-card") as HTMLElement | null;
    if (rc?.dataset.region) { M.dive(rc.dataset.region, false); return; }
    const ar = t.closest(".pl-area") as HTMLElement | null;
    if (ar?.dataset.area && S.dist === "middle" && M.start) M.start({ region: ar.dataset.area });
  };

  return (
    <div className="pl-wrap">
      <div className={`pl pl-${band}`} id="pl" ref={ref} style={grain} onPointerDown={down} onClickCapture={click}>
        {joins.length ? <svg className="pl-joins" width={w} height={h}>{joins}</svg> : null}
        {labels}
        {items}
        {!shown ? (
          <button className="pl-chip" data-chip="diary" data-act="toDiary" title={n ? `${n} need${n === 1 ? "s" : ""} you · today’s page, in the Diary` : "Today’s page, in the Diary"}>
            <svg viewBox="0 0 16 16" aria-hidden="true" style={{ transform: `rotate(${ang.toFixed(3)}rad)` }}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            <span data-long={n ? `${n} need${n === 1 ? "s" : ""} you` : "Today’s page"} data-short={n ? String(n) : "Today’s page"}>{n ? `${n} need${n === 1 ? "s" : ""} you` : "Today’s page"}</span>
          </button>
        ) : null}
        {(["left", "right"] as const).map((s) => {
          const ks = s === "left" ? [...side.left].reverse() : side.right;   // nearest first
          if (!ks.length) return null;
          return <button key={s} className="pl-chip pl-zchip" data-zones={ks.join(",")} data-side={s} data-act={`toZone:${ks[0]}`} title={"Pan to " + nm(ks[0])}>
            {s === "left" ? "← " + ks.map(nm).join(" · ") : ks.map(nm).join(" · ") + " →"}</button>;
        })}
      </div>
      <section className="pl-diary" id="pl-dy" data-diary aria-label="Today’s page" hidden={!shown}
        style={shown ? { left: px(pr.x), top: px(pr.y), width: px(pr.w), height: px(hh) } : undefined}>
        {shown ? <div className="pl-dy-slot"><Slot name="diary" band={band} part="frame" /></div> : null}
        {shown ? <Summary /> : null}
      </section>
      {band === "middle" ? <MidHead /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- after the draw: measured, on the DOM only (never D)

/** a drag shown before it lands: the folder (its area and its pieces) or the piece follows the pointer */
function preview(id: string, folder: boolean, dx: number, dy: number) {
  const els = folder ? document.querySelectorAll<HTMLElement>(`#pl [data-in="${CSS.escape(id)}"], #pl .pl-card[data-region="${CSS.escape(id)}"]`) : document.querySelectorAll<HTMLElement>(`#pl [data-piece="${CSS.escape(id)}"]`);
  els.forEach((el) => { el.style.translate = dx || dy ? `${dx}px ${dy}px` : ""; });
  document.body.classList.toggle("pl-dragging", !!(dx || dy));
}
/** a card is as tall as its folder at Far: the outcome gives up lines first, then the tiles; a row is never shown half */
function fitCards(pl: HTMLElement) {
  pl.querySelectorAll<HTMLElement>(".pl-card").forEach((c) => {
    for (const k of [...c.children] as HTMLElement[]) { k.hidden = false; k.style.display = ""; }
    const o = c.querySelector<HTMLElement>(".pl-out"), t = c.querySelector<HTMLElement>(".pl-tiles");
    if (o) o.style.webkitLineClamp = "";
    for (const n of [2, 1]) if (o && c.scrollHeight > c.clientHeight + 1) o.style.webkitLineClamp = String(n);
    if (t && c.scrollHeight > c.clientHeight + 1) t.hidden = true;
    const end = c.clientHeight - parseFloat(getComputedStyle(c).paddingBottom || "0") + 1;
    for (const k of ([...c.children] as HTMLElement[]).slice(1).reverse()) if (k.hidden || k.offsetTop + k.offsetHeight > end) { k.hidden = true; k.style.display = "none"; }
  });
}
/** a zone label never sits half under the head at Middle */
function hideLabels(pl: HTMLElement) {
  const mh = document.querySelector(".pl-mhead")?.getBoundingClientRect();
  pl.querySelectorAll<HTMLElement>(".pl-zone").forEach((l) => {
    l.hidden = false;
    const b = l.getBoundingClientRect();
    if (mh && b.left < mh.right && b.right > mh.left && b.top < mh.bottom + 4 && b.bottom > mh.top - 4) l.hidden = true;
  });
}
/** the edge chip (P14): at the edge towards today's page, clear of the head, the ask line and the talk; on bare plane */
function placeChip(pl: HTMLElement) {
  const el = pl.querySelector<HTMLElement>("[data-chip]");
  if (!el || !D.zones) return;
  const sp = el.querySelector("span")!;
  sp.textContent = sp.dataset.long ?? sp.textContent;
  const { w, h } = L.viewSize(), r = L.rectOn(D.zones.page), cx = w / 2, cy = h / 2, ang = Math.atan2(r.y + r.h / 2 - cy, r.x + r.w / 2 - cx);
  let cw = el.offsetWidth;
  const ch = el.offsetHeight, m = 14, box = { l: m, t: 56, r: w - m - cw, b: h - m - ch };
  const dx = Math.cos(ang), dy = Math.sin(ang), k = Math.min(dx ? ((dx > 0 ? box.r : box.l) - (cx - cw / 2)) / dx : 1e9, dy ? ((dy > 0 ? box.b : box.t) - (cy - ch / 2)) / dy : 1e9);
  let x = Math.max(box.l, Math.min(box.r, cx - cw / 2 + dx * k)), y = Math.max(box.t, Math.min(box.b, cy - ch / 2 + dy * k));
  const vb = document.getElementById("view")!.getBoundingClientRect(), hit: { l: number; t: number; r: number; b: number; low: boolean }[] = [];
  for (const s of [".pl-mhead", "#line", "#talk"]) {
    const e = document.querySelector<HTMLElement>(s);
    if (!e || getComputedStyle(e).display === "none") continue;
    const b = e.getBoundingClientRect();
    if (b.width && b.height) hit.push({ l: b.left - vb.left - 8, t: b.top - vb.top - 8, r: b.right - vb.left + 8, b: b.bottom - vb.top + 8, low: b.top - vb.top > h / 2 });
  }
  for (let i = 0; i < 3; i++) for (const o of hit) if (x < o.r && x + cw > o.l && y < o.b && y + ch > o.t) y = o.low ? Math.max(box.t, o.t - ch) : Math.min(box.b, o.b);
  const busy = [...pl.querySelectorAll(".pl-area,.pl-life,.pl-piece,.pl-fold,.pl-card,.pl-lab,.pl-zone,.pl-sub")].map((e) => { const b = e.getBoundingClientRect(); return { l: b.left - vb.left - 6, t: b.top - vb.top - 6, r: b.right - vb.left + 6, b: b.bottom - vb.top + 6 }; }).concat(hit);
  const clear = (x: number, y: number) => !busy.some((o) => x < o.r && x + cw > o.l && y < o.b && y + ch > o.t), edgeSide = x <= box.l + 1 || x >= box.r - 1;
  if (!clear(x, y)) for (let d = 12; d < 2000; d += 12) {
    const c = ([[x, y - d], [x, y + d]] as [number, number][]).map(([a, b]) => (edgeSide ? [a, b] : [a + (b - y), y]) as [number, number]).filter(([a, b]) => a >= box.l && a <= box.r && b >= box.t && b <= box.b);
    const f = c.find(([a, b]) => clear(a, b));
    if (f) { [x, y] = f; break; }
    if (!c.length) break;
  }
  if (!clear(x, y) && open().length) { const w0 = cw; sp.textContent = sp.dataset.short ?? ""; cw = el.offsetWidth; if (x >= box.r - 1) x += w0 - cw; }   // no bare plane on its edge: the arrow and the count only
  el.style.left = px(x) + "px"; el.style.top = px(y) + "px";
}
/** the zone chips at Far: in the labels' row, at the left and right edges */
function placeZoneChips(pl: HTMLElement) {
  const { w } = L.viewSize();
  const lab = [...pl.querySelectorAll<HTMLElement>(".pl-zone:not(.pl-sub)")].filter((l) => !l.hidden).map((l) => parseFloat(l.style.top)).filter((n) => !isNaN(n));
  const y = Math.max(56, lab.length ? Math.min(...lab) : 56);
  pl.querySelectorAll<HTMLElement>("[data-zones]").forEach((el) => {
    el.style.left = px(el.dataset.side === "left" ? 14 : w - 14 - el.offsetWidth) + "px";
    el.style.top = px(y) + "px";
  });
}

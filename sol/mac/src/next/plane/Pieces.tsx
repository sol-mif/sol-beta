// Pieces by hand (BR1, #1615; Marco's go 11:35, mine/look/br1/pieces.html, narrow.html parts 2 and 3): no modes, only
// pieces. The Diary, a folder and a session each take four moves from the hand: move, resize, fold and a ⋯ menu that
// opens in place as a small card, never a page. This draws the plane's side of them; the moves are cv/moves/plane.ts's
// (place, fold, resize, offCanvas), each undone from the one Undo line (bar/undo.ts). The inside of today's page stays the
// diary slot's (diary/index.tsx); here are only its container's handles and its folded form, the spine.
//   the Diary: a handle over its top right (move, fold, ⋯) and a corner to pull; folded, the spine: one line with a dark
//     binding, the day, what is next, the last line written and how many asks, pressed to unfold where it is
//   a folder folded: its tab, the name and a status dot; a session folded: a chip, its folder's mark and its task
//   the ⋯ menu: Fold or Unfold, Take off the canvas; a folder's Put in a folder (the folders it can go in, and out to the
//     canvas when it is in one: the drag's nest without a drag, BR1 item 5); the Diary's as pieces.html lists it (BR1
//     23+Q4, builder G): Fold, Put in a folder › (that folder's own Diary, gone to), Show as Day · Week · Month (only
//     Day works yet), What feeds it › (its foot's sources and its pause), Take off the canvas
// Signed: marcocyl04-ux's agent, the port's BR1 pieces (#1615).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { D, S, M, above, act as doAct, regionOf, render, parentOf, canNest, piecesIn, hooks, type Piece, type Region } from "../cv/index.ts";
import * as L from "./layout.ts";
import { lines, now, dayNow, dateWords, hm, book } from "../diary/book.ts";
import { titleOf, toneOf, Mark, Label } from "./Folder.tsx";
import { apartOf, placeOf } from "../place.ts";
import { linesOf } from "../form.ts";
import { TYPE } from "../../kit/tokens.ts";
import { Pop } from "../Overlay.tsx";
import { boxOf } from "../layers.ts";
import { archive, isHolder, nameOf as holderName } from "../holders/model.ts";   // holders.html (#1615): Archive on a session, a holder's own ⋯
import { barOver, chipOn, overBar } from "../cv/wire/canvas.ts";   // BR1 item 7 (#1615): the Diary dropped on the bar is a chip too
import "./pieces.css";

// ---------------------------------------------------------------- the ⋯ menu: one at a time, in place

type Menu = { id: string };
let menu: Menu | null = null;
/** open a piece's ⋯ menu beside the button that asked for it: a pop-up (Overlay.tsx), placed by place() inside the canvas,
 *  its right edge under the button's, so it hangs over its own piece and never over the card beside it (pieces.html; BR1
 *  conform 5) */
export function openMenu(id: string, _el?: HTMLElement): void {
  menu = menu?.id === id ? null : { id };
  render();
}
/** what the Diary writes down, as its foot says it (diary/index.tsx "What it writes down"), one to a line */
const FEEDS = ["The pieces you open", "Your asks", "The runs"];
const buttonOf = (id: string) => document.querySelector<HTMLElement>(`[data-menu="${CSS.escape(id)}"]`);
export const closeMenu = () => { if (menu) { menu = null; render(); } };
export const menuOn = (id: string) => menu?.id === id;

/** the ⋯ button a piece carries; the Diary's says "See more in the Diary" (BR1 words pass: "More for the Diary" read unclear) */
export function More({ id, label }: { id: string; label: string }) {
  return <button type="button" className="pc-more" data-menu={id} aria-label={id === L.DIARY ? "See more in the Diary" : `More for ${label}`} aria-haspopup="menu" aria-expanded={menuOn(id)}
    onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); openMenu(id, e.currentTarget); }}>⋯</button>;
}

export function PieceMenu() {
  const box = useRef<HTMLDivElement>(null);
  const m = menu;
  const [put, setPut] = useState<string | null>(null);   // the folder whose "Put in a folder" list is shown
  useEffect(() => {
    setPut(null);   // a menu opens on its first list
    if (!m) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      const id = m.id;
      closeMenu();
      buttonOf(id)?.focus();
    };
    const down = (e: PointerEvent) => { const t = e.target as Element | null; if (!t?.closest?.("#pc-menu,[data-menu]")) closeMenu(); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("pointerdown", down, true); };
  }, [m?.id]);
  useLayoutEffect(() => { if (m) box.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus(); }, [m?.id, put]);
  if (!m) return null;
  const id = m.id, r = regionOf(id), p = D.pieces[id], diary = id === L.DIARY, holder = isHolder(id);
  if (!diary && !r && !p && !holder) return null;
  const name = diary ? "Diary" : holder ? holderName(id) : r ? r.name : titleOf(p);
  const st = p?.kind === "session" ? String(p.state) : "", run = !st || /stopped|taken back|done/.test(st) ? null : st === "paused" ? "resume" : "pause";
  const act = (fn: () => void) => () => { closeMenu(); fn(); };
  // a folder's Put in a folder: the folders it can go in (never itself, one inside it, or the one it is in), and out to
  // the canvas when it is in one; a press is M.nest, the drag's own move (its Undo line, and a fix line when Sol placed it)
  if (r && put === id) {
    const up = parentOf(id), to = D.regions.filter((x) => x.id !== up && canNest(id, x.id));
    return (
      <Pop className="pc-menu" id="pc-menu" data-piece-menu={id} role="menu" aria-label={`Put ${name} in a folder`} ref={box}
        anchor={() => { const b = buttonOf(id); return b ? boxOf(b) : null; }} prefer="below" align="end"
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <div className="pc-mh">Put {name} in</div>
        <div className="pc-put">
          {up ? <button type="button" role="menuitem" className="pc-mi" data-menu-put="" onClick={act(() => { setPut(null); M.nest(id, null); })}>The canvas<small>out of {regionOf(up)?.name}</small></button> : null}
          {to.map((x) => { const in_ = parentOf(x.id); return (
            <button key={x.id} type="button" role="menuitem" className="pc-mi" data-menu-put={x.id} onClick={act(() => { setPut(null); M.nest(id, x.id); })}>{x.name}{in_ ? <small>in {regionOf(in_)?.name}</small> : null}</button>); })}
          {!up && !to.length ? <div className="pc-mh">No other folder yet</div> : null}
        </div>
      </Pop>
    );
  }
  // the Diary's two lists (pieces.html): Put in a folder, that folder's own Diary (the one there, else made, as Add makes
  // it), gone to; and What feeds it, what the Diary writes down (its foot's words, one to a line) with its pause
  if (diary && put) {
    const feeds = put === "feeds", b = book();
    return (
      <Pop className="pc-menu" id="pc-menu" data-piece-menu={id} role="menu" aria-label={feeds ? "What feeds the Diary" : "Put the Diary in a folder"} ref={box}
        anchor={() => { const el = buttonOf(id); return el ? boxOf(el) : null; }} prefer="below" align="end"
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <div className="pc-mh">{feeds ? "What feeds it" : "Put the Diary in"}</div>
        {feeds ? (
          <>
            {FEEDS.map((w) => <div key={w} className="pc-feed" data-menu-feed="">{w}</div>)}
            <div className="pc-feed pc-feed-no">Nothing from your browser or mail</div>
            <div className="pc-sep" role="separator" />
            <button type="button" role="menuitem" className="pc-mi" data-menu-act="pause"
              onClick={act(() => { const was = !!b.paused, r = M.pause_diary(); if (r.ok) hooks.flash?.(was ? "Writing it down again" : "Not writing this down"); })}>{b.paused ? "Write it down again" : "Don’t write this down"}</button>
          </>
        ) : (
          <div className="pc-put">
            {D.regions.map((x) => { const in_ = parentOf(x.id); return (
              <button key={x.id} type="button" role="menuitem" className="pc-mi" data-menu-put={x.id} onClick={act(() => { setPut(null); const had = piecesIn(x.id).find((q) => q.kind === "diary"), to = had ? had.id : M.make("diary", "Diary", x.id)?.id; if (to) M.goto(to); })}>
                {x.name}{in_ ? <small>in {regionOf(in_)?.name}</small> : null}</button>); })}
            {!D.regions.length ? <div className="pc-mh">No folder yet</div> : null}
          </div>
        )}
      </Pop>
    );
  }
  return (
    <Pop className="pc-menu" id="pc-menu" data-piece-menu={id} role="menu" aria-label={`${name}: what you can do`} ref={box}
      anchor={() => { const b = buttonOf(id); return b ? boxOf(b) : null; }} prefer="below" align="end"
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="pc-mh">{name}</div>
      {r ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="open" onClick={act(() => M.folder_open(id))}>Open</button> : null}   {/* BR1 C: the opened folder (frame.html part 5) */}
      {!r && (D.pieces[id] || id === L.DIARY) ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="keep" onClick={act(() => M.besideKeep(id))}>◧ Keep open<small>beside the canvas</small></button> : null}   {/* BR1 Q1 (keep.html, builder E) */}
      {!r && D.pieces[id] ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="tab" onClick={act(() => M.tabOpen(id, true))}>⤢ As a tab</button> : null}
      <button type="button" role="menuitem" className="pc-mi" data-menu-act="fold" onClick={act(() => M.fold(id))}>{L.folded(id) ? "Unfold" : "Fold"}</button>
      {run ? <button type="button" role="menuitem" className="pc-mi" data-menu-act={run} onClick={act(() => doAct(`${run}:${id}`))}>{run === "resume" ? "Resume" : "Pause"}</button> : null}   {/* the calm screen (BR1 item 3): the presses a face hides at rest */}
      {run ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="stop" onClick={act(() => doAct(`stop:${id}`))}>Stop</button> : null}
      {r ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="put" onClick={() => setPut(id)}>Put in a folder</button> : null}
      {diary ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="put" aria-haspopup="menu" onClick={() => setPut("folder")}>Put in a folder<small>›</small></button> : null}
      {diary ? (
        <div className="pc-show" role="group" aria-label="Show as">
          <span>Show as</span>
          <button type="button" className="pc-seg" data-menu-act="day" aria-pressed="true" onClick={act(() => {})}>Day</button>
          <button type="button" className="pc-seg" data-menu-act="week" disabled title="soon">Week</button>
          <button type="button" className="pc-seg" data-menu-act="month" disabled title="soon">Month</button>
        </div>
      ) : null}
      {p?.kind === "session" ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="archive" onClick={act(() => archive(id))}>Archive</button> : null}   {/* holders.html: found again in Sessions › Archived */}
      {diary ? <div className="pc-sep" role="separator" /> : null}
      {diary ? <button type="button" role="menuitem" className="pc-mi" data-menu-act="feeds" aria-haspopup="menu" onClick={() => setPut("feeds")}>What feeds it<small>›</small></button> : null}
      <button type="button" role="menuitem" className="pc-mi" data-menu-act="off" onClick={act(() => M.offCanvas(id))}>{r ? "Archive" : "Take off the canvas"}</button>   {/* a folder's one word with its line (BR1 1b; holders.html: Archive, never the Shelf) */}
      {/* every ⋯ menu ends with the way back (sessions.html part 2, conform #4; its words the morning's, morning.html): a new
          chat's card, the piece given to it, in the piece's folder; nothing starts until the person starts it, so it works
          when the piece is broken */}
      {holder ? null : <div className="pc-sep" role="separator" />}
      {holder ? null : <button type="button" role="menuitem" className="pc-mi" data-menu-act="chat"
        onClick={act(() => M.start(r ? { region: id, now: false } : p ? { region: String(p.region ?? "") || undefined, given: [id], now: false } : { now: false }))}>Chat with AI about this</button>}
    </Pop>
  );
}

// ---------------------------------------------------------------- a drag of a handle: shown as it goes, placed on letting go

/** a press that may become a drag: the elements follow the pointer; let go, the move lands (in plane units); a press that
 *  never moved is a press. With `chip` (a piece's id), let go on the bar it rides with the next words as a chip and its
 *  place stays (BR1 item 7, cv/wire/canvas.ts) */
function dragFrom(e: RPointerEvent, els: () => HTMLElement[], land: (dx: number, dy: number) => void, press?: () => void, size?: boolean, chip?: string): void {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const sx = e.clientX, sy = e.clientY, start = els().map((el) => [el, el.offsetWidth, el.offsetHeight] as const);
  let moved = false;
  const mv = (ev: PointerEvent) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true;
    document.body.classList.add("pl-dragging");
    if (chip) barOver(overBar(ev.clientX, ev.clientY));
    for (const [el, w, h] of start) {
      if (size) { el.style.width = Math.max(120, w + dx) + "px"; el.style.height = Math.max(80, h + dy) + "px"; }
      else el.style.translate = `${dx}px ${dy}px`;
    }
  };
  const up = (ev: PointerEvent) => {
    removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
    document.body.classList.remove("pl-dragging");
    for (const [el] of start) { el.style.translate = ""; if (size) { el.style.width = ""; el.style.height = ""; } }
    if (!moved) { press?.(); return; }
    if (chip) { barOver(false); if (overBar(ev.clientX, ev.clientY)) { chipOn(chip); return; } }
    const z = S.cam.z || 1;
    land((ev.clientX - sx) / z, (ev.clientY - sy) / z);
  };
  addEventListener("pointermove", mv); addEventListener("pointerup", up);
}
const diaryEls = () => [...document.querySelectorAll<HTMLElement>("#pl-dy, #pc-dyhd, #pc-spine, #pc-rs")];
const diaryPos = () => D.pos?.[L.DIARY] ?? (D.zones ? { ...D.zones.page } : null);
const moveDiary = (dx: number, dy: number) => { const q = diaryPos(); if (q) M.place(L.DIARY, q.x + dx, q.y + dy); };

type Box = { x: number; y: number; w: number; h: number };
/** today's page open: its handles inside its own top strip, as pieces.html draws them (BR1 conform 23): a grip at the top's
 *  middle to move it, fold and ⋯ at its top right, and a corner to pull (screen px of the drawn page). The strip is the
 *  Diary's own (plane.css .pl-diary .dy leaves it room), so a text is never under a control (BR1 root part 3) */
/** a handle's width (--s6); a page narrower than three of them drops ⋯, then fold, then the grip */
const HANDLE = 24;
export function DiaryHandles({ fr, hh }: { fr: Box; hh: number }) {
  const fit = Math.max(0, Math.min(3, Math.floor(fr.w / (HANDLE * 3))));
  return (
    <>
      <div className="pc-dyhd" id="pc-dyhd" data-piece-handle="diary" style={{ left: Math.round(fr.x), top: Math.round(fr.y), width: Math.round(fr.w) }}>
        {fit >= 1 ? <button type="button" className="pc-grip" data-grip="diary" aria-label="Move the Diary, or press to open it up close" title="Drag to move · press to open"
          onPointerDown={(e) => dragFrom(e, diaryEls, moveDiary, () => M.page("diary"), false, L.DIARY)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); M.page("diary"); } }}><span className="pc-bar" aria-hidden="true" /></button> : null}
        {fit >= 2 ? <button type="button" className="pc-fold" data-fold="diary" aria-label="Fold the Diary" title="Fold" onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); M.fold(L.DIARY, true); }}><span aria-hidden="true">▴</span></button> : null}
        {fit >= 3 ? <More id={L.DIARY} label="the Diary" /> : null}
      </div>
      <button type="button" className="pc-rs" id="pc-rs" data-resize="diary" aria-label="Resize the Diary" title="Drag to resize"
        style={{ left: Math.round(fr.x + fr.w), top: Math.round(fr.y + hh) }}
        onPointerDown={(e) => dragFrom(e, () => [...document.querySelectorAll<HTMLElement>("#pl-dy")], (dx, dy) => {
          const q = diaryPos(); if (q) M.resize(L.DIARY, q.w + dx, q.h + dy);
        }, undefined, true)} />
    </>
  );
}

const WD = /^(\w+),\s*(\d+)/;
/** the spine's words: the day, what is next, the last line written, how many asks */
function spineBits(): { day: string; next: string | null; last: string | null; asks: number } {
  const k = dayNow(), dw = dateWords(k), m = WD.exec(dw), t = now(), ls = lines(k);
  const next = ls.filter((l) => l.t > t).sort((a, b) => a.t - b.t)[0], last = ls.filter((l) => l.t <= t).sort((a, b) => b.t - a.t)[0];
  return { day: m ? `${m[1]} ${m[2]}` : dw, next: next ? `${hm(next.t)} ${next.what}` : null, last: last ? last.what : null, asks: above() };
}
/** the Diary folded: the spine, one line with a dark binding; pressed, it unfolds where it is; dragged, it moves */
export function Spine({ r, max }: { r: Box; max: number }) {
  const b = spineBits(), w = Math.round(Math.min(max, Math.max(r.w, 360)));
  return (
    <div className="pc-spine" id="pc-spine" data-spine data-piece-folded="diary" style={{ left: Math.round(r.x), top: Math.round(r.y), width: w }}>
      <span className="sp-bind" aria-hidden="true" />
      <button type="button" className="sp-main" data-unfold="diary" aria-label="The Diary, folded: press to unfold"
        onPointerDown={(e) => dragFrom(e, diaryEls, moveDiary, () => M.fold(L.DIARY, false), false, L.DIARY)}>
        <b className="sp-day">{b.day}</b>
        {b.next ? <span className="sp-next" data-spine-next><i>Next</i>{b.next}</span> : null}
        {b.last ? <span className="sp-last" data-spine-last><i>Last</i>{b.last}</span> : null}
        {b.asks ? <span className="sp-asks" data-spine-asks>{b.asks} asks you</span> : null}
      </button>
      <More id={L.DIARY} label="the Diary" />
    </div>
  );
}

// ---------------------------------------------------------------- a folder folded, a session folded

const TONE: Record<string, string> = { asks: "fo-asks", bad: "fo-bad", run: "fo-run", good: "fo-good", quiet: "fo-quiet" };
/** a folder folded to its tab: its name and its place's tone as a dot, its line in the title (place.ts); the plane's card
 *  still (data-region), so the counts and the drag find it; its press unfolds it (plane/index.tsx click) */
/** a folded tab keeps room for its dot, its ⋯ and its insets: L.TAB_KEEP (the layout sizes a tab to its name by it) */
const TAB_KEEP = L.TAB_KEEP;
export function FolderTab({ r, cls, style, front, w }: { r: Region; cls: string; style: CSSProperties; front: boolean; w: number }) {
  const pl = placeOf(r.id), tone = toneOf(pl), named = linesOf(pl.name, TYPE.body[0], w - TAB_KEEP, true) === 1, ap = apartOf(r.id), apFits = !!ap && linesOf(`${pl.name} ${ap}`, TYPE.body[0], w - TAB_KEEP, true) === 1;   // one line, whole, or its dot alone (form.ts)
  return (
    <section className={`${cls} fo-folded`} data-front={front ? "" : undefined} data-region={r.id} data-part={pl.name} data-folded="" tabIndex={-1} style={style}
      title={`${pl.name}${ap ? ` (${ap})` : ""}: ${pl.line}. Press to unfold`} data-place-line={pl.line}>
      <span className={`fo-d ${TONE[tone]}`} data-sig={tone} />{named ? <span className="fo-tn">{pl.name}{apFits ? <span className="fo-apart" data-apart> {ap}</span> : null}</span> : null}
      <More id={r.id} label={r.name} />
    </section>
  );
}
/** My day's "+N" at the end of the tabs' row (narrow.html §2): the folders the row does not hold, by name in its title;
 *  its press brings the rows under it into view, where those tabs lie (L.dayMore) */
export function DayMore({ m, style }: { m: { ids: string[] }; style: CSSProperties }) {
  const names = m.ids.map((id) => placeOf(id).name);
  const show = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    const qs = m.ids.map((id) => D.pos?.[id]).filter(Boolean) as { y: number; h: number }[], { h } = L.viewSize(), sa = L.safe("far");
    if (!qs.length) return;
    const r = L.rectOn({ x: 0, y: Math.max(...qs.map((q) => q.y + q.h)), w: 0, h: 0 }), dy = r.y + 8 - (h - sa.b);
    if (dy > 0) M.pan(0, -dy);
  };
  return (
    <button type="button" className="pl-card fo-folded fo-daymore" data-day-more={m.ids.length} style={style} title={`${names.join(", ")}: press to see them`}
      aria-label={`${m.ids.length} more folders: ${names.join(", ")}`} onPointerDown={(e) => e.stopPropagation()} onClick={show}>+{m.ids.length}</button>
  );
}
/** a session folded to a chip: its folder's mark, its task and its state as a dot; its press unfolds it */
export function SessionChip({ p, style, children }: { p: Piece; style: CSSProperties; children?: ReactNode }) {
  const st = String(p.state || ""), tone = /fail/.test(st) ? "fo-bad" : /work|start/.test(st) ? "fo-run" : /done|merged/.test(st) ? "fo-good" : (p.term?.waiting ? "fo-asks" : "fo-quiet");
  return (
    <div className="pl-fold pl-schip" data-piece={p.id} data-in={p.region} data-folded="" data-piece-folded={p.id} style={style} title={`${titleOf(p)}: press to unfold`}>
      <Mark p={p} /><span className="pc-ct">{titleOf(p)}</span><Label p={p} /><span className={`fo-d ${tone}`} />{children}
      <More id={p.id} label={titleOf(p)} />
    </div>
  );
}

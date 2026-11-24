// The holders on the canvas and opened up close (BR1 #1615, mine/look/br1/holders.html; model.ts holds the rules).
// A holder is drawn as a stack of index cards, never a folder: no tab, no folder colour. At rest it shows the few lines
// that matter now (what needs you and what is working first, then the most recent, then a quiet "+ n archived"). Pressed,
// it opens up close over the canvas: every session or made thing across all folders, by when, with plain filters, and
// Archived one of them. Like any piece it moves (its top strip), folds and leaves the canvas by its ⋯ (plane/Pieces.tsx),
// and Add brings it back. Signed: marcocyl04-ux's agent (builder HO), BR1 (#1615).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactElement } from "react";
import { D, M, S, regionOf, type Piece } from "../cv/core.ts";
import * as L from "../plane/layout.ts";
import { held, type Rect } from "../plane/size.ts";
import { More } from "../plane/Pieces.tsx";
import {
  MADE, SESSIONS, STATE_W, archive, archivedFolders, archivedNow, askedOf, bringBack, bringFolderBack, folderName, gathered, holderIds, lastOf,
  madeArchived, madeKind, madeOf, madeTie, nameOf, openHolder, openedHolder, restOrder, sessionsOf, stateOf, subscribe, touchAsked, version, type MadeKind,
  archivedAt, sessionRank, weekRank, type ArchivedThing, type SFilter,
} from "./model.ts";
import { lightOff } from "../plane/landed-state.ts";
import Collection from "../Collection.tsx";   // the one list (root part 4): every opened list ranks, the rest is one count line
import { barOver, chipOn, overBar } from "../cv/wire/canvas.ts";   // BR1 item 7 (#1615): a holder dropped on the bar is a chip
import "./holders.css";

const px = (n: number) => Math.round(n);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

const DAY = 864e5;
const whenOf = (t: number): string => {
  if (!t) return "Earlier";
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return t >= start ? "Today" : t >= start - 6 * DAY ? "This week" : "Earlier";
};
const dayWords = (t: number): string => {
  if (!t) return "";
  const w = whenOf(t);
  return w === "Today" ? "today" : new Date(t).toLocaleDateString(undefined, w === "This week" ? { weekday: "short" } : { day: "numeric", month: "short" });
};
const title = (p: Piece) => L.titleOf(p);
const where = (rid: string) => (regionOf(rid) ? String(regionOf(rid)!.name) : folderName(rid));

/** a ✦ row ties to the session that made its thing (model.ts madeTie, plane/landed.ts): the hand on it lights that
 *  session wherever it shows; a row closed or folded under the hand takes its light with it (builder F10) */
function useTie(p: Piece) {
  const t = madeTie(p), sid = (t as { "data-made"?: string })["data-made"];
  useEffect(() => (sid ? () => lightOff(sid) : undefined), [sid]);
  return t;
}
function MadeLine({ p }: { p: Piece }) {
  return <div className="hd-row" {...useTie(p)}><span className="hd-ai" aria-hidden="true">✦</span><span className="hd-n">{title(p)}</span><small>{dayWords(lastOf(p))}</small></div>;
}
function MadeArt({ p }: { p: Piece }) {
  const t = useTie(p);
  return (
    <button type="button" className="hd-art" data-hd-row={p.id} {...t} onClick={() => { openHolder(null); M.goto(p.id); }}>
      <span className={`hd-p k-${madeKind(p)}`} aria-hidden="true" /><span className="hd-nm"><span className="hd-ai" aria-hidden="true">✦</span> {title(p)}</span><small>{where(String(p.region ?? ""))}</small>
    </button>);
}

/** the holder's mark: Sessions the orb (a session is a talk), Made and the asked ones a page */
const Mark = ({ id }: { id: string }) => (id === SESSIONS ? <span className="hd-orb" aria-hidden="true" /> : <span className="hd-ic" aria-hidden="true">◧</span>);

// ---------------------------------------------------------------- at rest, on the canvas

/** a press that may become a drag of the whole holder: shown as it goes, placed on letting go (M.place, its Undo line) */
function grab(e: RPointerEvent<HTMLElement>, id: string, press: () => void): void {
  if (e.button !== 0 || (e.target as Element).closest?.("[data-menu]")) return;
  e.preventDefault(); e.stopPropagation();   // the plane's own press would pan
  const el = e.currentTarget.closest<HTMLElement>("[data-holder]"), sx = e.clientX, sy = e.clientY;
  let moved = false;
  const mv = (ev: PointerEvent) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true; document.body.classList.add("pl-dragging"); barOver(overBar(ev.clientX, ev.clientY));
    if (el) el.style.translate = `${dx}px ${dy}px`;
  };
  const up = (ev: PointerEvent) => {
    removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
    document.body.classList.remove("pl-dragging");
    if (el) el.style.translate = "";
    if (!moved) { press(); return; }
    barOver(false); if (overBar(ev.clientX, ev.clientY)) { chipOn(id); return; }   // let go on the bar: a chip for the next words, its place kept (BR1 item 7)
    const q = D.pos?.[id], z = S.cam.z || 1;
    if (q) { M.place(id, q.x + (ev.clientX - sx) / z, q.y + (ev.clientY - sy) / z); touchAsked(id); }
  };
  addEventListener("pointermove", mv); addEventListener("pointerup", up);
}

function Lines({ id }: { id: string }) {
  if (id === SESSIONS) {
    const all = sessionsOf(), top = restOrder(all).slice(0, 3), arch = archivedNow().length + archivedFolders().length;
    if (!all.length && !arch) return <div className="hd-row hd-quiet">No sessions yet. Each one you start gathers here.</div>;
    return <>
      {top.map((p) => { const s = stateOf(p); return <div key={p.id} className="hd-row"><span className={`hd-dot d-${s}`} aria-hidden="true" /><span className="hd-n">{title(p)}</span><small>{STATE_W[s] || dayWords(lastOf(p))}</small></div>; })}
      {arch ? <div className="hd-row hd-quiet">+ {arch} archived</div> : null}
    </>;
  }
  const xs = id === MADE ? [...madeOf()].sort((a, b) => lastOf(b) - lastOf(a)) : gathered(askedOf(id)!);
  if (!xs.length) return <div className="hd-row hd-quiet">{id === MADE ? "Nothing made yet. Pages, files and notes your AIs make gather here." : "Nothing yet. It gathers as things come."}</div>;
  return <>
    {id === MADE ? <div className="hd-thumbs" aria-hidden="true">{xs.slice(0, 4).map((p) => <span key={p.id} className={`hd-th k-${madeKind(p)}`} />)}</div> : null}
    {xs.slice(0, id === MADE ? 1 : 3).map((p) => <MadeLine key={p.id} p={p} />)}
  </>;
}

function count(id: string): number {
  if (id === SESSIONS) return sessionsOf().length + archivedNow().length;
  if (id === MADE) return madeOf().length;
  const a = askedOf(id);
  return a ? gathered(a).length : 0;
}

/** one holder at its place: at Far held between a card's smallest and largest size, like a folder's card */
export function HolderCard({ id, q, z, far }: { id: string; q: Rect; z: number; far: boolean }) {
  const b = far ? held(q, z, "card") : q, name = nameOf(id), a = askedOf(id), n = count(id), fold = L.folded(id);
  const style = { left: b.x, top: b.y, width: px(b.w * z), transform: `scale(${1 / z})` };   // its height its lines' (quiet at rest: three or four)
  const press = () => openHolder(id);
  return (
    <section className={`hd-card${fold ? " folded" : ""}${openedHolder()?.id === id ? " on" : ""}`} data-holder={id} style={style} aria-label={`${name}, ${plural(n, "thing")}`}>
      <div className="hd-stack" aria-hidden="true"><i /><i /><i /></div>
      <div className="hd-h" onPointerDown={(e) => grab(e, id, press)} role="button" tabIndex={0} aria-label={`Open ${name}`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(); } }}>
        <Mark id={id} /><b>{name}</b>{a && !a.touched ? <span className="hd-new" title={`you asked: ${a.words}`}>✦</span> : null}<i>{n}</i>
        <More id={id} label={name} />
      </div>
      {fold ? null : <div className="hd-body" onPointerDown={(e) => grab(e, id, press)}><Lines id={id} /></div>}
    </section>
  );
}

/** the plane's items for the holders (plane/index.tsx): every holder with a place, not taken off, on screen */
export function holderItems(z: number, far: boolean, vis: (q: Rect) => Rect | null): ReactElement[] {
  void version();
  return holderIds().filter((id) => D.pos?.[id] && !L.isOff(id) && vis(far ? held(D.pos[id], z, "card") : D.pos[id]))
    .map((id) => <HolderCard key={"h:" + id} id={id} q={D.pos![id]} z={z} far={far} />);
}

// ---------------------------------------------------------------- opened up close

type MFilter = "recent" | MadeKind | "archived";
const none = (words: string) => <p className="hd-none">{words}</p>;

/** one session as a row: its state's dot, its title (a press opens it: `open`, by default where it sits on the canvas),
 *  its folder unless the row is drawn inside that folder (`here`), its state or when it last moved, and ⋯ Open, Archive.
 *  The opened folder draws its sessions with it too (folder/index.tsx, walk note item 4) */
export function SessionRow({ p, open = (x) => { openHolder(null); M.goto(x.id); }, here = false }: { p: Piece; open?: (p: Piece) => void; here?: boolean }) {
  const [menu, setMenu] = useState(false), s = stateOf(p);
  return (
    <div className="hd-r" data-hd-row={p.id}>
      <span className={`hd-dot d-${s}`} aria-hidden="true" />
      <button type="button" className="hd-open" onClick={() => open(p)}>{title(p)}</button>
      {here ? null : <small className="hd-where">{where(String(p.region ?? ""))}</small>}
      <small>{STATE_W[s] || (dayWords(lastOf(p)) ? `last ${dayWords(lastOf(p))}` : "")}</small>
      <span className="hd-acts">
        <button type="button" className="hd-more" aria-label={`More for ${title(p)}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>⋯</button>
        {menu ? <span className="hd-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); open(p); }}>Open</button>
          <button type="button" role="menuitem" data-hd-act="archive" onClick={() => { setMenu(false); archive(p.id); }}>Archive</button>
        </span> : null}
      </span>
    </div>
  );
}

function SessionsClose() {
  const [f, setF] = useState<SFilter>(() => (openedHolder()?.on === "archived" ? "archived" : "recent"));
  const all = sessionsOf(), arch = archivedNow(), folders = archivedFolders();
  const needs = all.filter((p) => stateOf(p) === "needs"), working = all.filter((p) => stateOf(p) === "working");
  const regions = new Set(all.map((p) => p.region)).size;
  const fs: [SFilter, string][] = [["needs", `Needs you · ${needs.length}`], ["working", `Working · ${working.length}`], ["recent", "Recent"], ["archived", `Archived · ${arch.length + folders.length}`], ["all", "All"]];
  const things: ArchivedThing[] = [...arch.map((a) => ({ k: "session" as const, a })), ...folders.map((x) => ({ k: "folder" as const, x }))];
  const archRow = (t: ArchivedThing) => t.k === "session"
    ? <div key={t.a.id} className="hd-r" data-hd-row={t.a.id}><span className="hd-dot d-idle" aria-hidden="true" /><span className="hd-nm">{t.a.name}</span><small className="hd-where">{where(t.a.region)}</small><small>{t.a.at ? `archived ${dayWords(t.a.at)}` : "archived"}</small>
      <span className="hd-acts"><button type="button" className="hd-back" data-hd-act="back" onClick={() => bringBack(t.a.id)}>Bring back</button></span></div>
    : <div key={t.x.folder} className="hd-r" data-hd-row={t.x.folder}><span className="hd-fd" aria-hidden="true" /><span className="hd-nm">{t.x.name}</span><small>{t.x.by === "person" ? "a folder you archived" : `a folder Sol put away: ${t.x.why}`}</small>
      <span className="hd-acts"><button type="button" className="hd-back" data-hd-act="back" onClick={() => bringFolderBack(t.x.folder)}>Bring back</button></span></div>;
  return <>
    <div className="hd-ch"><Mark id={SESSIONS} /><b>Sessions</b><small>{plural(all.length, "session")}{regions > 1 ? ` across ${regions} folders` : ""}</small><button type="button" className="hd-x" onClick={() => openHolder(null)}>Esc · close</button></div>
    <div className="hd-filt" role="tablist" aria-label="Show">{fs.map(([k, w]) => <button key={k} type="button" role="tab" aria-selected={f === k} className={f === k ? "on" : ""} data-hd-filter={k} onClick={() => setF(k)}>{w}</button>)}</div>
    <div className="hd-list">
      {f === "archived"
        ? <Collection key="archived" className="hd-co" label="archived" items={things} keyOf={(t) => (t.k === "session" ? t.a.id : t.x.folder)} draw={archRow}
            ranking={weekRank(archivedAt)} more={(n) => `${n} archived before this week`}
            none={none("Nothing archived. ⋯ Archive on a session or a folder puts it here, and Bring back puts it where it was.")} />
        : <Collection key={f} className="hd-co" label={f} items={f === "needs" ? needs : f === "working" ? working : all} keyOf={(p) => p.id} draw={(p) => <SessionRow key={p.id} p={p} />}
            ranking={sessionRank(f)} more={(n) => (f === "all" ? `${plural(n, "session")} before this week` : `${plural(n, "earlier session")}`)}
            none={none(f === "needs" ? "Nothing needs you." : f === "working" ? "Nothing is working right now." : "No sessions yet.")} />}
    </div>
  </>;
}

function MadeClose({ id }: { id: string }) {
  const [f, setF] = useState<MFilter>("recent");
  const a = askedOf(id), all = a ? gathered(a) : madeOf();
  const live = all.filter((p) => !madeArchived(p)), shown = f === "archived" ? all.filter((p) => madeArchived(p)) : f === "recent" ? live : live.filter((p) => madeKind(p) === f);
  const fs: [MFilter, string][] = [["recent", "Recent"], ["pages", "Pages"], ["files", "Files"], ["notes", "Notes"], ["archived", "Archived"]];
  return <>
    <div className="hd-ch"><Mark id={id} /><b>{nameOf(id)}</b><small>{a ? `you asked: ${a.words}` : `${plural(all.length, "thing")} your AIs made`}</small><button type="button" className="hd-x" onClick={() => openHolder(null)}>Esc · close</button></div>
    <div className="hd-filt" role="tablist" aria-label="Show">{fs.map(([k, w]) => <button key={k} type="button" role="tab" aria-selected={f === k} className={f === k ? "on" : ""} data-hd-filter={k} onClick={() => setF(k)}>{w}</button>)}</div>
    <div className="hd-list">
      <Collection key={f} className="hd-co hd-arts" label={f} items={shown} keyOf={(p) => p.id} ranking={weekRank(lastOf)} more={(n) => `${plural(n, "thing")} from before this week`}
        draw={(p) => <MadeArt key={p.id} p={p} />}
        none={none(f === "archived" ? "Nothing archived. What sits in an archived folder is here." : a ? "Nothing yet. It gathers as things come." : "Nothing made yet. Each page, file and note your AIs make gathers here, naming the session and folder it came from.")} />
    </div>
  </>;
}

/** the holder opened up close: over the canvas, Esc or a press outside closes it */
export function HolderClose() {
  useSyncExternalStore(subscribe, version, version);
  const box = useRef<HTMLElement>(null), id = openedHolder()?.id ?? null;
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target as Element)?.closest?.(".hd-menu")) { e.preventDefault(); e.stopPropagation(); openHolder(null); } };
    const down = (e: PointerEvent) => { const t = e.target as Element | null; if (!t?.closest?.(".hd-close,[data-holder],#pc-menu,#line,.bar,#bar")) openHolder(null); };
    window.addEventListener("keydown", key, true); window.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("pointerdown", down, true); };
  }, [id]);
  useLayoutEffect(() => { if (id) box.current?.querySelector<HTMLElement>(".hd-filt .on")?.focus(); }, [id]);
  if (!id || !holderIds().includes(id) || S.dist === "near") return null;
  const sessions = id === SESSIONS || askedOf(id)?.of === "sessions";
  return (
    <section ref={box} className="hd-close" role="dialog" aria-label={nameOf(id)} data-holder-close={id}>
      {id === SESSIONS ? <SessionsClose /> : sessions ? <AskedSessions id={id} /> : <MadeClose id={id} />}
    </section>
  );
}

function AskedSessions({ id }: { id: string }) {
  const a = askedOf(id)!;
  return <>
    <div className="hd-ch"><Mark id={id} /><b>{nameOf(id)}</b><small>you asked: {a.words}</small><button type="button" className="hd-x" onClick={() => openHolder(null)}>Esc · close</button></div>
    <div className="hd-list"><Collection className="hd-co" label="asked" items={gathered(a)} keyOf={(p) => p.id} draw={(p) => <SessionRow key={p.id} p={p} />}
      ranking={sessionRank("recent")} more={(n) => plural(n, "earlier session")} none={none("Nothing yet. It gathers as things come.")} /></div>
  </>;
}

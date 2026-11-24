// The new face's shell (#1604, docs/port/slices.md "Before the night: the prep"; the mockup's merge/shell.html and
// shell.js): the sidebar (Find, Waiting on you, New session, Working now, the folders, Cowork,
// Social, Settings), the tab row on top (the Canvas tab with the crumb, a tab per piece taken out, ＋; the keys for here and Shortcuts on its hover), the view routed over S
// into the slices' named slots (slots.ts), the ask line, the talk pill, Find (⌘P), the outline twin, the pop-ups' root and the frame's line.
// DOM hooks the counts read: #view #line #crumb #press #outline #overlay #say. Live (a real Sol) the store starts empty
// and the wires fill it; the dev page (dev.tsx) loads the fixture and draws <Shell/> itself.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent } from "react";
import {
  D, S, M, SCEN, act, asksInRegion, attach, answer, findByWords, hooks, lineAsk, open, piecesIn, regionOf, say, setMode,
  useNext, folderOrder, SCN, ancestors,
} from "./cv/index.ts";
import type { Engine } from "./cv/wire/types.ts";
import { Slot, warm, type SlotName, type SlotProps } from "./slots.ts";
import { crumbOf, needsCount, onPeople } from "./people/queue.ts";   // slices 8+9: the people's pages, crumb and count
import { fitSide, setSideFolded, sideFolded, type SideList } from "./side.ts";   // round 6 · F2: the sidebar fits; Look 1 A1: its lists fold
import { FitPal, FitsLayer, TopFold } from "./fits/views.tsx";   // slice R8 (#1615): ⌘P finds fits, the knob card, the bar's ⋯ (requests/fits.md)
import Bar from "./bar/Bar.tsx";   // the bottom bar (#1615, BR1: Marco's decision 2026-11-21)
import { barHere } from "./bar/here.ts";   // where the bar is drawn: has-bar leaves room for it (BR1 conform 2)
import { isOff, titleOf } from "./plane/layout.ts";   // a session by its task, never an agent (Marco, 2026-11-21)
import { markChrome } from "./chrome.ts"; markChrome();   // the Mac app's window buttons: the root is marked once, the sidebar keeps clear of them (#1615)
import { grabRow, wasDrag } from "./sideorder.ts";   // walk note item 8: a folder's row drags to its place among the folders
import { onShelf } from "./shelf/model.ts";
import { live } from "./movein/state.ts";   // #1816 round 2: what the person's words left out, "Not sorted yet"
import { To } from "./plane/Raise.tsx";
import { focusNow, holdTo, letGo, sendTo, toNow, toOf, useHand } from "./plane/raise-state.ts";   // BR1 quiet canvas (#1615): the bar's To follows the hand
import Tabs from "./tabs/Tabs.tsx";   // BR1 tabs (#1615): the row on top of the canvas
import { layerVars, boxOf, room } from "./layers.ts";   // BR1 root part 1: the four layers
import { Overlay, OverlayRoot, Pop } from "./Overlay.tsx";
import { frame, FrameLine } from "./frame.tsx";
import { FolderMark, taskOf } from "./tabs/Label.tsx";
import { apartOf, askHint, folderPath, placeOf, sayToo } from "./place.ts";   // BR1 root part 2: what a place is
import { viewNow } from "./atwork/count.ts";   // the sidebar's Working now: what See what's at work reads (builder F)
import { openAt } from "./atwork/act.ts";
import Attach from "./markup/Attach.tsx";   // BR1 3c: the talk pill's attach menu (P)
import Kept from "./kept/Kept.tsx";   // BR1 Q1: a piece kept open beside the canvas (builder E)
import Tips from "./tips/Tips.tsx";   // BR1 (#1615): the first Keep open, As a tab and reply each show one tip (builder P9)
import { tipAt } from "./tips/tips-state.ts";
import Learn from "./learn/Learn.tsx";   // BR1 (#1615, learn.html): the end card, the walks (builder T-face)
import { barAsk, helpAsk, helpOpen, helpShown } from "./learn/help-state.ts";   // and Help, a session as a tab
import { isHowTo } from "./learn/answers.ts";   // a "how do I…" on the canvas bar is Help's (learn.html part 3, note 9)
import BarLine from "./learn/BarLine.tsx";
import { ShellLine } from "../cowork/ShellLine";   // the app updates itself (#1824, J1b): the same Restart Sol line as the old face
import "./appup.css";
import Takes from "./kept/Takes.tsx";   // BR1 inside.html: while dragging, every place that takes it says its verb (builder E)
import { keptNow } from "./cv/moves/kept.ts";
import { tabShown } from "./cv/moves/tabs.ts";
import { addressee, moment, sessionOpen, setupTo } from "./cv/moves/talkto.ts";   // BR1 inside.html §1: who the one bar talks to (builder E)
import { stableLine, redraw as stableRedraw } from "./cv/wire/stable.ts";   // BR1 lane G (#1615): a new version, on the frame's line
import { agentBar, agentLine, askAgent, chipOff } from "./cv/wire/canvas.ts";   // BR1 B (#1615): what no move takes goes to the canvas session, with the chips dropped on the bar
import "../palette.css";
import "../kit/next.css";
import "./next.css";

/** the person's first two named folders in the canvas's order, shown ones only: the examples the ask bar and Every move give */
const firstNames = () => folderOrder().filter((id) => !isOff(id) && !ancestors(id).some(isOff) && regionOf(id)?.named !== false).slice(0, 2).map((id) => String(regionOf(id)!.name));
const Welcome = lazy(() => import("./movein/Welcome.tsx"));   // BR1 (#1615): the first run with nothing found (movein/Welcome.tsx)

/** the new face in a real Sol (App.tsx, ui.next on): live, the wires attached once, the shell drawn */
export default function Next({ e }: { e: Engine }) {
  const first = useRef(e);
  useEffect(() => { setMode("live"); return attach(first.current); }, []);
  return <Shell />;
}

/** every move with its key (shell.js MOVES): pressable by pointer (count 11). "Never a toolbar" was the mockup's rule;
 *  Marco's decision of 2026-11-21 (#1615, BR1) supersedes it: the bottom bar (bar/Bar.tsx) carries the canvas's fixed
 *  verbs, Where, zoom, Arrange, Add and Customize, and every move here stays pressable and keyed as it was */
export const MOVES: [string, string, string][] = [["Back", "back", "⌘["], ["Forward", "fwd", "⌘]"], ["Zoom out", "out", "⌘↑"], ["Zoom in", "dive", "⌘↓"],
  ["The whole canvas", "map", "⌘0"], ["Next ask", "next", "⌘J"], ["Find", "goto", "⌘P"], ["Beside", "beside", "⌘\\"], ["Follow an AI", "follow", "⌘⇧F"],
  ["Recent", "recent", "⌘E"], ["Set mark 1", "markSet:1", "⌘⇧1"], ["Go to mark 1", "markGo:1", "⌘1"], ["Too much", "tooMuch", "⌘⇧H"]];

/** the shell: `only` draws one slot alone in #view (the dev page's ?slot=, for a slice tried before the others land) */
export function Shell({ only }: { only?: { name: SlotName; props: SlotProps } }) {
  useNext(() => 0);   // the shell redraws on every change
  const [moves, setMoves] = useState(false);
  const [find, setFind] = useState(false);
  usePageFocus();
  useEffect(() => warm(), []);   // every page's code loaded while idle: no page is blank on its first open (builder F, BR1)

  useEffect(() => {
    hooks.flash = (t, act, no) => frame.say(t, act ? { act, ...(no ? { no } : {}) } : {});   // what just happened is the frame's line (frame.tsx), never a toast over the canvas
    hooks.find = () => setFind(true);
    agentLine.hold = (t) => frame.hold("agent", t ? { text: t } : null);   // the canvas session at work, on the frame's line until it answers (BR1 B)
    stableLine.hold = (l) => frame.hold("stable", l); stableLine.say = (t) => frame.say(t); stableRedraw();   // a new version (cv/wire/stable.ts)
    return () => { hooks.flash = null; hooks.find = null; agentLine.hold = null; stableLine.hold = null; stableLine.say = null; };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      for (const k of hooks.keys) if (k(e)) { e.preventDefault(); return; }
      const t = e.target as HTMLElement | null;
      // a row drawn as <a role="button"> has no click of its own on Enter or Space, so it is given one (BR1 item 5, #1615)
      if ((e.key === "Enter" || e.key === " ") && !e.metaKey && t?.matches?.(CONTROL) && !t.matches(NATIVE)) { e.preventDefault(); t.click(); return; }
      if (t?.matches?.("input,textarea,select,[contenteditable]")) return;
      if (t?.closest?.("#v-settings")) return;
      if (!e.metaKey && e.key === "?") { e.preventDefault(); setMoves((m) => !m); return; }
      if (e.key === "Escape") {
        if (moves) { e.preventDefault(); setMoves(false); return; }
        if (S.page === "folder" && S.folderAs === "page") { e.preventDefault(); M.folder_place(); return; }   // BR1 2+Q2: a folder's page steps back down to in place, then out
        if (S.page) { e.preventDefault(); M.page(null); return; }
        if (tabShown() && keptNow() !== tabShown()) { e.preventDefault(); M.besideFromTab(); moment("esc-step", { to: "beside" }); return; }   // BR1 Q1: a tab in front steps back to beside the canvas, then closed
        if (keptNow()) { e.preventDefault(); M.besideDrop(); moment("esc-step", { to: "closed" }); return; }
        if (S.dist === "needs") { e.preventDefault(); M.out(); return; }
        if (focusNow() || toNow()) { e.preventDefault(); letGo(); return; }   // the hand lets go (quiet.html)
        return;
      }
      if (!e.metaKey) return;
      const c = e.code, sh = e.shiftKey, ans = lineAsk() || S.askHere;
      const f: (() => unknown) | null =
        c === "Enter" && ans ? () => answer(ans) : c === "Backspace" && ans ? () => answer(ans, "later")
        : c === "Slash" && ans ? () => hooks.flash?.(`why: ${D.asks[ans].source} asked; it ranks ${D.asks[ans].rank}`)
        : c === "BracketLeft" ? M.back : c === "BracketRight" ? M.fwd : c === "KeyP" || c === "KeyK" ? () => setFind(true) : c === "KeyJ" ? M.next
        : sh && c === "KeyH" ? M.tooMuch : sh && c === "KeyF" ? () => M.follow() : c === "ArrowUp" ? M.out : c === "ArrowDown" ? () => M.dive()
        : c === "Digit0" ? M.map : /^Digit[1-9]$/.test(c) ? () => (sh ? M.markSet(+c.slice(5)) : M.markGo(+c.slice(5)))
        : c === "KeyE" ? () => M.recent(1) : c === "Backslash" ? M.beside : c === "Comma" ? () => M.page(S.page === "settings" ? null : "settings") : null;
      if (f) { e.preventDefault(); f(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [moves]);

  const press = (ev: RMouseEvent) => {
    const b = (ev.target as Element).closest?.("[data-act]") as HTMLElement | null;
    if (!b?.dataset.act) return;
    act(b.dataset.act);
    if (b.closest("#press")) setMoves(false);
  };
  const near = S.dist === "near" && !S.page && !S.calm, session = near && !!S.piece && D.pieces[S.piece]?.kind === "session";
  const barShown = barHere();   // Bar draws itself on the same test
  return (
    <div className={`nx${near ? " at-near" : ""}${session ? " at-session" : ""}${barShown ? " has-bar" : ""}${S.page === "settings" ? " at-settings" : ""}${keptNow() ? " has-kept" : ""}`} data-face="next" style={layerVars} onClick={press}>
      <Sidebar />
      <main className="nx-main" id="main">
        <Top moves={moves} setMoves={setMoves} />
        <div className="nx-split" onPointerDownCapture={hand}><div id="view" aria-live="polite" className="nx-view"><View only={only} />{only ? null : <Slot name="notes" />}</div>{only ? null : <Kept />}</div>
        <Takes />
        <Suspense fallback={null}><Welcome /></Suspense>
        {S.page === "settings" && <section id="v-settings" className="nx-panel" role="dialog" aria-label="Settings"><Slot name="settings" /></section>}
      </main>
      <Pop className="nx-moves" id="press" role="dialog" aria-label="Every move" hidden={!moves} prefer="below" anchor={movesAt}>
        <div className="nx-moves-h">Every move <small>press it, say it, or use its keys</small></div>
        {MOVES.map(([l, a, k]) => <button key={a} className="nx-mv" data-act={a}>{l}<span className="nx-kbd">{k}</span></button>)}
        <div className="nx-moves-f">{sayToo(firstNames()[0])}</div>
      </Pop>
      <Line />
      <Bar />
      <Pill />
      <div className="nx-appup"><ShellLine /></div>
      {find && <Find close={() => setFind(false)} />}
      <Outline />
      <FitsLayer />
      <OverlayRoot />
      <Tips />
      <Learn />
      <FrameLine />
    </div>
  );
}

/** the moves list hangs under its button in the top bar; place() keeps it inside the canvas, under the tabs' row */
/** a control drawn by role, and the ones that press themselves on a key */
const CONTROL = "[role=button], [role=link], [role=switch], [role=tab], [role=menuitem], [role=option], [role=checkbox]";
const NATIVE = "button, a[href], summary, select, input, textarea";

const movesAt = () => { const b = document.getElementById("movesbtn"); return b ? boxOf(b) : null; };

/** a page takes the keys where it opens (its heading, so a screen reader reads where it is) and gives them back to what
 *  opened it once it closes: the sidebar row, or the folder card it was opened from, drawn again (BR1 item 5, #1615).
 *  A page's slot loads lazily, so its heading is looked for a few frames */
function usePageFocus() {
  const page = useNext(() => S.page ?? null);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (page) {
      const a = document.activeElement as HTMLElement | null;
      if (!opener.current && a && a !== document.body) opener.current = a;
      const from = document.activeElement;
      let n = 0, f = 0;
      const take = () => {
        const st = page === "settings", root = document.getElementById(st ? "v-settings" : "view"), h = root?.querySelector<HTMLElement>(st ? "input, h1, h2" : "h1");   // Settings is a dialog: its find field first
        if (root?.contains(document.activeElement) || (document.activeElement !== from && document.activeElement !== document.body)) return;   // the person is elsewhere already
        if (h?.getClientRects().length) { if (/^H\d$/.test(h.tagName)) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } else if (n++ < 40) f = window.setTimeout(take, 50);
      };
      f = window.setTimeout(take, 0);   // the view draws the page after the shell, so what is there now is still the canvas
      return () => clearTimeout(f);
    }
    const o = opener.current;
    opener.current = null;
    if (!o) return;
    const at = document.activeElement;
    if (at && at !== document.body && at.isConnected) return;   // something else took the keys on the way out
    const back = o.isConnected ? o : o.dataset.region ? document.querySelector<HTMLElement>(`[data-region="${o.dataset.region}"]`) : null;
    back?.focus({ preventScroll: true });
  }, [page]);
}

/** the router over S (shell.js render): a page over the canvas, "too much", Needs, Near, else the plane */
function View({ only }: { only?: { name: SlotName; props: SlotProps } }) {
  if (only) return <Slot name={only.name} {...only.props} />;
  if (S.calm) return <Slot name="needs" part="toomuch" />;
  if (S.page === "ais") return <Slot name="ais" />;
  if (S.page === "work") return <Slot name="work" />;   // BR1 C: work plans and automations (#1615)
  if (S.page === "folder") return <Slot name="folder" />;   // BR1 C: an opened folder (frame.html part 5)
  if (S.page === "atwork") return <Slot name="atwork" />;   // BR1 item 7: See what's at work (#1615)
  if (S.page === "diary") return <Slot name="near" part="diary" />;   // first-timer line 4: the sidebar's Diary, up close
  if (onPeople(S.page)) return <Slot name="people" />;
  if (S.dist === "needs") return <><Slot name="needs" part="view" /><Slot name="people" part="needs" /></>;
  if (S.dist === "near") return <Slot name="near" />;
  const band = S.dist === "middle" ? "middle" : "far";
  return <><Slot name="plane" band={band} /><Slot name="agent" band={band} /></>;
}

/** a folder's row in the sidebar: its place's name, what needs the person as the count, its line on hover (place.ts). A
 *  folder inside a folder (BR1) sits under it, one step in per level, in the canvas's order (folderOrder). A press opens
 *  the folder, as a press on its card does: before, it only moved the canvas to it (H3, BR1 #1615: "pressing la245 in the
 *  sidebar only pans") */
function PlaceRow({ id }: { id: string }) {
  const pl = placeOf(id), depth = ancestors(id).length;
  const on = S.page === "folder" ? S.folder === id : !S.page && S.dist !== "far" && S.region === id;
  // frame.html §1: the folder's colour mark, its name, and one status dot (asks you, else working), never a count
  const dot = pl.counts.asks ? { c: "ask", t: `${pl.counts.asks} ${pl.counts.asks === 1 ? "asks" : "ask"} you` } : pl.counts.working ? { c: "run", t: "working" } : null;
  // walk note item 8: nothing hidden. A folder archived or taken off the canvas (or in one that is) is listed, marked so;
  // a folder at the top of the canvas drags to another place among them, which moves it there on the canvas (sideorder.ts)
  const offBy = [id, ...ancestors(id)].find(isOff), off = offBy ? (onShelf(offBy) ? "archived" : "off the canvas") : "";
  return <a className={`nx-row nx-reg${on ? " on" : ""}${off ? " nx-off" : ""}`} role="button" tabIndex={0} data-act={`folder_open:${id}`} data-region={id} data-off={off || undefined}
    title={off ? `${pl.line} · ${off}` : pl.line} data-place-line={pl.line} data-depth={depth} style={depth ? { paddingLeft: `calc(var(--s2) + ${depth} * var(--s3))` } : undefined}
    onPointerDown={(e) => grabRow(e, id)} onClickCapture={(e) => { if (wasDrag()) { e.preventDefault(); e.stopPropagation(); } }}>
    <RegionMark id={id} /><span className="nx-rn">{pl.name}{apartOf(id) ? <span className="nx-apart" data-apart> {apartOf(id)}</span> : null}</span>{off ? <span className="nx-offw">{off}</span> : dot ? <span className={`nx-dot ${dot.c}`} title={dot.t} aria-label={dot.t} /> : null}</a>;
}

/** Working now (frame.html §1; Marco, Q5 2026-11-22 14:18): every session at work and every automation running, as See
 *  what's at work reads them (atwork/count.ts), each with its folder's mark, its task, a status dot and its folder ("·
 *  loose" when in none); a press opens it where it is. None: one line. The heading opens See what's at work (builder F's
 *  page, atwork/), its hook [data-working-now]. The rows sit in #sideais, so the sidebar's fit (side.ts) keeps the ones
 *  that fit, asks first, and "+N more" opens the page too */
/** a list's fold (Look 1 A1): its state, kept across loads, and the heading's press that turns it */
function useFold(k: SideList): [boolean, (e: RMouseEvent) => void] {
  const [f, setF] = useState(() => sideFolded(k));
  return [f, (e) => {
    if ((e.target as Element).closest?.(".nx-headadd")) return;   // its ＋ or ↗ is its own press
    setSideFolded(k, !f); setF(!f);
  }];
}
const Chev = ({ open }: { open: boolean }) => <span className={`nx-chev${open ? " open" : ""}`} aria-hidden="true" />;

function WorkingNow() {
  const rows = viewNow(null).now;
  const more = () => openAt(null);
  const [folded, turn] = useFold("ais");
  return <>
    {/* the heading folds the list (Look 1 A1); ↗ at its right opens See what's at work, as "+N more" does */}
    <a className={`nx-label nx-head nx-wkhead${S.page === "atwork" ? " on" : ""}`} id="aisrow" role="button" tabIndex={0} data-working-now data-fold="ais" aria-expanded={!folded} onClick={turn} title={folded ? "Show Working now" : "Fold Working now"}>
      <Chev open={!folded} /><span className="nx-rn">Working now</span>{rows.length ? <span className="nx-hn">{rows.length}</span> : null}
      <span className="nx-headadd" role="button" tabIndex={0} data-atwork aria-label="See what's at work" title="See what's at work" onClick={(e) => { e.stopPropagation(); more(); }}>↗</span></a>
    <div id="sideais" className="nx-wk" aria-label="Working now">
      {folded ? null : rows.length ? rows.map((r) => {
        const fail = r.stand === "asks" && /failure/.test(r.line), dot = fail ? "bad" : r.stand === "asks" ? "ask" : r.stand === "held" ? "held" : "run";
        const st = fail ? "stopped on a failure" : r.stand === "asks" ? "asks you" : r.stand === "held" ? "paused" : r.kind === "auto" ? "automation" : "working";
        return <a key={r.id} className={`nx-row nx-ai nx-wkrow${S.dist === "near" && S.piece === r.id ? " on" : ""}`} role="button" tabIndex={0} data-act={`goto:${r.id}`} data-working={r.id} title={`${r.name}: ${r.line}`}>
          <RegionMark id={r.folder} /><span className="nx-wkt"><b className="nx-rn">{r.name}</b>
            <small className={`nx-st${r.stand === "asks" ? " asks" : ""}`}><span className={`nx-dot ${dot}`} aria-hidden="true" />{st} · {r.folder && regionOf(r.folder) ? regionOf(r.folder)!.name : "loose"}</small></span></a>;
      }) : <div className="nx-none" data-working-none>No AI is working right now</div>}
      <a className="nx-row nx-aimore" role="button" tabIndex={0} hidden onClick={more}><span className="nx-rn">more</span></a>
    </div>
  </>;
}

/** Loose sessions (frame.html §1): the sessions in no folder, last under the folders with their count, a press taking you
 *  to the newest; no row while there are none */
function LooseRow() {
  const ls = Object.values(D.pieces).filter((p) => p.kind === "session" && !p.inside && !regionOf(p.region));
  if (!ls.length) return null;
  const last = ls.reduce((a, b) => (Number(b.born) || 0) > (Number(a.born) || 0) ? b : a);
  return <a className="nx-row nx-reg nx-loose" role="button" tabIndex={0} data-act={`goto:${last.id}`} data-loose={ls.length}>
    <RegionMark id={null} /><span className="nx-rn">Loose sessions</span><span className="nx-hn nx-at">{ls.length}</span></a>;
}

/** #1816 round 2: once the person has said how their folders are, the folders Sol found that their words left out wait
 *  here, never on the canvas. A press lists them beside the sidebar, as "more" does; each is sorted by saying where it
 *  goes in the bar, so the rows are read, not pressed */
function UnsortedRow() {
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLAnchorElement>(null), pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (ev: PointerEvent) => { const t = ev.target as Node; if (!row.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { setOpen(false); row.current?.focus(); } };
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [open]);
  const left = live.words ? [...live.unsorted.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)) : [];
  if (!left.length) return null;
  const toggle = () => setOpen((o) => !o);
  const where = (p: string) => p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
  return <>
    <a className={`nx-row nx-reg nx-loose${open ? " on" : ""}`} ref={row} role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={open} data-unsorted={left.length}
      onClick={toggle} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } }}>
      <RegionMark id={null} /><span className="nx-rn">Not sorted yet</span><span className="nx-hn nx-at">{left.length}</span></a>
    {open ? <Pop ref={pop} className="nx-morepop" role="dialog" aria-label="Not sorted yet" prefer="right" anchor={() => (row.current ? boxOf(row.current) : null)}>
      <span className="nx-label">Say where these go in the bar, in your own words</span>
      {left.map((u) => <div key={u.id} className="nx-row" data-unsorted-row={u.id} title={u.path}>
        <span className="nx-rn">{u.name}</span><span className="nx-hn nx-at">{u.sessions ? `${u.sessions} session${u.sessions === 1 ? "" : "s"}` : where(u.path)}</span></div>)}
    </Pop> : null}
  </>;
}

/** a folder's colour mark, as its card and its tab draw it (tabs/Label.tsx); dashed in no folder (loose) */
const RegionMark = ({ id }: { id: string | null }) => <FolderMark p={{ id: "", region: id ?? "", kind: "", name: "" }} />;

/** H4: the folders the sidebar has no room for. side.ts fitSide hides their rows, shows this row and writes "+N more" in
 *  it; a press lists those folders beside the sidebar, each going to its folder as its row does (All folders already
 *  showing, a press that only went there did nothing) */
function FoldersMore() {
  const [ids, setIds] = useState<string[] | null>(null);
  const row = useRef<HTMLAnchorElement>(null), pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ids) return;
    const away = (ev: PointerEvent) => { const t = ev.target as Node; if (!row.current?.contains(t) && !pop.current?.contains(t)) setIds(null); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { setIds(null); row.current?.focus(); } };
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [ids]);
  const left = () => [...document.querySelectorAll<HTMLElement>("#sideregions .nx-reg[data-region][hidden]")].map((e) => e.dataset.region!);
  const toggle = () => setIds((o) => (o ? null : left()));
  const go = (id: string) => { setIds(null); act(`folder_open:${id}`); };
  return <>
    <a className={`nx-row nx-reg nx-regmore${ids ? " on" : ""}`} ref={row} role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={!!ids} data-regmore hidden
      onClick={toggle} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } }}><span className="nx-rn">more</span></a>
    {ids ? <Pop ref={pop} className="nx-morepop" role="dialog" aria-label="More folders" prefer="right" anchor={() => (row.current ? boxOf(row.current) : null)}>
      {ids.map((id) => <a key={id} className="nx-row" role="button" tabIndex={0} data-more={id} style={ancestors(id).length ? { paddingLeft: `calc(var(--s2) + ${ancestors(id).length} * var(--s3))` } : undefined}
        onClick={() => go(id)} onKeyDown={(ev) => { if (ev.key === "Enter") go(id); }}><span className="nx-rn">{placeOf(id).name}</span></a>)}
    </Pop> : null}
  </>;
}

function Sidebar() {
  // the canvas's folders in its order, every one (walk note item 8): one archived, taken off the canvas, or inside one
  // that is, is listed too and says so (PlaceRow)
  const [fFolded, turnF] = useFold("regions");
  const fs = folderOrder(), who = SCN ? SCEN[SCN]?.label.split(" · ")[0] : "";
  const nav = useRef<HTMLElement>(null);
  // round 6 · F2: the sidebar never scrolls: after each draw, and again when it changes size, the AIs keep the whole rows
  // that fit, then "+N more"; then they fold to their heading, then the folders fold (side.ts)
  useLayoutEffect(() => { if (nav.current) fitSide(nav.current); });
  useEffect(() => {
    const sd = nav.current, ss = sd?.querySelector(".nx-scroll");
    if (!sd || !ss || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return;
    // rows that arrive late (a lazy slot's, the people's) fit too; the fit's own changes are not heard
    const mo = new MutationObserver(() => fit()), watch = () => mo.observe(ss, { childList: true, subtree: true });
    const fit = () => { mo.disconnect(); fitSide(sd); mo.takeRecords(); watch(); };
    const ro = new ResizeObserver(() => fit());
    ro.observe(ss); watch();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return (
    <nav className="nx-side" id="side" aria-label="Sidebar" ref={nav}>
      <div className="nx-drag" data-tauri-drag-region aria-hidden="true" />
      {who ? <div className="nx-me"><span className="nx-av">{who[0]}</span><b>{who}</b></div> : null}
      {/* frame.html §1, as Marco ruled it whole (Q5–Q7, 2026-11-22 14:18 and 14:51): Find, what waits on you, a new session;
          Working now; the folders; Cowork, Social and Settings at the foot. No At work, Shelf, You, Archived or "Hand a task
          to an AI" row: the chat bar is where a task is handed over, and what is put aside or kept is reached through the
          holders on the canvas (holders.html). The canvas is the Canvas tab, and the Diary a piece on it */}
      <a className="nx-row" id="findrow" role="button" tabIndex={0} data-act="goto">Find<span className="nx-k">⌘K</span></a>
      <a className={`nx-row${!S.page && S.dist === "needs" ? " on" : ""}`} id="needsrow" role="button" tabIndex={0} data-act="needs" data-f="one count: Cowork waits + Social cards">Waiting on you<span className="nx-k">⌘J</span><span className={`nx-n${needsCount() ? "" : " zero"}`} id="needn">{needsCount()}</span></a>
      <a className="nx-row" id="newrow" role="button" tabIndex={0} data-act="tabNew" data-new-session><span className="nx-plus" aria-hidden="true">＋</span>New session<span className="nx-k">⌘N</span></a>
      <div className="nx-scroll">
        <WorkingNow />
        <div className="nx-regions" id="sideregions" aria-label="Folders">
          <a className="nx-label nx-head" data-folders-head role="button" tabIndex={0} data-fold="regions" aria-expanded={!fFolded} onClick={turnF} title={fFolded ? "Show Folders" : "Fold Folders"}>
            <Chev open={!fFolded} /><span className="nx-rn">Folders</span><span className="nx-headadd" role="button" tabIndex={0} data-act="newFolder" data-newfolder aria-label="Make a folder" title="Make a folder">＋</span></a>
          {fFolded ? null : <>
            {fs.map((id) => <PlaceRow key={id} id={id} />)}
            <FoldersMore />
            <LooseRow />
            <UnsortedRow />
          </>}
        </div>
      </div>
      <div className="nx-foot">
        <Slot name="peopleside" />
        {/* learn.html part 1 note 3: Help sits above Settings; the walks replay from there and its session opens there */}
        <a className={`nx-row lr-helprow${helpShown() && !S.page ? " on" : ""}`} role="button" tabIndex={0} data-help-row onClick={() => helpOpen()}><span className="lr-q" aria-hidden="true">?</span>Help</a>
        <a className={`nx-row${S.page === "settings" ? " on" : ""}`} role="button" tabIndex={0} data-act="page:settings" data-go="settings">Settings<span className="nx-k">⌘,</span></a>
      </div>
    </nav>
  );
}

function Top({ moves, setMoves }: { moves: boolean; setMoves: (f: (m: boolean) => boolean) => void }) {
  const seg: { id: string; label: string; act?: string }[] = [];
  if (onPeople(S.page)) seg.push(...crumbOf(S.page));
  else if (S.page === "folder" && regionOf(String(S.folder ?? ""))) {   // BR1 C: an opened folder; H3: every folder it sits in, outermost first, each opening its own
    const path = folderPath(String(S.folder));
    seg.push({ id: "canvas", label: "All folders", act: "map" }, ...path.slice(0, -1).map((a) => ({ id: "up:" + a.id, label: a.name, act: `folder_open:${a.id}` })), { id: "page", label: path[path.length - 1].name });
  }
  else if (S.page) seg.push({ id: "page", label: ({ ais: "Your AIs", work: "Plans and automations", atwork: "At work", diary: "Diary", cowork: "Cowork", social: "Social", settings: "Settings" } as Record<string, string>)[S.page] ?? S.page });
  else if (S.dist === "needs") seg.push({ id: "needs", label: "Waiting on you" });
  else {
    seg.push({ id: "canvas", label: "All folders", act: "map" });
    const r = S.dist !== "far" ? regionOf(S.region) : undefined;
    if (r) seg.push({ id: "region", label: r.name, act: `goto:${r.id}` });
    const p = S.dist === "near" && S.piece ? D.pieces[S.piece] : undefined;
    if (p) seg.push({ id: "piece", label: `${taskOf(p)}${S.beside && D.pieces[S.beside] ? ` ‖ ${taskOf(D.pieces[S.beside])}` : ""}` });   // BR1: the task, not the AI (#1615)
    if (S.calm) seg.push({ id: "calm", label: "Too much" });
  }
  const h = (l: string, a: string, k: string) => <button key={a} className="nx-hint" data-act={a} title={l}><span className="nx-kbd">{k}</span> {l.toLowerCase()}</button>;
  const hs = S.calm ? [h("Too much", "tooMuch", "⌘⇧H")] : onPeople(S.page) ? [h("Back to the canvas", "page", "esc"), h("Next ask", "next", "⌘J")] : S.page || S.dist === "needs" ? [h("Back to the canvas", "map", "⌘0"), h("Next ask", "next", "⌘J")]
    : S.dist === "far" ? [h("Next ask", "next", "⌘J"), h("Find", "goto", "⌘P")] : S.dist === "middle" ? [...(regionOf(S.region) ? [<button key="open" className="nx-hint" data-act={`folder_open:${S.region}`} title="What every session here knows, and its sessions">open {regionOf(S.region)!.name}</button>] : []), h("Zoom out", "out", "⌘↑"), h("Next ask", "next", "⌘J"), h("Find", "goto", "⌘P")]
    : [h("Find", "goto", "⌘P"), h("Too much", "tooMuch", "⌘⇧H")];
  // BR1 row 19 (frame.html, keep.html): one row on top of the window, the tabs. The crumb is the Canvas tab's own words,
  // so the way back stays where the canvas is: "Canvas / newsletter"; a page opened over the canvas is a step of it
  if (seg[0]?.id === "canvas") seg[0] = { ...seg[0], label: "Canvas" };
  else seg.unshift({ id: "canvas", label: "Canvas", act: onPeople(S.page) ? "page" : "map" });
  const crumb = (
    <span className="nx-crumb" id="crumb" role="navigation" aria-label="You are here">
      {/* the calm screen (BR1 item 3): a crumb is a way back, a link (the breadcrumb pattern); the last is where you are */}
      {seg.map((s, i) => { const last = i === seg.length - 1; return <span key={s.id}>{i ? <span className="nx-sl">/</span> : null}<a id={i ? undefined : "canvasrow"} role={s.act && !last ? "link" : undefined} tabIndex={s.act && !last ? 0 : undefined} aria-current={last ? "page" : undefined} data-act={last ? undefined : s.act}>{s.label}</a></span>; })}
    </span>
  );
  return (
    <Tabs crumb={crumb}>
      {/* the keys for here and Shortcuts at the row's right end, on its hover or focus */}
      <div className="nx-right">
        <div className="nx-hints" id="hints" aria-label="Keys here">{hs}</div>
        <button className="nx-chip" id="movesbtn" aria-haspopup="dialog" aria-expanded={moves} onClick={(e) => { e.stopPropagation(); setMoves((m) => !m); }}>Shortcuts <span className="nx-kbd">?</span></button>
        <TopFold />
      </div>
    </Tabs>
  );
}

/** the ask line: shown while an ask is brought to it or peeks (engine.js renderLine); its words are slice 2's */
function Line() {
  const id = lineAsk(), live = !S.calm && !!id && !!D.asks[id] && !D.asks[id].answered;
  return <div id="line" className="nx-line" role="alert" style={{ display: live ? "block" : "none" }}>{live ? <Slot name="needs" part="line" /> : null}</div>;
}

/** the bar follows the hand (inside.html §1): a press inside the open session talks to it again, a press on the empty
 *  canvas (the plane, a folder's ground) makes the bar new while the session stays open */
function hand(e: { target: EventTarget }): void {
  const t = e.target as Element;
  if (!sessionOpen() || !t.closest) return;
  if (t.closest(".kp") || (S.dist === "near" && t.closest("#view"))) M.talkHere();
  else if (t.id === "pl" || t.classList.contains("pl-area")) M.talkNew();
}

/** the talk: one pill, everywhere; it takes the moves said or typed (the chain, cv/say) */
function Pill() {
  const [v, setV] = useState("");
  // a folder's setup open in its header (setup.html §2, builder F10): the newest thing the hand did, so the bar talks to
  // it ahead of the folder the hand pressed on the way in; its words are told to the folder
  const st = useNext(() => setupTo() ?? ""), setup = st ? { id: st, name: regionOf(st)?.name ?? st } : null;
  const { to } = useHand(), reply = setup ? null : toOf(to);   // pointed at a folder that asks or works, the bar replies to it
  // else the session open in front or beside the canvas (BR1 inside.html §1): the one bar talks to it, never a second bar
  const said = useNext(() => { const id = addressee(); return id ? `${id}\n${titleOf(D.pieces[id])}` : ""; }), [sid, sname] = said.split("\n");
  const help = useNext(() => helpShown());   // the Help session in front: the bar talks to it (learn.html part 3)
  const sess = !reply && !help && sid ? { id: sid, name: sname } : null;
  const working = useNext(() => agentBar.working), chips = useNext(() => agentBar.chips);   // the canvas session's turn, the pieces dropped here (cv/wire/canvas.ts)
  // the bar's Add puts a ready sentence here, for the person to finish and send (#1615, BR1); false when the pill is hidden
  useEffect(() => {
    const h = hooks as { talk?: ((w: string) => boolean) | null };
    h.talk = (w) => {
      const i = document.getElementById("say") as HTMLInputElement | null;
      if (!i || !i.offsetParent) return false;
      setV(w);
      requestAnimationFrame(() => { i.focus(); i.setSelectionRange(w.length, w.length); });
      return true;
    };
    return () => { h.talk = null; };
  }, []);
  return (<>
    <BarLine />
    <div className="nx-talk" id="talk" data-working={working || undefined} onPointerEnter={() => holdTo(true)} onPointerLeave={() => { if (!v.trim() && document.activeElement?.id !== "say") holdTo(false); }}>
      <span className="nx-aura" />
      <Attach />
      {help
        ? <span className="nx-to nx-to-on nx-to-s" data-to-help aria-live="polite">To: <b>Help</b></span>
        : sess
        ? <span key={sess.id} className="nx-to nx-to-on nx-to-s" data-to={sess.id} data-moment="to-chip" aria-live="polite">To: <b title={sess.name}>{sess.name}</b><button type="button" className="nx-to-x" data-to-new onClick={() => M.talkNew()} aria-label={`Stop talking to ${sess.name}; the bar starts something new`} title="New (Esc)">×</button></span>
        : setup ? <span className="nx-to nx-to-on nx-to-s" data-to-setup={setup.id} aria-live="polite">To: <b title={`${setup.name} · setup`}>{setup.name} · setup</b><button type="button" className="nx-to-x" onClick={() => M.fsClose()} aria-label={`Close ${setup.name}'s setup`} title="Close (Esc)">×</button></span>
        : <To />}
      {chips.map((c) => <span key={c.id} className="nx-to nx-to-on nx-chip-in" data-chip={c.id}><b title={c.title}>{c.title}</b><button type="button" className="nx-to-x" data-chip-x={c.id} onClick={() => chipOff(c.id)} aria-label={`Take ${c.title} off the bar`} title="Take off">×</button></span>)}
      <input id="say" aria-label={help ? "Ask Help how anything works" : reply ? `Reply to ${reply.name}` : sess ? `Reply to ${sess.name}` : setup ? `Tell ${setup.name} how it works` : "Say a move or ask anything"} placeholder={sess ? "Reply, or drag something in" : setup ? "Change how this folder works…" : askHint(firstNames())} {...(help ? { placeholder: "Ask how anything works" } : {})} autoComplete="off" value={v}
        onFocus={() => { holdTo(true); if (reply || sess) tipAt("esc"); }} onBlur={() => { if (!v.trim()) holdTo(false); }}
        onChange={(e) => { setV(e.target.value); if (reply || sess) tipAt("esc"); }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && reply) { letGo(); return; }
          if (e.key === "Escape" && sess) { e.stopPropagation(); M.talkNew(); moment("esc-step", { to: "new" }); return; }   // the bar is new; the session stays open
          if (e.key === "Backspace" && !v && chips.length) { chipOff(chips[chips.length - 1].id); return; }
          if (e.key !== "Enter" || (!v.trim() && !chips.length)) return;
          // pieces dropped here ride with the words to the canvas session, never as a move (BR1 item 7)
          if (chips.length) { if (!askAgent(v.trim())) hooks.flash?.("Sol's agent is not reachable from this window"); setV(""); return; }
          if (help) { helpAsk(v); setV(""); return; }   // Help explains and shows; it never changes anything
          if (!sess && !reply && !setup && isHowTo(v)) { barAsk(v); setV(""); return; }   // the bar's one line answers it, never "Not a move I know"
          if (setup) { if (M.folder_tell(setup.id, v).ok) hooks.flash?.(`Told ${setup.name}: every session there knows it`); setV(""); return; }   // words to the setup go to known(), as a fact of the folder, never to what the hand pressed before
          if (sendTo(v)) { setV(""); return; }
          const r = say(v);
          if (sess && !r?.ok) M.talk(sess.id, v.trim());   // a move said here runs; anything else goes to the session (near/Talk.tsx's rule)
          else if (!r && !askAgent(v.trim())) hooks.flash?.("Sol's agent is not reachable from this window");   // the bar is always agentic: what no move takes goes to the canvas session (BR1 B)
          setV("");
        }} />
      <span className="nx-hint-q">hold <span className="nx-kbd">fn</span> to talk</span>
    </div>
  </>);
}

/** Find (⌘P): folders, pieces, AIs and asks by their words (shell.js palIndex) */
function Find({ close }: { close: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items: { g: string; l: string; id: string }[] = [];
  D.regions.forEach((r) => items.push({ g: "Folders", l: r.name, id: r.id }));
  Object.values(D.pieces).forEach((p) => items.push({ g: "Pieces", l: p.kind === "session" ? titleOf(p) : p.name, id: p.id }));
  D.ais.forEach((a) => items.push({ g: "AIs", l: a.name, id: a.name }));
  open().forEach((a) => items.push({ g: "Asks", l: a.text, id: a.id }));
  const w = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (w.length ? items.filter((x) => w.every((t) => (x.l + " " + x.g).toLowerCase().includes(t))) : items.filter((x) => x.g === "Folders" || x.g === "AIs")).slice(0, 12);
  const go = (id?: string) => { close(); const t = id ?? findByWords(q); if (t) M.goto(t); };
  const c = room();   // its press covers the canvas only: the frame stays as it is (layers.ts)
  return (
    <Overlay>
    <div className="nx-pal" id="overlay" role="dialog" aria-modal="true" aria-label="Find" style={{ left: c.x, top: c.y, width: c.w, height: c.h }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="nx-pal-card">
        <input id="gq" autoFocus placeholder="a folder, piece, AI or ask" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") close(); if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1)); if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0)); if (e.key === "Enter") go(hits[sel]?.id); }} />
        <FitPal q={q} close={close} />
        {hits.map((x, i) => <button key={x.g + x.id} className={`nx-res${i === sel ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); go(x.id); }}><span>{x.l}</span><span className="nx-k">{x.g}</span></button>)}
      </div>
    </div>
    </Overlay>
  );
}

/** the outline twin: the canvas as a tree, for VoiceOver and for anyone (engine.js renderOutline) */
function Outline() {
  return (
    <nav id="outline" className="nx-sr" aria-label="Outline of the canvas">
      <div role="tree">
        {D.regions.map((r) => <div key={r.id} role="treeitem" aria-expanded="true">
          <button data-act={`goto:${r.id}`}>{r.name}{asksInRegion(r.id).length ? `, ${asksInRegion(r.id).length} ${asksInRegion(r.id).length === 1 ? "needs" : "need"} you` : ""}</button>
          {piecesIn(r.id).map((p) => <button key={p.id} role="treeitem" data-act={`goto:${p.id}`}>— {p.kind === "session" ? titleOf(p) : p.name}</button>)}
        </div>)}
        {open().map((a) => <button key={a.id} data-act={`goto:${a.id}`}>{a.text}</button>)}
      </div>
    </nav>
  );
}

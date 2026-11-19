// The side (#682, the universal layer: sol/design/layer, the brief ~/computer/scratch/sol/layer-brief.md): the list of
// sessions, in every mode the same shape. Built from the kit (sol/mac/src/kit, look.md); its rules in side.css.
// Six places that never move: S1 the modes (home | cowork), S2 new, S3 find (all sessions, the side wide; ⌘K), S4 the
// list (folders, rows, N more), S5 done today, S6 settings at the foot. Flat (Marco 2026-11-07): a row at rest is its
// words on the black; the kit's Glass lifts it 7% under the pointer, from the keys, or while its menu is open; the
// picked row is the kit's Pearl, the side's one pearl. Every row, folder and head is a "thing" for the keys (keys.ts):
// data-thing, data-kind, focused by Home.tsx.
// 2026-11-14 (the fix round on two kinds of session): the helpers' line and its pref (Build settings › sidebar ›
// helpers) are gone: only `under` folds now, under an orchestration row that says its own count, so nothing else had one.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MomentDot } from "../notify/InPlace";   // the one notification (#845): the row's dot
import type { RunInfo, Work, WorkSession } from "../work/useWork";
import { rowState } from "../work/WorkSidebar";
import type { AppMode } from "../ModeSwitch";
import { Button, Card, Glass, List, Pearl, jellyBands, textW, useSize, type Item } from "../kit";
import { hex, ink, on, useUid } from "../kit/paint";
import { CURVE, JELLY, SHADE, TYPE } from "../kit/tokens";
import { fitRow, TALK } from "../fit";
import { sideOf, wideOf, base, folderOf, when, type Filter, type St } from "./sideRows";
import { sortSide, steadySide, foldUnder, underWords, orchSays, type Line } from "./sideSort";
import { useOrchKept, renewNow } from "./sideKept";   // an orchestration session's renewal, followed (2026-11-14)
import { dropMove, keyMove, aboveOf, undoOf, moveWords, withPending, settle, refusedBack, headOf, type Move, type Pending } from "./sideUnder";   // moving sessions by hand (step 3b)
import { useSidePrefs, folderEdit, setKnown } from "./sidePrefs";
import { SessFoot } from "./sideAll";
import { ArtsFoot, useArtifacts } from "./sideArts";
import type { StageStore } from "../stage/store";
import { useMoves, useHeld } from "./sideMoves";
import { isBuild, type Placed } from "../work/sortedRules";
import type { Metas } from "./meta";
import { BlocksHere } from "../stage/BlocksHere";
import { LensPill } from "../stage/LensPill";
import { oneLens } from "../stage/userLens";   // the lens is one Build setting then, not a pill here
import { store } from "../stage/engineStore";
import { onCarryOver, carryOver, rowWord, setNames } from "../stage/carry";
import { dur } from "../motion";
import { EMPTY } from "../stage/store";
import { useSpine } from "../spine/flag";
import { useLamp } from "../spine/lamp";
import { FolderPieces } from "../folderPieces/FolderPieces";   // #1092: a folder's pieces above its sessions (build.pieces)
import { useBuildPieces } from "../folderPieces/flag";
import { useOpenPiece } from "../folderPieces/open";
import "./side.css";

export const meta = {
  Side: {
    job: "the only list: every session in its folder, its state on its row",
    flow: "pickup",
    states: ["reading", "empty", "one", "many", "more than six in a folder", "folder folded", "done today", "picked row", "row menu", "renaming", "soft-open", "wide", "wide, filtered", "carry here", "n carried",
      "sorted by what needs you", "needs you", "pinned", "running", "earlier", "a row moving",
      "orchestration row", "orchestration row, nothing under yet", "orchestration row open", "one under it needs you", "a row dragged onto an orchestrator", "release",
      "a child dragged, let go here", "a move refused, the row shakes", "moved, undo in the foot"],
    keys: [
      { press: "click a row", does: "opens the session in the talk", goal: "pickup" },
      { press: "⌘-click a row", does: "opens it in the pane", goal: "pickup", opens: "Second", faster: true },
      { press: "drag a row to the talk", does: "opens it in the pane", goal: "pickup", opens: "Second", faster: true },
      { press: "right-click a row", does: "the row's menu: open beside, rename, pin, archive; release, on a session an orchestrator runs" },
      { press: "click new", does: "a new session, as ⌘N", goal: "say", faster: true },
      { press: "click all sessions", does: "opens the side wide: every session, with filters", goal: "pickup", faster: true },
      { press: "click a folder", does: "folds it or opens it" },
      { press: "click an orchestration row's mark (it turns into the fold arrow under the pointer) or its words", does: "opens or folds the sessions it runs", goal: "pickup", faster: true },
      { press: "hold a dragged session over a folded orchestration row", does: "it springs open, so the drop can land between its children" },
      { press: "drag a child out of its group (a loose row, a folder, the let-go strip)", does: "the orchestrator lets it go; inside its own group it stays" },
      { press: "drag a row onto an orchestration row", does: "the orchestrator runs it: the row lights \"carry here\", then folds under it", goal: "pickup", faster: true },
      { press: "click release in a row's menu", does: "the orchestrator lets it go: a row of its own again, by recency" },
      { press: "drag a child onto its orchestrator, its group's room or a loose row", does: "lets it go; while it is dragged its group's top says \"let go here\"" },
      { press: "drag a child onto another orchestration row", does: "moves it there; both rows' words change at once" },
      { press: "drag an orchestration row onto another", does: "nests it; a loop is refused, the row shakes once, the reason in its title" },
      { press: "⌘↓ on the picked row", does: "puts it under the nearest orchestration row above it", faster: true },
      { press: "⌘↑ on the picked row", does: "lets it go from the orchestrator that runs it", faster: true },
      { press: "⌘Z, or undo in the foot, within 8 s of a move", does: "takes the move back", faster: true },
      { press: "point at a row, click its pin", does: "pins it or lets it go", goal: "pickup", faster: true },
      { press: "click N more", does: "opens the side wide" },
      { press: "click settings", does: "Settings, as a sheet over Home", goal: "mine" },
      { press: "drag a block's title onto a row (the stage on)", does: "carries the block there too: the row lights \"carry here\", then says \"n carried\"" },
      { press: "click home | cowork", does: "goes to Cowork", goal: "team" },
    ],
    listens: ["work.sessions", "work.runs (each row's state)", "work.loaded", "work.projects (which folders are Home's)", "sol.side.prefs (Build settings › sidebar)", "sol.home.clean.folds", "sol.layer.wild (the wild card: needs you rises)", "work.stage.changed (blocks here, n carried)"],
  },
  Lift: {
    job: "what lies behind a line of the side: nothing at rest, the 7% lift under the pointer or the keys, the pearl when picked",
    flow: "pickup",
    states: ["rest", "lifted", "picked"],
    keys: [{ press: "point at a row", does: "lifts it 7%, the pointer's answer before a click", goal: "pickup", faster: true }],
    listens: ["the pointer", "the focus", "the picked row"],
  },
  RowMenu: {
    job: "a row's menu, the kit's Card and List at the pointer: open beside, rename, pin, promote or demote, archive",
    flow: "pickup",
    states: ["open"],
    keys: [
      { press: "click open beside", does: "the session in the pane", goal: "pickup", opens: "Second", faster: true },
      { press: "click rename", does: "its title becomes a field, in the row" },
      { press: "click pin", does: "keeps it on the side past the week" },
      { press: "click promote to orchestration", does: "the session runs other sessions from now on: it hears their reports and is kept fresh" },
      { press: "click demote", does: "a normal session again; the sessions under it go loose, above it by recency" },
      { press: "click archive", does: "it leaves the side; the side wide still finds it" },
      { press: "Esc or a click away", does: "closes the menu" },
    ],
    listens: ["the row it opened on"],
  },
  Rename: {
    job: "a row's title as a field, in place: Enter keeps it, Esc leaves it",
    flow: "pickup",
    states: ["typing"],
    keys: [{ press: "Enter", does: "renames the session", goal: "pickup", faster: true }, { press: "Esc", does: "leaves the title as it was" }],
    listens: ["work.rename"],
  },
  Mark: {
    job: "a session's state as one mark at a row's size, colour only where it has consequence: needs you in the jelly's heat, failed the fixed red, running the jelly's working light, done unseen a sign in ink, done nothing",
    flow: "know",
    states: ["running", "needs", "failed", "unread", "done", "none"],
    keys: [],
    listens: ["the row's state (rowState)"],
  },
} satisfies Metas;

const FOLDS = "sol.home.clean.folds";
const HOLD_SHOWN = 4;   // an open folder's tray shows its newest four (hold it: less at rest)
const FIND_W = Math.ceil(textW("back", TYPE.body[0], 500)) + 32;   // the find button: its longer word and the button's own inset
const UNDO_MS = 8000;   // a move by hand can be taken back this long: ⌘Z, or undo in the foot's toast
const SPRING = 600;   // ms a dragged session is held over a folded orchestration row before it opens
const SHOWN = 6;   // a folder shows its newest six; the rest are the wide side's (and ⌘K's)
const readFolds = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(FOLDS) ?? "{}"); } catch { return {}; } };
export const stOf = (w: Work) => (s: WorkSession): St => rowState(s, w.runs[s.id] as RunInfo | undefined);
const SAYS: Record<St, string> = { running: "running", needs: "needs you", failed: "failed", unread: "finished, unseen", done: "done", "": "" };
const HERE: Record<string, string> = { mac: "mac", nucbox: "nucbox" };
/** the wild card's switch: localStorage sol.layer.wild = "1" (read on each draw; a reload sets it in the shots) */
const wildOn = () => { try { return localStorage.getItem("sol.layer.wild") === "1"; } catch { return false; } };
const NONE: WorkSession[] = [];
const GOO = jellyBands(JELLY.warm);   // the goo under a running row: the jelly's warm bands
// handed to the row's ::after as a variable: the goo is the row's own edge, not a part in its line of words
const GOO_VAR = { "--hd-goo": GOO } as CSSProperties;
const MODES: [AppMode, string][] = [["home", "home"], ["cowork", "cowork"]];

/** a session's state as one mark at a row's size (#682): no jelly body, no eyes (taste.md 11-06, the motif is not a
 *  design), colour only where it has consequence (the brief's rule 1). Needs you wears the jelly's heat, the bands the
 *  bar's lit pill wears, drifting; failed the fixed red (the meaning channel); running the jelly's working light (the
 *  halo's working state, close and bright), small and calm; done unseen a check in ink; done nothing (an empty box, so
 *  the words keep their edge). Drawn on a 16 box, `size` scales it. The rail's waiting marks import it. */
export function Mark({ st, size = 16 }: { st: St; size?: number }) {
  const id = useUid();
  if (!st) return <i className="hc-nomark" aria-hidden />;
  const six = JELLY.six, n = six.length, warm = JELLY.warm;
  const draw = st === "needs" ? (<>
      {/* the heat: the six as hard bands on a strip twice the disc's width, drifting under the disc */}
      <defs>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="0">{[...six, ...six].flatMap((c, j) => [<stop key={`a${j}`} offset={j / (2 * n)} stopColor={c} />, <stop key={`b${j}`} offset={(j + 1) / (2 * n)} stopColor={c} />])}</linearGradient>
        <clipPath id={`c${id}`}><circle cx={8} cy={8} r={5} /></clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}><rect className="hc-drift" x={3} y={3} width={20} height={10} fill={`url(#h${id})`} /></g>
    </>)
    : st === "running" ? (<>
      {/* the working light: the warm colours close as light round a small bright core, breathing slowly */}
      <defs>
        <radialGradient id={`w${id}`}>{warm.map((c, j) => <stop key={j} offset={j / (warm.length - 1)} stopColor={c} stopOpacity={1 - j / warm.length} />)}</radialGradient>
      </defs>
      <circle className="hc-breathe" cx={8} cy={8} r={6} fill={`url(#w${id})`} opacity={0.5} />
      <circle cx={8} cy={8} r={2.5} fill={hex(warm[2])} />
    </>)
    : st === "failed" ? <circle cx={8} cy={8} r={4} fill="var(--error, var(--red-strong))" />
    : st === "unread" ? <path d="M4.5 8.4 7 10.8 11.5 5.6" fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    : null;   // done: nothing
  return <svg className={`hc-mark ${st}`} width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={SAYS[st]}><title>{SAYS[st]}</title>{draw}</svg>;
}

/** behind a line of the side: the lift, the kit's Glass with the on colour at 7% (shade.on.flat), no edge, which side.css
 *  shows under the pointer, from the keys or while its menu is open; or, `pearl`, the kit's Pearl at the line's size */
export function Lift({ pearl }: { pearl?: boolean }) {
  const at = useRef<HTMLSpanElement>(null), [w, h] = useSize(at);
  if (!pearl) return <span className="hc-lift" aria-hidden><Glass r={CURVE.radius.row} fill={on(SHADE.on.flat)} edge={0} /></span>;
  return <span ref={at} className="hc-lift pearl" aria-hidden>{w > 0 && h > 0 && <Pearl w={w} h={h} r={CURVE.radius.row} />}</span>;
}

/** the side's widths (the brief: full, squished, narrow). Full: docked at SIDE. Squished: with a pane open, the talk keeps
 *  its room (fit.ts): the pane narrows to its floor, then the side narrows to SIDE_MIN before it lets go. Narrow (under
 *  NARROW): the side folds, soft-opening from the left edge, and the talk and pane take the window. The pin is never
 *  written: a window that grows back docks the side again. */
export const SIDE = 264, SIDE_MIN = 216, NARROW = 900;
export function dock(vw: number, pinned: boolean, want: number[], open: boolean[], floor: number) {
  const any = open.some(Boolean);
  if (vw < NARROW) return { fit: fitRow(vw, SIDE, false, want, open, floor), docked: false, width: SIDE };
  const full = fitRow(vw, SIDE, pinned, want, open, floor);
  if (!pinned || !any || full.docked) return { fit: full, docked: pinned && (!any || full.docked), width: SIDE };
  const slim = fitRow(vw, SIDE_MIN, pinned, want, open, floor);
  if (!slim.docked) return { fit: full, docked: false, width: SIDE };
  const panes = slim.widths.reduce((t, x, i) => t + (open[i] ? x : 0), 0);
  return { fit: slim, docked: true, width: Math.round(Math.max(SIDE_MIN, Math.min(SIDE, vw - panes - TALK))) };
}

const MENU_W = 200, MENU_PAD = 8;   // the card's width and its inset (the bar's pickers' 8)
/** a row's menu: the kit's Card at the pop step holding a List, at the pointer, kept inside the window. ↑↓ Enter Esc
 *  walk it (the List), a click outside closes it */
function RowMenu({ x, y, acts, onClose }: { x: number; y: number; acts: [string, string, () => void][]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const down = (ev: PointerEvent) => { if (!box.current?.contains(ev.target as Node)) onClose(); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose]);
  const items: Item[] = acts.map(([id, title]) => ({ id, title }));
  const h = acts.length * 38 + 2 * MENU_PAD;   // the List's rows (36) and their gap (2)
  const left = Math.max(MENU_PAD, Math.min(x, innerWidth - MENU_W - MENU_PAD)), top = Math.max(MENU_PAD, Math.min(y, innerHeight - h - MENU_PAD));
  return createPortal(
    <div ref={box} className="hc-menu" role="dialog" aria-label="the row's menu" style={{ left, top }} onContextMenu={(ev) => ev.preventDefault()}>
      <Card w={MENU_W} step="pop">
        <div className="hc-menu-in">
          <List w={MENU_W - 2 * MENU_PAD} items={items} lit={lit} onLit={setLit} onClose={onClose} onPick={(k) => { onClose(); acts[k][2](); }} />
        </div>
      </Card>
    </div>, document.body);
}

/** renaming a row in place: its title becomes a field, Enter keeps it, Esc or a click away leaves it as it was */
function Rename({ title, onDone, label = "rename the session" }: { title: string; onDone: (t: string | null) => void; label?: string }) {
  const [v, setV] = useState(title);
  const at = useRef<HTMLInputElement>(null);
  useEffect(() => { at.current?.focus(); at.current?.select(); }, []);
  return <input ref={at} className="hc-rename" value={v} aria-label={label} onChange={(ev) => setV(ev.target.value)} onClick={(ev) => ev.stopPropagation()}
    onBlur={() => onDone(null)} onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); onDone(v); } else if (ev.key === "Escape") { ev.preventDefault(); onDone(null); } }} />;
}

export function Side({ w, width = SIDE, live, wide, onOpen, onBeside, onFresh, onWide, onSettings, onMode, soft, onHover, list, footExtra, stageStore = store }: {
  w: Work; width?: number; live: string | null; wide: boolean; onOpen: (id: string) => void; onBeside: (id: string) => void;
  onFresh: () => void; onWide: (v: boolean) => void; onSettings: () => void; onMode: (m: AppMode) => void;
  soft?: "open" | "closing"; onHover?: (on: boolean) => void;   // folded, soft-opened over the talk (Home.tsx)
  // Home's pass 1 (#692, sol.home.pass1): Home's own places (today, areas, tools) in S4 instead of the sessions, and
  // a row over the gear (Home's settings); the places S1-S3 and S6 stay where they are
  list?: ReactNode; footExtra?: ReactNode;
  stageStore?: StageStore;   // the stage the artifacts are read from: the engine's, or a page's own (side-hold.html)
}) {
  const steadyMem = useRef(new Map<string, string[]>());   // what each tray showed last draw (sideSort steady)
  const st = stOf(w);
  const piecesOn = useBuildPieces();
  const pieceOpen = useOpenPiece();   // a piece in the room takes the pearl from the session row
  // carry (#700): the row a block's head is over lights "carry here"; a row says how many of the blocks here it holds
  // too; this session's row how many blocks it has. The side's names are the stage's ledger's
  const over = useSyncExternalStore(onCarryOver, carryOver);
  const here = useSyncExternalStore(useCallback((f: () => void) => (live ? stageStore.subscribe(live, f) : () => {}), [live, stageStore]), () => (live ? stageStore.read(live) : EMPTY));
  useEffect(() => { setNames(w.sessions); }, [w.sessions]);
  const word = (sid: string) => rowWord(sid, live, here.blocks, over);
  const spine = useSpine();   // with the spine on (sol.spine), the modes row is the spine's; the lamp follows the pointer through the rows
  const lamp = useLamp();
  const [folds, setFolds] = useState(readFolds);
  const [menu, setMenu] = useState<{ x: number; y: number; s: WorkSession } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);   // the row whose title is being renamed, in place
  const [filter, setFilter] = useState<Filter>("all");
  // Build settings › sidebar (sidePrefs.ts): the sort, how long quiet work stays, whether rows move
  const prefs = useSidePrefs();
  const [letOver, setLetOver] = useState(false);   // a child held over its group's let-go strip
  const [kidsOpen, setKidsOpen] = useState<Record<string, boolean>>({});   // the orchestration rows opened
  // a renewal (the engine's, one.ts finishOrch): the fresh copy keeps the old one's open fold, and takes its place in
  // view when he was in it
  const liveRef = useRef(live); liveRef.current = live;
  const handing = useOrchKept((from, to) => {
    setKidsOpen((k) => (k[from] ? { ...k, [to]: true } : k));
    if (liveRef.current === from) onOpen(to);
  });
  const [runOver, setRunOver] = useState<string | null>(null);   // the orchestration row a session is dragged over
  const [refused, setRefused] = useState<{ id: string; why: string; n: number } | null>(null);   // a move refused, said on that row a moment (it shakes once)
  const [dragging, setDragging] = useState<string | null>(null);   // the row being dragged (a drag's data is unread until the drop)
  const [pending, setPending] = useState<Pending>({});   // moves sent, drawn already, not yet in work.sessions
  const [undo, setUndo] = useState<{ m: Extract<Move, { do: "under" }>; words: string; at: number } | null>(null);   // the foot's "moved under X · undo"
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => { if (!undo) return; const h = window.setTimeout(() => setUndo((u) => (u === undo ? null : u)), UNDO_MS); return () => clearTimeout(h); }, [undo]);
  // a broadcast settles the moves it carries; the rest stay drawn as sent, so the old count never shows between
  useEffect(() => { setPending((p) => settle(w.sessions, p)); }, [w.sessions]);
  const ws = withPending(w.sessions, pending);
  const held = useHeld(w.sessions, st, live);
  // hold it (2026-11-11): the quick edit, a drag over a folder, a folder being named, a folder's menu, the artifacts
  const [edit, setEdit] = useState(false);
  const [drop, setDrop] = useState<string | null>(null);
  const [fnaming, setFnaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [fmenu, setFmenu] = useState<{ x: number; y: number; key: string } | null>(null);
  // a folder's "N more" opens every session at that folder (sideAll.tsx); with no foot (Home's own list, the wide side) the wide side
  const [sessAsk, setSessAsk] = useState<{ folder: string | null; at: number } | null>(null);
  const moreAt = (folder: string | null) => (list || wide ? onWide(true) : setSessAsk({ folder, at: Date.now() }));
  const arts = useArtifacts(stageStore, list ? null : live, list ? NONE : w.sessions);
  const titleOf = (id: string) => w.sessions.find((s) => s.id === id)?.title;
  const raise = (id: string) => {
    if (!live) return;
    const seen = stageStore.read(live), z = Math.max(0, ...seen.stage.blocks.map((p) => p.z)) + 1;
    stageStore.place(live, { ...seen.stage, blocks: seen.stage.blocks.map((p) => (p.id === id ? { ...p, folded: false, z } : p)) });
  };
  const self = useRef<HTMLElement>(null);
  useMoves(self, prefs.motion, `${wide ? "wide" : "list"} ${prefs.sort} ${list ? "own" : ""}`);
  const fold = (k: string, open: boolean) => setFolds((f) => { const n = { ...f, [k]: open }; try { localStorage.setItem(FOLDS, JSON.stringify(n)); } catch { /* private */ } return n; });
  const isOpen = (k: string) => !folds[k];
  // a row's menu (the kit's Card and List, as the bar's pickers): open beside, rename, pin, archive
  const rowMenu = (ev: React.MouseEvent, s: WorkSession) => { ev.preventDefault(); setMenu({ x: ev.clientX, y: ev.clientY, s }); };
  const acts = (s: WorkSession): [string, string, () => void][] => [
    ["beside", "open beside", () => onBeside(s.id)],
    ["rename", "rename", () => setNaming(s.id)],
    ["pin", s.pinned ? "unpin" : "pin", () => w.mark(s.id, { pinned: !s.pinned })],
    // two kinds of session (2026-11-14, the design's §2): a normal row is promoted; an orchestration row is demoted and
    // its sessions go loose; every orchestration row is renewed or demoted by hand
    ...(s.kind === "orchestration"
      ? [["renew", "fresh copy now", () => renewNow(s.id)] as [string, string, () => void], ["kind", "demote", () => w.kind(s.id, null)] as [string, string, () => void]]
      : s.archived ? [] : [["kind", "promote to orchestration", () => w.kind(s.id, "orchestration")] as [string, string, () => void]]),
    ["archive", s.archived ? "bring it back" : "archive", () => w.mark(s.id, { archived: !s.archived })],
    // the orchestrator lets it go (2026-11-14): a row of its own again; its `parent` (who started it) stays
    // moving by hand (step 3b): the keys' two moves, named with their keys; each undoes as a drop does
    ...((to) => (to ? [["under", `put under ${titleOf(to) || "untitled"} ⌘↓`, () => send(keyMove(ws, drawn(), s.id, "down"))] as [string, string, () => void]] : []))(aboveOf(ws, drawn(), s.id)),
    ...(s.under ? [["release", "release ⌘↑", () => send(keyMove(ws, drawn(), s.id, "up"))] as [string, string, () => void]] : []),
  ];
  // moving sessions by hand (design 2026-11-14 §2, step 3b; sideUnder.ts says what each gesture means, side-moves.md
  // what Marco sees). Every drop and press is one work.under; it is drawn at once (pending), undone by ⌘Z or the
  // foot's toast for UNDO_MS, and a refusal shakes the row once with the reason as its title. The summary turn the
  // orchestrator receives on a join is the engine's (one.ts joined)
  const refuse = (id: string, why: string) => {
    setRefused(null);   // a second refusal on the same row shakes it again: the class comes off for one frame
    const n = Date.now();
    requestAnimationFrame(() => setRefused({ id, why, n }));
    window.setTimeout(() => setRefused((v) => (v?.n === n ? null : v)), dur("breath"));   // one breath, then the row is as it was
  };
  const send = (m: Move, undoable = true) => {
    if (m.do === "refused") return refuse(m.on, m.why);
    if (m.do !== "under") return;
    setPending((p) => ({ ...p, [m.sessionId]: m.under }));
    if (undoable) setUndo({ m, words: moveWords(ws, m), at: Date.now() });
    void w.under(m.sessionId, m.under, m.undo).then((r) => {
      if (!r?.error) return;
      setPending((p) => refusedBack(p, null, m).pending);
      setUndo((u) => refusedBack({}, u, m).undo);
      refuse(m.under ?? m.sessionId, r.error);
    });
  };
  const undoNow = () => { const u = undoRef.current; if (!u) return; setUndo(null); send(undoOf(u.m), false); };
  // the side's rows as drawn, top to bottom (⌘↓ reads the nearest orchestration row above)
  const drawn = () => [...(self.current?.querySelectorAll<HTMLElement>(".hc-list [data-sid]") ?? [])].map((e) => e.dataset.sid!);
  // the keys are the side's only while it is seen (docked, or soft and open: never while it slides away in the talk-alone
  // layout) and a row is picked (no piece open); ⌘Z only while the pointer or the focus is in the side
  const shown = !soft || soft === "open";
  const inSide = () => { const el = self.current; return !!el && (el.matches(":hover") || el.contains(document.activeElement)); };
  const keyRef = useRef({ live, ws, drawn, send, undoNow, shown, pieceOpen, inSide });
  keyRef.current = { live, ws, drawn, send, undoNow, shown, pieceOpen, inSide };
  useEffect(() => {
    // ⌘↓ under the nearest orchestration row above, ⌘↑ let go: on the picked row, not while a field has the keys.
    // ⌘Z, while the foot's toast is up and the pointer or focus is in the side, takes the last move back (caught first,
    // so the stage's ⌘Z does not also run); anywhere else ⌘Z stays the stage's
    const key = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.isComposing) return;
      const k = keyRef.current, typing = (document.activeElement as HTMLElement | null)?.matches("input, textarea, [contenteditable], [contenteditable] *");
      if (ev.key.toLowerCase() === "z" && !ev.shiftKey && undoRef.current && !typing && k.inSide()) { ev.preventDefault(); ev.stopPropagation(); k.undoNow(); return; }
      if ((ev.key !== "ArrowDown" && ev.key !== "ArrowUp") || ev.shiftKey || typing || !k.live || !k.shown || k.pieceOpen) return;
      ev.preventDefault(); ev.stopPropagation();
      k.send(keyMove(k.ws, k.drawn(), k.live, ev.key === "ArrowDown" ? "down" : "up"));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  // a drop on a row: sideUnder's dropMove says what it is; one it passes (a loose row on a loose row) goes on to the
  // tray, which files it in that folder as before. An orchestration row it would go under lights "carry here"
  // spring-open (the Finder's): a folded orchestration row held under a dragged session for SPRING ms opens its fold
  const springRef = useRef<{ id: string; t: ReturnType<typeof setTimeout> } | null>(null);
  const unspring = (id?: string) => { const c = springRef.current; if (c && (!id || c.id === id)) { clearTimeout(c.t); springRef.current = null; } };
  const spring = (id: string) => {
    if (springRef.current?.id === id) return;
    unspring();
    springRef.current = { id, t: setTimeout(() => { springRef.current = null; setKidsOpen((k) => ({ ...k, [id]: true })); }, SPRING) };
  };
  const moveDrop = (s: WorkSession) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (!dragging || !ev.dataTransfer.types.includes("text/sol-session")) return;
      const m = dropMove(ws, dragging, { on: s.id });
      if (m.do === "pass") return;
      ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = "copy";
      // the row it goes under lights: this one, or (over a child of another orchestrator) that child's head, so the
      // target is seen before the drop
      const lit = m.do === "under" && m.under && (m.under === s.id || m.under === headOf(ws, s.id)) ? m.under : null;
      if (runOver !== lit) setRunOver(lit);
      if (s.kind === "orchestration" && !kidsOpen[s.id]) spring(s.id);
    },
    onDragLeave: (ev: React.DragEvent) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) { setRunOver((v) => (v === s.id || v === headOf(ws, s.id) ? null : v)); unspring(s.id); } },
    onDrop: (ev: React.DragEvent) => {
      unspring();
      const sid = ev.dataTransfer.getData("text/sol-session");
      if (!sid) return;
      const m = dropMove(ws, sid, { on: s.id });
      if (m.do === "pass") return;
      ev.preventDefault(); ev.stopPropagation(); setRunOver(null); setDragging(null);   // not the folder's drop too
      send(m);
    },
  });
  // the empty room of an orchestration row's group: a child of its own lets go here; any other goes under its head
  const groupDrop = (head: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (!dragging || !ev.dataTransfer.types.includes("text/sol-session") || dropMove(ws, dragging, { group: head }).do === "pass") return;
      ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = "copy";
    },
    onDrop: (ev: React.DragEvent) => {
      const sid = ev.dataTransfer.getData("text/sol-session");
      if (!sid) return;
      ev.preventDefault(); ev.stopPropagation(); setRunOver(null); setDragging(null);
      send(dropMove(ws, sid, { group: head }));
    },
  });
  // orch: an orchestration row's fold (its arrow, and "n under, k need you" where the time was)
  const row = (s: WorkSession, o: { cols?: boolean; st?: St; where?: boolean; kid?: boolean; sec?: string; hold?: boolean; orch?: { kids: St[]; open: boolean; fold: () => void } } = {}) => {
    const picked = s.id === live && !pieceOpen, cols = !!o.cols, s0 = o.st ?? st(s), since = (w.runs[s.id] as RunInfo | undefined)?.since;
    return (
      <div key={s.id} role="button" tabIndex={-1} data-thing data-kind="session" data-sid={s.id} data-sec={o.sec} className={`hc-row${o.kid ? " hc-kid" : ""}${s.kind === "orchestration" ? " hc-orch" : ""}${picked ? " on" : ""}${s.archived ? " gone" : ""}${menu?.s.id === s.id || naming === s.id ? " held" : ""}${over === s.id || runOver === s.id ? " carry" : ""}${refused?.id === s.id ? " hc-shake" : ""}${dragging && s.kind === "orchestration" && runOver !== s.id && dropMove(ws, dragging, { on: s.id }).do === "under" ? " hc-can" : ""}${o.hold && s0 ? ` hd-${s0}` : ""}${o.hold && s0 === "running" && st(s) === "running" ? " hd-goes" : ""}`}
        style={o.hold && s0 === "running" && st(s) === "running" ? GOO_VAR : undefined}
        draggable onDragStart={(ev) => { ev.dataTransfer.setData("text/sol-session", s.id); ev.dataTransfer.effectAllowed = "copy"; setDragging(s.id); }} onDragEnd={() => { setDragging(null); setRunOver(null); unspring(); }} {...moveDrop(s)}
        title={refused?.id === s.id ? refused.why : undefined}
        onClick={(ev) => (naming === s.id ? undefined : ev.metaKey ? onBeside(s.id) : onOpen(s.id))} onContextMenu={(ev) => rowMenu(ev, s)}>
        <Lift key={picked ? "pearl" : "lift"} pearl={picked} />
        {/* an orchestration row's fold is its mark (Marco 2026-11-14: the end arrow sat under the pin): the state mark
            at rest, the arrow under the pointer and while open; its press area is the row's whole left end */}
        {o.orch && !cols
          ? <span role="button" className={`hc-mk hc-fold${o.orch.open ? " open" : ""}`} aria-label={o.orch.open ? "fold" : "open"} aria-expanded={o.orch.open} title={o.orch.open ? "fold" : "show the sessions it runs"}
              onClick={(ev) => { ev.stopPropagation(); o.orch!.fold(); }}>{!o.hold && <Mark st={s0} />}<span className="hc-caret" aria-hidden /></span>
          : !o.hold && <span className="hc-mk"><Mark st={s0} /></span>}
        {naming === s.id
          ? <Rename title={s.title} onDone={(t) => { setNaming(null); if (t !== null && t.trim() && t.trim() !== s.title) w.rename(s.id, t.trim()); }} />
          : <span className="hc-tt" title={s.title}>{s.title || "untitled"}</span>}<MomentDot sessionId={s.id} />
        {cols && <span className="hc-c">{base(folderOf(s)) || "home"}</span>}
        {cols && <span className="hc-c">{HERE[s.machine ?? "mac"] ?? s.machine}</span>}
        {!cols && word(s.id) && (!o.hold || over === s.id) ? <span className="hc-when hc-carried">{word(s.id)}</span>
          : !cols && runOver === s.id ? <span className="hc-when hc-carried">carry here</span>
          : !cols && refused?.id === s.id ? <span className="hc-when hc-carried hc-refused" title={refused.why}>{refused.why}</span>
          // an orchestration row's count lives in its words, and they fold it as its arrow does; in a hold tray, while it
          // runs or asks you, it says that instead (orchSays), as its tray's other rows do
          : o.orch && orchSays(!!o.hold, s0) === "under" ? <span role="button" className={`hc-when${o.orch.kids.length ? "" : " hc-quiet"}`} aria-expanded={o.orch.open} onClick={(ev) => { ev.stopPropagation(); o.orch!.fold(); }}>{handing.has(s.id) ? "handing over" : underWords(o.orch.kids)}</span>
          // hold it: the state is one word where the time was; a running row says how long it has run
          : o.hold && s0 === "needs" ? <span className="hc-when hd-said hd-asks">asks you</span>
          : o.hold && s0 === "running" ? <time className="hc-when hd-said">{since && !o.orch ? when(since) : "running"}</time>
          : o.hold && s0 === "unread" ? <span className="hc-when hd-said">finished</span>
          : o.hold && s0 === "failed" ? <span className="hc-when hd-said">failed</span>
          : o.where ? <span className="hc-when hc-rowwhere" title={`${folderOf(s)} · ${when(s.updatedAt)}`}>{base(folderOf(s)) || "home"}</span>
          : <time className="hc-when">{when(s.updatedAt)}</time>}
        {/* the pin, under the pointer: one press keeps the row on the side or lets it go */}
        {o.sec && (!o.kid || s.pinned) && !o.orch && naming !== s.id && <span role="button" className={`hc-pin${s.pinned ? " on" : ""}`} aria-label={s.pinned ? "unpin" : "pin"} title={s.pinned ? "unpin" : "pin"}
          onClick={(ev) => { ev.stopPropagation(); w.mark(s.id, { pinned: !s.pinned }); }}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M6 2.5h4l-.5 3.8 2 2.2h-7l2-2.2zM8 8.5v5" fill={s.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" /></svg>
        </span>}
      </div>
    );
  };
  const top = (
    <div className="hc-sidetop">
      {/* S1 the modes: the words themselves, the one you are in in ink (no pill, no pearl: the pearl is the picked row's) */}
      {!spine && <div className="hc-modes" role="group" aria-label="mode">
        {MODES.map(([m, name]) => (
          <button key={m} type="button" tabIndex={-1} data-mode={m} className={`hc-mode${m === "home" ? " on" : ""}`} aria-pressed={m === "home"} onClick={() => m !== "home" && onMode(m)}>
            {name}{m !== "home" && <Lift />}
          </button>
        ))}
      </div>}
      {/* S2 new, S3 find */}
      {/* hold it: the kit's buttons, things to press; the keys (⌘N, ⌘K the Jump) are in their tips */}
      <div className="hd-top">
        <div role="button" tabIndex={-1} data-thing data-kind="head" data-new title="a new session (⌘N)" onClick={onFresh}><Button h={32} w={(wide ? SIDE : width) - 16 - (wide ? FIND_W + 8 : 0)}>new session</Button></div>
        {/* find gave its place to the foot's sessions tray (sideAll.tsx); the wide side keeps its way back */}
        {wide && <div role="button" tabIndex={-1} data-thing data-kind="head" data-find title="back to the side" onClick={() => onWide(false)}><Button h={32} w={FIND_W}>back</Button></div>}
      </div>
    </div>
  );
  const foot = (
    <div className="hc-sidefoot">
      {footExtra}
      {/* hold it: what was made, as things (sideArts.tsx); then one row: the one session's door, edit, settings */}
      {!list && !wide && <ArtsFoot arts={arts} acts={{ titleOf, onOpen, raise, bring: live ? (id) => stageStore.pull(live, id, "you") : undefined }} />}
      {!list && !wide && <SessFoot sessions={w.sessions} live={live} arts={arts} ask={sessAsk} acts={{
        st: st as never, nameOf: (k) => prefs.names[k] ?? (k === "~" ? "home" : base(k)), onOpen, mark: (s0) => <Mark st={s0} />,
        since: (id) => (w.runs[id] as RunInfo | undefined)?.since || undefined,
        // a session read in the card: its thread when the window holds it, else peeked for as long as it is read
        items: (id) => w.threads[id]?.items, look: (id) => { if (w.threads[id]) return () => {}; w.peek(id); return () => w.unpeek(id); },
      }} />}
      {/* one line: "moved under X · undo", undo the word to press */}
      {undo && <div className="hc-undo" role="status"><span className="hc-undo-w">{undo.words} · <button type="button" className="hc-undo-b" tabIndex={-1} title="take it back (⌘Z)" onClick={undoNow}>undo</button></span></div>}
      <div className="hd-foot">
        {!list && !wide && prefs.sort === "needs" && <button type="button" className={`hd-word${edit ? " on" : ""}`} data-thing data-kind="head" data-edit aria-pressed={edit} title="arrange the folders: drag, rename, hide, add" onClick={() => setEdit((v) => !v)} tabIndex={-1}>{edit ? "done" : "edit"}<Lift /></button>}
        <button type="button" className="hd-word" data-thing data-kind="head" data-settings title={spine ? "build settings" : "settings"} onClick={onSettings} tabIndex={-1}>settings<Lift /></button>
      </div>
    </div>
  );
  // the side's own glass: the one black a step deeper (side), the pop step when it floats over the talk; no edge
  // out of every group (the let-go strip): a child lets go
  const outDrop = {
    onDragOver: (ev: React.DragEvent) => {
      if (!dragging || dropMove(ws, dragging, { out: true }).do !== "under") return;
      ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = "copy"; if (!letOver) setLetOver(true);
    },
    onDragLeave: () => setLetOver(false),
    onDrop: (ev: React.DragEvent) => {
      const sid = ev.dataTransfer.getData("text/sol-session");
      if (!sid) return;
      ev.preventDefault(); ev.stopPropagation(); setLetOver(false); setRunOver(null); setDragging(null); unspring();
      send(dropMove(ws, sid, { out: true }));
    },
  };
  const glass = <Glass r={CURVE.radius.card} step={soft ? "pop" : "side"} edge={0} blur={soft ? SHADE.blur : undefined} />;

  // one line: a row, and when it is an orchestration row, its fold (the arrow, its count in its words where the time
  // was) and the sessions it runs under it. Folded, one that needs you still shows (never folded away)
  const line = (l: Line<WorkSession>, sec: string | undefined, where: boolean, hold = false, cols = false) => {
    const orch = l.row.kind === "orchestration", open = !!kidsOpen[l.row.id];
    const shown = open ? l.kids : l.kids.filter((k) => st(k) === "needs");
    return (
      <div key={l.row.id} className={`hc-line${orch && open ? " hc-room" : ""}`} {...(orch ? groupDrop(l.row.id) : {})}>
        {/* dragging one of its own children: a strip of its own above the group's top says where to let it go (the quiet
            words, on a hairline); an open fold keeps a room under its last child, a drop there lands in the group */}
        {orch && dragging && dragging !== l.row.id && headOf(ws, dragging) === l.row.id && <span className={`hc-letgo${letOver ? " over" : ""}`} aria-hidden {...outDrop}>drop here to let go</span>}
        {row(l.row, { st: l.st, where, sec, hold, cols, ...(orch ? { orch: { kids: l.kids.map(st), open, fold: () => setKidsOpen((k) => ({ ...k, [l.row.id]: !open })) } } : {}) })}
        {shown.map((k) => row(k, { kid: true, sec, hold, cols }))}
      </div>
    );
  };
  if (wide) {
    const rows = wideOf(ws, st, filter).slice(0, 400);
    const F: [Filter, string][] = [["all", "all"], ["running", "running"], ["needs", "needs you"], ["done", "done"]];
    return (
      <aside ref={self} data-place="side" tabIndex={-1} className="hc-side wide">
        {glass}
        {top}
        <div tabIndex={-1} data-thing data-kind="card" className="hc-filters">
          {F.map(([k, l]) => <button key={k} tabIndex={-1} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}<Lift /></button>)}
        </div>
        <div className="hc-cols"><span>session</span><span>folder</span><span>machine</span><span>when</span></div>
        <div className="hc-list">{foldUnder(rows, st, Date.now(), ws.filter((s) => !s.archived && !s.gone)).map((l) => line(l, undefined, false, false, true))}</div>
        {foot}
        {menu && <RowMenu x={menu.x} y={menu.y} acts={acts(menu.s)} onClose={() => setMenu(null)} />}
      </aside>
    );
  }

  // the sessions an orchestration row runs fold under it in this sort too (sideSort foldUnder): they leave their folder
  const listed0 = sideOf(ws, st);
  const narrow = foldUnder([...listed0.folders.flatMap((f) => f.rows), ...listed0.doneToday], st, Date.now(), ws.filter((s) => !s.archived && !s.gone));
  const folded = new Map(narrow.map((l) => [l.row.id, l]));
  const lineOf = (s: WorkSession): Line<WorkSession> => folded.get(s.id) ?? { row: s, st: st(s), kids: [] };
  const listed = { folders: listed0.folders.map((f) => ({ ...f, rows: f.rows.filter((r) => folded.has(r.id)) })).filter((f) => f.rows.length), doneToday: listed0.doneToday.filter((r) => folded.has(r.id)) };
  // the wild card (#682 pass 1, behind sol.layer.wild = "1"): needs you rises. A session that waits on you leaves its
  // folder for one shelf at the top of the list, its head in the jelly's heat; answered, its state moves on and it is
  // back in its folder on the next draw. Off, the side is as it is.
  const shelf = wildOn() ? listed.folders.flatMap((f) => f.rows.filter((r) => st(r) === "needs")) : [];
  const risen = new Set(shelf.map((r) => r.id));
  const folders = risen.size ? listed.folders.map((f) => ({ ...f, rows: f.rows.filter((r) => !risen.has(r.id)) })).filter((f) => f.rows.length) : listed.folders;
  const doneToday = listed.doneToday;
  const group = (key: string, name: string, rows: WorkSession[], heat = false) => {
    const open = isOpen(key);
    return (
      <div key={key} className={`hc-folder${heat ? " hc-shelf" : ""}`}>
        <div role="button" tabIndex={-1} data-thing data-kind="folder" data-open={open ? "1" : undefined} data-fold={key} className="hc-fhead" onClick={() => fold(key, open)}>
          <span className={`hc-caret ${open ? "open" : ""}`} aria-hidden /><span className="hc-fname">{name}</span><span className="hc-n">{rows.length}</span><Lift />
        </div>
        {open && !heat && key.startsWith("/") && <FolderPieces cwd={key} live={live} lift={(p) => <Lift pearl={p} />} />}
        {open && rows.slice(0, SHOWN).map((s) => line(lineOf(s), undefined, false))}
        {open && rows.length > SHOWN && <div role="button" tabIndex={-1} data-thing data-kind="head" className="hc-head hc-more" onClick={() => moreAt(heat ? null : key)}><span>{rows.length - SHOWN} more</span><Lift /></div>}
      </div>
    );
  };
  // sorted by what a session asks of you (sideSort.ts; Build settings › sidebar › sort): needs you, pinned, running,
  // then each project's recent work, and one fold of earlier. A session an orchestration session runs sits under it.
  const byNeed = prefs.sort === "needs" && !list;
  const homes = new Set((w.projects as (typeof w.projects[number] & Partial<Placed>)[]).filter((p) => !isBuild(p as Placed)).map((p) => p.path));
  // each tray keeps its order between draws (steadySide): a busy session never swaps places with its neighbours
  const sorted = byNeed ? steadySide(steadyMem.current, sortSide(ws, st, { stay: prefs.stay, isHome: (s) => homes.has(s.project), held: (s) => held.has(s.id) })) : null;
  // ── hold it (2026-11-11): the sorted side as trays. A section or a folder is one tray of glass; what is put away is a
  // chip at the list's end. A folder's tray is open when you are in it or you opened it; needs you, active and pinned
  // are open until put away. Folders are the person's: their order, their names and the hidden ones are sidePrefs'.
  const rank = (k: string) => { const i = prefs.order.indexOf(k); return i < 0 ? 1e6 : i; };
  const found = sorted?.projects ?? [];
  const more = edit ? (w.projects as (typeof w.projects[number] & Partial<Placed>)[]).filter((p) => isBuild(p as Placed)).map((p) => p.path) : [];
  const empty = [...new Set([...prefs.extra, ...more])].filter((k) => !found.some((p) => p.key === k)).map((k) => ({ key: k, name: base(k), lines: [] as Line<WorkSession>[], at: 0 }));
  const ordered = [...found, ...empty].sort((a, b) => rank(a.key) - rank(b.key));   // a stable sort: unranked folders keep steadySide's order
  const fname = (p: { key: string; name: string }) => prefs.names[p.key] ?? p.name;
  const folders3 = ordered.filter((p) => !prefs.hidden.includes(p.key)), hiddenF = ordered.filter((p) => prefs.hidden.includes(p.key));
  const keys3 = folders3.map((p) => p.key);
  const knownNow = sorted ? [...ordered.map((p) => ({ key: p.key, name: fname(p), n: p.lines.length })), ...prefs.hidden.filter((k) => !ordered.some((p) => p.key === k)).map((k) => ({ key: k, name: prefs.names[k] ?? base(k), n: 0 }))] : null;
  if (knownNow) queueMicrotask(() => setKnown(knownNow));   // after this draw: Build settings › sidebar lists them
  const holdsLive = (lines: Line<WorkSession>[]) => !!live && lines.some((l) => l.row.id === live || l.kids.some((k) => k.id === live));
  const newHere = (key: string) => { onFresh(); w.fresh(key); };
  const dropOn = (key: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      const t = ev.dataTransfer.types, ses = t.includes("text/sol-session");
      if (!ses && !t.includes("text/sol-folder")) return;
      ev.preventDefault(); ev.dataTransfer.dropEffect = ses ? "copy" : "move";
      if (drop !== key) setDrop(key);
    },
    onDragLeave: (ev: React.DragEvent) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDrop((d) => (d === key ? null : d)); },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault(); setDrop(null);
      const sid = ev.dataTransfer.getData("text/sol-session"), fk = ev.dataTransfer.getData("text/sol-folder");
      if (sid) {
        const m = dropMove(ws, sid, { out: true }), s = ws.find((x) => x.id === sid);
        if (m.do === "under") send(m);
        if (!s || folderOf(s) !== key) w.mark(sid, { folder: key });
      } else if (fk && fk !== key) folderEdit.move(keys3, fk, key);
    },
  });
  const dragF = (key: string) => ({ draggable: true, onDragStart: (ev: React.DragEvent) => { ev.dataTransfer.setData("text/sol-folder", key); ev.dataTransfer.effectAllowed = "move"; } });
  const renameF = (p: { key: string; name: string }) => <Rename title={fname(p)} label="name the folder" onDone={(t) => { setFnaming(null); if (t !== null) folderEdit.name(p.key, t.trim() === p.name ? "" : t); }} />;
  const facts = (key: string): [string, string, () => void][] => [
    ["new", "new session here", () => newHere(key)],
    ["rename", "rename", () => setFnaming(key)],
    ["hide", "hide", () => folderEdit.hide(key)],
    ["away", "put away", () => fold(key, true)],
  ];
  const tray = (key: string, name: string, lines: Line<WorkSession>[], o: { heat?: boolean; where?: boolean; cap?: number; folder?: { key: string; name: string } } = {}) => {
    const cap = o.cap ?? lines.length, over3 = drop === key;
    return (
      <div key={key} className={`hd-tray${o.heat ? " hc-shelf" : ""}${over3 ? " drop" : ""}`} data-section={key} {...(o.folder ? dropOn(key) : {})}>
        <Glass r={CURVE.radius.block} step={over3 ? "box" : "card"} surface={o.heat ? "raised" : undefined} />
        <div role="button" tabIndex={-1} data-thing data-kind="folder" data-open="1" data-fold={key} className={`hc-fhead${fnaming === key || fmenu?.key === key ? " held" : ""}`} title="put this tray away"
          {...(o.folder ? dragF(key) : {})} onClick={() => fnaming !== key && fold(key, true)}
          onContextMenu={o.folder ? (ev) => { ev.preventDefault(); setFmenu({ x: ev.clientX, y: ev.clientY, key }); } : undefined}>
          {o.folder && fnaming === key ? renameF(o.folder) : <span className="hc-fname">{name}</span>}
          <span className="hc-n">{over3 ? "drop here" : lines.length || ""}</span>
          {o.folder && fnaming !== key && !over3 && <span role="button" className="hd-plus" aria-label="new session here" title="new session here" onClick={(ev) => { ev.stopPropagation(); newHere(key); }} />}
          <Lift />
        </div>
        {o.folder && key.startsWith("/") && <FolderPieces cwd={key} live={live} lift={(p) => <Lift pearl={p} />} />}
        {lines.slice(0, cap).map((l) => line(l, key, !!o.where, true))}
        {lines.length > cap && <div role="button" tabIndex={-1} data-thing data-kind="head" className="hc-head hc-more" onClick={() => moreAt(o.folder?.key ?? null)}><span>{lines.length - cap} more</span><Lift /></div>}
      </div>
    );
  };
  const chip = (key: string, name: string, n: number, folder: boolean) => (
    <button key={key} type="button" tabIndex={-1} data-thing data-kind="folder" data-fold={key} className={`hd-chip${drop === key ? " drop" : ""}`} title={`open ${name}`} onClick={() => fold(key, false)}
      {...(folder ? { ...dropOn(key), ...dragF(key) } : {})}>
      <Glass r={CURVE.radius.row} step={drop === key ? "box" : "card"} />
      <span className="hd-chipn">{name}</span>
      {/* the count ends the chip's one line of words (drawn by side.css from data-n), not a start of its own */}
      <span className="hc-n" data-n={drop === key ? undefined : n || ""}>{drop === key ? "drop here" : null}</span>
    </button>
  );
  const holdList = () => {
    if (!sorted) return null;
    const hereS = live ? w.sessions.find((x) => x.id === live) : undefined, hereF = hereS ? folderOf(hereS) : null;
    const secs: [string, string, Line<WorkSession>[], boolean][] = [["needs", "needs you", sorted.needs, true], ["pinned", "pinned", sorted.pinned, false], ["running", "active", sorted.running, false]];
    const openF = (p: { key: string; lines: Line<WorkSession>[] }) => folds[p.key] === false || (holdsLive(p.lines) && folds[p.key] !== true);
    const earlierOpen = folds.earlier === false;
    const away: ReactNode[] = [
      ...secs.filter(([k, , ls]) => ls.length && !isOpen(k)).map(([k, n, ls]) => chip(k, n, ls.length, false)),
      ...(edit ? [] : folders3.filter((p) => !openF(p)).map((p) => chip(p.key, fname(p), p.lines.length, true))),
      ...(sorted.earlier.length && !earlierOpen ? [chip("earlier", "earlier", sorted.earlier.length, false)] : []),
    ];
    const home = keys3.map((k) => /^\/(Users|home)\/[^/]+/.exec(k)?.[0]).find(Boolean) ?? "";
    return (
      <div className="hc-list">
        {secs.map(([k, n, ls, heat]) => ls.length > 0 && isOpen(k) && tray(k, n, ls, { heat, where: true }))}
        {!edit && folders3.filter(openF).map((p) => tray(p.key, fname(p), p.lines, { cap: HOLD_SHOWN, folder: p }))}
        {/* #1092: the folder you are in keeps its tray for its pieces, even when its sessions are all earlier ones */}
        {!edit && piecesOn && hereF && hereF.startsWith("/") && !folders3.some((p) => p.key === hereF && openF(p)) && tray(hereF, prefs.names[hereF] ?? base(hereF), [], { folder: { key: hereF, name: base(hereF) } })}
        {edit && <div className="hd-edit" data-section="edit">
          <div className="hd-elab">folders: drag to order, drag a session onto one</div>
          {folders3.map((p) => (
            <div key={p.key} className={`hd-erow${drop === p.key ? " drop" : ""}`} data-efolder={p.key} {...dragF(p.key)} {...dropOn(p.key)} title={p.key}>
              <Glass r={CURVE.radius.row} step={drop === p.key ? "box" : "card"} />
              {fnaming === p.key ? renameF(p) : <span className="hc-fname" title="rename" onClick={() => setFnaming(p.key)}>{fname(p)}</span>}
              <span className="hc-n">{drop === p.key ? "drop here" : p.lines.length || ""}</span>
              <button type="button" className="hd-word" tabIndex={-1} onClick={() => folderEdit.hide(p.key)}>hide<Lift /></button>
            </div>
          ))}
          {adding
            ? <div className="hd-erow"><Glass r={CURVE.radius.row} step="box" /><input className="hc-rename" autoFocus placeholder="a folder's path: ~/…" aria-label="a folder's path"
                onBlur={() => setAdding(false)} onKeyDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.key === "Escape") setAdding(false);
                  if (ev.key !== "Enter") return;
                  const v = ev.currentTarget.value.trim().replace(/\/+$/, ""), path = v.startsWith("~") && home ? home + v.slice(1) : v;
                  if (path.startsWith("/")) { w.folder("add", path); folderEdit.add(path); }
                  setAdding(false);
                }} /></div>
            : <div role="button" tabIndex={-1} data-thing data-kind="head" className="hd-erow hd-new" onClick={() => setAdding(true)}><Glass r={CURVE.radius.row} step="side" /><span className="hc-fname">+ folder</span></div>}
          {hiddenF.length > 0 && <div className="hd-elab">hidden</div>}
          {hiddenF.map((p) => (
            <div key={p.key} className="hd-erow gone" title={p.key}>
              <span className="hc-fname">{fname(p)}</span>
              <button type="button" className="hd-word" tabIndex={-1} onClick={() => folderEdit.hide(p.key, false)}>show<Lift /></button>
            </div>
          ))}
        </div>}
        {earlierOpen && sorted.earlier.length > 0 && tray("earlier", "earlier", sorted.earlier, { where: true, cap: SHOWN })}
        {nothing && <p className="hc-empty">{w.loaded ? "nothing waits on you, nothing runs: ⌘N starts a session" : "reading the sessions…"}</p>}
        {away.length > 0 && <div className="hd-chips" data-section="away">{away}</div>}
      </div>
    );
  };
  const nothing = sorted && !sorted.needs.length && !sorted.pinned.length && !sorted.running.length && !sorted.projects.length && !sorted.earlier.length;
  return (
    <aside ref={self} data-place="side" tabIndex={-1} className={`hc-side ${sorted ? "hold " : ""}${soft ? `soft ${soft}` : ""}`} style={{ ["--hc-side" as string]: `${width}px` }}
      onMouseEnter={soft && onHover ? () => onHover(true) : undefined} onMouseLeave={soft && onHover ? () => onHover(false) : undefined}>
      {glass}
      {top}
      {/* stage: joins lens (#701): the lens pill at the top of the side */}
      {live && !oneLens() && <LensPill store={stageStore} session={live} />}
      {/* S4 the list */}
      {list ? <div className="hc-list">{list}</div> : sorted ? holdList()
      : <><div className="hc-list" onPointerMove={lamp.move} onPointerLeave={lamp.leave}>
        <div ref={lamp.ref} className="hc-lamp" aria-hidden />
        {shelf.length > 0 && group("needs-you", "needs you", shelf, true)}
        {folders.map((f) => group(f.key, f.name, f.rows))}
        {!folders.length && !doneToday.length && <p className="hc-empty">{w.loaded ? "no sessions this week: ⌘N starts one" : "reading the sessions…"}</p>}
        {live && <BlocksHere store={store} session={live} titleOf={(id) => w.sessions.find((s) => s.id === id)?.title} />}
      </div>
      {/* S5 done today, its own place over the foot */}
      {doneToday.length > 0 && <div className="hc-done">{group("done-today", "done today", doneToday)}</div>}</>}
      {foot}
      {menu && <RowMenu x={menu.x} y={menu.y} acts={acts(menu.s)} onClose={() => setMenu(null)} />}
      {fmenu && <RowMenu x={fmenu.x} y={fmenu.y} acts={facts(fmenu.key)} onClose={() => setFmenu(null)} />}
    </aside>
  );
}

// The clean Home (#589, Marco's yes 2026-11-02: ~/computer/scratch/sol/atlas-today/home-ux.html). Behind the switch
// (flag.ts); today's Home (work/WorkApp.tsx) runs while it is off. Built from the parts that won their job (jobs.html):
// Mark, the droplets, the eyes, the one talk (WorkTalk and its cards), the one bar (Composer), the pane frame, one menu.
//   Three places side by side, nothing opens as a page that hides where you were: the side (where), the talk (now),
//   the pane (beside: a page, or a second session). Five layouts: side + talk, talk alone, side + talk + pane,
//   talk + big pane, the side opened wide. The side is reached three ways: the arrows, the cursor at the window's left
//   edge (it soft-opens over the talk), the corner button (it folds for good). Settings is a sheet over Home, opened
//   from the side's settings row or ⌘K. ⌘N a new session, ⌘K jump by name, and nothing else is a shortcut; the rest
//   is the arrows, Enter and Esc (keys.ts). The look is a placeholder: black, white, pearl.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Leave } from "../spine/settings";   // #1029: how the sheet was left
import type { useEngine } from "../useEngine";
import type { AppMode } from "../ModeSwitch";
import { useWork, scoped, working as isWorking } from "../work/useWork";
import { WorkTalk } from "../work/WorkTalk";
import { ran, setRunner } from "../run";
import { Composer, type Draft } from "../work/Composer";
import { useCross } from "../cross/flag";   // #1031: Home and Build, one place
import { PaneFrame, PANE_FLOOR, heldFrac } from "../work/Panes";
import { useWidth } from "../fit";
import { pagesOf } from "../work/pages";
import { StageColumn } from "../stage/StageColumn";
import { Wall } from "../screens/Wall";   // #1090: a wall window draws the blocks alone
import { PieceRoom } from "../folderPieces/PieceRoom";   // #1092: a piece open in the room
import { closePiece, pieceLine, useOpenPiece } from "../folderPieces/open";
import { usePieces } from "../folderPieces/usePieces";
import { useBuildPieces } from "../folderPieces/flag";
import { useCrowded } from "../stage/bar";
import { TALK_WHOLE } from "../stage/model";
import { FOOT } from "../kit/feel";
import { stageWhole } from "../flag";
import { setNames } from "../stage/carry";
import { FileTree } from "../work/FileTree";   // #954: the IDE lens's tree, behind stage.whole
import { FilePane } from "../work/FilePane";   // stage: joins lens (#701): the IDE lens's file column
import { store as stageStore } from "../stage/engineStore";
import { WorkDrawers } from "../work/WorkSettings";
import { Settings } from "../Settings";
import { Mark as Sol } from "../Mark";
import { useCreatureDriver } from "../creature/state";
import { follow, dur } from "../motion";
import { Site } from "../Site";
import { seenSession } from "../renovation";
import { composing } from "../ime";
import { Side, Mark, stOf, dock } from "./Side";
import { Top, Engine, type Tool, type Width } from "./Top";
import { PRESETS, RAILS, button, type ButtonCtx, type ButtonDef, type WorkShell } from "../buttons";
import { Icon } from "../settingsShell";
import { askedDrawer } from "../spine/settings";   // #1001
import { scopeOf, type Scope } from "../settingsShell";   // Sol's settings or Build's
import { takeFindAsk } from "../spine/find";   // the spine's find opens the Jump
import { route, shortcut, soft, softOpen, SHUT, type At, type Key, type Kind, type Place, type Soft } from "./keys";
import { base, layoutOf } from "./sideRows";
import { useFrameOn } from "./frameFlag";
import { useSpine } from "../spine/flag";
import { useShown } from "../shown/flag";
import { LeftOffShown } from "../shown/LeftOffShown";
// the frame (#630): loaded only with sol.frame on, so with it off nothing of it reaches the face
const Things = lazy(() => import("./Frame").then((m) => ({ default: m.Things })));
import { useRole, openOn, sessionElsewhere, tellFacts, saidThis, screensState, keepProject, projectOpened, useScreens, tellSession, tellShowing } from "../screens/store";
import { drawnOn as screenOf } from "../screens/model";
import { ME as SCREEN_ME } from "../screens/store";
import { useTicketsToEngine } from "../one/tickets";   // build.tickets: the engine told of the switch
import { useAnchor } from "../one/anchor";   // the anchor, the kept session opened as any session (back beside orchestration, 2026-11-19)
import { useOrchestrationToEngine } from "../one/orchestration";   // build.orchestration: the engine told of the switch
import { anchorFacts } from "../screens/model";   // #1090: this window's role among the windows of one Jelly
import { shareOf } from "../screens/share";
import { HeadMap } from "../screens/HeadMap";
import { AnchorFront } from "../screens/AnchorFront";
import { useScreensOn } from "../screens/flag";
import { useBuildSpace } from "../pieces/flag";   // mine, 2026-11-12: Build as one space of pieces
import { BuildSpace } from "../pieces/BuildSpace";
import "../work/work.css";
import "./home.css";
import type { Metas } from "./meta";
import { connectPieces } from "../folderPieces/usePieces";

export const meta = {
  Home: {
    job: "the clean Home: three places (side, talk, pane), five layouts, one ring on the thing that has you",
    flow: "say",
    states: ["new session", "talk", "talk, working", "side folded", "side soft-open", "side wide", "pane: a second session", "settings sheet", "jump open", "dropping a row", "engine down"],
    keys: [
      { press: "type, Enter", does: "says it to Sol, in the box that has the focus when Home opens", goal: "say" },
      { press: "⌘N", does: "a new session in the folder you were in", goal: "say", faster: true },
      { press: "⌘K", does: "opens the jump", opens: "Jump" },
      { press: "← → ↑ ↓", does: "move where they point, across places and within one" },
      { press: "Enter", does: "one level in" },
      { press: "Esc", does: "one level out, to where you came from" },
      { press: "click the corner button", does: "folds the side, or opens it" },
      { press: "the cursor at the left edge", does: "soft-opens the folded side over the talk" },
      { press: "click a mark in the title bar", does: "opens a session that moves or waits, on its question", goal: "answer" },
      { press: "click page", does: "the page it wrote, beside, or shut" },
      { press: "drop a row on the talk's right half", does: "watches that session beside", goal: "pickup", faster: true },
    ],
    listens: ["the engine: up, settings, models", "work: sessions, thread, run, live", "sol:open-work (a session opened elsewhere in the window)", "the window's keys", "sol.home.clean.lay, .panew, .draft"],
  },
  Second: {
    job: "a second session, only in the pane: its talk following its end and a small box of its own",
    flow: "pickup",
    states: ["reading", "talk", "talk, working"],
    keys: [
      { press: "click swap", does: "makes it the talk, and the talk goes beside", goal: "pickup", faster: true },
      { press: "click ×", does: "shuts the pane" },
      { press: "type, Enter", does: "says something to this one" },
    ],
    listens: ["work.peek(id): the second session's thread and run"],
  },
  Jump: {
    job: "⌘K: jump to a session by name, or to settings",
    flow: "pickup",
    states: ["empty", "hits", "no hits", "settings asked"],
    keys: [
      { press: "type", does: "narrows the sessions by name" },
      { press: "↑ ↓", does: "moves the pick" },
      { press: "Enter", does: "opens the picked session, on its question", goal: "pickup", faster: true },
      { press: "type settings, Enter", does: "opens Settings", goal: "mine", faster: true },
      { press: "Esc", does: "shuts it; the focus goes back to what opened it" },
    ],
    listens: ["work.sessions"],
  },
  LeftOff: {
    job: "stage.whole, issue 954: the talk of an empty session says where you left off in its folder, the last three sessions",
    flow: "pickup",
    states: ["three or fewer sessions", "none (says nothing)"],
    keys: [{ press: "click a line", does: "opens that session", goal: "pickup", faster: true }],
    listens: ["work.sessions"],
  },
} satisfies Metas;

// #954, stage.whole (whole.html scene 1): a new session opens with the talk alone, and at its foot where you left off in
// the same folder, the last three sessions, each a press away; the stage stays empty glass
const dayOf = (t: number) => { const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === now.toDateString() ? `today ${hm}` : d.toDateString() === y.toDateString() ? `yesterday ${hm}` : d.toLocaleDateString([], { weekday: "short" }); };
function LeftOff({ w, live, onOpen, none = null }: { w: ReturnType<typeof useWork>; live: string; onOpen: (id: string) => void; none?: React.ReactNode }) {
  const me = w.sessions.find((s) => s.id === live);
  const shownOn = useShown();   // #1020: where you left off as pictures of the stages it left
  // #954: a session not started yet is in the folder it will start in
  const here = me ? null : w.freshCwd || null;
  const past = w.sessions.filter((s) => s.id !== live && !s.archived && !s.gone && (me ? s.project === me.project : !here || s.cwd === here)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  if (!past.length) return <>{none}</>;
  if (shownOn) return <LeftOffShown where={me?.project || (here ? base(here) : "") || "this folder"} past={past} when={dayOf} onOpen={onOpen} />;
  return (
    <div className="st-leftoff" data-part="where you left off">
      <p>where you left off in {me?.project || (here ? base(here) : "") || "this folder"}</p>
      {past.map((s) => <button key={s.id} tabIndex={-1} onClick={() => onOpen(s.id)}>{dayOf(s.updatedAt)} · {s.title || "untitled"}</button>)}
    </div>
  );
}
type Pane = { kind: "session"; id: string } | { kind: "tool"; id: string } | null;
// R3, the mode's buttons (#682): the rail of Home's preset (presets.json: Home › Everyday: browser, file it, page).
// Wired: page (the session's stage as a pane, stage/StageHere.tsx) and browser (a browser block on the session's stage,
// #699). The desk and the page pane went with the swap (#718). file it waits: its press asks the engine for the
// window's shot (team.file.shot) and its line (FileLine) is drawn by Life and Work, not yet by the clean Home.
const WIRED = new Set(["browser", "page"]);
const PRESET = PRESETS[RAILS.home?.[0]?.presets[0] ?? "everyday"] ?? PRESETS.everyday;
const LAY0 = "sol.home.clean.lay";
// stage.whole (#954, whole.html): Build is the spine, the talk and the stage; the session side starts folded and is kept
// apart from today's, so turning the switch off finds today's side as it was
const LAY = stageWhole() ? "sol.home.clean.lay.whole" : LAY0;
const SQUISHED = 1180, NARROW = 900;   // the brief's widths (#682): below these the rail and the side fold in their order
const readLay = (): { side: boolean; pane: Pane } => { const side = LAY === LAY0; try { return { side, pane: null, ...JSON.parse(localStorage.getItem(LAY) ?? "{}") }; } catch { return { side, pane: null }; } };
const kept = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(k); return v === null ? d : (JSON.parse(v) as T); } catch { return d; } };
const keepS = (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } };
const KEYS: Record<string, Key> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Enter: "enter", Escape: "esc" };
const FIELD = "input, textarea, select, [contenteditable=true], iframe";

export function Home({ e, onMode }: { e: ReturnType<typeof useEngine>; onMode: (m: AppMode) => void }) {
  const w = useWork(e);
  const framed = useFrameOn();
  // the engine's half of the switch (#633): told once per turn of this window's switch when the engine says otherwise (an
  // older engine drops the key, so never more than once), so the blocks' engine halves run only with the frame on
  const engineFramed = e.settings ? e.settings.frame === true : null;
  const toldFramed = useRef<boolean | null>(null);
  useEffect(() => {
    if (engineFramed === null || engineFramed === framed || toldFramed.current === framed) return;
    toldFramed.current = framed;
    e.setSettings({ frame: framed });
  }, [framed, engineFramed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lay, setLay] = useState(readLay);
  const [wide, setWide] = useState(false);
  // #1090, screens.two: a window set to anchor is the side opened wide (sessions, what waits, the runs) and opens what is
  // pressed on the stage window; a stage window is the talk and its stage with the side folded. Whole (or the switch
  // off, or one window alone) is Build as it is
  const role = useRole(), screens = useScreensOn();
  const roleRef = useRef(role); roleRef.current = role;
  const wasRole = useRef(role);
  useEffect(() => {
    // the anchor keeps the side as in Build, docked; its room is the front (design NOW 01:30 #1), never the wide table
    if ((role === "anchor" || role === "stage" || role === "wall") && wide) setWide(false);
    // an anchor given a block (or a stage, or left alone) takes a stage: the list closes on the session the other window
    // shows, so the block lands beside its own talk
    if (wasRole.current === "anchor" && role && role !== "anchor") { setWide(false); const sid = sessionElsewhere(); if (sid && sid !== w.live) w.open(sid); }
    wasRole.current = role;
  }, [role, wide]); // eslint-disable-line react-hooks/exhaustive-deps
  // #1029: the spine's ask may come before this page has mounted (it is loaded lazily the first time): App leaves
  // sol.work.view = "settings" for the page that opens, so the sheet opens on mount too
  const [sheet, setSheet] = useState(() => { if (!stageWhole()) return false; try { return JSON.parse(sessionStorage.getItem("sol.work.view") ?? "null") === "settings"; } catch { return false; } });
  // #1029: leaving the sheet tells App (sol:settings-left), as Build's own page does (WorkApp.tsx), so Settings asked
  // for from Home closes back into Home: Esc, the backdrop and its × are a close; a new session is a move
  const sheetHow = useRef<Leave>("closed"), sheetWas = useRef(sheet);
  // which half the sheet shows (2026-11-11, with the spine on): the side's "build settings" row opens Build's own, the
  // spine's mark (and any ask from outside this page) opens Sol's
  const [scope, setScope] = useState<Scope>("sol");
  useEffect(() => {
    if (sheet) { try { sessionStorage.removeItem("sol.work.view"); } catch { /* private */ } }
    else if (sheetWas.current) window.dispatchEvent(new CustomEvent<Leave>("sol:settings-left", { detail: sheetHow.current }));
    sheetWas.current = sheet; sheetHow.current = "closed";
  }, [sheet]);
  const [jump, setJump] = useState(false);
  const [aside, setAside] = useState(false);   // + › ask on the side: a question beside the task; Esc leaves it
  const [frac, setFrac] = useState(() => heldFrac(Number(localStorage.getItem("sol.home.clean.panew")) || 0.42));
  const [draft, setDraft] = useState<Draft>(() => ({ text: kept("sol.home.clean.draft", ""), atts: [] }));
  useEffect(() => keepS("sol.home.clean.draft", draft.text), [draft.text]);
  useTicketsToEngine();
  useOrchestrationToEngine();
  // words taken back come into an empty box; their files always come back beside what is there (#1448, as WorkApp.tsx)
  useEffect(() => {
    const u = w.unsent;
    if (!u) return;
    setDraft((d) => { const atts = u.files?.length ? [...d.atts, ...u.files] : d.atts; return d.text.trim() ? { ...d, atts } : { ...d, text: u.text, atts }; });
  }, [w.unsent?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(LAY, JSON.stringify(lay)); } catch { /* private */ } }, [lay]);
  const box = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useCreatureDriver({ seat: "claude" });

  const items = w.thread?.items ?? [];
  const busy = !!w.run?.busy;
  const working = isWorking(w.run);
  const live = w.live;
  const piece = useOpenPiece();   // #1092: a piece in the room, in place of the session
  const piecesOn = useBuildPieces();
  const pieceTitle = usePieces(piecesOn && piece ? piece.cwd : null).pieces.find((x) => x.name === piece?.name)?.title;
  // the session open here is kept in sol.home.open, the one place a mount reads it from (migrate.ts homeSession): a hop
  // to another mode unmounts Build, and coming back opens the session you left (Marco 2026-11-08). The old Home wrote it
  // (WorkApp.tsx); the clean one never did, so a return opened whatever was kept before
  useEffect(() => { try { localStorage.setItem("sol.home.open", JSON.stringify({ kind: "session", id: live ?? null })); } catch { /* private */ } }, [live]);
  const session = live ? w.sessions.find((s) => s.id === live) : undefined;
  const cwd = w.thread?.cwd ?? session?.cwd ?? w.freshCwd;
  const title = live ? session?.title ?? w.thread?.title ?? "" : "new session";
  // the stage (#696, joined #709, the swap #718): a session's main column is the room, its talk docked beside its stage
  // on the engine's blocks (StageColumn.tsx, #734); the pages it wrote and its task list are blocks there
  useEffect(() => { stageStore.connect(w.ask, e.subscribe, { send: e.send, frames: e.subscribeFrames }); }, [w.ask, e.subscribe, e.send, e.subscribeFrames]);
  // #1092 in the clean Home's Build too (WorkApp.tsx does the same): a folder's pieces ask the engine only with
  // build.pieces on; without this, a kept thing of Build (#1089) never shows in its folder's row here (piecesOn above)
  useEffect(() => (piecesOn ? connectPieces(w.ask, e.subscribe) : undefined), [piecesOn, w.ask, e.subscribe]);
  // a code block's run cell sends for the session showing, and the engine's "ran" pieces come back to it (run.ts), as
  // the old Home does (WorkApp.tsx): without these two, a press on "run" did nothing here (#1361)
  useEffect(() => { setRunner({ send: e.send, seat: "claude", sessionId: w.current ?? null, work: true }); return () => setRunner(null); }, [e.send, w.current]);
  useEffect(() => e.subscribe(ran), [e.subscribe]);
  const pages = useMemo(() => pagesOf(items), [items]);
  // the buttons' context: what a tool's pane reads. A tool's mark (a piece of the desk) goes into the box, as Work's does;
  // the shell is only what `shows` reads here (page: the pages; desk: none outside a session)
  const [armed, setArmed] = useState(false);
  const ctx: ButtonCtx = { mode: "home", session: live ?? undefined, cwd, e, w, flash: e.flash, armed, setArmed,
    open: (id) => setPane({ kind: "tool", id }),
    mark: (m) => { setDraft((d) => ({ ...d, atts: [...d.atts.filter((a) => a.name !== m.name), { name: m.name, mime: m.mime, dataBase64: m.dataBase64, thumb: m.thumb }],
      text: d.text.includes(m.note) ? d.text : d.text ? `${d.text}\n${m.note}` : m.note })); requestAnimationFrame(() => box.current?.focus()); },
    shell: live ? ({ pages, items } as unknown as WorkShell) : undefined };
  const shown: ButtonDef[] = PRESET.buttons.map(button).filter((b): b is ButtonDef => !!b && WIRED.has(b.id) && (b.shows?.(ctx) ?? true));
  // the session in the talk is never also the pane; a tool whose button is not on the rail here is not either
  const pane: Pane = lay.pane?.kind === "session" && lay.pane.id === live ? null
    : lay.pane?.kind === "tool" && !shown.some((b) => b.id === (lay.pane as { id: string }).id) ? null : lay.pane;
  const setPane = (p: Pane) => setLay((l) => ({ ...l, pane: p }));
  // the talk keeps its room (fit.ts, the rule Life, Work and Cowork follow): with a pane open in a narrow window the pane
  // narrows to its floor, then the side lets go and soft-opens over the talk, its saved pin untouched (#606)
  const vw = useWidth();
  // with the spine on, the window's left edge is the spine's: no peek strip beside it (Marco 2026-11-08)
  const spine = useSpine();
  // the side's widths (Side.tsx dock): full, docked at 264; squished, it narrows before it lets go; narrow, it folds
  // a stage with blocks open in a window under SQUISHED: the side yields first, to its edge, its pin untouched (#872 pass 2)
  const crowded = useCrowded() && vw < SQUISHED;
  // #1090 (design NOW 05:53 #1b): an anchor always shows its side, docked whatever the width (it is what the window is for)
  const fitted = dock(vw, (lay.side || role === "anchor") && (role === "anchor" || !crowded) && role !== "stage" && role !== "wall", [frac * vw], [!!pane], PANE_FLOOR);
  const { fit, docked, width: sideW } = role === "anchor" ? { ...fitted, docked: true } : fitted;
  const width: Width = vw < NARROW ? "narrow" : vw < SQUISHED ? "squished" : "full";
  const setSide = (v: boolean) => { setSft(SHUT); setLay((l) => ({ ...l, side: v })); };
  // the folded side, soft-opened over the talk by the cursor or the keys (keys.ts soft); it lingers a beat to close
  const [sft, setSft] = useState<Soft>(SHUT);
  const peek = !docked && !wide && softOpen(sft);
  const [peekUp, setPeekUp] = useState(false);
  useEffect(() => {
    if (peek) { setPeekUp(true); return; }
    const t = setTimeout(() => {
      // a row clicked in the soft-opened side kept the focus there: it goes back to the talk as the side closes
      const H = h.current;
      if (H.placeEl("side")?.contains(document.activeElement) && !H.docked && !H.wide) H.goPlace("talk");
      setPeekUp(false);
    }, dur("turn"));
    return () => clearTimeout(t);
  }, [peek]);

  // the engine knows what is on screen, so a turn that ends unseen leaves its row unread
  useEffect(() => { if (e.up) w.view(sheet ? null : live); }, [live, e.up, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => w.view(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (live) seenSession(live); }, [live]);
  // #954, stage.whole: the side starts folded, so the sessions' names for the tray's groups are kept here, not by the side
  useEffect(() => { if (stageWhole()) setNames(w.sessions); }, [w.sessions]);
  // #954, stage.whole: the spine's settings press (App.tsx sends sol:settings to Build's page) opens this Home's sheet,
  // where "how work is drawn" lives now that the side and its lens pill are folded away
  useEffect(() => {
    if (!stageWhole()) return;
    const go = () => { setScope("sol"); overlay(setSheet, true); };
    window.addEventListener("sol:settings", go);
    return () => window.removeEventListener("sol:settings", go);
  });
  // #1090: no stage window to open it on: the anchor opens it here, as any session (no ask back to the engine)
  useEffect(() => {
    const go = (ev: Event) => { const id = (ev as CustomEvent<string>).detail; if (id) { setWide(false); w.open(id); } };
    window.addEventListener("sol:open-here", go);
    return () => window.removeEventListener("sol:open-here", go);
  });
  // a session asked for elsewhere in the window (sol:open-work) opens here
  useEffect(() => {
    const go = (ev: Event) => { const id = (ev as CustomEvent<string>).detail; if (id) open(id); };
    window.addEventListener("sol:open-work", go);
    return () => window.removeEventListener("sol:open-work", go);
  });


  // ---- the focus: one ring on the one thing that has you; each place remembers its thing ----
  const memory = useRef(new Map<Place, Element>());
  const opener = useRef<Element | null>(null);   // what opened an overlay gets the focus back
  const places = (): Place[] => (wide ? ["side"] : ["side", "talk", ...(pane ? ["pane" as const] : [])]);   // a folded side soft-opens
  const placeEl = (p: Place) => root.current?.querySelector<HTMLElement>(`[data-place=${p}]`) ?? null;
  const thingsOf = (p: Place): HTMLElement[] => {
    const el = placeEl(p);
    if (!el) return [];
    if (p === "talk") return [...el.querySelectorAll<HTMLElement>(".wtalk > *, [data-kind=bar]")];
    return [...el.querySelectorAll<HTMLElement>("[data-thing]")];
  };
  const kindOf = (p: Place, t: HTMLElement): Kind =>
    (t.dataset.kind as Kind) ?? (p === "talk" ? (t.matches(".wcard") || t.querySelector(".wcard") ? "card" : "message") : "pane");
  const put = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  };
  const type = () => { box.current?.focus(); };
  const remembered = (p: Place): HTMLElement | null => {
    const m = memory.current.get(p);
    if (m && m.isConnected) return m as HTMLElement;
    const ts = thingsOf(p);
    if (p === "side") return ts.find((t) => t.dataset.sid === live) ?? ts.find((t) => t.dataset.kind === "session") ?? ts[0] ?? null;
    if (p === "talk") return ts[ts.length - 1] ?? null;   // the bar
    return ts[0] ?? null;
  };
  const goPlace = (p: Place) => {
    // the keys reach a folded side too: it soft-opens, and the focus lands once it has drawn
    if (p === "side" && !docked && !wide) {
      setSft((s) => soft(s, "keys"));
      if (!placeEl("side")) { requestAnimationFrame(() => requestAnimationFrame(() => h.current.goPlace("side"))); return; }
    }
    const r = remembered(p); if (p === "talk" && (!r || r.dataset.kind === "bar")) type(); else put(r ?? placeEl(p)); };
  const where = (): { at: At; place?: Place; thing?: HTMLElement } | null => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !root.current?.contains(a)) return null;
    if (a === box.current) return { at: { level: "typing", empty: !box.current.value }, place: "talk" };
    const pl = a.closest<HTMLElement>("[data-place]");
    const p = pl?.dataset.place as Place | undefined;
    if (!pl || !p) return null;
    if (a === pl) return { at: { level: "place", place: p }, place: p };
    const thing = thingsOf(p).find((t) => t === a || t.contains(a));
    if (!thing) return { at: { level: "place", place: p }, place: p };
    const kind = kindOf(p, thing);
    if (a === thing) return { at: { level: "thing", place: p, kind, open: thing.dataset.open === "1" }, place: p, thing };
    return { at: { level: "inside", place: p, kind }, place: p, thing };
  };
  // the focus wherever it lands (a click too) is what its place remembers
  const onFocusIn = (ev: React.FocusEvent) => {
    const t = ev.target as HTMLElement;
    const p = t.closest<HTMLElement>("[data-place]")?.dataset.place as Place | undefined;
    if (p !== "side") setSft((s) => (s.keys ? soft(s, "blur") : s));
    if (!p) return;
    const thing = thingsOf(p).find((x) => x === t || x.contains(t));
    if (thing) memory.current.set(p, thing);
  };

  const open = useCallback((id: string, then?: "card") => {
    if (roleRef.current === "anchor") { openOn(id); return; }   // #1090: it opens on the stage window
    setWide(false);
    closePiece();   // #1092: a session row pressed: the room is the session's again
    w.open(id);
    // after it draws: on its question card if it asks one, else in the bar
    if (then) requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = [...(placeEl("talk")?.querySelectorAll<HTMLElement>(".wtalk > *") ?? [])].reverse().find((t) => t.querySelector(".wperm, .wcard.questions") || t.matches(".wperm"));
      if (card) { memory.current.set("talk", card); put(card); } else type();
    }));
  }, [w.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // the anchor: the kept session, opened as any session by its row beside settings (one/anchor.ts)
  const anchor = useAnchor(live, open, e.flash, cwd);
  // a new session, already set to the folder you were in; nothing exists until you send
  const fresh = () => { setWide(false); if (sheet) sheetHow.current = "moved"; setSheet(false); w.fresh(session ? session.folder || session.project || session.cwd : w.freshCwd || undefined); requestAnimationFrame(type); };
  const overlay = (set: (v: boolean) => void, v: boolean) => {
    if (v) opener.current = document.activeElement; else requestAnimationFrame(() => { const o = opener.current as HTMLElement | null; if (o?.isConnected) o.focus(); else type(); });
    set(v);
  };

  const h = useRef({ where, route, places, goPlace, put, thingsOf, type, open, setLay, setWide, wide, fresh, overlay, sheet, jump, lay, docked, placeEl, aside, w });
  // #1001: Settings asked for from outside this page (the spine's settings mark, #911, spine/settings.ts) opens the sheet
  // here, as the side's settings row does; before, only WorkApp heard the ask, so the mark was a dead press in this Home
  useEffect(() => {
    // the drawer the ask names (the join card's "me"): once the sheet is up, Settings' own listener opens it (review R5)
    const ask = (ev: Event) => {
      const d = askedDrawer((ev as CustomEvent).detail);
      if (d === null || h.current.sheet) return;
      // a plain ask is Sol's settings; an ask that names a drawer opens the half that drawer is in
      const raw = (ev as CustomEvent).detail;
      setScope(typeof raw === "string" && raw ? scopeOf(raw) : "sol");
      h.current.overlay(setSheet, true);
      // two frames: the sheet is drawn and Settings listens by then
      requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("sol:settings", { detail: d }))));
    };
    window.addEventListener("sol:settings", ask);
    return () => window.removeEventListener("sol:settings", ask);
  }, []);
  // the spine's find (2026-11-11, spine/find.ts) does what ⌘K does here: the Jump; it only opens it, since an ask made
  // from another view arrives twice (left for this page as it mounted, and as the event a moment later)
  useEffect(() => {
    const find = () => { if (!h.current.jump) h.current.overlay(setJump, true); };
    if (takeFindAsk()) find();
    window.addEventListener("sol:find", find);
    return () => window.removeEventListener("sol:find", find);
  }, []);
  h.current = { where, route, places, goPlace, put, thingsOf, type, open, setLay, setWide, wide, fresh, overlay, sheet, jump, lay, docked, placeEl, aside, w };
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      const H = h.current;
      if (ev.defaultPrevented || ev.isComposing) return;
      // the only two shortcuts (keys.ts shortcut)
      const sc = shortcut({ meta: ev.metaKey, shift: ev.shiftKey, key: ev.key });
      if (sc === "fresh") { ev.preventDefault(); H.fresh(); return; }
      if (sc === "jump") { ev.preventDefault(); H.overlay(setJump, !H.jump); return; }
      if (H.sheet) { if (ev.key === "Escape") { ev.preventDefault(); H.overlay(setSheet, false); } return; }
      if (H.jump) return;   // the jump box has the keys
      if (ev.key === "Escape" && (H.aside || H.w.sideAnswer)) { ev.preventDefault(); setAside(false); H.w.dropAside(); return; }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const at = H.where();
      // typing wins: a letter anywhere but a field goes to the bar
      if (ev.key.length === 1 && ev.key !== " " && (!at || at.at.level !== "typing") && !(document.activeElement as HTMLElement | null)?.matches(FIELD)) { H.type(); return; }
      const key = KEYS[ev.key];
      if (!key) return;
      if (!at) { if (key !== "esc") { ev.preventDefault(); H.goPlace("talk"); } return; }
      // a field that is not the bar (a rename, the pane's own box) keeps every key but Esc
      if (at.at.level === "inside" && (document.activeElement as HTMLElement).matches(FIELD) && key !== "esc") return;
      const act = H.route(key, at.at, { places: H.places(), wide: H.wide });
      const p = at.place!;
      const ts = H.thingsOf(p);
      const i = at.thing ? ts.indexOf(at.thing) : -1;
      switch (act.do) {
        case "pass": case "none": return;
        case "place": H.goPlace(act.to); break;
        case "remembered": H.goPlace(p); break;
        case "type": H.type(); break;
        case "bar-up": { const m = ts.filter((t) => t.dataset.kind !== "bar"); H.put(m[m.length - 1]); break; }
        case "step": {
          const n = ts[Math.max(0, Math.min(ts.length - 1, i + act.by))];
          if (n?.dataset.kind === "bar") H.type(); else H.put(n);
          break;
        }
        case "in": { const f = at.thing?.querySelector<HTMLElement>(`button:not([disabled]), a[href], ${FIELD}, [tabindex]:not([tabindex="-1"])`); if (f) f.focus(); break; }
        case "inner": {
          const bs = [...(at.thing?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
          const j = bs.indexOf(document.activeElement as HTMLElement);
          bs[Math.max(0, Math.min(bs.length - 1, j + act.by))]?.focus();
          break;
        }
        case "out": H.put(at.at.level === "typing" ? ts.find((t) => t.dataset.kind === "bar") : at.at.level === "inside" ? at.thing : placeEl(p)); break;
        case "fold": { const f = at.thing!; if ((f.dataset.open === "1") !== act.open) f.click(); requestAnimationFrame(() => H.put(H.thingsOf("side").find((t) => t.dataset.fold === f.dataset.fold))); break; }
        case "open": { const id = at.thing?.dataset.sid; if (id) H.open(id, "card"); break; }
        case "press": at.thing?.click(); break;
        case "unwide": H.setWide(false); requestAnimationFrame(() => H.goPlace("side")); break;
      }
      ev.preventDefault();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);
  // nothing has the focus when Home opens: the bar has it; a first send moves the box to the new session's talk, and it
  // keeps the focus there
  useEffect(() => { if (!document.activeElement || document.activeElement === document.body) type(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = stOf(w);
  // #1090, screens.two: once per message the person sends, the screens may be arranged for the job (Jev pick 2)
  const lastSaid = useRef<string | null>(null);
  useEffect(() => {
    if (!screens || !live) return;
    const said = [...items].reverse().find((it) => it.kind === "user");
    if (!said || said.id === lastSaid.current) return;
    const first = lastSaid.current === null;
    lastSaid.current = said.id;
    if (first) return;   // what was said before this window opened is not a new message
    const seen = stageStore.read(live), rec = screensState();
    const newest = [...seen.blocks].sort((a, b) => (seen.ledger[b.id]?.[0]?.at ?? 0) - (seen.ledger[a.id]?.[0]?.at ?? 0));
    const block = (newest.find((b) => b.kind === "diff") ?? newest[0])?.id;
    saidThis(String(said.text ?? ""), block, seen.blocks.filter((b) => screenOf(rec, b.id) === SCREEN_ME).map((b) => b.title), seen.blocks.filter((b) => screenOf(rec, b.id) !== SCREEN_ME).map((b) => b.title), seen.blocks.filter((b) => b.state !== "dead").map((b) => ({ id: b.id, title: b.title })));
  }, [items, screens, live]); // eslint-disable-line react-hooks/exhaustive-deps
  // #1090, screens.two: as you left it: the project's arrangement kept as it changes, offered back when it is opened
  const project = session?.project ?? "";
  useEffect(() => { if (screens) tellSession(live ?? null); }, [screens, live]);
  // the window with the talk tells the record what it shows: an anchor's pearl stands on that session (design NOW 06:19 #3b)
  useEffect(() => { if (screens && live && (role === "whole" || role === "stage")) tellShowing(live); }, [screens, live, role]);
  const rec = useScreens().s;
  const offeredFor = useRef<string | null>(null);
  useEffect(() => {
    // only the window that holds the talk keeps and offers: its project is the one being worked
    if (!screens || !live || !project || !(role === "whole" || role === "stage")) return;
    const seen = stageStore.read(live).blocks, ids = seen.map((b) => b.id);
    // once per session opened (design JEV 3: another session of the project asks Jev; the same one needs nothing)
    if (offeredFor.current !== live) { offeredFor.current = live; projectOpened(project, ids, live, seen.filter((b) => b.state !== "dead").map((b) => ({ title: b.title, kind: b.kind }))); return; }
    keepProject(project, ids, live, Object.fromEntries(seen.map((b) => [b.id, b.kind])));
  }, [screens, live, project, rec, role]); // eslint-disable-line react-hooks/exhaustive-deps
  // #1090, screens.two: what waits and what runs, the same on every window (the map draws it); its waits count, pressed,
  // soft-opens this window's folded side
  useEffect(() => { if (screens) tellFacts(anchorFacts(w.sessions.filter((s) => !s.archived && !s.gone).map((s) => ({ st: st(s) })))); });
  useEffect(() => { const f = () => setSft((x) => soft(x, "edge")); window.addEventListener("sol:screens-waits", f); return () => window.removeEventListener("sol:screens-waits", f); }, []);
  // talk alone: the side's marks stay in the title bar, the ones that move or wait
  const marks = !docked && !wide;
  // R4: the ones that need you first, then the ones that work; six at most, one mark each (the side's Mark, its export)
  const loud = w.sessions.filter((s) => s.id !== live && (st(s) === "needs" || st(s) === "running"))
    .sort((a, b) => Number(st(b) === "needs") - Number(st(a) === "needs")).slice(0, 6);
  const layout = layoutOf(docked, !!pane, wide);
  // R3: each button lit while its tool is open beside; again, the pane shuts
  const litOf = (id: string) => pane?.kind === "tool" && pane.id === id;
  // stage.whole: the top bar carries no tools; what they opened is an artifact on the stage (a browser: the box's +)
  const tools: Tool[] = wide || stageWhole() ? [] : shown.map((b) => ({ id: b.id, name: b.name, glyph: typeof b.glyph === "string" ? null : b.glyph, lit: litOf(b.id), hook: b.id === "page" ? "hc-pkey" : undefined }));
  const onTool = (id: string) => { const b = button(id); if (b?.kind === "press") { b.press?.(ctx); return; } ctx.open(id); if (litOf(id)) setPane(null); };
  const toBox = (t: string) => { setDraft((d) => ({ ...d, text: d.text ? `${d.text}\n\n${t}` : t })); requestAnimationFrame(type); };
  // a row dropped on the talk's right half opens beside (3b)
  const [dropping, setDropping] = useState(false);
  const cross = useCross();   // #1031: the talk takes a piece carried from Home
  const spaced = useBuildSpace();   // build.space: the chat, the box and the artifacts are pieces of one space
  const onDrop = (ev: React.DragEvent) => { const id = ev.dataTransfer.getData("text/sol-session"); setDropping(false); if (id) { ev.preventDefault(); setPane({ kind: "session", id }); } };

  // the talk as the room draws it: the same function until what is said, the run or the sessions change, so a letter in
  // the box does not draw the whole chat again (#866). Its presses read the work as it is when pressed (the proxy)
  const late = useRef({ w, fresh, toBox });
  late.current = { w, fresh, toBox };
  const wLate = useMemo(() => new Proxy({} as typeof w, { get: (_t, k) => (late.current.w as never)[k as never] }), []);
  const talkOf = useCallback((shown: typeof items) => <WorkTalk items={shown} busy={busy} w={wLate} view="normal" onFresh={(text) => { late.current.fresh(); if (text) setDraft({ text, atts: [] }); }} onLink={() => {}} onBox={(t) => late.current.toBox(t)} />,
    [busy, w.live, w.sessions, w.runs, wLate]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⌘↵ sends from anywhere on the stage (#698): the box's own Enter, wherever the focus is
  const sendNow = useCallback(() => { const t = box.current; if (!t) return; t.focus(); t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); }, []);
  // the box: at the talk's foot in a session (the talk is a block of the room, #734), under the welcome before one
  const bar = (
    <div data-kind="bar" tabIndex={-1} className="hc-barbox" {...(cross ? { "data-cross-drop": "talk" } : {})}>
      <Site name="composer"><Composer w={w} e={e}
      busy={busy} working={working} cwd={cwd} asideOn={aside} setAsideOn={setAside} box={box}
      onSent={() => {}} onRec={() => {}} d={draft} setD={setDraft} clean staged={!!live} /></Site>
      </div>
  );
  // a session not started yet has no stage: the welcome (the transcript column went with the swap, #718)
  const welcomeLine = (
    <div className="hc-new">
      <Sol size={56} live />
      <p>what are we doing in <b>{base(w.freshCwd) || "home"}</b>?</p>
    </div>
  );
  const welcome = <div className="talk-wrap"><div className="talk">{welcomeLine}</div></div>;

  // #954, stage.whole: a session not started yet is the space as every session opens: the talk alone in its column, where
  // you left off over the box (a Sol with nothing yet to go back to is greeted as before, #1111); the stage comes with the first artifact. Nothing is asked of the engine until the
  // first send makes the session (its stage and tray come then)
  const fresh1 = stageWhole() ? (
    <div className="st-room whole fresh" data-dock="full" data-lens="app" style={{ "--st-talkw": `${TALK_WHOLE}px`, "--st-fullw": `${FOOT.talk}px`, "--st-foot": "0px" } as React.CSSProperties}>
      <section className="st-talk" data-part="the talk" aria-label="the talk">
        <div className="st-talkwrap"><div className="talk"><div className="talk-inner"><LeftOff w={w} live="" onOpen={(id) => open(id)} none={welcomeLine} /></div></div></div>
        <div className="st-talkbox">{bar}</div>
      </section>
      <div className="st-main"><div className="st-stagebox" /></div>
    </div>
  ) : null;

  return (
    <div ref={root} className="face hc" data-layout={layout} {...(role ? { "data-role": role } : {})} onFocus={onFocusIn}>
      <Top width={width} side={docked || peek} onSide={() => (width === "narrow" || crowded ? (peek ? setSft(SHUT) : goPlace("side")) : setSide(!lay.side))}
        title={wide ? "all sessions" : piece && piecesOn ? pieceLine(piece, pieceTitle) : live ? title : null} folder={wide ? null : base(cwd) || "home"} branch={wide ? null : w.thread?.branch}
        tools={tools} onTool={onTool}
        waiting={marks ? loud.map((s) => ({ id: s.id, title: s.title || "untitled", st: st(s) })) : null} onWaiting={(id) => open(id, "card")}
        mid={screens ? <HeadMap /> : undefined}
        engine={<Engine up={e.up} info={e.engineInfo} health={e.health} running={w.sessions.filter((s) => st(s) === "running").length} />} />
      <div className="hc-main">
        {!docked && !wide && !peek && (!spine || crowded) && <div className="hc-edge" onMouseEnter={() => setSft((s) => soft(s, "edge"))} aria-hidden />}
        {(docked || wide || peekUp) && <Site name="sidebar"><Side w={w} width={sideW} live={role === "anchor" ? sessionElsewhere() ?? live : live} wide={wide} onOpen={(id) => open(id)} onBeside={(id) => setPane({ kind: "session", id })}
          onFresh={fresh} onWide={(v) => { setWide(v); requestAnimationFrame(() => h.current.goPlace("side")); }} onSettings={() => { setScope("build"); overlay(setSheet, true); }} onMode={onMode}
          soft={!docked && !wide ? (peek ? "open" : "closing") : undefined} onHover={(on) => setSft((s) => soft(s, on ? "enter" : "leave"))}
          one={anchor.on && !wide} onOne={() => { setWide(false); anchor.go(); }} /></Site>}
        {!wide && (
          <section data-place="talk" tabIndex={-1} className={`hc-talk ${dropping ? "dropping" : ""}`}
            onDragOver={(ev) => { if (ev.dataTransfer.types.includes("text/sol-session")) { ev.preventDefault(); setDropping(true); } }} onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDropping(false); }} onDrop={onDrop}>
            {framed && <Suspense fallback={null}><Things /></Suspense>}
            <Site name="talk">
              {spaced ? <BuildSpace key={live ?? ""} store={stageStore} session={live ?? ""} items={items} busy={busy} talk={talkOf} box={bar} greet={welcome} />
                : piece ? <PieceRoom at={piece} onSession={(id) => open(id)} />
                : role === "anchor"
                ? <AnchorFront w={w} st={stOf(w)} room={vw - (docked ? sideW : 0)} onOpen={(id) => open(id)} />
                : live && role === "wall"
                ? <Wall store={shareOf(stageStore)} session={live} busy={busy} />
                : live
                ? <StageColumn store={screens ? shareOf(stageStore) : stageStore} session={live} titleOf={(id) => w.sessions.find((s) => s.id === id)?.title} items={items} busy={busy} onSend={sendNow} onType={type} writing={draft.text.trim() !== ""}
                    talk={talkOf}
                    box={bar} empty={<LeftOff w={w} live={live} onOpen={(id) => open(id)} />} files={stageWhole() ? <FileTree w={w} cwd={cwd} onAttach={(path) => toBox(path)} flash={e.flash} /> : <FilePane w={w} cwd={cwd} at={null} onAttach={(path) => toBox(path)} flash={e.flash} />} />
                : fresh1 ?? welcome}
            </Site>
            {!live && !fresh1 && !piece && !spaced && bar}
            {dropping && <div className="hc-drophint">drop: watch it beside</div>}
          </section>
        )}
        {!wide && (
          <div data-place="pane" tabIndex={-1} className="hc-pane">
            <Site name="panes"><PaneFrame open={!!pane} w={fit.widths[0]} max={fit.max(0)} frac={frac} onFrac={(f) => { setFrac(f); localStorage.setItem("sol.home.clean.panew", String(f)); }} tabs={[]} active={null} onPick={() => {}} onClose={() => setPane(null)}>
              {pane?.kind === "session" && <Second w={w} id={pane.id} onClose={() => setPane(null)} onSwap={() => { const was = live; open(pane.id); setPane(was ? { kind: "session", id: was } : null); }} />}
              {pane?.kind === "tool" && (() => { const b = button(pane.id); return b?.Pane && (
                <div className="hc-pbody">
                  <div tabIndex={-1} data-thing data-kind="head" className="hc-phead"><span>{b.name}</span><button tabIndex={-1} onClick={() => setPane(null)} aria-label="close the pane">×</button></div>
                  <div tabIndex={-1} data-thing data-kind="pane" className="hc-pin hc-tool-pane" data-tool={b.id}>{b.Pane(ctx)}</div>
                </div>
              ); })()}
            </PaneFrame></Site>
          </div>
        )}
      </div>
      {sheet && (
        <div className="hc-sheet" onMouseDown={(ev) => ev.target === ev.currentTarget && overlay(setSheet, false)}>
          <div className="hc-sheetcard" role="dialog" aria-label="settings">
            <Site name="settings"><Settings s={e.settings} stale={false} info={e.engineInfo} up={e.up} health={e.health} goBack={e.goBackPlan} send={e.send} subscribe={e.subscribe} models={e.models} efforts={e.efforts}
              sampling={e.sampling} onSet={e.setSettings} onHear={e.hearVoice} first={kept("sol.home.clean.sec", "me")}
              more={(o, t) => <WorkDrawers w={w} open={o} toggle={t} flash={e.flash} />} scope={spine ? scope : undefined} onScope={setScope} onClose={() => overlay(setSheet, false)} /></Site>
          </div>
        </div>
      )}
      {jump && <Jump w={w} onPick={(id) => { setJump(false); open(id, "card"); }} onSettings={() => { setJump(false); setScope("sol"); setSheet(true); }} onClose={() => overlay(setJump, false)} />}
    </div>
  );
}

// a second session, only in the pane (3b): its talk following its end and a small box of its own; swap makes it the talk
function Second({ w, id, onClose, onSwap }: { w: ReturnType<typeof useWork>; id: string; onClose: () => void; onSwap: () => void }) {
  const sw = scoped(w, id);
  const items = sw.thread?.items ?? [];
  const s = w.sessions.find((x) => x.id === id);
  const title = s?.title ?? sw.thread?.title ?? "";
  const [draft, setDraft] = useState("");
  useEffect(() => { w.peek(id); return () => w.unpeek(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const talk = useRef<HTMLDivElement>(null);
  const has = items.length > 0;
  useLayoutEffect(() => {
    const t = talk.current, inner = t?.querySelector(".talk-inner") as HTMLElement | null;
    if (!t || !inner) return;
    const f = follow(t, inner); f.jump();
    return () => f.destroy();
  }, [id, has]);
  return (
    <div className="hc-pbody">
      <div tabIndex={-1} data-thing data-kind="card" className="hc-phead">
        {s && <Mark st={stOf(w)(s)} />}
        <span className="hc-tt">{title || "untitled"}</span>
        <button tabIndex={-1} onClick={onSwap} title="make it the talk">swap</button>
        <button tabIndex={-1} onClick={onClose} aria-label="close the pane">×</button>
      </div>
      <div tabIndex={-1} data-thing data-kind="pane" className="hc-pin" data-run-session={id}>
        <div className="talk" ref={talk}>
          {has ? <div className="talk-inner"><WorkTalk items={items} busy={!!sw.run?.busy} w={sw} view="normal" onFresh={() => {}} onLink={() => {}} /></div> : <div className="talk-inner"><p className="wpempty">reading the session…</p></div>}
        </div>
        <div className="hc-pbox">
          <textarea rows={1} value={draft} placeholder="say something to this one" onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey && !composing(ev)) { ev.preventDefault(); if (sw.say(draft)) setDraft(""); } }} />
        </div>
      </div>
    </div>
  );
}

// ⌘K: jump to a session by name, or to settings; Esc puts the focus back on what opened it
function Jump({ w, onPick, onSettings, onClose }: { w: ReturnType<typeof useWork>; onPick: (id: string) => void; onSettings: () => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const st = stOf(w);
  const ql = q.trim().toLowerCase();
  const asks = ql.length > 0 && "settings".startsWith(ql);
  const found = w.sessions.filter((s) => !s.gone && (s.title || "").toLowerCase().includes(ql)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, asks ? 8 : 9);
  const hits: ({ id: string } & Partial<(typeof found)[number]>)[] = asks ? [{ id: "settings" }, ...found] : found;
  const pick = (id: string) => (asks && id === "settings" ? onSettings() : onPick(id));
  return (
    <div className="hc-sheet hc-jumpwrap" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="hc-jump" role="dialog" aria-label="jump to a session">
        <input autoFocus value={q} placeholder="jump to a session" onChange={(ev) => { setQ(ev.target.value); setSel(0); }}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") { ev.preventDefault(); onClose(); }
            else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => (s + (ev.key === "ArrowDown" ? 1 : -1) + hits.length) % Math.max(1, hits.length)); }
            else if (ev.key === "Enter" && hits[sel]) { ev.preventDefault(); pick(hits[sel].id); }
          }} />
        {hits.map((s, i) => (
          <div key={s.id} className={`hc-row ${i === sel ? "on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => pick(s.id)}>
            {asks && i === 0 ? <><Icon name="tools" size={14} /><span className="hc-tt">settings</span></>
              : <><Mark st={st(s as (typeof found)[number])} /><span className="hc-tt">{s.title || "untitled"}</span><span className="hc-c">{base(s.folder || s.project || s.cwd)}</span></>}
          </div>
        ))}
      </div>
    </div>
  );
}

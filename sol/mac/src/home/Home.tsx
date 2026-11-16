// The clean Home (#589, Marco's yes 2026-11-02: ~/computer/scratch/sol/atlas-today/home-ux.html). Behind the switch
// (flag.ts); today's Home (work/WorkApp.tsx) runs while it is off. Built from the parts that won their job (jobs.html):
// Mark, the droplets, the eyes, the one talk (WorkTalk and its cards), the one bar (Composer), the pane frame, one menu.
//   Three places side by side, nothing opens as a page that hides where you were: the side (where), the talk (now),
//   the pane (beside: a page, or a second session). Five layouts: side + talk, talk alone, side + talk + pane,
//   talk + big pane, the side opened wide. The side is reached three ways: the arrows, the cursor at the window's left
//   edge (it soft-opens over the talk), the corner button (it folds for good). Settings is a sheet over Home, opened
//   from the side's settings row or ⌘K. ⌘N a new session, ⌘K jump by name, and nothing else is a shortcut; the rest
//   is the arrows, Enter and Esc (keys.ts). The look is a placeholder: black, white, pearl.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { useEngine } from "../useEngine";
import type { AppMode } from "../ModeSwitch";
import { useWork, scoped, working as isWorking } from "../work/useWork";
import { WorkTalk } from "../work/WorkTalk";
import { Composer, type Draft } from "../work/Composer";
import { PaneFrame, PANE_FLOOR, heldFrac } from "../work/Panes";
import { fitRow, useWidth } from "../fit";
import { StageColumn } from "../stage/StageColumn";
import { TALK_WHOLE } from "../stage/model";
import { stageWhole } from "../flag";
import { setNames } from "../stage/carry";
import { FilePane } from "../work/FilePane";
import { FileTree } from "../work/FileTree";   // #954: the IDE lens's tree, behind stage.whole   // stage: joins lens (#701): the IDE lens's file column
import { store as stageStore } from "../stage/engineStore";
import { WorkDrawers } from "../work/WorkSettings";
import { Settings } from "../Settings";
import { Mark as Sol } from "../Mark";
import { Status } from "../creature/indicators";
import { useCreatureDriver } from "../creature/state";
import { follow, dur } from "../motion";
import { Site } from "../Site";
import { seenSession } from "../renovation";
import { composing } from "../ime";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Side, Mark, stOf } from "./Side";
import { Icon } from "../settingsShell";
import { route, shortcut, soft, softOpen, SHUT, type At, type Key, type Kind, type Place, type Soft } from "./keys";
import { base, layoutOf } from "./sideRows";
import { useFrameOn } from "./frameFlag";
// the frame (#630): loaded only with sol.frame on, so with it off nothing of it reaches the face
const Things = lazy(() => import("./Frame").then((m) => ({ default: m.Things })));
import "../work/work.css";
import "./home.css";
import type { Metas } from "./meta";

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
    listens: ["the engine: up, settings, models", "work: sessions, thread, run, live", "sol:open-work (a ping clicked in the notch)", "the window's keys", "sol.home.clean.lay, .panew, .draft"],
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

type Pane = { kind: "session"; id: string } | null;

// #954, stage.whole (whole.html scene 1): a new session opens with the talk alone, and at its foot where you left off in
// the same folder, the last three sessions, each a press away; the stage stays empty glass
const dayOf = (t: number) => { const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === now.toDateString() ? `today ${hm}` : d.toDateString() === y.toDateString() ? `yesterday ${hm}` : d.toLocaleDateString([], { weekday: "short" }); };
function LeftOff({ w, live, onOpen }: { w: ReturnType<typeof useWork>; live: string; onOpen: (id: string) => void }) {
  const me = w.sessions.find((s) => s.id === live);
  // #954: a session not started yet is in the folder it will start in
  const here = me ? null : w.freshCwd || null;
  const past = w.sessions.filter((s) => s.id !== live && !s.archived && !s.gone && (me ? s.project === me.project : !here || s.cwd === here)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  if (!past.length) return null;
  return (
    <div className="st-leftoff" data-part="where you left off">
      <p>where you left off in {me?.project || (here ? base(here) : "") || "this folder"}</p>
      {past.map((s) => <button key={s.id} tabIndex={-1} onClick={() => onOpen(s.id)}>{dayOf(s.updatedAt)} · {s.title || "untitled"}</button>)}
    </div>
  );
}
const LAY0 = "sol.home.clean.lay";
// stage.whole (#954, whole.html): Build is the spine, the talk and the stage; the session side starts folded and is kept
// apart from today's, so turning the switch off finds today's side as it was
const LAY = stageWhole() ? "sol.home.clean.lay.whole" : LAY0;
const SIDE = 264;   // the side's width, --hc-side in home.css
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
  const [sheet, setSheet] = useState(false);
  const [jump, setJump] = useState(false);
  const [aside, setAside] = useState(false);   // + › ask on the side: a question beside the task; Esc leaves it
  const [frac, setFrac] = useState(() => heldFrac(Number(localStorage.getItem("sol.home.clean.panew")) || 0.42));
  const [draft, setDraft] = useState<Draft>(() => ({ text: kept("sol.home.clean.draft", ""), atts: [] }));
  useEffect(() => keepS("sol.home.clean.draft", draft.text), [draft.text]);
  useEffect(() => { try { localStorage.setItem(LAY, JSON.stringify(lay)); } catch { /* private */ } }, [lay]);
  const box = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useCreatureDriver({ seat: "claude" });

  const items = w.thread?.items ?? [];
  const busy = !!w.run?.busy;
  const working = isWorking(w.run);
  const live = w.live;
  const session = live ? w.sessions.find((s) => s.id === live) : undefined;
  const cwd = w.thread?.cwd ?? session?.cwd ?? w.freshCwd;
  const title = live ? session?.title ?? w.thread?.title ?? "" : "new session";
  // the stage (#696, joined #709, the swap #718): a session's main column is the room, its talk docked beside its stage
  // on the engine's blocks (StageColumn.tsx, #734); the pages it wrote and its task list are blocks there
  useEffect(() => { stageStore.connect(w.ask, e.subscribe, { send: e.send, frames: e.subscribeFrames }); }, [w.ask, e.subscribe, e.send, e.subscribeFrames]);
  const pane: Pane = lay.pane?.kind === "session" && lay.pane.id === live ? null : lay.pane;   // the session in the talk is never also the pane
  const setPane = (p: Pane) => setLay((l) => ({ ...l, pane: p }));
  // the talk keeps its room (fit.ts, the rule Life, Work and Cowork follow): with a pane open in a narrow window the pane
  // narrows to its floor, then the side lets go and soft-opens over the talk, its saved pin untouched (#606)
  const vw = useWidth();
  const fit = fitRow(vw, SIDE, lay.side, [frac * vw], [!!pane], PANE_FLOOR);
  const docked = lay.side && (!pane || fit.docked);
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
    const go = () => overlay(setSheet, true);
    window.addEventListener("sol:settings", go);
    return () => window.removeEventListener("sol:settings", go);
  });
  // a ping clicked in the notch opens its session here (App.tsx)
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
    setWide(false);
    w.open(id);
    // after it draws: on its question card if it asks one, else in the bar
    if (then) requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = [...(placeEl("talk")?.querySelectorAll<HTMLElement>(".wtalk > *") ?? [])].reverse().find((t) => t.querySelector(".wperm, .wcard.questions") || t.matches(".wperm"));
      if (card) { memory.current.set("talk", card); put(card); } else type();
    }));
  }, [w.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // a new session, already set to the folder you were in; nothing exists until you send
  const fresh = () => { setWide(false); setSheet(false); w.fresh(session ? session.folder || session.project || session.cwd : w.freshCwd || undefined); requestAnimationFrame(type); };
  const overlay = (set: (v: boolean) => void, v: boolean) => {
    if (v) opener.current = document.activeElement; else requestAnimationFrame(() => { const o = opener.current as HTMLElement | null; if (o?.isConnected) o.focus(); else type(); });
    set(v);
  };

  const h = useRef({ where, route, places, goPlace, put, thingsOf, type, open, setLay, setWide, wide, fresh, overlay, sheet, jump, lay, docked, placeEl, aside, w });
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

  const onBar = (ev: React.MouseEvent) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("button")) return;
    const win = getCurrentWindow();
    if (ev.detail === 2) void win.toggleMaximize().catch(() => {}); else void win.startDragging().catch(() => {});
  };
  const st = stOf(w);
  // talk alone: the side's marks stay in the title bar, the ones that move or wait
  const marks = !docked && !wide;
  const loud = w.sessions.filter((s) => s.id !== live && (st(s) === "needs" || st(s) === "running")).slice(0, 6);
  const layout = layoutOf(docked, !!pane, wide);
  const toBox = (t: string) => { setDraft((d) => ({ ...d, text: d.text ? `${d.text}\n\n${t}` : t })); requestAnimationFrame(type); };
  // a row dropped on the talk's right half opens beside (3b)
  const [dropping, setDropping] = useState(false);
  const onDrop = (ev: React.DragEvent) => { const id = ev.dataTransfer.getData("text/sol-session"); setDropping(false); if (id) { ev.preventDefault(); setPane({ kind: "session", id }); } };

  // ⌘↵ sends from anywhere on the stage (#698): the box's own Enter, wherever the focus is
  const sendNow = useCallback(() => { const t = box.current; if (!t) return; t.focus(); t.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); }, []);
  // the box: at the talk's foot in a session (the talk is a block of the room, #734), under the welcome before one
  const bar = (
    <div data-kind="bar" tabIndex={-1} className="hc-barbox">
      <Site name="composer"><Composer w={w} e={e} busy={busy} working={working} cwd={cwd} asideOn={aside} setAsideOn={setAside} box={box}
        onSent={() => {}} onRec={() => {}} d={draft} setD={setDraft} clean staged={!!live} /></Site>
    </div>
  );
  // a session not started yet has no stage: the welcome (the transcript column went with the swap, #718)
  const welcome = (
    <div className="talk-wrap">
      <div className="talk">
        <div className="hc-new">
          <Sol size={56} live />
          <p>what are we doing in <b>{base(w.freshCwd) || "home"}</b>?</p>
        </div>
      </div>
    </div>
  );

  // #954, stage.whole (whole.html scene 1): a session not started yet is already the frame: the talk alone at its width
  // with where you left off over the box, the stage empty glass beside it. Nothing is asked of the engine until the
  // first send makes the session (its stage and tray come then)
  const fresh1 = stageWhole() ? (
    <div className="st-room whole" data-dock="left" data-lens="app" style={{ "--st-talkw": `${TALK_WHOLE}px` } as React.CSSProperties}>
      <section className="st-talk" data-part="the talk" aria-label="the talk">
        <div className="st-talkwrap"><div className="talk"><div className="talk-inner"><LeftOff w={w} live="" onOpen={(id) => open(id)} /></div></div></div>
        <div className="st-talkbox">{bar}</div>
      </section>
      <div className="st-main"><div className="st-stagebox" /></div>
    </div>
  ) : null;

  return (
    <div ref={root} className="face hc" data-layout={layout} onFocus={onFocusIn}>
      <div className="bar hc-bar" data-tauri-drag-region onMouseDown={onBar}>
        <button className={`hc-sidekey ${lay.side ? "on" : ""}`} onClick={() => setSide(!lay.side)} title={lay.side ? "fold the side" : "open the side"} aria-label={lay.side ? "fold the side" : "open the side"} tabIndex={-1}><i /><i /></button>
        <span className="hc-title" data-tauri-drag-region>{wide ? "all sessions" : title || "untitled"}</span>
        {!wide && cwd && <span className="hc-where">{base(cwd) || "home"}{w.thread?.branch ? ` · ${w.thread.branch}` : ""}</span>}
        <div className="spacer" data-tauri-drag-region />
        {marks && loud.map((s) => <button key={s.id} className="hc-tmark" title={s.title} onClick={() => open(s.id, "card")} tabIndex={-1}><Mark st={st(s)} size={13} /></button>)}
        <Status up={e.up} />
      </div>
      <div className="hc-main">
        {!docked && !wide && !peek && <div className="hc-edge" onMouseEnter={() => setSft((s) => soft(s, "edge"))} aria-hidden />}
        {(docked || wide || peekUp) && <Site name="sidebar"><Side w={w} live={live} wide={wide} onOpen={(id) => open(id)} onBeside={(id) => setPane({ kind: "session", id })}
          onFresh={fresh} onWide={(v) => { setWide(v); requestAnimationFrame(() => h.current.goPlace("side")); }} onSettings={() => overlay(setSheet, true)} onMode={onMode}
          soft={!docked && !wide ? (peek ? "open" : "closing") : undefined} onHover={(on) => setSft((s) => soft(s, on ? "enter" : "leave"))} /></Site>}
        {!wide && (
          <section data-place="talk" tabIndex={-1} className={`hc-talk ${dropping ? "dropping" : ""}`}
            onDragOver={(ev) => { if (ev.dataTransfer.types.includes("text/sol-session")) { ev.preventDefault(); setDropping(true); } }} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
            {framed && <Suspense fallback={null}><Things /></Suspense>}
            <Site name="talk">
              {live
                ? <StageColumn store={stageStore} session={live} items={items} busy={busy} onSend={sendNow} onType={type} writing={draft.text.trim() !== ""}
                    talk={(shown) => <WorkTalk items={shown} busy={busy} w={w} view="normal" onFresh={(text) => { fresh(); if (text) setDraft({ text, atts: [] }); }} onLink={() => {}} onBox={toBox} />}
                    box={bar} empty={<LeftOff w={w} live={live} onOpen={(id) => open(id)} />} files={stageWhole() ? <FileTree w={w} cwd={cwd} onAttach={(path) => toBox(path)} flash={e.flash} /> : <FilePane w={w} cwd={cwd} at={null} onAttach={(path) => toBox(path)} flash={e.flash} />} />
                : fresh1 ?? welcome}
            </Site>
            {!live && !fresh1 && bar}
            {dropping && <div className="hc-drophint">drop: watch it beside</div>}
          </section>
        )}
        {!wide && (
          <div data-place="pane" tabIndex={-1} className="hc-pane">
            <Site name="panes"><PaneFrame open={!!pane} w={fit.widths[0]} max={fit.max(0)} frac={frac} onFrac={(f) => { setFrac(f); localStorage.setItem("sol.home.clean.panew", String(f)); }} tabs={[]} active={null} onPick={() => {}} onClose={() => setPane(null)}>
              {pane?.kind === "session" && <Second w={w} id={pane.id} onClose={() => setPane(null)} onSwap={() => { const was = live; open(pane.id); setPane(was ? { kind: "session", id: was } : null); }} />}
            </PaneFrame></Site>
          </div>
        )}
      </div>
      {sheet && (
        <div className="hc-sheet" onMouseDown={(ev) => ev.target === ev.currentTarget && overlay(setSheet, false)}>
          <div className="hc-sheetcard" role="dialog" aria-label="settings">
            <Site name="settings"><Settings s={e.settings} stale={false} info={e.engineInfo} up={e.up} health={e.health} goBack={e.goBackPlan} send={e.send} models={e.models} efforts={e.efforts}
              sampling={e.sampling} onSet={e.setSettings} onHear={e.hearVoice} first={kept("sol.home.clean.sec", "me")}
              more={(o, t) => <WorkDrawers w={w} open={o} toggle={t} flash={e.flash} />} onClose={() => overlay(setSheet, false)} /></Site>
          </div>
        </div>
      )}
      {jump && <Jump w={w} onPick={(id) => { setJump(false); open(id, "card"); }} onSettings={() => { setJump(false); setSheet(true); }} onClose={() => overlay(setJump, false)} />}
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
      <div tabIndex={-1} data-thing data-kind="pane" className="hc-pin">
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

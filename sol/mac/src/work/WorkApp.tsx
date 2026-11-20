import { ran, setRunner } from "../run";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { useEngine, Seat, Thread } from "../useEngine";
import { useTicketsToEngine } from "../one/tickets";   // build.tickets: the engine told of the switch
import { useAnchor } from "../one/anchor";   // the anchor, the kept session opened as any session (back beside orchestration, 2026-11-19)
import { useOrchestrationToEngine } from "../one/orchestration";   // build.orchestration: the engine told of the switch
import type { AppMode } from "../ModeSwitch";
import { Space } from "../creature/Space";
import { useCreatureDriver } from "../creature/state";
import { BarCells } from "../BarCells";
import { BodyLive } from "../Body";
import { Trail } from "../Trail";
import { FindBar } from "../FindBar";
import { Orb } from "../Orb";
import { Settings } from "../Settings";
import { askedDrawer, type Leave } from "../spine/settings";   // #911: a plain ask opens on the first drawer
import { Conversations } from "../Conversations";
import { CFG, enter, follow, type Follow } from "../motion";
import { fitRow, useDock, useWidth } from "../fit";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWork, type Work } from "./useWork";
import { WorkSidebar } from "./WorkSidebar";
import { WorkTalk } from "./WorkTalk";
import type { TalkView } from "./WorkSteps";
import { Composer, type Draft } from "./Composer";
import { WHICH } from "../useEngine";
import { Menu, type MenuItem } from "./Menu";
import { EDITS as EDIT_TOOLS } from "./Show";
import { useThreadMap } from "./ThreadPane";
import { PaneFrame, PaneBody, heldFrac, PANE_FLOOR, type PR } from "./Panes";
import type { FileAt } from "./FilePane";
import { pagesOf } from "./pages";
import { planOf } from "../stage/StageHere";
import { Beside, popOut } from "./Split";
import { WorkDrawers } from "./WorkSettings";
import { Site } from "../Site";
import { seenSession } from "../renovation";
import { BUTTONS, MORE, button, keyIs, type ButtonCtx, type ButtonDef, type Mark as Marked, type Talk } from "../buttons";
import { Rail } from "../buttons/Rail";
import { pressed } from "../buttons/usage";
import { LifeTalk, putInChatBox } from "../LifeTalk";
import { seatPick, folderIn } from "./seats";
import { readOpen, type Open } from "../migrate";
import { connectPieces } from "../folderPieces/usePieces";   // #1092
import { useBuildPieces } from "../folderPieces/flag";   // #1092
import { usePieces } from "../folderPieces/usePieces";
import { pieceLine } from "../folderPieces/open";
import { PieceRoom } from "../folderPieces/PieceRoom";
import { closePiece, useOpenPiece } from "../folderPieces/open";
import "./work.css";

const VIEWS: TalkView[] = ["normal", "thinking", "verbose"];
// the buttons with a key of their own: pressed from anywhere in Home (beside a chat: the ones that mean something there)
const KEYED = BUTTONS.filter((b) => b.key);
type Kind = Open["kind"];
// the panes open at the right, per kind of talk: a session's tabs are not a chat's
const readTabs = (k: Kind): string[] => {
  try {
    if (k === "chat") { const v = JSON.parse(localStorage.getItem("sol.home.panes") ?? localStorage.getItem("sol.panes") ?? "[]"); return (Array.isArray(v) ? v : ["browser", "desk"].filter((x) => v?.[x])).filter((x) => button(x)?.kind === "pane"); }
    const v = JSON.parse(localStorage.getItem("sol.work.panes") ?? "[]"); return Array.isArray(v) ? v.map((x) => (x === "helper" ? "helpers" : x)).filter((x) => button(x)?.kind === "pane") : [];
  } catch { return []; }
};
const PANES_KEY: Record<Kind, string> = { session: "sol.work.panes", chat: "sol.home.panes" };
// what survives a full reload of the page (an edit to the face's root may reload it, issue #15): the view, the box's words, the scroll
const kept = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(k); return v === null ? d : (JSON.parse(v) as T); } catch { return d; } };
const keepS = (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } };
const base = (p?: string) => (p ? p.replace(/\/+$/, "").split("/").pop() : "");

// Home (#132), on Work's shell: its stage holds one talk, a session in a folder (Claude Code, the sessions on this
// machine, run with the Agent SDK, PROTOCOL.md round 11; the side lists every one under ~/.claude/projects) or a chat (a
// Life conversation, Codex or Claude, LifeTalk.tsx), listed under "Chats" below the folders. A popped-out window
// (solo) is one session only.
export function WorkApp({ e, onMode, solo }: { e: ReturnType<typeof useEngine>; onMode: (m: AppMode) => void; solo?: string }) {
  const w0 = useWork(e, solo);
  // which kind of talk shows; opening a session (from anywhere: the side, a pane, a key) shows the session
  const [kind, setKind] = useState<Kind>(() => (solo ? "session" : readOpen(localStorage).kind));
  const chat = kind === "chat";
  const wOpen = useCallback((id: string) => { setKind("session"); closePiece(); w0.open(id); }, [w0.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const wFresh = useCallback((cwd?: string, o?: { parent?: string }) => { setKind("session"); w0.fresh(cwd, o); }, [w0.fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const w: Work = { ...w0, open: wOpen, fresh: wFresh };
  // a code block's run cell sends for the session showing (run.ts); the engine reads it from the Work transcript (a chat sets its own)
  useEffect(() => { if (!chat) setRunner({ send: e.send, seat: "claude", sessionId: w.current ?? null, work: true }); }, [e.send, w.current, chat]);
  useEffect(() => e.subscribe(ran), [e.subscribe]);
  const piecesOn = useBuildPieces();   // #1092: off, the pieces never ask the engine
  useEffect(() => (piecesOn ? connectPieces(w.ask, e.subscribe) : undefined), [piecesOn, w.ask, e.subscribe]);
  const piece = useOpenPiece();   // #1092: a piece in the room, in place of the session
  const pieceTitle = usePieces(piecesOn && piece ? piece.cwd : null).pieces.find((x) => x.name === piece?.name)?.title;
  const [pinned, setPinned] = useState(() => !solo && localStorage.getItem("sol.work.pin") !== "0");
  // the page in the stage: the talk, Settings (⌘,) or Conversations (⌘;, #253); ?page=conversations opens on it (dev stills)
  const [view, setView] = useState<"chat" | "settings" | "conversations" | "one">(() => (new URLSearchParams(location.search).get("page") === "conversations" ? "conversations" : kept("sol.work.view", "chat")));
  // the drawer Settings opens on: a new key only when settings are closed; when they are up, Settings opens the drawer
  // in place, so an open drawer or a slider mid-drag is kept
  const [settingsFirst, setSettingsFirst] = useState<{ first: string; n: number }>({ first: "work", n: 0 });
  useEffect(() => {
    // a drawer asked for by name (#342, the join card's "sign in": "me")
    // a plain ask (the spine's mark, #911) opens on the first drawer (spine/settings.ts)
    const named = (ev: Event) => { const d = askedDrawer((ev as CustomEvent).detail); if (view === "settings" || d === null) return; setSettingsFirst((s) => ({ first: d, n: s.n + 1 })); setView("settings"); };
    window.addEventListener("sol:settings", named);
    return () => window.removeEventListener("sol:settings", named);
  }, [view]);
  // #1521: a pane the seat opened for the person (spine/openFor.ts): shown as its press shows it
  useEffect(() => {
    const go = (ev: Event) => { const id = (ev as CustomEvent).detail; if (typeof id === "string" && id) { setView("chat"); h.current.showPane(id); } };
    window.addEventListener("sol:pane", go);
    return () => window.removeEventListener("sol:pane", go);
  }, []);
  useEffect(() => keepS("sol.work.view", view), [view]);
  useTicketsToEngine();
  useOrchestrationToEngine();
  useEffect(() => { if (view === "one") setView("chat"); }, [view]);   // a view kept from before #1209, when a page was the kept one session's
  // leaving Settings, told to the window (#911/#1029, App.tsx): a real close (the x, Esc, ⌘, again, the side's button off)
  // may go back to the view Settings was asked from; any other way out (a session, a new session, conversations) stays
  const wasView = useRef(view);
  const closing = useRef(false);
  const shutSettings = () => { closing.current = true; setView("chat"); };
  const flipSettings = (now: string) => { if (now === "settings") shutSettings(); else setView("settings"); };
  useEffect(() => {
    if (wasView.current === "settings" && view !== "settings") window.dispatchEvent(new CustomEvent<Leave>("sol:settings-left", { detail: closing.current ? "closed" : "moved" }));
    closing.current = false; wasView.current = view;
  }, [view]);
  const [talkView, setTalkView] = useState<TalkView>(() => (VIEWS.find((v) => v === localStorage.getItem("sol.work.talkview")) ?? "normal"));
  const cycleView = () => setTalkView((v) => { const n = VIEWS[(VIEWS.indexOf(v) + 1) % 3]; localStorage.setItem("sol.work.talkview", n); return n; });
  const [asideOn, setAsideOn] = useState(false);
  const [rec, setRec] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({ text: kept("sol.work.draft", ""), atts: [] }));
  useEffect(() => keepS("sol.work.draft", draft.text), [draft.text]);
  // words taken back come into an empty box; their files always come back beside what is there (#1448)
  useEffect(() => {
    const u = w.unsent;
    if (!u) return;
    setDraft((d) => { const atts = u.files?.length ? [...d.atts, ...u.files] : d.atts; return d.text.trim() ? { ...d, atts } : { ...d, text: u.text, atts }; });
  }, [w.unsent?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // the panes at the right: the tabs open and the one showing, per kind of talk; the frame's share of the window
  // (pane buttons' ids; "helper" was the helpers' key before they were buttons)
  const [panesBy, setPanesBy] = useState<Record<Kind, { tabs: string[]; active: string | null }>>(() => {
    const p = (k: Kind) => { const t = readTabs(k); return { tabs: t, active: t[t.length - 1] ?? null }; };
    return { session: p("session"), chat: p("chat") };
  });
  const { tabs, active } = panesBy[kind];
  const [frac, setFrac] = useState(() => heldFrac(Number(localStorage.getItem("sol.work.panew")) || 0.42));
  const [helper, setHelper] = useState<string | null>(null);
  const [fileAt, setFileAt] = useState<FileAt | null>(null);
  const [termWant, setTermWant] = useState<{ cwd: string; n: number } | null>(null);
  const [beside, setBeside] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [armed, setArmed] = useState(false);   // the browser pane: the next drag marks (cmd+shift+S)
  const [sheet, setSheet] = useState(false);   // the shortcuts (cmd+/)
  const setPanes = (f: (p: { tabs: string[]; active: string | null }) => { tabs: string[]; active: string | null }) => setPanesBy((all) => {
    const n = f(all[kind]);
    try { localStorage.setItem(PANES_KEY[kind], JSON.stringify(n.tabs)); } catch { /* private */ }
    return { ...all, [kind]: n };
  });
  const showPane = (k: string) => setPanes((p) => ({ tabs: p.tabs.includes(k) ? p.tabs : [...p.tabs, k], active: k }));
  const closePane = (k: string) => setPanes((p) => { const t = p.tabs.filter((x) => x !== k); return { tabs: t, active: p.active === k ? t[t.length - 1] ?? null : p.active }; });
  const setActive = (k: string) => setPanes((p) => ({ ...p, active: k }));
  // a bar key: shows its pane, or closes it when it is the one showing
  const togglePane = (k: string) => (active === k && tabs.includes(k) ? closePane(k) : showPane(k));
  const talk = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // words put in the box under what is there (the diff pane's comments, a review remark), the box focused
  const toBox = (t: string) => { setDraft((d) => ({ ...d, text: d.text ? `${d.text}\n\n${t}` : t })); requestAnimationFrame(() => box.current?.focus()); };
  const stick = useRef<Follow | null>(null);
  const [flw, setFlw] = useState<Follow | null>(null);   // the same follow, for the orb to draw

  const items = w.thread?.items ?? [];
  const busy = !!w.run?.busy;                 // the main thread is in a turn: the talk streams
  // the pages this session wrote (#54); one written anew while the session works opens its pane, as the Claude app's
  // artifact does. A session opened from history only records what it has
  const pages = useMemo(() => pagesOf(items), [items]);
  const pageSeen = useRef<{ id: string | null | undefined; n: number }>({ id: undefined, n: 0 });
  useEffect(() => {
    const n = pages.reduce((s, p) => s + p.n, 0), s = pageSeen.current;
    if (s.id === w.current && n > s.n && busy && view === "chat" && !chat) showPane("page");
    pageSeen.current = { id: w.current, n };
  }, [pages, w.current]); // eslint-disable-line react-hooks/exhaustive-deps
  // a task list is a block on the stage (#696): the list written while it works opens the stage too
  const hasPlan = !!planOf(items);
  useEffect(() => { if (hasPlan && busy && view === "chat" && !chat) showPane("page"); }, [hasPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  const working = busy || !!w.run?.tasks?.length;   // or its background agents still work: esc and the stop button end them too (#45)
  const fresh = (cwd?: string) => { setView("chat"); w.fresh(cwd); requestAnimationFrame(() => box.current?.focus()); };
  // a chat: one from the side, or a new one (its seat picked under the box)
  const openChat = (t: Thread) => { want.current = null; setKind("chat"); setView("chat"); if (t.sessionId !== e.sessionId) e.open(t); };
  const freshChat = () => { want.current = null; setKind("chat"); setView("chat"); if (e.sessionId || e.msgs.length) e.fresh(); };
  // The folder says where a talk works, the switch says who does it (#182; work/seats.ts). Nothing said yet: a GPT pick
  // in a folder is a new GPT talk that runs Codex there, with no folder ("~", none) a chat in Sol's home as before (#141);
  // a Claude pick from a GPT talk is a new session in its folder. A talk under way is carried on: a new talk on the
  // other seat, in the same folder, nested under it, with the gist of it in its box for Marco to send (the engine reads
  // it, work.switch). The talk itself is left as it is
  const switchSeat = async (at: { on: Seat; id?: string | null; cwd?: string | null }, s: Seat, m?: string) => {
    const p = seatPick(s, at);
    if (p.kind === "same") return;
    if (p.kind === "new") {
      if (p.seat === "claude") { fresh(p.cwd); if (m) w.adjust({ model: m }); return; }
      want.current = null; setKind("chat"); setView("chat");
      if (p.cwd) e.freshIn("codex", { cwd: p.cwd }, m); else e.pickSeatModel("codex", m, !!(e.sessionId || e.msgs.length));
      return;
    }
    if (p.from === "codex" && e.busy) { e.flash("a turn is running: stop it first (Esc)"); return; }
    const r = await w.ask<{ brief?: string; cwd?: string; parent?: string; error?: string }>("work.switch", { sessionId: p.id, seat: p.from, title });
    if (r.error || !r.brief) { e.flash(r.error ?? "this talk could not be carried over"); return; }
    if (p.from === "claude") {
      want.current = null;
      if (!e.freshIn("codex", { cwd: folderIn(r.cwd), parent: r.parent }, m)) return;
      putInChatBox(r.brief); setKind("chat"); setView("chat");
    } else {
      setView("chat"); w.fresh(r.cwd, { parent: r.parent }); if (m) w.adjust({ model: m });
      setDraft({ text: r.brief, atts: [] }); requestAnimationFrame(() => box.current?.focus());
    }
  };
  const seatChat = (s: Seat, m?: string) => void switchSeat({ on: "claude", cwd: w.freshCwd }, s, m);               // a new session's box
  const sessionSwitch = (s: Seat, m?: string) => void switchSeat({ on: "claude", id: w.live, cwd: w.freshCwd }, s, m);   // a running one's
  const chatSwitch = (s: Seat, m?: string) => void switchSeat({ on: e.seat, id: e.sessionId, cwd: e.cwd }, s, m);      // a GPT talk's
  // the talk open last comes back from sol.home.open, the one place it is kept: useWork starts on its session, useEngine
  // reopens its chat on connect. Until that chat is back (or another talk is opened) nothing is written over it
  const want = useRef<string | null>(solo ? null : (() => { const o = readOpen(localStorage); return o.kind === "chat" ? o.id : null; })());
  if (want.current && (e.sessionId === want.current || !chat)) want.current = null;
  useEffect(() => {
    if (solo || want.current) return;
    const open: Open = chat ? { kind, id: e.sessionId ?? null, seat: e.seat } : { kind, id: w.current ?? null };
    try { localStorage.setItem("sol.home.open", JSON.stringify(open)); } catch { /* private */ }
  }, [kind, e.sessionId, e.seat, w.current, e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!solo) window.dispatchEvent(new CustomEvent("sol:work-live", { detail: chat ? null : w.live })); }, [chat]); // eslint-disable-line react-hooks/exhaustive-deps
  const chatMark = useRef<Marked>(() => {});
  const toggleSide = () => setPinned((s) => { localStorage.setItem("sol.work.pin", s ? "0" : "1"); return !s; });

  const onBar = (ev: React.MouseEvent) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("button")) return;
    const win = getCurrentWindow();
    if (ev.detail === 2) void win.toggleMaximize().catch(() => {}); else void win.startDragging().catch(() => {});
  };

  // the next or the one before in the side's order (as it shows; a folded group's rows are passed over)
  const step = (d: 1 | -1) => {
    const ids = [...new Set([...document.querySelectorAll<HTMLElement>(".wrow[data-sid]")].map((el) => el.dataset.sid!))];   // a folded section's live row shows twice
    const list = ids.length ? ids : w.sessions.filter((s) => !s.archived).sort((a, b) => b.updatedAt - a.updatedAt).map((s) => s.id);
    if (!list.length) return;
    const i = w.live ? list.indexOf(w.live) : -1;
    setView("chat");
    w.open(list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length]);
  };
  // ctrl+] and ctrl+[: the focus goes round the box, the box beside, the pane frame
  const ring = (d: 1 | -1) => {
    const spots = [box.current, document.querySelector<HTMLElement>(".wbeside .wbbox textarea"), document.querySelector<HTMLElement>(".wpanes:not([inert]) .wstage")].filter(Boolean) as HTMLElement[];
    if (!spots.length) return;
    const i = spots.findIndex((x) => x.contains(document.activeElement));
    spots[(i + d + spots.length) % spots.length].focus();
  };
  const inPane = () => !!document.activeElement?.closest(".wpanes");
  const ctxNow = useRef<ButtonCtx | null>(null);   // the buttons' context as last drawn, for their keys
  const h = useRef({ toggleSide, fresh, stop: w.stop, working, view, w, asideOn, togglePane, showPane, closePane, active, step, ring, inPane, chat, freshChat, e });
  h.current = { toggleSide, fresh, stop: w.stop, working, view, w, asideOn, togglePane, showPane, closePane, active, step, ring, inPane, chat, freshChat, e };
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase(), H = h.current;
      if (ev.metaKey && (ev.key === "/" || ev.key === "?")) { ev.preventDefault(); setSheet((x) => !x); return; }
      if (ev.key === "Escape" && sheetOn.current) { ev.preventDefault(); setSheet(false); return; }
      if ((ev.ctrlKey && !ev.metaKey && ev.key === "Tab") || (ev.metaKey && ev.shiftKey && (ev.code === "BracketRight" || ev.code === "BracketLeft"))) {
        ev.preventDefault(); H.step(ev.key === "Tab" ? (ev.shiftKey ? -1 : 1) : ev.code === "BracketRight" ? 1 : -1); return;
      }
      if (ev.ctrlKey && !ev.metaKey && (ev.code === "BracketRight" || ev.code === "BracketLeft")) { ev.preventDefault(); H.ring(ev.code === "BracketRight" ? 1 : -1); return; }
      // a button's own key: its pane shows or closes, or it is pressed
      const b = KEYED.find((x) => keyIs(ev, x.key!) && (!H.chat || !ctxNow.current || (x.shows?.(ctxNow.current) ?? true)));
      if (b && ctxNow.current) { ev.preventDefault(); pressed(b.id, ctxNow.current); if (b.kind === "pane") H.togglePane(b.id); else b.press?.(ctxNow.current); return; }
      if (ev.metaKey && ev.shiftKey && k === "s") { ev.preventDefault(); H.showPane("browser"); setArmed((a) => !a); return; }
      if (ev.metaKey && !ev.shiftKey && k === "w") { ev.preventDefault(); if (H.chat) { if (H.e.sessionId) H.freshChat(); } else if (H.w.live) H.fresh(H.w.thread?.cwd); return; }
      if (ev.metaKey && !ev.shiftKey && ev.key === "\\" && H.inPane() && H.active) { ev.preventDefault(); H.closePane(H.active); box.current?.focus(); return; }
      // ⌘; in the box of a live session asks on the side, as before; in a new session's box it says there is nothing to
      // ask beside yet (#1542); anywhere else it opens and closes Conversations
      if (ev.metaKey && ev.key === ";") { ev.preventDefault(); if (h.current.view === "chat" && document.activeElement === box.current && !H.chat) { if (h.current.w.live) { setAsideOn((a) => !a); box.current?.focus(); } else H.e.flash("an aside needs an open session"); } else setView((v) => (v === "conversations" ? "chat" : "conversations")); }
      else if (ev.key === "Escape" && (h.current.asideOn || h.current.w.sideAnswer)) { ev.preventDefault(); setAsideOn(false); h.current.w.dropAside(); }
      else if (ev.metaKey && !ev.shiftKey && ev.key === "\\") { ev.preventDefault(); h.current.toggleSide(); }
      else if (ev.metaKey && ev.key === ",") { ev.preventDefault(); flipSettings(h.current.view); }
      else if (ev.metaKey && !ev.shiftKey && k === "n") { ev.preventDefault(); if (H.chat) H.freshChat(); else H.fresh(); }
      else if (ev.key === "Escape" && h.current.view !== "chat") { ev.preventDefault(); if (h.current.view === "settings") shutSettings(); else setView("chat"); }
      else if (ev.key === "Escape" && h.current.working && !H.chat) { ev.preventDefault(); h.current.stop(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // the engine knows what is on screen, so a turn that ends unseen (settings open, a chat showing) leaves its row unread
  useEffect(() => { if (e.up) w.view(view === "chat" && !chat ? w.live : null); }, [view, w.live, e.up, chat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => w.view(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // the talk follows its end; it jumps when a session opens. Set up before the paint, the place he left it too: after
  // the paint, a session opened at the top for a frame and then glided down to where it was
  const has = items.length > 0;
  useLayoutEffect(() => {
    const t = talk.current, inner = t?.querySelector(".talk-inner") as HTMLElement | null;
    if (!t || !inner) { stick.current = null; setFlw(null); return; }
    const f = (stick.current = follow(t, inner));
    setFlw(f);
    const back = kept<{ id?: string | null; y: number } | null>("sol.work.scroll", null);
    if (back && back.id === w.current && back.y >= 0) f.place(back.y); else f.jump();
    const onScroll = () => keepS("sol.work.scroll", { id: w.current, y: t.scrollTop });
    t.addEventListener("scroll", onScroll, { passive: true });
    return () => { t.removeEventListener("scroll", onScroll); f.destroy(); stick.current = null; setFlw(null); };
  }, [view, has, w.current]);
  // a session asked for elsewhere in the window (sol:open-work) opens here; the session open is seen
  useEffect(() => {
    const go = (ev: Event) => { const id = (ev as CustomEvent<string>).detail; if (id) { setView("chat"); w.open(id); } };
    window.addEventListener("sol:open-work", go);
    return () => window.removeEventListener("sol:open-work", go);
  }, [w.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // a new session asked from Home's folders (#1016, side.sorted): it starts in that folder
  useEffect(() => {
    const go = (ev: Event) => { const cwd = (ev as CustomEvent<string>).detail; if (cwd) fresh(cwd); };
    window.addEventListener("sol:new-work", go);
    return () => window.removeEventListener("sol:new-work", go);
  });
  useEffect(() => { if (view === "chat" && w.live && !chat) seenSession(w.live); }, [w.live, view, chat]);

  // the page arrives sliding up when a session opens
  const page = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => { if (!first.current && page.current) enter(page.current, { y: 14, cfg: CFG.travel }); first.current = false; }, [chat ? e.sessionId : w.current, view, chat]);

  const lastIt = items[items.length - 1];
  const streaming = busy && lastIt?.kind === "you" && !!lastIt.live;
  // the creature draws what the engine says (creature/state.ts); Home names the talk's seat and says when dictation runs
  useCreatureDriver({ seat: chat ? e.seat : "claude" });
  useEffect(() => { e.send({ type: "dictation", on: !!rec }); }, [!!rec, e.up]);

  // links in the talk: a session link opens that session; a file link goes to the file pane (sol:file), else opens
  // (root: the folder a relative link is in — the session beside has its own)
  const onLink = (ev: React.MouseEvent, at?: string) => {
    const a = (ev.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href) return;
    const s = /^#(?:session\/|local_)?([0-9a-f]{8}-[0-9a-f-]{27})$/.exec(href);
    if (s) { ev.preventDefault(); ev.stopPropagation(); w.open(s[1]); return; }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("#")) return;
    ev.preventDefault(); ev.stopPropagation();
    const m = /^(.*?)(?:#L(\d+)|:(\d+))?$/.exec(decodeURI(href))!;
    const root = at ?? w.thread?.cwd ?? "";
    const path = m[1].startsWith("/") || m[1].startsWith("~") ? m[1] : `${root.replace(/\/$/, "")}/${m[1]}`;
    const line = m[2] ?? m[3];
    toFile(path, line ? Number(line) : undefined);
  };
  // a path in the talk, right-clicked: open it here, a terminal at its folder, or put it in the box
  const pathOf = (href: string) => {
    const p = decodeURI(href).replace(/(?:#L\d+|:\d+)$/, "");
    const root = w.thread?.cwd ?? "";
    return p.startsWith("/") || p.startsWith("~") ? p : `${root.replace(/\/$/, "")}/${p}`;
  };
  const onTalkMenu = (ev: React.MouseEvent) => {
    const a = (ev.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    const code = !a ? (ev.target as HTMLElement).closest("code") : null;
    const raw = href && !/^[a-z][a-z0-9+.-]*:|^#/i.test(href) ? href : code && /^[~./]?[\w.-]+(\/[\w.@-]+)+\/?$/.test(code.textContent ?? "") ? code.textContent! : null;
    if (!raw) return;
    ev.preventDefault();
    const path = pathOf(raw);
    const folder = path.endsWith("/") ? path : path.replace(/\/[^/]*$/, "");
    setMenu({ x: ev.clientX, y: ev.clientY, items: [
      ...(path.endsWith("/") ? [] : [{ label: "open here", run: () => toFile(path) }]),
      { label: "open a terminal there", run: () => { setTermWant({ cwd: folder, n: Date.now() }); showPane("terminal"); } },
      { label: "put it in the box", run: () => attach(path) },
    ] });
  };
  // @path into the box (the file pane's attach, a link's menu)
  const attach = (p: string) => {
    const root = (cwd ?? "").replace(/\/$/, "");
    const r = root && p.startsWith(root + "/") ? p.slice(root.length + 1) : p;
    const tok = /\s/.test(r) ? `@"${r}" ` : `@${r} `;
    setDraft((d) => ({ ...d, text: d.text && !/\s$/.test(d.text) ? `${d.text} ${tok}` : d.text + tok }));
    requestAnimationFrame(() => box.current?.focus());
  };
  useEffect(() => {
    const hp = (ev: Event) => { setHelper(String((ev as CustomEvent).detail)); showPane("helpers"); };
    window.addEventListener("sol:helper", hp);
    return () => window.removeEventListener("sol:helper", hp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cwd = w.thread?.cwd ?? (w.live ? w.sessions.find((s) => s.id === w.live)?.cwd : w.freshCwd);
  const anchor = useAnchor(w.live, w.open, e.flash, cwd);   // the side foot beside settings (one/OneDoor.tsx)
  const title = chat ? (e.sessionId ? e.threads.find((t) => t.sessionId === e.sessionId)?.title ?? w.sessions.find((s) => s.id === e.sessionId)?.title ?? "" : e.cwd ? "new talk" : "new chat")
    : w.live ? (w.sessions.find((s) => s.id === w.live)?.title ?? w.thread?.title ?? "") : "new session";
  const branch = w.thread?.branch;
  // the thread map: asked for the open session; a split (two writers went on) shows its key in the bar
  const tmap = useThreadMap(w, view === "chat" && !chat ? w.live : null);
  const split = tmap.map?.open.length ?? 0;

  // the bar's count of lines changed on the branch, and its pull request: asked when the folder changes and when a turn ends
  const [stat, setStat] = useState<{ add: number; del: number } | null>(null);
  const [pr, setPr] = useState<PR | null>(null);
  const [prState, setPrState] = useState("");
  const here = useRef(cwd);   // an answer for a folder no longer showing is dropped
  here.current = cwd;
  const askPr = () => {
    if (!cwd || !e.up) { setPr(null); setPrState(""); return; }
    const at = cwd;
    setPrState("loading");
    void w.ask<{ pr?: PR; none?: boolean; error?: string }>("work.pr", { cwd }, 30_000).then((r) => { if (here.current !== at) return; setPr(r.pr ?? null); setPrState(r.pr ? "" : r.none ? "none" : r.error ?? ""); });
  };
  // the count also follows each edit as it lands (it rolls, the show), the pull request only a turn's end
  const edits = items.reduce((n, i) => n + (i.kind === "tool" && i.done && i.ok !== false && EDIT_TOOLS.has(i.name) ? 1 : 0), 0);
  const statAsk = useRef(0);
  useEffect(() => {
    if (!cwd || !e.up) { if (!cwd) setStat(null); return; }
    const at = cwd;
    if (busy && !edits) return;
    const n = ++statAsk.current;   // answers can cross; only the newest one counts
    void w.ask<{ add?: number; del?: number; notGit?: boolean }>("work.diff", { cwd, scope: "all" }).then((r) => here.current === at && n === statAsk.current && setStat(r.notGit || r.add === undefined ? null : { add: r.add, del: r.del ?? 0 }));
    if (!busy) askPr();
  }, [cwd, busy, e.up, edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (url: string) => { import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank")); };
  const toFile = (path: string, line?: number) => { setFileAt({ path, line, n: Date.now() }); showPane("files"); };
  // a pane's way to the stage (the action board's "open in Home"): a session, or a new one in a folder with words in its box
  const toTalk = (to: Talk) => {
    if ("session" in to) { setView("chat"); w.open(to.session); return; }
    fresh(to.cwd || undefined); setDraft({ text: to.text, atts: [] });
  };
  // what the buttons see: the talk, and a session's shell around it (buttons/types.ts)
  const ctx: ButtonCtx = chat ? { mode: "home", session: e.sessionId ?? e.draft, e, w, talk: toTalk, open: showPane, flash: e.flash, armed, setArmed, mark: (m) => chatMark.current(m) } : {
    mode: "home", session: w.live ?? undefined, cwd, e, w, talk: toTalk, open: showPane, flash: e.flash, armed, setArmed,
    mark: (m) => { setDraft((d) => ({ ...d, atts: [...d.atts.filter((a) => a.name !== m.name), { name: m.name, mime: m.mime, dataBase64: m.dataBase64, thumb: m.thumb }],
      text: d.text.includes(m.note) ? d.text : d.text ? `${d.text}\n${m.note}` : m.note })); requestAnimationFrame(() => box.current?.focus()); },
    shell: { items, busy, streaming, branch, view: talkView, cycleView, pages, stat, pr, prState, askPr, openUrl: open,
      fileAt, toFile, attach, toBox, termWant, helper, setHelper, tmap, split },
  };
  ctxNow.current = ctx;
  // beside a chat, a tab left open whose button means nothing there is not drawn (a session's pane in a chat)
  const panes = tabs.map(button).filter((b): b is ButtonDef => !!b && (!chat || (b.shows?.(ctx) ?? true)));
  const onMac = WHICH === "next";
  const appOpen = (app?: string) => { if (cwd) import("@tauri-apps/plugin-opener").then((o) => o.openPath(cwd, app)).catch(() => e.flash("Sol could not open it")); };
  const exportTalk = () => {
    const md = `# ${title || "untitled"}\n\n${cwd ?? ""}\n\n` + items.filter((i) => (i.kind === "me" || i.kind === "you") && i.text)
      .map((i) => `## ${i.kind === "me" ? "Marco" : "Claude"}\n\n${i.text}`).join("\n\n") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${(title || "session").replace(/[^\w -]+/g, "").trim().slice(0, 60) || "session"}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  // what the ⋮ held before the shelf, now at the shelf's foot: a pane without putting it on the rail, and the session's ways out
  const foot: MenuItem[] = [
      { label: "open a pane", sub: MORE.map(button).filter((b): b is ButtonDef => !!b && (b.shows?.(ctx) ?? true)).map((b) => ({ label: b.name, key: b.key, run: () => showPane(b.id), on: tabs.includes(b.id) })) },
      ...(w.live && !solo && !chat ? [{ label: "pop out this session", run: () => { void popOut(w.live!, title).then((ok) => { if (!ok) e.flash("pop-out needs the next Sol.app build"); }); } }] : []),
      ...(onMac && cwd && !chat ? [{ label: "open the folder in", sub: [
        { label: "Finder", run: () => appOpen() },
        { label: "Terminal", run: () => appOpen("Terminal") },
        { label: "Visual Studio Code", run: () => appOpen("Visual Studio Code") },
        { label: "Zed", run: () => appOpen("Zed") },
      ] }] : []),
      ...(items.length && !chat ? [{ label: "export the talk (.md)", run: exportTalk }] : []),
      { label: "shortcuts", key: "⌘/", run: () => setSheet(true) },
  ];
  const paneOpen = panes.length > 0 && view === "chat";
  // the window decides what fits (fit.ts): the talk keeps its width, the pane narrows first, then a pinned side floats
  const vw = useWidth();
  const lay = fitRow(vw, 272, pinned, [frac * vw], [paneOpen], PANE_FLOOR);
  const main = useDock(272, lay.docked);
  const sheetOn = useRef(sheet);
  sheetOn.current = sheet;
  useEffect(() => { if (!tabs.includes("browser")) setArmed(false); }, [tabs]);
  // turn private (#1242): the open chat's or session's, once it has an id; the engine keeps the list (track.ts)
  const privId = piece && view === "chat" ? null : chat ? e.sessionId ?? null : w.live;
  const priv = !!privId && w.privates.includes(privId);
  const flipPrivate = () => { if (privId) void w.setPrivate(privId, !priv).then((r) => { if (r.error) e.flash(r.error); }); };

  return (
    <div className="face wface">
      <Site name="creature"><Space empty={view === "chat" && (chat ? e.msgs.length : items.length) === 0} /></Site>
      <div className="bar" data-tauri-drag-region onMouseDown={onBar}>
        {!solo && <button className={`barbtn ${pinned ? "on" : ""}`} onClick={toggleSide} aria-pressed={pinned} title={pinned ? "unpin the sessions (cmd+\\)" : "pin the sessions (cmd+\\)"}>
          <BarCells kind="side" on={pinned} />
        </button>}
        <div className="wtitle" data-tauri-drag-region>
          {/* #1092: while a piece has the room, the top line names it ("sol-dev › the night"), not the session's words */}
          <span className="tt">{piece && view === "chat" ? pieceLine(piece, pieceTitle) : title || "untitled"}</span>
          {chat && e.cwd && <span className="where" title={e.cwd}>{base(e.cwd)}</span>}
          {cwd && !chat && <span className="where" title={cwd}>{base(cwd)}{branch ? ` · ${branch}` : !w.live && w.copy ? " · a side copy" : ""}</span>}
          {privId && (priv
            ? <><button className="wprivate on" aria-pressed onClick={flipPrivate} title="count this session again, from now on">private</button><span className="where">From now on, nothing from this session is counted.</span></>
            : <button className="wprivate" aria-pressed={false} onClick={flipPrivate} title="stop counting this session: from now on, nothing from it is counted">turn private</button>)}
        </div>
        <div className="spacer" data-tauri-drag-region />
        {view === "chat" && <Rail c={ctx} fallback={chat ? "everyday" : "build"} on={paneOpen ? active : null} onPane={togglePane} foot={foot} />}
      </div>
      <div className="shell">
        {!solo && <Site name="sidebar"><WorkSidebar w={chat ? { ...w, live: null } : w} pinned={lay.docked} view={view} onMode={onMode}
          chats={{ threads: e.threads, active: chat ? e.sessionId ?? null : undefined, onOpen: openChat, onNew: freshChat, onRename: e.rename }}
          lay={{ layout: e.arrangement?.layout.home, share: e.arrangement?.split.share, arrange: e.arrange }} onSettings={() => flipSettings(view)} onConversations={() => setView((v) => (v === "conversations" ? "chat" : "conversations"))} onOne={() => { setView("chat"); anchor.go(); }} onFresh={fresh}
          onBeside={(id) => { if (id === w.live) return; setBeside(id); setView("chat"); }} onPop={(id, t) => { void popOut(id, t).then((ok) => { if (!ok) e.flash("pop-out needs the next Sol.app build"); }); }} /></Site>}
        <div ref={main} className="main">
          <div className="wcols">
          <div ref={page} className="page-in" data-view={view}>
          {piece && view === "chat" ? <PieceRoom at={piece} onSession={(id) => w.open(id)} />
          : view === "settings" ? (
            <Site name="settings"><Settings key={settingsFirst.n} s={e.settings} stale={false} info={e.engineInfo} up={e.up} health={e.health} goBack={e.goBackPlan} send={e.send} subscribe={e.subscribe} models={e.models} efforts={e.efforts} sampling={e.sampling} onSet={e.setSettings} onHear={e.hearVoice}
              first={settingsFirst.first} more={(o, t) => <WorkDrawers w={w} open={o} toggle={t} flash={e.flash} />} onClose={shutSettings} /></Site>
          ) : view === "conversations" ? (
            <Site name="conversations"><Conversations onOpenChat={(sessionId, t) => openChat({ seat: "claude", sessionId, title: t, updatedAt: Date.now() })} /></Site>
          ) : chat ? <LifeTalk key="chat" e={e} mark={chatMark} onSwitch={chatSwitch} onMode={solo ? undefined : onMode} /> : (<>
            <Site name="talk">
            <div className="talk-wrap">
              <div className="talk" ref={talk} onContextMenu={onTalkMenu}>
                {items.length > 0 ? (
                  <div className="talk-inner"><WorkTalk items={items} busy={busy} w={w} view={talkView} onFresh={(text) => { fresh(cwd); if (text) setDraft({ text, atts: [] }); }} onLink={onLink} onBox={toBox} /></div>
                ) : (
                  <div className="empty wempty">
                    <BodyLive size={56} six />
                    {!w.live && <p className="wwhere">{w.freshCwd ? <>a new session in <b title={w.freshCwd}>{w.freshCwd === "~" ? "your home folder" : base(w.freshCwd)}</b></> : "a new session in your home folder"}</p>}
                  </div>
                )}
              </div>
              <Trail scroller={talk} version={items.length} goTo={(y) => stick.current?.goTo(y)} />
              <FindBar scroller={talk} goTo={(y) => stick.current?.goTo(y)} />
              <Orb f={flw} />
            </div>
            </Site>
            <Site name="composer"><Composer w={w} e={e} busy={busy} working={working} cwd={cwd} asideOn={asideOn} setAsideOn={setAsideOn} box={box}
              onSent={() => stick.current?.glide()} onRec={setRec} d={draft} setD={setDraft} toChat={seatChat} switchTo={sessionSwitch} /></Site>
          </>)}
          </div>
          {beside && view === "chat" && !chat && (
            <Site name="talk"><Beside w={w} id={beside} view={talkView} up={e.up} onLink={onLink} onClose={() => setBeside(null)}
              onSwap={() => { const was = w.live; w.open(beside); setBeside(was); }} /></Site>
          )}
          </div>
        </div>
        <Site name="panes"><PaneFrame open={paneOpen} frac={frac} w={lay.widths[0]} max={lay.max(0)} onFrac={(f) => { setFrac(f); localStorage.setItem("sol.work.panew", String(f)); }}
          tabs={panes} active={active} onPick={setActive} onClose={closePane}>
          {panes.map((b) => <PaneBody key={b.id} b={b} c={ctx} hidden={active !== b.id} />)}
        </PaneFrame></Site>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {sheet && <Keys onClose={() => setSheet(false)} />}
    </div>
  );
}

// cmd+/: every key Work answers, in five short columns of what they are for; it drops in on a spring
const KEYS: [string, [string, string][]][] = [
  ["sessions", [["⌘N", "a new session"], ["⌘W", "close it, back to a new one"], ["⌘F  ⌘G", "find in it, the next match"], ["⌃⇥  ⌘⇧]", "the next session"], ["⌃⇧⇥  ⌘⇧[", "the one before"], ["⌘\\", "the side, or the pane in focus"]]],
  ["the box", [["⏎", "send"], ["⇧⏎", "a new line"], ["⇥  →", "take the suggested prompt"], ["⌘;", "ask on the side (in the box)"], ["esc", "stop the turn"]]],
  ["how it runs", [["⌘⇧M", "the next leash"], ["⌘⇧I", "the model"], ["⌘⇧E", "the effort"], ["⌃O", "how much shows"]]],
  ["panes", [["⌘⇧D", "changes"], ["⌃`", "terminal"], ["⌘⇧B", "browser"], ["⌘⇧S", "mark the page"], ["⌘⇧P", "the page it wrote"], ["⌘⇧O", "the show"], ["⌃]  ⌃[", "focus round the box, beside, panes"]]],
  ["anywhere", [["⌘,", "settings"], ["⌘;", "conversations"], ["1–9", "pick in a menu"], ["⌘/", "these keys"]]],
];
function Keys({ onClose }: { onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (el.current) enter(el.current, { y: 18, cfg: CFG.travel }); }, []);
  return (
    <div className="wkeysheet" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div ref={el} className="wkeycard" role="dialog" aria-label="shortcuts">
        {KEYS.map(([head, rows]) => (
          <section key={head}>
            <h4>{head}</h4>
            {rows.map(([k, what]) => <div key={k} className="kr"><kbd>{k}</kbd><span>{what}</span></div>)}
          </section>
        ))}
      </div>
    </div>
  );
}

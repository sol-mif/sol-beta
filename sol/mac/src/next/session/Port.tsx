// The session's page, a port of the old face's (#1615 BR1; Marco 21:20: "the session view is a PORT, not a rebuild"): a
// session opened (a folder's card or chip, a session row, Working now, ⌘J, any goto) is a tab, and the tab's body is
// Sol's own session view, its parts by import and never redrawn: the talk (work/WorkTalk, with Trail, FindBar and Orb),
// the box (work/Composer), the bar's Rail and the panes at the right (work/Panes PaneFrame/PaneBody: the stage the
// session made, changes, terminal, files, browser…), all on useWork as a pop-out window reads it (solo: one session, it
// keeps nothing of the machine's Work state). WorkApp is the host it copies, less what the new face already draws (the
// sessions' side, Settings, Conversations, the creature, the window's drag bar). A Codex talk is the old face's own
// LifeTalk, opened on the GPT seat as the old side opened it.
// What Near drew that the old view has not, kept here: the bar's way back to the canvas ("← Canvas", the Canvas tab
// does the same), the session's table (near/Table.tsx: what it uses and made, a drop target) behind "Its table", and an
// ask ⌘J opened inside it (near/Talk AskCard), over the talk. `compact` (beside another piece, or kept beside the
// canvas) draws only the talk and the box.
// On the dev page and in tests the engine is the fixture's (session/fixture.ts); live it is the face's own link.
// DOM hooks: [data-port] (the session id), [data-port-back], [data-port-table], [data-port-kind].
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { M, MODE, hooks, regionOf, render, useNext, type Piece } from "../cv/index.ts";
import { setFocus } from "../near/runs.ts";
import { engine } from "../cv/wire/near.ts";
import type { Engine } from "../cv/wire/types.ts";
import { tabShown } from "../cv/moves/tabs.ts";
import { sessionOpen } from "../cv/moves/talkto.ts";   // the pill talks to a session kept beside the canvas: then it is its box
import { asksInside } from "../near/Session.tsx";
import { AskCard } from "../near/Talk.tsx";
import { Table } from "../near/Table.tsx";
import { FolderMark, taskOf } from "../tabs/Label.tsx";
import { fixtureEngine } from "./fixture.ts";
import { useWork, type Work } from "../../work/useWork";
import { WorkTalk } from "../../work/WorkTalk";
import type { TalkView } from "../../work/WorkSteps";
import { Composer, type Draft } from "../../work/Composer";
import { Menu, type MenuItem } from "../../work/Menu";
import { EDITS as EDIT_TOOLS } from "../../work/Show";
import { useThreadMap } from "../../work/ThreadPane";
import { PaneFrame, PaneBody, heldFrac, PANE_FLOOR, type PR } from "../../work/Panes";
import type { FileAt } from "../../work/FilePane";
import { pagesOf } from "../../work/pages";
import { planOf } from "../../stage/StageHere";
import { Trail } from "../../Trail";
import { FindBar } from "../../FindBar";
import { Orb } from "../../Orb";
import { LifeTalk } from "../../LifeTalk";
import { follow, type Follow } from "../../motion";
import { fitRow } from "../../fit";
import { MORE, button, type ButtonCtx, type ButtonDef, type Mark as Marked, type Talk } from "../../buttons";
import { Rail } from "../../buttons/Rail";
// the old face's whole sheet, as live loads it for the window (main.tsx): the view's shell, panes and rail are drawn
// there, so the dev page, which loads only the new face, draws the session as Sol.app does
import "../../face.css";
import "../../work/work.css";
import "./port.css";
import "./session.css";   // the session UI drawn in the new face (BR1, builder R)

const VIEWS: TalkView[] = ["normal", "thinking", "verbose"];
const PANES_KEY = "sol.work.panes";   // the same panes a session opened in the old face, kept as it kept them
const readTabs = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(PANES_KEY) ?? "[]"); return Array.isArray(v) ? v.map((x) => (x === "helper" ? "helpers" : x)).filter((x) => button(x)?.kind === "pane") : []; } catch { return []; }
};
const base = (p?: string) => (p ? p.replace(/\/+$/, "").split("/").pop() : "");
const flash = (t: string) => hooks.flash?.(t);
let fixtureE: Engine | null = null;
/** the engine the port reads: the face's own link live, the fixture's one engine on the dev page */
const engineNow = (): Engine | null => (MODE === "live" ? engine() : (fixtureE ??= fixtureEngine(flash)));

/** the way back: the Canvas tab when this is a tab in front, else one step out of Near */
export function backToCanvas(): void { if (tabShown()) M.tabFront(null); else M.out(); }

/** a new session's first send: the starter's own start (cv/moves/near.ts startCard: its folder, place and purpose, live a
 *  work.say { fresh } in the folder the box picked), and the piece becomes the session in this same tab. It starts a tick
 *  later, once the box has cleared (the tab turns into the session's own view as it starts); words that did not start go
 *  back in the box */
type Picks = { model?: unknown; effort?: unknown; mode?: unknown; fast?: unknown; copyOf?: true };
function startHere(p: Piece, text: string, files: unknown[], cwd: string, picks: Picks, back: (t: string) => void): boolean {
  if (files.length) { flash("Say what it should do first; give it the files once it has started."); return false; }
  if (!text.trim()) return false;
  setTimeout(() => {
    p.words = text.trim();
    if (cwd) p.cwd = cwd;
    Object.assign(p, picks);   // the box's model, effort, mode and fast, and a side copy, go with the start (near.ts startCard)
    const r = M.start(p.id) as { ok?: boolean; why?: string } | undefined;
    if (!r || r.ok === false) { back(text); flash(r?.why ? `It did not start: ${r.why}.` : "It did not start."); }
  }, 0);
  return true;
}

/** a session's page: the old face's session view on this piece */
export default function Port({ p, compact = false }: { p: Piece; compact?: boolean }) {
  const e = engineNow();
  // a new session's tab (a starter) is the view fresh: no session until its first send (startHere)
  const sid = String(p.sessionId ?? (p.kind === "starter" ? "new:" + p.id : p.id));
  if (!e) return <div className="sport sport-away" data-port={sid}><Head p={p} compact={compact} /><p className="sport-none">The engine is away; the session comes back with it.</p></div>;
  if (MODE === "live" && p.seat === "codex") return <Codex key={sid} e={e} p={p} sid={sid} compact={compact} />;
  return <Claude key={sid} e={e} p={p} sid={sid} compact={compact} />;
}

/** the head the port puts over the old view: the way back, the task and its folder's mark */
function Head({ p, compact, children, right }: { p: Piece; compact: boolean; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="sport-bar">
      {compact ? null : <button type="button" className="sport-back" data-port-back onClick={backToCanvas} title="Back to the canvas (the Canvas tab does the same)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>Canvas</button>}
      {/* compact, the frame around it (kept/Kept, near/Piece) already names the session: its head is where it works */}
      <div className="wtitle">{compact ? null : <><FolderMark p={p} /><span className="tt">{taskOf(p)}</span></>}{children}</div>
      <div className="sport-gap" />
      {right}
    </div>
  );
}

/** a Codex talk: the old face's LifeTalk on the GPT seat, opened on this talk as the old side opened it */
function Codex({ e, p, sid, compact }: { e: Engine; p: Piece; sid: string; compact: boolean }) {
  const mark = useRef<Marked>(() => {});
  useEffect(() => { if (e.sessionId !== sid) e.open({ seat: "codex", sessionId: sid, title: taskOf(p), updatedAt: new Date(Number(p.last ?? Date.now())).toISOString() }); }, [sid, e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sport" data-port={sid} data-port-kind="codex">
      <div className="face wface">
      <Head p={p} compact={compact}><small className="tag" title="a talk with GPT (Codex)">gpt</small></Head>
      <div className="shell"><div className="main"><div className="wcols"><div className="page-in" data-view="chat">
        {e.sessionId === sid ? <LifeTalk key="chat" e={e} mark={mark} /> : <p className="sport-none">Opening the talk…</p>}
      </div></div></div></div>
    </div>
    </div>
  );
}

/** a Claude Code session: WorkApp's stage for one session (its talk, its box, its rail and panes) */
function Claude({ e, p, sid, compact }: { e: Engine; p: Piece; sid: string; compact: boolean }) {
  const w0 = useWork(e, sid);
  // a session it names opens as its own tab; a new one is the tab row's ＋ (a starter as a tab)
  const starter = p.kind === "starter";
  // on a new one the box's folder pick is its folder (the folder it was started from, until another is picked)
  const w: Work = { ...w0, open: (id: string) => { M.goto(id); }, fresh: (cwd?: string) => { if (starter && cwd) w0.setFreshCwd(cwd); else M.tabNew(); },
    ...(starter ? { say: (text: string, files?: unknown[]) => startHere(p, text, files ?? [], w0.freshCwd, { model: w0.model, effort: w0.effort, mode: w0.mode, fast: w0.fast, ...(w0.copy ? { copyOf: true } : {}) }, (t) => setDraft((d) => ({ ...d, text: d.text || t }))) } : {}) };
  // the starter card took keys while it had the focus (near.ts nearKeys); here the box takes them
  useEffect(() => { if (starter) { setFocus(null); w0.setFreshCwd(String(regionOf(p.region)?.path ?? "")); render(); } }, [starter]);   // eslint-disable-line react-hooks/exhaustive-deps
  const root = useRef<HTMLDivElement>(null);
  const talk = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const stick = useRef<Follow | null>(null);
  const [flw, setFlw] = useState<Follow | null>(null);
  const [talkView, setTalkView] = useState<TalkView>(() => (VIEWS.find((v) => v === localStorage.getItem("sol.work.talkview")) ?? "normal"));
  const cycleView = () => setTalkView((v) => { const n = VIEWS[(VIEWS.indexOf(v) + 1) % 3]; localStorage.setItem("sol.work.talkview", n); return n; });
  const [asideOn, setAsideOn] = useState(false);
  // a new session's unsent words are kept on its starter, so its tab left and come back to has them, and is not closed
  // as empty (cv/moves/tabs.ts leftStarter)
  const [draft, setDraft] = useState<Draft>(() => ({ text: starter ? String(p.draft ?? "") : "", atts: [] }));
  useEffect(() => { if (starter) p.draft = draft.text; }, [starter, draft.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const [panes, setPanesS] = useState(() => { const t = readTabs(); return { tabs: t, active: t[t.length - 1] ?? null as string | null }; });
  const [frac, setFrac] = useState(() => heldFrac(Number(localStorage.getItem("sol.work.panew")) || 0.42));
  const [helper, setHelper] = useState<string | null>(null);
  const [fileAt, setFileAt] = useState<FileAt | null>(null);
  const [termWant, setTermWant] = useState<{ cwd: string; n: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [armed, setArmed] = useState(false);
  const [table, setTable] = useState(false);
  const [vw, setVw] = useState(() => (typeof innerWidth === "number" ? innerWidth : 1440));
  useNext((_d, s) => [s.askHere]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setVw(el.clientWidth || innerWidth));
    ro.observe(el); setVw(el.clientWidth || innerWidth);
    return () => ro.disconnect();
  }, []);

  const setPanes = (f: (q: typeof panes) => typeof panes) => setPanesS((all) => { const n = f(all); try { localStorage.setItem(PANES_KEY, JSON.stringify(n.tabs)); } catch { /* private */ } return n; });
  const showPane = (k: string) => setPanes((q) => ({ tabs: q.tabs.includes(k) ? q.tabs : [...q.tabs, k], active: k }));
  const closePane = (k: string) => setPanes((q) => { const t = q.tabs.filter((x) => x !== k); return { tabs: t, active: q.active === k ? t[t.length - 1] ?? null : q.active }; });
  const togglePane = (k: string) => (panes.active === k && panes.tabs.includes(k) ? closePane(k) : showPane(k));
  const toBox = (t: string) => { setDraft((d) => ({ ...d, text: d.text ? `${d.text}\n\n${t}` : t })); requestAnimationFrame(() => box.current?.focus()); };

  const items = w.thread?.items ?? [];
  const busy = !!w.run?.busy;
  const working = busy || !!w.run?.tasks?.length;
  const lastIt = items[items.length - 1];
  const streaming = busy && lastIt?.kind === "you" && !!lastIt.live;
  // the pages it wrote and its task list open the stage pane while it works, as in the old face (#54, #696)
  const pages = useMemo(() => pagesOf(items), [items]);
  const pageSeen = useRef(0);
  useEffect(() => { const n = pages.reduce((s, x) => s + x.n, 0); if (n > pageSeen.current && busy && !compact) showPane("page"); pageSeen.current = n; }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasPlan = !!planOf(items);
  useEffect(() => { if (hasPlan && busy && !compact) showPane("page"); }, [hasPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  // words taken back come into an empty box (#1448)
  useEffect(() => { const u = w.unsent; if (u) setDraft((d) => (d.text.trim() ? d : { ...d, text: u.text })); }, [w.unsent?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // the engine knows this session is on screen, so a turn it ends here is seen
  // (a starter's "new:" id is no session yet: the engine is told none, else it answers "bad session id", BR1 gate 1b)
  const real = sid.startsWith("new:") ? null : sid;
  useEffect(() => { if (e.up) w.view(real); return () => w.view(null); }, [real, e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  // the talk follows its end and jumps when it opens
  const has = items.length > 0;
  useLayoutEffect(() => {
    const t = talk.current, inner = t?.querySelector(".talk-inner") as HTMLElement | null;
    if (!t || !inner) { stick.current = null; setFlw(null); return; }
    const f = (stick.current = follow(t, inner));
    setFlw(f); f.jump();
    return () => { f.destroy(); stick.current = null; setFlw(null); };
  }, [has, sid]);

  const cwd = w.thread?.cwd ?? (p.cwd as string | undefined) ?? w.sessions.find((s) => s.id === sid)?.cwd;
  const branch = w.thread?.branch;
  const toFile = (path: string, line?: number) => { setFileAt({ path, line, n: Date.now() }); showPane("files"); };
  const attach = (path: string) => {
    const r0 = (cwd ?? "").replace(/\/$/, ""), r = r0 && path.startsWith(r0 + "/") ? path.slice(r0.length + 1) : path;
    const tok = /\s/.test(r) ? `@"${r}" ` : `@${r} `;
    setDraft((d) => ({ ...d, text: d.text && !/\s$/.test(d.text) ? `${d.text} ${tok}` : d.text + tok }));
    requestAnimationFrame(() => box.current?.focus());
  };
  // links in the talk: a session opens as its tab; a file goes to the files pane
  const onLink = (ev: React.MouseEvent) => {
    const a = (ev.target as HTMLElement).closest("a"), href = a?.getAttribute("href");
    if (!a || !href) return;
    const s = /^#(?:session\/|local_)?([0-9a-f]{8}-[0-9a-f-]{27})$/.exec(href);
    if (s) { ev.preventDefault(); ev.stopPropagation(); M.goto(s[1]); return; }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("#")) return;
    ev.preventDefault(); ev.stopPropagation();
    const m = /^(.*?)(?:#L(\d+)|:(\d+))?$/.exec(decodeURI(href))!;
    const at = m[1].startsWith("/") || m[1].startsWith("~") ? m[1] : `${(cwd ?? "").replace(/\/$/, "")}/${m[1]}`;
    toFile(at, m[2] ?? m[3] ? Number(m[2] ?? m[3]) : undefined);
  };
  // a path right-clicked in the talk: open it here, a terminal at its folder, or put it in the box
  const onTalkMenu = (ev: React.MouseEvent) => {
    const a = (ev.target as HTMLElement).closest("a"), href = a?.getAttribute("href");
    const code = !a ? (ev.target as HTMLElement).closest("code") : null;
    const raw = href && !/^[a-z][a-z0-9+.-]*:|^#/i.test(href) ? href : code && /^[~./]?[\w.-]+(\/[\w.@-]+)+\/?$/.test(code.textContent ?? "") ? code.textContent! : null;
    if (!raw) return;
    ev.preventDefault();
    const q = decodeURI(raw).replace(/(?:#L\d+|:\d+)$/, ""), path = q.startsWith("/") || q.startsWith("~") ? q : `${(cwd ?? "").replace(/\/$/, "")}/${q}`;
    const folder = path.endsWith("/") ? path : path.replace(/\/[^/]*$/, "");
    setMenu({ x: ev.clientX, y: ev.clientY, items: [
      ...(path.endsWith("/") ? [] : [{ label: "open here", run: () => toFile(path) }]),
      { label: "open a terminal there", run: () => { setTermWant({ cwd: folder, n: Date.now() }); showPane("terminal"); } },
      { label: "put it in the box", run: () => attach(path) },
    ] });
  };

  // the bar's count of lines changed and its pull request, asked when the folder changes and a turn ends (WorkApp)
  const tmap = useThreadMap(w, real);
  const split = tmap.map?.open.length ?? 0;
  const [stat, setStat] = useState<{ add: number; del: number } | null>(null);
  const [pr, setPr] = useState<PR | null>(null);
  const [prState, setPrState] = useState("");
  const here = useRef(cwd);
  here.current = cwd;
  const askPr = () => {
    if (!cwd || !e.up) { setPr(null); setPrState(""); return; }
    const at = cwd;
    setPrState("loading");
    void w.ask<{ pr?: PR; none?: boolean; error?: string }>("work.pr", { cwd }, 30_000).then((r) => { if (here.current !== at) return; setPr(r.pr ?? null); setPrState(r.pr ? "" : r.none ? "none" : r.error ?? ""); });
  };
  const edits = items.reduce((n, i) => n + (i.kind === "tool" && i.done && i.ok !== false && EDIT_TOOLS.has(i.name) ? 1 : 0), 0);
  const statAsk = useRef(0);
  useEffect(() => {
    if (!cwd || !e.up || compact) { if (!cwd) setStat(null); return; }
    const at = cwd;
    if (busy && !edits) return;
    const n = ++statAsk.current;
    void w.ask<{ add?: number; del?: number; notGit?: boolean }>("work.diff", { cwd, scope: "all" }).then((r) => here.current === at && n === statAsk.current && setStat(r.notGit || r.add === undefined ? null : { add: r.add, del: r.del ?? 0 }));
    if (!busy) askPr();
  }, [cwd, busy, e.up, edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const openUrl = (url: string) => { import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank")); };
  const toTalk = (to: Talk) => { if ("session" in to) M.goto(to.session); else toBox(to.text); };
  const ctx: ButtonCtx = {
    mode: "home", session: sid, cwd, e, w, talk: toTalk, open: showPane, flash, armed, setArmed,
    mark: (m) => { setDraft((d) => ({ ...d, atts: [...d.atts.filter((a) => a.name !== m.name), { name: m.name, mime: m.mime, dataBase64: m.dataBase64, thumb: m.thumb }], text: d.text.includes(m.note) ? d.text : d.text ? `${d.text}\n${m.note}` : m.note })); requestAnimationFrame(() => box.current?.focus()); },
    shell: { items, busy, streaming, branch, view: talkView, cycleView, pages, stat, pr, prState, askPr, openUrl, fileAt, toFile, attach, toBox, termWant, helper, setHelper, tmap, split },
  };
  useEffect(() => {
    const hp = (ev: Event) => { setHelper(String((ev as CustomEvent).detail)); showPane("helpers"); };
    window.addEventListener("sol:helper", hp);
    return () => window.removeEventListener("sol:helper", hp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = panes.tabs.map(button).filter((b): b is ButtonDef => !!b);
  const foot: MenuItem[] = [
    { label: "open a pane", sub: MORE.map(button).filter((b): b is ButtonDef => !!b && (b.shows?.(ctx) ?? true)).map((b) => ({ label: b.name, key: b.key, run: () => showPane(b.id), on: panes.tabs.includes(b.id) })) },
  ];
  const paneOpen = !compact && shown.length > 0;
  const lay = fitRow(vw, 0, false, [frac * vw], [paneOpen], PANE_FLOOR);
  const inside = asksInside(p.id);
  const priv = w.privates.includes(sid);
  // ⋯'s card: fixed under the button (the rail's own row is placed into it by session.css from these two numbers); a
  // press outside the card, the button and the rail's row closes it
  // the Composer's row, where the bar's "To:" goes (found after each render: the row can be drawn anew)
  const [toAt, setToAt] = useState<Element | null>(null);
  const [fnAt, setFnAt] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const at = root.current?.querySelector(".ask-line") ?? null, fn = root.current?.querySelector(".ask-inner > .picker") ?? null;
    if (at !== toAt) setToAt(at);
    if (fn !== fnAt) setFnAt(fn);
  });
  const [more, setMore] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const openMore = (on: boolean) => {
    const r = moreBtn.current?.getBoundingClientRect();
    if (on && r) { root.current?.style.setProperty("--more-r", String(Math.round(innerWidth - r.right))); root.current?.style.setProperty("--more-t", String(Math.round(r.bottom))); }
    setMore(on);
  };
  useEffect(() => {
    if (!more) return;
    const out = (ev: PointerEvent) => { const t = ev.target as Element | null; if (!t?.closest?.(".sport-more, [data-port-more], .railrow, .menu")) setMore(false); };
    document.addEventListener("pointerdown", out, true);
    return () => document.removeEventListener("pointerdown", out, true);
  }, [more]);
  // a menu the old parts open lands at the body, outside the new face's root: while this view is shown, it is marked as
  // the new face's, so it reads the same paper and ink (the model card is one)
  useEffect(() => {
    if (compact) return;
    const mark = (n: Node) => { if (n instanceof HTMLElement && n.classList.contains("menu")) { n.dataset.face = "next"; n.classList.add("sport-menu"); } };
    const mo = new MutationObserver((rs) => rs.forEach((r) => r.addedNodes.forEach(mark)));
    mo.observe(document.body, { childList: true });
    return () => mo.disconnect();
  }, [compact]);
  const flipPrivate = () => void w.setPrivate(sid, !priv).then((r) => { if (r.error) flash(r.error); });

  return (
    <div ref={root} className={`sport${compact ? " sport-compact" : ""}${more ? " sport-moreon" : ""}`} data-port={sid} data-port-kind="claude">
      <div className="face wface">
      <Head p={p} compact={compact} right={compact ? null : <>
        <Rail c={ctx} fallback="build" on={paneOpen ? panes.active : null} onPane={togglePane} foot={foot} />
        {/* ⋯ (Marco's draft 2): Its table, turn private and the rail's Build row (its presets, file it, normal, ＋ and its
            ⋯) stand in one card under it; each is the same button as before, so a press does what it did */}
        <button type="button" ref={moreBtn} className={`sport-more-k${more ? " on" : ""}`} data-port-more aria-expanded={more} title="more: its table, private, the Build row" onClick={() => openMore(!more)}>⋯</button>
        {more ? <div className="sport-more" data-port-more-card>
          <button type="button" className={`sport-tb${table ? " on" : ""}`} data-port-table aria-pressed={table} onClick={() => setTable((x) => !x)} title="What it uses and what it made; drop anything here to give it to the session">Its table</button>
          {priv
            ? <button className="wprivate on" aria-pressed onClick={flipPrivate} title="count this session again, from now on">private</button>
            : <button className="wprivate" aria-pressed={false} onClick={flipPrivate} title="stop counting this session: from now on, nothing from it is counted">turn private</button>}
          <i className="sport-more-rail" />
        </div> : null}
      </>}>
        {cwd ? <span className="where" title={cwd}>{base(cwd)}{branch ? ` · ${branch}` : ""}</span> : null}
      </Head>
      <div className="shell">
        <div className="main">
          <div className="wcols">
            <div className="page-in" data-view="chat">
              <div className="talk-wrap">
                <div className="talk" ref={talk} onContextMenu={onTalkMenu}>
                  {items.length > 0 ? (
                    <div className="talk-inner"><WorkTalk items={items} busy={busy} w={w} view={talkView} onFresh={(text) => { if (text) toBox(text); }} onLink={onLink} onBox={toBox} /></div>
                  ) : <div className="empty wempty"><p className="wwhere">{starter ? `A new session in ${regionOf(p.region)?.name ?? "its folder"}. Say what it should do: your first send starts it.` : w.loaded || e.up ? "Nothing said in it yet." : "Opening the session…"}</p></div>}
                </div>
                <Trail scroller={talk} version={items.length} goTo={(y) => stick.current?.goTo(y)} />
                <FindBar scroller={talk} goTo={(y) => stick.current?.goTo(y)} />
                <Orb f={flw} />
              </div>
              {/* an ask is pinned above the box, never in the scroll (Marco's draft 2): the canvas's own card */}
              {inside.length ? <div className="sport-asks">{inside.map((a) => <AskCard key={a.id} a={a} />)}</div> : null}
              {/* the box reads as the canvas bar: "To: <session>" after its ＋, "hold fn to talk" at its end; both are words
                  put into the Composer's own row, which keeps all its wiring */}
              {toAt && !compact ? createPortal(<span className="sport-to">To: <b>{taskOf(p)}</b></span>, toAt) : null}
              {fnAt && !compact ? createPortal(<span className="sport-fn">hold <kbd>fn</kbd> to talk</span>, fnAt) : null}
              {compact && sessionOpen() === p.id ? null : <Composer w={w} e={e} busy={busy} working={working} cwd={cwd} asideOn={asideOn} setAsideOn={setAsideOn} box={box}
                onSent={() => stick.current?.glide()} onRec={() => {}} d={draft} setD={setDraft} />}
            </div>
          </div>
        </div>
        {table && !compact ? <aside className="sport-table"><Table pid={p.id} name={taskOf(p)} /></aside> : null}
        {compact ? null : (
          <PaneFrame open={paneOpen} frac={frac} w={lay.widths[0]} max={lay.max(0)} onFrac={(f) => { setFrac(f); localStorage.setItem("sol.work.panew", String(f)); }}
            tabs={shown} active={panes.active} onPick={(k) => setPanes((q) => ({ ...q, active: k }))} onClose={closePane}>
            {shown.map((b) => <PaneBody key={b.id} b={b} c={ctx} hidden={panes.active !== b.id} />)}
          </PaneFrame>
        )}
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
    </div>
  );
}

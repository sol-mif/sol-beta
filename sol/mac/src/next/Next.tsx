// The new face's shell (#1604, docs/port/slices.md "Before the night: the prep"; the mockup's merge/shell.html and
// shell.js): the sidebar (Find, Needs you, the canvas with its Diary row and its Build and Life folders, the AIs, Cowork,
// Social, Settings), the top bar (the crumb, the keys for here, "Moves ?", the "N working" chip), the view routed over S
// into the slices' named slots (slots.ts), the ask line, the talk pill, Find (⌘P), the outline twin and a toast.
// DOM hooks the counts read: #view #line #crumb #press #outline #overlay #say. Live (a real Sol) the store starts empty
// and the wires fill it; the dev page (dev.tsx) loads the fixture and draws <Shell/> itself.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as RMouseEvent } from "react";
import {
  D, S, M, SCEN, above, act, asksInRegion, asksOn, attach, answer, findByWords, hooks, lineAsk, open, piecesIn, regionOf, say, setMode,
  useNext, working, zoneOrder, SCN,
} from "./cv/index.ts";
import type { Engine } from "./cv/wire/types.ts";
import { Slot, type SlotName, type SlotProps } from "./slots.ts";
import { crumbOf, needsCount, onPeople } from "./people/queue.ts";   // slices 8+9: the people's pages, crumb and count
import { fitSide } from "./side.ts";   // round 6 · F2: the sidebar fits
import "../palette.css";
import "../kit/next.css";
import "./next.css";

/** the new face in a real Sol (App.tsx, ui.next on): live, the wires attached once, the shell drawn */
export default function Next({ e }: { e: Engine }) {
  const first = useRef(e);
  useEffect(() => { setMode("live"); return attach(first.current); }, []);
  return <Shell />;
}

/** every move with its key (shell.js MOVES): pressable by pointer (count 11), never a toolbar */
export const MOVES: [string, string, string][] = [["Back", "back", "⌘["], ["Forward", "fwd", "⌘]"], ["Zoom out", "out", "⌘↑"], ["Zoom in", "dive", "⌘↓"],
  ["The whole canvas", "map", "⌘0"], ["Next ask", "next", "⌘J"], ["Find", "goto", "⌘P"], ["Beside", "beside", "⌘\\"], ["Follow an AI", "follow", "⌘⇧F"],
  ["Recent", "recent", "⌘E"], ["Set mark 1", "markSet:1", "⌘⇧1"], ["Go to mark 1", "markGo:1", "⌘1"], ["Too much", "tooMuch", "⌘⇧H"]];

/** the shell: `only` draws one slot alone in #view (the dev page's ?slot=, for a slice tried before the others land) */
export function Shell({ only }: { only?: { name: SlotName; props: SlotProps } }) {
  useNext(() => 0);   // the shell redraws on every change
  const [moves, setMoves] = useState(false);
  const [find, setFind] = useState(false);
  const [toast, setToast] = useState<{ t: string; n: number } | null>(null);

  useEffect(() => {
    hooks.flash = (t) => setToast((o) => ({ t, n: (o?.n ?? 0) + 1 }));   // it fades by its own animation (next.css), then goes
    hooks.find = () => setFind(true);
    return () => { hooks.flash = null; hooks.find = null; };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      for (const k of hooks.keys) if (k(e)) { e.preventDefault(); return; }
      const t = e.target as HTMLElement | null;
      if (t?.matches?.("input,textarea,select,[contenteditable]")) return;
      if (t?.closest?.("#v-settings")) return;
      if (!e.metaKey && e.key === "?") { e.preventDefault(); setMoves((m) => !m); return; }
      if (e.key === "Escape") {
        if (moves) { e.preventDefault(); setMoves(false); return; }
        if (S.page) { e.preventDefault(); M.page(null); return; }
        if (S.dist === "needs") { e.preventDefault(); M.out(); return; }
        return;
      }
      if (!e.metaKey) return;
      const c = e.code, sh = e.shiftKey, ans = lineAsk() || S.askHere;
      const f: (() => unknown) | null =
        c === "Enter" && ans ? () => answer(ans) : c === "Backspace" && ans ? () => answer(ans, "later")
        : c === "Slash" && ans ? () => hooks.flash?.(`why: ${D.asks[ans].source} asked; it ranks ${D.asks[ans].rank}`)
        : c === "BracketLeft" ? M.back : c === "BracketRight" ? M.fwd : c === "KeyP" ? () => setFind(true) : c === "KeyJ" ? M.next
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
  return (
    <div className={`nx${near ? " at-near" : ""}${session ? " at-session" : ""}`} data-face="next" onClick={press}>
      <Sidebar />
      <main className="nx-main" id="main">
        <Top moves={moves} setMoves={setMoves} />
        <div id="view" aria-live="polite" className="nx-view"><View only={only} /></div>
        {S.page === "settings" && <section id="v-settings" className="nx-panel" role="dialog" aria-label="Settings"><Slot name="settings" /></section>}
      </main>
      <div className="nx-moves" id="press" role="dialog" aria-label="Every move" hidden={!moves}>
        <div className="nx-moves-h">Every move <small>press it, say it, or use its keys</small></div>
        {MOVES.map(([l, a, k]) => <button key={a} className="nx-mv" data-act={a}>{l}<span className="nx-kbd">{k}</span></button>)}
        <div className="nx-moves-f">Say it too: “next ask”, “go to api”, “zoom out”, “this is a lot”</div>
      </div>
      <Line />
      <Pill />
      {find && <Find close={() => setFind(false)} />}
      <Outline />
      <div className="nx-toast" id="toast" role="status" aria-live="polite" hidden={!toast} key={toast?.n} onAnimationEnd={() => setToast(null)}>{toast?.t}</div>
    </div>
  );
}

/** the router over S (shell.js render): a page over the canvas, "too much", Needs, Near, else the plane */
function View({ only }: { only?: { name: SlotName; props: SlotProps } }) {
  if (only) return <Slot name={only.name} {...only.props} />;
  if (S.calm) return <Slot name="needs" part="toomuch" />;
  if (S.page === "ais") return <Slot name="ais" />;
  if (onPeople(S.page)) return <Slot name="people" />;
  if (S.dist === "needs") return <><Slot name="needs" part="view" /><Slot name="people" part="needs" /></>;
  if (S.dist === "near") return <Slot name="near" />;
  const band = S.dist === "middle" ? "middle" : "far";
  return <><Slot name="plane" band={band} /><Slot name="agent" band={band} /></>;
}

function Sidebar() {
  const z = zoneOrder(), who = SCN ? SCEN[SCN]?.label.split(" · ")[0] : "";
  const reg = (rid: string) => {
    const r = regionOf(rid)!, a = asksInRegion(rid).length;
    return <a key={rid} className={`nx-row nx-reg${!S.page && S.dist !== "far" && S.region === rid ? " on" : ""}`} role="button" tabIndex={0} data-act={`goto:${rid}`} data-region={rid}>
      <span className="nx-rn">{r.name}</span>{a ? <span className="nx-n">{a}</span> : null}</a>;
  };
  const rt = D.routines || [];
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
      {who ? <div className="nx-me"><span className="nx-av">{who[0]}</span><b>{who}</b></div> : null}
      <a className="nx-row" id="findrow" role="button" tabIndex={0} data-act="goto">Find<span className="nx-k">⌘P</span></a>
      <a className={`nx-row${!S.page && S.dist === "needs" ? " on" : ""}`} id="needsrow" role="button" tabIndex={0} data-act="needs" data-f="one count: Cowork waits + Social cards">Needs you<span className="nx-k">⌘J</span><span className={`nx-n${needsCount() ? "" : " zero"}`} id="needn">{needsCount()}</span></a>
      <div className="nx-scroll">
        <a className={`nx-row${!S.page && S.dist === "far" ? " on" : ""}`} id="canvasrow" role="button" tabIndex={0} data-act={onPeople(S.page) ? "page" : "map"}>Your canvas<span className="nx-k">⌘↑</span></a>
        <div className="nx-regions" id="sideregions" aria-label="Folders">
          <a className="nx-row nx-reg" role="button" tabIndex={0} data-act="toDiary" data-zone-go="diary"><span className="nx-rn">Diary</span>{above() ? <span className="nx-n">{above()}</span> : null}</a>
          <div className="nx-label" data-zone-head="build">Build</div>{z.build.map(reg)}
          <div className="nx-label" data-zone-head="life">Life</div>{z.life.map(reg)}
          <a className="nx-row nx-reg nx-new" role="button" tabIndex={0} data-act="newFolder" data-newfolder><span className="nx-rn">New folder</span></a>
        </div>
        <a className={`nx-label nx-pressable${S.page === "ais" ? " on" : ""}`} id="aisrow" role="button" tabIndex={0} data-act="page:ais">Your AIs{D.ais.length ? ` · ${D.ais.length}` : ""}</a>
        <div id="sideais">{D.ais.map((ai) => {
          const p = D.pieces[ai.piece], a = asksOn(ai.piece).length, r = rt.filter((x) => x.ai === ai.name).length;
          const st = p?.term ? (p.term.waiting ? "waiting" : a ? "asks you" : "working") : a ? "asks you" : "";
          return <a key={ai.name} className={`nx-row nx-ai${S.piece === ai.piece && S.dist === "near" ? " on" : ""}`} role="button" tabIndex={0} data-act={`goto:${ai.piece}`} data-ai={ai.name}>
            <span className={`nx-aura${st === "working" ? "" : " still"}`} /><span className="nx-rn">{ai.name}</span><span className={`nx-st${a ? " asks" : ""}`}>{st}{r ? ` · ${r} routine${r === 1 ? "" : "s"}` : ""}</span></a>;
        })}<a className="nx-row allrow nx-aimore" role="button" tabIndex={0} data-act="page:ais" hidden><span className="nx-rn" /></a></div>
        <Slot name="peopleside" />
      </div>
      <div className="nx-foot">
        <a className={`nx-row${S.page === "settings" ? " on" : ""}`} role="button" tabIndex={0} data-act="page:settings" data-go="settings">Settings<span className="nx-k">⌘,</span></a>
      </div>
    </nav>
  );
}

function Top({ moves, setMoves }: { moves: boolean; setMoves: (f: (m: boolean) => boolean) => void }) {
  const seg: { id: string; label: string; act?: string }[] = [];
  if (onPeople(S.page)) seg.push(...crumbOf(S.page));
  else if (S.page) seg.push({ id: "page", label: ({ ais: "Your AIs", cowork: "Cowork", social: "Social", settings: "Settings" } as Record<string, string>)[S.page] ?? S.page });
  else if (S.dist === "needs") seg.push({ id: "needs", label: "Needs you" });
  else {
    seg.push({ id: "canvas", label: "Your canvas", act: "map" });
    const r = S.dist !== "far" ? regionOf(S.region) : undefined;
    if (r) seg.push({ id: "region", label: r.name, act: `goto:${r.id}` });
    const p = S.dist === "near" && S.piece ? D.pieces[S.piece] : undefined;
    if (p) seg.push({ id: "piece", label: `${p.kind === "session" ? `${p.ai} in ${p.copy}` : p.name}${S.beside && D.pieces[S.beside] ? ` ‖ ${D.pieces[S.beside].name}` : ""}` });
    if (S.calm) seg.push({ id: "calm", label: "Too much" });
  }
  const h = (l: string, a: string, k: string) => <button key={a} className="nx-hint" data-act={a} title={l}><span className="nx-kbd">{k}</span> {l.toLowerCase()}</button>;
  const hs = S.calm ? [h("Too much", "tooMuch", "⌘⇧H")] : onPeople(S.page) ? [h("Back to the canvas", "page", "esc"), h("Next ask", "next", "⌘J")] : S.page || S.dist === "needs" ? [h("Back to the canvas", "map", "⌘0"), h("Next ask", "next", "⌘J")]
    : S.dist === "far" ? [h("Next ask", "next", "⌘J"), h("Find", "goto", "⌘P")] : S.dist === "middle" ? [h("Zoom out", "out", "⌘↑"), h("Next ask", "next", "⌘J"), h("Find", "goto", "⌘P")]
    : [h("Find", "goto", "⌘P"), h("Too much", "tooMuch", "⌘⇧H")];
  return (
    <header className="nx-top" id="top">
      <div className="nx-crumb" id="crumb" role="navigation" aria-label="You are here">
        {seg.map((s, i) => <span key={s.id}>{i ? <span className="nx-sl">/</span> : null}<a role={s.act ? "button" : undefined} data-act={s.act}>{s.label}</a></span>)}
      </div>
      <div className="nx-right">
        <div className="nx-hints" id="hints" aria-label="Keys here">{hs}</div>
        <button className="nx-chip" id="movesbtn" aria-haspopup="dialog" aria-expanded={moves} onClick={(e) => { e.stopPropagation(); setMoves((m) => !m); }}>Moves <span className="nx-kbd">?</span></button>
        <span className="nx-chip" id="workingchip"><span className="nx-aura" /><span id="working">{working()} working</span></span>
      </div>
    </header>
  );
}

/** the ask line: shown while an ask is brought to it or peeks (engine.js renderLine); its words are slice 2's */
function Line() {
  const id = lineAsk(), live = !S.calm && !!id && !!D.asks[id] && !D.asks[id].answered;
  return <div id="line" className="nx-line" role="alert" style={{ display: live ? "block" : "none" }}>{live ? <Slot name="needs" part="line" /> : null}</div>;
}

/** the talk: one pill, everywhere; it takes the moves said or typed (the chain, cv/say) */
function Pill() {
  const [v, setV] = useState("");
  return (
    <div className="nx-talk" id="talk">
      <span className="nx-aura" />
      <input id="say" aria-label="Say a move or ask anything" placeholder="Say a move or ask: “next ask”, “go to api”, “too much”" autoComplete="off" value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key !== "Enter" || !v.trim()) return; const r = say(v); if (!r) hooks.flash?.(`Not a move I know: “${v.trim()}”`); setV(""); }} />
      <span className="nx-hint-q">hold <span className="nx-kbd">fn</span> to talk</span>
    </div>
  );
}

/** Find (⌘P): folders, pieces, AIs and asks by their words (shell.js palIndex) */
function Find({ close }: { close: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items: { g: string; l: string; id: string }[] = [];
  D.regions.forEach((r) => items.push({ g: "Folders", l: r.name, id: r.id }));
  Object.values(D.pieces).forEach((p) => items.push({ g: "Pieces", l: p.kind === "session" ? `${p.ai} in ${p.copy}` : p.name, id: p.id }));
  D.ais.forEach((a) => items.push({ g: "AIs", l: a.name, id: a.name }));
  open().forEach((a) => items.push({ g: "Asks", l: a.text, id: a.id }));
  const w = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (w.length ? items.filter((x) => w.every((t) => (x.l + " " + x.g).toLowerCase().includes(t))) : items.filter((x) => x.g === "Folders" || x.g === "AIs")).slice(0, 12);
  const go = (id?: string) => { close(); const t = id ?? findByWords(q); if (t) M.goto(t); };
  return (
    <div className="nx-pal" id="overlay" role="dialog" aria-modal="true" aria-label="Find" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="nx-pal-card">
        <input id="gq" autoFocus placeholder="a folder, piece, AI or ask" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") close(); if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1)); if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0)); if (e.key === "Enter") go(hits[sel]?.id); }} />
        {hits.map((x, i) => <button key={x.g + x.id} className={`nx-res${i === sel ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); go(x.id); }}><span>{x.l}</span><span className="nx-k">{x.g}</span></button>)}
      </div>
    </div>
  );
}

/** the outline twin: the canvas as a tree, for VoiceOver and for anyone (engine.js renderOutline) */
function Outline() {
  return (
    <nav id="outline" className="nx-sr" aria-label="Outline of the canvas">
      <div role="tree">
        {D.regions.map((r) => <div key={r.id} role="treeitem" aria-expanded="true">
          <button data-act={`goto:${r.id}`}>{r.name} ({asksInRegion(r.id).length} ask)</button>
          {piecesIn(r.id).map((p) => <button key={p.id} role="treeitem" data-act={`goto:${p.id}`}>— {p.name}</button>)}
        </div>)}
        {open().map((a) => <button key={a.id} data-act={`goto:${a.id}`}>{a.text}</button>)}
      </div>
    </nav>
  );
}

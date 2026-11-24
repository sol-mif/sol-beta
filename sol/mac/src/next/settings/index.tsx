// owned by slice 6 (Settings), docs/port/slices.md
// Settings, the panel over the page (#1604; the mockup's redesign/ui.html Settings, carried over): the bar (find a
// setting or say a change, close), the results as you type (a take tried on the window as you move onto it, kept by
// Enter), and the pages: all of Settings, fixed inputs only (BR1 item 6: you and this Mac, your AI accounts and keys,
// what Sol may read, how Sol behaves as plain rows, updates; Main), Your AI's voice (length, register, humour, your own
// personality), Privacy (what Sol may read, everything it has learned: Privacy.tsx) and your data and connections.
// Pointing ("point at it", said, or the find's link when nothing matches) boxes and names the thing under the pointer,
// and a click shows only the settings that change it; the bar's own Point at it left with Customize (customize.html).
// It reads the store and presses M (cv/moves/settings.ts); the rules are model.ts. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { SlotProps } from "../slots.ts";
import { M, hooks, useNext } from "../cv/index.ts";
import { U, W } from "../cv/moves/settings.ts";
import { Knob, CmpBox } from "./Knob.tsx";
import { History } from "./History.tsx";
import { Worked } from "./Worked.tsx";   // How Sol worked, read from next.traces (#1615, franktsai2008-eng's agent)
import { FitHistory } from "./Fits.tsx";
import { WorkspaceChanges } from "../workspace/Workspace.tsx";
import { Back } from "./Back.tsx";
import {
  K, NOT_LIVE, PLACES, TUNE, VOICE, aiOf, cmp, findAll, fx, kk, pointAt, takeOf, voiceNow, wayDiff,
  type Res, type Ui, type World,
} from "./model.ts";
import { FindRows, Page as Pieces, pageOpen } from "../pieces/Page.tsx";   // slice 12 (docs/port/requests/pieces.md)
import { Privacy } from "./Privacy.tsx";   // BR1 (#1615): the ledger, only for trust
import "./settings.css";
import { ST_EXTRA } from "./seats/hook.ts";   // slice 6b's seam: Seats replaces Connected services (docs/port/requests/seats.md)
import { FitResults, FitsPage, fitsOpen } from "../fits/views.tsx";   // slice R8 (#1615): render points, requests/fits.md
import { CHOICES as LEAD } from "../movein/Lead.tsx";
import { leadNow } from "../movein/seenFirst.ts";
import { accountNow, accountPress, type Account } from "../cv/wire/account.ts";   // BR1 item 6 (#1615): who is signed in
const LeadRow = lazy(async () => ({ default: (await import("../movein/Lead.tsx")).LeadRow }));   // BR1 (#1615): what you see first, the Start screen row

export default function Settings(_p: SlotProps) {
  const { w, u } = useNext(() => ({ w: W(), u: U() }));
  useFx(w, u);
  const top = useTop(u.page);
  const Extra = ST_EXTRA.page(u.page);
  return (
    <div ref={top} className="st" data-st-page={u.page} data-pointing={u.pointing || undefined}>
      <Bar u={u} />
      <div id="st-res" className="st-resw" aria-live="polite">{u.pointing ? <PointHint w={w} u={u} /> : u.q.trim() ? <><FindRows q={u.q} /><Results w={w} u={u} /><FitResults q={u.q} /></> : null}</div>
      {u.pointing ? <Pointing w={w} /> : null}
      {u.q.trim() || u.pointing ? null : pageOpen() ? <Pieces /> : fitsOpen() ? <FitsPage /> : Extra ? <Extra /> : u.page === "voice" ? <Voice w={w} u={u} /> : u.page === "data" ? <Data w={w} u={u} /> : u.page === "privacy" ? <Privacy w={w} u={u} /> : u.filter ? <Filtered w={w} u={u} /> : <Main w={w} u={u} />}
    </div>
  );
}

/** a page opens at its top: whatever scrolls Settings (the panel it sits in) goes back up when the page changes, never
 *  left where the page before was read */
function useTop(page: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (let e: HTMLElement | null = ref.current; e; e = e.parentElement) if (e.scrollTop > 0) e.scrollTop = 0;
  }, [page]);
  return ref;
}

/** the window shows the look and size tried or kept (ui.html applyFx): attributes on the page's root, which the visual
 *  pass draws; a history preview shows its past state */
function useFx(w: World, u: Ui) {
  const f = fx(w, u, u.hx != null && w.hist[u.hx] ? w.hist[u.hx].snap : undefined);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.stLook = f.look; r.dataset.stSize = f.size; r.style.setProperty("--st-z", String(f.z));
    return () => { delete r.dataset.stLook; delete r.dataset.stSize; r.style.removeProperty("--st-z"); };
  }, [f.look, f.size, f.z]);
}

function Bar({ u }: { u: Ui }) {
  const sub = u.page !== "main" || !!u.filter;
  const list = () => (u.q.trim() ? findAll(W(), U(), u.q) : []);
  return (
    <div className="st-bar">
      {sub ? <button className="st-back" aria-label="Back to all of Settings" title="All of Settings" onClick={() => M.stAct(u.page === "main" ? "unfilter" : "page")}>‹</button> : null}
      <label className="st-find">
        <input id="st-find" placeholder="Find a setting, or say a change" autoComplete="off" spellCheck={false} aria-label="Find a setting, or say a change" aria-controls="st-res" value={u.q}
          onChange={(e) => { M.stFind(e.target.value); const r0 = list()[0]; if (r0?.said && r0.type === "take") M.stSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); M.stSel((u.sel || 0) + (e.key === "ArrowDown" ? 1 : -1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (u.q.trim()) M.stPick(u.sel || 0); }
          }} />
        <span className="nx-kbd">/</span>
      </label>
      <button className="st-x" aria-label="Close Settings" title="Close (⌘,)" onClick={() => M.stClose()}>×</button>
    </div>
  );
}

// ---------------------------------------------------------------- the results

function resRow(w: World, u: Ui, r: Res): { title: string; where: string; state: string } {
  if (r.type === "take") { const k = K[r.k!], T = takeOf(w, k, r.t), kept = w.prefs.kept[kk(k, r.ai)] === r.t; return { title: T.n, where: k.n + (r.ai ? " · " + aiOf(w, r.ai).n : ""), state: kept ? "In use" : u.trying?.k === r.k && u.trying?.t === r.t ? "Trying" : "" }; }
  if (r.type === "knob") { const k = K[r.k!], T = takeOf(w, k, w.prefs.kept[kk(k, r.ai)]); return { title: r.ai && !u.q.match(/\w{3}/) ? `${aiOf(w, r.ai).n}: ${k.short}` : k.n, where: "Now: " + T.n + (r.ai ? " · " + aiOf(w, r.ai).n : ""), state: "" }; }
  if (r.type === "place") { const P = PLACES.find((x) => x.id === r.p)!; return { title: P.n, where: P.where, state: "" }; }
  const wy = w.ways.find((x) => x.id === r.w)!; return { title: wy.n, where: `Way of working · ${Object.keys(wy.takes).length} choices at once`, state: "" };
}
function Results({ w, u }: { w: World; u: Ui }) {
  const L = findAll(w, u, u.q);
  if (!L.length) return <div className="st-none"><span className="nx-aura" /><span>Nothing in Settings goes by “{u.q}”. Try other words, or <button className="st-tx" onClick={() => M.stPoint()}>point at the thing</button> in the window.</span></div>;
  const sel = Math.max(0, Math.min(u.sel, L.length - 1)), r = L[sel];
  let prev = null;
  if (r?.type === "take") {
    const k = K[r.k!], kept = w.prefs.kept[kk(k, r.ai)];
    prev = kept === r.t ? <div className="st-fprev st-fin">{takeOf(w, k, r.t).n} is already in use{r.ai ? ` for ${aiOf(w, r.ai).n}` : ""}.</div>
      : <div className="st-fprev"><CmpBox c={cmp(w, k, kept, r.t!, r.ai ?? null)} /><div className="st-fk"><button className="st-btn pri" onClick={() => M.stPick(sel)}>Keep it <span className="nx-kbd">⏎</span></button><span>{u.trying?.k === r.k && u.trying?.t === r.t ? "Trying it now. " : ""}↑↓ another · esc leaves it as it was</span></div></div>;
  } else if (r?.type === "way") prev = <div className="st-fprev"><WaySum w={w} id={r.w!} /></div>;
  return (
    <>
      <div className="st-rl" role="listbox" aria-label="Results">
        {L.map((x, i) => {
          const v = resRow(w, u, x);
          return <div key={i}>
            {i === 0 && x.said ? <div className="st-rh">Your words, as a change</div> : null}
            {(i === 0 && !x.said) || (i === 1 && L[0].said) ? <div className="st-rh">In Settings</div> : null}
            <button className={`st-r${i === sel ? " sel" : ""}`} role="option" aria-selected={i === sel} data-r={i} onPointerMove={() => { if (i !== U().sel) M.stSel(i); }} onClick={() => M.stPick(i)}>
              <span className="st-t"><b>{v.title}</b><small>{v.where}</small></span>{v.state ? <span className="st-rs">{v.state}</span> : null}{i === sel ? <span className="nx-kbd">⏎</span> : null}
            </button>
          </div>;
        })}
      </div>
      {prev}
    </>
  );
}

// ---------------------------------------------------------------- pointing

function PointHint({ w, u }: { w: World; u: Ui }) {
  const h = u.hov;
  if (!h) return <div className="st-phint"><span><b>Point at anything in the window.</b><small>The talk bar, a line of work, a question, the sidebar. I show what changes it; click to open those settings. <span className="nx-kbd">esc</span> stops.</small></span></div>;
  const n = h.k.length + h.p.length;
  return (
    <div className="st-phint on">
      <span><b>{h.l}</b><small>Click to open {n === 1 ? "its setting" : `its ${n} settings`}.</small></span>
      <div className="st-rl">{h.k.map((id) => { const k = K[id], ai = k.per ? (h.ai || u.ai[id]) : null, T = takeOf(w, k, w.prefs.kept[kk(k, ai)]); return <div key={id} className="st-r"><span className="st-t"><b>{k.n}</b><small>Now: {T.n}{ai ? " · " + aiOf(w, ai).n : ""}</small></span></div>; })}</div>
    </div>
  );
}
/** while pointing: the window is read under the pointer, the thing boxed and named; a click outside the panel picks it
 *  and nothing else under it is pressed (ui.html's pointermove, click and pointerdown, all at capture) */
function Pointing({ w }: { w: World }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; l: string } | null>(null);
  useEffect(() => {
    const inPanel = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("#v-settings");
    const move = (e: PointerEvent) => {
      const t = e.target as Element, hit = inPanel(t) ? null : pointAt(W(), t);
      M.stHover(hit ? t : null);
      if (!hit) { setBox(null); return; }
      const r = hit.el.getBoundingClientRect();
      setBox((b) => (b && b.l === hit.l && b.x === r.left && b.y === r.top ? b : { x: r.left, y: r.top, w: r.width, h: r.height, l: hit.l }));
    };
    const click = (e: MouseEvent) => { if (inPanel(e.target)) return; e.preventDefault(); e.stopImmediatePropagation(); M.stPoint(e.target as Element); };
    const down = (e: PointerEvent) => { if (!inPanel(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } };
    document.addEventListener("pointermove", move, true); document.addEventListener("click", click, true); document.addEventListener("pointerdown", down, true);
    return () => { document.removeEventListener("pointermove", move, true); document.removeEventListener("click", click, true); document.removeEventListener("pointerdown", down, true); };
  }, [w]);
  return box ? <div id="st-pbox" className="st-pbox" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}><span>{box.l}</span></div> : null;
}

function Filtered({ w, u }: { w: World; u: Ui }) {
  const f = u.filter!, n = f.k.length + f.p.length;
  return (
    <div className="st-page" data-st="filtered">
      <div className="st-fchip"><span className="st-t">What changes <b>{f.l}</b><small>{n} setting{n === 1 ? "" : "s"}. Point at a take to see it on the window.</small></span><button className="st-btn" onClick={() => M.stAct("unfilter")}>All settings</button></div>
      {f.k.map((id) => <Knob key={id} w={w} u={u} kid={id} />)}
      {f.p.map((p) => <GoRow key={p} id={p} />)}
    </div>
  );
}

// ---------------------------------------------------------------- all of Settings

function GoRow({ id, sub }: { id: string; sub?: string }) {
  const P = PLACES.find((x) => x.id === id)!;
  return <div className="st-knob st-go"><button className="st-head" data-place={id} aria-label={P.n} aria-description={sub || P.where} onClick={() => M.stPlace(id)}><span className="st-ht"><b>{P.n}</b><small className="st-who">{sub || P.where}</small></span><span className="st-cur">›</span></button></div>;
}
function Reply({ u }: { u: Ui }) {
  const r = u.reply; if (!r) return null;
  if (r.miss) return <div className="st-reply"><span className="nx-aura" /><span className="st-t">{r.miss}</span></div>;
  return <div className="st-reply"><span className="nx-aura" /><span className="st-t">{r.say}</span>{u.trying?.sticky
    ? <><button className="st-btn pri" onClick={() => M.stKeep()}>Keep it</button><button className="st-btn" onClick={() => M.stLeave()}>Turn back</button></>
    : <span className="st-t3">{r.done}</span>}</div>;
}
function WaySum({ w, id }: { w: World; id: string }) {
  const wy = w.ways.find((x) => x.id === id); if (!wy) return null;
  const ch = wayDiff(w, wy);
  if (!ch.length) return <span className="st-wn">{wy.n} is what you have now.</span>;
  return <><span className="st-wn">{wy.n} would change {ch.length} thing{ch.length === 1 ? "" : "s"}:</span>{ch.map((c) => <span key={c.key} className="st-wc">{c.name}<s>{c.from}</s><span className="st-ar">→</span><b>{c.to}</b></span>)}</>;
}
/** who is signed in, first under Account and display: "Signed in as <login>" with Sign out, or "Not signed in" with Sign in;
 *  no row when there is no cloud to sign in to (a developer's own run) */
function AccountRow({ a }: { a: Account }) {
  if (!a.cloud) return null;
  const v = a.busy === "in" ? "Finish signing in in your browser…" : a.busy === "out" ? "Signing out…" : a.login ? `Signed in as ${a.login}` : "Not signed in";
  return (
    <div className="st-knob st-go" data-st-row="account"><div className="st-says">
      <span className="st-ht"><b>Account</b>{a.failed ? <small className="st-who">That didn’t go through. Nothing changed.</small> : null}</span>
      <span className="st-acc">{v}{a.busy ? null : <button className="st-btn" data-st="account" onClick={() => void accountPress(a.login ? "out" : "in")}>{a.login ? "Sign out" : "Sign in"}</button>}</span>
    </div></div>
  );
}
/** what Sol speaks: English only for now, whatever this Mac speaks. The row named the Mac's language in that language
 *  ("中文（台灣）") over a face all in English (BR1 lane G); a Mac on another language is named, in English, beside it */
const macLanguage = () => { try { const l = navigator.language || "en"; if (/^en\b/i.test(l)) return "English"; return `English · this Mac: ${new Intl.DisplayNames(["en"], { type: "language" }).of(l) ?? l}`; } catch { return "English"; } };
/** a row that holds a whole part folded until it is pressed (Privacy, the history, how Sol worked: BR1 item 6, folded at rest) */
function Fold({ id, n, sub, cur, children }: { id: string; n: string; sub?: string; cur?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false), own = useRef<HTMLDivElement>(null);
  // opened, it comes into view whole: Start screen, last on the screen, opened below the panel's foot, its choices out of
  // sight until the person scrolled (BR1 first-timer, #1615); and again each time it grows while open: its lazy body
  // (LeadRow) drawn a moment later, a press's line under the choices. Only a change of its size moves it, never a scroll
  useEffect(() => {
    const el = own.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => el.scrollIntoView?.({ block: "nearest" }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div ref={own} className={`st-knob st-fold${open ? " open" : ""}`} data-fold={id}>
      <button className="st-head" aria-expanded={open} aria-label={n} aria-description={[cur, sub].filter(Boolean).join(". ") || undefined} onClick={() => setOpen(!open)}><span className="st-ht"><b>{n}</b>{open || !sub ? null : <small>{sub}</small>}</span><span className="st-cur">{open ? "Close" : cur ?? "Open"}</span></button>
      {open ? <div className="st-body st-fbody">{children}</div> : null}
    </div>
  );
}
/** Settings holds fixed inputs only (BR1 item 6, three.html "Settings: fixed inputs only"; mine/look/br1/customize.html "What
 *  moves out of it"): you and this Mac, your AI accounts and keys, what Sol may read (folded), how Sol behaves as plain
 *  rows, and updates. A change Sol made on its own is a because… line on the row it changed, not a block. The look, the
 *  glance, how things open and the ways of working are the Customize bar's (P's) and the canvas's; find still reaches every
 *  choice. */
function Main({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs, nHere = Object.values(P.data).filter((v) => v === "here").length;
  const spent = w.ais.reduce((s, a) => s + a.spent, 0);
  const stRows = (g: string) => (hooks as unknown as { stRows?: ((g: string) => React.ReactNode)[] }).stRows?.map((f) => f(g));
  const lead = useNext(() => leadNow());
  const acc = useNext(() => accountNow());
  const knob = (id: string) => (w.live && NOT_LIVE.has(id) ? null : <Knob key={id} w={w} u={u} kid={id} plain />);
  return (
    <div className="st-page" data-st="main">
      <div id="st-reply"><Reply u={u} /></div>
      <section className="st-group" data-st-g="you"><h2 className="st-gh">Account and display</h2><div className="st-sec">
        {acc ? <AccountRow a={acc} /> : null}
        <div className="st-knob st-go" data-st-row="language"><div className="st-says"><span className="st-ht"><b>Language</b></span><span className="st-cur" title="Sol speaks English for now">{macLanguage()}</span></div></div>
        {knob("size")}
      </div></section>
      <section className="st-group" data-st-g="ais"><h2 className="st-gh">Your AI accounts and keys</h2><div className="st-sec">
        {ST_EXTRA.rowsFor("How your AIs work")}
        {stRows("How your AIs work")}
        {knob("spend")}
      </div></section>
      <section className="st-group" data-st-g="read"><h2 className="st-gh">What Sol may read</h2><div className="st-sec">
        <Fold id="privacy" n="Privacy" sub="What Sol may read, and everything it has learned"><Privacy w={w} u={u} /></Fold>
        <GoRow id="data" sub={w.live ? "Where each kind of what I know goes" : `${nHere} of ${Object.keys(P.data).length} kinds stay on this machine · $${spent.toFixed(2)} spent this month`} />
      </div></section>
      <section className="st-group" data-st-g="behaves"><h2 className="st-gh">How Sol behaves</h2><div className="st-sec">
        <Fold id="lead" n="Start screen" cur={LEAD.find((c) => c.id === (lead ?? "day"))?.n}><Suspense fallback={null}><LeadRow /></Suspense></Fold>
        {["autonomy", "working", "writing", "attention", "marking"].map(knob)}
        <GoRow id="voice" sub={`${[takeOf(w, K["v-length"], P.kept["v-length"]).n, takeOf(w, K["v-register"], P.kept["v-register"]).n.toLowerCase()].join(", ")}${P.persona === "own" ? " · your own personality" : ""}`} />
        <Fold id="setup" n="Your setup" sub="Setups Sol suggests for your folders wait here for you"><WorkspaceChanges /></Fold>
        {w.live ? null : <Fold id="tune" n="Settings the AI may change" cur={TUNE.find((t) => t.id === P.tune)?.n}><span className="st-seg" role="radiogroup" aria-label="Settings the AI may change">{TUNE.map((t) => <button key={t.id} role="radio" aria-checked={P.tune === t.id} onClick={() => M.stAct("tune", t.id)}>{t.n}</button>)}</span></Fold>}
      </div></section>
      <section className="st-group" data-st-g="updates"><h2 className="st-gh">Updates</h2><div className="st-sec">
        <Back />
        <Fold id="history" n="History of changes" sub="Every change, and a way back to any of them">{w.live ? <FitHistory w={w} /> : <History w={w} u={u} />}</Fold>
        <Fold id="worked" n="How Sol worked" sub="What ran each day, with what, and how it went"><Worked /></Fold>
      </div></section>
    </div>
  );
}

// ---------------------------------------------------------------- Your AI's voice

function Voice({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs;
  return (
    <div className="st-page" data-st="voice">
      <h1>How your AI talks</h1>
      <p className="st-say">One voice speaks for all your AIs. I start with a default and grow toward how you talk.</p>
      <div className="st-vprev" id="st-vprev"><span className="nx-aura" /><div><div className="st-l">I would tell you it like this</div><div className="st-v">{voiceNow(w, u)}</div></div></div>
      <h2 className="st-gh">How I sound</h2>
      {VOICE.map((id) => <Knob key={id} w={w} u={u} kid={id} />)}
      {/* what I've learned is Privacy's ledger now (Privacy.tsx), one list for every line Sol holds */}
      <h2 className="st-gh">Your own personality</h2>
      <div className="st-persona">
        {P.persona === "own" ? <><p><b>Your own is on:</b> “{P.personaText}”. I still ask before anything leaves this machine, costs money or deletes.</p><div className="st-row2"><button className="st-btn" onClick={() => M.stAct("persona-back")}>Back to the default voice</button></div></>
          : u.persona ? <><p>Write how you want me to sound, in a line. I will use only that, instead of the default.</p><div className="st-row2"><input id="st-persona-t" placeholder="For example: brief, dry, never exclamation marks" aria-label="Your own personality" autoFocus onKeyDown={(e) => { if (e.key === "Enter") M.stAct("persona-use", e.currentTarget.value); }} /><button className="st-btn pri" onClick={() => M.stAct("persona-use", (document.getElementById("st-persona-t") as HTMLInputElement | null)?.value ?? "")}>Use this voice</button><button className="st-btn" onClick={() => M.stAct("persona-x")}>Cancel</button></div></>
          : <><p>If none of this fits, you can set your own from a blank line. I still ask before anything leaves this machine, costs money or deletes.</p><div className="st-row2"><button className="st-btn" onClick={() => M.stAct("persona-open")}>Set your own personality</button></div></>}
      </div>
      {u.why ? <div className="st-q"><div className="st-qq">One question, and No is fine: will you say what wasn’t working?</div><p>It helps make the default better. It goes only to the people who make it, and only if you say yes.</p>
        <div className="st-row2">{u.why === "yes" ? <><input id="st-why-t" placeholder="What wasn’t working" autoFocus /><button className="st-btn pri" onClick={() => M.stAct("why-send")}>Send</button></> : <button className="st-btn" onClick={() => M.stAct("why-yes")}>Yes, I’ll say</button>}<button className="st-btn pri" onClick={() => M.stAct("why-no")}>No, thanks</button></div></div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- your data and connections

function Data({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs, nHere = Object.values(P.data).filter((v) => v === "here").length;
  return (
    <div className="st-page" data-st="data">
      <h1>Your data and connections</h1>
      <p className="st-say">{w.live ? "Most of what I know about you stays on this machine. The rest goes to the model you chose only when an AI needs it for a job." : `Most of what I know about you stays on this machine. ${nHere} of ${w.kinds.length} kinds stay here now. The rest go to the model you chose, Claude on your own plan, only when an AI needs them for a job.`}</p>
      {w.kinds.length ? <><h2 className="st-gh">Where your data goes</h2><div className="st-card0">{w.kinds.map((k) => { const v = P.data[k.id]; return (
        <div key={k.id} className="st-row" data-kind={k.id}><span className="st-t"><b>{k.n}</b><small>Used by {k.by}</small></span>
          <span className="st-seg" role="radiogroup" aria-label={k.n}><button role="radio" aria-checked={v === "here"} onClick={() => M.stAct("data", k.id, "here")}>Stays on this machine</button><button role="radio" aria-checked={v === "model"} onClick={() => M.stAct("data", k.id, "model")}>Goes to the model</button></span>
          <span className="st-why">{v === "here" ? k.here : k.model}</span></div>); })}</div></> : null}
      {/* Connected services was cut for BR1 (sweep 5, #1615): Seats and sign-ins took its place (seats/hook.ts), and its
          Connect only flipped a flag of the fixture's */}
      {Object.keys(w.tools).length ? <><h2 className="st-gh">Connect your own dictation or notes tool</h2><div className="st-card0"><p className="st-say">I have my own speech and meeting notes built in. If you already use another, connect it and it works as if it were built in: the same key, the same place, the same way to take things back.</p>
        <div className="st-tools">{Object.keys(w.tools).map((id) => { const t = w.tools[id], on = P.tools[t.kind] === id; return (
          <div key={id} className="st-tool"><b>{t.n}</b><span>{t.what}{on ? " · connected, working as if built in" : ""}</span>{on ? <button className="st-btn" onClick={() => M.stAct("tool-off", id)}>Use mine again</button> : <button className="st-btn" onClick={() => M.stAct("tool-ask", id)}>Connect {t.n}</button>}</div>); })}</div>
        {u.tool && w.tools[u.tool] ? <div className="st-conf"><span>{w.tools[u.tool].say}</span><button className="st-btn pri" onClick={() => M.stAct("tool-ok", u.tool!)}>Connect {w.tools[u.tool].n}</button><button className="st-btn" onClick={() => M.stAct("tool-x")}>Not now</button></div> : null}</div></> : null}
    </div>
  );
}

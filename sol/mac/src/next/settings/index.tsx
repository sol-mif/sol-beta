// owned by slice 6 (Settings), docs/port/slices.md
// Settings, the panel over the page (#1604; the mockup's redesign/ui.html Settings, carried over): the bar (find a
// setting or say a change, "Point at it", close), the results as you type (a take tried on the window as you move
// onto it, kept by Enter), and the pages: all of Settings (what I asked, how I keep your settings fitting, the ways of
// working, the five groups of choices, the way back to the old Sol, the drawn history), Your AI's voice (length,
// register, humour, what I've learned, your own personality) and your data and connections. While pointing, the
// thing under the pointer is boxed and named, and a click shows only the settings that change it.
// It reads the store and presses M (cv/moves/settings.ts); the rules are model.ts. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { useEffect, useState } from "react";
import type { SlotProps } from "../slots.ts";
import { M, useNext } from "../cv/index.ts";
import { U, W } from "../cv/moves/settings.ts";
import { Knob, CmpBox } from "./Knob.tsx";
import { History } from "./History.tsx";
import { Back } from "./Back.tsx";
import {
  GROUPS, K, NOT_LIVE, PLACES, TUNE, VOICE, aiOf, byAI, cmp, day, findAll, fx, kk, pointAt, takeOf, tuneKey, voiceNow, wayDiff, wayOn,
  type Res, type Ui, type World,
} from "./model.ts";
import "./settings.css";

export default function Settings(_p: SlotProps) {
  const { w, u } = useNext(() => ({ w: W(), u: U() }));
  useFx(w, u);
  return (
    <div className="st" data-st-page={u.page} data-pointing={u.pointing || undefined}>
      <Bar u={u} />
      <div id="st-res" className="st-resw" aria-live="polite">{u.pointing ? <PointHint w={w} u={u} /> : u.q.trim() ? <Results w={w} u={u} /> : null}</div>
      {u.pointing ? <Pointing w={w} /> : null}
      {u.q.trim() || u.pointing ? null : u.page === "voice" ? <Voice w={w} u={u} /> : u.page === "data" ? <Data w={w} u={u} /> : u.filter ? <Filtered w={w} u={u} /> : <Main w={w} u={u} />}
    </div>
  );
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
      <button className={`st-pt${u.pointing ? " on" : ""}`} data-st="point" aria-pressed={u.pointing} title="Point at anything in the window to see the settings that change it" onClick={() => M.stPoint()}>Point at it</button>
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
  return <div className="st-knob st-go"><button className="st-head" data-place={id} onClick={() => M.stPlace(id)}><span className="st-ht"><b>{P.n}</b><small className="st-who">{sub || P.where}</small></span><span className="st-cur">›</span></button></div>;
}
function Reply({ u }: { u: Ui }) {
  const r = u.reply; if (!r) return null;
  if (r.miss) return <div className="st-reply"><span className="nx-aura" /><span className="st-t">{r.miss}</span></div>;
  return <div className="st-reply"><span className="nx-aura" /><span className="st-t">{r.say}</span>{u.trying?.sticky
    ? <><button className="st-btn pri" onClick={() => M.stKeep()}>Keep it</button><button className="st-btn" onClick={() => M.stLeave()}>Turn back</button></>
    : <span className="st-t3">{r.done}</span>}</div>;
}
function Offer({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs, tr = u.trying?.t === "eve" && u.trying?.k === "size";
  if (!P.offers || P.tune === "off" || P.offerGone || P.kept.size === "eve" || w.live) return null;
  if (tr) return <div className="st-offer"><span className="nx-aura" /><div className="st-t">Trying text a step larger from 8 pm. <small>Look at the window: this is how it reads in the evening.</small></div><span className="st-acts"><button className="st-btn pri" onClick={() => M.stAct("offer-keep")}>Keep it</button><button className="st-btn" onClick={() => M.stAct("offer-back")}>Turn back</button></span></div>;
  return <div className="st-offer"><span className="nx-aura" /><div className="st-t">I noticed you turn the text up every evening. A larger take after 8 pm?<small>Why I’m asking: you made the text larger on 6 of the last 7 evenings, and turned it back each morning.</small></div><span className="st-acts"><button className="st-btn" onClick={() => M.stAct("offer-try")}>Try it</button><button className="st-btn" onClick={() => M.stAct("offer-no")}>No, never again</button></span></div>;
}
function Care({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs, tuned = w.hist.map((h, i) => ({ h, i })).filter((x) => byAI(x.h)).slice(-3).reverse();
  return (
    <section className="st-care" id="st-tune">
      <div className="st-ch"><span className="nx-aura" /><span className="st-t"><b>I keep your settings fitting you</b><small>{P.tune === "off" ? "I change nothing on my own now. Everything here is yours to set." : P.tune === "ask" ? "When your weeks change, I offer a better fit and wait for your yes." : "When your weeks change, I adjust small things and tell you here. Anything bigger waits for your yes."}</small></span></div>
      <Offer w={w} u={u} />
      {tuned.length ? <><div className="st-csub">Changed by me lately</div>{tuned.map(({ h, i }) => {
        const key = tuneKey(w, i), still = !!key && P.kept[key] === h.snap.kept[key], [kn, tn] = h.label.split(": "), kid = key?.split(":")[0];
        return <div key={i} className="st-crow"><button className="st-t" onClick={() => kid && M.stAct("goknob", kid)}><b>{tn || h.label}</b> <span className="st-kn">· {kn}</span><small>{h.why || ""}</small></button><span className="st-when">{day(h.when)}</span>
          {still ? <button className="st-btn" onClick={() => M.stAct("untune", String(i))}>Turn back</button> : <span className="st-gone">{key && P.keepMine[key] ? "Turned back. I’ll leave it." : "Changed since"}</span>}</div>;
      })}</> : null}
      <div className="st-tunes"><span>When I see a better fit</span><span className="st-seg" role="radiogroup" aria-label="When I see a better fit">{TUNE.map((t) => <button key={t.id} role="radio" aria-checked={P.tune === t.id} onClick={() => M.stAct("tune", t.id)}>{t.n}</button>)}</span></div>
      <div className="st-floor"><span>On my own I never touch what spends money, sends or deletes: how far an AI goes, its limits, your data and your connections.</span></div>
    </section>
  );
}
function WaySum({ w, id }: { w: World; id: string }) {
  const wy = w.ways.find((x) => x.id === id); if (!wy) return null;
  const ch = wayDiff(w, wy);
  if (!ch.length) return <span className="st-wn">{wy.n} is what you have now.</span>;
  return <><span className="st-wn">{wy.n} would change {ch.length} thing{ch.length === 1 ? "" : "s"}:</span>{ch.map((c) => <span key={c.key} className="st-wc">{c.name}<s>{c.from}</s><span className="st-ar">→</span><b>{c.to}</b></span>)}</>;
}
function Ways({ w, u }: { w: World; u: Ui }) {
  const [over, setOver] = useState<string | null>(null);
  if (w.live) return null;
  const on = wayOn(w);
  return (
    <>
      <div className="st-wrow" id="st-ways" onPointerLeave={() => setOver(null)}><span className="st-wl">Ways of working</span>
        {w.ways.map((x) => <button key={x.id} className={`st-way${on?.id === x.id ? " on" : ""}`} onPointerEnter={() => setOver(x.id)} onClick={() => M.stWay(x.id)}>{x.n}</button>)}
        <button className="st-way new" onClick={() => M.stAct("way-new")}>+ Save these</button></div>
      <div className="st-wsum">{over ? <WaySum w={w} id={over} /> : <span className="st-wn">{on ? `${on.n} is in use.` : "One press switches several choices. Point at one to see what it would change."}</span>}</div>
      {u.saveWay ? <div className="st-save"><span>Name it:</span><input id="st-way-n" placeholder="For example, Exam week" aria-label="Name for the way of working" autoFocus onKeyDown={(e) => { if (e.key === "Enter") M.stAct("way-save", e.currentTarget.value); }} /><button className="st-btn pri" onClick={() => M.stAct("way-save", (document.getElementById("st-way-n") as HTMLInputElement | null)?.value ?? "")}>Save</button><button className="st-btn" onClick={() => M.stAct("way-x")}>Cancel</button></div> : null}
    </>
  );
}
function Main({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs, nHere = Object.values(P.data).filter((v) => v === "here").length, nConn = w.live ? (w.connections?.length ?? 0) : Object.values(P.conns).filter(Boolean).length;
  const spent = w.ais.reduce((s, a) => s + a.spent, 0);
  return (
    <div className="st-page" data-st="main">
      <div id="st-reply"><Reply u={u} /></div>
      <Care w={w} u={u} />
      <Ways w={w} u={u} />
      {GROUPS.map((g) => {
        const knobs = (g.knobs || []).filter((k) => !(w.live && NOT_LIVE.has(k)));
        return <section key={g.n} className="st-group"><h2 className="st-gh">{g.n}</h2><div className="st-sec">
          {g.custom === "voice" ? <><GoRow id="voice" sub={`I sound: ${[takeOf(w, K["v-length"], P.kept["v-length"]).n, takeOf(w, K["v-register"], P.kept["v-register"]).n.toLowerCase()].join(", ")}${P.kept["v-humour"] === "none" ? "" : ", with " + takeOf(w, K["v-humour"], P.kept["v-humour"]).n.toLowerCase()}${P.persona === "own" ? " · your own personality" : ""}`} />
            <GoRow id="learned" sub={`${P.learned.length} things${P.learn ? "" : ", not learning now"} · each one yours to change or remove`} /></>
            : knobs.map((id) => <Knob key={id} w={w} u={u} kid={id} />)}
          {g.custom === "money" ? <><GoRow id="data" sub={w.live ? "Where each kind of what I know goes" : `${nHere} of ${Object.keys(P.data).length} kinds stay on this machine · $${spent.toFixed(2)} spent this month`} /><GoRow id="conn" sub={`${nConn} connected · your own dictation or notes tool too`} /></> : null}
        </div></section>;
      })}
      <Back />
      {w.live ? null : <History w={w} u={u} />}
    </div>
  );
}

// ---------------------------------------------------------------- Your AI's voice

function Voice({ w, u }: { w: World; u: Ui }) {
  const P = w.prefs;
  return (
    <div className="st-page" data-st="voice">
      <h1>Your AI’s voice</h1>
      <p className="st-say">One voice speaks for all your AIs. I start with a default and grow toward how you talk.</p>
      <div className="st-vprev" id="st-vprev"><span className="nx-aura" /><div><div className="st-l">I would tell you it like this</div><div className="st-v">{voiceNow(w, u)}</div></div></div>
      <h2 className="st-gh">How I sound</h2>
      {VOICE.map((id) => <Knob key={id} w={w} u={u} kid={id} />)}
      <h2 className="st-gh" id="st-learned">What I’ve learned about you <small>read it, change it, remove it</small></h2>
      <div className="st-learn">
        {!P.learned.length ? <div className="st-fact"><span className="st-t st-t3">Nothing yet. I will add a line here when I learn something, and you can remove it.</span></div> : null}
        {P.learned.map((f) => u.edit != null && String(u.edit) === String(f.id)
          ? <div key={f.id} className="st-fact"><div className="st-edit"><input id="st-edit-i" defaultValue={f.t} aria-label="Edit this line" autoFocus onKeyDown={(e) => { if (e.key === "Enter") M.stAct("l-save", String(f.id), e.currentTarget.value); }} /><button className="st-btn pri" onClick={() => M.stAct("l-save", String(f.id), (document.getElementById("st-edit-i") as HTMLInputElement | null)?.value ?? "")}>Save</button><button className="st-btn" onClick={() => M.stAct("l-x")}>Cancel</button></div></div>
          : <div key={f.id} className="st-fact" data-learned={f.id}><span className="st-t">{f.t}<small>From {f.from}</small></span><span className="st-acts">
            {w.live ? <button className="st-tx" onClick={() => M.stAct("l-keep", String(f.id))}>Make it a rule</button> : <button className="st-tx" onClick={() => M.stAct("l-edit", String(f.id))}>Edit</button>}
            <button className="st-tx" onClick={() => M.stAct("l-rm", String(f.id))}>Remove</button></span></div>)}
      </div>
      <div className="st-toggle"><span className="st-t"><b>Learn from what I do</b>I learn only from what you pick and how you work, never from whether you praised me. Turn it off and I keep what I know and add nothing.</span><button className="st-switch" role="switch" aria-checked={P.learn} aria-label="Learn from what I do" onClick={() => M.stAct("learn")} /></div>
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
      <h2 className="st-gh" id="st-conn">Connected services <small>one at a time, each with what it may reach</small></h2>
      <div className="st-card0">
        {w.live ? (w.connections ?? []).map((c) => <div key={c.id} className="st-row" data-conn={c.id}><span className="st-t"><b>{c.name}</b><small>{c.from}</small></span><span className={`st-state${c.state === "ok" ? "" : " off"}`}>{c.state}</span></div>) : null}
        {w.serv.map((s) => { const on = P.conns[s.id]; return (
          <div key={s.id} className="st-row" data-conn={s.id}><span className="st-t"><b>{s.n}</b><small>Used by {s.by}</small><span className="st-may">May: {s.may.join(" · ")}</span><span className="st-may">May not: {s.not}</span></span>
            {on ? <><span className="st-state">Connected</span><button className="st-btn" onClick={() => M.stAct("disc", s.id)}>Disconnect</button></> : <><span className="st-state off">Not connected</span><button className="st-btn" onClick={() => M.stAct("conn-ask", s.id)}>Connect</button></>}</div>); })}
        {Object.keys(w.extra).filter((id) => !P.conns[id]).map((id) => { const s = w.extra[id]; return (
          <div key={id}><div className="st-row"><span className="st-t"><b>{s.n}</b><small>Found on this machine, not connected</small></span><button className="st-btn" onClick={() => M.stAct("conn-ask", id)}>Connect</button></div>
            {u.conn === id ? <div className="st-conf"><span>{s.n} may {s.may.join(" and ")}. It may not {s.not}. Connect it?</span><button className="st-btn pri" onClick={() => M.stAct("conn-ok", id)}>Connect it</button><button className="st-btn" onClick={() => M.stAct("conn-x")}>Not now</button></div> : null}</div>); })}
      </div>
      {Object.keys(w.tools).length ? <><h2 className="st-gh">Connect your own dictation or notes tool</h2><div className="st-card0"><p className="st-say">I have my own speech and meeting notes built in. If you already use another, connect it and it works as if it were built in: the same key, the same place, the same way to take things back.</p>
        <div className="st-tools">{Object.keys(w.tools).map((id) => { const t = w.tools[id], on = P.tools[t.kind] === id; return (
          <div key={id} className="st-tool"><b>{t.n}</b><span>{t.what}{on ? " · connected, working as if built in" : ""}</span>{on ? <button className="st-btn" onClick={() => M.stAct("tool-off", id)}>Use mine again</button> : <button className="st-btn" onClick={() => M.stAct("tool-ask", id)}>Connect {t.n}</button>}</div>); })}</div>
        {u.tool && w.tools[u.tool] ? <div className="st-conf"><span>{w.tools[u.tool].say}</span><button className="st-btn pri" onClick={() => M.stAct("tool-ok", u.tool!)}>Connect {w.tools[u.tool].n}</button><button className="st-btn" onClick={() => M.stAct("tool-x")}>Not now</button></div> : null}</div></> : null}
    </div>
  );
}

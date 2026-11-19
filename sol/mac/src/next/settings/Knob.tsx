// One choice as a few takes (#1604, slice 6; ui.html knobHTML and cmpHTML): its head (what it is, who set it, what is
// in use), and open: the AI it is for, its takes (moving onto one tries it on the window, a press or Enter keeps it,
// ⌘Z or "Turn back" returns), "Now → With this" while one is tried, its sample, what it sets, the floor no take
// changes, your own take and its earlier takes. Reads the store, presses M. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import type { PointerEvent as RPointerEvent } from "react";
import { M } from "../cv/index.ts";
import { K, allTakes, byAI, cmp, curName, day, kk, sample, setBy, takeOf, trail, tryOn, whoText, type Cmp, type Ui, type World } from "./model.ts";

export function CmpBox({ c }: { c: Cmp }) {
  return (
    <div className="st-cmpw" data-st-cmp>
      {c.live ? <div className="st-sl">The whole window around you is showing it now. Leave and it goes back.</div> : null}
      {c.lead ? <div className="st-sl">{c.lead}</div> : null}
      <div className="st-vsh"><span>{c.labels[0]}: <b>{c.head[0]}</b></span><span className="st-ar">→</span><span>{c.labels[1]}: <b>{c.head[1]}</b></span></div>
      {c.rows ? <ul className="st-cmp">{c.rows.map((r, i) => <li key={i} className={r.chg ? "chg" : ""}><span className="st-m">{r.m}</span><span className="st-n">{r.n}</span><span className="st-w">{r.w}</span></li>)}</ul> : null}
      {c.count ? <div className="st-cn">{c.count}</div> : null}
      {c.two ? <div className="st-two"><div><small>{c.labels[0]}</small><span>{c.two[0]}</span></div><div><small>{c.labels[1]}</small><span>{c.two[1]}</span></div></div> : null}
    </div>
  );
}

export function Knob({ w, u, kid }: { w: World; u: Ui; kid: string }) {
  const k = K[kid], ai = k.per ? u.ai[kid] : null, key = kk(k, ai), kept = w.prefs.kept[key], tr = tryOn(u, kid, ai), shown = tr || kept;
  const T = takeOf(w, k, shown), KT = takeOf(w, k, kept), open = u.open === kid, a = ai ? w.ais.find((x) => x.id === ai) : null;
  const tk = allTakes(w, u, k), last = trail(w, k, ai), prev = last.length > 1 ? last[last.length - 2] : null, trying = !!tr && tr !== kept;
  const by = setBy(w, key), s = open ? sample(w, u, k, T, ai) : null;
  const leaveIfOut = (e: RPointerEvent) => {
    const t = u.trying; if (!t || t.sticky || t.k !== kid) return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (e.currentTarget as Element).contains(ae) && ae.dataset.t === t.t) return;
    M.stLeave();
  };
  const tags = (t: { id: string; mine?: boolean; offered?: boolean }) => {
    const p: string[] = [];
    if (tr === t.id && kept !== t.id) p.push("Trying"); else if (kept === t.id) p.push("In use");
    if (t.mine) p.push("yours"); if (t.id === k.def) p.push("default"); if (t.offered) p.push("offered");
    return p.join(" · ");
  };
  return (
    <div className={`st-knob${open ? " open" : ""}`} data-knob={kid} onPointerLeave={leaveIfOut}>
      {kid === "attention" && w.prefs.quiet ? <div className="st-quiet"><span className="nx-aura" /><span>Quiet until <b>{w.prefs.quiet}</b>. Nothing opens the island before then.</span><button className="st-tx" onClick={() => M.stAct("quietend")}>End it</button></div> : null}
      <button className="st-head" aria-expanded={open} onClick={() => M.stAct("open", kid)}>
        <span className="st-ht"><b>{k.n}</b><small>{k.s}</small><small className="st-who">{whoText(w, k)}</small></span>
        <span className={`st-cur${trying ? " try" : ""}`}>{trying ? "Trying " : ""}{open || !k.per ? T.n : curName(w, k)}</span>
      </button>
      {open ? <div className="st-body">
        {a ? <div className="st-ais" role="radiogroup" aria-label="Which AI">{w.ais.map((x) => <button key={x.id} className="st-ai" role="radio" aria-checked={x.id === ai} data-ai-pick={x.id} onClick={() => M.stAct("ai", kid, x.id)}><span className="nx-aura" />{x.n}</button>)}</div> : null}
        <div className="st-takes" role="radiogroup" aria-label={`${k.n}. Arrow keys try one; Enter keeps it.`}>
          {tk.map((t) => (
            <button key={t.id} className={`st-take${kept === t.id ? " use" : ""}${trying && tr === t.id ? " try" : ""}`} role="radio" aria-checked={kept === t.id} tabIndex={t.id === shown ? 0 : -1}
              data-k={kid} data-t={t.id} aria-label={`${t.n}. ${t.s}`}
              onPointerMove={() => { if (!(u.trying && u.trying.k === kid && u.trying.t === t.id)) M.stTry(kid, t.id); }}
              onFocus={() => M.stTry(kid, t.id)}
              onKeyDown={(e) => {
                const L = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(".st-take") ?? [])], i = L.indexOf(e.currentTarget);
                const n = e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(L.length - 1, i + 1) : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? L.length - 1 : -1;
                if (n >= 0) { e.preventDefault(); L[n].focus(); }
              }}
              onClick={() => M.stKeep(kid, t.id)}>
              <span className="st-tags">{tags(t)}</span><b>{t.n}</b><span className="st-s">{t.s}</span>
            </button>
          ))}
        </div>
        <div className="st-foot">
          {trying ? <>
            <span className="st-t">Trying <b>{T.n}</b>. Nothing changes until you keep it.</span>
            <button className="st-btn pri" data-st="keep" onClick={() => M.stKeep()}>Keep it <span className="nx-kbd">⏎</span></button>
            <button className="st-btn" data-st="leave" onClick={() => M.stLeave()}>Leave <span className="nx-kbd">esc</span></button>
          </> : <>
            <span className="st-t">{a ? `${a.n} uses` : "In use:"} <b>{KT.n}</b>.</span>
            {prev ? <button className="st-btn" data-st="turnback" onClick={() => M.stAct("back", kid)}>Turn back to {takeOf(w, k, prev.t).n} <span className="nx-kbd">⌘Z</span></button> : null}
            {kept !== k.def ? <button className="st-btn" onClick={() => M.stAct("default", kid)}>Back to the default</button> : null}
          </>}
        </div>
        {!trying && byAI(by) && by?.why ? <div className="st-whyai"><span className="nx-aura" /><span>I set this on {day(by.when)}. {by.why}</span></div> : null}
        {trying ? <div className="st-sample st-cmpbox" data-sample={kid}><CmpBox c={cmp(w, k, kept, tr!, ai)} /></div> : null}
        {!trying || ["working", "writing", "marking"].includes(kid) ? <div className="st-sample" data-sample={kid}>
          <div className="st-sl">{s!.lead}</div>
          {s!.rows.length ? <ul className="st-feed">{s!.rows.map((r, i) => <li key={i}><span>{r.m}</span><b>{r.w}</b></li>)}</ul> : null}
          {s!.line ? <div className="st-line">{s!.line}</div> : null}
          <div className="st-sets">What it sets: {T.sets || (T.base ? takeOf(w, k, T.base).sets : "")}{T.mine ? ". Made by you." : ""}</div>
        </div> : null}
        {k.core ? <div className="st-core"><span>{k.core}</span></div> : null}
        <div className="st-more">
          {u.own === kid ? <OwnTake kid={kid} base={KT.n} /> : <button className="st-tx" onClick={() => M.stAct("own", kid)}>Make my own from this</button>}
          {last.length > 1 ? <details className="st-earlier"><summary>Earlier takes ({last.length - 1})</summary><ul>{last.slice(0, -1).reverse().map((e, i) => (
            <li key={i}><span className="st-when">{e.when}</span><span>{takeOf(w, k, e.t).n}</span><button className="st-tx" onClick={() => M.stAct("goto", kid, e.t)}>Go back to this</button></li>
          ))}</ul></details> : null}
        </div>
      </div> : null}
    </div>
  );
}

function OwnTake({ kid, base }: { kid: string; base: string }) {
  const save = (el: HTMLInputElement | null) => M.stAct("own-save", kid, el?.value ?? "");
  return (
    <div className="st-own">
      <span>Name your own, made from “{base}”:</span>
      <input id="st-own-n" defaultValue={`${base} (mine)`} aria-label="Name for your own take" autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(e.currentTarget); }} />
      <button className="st-btn pri" onClick={() => save(document.getElementById("st-own-n") as HTMLInputElement | null)}>Keep it</button>
      <button className="st-btn" onClick={() => M.stAct("own-x")}>Cancel</button>
    </div>
  );
}

// The history of changes, drawn (#1604, slice 6; ui.html historyHTML, stripHTML, hRow, pvHTML): every change read from
// the two snapshots around it, who made it, what it means; "Turn back to this…" previews a past state against now, and
// "Go back to this" replays it as a new change at the top (nothing in the past is rewritten). Its engine row is "no":
// a real Sol draws none of it. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { M } from "../cv/index.ts";
import { CmpBox } from "./Knob.tsx";
import { K, WHO, WHON, changeName, cmp, day, diffSnap, mean, takeOf, type Change, type Ui, type World } from "./model.ts";

function Ch({ w, c, L }: { w: World; c: Change; L?: [string, string] }) {
  const k = K[c.kid];
  return (
    <div className="st-hch" data-change={c.key}>
      <div className="st-nm">{changeName(w, c)}</div>
      <div className="st-vs">{L ? <small>{L[0]} </small> : null}<s>{takeOf(w, k, c.from).n}</s><span className="st-ar">→</span>{L ? <small>{L[1]} </small> : null}<b>{takeOf(w, k, c.to).n}</b></div>
      <div className="st-mean">{mean(w, c)}</div>
    </div>
  );
}

function Row({ w, u, i, n }: { w: World; u: Ui; i: number; n: number }) {
  const h = w.hist[i], who = WHO(h), d = i ? diffSnap(w.hist[i - 1].snap, h.snap) : { k: [], more: [] }, cur = i === n - 1, back = /turned/.test(h.how);
  const vis = d.k.filter((c) => !c.kid.startsWith("v-")), see = u.hsee === i && vis.length > 0;
  return (
    <div className={`st-hv ${who}${cur ? " cur" : ""}${u.hx === i ? " pv" : ""}`} id={`st-h${i}`} data-h={i}>
      <div className="st-hh"><span className="st-by">{WHON[who]}{back ? " turned back" : ""}</span><span className="st-how">{h.how}</span><span className="st-when">{h.when}</span>{cur ? <span className="st-hnow">In use now</span> : null}</div>
      {!i ? <div className="st-hfirst">Every choice started at its default: AIs ask first, nothing taps you but what needs you, paper, the usual size.</div> : null}
      {d.k.map((c) => <Ch key={c.key} w={w} c={c} />)}
      {d.more.length ? <div className="st-hmore">Changed {d.more.join(", ")}.</div> : null}
      {i && !d.k.length && !d.more.length ? <div className="st-hmore">Nothing actually changed: it was already this way.</div> : null}
      {h.why ? <div className="st-whyai"><span className="nx-aura" /><span>Why: {h.why}</span></div> : null}
      <div className="st-hacts">
        {vis.length ? <button className="st-tx" aria-expanded={see} onClick={() => M.stAct("hsee", String(i))}>{see ? "Fold it" : "See it on your things"}</button> : null}
        {cur ? null : <button className="st-btn" data-st="hpv" onClick={() => M.stPreview(i)}>Turn back to this…</button>}
      </div>
      {see ? <div className="st-hsee">{vis.map((c) => <div key={c.key} className="st-sample st-cmpbox"><CmpBox c={cmp(w, K[c.kid], c.from, c.to, c.ai || u.ai[c.kid], ["Before", "After"])} /></div>)}</div> : null}
    </div>
  );
}

export function History({ w, u }: { w: World; u: Ui }) {
  const n = w.hist.length;
  if (!n) return null;
  const ids = [...Array(n).keys()].reverse(), show = ids.slice(0, 6), older = ids.slice(6);
  const days: { d: string; i: number[] }[] = [];
  w.hist.forEach((h, i) => { const dd = day(h.when); let g = days.find((x) => x.d === dd); if (!g) { g = { d: dd, i: [] }; days.push(g); } g.i.push(i); });
  const c = { you: 0, ai: 0, back: 0 };
  w.hist.slice(1).forEach((h) => { if (/turned/.test(h.how)) c.back++; else if (WHO(h) === "ai") c.ai++; else c.you++; });
  const jump = (i: number) => { const el = document.getElementById(`st-h${i}`); if (el) el.scrollIntoView({ block: "center" }); else { const det = document.querySelector<HTMLDetailsElement>(".st-hlist .st-earlier"); if (det) det.open = true; } };
  const pv = u.hx != null && w.hist[u.hx] ? u.hx : null;
  return (
    <section className="st-history" aria-labelledby="st-history">
      <h2 id="st-history" className="st-gh">History of changes <small>for the whole of Settings</small></h2>
      <div className="st-hstrip">
        <div className="st-sum"><b>{n - 1} changes since {day(w.hist[0].when)}</b><span>{c.you} by you</span><span>{c.ai} by your AI</span><span>{c.back} turned back</span></div>
        <div className="st-days">{days.map((g) => <div key={g.d} className="st-day"><div className="st-dots">{g.i.map((i) => {
          const h = w.hist[i], k = /turned/.test(h.how) ? "back" : WHO(h);
          return <button key={i} className={`st-d ${k}${i === n - 1 ? " cur" : ""}${u.hx === i ? " pv" : ""}`} title={`${h.when}: ${h.label}`} aria-label={`${h.when}: ${h.label}`} onClick={() => jump(i)} />;
        })}</div><small>{g.d.replace(/^(\w{3}) (\d+).*/, "$1 $2")}</small></div>)}</div>
      </div>
      {pv != null ? <Preview w={w} i={pv} /> : null}
      <div className="st-hlist">
        {show.map((i) => <Row key={i} w={w} u={u} i={i} n={n} />)}
        {older.length ? <details className="st-earlier" open={pv != null && pv < n - 6}><summary>Earlier ({older.length})</summary>{older.map((i) => <Row key={i} w={w} u={u} i={i} n={n} />)}</details> : null}
      </div>
      <div className="st-hbar"><span className="st-t">Turning back is itself a change in this list. Nothing in the past is rewritten.</span><button className="st-btn" onClick={() => M.stAct("hdef")}>Back to the default, for everything</button></div>
    </section>
  );
}

function Preview({ w, i }: { w: World; i: number }) {
  const h = w.hist[i], d = diffSnap(w.prefs, h.snap), c = d.k.length + d.more.length, vis = d.k.some((x) => x.kid === "look" || x.kid === "size");
  return (
    <div className="st-hpv" role="region" aria-label={`Turning back to ${h.when}`} data-st="preview">
      <div className="st-hd"><b>Back to {h.when}</b><small>{c ? `${c} thing${c === 1 ? "" : "s"} would change from how it is now${vis ? ". The window around you is showing it." : "."}` : "Nothing would change: it is the same as now."}</small></div>
      {d.k.map((x) => <Ch key={x.key} w={w} c={x} L={["Now", "Then"]} />)}
      {d.more.length ? <div className="st-hmore">Also {d.more.join(", ")}.</div> : null}
      <div className="st-hacts">
        <button className="st-btn pri" data-st="hgo" onClick={() => M.stReplay(i)}>Go back to this</button>
        <button className="st-btn" onClick={() => M.stPreview(null)}>Keep it as it is</button>
        <span className="st-t">Going back is a new change at the top. Nothing in the past is rewritten.</span>
      </div>
    </div>
  );
}

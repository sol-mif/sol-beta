// One choice as a few takes (#1604, slice 6; ui.html knobHTML and cmpHTML): its head (what it is, who set it, what is
// in use), and open: the AI it is for, its takes (moving onto one tries it on the window, a press or Enter keeps it,
// ⌘Z or "Turn back" returns), "Now → With this" while one is tried, its sample, what it sets, the floor no take
// changes, your own take and its earlier takes. Reads the store, presses M. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { type PointerEvent as RPointerEvent } from "react";
import Because from "../because/Because.tsx";
import type { Fixer } from "../because/fix.ts";
import type { Known } from "../known.ts";
import { M } from "../cv/index.ts";
import { K, allTakes, byAI, cmp, curName, day, fitKnob, fitWho, kk, sample, setBy, standing, takeOf, trail, tryOn, whoText, type Cmp, type Ui, type World } from "./model.ts";
import { ReachPick, WhyFit } from "./Fits.tsx";
import { KnobWho, fitWhyOf } from "../fits/views.tsx";   // slice R8 (#1615): a knob's "who set it", requests/fits.md

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

/** a change Sol made on its own, in at most six grey words after "because" (the because in flow's length; BR1 item 6) */
export const becauseW = (why: string) => { const w = why.trim().replace(/^because\s+/i, "").replace(/\.$/, ""); return `because ${w.charAt(0).toLowerCase()}${w.slice(1)}`; };

/** why Sol set a row, under its head and outside its button, on the shared because (Because.tsx, as the Diary and a
 *  folder's parts): the grey words, then unfolded the reason as a sentence, where it came from with a link to History of
 *  changes, and That's right · That's wrong · It's out of date. That's wrong previews going back to the value before
 *  Sol's, It's out of date to the default; each is kept or given Back (the orchestrator's order, BR1 item 2, #1615) */
function KnobBecause({ w, kid, kept, prev, why, from }: { w: World; kid: string; kept: string; prev: string | null; why: string; from: string }) {
  const said = why.trim().replace(/^because\s+/i, ""), k = `set:${kid}`;
  const fact: Known = { k, fact: said.charAt(0).toUpperCase() + said.slice(1).replace(/([^.])$/, "$1."), source: from, by: "sol", place: null };
  return <span className="st-bcl"><Because ks={[k]} all={[fact]} fixer={knobFixer(w, kid, kept, prev)} words={becauseW(why)} link={{ label: "History of changes", go: () => M.stPlace("history") }} /></span>;
}
/** That's right changes nothing; the other two show what would change, "<knob> <now> → <then>", and keep it by the moves */
function knobFixer(w: World, kid: string, kept: string, prev: string | null): Fixer {
  const k = K[kid];
  return {
    fix: async ({ how }) => {
      if (how === "right") return { changes: [], token: "right" };
      const back = how === "not-true" && prev !== null, to = back ? prev : k.def;
      return { changes: to === kept ? [] : [{ what: k.n, from: takeOf(w, k, kept).n, to: takeOf(w, k, to).n, when: "now" }], token: back ? "back" : "default" };
    },
    settle: async (token, keep) => { if (keep && token !== "right") M.stAct(token, kid); },
  };
}

/** plain: the row says its name and what is in use, and why only when Sol set it (BR1 item 6: Settings holds fixed inputs as
 *  plain rows); what it is for shows when it is open */
export function Knob({ w, u, kid, plain = false }: { w: World; u: Ui; kid: string; plain?: boolean }) {
  const k = K[kid], ai = k.per ? u.ai[kid] : null, key = kk(k, ai), kept = w.prefs.kept[key], tr = tryOn(u, kid, ai), shown = tr || kept;
  const T = takeOf(w, k, shown), KT = takeOf(w, k, kept), open = u.open === kid, a = ai ? w.ais.find((x) => x.id === ai) : null;
  const tk = allTakes(w, u, k), last = trail(w, k, ai), prev = last.length > 1 ? last[last.length - 2] : null, trying = !!tr && tr !== kept;
  const by = setBy(w, key), s = open ? sample(w, u, k, T, ai) : null, fit = w.live && fitKnob(k);
  const lead = fit ? standing(w, kid) : null, who = fit ? (lead ? fitWho(lead) : "the default") : whoText(w, k);
  // why Sol set it on its own, if it did and it still holds: the live fit's reason, the person's month, or the change Sol made
  const solWhy = !plain ? null : fit ? (lead && lead.author === "sol" && lead.take !== null ? lead.reason ?? null : null)
    : by && !byAI(by) ? null   // the person set it last: Sol's why no longer holds
    : fitWhyOf(kid) ?? (byAI(by) && by?.why && by.snap.kept[key] === kept ? by.why : null);
  // the row's name is its name alone; what is in use, and why, is its description (BR1 item 6: one label per control)
  const cur = `${trying ? "Trying " : ""}${open || !k.per ? T.n : curName(w, k)}`;
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
      <button className="st-head" aria-expanded={open} aria-label={k.n} aria-description={[cur, plain ? (solWhy ? becauseW(solWhy).replace(/^b/, "B") : null) : k.s].filter(Boolean).join(". ")} onClick={() => M.stAct("open", kid)}>
        {plain ? <span className="st-ht"><b>{k.n}</b>{open ? <small>{k.s}</small> : null}</span>
          : <span className="st-ht"><b>{k.n}</b><small>{k.s}</small><small className="st-who"><KnobWho kid={k.id} or={who} /></small></span>}
        <span className={`st-cur${trying ? " try" : ""}`}>{cur}</span>
      </button>
      {solWhy ? <KnobBecause w={w} kid={kid} kept={kept} prev={prev?.t ?? null} why={solWhy} from={[`Sol set “${KT.n}”`, ...(fit && lead ? [lead.source, lead.count ? `seen ${lead.count} times` : null] : [by && byAI(by) ? day(by.when) : null])].filter(Boolean).join(" · ")} /> : null}
      {open ? <div className="st-body">
        {a ? <div className="st-ais" role="radiogroup" aria-label="Which AI">{w.ais.map((x) => <button key={x.id} className="st-ai" role="radio" aria-checked={x.id === ai} data-ai-pick={x.id} onClick={() => M.stAct("ai", kid, x.id)}><span className="nx-aura" />{x.n}</button>)}</div> : null}
        {fit ? <ReachPick w={w} u={u} /> : null}
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
        {fit && !trying ? <WhyFit w={w} k={k} /> : null}
        {!fit && !trying && byAI(by) && by?.why ? <div className="st-whyai"><span className="nx-aura" /><span>I set this on {day(by.when)}. {by.why}</span></div> : null}
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

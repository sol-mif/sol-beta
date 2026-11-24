// Kept for a place, live (BR1 #1615; next.fits, S15): where a press keeps a take (All of Sol, this folder, this session),
// why a knob has the take it has here (each place from this session up to All of Sol, who set it, why, held or not, with
// a Back and "Let Sol fit it again"), and the history of every fit, newest first. The fixture draws History.tsx instead.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import { M } from "../cv/index.ts";
import { K, chainHere, fitOf, fitWho, scopeName, standing, takeOf, when, type Fit, type FitStep, type Knob, type Reach, type Ui, type World } from "./model.ts";

/** where the next press keeps its take; a reach with nothing under Settings is not offered */
export function ReachPick({ w, u }: { w: World; u: Ui }) {
  const opts: { id: Reach; n: string; off: boolean }[] = [
    { id: "~", n: "All of Sol", off: false },
    { id: "folder", n: w.here?.folder ? `This folder, ${w.here.folder.name}` : "This folder", off: !w.here?.folder },
    { id: "session", n: "This session", off: !w.here?.session },
  ];
  return (
    <div className="st-keepfor" data-st="reach">
      <span>Keep it for</span>
      <span className="st-seg" role="radiogroup" aria-label="Keep it for">
        {opts.map((o) => <button key={o.id} role="radio" aria-checked={u.reach === o.id} disabled={o.off} title={o.off ? "Open Settings from a folder or a session to keep it there" : undefined} onClick={() => M.stAct("reach", o.id)}>{o.n}</button>)}
      </span>
    </div>
  );
}

/** "Why this value": each place a take is looked for here, nearest first, and the default under them */
export function WhyFit({ w, k }: { w: World; k: Knob }) {
  // this session, this folder and All of Sol always; a folder above this one only when something is kept there
  const near = new Set([w.here?.session?.scope, w.here?.folder?.scope, "~"]);
  const lead = standing(w, k.id), rows = chainHere(w).map((s) => ({ s, f: fitOf(w, k.id, s) })).filter(({ s, f }) => near.has(s) || !!f);
  const inUse = (f: Fit | null) => !!f && f === lead;
  return (
    <details className="st-earlier st-why" data-st="why" open={!!lead && (lead.held || lead.author === "sol")}>
      <summary>Why {lead?.take ? takeOf(w, k, lead.take).n : takeOf(w, k, k.def).n}?</summary>
      <ul>
        {rows.map(({ s, f }) => (
          <li key={s} className={inUse(f) ? "use" : ""} data-scope={s}>
            <span className="st-when">{scopeName(w, s)}</span>
            <span>{f?.take ? <b>{takeOf(w, k, f.take).n}</b> : "—"} <small>{f ? fitWho(f) : "Not set here"}{f?.change ? ` · ${when(f.history.find((h) => h.id === f.change)?.at ?? 0)}` : ""}</small></span>
            {f?.take ? <button className="st-tx" onClick={() => M.stAct("fitback", k.id, s)}>Take it back</button> : null}
            {f?.held ? <span className="st-hold">You took this back, so Sol won’t bring it back on its own. <button className="st-tx" data-st="release" onClick={() => M.stAct("release", k.id, s)}>Let Sol fit it again</button></span> : null}
          </li>
        ))}
        <li className={lead ? "" : "use"}><span className="st-when">Sol’s default</span><span><b>{takeOf(w, k, k.def).n}</b></span></li>
      </ul>
    </details>
  );
}

const STEP: Record<FitStep["act"], string> = { set: "", back: "took it back", release: "let Sol fit it again", offer: "offered", keep: "kept an offer", notnow: "said not now" };

/** every fit's history, newest first: who, what, where, why; Back on a take that still stands */
export function FitHistory({ w }: { w: World }) {
  const rows = (w.fits ?? []).flatMap((f) => f.history.map((h) => ({ f, h }))).sort((a, b) => b.h.at - a.h.at);
  const show = rows.slice(0, 8), older = rows.slice(8);
  const Row = ({ f, h }: { f: Fit; h: FitStep }) => {
    const k = K[f.knob], name = k?.n ?? f.knob, take = h.take && k ? takeOf(w, k, h.take).n : h.take;
    const who = h.author === "sol" ? "Sol" : "You", stands = f.change === h.id;
    return (
      <div className={`st-hv ${h.author === "sol" ? "ai" : "you"}${stands ? " cur" : ""}`} data-fit-step={h.id}>
        <div className="st-hh"><span className="st-by">{h.act === "set" ? who : "You"}{STEP[h.act] ? ` ${STEP[h.act]}` : ""}</span><span className="st-how">{scopeName(w, f.scope)}</span><span className="st-when">{when(h.at)}</span>{stands ? <span className="st-hnow">In use</span> : null}</div>
        <div className="st-hch"><div className="st-nm">{name}</div>{take ? <div className="st-vs"><b>{take}</b>{h.undone ? <small> · taken back</small> : null}</div> : null}</div>
        {h.reason ? <div className="st-whyai"><span className="nx-aura" /><span>Why: {h.reason}{h.count ? ` (seen ${h.count} time${h.count === 1 ? "" : "s"})` : ""}</span></div> : null}
        {stands ? <div className="st-hacts"><button className="st-btn" data-st="fitback" onClick={() => M.stAct("fitback", f.knob, f.scope)}>Take it back</button></div> : null}
      </div>
    );
  };
  return (
    <section className="st-history" aria-labelledby="st-history">
      <h2 id="st-history" className="st-gh">History of changes <small>for all of Sol and each place</small></h2>
      {rows.length ? <div className="st-hlist">
        {show.map((r) => <Row key={r.h.id} {...r} />)}
        {older.length ? <details className="st-earlier"><summary>Earlier ({older.length})</summary>{older.map((r) => <Row key={r.h.id} {...r} />)}</details> : null}
      </div> : <div className="st-hfirst">Nothing changed yet. Every choice is at its default. What you keep shows here, with a way to take it back.</div>}
      <div className="st-hbar"><span className="st-t">Taking something back is itself a change in this list. Nothing in the past is rewritten.</span></div>
    </section>
  );
}

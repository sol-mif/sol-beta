// See what's at work (BR1 item 7, picked as drawn: mine/look/br1/at-work.html), the page "atwork": everything at work in
// time order, Now · Next · What your AI did, scoped like the Diary (the sidebar's Working now heading opens everything, a
// folder's Working now part that folder's). The frame stays whole when nothing runs, each part saying its own none; no
// folder of it on the canvas (BR1 conform #32, Q5). A row's kind is a mark, never a section. What needs you is first, with its one press; ‖ and ■ show
// on the row under the pointer or in focus; a press unfolds the row in place: the lead and its helpers, its because…,
// Pause · Stop · Open the session. Pause everything holds what is shown (act.ts holdAll), and then Resume everything is the one
// press. The model is model.ts; the presses act.ts. Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import { useEffect } from "react";
import { D, regionOf, useNext } from "../cv/core.ts";
import * as B from "../diary/book.ts";
import Because from "../because/Because.tsx";
import { countWords, type Row, type View } from "./model.ts";
import type { SlotProps } from "../slots.ts";
import { viewNow } from "./count.ts";
import { goAll, goOn, holdAll, openAt, pause, st, stop, unfold } from "./act.ts";
import "./atwork.css";


const ago = (t: number | null) => {
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
};
const folderName = (id: string | null) => (id ? (regionOf(id)?.name ?? "").replace(/ \(.*\)$/, "") : "");
const MARK: Record<Row["kind"], string> = { session: "A session", auto: "An automation" };
const KIND: Record<Row["kind"], string> = { session: "session", auto: "automation" };

export default function AtWorkSlot(_: SlotProps) {
  return <AtWork />;
}

function AtWork() {
  useNext((d) => d.work);
  useEffect(() => () => { st.scope = null; st.said = null; st.open = null; }, []);
  const scope = st.scope, v = viewNow(scope), all = scope ? viewNow(null) : v;
  const where = scope ? folderName(scope) : "Everything in your Sol";
  const elsewhere = scope ? all.now.length - v.now.length : 0;
  const quiet = !v.now.length && !v.held;
  return (
    <div className="aw" id="v-atwork" data-face-part="atwork" data-scope={scope ?? ""}>
      <header className="aw-top">
        <div className="aw-title"><h1>At work</h1><p className="aw-sub">{where} · {countWords(v)}</p></div>
        {v.held ? <button className="aw-btn aw-pri" data-aw="go" onClick={goAll}>Resume everything</button>
          : v.now.length || v.next.length ? <button className="aw-btn" data-aw="hold" onClick={() => holdAll(v)}>{scope ? "Pause everything in this folder" : "Pause everything"}</button> : null}
      </header>
      {st.said ? <div className="aw-said" role="status" data-aw="said"><span>{st.said.words}</span>{st.said.back ? <button className="aw-btn" data-aw="back" onClick={st.said.back}>Back</button> : null}</div> : null}
      {v.held ? <div className="aw-holds" role="status" data-aw="held"><b>Everything holds.</b> <span>{heldWords(v)}</span></div> : null}
      {/* the frame stays whole when nothing runs: Now, Next, What your AI did, each saying its own none (BR1 conform #32) */}
      <section className="aw-sec" aria-labelledby="aw-now">
        <h2 id="aw-now">Now</h2>
        {quiet ? <ul className="aw-list aw-group"><li className="aw-row aw-none" data-aw="quiet"><span className="aw-what"><b>No AI is working right now</b><span className="aw-line">Type a task in the bar below; whatever an AI starts shows here.</span></span></li></ul>
          : <ul className="aw-list">{v.now.map((r) => <RowView key={r.id} r={r} scoped={!!scope} />)}</ul>}
      </section>
      <section className="aw-sec" aria-labelledby="aw-next">
        <h2 id="aw-next">Next <small>today</small></h2>
        <ul className="aw-list aw-group">{v.next.length ? v.next.map((x) => (
          <li key={x.id} className="aw-row aw-due" data-aw-next={x.id}>
            <span className="aw-what"><b>{x.name}</b></span>
            <span className="aw-time">{[scope ? "" : folderName(x.folder), x.when].filter(Boolean).join(" · ")}</span>
          </li>)) : <li className="aw-row aw-none" data-aw-none="next"><span className="aw-what aw-line">Nothing is due today</span></li>}
        </ul>
        {v.later ? <p className="aw-more">{v.later} more automation{v.later === 1 ? "" : "s"}, none due today</p> : null}
      </section>
      <section className="aw-sec" aria-labelledby="aw-did">
        <h2 id="aw-did">What your AI did <small>today</small></h2>
        <ul className="aw-list aw-group">{v.did.length ? v.did.slice(0, 5).map((l) => (
          <li key={l.id} className="aw-row aw-did" data-aw-did={l.id}>
            <span className="aw-what"><span className="aw-said-l"><b>{l.who === B.VOICE ? "" : `${l.who} `}</b>{l.what} <Because ks={l.because} here={l.region ?? undefined} /></span></span>
            <span className="aw-time">{B.hm(l.t)}</span>
          </li>)) : <li className="aw-row aw-none" data-aw-none="did"><span className="aw-what aw-line">Nothing yet today</span></li>}
        </ul>
        <button className="aw-link" data-act="toDiary">See more in the Diary</button>
      </section>
      {scope && elsewhere > 0 ? <button className="aw-link" data-aw="all" onClick={() => openAt(null)}>See {elsewhere} more at work in other folders</button> : null}
    </div>
  );
}

function heldWords(v: View): string {
  const h = v.held!, s = h.sessions.length, a = h.autos.length;
  return [s ? `${s} session${s === 1 ? " finishes its step and waits" : "s finish their step and wait"}` : "", a ? `${a} automation${a === 1 ? " skips" : "s skip"} until you resume` : ""].filter(Boolean).join("; ") + ".";
}

function RowView({ r, scoped }: { r: Row; scoped: boolean }) {
  const open = st.open === r.id, held = r.stand === "held";
  const sub = [scoped ? "" : folderName(r.folder), r.line].filter(Boolean).join(" · ");
  return (
    <li className={`aw-row aw-${r.stand}${open ? " open" : ""}`} data-aw-row={r.id}>
      <button className="aw-head" aria-expanded={open} aria-label={r.name} aria-description={`${MARK[r.kind]}. ${sub}`} onClick={() => unfold(r.id)}>
        <span className="aw-mark" data-kind={r.kind} aria-hidden="true" />
        <span className="aw-what"><b>{r.name}</b><span className="aw-line">{sub}</span></span>
        <span className="aw-time">{held ? "held" : ago(r.since)}</span>
      </button>
      {r.stand === "asks" ? <button className="aw-btn aw-pri" data-act={`goto:${r.id.startsWith("auto:") && r.sessionId ? r.sessionId : r.id}`}>Answer</button>
        : held ? <button className="aw-btn" data-aw="on" aria-label={`Resume the ${KIND[r.kind]} “${r.name}”`} onClick={() => goOn(r)}>Resume</button> : (
          <span className="aw-acts">
            <button className="aw-ic" data-aw="pause" aria-label={`Pause the ${KIND[r.kind]} “${r.name}”`} title="Pause: it finishes this step, then waits" onClick={() => pause(r)}>‖</button>
            <button className="aw-ic" data-aw="stop" aria-label={`Stop the ${KIND[r.kind]} “${r.name}”`} title="Stop: it ends now and keeps what it made" onClick={() => stop(r)}>■</button>
          </span>)}
      {open ? (
        <div className="aw-open" data-aw="open">
          {r.because.length ? <p className="aw-line">Why it runs: <Because ks={r.because} here={r.folder ?? undefined} /></p> : null}
          <ul className="aw-tree">
            <li><b>{r.name}</b> <span className="aw-line">{r.kind === "auto" ? "runs" : "leads"} · {ago(r.since)}</span></li>
            {r.helpers.map((h, i) => <li key={i} className="aw-help">{h} <span className="aw-line">working</span></li>)}
          </ul>
          <div className="aw-do">
            {held ? <button className="aw-btn" onClick={() => goOn(r)}>Resume</button> : <button className="aw-btn" onClick={() => pause(r)}>‖ Pause</button>}
            <button className="aw-btn" onClick={() => stop(r)}>■ Stop</button>
            {D.pieces[r.id] || r.sessionId ? <button className="aw-btn" data-act={`goto:${D.pieces[r.id] ? r.id : r.sessionId}`}>Open the session</button> : null}
          </div>
          <p className="aw-line">{r.kind === "auto" ? "Pause: this run finishes, the next ones skip until you resume." : "Pause: it finishes this step, then waits."} Stop: it ends now and keeps what it made.</p>
        </div>
      ) : null}
    </li>
  );
}

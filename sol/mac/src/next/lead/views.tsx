// One lead per piece (round 7, #1615; merge/lead.js's views, as they are). The other slices' views keep a render point
// each, and these fill it (docs/port/requests/lead.md lists them):
//   FarLeads     the plane's folder card at Far: one lead line per piece of many parts, clamped to two lines
//   LeadSay      a split session's face at Middle: its say line becomes the lead line and the one said line
//   PartsSum     past six parts, the part rows fold into one line
//   JobFace      a job's face at Middle (kind 'job'): the name and folder only in its title row (F4), then the line
//   LeadFold     a piece of many parts folded to one line at Middle
//   JobNear      a job at Near: one card per part, each its own kind (a sticky, a page, a run with "open the run")
//   AisLeads     Your AIs at 80: the say line, "leads N" and the names under a lead, folded
//   Others       a Cowork group page: "Waiting on others · Joon has the launch post", with Take it back (F2)
//   FromYou      "1 from you" on a teammate's People row
// Live, the moves behind these answer "not yet" and nothing here is drawn for them (no parts, no lapse, no hand-off).
// Reads the store, presses M. Signed: marcocyl04-ux's agent, port slice R7 (#1615).
import type { MouseEvent as RMouseEvent } from "react";
import { D, M, above, asksOn, needWords, open, piecesIn, regionOf, useNext, type Ai, type Piece } from "../cv/core.ts";
import { needsCount } from "../people/queue.ts";
import { team } from "../people/queue.ts";
import { KIND, SUM, asksOf, joined, leadBits, leadStill, multi, others, partState, partWord, partsOf, saidWords, sumWords, talkWords, waitsOn } from "./rules.ts";
import { titleOf } from "../plane/layout.ts";   // BR1 (#1615): a session reads as its task, never its AI
import "./lead.css";

const quiet = (f: () => unknown) => (e: RMouseEvent) => { e.stopPropagation(); f(); };

/** "Ada leads · 3 parts · 1 ask" (band: far, mid, fold, near) */
export function LeadLine({ p, band }: { p: Piece; band: "far" | "mid" | "fold" | "near" }) {
  const b = leadBits(p);
  return <p className={`ld-line ld-${band}`} data-lead-line={p.id}><span className={`nx-aura${leadStill(p) ? " still" : ""}`} /><span className="ld-t"><b>{b[0]}</b>{b.slice(1).map((x) => ` · ${x}`).join("")}</span></p>;
}
/** "Kai joined; Ada leads, first on it." with "Kai leads instead" beside it (F4: one row, never in the title row) */
export function Said({ p }: { p: Piece }) {
  const s = saidWords(p);
  if (!s) return null;
  return <p className="ld-said" data-lead-said={p.id}><span className="ld-st">{s.words}</span>
    <button className="ld-mini" data-lead-change={`${p.id}|${s.other}`} onClick={quiet(() => M.change_lead(p.id, s.other))}>{partWord(p, s.other)} leads instead</button></p>;
}

/** the folder card at Far: one line per piece of many parts in it */
export function FarLeads({ rid }: { rid: string }) {
  const ps = piecesIn(rid).filter(multi);
  return ps.length ? <div className="ld-fars">{ps.map((p) => <LeadLine key={p.id} p={p} band="far" />)}</div> : null;
}
/** a split session's say line at Middle, as the lead's */
export function LeadSay({ p }: { p: Piece }) {
  return <><LeadLine p={p} band="mid" /><Said p={p} /></>;
}
/** whether a split session's rows fold into one line */
export const folds = (p: Piece) => multi(p) && partsOf(p).length > SUM;
/** past six parts: one line for them, the rows one press down */
export function PartsSum({ p }: { p: Piece }) {
  return <div className="ld-sum" data-parts-sum={p.id}><span className="ld-faces">{partsOf(p).slice(0, 5).map((x) => <span key={x.id} className="nx-aura still" />)}</span>{sumWords(p)}<span className="nx-kbd">↩</span></div>;
}

function PartRow({ x }: { x: Piece }) {
  const [c, w] = partState(x);
  return <div className="ld-prow" role="listitem" data-partrow={x.id}><span className="ld-k">{KIND[x.kind] || x.kind}</span><span className="ld-pn">{x.name}</span><span className={`ld-st st-${c}`}>{w}</span></div>;
}
function AskLine({ id }: { id: string }) {
  const a = D.asks[id];
  return <div className="ld-ask" data-front data-ask={a.id}><span className="ld-askt">{a.text}<small>{a.source}</small></span>
    <span className="ld-acts"><button className="ld-mini pri" data-act={`answer:${a.id}`}>Yes</button><button className="ld-mini" data-act={`later:${a.id}`}>Later</button></span></div>;
}
/** a job's face at Middle: its name and folder only in the title row (F4), the lead's line, the said line, its parts */
export function JobFace({ p }: { p: Piece }) {
  const own = asksOf(p);
  return (
    <>
      <div className="pl-h"><span className={`nx-aura${own.length ? " still" : ""}`} /><b>{p.name}</b><span className="pl-s">{regionOf(p.region)?.name ?? ""}</span></div>
      <LeadLine p={p} band="mid" /><Said p={p} />
      {folds(p) ? <PartsSum p={p} /> : <div className="ld-parts" role="list">{partsOf(p).map((x) => <PartRow key={x.id} x={x} />)}</div>}
      {own.map((a) => <AskLine key={a.id} id={a.id} />)}
      <div className="ld-down"><span className="nx-kbd">↩</span> each part, as itself</div>
    </>
  );
}
/** a piece of many parts in one line at Middle: its name and the lead's line, nothing else */
export function LeadFold({ p }: { p: Piece }) {
  return <><b>{p.kind === "session" ? titleOf(p) : p.name}</b><LeadLine p={p} band="fold" /></>;
}

/** the first free teammate in the first group (lead.js free): done first, else resting */
function free(): string | null {
  const g = team().groups[0];
  if (!g) return null;
  const m = g.people.find((x) => !x.me && x.st === "done") || g.people.find((x) => !x.me && x.st === "rest");
  return m ? m.n : null;
}
function NearPart({ p, x, i }: { p: Piece; x: Piece; i: number }) {
  const [c, w] = partState(x), as = open().filter((q) => q.part === x.id), mate = free();
  const wx = x.with as { who: string; at: string } | undefined, bk = x.back as { by: string; at: string; what: string; text?: string } | undefined;
  const foot = wx ? <><span className="ld-with">With {wx.who} since {wx.at} · on their Cowork</span><button className="ld-btn" data-lead-take={`${p.id}|${x.id}`} onClick={quiet(() => M.take_part_back(p.id, x.id))}>Take it back</button></>
    : bk ? <span className="ld-signed"><span className="nx-aura still" />Back from {bk.by}, signed {bk.at}: {bk.what}</span>
    : x.kind !== "session" && mate ? <button className="ld-btn" data-lead-hand={`${p.id}|${x.id}|${mate}`} onClick={quiet(() => M.hand_part(p.id, x.id, mate))}>Hand to {mate}</button> : null;
  const body = x.kind === "sticky" ? <div className="ld-sticky"><b>{x.name}</b><span>{String(x.text ?? "")}</span></div>
    : x.kind === "page" ? <div className="ld-page"><h3>{x.name}</h3><p>{bk ? bk.text || String(x.text ?? "") : String(x.text ?? "")}</p></div>
    : <div className="ld-run" data-run={`openpart:${x.id}`} role="button" onClick={quiet(() => M.openPart(x.id))}>
        <p className="ld-psay">{x.words ? `Working on “${x.words}”${Number.isFinite(x.files) ? `: ${x.files} files so far` : ""}.` : ""}</p>
        <div className="ld-face">{`${talkWords(x.files)}\nterminal · ${x.term?.stateWord || ""}`}</div>
        <span className="ld-open"><span className="nx-kbd">↩</span> open the run</span></div>;
  return (
    <section className={`ld-part ld-${x.kind}`} data-part={x.ai} data-ld-part={x.id}>
      <div className="ld-ph"><span className="ld-k">{KIND[x.kind] || x.kind}</span>{x.kind === "session" ? <><b>{x.name}</b><span className="ld-sub">part {i + 1}</span></> : <b>Part {i + 1}</b>}<span className={`ld-st st-${c}`}>{w}</span></div>
      {body}{as.map((a) => <AskLine key={a.id} id={a.id} />)}{foot ? <div className="ld-foot">{foot}</div> : null}
    </section>
  );
}
/** a job at Near: its head, the lead's line, one card per part (lead.js jobNear; F1: the chip reads above()) */
export function JobNear({ p }: { p: Piece }) {
  useNext((d) => d.pieces);
  const o = above();
  return (
    <div className="nr ld-near">
      <div className="nr-head">
        <div className="nr-who"><div className="nr-title" data-m1="what">{p.name}</div><div className="nr-sub">{regionOf(p.region)?.name ?? ""} · {p.words || ""}</div></div>
        <div className="nr-right"><span className="nr-keys"><span className="nr-kbd">⌘↑</span> out · <span className="nr-kbd">⌘[</span> back</span>
          {o ? <button className="nr-needs" data-nr="next" data-front data-m1="needs" onClick={() => M.next()}><span data-m1="next">{needWords(o, "chip")}</span><span className="nr-kbd">⌘J</span><span className="n">{needsCount()}</span></button>
            : <span className="nr-needs none" data-front data-m1="needs">Nothing needs you<span className="n">0</span></span>}</div>
      </div>
      <div className="ld-nhead" data-front><LeadLine p={p} band="near" /><Said p={p} /></div>
      <div className="ld-grid">{partsOf(p).map((x, i) => <NearPart key={x.id} p={p} x={x} i={i} />)}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Your AIs at 80: one card per lead

/** the AIs grouped by lead: the ones under none are the cards */
export const grouped = (ais: Ai[]) => ais.some((a) => a.under);
export const tops = (ais: Ai[]) => (grouped(ais) ? ais.filter((a) => !a.under) : ais);
const under = (n: string) => D.ais.filter((a) => a.under === n);
/** the one count (F1, H2): above() need you; when a sign-in holds AIs, the line says how the number is made */
function needLine(): string {
  const n = above(), j = joined();
  return n ? `${needWords(n)}${j.length ? `; of the ${n}, ${j.map((t) => `${t.n} wait on one ${t.cause} sign-in`).join(", ")}` : ""}.` : "Nothing needs you.";
}
/** "80 AIs, under 5 leads; 1 on their own. 4 asks need you, and 7 from people; of the 4, …" */
export function aisSay(): string {
  const t = tops(D.ais);
  return `${D.ais.length} AI${D.ais.length === 1 ? "" : "s"}, under ${t.filter((a) => under(a.name).length).length} leads; ${t.filter((a) => !under(a.name).length).length} on their own. ${needLine()}`;
}
/** "leads N" on a lead's card */
export function LeadsTag({ name }: { name: string }) {
  const u = under(name);
  return u.length ? <span className="ld-n" data-leads={name}>leads {u.length + 1}</span> : null;
}
/** the names under a lead, folded: "24 under Ada · api, launch" */
export function Team({ name }: { name: string }) {
  const u = under(name);
  if (!u.length) return null;
  const ps = [...new Set(u.map((a) => a.piece))].map((id) => D.pieces[id]).filter(Boolean);
  return <details className="ld-team"><summary>{u.length} under {name} · {ps.map((p) => (regionOf(p.region)?.name ?? "").replace(/ \(.*\)$/, "")).join(", ")}</summary>
    <div className="ld-names">{u.map((a) => <span key={a.name}>{a.name}</span>)}</div></details>;
}

// ---------------------------------------------------------------- Cowork: what waits on a teammate from you (F2)

/** below the group's waits, its own line: never one of your waits, never in your count */
export function Others() {
  useNext((d) => d.pieces);
  const hs = others();
  if (!hs.length) return null;
  return (
    <div className="ld-others" data-waiting-others="">
      {hs.map(({ h, x, p }) => <div key={x.id} className="ld-orow" data-front data-other={h.who}><span className="ld-ol">Waiting on others</span>
        <span className="ld-ot"><b>{h.who}</b> has {x.name}<small>a part of {p.name} · from you, {x.with!.at} · it comes back signed</small></span>
        <button className="ld-mini" data-lead-take={`${p.id}|${x.id}`} onClick={quiet(() => M.take_part_back(p.id, x.id))}>Take it back</button></div>)}
    </div>
  );
}
/** "1 from you" on a teammate's People row */
export function FromYou({ who }: { who: string }) {
  const n = waitsOn(who);
  return n ? <span className="ld-wo" data-waits-on={who}> · {n} from you</span> : null;
}

/** a piece's asks, the lead's way: its own and its parts' (for a view that counts them) */
export const asksAll = (p: Piece) => (multi(p) ? asksOf(p) : asksOn(p.id));

// Your own pieces under the headline (round 6 · M3, #1615; merge/pieces.js CV.r6.seen, drawn by the Diary's top band):
// the proposal said into the talk pill (Sol's beside yours, then the checks; one that fails names its rule and the way
// that passes, and is never added), what was added, and after an update its line and each set-aside or remade piece's
// card. It reads the store and presses M; nothing here when the person has no pieces (and never in a real Sol).
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import type { ReactNode } from "react";
import { M, useNext } from "../cv/index.ts";
import { version } from "../cv/moves/pieces.ts";
import { UPDATE, asideOf, forShort, list, me, pcSt, remadeOf, st, updateLine, type Piece } from "./model.ts";
import type { Row } from "./data.ts";
import "./pieces.css";

const Check = () => <svg className="pc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

/** one row of a still compare */
export function MiniRow({ r }: { r: Row }) {
  if (r.hl) return <div className="hl">{r.hl}</div>;
  return (
    <div className={`r${r.mine ? " mine" : ""}`}>
      {r.sw ? <i className={`cu-dot ${r.sw}`} /> : r.t}{r.b ? <> <b>{r.b}</b></> : null}
      {r.sws ? <span className="cu-sw">{r.sws.map((c) => <i key={c} className={`cu-dot ${c}`} />)}</span> : null}
    </div>
  );
}

function Proposal() {
  const p = me()!, s = st(), a = p.ask, alt = !!s.prop?.alt, fail = a.checks.some((c) => !c[0]) && !alt;
  const checks = alt && a.alt ? a.alt.checks : a.checks, mine = alt && a.alt ? a.alt.yours : a.yours;
  return (
    <section className="pc-card cu-prop" data-r6prop={s.prop!.state} data-front data-part="A piece of your own">
      <div className="ph"><span className="nx-aura still" /><b>A piece of your own</b><span className="why">you said</span><span className="here">a mockup, nothing changed yet</span></div>
      <div className="cu-said"><q>{a.say}</q></div>
      {alt && a.alt ? <div className="why">{a.alt.say}</div> : null}
      <div className="cmp">
        <div className="draft"><div className="to">Sol’s {a.for}</div><div className="cu-mini">{a.sols.map((r, i) => <MiniRow key={i} r={r} />)}</div></div>
        <div className="draft"><div className="to">Yours <span className="yours">stands in for Sol’s {a.for}</span></div><div className="cu-mini">{mine.map((r, i) => <MiniRow key={i} r={r} />)}</div></div>
      </div>
      <ul className="checks">{checks.map(([ok, b, sm], i) => (
        <li key={i} data-check={ok ? "ok" : "no"}><span className={`g ${ok ? "ok" : "no"}`}>{ok ? <Check /> : "!"}</span><span><b>{b}</b>{sm ? <small>{sm}</small> : null}</span></li>))}
      </ul>
      {fail && a.alt ? <div className="cu-alt"><b>Instead:</b> {a.alt.say}</div> : null}
      <div className="cu-acts">{fail
        ? <><button className="pc-btn pri" data-cu="alt" onClick={() => M.use_piece("alt")}>Try that instead</button><button className="pc-btn" data-cu="drop" onClick={() => M.use_piece("drop")}>Leave it</button></>
        : <><button className="pc-btn pri" data-cu="use" onClick={() => M.use_piece("use")}>Use mine</button><button className="pc-btn" data-cu="drop" onClick={() => M.use_piece("drop")}>Not now</button></>}
      </div>
    </section>
  );
}

/** a line under the headline, with its one press */
function SeenLine({ children, act, label, attr }: { children: ReactNode; act?: () => void; label?: string; attr?: Record<string, string> }) {
  return <div className="pc-seen r6-seen" {...attr}><span className="nx-aura still" /><span className="pc-st">{children}</span>{act ? <button className="pc-btn" onClick={act}>{label}</button> : null}</div>;
}

/** a set-aside or remade piece after the update (or the line that says what became of it) */
function Card({ x }: { x: Piece }) {
  const s = pcSt(x), u = UPDATE.v;
  if (s === "in" && x.st === "aside") return <SeenLine act={() => M.piece_state(x.id, x.st)} label="Undo"><b>{x.n} is back.</b> {x.back || "Your last version, in use again."}</SeenLine>;
  if (s === "in" || s === "sols") return null;
  if (s === "last") return <SeenLine act={() => M.piece_state(x.id, "remade")} label="Use the remade one"><b>{x.n}: your last version.</b> {x.last}, on top of {u}’s keys.</SeenLine>;
  const aside = x.st === "aside";
  return (
    <section className="pc-card cu-card" data-cucard={x.id} data-front data-part={x.n}>
      <div className="ph"><b>{x.n}</b><span className="yours" data-yours-card={x.id}>yours</span><span className="why">{aside ? "set aside by Sol " + u : "remade for Sol " + u}</span></div>
      <p className="cu-why">{x.why}</p>
      <div className="cu-acts">
        {aside ? <><button className="pc-btn pri" onClick={() => M.piece_state(x.id, "in")}>Bring it back</button><button className="pc-btn" onClick={() => M.piece_state(x.id, "sols")}>Keep Sol’s {forShort(x)}</button></>
          : <><button className="pc-btn pri" onClick={() => M.piece_state(x.id, "in")}>Keep the remade one</button><button className="pc-btn" onClick={() => M.piece_state(x.id, "last")}>Use my last version</button></>}
        <button className="pc-btn" onClick={() => { version("2.3"); M.see_pieces(); }}>Go back to Sol 2.3</button>
      </div>
      <p className="pc-hint">Until 18 December, going back to 2.3 is one press, in Settings › Your own pieces.</p>
    </section>
  );
}

/** what the Diary's top band draws under its headline (the mockup's VIEWS.seen) */
export default function Seen() {
  useNext(() => 0);
  const p = me();
  if (!p) return null;
  const s = st(), as = asideOf(), rm = remadeOf();
  let used: ReactNode = null;
  if (s.prop?.state === "used") {
    const x = s.added.find((x) => x.id === p.ask.add.id);
    if (x && list().includes(x) && ["in", "remade", "last"].includes(pcSt(x)))
      used = <SeenLine act={() => M.piece_state(x.id, "sols")} label="Back to Sol’s" attr={{ "data-r6prop": "used" }}><b>Yours now.</b> {s.prop.alt && p.ask.alt ? p.ask.alt.say : p.ask.seen}</SeenLine>;
  }
  if (!s.update && !s.prop) return null;
  return (
    <div className="pc-under">
      {s.update ? <>
        <SeenLine act={as.length + rm.length ? () => M.see_pieces() : undefined} label="Your own pieces" attr={{ "data-r6seen": "update" }}><b>Sol {UPDATE.v} came in {UPDATE.when}.</b> {updateLine(p, s)}</SeenLine>
        {as.concat(rm).map((x) => <Card key={x.id} x={x} />)}
      </> : null}
      {s.prop?.state === "proposed" ? <Proposal /> : null}
      {used}
      {s.prop?.state === "dropped" ? <p className="pc-calm r6-seen" data-r6prop="dropped"><span className="nx-aura still" /> Nothing changed. Sol’s {p.ask.for} stays.</p> : null}
    </div>
  );
}

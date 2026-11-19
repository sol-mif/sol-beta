// owned by slice 2 (Needs), docs/port/slices.md
// Needs you (⌘J's list; #1615, the mockup's views/needs.js): every open ask ranked across places, each answerable where
// it stands, each saying why it stands there. Below it, the day's one offer (Offer.tsx). Reads the store, presses M.*.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { D, above, open, regionOf, useNext } from "../cv/index.ts";
import { reason } from "./rank.ts";
import { Kbd, Row } from "./Row.tsx";
import { Offer } from "./Offer.tsx";

export function Needs() {
  const o = useNext(() => open());
  const n = above();   // round 6 · F1: every row above From people, the extra askers' with the canvas's
  const head = n ? `${n === 1 ? "One thing" : n + " things"}, most pressing first. Each says why it stands where it does.`
    : "Nothing needs you. Your AIs keep working; anything new lands here first.";
  return (
    <div className="nd-page">
      <h1 className="nd-h1" data-m1="what">Needs you</h1>
      <p className="nd-say" data-m1="needs">{head}</p>
      {o.length ? <div className="nd-hint" data-m1="next"><Kbd k="⌘J" /> next ask, from anywhere · <Kbd k="⌘↩" /> yes · <Kbd k="⌘⌫" /> later · <Kbd k="⌘⇧H" /> too much</div> : null}
      {o.map((a, i) => {
        const r = reason(D, a), rid = D.pieces[a.piece]?.region, reg = regionOf(rid);
        return (
          <section key={a.id} className="nd-card nd-q" data-front data-ask={a.id} aria-label={`${i + 1}. ${r.rung}`}>
            <div className="nd-rk">
              <span className="nd-ord">{i + 1}</span><span className="nd-reason">{r.rung}</span>
              {reg ? <span className="nd-tag" data-kind={reg.kind}><span className="nd-dotf" />{reg.name}</span> : null}
            </div>
            <Row a={a} n={i + 1} total={o.length} />
          </section>
        );
      })}
      {o.length ? null : <div className="nd-card nd-empty"><span className="nd-aura" /><span>All answered. Every answer can be taken back from its place.</span></div>}
      <Offer />
    </div>
  );
}

// The offer (#1327, pass 2, play.html's "offer"): a job Sol noticed, opened from its jelly's "again?" in Home or on the
// floor. The times it saw (the traces, the proof), its steps, every place of its kind as tiles to tick (checked where its
// inputs exist; unchecked with the reason; "is X a <kind>?" when Sol was unsure), what it does and what stays yours,
// and one button: Keep it. Not now and Never stay quiet beside it.
import { useState } from "react";
import { Jelly } from "./Jelly";
import { CURVE } from "../kit/tokens";
import { firstTicks, reachWords, seenChip, tileLine, timesLine, type Offer } from "./model";
import { Go, Quiet, Surface, pressed } from "./ui";
import { turnOf } from "./Floor";
import type { Ask } from "./useAgents";
import type { Said } from "./Desk";

export function OfferView({ o, ask, onSaid, onKept, onDone }: { o: Offer; ask: Ask; onSaid: (s: Said) => void; onKept: (id: string) => void; onDone: () => void }) {
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => firstTicks(o));
  const [busy, setBusy] = useState<string | null>(null);
  const [say, setSay] = useState("");
  const picked = o.places.filter((p) => ticks[p.place]).map((p) => p.place);
  const reach = reachWords(o.reach);
  const answer = async (a: "keep" | "later" | "never") => {
    if (a === "keep" && !picked.length) { setSay("Tick at least one place."); return; }
    setBusy(a);
    const r = await pressed(ask, { type: "agents.offer", id: o.id, answer: a, ...(a === "keep" ? { places: picked } : {}) }, a === "keep" ? "Keep it" : a === "later" ? "Not now" : "Never", onSaid);
    setBusy(null);
    if (!r?.ok) return;
    if (a === "keep" && r.agent?.id) onKept(String(r.agent.id)); else onDone();
  };
  return (
    <div className="ag-offer" data-place="talk">
      <Surface step="raised" className="ag-sheet" data-offer={o.id}>
        <div className="ag-sheet-top">
          <Jelly size={76} doing="needs" toward={[1, -0.3]} turn={turnOf(o.id)} />
          <div className="ag-min">
            <p className="ag-mute">{timesLine(o.count)}</p>
            <h1 className="ag-title">{o.name}</h1>
            <p className="ag-dim">{o.job}</p>
          </div>
        </div>
        <p className="ag-lbl">Seen</p>
        <div className="ag-chips">{o.seen.map((s) => <span key={`${s.place}${s.at}`} className="ag-chip" title={s.text}><i />{seenChip(s, o.places)}</span>)}</div>
        {o.showMe ? (
          <>
            <p className="ag-q">It cannot name the steps yet. Next time, press “show me once” on the sticky and do it while it watches.</p>
            <div className="ag-acts"><Quiet onClick={() => void answer("later")}>Not now</Quiet></div>
          </>
        ) : (
          <>
            <p className="ag-lbl">Its steps</p>
            <div className="ag-chips">{o.steps.map((x, i) => <span key={x} className="ag-step">{i > 0 && <i className="ag-arrow" aria-hidden>→</i>}<span>{x}</span></span>)}</div>
            <p className="ag-lbl">Every {o.kind ?? "place like these"}</p>
            <div className="ag-tiles">
              {o.places.map((p) => (
                <button type="button" key={p.place} className={`ag-tile ag-pick ${ticks[p.place] ? "ag-on" : ""}`} aria-pressed={!!ticks[p.place]} data-place-id={p.place}
                  onClick={() => { setTicks((t) => ({ ...t, [p.place]: !t[p.place] })); setSay(""); }}>
                  <span className="ag-ck" aria-hidden>{ticks[p.place] ? "✓" : ""}</span>
                  <b>{p.name}</b><small>{tileLine(p, o.kind)}</small>
                </button>
              ))}
            </div>
            <div className="ag-reach">
              <Surface step="box" r={CURVE.radius.field} className="ag-well"><i className="ag-dot ag-dot-yes" /><span><b>It</b> {reach.it}</span></Surface>
              <Surface step="box" r={CURVE.radius.field} className="ag-well"><i className="ag-dot ag-dot-ask" /><span><b>You</b> {reach.you}</span></Surface>
            </div>
            <div className="ag-acts">
              <Go busy={busy === "keep"} onClick={() => void answer("keep")}>Keep it</Go>
              <Quiet onClick={() => void answer("later")}>Not now</Quiet>
              <span className="ag-fill" />
              <Quiet small onClick={() => void answer("never")}>Never for this</Quiet>
            </div>
            {say && <p className="ag-say" role="status">{say}</p>}
          </>
        )}
      </Surface>
    </div>
  );
}

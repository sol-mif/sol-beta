// The starter card (#1615, slice 3; the mockup's views/start.js, home/functions.json S1–S3): a piece of kind "starter"
// where the session will be: which AI, how far it may go, what it will cost and touch. ⌘N on the plane, a sentence to
// the pill ("Ada, fix the login bug in api") or a piece given to an AI opens it; one ⌘↩ starts it in place, and the card
// becomes the session (M.start: the same piece, its kind changed). The plane draws it where it stands (slice 1:
// <StarterCard id band/> for a piece of kind "starter", data-starter kept for count 15); Near draws nothing for it.
// Live, the cost guess and the reach are "not yet" (map.md #11): the card shows the AI, the words and the folder only.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { D, MODE, M, regionOf, render, useNext } from "../cv/index.ts";
import { cycleAI, focusId, guess, setFocus } from "./runs.ts";
import { titleOf } from "../plane/layout.ts";   // BR1 (#1615): a given session reads as its task, never its AI

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;

/** one starter card, as the plane draws it (band "line": one folded line at Far) */
export function StarterCard({ id, band }: { id: string; band?: string }) {
  const p = useNext((d) => d.pieces[id]);
  const on = useNext(() => focusId() === id);
  if (!p || p.kind !== "starter") return null;
  if (band === "line") return <div className="ns-line" data-front data-starter={id}><span className="nr-aura" /><b>{p.ai}</b><span>{p.words || "a new session"}</span></div>;
  const given = ((p.given as string[]) || []).map((x) => D.pieces[x]).filter(Boolean);
  const g = MODE === "fixture" ? guess(p) : null, r = regionOf(p.region), words = String(p.words || "");
  const auto = p.purpose === "automation";   // Add's Automation (birth.html row 5): the session asks what and when
  return (
    <div className={`ns-card${on ? " on" : ""}`} data-starter={id} data-front onClick={() => { setFocus(id); render(); }}>
      <div className="ns-who"><span className="nr-aura" />
        <button className="ns-ai" title="Another AI (Tab)" onClick={(e) => { e.stopPropagation(); cycleAI(p); render(); }}><b>{p.ai}</b><span className="ns-chev">⌄</span></button>
        <span className="ns-in">{auto ? "New automation · " : ""}in {r?.name ?? ""}</span>
        {g ? <button className="ns-reach" title="How far it may go (⇧Tab)" onClick={(e) => { e.stopPropagation(); p.reach = p.reach === "asks first" ? "goes ahead" : "asks first"; render(); }}>{String(p.reach)}</button> : null}
      </div>
      <div className="ns-words" aria-label={`What ${p.ai} will do`}>
        {words ? <>{words}{on ? <span className="ns-cur">▍</span> : null}</> : <span className="ns-ph">{on ? <span className="ns-cur">▍</span> : null}{auto ? "What should happen on its own, and when?" : `What should ${p.ai} do?`}</span>}
      </div>
      {given.length ? <div className="ns-given">{given.map((x) => <span key={x.id} className="ns-chip">{x.kind === "session" ? titleOf(x) : x.name}</span>)}</div> : null}
      {g ? (
        <dl className="ns-facts">
          <div><dt>Costs</dt><dd>{g.cost}{g.over ? <> · <b>over its ${g.limit} limit</b>, so it asks first</> : ` · $${g.left.toFixed(0)} left tonight`}</dd></div>
          <div><dt>Touches</dt><dd>{g.touches.slice(0, 2).join(", ")}{g.touches.length > 2 ? ` +${g.touches.length - 2}` : ""}</dd></div>
          <div><dt>Reach</dt><dd>{g.leaves}</dd></div>
        </dl>
      ) : null}
      <div className="ns-foot"><span className="ns-keys"><Kbd t="⇥" /> AI · <Kbd t="⇧⇥" /> how far · <Kbd t="esc" /></span>
        <button className="nr-btn pri ns-go" disabled={!(words.trim() || given.length)} onClick={(e) => { e.stopPropagation(); M.start(id); }}>Start <Kbd t="⌘↩" /></button>
      </div>
    </div>
  );
}

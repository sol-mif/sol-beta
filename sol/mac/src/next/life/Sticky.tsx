// One sticky (#1604; the mockup's merge/views/sticky.js, round 3 · B3): its words, when it is due (late in words, never
// in red), what it made under it, newest first, and anything that waits for you (a draft's Send, an ask, a 9 s hold with
// undo). It reads the store and presses the life moves; it never changes D itself. The hold runs as a CSS animation
// (life.css): when it ends, what was held goes (letGo), unless Undo held it back first.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { M, hooks, type Ask } from "../cv/index.ts";
import { HOLD, holdBack, letGo, pressSticky, send } from "../cv/moves/life.ts";
import { agoLabel, asksOf, isLate, whenLabel, type Made, type Sticky as St } from "./rules.ts";

/** made things shown under a sticky; the rest fold into "N earlier" */
const SHOW = 2;
const stop = (f: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); f(); };

function MadeRow({ p, m, first }: { p: St; m: Made; first: boolean }) {
  let s = `${m.by} · ${agoLabel(m.at)}`, act = null;
  if (m.state === "waits") { s = "Drafted · waits for your Send"; act = <button className="lf-b pri lf-quiet" onClick={stop(() => send(p.id, m.id))}>Send</button>; }
  else if (m.state === "held") { s = `${m.goes === "sent" ? "Sending" : "Goes"} in ${HOLD} s`; act = <button className="lf-b" onClick={stop(() => holdBack(p.id, m.id))}>Undo</button>; }
  else if (m.state === "sent") s = `Sent · ${agoLabel(m.at)}`;
  else if (m.state === "paid") s = `Paid · ${agoLabel(m.at)}`;
  else if (m.state === "held back") s = "Held back · nothing went";
  return (
    <div className={`lf-mk${m.state === "held" ? " lf-hold" : ""}`} data-made={m.id} onAnimationEnd={m.state === "held" ? () => letGo(p.id, m.id) : undefined}>
      <span className={`lf-doc lf-${m.kind}`} />
      <div className="lf-mt"><div className="lf-mtt">{m.title}</div><div className="lf-mts">{s}</div></div>
      {act ?? (m.isNew && first ? <span className="lf-new">New</span> : null)}
    </div>
  );
}

function AskRow({ a }: { a: Ask }) {
  return <div className="lf-ask" data-front data-ask={a.id}><p>{a.text}</p><button className="lf-b pri" data-act={`answer:${a.id}`}>{String(a.yes ?? "Yes")}</button><button className="lf-b" data-act={`later:${a.id}`}>Later</button></div>;
}

function Due({ p }: { p: St }) {
  if (p.due == null) return null;
  if (isLate(p)) return <span className="lf-tag lf-late">Late · was due {whenLabel(p.due, p.allDay).replace(/^Today /, "")}</span>;
  return <span>{whenLabel(p.due, p.allDay)}</span>;
}

export function Sticky({ p, chosen, picked }: { p: St; chosen?: boolean; picked?: boolean }) {
  const made = p.made || [], asks = asksOf(p), late = isLate(p);
  const cls = ["lf-st", late ? "tinted" : "", chosen ? "chosen" : "", picked ? "picked" : "", p.isNew ? "is-new" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} data-sticky={p.id} data-piece={p.id} data-front role="button" tabIndex={0} onClick={() => pressSticky(p.id)}>
      <span className="lf-t" data-words>{p.name}</span>
      <span className="lf-d"><Due p={p} />{p.note ? <span className="lf-tag">{p.note}</span> : null}{!p.due && !p.note && !made.length ? <span>No date</span> : null}</span>
      {made.length ? <div className="lf-made">{made.slice(0, SHOW).map((m, i) => <MadeRow key={m.id} p={p} m={m} first={i === 0} />)}{made.length > SHOW ? <div className="lf-more">{made.length - SHOW} earlier</div> : null}</div> : null}
      {asks.map((a) => <AskRow key={a.id} a={a} />)}
      {!asks.length ? (   // drawn while the person chose the sticky, points at it or it holds the keys (life.css; a calm board, BR1 #1615)
        <div className="lf-acts">
          {made.some((m) => m.state === "waits") ? null : <button className={`lf-b${p.ran ? "" : " pri"}`} onClick={stop(() => M.run_sticky(p.id))}>{p.ran ? "Run again" : "Run it"}<span className="lf-kbd">⌘↩</span></button>}
          <button className="lf-b" onClick={stop(() => { const r = M.finish(p.id); if (r.ok) flash("Done. Kept here a day."); })}>Done<span className="lf-kbd">⌘D</span></button>
          <button className="lf-b" onClick={stop(() => { const r = M.drop(p.id); if (r.ok) flash("Dropped. Kept here a day."); })}>Drop</button>
        </div>
      ) : null}
    </div>
  );
}
const flash = (t: string) => hooks.flash?.(t);

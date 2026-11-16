// The evening fold (#797, plan Part C slice 34; home/whole.md "The thing's life", "The list's rules": a thing whose
// moment passes "appears in the evening fold as missed, never silently"; the still home/shots/11.png), behind
// sol.home.whole. Face half; engine half #829. The day as one line of time from morning to now: each entry of the
// ledger a mark, signed (Sol's filled with the jelly's warm, yours a ring), its words above or below, and an undo under
// each act whose undo is still real (else the why, on hover). The one line says who did what ("Seven things off your
// day. You did three; Sol did four."), the quiet line beside it what Sol would have done more. Under the line: what
// tomorrow holds, and what was missed. What was just undone stands at the foot with its own undo.
import { useEffect, useRef, useState } from "react";
import { Glass, useSize } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, JELLY } from "../../kit/tokens";
import { Glyph } from "./First";
import { Record } from "./Record";
import { canUndo, doneBy, foldLine, signOf, spanOf, ticksOf, xAt, type Entry } from "./ledger";
import { undoLedger, useLedger } from "./ledgerStore";
import { goTo } from "./sourcesStore";
import { useToday } from "./store";
import { missedOf, needsOf, tomorrowOf } from "./foldRules";
import { frontOf } from "./question";
import { stackOf } from "./today";

const WARM = JELLY.warm;
const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

function Mark1({ e, x, up, now }: { e: Entry; x: number; up: boolean; now: number }) {
  const sol = e.actor === "sol", undone = e.state === "undone";
  return (
    <div className="hfold-mark" data-entry={e.id} data-actor={e.actor} data-undone={undone || undefined} style={{ left: x }}>
      <span className="hfold-dot" style={sol && !undone ? { background: `radial-gradient(circle at 35% 35%, ${WARM[3]}, ${WARM[1]})` } : { borderColor: undone ? on(0.3) : ink }} />
      <div className={`hfold-words ${up ? "up" : "down"}`} title={"none" in e.undo ? `no undo: ${e.undo.why}` : undefined}>
        <div className="hfold-t" style={{ color: undone ? mute : ink, textDecoration: undone ? "line-through" : undefined }}>{e.did}</div>
        <div className="hfold-s" style={{ color: dim }}>{e.sub}</div>
        <div className="hfold-sig" style={{ color: mute }}>{signOf(e)}</div>
        {sol && canUndo(e, now) && <button type="button" className="hfold-undo" style={{ color: ink }} onClick={() => undoLedger(e.id)}>undo</button>}
      </div>
    </div>
  );
}

export function Fold() {
  const v = useLedger(), today = useToday();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(i); }, []);
  const line = useRef<HTMLDivElement>(null), [lw] = useSize(line);
  if (!v) return null;
  const did = doneBy(v.entries).all.concat(v.entries.filter((e) => e.state === "undone")).sort((a, b) => a.at - b.at);
  const span = spanOf(did, now), [first, second] = foldLine(v.entries);
  const things = [...today.things.values()], missed = missedOf(things, now);
  const needsNow = today.today?.needs ?? [], front = stackOf(needsNow, frontOf(needsNow, today.things, null)).front;
  const needs = needsOf(today.today, front ? today.things.get(front) : undefined);
  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const done = v.done;
  return (
    <section className="hw hfold" data-place="talk" data-home-whole data-fold>
      <div className="hw-date" style={{ color: mute }}>
        <button type="button" className="hfold-back" style={{ color: dim }} onClick={() => goTo("today")}>‹ today</button> · done today · {date} · {hm(now)}
      </div>
      <div className="hfold-head">
        <h1 className="hw-line t-display" data-line>{/* the kit's display step (#812, #846), as Today's line */}
          <span style={{ color: ink }}>{first}</span>{second && <> <span style={{ color: dim }}>{second}</span></>}
        </h1>
        <Record more />
      </div>
      <div className="hfold-line" ref={line} data-fold-line={did.length}>
        <div className="hfold-track" style={{ background: on(0.15) }} />
        {lw > 0 && ticksOf(span).map((t) => <span key={t} className="hfold-tick" style={{ left: xAt(t, span, lw), color: mute }}>{hm(t)}</span>)}
        {lw > 0 && did.map((e, i) => <Mark1 key={e.id} e={e} x={xAt(e.at, span, lw)} up={i % 2 === 0} now={now} />)}
        {lw > 0 && <span className="hfold-now" style={{ left: xAt(now, span, lw), background: ink, color: ink }}><i>now</i></span>}
      </div>
      <div className="hfold-cards">
        {needs && (   /* what needs you stays on the fold (#873 C34-2): Today's one line and the card in front; a press goes there */
          <button type="button" className="hfold-card hfold-needs" data-card="needs" onClick={() => goTo("today")}>
            <Glass r={CURVE.radius.row} step="card" />
            <span style={{ color: dim }}><Glyph source="sol" /></span>
            <div><div style={{ color: ink }}>{needs.line}</div>
              <div className="hfold-cs" style={{ color: mute }}>{needs.front ? `in front: ${needs.front} · ‹ today` : "‹ today"}</div></div>
          </button>
        )}
        <div className="hfold-card" data-card="tomorrow">
          <Glass r={CURVE.radius.row} step="card" />
          <span style={{ color: dim }}><Glyph source="calendar" /></span>
          <div><div style={{ color: ink }}>Tomorrow</div><div className="hfold-cs" style={{ color: mute }}>{tomorrowOf(today.today?.week ?? [], now)}</div></div>
        </div>
        <div className="hfold-card" data-card="missed" data-missed={missed.length}>
          <Glass r={CURVE.radius.row} step="card" />
          <span style={{ color: dim }}><Glyph source="sol" /></span>
          <div><div style={{ color: ink }}>{missed.length ? `Missed today: ${missed.length}` : "Nothing missed today"}</div>
            <div className="hfold-cs" style={{ color: mute }}>{missed.length ? missed.map((t) => `${t.card?.edge ?? t.words}, due ${hm(t.due!)}`).join(" · ") : "every moment that needed you was met"}</div></div>
        </div>
      </div>
      {done && (
        <div className="hfold-receipt" data-receipt="fold" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          <button type="button" className="hfold-undo" style={{ color: ink }} onClick={() => undoLedger(done.ledgerId)}>undo</button>
        </div>
      )}
    </section>
  );
}

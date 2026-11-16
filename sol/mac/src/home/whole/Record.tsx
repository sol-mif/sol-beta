// Record-only on Home (#797, plan Part C slice 34; home/whole.md "Record-only", pick 5 a; the still home/shots/4.png),
// behind sol.home.whole. Face half; engine half #829. One quiet line, "Sol would have done 2 things today", beside
// Home's one line; a press widens it to a panel of what Sol would have done a rung up and did not, each with why not
// ("Canvas is at read · propose would save them") and two answers: "let it, next time" raises that source one rung (its
// ladder in Sources moves and its policy sentence rewrites), "not this" teaches. What was just done stays in the panel
// with its undo. On the evening fold the same line reads "and would have done N more". Drawn from the kit (Glass,
// Button); whole-ledger.css lays it out.
import { useEffect, useRef, useState } from "react";
import { Button, Glass } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, SHADE } from "../../kit/tokens";
import { Glyph } from "./First";
import { SOURCE_NAMES, isWould, openWould, quietLine, whyLine, type Entry } from "./ledger";
import { rungAt } from "./policy";
import { letIt, notThis, undoLedger, useLedger } from "./ledgerStore";
import { useSources } from "./sourcesStore";
import "../whole-ledger.css";

function Would({ e }: { e: Entry }) {
  const s = useSources();
  const src = s?.sources.find((x) => x.id === e.source);
  const at = src?.rung ?? "read", done = !!e.state || (src ? rungAt(at) >= rungAt(e.rung) : false);
  return (
    <div className="hrec-row" data-would={e.id} data-state={e.state ?? (done ? "met" : "open")}>
      <div className="hrec-what"><span style={{ color: mute }}>would have</span> <span style={{ color: e.state === "not" ? mute : ink }}>{e.wouldHave}</span></div>
      <div className="hrec-why" style={{ color: mute }}>
        {e.source && <Glyph source={e.source} size={12} />}
        <span>{src && e.source ? whyLine(e, SOURCE_NAMES[e.source], at) : e.sub}</span>
        {!done && <span className="hrec-acts">
          <Button h={24} onClick={() => letIt(e.id)}>let it, next time</Button>
          <Button h={24} onClick={() => notThis(e.id)}>not this</Button>
        </span>}
      </div>
    </div>
  );
}

/** the quiet line, and the panel it widens to; `more` reads it as the fold does ("and would have done 2 more") */
export function Record({ more = false }: { more?: boolean }) {
  const v = useLedger();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // the panel closes on Esc or a press outside it, never on its own
  useEffect(() => {
    if (!open) return;
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    const p = (ev: PointerEvent) => { if (box.current && !box.current.contains(ev.target as Node)) setOpen(false); };
    window.addEventListener("keydown", k); window.addEventListener("pointerdown", p);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("pointerdown", p); };
  }, [open]);
  if (!v) return null;
  const would = v.entries.filter(isWould), n = openWould(v.entries).length;
  const line = more ? (n ? `and would have done ${n} more` : null) : quietLine(v.entries);
  if (!line && !open && !v.done) return null;
  const done = v.done;
  return (
    <div className="hrec" ref={box} data-record={n}>
      <button type="button" className="hrec-quiet" data-quiet aria-expanded={open} style={{ color: mute }} onClick={() => setOpen((o) => !o)}>
        <span className="hrec-dash" style={{ borderColor: on(0.4) }} />{line ?? "what Sol would have done"}
      </button>
      {open && (
        <div className="hrec-panel" data-record-panel style={{ backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)`, borderRadius: CURVE.radius.card }}>{/* the kit's Card at pop: the blur on its own box */}
          <Glass r={CURVE.radius.card} step="pop" />
          <div className="hrec-head" style={{ color: mute }}>would have done · record-only<span>Sol did none of it</span></div>
          {would.length === 0 && <div className="hrec-row" style={{ color: mute }}>nothing today</div>}
          {would.map((e) => <Would key={e.id} e={e} />)}
          {done && (
            <div className="hrec-receipt" data-receipt="ledger" role="status">
              <span style={{ color: dim }}>{done.line}</span>
              <button type="button" className="hrec-undo" style={{ color: ink }} onClick={() => undoLedger(done.ledgerId)}>undo</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

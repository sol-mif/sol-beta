// What was pressed in the circle, as one card beside it (BR1 root part 5, #1615): a fact (its source card, Forget with
// Back), "You" (what is about the person everywhere), a place (its share, AIs and hours, all Sol knows there, the dial:
// next.you.level, take it out: next.you.part.drop), else how to read the circle. Settings › You (Lens.tsx) and the
// move-in's How Sol sees you (You.tsx Seen) draw the same card. Signed: marcocyl04-ux's agent (builder F).
import { GLYPH, KIND } from "./circle-state.ts";
import { DIAL, dialOf } from "./model.ts";
import { aisOf, hoursWord, kindOfKnown, leaves } from "./lens-state.ts";
import { Source, type Sel } from "./Circle.tsx";
import type { Known } from "../../known.ts";
import type { Words } from "./strings.ts";
import * as Y from "./store.ts";

/** known: every fact by its k (a chip's id is its fact's k); made: the places the move-in makes a folder for */
export default function Picked({ T, sel, setSel, known, made }: { T: Words; sel: Sel; setSel: (s: Sel) => void; known: ReadonlyMap<string, Known>; made?: ReadonlySet<string> }) {
  const s = Y.useYou((x) => x), y = s.you;
  if (!y) return null;
  const partOf = (id: string | null) => (id ? y.parts.find((p) => p.id === id) ?? null : null);
  const back = (k: string) => (y.parts.some((p) => p.knows?.some((f) => f.k === k)) ? "is back" : "comes back at the next read");
  if (sel && "chip" in sel) {
    const f = known.get(sel.chip), gone = s.forgot && s.forgot.k === sel.chip ? s.forgot : null;
    if (gone && !gone.back) return (
      <div className="yl-sel" data-sel="forgotten"><h3>Forgotten</h3><p className="src">“{gone.fact}”: Sol won’t use it.</p>
        <div className="acts"><button className="yl-pill on" onClick={() => Y.unforget()}>{T.back}</button></div></div>);
    if (!f) return gone ? <div className="yl-sel"><h3>“{gone.fact}”</h3><p className="src">{back(gone.k)}</p></div> : null;
    const p = partOf(f.place);
    return (<>
      <Source cls="yl-sel" f={f} where={p ? p.name : "about you, everywhere"} onForget={() => Y.forget(f.k, f.fact)}
        note={f.k === "talk" ? <p className="src">Change it under How Sol talks.</p> : undefined} />
      {gone?.back ? <p className="src">“{gone.fact}” {back(gone.k)}</p> : null}
    </>);
  }
  if (sel && "place" in sel) {
    if (sel.place === "you") return (
      <div className="yl-sel" data-sel="you"><h3>About you, everywhere</h3>
        {[...known.values()].filter((f) => f.place === null).map((f) => <button key={f.k} className="yl-fact" onClick={() => setSel({ chip: f.k })}><i className="yl-dot" style={{ background: KIND[kindOfKnown(f)].c }} />{f.fact}</button>)}</div>);
    const p = partOf(sel.place);
    if (!p) return null;
    const at = s.levels[p.id] ?? p.level, k = dialOf(at), who = aisOf(p), hours = hoursWord(p.at), src = [p.share == null ? "" : `${p.share < 0.01 ? "Under 1%" : `${Math.round(p.share * 100)}%`} of your time`, who.join(", "), hours].filter(Boolean).join(" · "), fs = [...known.values()].filter((f) => f.place === p.id);
    return (
      <div className="yl-sel" data-sel={p.id}>
        <h3>{p.name}</h3>
        {src ? <p className="src">{src}</p> : null}
        {made?.has(p.id) ? <p className="src">{T.newF}</p> : null}
        <h4>What Sol knows here</h4>
        {fs.length ? fs.map((f) => <button key={f.k} className="yl-fact" onClick={() => setSel({ chip: f.k })}><i className="yl-dot" style={{ background: KIND[kindOfKnown(f)].c }} />{f.fact}</button>)
          : <p className="src mute">Nothing yet. Sol learns as you go.</p>}
        <h4>AIs here may</h4>
        <div className="yl-seg" role="radiogroup" aria-label={`AIs here may, ${p.name}`}>
          {DIAL.map((d, j) => (
            <button key={d.w} className={j === k ? "on" : ""} role="radio" aria-checked={j === k} tabIndex={j === k ? 0 : -1}
              onClick={() => Y.level(p.id, d.level, d.w)}
              onKeyDown={(e) => { const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (dx) { const n = (k + dx + 3) % 3; Y.level(p.id, DIAL[n].level, DIAL[n].w); } }}>{GLYPH[j]} {d.w}</button>
          ))}
        </div>
        <div className="yl-row"><span>Anything leaves this Mac</span><b>{leaves(at)}</b></div>
        <button className="link yl-out" onClick={() => { Y.drop(p.id); setSel(null); }}>Not this place: take it out</button>
      </div>
    );
  }
  return <div className="yl-sel" data-sel=""><h3>Pick any fact to see its source</h3><p className="src">You’ll see where Sol learned it and what it’s about, and you can forget it. Press a place for all it knows and what AIs may do there.</p></div>;
}

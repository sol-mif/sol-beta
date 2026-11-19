// owned by slice 3 (Near), docs/port/slices.md
// Near (#1615, slice 3; the mockup's views/near.js, as it is): one piece filling the page. The head says what it is in
// words, who is followed, the keys, and what needs the person (⌘J); the body is the piece by its kind (Beside.tsx), or two
// with beside (⌘\). A split job's open part has its way back to the job above. Reads the store, presses moves.
// DOM hooks the counts read: data-front, data-m1, data-pane, data-terminal, data-copy, data-copyrow, data-ask.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { useEffect, useState } from "react";
import { D, M, S, open, regionOf, useNext, viewSize } from "../cv/index.ts";
import type { SlotProps } from "../slots.ts";
import { openPartOf, stateWords } from "./runs.ts";
import { closePart } from "../cv/moves/near.ts";
import { Side } from "./Beside.tsx";
import "./near.css";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;
const FOLD = ["school", "work", "life", "money"];

/** #view's width, kept as the window changes */
function useWidth(): number {
  const [w, setW] = useState(() => viewSize().w);
  useEffect(() => {
    const f = () => setW(viewSize().w);
    f(); addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return w;
}

export default function Near(_p: SlotProps) {
  useNext((d, s) => [s.piece, s.part, s.beside, s.keysSide, s.follow, s.askHere, s.askLine, d.pieces]);
  const W = useWidth();
  const job = S.piece ? D.pieces[S.piece] : undefined, part = openPartOf(), p = part || job;
  if (!p) return null;
  const o = open(), lifeN = o.filter((a) => a.kind === "life").length;
  const b = S.beside ? D.pieces[S.beside] : undefined;
  const sw = Math.max(0, b ? (W - 32 - 14) / 2 : W - 32);
  const ri = D.regions.findIndex((r) => r.id === p.region), r = regionOf(p.region);
  const st = p.kind === "session" ? stateWords(p) : null;
  const tag = r ? <span className={`nr-tag f-${FOLD[ri % 4]}`}><span className="nr-dot" />{r.name}</span> : null;
  const fol = S.follow ? (() => {
    const ai = D.ais.find((a) => a.name === S.follow), fp = ai && D.pieces[ai.piece];
    const on = S.follow === "Ada" ? "editing session.ts (trail: auth.ts → session.ts)" : fp ? `on ${fp.copy || fp.name}` : "working";
    return <span className="nr-fol"><span className="nr-aura" />Following <b>{S.follow}</b> · {on}</span>;
  })() : null;
  const title = part ? `${p.ai} · ${p.name}` : p.kind === "session" ? `${p.ai} in ${p.copy}` : p.name;
  const showTitle = p.kind === "session" || !!b;
  return (
    <div className={`nr${p.kind === "session" ? " sess" : ""}`}>
      <div className="nr-head">
        <div className="nr-who">
          {showTitle ? <div className="nr-title" data-m1="what">{title}</div> : null}
          <div className="nr-sub" data-m1={showTitle ? undefined : "what"}>{tag}{st ? <><b>{st.lead}</b>{st.more ? <span>· {st.more}</span> : null}</> : null}</div>
        </div>
        <div className="nr-right">{fol}
          <span className="nr-keys"><Kbd t="⌘↑" /> out · <Kbd t="⌘[" /> back · <Kbd t="⌘\" /> {b ? "close beside" : "beside"}</span>
          {o.length
            ? <button className="nr-needs" data-front data-m1="needs" title="Next ask, ⌘J" onClick={() => M.next()}><span data-m1="next">{o.length} need{o.length === 1 ? "s" : ""} you{lifeN ? ` · ${lifeN} from life` : ""}</span><Kbd t="⌘J" /><span className="n">{o.length}</span></button>
            : <span className="nr-needs none" data-front data-m1="needs">Nothing needs you<span className="n">0</span></span>}
        </div>
      </div>
      {part && job ? <button className="nr-back" onClick={() => closePart()}><Kbd t="⌘↑" /> {job.ai}'s job · part {(job.parts || []).indexOf(part) + 1} of {(job.parts || []).length}</button> : null}
      <div className={`nr-body${b ? " two" : ""}`}>
        <Side pid={part ? part.id : (S.piece as string)} main two={!!b} width={sw} />
        {b && S.beside ? <Side pid={S.beside} main={false} two width={sw} /> : null}
      </div>
    </div>
  );
}

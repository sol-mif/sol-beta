// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// Your AIs (views/ais.js): one card per AI with its routines, never two lists; its state in words, never a moving face;
// its asks with Yes / Later (or "Look at it first" for a serious one); Open and Follow. A run dropped on a card is passed
// to that AI (#13: a session goes with its steps, M.pass; anything else starts a run with it given, M.start, when the
// runs' moves are there). Reads the store and presses M; never changes D. Signed: marcocyl04-ux's agent, slice 5 (#1615).
import type { DragEvent } from "react";
import { D, M, S, answer, looked, open, regionOf, useNext, type Ai, type Data } from "../cv/index.ts";
import type { SlotProps } from "../slots.ts";
import { onWhat, routinesOf, sayLine, stateOf } from "./rules.ts";
import "./ais.css";
import { LeadsTag, Team, aisSay, grouped, tops } from "../lead/views.tsx";   // slice R7: render points at 80 (requests/lead.md)

/** a piece dropped on an AI: a run is passed to it; anything else is given to a new run of it */
export function dropOn(ai: string, pieceId: string): void {
  const p = D.pieces[pieceId];
  if (!p) return;
  if (p.kind === "session") M.pass(pieceId, ai);
  else if (M.start) M.start({ ai, given: [pieceId], region: p.region });
}
/** follow this AI (M.follow by name; an engine whose follow only cycles is stepped round to it) */
function followAi(name: string, n: number): void {
  M.follow(name);
  for (let k = 0; k < n && S.follow !== name; k++) M.follow(name);
}

export default function Ais(_p: SlotProps) {
  const { d, s, o } = useNext((d, s) => ({ d, s, o: open() }));
  const ais = tops(d.ais), states = ais.map((a) => stateOf(d, o, a));
  return (
    <div className="ais">
      <h1 data-m1="what">Your AIs</h1>
      <p className="ais-say" data-m1="needs">{grouped(d.ais) ? aisSay() : sayLine(states)}</p>
      <div className="ais-grid">{ais.map((a, i) => <Card key={a.name} d={d} ai={a} i={i} follow={s.follow === a.name} />)}</div>
    </div>
  );
}

function Card({ d, ai, i, follow }: { d: Data; ai: Ai; i: number; follow: boolean }) {
  const st = stateOf(d, open(), ai), on = onWhat(d, ai, (id) => regionOf(id)?.name), rts = routinesOf(d, ai.name);
  const over = (e: DragEvent) => { if (e.dataTransfer.types.includes("text/sol-piece")) e.preventDefault(); };
  const drop = (e: DragEvent) => { const id = e.dataTransfer.getData("text/sol-piece"); if (!id) return; e.preventDefault(); dropOn(ai.name, id); };
  return (
    <div className={`ais-card hue${i % 5}`} data-front data-ai={ai.name} data-ai-drop={ai.name} onDragOver={over} onDrop={drop}>
      <div className="ais-h"><span className="nx-aura still ais-aura" /><b>{ai.name}</b><LeadsTag name={ai.name} /></div>
      {on ? <div className="ais-on">{on.where ? <>On <b>{on.what}</b> in {on.where}{on.tail ? ` · ${on.tail}` : ""}</> : on.what}</div> : null}
      <Team name={ai.name} />
      <span className={`ais-state ${st.cls}`}><i /><b>{st.say}</b></span>
      {st.asks.length ? <div className="ais-asks">{st.asks.map((a) => {
        const look = !!a.serious && !looked(a), near = a.how === "near";
        return <div key={a.id} className="ais-ask" data-ask={a.id}>{a.text}
          {a.serious || a.source !== ai.name ? <span className="ais-src">{a.serious ? "Serious · " : ""}{a.source}</span> : null}
          <div className="ais-acts">
            {look || near ? <button className="ais-btn pri" onClick={() => M.goto(ai.name)}>{look ? "Look at it first" : "Open its work"}</button>
              : <button className="ais-btn pri" onClick={() => answer(a.id)}>Yes</button>}
            <button className="ais-btn" onClick={() => answer(a.id, "later")}>Later</button>
          </div></div>;
      })}</div> : null}
      <div className="ais-rt"><div className="ais-lbl">Routines</div>
        {rts.length ? rts.map((r) => <div key={r.what} className="ais-r">{r.what}<span className="ais-w">{r.when}</span></div>) : <div className="ais-none">None yet</div>}
      </div>
      <div className="ais-foot">
        <button className="ais-btn" onClick={() => M.goto(ai.name)}>Open</button>
        <button className={`ais-btn${follow ? " on" : ""}`} aria-pressed={follow} onClick={() => followAi(ai.name, d.ais.length)}>{follow ? "Following" : "Follow"} <span className="nx-kbd">⌘⇧F</span></button>
      </div>
    </div>
  );
}

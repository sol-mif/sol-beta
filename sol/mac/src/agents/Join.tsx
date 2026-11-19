// The join ask (#1327, pass 2, the ask band): two rules in places of one kind that Sol was not sure are one job (Jev
// between 0.45 and 0.7). Sol never joins them by itself and never leaves them unseen: it asks. The screen is the Offer
// screen's make, one action: both places side by side, each with its rule's steps, and "Keep together" (lit) or
// "Keep apart" (quiet). Both answers land with undo (the line under the screen). Two steps of one place (`inPlace`,
// 2026-11-17): "One agent for these two steps?", each side a step by what it is now, no shades (nothing is shared or
// own between two steps).
import { useState } from "react";
import { Jelly } from "./Jelly";
import { joinQuestion, joinShades, stepWords, type JoinRow } from "./model";
import { CURVE } from "../kit/tokens";
import { Go, Quiet, Surface, pressed } from "./ui";
import type { Ask } from "./useAgents";
import type { Said } from "./Desk";

export function JoinView({ j, ask, onSaid, onTogether, onDone }: { j: JoinRow; ask: Ask; onSaid: (s: Said) => void; onTogether: (id: string) => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const shades = joinShades(j);
  const answer = async (a: "together" | "apart") => {
    setBusy(a);
    const r = await pressed(ask, { type: "agents.join", id: j.id, answer: a }, a === "together" ? "Keep together" : "Keep apart", onSaid);
    setBusy(null);
    if (!r?.ok) return;
    if (a === "together" && r.agent?.id) onTogether(String(r.agent.id)); else onDone();
  };
  return (
    <div className="ag-offer" data-place="talk">
      <Surface step="raised" className="ag-sheet" data-join={j.id} {...(j.inPlace ? { "data-in-place": "" } : {})}>
        <div className="ag-sheet-top">
          <span className="ag-two" aria-hidden>{j.agents.map((a, i) => <Jelly key={`${a.id}${i}`} size={56} doing="needs" toward={[i ? -1 : 1, -0.3]} turn={a.turn} />)}</span>
          <div className="ag-min">
            <p className="ag-mute">{j.inPlace ? `Sol is not sure these two steps in ${j.names[0]} are one piece of work` : "Sol is not sure these are one job"}</p>
            <h1 className="ag-title">{joinQuestion(j)}</h1>
            <p className="ag-dim">{j.inPlace
              ? "Together, one agent does both, the second step using what the first makes; each rule stays as you wrote it. Apart, they stay as they are and Sol won’t ask again."
              : "Together, one agent does it in both places, each keeping its own rule. Apart, they stay two and Sol won’t ask again."}</p>
          </div>
        </div>
        <div className="ag-pair">
          {j.names.map((name, i) => (
            <Surface step="box" r={CURVE.radius.field} key={`${j.places[i]}${i}`} className="ag-side-by" data-place-id={j.places[i]}>
              {/* two steps of one place: each side is its step (what it is now), the place under it */}
              <p className="ag-big">{j.inPlace ? j.agents[i]?.name : name}</p>
              <p className="ag-mute">{j.inPlace ? `step ${i + 1} · ${name}` : j.agents[i]?.name}</p>
              <ol className="ag-steps">{(j.steps[i] ?? []).map((x, k) => j.inPlace
                ? <li key={`${k}${x}`} className="ag-step"><span>{stepWords(x, name)}</span></li>
                : <li key={`${k}${x}`} className={`ag-step ${shades[i][k] ? "ag-shared" : "ag-own"}`} data-shade={shades[i][k] ? "shared" : "own"}><span>{stepWords(x, name)}</span></li>)}</ol>
            </Surface>
          ))}
        </div>
        {!j.inPlace && <p className="ag-mute ag-legend"><span className="ag-key ag-shared" aria-hidden /> the same in both <span className="ag-key ag-own" aria-hidden /> only in one place</p>}
        <div className="ag-acts">
          <Go busy={busy === "together"} onClick={() => void answer("together")}>Keep together</Go>
          <Quiet onClick={() => void answer("apart")}>Keep apart</Quiet>
        </div>
      </Surface>
    </div>
  );
}

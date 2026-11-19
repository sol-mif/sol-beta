// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The one voice on the page (views/agent.js): what an AI told you, where it pointed, and the proof under its headline.
// None moves the camera or a piece; "go there" and "see it" are the person's presses (data-act goto:).
//   part "told"   one line each, newest first, three at most; with `region`, only lines about that region (arrivals)
//   part "proof"  the steps the headline stands on, and "see it"; nothing without a real headline
//   no part       the shell's mount over the plane (far and middle): the rings on pointed things in view. The headline,
//                 its proof and the told lines are the plane's head at Far (it mounts the two parts; the join, requests/ais.md)
// Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import { D, S, regionOf, rectOn, viewSize, useNext, type Data } from "../cv/index.ts";
import { agent, hm, type Line } from "./calls.ts";
import type { SlotProps } from "../slots.ts";
import { ringSpots, toldLines, proofSteps } from "./marks.ts";
import "./agent.css";

export default function Agent(p: SlotProps) {
  useNext((d) => [d.told, d.rings, d.headlines]);
  if (p.part === "told") return <Told region={p.region} />;
  if (p.part === "proof") return <Proof />;
  return <Rings />;
}

function Told({ region }: { region?: string }) {
  const ls = toldLines(D, region ?? null);
  if (!ls.length) return null;
  return <div className="ag-told">{ls.map((x, i) => <p key={i} className="ag-tl"><span className="nx-aura still ag-dot" /><span className="ag-tw">{x.words}</span><small>{x.ai} · {hm(x.t)}</small></p>)}</div>;
}

function Proof() {
  const h = agent.headline();
  if (!h || !h.proof) return null;
  const rows = agent.since(0) as Line[];
  const steps = proofSteps(h.proof, Array.isArray(rows) ? rows : []);
  return (
    <div className="ag-proof">
      <span className="ag-pk">{h.ai} · {h.at}</span>
      {steps.map((s, i) => <span key={i} className="ag-ps"><i>{s.at.join(", ")}</i> {s.brief}</span>)}
      {h.proof.piece && D.pieces[h.proof.piece] ? <button className="ag-go" data-act={`goto:${h.proof.piece}`}>see it</button> : null}
    </div>
  );
}

/** rings you went to: the view's own memory, not the canvas's state */
const seen = new Set<string>();
function Rings() {
  if (S.dist === "near" && S.piece) seen.add(S.piece);
  if (S.dist === "near" || S.dist === "needs" || !D.pos) return null;
  const { w, h } = viewSize();
  const spots = ringSpots(D as Data, S.dist, (id) => !!regionOf(id), seen).map((s) => ({ ...s, rc: rectOn(s.q) }))
    .filter(({ rc }) => !(rc.x > w || rc.x + rc.w < 0 || rc.y > h || rc.y + rc.h < 0));
  if (!spots.length) return null;
  return (
    <div className="ag-rings">
      {spots.map(({ id, rc, by, words, target }) => {
        const above = rc.y > 64, lx = Math.max(12, Math.min(rc.x, w - 12 - 360));
        return (
          <div key={target}>
            <div className="ag-ring" data-ring={target} style={{ left: rc.x - 6, top: rc.y - 6, width: rc.w + 12, height: rc.h + 12 }} />
            <div className={`ag-rl ${above ? "up" : "down"}`} data-front data-part={`${by} points`} style={{ left: lx, top: above ? rc.y - 50 : rc.y + rc.h + 12 }}>
              <span className="nx-aura ag-dot" /><span className="ag-rw"><b>{by}</b> {words || "points here"}</span>
              <button className="ag-go" data-act={`goto:${id}`}>go there</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

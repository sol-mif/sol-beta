// owned by slice 2 (Needs), docs/port/slices.md
// The learner's one offer a day (#1615; the mockup's views/offer.js): at most one, never at Near, never while "too much"
// is on, a week's rest after "not now"; it suggests, never moves. Kept as the prototype marked it: data-front,
// data-ask="offer". Drawn under Needs you; the plane may draw it at Far and Middle too (the mockup's data-slot="offer").
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { M, S, useNext } from "../cv/index.ts";
import { offerNow } from "../cv/moves/needs.ts";

export function Offer() {
  const o = useNext(() => offerNow());
  if (!o || S.dist === "near" || S.calm) return null;
  return (
    <div className="nd-card of" data-front data-ask="offer">
      <span className="nd-aura" />
      <div className="of-t"><span className="of-k">An offer, one a day</span>{o}<small>Nothing changes unless you say yes. You can undo it in what it learned.</small></div>
      <span className="nd-acts">
        <button type="button" className="nd-btn pri" onClick={() => M.offer("yes")}>Yes</button>
        <button type="button" className="nd-btn ghost" onClick={() => M.offer("later")}>Not now</button>
        <button type="button" className="nd-btn ghost" onClick={() => M.offer("never")}>Never</button>
      </span>
    </div>
  );
}

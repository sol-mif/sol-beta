// owned by slice 2 (Needs), docs/port/slices.md
// The one ask or peek line, at the foot above the talk pill (#1615; the mockup's views/line.js). The shell shows #line
// only while an ask is brought (⌘J) or peeks at a pause (needs/pause.ts), and never while "too much" is on; this draws
// what is in it. A serious ask offers "Look beside" (⌘\) before its yes.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { D, S, lineAsk, open, useNext } from "../cv/index.ts";
import { reason } from "./rank.ts";
import { Kbd, Row } from "./Row.tsx";

export function Line() {
  const id = useNext(() => lineAsk());
  const a = id ? D.asks[id] : undefined;
  if (S.calm || !a || a.answered) return null;
  const peek = S.peek === id, o = open(), pos = o.findIndex((x) => x.id === id) + 1, r = reason(D, a);
  const label = peek ? "At a pause" : `Next ask${o.length > 1 ? ` · ${pos} of ${o.length}` : ""}`;
  return (
    <div className={`nd-lineask${a.serious ? " serious" : ""}`} data-peek={peek ? "" : undefined}>
      <div className="nd-lhead">
        <span className="nd-aura" /><span>{label}</span><span className="nd-reason">{r.rung}</span>
        {o.length > 1 && !peek ? <span className="nd-lnext"><Kbd k="⌘J" /> next</span> : null}
      </div>
      <div data-ask={a.id} data-front><Row a={a} line n={pos} total={o.length} /></div>
    </div>
  );
}

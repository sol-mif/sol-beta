// owned by slice 2 (Needs), docs/port/slices.md
// "Too much" (⌘⇧H, or the words "this is a lot"; #1615, the mockup's views/toomuch.js): the loop in four steps on one
// calm card. 1 now: the one next thing and a count of the rest · 2 why: from counts · 3 one fix, which can be undone ·
// 4 the week's check. Exactly one thing in front and one ask.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { D, S, open, useNext } from "../cv/index.ts";
import { said, tooMuchData, who } from "./rank.ts";
import { Kbd, Row } from "./Row.tsx";

const nameOf = (key: string) => Object.values(D.asks).find((x) => x.same === key)?.source ?? key;

export function TooMuch() {
  const o = useNext(() => open());
  const d = tooMuchData(o), first = d.first, rest = Math.max(0, o.length - 1);
  const topName = nameOf(d.top[0]), repeats = d.top[1] >= 3;
  const fixWords = { fold: [`Fold ${said(topName)} repeats into one ask`, "Fold them"], cap: ["Show at most 3 asks while you work on one thing", "Cap at 3"], hold: ["Hold peeks while you are on this piece", "Hold peeks"] }[d.fix];
  const on = S.fix ? ({ fold: `${said(topName)} repeats are folded into one ask.`, cap: "At most 3 asks show while you work." } as Record<string, string>)[S.fix] || "Your fix is on." : null;
  // with repeats, the bars are the repeating sources; without, who is asking (the load itself is the why)
  const byWho: Record<string, number> = {};
  o.forEach((a) => { const w = who(D, a); byWho[w] = (byWho[w] || 0) + 1; });
  const rows: [string, number][] = repeats ? d.groups.map(([k, n]) => [nameOf(k).replace(" · ", ": "), n]) : Object.entries(byWho).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((g) => g[1]));
  const whoN = Object.keys(byWho).length;
  return (
    <div className="tm">
      <div className="nd-card tm-card" data-front data-ask={first ? first.id : ""}>
        <div className="tm-who"><span className="nd-aura m" />Quieter now. Your AIs keep working; only the asking waits.</div>
        <h1 className="tm-h">{first ? "One thing now." : "Nothing asks you now."}</h1>
        <ol className="tm-steps">
          <li><span className="tm-k">Now</span><div>
            {first ? <Row a={first} line hideWhy /> : <p className="tm-p">Nothing asks. Rest here as long as you like.</p>}
            <p className="tm-p">{rest ? `${rest} more wait${rest === 1 ? "s" : ""}, held in Needs you. Nothing moved and nothing was deleted.` : "Nothing else waits."}</p>
          </div></li>
          <li><span className="tm-k">Why</span><div>
            <p className="tm-p">{repeats ? <>{o.length} asks; {d.top[1]} of them are <b>{said(topName)}</b>, the same way again and again.</>
              : `${o.length} asks from ${whoN} ${whoN === 1 ? "source" : "sources"}, none of them repeating: it is the number at once.`}</p>
            {rows.length ? <div className="tm-bars">{rows.slice(0, 4).map(([k, n]) => (
              <div key={k} className="tm-bar"><span>{k}</span><meter min={0} max={max} value={n} /><b>{n}</b></div>
            ))}</div> : null}
          </div></li>
          <li><span className="tm-k">One fix</span><div>
            {on ? <><p className="tm-p"><b>On:</b> {on}</p><div className="tm-acts"><button type="button" className="nd-btn ghost" data-act="undoFix">Undo the fix</button></div></>
              : <><p className="tm-p">{fixWords[0]}? You can undo it from here.</p><div className="tm-acts"><button type="button" className="nd-btn pri" data-act="applyFix">{fixWords[1]}</button><button type="button" className="nd-btn ghost" data-act="tooMuch">Not now</button></div></>}
          </div></li>
          <li><span className="tm-k">The check</span><div>
            <p className="tm-p">“Too much” this week: <b>{S.c.tooMuch}</b>. If it is no better in a week, it offers to undo the fix. A fix you keep shows in what it learned.</p>
          </div></li>
        </ol>
        <div className="tm-foot"><Kbd k="⌘⇧H" /> back to everything</div>
      </div>
    </div>
  );
}

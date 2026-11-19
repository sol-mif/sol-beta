// owned by slice 2 (Needs), docs/port/slices.md
// Arrivals (#1615; the mockup's views/arrivals.js): what the AIs made, folded to one row per AI (today's and yesterday's
// counted in it). Nothing is placed without a press. An arrival nobody kept by its second morning moves to that AI's
// history, drawn here one press down, by day. `piece` names one arrivals piece (the plane's face of it, at the join);
// without it, every arrivals piece in `region`, or on the whole canvas.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { useState } from "react";
import { D, useNext, type Piece } from "../cv/index.ts";
import { arrivalView, countWords, history, TODAY } from "./rank.ts";

function One({ p, opened, toggle }: { p: Piece; opened: Set<string>; toggle: (k: string, on: boolean) => void }) {
  const items = p.items ?? [];
  const v = arrivalView(items, TODAY, true);
  const ais = [...new Set(items.filter((x) => !x.accepted && TODAY - x.day > 1).map((x) => x.ai))];
  const head = <div className="ar-head"><b>Arrivals</b><span>{v.waiting ? `${v.waiting} waiting for your press` : "nothing new"}</span></div>;
  if (!v.waiting && !v.toHistory) return <div className="ar" data-arrivals={p.id}>{head}<p className="ar-none">What your AIs make lands here, never on top of your things.</p></div>;
  return (
    <div className="ar" data-arrivals={p.id}>
      {head}
      {v.rows.map((r) => {
        const [ai, ...rest] = r.text.split(" · ");
        return <div key={ai} className="ar-row" data-arrival={ai}><span className="nd-aura" /><span className="ar-ai">{ai}</span><span className="ar-n">{rest.join(" · ")}</span><span className="ar-k">place · keep · drop</span></div>;
      })}
      {v.toHistory ? <>
        <div className="ar-aged">{v.toHistory} older, not kept, moved to their AI’s history. Nothing was lost.</div>
        {ais.map((ai) => {
          const hs = history(D, ai), k = p.id + ":" + ai;
          return (
            <details key={k} className="ar-who" data-hist={k} open={opened.has(k)} onToggle={(e) => toggle(k, (e.currentTarget as HTMLDetailsElement).open)} onClick={(e) => e.stopPropagation()}>
              <summary><span className="ar-ai">{ai}’s history</span><span className="ar-n">{hs.n} from {hs.days.length} day{hs.days.length === 1 ? "" : "s"}</span><span className="ar-tw">›</span></summary>
              {hs.n ? <ol className="ar-hist">{hs.days.map((d) => <li key={d.day}><span className="ar-day">{d.name}</span><span>{countWords(d.what)}</span></li>)}</ol> : null}
            </details>
          );
        })}
      </> : null}
    </div>
  );
}

export function Arrivals({ piece, region }: { piece?: string; region?: string }) {
  const ps = useNext((d) => piece ? [d.pieces[piece]].filter(Boolean) : Object.values(d.pieces).filter((p) => p.kind === "arrivals" && (!region || p.region === region)));
  const [opened, setOpened] = useState<Set<string>>(() => new Set());   // which histories are unfolded: the view's own memory
  const toggle = (k: string, on: boolean) => setOpened((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
  return <>{ps.map((p) => <One key={p.id} p={p} opened={opened} toggle={toggle} />)}</>;
}

// owned by slice 4 (Life and Diary), docs/port/slices.md
// Inside a life folder at Middle: a board of stickies (#1604; the mockup's merge/views/life.js, round 3 · B3, K4). The
// board in its order (late first, then what waits for you, then by due time, then newest), the chosen one ringed with
// its presses, "Write a sticky…" (or the composer) last; under it what was finished or dropped today, kept a day with
// undo; then the folder's other pieces (pages, lists), their asks under them. The plane mounts it with { region, band };
// alone on the dev page (?slot=life&band=middle) it draws the folder the person is in. It reads and presses; never D.
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import type { SlotProps } from "../slots.ts";
import { S, asksOn, piecesIn, regionOf, useNext } from "../cv/index.ts";
import { bringBack, chosen, compose, closeComposer, composing, picked } from "../cv/moves/life.ts";
import { asksOf, gone, isLate, isLife, kindOfRegion, order } from "./rules.ts";
import { Sticky } from "./Sticky.tsx";
import "./life.css";

const SKIP = new Set(["sticky", "session", "starter", "copies", "arrivals", "set", "row"]);

export default function Life(props: SlotProps) {
  useNext(() => 0);
  const band = props.band ?? (S.dist === "middle" ? "middle" : "far");
  const rid = props.region ?? (S.dist === "middle" ? S.region : null);
  if (band !== "middle" || !rid || !isLife(rid)) return null;
  const both = kindOfRegion(rid) === "both";
  const ps = order(rid), pick = chosen(rid), mine = picked(rid), comp = composing(rid), done = gone(rid);
  const rest = piecesIn(rid).filter((p) => !SKIP.has(p.kind) && !p.inside);
  const late = ps.filter(isLate).length, waits = ps.filter((p) => asksOf(p).length || (p.made || []).some((m) => m.state === "waits")).length;
  const say = [`${ps.length} stick${ps.length === 1 ? "y" : "ies"}`, late ? `${late} late` : "", waits ? `${waits} wait${waits === 1 ? "s" : ""} for you` : ""].filter(Boolean).join(" · ");
  return (
    <div className={`lf${both ? " lf-both" : ""}`} data-life={rid}>
      <h2 className="lf-h">Stickies <small>{say}</small>
        <span className="lf-keys"><span className="lf-kbd">⌘N</span> new · <span className="lf-kbd">←→</span> choose · <span className="lf-kbd">⌘↩</span> run · <span className="lf-kbd">⌘D</span> done · <span className="lf-kbd">⌘Z</span> undo</span>
      </h2>
      <div className="lf-board">
        {ps.map((p) => <Sticky key={p.id} p={p} chosen={!comp && pick?.id === p.id} picked={!comp && mine?.id === p.id} />)}
        {comp ? (
          <div className="lf-st lf-comp chosen" data-composer data-front>
            <span className="lf-t" data-words>{comp.words}<i className="lf-caret" /></span>
            <span className="lf-d">{comp.words ? <><span className="lf-kbd">↩</span> puts it down</> : "Type, or say it"}<button className="lf-kbd" onClick={(e) => { e.stopPropagation(); closeComposer(); }}>esc</button></span>
          </div>
        ) : (
          <div className="lf-st lf-blank" role="button" tabIndex={0} onClick={() => compose(rid)}><span className="lf-t lf-light">Write a sticky…</span><span className="lf-d"><span className="lf-kbd">⌘N</span></span></div>
        )}
      </div>
      {done.length ? (
        <div className="lf-gone">{done.map((p) => (
          <div className="lf-g" key={p.id} data-gone={p.id}><span className="lf-gt">{p.name}</span><span className="lf-gs">{p.state === "done" ? "Done" : "Dropped"} · kept till tomorrow</span>
            <button className="lf-b" onClick={() => bringBack(p.id)}>Undo</button></div>
        ))}</div>
      ) : null}
      {rest.length && !both ? <>
        <h2 className="lf-h">Here too <small>pages and lists in {regionOf(rid)?.name ?? ""}</small></h2>
        <div className="lf-rest">{rest.map((p) => (
          <div key={p.id}>
            <div className="lf-pc" data-piece={p.id} data-front data-act={`goto:${p.id}`} role="button" tabIndex={0}>
              <span className={`lf-doc${p.kind === "list" ? " lf-list" : ""}`} />
              <div className="lf-mt"><div className="lf-mtt">{p.name}</div><div className="lf-mts">{p.text || (p.kind === "list" ? "a list" : "a page")}</div></div>
            </div>
            {asksOn(p.id).map((a) => <div key={a.id} className="lf-ask" data-front data-ask={a.id}><p>{a.text}</p><button className="lf-b pri" data-act={`answer:${a.id}`}>Yes</button></div>)}
          </div>
        ))}</div>
      </> : null}
    </div>
  );
}

// The Features page (#480, the engine's team/area.ts): the feature map, for Sol developers only (the engine's "devs"
// gate). Two views of the same features, as the tables' views are (#434): "as a Sol user sees it", a board with a column
// for each place in the app (`where`), drawn by the tables' own board (groupsOf, the board's cards); and "as it's
// built", a section for each label with its lead and support, each feature with its type of work, who leads it and its
// evals. Over both, the last nightly re-sort's line (from the project's record) and the command that undoes it. Reads
// only; the map changes by a PR.
import { useState } from "react";
import { Who } from "../bits";
import { groupsOf, type Col, type View } from "../tables/views.ts";
import { featuresOf, featuresLine, builtGroups, rowOf, placeOf, EVALS_WORD, NO_AREA, type FeatureRow } from "./tool.ts";
import "../tables/tables.css";

type PageProps = { data: unknown; refresh: () => void };
const COLS: Col[] = [{ key: "title", name: "feature", type: "text" }, { key: "place", name: "where", type: "text" }];
const BY_PLACE: View = { id: "place", kind: "board", name: "as a Sol user sees it", by: "place" };

export function FeaturesPage({ data, refresh }: PageProps) {
  const d = featuresOf(data);
  const [view, setView] = useState<"user" | "built">("user");
  if (!d) return <p className="tt-no">the feature map could not be read</p>;
  return (
    <div className="tt-fm">
      <p className="tt-week"><b>{featuresLine(d)}</b><span>specs/features.json · a draft for the leads to correct</span>
        <button className="rm-th-link u" onClick={refresh}>read again</button></p>
      {d.resort && <p className="rm-pg-foot" title={`the nightly re-sort, ${d.resort.at ? new Date(d.resort.at).toLocaleString() : "time unknown"}, from the project's record`}>last re-sort: {d.resort.line.replace(/ · undo: .*$/, "")}
        {d.resort.undo ? <> · to undo it, run in a sol-dev checkout <code className="fm-undo">{d.resort.undo}</code></> : null}</p>}
      <div className="tb-views" role="tablist" aria-label="views">
        <button role="tab" aria-selected={view === "user"} className={`tb-vtab ${view === "user" ? "on" : ""}`} onClick={() => setView("user")}><span className="tb-vmark" aria-hidden>▥</span>as a Sol user sees it</button>
        <button role="tab" aria-selected={view === "built"} className={`tb-vtab ${view === "built" ? "on" : ""}`} onClick={() => setView("built")}><span className="tb-vmark" aria-hidden>≡</span>as it's built</button>
      </div>
      {view === "user" ? <AsSeen features={d.features} /> : <AsBuilt d={d} />}
    </div>
  );
}

// a column for each place in the app, the tables' board (#434)
function AsSeen({ features }: { features: FeatureRow[] }) {
  const byId = new Map(features.map((f) => [f.id, f]));
  const groups = groupsOf(features.map(rowOf), BY_PLACE, COLS);
  return (
    <div className="tb-board ccols">
      {groups.map((g) => (
        <section key={g.id || "-"} className="ccol">
          <h3><span>{g.name}</span><small>{g.rows.length}</small></h3>
          {g.rows.map((r) => {
            const f = byId.get(r.id)!;
            return (
              <div key={r.id} className="ccard tb-card" title={f.where}>
                <div className="cl1"><Who login={f.lead} size={16} title={`led by ${f.lead}`} /><span className="ct">{f.name}</span><span className="cnum">{f.id}</span></div>
                <div className="cl2"><span className="ctag">{f.type}</span><span className={`ctag fm-ev ${f.evals}`}>{EVALS_WORD[f.evals]}</span></div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// a section for each label: its lead and support, then its features
function AsBuilt({ d }: { d: NonNullable<ReturnType<typeof featuresOf>> }) {
  return (<>
    {builtGroups(d).map((g) => (
      <section key={g.label} className="tt-day fm-label" aria-label={g.label}>
        <h4 className="rm-pg-h">{g.label}<span className="fm-leads">{g.label === NO_AREA ? "the leads place these at the briefing" : g.leads.length ? <>lead <Who login={g.leads[0]} size={14} title={g.leads[0]} /> {g.leads[0]}{g.leads[1] ? <> · support <Who login={g.leads[1]} size={14} title={g.leads[1]} /> {g.leads[1]}</> : null}</> : "no lead in the project's settings"}</span></h4>
        <ul className="tt-folds fm-list">
          {g.features.map((f) => (
            <li key={f.id}>
              <span className="tt-k plain">{f.id}</span>
              <span className="tt-t" title={f.paths.join("\n")}>{f.name}<small className="fm-where"> · {placeOf(f)}</small></span>
              <span className="tt-by"><Who login={f.lead} size={16} title={f.lead} />{f.lead}{f.support.length ? ` + ${f.support.join(", ")}` : ""}</span>
              <span className="ctag">{f.type}</span>
              <span className={`ctag fm-ev ${f.evals}`}>{EVALS_WORD[f.evals]}</span>
              {f.dependsOn.length ? <span className="tt-at" title="what it depends on">needs {f.dependsOn.join(", ")}</span> : <span className="tt-at" />}
            </li>
          ))}
        </ul>
      </section>
    ))}
  </>);
}

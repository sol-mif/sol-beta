// A life piece at Near (#1615, slice 3; the mockup's views/near.js life(), copies(); map.md "Near, a life piece":
// work.stage.get blocks, "yes"): the page itself on paper, a list as its rows, and the side copies sorted by state.
// Live, a piece that carries a stage block (p.block, read by the wire that made the piece) is drawn by the stage's own
// block renderer (stage/kinds, by import, never edited), loaded only then. Arrivals at Near are slice 2's (an empty box
// with data-arrivals until the join). DOM hooks the counts read: data-front, data-pane, data-copyrow, data-ask.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { lazy, Suspense } from "react";
import { MODE, asksOn, regionOf, useNext, type Piece } from "../cv/index.ts";
import { asksInside } from "./Session.tsx";
import { AskCard } from "./Talk.tsx";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;
const LiveBlock = lazy(() => import("../../stage/kinds/index.tsx").then((m) => ({
  default: ({ b }: { b: { kind: string; body?: unknown } }) => { const K = (m.KINDS as Record<string, React.ComponentType<any>>)[b.kind]; return K ? <K b={b} body={b.body ?? {}} act={() => {}} /> : null; },
})));

export const STATE_ORDER = ["uncommitted", "behind main", "other app", "merged", "clean"];
const STATE_SAY: Record<string, string> = { uncommitted: "Uncommitted work", "behind main": "Behind main", "other app": "Open in another app", merged: "Merged, safe to remove", clean: "Clean" };
/** the side copies sorted by state, uncommitted first (canvas: sorted inside), and grouped */
export function sortCopies(rows: { name: string; state: string }[]) {
  const out = [...rows].sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const by: Record<string, { name: string; state: string }[]> = {};
  for (const c of out) (by[c.state] = by[c.state] || []).push(c);
  return { rows: out, by };
}

export function LifePiece({ p, keysHere }: { p: Piece; keysHere: boolean }) {
  const t = useNext((_, s) => s.doc[p.id] ?? String(p.text ?? ""));
  const asks = asksInside(p.id), n = asksOn(p.id).length;
  const say = n ? <>{n} thing{n === 1 ? "" : "s"} here {n === 1 ? "asks" : "ask"} you · <Kbd t="⌘J" /> brings {n === 1 ? "it" : "them"}</> : "Nothing here needs you.";
  const block = MODE === "live" && p.block && typeof p.block === "object" ? (p.block as { kind: string; body?: unknown }) : null;
  return (
    <div className="nr-life">
      {asks.map((a) => <AskCard key={a.id} a={a} />)}
      <div className={`nr-sheet${keysHere ? " kf" : ""}`} data-front data-pane="doc">
        <h1>{p.name}</h1><p className="nr-say-line">{say}</p>
        {block ? <Suspense fallback={null}><LiveBlock b={block} /></Suspense>
          : p.kind === "list"
            ? <div className="nr-list-rows">{t.split(/\s*·\s*/).filter(Boolean).map((x, i) => <div key={i} className="nr-todo"><span className="nr-box" /><span>{x}</span></div>)}</div>
            : <div className="nr-text">{t}<span className="cur">▍</span></div>}
      </div>
    </div>
  );
}

export function Copies({ p }: { p: Piece }) {
  const { rows, by } = sortCopies(p.copies || []), u = (by.uncommitted || []).length;
  return (
    <div className="nr-list" data-front>
      <h1>Side copies</h1>
      <p className="nr-say-line">{rows.length} copies of {regionOf(p.region)?.name ?? ""}. {u ? `${u} hold work nobody has kept yet; they come first.` : "None holds unkept work."}</p>
      {STATE_ORDER.filter((s) => by[s]).map((s) => (
        <div key={s}><div className="nr-grp">{STATE_SAY[s]}<small>{by[s].length}</small></div>
          {by[s].map((c) => <div key={c.name} className="nr-copy" data-copyrow={c.state}><code>{c.name}</code></div>)}</div>
      ))}
    </div>
  );
}

export function Arrivals({ p }: { p: Piece }) { return <div className="nr-list" data-front data-arrivals={p.id} />; }

// The tracker's inside (#692 suite step 2, suite.html "tracker": rows of one kind): a table whose columns its run fills.
// Moves: add a column by naming it (the column shows at once, its cells unsure, and the run fills it) · a row opens as a
// sticky (its next step, in the block's folder). A cell the run could not find is marked unsure, never guessed. The
// frame (Piece.tsx) draws the words, the ring and the shelf; this draws only the table. Stand-in: p2/tracker.mjs.
import { useRef, useState, type CSSProperties } from "react";
import { useSize } from "../../../kit";
import type { Sticky } from "../pass2";
import type { Metas } from "../../meta";
import type { ShapeProps } from "./shapes";
import { say } from "./lift";
import "./tracker.css";

export const meta = {
  Tracker: {
    job: "rows of one kind: a table whose columns the run fills (job applications, a group project, the classes' work)",
    flow: "know",
    states: ["its run laying it out", "the table", "a column added, its run filling it", "a cell it is unsure of", "a row opened as a sticky", "the run failed: the stand-in's rows"],
    keys: [
      { press: "+ a column, type its name, Enter", does: "adds the column; its run fills it (home.tracker.col)" },
      { press: "press a row", does: "opens it as a sticky: its next step, in the folder (home.tracker.row)" },
    ],
    listens: ["home.state › blocks"],
  },
} satisfies Metas;

/** the least a table's column may have, in px (the scale's --s12 + --s8 + --s2): with less, a row is two lines (its
 *  thing and its stage, then the rest), not a table's cells */
export const COL_MIN = 88;

type Body = { kind?: string; cols: string[]; rows: string[][]; doubts?: string[]; opened?: Record<string, string>; by?: string; failed?: string };

export function Tracker({ b, r, h }: ShapeProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  const body = b.body as Body | null;
  // the box is drawn while the run lays it out too: useSize measures the box it first sees
  if (!body?.cols) return <div ref={box} className="tk"><p className="pc-step tk-wait" data-tk-wait>{r ? `its run: ${r.run}` : "its run is laying it out"}…</p></div>;
  const doubt = new Set(body.doubts ?? []);
  const grid: CSSProperties = { gridTemplateColumns: body.cols.map((_, i) => (i === 0 ? "minmax(0, 1.3fr)" : "minmax(0, 1fr)")).join(" ") };
  const addCol = () => {
    const name = (naming ?? "").trim(); setNaming(null);
    if (!name) return;
    h.send({ type: "home.tracker.col", id: b.id, name });
    say(`a column, ${name.toLowerCase()}: its run fills it`);
  };
  const open = async (i: number) => {
    const m = await h.ask<{ sticky?: Sticky }>({ type: "home.tracker.row", id: b.id, row: i });
    if (m?.sticky) say(`a row opens as a sticky: ${m.sticky.text}`);
  };
  const stop = { onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(), onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };
  const compact = w > 0 && w < body.cols.length * COL_MIN;
  // compact: the thing and its stage on the first line, the other cells after, in order
  const st = Math.max(1, body.cols.findIndex((c) => /stage|state/.test(c)));
  const cell = (row: string[], i: number, j: number) => {
    const unsure = doubt.has(`${i}:${j}`);
    return <span key={j} role="cell" className={unsure ? "unsure" : undefined} data-tk-unsure={unsure ? "" : undefined} data-tk-col={body.cols[j]} title={unsure ? `unsure: its run could not find ${body.cols[j]}` : `${body.cols[j]}: ${row[j]}`}>{row[j]}</span>;
  };
  return (
    <div ref={box} className={`tk${compact ? " compact" : ""}`} data-pc-inside="tracker" data-tk-kind={body.kind} data-tk-compact={compact ? "" : undefined}>
      <div className="tk-table" role="table" aria-label={b.words}>
        {compact
          ? <div className="tk-cols" role="row">{body.cols.map((c, j) => <span key={c} role="columnheader">{j ? " · " : ""}{c}</span>)}</div>
          : <div className="tk-tr head" role="row" style={grid}>{body.cols.map((c) => <span key={c} role="columnheader" title={c}>{c}</span>)}</div>}
        {body.rows.map((row, i) => {
          const sid = body.opened?.[i];
          return (
            <div key={i} className={`tk-tr${sid ? " opened" : ""}`} role="row" style={compact ? undefined : grid} data-tk-row={i} data-tk-opened={sid ?? undefined} tabIndex={0}
              title={sid ? "opened as a sticky" : "press: open it as a sticky"} {...stop}
              onClick={(e) => { e.stopPropagation(); void open(i); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void open(i); } }}>
              {compact ? (
                <>
                  <span className="tk-one">{sid && <i className="tk-mark" aria-label="a sticky" />}{cell(row, i, 0)}{cell(row, i, st)}</span>
                  <span className="tk-rest">{row.map((_, j) => (j === 0 || j === st ? null : <span key={j} className="tk-bit">{j > (st === 1 ? 2 : 1) ? " · " : ""}{cell(row, i, j)}</span>))}</span>
                </>
              ) : row.map((_, j) => (j === 0 && sid ? <span key={j} className="tk-first"><i className="tk-mark" aria-label="a sticky" />{cell(row, i, j)}</span> : cell(row, i, j)))}
            </div>
          );
        })}
      </div>
      <div className="tk-foot" {...stop}>
        {naming === null
          ? <button type="button" className="pc-act" data-tk-add onClick={() => setNaming("")}>+ a column</button>
          : <input className="tk-name" autoFocus value={naming} placeholder="name it: salary, contact, …" aria-label="the new column's name" data-tk-name
              onChange={(e) => setNaming(e.target.value)} onBlur={addCol} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") addCol(); else if (e.key === "Escape") setNaming(null); }} />}
        <span className="tk-by">{body.failed ?? `${body.rows.length} rows · by ${body.by ?? "its run"}`}</span>
      </div>
    </div>
  );
}

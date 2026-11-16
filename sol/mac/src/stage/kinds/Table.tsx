// A table (#696; v4 §4): a quiet head, the first column in ink, numbers right-aligned in even figures, and a cell that
// is a state ("running", "done", "waits", "failed") as its meaning dot: the bands while it runs, green done, yellow when
// it waits on you, red when it failed, grey otherwise. The reading is cellKind's, pure (cells.ts).
import type { KindProps, TableBody } from "./types";
import { cellKind, numericCols } from "./cells";

export function Table({ body }: KindProps<TableBody>) {
  const cols = body?.cols ?? [], rows = body?.rows ?? [], num = numericCols(rows);
  return (
    <table className="st-table">
      <thead><tr>{cols.map((c, j) => <th key={c} className={num.has(j) ? "num" : undefined}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} data-part={`row ${i + 1}`}>{r.map((c, j) => {
          const k = cellKind(c);
          return <td key={j} className={num.has(j) ? "num" : undefined}>{k.state ? <span className={`st-is ${k.state}`}>{c}</span> : c}</td>;
        })}</tr>
      ))}</tbody>
    </table>
  );
}

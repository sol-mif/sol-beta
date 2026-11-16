// A table's cells read (v4 §4, #738): which hold a number (right-aligned, even figures) and which a state (its meaning
// dot). Pure, apart from Table.tsx, so the face's tests reach it.

export type CellState = "live" | "done" | "waits" | "wrong" | "rest";
const STATES: Record<string, CellState> = {
  running: "live", working: "live", live: "live", now: "live",
  done: "done", ok: "done", green: "done", passed: "done", merged: "done",
  waits: "waits", waiting: "waits", "waits on you": "waits", "needs you": "waits", open: "waits",
  failed: "wrong", error: "wrong", red: "wrong", broken: "wrong",
  queued: "rest", idle: "rest", closed: "rest", stopped: "rest", ended: "rest",
};
/** a number as a table shows one: digits with their marks (0:41, 1,204, 12 %, +6, −5, 2.4 s), or a dash for none */
const NUM = /^(?:[+−-]?\d[\d.,:]*\s?(?:%|s|ms|k|m|h|min)?|—|-)$/;

export function cellKind(c: string): { num: boolean; state?: CellState } {
  const t = c.trim();
  return { num: NUM.test(t), state: STATES[t.toLowerCase()] };
}
/** the columns whose every filled cell is a number */
export function numericCols(rows: string[][]): Set<number> {
  const out = new Set<number>(), n = Math.max(0, ...rows.map((r) => r.length));
  for (let j = 0; j < n; j++) {
    const cells = rows.map((r) => (r[j] ?? "").trim()).filter(Boolean);
    if (cells.length && cells.every((c) => NUM.test(c)) && cells.some((c) => /\d/.test(c))) out.add(j);
  }
  return out;
}

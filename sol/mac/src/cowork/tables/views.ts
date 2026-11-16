// Tables (#434, D2 of #413): what a view of a table shows, worked out here and drawn in Table.tsx. Four views of the same
// rows: a list (sorted, some hidden), a board (columns by a field, a choice's columns in its own order), a calendar (a
// month of days, each row on its date) and a timeline (one span each, from a date to a date or to today). The shapes are
// tables.json, read by the engine too (team/tables.ts), so a column, a view or a source is named once. The board of
// issues is the first table (source "board"): Dashboard.tsx draws its columns and its weeks through `groupsOf` and
// `spansOf` with the board view and the timeline view below, so the board looks as it always did. Pure: no React here
// (src/tables.test.ts); the shapes come in from shapes.ts, which reads the JSON.
import type { Board, Card } from "../useTeam";

export type Source = "own" | "board" | "feed" | "sessions";
export type ColType = "text" | "number" | "date" | "choice" | "person" | "check";
export type Choice = { id: string; name: string };
export type Col = { key: string; name: string; type: ColType; choices?: Choice[] };
export type ViewKind = "list" | "board" | "calendar" | "timeline";
export type View = {
  id: string; kind: ViewKind; name: string;
  by?: string; date?: string; start?: string; end?: string;
  sort?: { key: string; desc?: boolean };
  hide?: Record<string, string[]>;
};
export type Cell = string | number | boolean | null;
export type Row = { id: string; _by?: string; _agent?: boolean; _at?: string; [key: string]: unknown };
export type TableInfo = { id: string; title: string; source: Source; by: string; agent?: boolean; at: string; rows?: number; newer?: true };
export type TableNow = { title: string; source: Source; made: string; by: string; agent?: boolean; at: string; columns: Col[]; views: View[]; newer?: true };
export type TableAnswer = { repo?: string; id: string; table: TableNow; rows: Row[]; note?: string; error?: string; changed?: boolean; made?: string[] };

export type Shapes = { own: { columns: Col[]; views: View[] }; sources: Record<Exclude<Source, "own">, { name: string; reads: string; columns: Col[]; views: View[] }> };
export const BOARD_TABLE = "board";
export const KINDS: { kind: ViewKind; word: string; mark: string }[] = [
  { kind: "list", word: "list", mark: "≡" }, { kind: "board", word: "board", mark: "▥" },
  { kind: "calendar", word: "calendar", mark: "▦" }, { kind: "timeline", word: "timeline", mark: "▬" },
];
/** what a table's rows come from, in one line */
export const sourceWord = (shapes: Shapes, s: Source) => (s === "own" ? "its own rows" : shapes.sources[s]?.name ?? s);
export const viewOf = (views: readonly View[], kind: ViewKind) => views.find((v) => v.kind === kind);

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const time = (v: unknown) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : NaN; };
/** a cell as words: a choice's name, a date as "Oct 30", a tick, a person as they are */
export function cellWord(col: Col | undefined, v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (!col) return text(v);
  if (col.type === "choice") return col.choices?.find((c) => c.id === v)?.name ?? text(v);
  if (col.type === "check") return v ? "✓" : "";
  if (col.type === "date") { const t = time(v); return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(/T/.test(String(v)) ? {} : { timeZone: "UTC" }) }) : text(v); }
  return text(v);
}

/** the rows a view shows (pure): those not hidden by a field's values, in the view's order (numbers and dates as such,
 *  empty last); with no order, as kept */
export function shownRows<R extends Row>(rows: readonly R[], view: Pick<View, "sort" | "hide">, cols: readonly Col[]): R[] {
  const hide = view.hide ?? {};
  const out = rows.filter((r) => !Object.entries(hide).some(([k, vs]) => vs.includes(text(r[k]))));
  const s = view.sort;
  if (!s) return out;
  const col = cols.find((c) => c.key === s.key);
  const val = (r: R): number | string | null => {
    const v = r[s.key];
    if (v === undefined || v === null || v === "") return null;
    if (col?.type === "number") return Number(v);
    if (col?.type === "date") { const t = time(v); return Number.isFinite(t) ? t : null; }
    if (col?.type === "choice") { const i = col.choices?.findIndex((c) => c.id === v) ?? -1; return i < 0 ? 1e9 : i; }
    return text(v).toLowerCase();
  };
  const dir = s.desc ? -1 : 1;
  return out.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
    if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
    const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
    return c ? c * dir : a.i - b.i;
  }).map((x) => x.r);
}

export type Group<R> = { id: string; name: string; rows: R[] };
/** a board view's columns (pure): a choice field's choices in their order (each one even when empty, so a column never
 *  jumps), else each value met, in order; a row with none in "none" at the end. Hidden values have no column */
export function groupsOf<R extends Row>(rows: readonly R[], view: View, cols: readonly Col[]): Group<R>[] {
  const by = view.by ?? "";
  const col = cols.find((c) => c.key === by);
  const hidden = view.hide?.[by] ?? [];
  const shown = shownRows(rows, view, cols);
  const groups: Group<R>[] = col?.type === "choice" && col.choices?.length
    ? col.choices.filter((c) => !hidden.includes(c.id)).map((c) => ({ id: c.id, name: c.name, rows: [] }))
    : [];
  const at = new Map(groups.map((g) => [g.id, g]));
  const none: Group<R> = { id: "", name: "none", rows: [] };
  for (const r of shown) {
    const v = text(r[by]);
    if (!v) { none.rows.push(r); continue; }
    let g = at.get(v);
    if (!g) { g = { id: v, name: cellWord(col, v), rows: [] }; at.set(v, g); groups.push(g); }
    g.rows.push(r);
  }
  if (!(col?.type === "choice" && col.choices?.length)) groups.sort((a, b) => a.name.localeCompare(b.name));
  if (none.rows.length) groups.push(none);
  return groups;
}

const DAY = 86_400_000, WEEK = 7 * DAY;
/** a time `n` days on, by the calendar here: the same hour across a change of the clocks (a day is not always 24 hours) */
export const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
/** the Monday a time's week starts on, at midnight here */
export const monday = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
/** a date cell's day, kept as "YYYY-MM-DD" in the days of this place: a date with no time is its own day */
export function dayOf(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = time(v);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type Day = { day: string; n: number; inMonth: boolean; today: boolean; rows: Row[] };
/** a calendar view's month (pure): whole weeks from the Monday on or before the 1st to the Sunday on or after the last,
 *  each day with the rows whose date field falls on it. `month` is "YYYY-MM"; the rows with no date are counted apart */
export function monthOf<R extends Row>(rows: readonly R[], view: View, cols: readonly Col[], month: string, now = Date.now()): { weeks: (Day & { rows: R[] })[][]; undated: number; label: string } {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getTime(), last = new Date(y, m, 0).getTime();
  const from = monday(first), to = addDays(monday(last), 6);
  const by = new Map<string, R[]>();
  let undated = 0;
  for (const r of shownRows(rows, view, cols)) {
    const d = dayOf(r[view.date ?? ""]);
    if (!d) { undated++; continue; }
    (by.get(d) ?? by.set(d, []).get(d)!).push(r);
  }
  const today = dayOf(new Date(now).toISOString());
  const weeks: (Day & { rows: R[] })[][] = [];
  for (let t = from; t <= to; t = addDays(t, 7)) {
    const week: (Day & { rows: R[] })[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(t); d.setDate(d.getDate() + i);
      const day = dayOf(d.toISOString());
      week.push({ day, n: d.getDate(), inMonth: d.getMonth() === m - 1, today: day === today, rows: by.get(day) ?? [] });
    }
    weeks.push(week);
  }
  return { weeks, undated, label: new Date(first).toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
}
/** "YYYY-MM" of a time here, and the month before or after one */
export const monthKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const monthStep = (month: string, by: number) => { const [y, m] = month.split("-").map(Number); return monthKey(new Date(y, m - 1 + by, 1).getTime()); };

export type Span<R> = { row: R; a: number; b: number; open: boolean };
/** a timeline view (pure): one span a row with a start, from its start to its end; with an end field and none yet, to
 *  today (open); with no end field, the one day; with an end and no start, the one day it ends. The weeks run from the first start (at most `back` weeks ago) to the
 *  week after the last end or this week, whichever is later; each week a mark */
export function spansOf<R extends Row>(rows: readonly R[], view: View, cols: readonly Col[], now = Date.now(), back = 8): { spans: Span<R>[]; weeks: number[]; start: number; end: number } {
  const spans: Span<R>[] = [];
  for (const r of shownRows(rows, view, cols)) {
    const a0 = time(r[view.start ?? ""]);
    const e = view.end ? time(r[view.end]) : NaN;
    if (!Number.isFinite(a0) && !Number.isFinite(e)) continue;
    const a = Number.isFinite(a0) ? a0 : e;
    const open = !!view.end && !Number.isFinite(e);
    const b = Number.isFinite(a0) && Number.isFinite(e) ? Math.max(a, e) : open ? Math.max(a, now) : a + DAY;
    spans.push({ row: r, a, b, open });
  }
  const first = spans.length ? Math.max(Math.min(...spans.map((s) => s.a)), now - back * WEEK) : now;
  const start = monday(first);
  const end = Math.max(addDays(monday(now), 7), spans.length ? addDays(monday(Math.max(...spans.map((s) => s.b))), 7) : 0);
  const weeks: number[] = [];
  for (let t = start; t < end; t = addDays(t, 7)) weeks.push(t);
  return { spans, weeks, start, end };
}
/** where a time sits across a timeline, as a share of it, kept inside it */
export const across = (t: number, start: number, end: number) => (Math.min(Math.max(t, start), end) - start) / (end - start);

/** the board's cards as the board table's rows (pure), as the engine's boardRows has them, each keeping its card so the
 *  dashboard draws it as it always did */
export type BoardRow = Row & { _card: Card };
export function boardTableRows(cards: readonly Card[]): BoardRow[] {
  return cards.map((c) => ({
    id: `${c.repo.split("/")[1] ?? c.repo}-${c.number}`, title: c.title, number: c.number, column: c.column,
    ...(c.domain ? { domain: c.domain } : {}), ...(c.assignees[0] ? { who: c.assignees[0] } : {}),
    created: c.created, ...(c.closed ? { closed: c.closed } : {}), ...(c.pr ? { pr: c.pr } : {}),
    _card: c,
  }));
}
export const boardRowsOf = (b: Board | null) => (b ? boardTableRows(b.cards) : []);

/** the fields a kind of view can be set on (pure): a board groups by a choice, a person or text; the others by a date */
export function fieldsFor(kind: ViewKind, cols: readonly Col[]): Col[] {
  if (kind === "board") return cols.filter((c) => c.type === "choice" || c.type === "person" || c.type === "check" || (c.type === "text" && c.key !== "title"));
  if (kind === "calendar" || kind === "timeline") return cols.filter((c) => c.type === "date");
  return [];
}
/** a new view of a kind on a field, as the engine keeps it; its id the next free one */
export function newView(kind: ViewKind, field: string, views: readonly View[], cols: readonly Col[], name?: string): View {
  let id: string = kind, i = 2;
  while (views.some((v) => v.id === id)) id = `${kind}-${i++}`;
  const col = cols.find((c) => c.key === field);
  const v: View = { id, kind, name: (name ?? "").trim() || (col ? `${kind} by ${col.name}` : kind) };
  if (kind === "board") v.by = field;
  if (kind === "calendar") v.date = field;
  if (kind === "timeline") { v.start = field; const end = cols.find((c) => c.type === "date" && c.key !== field); if (end) v.end = end.key; }
  return v;
}
/** one row's cells as words for a card or a line, the title first: the fields a view does not already say */
export function restOf(r: Row, cols: readonly Col[], skip: string[]): { col: Col; word: string }[] {
  return cols.filter((c) => c.key !== "title" && !skip.includes(c.key))
    .map((c) => { const w = cellWord(c, r[c.key]); return { col: c, word: w && c.type === "number" ? `${c.name} ${w}` : w }; }).filter((x) => x.word);
}
export const titleOf = (r: Row, cols: readonly Col[]) => text(r.title ?? r[cols[0]?.key ?? ""]) || "untitled";

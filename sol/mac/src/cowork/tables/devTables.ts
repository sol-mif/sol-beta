// ?dev=team: the project's tables, kept in this tab's memory only (#434), so the tables tab and a table on a page draw and
// write with no engine. The engine's answers in their shapes (team.tables, team.table, team.table.write): the board's
// rows come from the dev board (useTeam's FAKE), the feed's and the sessions' from a few lines here, and a write to a
// source table is refused as the engine refuses it.
import type { Board } from "../useTeam";
import { SHAPES } from "./shapes";
import { boardTableRows, type Col, type Row, type TableNow, type View, type Source } from "./views";

type DevTable = TableNow & { id: string; rows: Row[] };
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const day = (d: number) => { const t = new Date(); t.setDate(t.getDate() + d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const own = (): { columns: Col[]; views: View[] } => JSON.parse(JSON.stringify(SHAPES.own));
const src = (s: Exclude<Source, "own">) => SHAPES.sources[s];

const TABLES: DevTable[] = [
  { id: "board", title: "the board", source: "board", made: "marco", by: "marco", at: ago(60 * 30), columns: [], views: src("board").views, rows: [] },
  { id: "launch-tasks", title: "launch tasks", source: "own", made: "marco", by: "frank", agent: true, at: ago(8), ...own(), rows: [
    { id: "r1", title: "the install line on a clean Mac", status: "done", who: "marco", start: day(-9), due: day(-4), _by: "marco" },
    { id: "r2", title: "onboarding plays on Windows", status: "done", who: "frank", start: day(-7), due: day(-2), _by: "frank", _agent: true },
    { id: "r3", title: "cloud join from a phone link", status: "doing", who: "isaac", start: day(-3), due: day(2), _by: "isaac" },
    { id: "r4", title: "first-run card in one line", status: "doing", who: "marco", start: day(-1), due: day(4), _by: "marco" },
    { id: "r5", title: "send the ten invites", status: "to do", who: "frank", start: day(5), due: day(7), _by: "frank", _agent: true },
    { id: "r6", title: "a call with each of the ten", status: "to do", who: "isaac", start: day(7), due: day(12), _by: "isaac" },
    { id: "r7", title: "write what we learned", status: "to do", due: day(14), _by: "marco" },
  ] },
  { id: "what-happened", title: "what happened", source: "feed", made: "isaac", by: "isaac", at: ago(60 * 5), columns: [], views: src("feed").views, rows: [] },
];
const FEED: Row[] = [
  { id: "f1", text: "handed #34 to isaac", kind: "handed", who: "frank", at: ago(40), _agent: true },
  { id: "f2", text: "#31 landed on main", kind: "landed", who: "marco", at: ago(60 * 3) },
  { id: "f3", text: "opened #37: Talk, human to human", kind: "opened", who: "isaac", at: ago(60 * 26) },
  { id: "f4", text: "said: the rooms stack is ready for a look", kind: "said", who: "frank", at: ago(60 * 50) },
  { id: "f5", text: "#27 folded into stable", kind: "landed", who: "marco", at: ago(60 * 75) },
];

const strip = (rs: Row[]) => rs.map(({ _card: _c, ...r }) => r as Row);
const rowsOf = (t: DevTable, board: Board | null): Row[] => t.source === "board" ? strip(boardTableRows(board?.cards ?? [])) : t.source === "feed" ? FEED : t.source === "sessions" ? [] : t.rows;
const colsOf = (t: DevTable): Col[] => (t.source === "own" ? t.columns : src(t.source).columns);
const answer = (t: DevTable, board: Board | null) => {
  const { rows: _r, id, ...table } = t;
  return { repo: "sol-mif/sol-dev", id, table: { ...table, columns: colsOf(t) }, rows: rowsOf(t, board) };
};
let n = 0;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "table";

export function fakeTables(type: string, body: any, board: Board | null): any {
  if (type === "team.tables") return { repo: "sol-mif/sol-dev", tables: TABLES.map((t) => ({ id: t.id, title: t.title, source: t.source, by: t.by, agent: t.agent, at: t.at, ...(t.source === "own" ? { rows: t.rows.length } : {}) })) };
  if (type === "team.table") { const t = TABLES.find((x) => x.id === body?.id); return t ? answer(t, board) : { error: "no such table here" }; }
  if (type !== "team.table.write") return {};
  const ops: any[] = Array.isArray(body?.ops) ? body.ops : [];
  const at = new Date().toISOString(), made: string[] = [];
  let t = TABLES.find((x) => x.id === body?.id);
  for (const op of ops) {
    if (op.make) {
      let id = slug(op.make.title), i = 2;
      while (id === "board" || TABLES.some((x) => x.id === id)) id = `${slug(op.make.title).slice(0, 29)}-${i++}`;
      const s: Source = op.make.source ?? "own";
      t = { id, title: String(op.make.title), source: s, made: "marco", by: "marco", at, ...(s === "own" ? own() : { columns: [], views: src(s).views }), rows: [] };
      TABLES.push(t);
      continue;
    }
    if (!t) return { error: "no such table here" };
    if (op.view) { const i = t.views.findIndex((v) => v.id === op.view.id); t.views = i >= 0 ? t.views.map((v, j) => (j === i ? op.view : v)) : [...t.views, op.view]; continue; }
    if (op.unview) { if (t.views.length < 2) return { error: "a table keeps at least one view" }; t.views = t.views.filter((v) => v.id !== op.unview); continue; }
    if (typeof op.title === "string") { t.title = op.title; continue; }
    if (t.source !== "own") return { error: `this table reads ${src(t.source).name}: it keeps itself current, and its rows are not written here` };
    if (op.add) { const id = `d${++n}`; t.rows.push({ id, ...op.add.cells, _by: "marco", _at: at }); made.push(id); continue; }
    if (op.set) { const r = t.rows.find((x) => x.id === op.set.row); if (!r) return { error: `no row ${op.set.row}` }; Object.assign(r, op.set.cells, { _by: "marco", _at: at }); delete r._agent; continue; }
    if (op.remove) { t.rows = t.rows.filter((x) => x.id !== op.remove.row); continue; }
  }
  if (!t) return { error: "nothing to change" };
  Object.assign(t, { by: "marco", agent: undefined, at });
  return { ...answer(t, board), changed: true, made };
}

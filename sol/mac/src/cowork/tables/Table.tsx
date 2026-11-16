// Tables (#434, D2 of #413): the project's tables, each seen as a list, a board, a calendar or a timeline (views.ts works
// out what each shows). The tables tab lists them, the board first; a table opens in the tab's place, its saved views as
// tabs across the top and "+ view" to keep another. A table of its own rows is written here: a row added, a cell changed
// in the list, a card dragged to another column of the board, a row taken out, each signed in the record. A table that
// reads the board, the feed or the sessions keeps itself current: the board's rows are the board this Sol already has,
// the others are read again on the engine's word and every half minute while open. A table also stands on a page
// (onPage.tsx, `::table[<id>]`), drawn by the same views.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Team } from "../useTeam";
import { DEV_TEAM } from "../useTeam";
import { Glyph } from "../Room";
import { Who, since } from "../bits";
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { sourceName, sourceReads } from "./shapes";
import {
  KINDS, boardTableRows, groupsOf, shownRows, monthOf, monthKey, monthStep, spansOf, across, monday, cellWord,
  fieldsFor, newView, restOf, titleOf, type Col, type Row, type View, type ViewKind, type TableInfo, type TableAnswer, type Source,
} from "./views";
import "./tables.css";

type Op = Record<string, unknown>;
const lastBy = (t: { by: string; agent?: boolean; at: string }) => { const s = since(t.at); return `${t.by || "someone"}${t.agent ? "'s agent" : ""} · ${s === "now" ? "just now" : `${s} ago`}`; };

/** one table, read and kept current: the board's rows from the board this Sol has; the feed's and the sessions' read
 *  again on the engine's word and every half minute; its own rows on every change anyone makes */
export function useTable(team: Team, id: string) {
  const [t, setT] = useState<TableAnswer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const read = (refresh = false) => team.ask<TableAnswer>("team.table", { id, ...(refresh ? { refresh: true } : {}) }, 30_000)
    .then((m) => { if (m.table) { setT(m); setError(""); } else setError(m.error ?? "this table could not be read"); })
    .catch((e) => setError(String(e?.message ?? e)));
  const source = t?.table.source;
  useEffect(() => {
    void read();
    if (DEV_TEAM) return;
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.table.changed" && (m.id === id || m.id === "")) void read(); });
  }, [team.ask, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (source !== "feed" && source !== "sessions") return;
    const tm = window.setInterval(() => void read(), 30_000);
    return () => window.clearInterval(tm);
  }, [source, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = async (ops: Op[]): Promise<TableAnswer | null> => {
    setBusy(true);
    const r = await team.ask<TableAnswer>("team.table.write", { id, ops }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }) as TableAnswer);
    setBusy(false);
    if (r.error || !r.table) { setError(r.error ?? "not written"); return null; }
    setError(""); setT(r);
    return r;
  };
  // the board's rows: the board this Sol already has, current every minute and on every push
  const rows = useMemo(() => (t?.table.source === "board" ? boardTableRows(team.board?.cards ?? []) as Row[] : t?.rows ?? []), [t, team.board]);
  return { t, rows, error, busy, write, read, setError };
}

// ---- the tab ----
const OPEN_KEY = "sol.cowork.table";
const readOpen = () => { try { return sessionStorage.getItem(OPEN_KEY) || ""; } catch { return ""; } };
const keepOpen = (id: string) => { try { if (id) sessionStorage.setItem(OPEN_KEY, id); else sessionStorage.removeItem(OPEN_KEY); } catch { /* private */ } };
const SOURCES: Source[] = ["own", "board", "feed", "sessions"];

export function TablesTab({ team, people, flash }: { team: Team; people: string[]; flash: (s: string) => void }) {
  const [list, setList] = useState<TableInfo[] | null>(null);
  const [note, setNote] = useState("");
  const [open, setOpenS] = useState(readOpen);
  const setOpen = (id: string) => { setOpenS(id); keepOpen(id); };
  const [making, setMaking] = useState<{ title: string; source: Source; busy?: boolean; error?: string } | null>(null);
  const read = (refresh = false) => team.ask<{ tables?: TableInfo[]; note?: string; error?: string }>("team.tables", refresh ? { refresh: true } : {}, 30_000)
    .then((m) => { if (m.tables) setList(m.tables); setNote(m.error ?? m.note ?? ""); }).catch((e) => setNote(String(e?.message ?? e)));
  useEffect(() => {
    void read();
    if (DEV_TEAM) return;
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.tables" && Array.isArray(m.tables)) setList(m.tables as TableInfo[]); });
  }, [team.ask]); // eslint-disable-line react-hooks/exhaustive-deps
  const make = async () => {
    if (!making) return;
    if (!making.title.trim()) return setMaking({ ...making, error: "give the table a title, one line" });
    setMaking({ ...making, busy: true, error: undefined });
    const r = await team.ask<TableAnswer>("team.table.write", { id: "", ops: [{ make: { title: making.title.trim(), source: making.source } }] }, 60_000).catch((e) => ({ error: String(e?.message ?? e) }) as TableAnswer);
    if (!r.table) return setMaking({ ...making, busy: false, error: r.error ?? "couldn't make the table" });
    setMaking(null); void read(); setOpen(r.id);
    flash(`made ${r.table.title}; everyone in the project sees it`);
  };

  if (open) return (
    <div className="tb-page">
      <TableView key={open} team={team} id={open} people={people} flash={flash} onBack={() => { setOpen(""); void read(); }} />
    </div>
  );
  return (
    <div className="tb-page">
      <div className="tl-head tb-head">
        <Glyph kind="sheet" size={56} />
        <div><h2 className="rm-gp-t">tables</h2><p className="rm-gp-s">the project's tables, each a list, a board, a calendar or a timeline of the same rows. The board is the first; a table can also read what happened or the sessions, and keeps itself current</p></div>
      </div>
      {list === null ? <p className="rm-pg-foot">{note || "reading the tables…"}</p> : (
        <div className="tb-list" role="list">
          {list.map((t) => (
            <button key={t.id} role="listitem" className="tb-row" onClick={() => setOpen(t.id)} title={`open ${t.title}`}>
              <span className="tb-row-t">{t.title}</span>
              <span className="tb-row-s">{t.source === "own" ? `${t.rows ?? 0} row${t.rows === 1 ? "" : "s"} · ${lastBy(t)}` : sourceReads(t.source)}{t.newer ? " · written by a newer Sol" : ""}</span>
              <span className="tb-row-k" aria-hidden>{t.source === "own" ? "" : "live"}</span>
            </button>
          ))}
        </div>
      )}
      <div className="tl-add tb-add">
        {making ? (
          <form onSubmit={(e) => { e.preventDefault(); void make(); }}>
            <input autoFocus placeholder="the table's title" value={making.title} maxLength={120} onChange={(e) => setMaking({ ...making, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") setMaking(null); }} />
            <div className="tb-src" role="radiogroup" aria-label="its rows">
              {SOURCES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={making.source === s} className={`tb-chip ${making.source === s ? "on" : ""}`} onClick={() => setMaking({ ...making, source: s })}>
                  {s === "own" ? "its own rows" : `reads ${sourceName(s)}`}
                </button>
              ))}
            </div>
            {making.error && <span className="err">{making.error}</span>}
            <div className="acts"><button className="rm-th-link u" type="submit" disabled={making.busy}>{making.busy ? "making…" : "make it"}</button><button className="rm-th-link" type="button" onClick={() => setMaking(null)}>never mind</button></div>
          </form>
        ) : <button className="tl-plus" onClick={() => setMaking({ title: "", source: "own" })}><span>+</span>new table</button>}
      </div>
    </div>
  );
}

// ---- one table ----
const viewKey = (id: string) => `sol.cowork.table.view.${id}`;
export function TableView({ team, id, people, flash, onBack }: { team: Team; id: string; people: string[]; flash: (s: string) => void; onBack: () => void }) {
  const { t, rows, error, busy, write } = useTable(team, id);
  const [vid, setVidS] = useState(() => { try { return sessionStorage.getItem(viewKey(id)) || ""; } catch { return ""; } });
  const setVid = (v: string) => { setVidS(v); try { sessionStorage.setItem(viewKey(id), v); } catch { /* private */ } };
  const [adding, setAdding] = useState(false);
  const views = t?.table.views ?? [];
  const view = views.find((v) => v.id === vid) ?? views[0];
  const own = t?.table.source === "own" && !t.table.newer;
  return (<>
    <div className="rm-pg-top"><button className="rm-th-link" onClick={onBack}>‹ tables</button><span className="rm-th-sp" /></div>
    <div className="tl-head tb-head">
      <Glyph kind="sheet" size={56} />
      <div>
        <h2 className="rm-gp-t">{t?.table.title ?? id}</h2>
        <p className="rm-gp-s">{t ? (t.table.source === "own" ? `${rows.length} row${rows.length === 1 ? "" : "s"} · ${lastBy(t.table)}` : `${sourceReads(t.table.source)}${t.note ? ` · ${t.note}` : ""}`) : error || "reading…"}</p>
      </div>
    </div>
    {t && (
      <div className="tb-views" role="tablist" aria-label="views">
        {views.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === view?.id} className={`tb-vtab ${v.id === view?.id ? "on" : ""}`} onClick={() => setVid(v.id)}>
            <span className="tb-vmark" aria-hidden>{KINDS.find((k) => k.kind === v.kind)?.mark}</span>{v.name}
          </button>
        ))}
        <button className="tb-vtab add" onClick={() => setAdding((a) => !a)} disabled={!!t.table.newer} title="keep another view of these rows">+ view</button>
        {view && views.length > 1 && <button className="tb-vtab gone" title={`take the view ${view.name} away; the rows stay`} disabled={busy}
          onClick={() => void write([{ unview: view.id }]).then((r) => r && setVid(""))}>take this view away</button>}
      </div>
    )}
    {t && adding && <AddView cols={t.table.columns} views={views} busy={busy} onAdd={async (v) => { const r = await write([{ view: v }]); if (r) { setAdding(false); setVid(v.id); flash(`kept the view ${v.name}`); } }} onCancel={() => setAdding(false)} />}
    {error && t && <p className="pg-note" role="status">{error}</p>}
    {t && view && <ViewOf view={view} cols={t.table.columns} rows={rows} people={people} write={own ? write : undefined} busy={busy} />}
  </>);
}

function AddView({ cols, views, busy, onAdd, onCancel }: { cols: Col[]; views: View[]; busy: boolean; onAdd: (v: View) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<ViewKind>("board");
  const fields = fieldsFor(kind, cols);
  const [field, setField] = useState("");
  const [name, setName] = useState("");
  const f = fields.find((c) => c.key === field)?.key ?? fields[0]?.key ?? "";
  return (
    <form className="tb-addv" onSubmit={(e) => { e.preventDefault(); onAdd(newView(kind, f, views, cols, name)); }}>
      <div className="tb-src" role="radiogroup" aria-label="a view as">
        {KINDS.map((k) => <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={`tb-chip ${kind === k.kind ? "on" : ""}`} onClick={() => { setKind(k.kind); setField(""); }}><span aria-hidden>{k.mark}</span> {k.word}</button>)}
      </div>
      {kind !== "list" && (fields.length ? (
        <label className="tb-field">{kind === "board" ? "columns by" : kind === "calendar" ? "on the date" : "from the date"}
          <select value={f} onChange={(e) => setField(e.target.value)}>{fields.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        </label>
      ) : <span className="err">this table has no {kind === "board" ? "field to group by" : "date"} for a {kind}</span>)}
      <input placeholder="its name (optional)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <div className="acts"><button className="rm-th-link u" type="submit" disabled={busy || (kind !== "list" && !fields.length)}>keep it</button><button className="rm-th-link" type="button" onClick={onCancel}>never mind</button></div>
    </form>
  );
}

/** one view of rows, drawn: the tables tab's, and a page's (compact) */
export function ViewOf({ view, cols, rows, people, write, busy, compact }: {
  view: View; cols: Col[]; rows: Row[]; people: string[]; write?: (ops: Op[]) => Promise<unknown>; busy?: boolean; compact?: boolean;
}) {
  if (view.kind === "board") return <BoardOf view={view} cols={cols} rows={rows} write={write} compact={compact} />;
  if (view.kind === "calendar") return <CalendarOf view={view} cols={cols} rows={rows} />;
  if (view.kind === "timeline") return <TimelineOf view={view} cols={cols} rows={rows} compact={compact} />;
  return <ListOf view={view} cols={cols} rows={rows} people={people} write={write} busy={busy} compact={compact} />;
}

// the list: one line a row, a column each; a table of its own rows is written in place
function ListOf({ view, cols, rows, people, write, busy, compact }: { view: View; cols: Col[]; rows: Row[]; people: string[]; write?: (ops: Op[]) => Promise<unknown>; busy?: boolean; compact?: boolean }) {
  const shown = shownRows(rows, view, cols);
  const [edit, setEdit] = useState<{ row: string; key: string } | null>(null);
  const [title, setTitle] = useState("");
  const list = compact ? shown.slice(0, 8) : shown;
  return (
    <div className="tb-list-v">
      {write && <datalist id="tb-people">{people.map((p) => <option key={p} value={p} />)}</datalist>}
      <table className="tb-grid">
        <thead><tr>{cols.map((c) => <th key={c.key} className={`t-${c.type}`}>{c.name}</th>)}{write && <th className="tb-x" />}</tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              {cols.map((c) => {
                const on = edit?.row === r.id && edit.key === c.key;
                return (
                  <td key={c.key} className={`t-${c.type} ${write ? "w" : ""}`} onClick={() => write && !on && setEdit({ row: r.id, key: c.key })}>
                    {on && write ? <CellEdit col={c} value={r[c.key]} onDone={(v) => { setEdit(null); if (v !== undefined && v !== (r[c.key] ?? "")) void write([{ set: { row: r.id, cells: { [c.key]: v } } }]); }} />
                      : <span className={c.key === "title" ? "tb-t" : ""}>{cellWord(c, r[c.key])}</span>}
                  </td>
                );
              })}
              {write && <td className="tb-x"><button title="take this row out" aria-label="take this row out" disabled={busy} onClick={() => void write([{ remove: { row: r.id } }])}>×</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className="tb-none">no rows yet</p>}
      {compact && shown.length > list.length && <p className="tb-more">and {shown.length - list.length} more</p>}
      {write && !compact && (
        <form className="tb-addrow" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void write([{ add: { cells: { [cols[0]?.key ?? "title"]: title.trim() } } }]).then(() => setTitle("")); }}>
          <span aria-hidden>+</span><input placeholder="a new row" value={title} maxLength={2000} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </form>
      )}
    </div>
  );
}

function CellEdit({ col, value, onDone }: { col: Col; value: unknown; onDone: (v: string | number | boolean | null | undefined) => void }) {
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const v = value === undefined || value === null ? "" : String(value);
  const done = (raw: string) => onDone(raw === "" ? null : col.type === "number" ? Number(raw) : col.type === "check" ? raw === "true" : raw);
  const keys = { onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") onDone(undefined); if (e.key === "Enter") (e.target as HTMLElement).blur(); } };
  if (col.type === "choice" || col.type === "check") return (
    <select ref={ref} defaultValue={col.type === "check" ? String(!!value) : v} onChange={(e) => done(e.target.value)} onBlur={() => onDone(undefined)} {...keys}>
      {col.type === "check" ? <><option value="false">no</option><option value="true">yes</option></> : <><option value="">—</option>{(col.choices ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</>}
    </select>
  );
  return <input ref={ref} defaultValue={v} type={col.type === "date" ? "date" : col.type === "number" ? "number" : "text"} list={col.type === "person" ? "tb-people" : undefined}
    onBlur={(e) => done(e.target.value.trim())} {...keys} />;
}

// the board: a column a value of its field; a card a row; on a table of its own rows a card is dragged to another column
function BoardOf({ view, cols, rows, write, compact }: { view: View; cols: Col[]; rows: Row[]; write?: (ops: Op[]) => Promise<unknown>; compact?: boolean }) {
  const groups = groupsOf(rows, view, cols);
  const [over, setOver] = useState("");
  const skip = [view.by ?? ""];
  const cap = compact ? 4 : undefined;
  return (
    <div className="tb-board ccols" style={{ gridTemplateColumns: `repeat(${Math.max(1, groups.length)}, minmax(0, 1fr))` }}>
      {groups.map((g) => (
        <section key={g.id || "-"} className={`ccol ${over === g.id ? "over" : ""}`}
          onDragOver={write ? (e) => { e.preventDefault(); setOver(g.id); } : undefined} onDragLeave={() => setOver("")}
          onDrop={write ? (e) => { e.preventDefault(); setOver(""); const r = e.dataTransfer.getData("text/sol-row"); if (r) void write([{ set: { row: r, cells: { [view.by ?? ""]: g.id || null } } }]); } : undefined}>
          <h3><span>{g.name}</span><small>{g.rows.length || ""}</small></h3>
          {g.rows.length ? g.rows.slice(0, cap ?? g.rows.length).map((r) => (
            <div key={r.id} className="ccard tb-card" draggable={!!write} onDragStart={(e) => { e.dataTransfer.setData("text/sol-row", r.id); e.dataTransfer.effectAllowed = "move"; }}>
              <div className="cl1">
                {typeof r.who === "string" && r.who ? <Who login={r.who} size={16} title={r.who} /> : null}
                {typeof r.number === "number" && <span className="cnum">#{r.number}</span>}
                <span className="ct">{titleOf(r, cols)}</span>
              </div>
              {(() => { const rest = restOf(r, cols, [...skip, "who", "number"]); return rest.length ? <div className="cl2">{rest.slice(0, 3).map((x) => <span key={x.col.key} className="ctag" title={x.col.name}>{x.word}</span>)}</div> : null; })()}
            </div>
          )) : <p className="cnone">nothing</p>}
          {cap !== undefined && g.rows.length > cap && <p className="cmorec">and {g.rows.length - cap} more</p>}
        </section>
      ))}
    </div>
  );
}

// the calendar: a month, Monday first, each row on its day; ‹ › go a month, "today" back to this one
function CalendarOf({ view, cols, rows }: { view: View; cols: Col[]; rows: Row[] }) {
  const [month, setMonth] = useState(() => monthKey(Date.now()));
  const m = monthOf(rows, view, cols, month);
  const col = cols.find((c) => c.key === view.date);
  const head = useMemo(() => { const t = monday(Date.now()); return [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(t + i * 86_400_000).toLocaleDateString(undefined, { weekday: "short" })); }, []);
  return (
    <div className="tb-cal">
      <div className="tb-cal-top">
        <button className="rm-th-link" onClick={() => setMonth(monthStep(month, -1))} aria-label="the month before">‹</button>
        <span className="tb-cal-m">{m.label}</span>
        <button className="rm-th-link" onClick={() => setMonth(monthStep(month, 1))} aria-label="the month after">›</button>
        {month !== monthKey(Date.now()) && <button className="rm-th-link" onClick={() => setMonth(monthKey(Date.now()))}>this month</button>}
        <span className="rm-th-sp" />
        <span className="tb-dim">on {col?.name ?? view.date}{m.undated ? ` · ${m.undated} with no date` : ""}</span>
      </div>
      <div className="tb-cal-g" role="grid">
        {head.map((d) => <div key={d} className="tb-cal-h" role="columnheader">{d}</div>)}
        {m.weeks.flat().map((d) => (
          <div key={d.day} role="gridcell" className={`tb-day ${d.inMonth ? "" : "out"} ${d.today ? "today" : ""}`}>
            <span className="tb-day-n">{d.n}</span>
            {d.rows.slice(0, 3).map((r) => <span key={r.id} className="tb-ev" title={titleOf(r, cols)}>{typeof r.number === "number" ? <span className="cnum">#{r.number} </span> : null}{titleOf(r, cols)}</span>)}
            {d.rows.length > 3 && <span className="tb-ev more">+{d.rows.length - 3}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// the timeline: a row a line, from its start to its end (or today), the weeks across, this week marked: the dashboard's
// "across the weeks", for any table
function TimelineOf({ view, cols, rows, compact }: { view: View; cols: Col[]; rows: Row[]; compact?: boolean }) {
  const now = Date.now();
  const { spans, weeks, start, end } = spansOf(rows, view, cols, now);
  const x = (t: number) => `${across(t, start, end) * 100}%`;
  const list = compact ? spans.slice(0, 10) : spans;
  if (!spans.length) return <p className="tb-none">no rows with a {cols.find((c) => c.key === view.start)?.name ?? "date"} yet</p>;
  const choice = cols.find((c) => c.type === "choice");
  return (
    <div className="cgantt tb-tl">
      <div className="cgrow chead">
        <span className="cgl" />
        <div className="cgtrack">{weeks.map((t) => <span key={t} className="cgweek" style={{ left: x(t) }}>{new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>)}</div>
      </div>
      <div className="cgbody">
        <div className="cgband"><i className="cgnow" style={{ left: x(monday(now)), width: `${(7 * 86_400_000 / (end - start)) * 100}%` }} title="this week" /></div>
        {list.map(({ row: r, a, b, open }) => (
          <div key={r.id} className="cgrow" title={`${titleOf(r, cols)}\n${new Date(a).toLocaleDateString()} to ${open ? "today" : new Date(b).toLocaleDateString()}`}>
            <span className="cgl">{typeof r.number === "number" && <span className="cnum">#{r.number}</span>}<span className="ct">{titleOf(r, cols)}</span></span>
            <div className="cgtrack"><i className={`cgbar ${typeof r.column === "string" ? r.column : choice ? `tb-c${(choice.choices ?? []).findIndex((c) => c.id === r[choice.key])}` : ""}`} style={{ left: x(a), width: `calc(${x(b)} - ${x(a)} + 3px)` }} /></div>
          </div>
        ))}
      </div>
      {compact && spans.length > list.length && <p className="tb-more">and {spans.length - list.length} more</p>}
    </div>
  );
}

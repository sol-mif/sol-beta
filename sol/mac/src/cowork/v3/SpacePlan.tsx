// Cowork v3, slice 2 (fr-30, #555): a project's Space and Plan. The space at the left holds loose things from anyone,
// untimed (a thought dropped in the field, a file, a link); the plan at the right holds things with a state or a date.
// One gesture: drag a loose thing across the line and the plan raises its lane ("drop to plan · Sol picks a date"); let
// go and it is an item at once, its date guessed (from where it was dropped, from what it says, or next Friday), its
// date a chip you can change, and Undo in the row for 8 s. List, board, calendar and timeline are one segmented pick
// over the same items; a board column or a calendar day takes a drop too (its state, its day). Every row carries the
// two marks: whose face, where it lives.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Body } from "../bits";
import { Glyph } from "../Room";
import type { Team } from "../useTeam";
import { NeedsChip } from "./NeedsMe";
import { UndoRing } from "./Front";
import { useV3, write, STATE_WORD, PLACE_WORD, placeGlyph, kindGlyph, fmtDate, addDays, dayDiff, dow, dayNum, firstName,
  T_LOOSE, T_ITEM, type Item, type Loose, type State } from "./front-store";
import "./front.css";

type View = "list" | "board" | "calendar" | "timeline";
const VIEWS: { k: View; w: string }[] = [{ k: "list", w: "List" }, { k: "board", w: "Board" }, { k: "calendar", w: "Calendar" }, { k: "timeline", w: "Timeline" }];
const COLS: { k: "open" | "doing" | "review" | "done"; w: string }[] = [{ k: "open", w: "Open" }, { k: "doing", w: "In progress" }, { k: "review", w: "Waiting on a read" }, { k: "done", w: "Done" }];
const VIEW_KEY = "sol.cowork.v3.view";
type Made = { item: string; token: string; until: number; why: string };
/** where a drop lands on the plan: the lane, a board column, a calendar day */
type Target = { state?: State; date?: string };

export function SpacePlan({ team, project, onFront }: { team: Team; project: string; onFront: () => void }) {
  const { plan, count } = useV3(team.ask, project);
  const me = team.me || plan?.me || "";
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) as View) || "list");
  const pick = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private */ } };
  const [carrying, setCarrying] = useState<"" | "loose" | "item">("");
  const [made, setMade] = useState<Made | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { if (!made) return; const t = window.setTimeout(() => setMade(null), Math.max(0, made.until - Date.now())); return () => window.clearTimeout(t); }, [made]);
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(""), 4000); return () => window.clearTimeout(t); }, [note]);
  const items = plan?.items ?? [], loose = plan?.loose ?? [];
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const today = plan?.today ?? new Date().toISOString().slice(0, 10);

  const toItem = async (looseId: string, target?: Target) => {
    const r = await write<{ item: Item; undo: string; why: string }>(project, "toItem", { loose: looseId, ...(target ? { target } : {}) });
    if (r.error || !r.result) { setNote(r.error ?? "it did not land"); return; }
    setMade({ item: r.result.item.id, token: r.result.undo, until: Date.now() + 8000, why: r.result.why });
  };
  const undoMade = async () => { if (!made) return; const m = made; setMade(null); await write(project, "undo", { token: m.token }); };
  const move = (item: string, ch: { state?: State; date?: string | null }) => void write(project, "move", { item, ...ch }).then((r) => r.error && setNote(r.error));
  const drop = (title: string) => void write(project, "drop", { title }).then((r) => r.error && setNote(r.error));

  // a drop on the plan: a loose thing becomes an item (the target's state or day), an item moves there
  const landOn = (target?: Target) => ({
    onDragOver: (ev: React.DragEvent) => {
      const t = [...ev.dataTransfer.types];
      if (!t.includes(T_LOOSE) && !(target && t.includes(T_ITEM))) return;
      ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = "move"; (ev.currentTarget as HTMLElement).classList.add("hot");
    },
    onDragLeave: (ev: React.DragEvent) => { if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null)) (ev.currentTarget as HTMLElement).classList.remove("hot"); },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault(); ev.stopPropagation(); (ev.currentTarget as HTMLElement).classList.remove("hot"); setCarrying("");
      const l = ev.dataTransfer.getData(T_LOOSE), it = ev.dataTransfer.getData(T_ITEM);
      if (l) void toItem(l, target);
      else if (it && target) move(it, target.state ? { state: target.state } : { date: target.date ?? null });
    },
  });

  return (
    <div className="v3 v3-sp" data-v3="plan" data-project={project}>
      <div className="v3-sp-head">
        <button className="v3-back" onClick={onFront} title="all projects">All projects</button>
        <h1>{plan?.name ?? project}</h1>
        <span className="kind">Space and Plan</span>
        <span className="sp" />
        <NeedsChip count={count} onOpen={onFront} />
      </div>
      <div className={`v3-surface ${carrying ? `carrying ${carrying}` : ""}`} onDragEnd={() => setCarrying("")}>
        <section className="v3-space">
          <div className="v3-h"><h2>Space</h2><p>Loose things from anyone, untimed. Drag one onto the plan.</p></div>
          <div className="v3-loose-list">
            {loose.map((l, i) => <LooseCard key={l.id} l={l} me={me} i={i} onStart={() => setCarrying("loose")} />)}
            {loose.length === 0 && <p className="v3-none">Nothing loose. A thought dropped below lands here.</p>}
          </div>
          <DropField onDrop={drop} />
        </section>
        <div className="v3-line" aria-hidden="true" />
        <section className="v3-plan">
          <div className="v3-h v3-plan-h">
            <div><h2>Plan</h2><p>Things with a state or a date.</p></div>
            <Segmented value={view} onPick={pick} />
          </div>
          <div className="v3-lane" {...landOn()} data-lane>
            <span className="plus" aria-hidden="true">+</span><span><b>drop to plan</b> · Sol picks a date</span>
          </div>
          {note && <p className="v3-note" role="status">{note}</p>}
          <div className="v3-view" data-view={view} {...(view === "list" || view === "timeline" ? landOn() : {})}>
            {items.length === 0 && view !== "calendar" && <p className="v3-none">Nothing planned yet. Drag a loose thing onto it.</p>}
            {view === "list" && plan && plan.views.list.map((id) => byId.get(id)).filter(Boolean).map((it) => (
              <Row key={it!.id} it={it!} me={me} made={made?.item === it!.id ? made : null} onUndo={undoMade} onDate={(d) => move(it!.id, { date: d })} onStart={() => setCarrying("item")} />))}
            {view === "board" && plan && <div className="v3-board">
              {COLS.map((c) => (
                <div key={c.k} className="v3-col" data-col={c.k} {...landOn({ state: c.k })}>
                  <div className="ch">{c.w}<small>{plan.views.board[c.k].length}</small></div>
                  {plan.views.board[c.k].map((id) => byId.get(id)).filter(Boolean).map((it) => (
                    <BoardCard key={it!.id} it={it!} me={me} made={made?.item === it!.id ? made : null} onUndo={undoMade} onStart={() => setCarrying("item")} />))}
                </div>
              ))}
            </div>}
            {view === "calendar" && plan && <Calendar today={today} items={items} byDay={plan.views.calendar.days} undated={plan.views.calendar.undated} byId={byId} me={me}
              land={(date) => landOn({ date })} onStart={() => setCarrying("item")} />}
            {view === "timeline" && plan && <Timeline today={today} rows={plan.views.timeline.rows} undated={plan.views.timeline.undated} byId={byId} me={me} />}
          </div>
        </section>
      </div>
    </div>
  );
}

/** the two marks every thing carries: whose (their face) and where it lives (its place's glyph) */
function Marks({ whose, place, me, size = 16 }: { whose: string; place: string; me: string; size?: number }) {
  return <>
    <Body login={whose || me} size={size} title={firstName(whose, me)} />
    <span className="where" title={`lives in ${PLACE_WORD[place] ?? place}`}><Glyph kind={placeGlyph(place)} size={size - 2} /></span>
  </>;
}

function LooseCard({ l, me, i, onStart }: { l: Loose; me: string; i: number; onStart: () => void }) {
  return (
    <div className={`v3-loose k-${l.kind}`} data-loose={l.id} draggable style={{ animationDelay: `${60 + i * 40}ms` }}
      onDragStart={(ev) => { ev.dataTransfer.setData(T_LOOSE, l.id); ev.dataTransfer.setData("text/plain", l.title); ev.dataTransfer.effectAllowed = "move"; onStart(); }}
      title="drag it onto the plan">
      <div className="body"><Glyph kind={kindGlyph(l.kind)} size={18} /><span className="t">{l.title}</span>{l.meta && <small>{l.meta}</small>}</div>
      <div className="foot"><Body login={l.whose || me} size={16} /><span>{firstName(l.whose, me) === "you" ? "You" : l.whose}</span>
        <span className="sp" /><span className="where" title={`lives in ${PLACE_WORD[l.place] ?? l.place}`}><Glyph kind={placeGlyph(l.place)} size={14} /></span></div>
    </div>
  );
}

function DropField({ onDrop }: { onDrop: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <label className="v3-drop">
      <span className="plus" aria-hidden="true">+</span>
      <input value={v} placeholder="Drop a thought" spellCheck={false} onChange={(ev) => setV(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === "Enter" && v.trim()) { onDrop(v.trim()); setV(""); } if (ev.key === "Escape") (ev.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

/** the one segmented pick, a pill sliding under the chosen one */
function Segmented({ value, onPick }: { value: View; onPick: (v: View) => void }) {
  const box = useRef<HTMLDivElement>(null), pill = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const b = box.current?.querySelector<HTMLButtonElement>(`button[data-k="${value}"]`), p = pill.current;
    if (b && p) { p.style.transform = `translateX(${b.offsetLeft - 2}px)`; p.style.width = `${b.offsetWidth}px`; }
  }, [value]);
  return (
    <div className="v3-seg" ref={box} role="tablist" aria-label="how the plan shows">
      <span className="v3-seg-pill" ref={pill} aria-hidden="true" />
      {VIEWS.map((x) => <button key={x.k} data-k={x.k} role="tab" aria-selected={x.k === value} className={x.k === value ? "on" : ""} onClick={() => onPick(x.k)}>{x.w}</button>)}
    </div>
  );
}

const itemDrag = (it: Item, onStart: () => void) => ({
  draggable: true,
  onDragStart: (ev: React.DragEvent) => { ev.dataTransfer.setData(T_ITEM, it.id); ev.dataTransfer.setData("text/plain", it.title); ev.dataTransfer.effectAllowed = "move"; onStart(); },
});

function Row({ it, me, made, onUndo, onDate, onStart }: { it: Item; me: string; made: Made | null; onUndo: () => void; onDate: (d: string | null) => void; onStart: () => void }) {
  const needs = (it.state === "review" || !!it.handedBy) && it.whose.toLowerCase() === me.toLowerCase();
  return (
    <div className={`v3-row s-${it.state} ${needs ? "needs" : ""} ${made ? "made" : ""}`} data-item={it.id} {...itemDrag(it, onStart)}>
      <Body login={it.whose || me} size={18} title={firstName(it.whose, me)} />
      <span className="t">{it.title}{made && <small className="v3-why">{made.why}</small>}</span>
      <DateChip date={it.date} onDate={onDate} />
      {made ? <UndoRing until={made.until} onUndo={onUndo} /> : <span className="st">{it.handedBy && needs ? `from ${it.handedBy}` : STATE_WORD[it.state]}</span>}
      <span className="where" title={`lives in ${PLACE_WORD[it.place] ?? it.place}`}><Glyph kind={placeGlyph(it.place)} size={16} /></span>
    </div>
  );
}

/** the date as a chip; pressed, it is the day field in place, no menu */
function DateChip({ date, onDate }: { date?: string; onDate: (d: string | null) => void }) {
  const [edit, setEdit] = useState(false);
  if (edit) return <input className="v3-date edit" type="date" autoFocus defaultValue={date ?? ""} onClick={(ev) => ev.stopPropagation()}
    onBlur={(ev) => { setEdit(false); const v = ev.target.value || null; if (v !== (date ?? null)) onDate(v); }}
    onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setEdit(false); }} />;
  return <button className={`v3-date ${date ? "" : "none"}`} onClick={(ev) => { ev.stopPropagation(); setEdit(true); }} title="change the date">{fmtDate(date)}</button>;
}

function BoardCard({ it, me, made, onUndo, onStart }: { it: Item; me: string; made: Made | null; onUndo: () => void; onStart: () => void }) {
  return (
    <div className={`v3-bcard s-${it.state} ${made ? "made" : ""}`} data-item={it.id} {...itemDrag(it, onStart)}>
      <span className="t">{it.title}</span>
      <span className="m"><Marks whose={it.whose} place={it.place} me={me} size={16} /><span className="d">{it.date ? fmtDate(it.date) : ""}{it.state === "blocked" ? " · blocked" : ""}</span></span>
      {made && <UndoRing until={made.until} onUndo={onUndo} />}
    </div>
  );
}

/** three weeks from this week's Monday; a day takes a drop (a loose thing made an item on that day, an item moved to it) */
function Calendar({ today, byDay, undated, byId, me, land, onStart }: { today: string; items: Item[]; byDay: { day: string; ids: string[] }[]; undated: string[];
  byId: Map<string, Item>; me: string; land: (date: string) => object; onStart: () => void }) {
  const monday = addDays(today, -((dow(today) + 6) % 7));
  const days = Array.from({ length: 21 }, (_, i) => addDays(monday, i));
  const on = new Map(byDay.map((d) => [d.day, d.ids] as const));
  const later = byDay.filter((d) => d.day > days[days.length - 1] || d.day < days[0]);
  return (
    <div className="v3-cal">
      <div className="v3-cal-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="wd">{w}</div>)}
        {days.map((d) => (
          <div key={d} className={`v3-day ${d === today ? "today" : ""} ${dow(d) === 0 || dow(d) === 6 ? "wkend" : ""} ${d < today ? "past" : ""}`} data-day={d} {...land(d)}>
            <span className="n">{dayNum(d)}</span>
            {(on.get(d) ?? []).map((id) => byId.get(id)).filter(Boolean).map((it) => (
              <span key={it!.id} className={`v3-cchip s-${it!.state}`} data-item={it!.id} {...itemDrag(it!, onStart)} title={it!.title}><Body login={it!.whose || me} size={12} />{it!.title}</span>))}
          </div>
        ))}
      </div>
      {(later.length > 0 || undated.length > 0) && <div className="v3-cal-off">
        {later.flatMap((d) => d.ids).map((id) => byId.get(id)).filter(Boolean).map((it) => <span key={it!.id} className="v3-cchip" data-item={it!.id}><Body login={it!.whose || me} size={12} />{it!.title} · {fmtDate(it!.date)}</span>)}
        {undated.map((id) => byId.get(id)).filter(Boolean).map((it) => <span key={it!.id} className="v3-cchip none" data-item={it!.id}><Body login={it!.whose || me} size={12} />{it!.title} · no date</span>)}
      </div>}
    </div>
  );
}

/** each dated item as a bar from when it was made (or today) to its day, over the weeks they span */
function Timeline({ today, rows, undated, byId, me }: { today: string; rows: { id: string; start: string; end: string }[]; undated: string[]; byId: Map<string, Item>; me: string }) {
  const lo = [today, ...rows.map((r) => r.start)].sort()[0];
  const ends = [addDays(today, 14), ...rows.map((r) => r.end)].sort(), hi = ends[ends.length - 1];
  const span = Math.max(1, dayDiff(lo, hi) + 1);
  const pct = (d: string) => `${(dayDiff(lo, d) / span) * 100}%`;
  return (
    <div className="v3-tl">
      <div className="v3-tl-today" style={{ left: `calc(38% + 16px + (100% - 38% - 22px) * ${dayDiff(lo, today) / span})` }}><span>today</span></div>
      {rows.map((r) => byId.get(r.id) && (
        <div key={r.id} className={`v3-tl-row s-${byId.get(r.id)!.state}`} data-item={r.id}>
          <span className="lbl"><Marks whose={byId.get(r.id)!.whose} place={byId.get(r.id)!.place} me={me} size={14} /><span className="t">{byId.get(r.id)!.title}</span></span>
          <span className="track"><span className="bar" style={{ left: pct(r.start), width: `max(6px, calc(${pct(r.end)} - ${pct(r.start)} + ${100 / span}%))` }} title={`${fmtDate(r.start)} to ${fmtDate(r.end)}`} /></span>
        </div>
      ))}
      {undated.map((id) => byId.get(id)).filter(Boolean).map((it) => (
        <div key={it!.id} className="v3-tl-row none" data-item={it!.id}><span className="lbl"><Marks whose={it!.whose} place={it!.place} me={me} size={14} /><span className="t">{it!.title}</span></span><span className="track"><small>no date</small></span></div>
      ))}
    </div>
  );
}

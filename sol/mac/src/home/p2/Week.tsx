// The week (#692, pieces/main.mjs, ahead.mjs, calendar.mjs, moves.mjs Pull), slice D of the pass 2 build: his real
// calendar (pass 1's st.events, read through sol/mac/calendar on the stand-in), seven days from today, today marked; his
// events solid, Sol's proposals dashed (kit Ink, dash) with where they came from in a small line, keep · move · no on a
// click. Pull: drag a sticky (from the stickies column) or a dashed block onto a day and hour to schedule it; hold it
// over a slot and one line says what would shift (home.proposal.try), changing nothing until let go.
// The calendar's first switch-on (pieces/firstrun2.mjs) lives here too, built around the Mac's own permission prompt.
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { Metas } from "../meta";
import type { Home2Api, Proposal } from "./pass2";
import { Button, Glass, Ink } from "../../kit";
import { CURVE } from "../../kit/tokens";
import "./week.css";

export const meta = {
  Week: {
    job: "the week: his events solid, Sol's proposals dashed until kept, a sticky pulled onto a day",
    flow: "know",
    states: ["the week", "a proposal held open", "moving a proposal", "pulling: a what-if line", "the week after (→)", "narrow: three days"],
    keys: [
      { press: "click a dashed block", does: "keep · move · no (home.proposal)", goal: "answer" },
      { press: "drag a sticky or a dashed block onto a day and hour", does: "schedules it there (home.move pull)", goal: "know" },
      { press: "hold it over a slot", does: "one line: what would shift (home.proposal.try)" },
      { press: "← →", does: "the week before, the week after" },
      { press: "T", does: "back to this week" },
      { press: "Esc", does: "closes the card, or stops a move" },
    ],
    listens: ["home.state › events, sources, proposals, scheduled"],
  },
  CalendarSwitch: {
    job: "the calendar's first switch-on, around the Mac's own permission prompt",
    flow: "meet",
    states: ["off: show your calendar here", "asking: the Mac will ask, press Allow", "denied: what to do in System Settings", "denied: open it yourself"],
    keys: [
      { press: "click show my calendar", does: "switches the calendar on (home.source.set); the Mac asks once", goal: "meet" },
      { press: "click open that setting", does: "opens Privacy › Calendars through the engine (home.source.open), else says where" },
      { press: "click try again", does: "asks again after System Settings" },
    ],
    listens: ["home.state › sources", "home.source.status"],
  },
} satisfies Metas;

// ---- shapes the week reads beyond pass2.ts's (the stand-in's week.mjs adds them) ----
type Ev = { id: string; title: string; start: string; end: string; allDay: boolean; location?: string; calendar?: string };
type Prop = Proposal & { line?: string; sticky?: string; on?: "calendar" | "here"; note?: string; why?: string; dial?: string };
type Pulled = { sticky: string; title: string; folder: string; start: string; end: string };
type Item = { id: string; title: string; s: Date; e: Date; k: "ev" | "prop" | "kept" | "pulled" | "ghost"; sub?: string; p?: Prop; lane?: number; lanes?: number };
type WhatIf = { line: string; start: string; shifts: { id: string; to: string; end?: string }[] };

const H0 = 8, H1 = 22, DAY = 864e5;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** what is being dragged onto the week: a sticky from the column, or a dashed block. dataTransfer is unreadable during a
 *  drag, so the drag source says it here. */
let dragging: { id: string; title: string; mins: number } | null = null;
/** the stickies column calls this on a sticky's dragstart, so the sticky can be pulled onto a day */
export function pullStart(ev: DragEvent, id: string, title: string, mins = 60) {
  dragging = { id, title, mins };
  ev.dataTransfer.setData("text/sol-pull", id);
  ev.dataTransfer.effectAllowed = "move";
}
export function pullEnd() { dragging = null; }

/** side by side when items overlap in a day */
function lanes(items: Item[]) {
  const sorted = [...items].sort((a, b) => +a.s - +b.s || +b.e - +a.e);
  let group: Item[] = [], end = 0;
  const flush = () => { const n = Math.max(1, ...group.map((x) => (x.lane ?? 0) + 1)); group.forEach((x) => (x.lanes = n)); group = []; };
  for (const it of sorted) {
    if (group.length && +it.s >= end) flush();
    const used = new Set(group.filter((x) => +x.e > +it.s).map((x) => x.lane));
    let l = 0; while (used.has(l)) l++;
    it.lane = l; group.push(it); end = Math.max(end, +it.e);
  }
  flush();
  return sorted;
}

export function Week({ h }: { h: Home2Api }) {
  const st = h.st;
  const src = st?.sources?.find((s) => s.id === "calendar");
  const [offset, setOffset] = useState(0);
  const [held, setHeld] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [hover, setHover] = useState<{ start: string; title: string; mins: number } | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIf | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const hold = useRef<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(t); }, []);
  if (!st || !src) return null;
  if (src.health !== "on") return <CalendarSwitch h={h} />;

  const props = ((st.proposals ?? []) as Prop[]);
  const pulled = (((st as unknown as { scheduled?: Pulled[] }).scheduled) ?? []);
  const events = (st.events ?? []) as Ev[];
  const now = new Date(), first = new Date(dayStart(now).getTime() + offset * 7 * DAY);
  const days = Array.from({ length: 7 }, (_, i) => new Date(first.getTime() + i * DAY));
  const heldP = props.find((p) => p.id === held) ?? null;

  const items = (d: Date) => {
    const a = d.getTime(), b = a + DAY, out: Item[] = [];
    const inDay = (s: Date) => +s >= a && +s < b;
    for (const e of events) { const s = new Date(e.start); if (!e.allDay && inDay(s)) out.push({ id: e.id, title: e.title, s, e: new Date(e.end), k: "ev" }); }
    for (const p of props) {
      if (!p.start || (p.kind === "sticky" && p.state !== "proposed")) continue;
      const s = new Date(p.start), e = p.end ? new Date(p.end) : new Date(+s + 3600e3);
      const shift = whatIf?.shifts.find((x) => x.id === p.id && x.id !== dragging?.id);
      const s2 = shift ? new Date(shift.to) : s, e2 = shift ? new Date(shift.end ?? +new Date(shift.to) + (+e - +s)) : e;
      if (inDay(s2)) out.push({ id: p.id, title: p.title, s: s2, e: e2, k: p.state === "kept" ? "kept" : "prop", sub: p.state === "kept" ? (p.on === "here" ? "kept in Sol, not on your calendar" : "on your calendar") : p.line, p });
    }
    for (const r of pulled) { const s = new Date(r.start); if (inDay(s)) out.push({ id: r.sticky, title: r.title, s, e: new Date(r.end), k: "pulled", sub: "pulled here" }); }
    if (hover) { const s = new Date(whatIf?.start ?? hover.start); if (inDay(s)) out.push({ id: "ghost", title: hover.title, s, e: new Date(+s + hover.mins * 60e3), k: "ghost", sub: "let go to put it here" }); }
    return lanes(out.filter((x) => +x.e > a + H0 * 3600e3 && +x.s < a + H1 * 3600e3)); // what falls in the hours drawn
  };
  const allDay = (d: Date) => events.filter((e) => e.allDay && dayStart(new Date(e.start)).getTime() === d.getTime());

  // ---- answering a proposal ----
  const answer = async (p: Prop, o: { keep?: true; decline?: true; move?: string }) => {
    setHeld(null); setMoving(null);
    const r = await h.ask<{ type: string; proposal?: Prop; error?: string }>({ type: "home.proposal", id: p.id, ...o });
    if (r.error) setSaid(r.error);
    else if (o.decline) setSaid(`gone; Sol learned: ${(r.proposal as Prop & { learned?: { line: string } })?.learned?.line ?? "not this"}`);
    else if (r.proposal?.kind === "block") setSaid(r.proposal.on === "here" ? `${p.title}: kept in Sol. Sol reads your calendar but cannot write to it yet` : `${p.title}: on your calendar`);
  };

  // ---- Pull: where on a day the pointer is, rounded to the half hour ----
  const slotAt = (ev: DragEvent | MouseEvent, d: Date) => {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const f = Math.min(Math.max((ev.clientY - box.top) / box.height, 0), 0.999);
    const mins = Math.round((H0 + f * (H1 - H0)) * 2) * 30;
    return new Date(d.getTime() + mins * 60e3).toISOString();
  };
  const clearPull = () => { if (hold.current) window.clearTimeout(hold.current); hold.current = null; setHover(null); setWhatIf(null); };
  const over = (ev: DragEvent, d: Date) => {
    if (!dragging) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = "move";
    const start = slotAt(ev, d);
    if (hover?.start === start) return;
    const drag = dragging;
    setHover({ start, title: drag.title, mins: drag.mins }); setWhatIf(null);
    if (hold.current) window.clearTimeout(hold.current);
    hold.current = window.setTimeout(async () => {
      const r = await h.ask<{ type: string; line?: string; start?: string; shifts?: WhatIf["shifts"] }>({ type: "home.proposal.try", target: drag.id, start });
      if (r.line && dragging?.id === drag.id) setWhatIf({ line: r.line, start: r.start ?? start, shifts: r.shifts ?? [] });
    }, 600);
  };
  const drop = async (ev: DragEvent, d: Date) => {
    if (!dragging) return;
    ev.preventDefault();
    const target = dragging.id, title = dragging.title, start = whatIf?.start ?? slotAt(ev, d);
    dragging = null; clearPull();
    const r = await h.ask<{ type: string; error?: string }>({ type: "home.move", move: "pull", target, start });
    setSaid(r.error ?? `${title}: ${SHORT[new Date(start).getDay()]} ${hm(new Date(start))}`);
  };
  const click = (ev: MouseEvent, d: Date) => {
    const p = props.find((x) => x.id === moving);
    if (p) void answer(p, { move: slotAt(ev, d) });
  };

  const keys = (ev: KeyboardEvent) => {
    if (ev.target !== ev.currentTarget && ev.key !== "Escape") return;
    if (ev.key === "ArrowLeft") setOffset((o) => o - 1);
    else if (ev.key === "ArrowRight") setOffset((o) => o + 1);
    else if (ev.key === "t" || ev.key === "T") setOffset(0);
    else if (ev.key === "Escape") { setHeld(null); setMoving(null); }
    else return;
    ev.preventDefault(); ev.stopPropagation(); // the week keeps its own keys; Home's arrows move focus otherwise
  };
  const range = `${SHORT[days[0].getDay()]} ${days[0].getDate()} – ${SHORT[days[6].getDay()]} ${days[6].getDate()}`;
  const pct = (d: Date) => ((d.getHours() + d.getMinutes() / 60 - H0) / (H1 - H0)) * 100;

  return (
    <section className="p2-tile p2-week wk" data-p2="week" data-moving={moving ? "" : undefined} tabIndex={0} onKeyDown={keys} onDragEnd={() => { pullEnd(); clearPull(); }}>
      <Glass r={CURVE.radius.card} step="card" />
      <header className="wk-k">
        <span className="wk-h">{offset === 0 ? "this week" : offset > 0 ? `in ${offset} week${offset > 1 ? "s" : ""}` : `${-offset} week${offset < -1 ? "s" : ""} ago`}</span>
        <span className="wk-range">{range}</span>
        <span className="wk-src" title={src.why}>read-only · your calendar</span>
        <span className="wk-nav">
          <button className="wk-opt" aria-label="the week before" onClick={() => setOffset((o) => o - 1)}>←</button>
          {offset !== 0 && <button className="wk-opt" onClick={() => setOffset(0)}>today</button>}
          <button className="wk-opt" aria-label="the week after" onClick={() => setOffset((o) => o + 1)}>→</button>
        </span>
      </header>
      <div className="wk-grid" onDragLeave={(ev) => { if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node)) clearPull(); }}>
        <div className="wk-gut">
          <div className="wk-dh" />
          <div className="wk-ad" />
          <div className="wk-hours">{Array.from({ length: H1 - H0 }, (_, i) => <span key={i} style={{ top: `${(i / (H1 - H0)) * 100}%` }}>{H0 + i}</span>)}</div>
        </div>
        {days.map((d, i) => {
          const today = offset === 0 && i === 0;
          return (
            <div key={d.toISOString()} className={`wk-day${today ? " wk-today" : ""}${i >= 3 ? " wk-later" : ""}`} data-day={d.toISOString().slice(0, 10)} data-part={`week › ${SHORT[d.getDay()]} ${d.getDate()}`}>
              <div className="wk-dh"><b>{SHORT[d.getDay()]}</b> {d.getDate()}</div>
              <div className="wk-ad">{allDay(d).map((e) => <span key={e.id} className="wk-all" title={e.title}>{e.title}</span>)}</div>
              <div className="wk-col" data-col={d.toISOString().slice(0, 10)} onDragOver={(ev) => over(ev, d)} onDrop={(ev) => void drop(ev, d)} onClick={(ev) => click(ev, d)}>
                {today && <i className="wk-now" style={{ top: `${Math.min(Math.max(pct(now), 0), 100)}%` }} />}
                {items(d).map((it) => {
                  const top = Math.max(pct(it.s), 0), bottom = Math.min(pct(it.e) || 100, 100);
                  const style = { top: `${top}%`, height: `${Math.max(bottom - top, 100 / (H1 - H0) / 2)}%`, left: `${((it.lane ?? 0) / (it.lanes ?? 1)) * 100}%`, width: `${100 / (it.lanes ?? 1)}%` };
                  const p = it.p, open = !!p && p.state === "proposed";
                  return (
                    <div key={it.k + it.id} className={`wk-it wk-${it.k}${held === it.id ? " held" : ""}${moving === it.id ? " moving" : ""}`} style={style} data-item={it.id} data-kind={it.k}
                      title={`${hm(it.s)} ${it.title}${it.sub ? ` · ${it.sub}` : ""}`}
                      draggable={!!p}
                      onDragStart={p ? (ev) => { dragging = { id: p.id, title: p.title, mins: Math.round((+it.e - +it.s) / 60e3) }; ev.dataTransfer.setData("text/sol-pull", p.id); ev.dataTransfer.effectAllowed = "move"; setHeld(null); } : undefined}
                      onClick={open ? (ev) => { ev.stopPropagation(); if (!moving) setHeld(held === it.id ? null : it.id); } : undefined}>
                      <span className="wk-w"><span className="wk-t">{hm(it.s)}</span> {it.k === "prop" || it.k === "ghost" ? <Ink k="dash">{it.title}</Ink> : it.title}</span>
                      {it.sub && <small className="wk-sub">{it.sub}</small>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {heldP && (
        <div className="wk-card" data-card={heldP.id} role="dialog" aria-label={heldP.title}>
          <Glass r={CURVE.radius.card} step="pop" blur={24} />
          <b><Ink k="dash">{heldP.title}</Ink></b>
          <small className="wk-sub">{heldP.line}{heldP.start ? ` · ${SHORT[new Date(heldP.start).getDay()]} ${hm(new Date(heldP.start))}${heldP.end ? `–${hm(new Date(heldP.end))}` : ""}` : ""}</small>
          {heldP.kind === "sticky" && <small className="wk-sub">{heldP.sticky ? "already being made, as a draft" : "keep, and Sol starts it"}</small>}
          <span className="wk-opts">
            <button className="wk-opt" onClick={() => void answer(heldP, { keep: true })}>keep</button>
            {heldP.kind === "block" && <button className="wk-opt" onClick={() => { setMoving(heldP.id); setHeld(null); }}>move</button>}
            <button className="wk-opt" onClick={() => void answer(heldP, { decline: true })}>no</button>
          </span>
        </div>
      )}
      {(whatIf || moving || said) && (
        <p className={`wk-foot${whatIf ? " wk-whatif" : ""}`} aria-live="polite">
          {whatIf ? <Ink k="dash">what if: {whatIf.line}</Ink> : moving ? "click a day and hour to move it there · Esc leaves it" : said}
          {!whatIf && !moving && said && <button className="wk-opt" onClick={() => setSaid(null)}>ok</button>}
        </p>
      )}
    </section>
  );
}

/** the calendar's first switch-on: off, asking (the Mac's own prompt), denied (what to do), then the week */
export function CalendarSwitch({ h }: { h: Home2Api }) {
  const src = h.st?.sources?.find((s) => s.id === "calendar");
  const [asking, setAsking] = useState(false);
  const [perm, setPerm] = useState<string | null>(null);
  const [byHand, setByHand] = useState(false);
  useEffect(() => {
    if (!src || src.health === "on") return;
    let live = true;
    void h.ask<{ status?: string }>({ type: "home.source.status" }).then((r) => { if (live) setPerm(r.status ?? null); });
    return () => { live = false; };
  }, [src?.health, src?.why]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src || src.health === "on") return null;
  const on = async () => {
    setAsking(true); setByHand(false);
    await h.ask({ type: "home.source.set", id: "calendar", health: "on" });
    const r = await h.ask<{ status?: string }>({ type: "home.source.status" });
    setPerm(r.status ?? null); setAsking(false);
  };
  const open = async () => { const r = await h.ask<{ opened?: boolean }>({ type: "home.source.open" }); if (!r.opened) setByHand(true); };
  const phase = asking || (src.health === "look" && /asking/i.test(src.why ?? "")) ? "asking"
    : perm === "denied" || perm === "restricted" || /denied|not allowed|refused/i.test(src.why ?? "") ? "denied" : "off";
  return (
    <section className="p2-tile p2-week wk wk-switch" data-p2="week" data-phase={phase}>
      <Glass r={CURVE.radius.card} step="card" />
      <header className="wk-k"><span className="wk-h">the week</span></header>
      {phase === "off" && <div className="wk-ask">
        <p className="wk-line">Show your calendar here.</p>
        <small className="wk-sub">Sol reads it and works ahead of what is coming. It never writes to your calendar unless you keep something.</small>
        <span className="wk-go"><Button h={32} acts onClick={() => void on()}>show my calendar</Button></span>
      </div>}
      {phase === "asking" && <div className="wk-ask">
        <p className="wk-line">Your Mac will ask if Sol may see your calendar.</p>
        <small className="wk-sub">Press <b>Allow</b> in the Mac's window. This waits for you.</small>
      </div>}
      {phase === "denied" && <div className="wk-ask">
        <p className="wk-line">Your Mac said no to the calendar.</p>
        <small className={`wk-sub${byHand ? " wk-plain" : ""}`}>To change it: <b>System Settings › Privacy &amp; Security › Calendars</b>, then turn <b>Sol</b> on.{byHand && " Sol could not open it from here, so open it yourself."}</small>
        <span className="wk-go">
          {!byHand && <Button h={32} acts onClick={() => void open()}>open that setting</Button>}
          <button className="wk-opt" onClick={() => void on()}>try again</button>
        </span>
      </div>}
    </section>
  );
}

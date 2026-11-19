// The week as a Home block (#692 suite step 2, suite.html "week · by time"): pass 2's Week drawn inside the frame. Seven
// days from today in its run's body (shape-week.mjs): his events solid, its proposals dashed (kit Ink, dash) with the
// date each works ahead of, what falls past the week in one line. Wide, seven columns; narrow (the 480 Home, the
// stickies column), the days as rows. Moves: press a dashed block for keep · no; drag a sticky (or any block) onto a
// day, and it lands at that day's first free evening hour; "again" runs it again.
import { useState, type DragEvent } from "react";
import { Ink } from "../../../kit";
import type { Metas } from "../../meta";
import { say } from "./lift";
import type { ShapeProps } from "./shapes";
import "./shape-week.css";

export const meta = {
  WeekShape: {
    job: "the week inside a Home block: seven days, his events solid, its proposals dashed until kept",
    flow: "know",
    states: ["its run laying it out", "seven days (wide)", "the days as rows (narrow)", "a dashed block held: keep · no", "a sticky over a day", "kept"],
    keys: [
      { press: "press a dashed block", does: "keep · no under it (home.week.block.keep / no)" },
      { press: "drag a sticky onto a day", does: "puts it at the day's first free evening hour (home.week.block.pull)" },
      { press: "again", does: "its run lays the week out again (home.block.run)" },
    ],
    listens: ["home.state › blocks (its body)"],
  },
} satisfies Metas;

export type WeekItem = { id: string; at: string | null; end?: string; title: string; kind: "event" | "date" | "proposal" | "kept" | "pulled"; folder?: string; why?: string; proposal?: string; sticky?: string };
export type WeekBody = { from: string; days: { date: string; items: WeekItem[] }[]; ahead: { date: string; title: string; folder?: string }[]; by?: string; ran?: string };

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** a YYYY-MM-DD as a local day */
export const asDay = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const dayName = (k: string) => { const d = asDay(k); return `${SHORT[d.getDay()]} ${d.getDate()}`; };
const later = (k: string) => { const d = asDay(k); return `${MON[d.getMonth()]} ${d.getDate()}`; };
/** the range in its head: "Sun 8 – Sat 14" */
export const rangeOf = (w: WeekBody) => w.days.length ? `${dayName(w.days[0].date)} – ${dayName(w.days[w.days.length - 1].date)}` : "";

export function WeekShape({ b, r, h }: ShapeProps) {
  const w = b.body as WeekBody | null;
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!w?.days) return <p className="pc-step" data-wb-running>its run: {r?.run ?? "laying the week out"}…</p>;

  const ask = async (type: string, o: object) => {
    const res = await h.ask<{ said?: string; error?: string }>({ type, id: b.id, ...o });
    say(res.error ?? res.said ?? "");
  };
  const keep = (it: WeekItem) => { setHeld(null); void ask("home.week.block.keep", { item: it.id }); };
  const no = (it: WeekItem) => { setHeld(null); void ask("home.week.block.no", { item: it.id }); };
  const dragged = (e: DragEvent) => e.dataTransfer.types.includes("text/sol-sticky") || e.dataTransfer.types.includes("text/sol-pull");
  const onOver = (e: DragEvent, day: string) => { if (!dragged(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== day) { setOver(day); say(`let go: on ${dayName(day)}, at its first free evening hour`); } };
  const onDrop = (e: DragEvent, day: string) => {
    const id = e.dataTransfer.getData("text/sol-sticky") || e.dataTransfer.getData("text/sol-pull");
    setOver(null);
    if (!id || id === b.id) return;
    e.preventDefault(); e.stopPropagation();
    void ask("home.week.block.pull", { sticky: id, day });
  };
  const today = w.days[0]?.date;
  const n = w.days.reduce((a, d) => a + d.items.filter((x) => x.kind === "proposal").length, 0);

  return (
    <div className="wb" data-pc-inside="week" onPointerDown={(e) => { if ((e.target as Element).closest(".wb-it, .wb-day")) e.stopPropagation(); }}>
      <div className="wb-head">
        <span className="wb-range">{rangeOf(w)}</span>
        <span className="wb-what">{n ? `${n} dashed: keep what you want` : "nothing dashed"}{w.by ? ` · by ${w.by}` : ""}</span>
        <button type="button" className="pc-act quiet" data-wb-again disabled={b.state === "running"} onClick={(e) => { e.stopPropagation(); h.send({ type: "home.block.run", id: b.id }); say("its run lays the week out again"); }}>{b.state === "running" ? "laying out…" : "again"}</button>
      </div>
      <div className="wb-days">
        {w.days.map((d) => (
          <div key={d.date} className={`wb-day${d.date === today ? " today" : ""}${over === d.date ? " over" : ""}`} data-wb-day={d.date}
            onDragOver={(e) => onOver(e, d.date)} onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null); }} onDrop={(e) => onDrop(e, d.date)}>
            <span className="wb-dh"><b>{SHORT[asDay(d.date).getDay()]}</b> {asDay(d.date).getDate()}</span>
            <span className="wb-items">
              {d.items.length === 0 && <span className="wb-free">free</span>}
              {d.items.map((it) => {
                const dash = it.kind === "proposal";
                return (
                  <span key={it.id} className={`wb-it wb-${it.kind}${held === it.id ? " held" : ""}`} data-wb-item={it.id} data-kind={it.kind}
                    title={`${it.at ?? "all day"}${it.end ? `–${it.end}` : ""} · ${it.title}${it.why ? ` · for ${it.why}` : ""}${it.folder ? ` · ${it.folder}` : ""}`}
                    onClick={dash ? (e) => { e.stopPropagation(); setHeld(held === it.id ? null : it.id); } : undefined}>
                    {dash ? <Ink k="dash">{it.at && <span className="wb-t">{it.at}</span>}<span className="wb-w">{it.title}</span></Ink>
                      : <>{it.at && <span className="wb-t">{it.at}</span>}<span className="wb-w">{it.title}</span></>}
                    {held === it.id && (
                      <span className="wb-ask" data-wb-held>
                        {it.why && <small>for {it.why}</small>}
                        <span className="wb-acts">
                          <button type="button" className="pc-act lit" data-wb-keep onClick={(e) => { e.stopPropagation(); keep(it); }}>keep</button>
                          <button type="button" className="pc-act" data-wb-no onClick={(e) => { e.stopPropagation(); no(it); }}>no</button>
                        </span>
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
      {w.ahead?.length > 0 && <p className="wb-later" data-wb-later><b>later</b> {w.ahead.map((a) => `${later(a.date)} ${a.title}`).join(" · ")}</p>}
    </div>
  );
}

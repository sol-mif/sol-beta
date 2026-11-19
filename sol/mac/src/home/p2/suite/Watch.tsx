// The watch's inside (#692 suite step 2, suite.html "watch": one number, over time): the number, its line over time, and
// Marco's line across it. Drag the line (or ↑ ↓ on it) to set when it tells you; it speaks only when the number is past
// it, and says so at once. The frame (Piece.tsx) draws the words, the ring and the shelf; this draws only the number.
// Stand-in: p2/watch.mjs.
import { useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { useSize } from "../../../kit";
import type { Metas } from "../../meta";
import type { ShapeProps } from "./shapes";
import { say } from "./lift";
import "./watch.css";

export const meta = {
  Watch: {
    job: "one number over time (the rent left, the stats grade) and the line where it tells you",
    flow: "know",
    states: ["its run reading the source", "the number under or over its line, quiet", "past the line: it speaks", "dragging the line", "the run failed: the stand-in's reading"],
    keys: [{ press: "drag the line, or ↑ ↓ on it", does: "sets when it tells you (home.watch.line)" }],
    listens: ["home.state › blocks"],
  },
} satisfies Metas;

type Body = { name: string; unit: "$" | "%"; value: number; history: { at: string; v: number }[]; line: number; dir: "under" | "over"; source: string; crossed: boolean; said: string | null; by?: string; failed?: string };

const fmt = (unit: string, v: number) => (unit === "$" ? `$${Math.round(v).toLocaleString("en-US")}` : `${Math.round(v * 10) / 10}%`);

export function Watch({ b, r, h }: ShapeProps) {
  const box = useRef<HTMLDivElement>(null), [w, hh] = useSize(box);
  const [drag, setDrag] = useState<number | null>(null);
  const body = b.body as Body | null;
  const ready = !!body?.history?.length;
  const vs = ready ? [...body!.history.map((x) => x.v), body!.line, drag ?? body!.line] : [0, 1];
  const lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.15 || 1;
  const y0 = lo - pad, y1 = hi + pad;
  const yOf = (v: number) => hh - ((v - y0) / (y1 - y0)) * hh;
  const vOf = (y: number) => y0 + ((hh - y) / hh) * (y1 - y0);
  const step = body?.unit === "$" ? 10 : 1;
  const snap = (v: number) => Math.max(0, Math.round(v / step) * step);
  const setLine = (v: number) => {
    const line = snap(v); setDrag(null);
    if (!body || line === body.line) return;
    h.send({ type: "home.watch.line", id: b.id, line });
    const past = body.dir === "under" ? body.value < line : body.value > line;
    say(past ? `past your line: it tells you now (${fmt(body.unit, body.value)} is ${body.dir} ${fmt(body.unit, line)})` : `it tells you when it goes ${body.dir} ${fmt(body.unit, line)}`);
  };
  const down = (e: RPointerEvent<SVGElement>) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); setDrag(body!.line); };
  const move = (e: RPointerEvent<SVGElement>) => {
    if (drag === null || !box.current) return;
    const top = box.current.getBoundingClientRect().top;
    setDrag(snap(vOf(Math.max(0, Math.min(hh, e.clientY - top)))));
  };
  const up = (e: RPointerEvent<SVGElement>) => { e.stopPropagation(); if (drag !== null) setLine(drag); };
  const key = (e: KeyboardEvent<SVGElement>) => {
    if (!body) return;
    if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setLine(body.line + step); }
    else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setLine(body.line - step); }
  };
  const line = drag ?? body?.line ?? 0;
  const past = !!body && (body.dir === "under" ? body.value < line : body.value > line);
  const pts = ready && w > 0 && hh > 0 ? body!.history.map((x, i) => [(i / Math.max(1, body!.history.length - 1)) * (w - 8) + 4, yOf(x.v)] as const) : [];
  return (
    <div className={`wt${past ? " past" : ""}`} data-pc-inside="watch" data-wt-past={ready ? String(past) : undefined}>
      {ready ? (
        <div className="wt-now">
          <b data-wt-value>{fmt(body!.unit, body!.value)}</b>
          <span>{body!.name}<small>{body!.source}</small></span>
        </div>
      ) : <p className="wt-wait" data-wt-wait>{r ? `its run: ${r.run}` : "its run is reading the source"}…</p>}
      <div ref={box} className="wt-chart" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        {pts.length > 0 && (
          <svg width={w} height={hh} viewBox={`0 0 ${w} ${hh}`} aria-hidden={false} role="img" aria-label={`${body!.name} over time, and your line`}>
            <polyline className="wt-path" points={pts.map((p) => p.join(",")).join(" ")} />
            {pts.map((p, i) => <circle key={i} className={`wt-dot${i === pts.length - 1 ? " now" : ""}`} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2} />)}
            <line className="wt-line" x1={0} x2={w} y1={yOf(line)} y2={yOf(line)} />
            <rect className="wt-grab" data-wt-line={line} x={0} y={yOf(line) - 8} width={w} height={16} tabIndex={0} role="slider"
              aria-label="your line: drag it, or ↑ ↓" aria-valuenow={line} aria-valuetext={fmt(body!.unit, line)}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} onKeyDown={key} />
          </svg>
        )}
      </div>
      {ready && (
        <div className="wt-foot">
          <span className="wt-tag" data-wt-said>{past ? (drag === null ? body!.said ?? `${body!.dir} your line` : "it will tell you now") : `quiet until it goes ${body!.dir} ${fmt(body!.unit, line)}`}</span>
          <span className="wt-by">{body!.failed ?? `${body!.history[0].at} – ${body!.history[body!.history.length - 1].at} · by ${body!.by ?? "its run"}`}</span>
        </div>
      )}
    </div>
  );
}

// The ribbon (#793, plan Part C slice 30; home/whole.md "The ribbon"; the still home/shots/1.png), behind sol.home.whole:
// now to Sunday on one line, nearer days wider. Events are pearl capsules (the big one nacre, the kit's Pearl), Sol's
// proposals dashed until kept, things for you yellow rings, deadlines pins, and each running job a warm thread from
// now to its due point, in lanes under the track. The front card's own mark is tied down to the card by a yellow line
// (home/whole.md "A card"). Geometry in week.ts; the marks are Today.week. home/whole-ribbon.css holds the layout.
import { useRef } from "react";
import { Pearl, jellyBands, useSize } from "../../kit";
import { black, dim, ink, mute, on, pearl, textW } from "../../kit/paint";
import { JELLY, TYPE } from "../../kit/tokens";
import { GEO, daysOf, lanesOf, leftOf, rowsOf, threadOf, tieOf, xOf } from "./week";
import type { Mark } from "./today";
import "../whole-ribbon.css";

const SUN = JELLY.warm[3];
const LABEL = TYPE.label[0];
const lw = (s: string) => textW(s, LABEL);
const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function Ribbon({ week, now, tie, reach }: { week: Mark[]; now: number; tie?: string | null; reach: number }) {
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  const threads = week.flatMap((m) => { const s = threadOf(m, now, w); return s ? [{ m, ...s }] : []; });
  // a thread's name reads after its end dot, or before it where it would pass the ribbon's right edge (Sunday's end)
  const tl = (t: { m: Mark; x1: number }) => leftOf(t.x1, lw(t.m.label), w, 10);
  const lanes = lanesOf(threads.map((t) => tl(t)
    ? { id: t.m.id, x0: Math.min(t.x0, t.x1 - 10 - lw(t.m.label)), x1: t.x1 }
    : { id: t.m.id, x0: t.x0, x1: t.x1 + 10 + lw(t.m.label) }), 8);
  const nLanes = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
  const h = GEO.lane0 + (nLanes - 1) * GEO.lane + GEO.foot;
  const points = week.filter((m) => m.kind !== "thread").flatMap((m) => { const x = xOf(m.at, now, w); return x === null ? [] : [{ m, x }]; });
  const rows = rowsOf(points.map((p) => ({ id: p.m.id, x: leftOf(p.x, lw(p.m.label), w) ? p.x - lw(p.m.label) : p.x, label: p.m.label })), lw);
  const nowX = xOf(now, now, w) ?? 0;
  // the front card's point on the ribbon, tied down to the card (only where the card lies under it)
  const tieX = tieOf(week, tie, now, w, reach);
  return (
    <div className="hr" ref={box} data-ribbon style={{ height: h }} role="img" aria-label={`the week: ${week.map((m) => m.label).join(", ")}`}>
      {w > 0 && <>
        {daysOf(now, w).map((d) => (
          <div key={d.date} className="hr-day" style={{ left: d.x, width: d.w, borderLeftColor: d.today ? "transparent" : undefined }}>
            <span className="hr-dl" style={{ color: mute }}><b style={{ color: d.today ? ink : dim }}>{d.name}</b> {d.date}</span>
          </div>
        ))}
        <div className="hr-track" style={{ top: GEO.track, background: on(0.1) }} />
        {tieX !== null && (
          <div className="hr-tie" data-tie={tie} style={{ left: tieX, top: GEO.track, height: h - GEO.track + GEO.foot, background: SUN }} />
        )}
        {points.map(({ m, x }) => {
          const label = rows.get(m.id) === null ? null : <div key={`${m.id}-l`} className="hr-label" data-left={leftOf(x, lw(m.label), w) || undefined} style={{ left: x, top: rows.get(m.id) === 1 ? GEO.labelHigh : GEO.labelLow, color: m.yours || m.kind === "you" ? SUN : m.kind === "big" ? ink : dim }}>{m.label}</div>;
          const at = { left: x, top: GEO.track };
          const title = `${m.label} · ${hm(m.at)}`;
          if (m.kind === "event" || m.kind === "kept" || m.kind === "big" || m.kind === "proposal") {
            const ex = m.end !== undefined ? xOf(m.end, now, w) ?? w : x;
            const cw = Math.max(10, ex - x), ch = m.kind === "big" ? 14 : m.kind === "proposal" ? 12 : 10;
            return [label, <div key={m.id} className="hr-mark" data-mark={m.kind} data-thing={m.thingId /* C29 */} title={title} style={{ ...at, width: cw, height: ch }}>
              {m.kind === "big" ? <Pearl w={cw} h={ch} r={ch / 2} />
                : <div className="hr-capsule" style={m.kind === "proposal" ? { borderColor: on(0.6), height: ch } : { background: pearl(0.82), height: ch }} data-dashed={m.kind === "proposal" || undefined} />}
            </div>];
          }
          if (m.kind === "you") return [label, <div key={m.id} className="hr-ring" data-mark="you" data-thing={m.thingId /* C29: a filed part flies here */} title={title} style={{ ...at, borderColor: SUN, background: black(0.6) }} />];
          return [label, <div key={m.id} className="hr-pin" data-mark="due" title={title} style={{ ...at, color: m.yours ? SUN : dim }} />];
        })}
        {threads.map(({ m, x0, x1 }) => {
          const y = GEO.lane0 + (lanes.get(m.id) ?? 0) * GEO.lane;
          return [
            <div key={m.id} className="hr-thread" data-thread={m.thingId ?? m.id} data-x0={Math.round(x0)} data-x1={Math.round(x1)} title={`${m.label} · due ${hm(m.at)}`}
              style={{ left: x0, top: y, width: x1 - x0, height: 3, backgroundImage: jellyBands(JELLY.warm) }} />,
            <div key={`${m.id}-e`} className="hr-end" style={{ left: x1, top: y, background: SUN }} />,
            <div key={`${m.id}-l`} className="hr-label hr-tl" data-left={tl({ m, x1 }) || undefined} style={{ left: x1, top: y, color: dim }}>{m.label}</div>,
          ];
        })}
        <div className="hr-now" data-now={Math.round(nowX)} style={{ left: nowX, top: GEO.now, height: GEO.lane0 + GEO.lane - GEO.now, background: `linear-gradient(${ink}, ${on(0.25)})` }}>
          <span style={{ color: ink }}>now</span>
        </div>
      </>}
    </div>
  );
}

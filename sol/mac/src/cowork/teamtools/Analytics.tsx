// Analytics (#437, the engine's team/analytics.ts): the beta testers' counts from Sol's cloud, drawn quiet. The whiteboard
// look, as the timeline: black, the "on" colour at its steps, pearl for the marks, no fills of colour, no dither under
// words. One question a section, top to bottom: how much Sol was used each day (the releases marked on it), what was
// used and in which mode, the testers, which release they run, and which parts of Cowork their agents read. Every
// number a hover shows is also in "the days as numbers" or at a bar's tip. Counts only: no tester is named here.
import { useState } from "react";
import { analyticsOf, analyticsLine, compact, md, releaseWord, onNewest, type Analytics } from "./tool.ts";

type PageProps = { data: unknown; refresh: () => void };

const MODE_WORD: Record<string, string> = { home: "home", work: "work", cowork: "cowork" };
const SPAN_WORD: Record<string, string> = { "1": "one day", "2-3": "2 to 3 days", "4-7": "4 to 7 days", "8+": "8 days or more" };
const PART_WORD: Record<string, string> = { things: "the things", updates: "the build updates", memory: "the memory", goal: "the goal", calendar: "the calendar", decisions: "the decisions", polls: "the polls" };

export function AnalyticsPage({ data, refresh }: PageProps) {
  const a = analyticsOf(data);
  if (!a) return <p className="tt-no">the counts could not be read</p>;
  const newest = onNewest(a);
  const fresh = a.days.reduce((s, d) => s + d.new, 0);
  const used = a.parts.reduce((s, p) => s + p.events, 0);
  return (
    <div className="tt-an">
      <p className="tt-week"><b>{analyticsLine(a)}</b><span>{md(a.window.from)} to {md(a.window.to)}</span>
        <button className="rm-th-link u" onClick={refresh}>read again</button></p>
      {a.note && <p className="rm-pg-foot">{a.note}</p>}

      <div className="an-figs" role="list">
        <Fig label="testers" value={String(a.total.testers)} sub={fresh ? `${fresh} new` : "none new"} />
        <Fig label="events" value={compact(a.total.events)} sub={`${compact(Math.round(a.total.events / Math.max(1, a.window.days)))} a day`} />
        <Fig label="on the newest release" value={newest ? `${newest.testers} of ${a.total.testers}` : "–"} sub={newest ? releaseWord(newest.release) : "no release placed"} />
        <Fig label="Cowork read by agents" value={compact(used)} sub={used ? `${a.parts.length} part${a.parts.length === 1 ? "" : "s"}` : "not yet"} />
      </div>

      <Section title="use over time" sub="events each day, and the testers who came; a line where a release was made">
        <OverTime a={a} />
      </Section>

      <div className="an-two">
        <Section title="what is used" sub="events by name, the eight most used">
          <Bars rows={a.names.map((n) => ({ key: n.name, label: n.name, value: n.events, sub: n.name === "other" ? "the rest" : `${n.testers} tester${n.testers === 1 ? "" : "s"}`, mono: n.name !== "other" }))} />
        </Section>
        <Section title="in which mode" sub="events by the mode Sol was in">
          <Bars rows={a.modes.map((m) => ({ key: m.mode, label: MODE_WORD[m.mode] ?? m.mode, value: m.events, sub: `${m.testers} tester${m.testers === 1 ? "" : "s"}` }))} />
        </Section>
      </div>

      <div className="an-two">
        <Section title="the testers" sub="how many days of the window each came on">
          <Bars rows={a.active.map((s) => ({ key: s.span, label: SPAN_WORD[s.span] ?? s.span, value: s.testers }))} unit="testers" />
        </Section>
        <Section title="Cowork, read by their agents" sub="the parts of a project an agent read (cowork.used)">
          {a.parts.length ? <Bars rows={a.parts.map((p) => ({ key: p.part, label: PART_WORD[p.part] ?? p.part, value: p.events, sub: `${p.testers} tester${p.testers === 1 ? "" : "s"}` }))} />
            : <p className="an-none">no agent has read a project yet</p>}
        </Section>
      </div>

      <Section title="which release they run" sub="each tester once, on the version of their newest event; the versions placed on the timeline's releases">
        <Adoption a={a} />
      </Section>

      <details className="an-table">
        <summary>the days as numbers</summary>
        <table>
          <thead><tr><th>day</th><th>events</th><th>testers</th><th>new</th><th>release made</th></tr></thead>
          <tbody>{[...a.days].reverse().map((d) => (
            <tr key={d.day}><td>{d.day}</td><td>{d.events}</td><td>{d.testers}</td><td>{d.new || ""}</td><td>{a.releases.filter((r) => r.at.slice(0, 10) === d.day).map((r) => r.tag).join(", ")}</td></tr>
          ))}</tbody>
        </table>
      </details>

      <p className="rm-pg-foot rm-gp-foot">counts from Sol's cloud, read {ago(a.read)} · a day is each tester's own · kept two minutes · a team tool · turned on and off in the project settings</p>
    </div>
  );
}

export function Fig({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="an-fig" role="listitem"><span className="l">{label}</span><b>{value}</b><span className="s">{sub}</span></div>;
}
export function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <section className="an-sec" aria-label={title}><h4 className="rm-pg-h">{title}</h4><p className="an-sub">{sub}</p>{children}</section>;
}

/** horizontal bars, one ink, the value at the tip; the longest fills the track */
export function Bars({ rows, unit }: { rows: { key: string; label: string; value: number; sub?: string; mono?: boolean }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="an-none">nothing counted</p>;
  return (
    <ul className="an-bars">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.value.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}${r.sub ? ` · ${r.sub}` : ""}`}>
          <span className={`an-bl ${r.mono ? "mono" : ""}`}>{r.label}</span>
          <span className="an-track"><i style={{ width: `${(r.value / max) * 100}%` }} className={r.value ? "" : "zero"} /></span>
          <span className="an-bv">{compact(r.value)}</span>
          <span className="an-bs">{r.sub ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- use over time: columns of events, a small line of testers under them, the releases as hairlines ----

const W = 720, H = 132, TH = 44, GAP = 30, LEFT = 34, TOP = 18;
function OverTime({ a }: { a: Analytics }) {
  const [at, setAt] = useState<number | null>(null);
  const n = a.days.length;
  if (!n) return <p className="an-none">nothing counted yet</p>;
  const slot = (W - LEFT) / n, bw = Math.max(3, Math.min(18, slot - 4));
  const maxE = niceMax(Math.max(...a.days.map((d) => d.events))), maxT = Math.max(1, ...a.days.map((d) => d.testers));
  const x = (i: number) => LEFT + slot * i + slot / 2;
  const y = (v: number) => TOP + H - (v / maxE) * H;
  const ty = (v: number) => TOP + H + GAP + TH - (v / maxT) * TH;
  const relX = (iso: string) => { const i = a.days.findIndex((d) => d.day === iso.slice(0, 10)); return i < 0 ? null : x(i); };
  const tPath = a.days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${ty(d.testers).toFixed(1)}`).join(" ");
  const hd = at !== null ? a.days[at] : null;
  const made = hd ? a.releases.filter((r) => r.at.slice(0, 10) === hd.day) : [];
  const ticks = [0, maxE / 2, maxE];
  const labelEvery = Math.ceil(n / 8);
  return (
    <div className="an-time" onPointerLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${W} ${TOP + H + GAP + TH + 22}`} role="img" aria-label={`events each day over ${n} days, most ${Math.max(...a.days.map((d) => d.events))} on one day`}>
        {ticks.map((t) => <g key={t}><line className="an-grid" x1={LEFT} x2={W} y1={y(t)} y2={y(t)} /><text className="an-ax" x={LEFT - 8} y={y(t) + 3.5} textAnchor="end">{compact(t)}</text></g>)}
        <line className="an-grid" x1={LEFT} x2={W} y1={ty(0)} y2={ty(0)} />
        <line className="an-grid" x1={LEFT} x2={W} y1={ty(maxT)} y2={ty(maxT)} />
        <text className="an-ax" x={LEFT - 8} y={ty(maxT) + 3.5} textAnchor="end">{maxT}</text>
        {a.releases.map((r) => { const rx = relX(r.at); return rx === null ? null : (
          <g key={r.tag} className="an-rel"><line x1={rx} x2={rx} y1={TOP - 6} y2={ty(0)} /><text x={rx} y={TOP - 9} textAnchor="middle">{releaseWord(r.tag)}</text></g>); })}
        {a.days.map((d, i) => d.events ? <path key={d.day} className={`an-col ${at === i ? "on" : ""}`} d={col(x(i) - bw / 2, y(d.events), bw, TOP + H - y(d.events))} /> : null)}
        <path className="an-tline" d={tPath} />
        {a.days.map((d, i) => d.new ? <circle key={d.day} className="an-new" cx={x(i)} cy={ty(d.testers)} r={4} /> : null)}
        {at !== null && <line className="an-cross" x1={x(at)} x2={x(at)} y1={TOP} y2={ty(0)} />}
        {at !== null && <circle className="an-tdot" cx={x(at)} cy={ty(a.days[at].testers)} r={4} />}
        {a.days.map((d, i) => (i % labelEvery === (n - 1) % labelEvery) ? <text key={d.day} className="an-ax" x={x(i)} y={ty(0) + 16} textAnchor="middle">{md(d.day)}</text> : null)}
        <text className="an-ax an-tl" x={LEFT} y={TOP + H + 20}>testers · a ring where one came for the first time</text>
        {a.days.map((d, i) => <rect key={d.day} className="an-hit" x={LEFT + slot * i} y={0} width={slot} height={ty(0)} onPointerEnter={() => setAt(i)} />)}
      </svg>
      {hd && at !== null && (
        <div className="an-tip" style={{ left: `${(x(at) / W) * 100}%` }} role="status">
          <b>{hd.events.toLocaleString("en-US")}</b> events <span>{md(hd.day)}</span>
          <div><b>{hd.testers}</b> tester{hd.testers === 1 ? "" : "s"}{hd.new ? `, ${hd.new} new` : ""}</div>
          {made.map((r) => <div key={r.tag} className="r">{releaseWord(r.tag)} made</div>)}
        </div>
      )}
    </div>
  );
}
/** a column with a 4px round top, square at the baseline */
function col(x0: number, y0: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x0},${y0 + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + w - r} Q${x0 + w},${y0} ${x0 + w},${y0 + r} V${y0 + h} Z`;
}
/** a clean top for the axis: 1, 2 or 5 times a power of ten */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

// ---- which release they run: one row a place on the timeline, newest first ----

function Adoption({ a }: { a: Analytics }) {
  if (!a.versions.length) return <p className="an-none">no versions counted yet</p>;
  const all = Math.max(1, a.total.testers);
  const firstRel = a.versions.findIndex((v) => v.release && v.release !== "main");
  return (
    <ul className="an-adopt">
      {a.versions.map((v, i) => (
        <li key={v.release || "own"} className={`${i === firstRel ? "newest" : ""} ${v.release === "" ? "own" : ""}`}
          title={`${releaseWord(v.release)}: ${v.testers} of ${a.total.testers} testers on it now; ${v.events.toLocaleString("en-US")} events from it; versions ${v.sols.join(", ")}`}>
          <span className="an-dot" aria-hidden="true" />
          <span className="an-rn">{releaseWord(v.release)}</span>
          <span className="an-track"><i style={{ width: `${(v.testers / all) * 100}%` }} className={v.testers ? "" : "zero"} /></span>
          <span className="an-bv">{v.testers} of {a.total.testers}</span>
          <span className="an-sha">{v.sols.slice(0, 3).join(" ")}{v.sols.length > 3 ? ` +${v.sols.length - 3}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

export const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return Number.isNaN(s) ? "just now" : s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)}h ago`;
};

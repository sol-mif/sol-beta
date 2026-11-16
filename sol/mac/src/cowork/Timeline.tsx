// The timeline (#424, B1 of #413; the picture is team-flow-v2.html §5): every release drawn left to right on one line,
// the latest a filled white dot, a release that reached beta a solid pearl one, a dev-only one hollow; what never made it
// leaves the line as a faded dashed stub that ends in a cross (sent back severe, closed without folding, held from beta);
// each person under the release they run, with "+N of mine" and "N behind", mine ringed. Past the latest, a dashed
// stretch to "main": in, not released yet.
// A click on a release shows what folded into it and who runs it; a developer (the project's rhythm names them for dev,
// or the project has none) opens a change for its way: handed in → in → dev → beta. A click on a side branch shows
// why it stopped: it can be looked at, never run (there is no button for it).
// Above it, the night (#413's rhythm, .sol/rhythm.json): hand in → the dev night → fixes until → release → the day, as
// one quiet line with each step's hour and what sits at it now (waiting, folded, sent back, the latest and who runs it),
// and a white dot where now is. The hours are the project's, in its zone; without the file, #413's default hours.
// TimelineMini is the small one in Settings: only me, the last releases and where I am.
// The answer is team.timeline (engine/src/team/timeline.ts, PROTOCOL.md round 68); ?dev=team draws FAKE_TIMELINE.
import { useEffect, useMemo, useRef, useState } from "react";
import { link } from "../socket";
import { ENGINE } from "../useEngine";
import { Body } from "./bits";
import { openUrl } from "./util";
import { timelineOf, shortName, when, standing, wayOf, headline, personWords, sidesBy, sideLabel, nightOf, nightItems, zoneWords, whoTonight, type Timeline as T, type Release, type Side, type Change } from "./timelineWords";
import { DEV_TEAM } from "./useTeam";
import { GoBackHere } from "./Pin";   // go back to a release of the last thirty days (#426)
import { backable } from "./pinWords";
import "./timeline.css";

type Ask = <R = any>(type: string, body?: object, wait?: number) => Promise<R>;

/** the timeline: asked on open, told again when the engine read a newer one behind a kept answer */
export function useTimeline(ask: Ask): { t: T | null; error: string; busy: boolean; again: () => void } {
  const [t, setT] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (DEV_TEAM) { setT(FAKE_TIMELINE); setBusy(false); return; }
    let live = true;
    setBusy(true);
    void ask("team.timeline", n ? { refresh: true } : {}, 90_000).then((m: any) => {
      if (!live) return;
      const got = timelineOf(m);
      setBusy(false);
      if (got) { setT(got); setError(""); } else setError(m?.error ? String(m.error) : "this Sol's engine does not draw the timeline yet");
    });
    const off = link(ENGINE)?.on((m) => { if (m?.type === "team.timeline" && m.rid == null) { const got = timelineOf(m); if (got && live) setT(got); } });
    return () => { live = false; off?.(); };
  }, [ask, n]);
  return { t, error, busy, again: () => setN((x) => x + 1) };
}

const GAP = 128, PAD = 72, LINE_Y = 120;   // the drawing: one release every GAP px, the line at LINE_Y

type Chosen = { k: "release"; tag: string } | { k: "side"; i: number } | null;

export function TimelinePage({ ask, onBack }: { ask: Ask; onBack: () => void }) {
  const { t, error, busy, again } = useTimeline(ask);
  const [pick, setPick] = useState<Chosen>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // the latest at the right edge in view, as the eye reads a line: where it ends now
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [t?.at]);
  const me = t?.people.find((p) => p.you);
  const chosen: Chosen = pick ?? (t ? { k: "release", tag: me?.on ?? t.releases.filter((r) => r.kind !== "next").pop()?.tag ?? t.releases[0]?.tag ?? "" } : null);
  return (
    <div className="tl">
      <div className="tl-head">
        <button className="tl-back" onClick={onBack} aria-label="back to the project" title="back">‹</button>
        <span className="tl-title">timeline</span>
        <span className="tl-sub">{t ? headline(t) : busy ? "reading the releases…" : error}</span>
        <span className="gp-sp" />
        <button className="gp-quiet" disabled={busy && !t} onClick={again} title="read the releases, what went in and who runs which again">read again</button>
      </div>
      {t && <NightLine t={t} />}
      {t && <Drawing t={t} pick={chosen} onPick={setPick} scroller={scroller} />}
      {t && <Legend />}
      {t && <Detail t={t} pick={chosen} />}
      {t?.error && <p className="tl-note">{t.error}</p>}
    </div>
  );
}

/** the night's rhythm, and what is where on it now; the clock moves it once a minute */
function NightLine({ t }: { t: T }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const i = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(i); }, []);
  const n = nightOf(t.night, now);
  const items = nightItems(t, now);
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  return (
    <section className="tl-night" aria-label="the night's rhythm">
      <div className="tl-nh">
        <span className="k">tonight</span>
        <span className="l">{n.line}</span>
        {whoTonight(t.night) && <span className="l" title="who reviews tonight, and who the card opens for at the handover if the reviewer has not pressed">{whoTonight(t.night)}</span>}
        <span className="gp-sp" />
        <span className="z">{[zoneWords(n.zone), n.assumed ? "the default hours: the project has no rhythm file yet" : ""].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="tl-band">
        {n.stretches.map((s) => <i key={s.key} className={`tl-str ${s.key} ${n.now === s.key ? "now" : ""}`} style={{ left: pct(s.from), width: pct(s.to - s.from) }} title={s.word} />)}
        {n.stops.map((s) => (
          <div key={s.key} className={`tl-stop ${s.key}`} style={{ left: pct(s.x) }}>
            <i className="tk" />
            <span className="hr">{s.time}</span>
            <span className="wd">{s.word}</span>
            <span className="ct">{items[s.key].count}</span>
            {items[s.key].names.map((x) => <span key={x} className="nm" title={x}>{x}</span>)}
          </div>
        ))}
        <span className="tl-day" style={{ left: pct((n.stretches[3].from + 1) / 2) }}>the day</span>
        <span className="tl-now" style={{ left: pct(n.nowX) }} title={`now: ${n.line}`}><i /><b>now</b></span>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="tl-legend" aria-hidden="true">
      <span><i className="d beta" />reached beta</span>
      <span><i className="d" />dev only</span>
      <span><i className="d latest" />latest</span>
      <span><i className="stub" />never made it</span>
      <span><i className="d you" />you</span>
    </div>
  );
}

function Drawing({ t, pick, onPick, scroller }: { t: T; pick: Chosen; onPick: (p: Chosen) => void; scroller: React.RefObject<HTMLDivElement | null> }) {
  const xs = useMemo(() => new Map(t.releases.map((r, i) => [r.tag, PAD + i * GAP])), [t]);
  const sides = useMemo(() => sidesBy(t), [t]);
  const placed = useMemo(() => {
    const m = new Map<string, T["people"]>();
    for (const p of t.people) if (p.on) m.set(p.on, [...(m.get(p.on) ?? []), p]);
    return m;
  }, [t]);
  const off = t.people.filter((p) => !p.on);
  const most = Math.max(1, ...[...placed.values()].map((v) => v.length));
  const width = PAD * 2 + Math.max(0, t.releases.length - 1) * GAP + 120;
  const height = LINE_Y + 64 + most * 40;
  const rel = t.releases.filter((r) => r.kind !== "next");
  const next = t.releases.find((r) => r.kind === "next");
  const lastX = rel.length ? xs.get(rel[rel.length - 1].tag)! : PAD;
  const meOn = t.people.find((p) => p.you)?.on;
  if (!t.releases.length) return <p className="tl-empty">nothing to draw yet: no release, and nothing went into main in the last 30 days</p>;
  return (
    <div className="tl-scroll" ref={scroller}>
      <div className="tl-draw" style={{ width, height }}>
        <svg width={width} height={height} aria-hidden="true">
          {rel.length > 1 && <line x1={PAD} y1={LINE_Y} x2={lastX} y2={LINE_Y} className="tl-main" />}
          {next && <line x1={lastX} y1={LINE_Y} x2={xs.get("main")!} y2={LINE_Y} className="tl-next" />}
          {[...sides.entries()].flatMap(([from, ss]) => ss.map((s, k) => {
            const x = xs.get(from);
            if (x === undefined) return null;
            const ex = x + 54, ey = LINE_Y - 44 - k * 26;
            return (
              <g key={`${from}-${k}`} className={`tl-stub ${pick?.k === "side" && t.sides[pick.i] === s ? "on" : ""}`}>
                <path d={`M${x} ${LINE_Y} C ${x + 14} ${LINE_Y - 24}, ${x + 26} ${ey}, ${ex} ${ey}`} />
                <path className="x" d={`M${ex - 4} ${ey - 4} L${ex + 4} ${ey + 4} M${ex + 4} ${ey - 4} L${ex - 4} ${ey + 4}`} />
              </g>
            );
          }))}
        </svg>
        {/* the side branches' words, a click each: looked at, never run */}
        {[...sides.entries()].flatMap(([from, ss]) => ss.map((s, k) => {
          const x = xs.get(from);
          if (x === undefined) return null;
          const i = t.sides.indexOf(s);
          return (
            <button key={`l-${from}-${k}`} className={`tl-sidel ${pick?.k === "side" && pick.i === i ? "on" : ""}`} style={{ left: x + 64, top: LINE_Y - 44 - k * 26 - 9 }}
              onClick={() => onPick({ k: "side", i })} title={`${s.title}: ${s.why}. It can be looked at, never run.`}>{sideLabel(s)}</button>
          );
        }))}
        {t.releases.map((r) => {
          const x = xs.get(r.tag)!;
          const on = pick?.k === "release" && pick.tag === r.tag;
          const here = meOn === r.tag;
          return (
            <button key={r.tag} className={`tl-rel ${r.kind} ${r.beta ? "beta" : ""} ${r.latest ? "latest" : ""} ${r.held ? "held" : ""} ${on ? "on" : ""} ${here ? "here" : ""}`}
              style={{ left: x, top: LINE_Y }} onClick={() => onPick({ k: "release", tag: r.tag })}
              title={`${r.kind === "next" ? "main" : r.tag}: ${standing(r)}, ${r.changes.length} change${r.changes.length === 1 ? "" : "s"}${here ? ". You are here" : ""}`}>
              <i className="dot" />
              {r.latest && <span className="cap">latest</span>}
              <span className="nm">{shortName(r)}</span>
            </button>
          );
        })}
        {[...placed.entries()].map(([tag, ps]) => {
          const x = xs.get(tag);
          if (x === undefined) return null;
          return (
            <div key={`p-${tag}`} className="tl-people" style={{ left: x, top: LINE_Y + 46 }}>
              {ps.map((p) => (
                <div key={p.login} className={`tl-who ${p.you ? "you" : ""}`} title={`${p.you ? "you" : p.login}: ${p.line}`}>
                  <Body login={p.login} size={18} />
                  <span className="tx"><span className="n">{p.you ? "you" : p.login}</span>{personWords(p) && <span className="w">{personWords(p)}</span>}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {off.length > 0 && <p className="tl-off">off the line: {off.map((p) => `${p.you ? "you" : p.login} (${p.line})`).join(" · ")}</p>}
    </div>
  );
}

function Detail({ t, pick }: { t: T; pick: Chosen }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setOpen(null), [pick?.k, pick && "tag" in pick ? pick.tag : pick && "i" in pick ? pick.i : null]);
  if (!pick) return null;
  if (pick.k === "side") {
    const s: Side | undefined = t.sides[pick.i];
    if (!s) return null;
    return (
      <div className="tl-detail side">
        <div className="tl-dh"><span className="t">{s.number ? `#${s.number} ` : ""}{s.title}</span><span className="st">{s.why}</span></div>
        <p className="tl-dl">{[s.author && `by ${s.author}`, s.by && `${s.kind === "held" ? "held" : "sent back"} by ${s.by}`, when(s.at), `left the line after ${s.from}`].filter(Boolean).join(" · ")}</p>
        <p className="tl-never">A side branch: it never made it into a release. It can be looked at, never run.</p>
        {s.url && <button className="gp-quiet" onClick={() => openUrl(s.url!)}>look at it on GitHub ›</button>}
      </div>
    );
  }
  const r: Release | undefined = t.releases.find((x) => x.tag === pick.tag);
  if (!r) return null;
  const who = t.people.filter((p) => p.on === r.tag);
  return (
    <div className="tl-detail">
      <div className="tl-dh">
        <span className="t">{r.kind === "next" ? "main" : r.tag}</span>
        <span className="st">{standing(r)}</span>
        {r.kind !== "next" && <span className="at">{when(r.at)}</span>}
      </div>
      <p className="tl-dl">{who.length ? `runs it: ${who.map((p) => `${p.you ? "you" : p.login}${p.mine ? ` (+${p.mine} of mine)` : ""}`).join(", ")}` : "nobody runs it now"}</p>
      {backable(r, t.people.find((p) => p.you)?.on) && <GoBackHere tag={r.tag} />}
      {r.changes.length === 0 ? <p className="tl-dl dim">no change went into it{r.kind === "stable" ? " that the history names" : ""}</p> : (
        <ul className="tl-changes">
          {r.changes.map((c) => (
            <li key={c.number} className={open === c.number ? "open" : ""}>
              {t.developer
                ? <button className="tl-ch" onClick={() => setOpen(open === c.number ? null : c.number)} aria-expanded={open === c.number} title="its way: handed in, in, dev, beta">
                    <span className="n">#{c.number}</span><span className="t">{c.title}</span>{c.broke && <span className="bk" title="marked broken (#421): beta waits until it is fixed">broke</span>}{c.author && <span className="a">{c.author}</span>}<span className="car">{open === c.number ? "–" : "+"}</span></button>
                : <div className="tl-ch"><span className="n">#{c.number}</span><span className="t">{c.title}</span>{c.broke && <span className="bk" title="marked broken (#421): beta waits until it is fixed">broke</span>}{c.author && <span className="a">{c.author}</span>}</div>}
              {open === c.number && <Way c={c} source={t.source} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Way({ c, source }: { c: Change; source: T["source"] }) {
  const steps = wayOf(c, source);
  return (
    <ol className="tl-way" aria-label={`the way of #${c.number}`}>
      {steps.map((s, i) => (
        <li key={s.step} className={s.done ? "done" : ""}>
          <i className="d" />{i < steps.length - 1 && <i className="ln" />}
          <span className="s">{s.step}</span><span className="w">{s.at || "–"}</span>
        </li>
      ))}
      {c.url && <li className="go"><button className="gp-quiet" onClick={() => openUrl(c.url!)}>on GitHub ›</button></li>}
    </ol>
  );
}

/** an ask on the engine's link, answered by rid (Settings has no Cowork team to ask through) */
export const askEngine: Ask = (type, body = {}, wait = 30_000) => new Promise((ok) => {
  const L = link(ENGINE), rid = crypto.randomUUID();
  let done = false;
  const off = L?.on((m) => { if (m?.rid === rid && !done) { done = true; off?.(); ok(m); } });
  if (!L?.send({ type, rid, ...body })) { done = true; off?.(); ok({ error: "not connected" } as any); return; }
  window.setTimeout(() => { if (!done) { done = true; off?.(); ok({ error: "no answer" } as any); } }, wait);
});

/** Settings: only me. The last releases as small dots, mine ringed, and the one line */
export function TimelineMini({ ask }: { ask: Ask }) {
  const { t, error, busy } = useTimeline(ask);
  if (!t) return <span className="tl-mini-w">{busy ? "…" : error}</span>;
  const me = t.people.find((p) => p.you);
  const shown = t.releases.slice(-9);
  return (
    <span className="tl-mini" title={me?.line ?? "unknown"}>
      <span className="tl-mini-line" aria-hidden="true">
        {shown.map((r) => <i key={r.tag} className={`d ${r.kind} ${r.beta ? "beta" : ""} ${r.latest ? "latest" : ""} ${me?.on === r.tag ? "you" : ""}`} />)}
      </span>
      <span className="tl-mini-w">{!me || !me.on ? `you run ${me?.line ?? "a version this Sol cannot say"}` : `you run ${me.line}`}</span>
    </span>
  );
}

// ---- ?dev=team: a made-up fortnight, every kind of thing on it ----
const D = (daysAgo: number, h = 9) => { const d = new Date(); d.setHours(h, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d.toISOString(); };
const ch = (number: number, title: string, author: string, day: number, rel: string, relDay: number, beta?: [string, number]): Change =>
  ({ number, title, author, url: `https://github.com/sol-mif/sol-dev/pull/${number}`, handedIn: D(day + 1, 16), folded: D(day, 21), release: rel, releaseAt: D(relDay), ...(beta ? { beta: beta[0], betaAt: D(beta[1]) } : {}) });
const tag = (daysAgo: number) => { const d = new Date(D(daysAgo)); return `dev-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; };
export const FAKE_TIMELINE: T = (() => {
  const days = [7, 6, 5, 4, 3, 2, 1, 0];
  const releases: Release[] = days.map((d, i) => ({ tag: tag(d), sha: `${i}`.padStart(40, "c"), at: D(d), kind: "dev", beta: d >= 3 && d !== 4, ...(d === 4 ? { held: true } : {}), ...(d === 0 ? { latest: true as const } : {}), changes: [] }));
  const B = (d: number): [string, number] | undefined => (d >= 3 ? (d === 4 ? [tag(3), 2] : [tag(d), d - 1]) : undefined);
  const add = (d: number, ...cs: [number, string, string][]) => { const r = releases[days.indexOf(d)]; r.changes.push(...cs.map(([n, t, a]) => ch(n, t, a, d + 1, r.tag, d, B(d)))); };
  add(7, [431, "Cowork: the people strip says one word each", "frank"]);
  add(6, [433, "The night digest names what may clash", "marco"], [434, "Notch: the half moon stays put", "marco"]);
  add(5, [437, "Analytics as counts, one card", "isaac"]);
  add(4, [440, "Merged branches go after a week", "marco"], [441, "The last stamp", "marco"]);
  add(3, [444, "Dictation anywhere", "marco"]);
  add(2, [417, "Everyone's version", "marco"], [422, "Conversion steps for saved data", "marco"]);
  add(1, [427, "A project replaces the room", "frank"]);
  add(0, [416, "The review session at 9pm", "marco"], [428, "Project settings", "frank"]);
  releases.push({ tag: "main", sha: "d".repeat(40), at: D(0, 20), kind: "next", beta: false, changes: [{ number: 424, title: "The timeline", author: "marco", url: "", handedIn: D(0, 12), folded: D(0, 19) }] });
  return {
    at: new Date().toISOString(), source: "dev", developer: true, me: "marco", repo: "sol-mif/sol-dev", releases,
    waiting: [{ number: 446, title: "Pin a release for a while", author: "marco", at: D(0, 15) }, { number: 448, title: "Settings: the people page", author: "frank", at: D(0, 17) }],
    night: { handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "America/New_York" },
    sides: [
      { kind: "severe", from: tag(0), at: D(0, 1), title: "Calls ring twice", why: "sent back · severe", number: 445, author: "isaac", by: "marco", url: "https://github.com/sol-mif/sol-dev/pull/445" },
      { kind: "severe", from: tag(6), at: D(6, 21), title: "Rooms stack in the sidebar", why: "sent back · severe", number: 435, author: "isaac", by: "marco", url: "https://github.com/sol-mif/sol-dev/pull/435" },
      { kind: "held", from: tag(4), at: D(4, 21), title: `the dev release of ${tag(4).slice(4)}`, why: "held from beta", by: "frank" },
      { kind: "closed", from: tag(2), at: D(2, 14), title: "A second sidebar for agents", why: "closed without going in", number: 439, author: "frank", url: "https://github.com/sol-mif/sol-dev/pull/439" },
    ],
    people: [
      { login: "marco", you: true, on: tag(2), mine: 12, behind: 2, line: `${tag(2)} + 12 of mine, 2 behind` },
      { login: "frank", you: false, on: tag(0), mine: 3, behind: 0, line: `${tag(0)} + 3 of mine` },
      { login: "isaac", you: false, on: tag(3), mine: 0, behind: 3, line: `${tag(3)}, 3 behind` },
      { login: "ana", you: false, on: null, mine: 0, behind: 0, line: "unknown" },
    ],
  };
})();

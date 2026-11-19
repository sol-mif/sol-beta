// The team strip (#1167): the top of the system view, where each Sol developer stands against the iteration (#1153).
// One card per person from the engine's reading (iteration.team: docs/people, never a list here): ✓ on the iteration,
// or which release they run and how far behind; their */mine files off it and the iterations missed; their open PRs;
// what they touched last (the work under way the view already holds). A quiet line says when drift and integrate run.
// It asks again whenever the engine says the count (`team.runs`: a `runs` or a `drift` word landed on the relay), so it
// moves without a reload. Pressing a card opens that person's detail (their PRs, their off files) as a part of the view
// (data-part "team › <name>"); a system block whose body names `person` opens with it. Read-only.
import { useCallback, useEffect, useState } from "react";
import { Glass } from "../../../kit";
import { CURVE, SHADE } from "../../../kit/tokens";
import type { Link } from "../../engineStore";
import type { Live } from "./model";
import { agoWords, clockWords, driftWords, prWords, standWords, touchedBy, type Strip, type StripPerson } from "./team";
import "./team.css";

const PR_URL = (n: number) => `https://github.com/sol-mif/sol-dev/pull/${n}`;
const openUrl = (url: string) => { import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank")); };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function Card({ p, live, now, picked, pick }: { p: StripPerson; live: Live | null; now: number; picked: boolean; pick: (login: string) => void }) {
  const s = standWords(p), t = touchedBy(p, live), prs = prWords(p);
  return (
    <button className={`ts-card${picked ? " picked" : ""}`} data-part={`team › ${p.name}`} data-person={p.login} onClick={() => pick(p.login)}
      title={p.runs.map((r) => `${r.machine}: ${r.tag} on ${r.branch}, said ${agoWords(r.at, now)}`).join("\n") || "no Sol of theirs spoke this week"}>
      <Glass r={CURVE.radius.box} surface="glass" fill={`rgb(255 255 255 / ${picked ? SHADE.on.flat : SHADE.on.line})`} />
      <span className="ts-head">
        <b>{p.name}</b>
        <span className={`ts-mark ${s.mark}`}>{s.mark === "on" ? "✓" : s.mark === "off" ? "off" : "–"}</span>
      </span>
      <span className="ts-line">{s.words}</span>
      <span className="ts-line">{driftWords(p)}{prs && <> · {prs}</>}</span>
      <span className="ts-line ts-faint">{t ? <>touched {t.what} · {agoWords(t.at, now)}</> : "nothing in sight being changed"}</span>
    </button>
  );
}

/** a person's detail: the open PRs drift.json measured and the files in their mine branch off the iteration */
export function TeamDetail({ p, strip, close }: { p: StripPerson; strip: Strip; close?: () => void }) {
  const d = p.drift, files = d?.files ?? null, open = d?.open ?? null;
  const cut = (shown: number, all: number | null | undefined) => (typeof all === "number" && all > shown ? <li className="ts-faint">and {all - shown} more, in drift.json on the machine that measured it</li> : null);
  return (
    <div className="ts-detail" data-part={`team › ${p.name} › detail`}>
      <Glass r={CURVE.radius.box} surface="raised" fill={`rgb(255 255 255 / ${SHADE.on.flat})`} />
      <div className="ts-dhead"><b>{p.name}</b><span className="ts-faint">{standWords(p).words}</span>{close && <button className="ts-x" onClick={close} aria-label="close">×</button>}</div>
      {p.runs.length > 1 && <div className="ts-faint">{p.runs.map((r) => `${r.machine} ${r.tag}`).join(" · ")}</div>}
      <div className="ts-sec">Open PRs{typeof d?.prs === "number" ? ` (${d.prs})` : ""}</div>
      {!d ? <div className="ts-faint">Not measured for {strip.iteration?.name ?? "this iteration"} yet.</div>
        : !open ? <div className="ts-faint">The drift word did not carry the list.</div>
        : open.length === 0 && !d.prs ? <div className="ts-faint">None.</div>
        : <ul>{open.map((o) => <li key={o.pr}><button className="ts-link" onClick={() => openUrl(PR_URL(o.pr))}>#{o.pr}</button> <span className="ts-faint">{o.files} file{o.files === 1 ? "" : "s"}</span></li>)}{cut(open.length, d.prs)}</ul>}
      <div className="ts-sec">Off the iteration, in {p.prefix || p.login}/mine{d ? ` (${d.off})` : ""}</div>
      {!d ? null
        : !files ? <div className="ts-faint">The drift word did not carry the files.</div>
        : files.length === 0 && d.off === 0 ? <div className="ts-faint">Nothing off.</div>
        : <ul>{files.map((f) => <li key={f.path}><code>{f.path}</code> <span className="ts-faint">{f.age === 0 ? "this iteration" : `${f.age} missed`}</span></li>)}{cut(files.length, d.off)}</ul>}
    </div>
  );
}

export function TeamStrip({ link, live, person, onShown }: { link: Link; live: Live | null; person?: string; onShown?: (shown: boolean) => void }) {
  const [strip, setStrip] = useState<Strip | null>(null);
  const [picked, setPicked] = useState<string | null>(person ?? null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setPicked(person ?? null); }, [person]);
  useEffect(() => {
    let gone = false;
    const ask = () => { void link.ask<{ strip?: Strip }>("iteration.team", {}).then((r) => { if (!gone && r?.strip) { setStrip(r.strip); setNow(Date.now()); } }).catch(() => { /* an older engine or a dropped socket: the strip stays as it was */ }); };
    ask();
    // a `runs` or `drift` word landed (the engine says the count again), or the socket came back: read it again
    const off = link.listen((m: { type?: string }) => { if (m?.type === "team.runs" || m?.type === "open") ask(); });
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);   // "12 min ago" stays true
    return () => { gone = true; off(); window.clearInterval(tick); };
  }, [link]);
  const pick = useCallback((login: string) => setPicked((x) => (x && same(x, login) ? null : login)), []);
  // the view reserves the strip's room only while it is on screen (an older engine, or no people: none)
  const shown = !!strip && strip.people.length > 0;
  useEffect(() => { onShown?.(shown); }, [shown, onShown]);
  useEffect(() => () => onShown?.(false), [onShown]);
  if (!strip || !shown) return null;
  const it = strip.iteration, chosen = picked ? strip.people.find((p) => same(p.login, picked)) : undefined;
  return (
    <div className="ts" data-part="team" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ts-top">
        <span className="ts-label">Team</span>
        {it ? <span>iteration <b>{it.name}</b> · out {agoWords(it.at, now)}</span> : <span className="ts-faint">no iteration yet (no dev-* tag here)</span>}
        <span className="ts-faint ts-quiet">{strip.driftAt ? `drift measured ${agoWords(strip.driftAt, now)}` : strip.driftOld ? `drift last measured on ${strip.driftOld}` : "drift not measured yet"}</span>
      </div>
      <div className="ts-row">{strip.people.map((p) => <Card key={p.login} p={p} live={live} now={now} picked={!!chosen && same(chosen.login, p.login)} pick={pick} />)}</div>
      <div className="ts-faint ts-clock">{clockWords(strip)}</div>
      {chosen && <TeamDetail p={chosen} strip={strip} close={() => setPicked(null)} />}
    </div>
  );
}

/** the strip's height on screen, so the lanes start under it */
export const STRIP_H = 168;
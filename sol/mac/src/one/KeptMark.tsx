// How the one session is kept (#1002, build.one; the engine's renewal, engine/src/work/one.ts "the renewal"). Quiet by
// default: the kit's ring beside the one session's name, as full as its talk, with the line at 60% where it renews
// itself drawn on the disc like the mark on a measuring cup. A press opens the whole of it as a card at the pop step
// (the context ring's grammar, work/Context.tsx): the number and one word; a renewal under way or one that did not go;
// each renewal, newest first, opening on a press to what crossed and what was left out; what it runs; where each fact is
// written; and one press, "renew now", held while a renewal is under way. What it shows is computed in kept.ts.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Card, Ring, Row } from "../kit";
import { dim, ink, label, mute, on } from "../kit/paint";
import { SHADE, TYPE } from "../kit/tokens";   // TYPE.family: the card is a portal, its words set here
import { canRenew, fillOf, homesOf, levelY, quietOf, renewalsOf, renewWord, runsOf, RING_DISC, stateOf, type Kept, type Line } from "./kept";
import type { Row as RosterRow } from "./model";

const W = 400, PAD = 20, IN = W - 2 * PAD;

/** the kit's ring with the renewal line across its disc: a faint line inside, a short mark out of the rim on each side */
function RingAt({ size, value, at, flat }: { size: number; value: number; at: number; flat?: boolean }) {
  const c = size / 2, rr = RING_DISC * size, y = levelY(size, at), half = Math.sqrt(Math.max(0, rr * rr - (y - c) ** 2)), out = Math.max(2, size / 14);
  return (
    <span className="okept-ring" style={{ width: size, height: size }}>
      <Ring value={value} size={size} flat={flat} />
      <svg width={size} height={size} aria-hidden>
        <line x1={c - half + 1} x2={c + half - 1} y1={y} y2={y} stroke={on(0.42)} strokeWidth={1} strokeDasharray="2 2" />
        <line x1={c - half - out} x2={c - half + 1} y1={y} y2={y} stroke={on(SHADE.on.ink)} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={c + half - 1} x2={c + half + out} y1={y} y2={y} stroke={on(SHADE.on.ink)} strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** the quiet mark beside the one session's name, and its card on a press */
export function KeptMark({ kept, rows, now, pressing, err, onRenew }: { kept: Kept | null; rows: RosterRow[]; now: number; pressing: boolean; err?: string; onRenew: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!at) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setAt(null); btn.current?.focus(); } };
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !document.querySelector(".okept-card")?.contains(t)) setAt(null); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", away);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", away); };
  }, [at]);
  if (!kept) return null;
  const f = fillOf(kept), q = quietOf(kept, now), s = stateOf(kept, now);
  // the small ring pours in twentieths (a new pour each change), and a sliver once anything is counted
  const small = f.counted && f.fill > 0 ? Math.max(0.04, Math.round(f.fill * 20) / 20) : 0;
  return (<>
    <button ref={btn} type="button" className={`okept${s.kind === "renewing" && !s.stale ? " renewing" : ""}`} aria-label={`how it is kept: ${q.label}`} title={q.label} aria-expanded={!!at}
      onClick={() => (at ? setAt(null) : setAt(btn.current?.getBoundingClientRect() ?? null))}>
      <RingAt size={24} value={small} at={f.at} />
    </button>
    {at && createPortal(<KeptCard r={at} kept={kept} rows={rows} now={now} pressing={pressing} err={err} onRenew={onRenew} />, document.body)}
  </>);
}

// a handover's line: two lines of it at most, the whole on a press (a handover is long; what crossed should scan)
function LineEl({ l }: { l: Line }) {
  const [whole, setWhole] = useState(false);
  if (l.head) return <div style={{ ...label, color: dim, marginTop: 4 }}>{l.text}</div>;
  return (
    <div className={`okept-line${whole ? " whole" : ""}`} style={{ color: dim }} tabIndex={0} aria-expanded={whole} onClick={() => setWhole((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setWhole((v) => !v); } }}>
      {l.lead && <b style={{ fontWeight: 500, color: ink }}>{l.lead} </b>}{l.text}
    </div>
  );
}

export function KeptCard({ r, kept, rows, now, pressing, err, onRenew }: { r: DOMRect; kept: Kept; rows: RosterRow[]; now: number; pressing: boolean; err?: string; onRenew: () => void }) {
  const f = fillOf(kept), s = stateOf(kept, now), rs = renewalsOf(kept.renewals, now), runs = runsOf(kept.runs, rows), homes = homesOf(kept.homes);
  const [open, setOpen] = useState<number | null>(null);
  const can = canRenew(kept, now, pressing);
  const left = Math.max(8, Math.min(r.left - 8, innerWidth - 8 - W)), top = r.bottom + 8;
  const head = (words: string) => <div style={{ ...label }}>{words}</div>;
  return (
    <div className="okept-card" role="dialog" aria-label="how the one session is kept" style={{ left, top, maxHeight: innerHeight - top - 12 }}>
      <Card w={W} step="pop">
        <div className="okept-in" style={{ padding: PAD, maxHeight: innerHeight - top - 12, color: ink, fontFamily: TYPE.family, fontSize: TYPE.body[0], lineHeight: `${TYPE.body[1]}px` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <RingAt size={56} value={f.fill} at={f.at} />
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px`, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{f.counted ? `${f.pct}%` : "–"}</b>
                <span style={{ fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px`, color: dim }}>{f.word}</span>
              </div>
              <span style={{ ...label }}>renews itself at {f.atPct}%, a fresh copy from its handover</span>
            </div>
          </div>

          {s.kind !== "kept" && (
            <div className="okept-state" role="status">
              <i className={dotOf(s.kind === "renewing" && !s.stale)} />
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ color: ink }}>{s.line}</span>
                {s.kind === "failed" && <span style={{ ...label, color: dim }}>{s.why}</span>}
              </div>
            </div>
          )}

          <div className="okept-sec">
            {head(rs.length ? `renewals · ${rs.length}` : "no renewal yet")}
            {rs.map((x) => (
              <div key={x.n} data-renewal={x.n}>
                <Row w={IN + 24} h={48} title={x.when} note={x.note} aside={x.why} hover={open === x.n ? true : undefined}
                  lead={<span className="okept-fold" style={{ color: mute, transform: open === x.n ? "rotate(90deg)" : undefined }}>›</span>}
                  onClick={() => setOpen((o) => (o === x.n ? null : x.n))} />
                {open === x.n && (
                  <div className="okept-open">
                    <div className="okept-lines">{head(`carried over · ${x.carried.length}`)}{x.carried.map((l, i) => <LineEl key={i} l={l} />)}</div>
                    <div className="okept-lines">{head(`left out on purpose · ${x.dropped.length}`)}{x.dropped.length ? x.dropped.map((l, i) => <LineEl key={i} l={l} />) : <div style={{ color: mute }}>nothing</div>}</div>
                    <div style={{ ...label }}>{x.with}</div>
                    <div style={{ ...label }} title={x.file}>the handover · <span className="okept-path">{x.file.split("/").slice(-1)[0]}</span></div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="okept-sec">
            {head("it runs")}
            <div style={{ color: runs.count ? ink : dim }}>{runs.line}</div>
            {runs.titles.length > 0 && <div style={{ color: dim }}>{runs.titles.join(" · ")}</div>}
            {runs.count > runs.titles.length && runs.titles.length > 0 && <div style={{ ...label }}>{runs.count - runs.titles.length} not in this window's list</div>}
          </div>

          <div className="okept-sec">
            {head("written in")}
            {homes.map((h) => (
              <div key={h.name} className="okept-home" title={h.full}>
                <span style={{ color: ink }}>{h.name}</span>
                <span style={{ ...label }}>{h.holds}</span>
                <span className="okept-path" style={{ ...label, color: mute }}>{h.path}</span>
              </div>
            ))}
          </div>

          {err && <div role="alert" style={{ ...label, color: "#ffb3c9" }}>{err}</div>}
          <div className="okept-foot">
            <span style={{ ...label }}>{can ? "starts a fresh copy from a handover it writes now" : s.kind === "renewing" ? "one renewal at a time" : ""}</span>
            <span aria-disabled={!can} style={can ? undefined : { opacity: 0.4, pointerEvents: "none" }}>
              <Button h={28} flat acts onClick={() => can && onRenew()}>{renewWord(kept, now, pressing)}</Button>
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** the state line's dot: the live green while it renews, else the failed one (one class each, never worn together) */
const dotOf = (renewing: boolean) => (renewing ? "g-dot live" : "o-dot failed");

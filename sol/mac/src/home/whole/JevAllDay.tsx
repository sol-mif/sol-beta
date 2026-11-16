// Jev, all day (#803, plan Part C slice 40; flows.md "Jev, all day", pick 4 a "drag the line"; the still
// home/shots/flows-8.png), behind sol.home.whole. Face half; engine half #832. Home's place under Sources:
// - the one line ("Jev read 101 things today. It let 30 through, held 71; you overrode it 4 times.");
// - the day's reads as dots on a line of time (through filled, held hollow, overrode in yellow);
// - one row per question: where it asks, its distribution (each read a dot at its probability), its line, and "through ·
//   held · you". Dragging the line (or ←/→ on it) counts what would have passed, live, in the row and in the one line;
//   letting go sets it (`judge.line.set`), with a receipt and undo (⌘Z too);
// - the one suggestion an override earns (flows.md "Decisions" 8), never any other.
// Drawn from the kit (Glass, Button, Home's warm answer); whole-jev.css lays it out.
import { useEffect, useRef, useState } from "react";
import { Button, Glass, useSize } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, JELLY } from "../../kit/tokens";
import { Warm } from "./First";
import { countsAt, dayLine, lineWord, snap, suggestionOf, suggestionWords, type JudgeQuestion, type JudgeRead } from "./judge";
import { keepLine, setLine, undoLine, useJudge, useKept } from "./judgeStore";
import { goTo } from "./sourcesStore";
import "../whole-jev.css";

const SUN = JELLY.warm[3];
const DOT = 6, RING = 9;   // a read's dot; an override's ring, a step larger (scene 8)
const jitter = (i: number, h: number) => ((i * 37) % 11 - 5) / 5 * h;   // a steady spread so dots at one p do not hide each other

function Dot({ r, x, y, through }: { r: JudgeRead; x: number; y: number; through: boolean }) {
  const over = !!r.overriddenBy, s = over ? RING : DOT;
  return <span className="hjev-dot" data-read={r.thingId} data-over={over || undefined} title={`${r.label} · ${lineWord(r.p)}${over ? ` · you: ${r.overriddenBy!.to}${r.overriddenBy!.outcome ? `, a ${r.overriddenBy!.outcome}` : ""}` : ""}`}
    style={{ left: x - s / 2, top: y - s / 2, width: s, height: s, background: through && !over ? ink : "transparent", borderColor: over ? SUN : through ? ink : on(0.45) }} />;
}

/** a question's distribution and its line; the line drags */
function Dist({ q, reads, line, onDrag, onSet }: { q: JudgeQuestion; reads: JudgeRead[]; line: number; onDrag: (l: number | null) => void; onSet: (l: number) => void }) {
  const box = useRef<HTMLDivElement>(null), [w, h] = useSize(box);
  // a press arms; only a press on the line, or a real move, drags (C40-3): a press on a dot reads its title, sets nothing
  const press = useRef<{ x: number; dragging: boolean } | null>(null);
  const at = (clientX: number) => { const r = box.current!.getBoundingClientRect(); return snap((clientX - r.left) / r.width); };
  return (
    <div className="hjev-dist" ref={box} data-dist={q.id}
      onPointerDown={(e) => {
        const onLine = (e.target as HTMLElement).closest(".hjev-line") !== null;
        press.current = { x: e.clientX, dragging: onLine };
        box.current!.setPointerCapture(e.pointerId);
        if (onLine) onDrag(at(e.clientX));
      }}
      onPointerMove={(e) => {
        const p = press.current; if (!p) return;
        if (!p.dragging && Math.abs(e.clientX - p.x) >= DOT) p.dragging = true;
        if (p.dragging) onDrag(at(e.clientX));
      }}
      onPointerUp={(e) => { const p = press.current; press.current = null; if (!p?.dragging) return; onDrag(null); onSet(at(e.clientX)); }}
      onPointerCancel={() => { press.current = null; onDrag(null); }}>
      {w > 0 && <>
        <span className="hjev-axis" style={{ background: on(0.1) }} />
        {reads.map((r, i) => <Dot key={r.thingId} r={r} x={r.p * w} y={h / 2 + jitter(i, h / 4)} through={r.p >= line} />)}
        <span className="hjev-line" role="slider" tabIndex={0} aria-label={`the line for “${q.text}”`} aria-valuemin={0.05} aria-valuemax={0.95} aria-valuenow={line} data-line-at={line}
          style={{ left: line * w, background: ink }}
          onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onSet(snap(line + (e.key === "ArrowLeft" ? -0.01 : 0.01))); } }}>
          <i style={{ color: ink }}>{lineWord(line)}</i>
        </span>
      </>}
    </div>
  );
}

function DayStrip({ reads, lines, day, now }: { reads: JudgeRead[]; lines: Map<string, number>; day: number; now: number }) {
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  const from = day + 7 * 36e5, to = Math.max(now, day + 21 * 36e5), x = (t: number) => ((t - from) / (to - from)) * w;
  return (
    <div className="hjev-day" ref={box} data-day-strip>
      {w > 0 && <>
        <span className="hjev-axis" style={{ background: on(0.1) }} />
        {reads.map((r, i) => <Dot key={r.thingId} r={r} x={x(r.at)} y={12 + jitter(i, 4)} through={r.p >= (lines.get(r.questionId) ?? r.line)} />)}
        {[8, 10, 12, 14, 16, 18, 20].map((hh) => <span key={hh} className="hjev-tick" style={{ left: x(day + hh * 36e5), color: mute }}>{hh}:00</span>)}
        <span className="hjev-now" style={{ left: Math.min(w, x(now)), color: mute }}>now</span>
      </>}
    </div>
  );
}

export function JevAllDay() {
  const v = useJudge();
  const [drag, setDrag] = useState<{ q: string; line: number } | null>(null);
  const kept = useKept();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(i); }, []);
  const done = v?.done ?? null;
  useEffect(() => {
    if (!done) return;
    const k = (ev: KeyboardEvent) => { if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") { ev.preventDefault(); undoLine(done.ledgerId); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [done]);
  if (!v) return null;
  // while a line is dragged, everything counts at it: the row and the one line
  const qs = v.questions.map((q) => (drag?.q === q.id ? { ...q, line: drag.line } : q));
  const lines = new Map(qs.map((q) => [q.id, q.line]));
  const [first, second] = dayLine(qs, v.reads);
  const sugg = v.questions.map((q) => ({ q, s: suggestionOf(q, v.reads) })).find((x) => x.s && !kept.has(x.q.id) && x.q.line !== x.s.line);
  return (
    <section className="hw hjev" data-place="talk" data-home-whole data-jev>
      <div className="hw-date" style={{ color: mute }}>
        <button type="button" className="hjev-back" style={{ color: dim }} onClick={() => goTo("sources")}>Sources</button> › Jev, the judge · today
      </div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
      <DayStrip reads={v.reads} lines={lines} day={v.day} now={now} />
      <div className="hjev-rows">
        <div className="hjev-row hjev-heads" style={{ color: mute }}>
          <span>the question · where it asks</span>
          <span className="hjev-scale"><span>← held · unsure</span><span>drag the line</span><span>sure · let through →</span></span>
          <span>today</span>
        </div>
        {qs.map((q) => {
          const mine = v.reads.filter((r) => r.questionId === q.id), c = countsAt(mine, q.line), moving = drag?.q === q.id;
          return (
            <div key={q.id} className="hjev-row" data-question={q.id} data-dragging={moving || undefined}>
              <span className="hjev-q"><span style={{ color: ink }}>{q.text}</span><small style={{ color: mute }}>{q.where} · {q.type === "noul" ? "yes or no" : q.type}</small></span>
              <Dist q={q} reads={mine} line={q.line} onDrag={(l) => setDrag(l === null ? null : { q: q.id, line: l })} onSet={(l) => setLine(q.id, l)} />
              <span className="hjev-counts" data-counts={q.id} style={{ color: dim }}>
                {moving ? "would pass" : "through"} <b style={{ color: ink }}>{c.through}</b> · held <b style={{ color: ink }}>{c.held}</b> · <span style={{ color: SUN }}>you {c.you}</span>
              </span>
            </div>
          );
        })}
      </div>
      {done && (
        <div className="hjev-receipt" data-receipt="judge" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          <button type="button" className="hjev-undo" style={{ color: ink }} onClick={() => undoLine(done.ledgerId)}>undo</button>
        </div>
      )}
      {sugg && sugg.s && (
        <div className="hjev-sugg" data-suggestion={sugg.q.id}>
          <Glass r={CURVE.radius.row} step="raised" />
          <span style={{ color: SUN }}>◇</span>
          <span className="hjev-sugg-t" style={{ color: ink }}>{suggestionWords(sugg.q, sugg.s)}</span>
          <Warm h={28} onClick={() => setLine(sugg.q.id, sugg.s!.line)}>{sugg.s.line < sugg.q.line ? "lower it" : "raise it"}</Warm>
          <Button h={28} onClick={() => keepLine(sugg.q.id)}>{`keep ${lineWord(sugg.q.line)}`}</Button>
        </div>
      )}
    </section>
  );
}

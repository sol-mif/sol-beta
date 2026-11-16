// Three calendars as one (#807, plan Part C slice 44; flows.md "Three calendars as one"; the still
// home/shots/flows-6.png), behind sol.home.whole. Face half; engine half #835. Home's place "the week":
// - the one line ("One day, three calendars. One clash.") and the three layers as chips (school, building, cowork);
//   a press dims a layer, so the others stand out;
// - one day line from morning to midnight: each layer's spans and moments, a band around it that widens where the day
//   is fuller, now, and the team's free windows under it (Frank, Isaac);
// - the clash code found, as a card with the fixes Jev ranked and its pick as the warm answer (`cal.fix.keep`);
// - the week, all three, a strip of days;
// - a box on a clear floor at the foot (Say's, #891): a sentence finds the team a slot on everyone's free time and writes it to the room calendar (`cal.place`).
// What was just done stays at the foot with its undo (⌘Z too). Drawn from the kit (Card, Glass, Button, Home's warm
// answer); whole-calendars.css lays it out.
import { useEffect, useRef, useState } from "react";
import { Button, Card, Glass, useSize } from "../../kit";
import { dim, ink, jellyBands, mute, on, pearl, textW } from "../../kit/paint";
import { CURVE, JELLY, TYPE } from "../../kit/tokens";
import { Glyph, Warm } from "./First";
import { calLine, dayName, hm, loadAt, type CalEvent, type Conflict, type LayerId } from "./cal";
import { keepFix, place, undoCal, useCal } from "./calStore";
import "../whole-calendars.css";

const W4 = JELLY.warm[3], GREEN = JELLY.six[5], RED = JELLY.six[0];
/** each layer's colour (flows.md: school pearl, building warm, cowork green) */
export const PAINT: Record<LayerId, string> = { school: pearl(0.86), building: jellyBands(JELLY.warm), cowork: `linear-gradient(90deg, ${GREEN}, ${W4})` };
const FROM_H = 7, TO_H = 24.5, LINE = 120, ROWS = [-30, 14, -46, 30];   // the day line's span and its y; label rows, above and below, then further out
const startOf = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

function DayLine({ events, team, day, now, off, clash }: { events: CalEvent[]; team: { who: string; windows: { at: number; end: number }[] }[]; day: number; now: number; off: Set<LayerId>; clash: Set<string> }) {
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  const x = (t: number) => ((t - day) / 36e5 - FROM_H) / (TO_H - FROM_H) * w;
  const today = events.filter((e) => startOf(e.at) === day);
  // the band: thicker where the day is fuller (flows.md "a load band")
  const pts: string[] = [], back: string[] = [], ends: number[] = [];
  if (w > 0) for (let k = 0; k <= 175; k++) { const t = day + (FROM_H + k / 10) * 36e5, half = 6 + loadAt(t, today) * 13; pts.push(`${x(t).toFixed(1)},${LINE - half}`); back.unshift(`${x(t).toFixed(1)},${LINE + half}`); }
  return (
    <div className="hcal-day" ref={box} data-day-line>
      {w > 0 && <>
        <svg className="hcal-band" width={w} height={LINE * 2} aria-hidden><polygon points={[...pts, ...back].join(" ")} fill={pearl(0.05)} stroke={pearl(0.12)} /></svg>
        <div className="hcal-axis" style={{ top: LINE, background: on(0.1) }} />
        {[8, 10, 12, 14, 16, 18, 20, 22, 24].map((h) => <span key={h} className="hcal-tick" style={{ left: x(day + h * 36e5), color: mute }}>{h === 24 ? "0:00" : `${h}:00`}</span>)}
        {today.sort((a, b) => a.at - b.at).map((e) => {
          const dimmed = off.has(e.layer), isClash = clash.has(e.id), words = isClash ? `${e.title} · clash` : e.title;
          // the first row whose last label ends before this one starts (fit or drop: never two labels on each other)
          const left = x(e.at), right = left + textW(words, TYPE.label[0], 400) + 8;
          let r = ROWS.findIndex((_, k) => (ends[k] ?? -Infinity) < left);
          if (r < 0) r = ROWS.length - 1;
          ends[r] = right;
          const label = <span key={`${e.id}-l`} className="hcal-label" data-l={e.layer} data-dim={dimmed || undefined} style={{ left, top: LINE + ROWS[r], color: isClash ? RED : dim }}>{words}</span>;
          if (e.end === undefined) return [label, <span key={e.id} className="hcal-pin" data-event={e.id} data-l={e.layer} data-dim={dimmed || undefined} style={{ left: x(e.at), top: LINE, background: isClash ? RED : e.layer === "cowork" ? GREEN : pearl(0.9) }} />];
          return [label, <span key={e.id} className="hcal-cap" data-event={e.id} data-l={e.layer} data-dim={dimmed || undefined}
            style={{ left: x(e.at), width: Math.max(4, x(e.end) - x(e.at)), top: LINE, background: PAINT[e.layer], outlineColor: e.dashed ? on(0.6) : undefined }} />];
        })}
        {now >= day && now < day + 864e5 && <span className="hcal-now" style={{ left: x(now), background: `linear-gradient(${ink}, ${on(0.15)})` }}><i style={{ color: ink }}>now</i></span>}
        {team.map((m, i) => m.windows.filter((v) => startOf(v.at) === day).map((v) => (
          <span key={`${m.who}-${v.at}`} className="hcal-win" data-who={m.who} data-dim={off.has("cowork") || undefined}
            style={{ left: x(v.at), width: x(v.end) - x(v.at), height: 2, top: LINE + 64 + i * 16, background: i === 0 ? GREEN : W4 }}>
            <i style={{ color: mute }}>{m.who}</i>
          </span>
        )))}
        <span className="hcal-night" style={{ color: mute }} data-dim={off.has("cowork") || undefined}>and at 3:00 the night job, without you</span>
      </>}
    </div>
  );
}

function Week({ events, day, now, off }: { events: CalEvent[]; day: number; now: number; off: Set<LayerId> }) {
  const days = Array.from({ length: 7 }, (_, i) => day + i * 864e5);
  return (
    <div className="hcal-week" data-week>
      {days.map((d) => {
        const es = events.filter((e) => startOf(e.at) === d);
        const by = (l: LayerId) => es.filter((e) => e.layer === l).length;
        const placed = es.filter((e) => e.id.startsWith("c-placed"));
        return (
          <div key={d} className="hcal-wd" data-wd={dayName(d, now)}>
            <span className="hcal-wh" style={{ color: d === day ? ink : mute }}>{d === day ? "today" : new Date(d).toLocaleDateString("en-GB", { weekday: "short" })}</span>
            {(["school", "building", "cowork"] as LayerId[]).map((l) => by(l) > 0 && <span key={l} className="hcal-wbar" data-l={l} data-dim={off.has(l) || undefined} style={{ width: `${Math.min(100, by(l) * 28)}%`, background: PAINT[l] }} />)}
            {placed.map((p) => <span key={p.id} className="hcal-placed" data-placed={p.id} style={{ color: ink }}>{p.title}</span>)}
          </div>
        );
      })}
    </div>
  );
}

function Clash({ c, layers }: { c: Conflict; layers: string }) {
  const pick = c.fixes.find((f) => f.kind === c.picked)!;
  const [left, setLeft] = useState(false);
  if (left) return null;
  return (
    <Card w={560} step="pop">
      <div className="hcal-card" data-clash={c.id}>
        <div className="hcal-meta" style={{ color: dim }}><Glyph source="calendar" /><span>your day</span><span>·</span><span>{layers}</span>{/* the two events' own layers (#878 R4) */}
          <span className="hcal-when" style={{ color: W4 }}>tonight {hmOf(c)}</span></div>
        <div className="hcal-title t-title" style={{ color: ink }}>{c.title}</div>
        <div className="hcal-why" style={{ color: dim }}>{c.why}</div>
        <div className="hcal-fixes">{c.fixes.map((f) => (
          <span key={f.kind} className="hcal-fix" data-fix={f.kind} data-picked={f.kind === c.picked || undefined} style={{ color: f.kind === c.picked ? ink : dim }}>
            <Glass r={CURVE.radius.chip} step="card" />◇ {f.label} {String(f.p.toFixed(2)).replace(/^0/, "")}
          </span>))}</div>
        <div className="hcal-acts">
          <Warm h={36} onClick={() => keepFix(c.id, pick.kind)}>{pick.label}</Warm>
          <Button h={36} onClick={() => setLeft(true)}>leave it</Button>
        </div>
      </div>
    </Card>
  );
}
const hmOf = (c: Conflict) => (c.why.match(/is (\d+:\d+)/)?.[1] ?? "");

export function ThreeCalendars() {
  const v = useCal();
  const [off, setOff] = useState<Set<LayerId>>(new Set());
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(i); }, []);
  const done = v?.done ?? null;
  useEffect(() => {
    if (!done?.ledgerId) return;
    const k = (ev: KeyboardEvent) => { if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z" && !(ev.target as HTMLElement)?.closest?.("input")) { ev.preventDefault(); undoCal(done.ledgerId); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [done]);
  if (!v) return null;
  const [first, second] = calLine(v.conflicts);
  const clash = new Set(v.conflicts.map((c) => c.b));
  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const flip = (l: LayerId) => setOff((s) => { const n = new Set(s); if (n.has(l)) n.delete(l); else n.add(l); return n; });
  const send = () => { if (text.trim()) { place(text); setText(""); } };
  return (
    <section className="hw hcal" data-place="talk" data-home-whole data-calendars>
      <div className="hw-date" style={{ color: mute }}>the week · three calendars as one · {date} · {hm(now)}</div>
      <div className="hcal-head">
        <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
        <div className="hcal-layers" role="group" aria-label="the layers">
          {v.layers.map((l) => (
            <button key={l.id} type="button" className="hcal-layer" data-layer={l.id} aria-pressed={!off.has(l.id)} title={l.sources.join(" · ")} onClick={() => flip(l.id)} style={{ color: off.has(l.id) ? mute : ink }}>
              <Glass r={CURVE.radius.chip} step="card" /><i style={{ background: PAINT[l.id], opacity: off.has(l.id) ? 0.3 : 1 }} />{l.name}
            </button>
          ))}
        </div>
      </div>
      <DayLine events={v.events} team={v.team} day={v.day} now={now} off={off} clash={clash} />
      <div className="hcal-under">
        <div className="hcal-cards">{v.conflicts.map((c) => <Clash key={c.id} c={c} layers={[c.a, c.b].map((id) => v.events.find((e) => e.id === id)?.layer ?? "your day").join(" × ")} />)}</div>
        <div className="hcal-weekbox"><div className="hcal-wl" style={{ color: mute }}>the week, all three</div><Week events={v.events} day={v.day} now={now} off={off} /></div>
      </div>
      {done && done.line && (
        <div className="hcal-receipt" data-receipt="cal" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          {done.ledgerId && <button type="button" className="hcal-undo" style={{ color: ink }} onClick={() => undoCal(done.ledgerId)}>undo</button>}
        </div>
      )}
      {/* the box on a clear floor, as Say's (#891): the cards scroll under it, never under the box's words */}
      <div className="hcal-foot" data-cal-foot>
        <div className="hcal-box" data-cal-box>
          <Glass r={CURVE.radius.field} step="card" />
          <input className="hcal-input" value={text} placeholder="a time with the team: who, how long, when" aria-label="find the team a slot" style={{ color: ink, fontSize: TYPE.read[0] }}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} />
          <span className="hcal-hint" style={{ color: mute }}>↵ places it, on everyone’s free time</span>
          <button type="button" className="hcal-send" aria-label="place it" style={{ color: text.trim() ? ink : mute }} onClick={send}>↑</button>
        </div>
      </div>
    </section>
  );
}

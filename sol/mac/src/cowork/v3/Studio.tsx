// Cowork v3, slice 6 (fr-30, #559): the studio, and the nights as automations. A project's Automations room: our three
// nights on one line through the day (the dev night, the release, the morning, each with its next run, read from
// today's timers), then the rest as cards, then "Draw a new one". Opening one gives it the whole stage: its name, the
// two marks, the words as they are stored, and the flow drawn as pictures (parts as nodes, one line between), made by
// saying it or by dragging parts in from the palette; the run log under it, the budget line, and the owner's-yes card
// when a part would write to a place someone else connected. Loaded only with the switch on (flag.ts).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Body } from "../bits";
import { Glyph } from "../Room";
import { ask, readList, useCounts, useStudio, write, type Ask, type Automation, type Part, type Run, type Step } from "./studioApi";
import "./studio.css";

// ---- the parts, as pictures (the prototype's, rooms-home.js PARTS) ----
const PICS: Record<Part, string> = {
  when: '<circle cx="20" cy="20" r="13"/><path d="M20 12v8l5.5 3.5"/>',
  gather: '<circle cx="11" cy="8.5" r="2.3"/><circle cx="20" cy="6.5" r="2.3"/><circle cx="29" cy="8.5" r="2.3"/><path d="M12.5 11.5 18 20M20 9.5V20M27.5 11.5 22 20"/><path d="M8.5 23.5h23v5a4.5 4.5 0 0 1-4.5 4.5H13a4.5 4.5 0 0 1-4.5-4.5z"/>',
  ask: '<path d="M9 8h22a3.5 3.5 0 0 1 3.5 3.5v11A3.5 3.5 0 0 1 31 26H19l-7 6v-6H9a3.5 3.5 0 0 1-3.5-3.5v-11A3.5 3.5 0 0 1 9 8z"/><path d="M17.2 14.6a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.8-1.1 1.6"/><circle cx="20" cy="21.6" r=".5" fill="currentColor"/>',
  wait: '<path d="M12 6h16M12 34h16"/><path d="M14 6c0 8 12 8 12 14s-12 6-12 14M26 6c0 8-12 8-12 14s12 6 12 14"/><path d="M16.5 31h7"/>',
  summarize: '<path d="M6 10h17M6 16h13M6 22h16M6 28h10"/><path d="M26 19h9M31.5 15l3.5 4-3.5 4"/>',
  send: '<path d="M6 19.5 34 7l-9 26-6-11z"/><path d="M19 22 34 7"/>',
  if: '<path d="M20 5l14 14-14 14L6 19z"/><path d="M15.5 19h9"/>',
};
const PART_NAME: Record<Part, string> = { when: "When", gather: "Gather", ask: "Ask someone", wait: "Wait for", summarize: "Summarize", send: "Send", if: "If, then" };
const PART_DEF: Record<Part, string> = { when: "every Friday 16:00", gather: "what changed", ask: "Frank", wait: "an answer", summarize: "in a few lines", send: "Talk", if: "something is red" };
const PALETTE: Part[] = ["when", "gather", "ask", "wait", "summarize", "send", "if"];
const Pic = ({ part, size = 30 }: { part: Part; size?: number }) => (
  <svg viewBox="0 0 40 40" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: PICS[part] ?? PICS.gather }} />
);

// ---- words ----
const PLACE_WORD: Record<string, string> = { talk: "Talk", drive: "Drive", github: "GitHub", calendar: "the calendar", email: "email", chat: "the chat", record: "the record" };
const placeGlyph = (p: string) => (({ record: "file", github: "github", drive: "doc", talk: "decisions", chat: "decisions", calendar: "calendar", email: "web" } as Record<string, string>)[p] ?? "file");
const who = (login: string, me: string) => (login && me && login.toLowerCase() === me.toLowerCase() ? "you" : login.split("-")[0]);
const whose = (login: string, me: string) => (who(login, me) === "you" ? "your" : `${who(login, me)}’s`);
const money = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
const clock = (t: Date) => `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
function when(at: number | string | undefined): string {
  if (at === undefined) return "";
  const t = new Date(at), now = new Date();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const k = Math.round((day(t) - day(now)) / 86_400_000);
  return `${k === 0 ? "today" : k === 1 ? "tomorrow" : k === -1 ? "yesterday" : t.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${clock(t)}`;
}
function ago(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : when(at);
}
const NIGHT_WORD = { night: "the night", release: "the release", morning: "the morning" } as const;

/** the two marks every thing carries: whose face, where it lives */
const Marks = ({ login, place }: { login: string; place: string }) => (
  <span className="v3s-marks"><Body login={login} size={16} /><span className="where" title={PLACE_WORD[place] ?? place}><Glyph kind={placeGlyph(place)} size={14} /></span></span>
);

/** the budget line: a run, the month, of the limit, whose subscription pays */
function SpendLine({ au, me, compact }: { au: Automation; me: string; compact?: boolean }) {
  const s = au.spendNow;
  const pays = who(s.who, me) === "you" ? "you pay" : `${who(s.who, me)} pays`;
  if (s.limit === 0) return <div className="v3s-spend" title="what the agent spent running it"><span className="bar"><i style={{ width: "0%" }} /></span>
    <span>no agent spend: it runs a script · {pays === "you pay" ? "yours" : `${who(s.who, me)}’s`} machine time</span></div>;
  const k = Math.min(1, s.month / (s.limit || 1));
  return (
    <div className={`v3s-spend ${k >= 1 ? "over" : ""}`} title="what the agent spent running it">
      <span className="bar"><i style={{ width: `${Math.max(3, Math.round(k * 100))}%` }} /></span>
      <span>{compact ? "" : `${money(s.run)} a run · `}{money(s.month)} this month of {money(s.limit)} · {pays}</span>
    </div>
  );
}

/** a yes that waits on me: someone's automation would write to a place I connected. Ember: it needs me */
function YesCard({ a, project, me }: { a: Ask; project: string; me: string }) {
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (gone) return null;
  return (
    <div className="v3s-yes" role="alert">
      <span className="dot" aria-hidden="true" />
      <Body login={a.by} size={22} />
      <div className="l">
        <b>{who(a.by, me)}’s “{a.name}” wants to write to {whose(a.to, me)} {PLACE_WORD[a.place] ?? a.place}</b>
        <span>It waits on its {a.step + 1}th part until you say yes. Once is enough; you can take it back on Places.</span>
      </div>
      <button className="v3s-press ink" disabled={busy} onClick={async () => { setBusy(true); const r = await write("yes", { project, ask: a.event }); setBusy(false); if (!r.error) setGone(true); }}>Yes</button>
      <button className="v3s-press ghost" onClick={() => setGone(true)}>Not now</button>
    </div>
  );
}

/** the flow, small: its parts as pictures on a hairline (cards) */
const MiniFlow = ({ flow }: { flow: Step[] }) => (
  <div className="v3s-mini">{flow.map((f, i) => <span key={i} className="mf">{i > 0 && <i className="ln" />}<span className="pic" title={`${PART_NAME[f.part]}: ${f.label}`}><Pic part={f.part} size={17} /></span></span>)}</div>
);

function Card({ au, me, onOpen }: { au: Automation; me: string; onOpen: () => void }) {
  const waitingYes = au.needsYes.length > 0 || au.last?.state === "waiting";
  return (
    <div className={`v3s-card ${au.on ? "" : "off"}`} onClick={onOpen} title="open it in the studio" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="top"><span className="n">{au.name}</span><span className={`on ${au.on ? "yes" : ""}`} title={au.on ? "on" : "paused"} /></div>
      <MiniFlow flow={au.flow} />
      <div className="words">{au.words || "nothing said yet"}</div>
      <div className="foot">
        <Marks login={au.owner} place={au.night ? "github" : "record"} />
        <span className="quiet">{au.night && au.next ? `next ${when(au.next)}` : au.last ? `ran ${ago(au.last.at)}` : "not run yet"}</span>
        {waitingYes && <span className="v3s-chip">{au.last?.state === "waiting" && au.last.waitingFor ? `waiting for ${who(au.last.waitingFor.to, me)}’s yes` : `needs ${who(au.needsYes[0].to, me)}’s yes`}</span>}
      </div>
      <SpendLine au={au} me={me} compact />
    </div>
  );
}

/** our nights on one line through the day: a stop each, its hour, its next run, its card */
function Nights({ nights, me, onOpen }: { nights: Automation[]; me: string; onOpen: (id: string) => void }) {
  if (!nights.length) return null;
  return (
    <section className="v3s-sec">
      <h2>Our nights</h2>
      <p className="sub">Three automations carry the day’s work through the night and hand it back in the morning. Their timers and scripts are today’s, on the NucBox; here they are drawn, and pressed by hand they only try.</p>
      <div className="v3s-arc" style={{ gridTemplateColumns: `repeat(${nights.length}, 1fr)` }}>
        <div className="line" aria-hidden="true" />
        {nights.map((n) => (
          <div key={n.id} className="stop">
            <div className="time"><span className={`dot ${n.night === "night" ? "moon" : ""}`} />{n.calendar?.match(/(\d{2}:\d{2})/)?.[1]}<span className="quiet">{NIGHT_WORD[n.night!]}</span></div>
            <Card au={n} me={me} onOpen={() => onOpen(n.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** the agent at hand: one small field per room; it proposes, it never opens anything by itself */
function AgentAtHand({ onDraw }: { onDraw: (words: string) => void }) {
  const [t, setT] = useState("");
  const [offer, setOffer] = useState<string | null>(null);
  return (
    <div className="v3s-hand">
      {offer && <div className="offer"><span>Draw “{offer.length > 52 ? offer.slice(0, 50) + "…" : offer}” in the studio?</span>
        <button className="v3s-press ink" onClick={() => { onDraw(offer); setOffer(null); setT(""); }}>Draw it</button>
        <button className="v3s-press ghost" onClick={() => setOffer(null)}>Not this</button></div>}
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Every Friday, sum up the week into Talk" spellCheck={false}
        onKeyDown={(e) => { if (e.key === "Enter" && t.trim()) setOffer(t.trim()); }} aria-label="say what an automation should do" />
    </div>
  );
}

// ---- the studio itself ----

type Draft = { id: "new"; words: string; flow: Step[] };

function Canvas({ flow, own, results, running, preview, onPoke, onInsert }: {
  flow: Step[]; own: boolean; results: string[]; running: boolean; preview: boolean;
  onPoke: (i: number, label: string | null) => void; onInsert: (part: Part, at: number) => void;
}) {
  const boxes = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; x: number; y: number }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [edit, setEdit] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ part: Part; x: number; y: number; at: number | null; caret: { x: number; y: number } | null } | null>(null);
  const key = flow.map((f) => f.part + f.label).join("|");
  const [drawn, setDrawn] = useState(0);
  useEffect(() => setDrawn((n) => n + 1), [key]);
  const paint = () => {
    const el = boxes.current; if (!el) return;
    const bs = Array.from(el.querySelectorAll<HTMLElement>(".v3s-box"));
    const out: { d: string; x: number; y: number }[] = [];
    for (let i = 0; i < bs.length - 1; i++) {
      const a = bs[i], b = bs[i + 1];
      let d: string, x: number, y: number;
      if (Math.abs(a.offsetTop - b.offsetTop) < 8) { const ay = a.offsetTop + 28; x = b.offsetLeft + 20; y = ay; d = `M${a.offsetLeft + a.offsetWidth - 20} ${ay} L${x} ${y}`; }
      else { const x1 = a.offsetLeft + a.offsetWidth / 2, y1 = a.offsetTop + a.offsetHeight + 2; x = b.offsetLeft + b.offsetWidth / 2; y = b.offsetTop - 2; d = `M${x1} ${y1} C${x1} ${y1 + 30} ${x} ${y - 30} ${x} ${y}`; }
      out.push({ d, x, y });
    }
    setPaths(out); setSize({ w: el.offsetWidth, h: el.offsetHeight });
  };
  useLayoutEffect(paint, [key, edit, results.join("|")]);
  useEffect(() => { const ro = new ResizeObserver(paint); if (boxes.current) ro.observe(boxes.current); return () => ro.disconnect(); }, []);

  // a part from the palette: pressed, it goes on the end; dragged, it goes where the caret is
  const indexAt = (x: number, y: number) => {
    const bs = Array.from(boxes.current?.querySelectorAll<HTMLElement>(".v3s-box") ?? []);
    const cr = canvas.current!.getBoundingClientRect();
    let best = bs.length, bd = 1e9, caret: { x: number; y: number } | null = null;
    bs.forEach((b, i) => {
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dd = Math.hypot(cx - x, (cy - y) * 2);
      if (dd < bd) { bd = dd; best = x < cx ? i : i + 1; caret = { x: (x < cx ? r.left - 12 : r.right + 10) - cr.left, y: r.top - cr.top + 8 }; }
    });
    return { at: best, caret };
  };
  const pick = (e: React.PointerEvent, part: Part) => {
    if (!own) { onPoke(-1, null); return; }
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let moved = false, last: { at: number | null } = { at: null };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true;
      const cr = canvas.current!.getBoundingClientRect();
      const inside = ev.clientX > cr.left && ev.clientX < cr.right && ev.clientY > cr.top - 30 && ev.clientY < cr.bottom + 20;
      const hit = inside ? indexAt(ev.clientX, ev.clientY) : { at: null, caret: null };
      last = { at: inside ? hit.at : null };
      setDrag({ part, x: ev.clientX, y: ev.clientY, at: last.at, caret: hit.caret });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!moved) onInsert(part, flow.length);
      else if (last.at !== null) onInsert(part, last.at);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <>
      <div ref={canvas} className={`v3s-canvas ${drag?.at !== null && drag ? "over" : ""} ${preview ? "preview" : ""} ${running ? "running" : ""}`}>
        {!flow.length && <div className="empty">Drag a part here, or say what should happen.</div>}
        <div ref={boxes} className="boxes" key={drawn}>
          <svg className="lines" width={size.w} height={size.h} aria-hidden="true">
            {paths.map((p, i) => <g key={i} style={{ animationDelay: `${0.22 + (i + 1) * 0.26}s` }}><path d={p.d} pathLength={1} /><circle cx={p.x} cy={p.y} r={2.4} /></g>)}
          </svg>
          {flow.map((f, i) => (
            <div key={i} className="v3s-box" style={{ animationDelay: `${0.1 + i * 0.26}s`, ...(running ? { ["--run-delay" as string]: `${i * 0.5}s` } : {}) }}
              onClick={() => { if (!own) { onPoke(-1, null); return; } if (!preview) setEdit(i); }}>
              <span className="pic"><Pic part={f.part} /></span>
              <span className="pn">{PART_NAME[f.part]}{f.call ? " · a script" : ""}</span>
              {edit === i
                ? <input className="v3s-in" autoFocus defaultValue={f.label} spellCheck={false} title="Enter keeps it; empty takes the part out"
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }}
                    onBlur={(e) => { const v = e.target.value.trim(); setEdit(null); if (v !== f.label) onPoke(i, v); }} />
                : <span className="label">{f.label}</span>}
              {f.call && <code className="call">{f.call.script} {f.call.args.join(" ")}</code>}
              <span className="res" style={{ animationDelay: `${i * 0.12}s` }} key={results[i] ?? ""}>{results[i] ?? ""}</span>
            </div>
          ))}
        </div>
        {drag?.caret && <i className="caret" style={{ left: drag.caret.x, top: drag.caret.y }} />}
      </div>
      <div className={`v3s-palette ${own ? "" : "off"}`} title={own ? "drag a part onto the canvas, or press one to add it at the end" : "copy it to change it"}>
        {PALETTE.map((k) => <div key={k} className="part" onPointerDown={(e) => pick(e, k)}><span className="pic"><Pic part={k} size={26} /></span><span>{PART_NAME[k]}</span></div>)}
      </div>
      {drag && <div className="v3s-ghost" style={{ left: drag.x - 35, top: drag.y - 30 }}><span className="pic"><Pic part={drag.part} size={26} /></span><span>{PART_NAME[drag.part]}</span></div>}
    </>
  );
}

function RunLog({ project, id, me }: { project: string; id: string; me: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => { void ask<{ runs: Run[] }>("log", { project, id }).then((r) => setRuns(r.runs ?? [])); }, [project, id]);
  if (!runs) return <div className="v3s-log"><p className="quiet">reading the trail…</p></div>;
  if (!runs.length) return <div className="v3s-log"><p className="quiet">Not run yet. Each run writes one line per part on the trail, and they show here.</p></div>;
  return (
    <div className="v3s-log">
      {runs.slice(0, 8).map((r) => (
        <div key={r.run} className={`run ${r.state}`}>
          <div className="rh"><Body login={r.by.person} size={14} /><span>{when(r.at)}</span><span className="quiet">· {who(r.by.person, me)} · {r.state === "done" ? "done" : r.state === "waiting" ? "waiting" : "stopped"}{r.cost ? ` · ${money(r.cost)}` : ""}</span></div>
          {r.parts.map((p) => (
            <div key={p.step + p.state} className={`pr ${p.state}`}><span className="pic"><Pic part={p.part} size={15} /></span><span className="pn">{PART_NAME[p.part]}</span><span className="pl">{p.label}</span><span className="pres">{p.result}</span></div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StudioStage({ project, projectName, me, au, draft, onBack, onMade }: {
  project: string; projectName: string; me: string; au: Automation | null; draft: Draft | null; onBack: () => void; onMade: (id: string) => void;
}) {
  const own = au ? au.mine && !au.readonly : true;
  const [words, setWords] = useState("");
  const [preview, setPreview] = useState<Step[] | null>(null);
  const [line, setLine] = useState<{ text: string; copy?: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Run | null>(au?.last ?? null);
  const [log, setLog] = useState(false);
  const [logKey, setLogKey] = useState(0);
  useEffect(() => { setLastRun(au?.last ?? null); }, [au?.last?.run, au?.last?.parts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const flow = preview ?? au?.flow ?? draft?.flow ?? [];
  const results = useMemo(() => { const r: string[] = []; for (const p of lastRun?.parts ?? []) r[p.step] = p.result; return r; }, [lastRun]);

  // words drawn as you type (nothing written until Enter)
  useEffect(() => {
    if (!words.trim()) { setPreview(null); return; }
    const t = window.setTimeout(() => void ask<{ parsed: { flow: Step[] } }>("parse", { words }).then((r) => { if (r.parsed) setPreview(r.parsed.flow); }), 280);
    return () => window.clearTimeout(t);
  }, [words]);
  const notMine = () => setLine({ text: au?.readonly ? `${au.name} is today’s ${au.timer} and ${au.flow.find((f) => f.call)?.call?.script}; it changes in its own PR. You can make your own copy.` : `${who(au?.owner ?? "", me)} made this one, so only ${who(au?.owner ?? "", me)} changes it. You can make your own copy.`, copy: true });

  const save = async (body: { words?: string; flow?: Step[]; name?: string }) => {
    if (!au) {   // a new one is made by its first words or its first part
      const r = await write<{ automation: Automation }>("make", { project, ...body });
      if (r.error) { setLine({ text: r.error }); return; }
      onMade(r.automation.id);
      return;
    }
    const r = await write<{ automation: Automation }>("change", { project, id: au.id, ...body });
    setLine({ text: r.error ?? (body.words ? `Drawn again, ${r.automation.flow.length} parts. Saved; the trail has the change.` : "Saved; the trail has the change.") });
  };
  const said = async () => { const w = words.trim(); if (!w) return; if (au && !own) { notMine(); return; } await save({ words: w }); setWords(""); setPreview(null); };
  const poke = (i: number, label: string | null) => {
    if (i < 0 || !own) { notMine(); return; }
    const next = flow.map((f) => ({ part: f.part, label: f.label, ...(f.place ? { place: f.place } : {}) }));
    if (label === null || label === "") next.splice(i, 1); else next[i] = { ...next[i], label, ...(next[i].part === "send" ? { place: undefined } : {}) };
    void save({ flow: next });
  };
  const insert = (part: Part, at: number) => {
    if (!own) { notMine(); return; }
    const next = flow.map((f) => ({ part: f.part, label: f.label, ...(f.place ? { place: f.place } : {}) }));
    next.splice(at, 0, { part, label: PART_DEF[part] });
    void save({ flow: next });
  };
  const run = async (resume?: string) => {
    if (!au) return;
    setRunning(true); setLine(null);
    const r = await write<{ run: Run }>("run", { project, id: au.id, ...(resume ? { resume } : {}) }, au.night ? 80 * 60_000 : 60_000);
    setRunning(false);
    if (r.error) { setLine({ text: r.error }); return; }
    setLastRun(r.run); setLogKey((k) => k + 1);
    setLine({ text: r.run.state === "waiting" && r.run.waitingFor ? `It waits for ${who(r.run.waitingFor.to, me)}’s yes before it writes to ${PLACE_WORD[r.run.waitingFor.place] ?? r.run.waitingFor.place}. The ask is on ${whose(r.run.waitingFor.to, me)} front.`
      : r.run.state === "failed" ? `It stopped at “${r.run.parts[r.run.parts.length - 1]?.label}”: ${r.run.parts[r.run.parts.length - 1]?.result}` : `Ran “${au.name}” once, by hand. Each part wrote one line on the trail.` });
  };
  const copy = async () => {
    if (!au) return;
    const r = await write<{ automation: Automation }>("copy", { project, id: au.id });
    if (!r.error) onMade(r.automation.id); else setLine({ text: r.error });
  };
  const rename = (v: string) => { if (au && own && v && v !== au.name) void save({ name: v }); };
  const waitingRun = lastRun?.state === "waiting" ? lastRun : null;
  const yesIn = waitingRun && au && au.needsYes.length === 0;   // the owner said yes since: it may go on

  return (
    <div className="v3s-stage">
      <button className="v3s-back" onClick={onBack}>← Automations</button>
      <div className={`v3s-studio ${own ? "" : "theirs"}`}>
        <div className="kicker"><Pic part="when" size={12} />the studio</div>
        <div className="top">
          <div className="name" contentEditable={own && !!au} suppressContentEditableWarning spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
            onBlur={(e) => rename((e.target as HTMLElement).textContent?.trim() ?? "")}>{au?.name ?? "New automation"}</div>
          <span className="v3s-dest">→ {projectName} · Automations</span>
        </div>
        <div className="own">
          <Marks login={au?.owner ?? me} place={au?.night ? "github" : "record"} />
          <span className="quiet">{!au ? "the team’s; you will own it, nobody approves it" : au.readonly ? `${au.note}` : au.mine ? "the team’s; you own it, nobody approves it" : `${who(au.owner, me)} owns it; you can look, or copy it`}</span>
        </div>
        {au?.night && <div className="v3s-next"><span className={`dot ${au.night === "night" ? "moon" : ""}`} />next run {when(au.next)}<span className="quiet">· {au.timer}, OnCalendar {au.calendar}</span></div>}
        <div className="words">{preview ? <span className="quiet">drawn from what you are typing; Enter keeps it</span> : (au?.words || draft?.words) ? `“${au?.words ?? draft?.words}”` : "In words, as it is stored: nothing yet."}</div>
        {own && <input className="v3s-say" value={words} onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void said(); if (e.key === "Escape") setWords(""); }}
          placeholder="Say what it should do · try “every Friday gather what moved and send a summary to Talk”" spellCheck={false} autoFocus={!au} />}
        <Canvas flow={flow} own={own} results={preview ? [] : results} running={running} preview={!!preview} onPoke={poke} onInsert={insert} />
        {line && <div className="v3s-line"><span>{line.text}</span>{line.copy && <button className="v3s-press ink" onClick={copy}>Make my own copy</button>}</div>}
        {au && (
          <div className="foot">
            <span className="quiet">{running ? (au.night ? `running ${au.flow.find((f) => f.call)?.call?.script} --dry-run…` : "running…") : lastRun ? `Last ran ${when(lastRun.at)}.` : "Not run yet."}</span>
            <button className="v3s-press ghost" onClick={() => setLog((o) => !o)}>{log ? "hide the run log" : "the run log"}</button>
            <span className="grow" />
            {waitingRun?.waitingFor && !yesIn && <span className="v3s-chip"><Glyph kind={placeGlyph(waitingRun.waitingFor.place)} size={12} />waiting for {who(waitingRun.waitingFor.to, me)}’s yes · it writes to {PLACE_WORD[waitingRun.waitingFor.place] ?? waitingRun.waitingFor.place}</span>}
            {!waitingRun && au.needsYes.length > 0 && <span className="v3s-chip"><Glyph kind={placeGlyph(au.needsYes[0].place)} size={12} />needs {who(au.needsYes[0].to, me)}’s yes · it writes to {PLACE_WORD[au.needsYes[0].place] ?? au.needsYes[0].place}</span>}
            {au.mine && yesIn && <button className="v3s-press ink" disabled={running} onClick={() => void run(waitingRun!.run)}>{who(waitingRun!.waitingFor?.to ?? "", me)} said yes · Go on</button>}
            {au.mine && !yesIn && <button className="v3s-press ink" disabled={running} onClick={() => void run()}>{au.night ? "Try a dry run" : "Run it now"}</button>}
            {!au.mine && <button className="v3s-press ghost" onClick={copy}>Make my own copy</button>}
            <SpendLine au={au} me={me} />
          </div>
        )}
        {au && log && <RunLog key={logKey} project={project} id={au.id} me={me} />}
      </div>
    </div>
  );
}

/** a project's Automations room, and the studio on the stage when one is open */
export function Studio({ project, projectName, me }: { project: string; projectName: string; me: string }) {
  const list = useStudio(project);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const me2 = list?.me || me;
  const all = [...(list?.nights ?? []), ...(list?.automations ?? [])];
  const au = open && open !== "new" ? all.find((a) => a.id === open) ?? null : null;
  const draw = async (words: string) => {
    const r = await write<{ automation: Automation }>("make", { project, words });
    if (!r.error) { await readList(project); setOpen(r.automation.id); }
  };
  if (open) return (
    <div className="v3s">
      {(list?.asks ?? []).map((a) => <YesCard key={a.event} a={a} project={project} me={me2} />)}
      <StudioStage key={open} project={project} projectName={projectName} me={me2} au={au} draft={open === "new" ? draft : null}
        onBack={() => { setOpen(null); setDraft(null); }} onMade={(id) => { void readList(project).then(() => setOpen(id)); }} />
    </div>
  );
  const rest = list?.automations ?? [];
  return (
    <div className="v3s">
      <div className="v3s-room">
        <div className="v3s-head"><span className="kicker">automations</span><h1>{projectName}</h1></div>
        {(list?.asks ?? []).map((a) => <YesCard key={a.event} a={a} project={project} me={me2} />)}
        {!list && <p className="quiet">reading the trail…</p>}
        <Nights nights={list?.nights ?? []} me={me2} onOpen={setOpen} />
        <section className="v3s-sec">
          <h2>{list?.nights.length ? "And the rest" : "What runs here"}</h2>
          <div className="v3s-grid">
            {rest.map((a) => <Card key={a.id} au={a} me={me2} onOpen={() => setOpen(a.id)} />)}
            <div className="v3s-new" role="button" tabIndex={0} onClick={() => { setDraft({ id: "new", words: "", flow: [] }); setOpen("new"); }}>
              <span className="plus">+</span><span>Draw a new one</span><span className="quiet">in the studio, the team’s</span>
            </div>
          </div>
        </section>
      </div>
      <AgentAtHand onDraw={(w) => void draw(w)} />
    </div>
  );
}

/** the side's row under a project: shown once the project holds an automation (SOL's: the nights) */
export function StudioRow({ project, on, onOpen }: { project: string; on: boolean; onOpen: () => void }) {
  const counts = useCounts();
  const n = counts[project] ?? 0;
  if (!n && !on) return null;
  return (
    <div className={`row crow gs-sess v3s-row ${on ? "on" : ""}`} data-s data-v3-room={project} data-v3-spot="automations" onClick={onOpen} title="automations: the studio, and our nights">
      <span className="v3s-row-ic" aria-hidden="true"><Pic part="when" size={14} /></span>
      <span className="t">Automations</span>
      <small className="gs-when">{n}</small>
    </div>
  );
}

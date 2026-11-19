// Projects (mine, 2026-11-12): the tab that was "one session", as a space he both watches and touches. One chain at four
// depths (at hand · the kept session · the workers · the ground); a thing's distance picks its form (a mark far, a line
// nearer, the thing with its controls at hand), so every thing he sees is one he can press, tell or steer. Two more ways
// through the same space: time (earlier · now · next) and reading (see · read). Dev only, as space.html: the kit and the
// real Body, tokens only, a written day (data.ts); nothing reaches the engine.
//   projects.html           the space · ?v=whole  every way to observe, paired with how he touches it
//   ?z=560|1120|1680        start at a depth · ?t=earlier|next · ?read=1 · ?say=words (a line already sent)
import { StrictMode, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/body/real/desktop.jpg";
import { Body, haloDoing } from "../Body";
import { Button, Card, FileChip, Field, Glass, Pill, Ring, useSize } from "../kit";
import { black, dim, ink, label, mute, on, pearl, TYPE } from "../kit/paint";
import { CURVE, SHADE, TYPE as T } from "../kit/tokens";
import { dur, ease } from "../motion";
import { LACK, PAIRS, STRANDS, THINGS, type Strand, type Thing, type Time } from "./data";
import "../face.css";
import "../palette.css";
import "../kit/type.css";

const q = new URLSearchParams(location.search);
const DZ: readonly number[] = [0, 560, 1120, 1680], DEPTHS: readonly string[] = ["at hand", "the session", "the workers", "the ground"];
const F = 640, CW = 252, TIMES: Time[] = ["earlier", "now", "next"], FREE = ["ask me first", "tell me after", "just do it"] as const;
const RED = "var(--red-strong)";
const ty = (k: "label" | "body" | "read" | "title", w = 400): CSSProperties => ({ fontSize: T[k][0], lineHeight: `${T[k][1]}px`, fontWeight: w });

type Pearl = { id: number; s: string; from: number; to: number; t0: number; ms: number; then?: () => void };
type Cam = { x: number; z: number };

function Space() {
  const at = useRef<HTMLDivElement>(null), [W, H] = useSize(at);
  const [things, setThings] = useState<Thing[]>(THINGS), [strands, setStrands] = useState<Strand[]>(STRANDS);
  const [time, setTime] = useState<Time>((q.get("t") as Time) ?? "now"), [read, setRead] = useState(q.get("read") === "1");
  const [notes, setNotes] = useState<Record<string, string[]>>({}), [gone, setGone] = useState<Record<string, string>>({});
  const [free, setFree] = useState<Record<string, number>>({ home: 0, stage: 0, proj: 0, cowork: 1, loops: 1 }), [paused, setPaused] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<string | null>(null), [about, setAbout] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null), [focus, setFocus] = useState<string | null>(null);
  const [line, setLine] = useState(""), [busy, setBusy] = useState(false), [said, setSaid] = useState("");
  const cam = useRef<Cam>({ x: 0, z: +(q.get("z") ?? 0) }), goal = useRef<Cam>({ ...cam.current });
  const pearls = useRef<Pearl[]>([]), [, tick] = useState(0), raf = useRef(0), box = useRef<HTMLInputElement>(null), seq = useRef(0);

  // one loop, only while something moves: the camera on its way, or a pearl on a strand
  const run = () => {
    if (raf.current) return;
    let last = performance.now();
    const step = () => {
      const c = cam.current, g = goal.current, now = performance.now(), u = 1 - Math.exp(-(now - last) / dur("lag"));   // by the clock, so a slow frame travels as far
      last = now; c.x += (g.x - c.x) * u; c.z += (g.z - c.z) * u;
      const still = Math.abs(g.x - c.x) < 0.5 && Math.abs(g.z - c.z) < 0.5;
      if (still) { c.x = g.x; c.z = g.z; }
      const done = pearls.current.filter((p) => now - p.t0 >= p.ms);
      pearls.current = pearls.current.filter((p) => now - p.t0 < p.ms);
      done.forEach((p) => p.then?.());
      tick((n) => n + 1);
      raf.current = still && !pearls.current.length ? 0 : requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  const go = (z: number, x = 0) => { goal.current = { z: Math.max(-160, Math.min(DZ[3], z)), x }; run(); };
  const send = (s: string, from: number, to: number, then?: () => void, ms = 900) => { pearls.current.push({ id: ++seq.current, s, from, to, t0: performance.now(), ms, then }); run(); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const shown = things.filter((t) => (!t.when || t.when === time) && !gone[t.id]);
  const hand = shown.filter((t) => t.d === 0), cw = Math.max(196, Math.min(CW, (W - 48) / Math.max(1, hand.length) - 16));
  const of = (t: Thing) => ({ ...t, ...(t.alt?.[time] ?? {}) });
  // where a thing is in the space: x across, z deep
  const place = (t: Thing): { x: number; z: number } => {
    const lane = strands.find((s) => s.id === t.s)?.lane ?? 0;
    if (t.d === 0) { const i = hand.indexOf(t); return { x: (i - (hand.length - 1) / 2) * (cw + 16), z: 0 }; }
    if (t.d === 1) return { x: lane * 760, z: DZ[1] + (lane === 0 ? 170 : Math.abs(lane) < 0.5 ? 90 : 20) };
    if (t.d === 2) return { x: lane * 980, z: DZ[2] };
    return { x: lane * 1240, z: DZ[3] };
  };
  const hor = H * 0.15, eye = H * 0.53;
  const proj = (x: number, z: number) => { const d = z - cam.current.z, k = F / Math.max(40, F + d); return { k, d, sx: W / 2 + (x - cam.current.x) * k, sy: hor + eye * k }; };
  // a strand's path, near to far: the box · its piece at hand · the jelly · what the session holds · its workers · its ground
  const path = (s: string) => {
    const h = hand.find((t) => t.s === s), pts: { x: number; z: number }[] = [h ? place(h) : { x: 0, z: -150 }];
    pts.push({ x: 0, z: DZ[1] });
    for (const d of [1, 2, 3] as const) { const t = shown.find((x) => x.s === s && x.d === d); if (t) pts.push(place(t)); }
    return pts.sort((a, b) => a.z - b.z);
  };
  const xAt = (pts: { x: number; z: number }[], z: number) => {
    for (let i = 1; i < pts.length; i++) if (z <= pts[i].z) { const a = pts[i - 1], b = pts[i], u = (z - a.z) / Math.max(1, b.z - a.z); return a.x + (b.x - a.x) * Math.max(0, u); }
    return pts[pts.length - 1].x;
  };
  const curveOf = (s: string) => {
    const pts = path(s), out: string[] = [];
    for (let z = Math.max(pts[0].z, cam.current.z - 150); z <= pts[pts.length - 1].z; z += 40) { const p = proj(xAt(pts, z), z); out.push(`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`); }
    return out.join(" ");
  };

  const note = (id: string, words: string) => setNotes((n) => ({ ...n, [id]: [...(n[id] ?? []), words] }));
  const retell = (s: string, now: string) => setStrands((ss) => ss.map((x) => (x.id === s ? { ...x, told: { ...x.told, now } } : x)));
  const patch = (id: string, p: Partial<Thing>) => setThings((ts) => ts.map((t) => (t.id === id ? { ...t, ...p, alt: undefined } : t)));
  // a press on a piece at hand: his answer goes down its strand to the session, which says what it does with it
  const answer = (t: Thing, words: string) => {
    setGone((g) => ({ ...g, [t.id]: words })); setSaid(`you: ${words}`); setBusy(true); retell(t.s, `You said: ${words}. The session carries it on from here.`);
    send(t.s, 0, DZ[1], () => { setBusy(false); const r = things.find((x) => x.s === t.s && x.d === 1); if (r) { note(r.id, words); patch(r.id, { line: "I have your answer. I carry it on from here." }); } });
  };
  // his words: to a thing when one is named, else to the jelly, which finds the strand or starts one
  const say = (words: string, to: string | null = about) => {
    const w = words.trim(); if (!w) return;
    setLine(""); setAbout(null); setSaid(`you: ${w}`);
    const t = to ? things.find((x) => x.id === to) : null;
    if (t) { send(t.s, -150, DZ[t.d] + (t.d === 1 ? 60 : 0), () => { note(t.id, w); if (t.d > 0) patch(t.id, { line: "Taking your note in." }); }, 500 + t.d * 350); return; }
    setBusy(true);
    const low = w.toLowerCase(), hit = strands.find((s) => s.keys.some((k) => low.includes(k)));
    if (hit) { send(hit.id, -150, DZ[1], () => { setBusy(false); const r = things.find((x) => x.s === hit.id && x.d === 1); if (r) { note(r.id, w); patch(r.id, { line: "Your line is with this ask now." }); setHover(r.id); } }); return; }
    const id = `new${++seq.current}`, lane = [-1.2, 1.2, -1.6, 1.6][strands.length % 4], name = w.split(/\s+/).slice(0, 4).join(" ");
    setStrands((ss) => [...ss, { id, name, lane, keys: [], asked: w, told: { earlier: "Not asked yet.", now: "Asked a moment ago. The session told it back and waits for your go.", next: "On your go, a worker starts." }, made: [] }]);
    setThings((ts) => [...ts, { id: `${id}.r`, s: id, d: 1, name, kind: "I hold", line: "A new ask. I read it back to you first." }]);
    send(id, -150, DZ[1], () => send(id, DZ[1], 0, () => {
      setBusy(false);
      setThings((ts) => [...ts, { id: `${id}.back`, s: id, d: 0, when: "now", lack: "words", name: `I read it as: ${name}`, kind: "told back", line: "One worker on the NucBox, then it comes back to you as a thing to try.", acts: [["go", "go"], ["not that", "not that"]] }]);
    }, 700));
  };
  const act = (t: Thing, [, words]: readonly [string, string]) => {
    if (t.id.endsWith(".back") && words === "go") {
      setGone((g) => ({ ...g, [t.id]: words })); setSaid("you: go"); retell(t.s, "You said go. One worker on the NucBox has started.");
      send(t.s, 0, DZ[2], () => setThings((ts) => [...ts, { id: `${t.s}.w`, s: t.s, d: 2, row: 0, name: "the first build", kind: "a builder on the NucBox", line: "Started on your go.", ring: 0.1, st: "going" }]), 1300);
      return;
    }
    if (t.id.endsWith(".back")) { setAbout(t.id); box.current?.focus(); return; }
    answer(t, words);
  };
  useEffect(() => { const s = q.get("say"); if (s && W && !seq.current) say(s, null); /* once, when the space has a size */ }, [W > 0]);   // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = (z: number) => DZ.reduce((b, v, i) => (Math.abs(v - z) < Math.abs(DZ[b] - z) ? i : b), 0);
  const wheel = (e: React.WheelEvent) => {
    if (read || open) return;
    const z = goal.current.z - e.deltaY * 1.4, d = nearest(z);
    // into another depth: the strand in full stays in front of him
    const mine = d !== nearest(goal.current.z) ? (d === 0 ? null : shown.find((t) => t.s === focus && t.d === d)) : undefined;
    go(z, mine === undefined ? goal.current.x - e.deltaX : mine ? place(mine).x : 0);
  };
  const depthNow = DZ.reduce((b, z, i) => (Math.abs(z - goal.current.z) < Math.abs(DZ[b] - goal.current.z) ? i : b), 0);
  const needs = things.filter((t) => t.d === 0 && t.when === "now" && t.lack && !gone[t.id]).length;
  const aboutT = about ? things.find((t) => t.id === about) : null, openS = open ? strands.find((s) => s.id === open) : null;
  const jelly = proj(0, DZ[1]), bw = Math.min(560, W - 48);

  return (
    <div ref={at} onWheel={wheel} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {W > 0 && <>
        <div style={{ position: "absolute", inset: 0, opacity: read ? 0.1 : open ? 0.25 : 1, transition: `opacity ${dur("glass")}ms ${ease("move")}`, pointerEvents: read || open ? "none" : "auto" }}>
          <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {strands.map((s) => { const lit = hover != null && things.find((t) => t.id === hover)?.s === s.id; return <polyline key={s.id} points={curveOf(s.id)} fill="none" stroke={on(lit ? SHADE.on.mute : SHADE.on.edge)} strokeWidth={1} strokeDasharray={paused[s.id] ? "2 6" : undefined} />; })}
            {pearls.current.map((p) => { const u = Math.min(1, (performance.now() - p.t0) / p.ms), e = u * u * (3 - 2 * u), z = p.from + (p.to - p.from) * e, pt = proj(xAt(path(p.s), z), z); return <circle key={p.id} cx={pt.sx} cy={pt.sy} r={2 + 3 * Math.min(1.2, pt.k)} fill={pearl()} />; })}
          </svg>
          {(() => { const u = Math.max(0, Math.min(1, -jelly.d / 90)), x = jelly.sx + (W / 2 - jelly.sx) * u, y = jelly.sy + (H - 132 - jelly.sy) * u, k = Math.max(0.5, Math.min(1.5, jelly.k * 1.5)) * (1 - u) + 0.6 * u; return (
          <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${k})`, cursor: "pointer", zIndex: 6 }}
            onClick={() => { setFocus(null); go(DZ[1]); }} title="the kept session: everything you say passes through it">
            <Body size={72} state="settled" halo={haloDoing(busy ? "working" : "rest")} />
          </div>); })()}
          {shown.map((t0) => {
            const t = of(t0), p = place(t0), pr = proj(p.x, p.z);
            if (pr.d < -140) return null;
            // the form follows the distance; at a depth one strand is in full, the rest stay a line
            const lit = hover != null && shown.find((x) => x.id === hover)?.s === t.s;
            const form = pr.k >= 0.82 && (t.d === 0 || focus === t.s) ? "full" : pr.k >= 0.6 ? "line" : "mark", row = t.row ?? 0, named = form !== "mark" || pr.k >= 0.42 || (lit && t.d < 3);
            const dy = row * (form === "full" ? -152 : form === "line" ? 50 : named ? 22 : 0), dx = form === "mark" && !named ? row * 22 : 0;
            const fade = (pr.d < 0 ? 1 + pr.d / 140 : 1) * (paused[t.s] && t.d > 0 ? 0.45 : 1);
            return (
              <div key={t.id} data-part={t.name} style={{ position: "absolute", left: pr.sx + dx, top: pr.sy + dy, transform: "translate(-50%,-50%)", opacity: fade, zIndex: hover === t.id ? 5 : form === "full" ? 3 : 1 }}
                onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover((h) => (h === t.id ? null : h))}>
                {form === "full" ? <Full t={t} w={t.d === 0 ? cw : CW} notes={notes[t.id]} free={free[t.s] ?? 0} paused={!!paused[t.s]}
                    onAct={(a) => act(t0, a)} onTell={() => { setAbout(t.id); box.current?.focus(); }} onOpen={() => setOpen(t.s)}
                    onFree={(i) => { setFree((f) => ({ ...f, [t.s]: i })); send(t.s, DZ[1], DZ[2], undefined, 700); }}
                    onPause={() => setPaused((x) => ({ ...x, [t.s]: !x[t.s] }))} onStop={() => patch(t.id, { st: "waits", ring: t.ring, line: "Stopped by you. It keeps what it made." })} />
                  : <Far t={t} form={form} named={named} lit={hover === t.id} told={!!notes[t.id]?.length} onGo={() => { setFocus(t.s); go(p.z, p.x); }} />}
              </div>
            );
          })}
        </div>

        {read && <Read strands={strands} time={time} hand={hand} W={W} onAct={(t, a) => act(t, a)} onGo={(s) => { setRead(false); const r = things.find((t) => t.s === s && t.d === 1); if (r) go(place(r).z, place(r).x); }} />}
        {openS && <Opened s={openS} time={time} notes={things.filter((t) => t.s === openS.id).flatMap((t) => notes[t.id] ?? [])} onBack={() => setOpen(null)} />}

        <div style={{ position: "absolute", left: 20, top: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <Ring value={0.19} size={22} flat />
          <div><div style={{ ...ty("body", 500) }}>sol</div><div style={label}>{read ? "told back in words" : DEPTHS[depthNow]}{time !== "now" ? ` · ${time}` : ""}</div></div>
        </div>
        <div style={{ position: "absolute", right: 20, top: 16, display: "flex", gap: 8 }}>
          <Pill words={TIMES} picked={TIMES.indexOf(time)} h={28} onPick={(i) => { setTime(TIMES[i]); go(0); }} />
          <Pill words={["see", "read"]} picked={read ? 1 : 0} h={28} onPick={(i) => setRead(i === 1)} />
        </div>

        <div style={{ position: "absolute", left: (W - bw) / 2, bottom: 24, width: bw }}>
          <div style={{ ...label, height: 20, display: "flex", gap: 12, alignItems: "center", padding: "0 14px" }}>
            {aboutT ? <span style={{ color: dim }}>about: {aboutT.name} <button onClick={() => setAbout(null)} style={{ all: "unset", cursor: "pointer", color: mute, marginLeft: 6 }}>to the session instead</button></span> : <span>{said || "say anything; the session finds where it belongs"}</span>}
            {!read && goal.current.z > 200 && needs > 0 && <button onClick={() => go(0)} style={{ all: "unset", cursor: "pointer", marginLeft: "auto", color: pearl() }}>{needs} at hand need you</button>}
          </div>
          <Field w={bw} h={48}>
            <input ref={box} value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") say(line); if (e.key === "Escape") setAbout(null); }}
              placeholder={aboutT ? "your words for it" : "ask, tell, or name any work"} aria-label="say to the project"
              style={{ all: "unset", flex: 1, ...ty("read"), color: ink }} />
          </Field>
        </div>
      </>}
    </div>
  );
}

/** far: a mark with its name; nearer: the name and the one line the session wrote. A press travels to it. */
function Far({ t, form, named, lit, told, onGo }: { t: Thing; form: "line" | "mark"; named: boolean; lit: boolean; told: boolean; onGo: () => void }) {
  const mark = t.st === "failing" ? <span style={{ width: 8, height: 8, borderRadius: 4, background: RED }} />
    : t.ring != null ? <Ring value={t.ring} size={form === "line" ? 22 : 16} flat />
    : <span style={{ width: 6, height: 6, borderRadius: 3, background: on(t.d === 3 ? SHADE.on.mute : SHADE.on.dim) }} />;
  return (
    <button onClick={onGo} style={{ all: "unset", cursor: "pointer", position: "relative", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      <span style={{ width: 22, display: "grid", placeItems: "center" }}>{mark}</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        {named && <span style={{ ...(form === "line" ? ty("body", 500) : ty("label")), color: lit || form === "line" ? ink : t.d === 3 ? mute : dim }}>{t.name}{told && <span style={{ color: pearl(), marginLeft: 6 }}>·</span>}</span>}
        {form === "line" && <span style={{ ...ty("label"), color: dim, maxWidth: 260, whiteSpace: "normal" }}>{t.line}</span>}
      </span>
      {form === "mark" && lit && <span style={{ position: "absolute", left: 30, top: 22, width: 236, padding: "8px 12px", isolation: "isolate", whiteSpace: "normal", ...ty("label"), color: ink }}>
        <Glass r={CURVE.radius.row} step="pop" blur={SHADE.blur} />{!named && <span style={{ fontWeight: 500 }}>{t.name} · </span>}<span style={{ color: mute }}>{t.kind} · </span>{t.line}</span>}
    </button>
  );
}

/** at hand: the thing itself with its controls. What it lacks decides which controls it has. */
function Full({ t, w, notes, free, paused, onAct, onTell, onOpen, onFree, onPause, onStop }: {
  t: Thing; w: number; notes?: string[]; free: number; paused: boolean; onAct: (a: readonly [string, string]) => void; onTell: () => void; onOpen: () => void; onFree: (i: number) => void; onPause: () => void; onStop: () => void;
}) {
  return (
    <Card w={w} step={t.lack ? "box" : "raised"}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
          {t.ring != null && <Ring value={t.ring} size={16} flat />}
          <span style={{ color: t.lack ? pearl() : t.st === "failing" ? RED : mute }}>{t.lack ? LACK[t.lack] : t.st === "failing" ? "failing" : t.kind}</span>
          {t.lack && <span>{t.kind}</span>}
        </div>
        <div style={{ ...ty("read", 600) }}>{t.name}</div>
        <div style={{ color: dim }}>{t.line}</div>
        {notes?.map((n, i) => <div key={i} style={{ ...ty("label"), color: pearl() }}>you: {n}</div>)}
        {t.d === 1 && <div style={{ marginLeft: -4 }}><Pill words={FREE} picked={free} h={26} onPick={onFree} /></div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginLeft: -6, marginTop: 2 }}>
          {t.acts?.map((a, i) => <Button key={a[0]} h={28} flat acts={i === 0} onClick={() => onAct(a)}>{a[0]}</Button>)}
          <Button h={28} flat onClick={onTell}>tell it</Button>
          {t.d === 1 && <Button h={28} flat onClick={onPause}>{paused ? "go on" : "pause"}</Button>}
          {t.d === 2 && t.st === "going" && <Button h={28} flat onClick={onStop}>stop</Button>}
          {t.d > 0 && <Button h={28} flat onClick={onOpen}>open</Button>}
        </div>
      </div>
    </Card>
  );
}

/** read: the whole told back in words, a paragraph a strand; what needs him sits in its paragraph as buttons */
function Read({ strands, time, hand, W, onAct, onGo }: { strands: Strand[]; time: Time; hand: Thing[]; W: number; onAct: (t: Thing, a: readonly [string, string]) => void; onGo: (s: string) => void }) {
  const w = Math.min(560, W - 48);
  return (
    <div style={{ position: "absolute", left: (W - w) / 2, top: 72, bottom: 110, width: w, overflow: "auto", display: "flex", flexDirection: "column", gap: 20, maskImage: "linear-gradient(#000 85%, transparent)" }}>
      {strands.map((s) => (
        <div key={s.id}>
          <button onClick={() => onGo(s.id)} style={{ all: "unset", cursor: "pointer", display: "block" }}>
            <div style={label}>{s.name}</div>
            <div style={{ ...ty("read"), color: ink }}>{s.told[time]}</div>
          </button>
          {hand.filter((t) => t.s === s.id).map((t) => <div key={t.id} style={{ display: "flex", gap: 4, marginLeft: -6, marginTop: 4 }}>{t.acts?.map((a, i) => <Button key={a[0]} h={28} flat acts={i === 0} onClick={() => onAct(t, a)}>{a[0]}</Button>)}</div>)}
        </div>
      ))}
    </div>
  );
}

/** a strand opened: what he asked, what the session says of it, what was made. In the tab this is the session and stage he knows. */
function Opened({ s, time, notes, onBack }: { s: Strand; time: Time; notes: string[]; onBack: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }} onClick={onBack}>
      <div onClick={(e) => e.stopPropagation()}>
        <Card w={440} step="pop">
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={label}>{s.name}</div>
            <div style={{ ...ty("title", 600) }}>{s.asked}</div>
            <div style={{ ...ty("read"), color: dim }}>{s.told[time]}</div>
            {notes.map((n, i) => <div key={i} style={{ ...ty("label"), color: pearl() }}>you: {n}</div>)}
            {s.made.length > 0 && <div style={{ display: "flex", gap: 8, marginTop: 4 }}>{s.made.map(([ext, name]) => <FileChip key={name} ext={ext} name={name} />)}</div>}
            <div style={label}>In the tab this opens as the talk and the stage you know, on this ask alone.</div>
            <div style={{ marginLeft: -6 }}><Button h={28} flat onClick={onBack}>back to the space</Button></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** the whole: each way he observes, how he touches it, which of his inputs it carries */
function Whole() {
  const at = useRef<HTMLDivElement>(null), [W] = useSize(at), w = Math.min(980, W - 48);
  const cols = "minmax(140px, 1fr) minmax(200px, 2fr) minmax(180px, 1.6fr) minmax(110px, 0.9fr)";
  return (
    <div ref={at} style={{ position: "absolute", inset: 0, overflow: "auto" }}>
      {W > 0 && <div style={{ width: w, margin: "0 auto", padding: "32px 0 64px", display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <div style={{ ...ty("title", 600) }}>You watch it, you touch it, the same thing</div>
          <div style={{ ...ty("read"), color: dim, maxWidth: 640, marginTop: 6 }}>Nothing in the space is only a picture. Each way of seeing the work is paired with what you can do to it, and each touch is kept on the thing, so the session learns which way of showing got your answer.</div>
        </div>
        {(["words", "picture"] as const).map((how) => (
          <div key={how}>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "0 16px 8px", ...label }}><span>you observe, in {how === "words" ? "words" : "pictures"}</span><span>it tells you</span><span>you touch it by</span><span>it carries</span></div>
            <Card w={w}>
              <div style={{ padding: "6px 0" }}>
                {PAIRS.filter((p) => p.how === how).map((p, i) => (
                  <div key={p.see} style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "10px 16px", borderTop: i ? `1px solid ${on(SHADE.on.line)}` : undefined }}>
                    <span style={{ fontWeight: 500 }}>{p.see}</span><span style={{ color: dim }}>{p.tells}</span><span>{p.touch}</span><span style={{ ...ty("label"), color: p.feeds.includes("taste") || p.feeds.includes("tacit") || p.feeds.includes("meta") ? pearl() : mute }}>{p.feeds}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[["What decides the form", "How far a thing is from needing you. Far is a mark, nearer is one line, at hand is the thing with its controls. What it lacks (your eye, your call, your words) decides which controls."],
            ["What you never read", "Steps, commands, files, logs. The session writes one line for each thing and one paragraph for each ask. The raw talk is behind open, never in the space."],
            ["How it improves", "Every answer records which form it was given on and how long it took. The session shows the next thing of that kind in the form that worked."]].map(([h, b]) => (
            <Card key={h} w={(w - 32) / 3}><div style={{ padding: 16 }}><div style={{ fontWeight: 500 }}>{h}</div><div style={{ color: dim, marginTop: 4 }}>{b}</div></div></Card>
          ))}
        </div>
      </div>}
    </div>
  );
}

function Page() {
  const whole = useMemo(() => q.get("v") === "whole", []);
  return (
    <div style={{ ...TYPE, position: "fixed", inset: 0, overflow: "hidden", background: `url(${desk}) center/cover fixed` }}>
      <div style={{ position: "absolute", inset: 0, background: black(SHADE.window), backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }}>
        {whole ? <Whole /> : <Space />}
      </div>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);

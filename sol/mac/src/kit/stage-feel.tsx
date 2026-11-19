// The feel sheet (#1211, ours/design.md 2026-11-14 evening): the eight feelings in Marco's words as demos that play,
// drawn from the kit (index.ts, Block, feel.ts) on the ground that ships (black glass). Each demo names its one
// micro-interaction in its caption, and under it the function beneath in the engine or the sol MCP, red where it is
// missing: the demo still plays, but it never stands in for a function silently. Dev only, like frame.html:
// sol/design/system/feel.mjs builds and shoots it on the NucBox.
//   feel.html                               the eight, one under the other, each with its own play
//   feel.html?row=snap|slow|calm|control|reliable|surprise|why|understood   one demo, playing by itself
//   feel.html?row=…&at=before|during|landed                                 one demo held at that moment (the shots)
import { StrictMode, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import desk from "../../../design/direction/shots/desk-sonoma.jpg";
import { Block, Button, Card, Field, Glyph, Row } from "./index";
import { GLYPH_UNDO, LIFE, OUTLINE, RING } from "./feel";
import { deep, dim, hex, ink, jellyBands, label, mute, on, pearl, TYPE } from "./paint";
import { EASE, JELLY, LOOKS, SHADE, TIMED, TYPE as T } from "./tokens";
import "../palette.css";
import "../tokens.css";
import "./type.css";

type RowId = "snap" | "slow" | "calm" | "control" | "reliable" | "surprise" | "why" | "understood";
type Phase = "before" | "during" | "landed";
type Fn = readonly [string, "exists" | "partial" | "missing"];
const q = new URLSearchParams(location.search);
const only = q.get("row") as RowId | null;
const at = (["before", "during", "landed"] as const).find((p) => p === q.get("at")) ?? null;
const W = 1152, AREA = 500;
const RED = JELLY.six[0], AMBER = JELLY.six[3], LIME = JELLY.six[5];
const paper = LOOKS.block.fill.light;

// ---- the run: a demo's moment, its timers, held still for a shot -------------------------------------------------
function useRun(id: RowId) {
  const frozen = only === id ? at : null;
  const [phase, setPhase] = useState<Phase>(frozen ?? "before");
  const timers = useRef<number[]>([]), raf = useRef(0);
  const reset = () => { timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(raf.current); };
  const after = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  /** a frame loop that runs until `f` returns false */
  const loop = (f: () => boolean) => { const step = () => { if (f()) raf.current = requestAnimationFrame(step); }; raf.current = requestAnimationFrame(step); };
  useEffect(() => reset, []);
  return { phase, setPhase, frozen, after, loop, reset };
}
/** a demo alone on the page plays by itself (the clips) */
function useAuto(id: RowId, play: () => void) {
  useEffect(() => { if (only !== id || at) return; const t = window.setTimeout(play, 700); return () => clearTimeout(t); }, []);
}
const tr = (props: string, ms: number = TIMED.glass, e: string = EASE.reveal, delay = 0) => props.split(" ").map((p) => `${p} ${ms}ms ${e} ${delay}ms`).join(", ");

// ---- small pieces the demos share ---------------------------------------------------------------------------------
const Line = ({ title, note, tone }: { title: ReactNode; note?: ReactNode; tone?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 16px", fontSize: T.body[0], lineHeight: `${T.body[1]}px` }}><span style={{ color: ink }}>{title}</span><span style={{ color: tone ?? dim, whiteSpace: "nowrap" }}>{note}</span></div>
);
const Para = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div style={{ padding: "12px 16px 0", fontSize: T.body[0], lineHeight: `${T.body[1] + 1}px`, color: dim, ...style }}>{children}</div>;
const Small = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div style={{ ...label, color: mute, ...style }}>{children}</div>;
/** where the pointer is, in a still */
const Hand = ({ x, y }: { x: number; y: number }) => (
  <svg width="18" height="22" viewBox="0 0 18 22" style={{ position: "absolute", left: x, top: y, zIndex: 9, pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.5))" }}><path d="M2 2l12.5 11H8.6l3.4 7-2.6 1.2-3.4-7.2L2 18z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" /></svg>
);
/** a paper slip stuck on, tilted, one of the six as its ink band: Block's note and stamp, standing in for the Sticker
 *  (#1184) until that piece is in the kit */
function Slip({ colour, children, style }: { colour: string; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", padding: "6px 12px 6px 14px", background: PEARL_PAPER, color: deep(0.86), fontSize: T.body[0], lineHeight: `${T.body[1]}px`, fontWeight: 500, whiteSpace: "nowrap", boxShadow: `0 3px 10px ${hex("#000000", 0.35)}`, borderLeft: `3px solid ${colour}`, ...style }}>{children}</div>;
}
const PEARL_PAPER = "#e6e1d8";
/** a check in a round pearl paper, the done stamp's shape (Block.tsx), the same every time */
const Check = ({ size = 20 }: { size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, background: PEARL_PAPER, display: "inline-flex", alignItems: "center", justifyContent: "center", transform: "rotate(8deg)", boxShadow: `0 1px 2px ${hex("#000000", 0.25)}`, flex: "none" }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12"><path d="M2.5 6.5l2.5 2.5 4.5-5" fill="none" stroke={LIME} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);
/** a still being picked: a picture at a fraction of its size, the pearl ring when it is the one */
function Still({ w, h, scale, picked, onPick, children, words }: { w: number; h: number; scale: number; picked?: boolean; onPick?: () => void; children: ReactNode; words: string }) {
  return (
    <div onClick={onPick} style={{ cursor: onPick ? "pointer" : undefined }}>
      <div style={{ width: w * scale, height: h * scale, borderRadius: 12, overflow: "hidden", position: "relative", boxShadow: picked ? `0 0 0 2px ${pearl()}, 0 6px 18px ${hex("#000000", 0.4)}` : `0 0 0 1px ${on(0.1)}`, transform: picked ? "scale(1.02)" : "none", transition: tr("box-shadow transform", TIMED.glass, EASE.pour) }}>
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none" }}>{children}</div>
      </div>
      <Small style={{ marginTop: 8, color: picked ? ink : mute, display: "flex", gap: 6, alignItems: "center" }}>{picked && <Check size={14} />}{words}</Small>
    </div>
  );
}

// ---- the sheet's frame around each demo ---------------------------------------------------------------------------
function Demo({ n, id, name, caption, fns, play, playWord = "play", disabled, extra, children }: {
  n: number; id: RowId; name: string; caption: string; fns: readonly Fn[]; play: () => void; playWord?: string; disabled?: boolean; extra?: ReactNode; children: ReactNode;
}) {
  return (
    <section data-row={id} style={{ position: "relative", width: 1280, height: 700, flex: "none" }}>
      <div style={{ position: "absolute", left: 64, top: 30, right: 64, display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Small>{n} · {name}</Small>
          <div style={{ fontSize: T.title[0], lineHeight: `${T.title[1]}px`, color: ink, fontWeight: 500, marginTop: 4 }}>{caption}</div>
        </div>
        {extra}
        <div style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : undefined }}><Button h={32} flat onClick={play}>{playWord}</Button></div>
      </div>
      <div style={{ position: "absolute", left: 64, top: 104, width: W, height: AREA }}>{children}</div>
      {/* the honest line: what in the engine or the sol MCP this rests on, and whether it is there */}
      <div data-fn style={{ position: "absolute", left: 64, right: 64, top: 626, ...label, color: mute, display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
        <span>function beneath:</span>
        {fns.map(([what, is]) => <span key={what} style={{ color: is === "missing" ? RED : is === "partial" ? AMBER : dim }}>{what} · {is}</span>)}
      </div>
    </section>
  );
}

// ---- 1. snap: seven at once, then the settle ----------------------------------------------------------------------
const WORKERS: readonly (readonly [string, readonly string[]])[] = [
  ["read the merged PRs", ["opening 12 PRs", "reading #1183", "noted 4 changes"]],
  ["the three lines", ["reading the notes", "drafting", "trimming to three"]],
  ["shots of the new pages", ["opening 4 pages", "shooting 2 of 4", "comparing"]],
  ["the release notes", ["grouping by area", "writing", "linking the PRs"]],
  ["check the links", ["31 links found", "checking 18 of 31", "all answered"]],
  ["post for #builds", ["reading #builds", "drafting the post", "holding it for you"]],
  ["the changelog", ["reading the tags", "adding 12 entries", "sorting"]],
];
const DURS = [3100, 3900, 4400, 3500, 2800, 4100, 3300];
const HELD = [0.82, 0.4, 0.64, 1, 0.55, 0.3, 0.71];
function Snap() {
  const r = useRun("snap");
  const [p, setP] = useState<number[]>(r.frozen === "during" ? HELD : WORKERS.map(() => (r.frozen === "landed" ? 1 : 0)));
  const play = () => {
    r.reset(); setP(WORKERS.map(() => 0)); r.setPhase("during");
    const t0 = performance.now();
    r.loop(() => {
      const next = DURS.map((d) => Math.min(1, (performance.now() - t0) / d));
      setP(next);
      if (next.every((v) => v >= 1)) { r.after(320, () => r.setPhase("landed")); return false; }
      return true;
    });
  };
  useAuto("snap", play);
  const landed = r.phase === "landed", done = p.filter((v) => v >= 1).length;
  const RW = 520, RH = 270, RX = (W - RW) / 2, RY = 40;
  return (
    <Demo n={1} id="snap" name="snap, for chores" caption="Seven run at once, legibly; then everything lands together, ready." play={play} playWord={r.phase === "before" ? "play" : "again"}
      fns={[["takeRun · per-worker state (work/blocks.ts)", "exists"], ["start_session · parallel runs (sol MCP)", "exists"], ["one ‘all landed, ready for you’ event", "missing"]]}>
      <Small style={{ position: "absolute", left: 0, top: 0, opacity: landed ? 0 : 1, transition: tr("opacity") }}>{r.phase === "before" ? "seven queued" : `seven at once · ${done} done`}</Small>
      {WORKERS.map(([title, says], i) => {
        const row = i < 4 ? 0 : 1, col = row ? i - 4 : i, x = row ? 147 + col * 294 : col * 294, y = 40 + row * 156;
        const v = p[i], state = r.phase === "before" ? "resting" : v >= 1 ? "done" : "working";
        const now = r.phase === "before" ? "queued" : v >= 1 ? says[2] : says[Math.min(2, Math.floor(v * 3))];
        // the settle: every worker travels into the one stack at the same moment, so the arrival reads as one
        const dx = RX + RW / 2 - (x + 135), dy = RY + RH / 2 - (y + 64);
        return (
          <div key={title} style={{ position: "absolute", left: x, top: y, transform: landed ? `translate(${dx}px, ${dy}px) scale(.82)` : "none", opacity: landed ? 0 : 1, transition: `${tr("transform", 560, EASE.pour)}, ${tr("opacity", 420, EASE.leave, 140)}` }}>
            <Block w={270} h={128} title={title} state={state}>
              <Para style={{ paddingTop: 10, color: v >= 1 ? ink : dim }}>{now}</Para>
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, height: 2, borderRadius: 1, background: on(0.08) }}>
                <div style={{ width: `${v * 100}%`, height: "100%", borderRadius: 1, backgroundImage: jellyBands(JELLY.six, 90, 0.03), backgroundSize: `${100 / Math.max(v, 0.01)}% 100%` }} />
              </div>
            </Block>
          </div>
        );
      })}
      {landed && (
        <div className="fin" style={{ position: "absolute", left: RX, top: RY, animationDelay: "260ms" }}>
          <Block w={RW} h={RH} title="the release" state="done" behind={3}>
            <Line title="12 merged PRs read" note="4 changes" />
            <Line title="4 new pages shot" note="4 stills" />
            <Line title="31 links checked" note="all answered" />
            <Line title="the notes, the three lines, the post" note="drafted" />
            <div style={{ position: "absolute", left: 16, bottom: 18 }}><Button h={32} flat acts>open the review</Button></div>
          </Block>
          <Slip colour={LIME} style={{ right: 28, top: -10, transform: "rotate(-4deg)", animation: r.frozen ? undefined : `stamp ${TIMED.pour}ms ${EASE.pour} 760ms both` }}>ready for you</Slip>
        </div>
      )}
    </Demo>
  );
}

// ---- 2. slow: steer by stills; the press lands as a change --------------------------------------------------------
type Layout = "A" | "B";
function Poster({ w, h, layout, size = 1, accent = "ink" }: { w: number; h: number; layout: Layout; size?: number; accent?: "ink" | "heart" }) {
  const big = (layout === "A" ? 30 : 46) * size, move = tr("left top font-size width background transform", 460, EASE.pour);
  const tint = accent === "heart" ? RED : deep(0.85);
  return (
    <div style={{ position: "relative", width: w, height: h, background: paper, borderRadius: 14, overflow: "hidden", color: deep(0.88) }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, background: tint, transition: move }} />
      <div style={{ position: "absolute", borderRadius: "50%", background: tint, opacity: 0.9, transition: move, ...(layout === "A" ? { left: w - 190, top: h - 170, width: 230, height: 230 } : { left: w - 96, top: 26, width: 60, height: 60 }) }} />
      <div style={{ position: "absolute", left: 40, width: w - 80, top: layout === "A" ? 34 : h / 2 - big * 0.85, textAlign: layout === "A" ? "left" : "center", fontSize: big, lineHeight: 1.05, fontWeight: 650, letterSpacing: "-0.02em", transition: move }}>Open studio</div>
      <div style={{ position: "absolute", left: 40, width: w - 80, top: layout === "A" ? 34 + big * 1.25 : h / 2 + big * 0.45, textAlign: layout === "A" ? "left" : "center", fontSize: 15, color: deep(0.55), transition: move }}>friday · 6 pm · room 214</div>
    </div>
  );
}
const PICKS = [
  { words: ["title top-left", "title centred, big"], apply: [{ layout: "A" as Layout }, { layout: "B" as Layout }] },
  { words: ["ink stripe", "heart stripe"], apply: [{ accent: "ink" as const }, { accent: "heart" as const }] },
];
function Slow() {
  const r = useRun("slow");
  const held = r.frozen;
  const [look, setLook] = useState<{ layout: Layout; size: number; accent: "ink" | "heart" }>({ layout: held && held !== "before" ? "B" : "A", size: held === "landed" ? 1.25 : 1, accent: "ink" });
  const [step, setStep] = useState(held === "landed" ? 1 : 0), [picked, setPicked] = useState(held === "during" ? 1 : -1);
  const [nudged, setNudged] = useState(held === "landed"), [flash, setFlash] = useState(0);
  const drag = useRef<{ y: number; s: number } | null>(null);
  const press = (i: number) => {
    if (picked >= 0) return;
    setPicked(i); setLook((l) => ({ ...l, ...PICKS[step].apply[i] })); setFlash((f) => f + 1);
    // the next pick comes once the change has landed, never before
    if (step + 1 < PICKS.length) r.after(1100, () => { setStep((s) => s + 1); setPicked(-1); });
  };
  const play = () => {
    r.reset(); setLook({ layout: "A", size: 1, accent: "ink" }); setStep(0); setPicked(-1); setNudged(false); r.setPhase("during");
    r.after(500, () => { setPicked(1); setLook((l) => ({ ...l, layout: "B" })); setFlash((f) => f + 1); });
    r.after(1600, () => { setStep(1); setPicked(-1); });
    r.after(2500, () => { setLook((l) => ({ ...l, size: 1.25 })); setNudged(true); setFlash((f) => f + 1); r.setPhase("landed"); });
  };
  useAuto("slow", play);
  const pick = PICKS[step];
  return (
    <Demo n={2} id="slow" name="slow, for what is yours" caption="You steer by stills and nudges; each press lands visibly." play={play} playWord={r.phase === "before" ? "play" : "again"}
      fns={[["yoursKeep versionsOf · keep · adjust (three versions, keep one, change by words)", "partial"], ["a pick of two stills; the next pick proposed", "missing"]]}>
      <div style={{ position: "absolute", left: 0, top: 10 }}>
        <Block w={600} h={440} title="the poster for friday">
          <div style={{ position: "absolute", left: 20, top: 14 }}
            onPointerDown={(e) => { drag.current = { y: e.clientY, s: look.size }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current) setLook((l) => ({ ...l, size: Math.min(1.5, Math.max(0.75, drag.current!.s - (e.clientY - drag.current!.y) / 160)) })); }}
            onPointerUp={() => { if (drag.current && drag.current.s !== look.size) { setNudged(true); setFlash((f) => f + 1); } drag.current = null; }}>
            <Poster w={560} h={330} layout={look.layout} size={look.size} accent={look.accent} />
            {/* the change, outlined once as it lands: what moved, and only for as long as it takes to see */}
            {flash > 0 && <div key={flash} className="ring" style={{ position: "absolute", inset: -3, borderRadius: 17, boxShadow: `0 0 0 2px ${pearl()}`, pointerEvents: "none" }} />}
          </div>
          <Small style={{ position: "absolute", left: 20, bottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
            drag the title up or down to nudge it
            {nudged && <span style={{ color: ink, display: "inline-flex", gap: 6, alignItems: "center" }}><Check size={14} />nudged · title {look.size.toFixed(2)}×</span>}
          </Small>
        </Block>
      </div>
      <div style={{ position: "absolute", left: 640, top: 10 }}>
        <Block w={512} h={246} title={step === 0 ? "pick one" : "next pick, proposed"}>
          <div key={step} className="fin" style={{ display: "flex", gap: 24, padding: "14px 16px 0 26px" }}>
            {[0, 1].map((i) => {
              const l = { ...look, ...pick.apply[i], size: 1 };
              return <Still key={i} w={500} h={290} scale={0.42} picked={picked === i} onPick={() => press(i)} words={pick.words[i]}><Poster w={500} h={290} layout={l.layout} accent={l.accent} /></Still>;
            })}
          </div>
        </Block>
        {held === "during" && <Hand x={360} y={140} />}
      </div>
      {/* the rest, dimmed and still: what is not being steered stays out of the way */}
      <div style={{ position: "absolute", left: 640, top: 290, display: "flex", gap: 24, opacity: 0.3 }}>
        <Block w={244} h={160} title="the flyer"><Para>waits for the poster</Para></Block>
        <Block w={244} h={160} title="the post for #general"><Para>waits for the poster</Para></Block>
      </div>
    </Demo>
  );
}

// ---- 3. calm: nothing moves unless your hand did ------------------------------------------------------------------
const WEEK = [["monday", "math 221 lecture"], ["tuesday", "chem lab"], ["wednesday", "lab report due"], ["thursday", "shift 4 to 9"], ["friday", "math exam"]] as const;
const NOTES: Record<string, string> = { monday: "chapter 6 before the lecture.", tuesday: "goggles; the lab coat is in the locker.", wednesday: "the report: results and the graph left; due 11:59 pm.", thursday: "the shift ends at 9; nothing after.", friday: "the exam covers chapters 4 to 6; room 214." };
function Calm() {
  const r = useRun("calm");
  const [picked, setPicked] = useState(r.frozen === "landed" ? 2 : -1);
  const [still, setStill] = useState(0);
  const scene = useRef<HTMLDivElement>(null), hand = useRef(0);
  useEffect(() => {
    // the proof of calm: every change in the scene that came with no hand near it is counted here
    const el = scene.current; if (!el) return;
    const mo = new MutationObserver((ms) => { if (performance.now() - hand.current > 600) setStill((n) => n + ms.length); });
    mo.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  const play = () => { r.reset(); setPicked(-1); r.setPhase("during"); };
  useAuto("calm", play);
  const touch = () => { hand.current = performance.now(); };
  return (
    <Demo n={3} id="calm" name="calm" caption="One hue, grey rest; nothing moves unless your hand does." play={play} playWord="look"
      extra={<Small style={{ color: still ? RED : dim, paddingBottom: 8 }}>moved without your hand: {still}</Small>}
      fns={[["ghostly · unasked blocks land quiet; moved blocks never fold (work/blocks.ts)", "partial"], ["a stage that holds still unless the person acts", "missing"]]}>
      <div ref={scene} onPointerMove={touch} onPointerDown={touch} onPointerEnter={touch} onPointerLeave={touch} style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 10 }}>
          <Block w={600} h={380} title="the week">
            <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 4 }}>
              {WEEK.map(([day, what], i) => <Row key={day} w={568} title={what} aside={day} picked={picked === i} hover={r.frozen === "during" ? i === 2 : undefined} onClick={() => { touch(); setPicked(i); }} />)}
            </div>
          </Block>
          {r.frozen === "during" && <Hand x={300} y={168} />}
        </div>
        <div style={{ position: "absolute", left: 632, top: 10 }}>
          <Block w={520} h={380} title={picked >= 0 ? WEEK[picked][0] : "notes"}>
            <Para>{picked >= 0 ? NOTES[WEEK[picked][0]] : "pick a day; its notes come here."}</Para>
          </Block>
        </div>
      </div>
    </Demo>
  );
}

// ---- 4. in control: an action lands with its undo ring ------------------------------------------------------------
const BOARD = [["exam friday", "chapters 4 to 6"], ["two job replies", "the café, the library"], ["the release", "notes drafted"]] as const;
function UndoRing({ start, onUndo }: { start: number; onUndo: () => void }) {
  // the ring drains over life.scar: how long the take-back holds, read at a glance
  const C = 2 * Math.PI * RING.r, [left, setLeft] = useState(start);
  useEffect(() => { if (at) return; const f = requestAnimationFrame(() => setLeft(0)); return () => cancelAnimationFrame(f); }, []);
  const s = RING.size;
  return (
    <div onClick={onUndo} title="undo" style={{ width: s, height: s, position: "relative", cursor: "pointer" }}>
      <svg width={s} height={s} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={s / 2} cy={s / 2} r={RING.r} fill={hex("#000000", 0.35)} stroke={on(0.12)} strokeWidth={2} />
        <circle cx={s / 2} cy={s / 2} r={RING.r} fill="none" stroke={pearl(0.85)} strokeWidth={2} strokeDasharray={C} strokeDashoffset={C * (1 - left)} style={{ transition: at ? undefined : `stroke-dashoffset ${LIFE.scar * start}ms linear` }} />
      </svg>
      <svg width={18} height={18} viewBox="2 2 16 16" style={{ position: "absolute", left: (s - 18) / 2, top: (s - 18) / 2 }}>{GLYPH_UNDO.map((d) => <path key={d} d={d} fill="none" stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />)}</svg>
    </div>
  );
}
function Control() {
  const r = useRun("control");
  const [closed, setClosed] = useState<number | null>(r.frozen === "during" ? 1 : null);
  const [gone, setGone] = useState<number[]>([]), [back, setBack] = useState<number | null>(r.frozen === "landed" ? 1 : null);
  const [log, setLog] = useState<string[]>(r.frozen === "during" ? ["closed “two job replies”"] : r.frozen === "landed" ? ["closed “two job replies”", "put “two job replies” back"] : []);
  const close = (i: number) => {
    setClosed(i); setBack(null); setLog((l) => [...l, `closed “${BOARD[i][0]}”`]);
    r.after(LIFE.scar, () => { setClosed((c) => { if (c === i) { setGone((g) => [...g, i]); setLog((l) => [...l, `“${BOARD[i][0]}” went to the tray`]); return null; } return c; }); });
  };
  const undo = () => { if (closed === null) return; const i = closed; r.reset(); setClosed(null); setBack(i); setLog((l) => [...l, `put “${BOARD[i][0]}” back`]); r.setPhase("landed"); };
  const play = () => { r.reset(); setClosed(null); setGone([]); setBack(null); setLog([]); r.setPhase("during"); r.after(500, () => close(1)); r.after(3300, () => { setClosed(null); setBack(1); setLog((l) => [...l, `put “${BOARD[1][0]}” back`]); r.setPhase("landed"); }); };
  useAuto("control", play);
  return (
    <Demo n={4} id="control" name="in control" caption="Close anything; its outline and draining ring hold the undo." play={play} playWord={r.phase === "before" ? "play" : "again"}
      fns={[["undoArrangement (arrange.ts) · reopen (work/blocks.ts) · home/undo.ts · dataundo.ts", "exists"]]}>
      <div style={{ position: "absolute", left: 0, top: 10 }}>
        <Block w={780} h={360} title="the board">
          {BOARD.map(([title, note], i) => {
            const x = 20 + i * 250, y = 22;
            if (gone.includes(i)) return null;
            return closed === i
              ? (
                <div key={`o${i}`} style={{ position: "absolute", left: x, top: y, width: 230, height: 160, display: "grid", placeItems: "center" }}>
                  <svg width={230} height={160} style={{ position: "absolute", inset: 0 }}><rect x={1} y={1} width={228} height={158} rx={20} fill="none" stroke={pearl(0.45)} strokeWidth={OUTLINE.line} strokeDasharray={OUTLINE.dash} /></svg>
                  <UndoRing start={r.frozen === "during" ? 0.45 : 1} onUndo={undo} />
                </div>
              )
              : (
                <div key={`c${i}${back === i ? "b" : ""}`} className={back === i && !r.frozen ? "fin" : undefined} style={{ position: "absolute", left: x, top: y }}>
                  <Card w={230} h={160} step="box">
                    <div style={{ padding: "14px 16px", color: ink, fontWeight: 500 }}>{title}</div>
                    <div style={{ padding: "0 16px", color: dim }}>{note}</div>
                    {back === i && <Small style={{ position: "absolute", left: 16, bottom: 14, color: dim }}>put back</Small>}
                    <div onClick={() => close(i)} title="close" style={{ position: "absolute", right: 10, top: 10, width: 28, height: 28, borderRadius: 14, display: "grid", placeItems: "center", cursor: "pointer", color: dim }}><Glyph name="close" /></div>
                  </Card>
                </div>
              );
          })}
          {r.frozen === "during" && <Hand x={260 + 140} y={140} />}
        </Block>
      </div>
      <div style={{ position: "absolute", left: 812, top: 10 }}>
        <Block w={340} h={360} title="what happened">
          {log.length === 0 ? <Para>nothing yet</Para> : log.map((l, i) => <Line key={i} title={l} note={i === log.length - 1 ? "now" : ""} />)}
        </Block>
      </div>
    </Demo>
  );
}

// ---- 5. reliable: proof in the block that did it, the same stamp, flat time ---------------------------------------
const PLAN5 = ["open the 4 new pages", "shoot each one", "compare with yesterday"];
const TAKES = 1200;
function MiniPage({ k }: { k: number }) {
  return (
    <div style={{ width: 112, height: 72, borderRadius: 8, background: "#141416", boxShadow: `inset 0 0 0 1px ${on(0.1)}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 10, background: on(0.06) }} />
      <div style={{ position: "absolute", left: 8, top: 18, width: 44 + (k % 2) * 10, height: 40, borderRadius: 6, background: "#1f1f22" }} />
      <div style={{ position: "absolute", left: 64 + (k % 2) * 10, top: 18, right: 8, height: 18 + k * 4, borderRadius: 6, background: "#1f1f22" }} />
    </div>
  );
}
function Reliable() {
  const r = useRun("reliable");
  const [state, setState] = useState<"resting" | "working" | "done">(r.frozen === "during" ? "working" : "resting");
  const [stepAt, setStepAt] = useState(r.frozen === "during" ? 1 : 0), [times, setTimes] = useState<number[]>([]);
  const [settled, setSettled] = useState(r.frozen !== "landed");
  const run = (then?: () => void) => {
    const t0 = performance.now();
    setState("working"); setStepAt(0);
    r.after(TAKES / 3, () => setStepAt(1)); r.after((2 * TAKES) / 3, () => setStepAt(2));
    r.after(TAKES, () => { setState("done"); setStepAt(3); setTimes((t) => [...t, performance.now() - t0]); r.setPhase("landed"); then?.(); });
  };
  const play = () => { r.reset(); setTimes([]); r.setPhase("during"); run(() => r.after(900, () => run(() => r.after(900, () => run())))); };
  // held at landed: three real presses, timed for real, before the shot is taken
  useEffect(() => { if (r.frozen === "landed") r.after(800, () => run(() => r.after(200, () => run(() => r.after(200, () => run(() => setSettled(true))))))); }, []);
  useAuto("reliable", play);
  const shown = r.frozen === "landed" && !settled ? "working" : state;
  return (
    <Demo n={5} id="reliable" name="reliable" caption="Proof arrives in the block that did it; same stamp." play={() => { r.setPhase("during"); run(); }} playWord="again"
      fns={[["freeze · snap verdict GREEN/RED · checkpoint (work/blocks.ts, work/snap.ts, sol MCP)", "exists"], ["proof attached to the block that ran", "missing"], ["answer time per stage press", "missing"]]}>
      <div data-settled={settled || undefined} style={{ position: "absolute", left: 0, top: 10 }}>
        <Block w={660} h={380} title="check the new pages" state={shown}>
          {PLAN5.map((s, i) => <Line key={s} title={s} note={shown === "done" || i < stepAt ? <Check size={16} /> : i === stepAt && shown === "working" ? "now" : ""} />)}
          {shown === "done" && (
            <div key={times.length} className="fin" style={{ position: "absolute", left: 16, right: 16, top: 128 }}>
              <div style={{ display: "flex", gap: 12 }}>{[0, 1, 2, 3].map((k) => <MiniPage key={k} k={k} />)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: ink }}><Check />4 of 4 pages drew · 0 errors · same as yesterday</div>
            </div>
          )}
        </Block>
      </div>
      <div style={{ position: "absolute", left: 692, top: 10 }}>
        <Block w={460} h={380} title="each press, timed">
          {times.length === 0 ? <Para>press again: the same shape comes back in the same time.</Para> : times.slice(-6).map((t, i) => <Line key={i} title={`press ${times.length > 6 ? times.length - 6 + i + 1 : i + 1}`} note={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{(t / 1000).toFixed(2)} s <Check size={14} /></span>} />)}
          {times.length > 1 && <Small style={{ position: "absolute", left: 16, bottom: 16, color: dim }}>spread {((Math.max(...times) - Math.min(...times)) / 1000).toFixed(2)} s over {times.length} presses</Small>}
        </Block>
      </div>
    </Demo>
  );
}

// ---- 6. capable: one surprise, once, small, where the pointer was not ---------------------------------------------
const RECEIPTS = [["lunch", "12.40"], ["printer paper", "8.99"], ["bus pass", "25.00"]] as const;
const FOUND = [["textbook", "64.00"], ["lab goggles", "11.50"]] as const;
let surpriseShown = false;
function Surprise() {
  const r = useRun("surprise");
  const [phase, setPhase] = useState<"none" | "arriving" | "rest" | "taken">(r.frozen === "during" ? "arriving" : r.frozen === "landed" ? "rest" : "none");
  const [shown, setShown] = useState(!!r.frozen && r.frozen !== "before");
  const play = () => {
    if (surpriseShown) return;
    surpriseShown = true; setShown(true); r.setPhase("during");
    r.after(900, () => setPhase("arriving")); r.after(900 + TIMED.pour, () => { setPhase("rest"); r.setPhase("landed"); });
  };
  const reset = () => { r.reset(); surpriseShown = false; setShown(false); setPhase("none"); r.setPhase("before"); };
  useAuto("surprise", play);
  const found = phase === "arriving" || phase === "rest";
  return (
    <Demo n={6} id="surprise" name="capable, a surprise" caption="One thing more, done once, small, away from your pointer." play={play} disabled={shown} playWord={shown ? "shown once; it won't come again" : "play"}
      extra={shown ? <div onClick={reset} style={{ ...label, color: mute, cursor: "pointer", paddingBottom: 8, textDecoration: "underline" }}>reset the demo</div> : undefined}
      fns={[["yoursKeep offerNow · seen · undo (one offer at a time, never repeated, undoable)", "exists"]]}>
      <div style={{ position: "absolute", left: 0, top: 10 }}>
        <Block w={540} h={380} title={found ? "receipts · 5" : "receipts · 3"}>
          <div style={{ paddingTop: 6 }}>
            {RECEIPTS.map(([w, n]) => <Line key={w} title={w} note={n} />)}
            {FOUND.map(([w, n]) => (
              <div key={w} style={{ opacity: found ? (phase === "arriving" && r.frozen ? 0.5 : 1) : 0, transform: found ? "none" : "translateY(-6px)", transition: tr("opacity transform", TIMED.pour, EASE.reveal) }}>
                <Line title={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ width: 6, height: 6, borderRadius: 3, background: LIME }} />{w}</span>} note={`${n} · from mail`} />
              </div>
            ))}
          </div>
        </Block>
        <Hand x={150} y={82} />
      </div>
      <div style={{ position: "absolute", left: 572, top: 10 }}>
        <Block w={580} h={380} title="mail">
          {[["bookstore", "your order, receipt attached"], ["campus shop", "receipt for goggles"], ["Frank", "the release tonight"], ["Isaac", "the site copy"]].map(([who, what]) => <Line key={who} title={who} note={what} />)}
        </Block>
        {/* the surprise: a slip on the block that held the cause, far from the hand, small, with its own take-back */}
        {phase !== "none" && phase !== "taken" && (
          <Slip colour={LIME} style={{ left: 250, top: 300, display: "flex", gap: 14, alignItems: "center", transform: phase === "arriving" && r.frozen ? "scale(.9) rotate(-7deg)" : "rotate(-2deg)", opacity: phase === "arriving" && r.frozen ? 0.7 : 1, animation: r.frozen ? undefined : `stamp ${TIMED.pour}ms ${EASE.pour} both`, ["--rot" as string]: "-2deg" }}>
            I also filed the 2 receipts from mail
            <span onClick={() => setPhase("taken")} style={{ color: deep(0.55), fontWeight: 400, cursor: "pointer", textDecoration: "underline" }}>undo</span>
          </Slip>
        )}
        {phase === "taken" && <Small style={{ position: "absolute", left: 250, top: 308 }}>taken back; the two receipts are in mail again</Small>}
      </div>
    </Demo>
  );
}

// ---- 7. interpretability: intent, the two it chose from, the plan ticking, why in place ----------------------------
const PLAN7 = ["read the 12 merged PRs", "group them by area", "pick the tone", "write the three lines"];
function TextStill({ lines }: { lines: number }) {
  return (
    <div style={{ width: 300, height: 200, background: paper, padding: 24, boxSizing: "border-box" }}>
      {Array.from({ length: lines }, (_, i) => <div key={i} style={{ height: 10, borderRadius: 5, background: deep(i === 0 ? 0.6 : 0.18), width: `${i === 0 ? 50 : 70 + ((i * 37) % 30)}%`, marginBottom: 12 }} />)}
    </div>
  );
}
function Why() {
  const r = useRun("why");
  const [ticked, setTicked] = useState(r.frozen === "during" ? 2 : r.frozen === "landed" ? 4 : 0);
  const [why, setWhy] = useState(r.frozen === "landed");
  const play = () => {
    r.reset(); setTicked(0); setWhy(false); r.setPhase("during");
    [900, 1800, 2900, 3800].forEach((t, i) => r.after(t, () => setTicked(i + 1)));
    r.after(4600, () => { setWhy(true); r.setPhase("landed"); });
  };
  useAuto("why", play);
  const chosen = ticked >= 3, done = ticked >= 4, going = r.phase !== "before" || r.frozen === "before";
  return (
    <Demo n={7} id="why" name="interpretability" caption="One line of intent; the two it chose from; why." play={play} playWord={r.phase === "before" ? "play" : "again"}
      fns={[["update · a list block's steps tick in place (sol MCP)", "exists"], ["Brick.why · a why on snap pieces only (work/snap.ts)", "partial"], ["one-line intent per working block", "missing"], ["the alternatives a choice came from", "missing"]]}>
      <div style={{ position: "absolute", left: 0, top: 10 }}>
        <Block w={700} h={400} title="the release notes" state={done ? "done" : going ? "working" : "resting"}>
          {/* the intent: what it is doing and for whom, in one line, on the block itself */}
          <div style={{ padding: "10px 16px 6px", color: ink, display: "flex", gap: 8 }}><span style={{ color: mute }}>→</span>writing the notes from 12 merged PRs, for #builds, kept short</div>
          <div style={{ height: 1, background: on(0.06), margin: "6px 16px 4px" }} />
          {PLAN7.map((s, i) => (
            <Line key={s} title={<span style={{ color: i < ticked ? ink : i === ticked && going ? ink : dim }}>{s}</span>}
              note={i < ticked ? <Check size={16} /> : i === ticked && going ? <span style={{ color: dim }}>now</span> : ""} />
          ))}
        </Block>
      </div>
      <div style={{ position: "absolute", left: 732, top: 10 }}>
        <Block w={420} h={400} title="how it chose the tone">
          {chosen || ticked === 2 ? (
            <div className="fin" style={{ padding: "14px 16px 0" }}>
              <div style={{ display: "flex", gap: 20 }}>
                <Still w={300} h={200} scale={0.56} picked={chosen} words="short, 3 lines"><TextStill lines={4} /></Still>
                <Still w={300} h={200} scale={0.56} words="detailed, 8 lines"><TextStill lines={9} /></Still>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <Button h={28} flat onClick={() => setWhy((w) => !w)}>why?</Button>
              </div>
              <div style={{ overflow: "hidden", maxHeight: why ? 80 : 0, transition: tr("max-height", TIMED.glass * 2, EASE.reveal) }}>
                <div style={{ paddingTop: 12, color: ink, lineHeight: `${T.body[1] + 1}px` }}>Short, because your last three posts in #builds were under 40 words.</div>
              </div>
            </div>
          ) : <Para>it chooses once the PRs are grouped.</Para>}
        </Block>
      </div>
    </Demo>
  );
}

// ---- 8. being understood: your terms first; two stills, not a question; a correction sticks ------------------------
const SCHOOL = [["math 221", "exam friday"], ["chem lab", "report due wednesday"], ["english essay", "draft due monday"]] as const;
function Understood() {
  const r = useRun("understood");
  const h = r.frozen;
  const [shown, setShown] = useState(h === "during" || h === "landed");
  const [vague, setVague] = useState(h === "during" || h === "landed");
  const [density, setDensity] = useState<"compact" | "airy" | null>(h === "landed" ? "airy" : null);
  const [kept, setKept] = useState(h === "landed");
  const play = () => {
    r.reset(); setShown(false); setVague(false); setDensity(null); setKept(false); r.setPhase("during");
    r.after(700, () => setShown(true)); r.after(2000, () => setVague(true));
    r.after(3300, () => setDensity("airy")); r.after(4300, () => { setKept(true); r.setPhase("landed"); });
  };
  useAuto("understood", play);
  const airy = density === "airy", rowH = airy ? 52 : 34;
  const ListStill = ({ gap }: { gap: number }) => (
    <div style={{ width: 300, height: 200, background: "#1b1b1e", padding: "18px 20px", boxSizing: "border-box" }}>
      {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 10, borderRadius: 5, background: on(i === 0 ? 0.5 : 0.22), width: `${60 + ((i * 29) % 35)}%`, marginBottom: gap }} />)}
    </div>
  );
  return (
    <Demo n={8} id="understood" name="being understood" caption="Your folders, your last pick; vague asks get stills; corrections stick." play={play} playWord={r.phase === "before" ? "play" : "again"}
      fns={[["readHome · cleanFolders, the person's folder names (homefolders.ts) · names.ts", "exists"], ["yoursLearn heard · a correction sticks after three (LEARN_AT 3)", "partial"], ["the last pick as the default (settings.defaults is by hand)", "missing"], ["a vague ask answered with two stills", "missing"]]}>
      <Field w={W} h={44}><span style={{ color: ink, paddingLeft: 14 }}>{vague ? "make it nicer" : "sort out school this week"}</span></Field>
      {shown && (
        <div className="fin" style={{ position: "absolute", left: 0, top: 70 }}>
          <Block w={620} h={400} title="school, this week">
            {/* the first thing on the stage is already in the person's terms: their folders, their last sort */}
            <Small style={{ padding: "10px 16px 4px", display: "flex", gap: 6, alignItems: "center", color: dim }}>sorted by due date · your last pick</Small>
            {SCHOOL.map(([f, due]) => (
              <div key={f} style={{ height: rowH, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", margin: airy ? "4px 12px" : "0 12px", borderRadius: 12, background: airy ? on(0.04) : "transparent", transition: tr("height margin background", 460, EASE.pour) }}>
                <span style={{ color: ink, display: "inline-flex", gap: 10, alignItems: "center" }}><span style={{ color: mute, display: "inline-flex", transform: "scale(.8)" }}><Glyph name="files" /></span>{f}</span>
                <span style={{ color: dim }}>{due}</span>
              </div>
            ))}
          </Block>
        </div>
      )}
      {vague && (
        <div className="fin" style={{ position: "absolute", left: 652, top: 70 }}>
          <Block w={500} h={250} title="nicer: one of these">
            <div style={{ display: "flex", gap: 24, padding: "14px 16px 0 26px" }}>
              <Still w={300} h={200} scale={0.62} picked={density === "compact"} onPick={() => setDensity("compact")} words="compact"><ListStill gap={12} /></Still>
              <Still w={300} h={200} scale={0.62} picked={airy} onPick={() => { setDensity("airy"); }} words="airy"><ListStill gap={30} /></Still>
            </div>
          </Block>
        </div>
      )}
      {vague && (
        <div className="fin" style={{ position: "absolute", left: 652, top: 344 }}>
          <Block w={500} h={126} title="your defaults">
            <Line title="lists sort by" note="due date · your last pick" />
            {kept
              ? <div className="fin"><Line title={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ color: ink, display: "inline-flex", transform: "scale(.7)" }}><Glyph name="pin" /></span>lists look</span>} note={<span style={{ color: ink }}>airy · from now on</span>} /></div>
              : density ? <div style={{ padding: "4px 16px" }}><Button h={28} flat acts onClick={() => { setKept(true); r.setPhase("landed"); }}>keep {density} for every list</Button></div> : <Line title="lists look" note="compact" />}
          </Block>
        </div>
      )}
    </Demo>
  );
}

// ---- the sheet -----------------------------------------------------------------------------------------------------
const ROWS: Record<RowId, () => ReactNode> = { snap: Snap, slow: Slow, calm: Calm, control: Control, reliable: Reliable, surprise: Surprise, why: Why, understood: Understood };
function Sheet() {
  const ids = (only && only in ROWS ? [only] : Object.keys(ROWS)) as RowId[];
  return (
    <div style={{ ...TYPE, position: "relative", minHeight: "100vh", background: `url(${desk}) center/cover fixed` }}>
      <style>{`
        .fin{animation:fin ${TIMED.glass * 2}ms ${EASE.reveal} both}
        .ring{animation:ring 900ms ${EASE.leave} both}
        @keyframes fin{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
        @keyframes ring{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
        @keyframes stamp{0%{opacity:0;transform:scale(1.4) rotate(-12deg)}55%{opacity:1;transform:scale(.95) rotate(-3deg)}100%{opacity:1;transform:scale(1) rotate(var(--rot,-4deg))}}
        @media (prefers-reduced-motion: reduce){.fin,.ring{animation:none!important}}
      `}</style>
      <div style={{ position: "fixed", inset: 0, background: "var(--base)", backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
        {ids.map((id) => { const R = ROWS[id]; return <div key={id} style={{ borderBottom: ids.length > 1 ? `1px solid ${on(SHADE.on.line)}` : undefined }}><R /></div>; })}
      </div>
      <div data-ready style={{ display: "none" }} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Sheet /></StrictMode>);

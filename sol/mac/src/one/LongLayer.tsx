// The long project in the one session's window (#1002, behind `build.one.long`): his own answers, grouped by the kind
// of question, each kind a dial he drags between "ask me first", "ask me" and "you decide" (it clicks into a stop); and,
// back after a day or more, "since you were here" for the project: first the one place his hand is worth most, then
// per goal what moved and what waits. The view is the engine's (work/oneLong.ts), from real events only.
// Keys: on a dial, left and right move one stop; Home lets it go back to his answers.
import { useRef, useState, useSyncExternalStore, type PointerEvent as RPointer } from "react";
import { buildSwitch } from "../flag";
import { LONG_FLAG, STOPS, snap, stepDial, atOf, tookWords, whyOf, showSince, awayWords, type KindView, type LongView, type Mode } from "./long";
import type { Metas } from "../home/meta";
import "./long.css";

const sw = buildSwitch(LONG_FLAG);
export const useBuildOneLong = () => useSyncExternalStore(sw.sub, sw.get);
export const setBuildOneLong = (v: boolean) => sw.set(v);

export const meta = {
  LongDials: {
    job: "his own answers by kind of question, each kind a dial he drags between ask me first, ask me and you decide",
    flow: "know",
    states: ["no answers yet", "dials", "a dial dragged", "a dial set by him (auto to let go)"],
    keys: [{ press: "left / right on a dial", does: "moves it one stop" }, { press: "Home on a dial", does: "lets it go back to his answers" }],
    listens: ["work.one.long (engine oneLong.ts)", "build.one.long"],
  },
  LongSince: {
    job: "back after a day or more: the one place his hand is worth most first, then what moved and what waits per goal",
    flow: "know",
    states: ["hidden (here lately)", "shown", "got it"],
    keys: [{ press: "Enter on its first press", does: "opens the piece where his hand is worth most" }],
    listens: ["work.one.long's since"],
  },
} satisfies Metas;

/** one kind of question: his answers as beads along the track (agreed light, changed pink, bigger the longer he took),
 *  a knob he drags; it clicks into the nearest stop */
function DialRow({ k, onSet }: { k: KindView; onSet: (kind: string, to: Mode | "auto") => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [clicked, setClicked] = useState(0);
  const at = drag ?? atOf(k.mode);
  const xOf = (e: RPointer) => { const r = track.current!.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  const land = (m: Mode) => { setDrag(null); setClicked((n) => n + 1); if (m !== k.mode || k.dial === "auto") onSet(k.kind, m); };
  return (
    <li className={`lg-row lg-m-${k.mode}`} data-kind={k.kind}>
      <div className="lg-head"><b>{k.kind}</b><small>{whyOf(k)}</small>{k.dial !== "auto" && <button className="lg-auto" onClick={() => onSet(k.kind, "auto")} title="go back to what my answers say">by my answers</button>}</div>
      <div className="lg-beads" aria-label={`your answers on ${k.kind}`}>
        {k.answers.map((a, i) => <i key={i} className={a.agreed ? "lg-b agreed" : "lg-b changed"} style={{ ["--s" as string]: `${Math.min(14, 6 + Math.log2(1 + a.took / 10_000) * 2)}px` }}
          title={`${a.title}\nyou said: ${a.answer ?? "—"}${a.would && !a.agreed ? `\nI would have picked: ${a.would}` : ""}\nyou took ${tookWords(a.took)}`} />)}
        {Array.from({ length: Math.min(k.decided, 8) }, (_, i) => <i key={`d${i}`} className="lg-b decided" title="I decided this one" />)}
      </div>
      <div className="lg-track" ref={track} role="slider" tabIndex={0} aria-label={`${k.kind}: ${STOPS.find((s) => s.mode === k.mode)!.words}`}
        aria-valuemin={0} aria-valuemax={2} aria-valuenow={STOPS.findIndex((s) => s.mode === k.mode)} aria-valuetext={STOPS.find((s) => s.mode === k.mode)!.words}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag(Math.max(0, Math.min(1, xOf(e)))); }}
        onPointerMove={(e) => { if (drag !== null) setDrag(Math.max(0, Math.min(1, xOf(e)))); }}
        onPointerUp={(e) => { if (drag !== null) land(snap(xOf(e), k.decidable)); }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); land(stepDial(k.mode, e.key === "ArrowLeft" ? -1 : 1, k.decidable)); } if (e.key === "Home") { e.preventDefault(); onSet(k.kind, "auto"); } }}>
        <span className="lg-groove" />
        {STOPS.map((s) => <span key={s.mode} className={`lg-notch ${s.mode === "decide" && !k.decidable ? "locked" : ""}`} style={{ left: `${s.at * 100}%` }} />)}
        <span key={clicked} className={`lg-knob ${drag !== null ? "held" : "set"} lg-m-${k.mode}`} style={{ left: `${at * 100}%` }} />
      </div>
      <div className="lg-stops" aria-hidden>{STOPS.map((s) => <span key={s.mode} className={s.mode === k.mode ? "on" : s.mode === "decide" && !k.decidable ? "locked" : ""}>{s.mode === "decide" && !k.decidable ? "always yours" : s.words}</span>)}</div>
    </li>
  );
}

export function LongDials({ view, onSet }: { view: LongView | null; onSet: (kind: string, to: Mode | "auto") => void }) {
  const [open, setOpen] = useState(false);
  if (!view) return null;
  const decide = view.dials.filter((k) => k.mode === "decide").length, early = view.dials.filter((k) => k.mode === "early").length;
  return (
    <section className={`lg-dials ${open ? "open" : ""}`} aria-label="where your word goes">
      <button className="lg-open" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <b>your word</b><span>{!view.dials.length ? "nothing answered yet" : [early && `${early} kind${early > 1 ? "s" : ""} asked first`, decide && `${decide} I decide`, `${view.dials.length - early - decide} asked`].filter(Boolean).join(" · ")}</span>
        <span className="lg-mini" aria-hidden>{view.dials.map((k) => <i key={k.kind} className={`lg-m-${k.mode}`} />)}</span>
      </button>
      {open && <ul className="lg-list">{view.dials.map((k) => <DialRow key={k.kind} k={k} onSet={onSet} />)}
        {!view.dials.length && <li className="lg-none">Each time you answer a piece, it lands here, by kind. Five agreed in a row and I offer to decide those; where your answer changes things, I ask you first.</li>}</ul>}
    </section>
  );
}

export function LongSince({ view, now, onOpen, onGot }: { view: LongView | null; now: number; onOpen: (id: string) => void; onGot: () => void }) {
  const s = view?.since;
  if (!s || !showSince(s, now)) return null;
  return (
    <section className="lg-since" aria-label="since you were here">
      <header><b>since you were here</b><span>{awayWords(s.from, now)} · the project</span><button className="one-ghost" onClick={onGot}>got it</button></header>
      {s.worth && <button className="lg-worth" data-first onClick={() => onOpen(s.worth!.id)}>
        <span className="lg-worth-q">your hand is worth most here</span><b>{s.worth.title}</b><small>{s.worth.why}{s.worth.goal ? ` · for “${s.worth.goal}”` : ""}</small></button>}
      <ol className="lg-goals">{s.goals.slice(0, 5).map((g) => (
        <li key={g.goal}><b>{g.goal}</b>
          <span className="lg-steps" aria-label={`${g.count} moved`}>{g.moved.map((m, i) => <i key={i} className={`lg-step ${m.kind}`} title={`${new Date(m.at).toLocaleDateString(undefined, { weekday: "short" })}: ${m.words}`} />)}{g.count > g.moved.length && <small>+{g.count - g.moved.length}</small>}</span>
          <small>{g.moved.length ? g.moved[g.moved.length - 1].words : "nothing moved"}{g.waits.length ? ` · waits on you: ${g.waits.length}` : ""}</small></li>))}</ol>
      {s.decided > 0 && <p className="lg-decided">I decided {s.decided} the way you always did; each is in “your word”.</p>}
    </section>
  );
}

/** the note "I'll decide these now": one press pulls him back in (the dial back to ask me) */
export function PullBack({ kind, onPull }: { kind: string; onPull: () => void }) {
  return <button className="lg-pull" onClick={onPull}>pull me back on “{kind}”</button>;
}

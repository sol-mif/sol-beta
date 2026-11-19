// The closing moment's two pieces (#1088, the designer's): the one unsure thing in front, shown as its evidence, and the
// level. They sit where the lens was; "this is my Home" under them is the parent's.
//   Evidence  one Confirm (sort.ts) at a time: a drawing of why it is unsure, the question in a few words, two answers.
//             conflict: the day's column with both readings on it · guess: the folder as it sits on disk, with the
//             things found in it (`near`) · routine: four
//             weeks of the same day · private: the apps, shut.
//             `likely` is Jev's answer when it half-believes one (the dashed button); `took` when it was sure enough to
//             answer by itself: then the card says what it took and offers the undo, and asks nothing.
//   Level     how much the jelly does by itself, one poured track with four notches (record.ts `Hands`), its question
//             above and what the picked notch means under it (Marco's try 2026-11-17: words alone read as noise); dragged, pressed
//             or moved with the arrow keys; `ghost` is the notch Jev would pick, a dashed mark the person can press.
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Button, FileMark, Glyph, Meter } from "../kit";
import { hourOf } from "./Folder";
import type { Hands } from "./record";
import type { Confirm, Found } from "./sort";
import "./yours.css";

export const LEVELS: readonly [Hands, string, string][] = [
  ["record", "only watch", "I write down what I would do and change nothing."],
  ["show", "show me first", "I do the work and stop before anything is sent."],
  ["draft", "draft, you send", "I write the mail and posts; you press send."],
  ["do", "just do it", "I act, then tell you. Spending still asks."],
];

function Picture({ c, fact, other, near }: { c: Confirm; fact?: Found; other?: Found; near?: readonly Found[] }) {
  if (c.kind === "conflict") {
    const a = hourOf(other?.when) ?? 14, b = hourOf(fact?.when) ?? 15, y = (h: number) => `${((h - 12) / 6) * 100}%`;
    return (
      <div className="oby-day">
        {[12, 14, 16, 18].map((h) => <span key={h} style={{ top: y(h) }}>{h > 12 ? h - 12 : h}</span>)}
        <i className="was" style={{ top: y(a), height: "33%" }}>{other?.v}</i>
        <i className="oby-ask" style={{ top: y(b) }}>{fact?.v}</i>
      </div>
    );
  }
  if (c.kind === "routine") return <div className="oby-weeks">{Array.from({ length: 28 }, (_, i) => <i key={i} className={i % 7 === 6 ? "on" : ""} />)}</div>;
  if (c.kind === "private") return <div className="oby-shut">{c.q.replace(/^Keep | closed to me\?$/g, "").split(/ and |, /).map((n) => <i key={n}>{n[0]}<span>{n}</span></i>)}</div>;
  return (
    <div className="oby-tree">
      <div className="oby-dir"><Glyph name="files" hover /><b>{fact?.v}</b><span>{fact?.src}</span></div>
      {!!near?.length && <div className="in">{near.slice(0, 4).map((f) => <i key={f.id}><FileMark ext={f.kind === "project" ? "ts" : "pdf"} h={30} /><em>{f.v}</em></i>)}</div>}
    </div>
  );
}

export function Evidence({ c, fact, other, near, likely, took, left, onAnswer, onUndo }: {
  c: Confirm; fact?: Found; other?: Found; near?: readonly Found[]; likely?: "yes" | "no" | null; took?: "yes" | "no" | null; left: number; onAnswer: (a: "yes" | "no" | "into") => void; onUndo?: () => void;
}) {
  return (
    <div className="oby-ev" data-confirm={c.kind} key={c.id}>
      <div className="oby-pic"><Picture c={c} fact={fact} other={other} near={near} /></div>
      <div className="t-title">{took ? `I took “${took === "yes" ? c.yes : c.no}”.` : c.q}</div>
      <div className="oby-ans">
        {took ? <Button h={36} onClick={onUndo}>undo</Button> : <>
          <span className={likely === "yes" ? "ghost" : ""}><Button h={36} acts={likely !== "no"} onClick={() => onAnswer("yes")}>{c.yes}</Button></span>
          {c.into && <span><Button h={36} onClick={() => onAnswer("into")}>{c.into.label}</Button></span>}
          <span className={likely === "no" ? "ghost" : ""}><Button h={36} acts={likely === "no"} onClick={() => onAnswer("no")}>{c.no}</Button></span>
        </>}
        <span className="oby-left" aria-label={`${left} more`}>{Array.from({ length: left }, (_, i) => <i key={i} />)}</span>
      </div>
    </div>
  );
}

export function Level({ value, onChange, ghost, w }: { value: Hands; onChange: (h: Hands) => void; ghost?: Hands | null; w: number }) {
  const at = LEVELS.findIndex((l) => l[0] === value), track = useRef<HTMLDivElement>(null), held = useRef(false);
  const pick = (x: number) => { const r = track.current!.getBoundingClientRect(); onChange(LEVELS[Math.max(0, Math.min(3, Math.round(((x - r.left) / r.width) * 4 - 0.5)))][0]); };
  const down = (e: PointerEvent) => { held.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); pick(e.clientX); };
  const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(LEVELS[Math.min(3, at + 1)][0]); if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(LEVELS[Math.max(0, at - 1)][0]); };
  return (
    <div className="oby-level" style={{ width: w }} data-level={value}>
      <span className="t-label oby-q">what I do without asking you</span>
      <div ref={track} className="oby-track" style={{ width: w }} role="slider" tabIndex={0} aria-label="how much I do by myself" aria-valuemin={1} aria-valuemax={4} aria-valuenow={at + 1} aria-valuetext={LEVELS[at][1]}
        onPointerDown={down} onPointerMove={(e) => held.current && pick(e.clientX)} onPointerUp={() => { held.current = false; }} onKeyDown={key}>
        <Meter w={w} h={12} value={(at + 1) / 4} label="how much I do by myself" />
        {ghost && ghost !== value && <i className="ghost" style={{ left: `${((LEVELS.findIndex((l) => l[0] === ghost) + 1) / 4) * 100}%` }} />}
      </div>
      <div className="words">{LEVELS.map(([h, word], i) => <button key={h} type="button" className={i === at ? "on" : ""} onClick={() => onChange(h)}>{word}</button>)}</div>
      <span className="t-label oby-means">{LEVELS[at][2]}</span>
    </div>
  );
}

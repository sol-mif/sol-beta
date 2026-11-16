// A list whose steps are runs, drawn (#703; the design: mine/look/stage/runs.html, scenes 2 to 4). One row per background
// session: its jelly, its name and issue, what it said last, minutes of its four hours on a track, its PR. A done one
// rests with a green dot; the one that needs you turns yellow and comes to the top (its pill says "answer"). A row
// opens to the session: its own words in the on colour, its commands in grey, the files it wrote, its PR, and so far.
// The words and the order are runs.ts's; the jelly is Body.tsx's, its halo by what it does (look.md: the halo's states).
import { useState } from "react";
import { Body, haloDoing } from "../../Body";
import { Glass, textW } from "../../kit";
import { Pearl } from "../../kit/Pearl";
import { CURVE, SHADE, TYPE } from "../../kit/tokens";
import { on } from "../../kit/paint";
import { FUNCTIONAL } from "../../creature/palette";
import { fileName, hours, ordered, runDoing, runWords, thousands, type RunBody, type RunStep } from "./runs";

/** the jelly of a session or of the whole run: working, its halo close; waits, a yellow ring; done, rests with a green dot */
export function RunJelly({ doing, size }: { doing: "working" | "waits" | "done" | "rest"; size: number }) {
  const f = Math.round(size * 1.75), off = (size - f) / 2;
  return (
    <span className={`st-run-jelly ${doing}`} style={{ width: size, height: size }} aria-hidden>
      <span style={{ position: "absolute", left: off, top: off }}><Body size={f} state="settled" halo={haloDoing(doing === "working" ? "working" : "rest")} /></span>
    </span>
  );
}
const doingOf = (s: RunStep) => (s.run.state === "working" ? "working" : s.run.state === "waits" ? "waits" : s.run.state === "done" ? "done" : "rest");

/** a word on glass, half its height round (a pill); `pearl` when it is what has you, `sun` when it waits on you (the
 *  meaning channel's yellow, washed through the glass) */
const TAG_H = 24, TAG_PAD = 10;
/** the meaning channel's yellow (waits on you) at a strength, washed through the glass */
const sun = (a: number) => `rgba(${FUNCTIONAL.yellow.strong.join(",")},${a})`;
function Tag({ words, look }: { words: string; look?: "pearl" | "sun" }) {
  const w = textW(words, TYPE.label[0], 500) + 2 * TAG_PAD, r = TAG_H / 2;
  return (
    <span className={`st-run-tag ${look ?? ""}`} style={{ width: w, height: TAG_H }}>
      {look === "pearl" ? <Pearl w={w} h={TAG_H} r={r} style={{ position: "absolute", inset: 0 }} />
        : <span style={{ position: "absolute", inset: 0 }}><Glass w={w} h={TAG_H} r={r} step="raised" {...(look === "sun" ? { fill: sun(0.14) } : {})} edge={0} /></span>}
      <span className="st-run-tagw">{words}</span>
    </span>
  );
}

export function RunRows({ body }: { body: RunBody }) {
  const [open, setOpen] = useState<string | null>(null);
  const steps = ordered(body);
  const one = open ? steps.find((s) => s.run.name === open) : undefined;
  if (one) return <RunOpen s={one} cap={body.cap} back={() => setOpen(null)} />;
  return (
    <div className="st-runs" data-part="the background">
      {!steps.length && <div className="st-note">nothing runs in the background on {body.where}</div>}
      {steps.map((s) => {
        const r = s.run, h = hours(r.min, body.cap), y = r.state === "waits";
        return (
          <div key={r.name} className={`st-run ${r.state}`} data-part={r.name} role="button" tabIndex={0}
            onClick={() => setOpen(r.name)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(r.name); }}>
            {(y || r.state === "working") && <Glass r={CURVE.radius.row} fill={y ? sun(0.07) : on(SHADE.on.hover)} edge={0} />}
            <RunJelly doing={doingOf(s)} size={28} />
            <div className="st-run-who"><div className="st-run-nm">{r.name}</div><div className="st-run-is">{r.issue ? `#${r.issue}` : ""}{r.issue && r.what ? " · " : ""}{r.what ?? ""}</div></div>
            <div className="st-run-ln">{r.said || (r.state === "queued" ? "not started" : "")}</div>
            <div className="st-run-far"><div>{h.words}</div><div className="st-run-track"><i style={{ width: `${h.part * 100}%` }} /></div></div>
            <div className="st-run-pr">{y ? <Tag words="answer" look="sun" /> : r.pr ? <Tag words={`PR #${r.pr.n}`} /> : null}</div>
          </div>
        );
      })}
    </div>
  );
}

/** one session opened: its words, its commands, the files it wrote, its PR, and how far it has come */
function RunOpen({ s, cap, back }: { s: RunStep; cap: number; back: () => void }) {
  const r = s.run, h = hours(r.min, cap);
  return (
    <div className={`st-runone ${r.state}`} data-part={`${r.name} opened`}>
      <div className="st-runone-head">
        <button className="st-runone-back" onClick={back}>In the background ›</button>
        <RunJelly doing={doingOf(s)} size={18} />
        <span className="st-run-nm">{r.name}</span>
        <span className="st-run-is">{r.issue ? `#${r.issue}` : ""}{r.issue && r.what ? " · " : ""}{r.what ?? ""}</span>
        <span className="st-runone-tags">
          <Tag words={h.words} />
          {r.state === "waits" ? <Tag words="waits on your word" look="sun" /> : r.pr && (r.pr.url
            ? <a href={r.pr.url} target="_blank" rel="noreferrer"><Tag words={`PR #${r.pr.n}${r.pr.draft ? " · draft" : ""}`} look="pearl" /></a>
            : <Tag words={`PR #${r.pr.n}${r.pr.draft ? " · draft" : ""}`} look="pearl" />)}
        </span>
      </div>
      <div className="st-runone-body">
        <div className="st-runone-feed">
          {r.moves.slice(-6).map((m, i) => (
            <div key={i} className={`st-move ${m.k === "said" ? "st-move-said" : ""}`} data-part={`${r.name} › ${m.k}`}>
              <span className="k">{m.k === "said" ? "" : m.k}</span><span className="w">{m.w}</span>
            </div>
          ))}
          {r.state === "waits" && r.done && <div className="st-move st-move-said st-move-waits"><span className="k" /><span className="w">{r.done}</span></div>}
        </div>
        <div className="st-runone-side">
          <h4>files it wrote</h4>
          <div className="st-runone-files">{r.files.length ? r.files.map((f) => <span key={f} className="st-runone-file" title={f}>{fileName(f)}</span>) : <span className="st-note">none yet</span>}</div>
          <h4>so far</h4>
          <div className="st-runone-stat"><span><b>{r.turns}</b>turns</span><span><b>{r.commits}</b>commits</span><span><b>{thousands(r.tokens)}</b>tokens</span></div>
        </div>
      </div>
    </div>
  );
}

/** the run folded: one chip by the talk, in every session of the project ("NucBox · 1 working · 3 done"); its jelly moves
 *  while something works; yellow while one needs you. A click opens the block on the stage */
export function RunChip({ body, onOpen }: { body: RunBody; onOpen: () => void }) {
  const d = runDoing(body), y = d === "waits";
  return (
    <button className={`st-runchip ${d}`} onClick={onOpen} title="what runs in the background">
      <Glass r={CHIP_H / 2} step="raised" edge={0} {...(y ? { fill: sun(0.13) } : {})} />
      <RunJelly doing={d === "rest" ? "done" : d} size={20} />
      <span className="st-runchip-where">{body.where}</span>
      <span className="st-runchip-words">{runWords(body)}</span>
    </button>
  );
}
const CHIP_H = 32;

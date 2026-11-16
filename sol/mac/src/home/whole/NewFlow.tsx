// A new flow, drawn as stations (#802, plan Part C slice 39; flows.md "The model"; the still home/shots/flows-1-2.png),
// behind sol.home.whole. What "every time …" in Home's box makes: a card over the box with the sentence and its
// stations (watches · Jev asks, with its question, its line and last week's dots · Sol makes · on your list), the
// ladder at read (the rung asked for said under it, a rung it can never have struck), and three answers: run it on last
// week, record-only (writes only the ledger), save it (onto the flows page, at read), not now. What was just done stays
// with its undo, after the card has gone too. Drawn from the kit (Card, Glass, Pill, Button, Home's warm answer).
import { useRef } from "react";
import { Button, Card, Glass, Pill, useSize } from "../../kit";
import { dim, ink, mute, on, pearl } from "../../kit/paint";
import { CURVE, JELLY, SHADE, TYPE } from "../../kit/tokens";
import { Warm } from "./First";
import { RUNGS } from "./policy";
import { clearLine, everyP, flowOf, rungLine, type Flow, type Station } from "./flows";
import { dropFlow, runLastWeek, saveFlow, undoFlows, useFlows } from "./flowsStore";
import { goTo } from "./sourcesStore";
import "../whole-flows.css";

const SUN = JELLY.warm[3], WARM = JELLY.warm[1];
const strike = (w: string) => [...w].map((c) => `${c}̶`).join("");
export const KIND_WORD: Record<Station["kind"], string> = { watch: "watches", judge: "Jev asks", make: "Sol makes", you: "on your list" };

/** a station's mark (flows.md: watches hollow · Jev asks a nacre diamond · Sol makes warm · your yes a yellow ring) */
export function Mark({ kind }: { kind: Station["kind"] }) {
  if (kind === "judge") return <span className="hfl-mark hfl-diamond" style={{ background: pearl(0.9) }} />;
  if (kind === "make") return <span className="hfl-mark" style={{ background: WARM }} />;
  return <span className="hfl-mark hfl-ring" style={{ borderColor: kind === "you" ? SUN : ink }} />;
}

/** a Jev station's chart: last week's things as dots on 0..1, its line, and how many clear it */
export function Dots({ q }: { q: NonNullable<Station["question"]> }) {
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  return (
    <div className="hfl-q" data-question-line={q.line}>
      <Glass r={CURVE.radius.row} step="card" />
      <div className="hfl-qh" style={{ color: mute }}><span>{q.type === "noul" ? "yes or no" : "choice"}</span><span>Jev · 150 ms</span></div>
      <div className="hfl-dots" ref={box}>
        {w > 0 && <>
          {q.dots.map((p, i) => <span key={i} className="hfl-dot" style={{ left: p * w, top: `${30 + ((i * 37) % 9) * 6}%`, background: p >= q.line ? ink : "transparent", borderColor: p >= q.line ? ink : on(0.45) }} />)}
          <span className="hfl-line" style={{ left: q.line * w, background: ink }}><i style={{ color: ink }}>{q.line.toFixed(2)}</i></span>
        </>}
      </div>
      <div className="hfl-qf" style={{ color: dim }}><b style={{ color: ink }}>{clearLine(q).split(" ")[0]} of {q.dots.length}</b>{clearLine(q).replace(/^\d+ of \d+/, "")}</div>
    </div>
  );
}

/** the new flow drawn as stations, with its ladder and save / not now; over Home's box, and on the flows page (F3) */
export function Card1({ f }: { f: Flow }) {
  return (
    <Card w={0} step="pop" style={{ width: "100%" }}>
      <div className="hfl-card" data-new-flow={f.id} data-rung={f.rung}>
        <div className="hfl-meta" style={{ color: dim }}><span>∞ a new flow</span><span>·</span><span>{f.place}</span><span className="hfl-right" style={{ color: mute }}>not saved yet · {f.lastRun === "never" ? "never run" : f.lastRun}</span></div>
        <div className="hfl-title" style={{ color: ink, fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>{f.sentence}</div>
        <div className="hfl-stations" style={{ gridTemplateColumns: `repeat(${f.steps.length}, minmax(0, 1fr))` }}>
          <span className="hfl-rail" style={{ background: on(0.15) }} />
          {f.steps.map((s, i) => (
            <div key={i} className="hfl-station" data-station={s.kind}>
              <Mark kind={s.kind} />
              <small style={{ color: mute }}>{KIND_WORD[s.kind]}</small>
              <b style={{ color: ink }}>{s.title}</b>
              <span style={{ color: dim }}>{s.detail}</span>
              {s.question && <Dots q={s.question} />}
            </div>
          ))}
        </div>
        <div className="hfl-ladder">
          <span style={{ color: mute }}>how far it may go</span>
          <Pill words={RUNGS.map((r) => (r === f.ceiling ? strike(r) : r))} picked={RUNGS.indexOf(f.rung)} h={28} />
          <span className="hfl-rungline" data-rungline style={{ color: dim }}>{rungLine(f)}</span>
        </div>
        <div className="hfl-acts">
          <Warm h={32} onClick={() => runLastWeek(f.id)}>run it on last week, record-only</Warm>
          <Button h={32} onClick={() => saveFlow(f.id)}>save it</Button>
          <span className="hfl-space" />
          <button type="button" className="hfl-mini" style={{ color: mute }} onClick={() => dropFlow(f.id)}>not now</button>
        </div>
      </div>
    </Card>
  );
}

/** the new flow over Home's box, and what was just done to it (with its undo) once it has gone */
export function NewFlow() {
  const v = useFlows();
  if (!v) return null;
  const done = v.done;
  return (
    <>
      {v.draft && <Card1 f={v.draft} />}
      {done && done.line && (
        <div className="hfl-receipt" data-receipt="flows" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          {!v.draft && /flows page/.test(done.line) && <button type="button" className="hfl-mini" style={{ color: ink }} onClick={() => goTo("flows")}>open ›</button>}
          {done.ledgerId && <button type="button" className="hfl-mini" style={{ color: ink }} onClick={() => undoFlows(done.ledgerId)}>undo</button>}
        </div>
      )}
    </>
  );
}

/** Sol's read of a sentence that says "every time …" (scene 1): one row, the job among the five, and the second
 *  question, once or every time, at its p; then where it goes: a flow, watching, making, starting record-only */
export function FlowRead({ sentence }: { sentence: string }) {
  const f = flowOf(sentence, "preview"), p = everyP(sentence);
  const make = f.steps.find((s) => s.kind === "make")!;
  return (
    <div className="hs-panel" data-flow-read style={{ backdropFilter: `blur(${SHADE.blur}px)`, WebkitBackdropFilter: `blur(${SHADE.blur}px)`, borderRadius: CURVE.radius.card }}>
      <Glass r={CURVE.radius.card} step="pop" />
      <div className="hs-head" style={{ color: mute }}><span>Sol’s read · one thing · it says “every time”, so it is a flow</span><span className="hs-ms">read in 1 ms</span></div>
      <div className="hfl-read">
        <span className="hfl-read-q" style={{ color: ink, fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px` }}>“{sentence}”</span>
        <div className="hfl-read-r">
          <div className="hfl-read-line"><Pill words={["a note", "a date", "for you", "a job", "a thing to make"]} picked={3} h={28} /><span style={{ color: mute }}>sure · .91</span></div>
          <div className="hfl-read-line" data-every><Pill words={["once", "every time"]} picked={1} h={28} /><span style={{ color: mute }}>{p.toFixed(2).replace(/^0/, "")} · a flow: a job that waits for something to happen</span></div>
          <div className="hfl-read-where" style={{ color: dim }}><b style={{ color: ink }}>a flow in {f.place}</b> · watches {f.trigger.source} · {make.title} · <b style={{ color: ink }}>starts record-only</b></div>
        </div>
      </div>
    </div>
  );
}

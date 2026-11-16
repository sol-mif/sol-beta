// The flows page (#802, plan Part C slice 39; flows.md "The flows page"; the still home/shots/flows-7.png), behind
// sol.home.whole. Home's place "flows", from the side's foot: everything that runs without you, a row per flow (what it
// is, what it watches, the ladder, last ran, what it needs from you, an on switch). A row opens to its policy in your
// words, its stations with Jev's questions and lines, and its last run. Below: what Sol saw you do by hand, "make it a
// flow / no". What was just done stays at the foot with its undo. Drawn from the kit (Glass, Pill, Pearl, Button).
import { useState } from "react";
import { Button, Glass, Pearl, Pill } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, JELLY } from "../../kit/tokens";
import { RUNGS } from "./policy";
import { flowsLine, rungLine, type Flow } from "./flows";
import { dropHabit, keepHabit, pauseFlow, undoFlows, useFlows } from "./flowsStore";
import { Card1, Dots, KIND_WORD, Mark } from "./NewFlow";
import "../whole-flows.css";

const SUN = JELLY.warm[3];
const strike = (w: string) => [...w].map((c) => `${c}̶`).join("");

/** the kit's switch (ui.md: 40 × 24, on a warm wash, the pearl knob); C45: exported, the applications and follow-ups flows wear it too */
export function Switch({ on: isOn, label, onFlip }: { on: boolean; label: string; onFlip: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={isOn} aria-label={label} className="hfl-switch" data-on={isOn || undefined} onClick={(e) => { e.stopPropagation(); onFlip(); }} onKeyDown={(e) => e.stopPropagation() /* F4: Enter flips the switch, never the row too */}>
      <Glass r={12} step={isOn ? "raised" : "card"} fill={isOn ? JELLY.warm[1] : undefined} />
      <span className="hfl-knob"><Pearl w={18} h={18} r={9} /></span>
    </button>
  );
}

function Row({ f, open, onOpen }: { f: Flow; open: boolean; onOpen: () => void }) {
  return (
    <div className="hfl-row" data-flow={f.id} data-open={open || undefined} data-on={f.on || undefined} style={{ opacity: f.on ? 1 : 0.55 }}>
      <Glass r={CURVE.radius.card} step={open ? "raised" : "card"} />
      <div className="hfl-row-line" role="button" tabIndex={0} aria-expanded={open} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
        <span className="hfl-name"><b style={{ color: ink }}>{f.name}</b><small style={{ color: mute }}>{f.sentence}</small></span>
        <span className="hfl-cell" style={{ color: dim }}>{f.trigger.source}</span>
        <span className="hfl-cell"><Pill words={RUNGS.map((r) => (r === f.ceiling ? strike(r) : r))} picked={RUNGS.indexOf(f.rung)} h={24} /></span>
        <span className="hfl-cell" style={{ color: dim }}>{f.lastRun}</span>
        <span className="hfl-cell" style={{ color: f.needs.length ? SUN : mute }}>{f.needs[0] ?? "nothing"}</span>
        <Switch on={f.on} label={`${f.name}: ${f.on ? "on" : "paused"}`} onFlip={() => pauseFlow(f.id, !f.on)} />
      </div>
      {open && (
        <div className="hfl-open" data-flow-open={f.id}>
          <div className="hfl-open-col">
            <small style={{ color: mute }}>its policy, in your words</small>
            <p className="hfl-policy" style={{ color: ink }}>{f.policy.map((s, i) => <span key={i}><u style={{ textDecorationColor: on(0.35) }}>{s}</u>{i < f.policy.length - 1 ? " " : ""}</span>)}</p>
            <small style={{ color: dim }}>{rungLine(f)}</small>
          </div>
          <div className="hfl-open-col">
            <small style={{ color: mute }}>{f.steps.length ? "its stations, and the line Jev must clear" : "last run"}</small>
            {f.steps.length ? f.steps.map((s, i) => (
              <div key={i} className="hfl-mini-station" data-station={s.kind}><Mark kind={s.kind} /><span style={{ color: mute }}>{KIND_WORD[s.kind]}</span> <span style={{ color: ink }}>{s.title}</span>{s.question && <Dots q={s.question} />}</div>
            )) : <span style={{ color: ink }}>{f.lastRun}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function FlowsPage() {
  const v = useFlows();
  const [open, setOpen] = useState<string | null>(null);
  if (!v) return null;
  const [first, second] = flowsLine(v.flows);
  const done = v.done;
  return (
    <section className="hw hfl" data-place="talk" data-home-whole data-flows>
      <div className="hw-date" style={{ color: mute }}>Flows · what runs without you, and how far it may go</div>
      <div className="hfl-head">
        <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
        <span className="hfl-hint" style={{ color: mute }}>a new flow: say “every time …” in the box on today</span>
      </div>
      <div className="hfl-row hfl-heads" style={{ color: mute }}><div className="hfl-row-line"><span>flow</span><span>watches</span><span>may</span><span>last ran</span><span>needs</span><span>on</span></div></div>
      {v.flows.map((f) => <Row key={f.id} f={f} open={open === f.id} onOpen={() => setOpen((o) => (o === f.id ? null : f.id))} />)}
      <div className="hfl-habits">
        <small style={{ color: mute }}>Sol saw you do these by hand · seen in your browser and your calendar</small>
        {v.habits.length === 0 && <span style={{ color: mute }}>nothing new</span>}
        {v.habits.map((h) => (
          <div key={h.id} className="hfl-habit" data-habit={h.id}>
            <span className="hfl-habit-t"><span style={{ color: ink }}>“{h.sentence}”</span><small style={{ color: mute }}>{h.seen}</small></span>
            <Button h={24} onClick={() => keepHabit(h.id)}>make it a flow</Button>
            <Button h={24} onClick={() => dropHabit(h.id)}>no</Button>
          </div>
        ))}
      </div>
      {v.draft && <Card1 f={v.draft} /> /* F3: "make it a flow" here shows the draft here, to save or not */}
      {done && done.line && (
        <div className="hfl-receipt" data-receipt="flows" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          {done.ledgerId && <button type="button" className="hfl-mini" style={{ color: ink }} onClick={() => undoFlows(done.ledgerId)}>undo</button>}
        </div>
      )}
    </section>
  );
}

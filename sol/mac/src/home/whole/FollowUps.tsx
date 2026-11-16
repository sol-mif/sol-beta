// The follow-ups flow in people (#808, plan Part C slice 45; flows.md flow 2, scene 3; the stills home/shots/flows-3.png,
// flows-3-2.png), behind sol.home.whole and the flow's own switch. Home's place "people": the one line ("Priya, three
// days on. The message is drafted."), the front person's flow as stations (you met · keep in touch? · a message drafted ·
// your yes · a reply? · one nudge), the drafted message in front as a card you can change word by word, sent from
// LinkedIn only on your yes (pick 2 A), the others as edges; beside it the people around it, each with where the flow
// has them; under it a line to say who you met (the trigger), and what was just done with its undo. From the kit.
import { useEffect, useState } from "react";
import { Button, Card, Glass } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, JELLY, TYPE } from "../../kit/tokens";
import { Warm } from "./First";
import { Mark } from "./NewFlow";
import { Switch } from "./FlowsPage";
import { aroundLine, dayName, needsOf, peopleLine, stateOn, stationsOf, type Met } from "./met";
import { answerMet, editDm, laterMet, noteMet, undoMet, useMet } from "./outreachStore";
import { pauseFlow, useFlows } from "./flowsStore";
import { usePlaces } from "./placesStore";
import "../whole-outreach.css";

const SUN = JELLY.warm[3];
const MONTH = "November";

function Face({ m }: { m: Met }) {
  return <span className="hout-face" style={{ background: on(0.12), color: dim }}>{m.initials}</span>;
}

function Front({ m, today, behind }: { m: Met; today: number; behind: Met[] }) {
  const nudge = stateOn(m, today) === "nudge";
  const text = (nudge ? m.dm?.nudge?.text : m.dm?.text) ?? "";
  const [words, setWords] = useState(text);
  useEffect(() => setWords(text), [text]);
  const first = m.name.split(" ")[0];
  return (
    <div className="hout-stack">
      <Card w={0} step="pop" style={{ width: "100%" }}>
        <div className="hout-card" data-front={m.id} data-state={nudge ? "nudge" : m.state}>
          <div className="hout-meta" style={{ color: dim }}><span>∞ follow-ups</span><span>·</span><span>people › {m.name}</span><span className="hout-right" style={{ color: SUN }}>{nudge ? "the one nudge" : `drafted ${m.dm && m.dm.drafted === today ? "today" : dayName(m.dm?.drafted ?? today)}`}</span></div>
          <div className="hout-title" style={{ color: ink, fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>{nudge ? `Nudge ${m.name}, once?` : `Message ${m.name} on LinkedIn?`}</div>
          <div className="hout-why" style={{ color: dim }}>{nudge
            ? `Sent ${dayName(m.dm!.sent!)}, and Jev reads no reply in seven days. One nudge, then nothing more. Change any word; it sends as written.`
            : `Three days after the ${m.where}, as you said. Change any word; it sends as written.`}</div>
          <label className="hout-dm">
            <Glass r={CURVE.radius.row} step="box" />
            <textarea aria-label={`the message to ${first}`} value={words} rows={5} style={{ color: ink }}
              onChange={(e) => setWords(e.target.value)} onBlur={() => { if (words !== text) editDm(m.id, words); }} />
          </label>
          <div className="hout-chips">
            {[`your note · ${dayName(m.met).split(" ")[0]}`, `${m.org} · ${m.note.split(",")[0]}`, `on LinkedIn`].map((w) => (
              <span key={w} className="hout-chip" style={{ color: dim }}><Glass r={CURVE.radius.row} step="card" />{w}</span>
            ))}
          </div>
          <div className="hout-acts">
            <Warm h={32} onClick={() => { if (words !== text) editDm(m.id, words); answerMet(m.id, nudge ? "send the nudge" : "send"); }}>{nudge ? "send the nudge" : "send on LinkedIn"}</Warm>
            <Button h={32} onClick={() => answerMet(m.id, "not now")}>not now</Button>
            <span className="hout-space" />
            <button type="button" className="hout-mini" style={{ color: mute }} onClick={() => laterMet(m.id)}>later</button>
          </div>
        </div>
      </Card>
      {behind.slice(0, 2).map((b, i) => (
        <div key={b.id} className="hout-edge" data-edge={b.id} style={{ marginLeft: (i + 1) * 12, marginRight: (i + 1) * 12, color: mute }}>
          <Glass r={CURVE.radius.card} step="card" />
          <span style={{ color: dim }}>{b.name}</span> · {stateOn(b, today) === "nudge" ? "no reply in 7 days · one nudge, proposed" : "a message drafted"}
        </div>
      ))}
    </div>
  );
}

/** say who you met: the follow-ups flow's trigger, a note in people */
function Met1() {
  const [t, setT] = useState("");
  return (
    <label className="hout-say" data-met-say>
      <Glass r={CURVE.radius.field} step="card" />
      <input value={t} placeholder="met someone? “met Priya Shah at the Stripe info session, said to ping her about new grad”" aria-label="who you met" style={{ color: ink }}
        onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && t.trim()) { noteMet(t.trim()); setT(""); } }} />
      <small style={{ color: mute }}>↵ keeps it in people</small>
    </label>
  );
}

export function FollowUps() {
  const v = useMet(), flows = useFlows(), places = usePlaces();
  if (!v) return null;
  // the people the side already keeps (places, #799) that the flow has no note of: kept, not followed up
  const others = (places?.people ?? []).filter((p) => !v.people.some((m) => m.name === p.name));
  const flow = flows?.flows.find((f) => f.id === "f-follow"), isOn = flow?.on ?? true;
  const needs = isOn ? needsOf(v.people, v.today) : [], front = needs[0];
  const [first, second] = isOn ? peopleLine(v.people, v.today) : ["Follow-ups is paused.", "Nothing is drafted until you turn it on."];
  const shown = front ?? v.people[0];
  const done = v.done;
  return (
    <section className="hw hout" data-place="talk" data-home-whole data-people data-flow-living="f-follow" data-on={isOn || undefined}>
      <div className="hout-top">
        <div className="hw-date" style={{ color: mute }}>{dayName(v.today).replace(/^(\w+) (\d+)$/, (_, d, n) => `${({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" } as Record<string, string>)[d]} ${n} ${MONTH}`)} · people · the follow-ups flow, at {flow?.rung ?? "draft"}</div>
        <span className="hout-right hout-look" style={{ color: mute }}>
          <span>{isOn ? "a message three days on · one nudge after seven · you press send" : "paused"}</span>
          <Switch on={isOn} label={`follow-ups: ${isOn ? "on" : "paused"}`} onFlip={() => pauseFlow("f-follow", !isOn)} />
        </span>
      </div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
      {shown && (
        <div className="hout-stations hout-six" data-stations={shown.id}>
          <span className="hout-rail" style={{ background: on(0.15) }} />
          {stationsOf(shown).map((s, i) => (
            <div key={i} className="hout-station" data-station={s.kind} style={{ opacity: s.lit ? 1 : 0.6 }}>
              <Mark kind={s.kind} />
              <small style={{ color: mute }}>{s.when}</small>
              <b style={{ color: ink }}>{s.title}</b>
              <span style={{ color: dim }}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
      <div className="hout-cols">
        {front ? <Front key={front.id} m={front} today={v.today} behind={needs.slice(1)} /> : <div className="hout-none" style={{ color: mute }}>{isOn ? "nothing to send · a message drafts three days after you meet someone" : "paused: turn it on to draft follow-ups again"}</div>}
        <div className="hout-around" data-around>
          <small style={{ color: mute }}>the people around it</small>
          {v.people.map((m) => {
            const st = stateOn(m, v.today);
            return (
              <div key={m.id} className="hout-person" data-person={m.id} data-state={st} data-front={m.id === front?.id || undefined} style={{ opacity: st === "held" || st === "not now" ? 0.55 : 1 }}>
                <Glass r={CURVE.radius.card} step={m.id === front?.id ? "raised" : "card"} />
                <Face m={m} />
                <span className="hout-person-t"><span style={{ color: ink }}>{m.name} · {m.org}</span><small style={{ color: mute }}>{aroundLine(m, v.today)}</small></span>
              </div>
            );
          })}
          {others.map((p) => (
            <div key={p.id} className="hout-person" data-person={p.id} data-state="kept">
              <Glass r={CURVE.radius.card} step="card" />
              <span className="hout-face" style={{ background: on(0.12), color: dim }}>{p.name.replace(/^prof\. /, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span className="hout-person-t"><span style={{ color: ink }}>{p.name}</span><small style={{ color: mute }}>{p.note} · kept, no follow-up</small></span>
            </div>
          ))}
        </div>
      </div>
      <Met1 />
      {done && done.line && (
        <div className="hout-receipt" data-receipt="people" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          {done.ledgerId && <button type="button" className="hout-mini" style={{ color: ink }} onClick={() => undoMet(done.ledgerId)}>undo</button>}
        </div>
      )}
    </section>
  );
}

// The applications flow, living (#808, plan Part C slice 45; flows.md flow 1, scene 2; the still home/shots/flows-2.png),
// behind sol.home.whole and the flow's own switch. Home's place "jobs" (the side's jobs folder): the crumb and the flow's
// rung, the one line ("Two things need you here. Figma is being typed."), the flow as stations with each posting as a
// token where it stands (watches · for you? .70 · Sol makes · ready? .80 · your yes), the one that needs you in front as
// a card (submit is yours, every time; Sol's hand stops before it) with the others as edges behind it, Sol's hand in
// your browser beside it, and what was just done with its undo. Drawn from the kit (Card, Glass, Button, Home's warm).
import { useState } from "react";
import { Button, Card, Glass } from "../../kit";
import { dim, ink, mute, on } from "../../kit/paint";
import { CURVE, JELLY, TYPE } from "../../kit/tokens";
import { Warm } from "./First";
import { Mark, KIND_WORD } from "./NewFlow";
import { Switch } from "./FlowsPage";
import { appsLine, cardOf, needsOf, stationsOf, tokenWord, type Posting } from "./postings";
import { answerPosting, laterPosting, lookNow, undoPosting, useApps } from "./outreachStore";
import { pauseFlow, useFlows } from "./flowsStore";
import { goTo } from "./sourcesStore";
import "../whole-outreach.css";

const SUN = JELLY.warm[3];
const TINT: Record<string, string> = { Figma: JELLY.six[4], Stripe: JELLY.six[3], Linear: JELLY.six[2], Shopify: JELLY.six[5], Ramp: JELLY.six[1] };

/** a company's mark: its first letter on its tint */
export function Co({ name }: { name: string }) {
  return <span className="hout-co" style={{ background: TINT[name] ?? on(0.2), color: ink }}>{name[0]}</span>;
}
/** a posting where it stands on the flow: its mark, its name, its word; yours wears the yellow ring */
function Token({ p }: { p: Posting }) {
  const yours = p.state === "ready" || p.state === "asks" || p.state === "missing";
  return (
    <span className="hout-token" data-token={p.id} data-state={p.state} style={{ boxShadow: yours ? `inset 0 0 0 1.5px ${SUN}` : undefined }}>
      <Glass r={CURVE.radius.row} step="card" />
      <Co name={p.company} /><span style={{ color: ink }}>{p.company}</span><small style={{ color: mute }}>{tokenWord(p)}</small>
    </span>
  );
}

/** what a portal answer of the draft says (the stub's; the engine sends the filled fields with the page ledger) */
const fieldsOf = (p: Posting): [string, string][] => [
  ["Name", "Marco L."], ["Résumé", "resume-nov.pdf"], ["Cover letter", `${p.company.toLowerCase()}-cover.docx, from the two you liked`],
  [`Why ${p.company}?`, `${p.company} is the tool I learned design in …`], ["Start date", "June 2027"], ["Work authorization", "yes"], ["How did you hear", p.site],
].slice(0, Math.max(3, p.answers)) as [string, string][];

function Front({ p, behind }: { p: Posting; behind: Posting[] }) {
  const [reading, setReading] = useState(false);
  const c = cardOf(p);
  const warm = c.answers[0], plain = c.answers[1];
  const press = (w: string) => (w === "let me read it" ? setReading((r) => !r) : answerPosting(p.id, w === "submit now" ? "submit" : (w as "yes, draft it" | "no")));
  return (
    <div className="hout-stack">
      <Card w={0} step="pop" style={{ width: "100%" }}>
        <div className="hout-card" data-front={p.id} data-state={p.state}>
          <div className="hout-meta" style={{ color: dim }}><span>∞ applications</span><span>·</span><span>jobs › {p.company}</span><span className="hout-right" style={{ color: SUN }}>closes {p.closes}</span></div>
          <div className="hout-title" style={{ color: ink, fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>{c.title}</div>
          <div className="hout-why" style={{ color: dim }}>{c.why}</div>
          <div className="hout-chips">
            {(p.state === "asks" ? [p.role, p.where, p.site] : ["cover letter", "résumé", `${p.answers} portal answers`]).map((w) => (
              <span key={w} className="hout-chip" style={{ color: dim }}><Glass r={CURVE.radius.row} step="card" />{w}</span>
            ))}
          </div>
          {reading && (
            <div className="hout-fields" data-reading>
              {fieldsOf(p).map(([k, v]) => <div key={k} className="hout-field"><small style={{ color: mute }}>{k}</small><span style={{ color: ink }}>{v}</span></div>)}
              <small style={{ color: mute }}>Sol filled these in {p.portal}, signed in as you; the submit button is yours</small>
            </div>
          )}
          <div className="hout-acts">
            <Warm h={32} onClick={() => press(warm)}>{warm}</Warm>
            <Button h={32} onClick={() => press(plain)}>{reading && plain === "let me read it" ? "done reading" : plain}</Button>
            <span className="hout-space" />
            <button type="button" className="hout-mini" style={{ color: mute }} onClick={() => laterPosting(p.id)}>later</button>
          </div>
        </div>
      </Card>
      {behind.slice(0, 2).map((b, i) => (
        <div key={b.id} className="hout-edge" data-edge={b.id} style={{ marginLeft: (i + 1) * 12, marginRight: (i + 1) * 12, color: mute }}>
          <Glass r={CURVE.radius.card} step="card" />
          <span style={{ color: dim }}>{b.company}</span> · {b.state === "asks" ? `for you? Jev isn't sure (${b.fit.toFixed(2).replace(/^0/, "")}), so Sol asks` : b.state === "later" ? "later" : cardOf(b).title}
        </div>
      ))}
    </div>
  );
}

/** Sol's hand in your browser (the shared browser, #805): the posting being typed, a field at a time, stopping before submit */
function Hand({ p }: { p: Posting | undefined }) {
  if (!p) return (
    <div className="hout-hand" data-hand="idle"><Glass r={CURVE.radius.card} step="card" /><small style={{ color: mute }}>Sol's hand is idle · nothing is being typed</small></div>
  );
  const [at, of] = p.field ?? [1, p.answers || 6];
  return (
    <div className="hout-hand" data-hand={p.id}>
      <Glass r={CURVE.radius.card} step="card" />
      <div className="hout-hand-tabs" style={{ color: dim }}><span><i className="hout-dot" style={{ background: JELLY.warm[2] }} />{p.company} · {p.portal}</span><span className="hout-right" style={{ color: mute }}>live</span></div>
      <div className="hout-hand-page">
        <Glass r={CURVE.radius.row} step="raised" />
        <b style={{ color: ink }}>{p.role}</b>
        <small style={{ color: mute }}>{p.company} · {p.where} · apply</small>
        {fieldsOf(p).slice(0, 4).map(([k, v], i) => (
          <div key={k} className="hout-field" data-typing={i === at - 1 || undefined}><small style={{ color: mute }}>{k}</small><span style={{ color: i < at ? ink : mute }}>{i < at - 1 ? v : i === at - 1 ? v.slice(0, 18) : "…"}</span></div>
        ))}
        <div className="hout-hand-stop"><span className="hout-submit" style={{ color: mute }}><Glass r={CURVE.radius.row} step="card" />Submit application</span><small style={{ color: dim }}>Sol's hand stops here</small></div>
      </div>
      <div className="hout-hand-foot" style={{ color: dim }}><span>Sol's hand · field {at} of {of} · stops before submit</span>
        <button type="button" className="hout-mini hout-right" style={{ color: ink }} onClick={() => goTo("browser")}>take over ›</button></div>
    </div>
  );
}

export function Applications() {
  const v = useApps(), flows = useFlows();
  if (!v) return null;
  const flow = flows?.flows.find((f) => f.id === "f-apps"), isOn = flow?.on ?? true;
  const [first, second] = appsLine(v.postings, isOn);
  const needs = needsOf(v.postings), front = needs[0];
  const done = v.done;
  return (
    <section className="hw hout" data-place="talk" data-home-whole data-flow-living="f-apps" data-on={isOn || undefined}>
      <div className="hout-top">
        <div className="hw-date" style={{ color: mute }}>jobs › applications · a flow, at {flow?.rung ?? "draft"}</div>
        <span className="hout-right hout-look" style={{ color: mute }}>
          {isOn ? <>looked {v.at} · next {v.next}<button type="button" className="hout-mini" style={{ color: ink }} onClick={lookNow}>look now</button><span>· {v.held} held today, quiet</span></> : <span>paused · no looks</span>}
          <Switch on={isOn} label={`applications: ${isOn ? "on" : "paused"}`} onFlip={() => pauseFlow("f-apps", !isOn)} />
        </span>
      </div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
      <div className="hout-stations" data-stations>
        <span className="hout-rail" style={{ background: on(0.15) }} />
        {stationsOf(v).map((s, i) => (
          <div key={i} className="hout-station" data-station={s.kind}>
            <Mark kind={s.kind} />
            <small style={{ color: mute }}>{KIND_WORD[s.kind] === "on your list" ? "your yes" : KIND_WORD[s.kind]}</small>
            <b style={{ color: ink }}>{s.title}</b>
            <span style={{ color: dim }}>{s.detail}</span>
            <div className="hout-tokens">{s.at.map((p) => <Token key={p.id} p={p} />)}</div>
          </div>
        ))}
      </div>
      <div className="hout-cols">
        {front ? <Front key={front.id} p={front} behind={needs.slice(1)} /> : <div className="hout-none" style={{ color: mute }}>{isOn ? `nothing waits on you · the next look is ${v.next}` : "paused: turn it on to read LinkedIn and Handshake again"}</div>}
        <Hand p={v.postings.find((p) => p.state === "typing")} />
      </div>
      {done && done.line && (
        <div className="hout-receipt" data-receipt="apps" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          {done.ledgerId && <button type="button" className="hout-mini" style={{ color: ink }} onClick={() => undoPosting(done.ledgerId)}>undo</button>}
        </div>
      )}
    </section>
  );
}

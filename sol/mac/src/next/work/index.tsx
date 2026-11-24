// "Sol works for you" (BR1, #1615), the page "work": work plans and automations, drawn from D.work (cv/wire/work.ts).
//   Plans: an ask made into a plan (on this Mac's own model when it has one, else by your AI; the page says which), its
//   steps, which model runs each, a yes before it runs, each step's state while it runs (Waiting, Working, Needs you,
//   Done, Could not finish, Stopped) and the way to its session, Pause, Stop, Remove with Undo. A plan waiting for a yes
//   or held can be changed: Keep or Discard.
//   Automations: what it does and when, made paused; Turn on, Pause, Run now, change it (Keep / Discard), Remove with
//   Undo; when it runs next and how its last run went, with the way to that run's session.
// Every press goes to the engine (work/link.ts); the page holds only what is being typed.
// Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import { useState } from "react";
import { D, M, regionOf, spotFor, useNext } from "../cv/index.ts";
import { send } from "./link.ts";
import { where } from "../auto/model.ts";
import {
  actsOf, MODELS, sayAfter, sayBy, sayLast, sayModel, sayNext, sayPlan, sayPlanner, STEP_SAYS, WHEN_EXAMPLES,
  type Auto, type Plan, type Step, type Work,
} from "./read.ts";
import "./work.css";

const NOT_SENT = "Not connected, so nothing was sent.";

/** the way to a session the window holds; null when it does not hold it yet */
const goSession = (id: string | null) => (id && spotFor(id) ? () => M.goto(id) : null);

export default function WorkPage() {
  const w = useNext((d) => d.work as Work | undefined);
  const [note, setNote] = useState<string | null>(null);
  const press = (o: object) => { const ok = send(o); setNote(ok ? null : NOT_SENT); return ok; };
  const plans = w?.plans ?? [], autos = w?.autos ?? [];
  return (
    <div className="wk" id="v-work" data-face-part="work">
      <h1>Plans and automations</h1>
      <p className="wk-say">Say what should get done. It becomes a plan of steps, you look and say yes, and your AI does each step, asking you before it changes anything.</p>
      {note || w?.note ? <div className="wk-note" role="status" data-wk="note">{note ?? w?.note}</div> : null}
      {w?.undo ? (
        <div className="wk-note wk-undo" role="status" data-wk="undo">
          <span>{w.undo.kind === "plan" ? "Removed the plan" : "Removed the automation"} “{w.undo.name}”.</span>
          <button className="wk-btn" onClick={() => press(w.undo!.kind === "plan" ? { type: "next.plans.restore", plan: w.undo!.data } : { type: "next.autos.restore", auto: w.undo!.data })}>Undo</button>
        </div>
      ) : null}
      <Ask w={w} press={press} />
      <section className="wk-sec" aria-labelledby="wk-plans-h">
        <h2 id="wk-plans-h">Plans</h2>
        {plans.length ? plans.map((p) => <PlanCard key={p.id} p={p} fresh={w?.made?.id === p.id} press={press} />) : <p className="wk-none">No plans yet. Ask for something above.</p>}
      </section>
      <section className="wk-sec" aria-labelledby="wk-autos-h">
        <h2 id="wk-autos-h">Automations</h2>
        <p className="wk-say">Something your AI does on its own at the times you say. A new one starts paused, so nothing runs until you turn it on.</p>
        <NewAuto press={press} />
        {autos.length ? autos.map((a) => <AutoCard key={a.id} a={a} press={press} />) : <p className="wk-none">No automations yet.</p>}
      </section>
    </div>
  );
}

type Press = (o: object) => boolean;

function Ask({ w, press }: { w: Work | undefined; press: Press }) {
  const [ask, setAsk] = useState("");
  const making = w?.making != null;
  const go = () => { const a = ask.trim(); if (a && press({ type: "next.plans.make", ask: a })) setAsk(""); };
  return (
    <section className="wk-ask" aria-label="Ask for a plan">
      <textarea aria-label="What should get done" placeholder="What should get done? For example: “Read the three newest files in my notes folder and write me a one-page summary”"
        value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }} disabled={making} rows={3} />
      <div className="wk-row">
        <button className="wk-btn pri" onClick={go} disabled={making || !ask.trim()}>{making ? "Planning…" : "Make a plan"}</button>
        <span className="wk-t3" data-wk="planner">{making ? "Making the plan. You can keep working; it shows up below." : sayPlanner(w?.planner ?? null)}</span>
      </div>
    </section>
  );
}

type Draft = { title: string; steps: { key: string; name: string; does: string; after: string[]; model: string | null; started: boolean }[] };
const draftOf = (p: Plan): Draft => ({ title: p.title, steps: p.steps.map((s) => ({ key: s.key, name: s.name, does: s.does, after: s.after, model: s.model, started: !!s.sessionId })) });

function PlanCard({ p, fresh, press }: { p: Plan; fresh: boolean; press: Press }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [yes, setYes] = useState(false);
  const a = actsOf(p);
  const keep = () => {
    if (!draft) return;
    if (press({ type: "next.plans.edit", id: p.id, revision: p.revision, title: draft.title, steps: draft.steps.map(({ started: _s, ...s }) => s) })) setDraft(null);
  };
  const setStep = (i: number, o: Partial<Draft["steps"][number]>) => setDraft((d) => d && { ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...o } : s)) });
  return (
    <article className="wk-card" data-plan={p.id} data-state={p.state}>
      <header className="wk-h">
        {draft ? <input className="wk-in" aria-label="The plan's name" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /> : <b>{p.title}</b>}
        <span className={`wk-state st-${p.state.replace(" ", "-")}`}>{sayPlan(p)}</span>
      </header>
      <div className="wk-t3" data-wk="by">{sayBy(p.by)}{fresh ? " · just now" : ""}</div>
      {p.why && !draft ? <p className="wk-why">{p.why}</p> : null}
      <ol className="wk-steps">
        {(draft ? draft.steps : p.steps).map((s, i) => {
          const live = p.steps.find((x) => x.key === s.key) as Step | undefined;
          if (draft) {
            const d = s as Draft["steps"][number];
            return (
              <li key={s.key} className="wk-step edit">
                <input className="wk-in" aria-label={`Step ${i + 1}'s name`} value={d.name} disabled={d.started} onChange={(e) => setStep(i, { name: e.target.value })} />
                <textarea className="wk-in" aria-label={`What step ${i + 1} does`} rows={2} value={d.does} disabled={d.started} onChange={(e) => setStep(i, { does: e.target.value })} />
                <div className="wk-row">
                  <select aria-label={`Who runs step ${i + 1}`} value={d.model ?? ""} disabled={d.started} onChange={(e) => setStep(i, { model: e.target.value || null })}>
                    {MODELS.map((m) => <option key={m.id ?? ""} value={m.id ?? ""}>{m.say}</option>)}
                  </select>
                  {d.started ? <span className="wk-t3">Started, so it keeps what it was told</span>
                    : <button className="wk-tx" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i).map((x) => ({ ...x, after: x.after.filter((k) => k !== s.key) })) })} disabled={draft.steps.length < 2}>Remove this step</button>}
                </div>
              </li>
            );
          }
          const st = live!;
          const open = goSession(st.sessionId);
          return (
            <li key={s.key} className="wk-step" data-step={s.key} data-state={st.state}>
              <div className="wk-row"><b>{st.name}</b><span className={`wk-dot st-${st.state.replace(" ", "-")}`}>{STEP_SAYS[st.state]}</span></div>
              <div className="wk-does">{st.does}</div>
              <div className="wk-t3">Your AI · {sayModel(st.model)}{sayAfter(p, st) ? ` · ${sayAfter(p, st)}` : ""}</div>
              {st.result ? <div className="wk-result">{st.result}</div> : null}
              {open ? <button className="wk-tx" onClick={open}>Open its session</button> : null}
            </li>
          );
        })}
      </ol>
      {draft ? (
        <div className="wk-row">
          <button className="wk-tx" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { key: `s${Date.now().toString(36)}`, name: "", does: "", after: draft.steps.length ? [draft.steps[draft.steps.length - 1].key] : [], model: null, started: false }] })} disabled={draft.steps.length >= 12}>Add a step</button>
          <span className="wk-gap" />
          <button className="wk-btn" onClick={() => setDraft(null)}>Discard</button>
          <button className="wk-btn pri" onClick={keep}>Keep</button>
        </div>
      ) : (
        <>
          {a.start ? (
            <label className="wk-yes">
              <input type="checkbox" checked={yes} onChange={(e) => setYes(e.target.checked)} />
              <span>Yes, run these steps with your AI. Each step asks me before it changes anything.</span>
            </label>
          ) : null}
          <div className="wk-row">
            {a.edit ? <button className="wk-btn" onClick={() => setDraft(draftOf(p))}>Edit this plan</button> : null}
            {a.remove ? <button className="wk-btn" onClick={() => press({ type: "next.plans.remove", id: p.id })}>Remove</button> : null}
            <span className="wk-gap" />
            {a.stop ? <button className="wk-btn" onClick={() => press({ type: "next.plans.stop", id: p.id })}>Stop</button> : null}
            {a.pause ? <button className="wk-btn" onClick={() => press({ type: "next.plans.pause", id: p.id })}>Pause</button> : null}
            {a.start ? <button className="wk-btn pri" disabled={!yes} onClick={() => { if (press({ type: "next.plans.start", id: p.id, revision: p.revision, yes: true })) setYes(false); }}>{a.start}</button> : null}
          </div>
        </>
      )}
    </article>
  );
}

function NewAuto({ press }: { press: Press }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", does: "", when: "" });
  if (!open) return <div className="wk-row"><button className="wk-btn" onClick={() => setOpen(true)}>New automation</button></div>;
  const make = () => { if (press({ type: "next.autos.make", ...f })) { setF({ name: "", does: "", when: "" }); setOpen(false); } };
  return (
    <div className="wk-card wk-new" aria-label="New automation">
      <input className="wk-in" aria-label="Its name" placeholder="Its name (optional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <textarea className="wk-in" aria-label="What it does" rows={2} placeholder="What it does, for example: “Read my inbox and list what needs me today”" value={f.does} onChange={(e) => setF({ ...f, does: e.target.value })} />
      <input className="wk-in" aria-label="When it runs" placeholder="When, for example: every day at 08:00" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
      <div className="wk-row wk-chips">{WHEN_EXAMPLES.map((x) => <button key={x} className="wk-chip" onClick={() => setF({ ...f, when: x })}>{x}</button>)}</div>
      <div className="wk-row"><span className="wk-gap" /><button className="wk-btn" onClick={() => setOpen(false)}>Discard</button><button className="wk-btn pri" disabled={!f.does.trim() || !f.when.trim()} onClick={make}>Make it, paused</button></div>
    </div>
  );
}

/** the folder an automation sits in, by name (BR1 item 2: its piece is there) */
const folderOf = (a: Auto) => { const rid = where(a, D.regions); return rid ? regionOf(rid)?.name ?? null : null; };

function AutoCard({ a, press }: { a: Auto; press: Press }) {
  const [draft, setDraft] = useState<{ name: string; does: string; when: string } | null>(null);
  const open = goSession(a.last?.sessionId ?? null);
  const busy = a.last?.state === "working" || a.last?.state === "needs you";
  return (
    <article className="wk-card" data-auto={a.id} data-on={a.on}>
      <header className="wk-h">
        {draft ? <input className="wk-in" aria-label="Its name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /> : <b>{a.name}</b>}
        <span className={`wk-state ${a.on ? "st-running" : "st-paused"}`}>{sayNext(a)}</span>
      </header>
      {draft ? (
        <>
          <textarea className="wk-in" aria-label="What it does" rows={2} value={draft.does} onChange={(e) => setDraft({ ...draft, does: e.target.value })} />
          <input className="wk-in" aria-label="When it runs" value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} />
          <div className="wk-row"><span className="wk-gap" /><button className="wk-btn" onClick={() => setDraft(null)}>Discard</button>
            <button className="wk-btn pri" onClick={() => { if (press({ type: "next.autos.set", id: a.id, ...draft })) setDraft(null); }}>Keep</button></div>
        </>
      ) : (
        <>
          <div className="wk-does">{a.does}</div>
          <div className="wk-t3">{a.when}{folderOf(a) ? ` · in ${folderOf(a)}` : ""} · Your AI · {sayModel(a.model)}</div>
          <div className="wk-t3" data-wk="last">{sayLast(a)}{a.runs > 1 ? ` · ${a.runs} runs` : ""}{a.last ? (open ? <> · <button className="wk-tx" onClick={open}>Open its session</button></> : null) : null}</div>
          <div className="wk-row">
            <button className="wk-btn" onClick={() => setDraft({ name: a.name, does: a.does, when: a.when })}>Edit this automation</button>
            <button className="wk-btn" onClick={() => press({ type: "next.autos.remove", id: a.id })}>Remove</button>
            <span className="wk-gap" />
            <button className="wk-btn" disabled={busy} onClick={() => press({ type: "next.autos.run", id: a.id })}>Run now</button>
            <button className={`wk-btn${a.on ? "" : " pri"}`} onClick={() => press({ type: "next.autos.set", id: a.id, on: !a.on })}>{a.on ? "Pause" : "Turn on"}</button>
          </div>
        </>
      )}
    </article>
  );
}

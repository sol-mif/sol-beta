// The walk through a project (#430, part of #413, area C4): when someone joins a project, its page opens on a short
// walk, one step at a time: the project's night (hand in, the dev night, fixes until, the release, drawn as one line), who
// owns what, how to hand in, and what their agent may do. Every word comes from the project's settings (the engine's
// team/onboard.ts builds them); the project adds a welcome and a note per step, changed by agreement on the settings
// page. Each step can be skipped, and so can the whole walk; until it is finished, their agent shares facts only.
// It opens by itself while it is due (new, or left partway) and from the settings page's "walk me through again".
// The feel of the first-run prototype (sol/design/onboarding/dawn.html, #134): a strip of dots, one thing at a time,
// small pill buttons; black, white and pearl, nothing under the words.
import { useCallback, useEffect, useState } from "react";
import type { Team } from "./useTeam";
import { DEV_TEAM } from "./useTeam";
import { link } from "../socket";
import { ENGINE } from "../useEngine";
import { startAt, nightMarks, hoursIn, endAs, type WalkView, type Mark } from "./onboardView";
import "./onboard.css";

/** the walk for the project in use: asked when the project changes, heard again whenever the engine pushes it */
export function useWalk(team: Team, roomId: string) {
  const [v, setV] = useState<WalkView | null>(DEV_TEAM && new URLSearchParams(location.search).get("walk") !== "0" ? fakeAt(Number(new URLSearchParams(location.search).get("walkat") ?? "-1")) : null);
  useEffect(() => {
    if (DEV_TEAM) return;
    setV(null);
    if (!roomId) return;
    void team.ask<WalkView>("team.onboarding", { refresh: true }, 30_000).then((m) => { if (!m.error && m.steps) setV(m); });
    return link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.onboarding" && m.steps) setV(m as WalkView); });
  }, [team.ask, roomId]);
  return { view: v, set: setV, show: !!v?.due };
}

const Hours = ({ line }: { line: string }) => <>{hoursIn(line).map((p, i) => (p.hour ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}</>;

export function Walk({ team, view, name, onDone, flash }: { team: Team; view: WalkView; name: string; onDone: (v: WalkView | null) => void; flash: (s: string) => void }) {
  const [at, setAt] = useState(() => startAt(view));
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Partial<Record<string, Mark>>>({});   // made in this walk, before the engine's push
  const steps = view.steps, step = at >= 0 ? steps[Math.min(at, steps.length - 1)] ?? null : null, last = at >= steps.length - 1;

  /** one write; null when it failed (the error flashed, the walk stays where it is). The dev page writes nothing */
  const send = useCallback(async (type: string, body: object): Promise<WalkView | "dev" | null> => {
    if (DEV_TEAM) return "dev";
    const r = await team.ask<WalkView>(type, body, 30_000);
    if (r.error) { flash(`couldn't keep that: ${r.error}`); return null; }
    return r;
  }, [team.ask, flash]);
  const finish = async (how: Mark) => {
    setBusy(true);
    const r = await send("team.onboarding.finish", { how });
    setBusy(false);
    if (!r) return;   // nothing was kept: the walk stays open, the error said
    flash(how === "done" ? "walked through: you can walk it again from the project's settings" : "skipped: your agent shares facts only until you walk it, from the project's settings");
    onDone(r === "dev" ? null : r);
  };
  const mark = async (how: Mark) => {
    if (!step) return;
    setBusy(true);
    const r = await send("team.onboarding.step", { id: step.id, how });
    setBusy(false);
    if (!r) return;
    const now = { ...marks, [step.id]: how };
    setMarks(now);
    // the last step: a walk whose every step was skipped is a walk skipped, so facts only stays
    if (last) await finish(endAs(steps, now));
    else setAt(at + 1);
  };
  return (
    <section className="ob" aria-label={`a walk through ${name}`}>
      <nav className="ob-strip" aria-label="the steps">
        <button className={`ob-dot ${at === -1 ? "on" : "done"}`} onClick={() => setAt(-1)} aria-current={at === -1 ? "step" : undefined}><i />welcome</button>
        {steps.map((s, i) => (
          <button key={s.id} className={`ob-dot ${i === at ? "on" : ""} ${marks[s.id] ?? s.mark ?? ""}`} onClick={() => setAt(i)} aria-current={i === at ? "step" : undefined}
            title={(marks[s.id] ?? s.mark) === "skipped" ? "skipped" : (marks[s.id] ?? s.mark) === "done" ? "seen" : ""}><i />{s.title.replace(/^the project's /, "")}</button>
        ))}
      </nav>

      {step ? (
        <div className="ob-body" key={step.id}>
          <p className="ob-k">{at + 1} of {steps.length}</p>
          <h2 className="ob-t">{step.title}</h2>
          {step.id === "night" && <Night n={view.night} />}
          <ul className="ob-lines">{step.lines.map((l, i) => <li key={i}><Hours line={l} /></li>)}</ul>
          {step.note && <blockquote className="ob-note"><span className="ob-k">from the project</span>{step.note}</blockquote>}
        </div>
      ) : (
        <div className="ob-body">
          <p className="ob-k">you joined</p>
          <h2 className="ob-t big">{name}</h2>
          {view.welcome && <p className="ob-welcome">{view.welcome}</p>}
          <p className="ob-lead">{steps.length} short {steps.length === 1 ? "step" : "steps"}: {steps.map((s) => s.title.replace(/^the project's /, "")).join(", ")}. Skip any of them, or all of them; you can walk it again from the project's settings.</p>
        </div>
      )}

      <div className="ob-acts">
        <button className="ob-quiet" onClick={() => void finish("skipped")} disabled={busy}>skip the whole walk</button>
        <span className="ob-sp" />
        {at > -1 && <button className="ob-pill ghost" onClick={() => setAt(at - 1)} disabled={busy}>‹ back</button>}
        {step && <button className="ob-pill ghost" onClick={() => void mark("skipped")} disabled={busy}>skip this step</button>}
        {step
          ? <button className="ob-pill" onClick={() => void mark("done")} disabled={busy}>{last ? "finish" : "next ›"}</button>
          : <button className="ob-pill" onClick={() => setAt(0)} disabled={busy || !steps.length}>begin ›</button>}
      </div>
    </section>
  );
}

/** the night as one line from the hand-in to the release, four marks on it, the hours under them */
function Night({ n }: { n: WalkView["night"] }) {
  const marks = nightMarks(n);
  return (
    <div className="ob-night" role="img" aria-label={marks.map((m) => `${m.word} ${m.at}`).join(", ")}>
      <span className="ob-track" />
      {marks.map((m, i) => (
        <span key={m.word} className={`ob-mk${i === marks.length - 1 ? " end" : ""}`} style={{ left: `${m.x * 100}%` }}>
          <i /><b>{m.at}</b><span>{m.word}</span>
        </span>
      ))}
    </div>
  );
}

/** ?dev=team&walkat=n: the fake walk opened at step n, the ones before it seen */
const fakeAt = (n: number): WalkView => (n < 0 ? FAKE : { ...FAKE, state: "partway", steps: FAKE.steps.map((s, i) => (i < n ? { ...s, mark: i === 1 ? "skipped" : "done" } : s)) });
const FAKE: WalkView = {
  repo: "sol-mif/sol-record", me: "w0ngtap", state: "new", due: true, custom: true,
  welcome: "Welcome to SOL. Three of us and our agents build it together; the night does the rest.",
  night: { handIn: "20:00", review: "21:00", until: "06:00", release: "09:00", zone: "America/New_York" },
  people: [{ login: "marcocyl04-ux", state: "done", at: "2026-10-30T12:00:00Z" }, { login: "franktsai2008-eng", state: "skipped", at: "2026-10-30T12:00:00Z" }],
  steps: [
    { id: "night", title: "the project's night", note: "", lines: [
      "hand in by 20:00: what is handed in by then is read on tonight's dev night",
      "the dev night at 21:00: marcocyl04-ux reads each change handed in and takes it in (one merge commit), or sends it back",
      "fixes until 06:00: a change sent back can be fixed and handed in again until then",
      "the release at 09:00: everyone's Sol gets what went in, and on the beta night franktsai2008-eng takes it into beta or holds it",
      "all in America/New York time",
    ] },
    { id: "owners", title: "who owns what", note: "", lines: ["cowork: franktsai2008-eng", "engine: marcocyl04-ux and franktsai2008-eng", "an area's lead is who to ask about it, and agrees to changes in who leads it"] },
    { id: "handin", title: "how to hand in", note: "Start every piece with bash sol/take <issue>: it makes your branch and claims the issue.", lines: [
      "work on your own branch, and open a pull request that names its issue",
      "once its checks are green, the session that worked on it asks with a card: Bring it in, or Not tonight",
      "at 20:00 Sol opens a short hand-in session listing what goes in tonight and what is held",
      "handed in means ready on GitHub (not a draft), aimed at the main branch, by 21:00",
      "only your press hands a change in; your agent never does",
      "what is not handed in simply waits for the next night",
    ] },
    { id: "agents", title: "what your agent may do", note: "", lines: [
      "agents tell each other facts only: what they are on, the files, what was decided",
      "an agent never picks what to hand in: you do",
      "an agent never takes a change in, sends it back or releases: people do",
      "until you finish this walk, your agent shares facts only, whatever the project allows",
    ] },
  ],
};

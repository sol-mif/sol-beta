// A run's steps as they come (#692, pieces/sticky-life.mjs, agent.mjs, failures2.mjs; engine.md "The run, with the
// agent"), slice A of the pass 2 build. The lines a codex exec or claude -p run sends back over the stand-in's socket
// (home.step), the agent named on the first line, what it made as file lines, and where it stopped: done, one question,
// failed with why and the one thing that helps. Three ways in: a sticky opened (the full list of its run), a folder's log
// (FolderView mounts it: each run in the folder and its children, newest first), or bare steps (the last few, inside a
// sticky). Its buttons: stop while it runs, try again when it failed, undo what it made (and redo).
import type { Metas } from "../meta";
import { Button, FileMark } from "../../kit";
import type { Agent, Home2Api, LogLine, Made, StepLine, Sticky } from "./pass2";
import "./runlog.css";

export const meta = {
  RunLog: {
    job: "a run's steps as they come: who works it, what it read, wrote, made, asked, and where it stopped",
    flow: "know",
    states: ["no steps yet", "queued", "running", "made", "asks", "done", "a failed run", "undone", "a folder's log"],
    keys: [
      { press: "stop", does: "stops the run; no step after it" },
      { press: "try again", does: "a fresh run in the same folder" },
      { press: "undo", does: "puts aside what the run made; redo brings it back" },
    ],
    listens: ["home.step", "home.made", "home.state › stickies, runs, log"],
  },
} satisfies Metas;

const NAME: Record<Agent, string> = { codex: "Codex", claude: "Claude" };
const MODEL: Record<Agent, string> = { codex: "gpt-5.6-luna", claude: "Sonnet 5.5" };
const hm = (at: string) => { const d = new Date(at); return isNaN(+d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); };
const ext = (p: string) => (p.match(/\.([a-z0-9]+)$/i)?.[1] ?? "md").toLowerCase();
const lastOf = <T,>(a: T[]): T | undefined => a[a.length - 1];
const SAYS: Partial<Record<Sticky["state"], string>> = { queued: "queued", running: "running", asks: "asks you", done: "done", failed: "didn't finish", paused: "stopped", filed: "starting" };

/** one run: its head (the agent, the model, where it stands), its steps, its made files, its buttons */
function Run({ s, h, last }: { s: Sticky; h?: Home2Api; last?: number }) {
  const steps = last ? s.steps.slice(-last) : s.steps;
  const made = (s.made ?? []) as (Made & { undone?: string })[];
  const undone = made.length > 0 && made.every((m) => m.undone);
  const send = (type: string) => h?.send({ type, sticky: s.id });
  return (
    <div className={`p2-run s-${s.state}`} data-run={s.id} data-state={s.state} data-agent={s.agent}>
      <div className="p2-run-head">
        <b>{NAME[s.agent] ?? s.agent}</b><span>{MODEL[s.agent]}</span><span className="p2-run-words">{s.text}</span>
        <em>{SAYS[s.state] ?? s.state}</em>
      </div>
      <ol className="p2-run-steps">
        {steps.map((x, i) => (
          <li key={`${x.at}-${i}`} className={`k-${x.kind}`} data-kind={x.kind} {...(x.kind === "error" && x.line === s.why ? { "data-why": true } : {})} {...(x.kind === "ask" && s.state === "asks" && s.ask && x.line === s.ask.q ? { "data-ask": true } : {})}>
            <time>{hm(x.at)}</time><span>{x.line}{x.kind === "ask" && s.state === "asks" && s.ask && x.line === s.ask.q && <small> {s.ask.options.join(" · ")}</small>}</span>
          </li>
        ))}
      </ol>
      {made.length > 0 && <div className="p2-run-made">{made.map((m) => (
        <div key={m.id} className={m.undone ? "undone" : ""} data-made={m.id}><FileMark ext={ext(m.path)} h={16} /><span>{m.title}</span><small>{m.undone ? "put aside" : m.kind}</small></div>
      ))}</div>}
      {s.state === "failed" && s.why && lastOf(s.steps)?.line !== s.why && <p className="p2-run-why" data-why>{s.why}</p>}
      {s.state === "asks" && s.ask && lastOf(s.steps)?.line !== s.ask.q && <p className="p2-run-ask" data-ask>{s.ask.q} <span>{s.ask.options.join(" · ")}</span></p>}
      {h && <div className="p2-run-acts">
        {(s.state === "running" || s.state === "queued") && <Button h={24} flat acts onClick={() => send("home.run.stop")}>stop</Button>}
        {s.state === "failed" && <Button h={24} flat acts onClick={() => send("home.run.start")}>try again</Button>}
        {made.length > 0 && s.state !== "running" && <Button h={24} flat acts onClick={() => send(undone ? "home.run.redo" : "home.run.undo")}>{undone ? "redo" : "undo"}</Button>}
      </div>}
    </div>
  );
}

/** a folder's log lines when no run of it is in the stickies any more */
function Lines({ lines }: { lines: LogLine[] }) {
  return <ol className="p2-run-steps p2-run-lines">{lines.map((l, i) => <li key={`${l.at}-${i}`} className={`k-${l.kind ?? "step"}`}><time>{hm(l.at)}</time><span>{l.line}</span></li>)}</ol>;
}

export function RunLog({ h, sticky, folder, steps, agent, last }: {
  h?: Home2Api;
  /** a sticky opened: its whole run */
  sticky?: string;
  /** a folder's log: each run in it and its children, newest first */
  folder?: string;
  /** bare steps (the last few inside a sticky), with the agent that made them */
  steps?: StepLine[];
  agent?: Agent;
  last?: number;
}) {
  if (steps) {
    const s = last ? steps.slice(-last) : steps;
    if (!s.length) return null;
    const who = agent ?? s[0].agent;
    return (
      <div className="p2-runlog" data-p2="runlog">
        <ol className="p2-run-steps">{s.map((x, i) => <li key={`${x.at}-${i}`} className={`k-${x.kind}`} data-kind={x.kind}><time>{hm(x.at)}</time><span>{i === 0 && who && !x.line.startsWith(NAME[who]) ? `${NAME[who]} · ` : ""}{x.line}</span></li>)}</ol>
      </div>
    );
  }
  const st = h?.st;
  if (!st) return null;
  if (sticky) {
    const s = st.stickies?.find((x) => x.id === sticky);
    if (!s || !s.steps.length) return null;
    return <div className="p2-runlog" data-p2="runlog" data-sticky={s.id}><Run s={s} h={h} last={last} /></div>;
  }
  if (folder) {
    const f = st.folders?.find((x) => x.id === folder);
    if (!f) return null;
    // the folder and its children, any depth (a folder's log is its own plus its children's)
    const ids = new Set([folder]);
    for (let grew = true; grew;) { grew = false; for (const x of st.folders ?? []) if (x.parent && ids.has(x.parent) && !ids.has(x.id)) { ids.add(x.id); grew = true; } }
    const runs = (st.stickies ?? []).filter((s) => ids.has(s.folder) && s.steps.length).sort((a, b) => (lastOf(b.steps)?.at ?? b.at).localeCompare(lastOf(a.steps)?.at ?? a.at));
    // the folder's own lines stay beside the run cards; a run's step lines are already on its card
    const shown = new Set(runs.map((s) => s.id));
    const lines = (st.log?.[folder] ?? []).filter((l) => !(l.sticky && shown.has(l.sticky)));
    if (!runs.length && !lines.length) return null;
    return (
      <div className="p2-runlog p2-runlog-folder" data-p2="runlog" data-folder={folder}>
        {st.runs && <div className="p2-run-host">runs on {st.runs.host}{st.runs.queued ? ` · ${st.runs.queued} queued` : ""}</div>}
        {runs.map((s) => <Run key={s.id} s={s} h={h} last={last} />)}
        {lines.length > 0 && <Lines lines={lines} />}
      </div>
    );
  }
  return null;
}

// An automation's piece (BR1 item 2, three.html "Automation is a piece", #1615): what it does, when it runs (a time or an
// event), where it sits, and watched: its state now, a switch to pause it, Run now, and its last runs, each with how it
// went and why it ran, and the way to that run's session while the window holds it. The plane mounts it on a piece of
// kind "row" that stands for an automation (auto/model.ts, "auto:<id>"): <Automation id={piece.id} band />. At Far, a
// short form: its name and its state. Changing it and removing it stay on the Work page, one press away.
// Every press goes to the engine (work/link.ts); on the dev page it is played on the fixture (auto/fixture.ts).
// Signed: marcocyl04-ux's agent (builder F), BR1 item 2 (#1615).
import { D, M, MODE, regionOf, spotFor, useNext } from "../cv/index.ts";
import type { SlotProps } from "../slots.ts";
import { send } from "../work/link.ts";
import { LAST_SAYS, type Work } from "../work/read.ts";
import { play } from "./fixture.ts";
import { autoOf, isEvent, PREFIX, pieceId, sayAt, sayRan, sayWhen, sayWhy, stateOf } from "./model.ts";
import "./auto.css";

/** the marks on its presses (the card check: an icon on every choice) */
const RUN = "M8 5.5v13l10.5-6.5z", SESSION = "M4.5 5.5h15v10h-9l-4.5 4v-4h-1.5zM12 8v5M9.5 10.5h5", CHANGE = "M4 20h4L19 9l-4-4L4 16zM14 6l4 4";
const Ic = ({ d }: { d: string }) => <svg className="au-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const press = (o: { type: string; id: string; on?: boolean }) => send(o) || (MODE === "fixture" && play(o));

export default function Automation({ band = "middle", id: given }: SlotProps & { id?: string }) {
  const w = useNext((d) => d.work as Work | undefined);
  const pid = typeof given === "string" && given ? (given.startsWith(PREFIX) ? given : pieceId(given)) : w?.autos[0] ? pieceId(w.autos[0].id) : "";
  const a = autoOf(w, pid);
  if (!a) return null;
  const st = stateOf(a), ev = isEvent(a.when), folder = regionOf(String(D.pieces[pid]?.region ?? ""))?.name;
  const head = (
    <header className="au-h">
      <span className={`au-mark${ev ? " au-ev" : ""}`} aria-hidden="true" />
      <b className="au-name">{a.name}</b>
      <span className="au-st" data-k={st.k}>{st.say}</span>
    </header>
  );
  if (band === "far") return <article className="au au-far" data-auto={a.id} data-state={st.k}>{head}</article>;
  const busy = st.k === "working" || st.k === "needs you";
  return (
    <article className="au" data-auto={a.id} data-state={st.k} aria-label={`Automation: ${a.name}`}>
      {head}
      {a.does !== a.name ? <p className="au-does">{a.does}</p> : null}
      <p className="au-when">{sayWhen(a)}{folder ? <span className="au-t3"> · works in {folder}</span> : null}</p>
      <div className="au-row">
        {a.on || a.runs ? <>
          <button className="au-switch" role="switch" aria-checked={a.on} aria-label={a.on ? "On: press to pause" : "Paused: press to turn on"} onClick={() => press({ type: "next.autos.set", id: a.id, on: !a.on })} />
          <span className="au-t2">{a.on ? "On" : "Paused"}</span>
        </> : <button className="au-btn" data-turn-on onClick={() => press({ type: "next.autos.set", id: a.id, on: true })}><Ic d={RUN} />Turn on</button>}
        <span className="au-gap" />
        <button className="au-btn" disabled={busy} onClick={() => press({ type: "next.autos.run", id: a.id })}><Ic d={RUN} />{busy ? "Running" : "Run now"}</button>
        <button className="au-tx" title="A new session with what this does, in its folder; nothing is sent until you start it"
          onClick={() => M.start({ words: a.does, region: String(D.pieces[pid]?.region ?? "") || undefined, given: [pid], now: false })}><Ic d={SESSION} />Chat with AI about this</button>
        <button className="au-tx" onClick={() => M.page("work")}><Ic d={CHANGE} />Edit this automation</button>
      </div>
      <section className="au-runs" aria-label="Its last runs">
        <h3 className="au-t3">{a.runs ? sayRan(a) : "Has not run yet"}</h3>
        {a.ran.length ? (
          <ol>
            {a.ran.map((r) => {
              const open = spotFor(r.sessionId) ? () => M.goto(r.sessionId) : null;
              return (
                <li key={r.sessionId} className="au-run" data-run={r.state}>
                  <span className="au-dot" data-k={r.state} aria-hidden="true" />
                  <span className="au-rt">{sayAt(r.at)}</span>
                  <span className="au-rs">{LAST_SAYS[r.state]}<span className="au-t3"> · {sayWhy(r)}</span></span>
                  {open ? <button className="au-tx" onClick={open}>{r.state === "working" ? "Watch" : "Open"}</button> : null}
                </li>
              );
            })}
          </ol>
        ) : <p className="au-t3">{a.on ? (ev ? "It runs when a new file comes in." : `It runs ${a.next || "on its time"}.`) : "Turn it on and it runs on its own. Run now tries it once."}</p>}
      </section>
    </article>
  );
}

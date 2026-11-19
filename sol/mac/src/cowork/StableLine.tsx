// Ship (#33, #418): the window's half of "a new stable is out" (or a dev release that could not install itself). One
// line over the composer in Work and Cowork (Composer.tsx mounts it): the tag, who
// made it, Update (filled) and Later. Update asks the
// engine to fast-forward this checkout (team.update); while it runs the line says so and the buttons go; when the
// engine's code changed Sol renews a moment later. Later puts this stable off on this Mac (both windows) for 12 hours.
// #425: on a */mine Sol the offer says how far behind it is, and when the person's own changes do not go on by
// themselves the line carries the carry's words and its answers: Use it (ready), Set aside and update · Stay as I am
// (failed). While a session carries them, or the Sol moves over, only the words show.
// #1150: a release this Sol installed by itself carries over with no press (no Use it), and for an hour after a release
// the line says who has it, each team person ✓ or waiting with their Sol's reason, here too when this Sol has it.
// #1153: that line names the iteration, and each person's drift beside their ✓ (3 off, 1 iteration).
import { later, releaseWord, update, useStable, useRuns, hasLine, useCarried, setAside, stay } from "./stable";
import { Droplet } from "../creature/goo";
import "./ship.css";

export function StableLine() {
  const s = useStable();
  const runs = useRuns();
  if (!s) return runs && (
    <div className="sline done" role="status">
      <span className="what" title="what each team person's Sol runs, as they said it">
        <Droplet kind="done" size={12} seed={runs.tag} className="cstate" />
        iteration <b>{runs.tag}</b> · {hasLine(runs.who)}
      </span>
    </div>
  );
  const d = s.doing, c = s.carry;
  const name = s.tag || s.sha.slice(0, 7);
  const cls = d ? (d.updating || c?.stage === "session" || c?.stage === "moving" ? "busy" : d.failed ? "failed" : "done") : "";
  const kind = d ? (d.updating || c?.stage === "session" || c?.stage === "moving" ? "running" : d.failed ? "failed" : c?.stage === "ready" ? "needs" : "done") : "needs";
  return (
    <div className={`sline ${cls}`} role="status">
      <span className="what" title={c ? d?.said : `${s.tag} · ${s.sha.slice(0, 7)}`}>
        <Droplet kind={kind} size={12} seed={s.sha || c?.aside || "carry"} className="cstate" />
        {d ? d.said : <>a new {releaseWord(s)} is out <b>{name}</b>{s.by && <> · by <span className="by">{s.by}</span></>}{s.count ? <> · you are {s.count} behind</> : null}{runs?.tag === s.tag ? <> · {hasLine(runs.who)}</> : null}</>}
      </span>
      {c ? (c.auto && c.stage !== "failed" ? null : <CarryMoves stage={c.stage} back={c.kind === "back"} />)
        : !d?.updating && !(d && !d.failed) && (
        <span className="moves">
          {!d && <button className="wbtn" onClick={() => void update()} title={`bring this Mac up to the new ${releaseWord(s)}; Sol renews itself after when its code changed`}>Update</button>}
          <button className="wbtn ghost" onClick={() => later(s.sha)} title="put it off for 12 hours">Later</button>
        </span>
      )}
    </div>
  );
}

/** the person's answers to a carry: the words never say commit, rebase or conflict */
function CarryMoves({ stage, back }: { stage: string; back: boolean }) {
  if (stage === "ready") return (
    <span className="moves">
      <button className="wbtn" onClick={() => void useCarried()} title="your Sol moves over to it as soon as nothing is at work in it; where it stood is kept">Use it</button>
      <button className="wbtn ghost" onClick={() => void stay()} title={back ? "leave them set aside, as they are" : "nothing changes; the next release is offered, with how far behind you are"}>{back ? "Not now" : "Stay as I am"}</button>
    </span>
  );
  if (stage === "failed") return (
    <span className="moves">
      <button className="wbtn" onClick={() => void (back ? stay() : setAside())} title={back ? "leave them set aside, as they are" : "your Sol as it is now is kept under a name of its own (Settings, engine: set aside), and it updates with the changes of yours that still fit"}>{back ? "Leave them aside" : "Set aside and update"}</button>
      {!back && <button className="wbtn ghost" onClick={() => void stay()} title="nothing changes; the next release is offered, with how far behind you are">Stay as I am</button>}
    </span>
  );
  return null;
}

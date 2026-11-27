// A key (#1879 step 0; decisions.md 2026-11-25, Live: "round 2's keys"): a live session on a round sticker key, its
// folder's window as a band across the top, its name, one state line in words ("asks · 7h", "done ~10:30"), and its
// question on a slip that lands over the canvas on hover. The keys carry no numbers (⌘1–⌘9 are the tabs). A running
// session says "running · 40m", the time since it started: there is no ETA yet (#1879 step 1).
import { Progress } from "./icons";
import { Count, Dot, Mark, windowOf, type Paint } from "./Signs";
import { StickerCard } from "./StickerCard";
import "./parts.css";

export type KeyState = { asks: true; age: string; count?: number } | { asks: false; running: string; progress?: number };

export function Key({ name, paint, folder, state, question, tilt, hover, onOpen }: {
  name: string; paint: Paint; folder: string; state: KeyState;
  /** the slip: its head ("asked 01:44" or the run's line) and its words */
  question: { head: string; words: string }; tilt?: number; hover?: boolean; onOpen?: () => void;
}) {
  return (
    <StickerCard tilt={tilt} hover={hover} part={`key ${name}`} onClick={onOpen} className="kp-part kp-key">
      <i className="kp-band" style={{ background: windowOf(paint) }} />
      <b className="kp-name kp-key-name">{name}</b>
      <span className="kp-state">
        {state.asks ? <><Dot /><span>asks · {state.age}</span>{(state.count ?? 1) > 1 && <Count n={state.count!} />}</> : <><Progress p={state.progress ?? 0.5} /><span>{state.running ? `running · ${state.running}` : "running"}</span></>}
      </span>
      <span className="kp-slip">
        <span className="kp-label"><Mark paint={paint} size="s" />{folder} · {question.head}</span>
        <p>{question.words}</p>
      </span>
    </StickerCard>
  );
}

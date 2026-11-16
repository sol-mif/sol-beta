// Scoped and Approve (#482, engine team/checkpoint.ts): the card the session's agent shows, and the Sol developer's
// press. The agent cannot press: the press carries a key the engine gives this window only. Sol refuses the press while
// the PRD has an open question (Scoped) or the PRD is not scoped and the evals are not complete (Approve); the engine
// reads the files again at the press, so the button stays pressable and the refusal comes back in words.
import { useState } from "react";
import type { Item, Work } from "./useWork";
import { checkpointWords, type Checkpoint } from "./presses";

export function CheckpointCard({ it, w }: { it: Item; w: Work }) {
  const c = it as unknown as Checkpoint;
  const words = checkpointWords(c);
  const [err, setErr] = useState("");
  const press = async () => {
    setErr("");
    const r = await w.checkpoint(c.id);
    if (r?.error) setErr(String(r.error));
  };
  const error = err || c.error || "";
  return (
    <div className={`wcard wcheckpoint ${c.state ?? "open"}`}>
      <div className="whead"><span>{words.head}</span><i className="cp-folder">{c.folder}</i></div>
      <p className="cp-ask">{words.ask}</p>
      {words.done
        ? <span className="cp-done">{words.done}</span>
        : <>
            {words.blocked && !error && <p className="cp-why">{words.blocked}</p>}
            <div className="choices">
              <button className="first" disabled={c.state === "busy"} onClick={() => void press()}
                title={c.press === "scoped" ? "writes “Status: Scoped by you” into prd.md" : "writes “Status: Approved by you” into eval.md"}>{words.button}</button>
            </div>
          </>}
      {error && <i className="cp-err">{error}</i>}
    </div>
  );
}

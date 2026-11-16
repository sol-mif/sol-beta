// "blocks here" (#696): the side's list of what is on this session's stage, under its sessions (play.html sideList):
// each block's state dot, its title, and a word: folded, n of m for a list, else its state. A click unfolds it and
// brings it to the top.
import { useCallback, useSyncExternalStore } from "react";
import { stageWhole } from "../flag";   // B15
import { doneOf } from "./kinds";
import type { ListBody } from "./kinds/types";
import type { StageStore } from "./store";

export function BlocksHere({ store, session }: { store: StageStore; session: string }) {
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const live = seen.blocks.filter((b) => b.state !== "dead");
  if (!live.length) return null;
  const raise = (id: string) => {
    const z = Math.max(0, ...seen.stage.blocks.map((p) => p.z)) + 1;
    store.place(session, { ...seen.stage, blocks: seen.stage.blocks.map((p) => (p.id === id ? { ...p, folded: false, z } : p)) });
  };
  return (
    <div className="st-here">
      {!stageWhole() && <h4>blocks here</h4>}   {/* B15: no strip words with stage.whole on */}
      {live.map((b) => {
        const p = seen.stage.blocks.find((x) => x.id === b.id), steps = (b.body as ListBody | undefined)?.steps;
        return (
          <div key={b.id} role="button" tabIndex={-1} className="st-hererow" onClick={() => raise(b.id)}>
            <span className={`st-dot ${b.state}`} />
            <span className="st-heret">{b.title}</span>
            <span className="st-heren">{p?.popped ? "popped out" : p?.pinned ? "notch" : p?.folded ? (stageWhole() ? "in the tray" : "folded") : b.kind === "list" && steps ? `${doneOf(b.body as ListBody)} of ${steps.length}` : b.state}</span>
          </div>
        );
      })}
    </div>
  );
}

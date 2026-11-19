// "blocks here" (#696): the side's list of what is on this session's stage, under its sessions (play.html sideList).
// This session's own blocks by name (made here, asking for you, being worked on, or open on the stage); what was
// carried in from earlier sessions is one line, opened on a click. Each row: the state dot, the title, and what it is:
// needs you, working, open, n of m for a list, else its kind; a block named after its file says the folder. The row's
// tip is the whole file. A click unfolds it and brings it to the top.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { stageWhole } from "../flag";   // B15
import { doneOf } from "./kinds";
import type { ListBody } from "./kinds/types";
import { fileOf, madeIn, ownHere, type Block } from "./model";
import type { StageStore } from "./store";

export function BlocksHere({ store, session, titleOf }: { store: StageStore; session: string; titleOf?: (session: string) => string | undefined }) {
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const [all, setAll] = useState(false);
  useEffect(() => { setAll(false); }, [session]);
  const live = seen.blocks.filter((b) => b.state !== "dead");
  if (!live.length) return null;
  const placeOf = (id: string) => seen.stage.blocks.find((x) => x.id === id);
  const open = (b: Block) => { const p = placeOf(b.id); return !!p && !p.folded && !p.popped; };
  const own = live.filter((b) => ownHere(b, session) || open(b)), carried = live.filter((b) => !own.includes(b));
  const raise = (id: string) => {
    const z = Math.max(0, ...seen.stage.blocks.map((p) => p.z)) + 1;
    store.place(session, { ...seen.stage, blocks: seen.stage.blocks.map((p) => (p.id === id ? { ...p, folded: false, z } : p)) });
  };
  const row = (b: Block) => {
    const p = placeOf(b.id), steps = (b.body as ListBody | undefined)?.steps, file = fileOf(b), folder = file.split("/").slice(0, -1).join("/");
    const what = p?.popped ? "popped out" : b.state === "waits" ? "needs you" : b.state === "working" ? "working"
      : b.kind === "list" && steps ? `${doneOf(b.body as ListBody)} of ${steps.length}` : open(b) ? "open" : file.endsWith(b.title) && folder ? folder : b.kind;
    return (
      <div key={b.id} role="button" tabIndex={-1} className="st-hererow" title={b.bind?.source ?? b.title} onClick={() => raise(b.id)}>
        <span className={`st-dot ${b.state}`} />
        <span className="st-heret">{b.title}</span>
        <span className="st-heren">{what}</span>
      </div>
    );
  };
  return (
    <div className="st-here">
      {!stageWhole() && <h4>artifacts here</h4>}   {/* B15: no strip words with stage.whole on */}
      {own.map(row)}
      {carried.length > 0 && (
        <div role="button" tabIndex={-1} className="st-hererow st-heremore" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          <span className="st-heret">{carried.length} from earlier sessions</span>
          <span className="st-heren">{all ? "hide" : "show"}</span>
        </div>
      )}
      {all && madeIn(carried, titleOf).map((g) => <div key={g.from} className="st-here"><div className="st-herefrom">{g.name}</div>{g.blocks.map(row)}</div>)}
    </div>
  );
}

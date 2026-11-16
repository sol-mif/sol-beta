// The lens pill (#701, play.html's #lens): app · TUI · CLI · IDE at the top of the side. A pick writes the lens to the
// session's stage.json (the layout, no ledger line); the stage lays its placement (Stage.tsx, lens.ts) and StageColumn
// draws the CLI's lifted talk or the IDE's file column.
import { useCallback, useSyncExternalStore } from "react";
import { Pill } from "../kit";
import { LENSES, LENS_NAMES } from "./lens";
import type { StageStore } from "./store";

export function LensPill({ store, session }: { store: StageStore; session: string }) {
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [store, session]), () => store.read(session));
  const lens = seen.stage.lens ?? "app";
  return (
    <div className="st-lens" data-lens={lens} onMouseDown={(e) => e.preventDefault()}>
      <Pill words={LENSES.map((l) => LENS_NAMES[l])} picked={LENSES.indexOf(lens)} h={28}
        onPick={(i) => { const to = LENSES[i]; if (to && to !== lens) store.place(session, { ...store.read(session).stage, lens: to }); }} />
    </div>
  );
}

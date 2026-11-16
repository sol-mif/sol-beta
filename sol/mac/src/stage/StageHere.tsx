// The stage in Work mode's page pane (#696, joined #709; the swap, #718: the page pane and the list card are gone). The blocks are the engine's (engineStore.ts): a page the session writes is a page block
// bound to its file, its task list a list block (sol/engine/src/work/blocks.ts, runs.ts, tools.ts), so nothing here
// makes them. Home draws the stage as its main column instead (StageColumn.tsx).
import { useEffect } from "react";
import type { Item, Work } from "../work/useWork";
import { Stage } from "./Stage";
import { store } from "./engineStore";

/** the task list a session's talk holds, if any (WorkTalk's) */
export const planOf = (items: Item[]) => items.find((i) => i.kind === "plan" && (i.steps?.length ?? 0) > 0);

export function StageHere({ w, subscribe, session }: { w: Work; subscribe: (f: (m: any) => void) => () => void; session: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  useEffect(() => { store.connect(w.ask, subscribe); }, [w.ask, subscribe]);
  return <Stage store={store} session={session} />;
}

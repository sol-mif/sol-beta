// Orchestration sessions behind a switch (#1469 follow-up, Frank 2026-11-19: the main conversation stays, the
// orchestration sessions run beside it behind a switch). `build.orchestration` stands at concept (the team's own Sol:
// MINE_ON) and off elsewhere until it is turned on (Build settings › switches). Off: a row's menu has no "promote", and
// the engine promotes nothing, by hand or by grouping; what is promoted keeps running (engine one.ts setOrchestration).
import { useEffect, useSyncExternalStore } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";
import { buildSwitch } from "../flag";

export const ORCH_FLAG = "build.orchestration";
const osw = buildSwitch(ORCH_FLAG);
export const orchestrationOn = () => osw.get();
export const setOrchestrationOn = (v: boolean) => osw.set(v);
export const useOrchestrationOn = () => useSyncExternalStore(osw.sub, osw.get);

const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
let rid = 0;
/** the engine hears the switch when the window opens and each time it turns (work.orchestration.on) */
export function useOrchestrationToEngine() {
  const on = useOrchestrationOn();
  useEffect(() => { L?.send({ type: "work.orchestration.on", on, rid: `orch-${++rid}` }); }, [on]);
}

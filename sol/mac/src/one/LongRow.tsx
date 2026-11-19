// The long project's switch (#1002, build.one.long), one row in Settings under me, under the one session's own. Off by
// default; it shows only while the one session is on.
import { Switch, useShell } from "../settingsShell";
import { useBuildOne } from "./model";
import { useBuildOneLong, setBuildOneLong } from "./LongLayer";
import type { Metas } from "../home/meta";

export const meta = {
  LongRow: {
    job: "the long project's switch, one row in Settings under me: the one session keeps your answers and asks where your word counts",
    flow: "mine",
    states: ["hidden (the one session off)", "off", "on"],
    keys: [{ press: "click the switch", does: "the one session keeps your answers over days and asks where your word counts, or not" }],
    listens: ["build.one.long (one/LongLayer.tsx)", "build.one", "the Settings section shown"],
  },
} satisfies Metas;

export function LongRow() {
  const sh = useShell();
  const one = useBuildOne();
  const on = useBuildOneLong();
  if (!sh || sh.sel !== "switches" || !one) return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>projects, over the long run</span><small>It keeps every answer you give, across days; it asks you first where your answer changes things, and decides where you always agree. Experimental</small></div>
        <Switch on={on} set={setBuildOneLong} label="projects, over the long run" />
      </div>
    </div>
  );
}

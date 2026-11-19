// Build's sidebar, sorted (#1016): the switch and its row in Settings. `side.sorted` in this window's storage ("1"), or
// `?side.sorted=on|off` on the page's link (the stills), the link winning for one load. Off by default: Build's side
// lists every folder as before. On: Build holds Build's folders, Home's go to one fold at the bottom, idle folders to
// "quiet", a session's many own sessions behind "n more". Nothing moves on the disk and nothing is written but this
// switch, so turning it off shows exactly what was there. The rule: work/sortedRules.ts.
import { useSyncExternalStore } from "react";
import { buildSwitch } from "../flag";
import { Switch, useShell } from "../settingsShell";
import type { Metas } from "../home/meta";
import "./sorted.css";

export const SIDE_SORTED = "side.sorted";
const sw = buildSwitch(SIDE_SORTED);
export const sideSorted = () => sw.get();
export const setSideSorted = (v: boolean) => sw.set(v);
export const useSideSorted = () => useSyncExternalStore(sw.sub, sw.get);

export const meta = {
  SortedRow: {
    job: "the sorted sidebar's switch, one row in Settings under me",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "Build's side keeps Build's folders and folds Home's away, or shows every folder as before" }],
    listens: ["side.sorted (work/sorted.tsx)", "the Settings section shown"],
  },
} satisfies Metas;

export function SortedRow() {
  const sh = useShell();
  const on = useSideSorted();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>sorted sidebar</span><small>Build keeps your code; Home's folders fold away to the bottom and show in Home. Nothing moves on disk</small></div>
        <Switch on={on} set={setSideSorted} label="sorted sidebar" />
      </div>
    </div>
  );
}

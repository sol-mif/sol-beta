// Marco's own window only (MY SOL): the night's build switches as rows in Settings under me, so he can try each part
// without the console. The switches themselves stay build switches (flag.ts, #710); this file never goes to main.
// One row: the stage (stage.whole and stage.said as one). The runs view is gone from here: he tried it, it failed, and
// it is to be removed; the "new Home" row went with the whole Home (#1054).
import { Switch, useShell } from "./settingsShell";
import { useStageWhole, setStageWhole, setStageSaid } from "./flag";

export function TryingRows() {
  const sh = useShell();
  const stage = useStageWhole();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>new Build stage</span><small>blocks you can drag, resize and undo</small></div>
        <Switch on={stage} set={(v) => { setStageWhole(v); setStageSaid(v); }} label="new Build stage" />
      </div>
    </div>
  );
}

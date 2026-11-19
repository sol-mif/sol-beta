// Pieces that snap's switch (#1024), one row in Settings under me, under the one session's; and the click's mute
// beneath it while it is on. This window's alone (snap/fit.ts): on, Build's one session shows the bench.
import { Switch, useShell } from "../settingsShell";
import { setBuildSnap, setSnapMuted, useBuildSnap, useSnapMuted } from "./fit";
import type { Metas } from "../home/meta";

export const meta = {
  SnapRow: {
    job: "pieces that snap's switch, one row in Settings under me, and the click's mute under it",
    flow: "mine",
    states: ["off", "on", "on, muted"],
    keys: [{ press: "click the switch", does: "shows the bench in the one session, or hides it" }, { press: "click the sound switch", does: "the pieces click, or are silent" }],
    listens: ["build.snap and build.snap.mute (snap/fit.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function SnapRow() {
  const sh = useShell();
  const on = useBuildSnap(), muted = useSnapMuted();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>pieces that snap</span><small>In the one session, build what it runs by snapping pieces together: sessions, folders, checks, times, your hand. Experimental</small></div>
        <Switch on={on} set={setBuildSnap} label="pieces that snap" />
      </div>
      {on && <div className="field-r">
        <div className="lab"><span>the click</span><small>A short quiet sound when a piece seats or comes apart</small></div>
        <Switch on={!muted} set={(v: boolean) => setSnapMuted(!v)} label="the click" />
      </div>}
    </div>
  );
}

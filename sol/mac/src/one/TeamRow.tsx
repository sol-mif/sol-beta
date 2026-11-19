// The team size's switch (#1002, build.one.team), one row in Settings under me, under the one session's own. Off by
// default; it shows only while the one session is on, as the team size is that session at Cowork size (team.html).
import { Switch, useShell } from "../settingsShell";
import { useBuildOne } from "./model";
import { useBuildOneTeam, setBuildOneTeam } from "./TeamLayer";
import type { Metas } from "../home/meta";

export const meta = {
  TeamRow: {
    job: "the team size's switch, one row in Settings under me: the one session with the team's hands in it",
    flow: "mine",
    states: ["hidden (the one session off)", "off", "on"],
    keys: [{ press: "click the switch", does: "shows the team in the one session's window at once, or takes it away" }],
    listens: ["build.one.team (one/TeamLayer.tsx)", "build.one", "the Settings section shown"],
  },
} satisfies Metas;

export function TeamRow() {
  const sh = useShell();
  const one = useBuildOne();
  const on = useBuildOneTeam();
  if (!sh || sh.sel !== "switches" || !one) return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>projects, with the team</span><small>What a teammate gives you comes into your project as a piece; what you give goes to theirs, with pull back until they act. Experimental</small></div>
        <Switch on={on} set={setBuildOneTeam} label="projects, with the team" />
      </div>
    </div>
  );
}

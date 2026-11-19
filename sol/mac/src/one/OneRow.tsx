// The one session's switch (#1002), one row in Settings under me, beside the clean Home's. This window's alone
// (one/model.ts): turning it on shows Build as the one session that runs the others; off brings today's Build back.
import { Switch, useShell } from "../settingsShell";
import { useBuildOne, setBuildOne } from "./model";
import type { Metas } from "../home/meta";

export const meta = {
  OneRow: {
    job: "the one session's switch, one row in Settings under me: Build as one session that runs the others",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "shows Build as the one session at once, or today's Build back" }],
    listens: ["build.one (one/model.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function OneRow() {
  const sh = useShell();
  const on = useBuildOne();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>projects</span><small>Build as one kept session per project that you talk to; it runs your other sessions and comes to you as pieces. Experimental</small></div>
        <Switch on={on} set={setBuildOne} label="projects" />
      </div>
    </div>
  );
}

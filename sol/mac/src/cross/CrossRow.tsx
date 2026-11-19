// The switch for Home and Build, one place (#1031): one row in Settings › me. This window's alone.
import { Switch, useShell } from "../settingsShell";
import { useCross, setCross } from "./flag";

export const meta = {
  CrossRow: {
    job: "Home and Build, one place: the switch, one row in Settings › me",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "lets things be carried between Home and Build by hand, at once; or back" }],
    listens: ["cross (cross/flag.ts)", "the Settings section shown"],
  },
};

export function CrossRow() {
  const sh = useShell();
  const on = useCross();
  if (!sh || sh.sel !== "me") return null;
  return (
    <div className="v3-switch" data-cross-row>
      <div className="field-r">
        <div className="lab"><span>Home and Build, one place</span><small>pick a thing up in one and put it down in the other: a folder's card on the stage, an artifact in a folder</small></div>
        <Switch on={on} set={setCross} label="Home and Build, one place" />
      </div>
    </div>
  );
}

// The switch for Jelly across screens (#1090): one row in Settings › me (it spans the modes: a window's role is not
// one mode's). This window's alone; a second window opened from it is told the switch on its own link.
import { Switch, useShell } from "../settingsShell";
import { useScreensOn, setScreensOn } from "./flag";

export const meta = {
  ScreensRow: {
    job: "Jelly across screens: the switch, one row in Settings › me",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "the edge toward your other screen becomes a seam: carry a block past it and Jelly opens there" }],
    listens: ["screens.two (screens/flag.ts)", "the Settings section shown"],
  },
};

export function ScreensRow() {
  const sh = useShell();
  const on = useScreensOn();
  if (!sh || sh.sel !== "me") return null;
  return (
    <div className="v3-switch" data-screens-row>
      <div className="field-r">
        <div className="lab"><span>Jelly across screens</span><small>your other screen (a monitor, a display) becomes part of Jelly</small></div>
        <Switch on={on} set={setScreensOn} label="Jelly across screens" />
      </div>
    </div>
  );
}

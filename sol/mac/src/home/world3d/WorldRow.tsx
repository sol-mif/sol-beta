// Home's world's switch (#1093), in Home's own settings section ("home"): on, Home's side shows "world". Its sound
// beneath it while it is on, off by default.
import { Switch, useShell } from "../../settingsShell";
import { setHomeWorld, setWorldDots, setWorldSound, useHomeWorld, useWorldDots, useWorldSound } from "./flag";
import type { Metas } from "../meta";

export const meta = {
  WorldRow: {
    job: "Home's world's switch, one row in Home's settings, and its sound under it",
    flow: "mine",
    states: ["off", "on", "on, in dots", "on, with sound"],
    keys: [{ press: "click the switch", does: "shows the world in Home's side, or hides it" }, { press: "click the sound switch", does: "a soft tick when a thing settles, a low note when one wants you" }],
    listens: ["home.world3d and home.world3d.sound (home/world3d/flag.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function WorldRow() {
  const sh = useShell();
  const on = useHomeWorld(), sound = useWorldSound(), dots = useWorldDots();
  if (sh && sh.sel !== "home") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>your world</span><small>Your life as one 3D place in Home. Experimental. Jev sees sticky titles, folder names and counts only, never a project's name, a note or the words of a talk.</small></div>
        <Switch on={on} set={setHomeWorld} label="your world" />
      </div>
      {on && <div className="field-r">
        <div className="lab"><span>in dots</span><small>The same island in 1-bit pearl dots</small></div>
        <Switch on={dots} set={setWorldDots} label="in dots" />
      </div>}
      {on && <div className="field-r">
        <div className="lab"><span>its sound</span><small>A soft tick when a thing settles, a low note when one wants you</small></div>
        <Switch on={sound} set={setWorldSound} label="its sound" />
      </div>}
    </div>
  );
}

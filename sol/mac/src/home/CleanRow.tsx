// The clean Home's switch (#589), one row in Settings under me, beside Cowork v3's. This window's alone (flag.ts):
// turning it on swaps today's Home for the clean one at once; turning it off brings today's back. The rows' words are a
// person's (#948): what they will see change, nothing of how it is built.
import { Switch, useShell } from "../settingsShell";
import { useCleanHome, setCleanHome } from "./flag";
import { useFrameOn, setFrameOn } from "./frameFlag";
import type { Metas } from "./meta";

export const meta = {
  CleanRow: {
    job: "the clean Home's switch, one row in Settings under me",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "swaps today's Home for the clean one at once, or back" }],
    listens: ["sol.home.clean (flag.ts)", "the Settings section shown"],
  },
  // the frame's switch, freeform's foundation (issue 630)
  FrameRow: {
    job: "the frame's switch, one row in Settings under me: the home's things in cards on the clean Home",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "shows the home's things in their frames on the clean Home, or takes them away" }],
    listens: ["sol.frame (frameFlag.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function CleanRow() {
  const sh = useShell();
  const on = useCleanHome();
  if (!sh || sh.sel !== "me") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>simpler Home</span><small>Home shows your sessions, the conversation and a page beside it, side by side; the arrow keys move between them. Off brings today's Home back.</small></div>
        <Switch on={on} set={setCleanHome} label="simpler Home" />
      </div>
    </div>
  );
}

export function FrameRow() {
  const sh = useShell();
  const on = useFrameOn();
  if (!sh || sh.sel !== "me") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>things your AI made</span><small>What your AI has made shows as cards on the simpler Home. Works only with simpler Home on.</small></div>
        <Switch on={on} set={setFrameOn} label="things your AI made" />
      </div>
    </div>
  );
}

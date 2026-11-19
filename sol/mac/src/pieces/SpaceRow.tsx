// The one space's switch (build.space, pieces/flag.ts): one row in Build's settings › switches, beside the other Build
// switches. On, Build's area right of the sidebars is one space of pieces; off, Build is as it was.
import { Switch, useShell } from "../settingsShell";
import { setBuildSpace, useBuildSpace } from "./flag";
import { setStageEyes, useStageEyes } from "./seen";
import { setStageHands, useStageHands } from "./hands";
import type { Metas } from "../home/meta";

export const meta = {
  SpaceRow: {
    job: "Build as one space's switch, one row in Build's settings › switches",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "Build's chat, box and artifacts become pieces of one space, or go back to the docks" },
      { press: "click the eyes switch", does: "the session's agent is told what the space drew and what you did there, and may take a still of it (#1435)" },
      { press: "click the hands switch", does: "the session's agent may move, size and take you to a part of its pieces; a piece you placed stays (#1437)" }],
    listens: ["build.space (pieces/flag.ts)", "stage.eyes (pieces/seen.ts)", "stage.hands (pieces/hands.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function SpaceRow() {
  const sh = useShell();
  const on = useBuildSpace(), eyes = useStageEyes(), hands = useStageHands();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>one space</span><small>Everything right of the sidebars is one space: the chat, the box and each artifact are pieces Sol arranges, and any you move stays where you put it. Experimental</small></div>
        <Switch on={on} set={setBuildSpace} label="one space" />
      </div>
      {on && (
        <div className="field-r">
          <div className="lab"><span>the agent sees the stage</span><small>The session's agent is told where each artifact landed and whether it fits, what you did on the stage since its last turn, and may take a still of the stage when it needs to see it. Only Sol's own window; nothing while Sol is hidden. Experimental</small></div>
          <Switch on={eyes} set={setStageEyes} label="the agent sees the stage" />
        </div>
      )}
      {on && eyes && (
        <div className="field-r">
          <div className="lab"><span>the agent arranges the stage</span><small>The session's agent may put a piece beside or under another, set its width, take it large, and take you to a part of it, with the same moves your hand makes. A piece you placed stays where you put it; ⌥⌘Z undoes the last move. Sessions started after you turn it on get it. Off: only you arrange. Experimental</small></div>
          <Switch on={hands} set={setStageHands} label="the agent arranges the stage" />
        </div>
      )}
    </div>
  );
}

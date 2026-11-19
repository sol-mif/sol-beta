// Pieces' switch (#1092), one row in Build settings › switches: on, each project folder in Build's side holds its
// pieces above its sessions. This window's alone (folderPieces/flag.ts).
import { Switch, useShell } from "../settingsShell";
import { setBuildPieces, useBuildPieces } from "./flag";
import type { Metas } from "../home/meta";

export const meta = {
  PiecesRow: {
    job: "pieces' switch, one row in Build settings › switches: tools in a project folder beside its sessions",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "shows each folder's pieces above its sessions, or hides them" }],
    listens: ["build.pieces (folderPieces/flag.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function PiecesRow() {
  const sh = useShell();
  const on = useBuildPieces();
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>pieces</span><small>A project folder holds tools beside its sessions: what waits on you, what runs where, your systems. Open one as a page or drag it into a session. A file in the project's .sol/pieces makes a new one. Experimental</small></div>
        <Switch on={on} set={setBuildPieces} label="pieces" />
      </div>
    </div>
  );
}

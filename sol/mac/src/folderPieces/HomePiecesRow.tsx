// Pieces in Home's folders, its switch (#1092): one row in Home's own settings (Sol settings › home, under your world;
// #1123, it was under me and nobody found it). On: a class folder shows its pieces among its stickies, no reload.
import { Switch, useShell } from "../settingsShell";
import { setHomePieces, useHomePieces } from "./flag";
import type { Metas } from "../home/meta";

export const meta = {
  HomePiecesRow: {
    job: "pieces in Home's folders, one row in Home's settings: a class folder holds tools under its stickies",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "shows each class folder's pieces under its stickies, or hides them" }],
    listens: ["home.pieces (folderPieces/flag.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function HomePiecesRow() {
  const sh = useShell();
  const on = useHomePieces();
  if (!sh || sh.sel !== "home") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>pieces in Home</span><small>A class folder holds tools beside its stickies: what is due next, with one press</small></div>
        <Switch on={on} set={setHomePieces} label="pieces in Home" />
      </div>
    </div>
  );
}

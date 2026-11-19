// Cowork, whole (#1173): the "old Cowork" row, in the shell's own settings and in Settings (old.ts says why).
import { Switch, useShell } from "../../settingsShell";
import { setOldCowork, useOldCowork } from "./old";

export function OldRow() {
  const on = useOldCowork();
  const sh = useShell();
  if (!sh || sh.sel !== "me") return null;   // one section of Settings, "me", beside the Cowork v3 switch (review R1)
  return (
    <div className="field-r cw-old">
      <div className="lab"><span>old Cowork</span>
        <small>Cowork opens on the groups and pages it had before, instead of Jelly's tabs. Here for one release, then it goes.</small></div>
      <Switch on={on} set={setOldCowork} label="old Cowork" />
    </div>
  );
}

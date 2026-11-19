// Settings asked for in a Home made by the one onboarding (#1124; the default since #1223): the window stays in Home and
// Settings comes up over it on Home's own section (spine/settings.ts settingsPlan). Only Sol's half shows; Build's own
// (folders and branches, side copies) stays in Build. Esc, the backdrop and the × close it.
import { useEffect } from "react";
import type { useEngine } from "../useEngine";
import { Settings } from "../Settings";
import { Site } from "../Site";
import "./homesettings.css";

type E = ReturnType<typeof useEngine>;

export function HomeSettings({ e, first, onClose }: { e: E; first: string; onClose: () => void }) {
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !ev.defaultPrevented) { ev.preventDefault(); onClose(); } };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="ob1-sheet" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="ob1-sheetcard" role="dialog" aria-label="settings">
        <Site name="settings"><Settings s={e.settings} stale={false} info={e.engineInfo} up={e.up} health={e.health} goBack={e.goBackPlan} send={e.send} subscribe={e.subscribe} models={e.models}
          efforts={e.efforts} sampling={e.sampling} onSet={e.setSettings} onHear={e.hearVoice} first={first} scope="sol" onClose={onClose} /></Site>
      </div>
    </div>
  );
}

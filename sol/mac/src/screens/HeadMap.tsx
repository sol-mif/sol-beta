// The map in Build's head (#1090, design NOW 01:30 #2): ScreenMap as a child of the head's row, the same on every
// window. Draws nothing with the switch off or one window.
import { useState } from "react";
import { useScreensOn } from "./flag";
import { useEffect } from "react";
import { ME, useScreens, many, swap, takeArrange, forgetArrange } from "./store";
import { ScreenMap } from "./ScreenMap";
import { useWidth } from "../fit";

export function HeadMap() {
  const on = useScreensOn();
  const { s, facts, arrange } = useScreens();
  useEffect(() => { if (!arrange) return; const t = window.setTimeout(forgetArrange, Math.max(0, arrange.until - Date.now())); return () => window.clearTimeout(t); }, [arrange]);
  const [, setOver] = useState(false);
  const narrow = useWidth() < 900;
  if (!on || !many(s)) return null;
  return <ScreenMap s={s} me={ME} facts={facts} narrow={narrow} inHead offer={arrange?.roles} onTake={takeArrange} onTrade={(w) => (arrange ? takeArrange() : swap(ME, w))}
    onHover={(v) => { setOver(v); window.dispatchEvent(new CustomEvent("sol:screens-bright", { detail: v })); }}
    onWaits={() => window.dispatchEvent(new CustomEvent("sol:screens-waits"))} />;
}

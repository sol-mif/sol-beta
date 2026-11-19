// The switch for Jelly across screens (#1090): `screens.two`, off by default. It spans every mode (a window's role is
// not one mode's), so its row is in the global Settings › me, beside Home and Build, one place. With it off no window
// says hello to the engine, no stage is shared out, no edge glows: the face is as it was.
// Doors: this window's storage ("1"), or `?screens.two=on` on the page's link for one load (the shots, the second window).
import { useSyncExternalStore } from "react";
import { buildSwitch } from "../flag.ts";

export const SCREENS_TWO = "screens.two";
const sw = buildSwitch(SCREENS_TWO);
export const screensOn = () => sw.get();
export const setScreensOn = (v: boolean) => sw.set(v);
export const subScreens = (f: () => void) => sw.sub(f);
export const useScreensOn = () => useSyncExternalStore(sw.sub, sw.get);

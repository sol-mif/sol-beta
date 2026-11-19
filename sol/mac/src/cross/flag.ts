// Home and Build, one place (#1031): `cross`, off by default, with its row in Settings › me (CrossRow.tsx). With it on,
// a thing is carried between Home and Build by hand (hand.ts): a folder's card, a fact or a source picked up in Home and
// put down on Build's stage or in its talk; a block of the stage put down on a Home folder; Home's "needs you" lit on
// the spine from Build. The doors are flag.ts's (storage `cross` = "1", the link `?cross=on|off`, another window's
// storage event); the switch writes `data-cross` on <html>, so the CSS needs no React.
import { useSyncExternalStore } from "react";
import { buildSwitch } from "../flag";

export const CROSS = "cross";
const sw = buildSwitch(CROSS);
const mark = () => { if (typeof document !== "undefined") document.documentElement.dataset.cross = sw.get() ? "on" : "off"; };
mark();
sw.sub(mark);

/** Home and Build, one place: off by default */
export const crossOn = () => sw.get();
export const setCross = (v: boolean) => sw.set(v);
export const subCross = (f: () => void) => sw.sub(f);
export const useCross = () => useSyncExternalStore(sw.sub, sw.get);

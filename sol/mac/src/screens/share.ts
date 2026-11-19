// The one share of the stage per base store for this window (#1090, windowStore.ts), told when the record changes.
import type { StageStore } from "../stage/store";
import { windowStore } from "./windowStore";
import { ME, screensState, subRecord, layOwn, pointFar } from "./store";

const shares = new WeakMap<StageStore, StageStore>();
/** the room this window's stage has: the stage itself when drawn, else the window under its head */
const roomNow = () => {
  const r = typeof document === "undefined" ? null : document.querySelector(".st-stage")?.getBoundingClientRect();
  return r && r.width > 100 && r.height > 100 ? { w: r.width, h: r.height } : { w: window.innerWidth, h: window.innerHeight - 52 };
};
export function shareOf(base: StageStore): StageStore {
  let s = shares.get(base);
  if (!s) { s = windowStore(base, ME, screensState, subRecord, layOwn, roomNow, pointFar); shares.set(base, s); }
  return s;
}

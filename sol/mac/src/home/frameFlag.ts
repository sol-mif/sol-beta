// The frame (#630): its switch, read the way the clean Home's is (flag.ts). The face's alone, so the engine stays as it
// is: `sol.frame` in this window's storage, or `?frame=on` / `?frame=off` on the page's link (the stills). Off by
// default: with it off nothing of the frame loads, and Home is as it was.
import { useSyncExternalStore } from "react";

const KEY = "sol.frame";
const subs = new Set<() => void>();
const fromLink = (): boolean | null => {
  const v = new URLSearchParams(location.search).get("frame");
  return v === "on" ? true : v === "off" ? false : null;
};
const read = (): boolean => {
  const l = fromLink();
  if (l !== null) return l;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};
let on = read();

export const frameOn = () => on;
export function setFrameOn(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private */ }
  on = v;
  subs.forEach((f) => f());
}
export const useFrameOn = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

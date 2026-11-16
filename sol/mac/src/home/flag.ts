// The clean Home (#589): the switch. The face's alone, so the engine stays as it is: `sol.home.clean` in this window's
// storage, or `?home=clean` / `?home=old` on the page's link (the stills). Off by default: today's Home runs as before.
import { useSyncExternalStore } from "react";

const KEY = "sol.home.clean";
const subs = new Set<() => void>();
const fromLink = (): boolean | null => {
  const v = new URLSearchParams(location.search).get("home");
  return v === "clean" ? true : v === "old" ? false : null;
};
const read = (): boolean => {
  const l = fromLink();
  if (l !== null) return l;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};
let on = read();

export const cleanHome = () => on;
export function setCleanHome(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private */ }
  on = v;
  subs.forEach((f) => f());
}
export const useCleanHome = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

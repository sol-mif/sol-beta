// The body, rendering A (#625): the switch. The face's alone, as the clean Home's (home/flag.ts): `sol.body.a` in this
// window's storage, or `?body=a` / `?body=old` on the page's link (the stills). Off by default: Mark draws as before.
// The notch is a window of its own, so a change in Settings reaches it by the storage event, and by a slow re-read
// for a webview that does not hear it.
import { useSyncExternalStore } from "react";

const KEY = "sol.body.a";
const subs = new Set<() => void>();
const fromLink = (): boolean | null => {
  const v = new URLSearchParams(location.search).get("body");
  return v === "a" ? true : v === "old" ? false : null;
};
const read = (): boolean => {
  const l = fromLink();
  if (l !== null) return l;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};
let on = read();
const again = () => { const v = read(); if (v !== on) { on = v; subs.forEach((f) => f()); } };
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === KEY) again(); });
  window.setInterval(again, 1500);
}

export const bodyA = () => on;
export function setBodyA(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private */ }
  on = v;
  subs.forEach((f) => f());
}
export const useBodyA = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

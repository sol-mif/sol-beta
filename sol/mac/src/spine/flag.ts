// The spine (Marco 2026-11-07, mine/look/functions/side-mechanics.html): an outer column that hops between the four
// views. Home (new, empty for now), Build (today's Home), Cowork, Social. The switch is the face's alone: `sol.spine`
// in this window's storage, off unless "on" (on main since #940; the night branch had it on unless "off"); `?spine=on`
// or `?spine=off` on the page's link wins for one load.
import { useSyncExternalStore } from "react";

export type View = "home" | "build" | "cowork" | "social";
export const VIEWS: { id: View; letter: string; name: string; hint: string }[] = [
  { id: "home", letter: "H", name: "home", hint: "what you need to get out of the way" },
  { id: "build", letter: "B", name: "build", hint: "your sessions" },
  { id: "cowork", letter: "C", name: "cowork", hint: "a project, its people and their agents" },
  { id: "social", letter: "S", name: "social", hint: "your friends and their agents" },
];
export const isView = (v: unknown): v is View => VIEWS.some((x) => x.id === v);

const KEY = "sol.spine";
const subs = new Set<() => void>();
const read = (): boolean => {
  const l = new URLSearchParams(location.search).get("spine");
  if (l === "on") return true;
  if (l === "off") return false;
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
};
let on = read();
export const spineOn = () => on;
export function setSpine(v: boolean) {
  try { localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* private */ }
  on = v;
  subs.forEach((f) => f());
}
export const useSpine = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

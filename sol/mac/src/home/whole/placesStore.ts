// The side's places (#799, plan Part C slice 36), behind sol.home.whole: what the face holds of `home.places`, and which
// folder is open when Home's place is "folder". The transport is places.ts's stub until the engine sends places.
import { useSyncExternalStore } from "react";
import { stub, type PlacesMsg } from "./places.ts";
import { goTo, type Place } from "./sourcesStore.ts";

let view: PlacesMsg | null = null, folder: string | null = null;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());
let engine: ReturnType<typeof stub> | null = null;
/** ask for the places (the stub, until the engine sends them) */
export function send() { engine ??= stub(); view = engine({ type: "home.places" }); tell(); }
export const placesNow = () => view;
export function usePlaces(): PlacesMsg | null {
  return useSyncExternalStore((f) => { subs.add(f); if (!view) send(); return () => { subs.delete(f); }; }, () => view);
}
/** open a folder: Home's place becomes it */
export function openFolder(id: string) { folder = id; tell(); goTo("folder"); }
export const folderNow = () => folder;
export const useFolder = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => folder);
/** the word the head says for where you are ("home · bio 201") */
export function whereWord(p: Place, places: PlacesMsg | null, open: string | null): string {
  if (p === "folder") return places?.places.find((x) => x.id === open)?.name ?? "a place";
  if (p === "done") return "done today";
  if (p === "week") return "the week";   // C44
  if (p === "jev") return "Jev, the judge";   // C40
  if (p === "browser") return "your browser";   // C42
  if (p === "trust") return "the trust";   // C43
  if (p === "flows") return "flows";   // C39
  return p;
}

// What the person set for Build's side (Build settings › sidebar, 2026-11-11): how it is sorted, how long quiet work
// stays in its project, and whether rows move. Kept in this window's storage. The helpers pref went on 2026-11-14: only
// `under` folds now, under an orchestration row, so a pref that hid "the sessions a session started" hid nothing right.
import { useSyncExternalStore } from "react";

export type SidePrefs = {
  sort: "needs" | "folder";                   // by what needs you (sideSort.ts), or the folders as before (sideRows.ts)
  stay: 1 | 3 | 7;                            // days a quiet session stays in its project before "earlier"
  motion: boolean;                            // a row that changes place is seen moving there
  // the quick edit (2026-11-11, "hold it"): the folders as the person arranged them. Kept here, in the window, so a
  // name is a label (the folder on the disk keeps its own) and a hide is taken back with one press
  order: string[];                            // folder keys, first to last; a folder not named here follows, newest first
  hidden: string[];                           // folders out of the side (their sessions still rise when they need you)
  names: Record<string, string>;              // a folder's name on the side
  extra: string[];                            // folders added from the side, shown as trays before they hold a session
};
export const SIDE_PREFS: SidePrefs = { sort: "needs", stay: 1, motion: true, order: [], hidden: [], names: {}, extra: [] };
const KEY = "sol.side.prefs";
const subs = new Set<() => void>();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const read = (): SidePrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<SidePrefs>;
    return {
      sort: v.sort === "folder" ? "folder" : "needs",
      stay: v.stay === 3 || v.stay === 7 ? v.stay : 1,
      motion: v.motion !== false,
      order: list(v.order), hidden: list(v.hidden), extra: list(v.extra),
      names: v.names && typeof v.names === "object" ? v.names : {},
    };
  } catch { return SIDE_PREFS; }
};
let now = read();
export const sidePrefs = () => now;
export function setSidePrefs(p: Partial<SidePrefs>) {
  now = { ...now, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(now)); } catch { /* private */ }
  subs.forEach((f) => f());
}
export const useSidePrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => now);

/** the folders the side knows now (their key, the name shown, how many sessions), for Build settings › sidebar: the
 *  side says them as it draws, the drawer lists them */
export type Known = { key: string; name: string; n: number };
let known: Known[] = [];
const kSubs = new Set<() => void>();
export function setKnown(k: Known[]) {
  if (JSON.stringify(k) === JSON.stringify(known)) return;
  known = k; kSubs.forEach((f) => f());
}
export const useKnown = () => useSyncExternalStore((f) => { kSubs.add(f); return () => { kSubs.delete(f); }; }, () => known);
/** the folder edits, one place for the side and the drawer */
export const folderEdit = {
  name: (key: string, name: string) => { const names = { ...now.names }; if (name.trim()) names[key] = name.trim(); else delete names[key]; setSidePrefs({ names }); },
  hide: (key: string, hide = true) => setSidePrefs({ hidden: hide ? [...now.hidden.filter((k) => k !== key), key] : now.hidden.filter((k) => k !== key) }),
  /** `key` moves to just before `before` (null: the end), in the order the side shows (`shown`) */
  move: (shown: string[], key: string, before: string | null) => {
    const rest = shown.filter((k) => k !== key), i = before === null ? rest.length : rest.indexOf(before);
    rest.splice(i < 0 ? rest.length : i, 0, key);
    setSidePrefs({ order: rest });
  },
  add: (path: string) => setSidePrefs({ extra: [...now.extra.filter((k) => k !== path), path], hidden: now.hidden.filter((k) => k !== path) }),
};

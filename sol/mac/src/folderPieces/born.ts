// A piece is born (#1092, S/design/design.md DETAILS): the first time a recipe's row appears in a folder it drops in
// with a soft click, rows 60 ms apart; never again at a reload. What the folder has met is kept per folder in the
// window's own storage, so turning the switch on pours the folder's pieces in once, and a tool he keeps on the bench
// (or one his session writes) lands while he watches.
import { useEffect, useState } from "react";
import { play } from "../snap/click.ts";   // .ts: the face's tests reach newOf

const KEY = (cwd: string) => `sol.pieces.met:${cwd}`;
/** the names this folder has not shown before, in the list's order (pure) */
export const newOf = (met: string[] | null, names: string[]): string[] => names.filter((n) => !(met ?? []).includes(n));
/** rows apart, and how long the class stays */
export const BORN_GAP = 60, BORN_MS = 425;

/** name → its place in the pour (0, 1, 2 …) while it is being born; empty otherwise */
export function useBorn(cwd: string, names: string[]): Map<string, number> {
  const [born, setBorn] = useState<Map<string, number>>(() => new Map());
  const sig = names.join("\n");
  useEffect(() => {
    if (!sig) return;                                  // still reading: an empty list is not "nothing here"
    let met: string[] | null = null;
    try { met = JSON.parse(localStorage.getItem(KEY(cwd)) ?? "null"); } catch { /* no storage: nothing is born */ return; }
    const fresh = newOf(met, sig.split("\n"));
    if (!fresh.length) return;
    try { localStorage.setItem(KEY(cwd), JSON.stringify([...(met ?? []), ...fresh])); } catch { return; }
    setBorn(new Map(fresh.map((n, i) => [n, i])));
    // each lands with the snap's own click, a little higher and softer than a seat; five at most are heard
    fresh.slice(0, 5).forEach((_, i) => play("seat", { pitch: 1.12, level: 0.5, delay: i * BORN_GAP + BORN_MS * 0.6 }));
    const t = setTimeout(() => setBorn(new Map()), fresh.length * BORN_GAP + BORN_MS + 200);
    return () => clearTimeout(t);
  }, [cwd, sig]);
  return born;
}

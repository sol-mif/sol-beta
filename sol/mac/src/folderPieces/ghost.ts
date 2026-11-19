// The ghost row (#1092, the designer's NOW 3 of 05:14; the engine's half: sol/engine/src/work/pieceGhost.ts): the engine
// read what he asked today in this folder's sessions, on this machine; a status question he keeps asking is a tool
// nobody made. Every word of it answered by a source: the
// folder's "new piece" row reads "make: releases" and the bench opens with that source pressed and read. Half sure: the
// plain row; the bench's pill wears a dashed rim. Nothing: the plain row. One answer per folder, kept here.
import { useEffect, useSyncExternalStore } from "react";
import { link } from "./usePieces";

export type Ghost = { name: string; reads: string; parts?: Record<string, string>; asked: string; tier: "acts" | "ghost" };
const got = new Map<string, Ghost | null>(), asking = new Set<string>(), subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

/** the folder's ghost, asked once while this face is open (the engine keeps it for the day) */
export function useGhost(cwd: string | null): Ghost | null {
  useEffect(() => {
    if (!cwd) return;
    // the engine's link may not be there yet when the side first draws: ask again, a few times, until it answers
    let tries = 0, t: ReturnType<typeof setTimeout> | undefined, gone = false;
    const ask = () => {
      if (gone || got.has(cwd) || asking.has(cwd)) return;
      const l = link();
      if (!l) { if (++tries < 10) t = setTimeout(ask, 2000); return; }
      asking.add(cwd);
      void Promise.resolve(l.ask<{ ghost?: Ghost | null }>("work.pieces.sources", { cwd, ghost: true }, 25_000)).then((r) => {
        asking.delete(cwd);
        // a ghost is kept; "none yet" is not, so the next look asks again (the engine works it out at most every 10 min)
        if (r && "ghost" in r) { if (r.ghost) { got.set(cwd, r.ghost); tell(); } } else if (++tries < 10) t = setTimeout(ask, 2000);
      }, () => asking.delete(cwd));
    };
    ask();
    // he comes back to the window: asked again (a question he asked twice since shows then)
    const again = () => { tries = 0; ask(); };
    window.addEventListener("focus", again);
    return () => { gone = true; if (t) clearTimeout(t); window.removeEventListener("focus", again); };
  }, [cwd]);
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => (cwd ? got.get(cwd) ?? null : null));
}
/** the ghost as the bench starts from it: sure, the draft has its source pressed and its name; half sure, the pill only */
export const ghostNow = (cwd: string) => got.get(cwd) ?? null;
/** a piece was kept from it: the row goes back to "new piece" */
export const ghostSpent = (cwd: string) => { got.set(cwd, null); tell(); };

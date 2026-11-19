// Build becomes yours (#1089): the switch as a hook, and the engine asked by rid (work.yours.*, engine work/yoursKeep.ts).
import { useSyncExternalStore } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";
import { makeYoursSwitch } from "./model";

const sw = makeYoursSwitch();
export const buildYours = () => sw.get();
export const setBuildYours = (v: boolean) => sw.set(v);
export const useBuildYours = () => useSyncExternalStore(sw.sub, sw.get);

const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
let rid = 0;
/** one ask of the engine, answered by its rid; an error the engine says is thrown with its words */
export function ask<T = any>(o: object, ms = 20000): Promise<T> {
  const r = `yours-${++rid}`;
  return new Promise((res, rej) => {
    const off = L?.on((m: any) => { if (m?.rid === r) { off?.(); clearTimeout(t); if (m.error) rej(new Error(m.error)); else res(m); } });
    const t = setTimeout(() => { off?.(); rej(new Error("the engine did not answer")); }, ms);
    // the engine checks the switch too (work/yoursKeep.ts hear): it is told with every ask
    if (!L?.send({ ...o, on: sw.get(), rid: r })) { off?.(); clearTimeout(t); rej(new Error("the engine is not there")); }
  });
}
/** the link coming up (the engine restarted): a caller asks again */
export const onLink = (f: (up: boolean) => void) => L?.onLink(f);

// the project's kept layout (the look): where every session of the project whose talk was never set by hand opens its
// talk (the design: "sessions you never set open that way"; a session's own setting always wins). Published by the line
// (it reads the shelf), read by the stage column after the session's own and before the default. Nothing is written to
// any session's stage.json
type Lay = { dock: "left" | "right" | "bottom" | "full"; width?: number };
let keptLay: Lay | null = null;
const layHeard = new Set<() => void>();
export function setKeptLay(l: Lay | null) { if (JSON.stringify(l) === JSON.stringify(keptLay)) return; keptLay = l; layHeard.forEach((f) => f()); }
/** the kept layout now (a press handler's read) */
export const keptLayNow = () => (sw.get() ? keptLay : null);
/** the kept layout, as a hook: null with the switch off */
export const useKeptLay = () => useSyncExternalStore((f) => { layHeard.add(f); const u = sw.sub(f); return () => { layHeard.delete(f); u(); }; }, keptLayNow, () => null);

/** the session open in Build (its offer line is mounted): the list asks for that folder's asks first */
let openSid = "";
export const setOpenSession = (sid: string) => { openSid = sid; };
export const openSession = () => openSid;

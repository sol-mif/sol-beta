// The frame (#630): its switch, read the way the clean Home's is (flag.ts). The face's alone, so the engine stays as it
// is: `sol.frame` in the windows' storage, or `?frame=on` / `?frame=off` on the page's link (the stills). On by
// default since #691's trial (a window that never turned it reads on; one that turned it off keeps "0"): every window
// tells the engine (useTellFrame, mounted in App.tsx whichever view shows, #1108), so the kernel runs. Turned off, nothing of the frame loads, and Home is as it was.
// Two windows (#1846): `sol.frame` is the person's choice, shared by every window, and only their own turn writes it. A
// window hears a turn made in another (the storage event, and a fresh read before it decides) and never writes the
// engine's value back. It sends the person's turn made in it, once; besides that it tells the engine only the stored
// choice, once each time the link comes up (a new or renewed engine, or a turn missed while unreachable), or an engine
// that holds no value.
import { useEffect, useRef, useSyncExternalStore } from "react";

const KEY = "sol.frame";
const subs = new Set<() => void>();
const fromLink = (): boolean | null => {
  const v = new URLSearchParams(location.search).get("frame");
  return v === "on" ? true : v === "off" ? false : null;
};
const read = (): boolean => {
  const l = fromLink();
  if (l !== null) return l;
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
};
let on = read();
/** the person turned it in this window, to this, and it is not sent yet: sent once, whatever the engine last said */
let turn: boolean | null = null;
/** storage takes the switch (false: private, or full; this window then keeps its own reading) */
let stored = true;
const show = (v: boolean) => { if (v === on) return; on = v; subs.forEach((f) => f()); };

export const frameOn = () => on;
export function setFrameOn(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); stored = true; } catch { stored = false; }
  turn = v;
  show(v);
}
export const useFrameOn = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

// another window turned it: this one shows it, and that turn is the other window's to tell
const heard = () => { turn = null; show(read()); };
if (typeof addEventListener === "function") addEventListener("storage", (e: StorageEvent) => { if (e.key === KEY || e.key === null) heard(); });

/** whether to tell the engine, besides the person's turn (pure): `engine` is its value in its last word (null: none yet;
 *  undefined: it holds none, never set or lost). Told when it reads otherwise and this is its first word since the link
 *  came up, or it holds no value; once a turn, as an older engine drops the key */
export const decide = (framed: boolean, engine: boolean | null | undefined, told: boolean | null, fresh: boolean) =>
  engine !== null && (engine === true) !== framed && told !== framed && (fresh || engine === undefined);

/** what one window knows of the engine: its last word (its own broadcasts only, never this window's optimistic copy),
 *  what was told since the link came up, and whether its first word since then is still to come */
export type Look = { engine: boolean | null | undefined; told: boolean | null; fresh: boolean };
export const newLook = (): Look => ({ engine: null, told: null, fresh: true });

/** one look, on the engine's word or the switch's turn */
export function step(look: Look, setSettings: (p: { frame: boolean }) => void) {
  if (turn !== null) {   // the person's turn here: sent once, straight away (dropped while the link is down: told at the next up)
    const v = turn;
    turn = null;
    if (v === on) { look.told = v; setSettings({ frame: v }); }
    return;
  }
  if (stored && fromLink() === null && read() !== on) { heard(); return; }   // turned in another window, its event not here yet
  if (look.engine === null) return;
  if ((look.engine === true) === on) { look.told = null; look.fresh = false; return; }   // it agrees, in its own word: a later turn is told anew
  const tell = decide(on, look.engine, look.told, look.fresh);
  look.fresh = false;
  if (!tell) return;
  look.told = on;
  setSettings({ frame: on });
}

/** what the engine says, from its raw messages: `open` is the link coming up (a new or renewed engine, or back after a
 *  drop), `settings` its broadcast */
export function hear(look: Look, m: { type?: string; settings?: { frame?: unknown } }, setSettings: (p: { frame: boolean }) => void) {
  if (m.type === "open") { look.engine = null; look.told = null; look.fresh = true; return; }
  if (m.type !== "settings" || !m.settings) return;
  look.engine = typeof m.settings.frame === "boolean" ? m.settings.frame : undefined;
  step(look, setSettings);
}

/** the engine's half of the switch (#633): this window tells it, so the blocks' engine halves run only with the frame on.
 *  In App, so a window on any view tells it, not only the clean Home (#1108) */
export function useTellFrame(subscribe: (f: (m: any) => void) => () => void, setSettings: (p: { frame: boolean }) => void) {
  const framed = useFrameOn();
  const look = useRef<Look>(newLook());
  const set = useRef(setSettings);
  set.current = setSettings;
  useEffect(() => subscribe((m) => hear(look.current, m, (p) => set.current(p))), [subscribe]);
  useEffect(() => step(look.current, (p) => set.current(p)), [framed]);
}

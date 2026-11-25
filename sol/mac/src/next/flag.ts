// The new face's switch ui.next (#1604, docs/port/switch.md): the face's one reading of it. The switch is the engine's:
// the setting ui.next, which the engine sends already resolved against SOL_UI_NEXT and the card's station
// (engine/src/settings.ts uiNext). The only file under next/ that today's face imports statically (App.tsx); everything
// else under next/ loads lazily and only when this says on. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { useSyncExternalStore } from "react";

let on = false;
const subs = new Set<() => void>();
/** the first frame (BR1, #1615): the switch as last read is kept here, so index.html's inline script paints the window
 *  the new face's paper before anything loads (data-next-first), not the old face's dark glass; read off, the mark goes */
export const FIRST_KEY = "sol.ui.next";
function keepFirst(v: boolean): void {
  try { globalThis.localStorage?.setItem(FIRST_KEY, v ? "1" : "0"); } catch { /* storage refused: the first frame stays the old one */ }
  const root = typeof document === "undefined" ? null : document.documentElement;
  if (root && !v) delete root.dataset.nextFirst;
}
/** is the new face on? Given the engine's settings it reads them (and tells the parts that draw without them); without,
 *  the switch as last read */
export function nextOn(settings?: unknown): boolean {
  if (settings !== undefined) {
    const v = download || (settings as { ui?: { next?: unknown } } | null)?.ui?.next === true;
    if (settings) keepFirst(v);   // null is the engine not heard yet (useEngine): not an answer to keep
    if (v !== on) { on = v; queueMicrotask(() => subs.forEach((f) => f())); }
  }
  return on;
}
/** the engine not heard yet (settings null, useEngine): the window shows only the first frame, never the old face, unless
 *  the switch was last read off here (then the old face starts as it always did). BR1 first-face probe, #1615 */
export function waitsFirst(settings: unknown): boolean {
  if (settings != null) return false;
  if (download) return true;
  try { return globalThis.localStorage?.getItem(FIRST_KEY) !== "0"; } catch { return true; }
}
/** a downloaded Sol.app (the shell's first_run_state: not built on this Mac) never draws the old face, whatever the switch
 *  or this Mac's last reading says (#94, Sol ticket #96); the team's own build keeps the switch both ways. Kept in
 *  localStorage so index.html's first paint knows it before anything loads */
export const BUILD_KEY = "sol.build";
let download = (() => { try { return globalThis.localStorage?.getItem(BUILD_KEY) === "download"; } catch { return false; } })();
export const isDownload = (): boolean => download;
/** the shell said which build this is */
export function noteBuild(isDl: boolean): void {
  download = isDl;
  try { globalThis.localStorage?.setItem(BUILD_KEY, isDl ? "download" : "team"); } catch { /* storage refused: asked again next load */ }
}
// ---- the first run (#94, Sol ticket #96): the shell installs, the face only asks it (movein/setup-state.ts, movein/firstrun/Steps.tsx)
/** the shell's first_run_state (welcome.rs FirstRun) */
export type FirstRun = { active: boolean; download: boolean; lines: string[]; code: number | null; error: string | null };

/** what the window draws before anything else: `wait` the shell has not answered yet (the first frame's paper),
 *  `setup` the install's line, `face` the face as it always chose (the new one for a download, flag.ts) */
export function firstScreen(f: FirstRun | null | undefined): "wait" | "setup" | "face" {
  if (f === undefined) return "wait";
  return f?.active ? "setup" : "face";
}

/** the shell asked once, then on a beat while it says it is setting up; the face is told each answer (null: no shell to
 *  ask). Returns stop */
export function watchFirstRun(ask: () => Promise<FirstRun>, tell: (f: FirstRun | null) => void, every = 800): () => void {
  let stopped = false, t: ReturnType<typeof setTimeout> | undefined;
  const go = () => {
    ask().then((f) => { if (stopped) return; tell(f); if (f.active) t = setTimeout(go, every); })
      .catch(() => { if (!stopped) tell(null); });   // no shell to ask (a browser, an old app): the face as before
  };
  go();
  return () => { stopped = true; if (t) clearTimeout(t); };
}
/** a browser's still of the first run (?firstrun=setup, &fail=1 for the stopped one): the install's lines on a clock */
export function demoFirstRun(fail: boolean, t0 = Date.now()): () => Promise<FirstRun> {
  // sol/install's own order: where Sol goes, Node, then the clone and sol/setup (Sol ticket #97)
  const feed: [number, string][] = [[300, "  ok    Sol goes to ~/Sol"], [500, "  ok    Apple's developer tools"], [1500, "install: fetching Node v24.22.1 (nodejs.org, about 50 MB)"],
    [3000, "  ok    Node v24.22.1 in ~/.sol/node, checksum verified"], [3300, "install: cloning Sol into ~/Sol"], [4200, "  ok    Sol is in ~/Sol, on you/mine"], [4500, "install: bash sol/setup (a few minutes: packages, the engine built, its job)"]];
  return async () => {
    const lines = feed.filter(([ms]) => Date.now() - t0 >= ms).map(([, l]) => l);
    const error = fail && lines.length >= 3 ? "could not fetch node-v24.22.1-darwin-arm64.tar.gz from nodejs.org; is the network up?" : null;
    return { active: true, download: true, lines: error ? lines.slice(0, 3) : lines, code: error ? 1 : null, error };
  };
}
/** the switch, for a part that draws without the engine's settings at hand */
export const useNextOn = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);

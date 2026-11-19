// The displays as Sol.app's shell sees them (#1090, src-tauri/src/screens.rs): asked once by the main window with
// `screens.two` on (that starts the shell's watch), told again on `screens:changed` (a display plugged in, unplugged,
// moved). In a browser there is no shell: nothing here runs, and the window's own rect stands for its screen.
// The shell folds a window whose display went (closes it: the engine draws its blocks at home) and opens it again when
// the display comes back; the face only re-says where it stands.
export type Display = { name: string; x: number; y: number; w: number; h: number; scale: number; main: boolean };

const IN_APP = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
let displays: Display[] = [];
let started = false;
let unlisten: (() => void) | null = null;   // the one screens:changed listener, dropped when the switch goes off
/** the displays as last told (empty in a browser) */
export const displaysNow = () => displays;

/** the switch turned off in the main window: every window of Jelly on another screen closes, the watch stops */
export function nativeOff() {
  if (!IN_APP()) return;
  started = false;
  unlisten?.(); unlisten = null;
  void import("@tauri-apps/api/core").then(({ invoke }) => invoke("screens_off")).catch(() => {});
}
/** start once: ask the shell, and hear every change; `changed` is called after each */
export function watchDisplays(changed: () => void) {
  if (started || !IN_APP()) return;
  started = true;
  const take = (d: unknown) => { if (Array.isArray(d)) { displays = d as Display[]; changed(); } };
  void import("@tauri-apps/api/core").then(({ invoke }) => invoke<Display[]>("screens")).then(take).catch(() => { started = false; });
  unlisten?.(); unlisten = null;
  void import("@tauri-apps/api/event").then(({ listen }) => listen<Display[]>("screens:changed", (e) => take(e.payload)))
    .then((u) => { if (started && !unlisten) unlisten = u; else u(); }).catch(() => {});
}

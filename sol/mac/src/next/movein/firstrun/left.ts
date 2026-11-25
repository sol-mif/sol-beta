// The first run's last two steps (Google, the AI; Sol ticket #97) wait for the engine, which answers only once the shell
// has loaded "/" (welcome.rs first_run_ended), a fresh page. This mark carries them over that reload: set while the
// shell installs (Steps.tsx), read by App.tsx before the new face draws, cleared when they end or are left for later.
// Plain and tiny: the one file under next/ besides flag.ts that App.tsx imports statically (next-imports.test.ts).
export const SIGNINS_KEY = "sol.firstrun.signins";

export function signInsLeft(): boolean {
  try { return globalThis.localStorage?.getItem(SIGNINS_KEY) === "1"; } catch { return false; }
}
export function markSignIns(): void {
  try { globalThis.localStorage?.setItem(SIGNINS_KEY, "1"); } catch { /* storage refused: the welcome card still has the sign-ins */ }
}
export function endSignIns(): void {
  try { globalThis.localStorage?.removeItem(SIGNINS_KEY); } catch { /* nothing kept */ }
}

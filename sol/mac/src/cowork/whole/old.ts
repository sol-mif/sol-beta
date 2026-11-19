// Cowork, whole (#1173): the switch back to the old Cowork, for one release, then the old one goes (#1169's legacy map).
// A face setting, this Mac's only (localStorage sol.cowork.old), off: Cowork opens on the new shell. Its row is in the
// shell's own settings and in Settings, so a person on the old Cowork finds the way back.
import { useSyncExternalStore } from "react";

const KEY = "sol.cowork.old";
const subs = new Set<() => void>();
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export function setOldCowork(on: boolean) {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private window */ }
  subs.forEach((f) => f());
}
export const useOldCowork = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, read);

// The run's two build switches (#771, #751): `stage.whole` for Build's whole stage (plan Part B) and `sol.home.whole`
// for the whole Home (plan Part C, it will replace Home's five). Build switches, never user settings (#710): no row in
// Settings; the doors are this window's storage (`stage.whole` / `sol.home.whole` = "1") and the page's link
// (`?stage.whole=on|off`, `?sol.home.whole=on|off`, the stills), the link winning for one load. Both off by default,
// and nothing stands behind either yet: the B slices read stageWhole(), the C slices homeWhole(). Each goes with the
// PR that deletes its old path. Read the way the clean Home's switch is (home/flag.ts); a change in another window
// (the notch) arrives by the storage event.
import { useSyncExternalStore } from "react";

type Kv = Pick<Storage, "getItem"> | null;
type KvW = Pick<Storage, "getItem" | "setItem"> | null;
const storageOf = (): KvW => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const searchOf = () => (typeof location === "undefined" ? "" : location.search);
const windowOf = (): Pick<EventTarget, "addEventListener"> | null =>
  typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;

/** a switch's state from a page link's query and a storage (pure): the link's on/off wins, else storage "1", else off */
export function readSwitch(key: string, search: string, kv: Kv): boolean {
  const l = new URLSearchParams(search).get(key);
  if (l === "on") return true;
  if (l === "off") return false;
  try { return kv?.getItem(key) === "1"; } catch { return false; }
}

/** where a switch reads from; the tests pass their own, so they never touch the runner's real storage */
export interface SwitchEnv { storage: () => KvW; search: () => string; target: Pick<EventTarget, "addEventListener"> | null }
const realEnv: SwitchEnv = { storage: storageOf, search: searchOf, target: windowOf() };

export function buildSwitch(key: string, env: SwitchEnv = realEnv) {
  const subs = new Set<() => void>();
  let on = readSwitch(key, env.search(), env.storage());
  // another window's change: its own key, or null when that window cleared its storage (localStorage.clear()): re-read
  env.target?.addEventListener("storage", (e) => {
    const k = (e as StorageEvent).key;
    if (k !== null && k !== key) return;
    const v = readSwitch(key, env.search(), env.storage());
    if (v !== on) { on = v; subs.forEach((f) => f()); }
  });
  return {
    get: () => on,
    /** the developer's door, the console only; never a user toggle and never a row in Settings */
    set(v: boolean) {
      try { env.storage()?.setItem(key, v ? "1" : "0"); } catch { /* private */ }
      on = v;
      subs.forEach((f) => f());
    },
    sub(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}

export const STAGE_WHOLE = "stage.whole";
export const HOME_WHOLE = "sol.home.whole";
const stage = buildSwitch(STAGE_WHOLE);
const home = buildSwitch(HOME_WHOLE);

/** either of the run's switches is on: the readable set (#891, tokens.json shade.read) is drawn; a change re-renders */
export const anyWhole = () => stage.get() || home.get();
export const subWhole = (f: () => void) => { const a = stage.sub(f), b = home.sub(f); return () => { a(); b(); }; };
/** Build's whole stage (Part B): off by default */
export const stageWhole = () => stage.get();
export const setStageWhole = (v: boolean) => stage.set(v);
export const useStageWhole = () => useSyncExternalStore(stage.sub, stage.get);

// C42 (#805): the shared browser's own switch, beside Home's (plan Part C slice 42: "Switch: browser.shared (new)")
export const BROWSER_SHARED = "browser.shared";
const browser = buildSwitch(BROWSER_SHARED);
/** one shared browser (Part C slice 42): off by default; it shows under Home's Sources, so it needs sol.home.whole too */
export const browserShared = () => browser.get();
export const setBrowserShared = (v: boolean) => browser.set(v);
export const useBrowserShared = () => useSyncExternalStore(browser.sub, browser.get);

/** the whole Home (Part C): off by default */
export const homeWhole = () => home.get();
export const setHomeWhole = (v: boolean) => home.set(v);
export const useHomeWhole = () => useSyncExternalStore(home.sub, home.get);

/** the stage says what was just done and how to take it back (#903, stage/said.ts): off by default; `?stage.said=on`
 *  or storage `stage.said` = "1" */
export const STAGE_SAID = "stage.said";
const said = buildSwitch(STAGE_SAID);
export const stageSaid = () => said.get();
export const setStageSaid = (v: boolean) => said.set(v);
export const useStageSaid = () => useSyncExternalStore(said.sub, said.get);

// The run's build switches (#771, #751): `stage.whole` for Build's whole stage (plan Part B), and beside it the runs
// view and what the stage says. Build switches, never user settings (#710); the doors are this window's storage
// (`stage.whole` = "1") and the page's link (`?stage.whole=on|off`, the stills), the link winning for one load. stage.whole
// is on by default since #691's trial ("0" keeps a window off), the others off; it goes with the PR that deletes its
// old path. Read the way the clean Home's switch is (home/flag.ts); a
// change in another window arrives by the storage event.
import { useSyncExternalStore } from "react";

type Kv = Pick<Storage, "getItem"> | null;
type KvW = Pick<Storage, "getItem" | "setItem"> | null;
const storageOf = (): KvW => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const searchOf = () => (typeof location === "undefined" ? "" : location.search);
const windowOf = (): Pick<EventTarget, "addEventListener"> | null =>
  typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;

/** a switch's state from a page link's query and a storage (pure): the link's on/off wins, else storage "1" or "0",
 *  else the switch's default (off, but for a switch turned on for everyone: stage.whole, #691) */
export function readSwitch(key: string, search: string, kv: Kv, dflt = false): boolean {
  const l = new URLSearchParams(search).get(key);
  if (l === "on") return true;
  if (l === "off") return false;
  try { const v = kv?.getItem(key); return v === "1" ? true : v === "0" ? false : dflt; } catch { return dflt; }
}

/** where a switch reads from; the tests pass their own, so they never touch the runner's real storage */
export interface SwitchEnv { storage: () => KvW; search: () => string; target: Pick<EventTarget, "addEventListener"> | null }
const realEnv: SwitchEnv = { storage: storageOf, search: searchOf, target: windowOf() };

// mine: Marco, 2026-11-11: "make every night switch on by default in my own Sol". Since #1427 they read on where this
// Sol runs as concept (the team's own checkout, the version switch at the top, #1295), not in the window marked his:
// in a real window only (never a test's env), a night switch nobody touched reads on in concept and off in complete;
// its row in Settings still turns it off (storage "0"), and the link's on/off wins. The version is the engine's answer
// to team.channel.get (VersionSwitch asks), kept in this window's storage `sol.version`, so the next load reads it at
// once; until the engine has answered once it reads complete (off), so nothing shows to someone it may not be for.
// MINE_ON keeps its name: a switch added to it stands at concept.
export const MINE_ON = new Set(["cross", "build.one", "build.one.long", "build.one.team", "build.snap", "side.sorted", "look.shown", "build.orchestration"]);
export const MINE_KEY = "sol.mine";
export const MINE_LOGINS = new Set(["marcocyl04-ux"]);
export const VERSION_KEY = "sol.version";
/** a night switch reads on untouched (pure): one of MINE_ON, not named on the link, never set, where this Sol runs as concept */
export function mineOn(key: string, search: string, kv: Kv): boolean {
  if (!MINE_ON.has(key) || new URLSearchParams(search).has(key)) return false;
  try { return !!kv && kv.getItem(VERSION_KEY) === "concept" && kv.getItem(key) === null; } catch { return false; }
}
const untouched = (key: string, env: SwitchEnv) => mineOn(key, env.search(), env.storage());
/** the version the window keeps from the engine's team.channel (pure): concept only in the team's own checkout running
 *  as concept; a known mode anywhere else is complete; no mode yet (the engine's first moment), nothing to keep */
export function versionOf(s: { mode?: unknown; team?: unknown } | null | undefined): "concept" | "complete" | null {
  if (!s || (s.mode !== "concept" && s.mode !== "complete")) return null;
  return s.team === true && s.mode === "concept" ? "concept" : "complete";
}
const rereads = new Set<() => void>();
/** the engine said which version this Sol runs as (team.channel): kept in this window's storage, and every night switch
 *  reads again at once (no restart); true when it changed */
export function noteVersion(s: { mode?: unknown; team?: unknown } | null | undefined, kv: KvW = storageOf()): boolean {
  const v = versionOf(s);
  if (!v || !kv) return false;
  try { if (kv.getItem(VERSION_KEY) === v) return false; kv.setItem(VERSION_KEY, v); } catch { return false; }
  rereads.forEach((f) => f());
  return true;
}
/** this window is Marco's own (pure): marked `sol.mine` = "1"; what was made for his life alone is drawn only there
 *  (#1277). His data only: it turns no switch on (#1427) */
export function isMine(kv: Kv = storageOf()): boolean {
  try { return !!kv && kv.getItem(MINE_KEY) === "1"; } catch { return false; }
}
/** the engine said whose Sol this is: Marco's own window is marked once, and true is answered when the mark is new
 *  (what was drawn before the login was known reads it again); anyone else's, never */
export function markMine(login: unknown, kv: KvW = storageOf()): boolean {
  if (typeof login !== "string" || !MINE_LOGINS.has(login) || !kv) return false;
  try { if (kv.getItem(MINE_KEY) !== null) return false; kv.setItem(MINE_KEY, "1"); return true; } catch { return false; }
}
const read = (key: string, env: SwitchEnv, dflt = false) =>
  (env === realEnv && untouched(key, env)) || readSwitch(key, env.search(), env.storage(), dflt);

export function buildSwitch(key: string, env: SwitchEnv = realEnv, dflt = false) {
  const subs = new Set<() => void>();
  let on = read(key, env, dflt);
  const again = () => { const v = read(key, env, dflt); if (v !== on) { on = v; subs.forEach((f) => f()); } };
  // the version turned in this window (noteVersion): a night switch reads again
  if (env === realEnv && MINE_ON.has(key)) rereads.add(again);
  // another window's change: its own key, the version, or null when that window cleared its storage
  // (localStorage.clear()): re-read
  env.target?.addEventListener("storage", (e) => {
    const k = (e as StorageEvent).key;
    if (k !== null && k !== key && k !== VERSION_KEY) return;
    again();
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
const stage = buildSwitch(STAGE_WHOLE, realEnv, true);   // on by default since #691's trial; "0" keeps a window off
/** the whole stage is on: the readable set (#891, tokens.json shade.read) is drawn; a change re-renders */
export const anyWhole = () => stage.get();
export const subWhole = (f: () => void) => stage.sub(f);

/** Build's whole stage (Part B): on by default (#691); storage "0" or ?stage.whole=off turns it off */
export const stageWhole = () => stage.get();
export const setStageWhole = (v: boolean) => stage.set(v);
export const useStageWhole = () => useSyncExternalStore(stage.sub, stage.get);

// The runs view (#889): Build's screen of every project's builders, machines and what needs you, read from the runs
// board. Off by default; `?build.runs=on` (the shots, with `&runs=open` to open it at load) or storage "1".
export const BUILD_RUNS = "build.runs";
const runs = buildSwitch(BUILD_RUNS);
export const buildRuns = () => runs.get();
export const setBuildRuns = (v: boolean) => runs.set(v);
export const useBuildRuns = () => useSyncExternalStore(runs.sub, runs.get);

/** the stage says what was just done and how to take it back (#903, stage/said.ts): off by default; `?stage.said=on`
 *  or storage `stage.said` = "1" */
export const STAGE_SAID = "stage.said";
const said = buildSwitch(STAGE_SAID);
export const stageSaid = () => said.get();
export const setStageSaid = (v: boolean) => said.set(v);
export const useStageSaid = () => useSyncExternalStore(said.sub, said.get);

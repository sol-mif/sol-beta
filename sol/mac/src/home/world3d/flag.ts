// Home's world (#1093, behind `home.world3d`, off by default): the whole life as one live 3D place, in Home's side as
// "world". Read the way every night switch is (flag.ts buildSwitch): a page link's ?home.world3d=on wins, else storage.
import { buildSwitch, type SwitchEnv } from "../../flag.ts";
import { useSyncExternalStore } from "react";

export const HOME_WORLD = "home.world3d";
export const makeWorldSwitch = (env?: SwitchEnv) => buildSwitch(HOME_WORLD, env);
const sw = makeWorldSwitch();
export const homeWorld = () => sw.get();
export const setHomeWorld = (v: boolean) => sw.set(v);
export const useHomeWorld = () => useSyncExternalStore(sw.sub, sw.get);
/** the world's sound (off by default: a soft tick when a thing settles, a low note when one wants you) */
export const WORLD_SOUND = "home.world3d.sound";
const snd = buildSwitch(WORLD_SOUND);
export const worldSound = () => snd.get();
export const setWorldSound = (v: boolean) => snd.set(v);
export const useWorldSound = () => useSyncExternalStore(snd.sub, snd.get);
/** the world's second look: the same island in 1-bit pearl dots (off: the solid look, the default); ?world.style=dither for one load */
export const WORLD_DOTS = "home.world3d.dots";
const dots = buildSwitch(WORLD_DOTS);
export const setWorldDots = (v: boolean) => dots.set(v);
export const useWorldDots = () => useSyncExternalStore(dots.sub, dots.get);

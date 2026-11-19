// Pieces in Build's project folders (#1092), its switch: `build.pieces`, Build's own (Build settings › switches), off by
// default; `?build.pieces=on` for the stills. Read the way every Build switch is (flag.ts's buildSwitch).
import { useSyncExternalStore } from "react";
import { buildSwitch, type SwitchEnv } from "../flag.ts";

export const BUILD_PIECES = "build.pieces";
export const makePiecesSwitch = (env?: SwitchEnv) => buildSwitch(BUILD_PIECES, env);
const sw = makePiecesSwitch();
export const buildPieces = () => sw.get();
export const setBuildPieces = (v: boolean) => sw.set(v);
export const useBuildPieces = () => useSyncExternalStore(sw.sub, sw.get);

// Pieces in Home's class folders (#1092, Home): `home.pieces`, off by default. Its row is in Home's own settings
// (Sol settings › home, under your world; #1123: a mode's switch lives in that mode's settings).
export const HOME_PIECES = "home.pieces";
export const makeHomePiecesSwitch = (env?: SwitchEnv) => buildSwitch(HOME_PIECES, env);
const hsw = makeHomePiecesSwitch();
export const homePieces = () => hsw.get();
export const setHomePieces = (v: boolean) => hsw.set(v);
export const useHomePieces = () => useSyncExternalStore(hsw.sub, hsw.get);

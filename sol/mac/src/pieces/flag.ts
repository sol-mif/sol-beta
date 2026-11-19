// Build mode as one space of pieces (mine, 2026-11-12, pieces/arrange.ts): its switch. Off by default; on, everything right
// of Build's two sidebars is one space where the chat, the box and the session's artifacts are pieces (BuildSpace.tsx),
// and the old arranging (the chat's docks, its seam and size buttons, the chat full, the trays) is not mounted. The
// doors: its row in Build's settings › switches (SpaceRow.tsx), this window's storage `build.space` = "1", the link
// `?build.space=on|off` (the shots).
import { useSyncExternalStore } from "react";
import { buildSwitch, type SwitchEnv } from "../flag.ts";

export const BUILD_SPACE = "build.space";
export const makeSpaceSwitch = (env?: SwitchEnv) => buildSwitch(BUILD_SPACE, env);
const sw = makeSpaceSwitch();
export const buildSpace = () => sw.get();
export const setBuildSpace = (v: boolean) => sw.set(v);
export const useBuildSpace = () => useSyncExternalStore(sw.sub, sw.get);

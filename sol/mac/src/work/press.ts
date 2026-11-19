// The press shown first (#917, #1272): a sent message and an Allow / Deny / answer show on the face before the engine
// echoes them. A switch, `work.press`, off by default and never in MINE_ON (flag.ts buildSwitch: `?work.press=on|off`
// wins for one load, else storage "1"). Off, the face waits for the engine's own line, as before #918: on, an allowed
// card leaves on the press, so the next waiting card slides under the pointer, and an answer the engine never took
// stays marked allowed.
import { buildSwitch, type SwitchEnv } from "../flag.ts";

export const WORK_PRESS = "work.press";
export const makePressSwitch = (env?: SwitchEnv) => buildSwitch(WORK_PRESS, env);
const sw = makePressSwitch();
export const pressFirst = () => sw.get();

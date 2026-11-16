// The jelly's halo (#674, look.md: the halo's states): the light the jelly gives off on the glass with nothing behind
// it, chosen by what the jelly is doing, never picked: at rest a wide breath of its colours, working its colours close as
// light, arriving it lights the glass under it (tokens.json, palette.looks.halo.states). `look` names a take outright,
// for the stage. The jelly is Body.tsx's (#626), drawn here at `size` with the halo of its state.
import { Body as Jelly, type HaloLook } from "../Body";
import { LOOKS } from "./tokens";

export type Doing = keyof typeof LOOKS.halo.states;
export type HaloName = keyof typeof LOOKS.halo.takes;
export const DOINGS = Object.keys(LOOKS.halo.states) as Doing[];

/** the halo the jelly wears while it is doing this, or the named take */
export const haloOf = (doing: Doing = "rest", look?: HaloName): HaloLook => LOOKS.halo.takes[look ?? LOOKS.halo.states[doing]];

/** the jelly, settled, with the halo of what it is doing */
export function Halo({ size, doing = "rest", look }: { size: number; doing?: Doing; look?: HaloName }) {
  return <Jelly size={size} state="settled" halo={haloOf(doing, look)} />;
}

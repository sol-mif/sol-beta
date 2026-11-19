// The moves (#1604, docs/port/slices.md "The contract every slice keeps"): each slice's own file, merged over the
// shared ones in core.ts into the one M. A move whose engine row is "no" (map.md; core.ts NOT_YET) answers
// { ok: false, why: "not yet" } in a real Sol until the engine has it. One file per slice, so no two builders touch one
// file; this one only gathers them. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { isReady, notYet, type Moves } from "../core.ts";
import plane from "./plane.ts";
import needs from "./needs.ts";
import near from "./near.ts";
import life from "./life.ts";
import ais from "./ais.ts";
import settings from "./settings.ts";
import engine from "./engine.ts";
import people from "./people.ts";

const SLICES: Record<string, Moves> = { plane, needs, near, life, ais, settings, engine, people };

/** every slice's moves in one object, each held back live while the engine cannot do it; a name two slices both
 *  give is said once in the console (the later slice's wins) */
export function merged(): Moves {
  const out: Moves = {}, by: Record<string, string> = {};
  for (const [slice, ms] of Object.entries(SLICES)) for (const [name, f] of Object.entries(ms)) {
    if (by[name]) console.warn(`next: the move ${name} is given by both ${by[name]} and ${slice}`);
    by[name] = slice;
    out[name] = (...args: unknown[]) => (isReady(name) ? f(...args) : notYet());
  }
  return out;
}

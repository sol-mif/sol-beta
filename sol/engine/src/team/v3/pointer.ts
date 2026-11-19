// Cowork v3 (fr-30), the two books (the v2 backend design §6.4, step C1, #724): an action in a Cowork project is kept in
// one book only, the team trail (trail.ts). The local log (log.ts) gets one line that points at it: `team.pointer`, its
// item the trail event's id, its value { project, kind } and nothing else. No content, no field, no free text, so the
// log never holds what the team trail holds, and `trail.get(item)` finds the event the line points at.
// Written for a local append only (door.ts append, index.ts team.v3.append), never for what came from a teammate
// (Trail.merge): that is no action on this machine. Not in trail.ts itself, slice 0's signed core.
// On unless SOL_COWORK_V3_POINTER says off (#691), and nothing with the frame off (kernelNow() is null then): with either off
// the log is what it was. A pointer that cannot be written is said on the engine's output; the trail's write stands.
import { kernelNow } from "../../kernel.js";
import type { TrailEvent } from "./trail.js";

/** the pointer's switch, a name of ours (the kind's name is ours too: its row in contract/kinds.ts and the one writer below) */
export const POINTER_ENV = "SOL_COWORK_V3_POINTER";

/** whether a local append to the team trail puts a pointer on the local log: on unless the env says off (#691) */
export function pointerOn(): boolean {
  const env = (process.env[POINTER_ENV] ?? "").trim().toLowerCase();
  return !(env === "off" || env === "0" || env === "false");
}

/** one pointer line for an event this machine just appended to the team trail (its project as the trail holds it) */
export function pointTo(e: TrailEvent): void {
  if (!pointerOn()) return;
  const k = kernelNow();
  if (!k) return;
  try { k.append("team.pointer", e.id, { project: e.project, kind: e.kind }, { person: "person", ...(e.by.agent ? { agent: e.by.agent } : {}) }); }
  catch (err) { console.error("the log:", err instanceof Error ? err.message : String(err)); }
}

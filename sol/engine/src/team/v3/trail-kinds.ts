// The team trail's own kind table (the cowork ways' format §5, step 2). The trail checks every kind's name for its
// shape only (trail.ts KIND); for a family listed here (the bare family name too: `way`) it also wants the name to have
// a row and the value to fit it, and a kind whose row carries no free text (a fact: every way kind but way.note, whose
// `words` are `text`) never has its content erased.
// An append from this Sol that does not is refused with one line. An event from another Sol that does not (a newer
// Sol's kind, a broken one, an erased fact) is named once by verify, and if it is signed and chained as it should be it
// is kept, so its writer's later events still chain; it is never among what verifies, and the trail hands it to no
// reader but a raw one (the format's §7: what is not understood does not pass). Whether an event is understood is
// worked out each time it is read, never stored: a Sol that learns the kind later reads it as understood. Every other
// family is as before. The rows are the local log's own (contract/kinds.ts), taken whole, so the two books cannot hold
// two shapes for one kind.
// The rows are the ways' (#1105): with their switch off (way-switch.ts) a checked family's events are read, kept and
// handed out as any other kind's, as before the ways came (#987), and nothing here refuses or sets one aside. What is
// never erased stays so either way: erasing loses what the cloud keeps (cloud/src/trail.ts TRAIL_FACTS, which has no
// switch), and a Sol that turns the ways on later must read the same facts as every other.
import { KINDS, fitsShape, type Shape } from "../../contract/kinds.js";
import { waysOn } from "./way-switch.js";

/** the families whose kinds the trail checks */
export const CHECKED: readonly string[] = ["way"];
/** the trail's rows: each checked kind and what its value carries */
export const TEAM_KINDS: ReadonlyMap<string, Shape> = new Map(KINDS.filter((r) => CHECKED.includes(r.family) && r.carries).map((r) => [r.kind, r.carries!]));

/** a kind's family: the part before the first dot, or the whole name when it has none */
const familyOf = (kind: string): string => { const dot = kind.indexOf("."); return dot < 0 ? kind : kind.slice(0, dot); };

/** kinds of an unchecked family that are facts all the same: a way's file (`wayfile`, cowork ways 4b, way-files.ts),
 *  which every Sol that comes later needs to read the version it names (round 15: erased, it split old Sols from new);
 *  a role event (`member`, standing.ts): erased, an owner's word that came after it would no longer count, so a former
 *  owner, a guest now, could take back the event that let in the owner who demoted them, and be owner again (#987's
 *  seventeenth review) */
export const FACTS: readonly string[] = ["wayfile", "member"];
/** whether an event of this kind may have its content erased (pure): any kind of an unchecked family, as before, but
 *  the FACTS; of a checked one, a kind whose row carries free text, never one whose row carries none (a fact). A kind
 *  with no row here (a newer Sol's) may be: its writer's erase is kept, since it may be words, and it is not understood
 *  either way */
export function erasable(kind: string): boolean {
  if (FACTS.includes(kind)) return false;
  if (!CHECKED.includes(familyOf(kind))) return true;
  const shape = TEAM_KINDS.get(kind);
  return !shape || Object.values(shape).some((c) => c.replace(/\?$/, "") === "text");
}

/** why a kind and its value are not the trail's, or "" (pure but for the switch). A kind of another family is not
 *  looked at, nor a checked one with the ways' switch off (`on`: the ways' own writer asks with it on, always). An erased
 *  event's value is gone: its name is checked, and that it is a kind whose content may be erased */
export function kindError(kind: string, value: unknown, erased = false, on = waysOn()): string {
  const family = familyOf(kind);
  // a fact of an unchecked family (a role event, a way file) that comes erased is not taken: it was never this Sol's
  // to lose (#987's seventeenth review)
  if (erased && FACTS.includes(kind)) return `${kind} is a fact, and a fact is never erased`;
  if (!CHECKED.includes(family)) return "";
  if (erased && !erasable(kind)) return `${kind} is a fact, and a fact is never erased`;   // switch or not, as on the cloud
  if (!on) return "";   // the ways' switch off: their kinds are any kinds (#1105)
  const shape = TEAM_KINDS.get(kind);
  if (!shape) return `${kind} is not a kind the team trail takes`;
  if (erased) return "";   // its name has a row, and it is not a fact (above)
  return fitsShape(kind, family, shape, value) ?? "";
}

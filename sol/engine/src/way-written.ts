// Cowork ways (docs/cowork-ways-2026-11-10/reports/step4-plan.md §5, §6): what a way's writer hands back, the same for
// a team's trail (team/v3/way-writer.ts) and a person's own log (way-own.ts). Pure; nothing of Cowork v3.
import type { Act } from "./way/moves.js";
import type { Ping } from "./way/triggers.js";
import { isObj, type Draft } from "./way/types.js";

/** what was written: each event's id, kind and item in order, and whether every draft was */
export type Wrote = { written: { id: string; kind: string; item: string }[]; whole: boolean; error?: string };
/** the acts whose draft was written, each with that event's id, and every draft that follows from it too (a move's
 *  fields: an act for a field never written would run on a value no book holds, grade16 N1): a move written is folded
 *  everywhere, so its act is owed whether the rest was written or not */
export const owed = (acts: readonly Act[], drafts: readonly Draft[], w: Wrote): (Act & { because: string })[] =>
  acts.flatMap((a) => (w.written[a.after] && drafts.every((d, i) => d.cause !== a.after || i < w.written.length) ? [{ ...a, because: w.written[a.after].id }] : []));
/** the pings whose way.fired was written (the same trigger, thing and tick) */
export const sent = (pings: readonly Ping[], drafts: readonly Draft[], w: Wrote): Ping[] => pings.filter((x) =>
  drafts.slice(0, w.written.length).some((d) => d.kind === "way.fired" && isObj(d.value) && d.value.trigger === x.trigger && d.value.thing === x.thing && d.value.tick === x.tick));
export { slotsOf } from "./way/notice.js";

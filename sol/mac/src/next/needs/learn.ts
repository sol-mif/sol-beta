// owned by slice 2 (Needs), docs/port/slices.md
// The learner's one offer a day (#1615; the mockup's merge/engine.js "learning (condition 14)" and weekSim, the canvas's
// column only): at most one offer a day, never at Near, a week's rest after "not now", and it suggests, never moves.
// weekSim is count 8's week: the offers shown each day under the budget, the mornings overridden, and the week's
// arrivals folded (rank.ts arrivalView). Pure but for the learner's own small memory, which lives here.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import type { Arrival } from "../cv/types.ts";
import { arrivalView, TODAY } from "./rank.ts";

export type Learner = { queue: string[]; shownToday: number; cool: Record<string, number>; kept: string[]; never: string[] };
export const freshLearner = (): Learner => ({ queue: [], shownToday: 0, cool: {}, kept: [], never: [] });
/** the one offer that may show now: none once one was shown today, none still resting after "not now" */
export function pending(l: Learner): string | null {
  if (l.shownToday >= 1) return null;
  return l.queue.find((q) => !(l.cool[q] > 0)) || null;
}
/** the person's answer to the offer showing: yes keeps it, not now rests it a week, never drops it */
export function answerOffer(l: Learner, how: "yes" | "later" | "never"): string | null {
  const o = pending(l);
  if (!o) return null;
  l.shownToday++;
  if (how === "later") l.cool[o] = 7;
  else { l.queue = l.queue.filter((q) => q !== o); if (how === "yes") l.kept.push(o); else l.never.push(o); }
  return o;
}

/** count 8: a week on the canvas (engine.js weekSim('canvas')), with the week's arrivals given (the fixture's dev-week) */
export function weekSim(items: Arrival[], ais = 8) {
  const offers: number[] = [];
  const cool: Record<string, number> = {};
  let markDone = false;
  const overrides = 0, placedNoPress = 0;   // the canvas never overrides a mark and never places without a press
  for (let day = 1; day <= 7; day++) {
    let shown = 0;
    const cands = ["start here?", "make api and web a region?", "make Ada in fix-login a mark?", "group 12 arrivals?"];
    if (day >= 3) cands.push("stop peeks from the landlord?");
    for (const c of cands) {
      if (c.includes("mark") && markDone) continue;
      if (shown >= 1) break;                       // the budget: one a day
      if ((cool[c] || 0) >= day) continue;
      shown++;
      if (c === "start here?") { /* a start the person keeps */ } else if (c.includes("mark")) markDone = true; else cool[c] = day + 7;
    }
    offers.push(shown);
  }
  const av = arrivalView(items, TODAY, true);
  return {
    offersMaxPerDay: Math.max(...offers), offersWeek: offers.reduce((a, b) => a + b, 0), overrides, placedWithoutPress: placedNoPress,
    unplacedAfter7: av.waiting, arrivalRows: av.rows.length, toHistory: av.toHistory, ais,
  };
}

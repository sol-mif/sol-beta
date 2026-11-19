// Cowork ways, step 4b (docs/cowork-ways-2026-11-10/reports/step4-plan.md §4): a team's ways run with the ways' switch
// (../../way-switch.ts, SOL_COWORK_WAYS, on unless it says off, #691) and Cowork v3's both on. This file imports nothing of the ways, so asking
// it loads none of them.
import { coworkV3 } from "../../settings.js";
import { waysOn } from "../../way-switch.js";
export { WAYS_ENV, waysOn } from "../../way-switch.js";

/** whether a team's ways run on this Sol: the ways' switch and Cowork v3's both on */
export const teamWaysOn = (): boolean => waysOn() && coworkV3();

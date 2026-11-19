// Agents' meta (#1327, pass 2): every number the meta uses, in one place. The first six are the design's (decided by
// Marco 2026-11-16, "The meta (designed blind)"); they are first guesses, to be measured on testers' traces. The rest
// are the stated defaults the design leaves to the build, each said where it is used. No number here comes from any
// one person's Sol.

/** recurs: this many traces of one job ... */
export const RECUR_TRACES = 3;
/** ... inside this many days (counted in time and across places) */
export const RECUR_DAYS = 90;
/** costs: a date it must meet, or this many minutes of the person's own per time */
export const COST_MINUTES = 5;
/** kinds: siblings whose shapes overlap at least this much (the overlap coefficient, |A∩B| / min(|A|,|B|), so a
 *  sibling that holds all of the others' and more is not punished for the extra) are asked about at all */
export const SHAPE_MIN = 0.5;
/** Jev: at or over, the same (job, kind, fix) */
export const JEV_SAME = 0.7;
/** Jev: at or over (and under JEV_SAME), half: a kind asks, a job counts half and never offers alone */
export const JEV_HALF = 0.45;

/** "Not now": the offer comes back after this many more traces (the design's "3 more traces") */
export const NOT_NOW_MORE = RECUR_TRACES;
/** a lead time with no history at all, in the place or in the job's other places: the day before (stated default) */
export const DEFAULT_LEAD_DAYS = 1;
/** a date trigger fires at the hour the person did it before; with no history, at this hour (stated default) */
export const DEFAULT_HOUR = 9;
/** Jev's budget per call, as the other Jev clients (whereJev.ts, doneJev.ts) */
export const JEV_BUDGET_MS = 4000;
/** Jev questions in flight at once, never unbounded (jev.ts inOrder: groupRules, kindsOf; stated default) */
export const JEV_AT_ONCE = 4;
/** a late look that Jev could not answer (null) is not started again by agents.list for the same rule set until this
 *  long has passed, so a face re-reading the list never loops on it (stated default) */
export const LOOK_AGAIN_MS = 10 * 60_000;

export const DAY_MS = 86_400_000;

// The calm floor (Marco, 2026-11-17, calm.html): first guesses too, each said where it is used.
/** the keeper: a rule stopped at the same sign-in this many runs in a row is held until the person signs in */
export const STUCK_RUNS = 3;
/** the keeper: a rule whose runs over this many days made nothing rests this many days (only once the person has met) */
export const IDLE_DAYS = 7;
/** an ask's rank (rule 5): each agent it frees counts this much ... */
export const RANK_FREED = 2;
/** ... a rule it holds back that runs within DUE_MS counts this much (and each whole day of its age counts one) */
export const RANK_DUE = 3;
export const DUE_MS = DAY_MS;
/** the asks under "Then", after the one in front; the rest read "N more" */
export const QUEUED = 3;
/** at most this many agents stand as cards (and rows in the side); past it, shelves by place (rule 7) */
export const CAST = 7;
/** a role line's most words (rule 10) */
export const ROLE_WORDS = 12;

/** the band of a Jev score: same · half · different */
export const bandOf = (p: number): "same" | "half" | "different" => (p >= JEV_SAME ? "same" : p >= JEV_HALF ? "half" : "different");

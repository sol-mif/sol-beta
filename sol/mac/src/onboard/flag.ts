// The one onboarding is the default (#1223): no switch. Who meets it is which.ts's one rule.
import { isNew } from "./which";

/** the one onboarding is wanted now: a new person, the app with no code yet, or the link asks again */
export function oneWanted(): boolean {
  try { return isNew(localStorage, location.search); } catch { return false; }
}
/** shown again from here: Settings › me, or Home with no record yet */
export const againHref = "?onboard=again";

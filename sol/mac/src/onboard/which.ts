// Who meets the one onboarding, and when Home is drawn (#1088, #1223). Since #1223 it is the default: there is no switch,
// no first run and no folders' Home beside it. A person is new when nothing of Sol is kept in this window's profile (no
// Home made, no mode picked, no first run from before), or when the app opens with no code yet (lib.rs shows
// `?firstrun=1`, and the onboarding runs the install, install.ts); `?onboard=again` shows it once more (Settings › me,
// Home's "make my Home"). A pop-out window (`?work=`) is never new. Home is the record's Home (OneHome), drawn under the
// onboarding's stage only from the landing on, so its folders' boxes are there for the glide (handover.ts).
export const DONE_KEY = "sol.onboarding.one.done";   // the Home is made (record.ts re-exports it)
/** what an earlier profile kept: a person with any of these has used Sol before and is not met by the onboarding again */
const KEPT = [DONE_KEY, "sol.firstrun", "sol.mode", "sol.home.open"];

/** is the one onboarding wanted at this load */
export function isNew(kv: Pick<Storage, "getItem">, search: string): boolean {
  const q = new URLSearchParams(search);
  if (q.has("work")) return false;
  if (q.get("onboard") === "again" || q.has("firstrun")) return true;
  try { return KEPT.every((k) => !kv.getItem(k)); } catch { return false; }
}

/** Home is drawn: always, except under the onboarding's stage before its landing */
export const homeShown = (s: { onboarding: boolean; landing: boolean }): boolean => !s.onboarding || s.landing;

/** the landing's mark: the Home is made (its date) */
export function landKeys(kv: Pick<Storage, "setItem">, built: string): void {
  kv.setItem(DONE_KEY, built);
}

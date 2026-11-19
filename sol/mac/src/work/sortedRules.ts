// Build's sidebar, sorted (#1016), the rule as code. Pure, so it is tested (src/sorted.test.ts); work/sorted.ts holds the
// switch, WorkSidebar.tsx draws it. The rule in one sentence: a folder inside your Home is Home's, every other folder is
// Build's, and a code project inside a Home folder is both (Build lists it, wearing its area's name; Home lists it too).
// The engine says where each folder sits (engine/src/work/place.ts); nothing here moves or hides anything on the disk.
//
// Under load the side stays short by three folds, each with its count and each opened by a click or found by search:
// Home's folders (one fold at the bottom of Build), quiet folders (nothing in two weeks), and a session's own sessions
// past the first few (the ones another session started).

export type Placed = { path: string; place?: "home" | "both"; area?: string; added?: boolean };

export const DAY = 86_400_000;
/** a Build folder with nothing in this long, nothing running, waiting or pinned in it, folds into "quiet" */
export const QUIET = 14 * DAY;
/** the sessions another session started that show under it before "n more" (the live ones always show) */
export const KIDS = 3;

/** whether a folder shows in Build's own list: Build's, and the code projects that sit in Home */
export const isBuild = (p: Placed) => p.place !== "home";

/** the folders split three ways: build (listed as before), quiet (Build's, idle two weeks: one fold), home (Home's: one
 *  fold). `latest` is the folder's last activity, `live` whether anything in it runs, waits or is pinned. Order is kept */
export function sortFolders<P extends Placed>(folders: P[], latest: (p: P) => number, live: (p: P) => boolean, now = Date.now()) {
  const build: P[] = [], quiet: P[] = [], home: P[] = [];
  for (const p of folders) {
    if (!isBuild(p)) home.push(p);
    else if (!p.added && !live(p) && now - latest(p) > QUIET) quiet.push(p);
    else build.push(p);
  }
  return { build, quiet, home };
}

/** a session's own sessions (another session started them): the live ones and the newest, up to KIDS, show; the rest
 *  wait behind "n more". Newest first, as given */
export function kidsShown<S>(kids: S[], live: (s: S) => boolean, open: boolean): { shown: S[]; hidden: number } {
  if (open || kids.length <= KIDS) return { shown: kids, hidden: 0 };
  const keep = new Set<S>(kids.filter(live));
  for (const s of kids) { if (keep.size >= KIDS) break; keep.add(s); }
  const shown = kids.filter((s) => keep.has(s));
  return { shown, hidden: kids.length - shown.length };
}

/** the mark on a session that started others: short on the row ("↳ 12"), whole on hover ("12 started · 1 at work") */
export function kidsMark<S>(kids: S[], live: (s: S) => boolean): { short: string; long: string } {
  if (!kids.length) return { short: "", long: "" };
  const on = kids.filter(live).length;
  return { short: `↳ ${kids.length}`, long: `${kids.length} started${on ? ` · ${on} at work` : ""}` };
}

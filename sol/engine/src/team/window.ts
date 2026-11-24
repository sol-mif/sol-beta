// The window older than its engine (#1824, ticket K of BR1). A Sol.app from before BR1 (dev-20261120-1820 and earlier)
// carries its face inside it and has no updater of its own: Update brings its engine to the new release, and the window
// goes on showing the face it was built with. Such a tester has to download Sol.app once more; after that the app
// updates itself (J1–J4). The engine sees it, never the face: the running Sol.app's on the disk (ps, then its
// Info.plist and its face binary), on a beta Sol only (a developer's own build is no tester's).
// Old: a release's version stamp (J2, `0.YYYYMMDD.HMM`) from before FLOOR's day, or no stamp and a face binary built
// before FLOOR (dev-20261120-1820's was built 2026-11-20T23:36Z; nothing went to sol-beta between it and BR1).
// What follows (ship.ts, wire.ts, settings.ts, index.ts): the offer the old face already shows (team.stable, behind)
// carries one line with the download, Update answers with the same download and moves nothing, and the new face's
// switch stays off, since the old app's copy of the new face has no line at all. A fresh app clears all three.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);

export const FRESH_DOWNLOAD = "https://github.com/sol-mif/sol-beta/releases/latest/download/Sol-mac.zip";
// The old face's line is one row that clips at its end (ship.css .sline .what: nowrap, ellipsis) in a 900px window: the
// words come first and stay short. The line names the release page (it fits; Sol-mac.zip is its download), Update the zip
/** the line the old face shows after its "a new stable is out", in bold */
export const OLD_WINDOW_LINE = "· download Sol.app again: github.com/sol-mif/sol-beta/releases/latest";
/** what Update says on that line (the old face: "could not update: <this>") */
export const OLD_WINDOW_UPDATE = `download Sol.app again, once: ${FRESH_DOWNLOAD}`;
/** the offer that is the line (ship.ts offerShown): its own sha, so a Later on a release never hides it, nor notify's banner shows it */
export const OLD_WINDOW_SHA = createHash("sha1").update("sol: this Sol.app is older than BR1").digest("hex");
const FLOOR = "2026-11-22T00:00:00Z", FLOOR_DAY = 20261122;
const ID = "com.marcol04.sol";

export type App = { version: string; builtMs: number };
/** whether this app is older than BR1's (pure) */
export function appOld(a: App): boolean {
  const stamp = /^0\.(\d{8})\.\d{1,4}$/.exec(a.version.trim());
  return stamp ? Number(stamp[1]) < FLOOR_DAY : a.builtMs < Date.parse(FLOOR);
}
/** the Sol.app folders running, from `ps -axo comm=` (pure): the face binary's full path, wherever the app was opened */
export function appsIn(ps: string): string[] {
  return ps.split("\n").map((l) => /^(\/.*\.app)\/Contents\/MacOS\/face$/.exec(l.trim())?.[1]).filter((x): x is string => !!x);
}
const plistString = (xml: string, key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1];
/** a Sol.app's version and its face binary's build time; null when it is not Sol's or not readable */
export function readApp(app: string): App | null {
  try {
    const xml = readFileSync(join(app, "Contents", "Info.plist"), "utf8");
    if (plistString(xml, "CFBundleIdentifier") !== ID) return null;
    return { version: plistString(xml, "CFBundleShortVersionString") ?? "", builtMs: statSync(join(app, "Contents", "MacOS", "face")).mtimeMs };
  } catch { return null; }
}

export type WindowDeps = { channel: () => Promise<string>; ps?: () => Promise<string> };
const psNow = () => run("ps", ["-axo", "comm="], { timeout: 5000, maxBuffer: 4 << 20 }).then((r) => r.stdout);

let old = false, last: WindowDeps | null = null;
const hearers: ((old: boolean) => void)[] = [];
/** an old Sol.app runs on this beta Sol now (as last looked) */
export const windowOld = () => old;
/** told when it changes (ship.ts: the offer; index.ts: the settings, for the switch) */
export function onWindow(f: (old: boolean) => void) { hearers.push(f); }
/** look again: on a beta Sol, does any running Sol.app predate BR1 */
export async function checkWindow(d: WindowDeps): Promise<boolean> {
  last = d;
  let now = false;
  try {
    if (await d.channel() === "beta" && (d.ps || process.platform === "darwin")) {
      now = appsIn(await (d.ps ?? psNow)()).some((a) => { const r = readApp(a); return !!r && appOld(r); });
    }
  } catch { return old; }   // ps or the channel did not answer: what was seen stands until the next look
  if (now !== old) {
    old = now;
    for (const f of hearers) { try { f(now); } catch { /* one hearer's trouble is never the look's */ } }
  }
  return now;
}

/** look again as last time (a face that connects asks, so it never waits half a minute); nothing before the first look */
export const lookAgain = async () => (last ? checkWindow(last) : old);

let clock: NodeJS.Timeout | null = null;
/** look now and every half minute (an app opened, or a fresh one downloaded, is seen within that) */
export function startWindow(d: WindowDeps) {
  void checkWindow(d);
  if (clock) clearInterval(clock);
  clock = setInterval(() => void checkWindow(d), 30_000).unref();
}

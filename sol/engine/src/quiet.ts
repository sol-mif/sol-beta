// Quiet (#1293): one switch that keeps this engine from acting as its person outside this Mac. A second copy of Sol on
// the same Mac (a side checkout opened to look at, the nightly catch-up's engines, the first-timer's), a test engine:
// each runs as the person who is signed in here, so without the switch each would say it is online, count usage, open
// the night's review, update itself and write to GitHub, as if it were the one Sol that person uses. Before this, each
// of those had its own variable (SOL_HUB, SOL_TRACK, SOL_NO_RENEW, SOL_TONIGHT, ...), the list was never complete, and
// every new outward feature could add one more.
//
// SOL_QUIET=1 (or on, true, yes) in the engine's environment or sol/engine/.env. Quiet means:
//   no self-update      the update check (team/ship.ts) and renew on build (renew.ts)
//   no usage sent       track (index.ts), the error counts
//   no relay            no presence, pings, talk; no hub asked or written (team/relay.ts, team/settings.ts sharedHub)
//   no timers that act  the night tick (review, hand-in, send-back sessions), the folder agents' clock
//   no writes outward   every gh call that writes (quietGh), every git push (quietPush), every fetch that sends
//                       (quietFetch): each throws QuietError, so the caller's own error path says it
// Reads stay: a block's source, a PR's view, the model's download, so a quiet copy still shows things.
//
// Every outward call in src/ asks this file first or sits on the allow-list in test/quiet.test.ts with its reason; that
// test scans the source and is red on a new one that does neither. Adding an outward feature: ask isQuiet() (or call
// quietGh, quietPush, quietFetch) before it.

/** is this engine quiet: SOL_QUIET says so. Read at each ask, never cached (the engine reads .env after its imports) */
export const isQuiet = (env: NodeJS.ProcessEnv = process.env): boolean => /^(1|on|true|yes)$/i.test((env.SOL_QUIET ?? "").trim());

/** what a quiet engine refuses with: the caller's own error path says it, nothing outward happened */
export class QuietError extends Error {
  constructor(what: string) { super(`quiet (SOL_QUIET): ${what} is not done from this Sol`); this.name = "QuietError"; }
}

// gh subcommands that only read; anything else under pr, issue, release, repo, label, gist, run, workflow writes
const GH_READS = new Set(["view", "list", "status", "diff", "checks", "search", "checkout", "download", "watch"]);
const GH_TOP_READS = new Set(["auth", "search", "browse", "help", "version", "--version", "completion", "config", "extension", "alias", "status"]);

/** does this gh call write to GitHub (pure). `gh api` writes with a method other than GET or with a field (-f, -F,
 *  --field, --raw-field, --input: gh then posts); `gh <noun> <verb>` writes unless its verb only reads. `gh auth` is the
 *  person's own sign-in on this Mac, not a write to GitHub */
export function ghWrites(args: readonly string[]): boolean {
  const a = args.filter((x) => typeof x === "string");
  // the first word that is not a flag or a flag's value (-R o/r, --repo o/r before the noun)
  const i = a.findIndex((x, k) => !x.startsWith("-") && !/^(-R|--repo|--hostname)$/.test(a[k - 1] ?? ""));
  if (i < 0) return false;
  const top = a[i];
  if (top === "api") {
    let method = "", field = false;
    for (let j = i + 1; j < a.length; j++) {
      const x = a[j];
      const m = /^(?:-X|--method=)(.+)$/.exec(x);
      if (x === "-X" || x === "--method") method = a[++j] ?? "";
      else if (m) method = m[1];
      else if (/^(-f|-F|--field|--raw-field|--input)(=|$)/.test(x) || /^-[fF]./.test(x)) field = true;
    }
    method = method.toUpperCase();
    // graphql is always a POST: it writes only when its query is a mutation; a query on stdin (--input) is unseen here,
    // so it is counted as one that writes (#1347)
    if (a[i + 1] === "graphql" && (!method || method === "POST")) return a.some((x) => /\bmutation\b/.test(x) || /^--input(=|$)/.test(x));
    return method ? method !== "GET" : field;   // a field with -X GET is a query string, not a post
  }
  if (GH_TOP_READS.has(top)) return false;
  const verb = a.slice(i + 1).find((x) => !x.startsWith("-"));
  return verb !== undefined && !GH_READS.has(verb);
}

/** before a gh call: refuse a write when quiet (throws QuietError); a read always goes */
export function quietGh(args: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  if (isQuiet(env) && ghWrites(args)) throw new QuietError(`gh ${args.slice(0, 2).join(" ")}`);
}

/** before a git push: refuse it when quiet (throws QuietError) */
export function quietPush(env: NodeJS.ProcessEnv = process.env): void {
  if (isQuiet(env)) throw new QuietError("git push");
}

/** is this address this machine (pure): localhost, 127.x, ::1 */
export function isLocal(url: string): boolean {
  try { const h = new URL(url).hostname.replace(/^\[|\]$/g, ""); return h === "localhost" || h === "::1" || /^127\./.test(h); } catch { return false; }
}

/** before a fetch that sends (a POST, a DELETE, a hub ask as the person): refuse it when quiet unless it stays on this
 *  machine (throws QuietError) */
export function quietFetch(url: string, env: NodeJS.ProcessEnv = process.env): void {
  if (isQuiet(env) && !isLocal(url)) throw new QuietError(`a call to ${(() => { try { return new URL(url).host; } catch { return "another machine"; } })()}`);
}

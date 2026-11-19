// The seam for data storage (#1320; seams/README.md). Where the data Sol keeps off this Mac goes: today, the beta's
// usage counts (track.ts, one file a day). Every caller asks dataStore(), so what is behind it (today: the team's hub,
// POST /relay/track, or SOL_TRACK_URL) can be swapped for another store by one file, with track.ts and the rest of Sol
// unchanged. What is written, what is counted, the consent and the 90 days on the Mac stay track.ts's.
// Behind it now (#1350): the hub as before, and beside it Sol's Supabase project (supabase/functions/track), which takes
// the same POST and keeps the day's file in its storage and the day's counts in its database. Both get every day; a
// day is done when both kept it. SOL_DATA=hub is the hub alone again (index.ts), SOL_DATA=supabase Supabase alone.
import { postTo, type Put } from "../track.js";

export type { Put };

export interface DataStore {
  /** where one day of usage goes: a put, or null when it has nowhere to go (nothing is sent; the days age out) */
  usage(): Put | null;
}

/** today's: one POST a day's file to an address (index.ts: the team's hub's /relay/track, SOL_TRACK_URL, or none). The
 *  sign-in's token the sender adds (#1607) is for Supabase alone: the hub takes no ticket on this door and is not handed one */
export const hubStore = (where: () => string | null, f: typeof fetch = fetch): DataStore => ({
  usage: () => { const u = where(); if (!u) return null; const p = postTo(u, f); return (h, body) => { const { authorization: _token, ...rest } = h; return p(rest, body); }; },
});

/** Sol's Supabase project's door for usage (#1350); not a secret: it takes only what the hub takes, checked the same */
export const SUPABASE_USAGE = "https://fqoedryzkczvywfrfomo.supabase.co/functions/v1/track";

/** a put's answer as the sender reads it (track.ts sendNow): 0 kept, 1 refused for good, 2 ask again later */
const outcome = (s: number) => ((s >= 200 && s < 300) || s === 409 ? 0 : s >= 400 && s < 500 && s !== 429 ? 1 : 2);

/** two stores at once: each day goes to both, and the answer is the worse of the two, so a day one store missed is
 *  asked again and a day either refuses for good is not asked again. A day one store kept is not posted to it again
 *  while the other is retried (kept: by the file's SHA-256, in memory), so a store that is down for days does not use
 *  up the healthy one's posts a day; after a restart the healthy one answers 409 once */
export const bothStores = (a: DataStore, b: DataStore): DataStore => {
  const kept = [new Set<string>(), new Set<string>()];
  const once = (put: Put, i: number): Put => async (headers, body) => {
    const sha = headers["x-sol-sha256"] ?? "";
    if (sha && kept[i].has(sha)) return 409;
    const s = await put(headers, body);
    if (sha && outcome(s) === 0) { if (kept[i].size > 2000) kept[i].clear(); kept[i].add(sha); }
    return s;
  };
  return {
    usage: () => {
      const pa = a.usage(), pb = b.usage();
      if (!pa || !pb) return pa ?? pb;
      const x1 = once(pa, 0), y1 = once(pb, 1);
      return async (headers, body) => {
        const [x, y] = await Promise.all([x1(headers, body), y1(headers, body)]);
        return outcome(y) > outcome(x) ? y : x;
      };
    },
  };
};

let current: DataStore | null = null;
/** the store in use; before index.ts names one, nowhere */
export const dataStore = (): DataStore => (current ??= hubStore(() => null));
/** another store behind the seam (index.ts at start, the tests, later another backend); null is nowhere again */
export const useDataStore = (s: DataStore | null) => { current = s; };

// On the team (#1541 review): whether this Sol opens the team's Cowork shell or the person's own groups home. Never a
// name a file says: a room's `org` is typed into team.json, anyone can type one, and a person who really is in some other
// org is still not on our team (gate one q1). So the only org asked is the team's own, the owner of the team's
// development repository (errcount.ts DEV_REPOS), and the answer is GitHub's, asked as this machine's own gh sign-in:
// `gh api user/memberships/orgs/<org>`, whose `state` is "active" only for a member. The login is the token's own,
// never the one team.json names, so a team.json that claims another person's login proves nothing
// (orgs/<org>/members/<login> would, for a public member, answer yes to anyone).
// A failed read, no gh, an invitation not yet taken: not on the team, so the person gets their own home, where their AI
// asks first. Remembered 10 minutes, a no as long as a yes, so a reconnect does not ask GitHub again.
import { runGh } from "./record/github.js";
import { DEV_REPOS } from "../errcount.js";

const ORG = /^[A-Za-z0-9-]{1,39}$/;
const TTL = 10 * 60_000;

export type OnTeamDeps = { gh: (args: string[]) => Promise<string>; now: () => number };

/** the orgs worth asking (pure): every GitHub room's, each once, any case, a name GitHub could hold */
export function orgsOf(rooms: { org?: string; provider?: string }[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rooms) {
    const o = (r.org ?? "").trim();
    if (o && ORG.test(o) && (r.provider ?? "github") === "github" && !seen.has(o.toLowerCase())) seen.set(o.toLowerCase(), o);
  }
  return [...seen.values()];
}

/** whether GitHub's answer says an active member (pure) */
export const activeIn = (out: string) => { try { return (JSON.parse(out) as { state?: unknown }).state === "active"; } catch { return false; } };

export function onTeamOf(d: OnTeamDeps) {
  const known = new Map<string, { yes: boolean; until: number }>();
  const asking = new Map<string, Promise<boolean>>();
  const ask = (org: string): Promise<boolean> => {
    const k = known.get(org.toLowerCase());
    if (k && k.until > d.now()) return Promise.resolve(k.yes);
    let p = asking.get(org.toLowerCase());
    if (!p) {
      p = d.gh(["api", `user/memberships/orgs/${org}`]).then(activeIn, () => false)
        .then((yes) => { known.set(org.toLowerCase(), { yes, until: d.now() + TTL }); return yes; })
        .finally(() => asking.delete(org.toLowerCase()));
      asking.set(org.toLowerCase(), p);
    }
    return p;
  };
  /** on the team: an active member of the org of any GitHub room I am in */
  const check = async (rooms: { org?: string; provider?: string }[]): Promise<boolean> => {
    for (const org of orgsOf(rooms)) if (await ask(org)) return true;
    return false;
  };
  /** the answer as known now, with no wait: null until every org in play has been asked once */
  const now = (rooms: { org?: string; provider?: string }[]): boolean | null => {
    const orgs = orgsOf(rooms);
    let unknown = false;
    for (const org of orgs) {
      const k = known.get(org.toLowerCase());
      if (k?.yes && k.until > d.now()) return true;
      if (!k || k.until <= d.now()) unknown = true;
    }
    return unknown ? null : false;
  };
  return { check, now };
}

/** the team's own org (pure): the owner of the first development repository, the one the team works in */
export const TEAM_ORG = [...DEV_REPOS][0].split("/")[0];
const TEAM = [{ org: TEAM_ORG, provider: "github" }];
const mine = onTeamOf({ gh: (args) => runGh(args), now: Date.now });
/** this engine's: a member of the team's own org, GitHub asked as gh's own sign-in; no room's org is ever asked */
export const onTeamCheck = () => mine.check(TEAM);
export const onTeamNow = () => mine.now(TEAM);

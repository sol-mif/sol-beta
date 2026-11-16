// Agents as members (#435, D3 of #413; PROTOCOL round 83). Each person's agent is a member of the project through its
// person: it shows on the roster as `<login>'s agent`, beside its human and drawn apart from them, and everything it
// writes (a page, a template, a page made from one, a poll it asks, a thing, the goal) is signed that way (`agent: true` with
// `by` its person's login, and note.ts `sign()`). An agent never holds a person's rights: it never votes, so a settings
// change still needs the people the settings name (#428), each agreeing in their own window; and what an agent writes
// to the project in use (every room_* write, work/wire.ts `memberNo`) passes the members check here first, on its person.
// The members check: a project whose members can be read (a cloud group's, a GitHub org's) lets in only its members, on
// a list at most a minute old (members.ts `strict`, #437), and a read that fails keeps it shut, never an older list.
// A project that names no org or cloud group has no list to check: there the record itself decides (a write to it is
// refused by GitHub or the cloud for someone not let in), as it did before.
// Pure but for the members read, handed in once by wire.ts (`useMembersRead`).
import { sign } from "./note.js";

export const agentName = (login: string) => `${login || "someone"}'s agent`;
/** "frank's agent" back to "frank" (pure); "" for a name that is not an agent's */
export const agentOfName = (name: string) => { const m = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})'s agent$/.exec(name); return m ? m[1] : ""; };
/** who wrote something, as people read it: "frank" or "frank's agent" */
export const signed = (by: string, agent?: boolean) => (agent ? agentName(by) : by || "someone");
/** the line that ends what an agent writes where words are kept (a commit, a comment) */
export const agentSign = sign;

export type Actor = { login: string; agent?: boolean };
/** what the engine knows of a project's members: none to know (no org, no cloud group), or the list read (null: the read
 *  failed or came back empty, so nobody is let in) */
export type MembersRead = { source: false } | { source: true; list: string[] | null };
export type MemberNo = { error: string; gate: "members" | "unknown" };

/** the members check (pure): may this person, or this person's agent, act in the project? */
export function memberGate(actor: Actor, read: MembersRead, verb = "write here"): { ok: true } | MemberNo {
  if (!read.source) return { ok: true };
  const who = actor.login.trim().toLowerCase(), name = actor.agent ? agentName(actor.login) : actor.login || "this Sol's person";
  if (!read.list?.length) return { error: `Sol could not tell who this project's members are just now (GitHub or the cloud did not answer), so ${name} may not ${verb}; try again in a minute`, gate: "unknown" };
  if (!who || !read.list.some((m) => m.toLowerCase() === who)) {
    return { error: actor.agent ? `${name} may ${verb} only as a member's agent, and ${actor.login || "its person"} is not one of this project's members` : `${name} is not one of this project's members`, gate: "members" };
  }
  return { ok: true };
}

/** what only a person does (pure): agree to a settings change, vote. An agent is refused in words, never counted */
export function humanOnly(actor: Actor, what: string): string | null {
  return actor.agent ? `${agentName(actor.login)} may not ${what}: only people agree, each in their own window, and a settings change waits for the people the settings name` : null;
}

// ---- on the roster ----

export type RosterLike = { who: string; agent: boolean; state: string; session?: { title: string }; since: number; machine?: string };
/** a person's agent as the roster shows it: its name, its human, and whether it is at work for them now */
export type AgentMember = { name: string; of: string; working: boolean; session?: string; since?: number };

/** each member's agent (pure), in the members' order, me first: working when its human's worker is (the roster's
 *  "working", a session running for them) or a roster entry of theirs is an agent's. Only members get one: the roster's
 *  people who are not on the members list (a guest seen on the relay) have none, unless the project has no list */
export function agentsOf(members: string[], roster: RosterLike[], me = ""): AgentMember[] {
  const seen = new Set<string>(), out: AgentMember[] = [];
  const list = members.length ? members : roster.filter((r) => !r.agent).map((r) => r.who);
  for (const who of [...(me ? [me] : []), ...list]) {
    const k = who.toLowerCase();
    if (!who || seen.has(k)) continue;
    if (who !== me && members.length && !members.some((m) => m.toLowerCase() === k)) continue;
    seen.add(k);
    const mine = roster.filter((r) => r.who.toLowerCase() === k);
    const at = mine.filter((r) => r.agent || r.state === "working").sort((a, b) => b.since - a.since)[0];
    out.push({ name: agentName(who), of: who, working: !!at, ...(at?.session?.title ? { session: at.session.title } : {}), ...(at ? { since: at.since } : {}) });
  }
  return out;
}

// ---- the members read, wired once ----

let reader: ((strict: boolean) => Promise<MembersRead>) | null = null;
/** wire.ts hands in how the project in use's members are read (a cloud group's, a GitHub org's) */
export function useMembersRead(f: ((strict: boolean) => Promise<MembersRead>) | null) { reader = f; }
/** the project in use's members, strict (a minute old at most, null on a failed read); nothing wired: no list to check */
export async function membersNow(strict = true): Promise<MembersRead> {
  if (!reader) return { source: false };
  return reader(strict).catch(() => ({ source: true, list: null }) as MembersRead);
}
/** the members check on the project in use, for this Sol's person or their agent: "" when they may, else the words */
export async function memberRefusal(actor: Actor, verb = "write here"): Promise<string> {
  const g = memberGate(actor, await membersNow(true), verb);
  return "error" in g ? g.error : "";
}

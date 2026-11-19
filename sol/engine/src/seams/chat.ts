// The seam for group chat (#1320; seams/README.md). How a line said in a group's chat (team/talk.ts) goes out, how a
// teammate's line comes in, and where a thread's older lines are paged from. Every caller asks groupChat(), so what is
// behind it (today: the team relay, `talk` and `talk.history`, and the cloud's page route) can be swapped for another
// place (a group repository's Discussions, a backend of our own) by one file. The lines kept here, the threads, the
// attachments, the bridges and the seats' tool stay talk.ts's.
// Behind it (#1347, the plan in #229): a GitHub group's chat on its repository (discussions.ts); a cloud group's (the
// customers' coded rooms), and a repository whose Discussions are off, keep the relay's. SOL_CHAT=relay puts the relay
// back for every group. A teammate's line is heard on both while a group moves, so nothing said either way is lost.
import { sendRelay, onRelay, onCloud, hubHttp, hubTicket, type RelayMsg } from "../team/relay.js";
import { getTeam, activeRoom } from "../team/settings.js";
import { TALK_HISTORY } from "../hub/index.js";
import type { OlderDeps } from "../team/talk.js";
import { discussionsChat, type DiscussionsChat } from "./discussions.js";

export type { RelayMsg };

export interface GroupChat {
  /** one line to the group, as talk.ts says it (`{ thread, text, id, to?, file? }`); false when it could not go */
  say(line: Record<string, unknown>, agent: boolean): boolean;
  /** a teammate's line, as it came */
  hear(fn: (m: RelayMsg) => void): () => void;
  /** a thread's kept lines, given back on my hello */
  heardBack(fn: (m: RelayMsg) => void): () => void;
  /** where the group in use pages its older lines from, and my ticket there (talk.ts olderLines) */
  older(): OlderDeps;
  /** a person has the Agents' room open (#1417): a store read on a timer reads quicker for the next `ms`; a store that
   *  pushes its lines has nothing to do */
  quick?(ms: number): void;
}

/** today's: the team relay; older lines from the cloud the room meets on, when I am signed in there */
export const relayChat = (): GroupChat => ({
  say: (line, agent) => sendRelay("talk", line, agent),
  hear: (fn) => onRelay("talk", fn),
  heardBack: (fn) => onRelay(TALK_HISTORY, fn),
  older: () => ({ where: () => { const r = activeRoom(getTeam()); return r.code && onCloud() ? { hub: hubHttp(r.hub), code: r.code } : null; }, ticket: hubTicket }),
});

/** whether the relay is the chat for every group, whatever the group: SOL_CHAT=relay (read at each ask) */
export const relayOnly = (env: NodeJS.ProcessEnv = process.env) => (env.SOL_CHAT ?? "").trim().toLowerCase() === "relay";

/** the relay's or the repository's, per line: the group in use decides (#1347) */
export const switchedChat = (relay: GroupChat = relayChat(), gh: DiscussionsChat = discussionsChat(undefined, (l, a) => relay.say(l, a))): GroupChat => {
  const onGithub = () => !relayOnly() && gh.here();
  return {
    say: (line, agent) => (onGithub() ? gh.say(line, agent) : relay.say(line, agent)),
    hear: (fn) => { const a = relay.hear(fn), b = gh.hear(fn); return () => { a(); b(); }; },
    heardBack: (fn) => relay.heardBack(fn),
    // a repository's older lines are on its page, not paged here yet
    older: () => (onGithub() ? { where: () => null, ticket: async () => "" } : relay.older()),
    quick: (ms) => gh.quick(ms),   // the relay pushes its lines; the repository's are read on a timer (#1417)
  };
};

let current: GroupChat | null = null;
/** the group chat in use */
export const groupChat = (): GroupChat => (current ??= switchedChat());
/** another group chat behind the seam (the tests, later another backend); null is today's again */
export const useGroupChat = (c: GroupChat | null) => { current = c; };

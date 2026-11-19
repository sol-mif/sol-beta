// Home's world (#1093): the dock's lamps, read without becoming a Cowork face. team.hello marks the face as Cowork's and
// the engine then keeps the board in sync (GitHub calls every minute) for the life of the window; the world only wants
// who is on the team and whose agent works now, once per ask, from what the engine already holds.
import { getTeam } from "../team/settings.js";
import { relayRoster, hubLogin, onCloud } from "../team/relay.js";
import { teamMembers } from "../team/members.js";
import { agentsOf } from "../team/agents.js";

export function worldMates() {
  const s = getTeam(), login = onCloud(s) ? hubLogin(s) : s.me.login;
  return { me: { login }, members: teamMembers(), agents: agentsOf(teamMembers(), relayRoster(), login).map((a) => ({ of: a.of, working: !!a.working })) };
}

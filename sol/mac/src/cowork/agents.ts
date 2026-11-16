// Agents as members (#435, D3 of #413): each member's agent on the people strip, `<login>'s agent`, right after its human,
// joined to them by a hairline and drawn apart (the small ringed Sol, the name dimmer). The engine says who has one
// (team.state `agents`, from the project's members: engine team/agents.ts); here only the pure words. Pure: no React.
import type { AgentMember } from "./useTeam.ts";

/** a person's agent, by its human's login (case-blind); none when the engine named none */
export const agentFor = (list: AgentMember[] | undefined, who: string) => list?.find((a) => a.of.toLowerCase() === who.toLowerCase());
/** its one word on the strip: at work while a session runs for its human, else ready */
export const agentWord = (a: Pick<AgentMember, "working">) => (a.working ? "at work" : "ready");

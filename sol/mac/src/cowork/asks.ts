// Ask for a session (#335, the Cowork PRD §9.8; PROTOCOL.md round 113), the face's words: the card a teammate's ask
// makes on my bar (give · not now, and where what I give goes), the card that tells me what came of mine, and whether a
// person's page offers "ask for it". Pure, so the tests read the words with no engine and no page.

/** an ask waiting on my press, as the engine pushes it (team.asks) */
export type AskCard = { key: string; from: { login: string; agent: boolean }; session: string; title: string; at: number };
/** what came of an ask of mine (team.session.given), or of a give of mine that stopped (team.session.gave) */
export type Given = { key: string; login: string; id: string; title?: string; of?: number; lines?: number; done?: boolean; partial?: boolean; error?: string };   // partial: the pages stopped coming, the rest was lost

/** where what I give goes, said on the card and beside the setting (the PRD §7.3: said plainly) */
export const WHERE_IT_GOES = "what you give lands in their session on their Mac and goes to their AI";

/** the card's line: who asks, them or their agent, and for which session of mine */
export const askLine = (a: AskCard) => `${a.from.agent ? `${a.from.login}'s agent asks` : `${a.from.login} asks`} for your session ${a.title || "a group session"}`;

/** what came of my ask, in one line and a smaller one under it; null while there is nothing to say yet (pages still coming) */
export function givenLine(g: Given): { line: string; sub: string } | null {
  if (g.error) return { line: g.error, sub: g.login ? `giving to ${g.login}` : "" };
  const what = g.title || "a group session";
  if (g.of === 0) return { line: `${g.login} said not now`, sub: `to your ask for ${what}` };
  if (!g.done) return null;
  return { line: `${g.login} gave ${g.partial ? "part of " : ""}${what}`, sub: `${g.lines ?? 0} line${g.lines === 1 ? "" : "s"} · ask your agent in a group session to read it` };
}

/** does a person's page offer "ask for it" beside a session: someone else's room session, they did not turn giving off,
 *  and the group is in sight */
export const canAsk = (o: { mine: boolean; never?: boolean; quiet?: boolean; up: boolean; room: boolean }) => !o.mine && !o.never && !o.quiet && o.up && o.room;

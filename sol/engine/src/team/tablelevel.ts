// A table's level (#1541, gate one q2): how far my AI goes at one group's table, the room's own `level` in team.json
// (settings.ts Room), picked on the groups home's "my ai here". It decides two things, and nothing else reads it:
//   the mode of a session that works for the table (marked with its roomId: a hand taken there, a review, a session
//     started under it): "tells" (does, then tells) is acceptEdits, its edits made without a card; "does" (just does) is
//     bypassPermissions, nothing asks; absent is asks first ("default") on a Sol that is not on the team. On the team's
//     own Sol an absent level leaves the session on the person's own Work mode, as before: the team's shell has no level
//     to pick, so nothing there changes.
//   a hand-over to me at that table: at "tells" or "does" my AI takes it on its own (hand.ts heard), the session starting
//     in the table's mode, so nobody has to press take; asks first leaves the card for the person, as before.
// A session another person's words woke (#1151, the `woken` mark) is held to asks first whatever the level (runs.ts):
// the level is what I let my own AI do, never what I let someone else's words make it do.
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export type TableLevel = "tells" | "does";

/** the room that keeps a repository (pure): the first of mine whose repos name it, any case */
export function roomOfRepo<R extends { repos: string[] }>(rooms: R[], repo: string): R | undefined {
  const k = repo.toLowerCase();
  return rooms.find((r) => r.repos.some((x) => x.toLowerCase() === k));
}

/** a session's mode at a table (pure): the level's, asks first when none on a Sol not on the team, else null (the
 *  person's own Work mode stays) */
export function tableMode(level: string | undefined, onTeam: boolean): PermissionMode | null {
  if (level === "does") return "bypassPermissions";
  if (level === "tells") return "acceptEdits";
  return onTeam ? null : "default";
}

/** whether my AI takes a hand-over at the table without a press (pure): only at "tells" or "does" */
export const takesItself = (level: string | undefined): boolean => level === "tells" || level === "does";

/** whether a table's members may be asked who sent a hand (pure, #1654 review): only the table in use, kept in the
 *  org this Sol reads members of, on a hub that knows people by GitHub (gate "github": the hub asked GitHub who the
 *  token is, so the login it stamps is GitHub's). On a key-gated hub the login is the hello's own word: never trusted */
export function askableTable(r: { id: string; org: string; gate: string } | undefined, inUse: { id: string }, org: string): boolean {
  return !!r && r.id === inUse.id && !!r.org && r.org === org && r.gate === "github";
}

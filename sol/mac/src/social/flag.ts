// Social's switch as the face reads it (fr-31): the engine's `social.on` (SOL_SOCIAL wins there, settings.ts), off by
// default. In a dev build `?dev=social` turns it on for one load with pretend friends (like ?dev=team, cowork/useTeam.ts);
// outside a dev build the query is ignored, so a stray link can never turn it on in Sol.app.
export type SocialSetting = { on: boolean; useEverything: boolean };
// A build made to show Social (a separately named bundle for Isaac, 2026-11-13): VITE_SOCIAL=pretend bakes the switch on
// with the pretend friends, VITE_SOCIAL=on bakes it on alone. The normal build has neither, so off by default holds.
const BAKED: string = String((import.meta as { env?: Record<string, unknown> }).env?.VITE_SOCIAL ?? "");
export function socialOn(settings: unknown, search: string, dev: boolean, baked: string = BAKED): boolean {
  if (baked === "pretend" || baked === "on") return true;
  if (dev && new URLSearchParams(search).get("dev") === "social") return true;
  const s = (settings as { social?: Partial<SocialSetting> } | null | undefined)?.social;
  return s?.on === true;
}
export const pretendFriends = (search: string, dev: boolean, baked: string = BAKED) => baked === "pretend" || (dev && new URLSearchParams(search).get("dev") === "social");
export const useEverythingOn = (settings: unknown) => (settings as { social?: Partial<SocialSetting> } | null | undefined)?.social?.useEverything === true;
/** the spine's Social view: Social itself only with the switch on and an engine to talk to; else the empty view as it was */
export const socialViewKind = (on: boolean, hasEngine: boolean): "social" | "empty" => (on && hasEngine ? "social" : "empty");
/** the spine shows on its own switch, or because Social (its fourth view) is on; never in a popped-out window */
export const spineShows = (spineSet: boolean, social: boolean, solo: boolean): boolean => (spineSet || social) && !solo;

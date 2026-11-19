// The version switch's rules (#1295, VersionSwitch.tsx draws it): what is lit and what a press writes. Pure.
// product in the team's own Sol (#1427, Frank 2026-11-17 "A"): it only looks like what the people who use Sol run (the
// switches stand as in complete) and still updates with dev every day; no channel turns, no update stops. The pick is
// the window's (`picked`), since the engine runs it as complete.
export type Mode = "concept" | "complete";
export type Pick = Mode | "product";
export type State = { channel?: "dev" | "beta"; mode?: Mode | null; stable?: string; release?: string; stays?: boolean; team?: boolean };

/** what is lit (pure): product while this Sol follows beta, or picked here and run as complete; else the version it runs
 *  as; nothing before the engine says */
export const litOf = (s: State | null, picked: Pick | null = null): Pick | null =>
  (!s ? null : s.channel === "beta" ? "product" : picked === "product" && s.mode === "complete" ? "product" : s.mode ?? null);

/** the patches a press makes (pure): the setting `version`, and team.json `channel` only to leave beta for dev; product
 *  writes complete and leaves the channel as it is */
export function pressOf(p: Pick, s: State | null): { version: Mode; channel?: "dev" | "beta" } {
  if (p === "product") return { version: "complete" };
  return s?.channel === "beta" ? { version: p, channel: "dev" } : { version: p };
}

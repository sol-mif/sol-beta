// Cowork ways (docs/cowork-ways-2026-11-10/reports/step4-plan.md §4): the ways' switch. An environment variable only (no
// screen turns it, settings.ts is not touched); on unless it says off (#691). Out of team/v3 so a person's own ways
// (way-own.ts) ask it without loading Cowork v3; team/v3/way-switch.ts adds Cowork v3's switch for a team's ways. This
// file imports nothing of the ways, so asking it loads none of them.

/** the ways' switch: SOL_COWORK_WAYS */
export const WAYS_ENV = "SOL_COWORK_WAYS";

/** whether the ways are on: on unless the env says off (#691) */
export function waysOn(): boolean {
  const env = (process.env[WAYS_ENV] ?? "").trim().toLowerCase();
  return !(env === "off" || env === "0" || env === "false");
}

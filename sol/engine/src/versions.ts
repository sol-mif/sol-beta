// The modes one Sol runs as (Frank, 2026-11-14; product since #1551), and where each switch stands between them.
//   concept   everything that went into main, as the team runs it: a thing on its way shows here, working or not yet
//   complete  only what works for every person: the same screen, and underneath it the way that holds for anyone
//   product   what a tester runs: only what has also held there, untouched, long enough
// One code, never two lines: a release goes to a tester whole (team/beta.ts), so what differs between the modes is which
// way a switch picks. Where a switch stands is its card's `station` (sol/systems/records, #1544), written to
// stations.json by `node sol/systems/stations.mjs`; this file only reads that table. The stations are a ladder,
// concept < complete < product, and a switch is on in a mode when its station is at or past it:
//   concept   on in concept only: a concept that has not passed the first gate
//   complete  on in concept and complete: the way rebuilt for every person
//   product   on in all three
//   settled   on always, even before the mode is known: the switch and the old way can go
// A switch no card names stands at "hand", the rule before the cards: off in every mode until someone sets it.
// What a person set by hand (and the env before it) always wins over the station, both ways.
// Pure: no settings and no files here. settings.ts reads the mode and asks; nothing in this file imports the engine.
import cards from "./stations.json" with { type: "json" };

export type Mode = "concept" | "complete" | "product";
export const MODES: Mode[] = ["concept", "complete", "product"];
export type Station = Mode | "settled";
export type Stage = "hand" | Station;
const RANK: Record<Mode, number> = { concept: 0, complete: 1, product: 2 };
const STATIONS: readonly string[] = ["hand", ...MODES, "settled"];   // a card may stand at hand on purpose (ui.next, #1615): off until set, as with no card
export type Side = "engine" | "window";

/** the table a card set writes (pure): each switch's station and the side that reads it. A row that is not one is left
 *  out, so its switch stands at hand */
export function stationsFrom(raw: unknown): { stages: Record<string, Stage>; sides: Record<string, Side> } {
  const stages: Record<string, Stage> = {}, sides: Record<string, Side> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [name, row] of Object.entries(raw as Record<string, unknown>)) {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      if (typeof r.station !== "string" || !STATIONS.includes(r.station)) continue;
      stages[name] = r.station as Stage;
      sides[name] = r.side === "window" ? "window" : "engine";
    }
  }
  return { stages, sides };
}
const TABLE = stationsFrom(cards);

/** where each switch stands, by the name of its setting, both sides': the engine reads every row whatever its side
 *  (stage.whole's card says engine and the window reads it too, #1545). Moving one is a change to its card. Not frozen,
 *  so a test can stand a switch elsewhere and put it back */
export const STAGES: Readonly<Record<string, Stage>> = TABLE.stages;
/** the switches the window reads (side window), whose readings the engine sends it (settings.ts readings) */
export const WINDOW_SWITCHES: readonly string[] = Object.keys(TABLE.sides).filter((n) => TABLE.sides[n] === "window").sort();
export const stageOf = (name: string, stages: Readonly<Record<string, Stage>> = STAGES): Stage => (Object.hasOwn(stages, name) ? stages[name] : "hand");

const word = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
/** the mode this Sol runs in (pure): the env's word first (SOL_VERSION, a developer's own run or a test); a Sol on beta,
 *  a tester's, is product and nothing picked moves it (#1637, Frank 2026-11-19: the people who use Sol have no concept or
 *  complete to switch to, whatever the settings file says); else the setting a person picked, else by the channel (dev:
 *  concept). null while the channel is not known yet (the engine's first moment, before Ship has read it) and nobody
 *  picked, so nothing is shown to someone it may not be for */
export function modeOf(env: unknown, setting: unknown, channel: unknown): Mode | null {
  const isMode = (v: string): v is Mode => (MODES as string[]).includes(v);
  const e = word(env), s = word(setting);
  if (isMode(e)) return e;
  if (channel === "beta") return "product";
  if (isMode(s)) return s;
  return channel === "dev" ? "concept" : null;
}

/** whether a switch at this station is on in this mode when nobody set it (pure): settled always, hand never, else
 *  when the station is at or past the mode. No mode yet: only what is settled */
export function standsOn(stage: Stage, mode: Mode | null): boolean {
  if (stage === "settled") return true;
  if (stage === "hand" || mode === null || !Object.hasOwn(RANK, stage)) return false;
  return RANK[stage] >= RANK[mode];
}

/** a switch's reading (pure): what was set by hand, else where its station stands in this mode */
export function onFor(name: string, mode: Mode | null, set: boolean | undefined, stages: Readonly<Record<string, Stage>> = STAGES): boolean {
  return typeof set === "boolean" ? set : standsOn(stageOf(name, stages), mode);
}

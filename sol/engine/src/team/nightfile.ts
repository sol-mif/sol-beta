// The night job's two numbers (#99) on this machine (#428): when it runs and how many days a still claim may sit.
// They were `night` in team.json until conversion step 0002 moved them here; they belong to the project's rhythm now
// (`.sol/project.json` in the project's record, project.ts), and the engine writes the record's values into this file
// whenever it reads them, so the night job, a program of its own that reads no record, runs at the project's hour.
// `night.json` sits beside team.json (SOL_TEAM moves both). Node only: the conversion step imports it before any other
// module of the engine loads.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Night = { hour: number; staleDays: number };
export const NIGHT_DEFAULT: Night = { hour: 3, staleDays: 7 };
export const NIGHT_FILE_NAME = "night.json";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown, d: number, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);

/** the two numbers as read (pure): a bad one is its default; null when it is no object at all */
export function cleanNight(v: unknown): Night | null {
  if (!isObj(v)) return null;
  return { hour: int(v.hour, NIGHT_DEFAULT.hour, 0, 23), staleDays: int(v.staleDays, NIGHT_DEFAULT.staleDays, 1, 90) };
}

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");   // src/team or dist/team → sol/engine
/** team.json's path as settings.ts reads it, and night.json beside it */
export const teamFilePath = () => process.env.SOL_TEAM ?? process.env.SOL_TEAM_FILE ?? join(ENGINE, "team.json");
export const nightFileBeside = (teamFile: string) => join(dirname(teamFile), NIGHT_FILE_NAME);
export const nightFilePath = () => nightFileBeside(teamFilePath());

/** the file's numbers, or null when there is none (or it is not one) */
export function readNightFile(path = nightFilePath()): Night | null {
  try { return existsSync(path) ? cleanNight(JSON.parse(readFileSync(path, "utf8"))) : null; } catch { return null; }
}
/** team.json's own `night`, from before step 0002, or null. data-version counts the home, but team.json sits in the
 *  engine's folder (or wherever SOL_TEAM puts it): a home already at 2 can meet a team.json the step never saw (a second
 *  engine with SOL_TEAM, a new folder given an old team.json, a team.json put back by hand). Its numbers are still
 *  read here rather than lost; settings.ts drops `night` at its next write, and night.json is written from the record */
export function leftNight(teamFile = teamFilePath()): Night | null {
  try {
    const raw = existsSync(teamFile) ? JSON.parse(readFileSync(teamFile, "utf8")) : null;
    return isObj(raw) && "night" in raw ? cleanNight(raw.night) : null;
  } catch { return null; }
}
/** the numbers carried on this machine: night.json's, else team.json's left-over `night`, else null */
export const carriedNight = (path = nightFilePath(), teamFile = teamFilePath()): Night | null => readNightFile(path) ?? leftNight(teamFile);
/** the night job's numbers: the carried ones, else the defaults (3:00, 7 days) */
export const nightNow = (path = nightFilePath(), teamFile = teamFilePath()): Night => carriedNight(path, teamFile) ?? { ...NIGHT_DEFAULT };

/** written whole, never half (a temp file renamed); `from` says where the numbers came from. False when nothing changed */
export function writeNightFile(path: string, n: Night, from: "team.json" | "record"): boolean {
  const had = readNightFile(path);
  if (had && had.hour === n.hour && had.staleDays === n.staleDays) return false;
  writeFileSync(path + ".tmp", JSON.stringify({ hour: n.hour, staleDays: n.staleDays, from }, null, 2) + "\n");
  renameSync(path + ".tmp", path);
  return true;
}

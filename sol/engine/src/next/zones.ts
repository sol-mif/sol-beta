// Each folder's zone on the new face's plane (#1604, map.md "Far: zones (Diary, Build, Life)"): which side of the plane a
// folder sits on, once the person (or the AI) said so; until then the face reads the kind from what the folder holds
// (cv/core.ts). One file, SOL_HOME/next/zones.json { v: 1, zones: { <folder>: { zone, at } } }, written whole each time,
// a broken one set aside (file.ts, as arrange.ts keeps its file); the part tells every window. The old face never reads it.
//   next.zones.set { folder, zone }   zone: "build" | "life" | "diary"; null takes the folder's back to the rule
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type Zone = "build" | "life" | "diary";
export type ZoneOf = { zone: Zone; at: number };
export const ZONES: Zone[] = ["build", "life", "diary"];
const okFolder = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1000 && !/[\u0000-\u001f]/.test(v);

export const zonesFile = (home: string) => join(nextDir(home), "zones.json");

export function readZones(home: string): { zones: Record<string, ZoneOf>; aside?: string } {
  const { data, aside } = readJson(zonesFile(home));
  const zones: Record<string, ZoneOf> = {};
  const raw = data.zones && typeof data.zones === "object" ? (data.zones as Record<string, unknown>) : {};
  for (const [f, v] of Object.entries(raw)) {
    const z = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    if (okFolder(f) && ZONES.includes(z.zone as Zone)) zones[f] = { zone: z.zone as Zone, at: typeof z.at === "number" ? z.at : 0 };
  }
  return { zones, ...(aside ? { aside } : {}) };
}

/** next.zones.set: the folder's zone kept (null: given back to the rule), the file written whole */
export function setZone(home: string, m: unknown, now = Date.now()): { ok: true; folder: string; zone: Zone | null; aside?: string } | { ok: false; why: string } {
  const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  if (!okFolder(x.folder)) return { ok: false, why: "a zone needs the folder it is for" };
  if (x.zone !== null && !ZONES.includes(x.zone as Zone)) return { ok: false, why: "a zone is build, life or diary" };
  const was = readZones(home), zones = { ...was.zones };
  if (x.zone === null) delete zones[x.folder];
  else zones[x.folder] = { zone: x.zone as Zone, at: now };
  writeJson(zonesFile(home), { v: 1, zones });
  return { ok: true, folder: x.folder, zone: (x.zone as Zone | null), ...(was.aside ? { aside: was.aside } : {}) };
}

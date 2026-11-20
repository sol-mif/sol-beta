// The move-in's answers (#1604, switch.md "3. What the move-in reads"): what the person kept, fixed and dropped of what
// carry.ts read, in SOL_HOME/next/movein.json, written whole (file.ts). A drop hides the thing in the new face only; the
// old store keeps it. `on` is when the new face was first turned on here (the 30-day way back counts from it), set once.
//   next.movein.keep { keep?: [id], fix?: { <id>: { name?, kind?, zone? } }, drop?: [id] } → next.movein.kept { movein }
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type MoveInKept = { v: 1; on: number; at: number; keep: string[]; fix: Record<string, Record<string, unknown>>; drop: string[] };
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 1000) : []);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const moveinFile = (home: string) => join(nextDir(home), "movein.json");

export function readMoveIn(home: string): MoveInKept | null {
  const { data } = readJson(moveinFile(home));
  if (typeof data.on !== "number") return null;
  return { v: 1, on: data.on, at: typeof data.at === "number" ? data.at : data.on, keep: ids(data.keep), fix: isObj(data.fix) ? (data.fix as MoveInKept["fix"]) : {}, drop: ids(data.drop) };
}

/** the answers merged in: an id kept is no longer dropped and the other way round; a fix replaces that id's fix */
export function keepMoveIn(home: string, m: unknown, now = Date.now()): MoveInKept {
  const x = isObj(m) ? m : {};
  const was = readMoveIn(home) ?? { v: 1 as const, on: now, at: now, keep: [], fix: {}, drop: [] };
  const keep = new Set(was.keep), drop = new Set(was.drop);
  for (const id of ids(x.keep)) { keep.add(id); drop.delete(id); }
  for (const id of ids(x.drop)) { drop.add(id); keep.delete(id); }
  const fix = { ...was.fix };
  if (isObj(x.fix)) for (const [id, f] of Object.entries(x.fix)) if (id && id.length <= 1000 && isObj(f) && JSON.stringify(f).length <= 2000) fix[id] = f;
  const out: MoveInKept = { v: 1, on: was.on, at: now, keep: [...keep], fix, drop: [...drop] };
  writeJson(moveinFile(home), out);
  return out;
}

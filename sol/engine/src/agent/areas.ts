// Home's world (#1093): part 5's registry (sol/systems/records, #1091) counted by area for the Jelly project's lights:
// each area record (kind "area"), how many systems are filed under its folder, how many of them say "broken", and
// parked when the area itself is parked or legacy. Read from the repo the engine runs from, on each ask (472 small
// files); nothing is written.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** part 5's board (sol/systems/board): its address only when the engine's machine says it (SOL_SYSTEMS_BOARD); none
 *  by default, and the world then says the board is not known to this engine */
export const SYSTEMS_BOARD: string | null = process.env.SOL_SYSTEMS_BOARD?.trim().replace(/\/$/, "") || null;

export type AreaCount = { area: string; n: number; broken: number; parked: boolean };
type Rec = { id?: string; kind?: string; state?: string };

/** the counts (pure over a reader): `list(dir)` names a folder's entries, `isDir`, `read(file)` a record */
export function countAreas(root: string, io: { list: (d: string) => string[]; isDir: (p: string) => boolean; read: (f: string) => Rec | null }): AreaCount[] {
  const out: AreaCount[] = [];
  for (const f of io.list(root).filter((x) => x.endsWith(".json")).sort()) {
    const a = io.read(join(root, f));
    if (!a || a.kind !== "area" || !a.id) continue;
    let n = 0, broken = 0;
    const walk = (d: string, depth: number) => { if (depth > 6) return; for (const x of io.list(d)) { const p = join(d, x); if (io.isDir(p)) walk(p, depth + 1); else if (x.endsWith(".json")) { const r = io.read(p); if (r) { n++; if (r.state === "broken") broken++; } } } };
    walk(join(root, a.id), 0);   // six folders deep at most
    if (n) out.push({ area: a.id, n, broken, parked: a.state === "parked" || a.state === "legacy" });
  }
  return out;
}

export const RECORDS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "systems", "records");
export function readAreas(root = RECORDS): AreaCount[] | null {
  if (!existsSync(root)) return null;
  return countAreas(root, {
    list: (d) => { try { return readdirSync(d); } catch { return []; } },
    isDir: (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } },   // a link is never followed
    read: (f) => { try { return JSON.parse(readFileSync(f, "utf8")) as Rec; } catch { return null; } },
  });
}

// One small JSON file of the new face's, beside the old stores under SOL_HOME/next/ (#1604, docs/port/switch.md), kept
// the way arrange.ts keeps arrangement.json: written whole each time (a temp file, then a rename, so never half a file);
// a file that cannot be read is set aside as <name>.broken-<time>.json (never thrown away, never a crash) and the store
// starts fresh. Read again on every ask: these are a few kilobytes, and a second engine on the same home stays right.
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** SOL_HOME/next/: the one folder the new face writes in */
export const nextDir = (home: string) => join(home, "next");

let writes = 0;   // each write's own temp file, so two writes never share one

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** the file's object, {} when it is not there; a file that is not an object is set aside and `aside` names where */
export function readJson(file: string): { data: Record<string, unknown>; aside?: string } {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return { data: {} }; }
  try {
    const raw = JSON.parse(text);
    if (!isObj(raw)) throw new Error("not an object");
    return { data: raw };
  } catch {
    return { data: {}, aside: setAside(file) };
  }
}

/** a broken file moved to <name>.broken-<time>.json beside it (a second one never covers the first); its name */
export function setAside(file: string): string {
  const when = new Date().toISOString().replace(/[:.]/g, "-");
  const base = file.replace(/\.json$/, "");
  let to = `${base}.broken-${when}.json`;
  for (let n = 2; existsSync(to); n++) to = `${base}.broken-${when}-${n}.json`;
  try { renameSync(file, to); } catch { /* gone already */ }
  return to.slice(dirname(file).length + 1);
}

/** the whole file written: a temp file beside it, then renamed over it */
export function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++writes}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, file);
}

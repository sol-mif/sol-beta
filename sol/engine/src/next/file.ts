// One small JSON file of the new face's, beside the old stores under SOL_HOME/next/ (#1604, docs/port/switch.md), kept
// the way arrange.ts keeps arrangement.json: written whole each time (a temp file, then a rename, so never half a file);
// a file that cannot be read is set aside as <name>.broken-<time>.json (never thrown away, never a crash) and the store
// starts fresh. Read again on every ask: these are a few kilobytes, and a second engine on the same home stays right.
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, join } from "node:path";

/** SOL_HOME/next/: the one folder the new face writes in */
export const nextDir = (home: string) => join(home, "next");

let writes = 0;   // each write's own temp file, so two writes never share one

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** the file's object, {} when it is not there; a file that is not an object is set aside and `aside` names where */
export function readJson(file: string): { data: Record<string, unknown>; aside?: string; newer?: true } {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return { data: {} }; }
  try {
    const raw = JSON.parse(text);
    if (!isObj(raw)) throw new Error("not an object");
    if (versionOf(raw) > KNOWN_V) { sawNewer(file); return { data: raw, newer: true }; }
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

/** a store's version: its `v`, or 1 when it has none (a store written before versions is v1, never set aside for it); a
 *  number above what this engine knows is read as it is: the fields this engine knows, nothing wiped (BR1, #1615) */
export const versionOf = (data: Record<string, unknown>): number => (typeof data.v === "number" && Number.isInteger(data.v) && data.v >= 1 ? data.v : 1);

// A store a newer Sol wrote (#1820, row 3's prerequisite): its `v` is past KNOWN_V, so this engine only reads it and never
// writes it, since a write rebuilt from the fields it knows would drop the rest. Sol says so once, in one line, and the
// store stays read-only until a newer Sol is back (or a going-back puts the older copy back, convert/back.ts). Every
// store under next/ is v1 today; when one store moves past it (#1799's store layer), this becomes a version per store.
export const KNOWN_V = 1;
export const NEWER_SAID = "Some of your saved data is from a newer Sol: this one shows it but changes none of it. Update Sol to work with it again.";
const newer = new Set<string>();
/** the stores this engine found newer than it knows (their paths), read-only since */
export const newerStores = (): string[] => [...newer].sort();
function sawNewer(file: string) {
  if (newer.has(file)) return;
  newer.add(file);
  console.log(`next: ${file} is newer than this engine knows (past v${KNOWN_V}), so it is read-only here. ${NEWER_SAID}`);
}
/** every store under `dir` (SOL_HOME/next/, at engine start) newer than this engine knows, read-only from here; paths
 *  from `dir`. Reads only; a folder that is not there has none */
export function newerUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let names: Dirent[] = [];
    try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith(".json") && !e.name.includes(".broken-") && onDisk(f) > KNOWN_V) { sawNewer(f); out.push(f.slice(dir.length + 1)); }
    }
  };
  walk(dir);
  return out.sort();
}
/** the version on disk now, or 0 when there is no store or it cannot be read */
function onDisk(file: string): number {
  try { const raw = JSON.parse(readFileSync(file, "utf8")); return isObj(raw) ? versionOf(raw) : 0; } catch { return 0; }
}

/** the whole file written: a temp file beside it, then renamed over it; an object without a `v` is stamped `v: 1` first.
 *  A store on disk newer than this engine knows is left as it is: false, and nothing written */
export function writeJson(file: string, data: unknown): boolean {
  if (onDisk(file) > KNOWN_V) { sawNewer(file); return false; }
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++writes}.tmp`;
  writeFileSync(tmp, JSON.stringify(isObj(data) && !("v" in data) ? { v: 1, ...data } : data, null, 2) + "\n");
  renameSync(tmp, file);
  return true;
}

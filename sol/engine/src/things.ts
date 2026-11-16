// Freeform's foundation on the engine's side (#630, #629), small and additive. Two reads, nothing written:
//   the contract: the one number in sol/design/system/tokens.json, said on /health and stamped on every record;
//   the things: what a person's AI made, in their home (`<home>/things/<id>/`: record.json, ask.md, v1.html…), handed
//   to the face on GET /things as they are. The face checks each record and refuses what does not hold (mac/src/home/
//   frameRules.ts); here a folder that cannot be read is said with its reason, never skipped in silence.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// SOL_TOKENS: a test copy or a test points the engine at another contract (the fixtures of #634); never set live
export const TOKENS_FILE = process.env.SOL_TOKENS ? resolve(process.env.SOL_TOKENS) : resolve(HERE, "..", "..", "design", "system", "tokens.json");

/** the contract number this code ships, or null when tokens.json is missing or wrong (read each time: it is small) */
export function contractNow(file = TOKENS_FILE): number | null {
  try {
    const n = (JSON.parse(readFileSync(file, "utf8")) as { contract?: unknown }).contract;
    return Number.isInteger(n) && (n as number) >= 1 ? (n as number) : null;
  } catch { return null; }
}

export type ThingWire = { id: string; record: unknown; ask: string | null; html: string | null; error?: string };
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX = 512 * 1024;   // a thing's file, read whole; past this it is said, not sent

/** one file of a thing, read only when it is a plain file inside its folder (no link out of the home) */
export function readIn(dir: string, name: string): string | null {
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  const st = lstatSync(p);
  if (!st.isFile()) throw new Error(`${name} is not a plain file`);
  if (st.size > MAX) throw new Error(`${name} is over ${MAX / 1024} KB`);
  const real = realpathSync(p);
  if (!real.startsWith(realpathSync(dir) + sep)) throw new Error(`${name} points outside its folder`);
  return readFileSync(real, "utf8");
}

/** every thing in the home, sorted by id; a folder that cannot be read carries its reason */
export function readThings(home: string): ThingWire[] { return readFolder(join(home, "things")); }
/** every thing in one folder of things: the home's things/ (My Sol), or Sol's own blocks in its code (Stable, step 7) */
export function readFolder(root: string): ThingWire[] {
  if (!existsSync(root)) return [];
  const out: ThingWire[] = [];
  for (const id of readdirSync(root).sort()) {
    const dir = join(root, id);
    let folder = false;
    try { folder = lstatSync(dir).isDirectory(); } catch { continue; }   // gone between the list and the look
    if (!folder) { out.push({ id, record: null, ask: null, html: null, error: "not a folder (a link or a file)" }); continue; }
    if (!ID.test(id)) { out.push({ id, record: null, ask: null, html: null, error: "the folder's name is not an id (lowercase letters, digits and -)" }); continue; }
    try {
      const raw = readIn(dir, "record.json");
      if (raw === null) { out.push({ id, record: null, ask: null, html: null, error: "record.json is missing" }); continue; }
      let record: unknown;
      try { record = JSON.parse(raw); } catch (e) { out.push({ id, record: null, ask: null, html: null, error: `record.json is not JSON: ${(e as Error).message}` }); continue; }
      const r = record as { current?: unknown; versions?: { v?: unknown; file?: unknown }[] };
      const vs = Array.isArray(r?.versions) ? r.versions : [];
      const want = Number.isInteger(r?.current) ? r.current : Math.max(0, ...vs.map((v) => (Number.isInteger(v?.v) ? (v.v as number) : 0)));
      const file = vs.find((v) => v?.v === want)?.file;
      const html = typeof file === "string" && /^v\d+\.html$/.test(file) ? readIn(dir, file) : null;
      out.push({ id, record, ask: readIn(dir, "ask.md"), html });
    } catch (e) {
      out.push({ id, record: null, ask: null, html: null, error: (e as Error).message });
    }
  }
  return out;
}

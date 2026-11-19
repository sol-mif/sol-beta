// A block's fingerprint (the v2 backend design §10 `hash`, kept for the market, §12; step M1): one SHA-256 over what
// makes the block what it is, so a copy can be told from the one it came from. It covers
//   the record    its canonical JSON (canonical.ts), without its own `hash` and `sig`: the fingerprint cannot hold itself
//   the program   the current version's files, byte for byte: its face (`file`, vN.html) and its engine half (`engine`,
//                 or the engine.ts / engine.js beside the record the kernel would load). A file the record names that is
//                 not there counts as missing, and that is part of the print
// and not: the files of the other versions (there is no versions/ folder: they sit beside the record, vN.html), the
// person's ask (ask.md: their words, not the program), nor the block's own data (home/data/<id>/, the `stores`). Each
// part goes in with its name and its length, in a fixed order, so no two folders run together into one print.
// The kernel loads a block by the same two answers (which version is current, which file is its engine half), from here.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "./canonical.js";
import { bytesIn } from "./things.js";

/** an engine half's file name: beside the record, .ts or .js */
export const ENGINE_FILE = /^[a-z0-9][a-z0-9._-]{0,63}\.(?:ts|js|mjs)$/;
const FACE_FILE = /^v\d+\.html$/;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** which version is current, and its entry (the record as written: `current`, else the highest v) */
export function currentOf(r: Record<string, unknown>): { v: number; entry: Record<string, unknown> } | null {
  const vs = Array.isArray(r.versions) ? r.versions.filter(isObj) : [];
  const want = Number.isInteger(r.current) ? (r.current as number) : Math.max(0, ...vs.map((x) => (Number.isInteger(x.v) ? (x.v as number) : 0)));
  const entry = vs.find((x) => x.v === want);
  return entry ? { v: want, entry } : null;
}

/** the engine half's file name for a record, or null when it has none (a face-only block) */
export function engineFileOf(dir: string, entry: Record<string, unknown>): string | null {
  if (typeof entry.engine === "string") {
    if (!ENGINE_FILE.test(entry.engine)) throw new Error(`its version's engine "${entry.engine}" is not a file name beside the record (.ts or .js)`);
    return entry.engine;
  }
  for (const f of ["engine.ts", "engine.js"]) if (existsSync(join(dir, f))) return f;
  return null;
}

/** the current version's files, sorted: its face and its engine half, each when it has one */
export function programFilesOf(dir: string, r: Record<string, unknown>): string[] {
  const cur = currentOf(r);
  if (!cur) return [];
  const face = typeof cur.entry.file === "string" && FACE_FILE.test(cur.entry.file) ? [cur.entry.file] : [];
  const engine = engineFileOf(dir, cur.entry);
  return [...new Set([...face, ...(engine ? [engine] : [])])].sort();
}

/** a block's fingerprint, 64 hex digits: its record without `hash` and `sig`, and its current version's files as they
 *  are on the disk. Throws when a file is there and cannot be read (a link out of its folder, past the size a thing's
 *  file may have), as reading it to load would */
export function fingerprintOf(dir: string, r: Record<string, unknown>): string {
  const { hash: _hash, sig: _sig, ...rest } = r;
  const h = createHash("sha256").update("sol fingerprint 1\n");
  const part = (name: string, bytes: Buffer | null) => {
    h.update(`${name}\n${bytes === null ? "missing" : bytes.length}\n`);
    if (bytes) h.update(bytes);
    h.update("\n");
  };
  part("record.json", Buffer.from(canonical(rest), "utf8"));
  for (const f of programFilesOf(dir, r)) part(f, bytesIn(dir, f));
  return h.digest("hex");
}

// Format 1: what a plugin's record holds, and the market's index (the v2 backend design §10 and §12, step M1). Only the
// format and its two checks are here: nothing is downloaded, published or shown (no Discover), and no usage count is
// kept (counts would leave the machine: a hard gate).
//   the record   Marco's columns as the engine reads them (id, place, contract, reads, writes, listens, versions,
//                current; #630, #633), the beta's (room, needs, stores, hears: record.ts columnsOf) and v2's (from,
//                hash, sig: record.ts originHeld). `contract` may be left out of a record, as Sol's own blocks do; an
//                index entry must say it
//   the index    one file of its own, beside dsh's index and not inside it: { format: 1, plugins: [entry] }, an entry
//                { key: "publisher/id", title, v, sol: { contract, needs, from, hash } }. The key is the publisher's
//                name and the plugin's flat id: two people may name a plugin the same, the local id stays flat
//                (design §10). `sol` is the column the design names: which contract it pins, what it needs (as its
//                record writes it, {} for nothing), where it came from, its fingerprint (fingerprint.ts)
// Every name in the index (format, plugins, key, title, v, sol and sol's four) is our pick, not Marco's: this file is
// the one place they are written.
import { columnsOf, fromHeld, FINGERPRINT, type From } from "../record.js";
import { fingerprintOf, currentOf, ENGINE_FILE } from "../fingerprint.js";
import { contractNow, readIn } from "../things.js";

export const INDEX_FORMAT = 1;
export type IndexEntry = { key: string; title: string; v: number; sol: { contract: number; needs: Record<string, unknown>; from: From; hash: string } };
export type Index = { format: typeof INDEX_FORMAT; plugins: IndexEntry[] };
type Held = { ok: true } | { ok: false; why: string };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;                 // a plugin's id, flat (things.ts), and a publisher's name the same way
const KEY = /^([a-z0-9][a-z0-9-]{0,63})\/([a-z0-9][a-z0-9-]{0,63})$/;
const SOL_KEYS = ["contract", "needs", "from", "hash"];
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const strs = (x: unknown): boolean => Array.isArray(x) && x.every((s) => typeof s === "string");
const contractOk = (x: unknown): boolean => Number.isInteger(x) && (x as number) >= 1;

/** whether a record is format 1 (pure but for whose home "~/" is, as columnsOf): ok, or the first thing that does not
 *  hold. `id`, when given, is its folder's name, which the record's id must be */
export function recordFits(r: unknown, id?: string): Held {
  const no = (why: string): Held => ({ ok: false, why: why.startsWith("record.json: ") ? why : `record.json: ${why}` });
  if (!isObj(r)) return no("is not an object");
  if (typeof r.id !== "string" || !ID.test(r.id)) return no("id is not a plugin's id (lowercase letters, digits and -)");
  if (id !== undefined && r.id !== id) return no(`id is "${r.id}" but the folder is "${id}"`);
  if (typeof r.place !== "string" || !r.place.trim()) return no("place is missing");
  if (r.contract !== undefined && !contractOk(r.contract)) return no("contract is not the number it was made under");
  if (!strs(r.reads) || !strs(r.writes)) return no("reads and writes are not declared as lists");
  if (r.listens !== undefined && !strs(r.listens)) return no("listens is not a list of words");
  if (!Array.isArray(r.versions) || !r.versions.length) return no("versions is not a list of versions");
  const seen = new Set<number>();
  for (const x of r.versions) {
    if (!isObj(x) || !Number.isInteger(x.v) || (x.v as number) < 1) return no("a version without a whole number v");
    if (seen.has(x.v as number)) return no(`version ${x.v} is listed twice`);
    seen.add(x.v as number);
    if (x.file !== undefined && (typeof x.file !== "string" || !/^v\d+\.html$/.test(x.file))) return no(`version ${x.v}'s file "${String(x.file)}" is not vN.html`);
    if (x.engine !== undefined && (typeof x.engine !== "string" || !ENGINE_FILE.test(x.engine))) return no(`version ${x.v}'s engine "${String(x.engine)}" is not a file name beside the record (.ts or .js)`);
    if (x.at !== undefined && typeof x.at !== "string") return no(`version ${x.v}'s at is not a date`);
    if (x.contract !== undefined && !contractOk(x.contract)) return no(`version ${x.v}'s contract is not a number`);
  }
  if (r.current !== undefined && !(Number.isInteger(r.current) && seen.has(r.current as number))) return no(`current names version ${String(r.current)}, which is not among its versions`);
  const c = columnsOf(r);   // room, needs, stores, hears; from, hash, sig
  return c.ok ? { ok: true } : no(c.why);
}

/** a plugin's entry in the index, from its folder (reads the folder, writes nothing): its key under this publisher,
 *  its title and current version, and the `sol` column. `contract` is the record's, else the one this code ships;
 *  `from` the record's, else the one given here. A record that is not format 1 has no entry */
export function entryOf(publisher: string, dir: string, from?: From): { ok: true; entry: IndexEntry } | { ok: false; why: string } {
  if (!ID.test(publisher)) return { ok: false, why: `"${publisher}" is not a publisher's name (lowercase letters, digits and -)` };
  let r: unknown;
  try { const raw = readIn(dir, "record.json"); if (raw === null) return { ok: false, why: "record.json is missing" }; r = JSON.parse(raw); } catch (e) { return { ok: false, why: `record.json: ${(e as Error).message}` }; }
  const fits = recordFits(r);
  if (!fits.ok) return fits;
  const rec = r as Record<string, unknown>;
  const contract = contractOk(rec.contract) ? (rec.contract as number) : contractNow();
  if (contract === null) return { ok: false, why: "it pins no contract, and this code ships none (tokens.json)" };
  const origin = (rec.from ?? from) as From | undefined;
  if (origin === undefined) return { ok: false, why: "it says no from: where it came from" };
  const bad = fromHeld(origin);
  if (bad) return { ok: false, why: bad };
  let hash: string;
  try { hash = fingerprintOf(dir, rec); } catch (e) { return { ok: false, why: `its files could not be read: ${(e as Error).message}` }; }
  const title = typeof rec.title === "string" && rec.title.trim() ? rec.title : (rec.id as string);
  return { ok: true, entry: { key: `${publisher}/${rec.id as string}`, title, v: currentOf(rec)!.v, sol: { contract, needs: isObj(rec.needs) ? rec.needs : {}, from: origin, hash } } };
}

/** whether an index is format 1 (pure): ok, or the first entry that does not hold and why */
export function checkIndex(x: unknown): Held {
  if (!isObj(x)) return { ok: false, why: "index: is not an object" };
  if (x.format !== INDEX_FORMAT) return { ok: false, why: `index: format is ${JSON.stringify(x.format)}, not ${INDEX_FORMAT}` };
  if (!Array.isArray(x.plugins)) return { ok: false, why: "index: plugins is not a list" };
  const keys = new Set<string>();
  for (const [i, e] of x.plugins.entries()) {
    const no = (why: string): Held => ({ ok: false, why: `index: plugins[${i}]${isObj(e) && typeof e.key === "string" ? ` (${e.key})` : ""}: ${why}` });
    if (!isObj(e)) return no("is not an object");
    if (typeof e.key !== "string" || !KEY.test(e.key)) return no(`key ${JSON.stringify(e.key)} is not publisher/id (each lowercase letters, digits and -)`);
    if (keys.has(e.key)) return no("its key is in the index twice");
    keys.add(e.key);
    if (typeof e.title !== "string" || !e.title.trim() || e.title.length > 200) return no("title is not one line of words (200 characters at most)");
    if (!Number.isInteger(e.v) || (e.v as number) < 1) return no("v is not a whole number");
    if (!isObj(e.sol)) return no("has no sol column");
    const s = e.sol;
    const odd = Object.keys(s).find((k) => !SOL_KEYS.includes(k));
    if (odd) return no(`sol has "${odd}", which is not one of its fields (${SOL_KEYS.join(", ")})`);
    if (!contractOk(s.contract)) return no("has no sol.contract: the contract it pins");
    if (!isObj(s.needs)) return no("sol.needs is not what its record needs ({} for nothing)");
    const needs = columnsOf({ needs: s.needs });   // the record's own rule, the same sentence
    if (!needs.ok) return no(`sol.${needs.why.replace(/^record\.json: /, "")}`);
    if (s.from === undefined) return no("has no sol.from: where it came from");
    const from = fromHeld(s.from);
    if (from) return no(`sol.${from}`);
    if (typeof s.hash !== "string" || !FINGERPRINT.test(s.hash)) return no("sol.hash is not a fingerprint (64 lowercase hex digits)");
  }
  return { ok: true };
}

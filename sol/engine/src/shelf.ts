// The shelf (#200): things in passing. A talk's export (talks.ts) lands here as one file in home/shelf/ and one row in
// home/shelf/index.json. Nothing to manage: what is not kept leaves after seven days (the sweep, at engine start and
// every hour); a row kept from before (the Grab tray's Keep, gone with the notch in #1584) stays.
//
// The row on disk is the item without its url, plus `file` (its name inside home/shelf/). The item on the wire has
// `url` instead: http://<host>:<port>/file?path=<abs>, which files.ts serveFile already answers for anything inside
// home/. The pure parts (the name, the index read, the sweep's choice, a png's size) are exported and tested.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const KINDS = ["shot", "sol", "page", "file"] as const;
export type ShelfKind = (typeof KINDS)[number];
export type Row = { id: string; kind: ShelfKind; name: string; mime: string; at: string; kept: boolean; file: string; w?: number; h?: number };
export type Item = Omit<Row, "file"> & { url: string };

export const SWEEP_DAYS = 7;
export const SWEEP_EVERY_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".txt": "text/plain" };

/** a file name that is safe on disk: no folders, no odd characters, at most 80 long (pure) */
export function safeName(name: unknown): string {
  const base = basename(String(name || "file")).replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").trim();
  return (base || "file").slice(-80);
}
/** the stamp in a shelf file's name: 20261024-153012 (pure) */
export const stampOf = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");
/** the file's name in home/shelf/: <stamp>-<safe name>; a clash gets -2, -3 before the extension (pure) */
export function shelfName(name: unknown, now: Date, taken: (n: string) => boolean = () => false): string {
  const safe = safeName(name), ext = extname(safe), stem = safe.slice(0, safe.length - ext.length);
  let out = `${stampOf(now)}-${safe}`;
  for (let n = 2; taken(out); n++) out = `${stampOf(now)}-${stem}-${n}${ext}`;
  return out;
}

/** index.json read: the valid rows, newest first; anything broken reads as an empty shelf (pure) */
export function parseIndex(text: string): Row[] {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const rows: Row[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.file !== "string" || typeof o.at !== "string" || isNaN(Date.parse(o.at))) continue;
    if (o.file !== basename(o.file) || o.file.startsWith(".")) continue;   // a row never points outside the folder
    rows.push({
      id: o.id, file: o.file, at: o.at, kept: o.kept === true,
      kind: KINDS.includes(o.kind as ShelfKind) ? (o.kind as ShelfKind) : "file",
      name: typeof o.name === "string" ? o.name : o.file,
      mime: typeof o.mime === "string" ? o.mime : "application/octet-stream",
      ...(typeof o.w === "number" && typeof o.h === "number" ? { w: o.w, h: o.h } : {}),
    });
  }
  return newestFirst(rows);
}
export const newestFirst = (rows: Row[]) => [...rows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** the sweep's choice: kept rows stay; others older than `days` go (pure) */
export function sweepChoice(rows: Row[], now: Date, days = SWEEP_DAYS): { stay: Row[]; go: Row[] } {
  const stay: Row[] = [], go: Row[] = [];
  for (const r of rows) (!r.kept && now.getTime() - Date.parse(r.at) > days * DAY_MS ? go : stay).push(r);
  return { stay, go };
}

/** a png's width and height from its header, else null (pure) */
export function pngSize(b: Buffer): { w: number; h: number } | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ---- the folder ----
let home = "";
let urlOf = (abs: string) => `/file?path=${encodeURIComponent(abs)}`;
const dir = () => { if (!home) throw new Error("the shelf has no home yet"); return join(home, "shelf"); };
const indexPath = () => join(dir(), "index.json");

/** where the shelf lives and how its urls are made (index.ts) */
export function setShelfHome(h: string, url: (abs: string) => string) {
  home = h; urlOf = url;
}

function read(): Row[] {
  try { return parseIndex(readFileSync(indexPath(), "utf8")); } catch { return []; }
}
function write(rows: Row[]) {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const tmp = `${indexPath()}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(newestFirst(rows), null, 1), { mode: 0o600 });
  renameSync(tmp, indexPath());   // whole or not at all
}
const itemOf = (r: Row): Item => { const { file, ...rest } = r; return { ...rest, url: urlOf(join(dir(), file)) }; };

/** files onto the shelf (one write); the new items, and the whole list with them first */
export function addToShelf(files: { buf: Buffer; name: string; mime?: string }[], kind: ShelfKind = "file", now = new Date()): { fresh: Item[]; items: Item[] } {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const rows = read(), fresh: Row[] = [];
  for (const f of files) {
    const file = shelfName(f.name, now, (n) => existsSync(join(dir(), n)));
    writeFileSync(join(dir(), file), f.buf, { mode: 0o600 });
    const size = pngSize(f.buf);
    fresh.push({ id: randomBytes(6).toString("hex"), kind, name: safeName(f.name), mime: f.mime || MIME[extname(file).toLowerCase()] || "application/octet-stream",
      at: now.toISOString(), kept: false, file, ...(size ? size : {}) });
  }
  if (!fresh.length) throw new Error("nothing to put on the shelf");
  write([...fresh, ...rows]);
  return { fresh: fresh.map(itemOf), items: newestFirst([...fresh, ...rows]).map(itemOf) };
}

/** the sweep: what is not kept and older than a week goes, file and row; how many went */
export function sweepShelf(now = new Date()): number {
  if (!home || !existsSync(indexPath())) return 0;
  const { stay, go } = sweepChoice(read(), now);
  if (!go.length) return 0;
  for (const r of go) rmSync(join(dir(), r.file), { force: true });
  write(stay);
  return go.length;
}

/** sweep now and every hour after (index.ts, at start) */
export function startSweep(): NodeJS.Timeout {
  const once = () => { try { const n = sweepShelf(); if (n) console.log(`shelf: ${n} thing${n === 1 ? "" : "s"} older than a week went`); } catch (e) { console.log(`shelf: sweep failed: ${(e as Error).message}`); } };
  once();
  const t = setInterval(once, SWEEP_EVERY_MS);
  t.unref();
  return t;
}

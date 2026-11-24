// Places on the plane (#1604, map.md row 7 "place"; slices.md "The contract between face and engine"): where each folder
// or piece sits on the new face's plane, and who put it there. One file, SOL_HOME/next/pos.json { v: 1, pos: { <id>: Pos } },
// written whole each time and a broken one set aside (file.ts, as arrange.ts keeps its file). The part (parts/next.ts)
// tells every window. The old face never reads it.
//   next.pos.set { id, x, y, w, h, by: "person" | "ai" | "rule", touched, folded?, in?, hand? }   at: when the engine kept it
// folded (BR1, #1615): the piece drawn in its folded form (the Diary its spine, a folder its tab, a session its chip);
// anything but true is false, so a place kept before it is open.
// in (BR1, folders in folders): the folder a folder sits in as the person put it (its id), or null when the person took it
// to the top; unsaid, the rule's (a sub-folder on disk, a path inside another's). Anything else reads as unsaid.
// hand: "fold" (BR1, #1615): the person only folded it where the rule put it, so it holds no arrangement of theirs;
// anything else reads as unsaid.
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type By = "person" | "ai" | "rule";
export type Pos = { x: number; y: number; w: number; h: number; by: By; touched: boolean; folded: boolean; at: number; in?: string | null; hand?: "fold" };
const BY: By[] = ["person", "ai", "rule"];
/** an id the face gives a folder or a piece ("w:/path", "h:school", a session's id): any short line of text */
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 300 && !/[\u0000-\u001f]/.test(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;

export const posFile = (home: string) => join(nextDir(home), "pos.json");

/** the fits scope of a folder, as the face's settings/model.ts scopeOfRegion names it: "w:/a/b" → "a/b", "h:x" → "home/x"
 *  (null: not a folder's id). pos.json keys folders by these ids; fits, facts and changes keep the scope */
export function scopeOf(folder: string): string | null {
  const p = folder.startsWith("w:") ? folder.slice(2) : folder.startsWith("h:") ? "home/" + folder.slice(2) : "";
  const s = p.split("/").filter((x) => x && x !== "." && x !== "..").join("/");
  return s && !/[\u0000-\u001f\\]/.test(s) ? s : null;
}

/** one place as kept, or null when the line is not one (pure) */
function cleanPos(v: unknown): Pos | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (!num(p.x) || !num(p.y) || !num(p.w) || !num(p.h) || p.w < 0 || p.h < 0 || !BY.includes(p.by as By)) return null;
  const into = p.in === null ? { in: null } : okId(p.in) ? { in: p.in } : {};
  const at = typeof p.at === "number" && Number.isFinite(p.at) && p.at >= 0 ? p.at : 0;   // a time (ms), past num's bound
  return { x: p.x, y: p.y, w: p.w, h: p.h, by: p.by as By, touched: p.touched === true, folded: p.folded === true, at, ...into, ...(p.hand === "fold" ? { hand: "fold" as const } : {}) };
}

/** every place kept; aside: the broken file's new name, when this read set one aside */
export function readPos(home: string): { pos: Record<string, Pos>; aside?: string } {
  const { data, aside } = readJson(posFile(home));
  const pos: Record<string, Pos> = {};
  const raw = data.pos && typeof data.pos === "object" ? (data.pos as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(raw)) { const p = cleanPos(v); if (okId(id) && p) pos[id] = p; }
  return { pos, ...(aside ? { aside } : {}) };
}

/** next.pos.set: the place kept and the file written whole; a message that is not a place changes nothing */
export function setPos(home: string, m: unknown, now = Date.now()): { ok: true; id: string; pos: Pos; aside?: string } | { ok: false; why: string } {
  const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  if (!okId(x.id)) return { ok: false, why: "a place needs the id of what it places" };
  const p = cleanPos({ ...x, at: now });
  if (!p) return { ok: false, why: "a place is x, y, w and h as numbers, and by person, ai or rule" };
  const was = readPos(home);
  writeJson(posFile(home), { v: 1, pos: { ...was.pos, [x.id]: p } });
  return { ok: true, id: x.id, pos: p, ...(was.aside ? { aside: was.aside } : {}) };
}

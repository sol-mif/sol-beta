// The move-in's answers (#1604, switch.md "3. What the move-in reads"): what the person kept, fixed and dropped of what
// carry.ts read, in SOL_HOME/next/movein.json, written whole (file.ts). A drop hides the thing in the new face only; the
// old store keeps it. `on` is when the new face was first turned on here (the 30-day way back counts from it), set once.
//   next.movein.keep { keep?: [id], fix?: { <id>: { name?, kind?, zone? } }, drop?: [id] } → next.movein.kept { movein }
//   markBatch · unkeep (BR1 item 7): a keep's batch and the answers before it; its one Back puts them back
//   next.movein.lead { lead: "day" | "work" | "both" | null } → next.movein.kept { movein } (BR1, #1615: what the person
//   wants to see first when Sol opens; null: skipped, the face reads it as "day" on the very first run only)
//   said (#1816 round 2): the person's own words for how their folders are, and the folders the agent read from them
//   (next/said.ts folders_set); when there, the tree is exactly those (tree.ts), nothing Sol finds is added
//   keptFolders (BR1, one folder list): the folders kept, in one id form (folderId), none removed; next.state and
//   next.movein.kept carry them as `folders`, what the canvas draws and the "Set up for you" line names
// Signed: marcocyl04-ux's agent, slice 7b of the port (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type Lead = "day" | "work" | "both";
export const LEADS: readonly Lead[] = ["day", "work", "both"];
/** batch: the last keep's placements (movein-place.ts), the one its Back takes out; `before` what the answers were */
export type MoveInKept = { v: 1; on: number; at: number; keep: string[]; fix: Record<string, Record<string, unknown>>; drop: string[]; lead: Lead | null; batch?: string; said?: Said };
/** a folder the person named: its path, the name they call it (else the folder's), the said folder it sits in (else the
 *  nearest said one holding it on disk), `open: false` when its own folders are not theirs to see (a project's insides) */
export type SaidFolder = { path: string; name?: string; inside?: string; open?: boolean };
/** the person's words, when, and the folders they name, outermost first */
export type Said = { at: number; words: string; folders: SaidFolder[] };
type Answers = Pick<MoveInKept, "keep" | "fix" | "drop">;
const leadOf = (v: unknown): Lead | null => (LEADS.includes(v as Lead) ? (v as Lead) : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 1000) : []);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const moveinFile = (home: string) => join(nextDir(home), "movein.json");

/** a folder's id in one form: a bare path (what the You read's apply once kept, its part's id) is the work folder's
 *  "w:" id, as the move-in's rows and the canvas name it (BR1: one folder list from the move-in to the canvas) */
export const folderId = (id: string) => (!/^[wh]:./.test(id) && (id.startsWith("/") || /^[A-Za-z]:[\\/]/.test(id)) ? "w:" + id : id);
const oneForm = (v: unknown) => [...new Set(ids(v).map(folderId))];
/** the migration's answers on next.movein.keep (migration.html C): `apart` the folders of a move changed back, `into` a
 *  folder folded into another; read for this keep only, never kept in movein.json (the placements are the record) */
export function migOf(m: unknown): { apart: string[]; into: Record<string, string> } {
  const x = isObj(m) ? m : {}, into: Record<string, string> = {};
  if (isObj(x.into)) for (const [f, to] of Object.entries(x.into).slice(0, 2000)) if (f.length <= 1000 && typeof to === "string" && to && to.length <= 1000) into[folderId(f)] = folderId(to);
  return { apart: oneForm(x.apart).slice(0, 2000), into };
}
const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() && v.length <= n ? v.trim() : undefined);
export const SAID_MAX = 200;
/** the said record as kept, or undefined when it is not one (a folder without a path is left out) */
export function saidOf(v: unknown): Said | undefined {
  if (!isObj(v) || !Array.isArray(v.folders) || typeof v.at !== "number") return undefined;
  const folders: SaidFolder[] = [];
  for (const f of v.folders.slice(0, SAID_MAX)) {
    if (!isObj(f)) continue;
    const path = str(f.path, 1000), name = str(f.name, 200), inside = str(f.inside, 1000);
    if (path) folders.push({ path, ...(name ? { name } : {}), ...(inside ? { inside } : {}), ...(f.open === false ? { open: false } : {}) });
  }
  return { at: v.at, words: typeof v.words === "string" ? v.words.slice(0, 4000) : "", folders };
}
const saidPart = (s: Said | undefined) => (s ? { said: s } : {});
const fixOf = (v: unknown): MoveInKept["fix"] => {
  const out: MoveInKept["fix"] = {};
  if (isObj(v)) for (const [id, f] of Object.entries(v)) if (isObj(f)) out[folderId(id)] = { ...(out[folderId(id)] ?? {}), ...f };
  return out;
};

export function readMoveIn(home: string): MoveInKept | null {
  const { data } = readJson(moveinFile(home));
  if (typeof data.on !== "number") return null;
  return { v: 1, on: data.on, at: typeof data.at === "number" ? data.at : data.on, keep: oneForm(data.keep), fix: fixOf(data.fix), drop: oneForm(data.drop), lead: leadOf(data.lead), ...(typeof data.batch === "string" ? { batch: data.batch } : {}), ...saidPart(saidOf(data.said)) };
}

/** a folder the person keeps: its id ("w:<path>" or "h:<id>"), its name (theirs when they fixed it), its path (w:) */
export type KeptFolder = { id: string; name: string; path?: string };
/** the one list of folders the person keeps, whoever kept them (the move-in's These are mine, the You read's apply, a
 *  folder taken back off the shelf): every kept id that is a folder, once, none they removed, in the order kept. The
 *  canvas draws exactly these and the "Set up for you" line names them; an app (app:claude) is no folder */
export function keptFolders(m: MoveInKept | null): KeptFolder[] {
  if (!m) return [];
  const out = new Set(m.drop);
  return m.keep.filter((id) => /^[wh]:./.test(id) && !out.has(id)).map((id) => {
    const rest = id.slice(2).replace(/[\\/]+$/, ""), said = m.fix[id]?.name;
    const name = typeof said === "string" && said.trim() ? said.trim() : rest.split(/[\\/]/).filter(Boolean).pop() || rest;
    return { id, name, ...(id.startsWith("w:") ? { path: rest } : {}) };
  });
}

/** a keep's batch, with the answers as they were before it, so its one Back can put them back */
export function markBatch(home: string, batch: string, before: MoveInKept | null): void {
  const m = readMoveIn(home);
  if (!m) return;
  const was: Answers = before ? { keep: before.keep, fix: before.fix, drop: before.drop } : { keep: [], fix: {}, drop: [] };
  writeJson(moveinFile(home), { ...m, batch, before: was });
}
/** the move-in's one Back: the answers as they were before that batch's keep (none: not moved in yet), the lead kept */
export function unkeep(home: string, batch: string, now = Date.now()): MoveInKept | null {
  const { data } = readJson(moveinFile(home)), m = readMoveIn(home);
  if (!m || data.batch !== batch) return m;
  const b = isObj(data.before) ? data.before : {};
  const out: MoveInKept = { v: 1, on: m.on, at: now, keep: oneForm(b.keep), fix: fixOf(b.fix), drop: oneForm(b.drop), lead: m.lead, ...saidPart(m.said) };
  writeJson(moveinFile(home), out);
  return out;
}

/** the answers merged in: an id kept is no longer dropped and the other way round; a fix replaces that id's fix */
export function keepMoveIn(home: string, m: unknown, now = Date.now()): MoveInKept {
  const x = isObj(m) ? m : {};
  const was = readMoveIn(home) ?? { v: 1 as const, on: now, at: now, keep: [], fix: {}, drop: [], lead: null };
  const keep = new Set(was.keep), drop = new Set(was.drop);
  for (const id of oneForm(x.keep)) { keep.add(id); drop.delete(id); }
  for (const id of oneForm(x.drop)) { drop.add(id); keep.delete(id); }
  const fix = { ...was.fix };
  if (isObj(x.fix)) for (const [id, f] of Object.entries(x.fix)) if (id && id.length <= 1000 && isObj(f) && JSON.stringify(f).length <= 2000) fix[folderId(id)] = f;
  const out: MoveInKept = { v: 1, on: was.on, at: now, keep: [...keep], fix, drop: [...drop], lead: was.lead, ...saidPart(was.said) };
  writeJson(moveinFile(home), out);
  return out;
}

/** the person's words and the folders read from them, kept whole (a new sentence replaces the last); the rest of the
 *  answers as they were. Before the move-in it is the move-in: the tree comes from the words alone */
export function setSaid(home: string, said: Said, now = Date.now()): MoveInKept {
  const was = readMoveIn(home) ?? { v: 1 as const, on: now, at: now, keep: [], fix: {}, drop: [], lead: null };
  const out: MoveInKept = { ...was, at: now, said }, before = readJson(moveinFile(home)).data.before;
  writeJson(moveinFile(home), { ...out, ...(isObj(before) ? { before } : {}) });
  return out;
}

/** what the person wants to see first: "day", "work", "both", or null (skipped). Anything else changes nothing */
export function setLead(home: string, m: unknown, now = Date.now()): { ok: true; movein: MoveInKept } | { ok: false; why: string } {
  const v = isObj(m) ? m.lead : undefined;
  if (v !== null && !LEADS.includes(v as Lead)) return { ok: false, why: "lead is day, work, both or null" };
  const was = readMoveIn(home) ?? { v: 1 as const, on: now, at: now, keep: [], fix: {}, drop: [], lead: null };
  const out: MoveInKept = { ...was, at: now, lead: leadOf(v) }, before = readJson(moveinFile(home)).data.before;
  writeJson(moveinFile(home), { ...out, ...(isObj(before) ? { before } : {}) });   // the lead leaves the batch's Back as it was
  return { ok: true, movein: out };
}

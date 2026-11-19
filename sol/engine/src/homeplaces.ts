// Places inside places, by the person's word (#1662, after #1484's "+ a place inside"). Two tools on the "sol" server,
// both seats, always offered; with no Home yet (their record, ~/.sol/record/me.json, has no `built`) each says so:
//   place_add  { name, inside, yes }   a place named inside another. Its id is its path ("clubs/chess", mac
//                                      onboard/depth.ts), with the outer's part; it waits in fillDirs and unchecked, so
//                                      Home makes its folder and its two files the way "+ a place inside" does
//   place_move { place, under, yes }   a place and everything under it moved under another ("" for the top). Its ids
//                                      change everywhere the record keeps them (areas, facts, the lists, the levels, the
//                                      answers), and its folder on disk moves with it, never over a folder that is there
// `yes` is the person's own words this turn, as set_setting's (openfor.ts saidThisTurn): a guess changes nothing. Every
// face is told { type: "home.record" } and Home reads the record again (mac onboard/OneHome.tsx). Nothing leaves the Mac.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ToolResult, TurnCtx } from "./browser.js";
import { RECORD } from "./consent.js";
import { saidThisTurn } from "./openfor.js";
import { writeWhole } from "./safewrite.js";

type Area = { id: string; name: string; part: string; facts?: string[]; said?: string };
type Rec = { built?: string; solHome?: string | null; areas?: Area[]; facts?: { area?: string }[]; confirmed?: Record<string, unknown>;
  into?: Record<string, string>; asks?: { id?: string; area?: string; into?: { area?: string } & Record<string, unknown> }[]; hands?: string; unchecked?: string[]; later?: string[]; madeDirs?: string[]; fillDirs?: string[];
  consent?: { levels?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

export const PLACE_TOOLS = [
  {
    name: "place_add",
    description: "Make a place in the person's Home inside another place, when they asked for it in this very turn " +
      "(\"make a Chess place inside Clubs\"). `inside` is the outer place's name or id as Home shows it. `yes` is the " +
      "person's own words from this turn that ask for it, two words at least, copied exactly: refused when they are not in what they said.",
    shape: { name: z.string().min(1).max(40), inside: z.string().min(1).max(200), yes: z.string().min(2).max(400) },
  },
  {
    name: "place_move",
    description: "Move a place of the person's Home, with everything under it, under another place (\"put Chess under " +
      "Clubs\"), or to the top with under \"\", when they asked for it in this very turn. Its folder moves with it. " +
      "`place` and `under` are names or ids as Home shows them. `yes` as in place_add.",
    shape: { place: z.string().min(1).max(200), under: z.string().max(200), yes: z.string().min(2).max(400) },
  },
] as const;
export const PLACE_NAMES = new Set<string>(PLACE_TOOLS.map((t) => t.name));

const file = (home: string) => join(home, RECORD);
function readRec(home: string): Rec | null {
  try { const j = JSON.parse(readFileSync(file(home), "utf8")); return j && typeof j === "object" && !Array.isArray(j) ? (j as Rec) : null; } catch { return null; }
}

// ---- the record (pure) ----
const SEG = /^[a-z0-9][a-z0-9-]*$/;
/** an id whose every step is plain letters, as a folder made by the onboarding or by "+" is: only such a one is moved */
const plainId = (id: string) => id.split("/").every((s) => SEG.test(s));
const parentOf = (id: string) => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : null);
const leaf = (id: string) => id.slice(id.lastIndexOf("/") + 1);
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const bare = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
/** ids the face keeps for itself (mac onboard/sort.ts KEPT_IDS): the unplaced, Home's two views, the sorter's none */
const KEPT = ["you", "home", "world", "none"];
const LEVELS = ["record", "show", "draft", "do"];
/** the lower of two levels (mac onboard/record.ts lower); an unknown one is the other */
const lowerOf = (a: unknown, b: unknown) => { const i = LEVELS.indexOf(String(a)), j = LEVELS.indexOf(String(b)); return i < 0 ? b : j < 0 ? a : LEVELS[Math.min(i, j)]; };
/** a free id at `base`: base, else base-2, base-3 …, never one the face keeps */
const freeId = (ids: Set<string>, base: string) => { let id = KEPT.includes(base) ? `place-${base}` : base; for (let n = 2; ids.has(id); n++) id = `${base}-${n}`; return id; };

/** the place a name or id points at, or why none (pure): its id first, then its name; two of one name are asked about */
export function findPlace(areas: readonly Area[], said: string): Area | { why: string } {
  const s = said.trim(), byId = areas.find((a) => a.id === s);
  if (byId) return byId;
  const w = bare(s), same = w ? areas.filter((a) => bare(a.name) === w) : [];
  if (same.length === 1) return same[0];
  if (same.length > 1) return { why: `${same.length} places are named ${s}: name one by its id (${same.map((a) => a.id).join(", ")})` };
  return { why: `there is no place ${s || "(none named)"} in Home; its places: ${areas.map((a) => `${a.name} (${a.id})`).join(", ") || "none yet"}` };
}

/** the record with a place made inside another (pure), or why not */
export function addIn(rec: Rec, name: string, inside: string, said: string): { rec: Rec; id: string; outer: string } | { why: string } {
  const areas = rec.areas ?? [], up = findPlace(areas, inside);
  if ("why" in up) return up;
  const nm = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  const s = slug(nm);
  if (!s) return { why: "give it a name with a Latin letter or a digit in it, so its folder has a name" };
  const kin = areas.find((a) => parentOf(a.id) === up.id && bare(a.name) === bare(nm));
  if (kin) return { why: `${up.name} already holds ${kin.name}` };
  const id = freeId(new Set(areas.map((a) => a.id)), `${up.id}/${s}`);
  const fresh: Area = { id, name: nm, part: up.part, facts: [], said: said.trim() };
  // never freer than its outer: the outer's level, where the record sets one
  const lv = rec.consent?.levels?.[up.id] ?? rec.hands;
  const consent = rec.consent && lv !== undefined ? { consent: { ...rec.consent, levels: { ...(rec.consent.levels ?? {}), [id]: lv } } } : {};
  return { id, outer: up.name, rec: { ...rec, ...consent, areas: [...areas, fresh], fillDirs: [...new Set([...(rec.fillDirs ?? []), id])], unchecked: [...new Set([...(rec.unchecked ?? []), id])] } };
}

/** the record with a place and everything under it moved under another, "" the top (pure), or why not. `moves`: each
 *  old id and its new one, the place's own first */
export function moveUnder(rec: Rec, place: string, under: string): { rec: Rec; from: string; to: string; moves: [string, string][] } | { why: string } {
  const areas = rec.areas ?? [], p = findPlace(areas, place);
  if ("why" in p) return p;
  let up: Area | null = null;
  if (under.trim()) { const u = findPlace(areas, under); if ("why" in u) return u; up = u; }
  if (up && (up.id === p.id || up.id.startsWith(`${p.id}/`))) return { why: `${p.name} cannot go inside itself or a place under it` };
  if ((up?.id ?? null) === parentOf(p.id)) return { why: `${p.name} is already ${up ? `in ${up.name}` : "at the top"}` };
  const under_ = areas.filter((a) => a.id === p.id || a.id.startsWith(`${p.id}/`));
  if (!under_.every((a) => plainId(a.id)) || (up && !plainId(up.id))) return { why: `${p.name}'s folder has a name I do not move; move it by hand in Finder and tell me` };
  const others = new Set(areas.filter((a) => !under_.includes(a)).map((a) => a.id));
  const to = freeId(others, up ? `${up.id}/${leaf(p.id)}` : leaf(p.id));
  const re = (id: string) => (id === p.id ? to : id.startsWith(`${p.id}/`) ? to + id.slice(p.id.length) : id);
  const moves = under_.map((a) => [a.id, re(a.id)] as [string, string]);
  const list = (l?: string[]) => (l ? l.map(re) : l);
  const keys = <V,>(o?: Record<string, V>, k: (s: string) => string = re) => (o ? Object.fromEntries(Object.entries(o).map(([x, v]) => [k(x), v])) : o);
  const cArea = (k: string) => (k.startsWith("c-area-") ? `c-area-${re(k.slice(7))}` : k);
  // a moved place is never freer than the place it goes under
  const upLv = up ? rec.consent?.levels?.[up.id] ?? rec.hands : undefined;
  const levels = rec.consent?.levels && Object.fromEntries(Object.entries(rec.consent.levels).map(([k, v]) => [re(k), upLv !== undefined && re(k) !== k ? lowerOf(v, upLv) : v]));
  const next: Rec = { ...rec,
    areas: areas.map((a) => (under_.includes(a) ? { ...a, id: re(a.id) } : a)),
    facts: rec.facts?.map((f) => (typeof f.area === "string" ? { ...f, area: re(f.area) } : f)),
    confirmed: keys(rec.confirmed, cArea),
    into: rec.into ? Object.fromEntries(Object.entries(rec.into).map(([k, v]) => [cArea(k), re(v)])) : rec.into,
    asks: rec.asks?.map((c) => ({ ...c, ...(typeof c.id === "string" ? { id: cArea(c.id) } : {}), ...(typeof c.area === "string" ? { area: re(c.area) } : {}),
      ...(c.into && typeof c.into.area === "string" ? { into: { ...c.into, area: re(c.into.area) } } : {}) })),
    // the old ids stay among the made too: a later onboarding that reads the old name again never makes its folder anew
    unchecked: list(rec.unchecked), later: list(rec.later), madeDirs: rec.madeDirs && [...new Set([...rec.madeDirs.map(re), ...rec.madeDirs])], fillDirs: list(rec.fillDirs),
    ...(rec.consent ? { consent: { ...rec.consent, levels } } : {}) };
  for (const k of ["facts", "confirmed", "into", "asks", "unchecked", "later", "madeDirs", "fillDirs"] as const) if (next[k] === undefined) delete next[k];
  return { rec: next, from: p.id, to, moves };
}

// ---- the window ----
let tell: (m: object) => void = () => {};
/** how every face is told (parts/openfor.ts: everyone) */
export function setPlaceFaces(everyone: (m: object) => void): void { tell = everyone; }

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });
const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

export async function runPlaceTool(name: string, args: unknown, turn: TurnCtx = {}, home = homedir()): Promise<ToolResult> {
  const a = (args ?? {}) as Record<string, unknown>;
  if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not changed: those words are not in what the person said this turn. Ask them, and change it when they say so.", true);
  const rec = readRec(home);
  if (!rec?.built) return text("not changed: the person has no Home yet (their record is not there or will not read)", true);
  const write = (r: Rec) => writeWhole(file(home), JSON.stringify(r, null, 2) + "\n", { root: join(home, ".sol", "record") });
  if (name === "place_add") {
    const r = addIn(rec, String(a.name ?? ""), String(a.inside ?? ""), String(a.yes ?? ""));
    if ("why" in r) return text(`not changed: ${r.why}`, true);
    try { write(r.rec); } catch (e) { return text(`not changed: the record could not be written (${(e as Error).message})`, true); }
    tell({ type: "home.record", why: "place_add", id: r.id });
    return text(`made: ${r.rec.areas!.find((x) => x.id === r.id)!.name} is inside ${r.outer} (id ${r.id}). Home shows it now; its folder is made as Home opens.`);
  }
  if (name === "place_move") {
    const r = moveUnder(rec, String(a.place ?? ""), String(a.under ?? ""));
    if ("why" in r) return text(`not changed: ${r.why}`, true);
    // the folder first: none there moves nothing on disk; one in the way stops the move before the record changes
    const base = typeof rec.solHome === "string" && rec.solHome ? rec.solHome : null;
    const src = base && join(base, r.from), dst = base && join(base, r.to);
    const moved = !!(src && dst && isDir(src));
    // a folder already at the new place is the person's own: never taken as this one's, moved onto or not
    if (dst && existsSync(dst)) return text(`not changed: there is already a folder at ${dst}; nothing moved`, true);
    try { if (moved) { mkdirSync(dirname(dst!), { recursive: true }); renameSync(src!, dst!); } }
    catch (e) { return text(`not changed: the folder could not move (${(e as Error).message})`, true); }
    try { write(r.rec); }
    catch (e) { if (moved) try { renameSync(dst!, src!); } catch { /* left where it went: said below */ } return text(`not changed: the record could not be written (${(e as Error).message})`, true); }
    tell({ type: "home.record", why: "place_move", moves: r.moves });
    const nm = r.rec.areas!.find((x) => x.id === r.to)!.name, up = parentOf(r.to), upName = up && r.rec.areas!.find((x) => x.id === up)?.name;
    return text(`moved: ${nm} is ${upName ? `in ${upName}` : "at the top of Home"} (id ${r.to}${r.moves.length > 1 ? `, with ${r.moves.length - 1} place${r.moves.length > 2 ? "s" : ""} under it` : ""})${moved ? "; its folder moved with it" : ""}. Home shows it now.`);
  }
  return text(`unknown tool ${name}`, true);
}

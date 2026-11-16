// The record's four new columns (the design's step 2, 2026-11), read here and nowhere else. Each is optional: not written
// means none, and every record written before this loads as it did. Marco's columns (#630, #633: id, place, contract,
// reads, writes, listens, versions, current) are not touched; `listens` stays the face's list of data names.
//   room    "small" (the worker, today's wall) or "big" (a process of its own in macOS's sandbox, the design's step 3:
//           bigroom.ts)
//   needs   what it needs beyond the wall, five lists and one plain sentence why: domains (hosts it connects to),
//           folders (absolute paths it reads or writes; "~/…" is the person's own home, so a record Sol ships can name
//           a folder in it: expanded at load, and the card shows the path it became), programs (names it runs, through the door), sol (Sol's own tools
//           it calls), keys (names of keys the engine holds for it). A big room says up front what it offers too, so the
//           engine can list its tools to the seats and keep its schedules before its process is started: tools
//           [{ name, description?, args? }] and every [ms, ...]; and screen: true when the programs it runs take pictures
//           of the screen (the sandbox's screen block, RESULT.md 3: the whole screen, every window's title). The big room
//           (step 3, bigroom.ts) holds a block to these; the card (step 4) shows them
//   stores  the names of the data that are its own, under home/data/<id>/<name>.json: read and written without naming
//           them in reads or writes, wound back with its version (step 5). Another block reads them as "<id>/<name>"
//           in its reads; nobody else writes them
//   hears   which kinds on the log it is handed (sol.listen), checked against the kinds' registry (contract/kinds.ts,
//           the `hear` of each row), not a list kept here. Not written: every kind whose row says "open", and none of a
//           seat's four (seat.turn, seat.done, seat.step, seat.sent). Written: exactly those kinds, a seat's included
//           when named. Never a kind whose row says no `hear` (plugin.trouble: two blocks each throwing on the other's
//           trouble would ring forever; the log's own). A name from before the event format v1 (turn, load) is refused
//           with the name it has now. Hearing a seat's kinds is a permission a person presses on the card (the
//           design's step 4, card.ts), in either room
import { homedir } from "node:os";
import { join } from "node:path";
import { HEARD, kindRow, newNames } from "./contract/kinds.js";   // the kinds' registry. No import of kernel.ts here: kernel.ts imports this file

export type ToolDecl = { name: string; description: string; args: Record<string, "string" | "number" | "boolean"> };
export type Needs = { why: string; domains: string[]; folders: string[]; programs: string[]; sol: string[]; keys: string[]; tools: ToolDecl[]; every: number[]; screen: boolean; provides: string[] };
export type Columns = { room: "small" | "big"; needs: Needs | null; stores: string[]; hears: string[] | null };

export const ROOMS = ["small", "big"] as const;
/** the kinds a block may ask to hear: the rows of the registry that say `hear` (contract/kinds.ts) */
export const HEARD_KINDS: readonly string[] = HEARD;
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;              // a data name
const HOST = /^(?=.{1,253}$)(localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62})(?::\d{1,5})?$/;   // a host, a port at most; no scheme, no path, no wildcard
const FOLDER = /^(?:\/|~\/)(?:[^\/\0-\x1f]+\/)*[^\/\0-\x1f]+$/;   // an absolute path or one in the person's home (~/…): no empty, "." or ".." segment, no control character, not the root nor the home itself
const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;  // a program's name, not a path
const TOOL = /^[a-z][a-z0-9_]{0,31}$/;                  // a tool's name (kernel.ts TOOL)
const KEY = /^(?!.*\.(?:json|tmp)$)[a-z0-9][a-z0-9._-]{0,63}$/;   // keys.ts KEY_NAME: never a name ending .json (a key's notes) or .tmp
const MAX = 64, MAX_MS = 2 ** 31 - 1;                   // a list's length at most; a schedule's longest wait (node's timers)
const NEEDS_KEYS = ["why", "domains", "folders", "programs", "sol", "keys", "tools", "every", "screen", "provides"];
/** the kinds of ability a block may provide (the fifth action, "provide a kind of ability"): a seat, so far (step 6) */
export const PROVIDES = ["seat"] as const;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

type Out = { ok: true; columns: Columns } | { ok: false; why: string };
const no = (why: string): Out => ({ ok: false, why: `record.json: ${why}` });
function list(x: unknown, what: string, re: RegExp, say: string): string[] | string {
  if (x === undefined) return [];
  if (!Array.isArray(x) || !x.every((s) => typeof s === "string")) return `${what} is not a list of words`;
  if (x.length > MAX) return `${what} has more than ${MAX} entries`;
  const bad = (x as string[]).find((s) => !re.test(s) || (s.includes("/") && /\/\.\.?(\/|$)/.test(s)));
  return bad === undefined ? [...new Set(x as string[])] : `${what} has "${bad}", which is not ${say}`;
}

/** the four columns as a record declares them (pure but for whose home "~/" is: `me`, the person's own by default); a
 *  column that does not hold is said, and the block is broken with it */
export function columnsOf(r: Record<string, unknown>, me: string = homedir()): Out {
  const room = r.room === undefined ? "small" : r.room;
  if (room !== "small" && room !== "big") return no(`room is "${String(r.room)}", not small or big`);
  const stores = list(r.stores, "stores", NAME, "a data name (lowercase letters, digits, . _ -)");
  if (typeof stores === "string") return no(stores);
  for (const k of ["reads", "writes"] as const) { const both = Array.isArray(r[k]) ? stores.find((s) => (r[k] as unknown[]).includes(s)) : undefined; if (both) return no(`"${both}" is in stores and in ${k}: its own data and the shared pool cannot share a name`); }
  let hears: string[] | null = null;
  if (r.hears !== undefined) {
    const h = list(r.hears, "hears", /^[a-z]+(?:\.[a-z]+)?$/, "a kind");
    if (typeof h === "string") return no(h);
    const bad = h.find((k) => !kindRow(k)?.hear);
    if (bad !== undefined) {
      const now = newNames(bad);   // a name from before the event format v1: said with the name it has now
      if (bad === "plugin.trouble") return no(`hears names "plugin.trouble", which is never handed to a block (two blocks throwing on each other's trouble would ring forever)`);
      if (kindRow(bad)) return no(`hears names "${bad}", which is never handed to a block`);
      if (now.length) return no(`hears names "${bad}", the name a kind had before: it is ${now.join(" or ")} now`);
      return no(`hears names "${bad}", which is not a kind a block can hear (${HEARD_KINDS.join(", ")})`);
    }
    hears = h;
  }
  let needs: Needs | null = null;
  if (r.needs !== undefined) {
    if (!isObj(r.needs)) return no("needs is not an object");
    const n = r.needs;
    const odd = Object.keys(n).find((k) => !NEEDS_KEYS.includes(k));
    if (odd) return no(`needs has "${odd}", which is not one of its columns (${NEEDS_KEYS.join(", ")})`);
    const why = n.why === undefined ? "" : n.why;
    if (typeof why !== "string" || why.length > 300) return no("needs.why is not one plain sentence (300 characters at most)");
    const domains = list(n.domains, "needs.domains", HOST, "a host name (api.github.com, a port at most; no scheme, path or wildcard)");
    const folders0 = list(n.folders, "needs.folders", FOLDER, "an absolute path or one in your home, ~/… (no . or .. segment, not the root)");
    const folders = typeof folders0 === "string" ? folders0 : [...new Set(folders0.map((f) => (f.startsWith("~/") ? join(me, f.slice(2)) : f)))];   // ~/ as the person's home: what is pressed is the path it became
    const programs = list(n.programs, "needs.programs", PROGRAM, "a program's name (gh, not a path)");
    const sol = list(n.sol, "needs.sol", TOOL, "a tool's name");
    const keys = list(n.keys, "needs.keys", KEY, "a key's name");
    for (const l of [domains, folders, programs, sol, keys]) if (typeof l === "string") return no(l);
    const tools: ToolDecl[] = [];
    if (n.tools !== undefined) {
      if (!Array.isArray(n.tools) || n.tools.length > MAX) return no(`needs.tools is not a list (${MAX} at most)`);
      for (const t of n.tools) {
        if (!isObj(t) || typeof t.name !== "string" || !TOOL.test(t.name)) return no("needs.tools has one without a name (lowercase letters, digits and _, starting with a letter)");
        if (tools.some((x) => x.name === t.name)) return no(`needs.tools names ${t.name} twice`);
        if (t.description !== undefined && typeof t.description !== "string") return no(`needs.tools: ${t.name}'s description is not a sentence`);
        if (t.args !== undefined && !isObj(t.args)) return no(`needs.tools: ${t.name}'s args is not an object of name: type`);
        const args: ToolDecl["args"] = {};
        for (const [k, a] of Object.entries(isObj(t.args) ? t.args : {})) {
          if (!TOOL.test(k) || (a !== "string" && a !== "number" && a !== "boolean")) return no(`needs.tools: ${t.name}'s argument ${k} is not string, number or boolean`);
          args[k] = a;
        }
        tools.push({ name: t.name, description: (t.description ?? t.name).slice(0, 500), args });
      }
    }
    let every: number[] = [];
    if (n.every !== undefined) {
      if (!Array.isArray(n.every) || n.every.length > MAX || !n.every.every((ms) => Number.isInteger(ms) && (ms as number) >= 1000 && (ms as number) <= MAX_MS)) return no(`needs.every is not a list of milliseconds (1000 to ${MAX_MS})`);
      every = n.every as number[];
    }
    if (n.screen !== undefined && typeof n.screen !== "boolean") return no("needs.screen is not true or false");
    const screen = n.screen === true;
    const provides = list(n.provides, "needs.provides", /^[a-z]+$/, "a kind of ability");
    if (typeof provides === "string") return no(provides);
    const odd2 = provides.find((x) => !(PROVIDES as readonly string[]).includes(x));
    if (odd2) return no(`needs.provides names "${odd2}", which is not a kind of ability a block provides (${PROVIDES.join(", ")})`);
    const asks = [domains, folders, programs, sol, keys].some((l) => (l as string[]).length) || tools.length || every.length || screen || provides.length;
    if (asks && !why.trim()) return no("needs.why is missing: one plain sentence on why it needs what it names");
    needs = { why, domains: domains as string[], folders: folders as string[], programs: programs as string[], sol: sol as string[], keys: keys as string[], tools, every, screen, provides };
  }
  return { ok: true, columns: { room, needs, stores: stores as string[], hears } };
}

/** whether a block with these columns is handed this event (pure), by the kind's row in the registry: never a kind
 *  with no `hear` (a block's trouble, the log's own); its own list of kinds when it wrote one; else every kind that is
 *  "open" (a seat's step through a block's tool included: tool.call) and none of a seat's own (seat.turn, seat.done,
 *  seat.step, seat.sent) */
export function hearsKind(c: Pick<Columns, "hears">, e: { kind: string }): boolean {
  const hear = kindRow(e.kind)?.hear;
  if (!hear) return false;
  return c.hears ? c.hears.includes(e.kind) : hear === "open";
}

/** where a data name lives and whether this block may touch it (pure): its own (in stores) under its folder; another's
 *  own as "<id>/<name>", read only when named in reads; else the shared pool, by reads and writes */
export type DataPlace = { ok: true; owner: string | null; name: string } | { ok: false; why: string };
export function dataPlace(id: string, rec: { reads?: unknown; writes?: unknown }, c: Pick<Columns, "stores">, op: "read" | "write", what: string): DataPlace {
  const own = /^([a-z0-9][a-z0-9-]{0,63})\/([a-z0-9][a-z0-9._-]{0,63})$/.exec(what);
  if (own) {
    if (own[1] === id) return c.stores.includes(own[2]) ? { ok: true, owner: id, name: own[2] } : { ok: false, why: `${own[2]} is not among the data it stores (${c.stores.join(", ") || "none"})` };
    if (op === "write") return { ok: false, why: `${what} is ${own[1]}'s own data: only ${own[1]} writes it` };
    return Array.isArray(rec.reads) && rec.reads.includes(what) ? { ok: true, owner: own[1], name: own[2] } : { ok: false, why: `${what} is not among the reads its record declares` };
  }
  if (!NAME.test(what)) return { ok: false, why: `"${what}" is not a name (lowercase letters, digits, . _ -)` };
  if (c.stores.includes(what)) return { ok: true, owner: id, name: what };
  const list = op === "read" ? rec.reads : rec.writes;
  if (!Array.isArray(list)) return { ok: false, why: `its record declares no ${op}s` };
  return list.includes(what) ? { ok: true, owner: null, name: what } : { ok: false, why: `${what} is not among the ${op}s its record declares (${list.join(", ") || "none"})` };
}

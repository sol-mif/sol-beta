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
// And three more, for the market later (the v2 design §10 and §12, step M1): kept now so no record has to be rewritten
// then. Each optional, and not part of the columns the kernel acts on: a record without them loads as it did. Behind a
// switch that is off (SOL_RECORD_ORIGIN, originOn below): with it off none of the three is checked or acted on, a record
// that carries them loads as one without them, and a block's print is the one from before them (kernel.ts load).
//   from    where it came from: { kind: "ai" (a person's own AI made it) | "person" (somebody shared it) | "market",
//           who?, ref? }: who made or shared it, and where it was found (the market's "publisher/id"), as said
//   hash    its fingerprint (fingerprint.ts): 64 hex digits. One that does not match its folder is said on the log at
//           load (plugin.altered), not refused: nobody acts on it yet
//   sig     the place for a signature (the team ledger's Ed25519 keys, later): absent or empty, anything else refused
// And one more ask in needs, behind a switch that is off (the v2 design §7.3, step A3): history, the kinds of the log's
// past it reads with sol.since. A list of kinds (["today.pick"]) or { kinds: [...], text: true }: by default it is handed
// each past event's skeleton and a value only when it holds no free text (one that sits on the day's line, log.ts);
// `text: true` asks for the words too (a value file's), on a line of its own on the card. Each kind is a row of the
// registry; it is on the card, needs.why says why, and a record that later names another kind waits for a press again.
// With the switch off (SOL_HISTORY, historyOn) `history` is not one of needs' columns, refused as before it was
// And one more, behind a switch that is off (the v2 design §7.1, step A2): seat, a brain that comes in as a program the
// shell starts and keeps running, speaking ACP on its stdio (acp.ts): { speaks: "acp", start: [program, ...args] }. Only
// with provides ["seat"], in a room of its own (room "big": the launcher walls it as the big room's door walls a run),
// its program a name (not a path) that needs.programs lists. `children: true` beside them says the seat starts other
// programs itself, inside its wall (an agent whose tools are a shell): the files in its own folder and the programs
// needs.programs names; left out, nothing but its own program ever starts. `key` and `keyAs` beside them say the seat
// is started with a key in its environment (an agent that logs in with a token: the key's name, one of needs.keys,
// and the name it has there, as sol.run's): unlike a room, the seat's program holds that key itself. With the switch
// off (SOL_ACP_SEAT, acpSeatOn) `seat` is not one of needs' columns, refused as before it was
import { homedir } from "node:os";
import { join } from "node:path";
import { HEARD, kindRow, newNames } from "./contract/kinds.js";   // the kinds' registry. No import of kernel.ts here: kernel.ts imports this file

export type ToolDecl = { name: string; description: string; args: Record<string, "string" | "number" | "boolean"> };
/** the past a block reads (sol.since): which kinds, and whether the words in their values too */
export type History = { kinds: string[]; text: boolean };
/** a seat the shell starts (needs.seat, step A2): the protocol it speaks and the program with its arguments; children
 *  when it starts other programs inside its wall (its own folder's and those needs.programs names); key and keyAs
 *  when it is started with one of its keys in its environment, under that name */
export type SeatStart = { speaks: "acp"; start: string[]; children?: true; key?: string; keyAs?: string };
export type Needs = { why: string; domains: string[]; folders: string[]; programs: string[]; sol: string[]; keys: string[]; tools: ToolDecl[]; every: number[]; screen: boolean; provides: string[]; history?: History; seat?: SeatStart };
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
/** the switch for reading the past (needs.history, sol.since: step A3), a name of ours; on unless it says off (#691) */
export const HISTORY_ENV = "SOL_HISTORY";
export function historyOn(): boolean {
  const env = (process.env[HISTORY_ENV] ?? "").trim().toLowerCase();
  return !(env === "off" || env === "0" || env === "false");
}
/** the switch for a seat the shell starts and keeps running (needs.seat, acp.ts: step A2), a name of ours; on unless it says off (#691) */
export const ACP_SEAT_ENV = "SOL_ACP_SEAT";
export function acpSeatOn(): boolean {
  const env = (process.env[ACP_SEAT_ENV] ?? "").trim().toLowerCase();
  return !(env === "off" || env === "0" || env === "false");
}
/** the switch for a record's origin (from, hash, sig: step M1), a name of ours; off unless it says on */
export const ORIGIN_ENV = "SOL_RECORD_ORIGIN";
export function originOn(): boolean {
  const env = (process.env[ORIGIN_ENV] ?? "").trim().toLowerCase();
  return env === "on" || env === "1" || env === "true";
}
/** the kinds of ability a block may provide (the fifth action, "provide a kind of ability"): a seat, so far (step 6) */
export const PROVIDES = ["seat"] as const;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** where a block may come from (the record's `from`) */
export const FROM_KINDS = ["ai", "person", "market"] as const;
export type From = { kind: (typeof FROM_KINDS)[number]; who?: string; ref?: string };
/** a fingerprint as a record or an index writes it (fingerprint.ts) */
export const FINGERPRINT = /^[0-9a-f]{64}$/;
const SAID = /^[^\0-\x1f]{1,200}$/;                        // who or ref: one line, 200 characters at most

/** whether `from`, `hash` and `sig` hold where written (pure): null when they do, else what does not */
export function originHeld(r: Record<string, unknown>): string | null {
  if (r.from !== undefined) {
    const why = fromHeld(r.from);
    if (why) return why;
  }
  if (r.hash !== undefined && (typeof r.hash !== "string" || !FINGERPRINT.test(r.hash))) return "hash is not a fingerprint (64 lowercase hex digits)";
  if (r.sig !== undefined && r.sig !== "") return "sig is not used yet: leave it out or empty (signatures come later)";
  return null;
}
/** whether a `from` is one (pure): null when it is, else what does not hold */
export function fromHeld(f: unknown): string | null {
  if (!isObj(f)) return `from is not an object: { kind: ${FROM_KINDS.join(" | ")}, who?, ref? }`;
  const odd = Object.keys(f).find((k) => !["kind", "who", "ref"].includes(k));
  if (odd) return `from has "${odd}", which is not one of its fields (kind, who, ref)`;
  if (!(FROM_KINDS as readonly unknown[]).includes(f.kind)) return `from's kind is "${String(f.kind)}", not ${FROM_KINDS.join(", ")}`;
  for (const k of ["who", "ref"] as const) if (f[k] !== undefined && (typeof f[k] !== "string" || !SAID.test(f[k] as string))) return `from's ${k} is not one line of words (200 characters at most)`;
  return null;
}

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
  const origin = originOn() ? originHeld(r) : null;   // from, hash, sig: checked here so a wrong one breaks the block as a column would; with the switch off, not read
  if (origin) return no(origin);
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
    const keys0 = [...NEEDS_KEYS, ...(historyOn() ? ["history"] : []), ...(acpSeatOn() ? ["seat"] : [])];
    const odd = Object.keys(n).find((k) => !keys0.includes(k));
    if (odd) return no(`needs has "${odd}", which is not one of its columns (${keys0.join(", ")})`);
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
    const history = n.history === undefined ? null : historyOf(n.history);
    if (typeof history === "string") return no(history);
    const seat = n.seat === undefined ? null : seatOf(n.seat, room, provides, programs as string[], keys as string[]);
    if (typeof seat === "string") return no(seat);
    const asks = [domains, folders, programs, sol, keys].some((l) => (l as string[]).length) || tools.length || every.length || screen || provides.length || !!history || !!seat;
    if (asks && !why.trim()) return no("needs.why is missing: one plain sentence on why it needs what it names");
    needs = { why, domains: domains as string[], folders: folders as string[], programs: programs as string[], sol: sol as string[], keys: keys as string[], tools, every, screen, provides, ...(history ? { history } : {}), ...(seat ? { seat } : {}) };
  }
  return { ok: true, columns: { room, needs, stores: stores as string[], hears } };
}

/** the protocols a seat the shell starts may speak: ACP, one pinned version (acp.ts ACP_VERSION) */
export const SPEAKS = ["acp"] as const;
const ARG = /^[^\0-\x1f\x7f]{0,1000}$/;   // one argument: one line, no control character, 1000 characters at most
/** a name in a program's environment, as a seat's key is given one (GH_TOKEN) */
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
/** the names in a seat's environment that are Sol's to set (kernel.ts loadSeat): a key is never put under one */
export const SEAT_ENV = ["HOME", "TMPDIR", "PATH", "HTTPS_PROXY", "HTTP_PROXY", "SSL_CERT_FILE"] as const;
/** needs.seat as written (pure): { speaks: "acp", start: [program, ...args] }, only with provides ["seat"], in room big,
 *  its program one that needs.programs names, children: true when it starts programs of its own, and key with keyAs
 *  when it is started with a key that needs.keys names in its environment; else what does not hold */
function seatOf(x: unknown, room: unknown, provides: string[], programs: string[], keys: string[]): SeatStart | string {
  if (!isObj(x)) return `needs.seat is not { speaks: "acp", start: [program, ...args] }`;
  const odd = Object.keys(x).find((k) => !["speaks", "start", "children", "key", "keyAs"].includes(k));
  if (odd) return `needs.seat has "${odd}", which is not one of its fields (speaks, start, children, key, keyAs)`;
  if (x.children !== undefined && typeof x.children !== "boolean") return "needs.seat's children is not true or false: true when the seat starts other programs inside its wall";
  if (!(SPEAKS as readonly unknown[]).includes(x.speaks)) return `needs.seat speaks "${String(x.speaks)}": a seat the shell starts speaks ${SPEAKS.join(", ")}`;
  const start = x.start;
  if (!Array.isArray(start) || !start.length || start.length > 32 || !start.every((a) => typeof a === "string")) return "needs.seat's start is not a list of words: the program, then its arguments (32 at most)";
  if (!PROGRAM.test(start[0])) return `needs.seat starts "${start[0]}", which is not a program's name (node, not a path)`;
  const bad = (start as string[]).slice(1).find((a) => !ARG.test(a));
  if (bad !== undefined) return "needs.seat's start has an argument that is not one line of words (1000 characters at most)";
  if (!programs.includes(start[0])) return `needs.seat starts ${start[0]}, which needs.programs does not name: the card shows the programs it runs`;
  if (!provides.includes("seat")) return "needs.seat without provides [\"seat\"]: a program started as a seat provides one";
  if (room !== "big") return "needs.seat runs a program beside Sol, walled: its room is big";
  if (x.key === undefined && x.keyAs !== undefined) return "needs.seat's keyAs without a key";
  if (x.key !== undefined) {
    if (typeof x.key !== "string" || !KEY.test(x.key)) return "needs.seat's key is not a key's name";
    if (!keys.includes(x.key)) return `needs.seat's key ${x.key} is not among the keys needs.keys names: the card shows the keys it uses`;
    if (typeof x.keyAs !== "string" || !ENV_NAME.test(x.keyAs)) return "needs.seat's key without a keyAs that is a name in its environment (capital letters, digits and _, starting with a letter: GH_TOKEN)";
    if ((SEAT_ENV as readonly string[]).includes(x.keyAs)) return `needs.seat's keyAs is ${x.keyAs}, which Sol sets itself in a seat's environment`;
  }
  return { speaks: "acp", start: [...(start as string[])], ...(x.children === true ? { children: true as const } : {}), ...(x.key !== undefined ? { key: x.key as string, keyAs: x.keyAs as string } : {}) };
}

/** the log's own kinds, whose past no block reads: an erase (its value is the hash of what was erased, its item that
 *  event's id: a guess at the words could be checked), the engine's start and clock, a block's folder found altered */
const logOwn = (kind: string): boolean => /^(?:log|engine)\./.test(kind) || kind === "plugin.altered";
/** needs.history as written (pure): a list of kinds, or { kinds, text? }; each kind a row of the registry that a block
 *  may hear (its `hear`), never the log's own; a name from before v1 said with the name it has now. Null for one that
 *  names no kind (it asks nothing), else what does not hold */
function historyOf(x: unknown): History | null | string {
  const o = Array.isArray(x) ? { kinds: x } : x;
  if (!isObj(o)) return "needs.history is not a list of kinds, nor { kinds: [...], text: true }";
  const odd = Object.keys(o).find((k) => k !== "kinds" && k !== "text");
  if (odd) return `needs.history has "${odd}", which is not one of its fields (kinds, text)`;
  if (o.text !== undefined && typeof o.text !== "boolean") return "needs.history's text is not true or false";
  const kinds = list(o.kinds, "needs.history", /^[a-z]+(?:\.[a-z]+)?$/, "a kind");
  if (typeof kinds === "string") return kinds;
  const bad = kinds.find((k) => !kindRow(k));
  if (bad !== undefined) {
    const now = newNames(bad);
    return now.length ? `needs.history names "${bad}", the name a kind had before: it is ${now.join(" or ")} now` : `needs.history names "${bad}", which is not a kind on the log (contract/kinds.ts)`;
  }
  const own = kinds.find(logOwn);
  if (own !== undefined) return `needs.history names "${own}", the log's own: what the log does to itself (an erase, a start, a block's altered folder) is read by no block`;
  const deaf = kinds.find((k) => !kindRow(k)!.hear);
  if (deaf !== undefined) return `needs.history names "${deaf}", which is never handed to a block: its past is not read either (a past is read only of a kind whose row in contract/kinds.ts says hear)`;
  return kinds.length ? { kinds: [...kinds].sort(), text: o.text === true } : null;
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

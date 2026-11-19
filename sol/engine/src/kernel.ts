// What every block passes through (#633, freeform #629): one log, the loader for a block's engine half, the gate, one
// undo. Behind the switch `sol.frame` (the engine's reading of it is frameOn() in settings.ts, SOL_FRAME first); with it
// off nothing here runs, nothing is read and nothing is written.
//   the log     append-only, one line per step: a block loaded (plugin.load), released (a new version), broken,
//               unloaded, wound back (undo.did); a seat's step through a block's tool (tool.call); a block's own line;
//               a write; a call the gate refused; and, since the log's step 1 (2026-11), a seat's own steps: a turn
//               begun (seat.turn) and ended with what it cost (seat.done), a tool it used (seat.step, with the file it
//               named and the bytes that came back), a thing Sol handed it (seat.sent): seatlog.ts. Never the words:
//               no prompt, no answer, no command line. Every kind is family.action and has its row in the registry
//               (contract/kinds.ts); a kind with no row is not written. An event is the event format v1 (log.ts): its
//               id is the hash of its body, each names the one before it, and its content, when it holds free text,
//               is in a value file that can be erased (erase() below) without breaking the chain. The log keeps its
//               own event type; the trail's (file-trail.ts Ev and By, which Cowork v3 re-exports) is not changed.
//               Lines written before v1 stay as they are and are read with the names their kinds have now. Read on
//               GET /log?since=<seq>. Only the engine writes it. At start it says what engine writes what follows and
//               in which timezone (engine.start, engine.tz: started() below).
//               It lives outside the home and outside this checkout, where no seat's folder reaches, a file a day
//               (log.ts: ~/Library/Application Support/Sol/log/<home>/<day>.jsonl on a Mac, SOL_LOGDIR first); the
//               newest events stay in memory and older ones are read back from the files; the old place,
//               <home>/log/log.jsonl, is carried over once and then neither read nor written (a seat can write in
//               the home; it was a mirror until logcheck.ts found the two the same, #691). A
//               line that cannot be written is said on the engine's own output and never ends a seat's turn.
//   the loader  at start and on change, every block in the home and every one of Sol's own (Stable, step 7: Sol's code,
//               sol/engine/blocks/<id>/, the same record and engine half; the home's of the same id is found first, unless
//               taken out): the face half stays the face's (frameRules.ts, the places);
//               the engine half (the current version's `engine`, else engine.ts or engine.js beside the record) runs in a
//               worker of its own (kernel-worker.ts), never in this process, and is handed one object, `sol`, its only
//               way to Sol: a tool for the seats, a listener on the log, a schedule, a line, a read, a write. It has a
//               few seconds to load; one that throws, hangs, runs out of memory or ends its worker is broken with its
//               reason, said in its place, and nothing else is down. Unload asks it to run what its load returned, then
//               terminates the worker: whatever the block opened dies with it.
//               A block whose record asks for the big room (step 3, bigroom.ts) runs instead in a process of its own in
//               macOS's sandbox, started when a seat calls one of the tools its record lists, a time it declares comes
//               round or a kind it hears is logged, and put away when idle; it reaches past its wall only through the
//               door (sol.run, sol.fetch, sol.call), and the keys stay here.
//   the gate    passes() below (record.ts dataPlace): every read and write an engine half makes, checked against its
//               record's `reads`, `writes` and `stores`. It is the worker's only door: the worker may not import node:fs, node:net, a package or a
//               file outside its folder, and has no process or fetch (kernel-worker.ts). Outside its record a call is
//               refused and logged; a write that passes is logged, so the face shows it.
//               The card (step 4, card.ts): a block that asks for anything beyond its wall (needs' five lists, the screen,
//               a seat's kinds, a room of its own) waits until a person presses its card on Sol's own page (approve(),
//               POST /things/<id>/approve); the press is kept in Sol's folder, beside the log, and a wider record waits
//               again. Ten refusals in a row mark a block suspect. The install tool (install.ts) loads one now and says
//               how it went.
//   undo        undo() below: the record's `current` one version back, the block unloaded and loaded again, one line.
//   the past    behind a switch, on unless set off (SOL_HISTORY, record.ts historyOn; the v2 design §7.3, step A3): a block reads
//               the log's past with sol.since(from, kinds), in either room, a batch at a time (past() below). Only the
//               kinds its record names in needs.history, which a person pressed on its card; any other is refused and
//               logged as the door's refusals are. It gets each event's skeleton, and its value only when that holds no
//               free text, unless the record asked for the words too (text: true) and that was pressed. No id or hash
//               reaches any block, in the past or in what it hears (pastOf, heardOf; whatever the switch), so a guess
//               cannot be checked: a block's handle on an event is its seq.
// A tool call is checked against the block's life before it is sent and again when its answer comes back: an answer
// from a block unloaded meanwhile is dropped, and unload ends the call with the worker.
import { readFileSync, renameSync, writeFileSync, existsSync, mkdirSync, realpathSync, lstatSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { platform, release, tmpdir, homedir } from "node:os";
import { Worker, MessageChannel, type MessagePort } from "node:worker_threads";
import { z } from "zod";
import type { By } from "./file-trail.js";   // who wrote an event: the shape the team trail and Cowork v3 use (not changed here)
import { openLog, logDir, logFile, PAGE, HOME, type LogPort, type LogEv, type AnyEv, type Via, type Ctx } from "./log.js";   // the log: its place, a file a day, the event (v1) and its value files, the old file carried over once (log.ts)
import { kindRow, placeOf, KINDS_PRINT, SEAT_KINDS } from "./contract/kinds.js";   // the kinds the log takes (the registry)
import { frameOn, onFrame, onPatch } from "./settings.js";   // the frame's switch, read and heard (kernelFollows)
import { versionNow } from "./version.js";   // the release and the commit this engine runs, once read (engine.start)
import { execFileSync } from "node:child_process";   // the checkout's HEAD, read once at start (engine.start)
import { canonical } from "./canonical.js";   // the one way an object is written before it is hashed (a block's print with the origin's switch off)
import { columnsOf, hearsKind, dataPlace, historyOn, originOn, type Columns } from "./record.js";   // the record's four new columns (step 2): room, needs, stores, hears
import { readThings, readFolder, readIn, type ThingWire } from "./things.js";
import { currentOf, engineFileOf, ENGINE_FILE, fingerprintOf } from "./fingerprint.js";   // which version is current, its engine half, and the whole block's print (§10 `hash`, step M1)
import { isHelper, helperFor, helperHere } from "./helpers.js";   // Sol's own small programs, built here (step 7)
import { Room, BIG, type Limits, type Proxy, appDir, folderClash, redact, findProgram, bigRoomHere, runRefusal, runBeside, fetchRefusal, fetchFor, takesPictures, openProxy, profileOf } from "./bigroom.js";   // the big room (step 3)
import { startAcp, SECRET_MIN, type AcpSeat } from "./acp.js";   // a seat the shell starts and keeps running, speaking ACP (step A2)
import { writeWhole, plainIn } from "./safewrite.js";
import { carry, stamp, newerThan, forgetCopies } from "./dataundo.js";
import { registerSeat, unregisterSeat, convoId, type SeatResult } from "./seats.js";   // a block that provides a seat (step 6)   // a block's own data goes back with its version (step 5)
import { readKey, haveKey, keyMeta, noteUser, noteScope, listKeys, type KeyMeta } from "./keys.js";
import { askOf, asksAny, cardOf, readPress, writePress, forgetPress, widerThan, homeKey, OUTWARD, type Waiting } from "./card.js";   // the card and the press (step 4)
import type { ToolResult } from "./browser.js";
import { logKinds } from "./settings.js";   // the narrow look's switch: a page or an ask edited in place is said (plugin.edited, #691 step 3)

/** the log's one project in the trail: the home */
export const LOG_PROJECT = HOME;
export { logDir, logFile } from "./log.js";   // where the log lives, and its old place (carried over once)
const ENGINE: By = { person: "engine" };
/** the seats the log knows, by name: Home's two, Work (one Claude Code per session), and a seat the shell starts for a
 *  block (seat:<id>, acp.ts: step A2), named as a seat's step through a block's tool names it */
export type SeatName = "claude" | "codex" | "work" | `seat:${string}`;
/** tokens as the seats report them: in, out, read from and written to the cache */
export type Tokens = { in: number; out: number; cacheRead?: number; cacheWrite?: number };
/** the seats' own kinds on the log (seatlog.ts) */
export type SeatKind = "seat.turn" | "seat.done" | "seat.step" | "seat.sent" | "seat.usage";

export type Arg = "string" | "number" | "boolean";
/** a tool a block registered, as a seat sees it: thing_<id>_<name> (it runs in the block's worker) */
export type ThingTool = { block: string; name: string; description: string; args: Record<string, Arg> };
/** what GET /things says of a block's engine half; room (step 2) only when its record asked for the big one */
export type EngineState = { state: "none" | "loaded" | "broken"; why?: string; v?: number; tools: string[]; wrote?: { what: string; at: number }; room?: "big"; awake?: boolean; suspect?: true; off?: true; newer?: string[] };
/** what an engine half is handed, in its worker: its only way to Sol */
export type Sol = {
  id: string;
  tool(def: { name: string; description?: string; args?: Record<string, Arg>; run: (args: Record<string, unknown>) => unknown }): void;
  listen(f: (e: LogEv) => void): void;
  every(ms: number, f: () => void): void;
  log(line: string): void;
  read(what: string): unknown;
  write(what: string, value: unknown): void;
  /** the log's past (step A3): only with its switch on, and only the kinds its record names in needs.history */
  since?(from: number, kinds?: string[]): Past;
};
/** one batch of the past: the events, oldest first, and the seq to ask from next (null: the end) */
export type Past = { events: Record<string, unknown>[]; next: number | null };
/** how many events one sol.since hands back at most, and how many it looks through at most to find them */
export const SINCE_BATCH = 500;
const SINCE_SCAN = PAGE;

/** what of a past event a block is handed besides its value: its skeleton. Never `hash` (the value's SHA-256), nor `id`,
 *  `prev` or `cause` (ids: each is a hash over a body that holds a value's hash, and the chain runs through them), so a
 *  value held back or erased cannot be confirmed by hashing a guess; `seq` is the block's handle on an event */
const PAST_KEYS = ["v", "seq", "at", "kind", "kv", "old", "item", "field", "by", "via", "ctx", "mode"] as const;
/** an event's id, or a value's hash, as the log writes them (log.ts sha): 64 hex digits */
const HASHED = /^[0-9a-f]{64}$/;
/** a past event as a block is handed it (pure): its skeleton (PAST_KEYS), and its value only when that holds no free
 *  text (it sits on the day's line: contract/kinds.ts placeOf) or the words were asked for and pressed (`text`). A value
 *  held back says `withheld: true`; an erased one `erased: true`, as GET /log. An `item` that is an event's id is left
 *  out, and an erase's value (the hash of what it erased) is never handed, words or not: record.ts refuses the log's own
 *  kinds in needs.history, and this holds whatever a record says */
export function pastOf(e: AnyEv, text: boolean): Record<string, unknown> {
  const { value, erased } = e as AnyEv & { value?: unknown; erased?: true };
  const out: Record<string, unknown> = {};
  for (const k of PAST_KEYS) if ((e as Record<string, unknown>)[k] !== undefined) out[k] = (e as Record<string, unknown>)[k];
  if (typeof out.item === "string" && HASHED.test(out.item)) delete out.item;
  if (value === undefined) return erased ? { ...out, erased: true } : out;
  if (e.kind === "log.erase") return { ...out, withheld: true };
  return text || placeOf(e.kind, value) === "line" ? { ...out, value } : { ...out, withheld: true };
}
/** a heard event as every block is handed it, in either room (pure): without its id, prev, hash and cause, and without
 *  an `item` that is an event's id; `seq` is its handle on an event. Any block: one that hears could otherwise pass the
 *  chain's ids to one that reads the past (through shared data), which could then rebuild a held-back event's id from a
 *  guess at its value and check the guess. A person's own record that a block hears only after a press (a `card` kind
 *  that is not a seat's: today.pick) keeps its words back as the past does (pastOf): its value is handed only when it
 *  holds no free text, or the record asked for the words of that kind (needs.history text: true) and that was pressed */
export function heardOf(e: LogEv, text = false): Record<string, unknown> {
  const { id: _id, prev: _prev, hash: _hash, cause: _cause, ...rest } = e;
  const out: Record<string, unknown> = { ...rest };
  if (typeof out.item === "string" && HASHED.test(out.item)) delete out.item;
  if (kindRow(e.kind)?.hear !== "card" || SEAT_KINDS.includes(e.kind) || e.value === undefined) return out;
  if (text || placeOf(e.kind, e.value) === "line") return out;
  delete out.value;
  return { ...out, withheld: true };
}

export class GateError extends Error {}

/** Sol's own blocks (Stable, step 7): in Sol's code beside src/ and dist/, read only, never written by the engine */
export const STABLE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "blocks");
/** the engine's own folder (sol/engine), in the checkout it runs from */
const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** the press of one of Sol's own blocks is kept under its own name: a block in the home of the same id, written by an
 *  AI, never inherits the person's yes to Sol's (a "." is in no block's id) */
const pressId = (b: { id: string; stable: boolean }) => (b.stable ? `stable.${b.id}` : b.id);
/** a thing as the loader finds it: where its folder is, and whether it is one of Sol's own */
type Found = ThingWire & { dir: string; stable: boolean };

/** the worker each engine half runs in: tsc's .js beside this file in dist, the .ts as written under tsx */
const WORKER = new URL(import.meta.url.endsWith(".ts") ? "./kernel-worker.ts" : "./kernel-worker.js", import.meta.url);
/** what runs first in a big room's process, the same way (bigroom-host.ts) */
const HOST = new URL(import.meta.url.endsWith(".ts") ? "./bigroom-host.ts" : "./bigroom-host.js", import.meta.url);
/** Sol's own tools, for a big room that names them in needs.sol: tools.ts hands its runner over (tools.ts imports this file) */
let solTools: ((name: string, args: unknown) => Promise<ToolResult>) | null = null;
/** their names, for the gate's "declared exists" (a record naming a tool Sol has not got is said at load); null: not known */
let solNames: Set<string> | null = null;
export const useSolTools = (f: typeof solTools, names?: string[]) => { solTools = f; solNames = names ? new Set(names) : null; };
/** Sol's tools a block may never call: a block's own (thing_*) and the install tool (a block does not install blocks) */
const NOT_FOR_BLOCKS = (tool: string) => tool.startsWith("thing_") || tool === "things";
/** how many refusals in a row mark a block as suspect, in its place (the design's gate, "how a refusal is said") */
export const SUSPECT_AFTER = 10;
/** how long a seat a block provides has for one task: an AI's turn, not a tool's call */
export const SEAT_MS = 10 * 60_000;
/** what the install tool answers: done, done once a seat starts its next conversation, or failed with why */
export type Installed = { status: "done" | "restart" | "failed"; say: string; state?: EngineState };
/** a worker's ceiling: a block that wants more memory than this is stopped, and broken */
const LIMITS = { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, codeRangeSizeMb: 16, stackSizeMb: 4 };

/** the shared pool's rule (pure, #633): may this block read or write this name, by its record's reads and writes? The door
 *  (passes) uses record.ts dataPlace, which holds this rule and adds a block's own data (stores) */
export function gate(rec: { reads?: unknown; writes?: unknown }, op: "read" | "write", what: string): { ok: true } | { ok: false; why: string } {
  const list = op === "read" ? rec.reads : rec.writes;
  if (!Array.isArray(list)) return { ok: false, why: `its record declares no ${op}s` };
  return list.includes(what) ? { ok: true } : { ok: false, why: `${what} is not among the ${op}s its record declares (${list.join(", ") || "none"})` };
}

const TOOL = /^[a-z][a-z0-9_]{0,31}$/;
export const toolName = (block: string, name: string) => `thing_${block}_${name}`;

// ---- a seat the shell starts: what its wall opens beyond a big room's run (loadSeat) ----
/** what a real agent needs inside the wall to start and to reach its service, found by walling real ones (codex-acp
 *  2.6.0 and 0.16.0, 2026-11-11), each line the narrowest that did it: the certificate service (as a big room's run
 *  has); who the person is (the user lookup: an agent asks whose home it is in before it opens a conversation. That
 *  service answers what the account database holds of every account and group of this Mac, so a seat can also learn
 *  their names and numbers, the person's full name, each one's shell and home path and who is in which group, the
 *  administrators among them: never what is in a home); /etc, /tmp and /var as the links they are (their names,
 *  not what is in them); and the system's own tables of languages and time zones (/usr/share/icu, read only, the same
 *  on every Mac of its version, nothing of the person's: without them Claude Code's program, started by
 *  claude-agent-acp 0.106.0, waits for ever before its first answer, 2026-11-11) */
const SEAT_MORE = [
  `(allow mach-lookup (global-name "com.apple.trustd.agent"))`,
  `(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))`,
  `(allow file-read-metadata (literal "/etc") (literal "/tmp") (literal "/var"))`,
  `(allow file-read* (subpath "/usr/share/icu"))`,
];
/** the system's own file of root certificates, read only and named to the seat as SSL_CERT_FILE: with it an agent
 *  checks its service's certificate itself, and the keychain's services stay shut to it */
const SEAT_CERTS = "/private/etc/ssl/cert.pem";
/** the declared folders in the person's home, linked at the same place in a seat's scratch home: a program that keeps
 *  its login in ~/.name finds the folder its record was given, and nothing else of the home. Made before the seat
 *  starts, in a scratch folder that is new and nobody's yet. A folder inside another declared one is reached through
 *  that one's link */
function linkHome(own: string, folders: string[], me: string): void {
  let home: string;
  try { home = realpathSync(me); } catch { return; }
  const inside = (a: string, b: string) => a.startsWith(b.endsWith("/") ? b : b + "/");
  for (const f of folders) {
    if (!inside(f, home) || folders.some((g) => g !== f && inside(f, g))) continue;
    const at = join(own, f.slice(home.length).replace(/^\/+/, ""));
    mkdirSync(dirname(at), { recursive: true, mode: 0o700 });
    symlinkSync(f, at);
  }
}
/** a seat's scratch folder gone, and only it: a link in it is removed and never followed (the folder it led to stays,
 *  with all that is in it), whatever the seat made of its scratch folder meanwhile, the folder itself a link included.
 *  No path inside it is walked by name here: the seat wrote there, and a name of its choosing is not gone after.
 *  One it made so it cannot be removed (a folder nobody may open, a hidden child still writing after three tries) is
 *  left where it is, in the temporary folder, said on the engine's own output: taking a seat out never fails on it */
function dropScratch(own: string): void {
  try { rmSync(own, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); }
  catch (e) { console.error(`a seat's scratch folder could not be removed and is left there (${own}): ${e instanceof Error ? e.message : "?"}`); }
}
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

type Answer = { ok: boolean; value?: string; why?: string };
/** one load of a block: its worker and what it registered; `live` until it is unloaded or broken, `closing` while its unload runs */
type Life = {
  worker: Worker | null; reply: MessagePort | null; flag: Int32Array | null;
  tools: Map<string, ThingTool>; listens: boolean; live: boolean; closing: boolean;
  calls: Map<number, (a: Answer) => void>; closed: (() => void) | null;
  lines: number; lineAt: number;   // its lines this second (the loop breaker)
  room: Room | null; timers: NodeJS.Timeout[];   // a big room's process and the times the engine counts for it (step 3)
  stop: AbortController; doing: Set<Promise<unknown>>;   // a big room's errands through the door (a run, a request): ended with it, said before its unload line (step 0b)
  seat?: { acp: AcpSeat; proxy: Proxy; own: string } | null;   // a seat the shell started for it, kept running (acp.ts, step A2)
};
/** how many lines a block may write in one second before it is broken as a loop */
export const LINES_A_SECOND = 100;
type Block = { id: string; dir: string; stable: boolean; print: string; pkg: string | null; v: number | null; state: EngineState; life: Life; record: Record<string, unknown> | null; columns: Columns | null; waiting: Waiting | null; since: number };
/** what a worker says, over its port */
type Said = { t: string; line?: string; name?: string; description?: string; args?: Record<string, unknown>; what?: string; value?: unknown; where?: string; why?: string; call?: number; ok?: boolean; from?: unknown; kinds?: unknown };

/** the format's second half (the design's gate): every version the record lists is a whole one, its face file there and
 *  its engine half, when it names one, beside it. Null when they hold, else what does not */
export function versionsHeld(dir: string, r: Record<string, unknown>): string | null {
  const vs = Array.isArray(r.versions) ? r.versions : null;
  if (!vs || !vs.length) return "record.json: versions is not a list of versions";
  const seen = new Set<number>();
  for (const x of vs) {
    if (!isObj(x) || !Number.isInteger(x.v) || (x.v as number) < 1) return "record.json: a version without a whole number v";
    if (seen.has(x.v as number)) return `record.json: version ${x.v} is listed twice`;
    seen.add(x.v as number);
    if (x.file !== undefined) {
      if (typeof x.file !== "string" || !/^v\d+\.html$/.test(x.file)) return `record.json: version ${x.v}'s file "${String(x.file)}" is not vN.html`;
      try { if (readIn(dir, x.file) === null) return `version ${x.v}'s file ${x.file} is not beside the record`; } catch (e) { return `version ${x.v}'s file: ${(e as Error).message}`; }
    }
    if (x.engine !== undefined) {
      if (typeof x.engine !== "string" || !ENGINE_FILE.test(x.engine)) return `record.json: version ${x.v}'s engine "${String(x.engine)}" is not a file name beside the record (.ts or .js)`;
      try { if (readIn(dir, x.engine) === null) return `version ${x.v}'s engine half ${x.engine} is not beside the record`; } catch (e) { return `version ${x.v}'s engine half: ${(e as Error).message}`; }
    }
  }
  return null;
}

export type KernelOptions = {
  now?: () => number;
  /** how long an engine half has to load before it is stopped and broken */
  loadMs?: number;
  /** how long a seat waits for a tool's answer */
  callMs?: number;
  /** how long what a load returned has to run at unload before the worker is terminated anyway */
  closeMs?: number;
  /** where the log's folder is: the live kernel's is logDir(home), decided by syncKernel when the frame is on; a test
   *  gives its own. A kernel given none is not made (no place of the machine's is a default here) */
  logDir?: string;
  /** the old file carried over once into an empty log (default <home>/log/log.jsonl); null for none */
  old?: string | null;
  /** Sol's own folder, where the presses and the keys are: the live kernel's is appDir() (SOL_APPDIR, else
   *  ~/Library/Application Support/Sol), decided by syncKernel when the frame is on; a test gives its own. Required, as logDir */
  appDir?: string;
  /** the big room's limits (default BIG in bigroom.ts) */
  big?: Partial<Limits>;
  /** Sol's own blocks (Stable, step 7): the live kernel's is STABLE_DIR; none when not given (a test gives its own) */
  stable?: string | null;
  /** whose home "~/" in a record's folders is (default the person's own, os.homedir()) */
  me?: string;
  /** a seat the shell starts: how long it has to open a conversation or set one of its options (default two minutes), and
   *  with children the most processes it may have at once before it is stopped (default 200) */
  seat?: { answerMs?: number; kidsMax?: number };
  /** the timezone the engine is in now (default this machine's); a test gives its own, to cross one */
  zone?: () => Zone;
  /** whether a page or an ask.md edited in place (plugin.edited), and a tool a block registers after its load
   *  (plugin.tools), are said on the log: the narrow look's switch, read each time (settings.ts logKinds, #691 step 3;
   *  syncKernel's); none, never */
  edits?: () => boolean;
};
/** a timezone as the log says it: its name, and the minutes local time is ahead of UTC */
export type Zone = { tz: string; offset: number };
// at UTC the minus gives -0, which the log's file reads back as 0: said as 0, so what is held is what is written
const zoneNow = (): Zone => ({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, offset: -new Date().getTimezoneOffset() || 0 });
/** what an event may say beyond its kind, its item and its value (log.ts) */
/** what an append may say besides its kind, item, value and writer. `at`: the time it happened, when its writer judged
 *  it at a time it was handed (a way's draft, way-own.ts); else the log's clock */
export type More = { cause?: string; ctx?: Ctx; via?: Via; field?: string; mode?: "record" | "replay"; at?: number };

export class Kernel {
  readonly log: LogPort;
  private blocks = new Map<string, Block>();
  private timer: NodeJS.Timeout | null = null;
  private busy: Promise<void> = Promise.resolve();
  private last = 0;
  private calls = 0;
  private readonly loadMs: number;
  private readonly callMs: number;
  private readonly closeMs: number;
  private readonly app: string;
  private readonly logDir: string;
  private readonly big: Limits;
  /** refusals in a row, by block (reset by a call that passes, a press, an install) */
  private refusals = new Map<string, number>();
  /** by block, the version it runs at and the log's seq when that version became current (what went out since counts) */
  private versionAt = new Map<string, { v: number; seq: number }>();
  private readonly now: () => number;
  private readonly stable: string | null;
  private readonly me: string | undefined;
  private readonly seatLimits: { answerMs: number; kidsMax: number };
  private readonly zone: () => Zone;
  /** the timezone last said on the log, and when it was last looked at; null until started() */
  private zoneSaid: (Zone & { at: number }) | null = null;
  private readonly edits: () => boolean;
  /** by block, the print of its page and its ask.md as last looked at (plugin.edited) */
  private faces = new Map<string, string>();

  constructor(readonly home: string, o: KernelOptions = {}) {
    // the machine's own places are chosen only where the frame is turned on (syncKernel), so a kernel made anywhere else
    // (a test that forgot its folders) fails here, before it writes a line, instead of writing into the person's own
    if (!o.logDir || !o.appDir) throw new Error("a kernel is given its log's folder and Sol's own folder (logDir, appDir): syncKernel decides them, with the frame on");
    this.logDir = o.logDir;
    this.log = openLog(this.logDir, o.old === undefined ? logFile(home) : o.old, o.now);
    this.last = this.log.last();
    this.loadMs = o.loadMs ?? 5000;
    this.edits = o.edits ?? (() => false);
    this.callMs = o.callMs ?? 30_000;
    this.closeMs = o.closeMs ?? 1000;
    this.app = o.appDir;
    this.big = { ...BIG, ...o.big };
    this.now = o.now ?? Date.now;
    this.stable = o.stable ?? null;
    this.seatLimits = { answerMs: o.seat?.answerMs ?? 120_000, kidsMax: o.seat?.kidsMax ?? 200 };
    this.me = o.me;
    this.zone = o.zone ?? zoneNow;
  }

  /** every block the loader looks at: the home's (My Sol) and Sol's own (Stable), by id, the home's first. One in the
   *  home that is taken out (off) leaves Sol's of the same id in its place: back to Sol as it came is Sol's own blocks on */
  private found(): Found[] {
    const mine: Found[] = readThings(this.home).map((t) => ({ ...t, dir: join(this.home, "things", t.id), stable: false }));
    if (!this.stable) return mine;
    const shown = new Map(mine.map((t) => [t.id, t]));
    for (const t of readFolder(this.stable)) {
      try { if (lstatSync(join(this.stable, t.id)).isFile()) continue; } catch { continue; }   // a file beside the blocks (README.md) is not one
      const m = shown.get(t.id);
      if (!m || (isObj(m.record) && m.record.off === true)) shown.set(t.id, { ...t, dir: join(this.stable, t.id), stable: true });
    }
    return [...shown.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  /** Sol's own blocks taken out here (the install tool's remove): kept in Sol's folder, by home, since Sol's code is never written */
  private stableFile(): string { return join(this.app, "stable", `${homeKey(this.home)}.json`); }
  private stableOff(): string[] {
    try { const o = JSON.parse(readFileSync(this.stableFile(), "utf8")); return Array.isArray(o?.off) ? o.off.filter((x: unknown) => typeof x === "string") : []; } catch { return []; }
  }
  private setStableOff(off: string[]): void {
    mkdirSync(this.app, { recursive: true, mode: 0o700 });
    writeWhole(this.stableFile(), JSON.stringify({ off: [...new Set(off)].sort() }, null, 2) + "\n", { root: this.app });
  }
  /** Sol's own blocks as they stand (GET /things `stable`: the face has no place for them yet, so the card is reached here) */
  stableBlocks(): { id: string; engine: EngineState; waiting?: Waiting }[] {
    return [...this.blocks.values()].filter((b) => b.stable).map((b) => ({ id: b.id, engine: b.state, ...(b.waiting ? { waiting: b.waiting } : {}) }));
  }

  /** one line on the log (a kind with a row in contract/kinds.ts, or it throws); every other block that listens hears
   *  it, in its worker. What a block did itself (by its own name) and a seat's call through its tool say `via`: the
   *  block, its version, the print of what was loaded */
  append(kind: string, item?: string, value?: unknown, by: By = ENGINE, more: More = {}): LogEv {
    this.tzCheck();
    const b = item !== undefined ? this.blocks.get(item) : undefined;
    const via = more.via ?? (b && b.v !== null && b.pkg && (by.agent === b.id || kind === "tool.call") ? { plugin: b.id, pv: b.v, pkg: b.pkg } : undefined);
    const e = this.log.append({ by, kind, ...(item !== undefined ? { item } : {}), ...(value !== undefined ? { value } : {}), ...more, ...(via ? { via } : {}) });
    this.last = e.seq;
    this.hand(e, by.agent);
    for (const f of this.ears) { try { f(e); } catch { /* the engine's own ear: never the log's trouble */ } }
    return e;
  }
  /** the engine began (syncKernel): one engine.start with what wrote the lines that follow (the release, the commit
   *  it sits on and how many commits of its own are over it, the checkout's HEAD, the registry's print, the system,
   *  node, the timezone),
   *  then engine.tz; and engine.tz again whenever the timezone
   *  is another (looked at with a line being written, a minute apart at most), so a reader finds what local time an
   *  event was written at by the newest engine.tz before it */
  started(about: { release?: string; commit?: string; mine?: number; head?: string } = {}): void {
    const z = this.zone();
    this.zoneSaid = { ...z, at: this.now() };
    this.append("engine.start", undefined, { ...(about.release ? { release: about.release } : {}), ...(about.commit ? { commit: about.commit } : {}), ...(about.mine ? { mine: about.mine } : {}), ...(about.head ? { head: about.head } : {}), kinds: KINDS_PRINT, os: `${platform()} ${release()}`, node: process.version, tz: z.tz, offset: z.offset });
    this.append("engine.tz", undefined, z);
  }
  private tzCheck(): void {
    const said = this.zoneSaid, at = this.now();
    if (!said || at - said.at < 60_000) return;
    said.at = at;
    const z = this.zone();
    if (z.tz === said.tz && z.offset === said.offset) return;
    this.zoneSaid = { ...z, at };
    this.append("engine.tz", undefined, z);
  }
  /** a content erased from the log (log.ts erase): its value file gone, one log.erase line saying which event and who */
  erase(id: string, by: By = { person: "person" }): LogEv {
    const e = this.log.erase(id, by);
    this.last = e.seq;
    return e;
  }
  /** the engine's own ear on the log: a part of the engine told of every line as it is written. Nothing listens today
   *  (sticky.ts did, to tell the faces when Sol's own sticky note wrote its note; it went with main's #729) */
  private ears = new Set<(e: LogEv) => void>();
  heard(f: (e: LogEv) => void): () => void { this.ears.add(f); return () => { this.ears.delete(f); }; }
  /** a seat's own step on the log (seat.turn, seat.done, seat.step, seat.sent): by the seat, the conversation in the
   *  value and in ctx, never its words. Handed only to a block whose record names the kind in `hears` (step 2): a day
   *  of a seat's steps would drown the rest */
  seat(kind: SeatKind, seat: SeatName, value: Record<string, unknown>): LogEv {
    this.tzCheck();
    const e = this.log.append({ by: { person: "seat", agent: seat }, kind, value, ...(typeof value.session === "string" ? { ctx: { session: value.session } } : {}) });
    this.last = e.seq;
    this.hand(e);
    return e;
  }
  /** an event to every live block that listens and hears its kind (record.ts hearsKind); never to the block that wrote it */
  private hand(e: LogEv, from?: string) {
    if (!kindRow(e.kind)?.hear) return;   // a kind no block is handed (the registry): a block's trouble, the log's own
    for (const b of this.blocks.values()) {
      if (b.id === from || !b.life.live) continue;   // a block never hears itself: no loop of one
      const h = b.columns?.needs?.history;
      const heard = heardOf(e, !!h?.text && h.kinds.includes(e.kind));   // no block hears an id; a person's record without its words (step A3)
      if (b.life.room) { if (b.columns?.hears?.includes(e.kind)) b.life.room.event(heard); continue; }   // a big room hears only the kinds it named, kept while it is put away
      if (!b.life.listens || !hearsKind(b.columns ?? { hears: null }, e)) continue;
      b.life.worker?.postMessage({ t: "ev", e: heard });
    }
  }
  /** the events after a seq, the newest from memory, older ones read from the files, at most PAGE at a time (log.ts) */
  since(seq = 0): AnyEv[] { return this.log.since(LOG_PROJECT, seq); }
  /** whether a since() answer was cut at a page: the reader asks again from its last seq */
  static readonly PAGE = PAGE;
  lastSeq(): number { return this.last; }

  /** whether the block loaded under this id is Sol's own (Stable), not the home's */
  isStable(id: string): boolean { return !!this.blocks.get(id)?.stable; }
  /** Sol's own block of this id is loaded with this tool: what a press of the person's in Sol's own window may be handed
   *  to (file it's button). A block of the same id in the home never is: nobody pressed for it to stand in for Sol's */
  solOwnReady(id: string, tool: string): boolean {
    const b = this.blocks.get(id);
    return !!b?.stable && b.life.live && b.state.state === "loaded" && b.state.tools.includes(toolName(id, tool));
  }
  /** what each block's engine half is doing now, by id */
  state(id: string): EngineState | undefined { return this.blocks.get(id)?.state; }
  /** the card a block waits on, for GET /things (`waiting`): null when it waits for nobody */
  waiting(id: string): Waiting | null { return this.blocks.get(id)?.waiting ?? null; }
  /** every key's notes (GET /keys), its users being the blocks pressed to use it and those in the home that name it now */
  keys(): KeyMeta[] { return listKeys(this.app).map((m) => ({ ...m, users: [...new Set([...m.users, ...this.keyUsers(m.name)])].sort() })); }
  /** which blocks in the home name a key (the card says a key given to two) */
  private keyUsers(name: string): string[] {
    const off = new Set(this.stable ? this.stableOff() : []);
    return this.found().filter((t) => { if (!isObj(t.record) || t.record.off === true || (t.stable && off.has(t.id))) return false; const c = columnsOf(t.record, this.me); return c.ok && !!c.columns.needs?.keys.includes(name); }).map((t) => t.id);   // read from the home and Sol's own: a block not loaded yet counts too
  }
  /** every tool the loaded blocks registered */
  tools(): ThingTool[] { return [...this.blocks.values()].filter((b) => b.life.live).flatMap((b) => [...b.life.tools.values()]); }

  /** read the home's things and bring each block in line: a changed one unloaded and loaded again, a gone one unloaded */
  sync(): Promise<void> {
    this.busy = this.busy.then(() => this.syncNow(), () => this.syncNow());
    return this.busy;
  }

  private async syncNow(): Promise<void> {
    const things = this.found();
    const seen = new Set<string>();
    for (const t of things) {
      seen.add(t.id);
      const print = this.printOf(t);
      const had = this.blocks.get(t.id);
      const face = this.faceOf(t), was = this.faces.get(t.id);
      this.faces.set(t.id, face);
      if (had && had.print === print) {
        // the page or the ask changed and nothing else: no load, so said on its own, for the face's narrow look
        if (was !== undefined && was !== face && this.edits()) {
          const [p0, a0] = was.split(":"), [p1, a1] = face.split(":");
          this.append("plugin.edited", t.id, { page: p0 !== p1, ask: a0 !== a1 });
        }
        continue;
      }
      if (had) await this.unload(had, "changed");
      if (had && !had.stable && t.stable && !readThings(this.home).some((x) => x.id === t.id)) forgetPress(this.app, this.home, had.id);   // the home's is gone and Sol's own is in its place: one written there later is asked again (one taken out keeps its press)
      await this.load(t, print, had && had.stable === t.stable ? had.v : null);
    }
    for (const b of [...this.blocks.values()]) if (!seen.has(b.id)) {
      await this.unload(b, "gone from the home");
      this.blocks.delete(b.id);
      this.faces.delete(b.id);
      forgetPress(this.app, this.home, pressId(b));   // a block written later under the same id is asked again
      try { forgetCopies(this.home, b.id, this.now()); } catch { /* nothing kept, or not ours to move */ }   // and starts with none of the old one's copies
    }
  }

  /** a block's face as the face reads it on GET /things: its current page and its ask.md, a short hash each */
  private faceOf(t: Found): string {
    const h = (x: string | null) => createHash("sha256").update(x ?? "\u0000").digest("hex").slice(0, 16);
    return `${h(t.html)}:${h(t.ask)}`;
  }

  /** a block's fingerprint: its record and its engine half as written; a change in either loads it again */
  private printOf(t: Found): string {
    const h = createHash("sha256").update(t.error ?? JSON.stringify(t.record)).update(`${t.stable ? "stable" : "mine"}:${t.dir}`);
    try {
      if (t.stable) h.update(`off:${this.stableOff().includes(t.id)}`);   // taken out or put back: it loads again
      const r = isObj(t.record) ? t.record : null, cur = r && currentOf(r);
      const f = cur && engineFileOf(t.dir, cur.entry);
      if (f) h.update(readIn(t.dir, f) ?? "");
      const c = r ? columnsOf(r, this.me) : null;
      if (c?.ok && asksAny(askOf(c.columns))) {   // a press, a key pasted or taken away: it loads again
        h.update(JSON.stringify(readPress(this.app, this.home, pressId(t))));
        for (const k of c.columns.needs?.keys ?? []) h.update(`${k}:${haveKey(this.app, k)}`);
        const held = c.columns.needs?.seat?.key;   // a seat holds its key from its start: another pasted in its place starts it again
        if (held) h.update(`seat:${held}:${keyMeta(this.app, held)?.added ?? 0}`);
      }
    } catch (e) { h.update(String(e)); }
    return h.digest("hex");
  }

  private async load(t: Found, print: string, was: number | null): Promise<void> {
    const life: Life = { worker: null, reply: null, flag: null, tools: new Map(), listens: false, live: true, closing: false, calls: new Map(), closed: null, lines: 0, lineAt: 0, room: null, timers: [], stop: new AbortController(), doing: new Set() };
    const b: Block = { id: t.id, dir: t.dir, stable: t.stable, print, pkg: null, v: null, state: { state: "none", tools: [] }, life, record: null, columns: null, waiting: null, since: this.last };
    this.blocks.set(t.id, b);
    const broken = (why: string) => { life.live = false; b.state = { state: "broken", why, tools: [], ...(b.v !== null ? { v: b.v } : {}), ...(b.state.room ? { room: b.state.room } : {}), ...this.suspectOf(t.id) }; this.append("plugin.broken", t.id, { why }); };
    if (t.error) return broken(t.error);
    if (!isObj(t.record)) return broken("record.json is not an object");
    const r = t.record;
    b.record = r;
    const cur = currentOf(r);
    if (!cur) return broken("its record names no current version among its versions");
    b.v = cur.v;
    for (const k of ["reads", "writes"] as const) if (!Array.isArray(r[k]) || !(r[k] as unknown[]).every((x) => typeof x === "string")) return broken(`record.json: ${k} is not declared as a list`);
    const cols = columnsOf(r, this.me);   // the four new columns (step 2): a column that does not hold breaks it, with why
    if (!cols.ok) return broken(cols.why);
    b.columns = cols.columns;
    if (cols.columns.room === "big") b.state = { ...b.state, room: "big" };
    // its own data, carried to this version first (step 5, dataundo.ts): back to the last copy of an older one, what the
    // newer wrote set aside; a move cut short is finished here. Before anything runs, and whatever it waits for
    try {
      const m = carry(this.home, t.id, cur.v, cols.columns.stores, this.now());
      if (m) {
        const shared = m.back && Array.isArray(r.writes) ? (r.writes as string[]) : [];
        const said = [
          ...(m.aside ? [`what version ${m.from} wrote is kept at ${m.aside.slice(this.home.length + 1)}`] : []),
          ...(m.back && !m.restored ? [`nothing of version ${m.to}'s data was kept: the data stays as version ${m.from} left it`] : []),
          ...(shared.length ? [`the shared data ${shared.join(", ")} did not go back: other blocks use it`] : []),
        ];
        this.append("plugin.data", t.id, { from: m.from, to: m.to, ...(m.back ? { back: true, restored: m.restored } : {}), ...(m.aside ? { aside: m.aside.slice(this.home.length + 1) } : {}), ...(shared.length ? { shared } : {}), ...(said.length ? { said: said.join("; ") } : {}) });
      }
    } catch (e) { return broken(`its data could not be carried to version ${cur.v}: ${(e as Error).message}`); }
    const at = this.versionAt.get(t.id);
    if (!at || at.v !== cur.v) this.versionAt.set(t.id, { v: cur.v, seq: this.last });   // a reload at the same version keeps counting from when it began
    b.since = this.versionAt.get(t.id)!.seq;
    if (r.off === true || (t.stable && this.stableOff().includes(t.id))) { life.live = false; b.state = { state: "none", v: cur.v, tools: [], off: true, ...(b.state.room ? { room: "big" as const } : {}) }; return; }   // taken out (the install tool's remove): nothing runs, its folder stays
    const n = cols.columns.needs;
    // declared exists (the design's gate): every one of Sol's tools it names is one Sol has, and one a block may call
    for (const tool of n?.sol ?? []) {
      if (NOT_FOR_BLOCKS(tool)) return broken(`needs.sol names ${tool}, which a block may not call (a block's own tool, or the install tool)`);
      if (solNames && !solNames.has(tool)) return broken(`needs.sol names ${tool}, which is not one of Sol's tools`);
    }
    if (n?.seat) return this.loadSeat(b, t.dir, cur.v, broken);   // a program the shell starts as a seat (step A2): no engine half, no room host
    if (cols.columns.room === "small") {
      const out = n ? OUTWARD.filter((k) => n[k].length > 0).concat(n.screen ? ["screen" as never] : []) : [];
      if (out.length) return broken(`a small room cannot reach beyond its wall, and its record asks for ${out.join(", ")}: room "big" is where that runs`);
    }
    const dir = t.dir;
    let file: string | null;
    try { file = engineFileOf(dir, cur.entry); } catch (e) { return broken((e as Error).message); }
    if (originOn()) {   // the record's origin's switch (record.ts originOn, step M1)
      try { b.pkg = fingerprintOf(dir, r); } catch (e) { return broken(`its files could not be read: ${(e as Error).message}`); }   // what was loaded, the whole block (an event's via.pkg, fingerprint.ts)
      if (typeof r.hash === "string" && r.hash !== b.pkg) this.append("plugin.altered", t.id, { hash: r.hash, now: b.pkg });   // its record says another fingerprint: said, not refused
    } else b.pkg = createHash("sha256").update(canonical(r)).update("\n").update(file ? readIn(dir, file) ?? "" : "").digest("hex");   // off: its record and its engine half as written, as before the switch
    if (was !== null && was !== cur.v) this.append("plugin.release", t.id, { from: was, to: cur.v });
    if (cols.columns.room === "big") return this.loadBig(b, dir, file, cur.v, broken);
    const wait = this.waitFor(b);   // a small room that hears a seat waits for a press as a big room does
    if (wait) return broken(wait);
    if (file) {
      const why = readIn(dir, file) === null ? `its engine half is missing: ${file}` : await this.start(b, dir, file);
      if (why) {
        life.live = false;
        await this.end(life);
        return broken(why);
      }
    }
    b.state = { state: file ? "loaded" : "none", v: cur.v, tools: [...life.tools.values()].map((x) => toolName(t.id, x.name)), ...(b.state.wrote ? { wrote: b.state.wrote } : {}), ...this.suspectOf(t.id) };
    this.append("plugin.load", t.id, { v: cur.v, ...(file ? { engine: file } : {}) });
    this.provide(b);
  }

  /** the fifth action, "provide a kind of ability" (step 6): a block whose needs.provides says "seat" is put on the seat
   *  seam under its id once it loads, a task being its tool `task` ({ text, session? } in; its words, or JSON { text,
   *  session?, structured? }, out; through the gate, as any call). It needs that tool;
   *  a name a seat has already (Sol's own two) is refused. Taken off when it unloads or breaks */
  private provide(b: Block): void {
    if (!b.columns?.needs?.provides.includes("seat") || !b.life.live) return;
    const acp = b.life.seat?.acp;
    if (acp) {   // a seat the shell started (step A2): it streams, asks and says its steps; what it can is what it said at hello
      const r = registerSeat({ name: b.id, builtIn: false, block: b.id, can: acp.can, run: acp.run });
      if (!r.ok) return this.crash(b, `it provides a seat named ${b.id}, and ${r.why}`);
      this.append("plugin.seat", b.id, { provided: true });
      return;
    }
    if (!b.life.tools.has("task")) return this.crash(b, "it provides a seat, and a seat takes its task through a tool named task: its record lists none (needs.tools), or its engine half registered none");
    let busy = false;
    const r = registerSeat({
      name: b.id, builtIn: false, block: b.id, can: { stream: false, resume: true, ask: false },
      run: (task, _out, signal) => new Promise<SeatResult>((resolve) => {
        if (signal.aborted) return resolve({ ok: false, why: "cancelled" });
        if (busy) return resolve({ ok: false, why: `the seat ${b.id} is still on its last task` });   // one task at a time: a cancelled one may still be running
        busy = true;
        let settled = false;
        const settle = (x: SeatResult) => { if (!settled) { settled = true; resolve(x); } };
        // cancelled: its answer is dropped, and its tool `cancel`, when it has one, is told (the interface's "be cancelled")
        signal.addEventListener("abort", () => { settle({ ok: false, why: "cancelled" }); if (b.life.tools.has("cancel")) void this.runTool(toolName(b.id, "cancel"), {}, `seat:${b.id}`); }, { once: true });
        void this.runTool(toolName(b.id, "task"), { text: task.text, ...(task.sessionId ? { session: task.sessionId } : {}) }, `seat:${b.id}`, SEAT_MS).then((x) => {
          busy = false;
          const said = (x.content[0] as { text?: string })?.text ?? "";
          const gone = !(b.life.live && this.blocks.get(b.id)?.life === b.life);
          if (x.isError) return settle({ ok: false, why: gone ? `the seat ${b.id} is gone: ${said}` : said });
          let v: unknown = said;
          try { v = JSON.parse(said); } catch { /* plain words */ }
          const o = v && typeof v === "object" && !Array.isArray(v) ? (v as { text?: unknown; session?: unknown; structured?: unknown }) : null;
          settle(o && typeof o.text === "string" ? { ok: true, text: o.text, ...(typeof o.session === "string" ? { sessionId: o.session } : {}), ...(o.structured !== undefined ? { structured: o.structured } : {}) } : { ok: true, text: typeof v === "string" ? v : said });
        });
      }),
    });
    if (!r.ok) return this.crash(b, `it provides a seat named ${b.id}, and ${r.why}`);
    this.append("plugin.seat", b.id, { provided: true });
  }

  /** the press (the design's gate, "a person sees it once"): a block that asks for nothing beyond its wall waits for nobody.
   *  One that asks waits for a press that covers what it asks now (wider asks again, narrower does not), and for every key
   *  it names to be pasted. Its card is kept for GET /things; why it waits is returned, null when it does not */
  private waitFor(b: Block): string | null {
    const a = askOf(b.columns!);
    if (!asksAny(a)) return null;
    const pressed = readPress(this.app, this.home, pressId(b));
    const card = cardOf(this.app, b.id, b.columns!, pressed, (k) => this.keyUsers(k));
    const more = pressed ? widerThan(pressed, a) : null;
    if (!pressed || more!.length) {
      b.waiting = card;
      return pressed ? `waiting for a person to press its card again: its record asks for more than was pressed (${more!.join(", ")})` : "waiting for a person to press its card: it asks for what goes beyond its wall, and nobody has said yes to it";
    }
    if (card.missing.length) { b.waiting = card; return `waiting for ${card.missing.length === 1 ? "the key" : "the keys"} ${card.missing.join(", ")}: a person pastes ${card.missing.length === 1 ? "it" : "them"} on its card`; }
    return null;
  }
  /** a block marked suspect keeps the mark across loads until a person's press (never the install tool: the AI that wrote
   *  the block would wipe the mark meant for the person); it is in memory, so an engine's restart starts it clean */
  private suspectOf(id: string): { suspect?: true } { return (this.refusals.get(id) ?? 0) >= SUSPECT_AFTER ? { suspect: true } : {}; }
  /** a call the gate refused: a line on the log, and the tenth in a row marks the block suspect, in its place */
  private refusedOne(b: Block, value: Record<string, unknown>, by: By) {
    const e = this.append("plugin.refused", b.id, value, by);
    const n = (this.refusals.get(b.id) ?? 0) + 1;
    this.refusals.set(b.id, n);
    if (n === SUSPECT_AFTER) {
      this.append("plugin.suspect", b.id, { refused: n, why: `refused ${n} times in a row: it keeps reaching for what its record does not declare` }, ENGINE, { cause: e.id });
      if (this.blocks.get(b.id) === b) b.state = { ...b.state, suspect: true };
    }
  }
  /** a call that passed: the run of refusals is over */
  private passed(id: string) { if (this.refusals.has(id) && (this.refusals.get(id) ?? 0) < SUSPECT_AFTER) this.refusals.delete(id); }

  /** the declared folders as they are now: a symlink is never one (it could be pointed anywhere after the press), and
   *  none reaches what the wall is for; checked at load and again at every wake and every run (a big room's, a seat's) */
  private wallFolders(declared: string[], make: boolean): string[] {
    const guarded = [{ path: this.app, what: "Sol's own folder (the keys, the presses)" }, { path: this.logDir, what: "the log" }, { path: this.home, what: "the home (every block and its data)" }];
    const out: string[] = [];
    for (const f of declared) {
      let st;
      try { st = lstatSync(f); } catch {
        const c = folderClash([f], guarded);
        if (c) throw new Error(c);
        if (!make) continue;   // not there yet at load: not opened, and still never where the wall is for
        // the room is up (pressed): its folder is made, then checked as any other. The part of the path that is there is
        // checked first: a link planted above it would have the folder made where nobody pressed
        let up = dirname(resolve(f));
        while (!existsSync(up) && up !== dirname(up)) up = dirname(up);
        if (realpathSync(up) !== up) throw new Error(`the folder it declares, ${f}, goes through a symlink (${up} is ${realpathSync(up)}): declare the folder by its own path`);
        mkdirSync(f, { recursive: true, mode: 0o700 });
        st = lstatSync(f);
      }
      if (st.isSymbolicLink()) throw new Error(`the folder it declares, ${f}, is a symlink: a block's folder is a folder`);
      const real = realpathSync(f);
      // the path as declared, all the way down: a symlink anywhere on it (planted in a parent after the press) would
      // move the grant somewhere nobody pressed
      if (real !== resolve(f)) throw new Error(`the folder it declares, ${f}, goes through a symlink (it is ${real}): declare the folder by its own path`);
      out.push(real);
    }
    const clash = folderClash(out, guarded);
    if (clash) throw new Error(clash);
    return out;
  }
  /** a big room at load: nothing is started (it starts when used). Its three ways to be broken beyond the small room's: a
   *  sandbox that cannot be made here, a program it declares that is not on this Mac, nobody having pressed its card */
  private loadBig(b: Block, dir: string, file: string | null, v: number, broken: (why: string) => void): void {
    const life = b.life, cols = b.columns!, n = cols.needs;
    if (!file) return broken("a big room with no engine half has nothing to run");
    if (readIn(dir, file) === null) return broken(`its engine half is missing: ${file}`);
    const here = bigRoomHere(this.big.sandbox);
    if (here) return broken(here);
    const found: Record<string, string> = {}, built: Record<string, string> = {};   // built: Sol's helpers, as the engine made them
    for (const p of n?.programs ?? []) {
      if (isHelper(p)) {   // one of Sol's own small programs (helpers.ts): never looked for on the PATH, built at its first run
        const no = helperHere(p);
        if (no) return broken(no);
        continue;
      }
      const exe = findProgram(p);
      if (!exe) return broken(`the program it declares, ${p}, is not on this Mac`);
      found[p] = exe;
    }
    const folders = (make = false): string[] => this.wallFolders(n?.folders ?? [], make);
    try { folders(); } catch (e) { return broken((e as Error).message); }
    const wait = this.waitFor(b);
    if (wait) return broken(wait);
    const by: By = { person: "engine", agent: b.id };
    const refuse = (op: string, what: string, why: string): never => {
      if (tally()) this.refusedOne(b, { op, what, why }, by);
      throw new GateError(`refused: ${b.id} may not ${op} ${what}: ${why}`);
    };
    const key = (name: string | null): { key: string; hosts: string[] } | null => {
      if (!name) return null;
      const k = readKey(this.app, name);
      return "key" in k ? k : refuse("use the key", name, k.why);
    };
    /** every line a room's doing puts on the log counts toward the loop breaker, as a small room's lines do */
    const tally = (): boolean => {
      const now = Date.now();
      if (now - life.lineAt > 1000) { life.lineAt = now; life.lines = 0; }
      if (++life.lines > LINES_A_SECOND) { if (life.live) this.crash(b, `it put more than ${LINES_A_SECOND} lines on the log in a second: a loop, or a block answering another's lines`); return false; }
      return true;
    };
    const clean = async <T>(k: { key: string } | null, f: () => Promise<T>): Promise<T> => {
      try { return await f(); } catch (e) { throw new Error(redact((e as Error)?.message ?? String(e), k?.key ?? null)); }
    };
    /** an errand on its way (a run, a request): unload ends it and waits for it, so its line comes before the unload line */
    const errand = <T>(p: Promise<T>): Promise<T> => { life.doing.add(p); p.then(() => life.doing.delete(p), () => life.doing.delete(p)); return p; };
    /** whether what an errand did may still be said: never once the block's unload line is written */
    const saying = () => life.live || life.closing;
    const room = new Room({ id: b.id, dir, file: join(dir, file), host: realpathSync(fileURLToPath(HOST)), cols, closeMs: this.closeMs, ...(historyOn() ? { since: true } : {}), ...this.big }, {
      folders: () => folders(true),
      read: (what) => this.read(b, what),
      write: (what, value) => { this.write(b, what, value); },
      since: (from, kinds) => this.past(b, from, kinds),
      said: (m) => {
        if ((m.t === "tool" || m.t === "refused-net") && !tally()) return;
        if (m.t === "tool") { if (!life.tools.has(String(m.name))) this.append("plugin.trouble", b.id, { where: "sol.tool", why: `${m.name} is not among the tools its record declares (needs.tools): it is not offered` }, by); return; }
        if (m.t === "refused-net") { this.refusedOne(b, { op: "connect", what: String((m as { what?: string }).what), why: "not among the domains its record declares" }, by); return; }
        this.hear(b, m as Said);
      },
      run: async (program, args, opts, at) => {
        if (!life.live) throw new Error(`${b.id} is unloaded: run is refused`);
        if (isHelper(program) && !found[program] && n?.programs.includes(program)) {   // Sol's helper, built the first time it is run
          const h = await helperFor(program, this.app);
          if ("why" in h) return refuse("run", program, h.why);
          found[program] = built[program] = h.exe;
        }
        const r = runRefusal(cols, found, { program, args, opts });
        if ("why" in r) return refuse("run", program, r.why);
        const k = key(r.key);
        let fs: string[];
        try { fs = folders(true); } catch (e) { this.crash(b, (e as Error).message); throw e; }
        const out = await errand(clean(k, () => runBeside(r.exe, r.args, { sandbox: this.big.sandbox, folders: fs, proxy: at.proxy, screen: !!n?.screen && takesPictures(program, r.exe, built[program] ?? null), env: k && r.keyAs ? { [r.keyAs]: k.key } : {}, input: r.input, ms: this.big.callMs, key: k?.key ?? null, track: room.runs })));
        this.passed(b.id);
        if (saying() && tally()) this.append("plugin.ran", b.id, { program, ...(r.key ? { key: r.key } : {}), code: out.code, ...(out.signal ? { signal: out.signal } : {}), out: true }, by);   // out: what it did beyond the wall does not come back with an undo
        return out;
      },
      fetch: async (url, opts) => {
        if (!life.live) throw new Error(`${b.id} is unloaded: fetch is refused`);
        const r = fetchRefusal(cols, { url, opts });
        if ("why" in r) return refuse("fetch", (() => { try { return new URL(url).host; } catch { return "a web address"; } })(), r.why);
        const k = key(r.key);
        if (k && !k.hosts.includes(r.url.hostname.toLowerCase())) return refuse("fetch", r.url.host, `the key ${r.key} is for ${k.hosts.join(", ") || "no host yet (its hosts are said when it is pasted)"}, not ${r.url.hostname}`);
        const out = await errand(clean(k, () => fetchFor(r, k?.key ?? null, this.big.callMs, life.stop.signal)));
        this.passed(b.id);
        if (k && r.key && typeof out.headers["x-oauth-scopes"] === "string") noteScope(this.app, r.key, out.headers["x-oauth-scopes"]);   // the scope, as the service says it (GitHub), kept once
        if (saying() && tally()) this.append("plugin.fetched", b.id, { host: r.url.host, ...(r.key ? { key: r.key } : {}), status: out.status, out: true }, by);
        return out;
      },
      call: async (tool, args) => {
        if (!life.live) throw new Error(`${b.id} is unloaded: call is refused`);
        if (!(n?.sol ?? []).includes(tool)) return refuse("call", tool, `${tool} is not among Sol's tools its record declares (${n?.sol.join(", ") || "none"})`);
        if (NOT_FOR_BLOCKS(tool)) return refuse("call", tool, "a block's tool and the install tool are not for a block to call");
        if (!solTools) return refuse("call", tool, "Sol's tools are not on this engine");
        this.passed(b.id);
        if (tally()) this.append("plugin.called", b.id, { tool, out: true }, by);
        return solTools(tool, args);
      },
      note: (kind, value) => {
        if (this.blocks.get(b.id)?.life !== life) return;
        this.append(kind, b.id, value);
        if (b.state.state === "loaded") b.state = { ...b.state, awake: kind === "plugin.wake" };
      },
      broke: (why) => this.crash(b, why),
    });
    life.room = room;
    for (const t of n?.tools ?? []) life.tools.set(t.name, { block: b.id, name: t.name, description: t.description, args: t.args });
    for (const ms of n?.every ?? []) { const timer = setInterval(() => room.tick(ms), ms); timer.unref(); life.timers.push(timer); }
    b.state = { state: "loaded", v, tools: [...life.tools.values()].map((x) => toolName(b.id, x.name)), room: "big", awake: false, ...(b.state.wrote ? { wrote: b.state.wrote } : {}), ...this.suspectOf(b.id) };
    this.append("plugin.load", b.id, { v, engine: file, room: "big" });
    this.provide(b);
  }

  /** a seat the shell starts (needs.seat, step A2, acp.ts): its program walled as a big room's run is (the declared
   *  folders and a scratch folder of its own read and written, its own folder read only, its declared domains through a
   *  proxy of its own, no fork, a clean environment), started once its card is pressed, kept running, spoken to in ACP.
   *  What a real agent needs beyond that to start at all is opened to every seat (SEAT_MORE), and its declared folders
   *  in the person's home are linked at the same place in its scratch home (linkHome). One whose record says children
   *  starts programs of its own, inside the same wall: the files in its own folder and the programs it declares,
   *  found by name in a folder of links that is its PATH.
   *  Broken when it cannot be: not a Mac, its program not here, an engine half beside it, nobody pressed, no hello */
  private async loadSeat(b: Block, dir: string, v: number, broken: (why: string) => void): Promise<void> {
    const life = b.life, n = b.columns!.needs!, start = n.seat!.start;
    try { const cur = currentOf(b.record!); if (cur && engineFileOf(dir, cur.entry)) return broken("a seat the shell starts is its program: no engine half goes with it, and one is beside its record"); } catch (e) { return broken((e as Error).message); }
    const here = bigRoomHere(this.big.sandbox);
    if (here) return broken(here);
    if (isHelper(start[0])) return broken(`${start[0]} is one of Sol's helpers, not a seat`);
    const exe = findProgram(start[0]);
    if (!exe) return broken(`the program it starts as a seat, ${start[0]}, is not on this Mac`);
    try { this.wallFolders(n.folders, false); } catch (e) { return broken((e as Error).message); }
    const wait = this.waitFor(b);
    if (wait) return broken(wait);
    // the key it is started with (needs.seat.key): read now and put only in its environment, never in its arguments.
    // A seat holds its key, so it is given one only when all its wall reaches is what the key is for (keys/<name>.json)
    let held: { as: string; key: string } | null = null;
    if (n.seat!.key) {
      const name = n.seat!.key, k = readKey(this.app, name);
      if (!("key" in k)) return broken(k.why);
      const beyond = n.domains.filter((d) => !k.hosts.includes(d.toLowerCase()) && !k.hosts.includes(d.toLowerCase().replace(/:\d+$/, "")));
      if (beyond.length) return broken(`the key ${name} is for ${k.hosts.join(", ") || "no host yet (its hosts are said when it is pasted)"}, and its seat reaches ${beyond.join(", ")} too: a seat holds its key, so it is started with one only when all it reaches is what the key is for`);
      if (k.key.length < SECRET_MIN) return broken(`the key ${name} is shorter than ${SECRET_MIN} characters: too short to be cut out of what its seat says, so no seat is started with it`);
      held = { as: n.seat!.keyAs!, key: k.key };
    }
    const noKey = (why: string) => redact(why, held?.key ?? null);
    // a host it is refused is its own words too: one its key is spelled into goes on the log without it, as it wrote it and as a host's name is read (in small letters)
    const noHost = (h: string) => redact(noKey(h), held?.key.toLowerCase() ?? null);
    let folders: string[];
    try { folders = this.wallFolders(n.folders, true); } catch (e) { return broken((e as Error).message); }
    const by: By = { person: "engine", agent: b.id };
    const mine = () => life.live && this.blocks.get(b.id)?.life === life;   // taken out: it says nothing more
    const proxy = await openProxy(n.domains, (host, port) => { if (mine()) this.refusedOne(b, { op: "connect", what: noHost(`${host}:${port}`), why: "not among the domains its record declares" }, by); });
    const own = realpathSync(mkdtempSync(join(tmpdir(), "sol-acp-seat-")));
    const away = async () => { await proxy.close(); dropScratch(own); };
    // the programs its children may start (needs.seat.children): each declared program as the file that runs, never one
    // of Sol's helpers; by name they are links in a folder of the scratch home, which is its PATH
    const kids: string[] = [];
    let path = dirname(exe), profile: string;
    try {
      linkHome(own, folders, this.me ?? homedir());
      if (n.seat!.children) {
        path = join(own, ".sol-bin");
        mkdirSync(path, { mode: 0o700 });
        for (const p of new Set([start[0], ...n.programs])) {
          if (isHelper(p)) continue;
          const file: string | null = p === start[0] ? exe : findProgram(p);
          if (!file) throw new Error(`the program it declares, ${p}, is not on this Mac`);
          symlinkSync(file, join(path, p));
          if (file !== exe && !kids.includes(file)) kids.push(file);
        }
      }
      const certs = existsSync(SEAT_CERTS);
      profile = profileOf({ exe, read: [dir], write: [own, ...folders], proxy: proxy.port, more: [...SEAT_MORE, ...(certs ? [`(allow file-read* (literal ${JSON.stringify(SEAT_CERTS)}))`] : [])], ...(n.seat!.children ? { children: { exes: kids, within: [dir] } } : {}) });
    } catch (e) { await away(); return broken((e as Error).message); }
    const url = `http://127.0.0.1:${proxy.port}`;
    const who: SeatName = `seat:${b.id}`;
    let acp: AcpSeat;
    try {
      acp = await startAcp({
        name: b.id, command: [this.big.sandbox, "-p", profile, exe, ...start.slice(1)], cwd: dir, sessionCwd: own,
        env: { HOME: own, TMPDIR: own, PATH: path, HTTPS_PROXY: url, https_proxy: url, HTTP_PROXY: url, http_proxy: url, ...(existsSync(SEAT_CERTS) ? { SSL_CERT_FILE: SEAT_CERTS } : {}), ...(held ? { [held.as]: held.key } : {}) },
        ...(held ? { secret: held.key } : {}),
        ...(n.seat!.children ? { children: true, kidsMax: this.seatLimits.kidsMax } : {}),
        startMs: this.big.loadMs, closeMs: this.closeMs, answerMs: this.seatLimits.answerMs, convo: (inner) => convoId(b.id, inner),
        said: {
          turn: (session) => { if (mine()) this.seat("seat.turn", who, { session }); },
          step: (session, tool, ok) => { if (mine()) this.seat("seat.step", who, { session, tool, ok }); },
          usage: (session, u) => { if (mine()) this.seat("seat.usage", who, { session, ...u }); },
          done: (session, ok) => { if (mine()) this.seat("seat.done", who, { session, ok }); },
        },
        gone: (why) => this.crash(b, noKey(why)),
      });
    } catch (e) { await away(); return broken(`its seat did not start: ${noKey((e as Error).message)}`); }
    if (!mine()) { await acp.close(); await away(); return; }
    life.seat = { acp, proxy, own };
    b.state = { state: "loaded", v, tools: [], room: "big", ...this.suspectOf(b.id) };
    this.append("plugin.load", b.id, { v, room: "big" });
    this.provide(b);
  }

  /** start a block's worker; null once its engine half has loaded, else why it did not */
  private start(b: Block, dir: string, file: string): Promise<string | null> {
    const life = b.life;
    const { port1, port2 } = new MessageChannel();
    const flag = new SharedArrayBuffer(4);
    const w = new Worker(WORKER, {
      name: `sol-block-${b.id}`,
      workerData: { id: b.id, file: join(dir, file), dir, flag, reply: port2, askMs: this.callMs, ...(historyOn() ? { since: true } : {}) },   // since: sol.since is on its sol (step A3)
      transferList: [port2],
      execArgv: [], env: {}, resourceLimits: LIMITS, stdout: true, stderr: true,
    });
    w.stdout.resume();   // a block speaks through sol.log, not the engine's own output
    w.stderr.resume();
    w.unref();
    Object.assign(life, { worker: w, reply: port1, flag: new Int32Array(flag) });
    return new Promise((resolve) => {
      let settled = false;
      const done = (why: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (why) life.live = false;
        resolve(why);
      };
      const timer = setTimeout(() => done(`its engine half did not finish loading within ${this.loadMs} ms`), this.loadMs);
      w.on("message", (m: Said) => {
        if (m?.t === "ready") done(null);
        else if (m?.t === "failed") done(`its engine half threw at load: ${m.why}`);
        else this.hear(b, m);
      });
      w.on("error", (e: Error) => { const why = `its engine half threw: ${e.message}`; if (!settled) done(why); else this.crash(b, why); });
      w.on("exit", (code) => { const why = `its engine half stopped its worker (exit ${code})`; if (!settled) done(why); else this.crash(b, why); });
    });
  }

  /** what a block's worker says: each heard only while the block is live (a line or its trouble also while it unloads) */
  private hear(b: Block, m: Said) {
    const life = b.life, by: By = { person: "engine", agent: b.id };
    switch (m?.t) {
      case "log": {
        if (!(life.live || life.closing)) return;
        // a block's lines are handed to the blocks that listen, and theirs to it: two that answer each other's lines would
        // ring forever. One that writes more than LINES_A_SECOND lines in a second is broken, with that reason
        const now = Date.now();
        if (now - life.lineAt > 1000) { life.lineAt = now; life.lines = 0; }
        if (++life.lines > LINES_A_SECOND) { if (life.live) this.crash(b, `it wrote more than ${LINES_A_SECOND} lines in a second: a loop, or a block answering another's lines`); return; }
        this.append("plugin.line", b.id, { line: String(m.line).slice(0, 500) }, by);
        return;
      }
      case "trouble": if (life.live || life.closing) this.append("plugin.trouble", b.id, { where: String(m.where), why: String(m.why) }, by); return;
      case "listen": if (life.live) life.listens = true; return;
      case "closed": life.closed?.(); return;
      case "result": { const f = life.calls.get(Number(m.call)); life.calls.delete(Number(m.call)); f?.({ ok: !!m.ok, value: m.value as string | undefined, why: m.why }); return; }
      case "tool": {
        if (!life.live || typeof m.name !== "string" || !TOOL.test(m.name)) return;
        const args: Record<string, Arg> = {};
        for (const [k, a] of Object.entries(m.args ?? {})) if (TOOL.test(k) && (a === "string" || a === "number" || a === "boolean")) args[k] = a;
        life.tools.set(m.name, { block: b.id, name: m.name, description: String(m.description ?? m.name).slice(0, 500), args });
        if (b.state.state === "loaded") {
          const had = b.state.tools.join(",");
          b.state = { ...b.state, tools: [...life.tools.values()].map((x) => toolName(b.id, x.name)) };
          if (this.edits() && b.state.tools.join(",") !== had) this.append("plugin.tools", b.id, { tools: b.state.tools }, by);   // after its load, so plugin.load did not say it: the face's narrow look hears it here; the same list again is not said
        }
        return;
      }
      case "read": case "write": case "since": {
        let a: { ok: boolean; value?: unknown; why?: string };
        try { a = { ok: true, value: m.t === "read" ? this.read(b, String(m.what)) : m.t === "since" ? this.past(b, m.from, m.kinds) : this.write(b, String(m.what), m.value) }; }
        catch (e) { a = { ok: false, why: (e as Error).message }; }
        life.reply?.postMessage(a);
        if (life.flag) { Atomics.store(life.flag, 0, 1); Atomics.notify(life.flag, 0); }
        return;
      }
    }
  }

  /** the door: may this block, still live, read or write this name, and where is it? Its own data (stores, step 2) under
   *  home/data/<id>/, another's own as "<id>/<name>" when named in its reads, the shared pool by reads and writes as
   *  before (record.ts dataPlace). Refused is logged, and thrown in the block */
  private passes(b: Block, op: "read" | "write", what: string): { file: string; name: string; own: boolean } {
    if (!b.life.live) throw new Error(`${b.id} is unloaded: ${op} is refused`);
    let v = dataPlace(b.id, b.record ?? {}, b.columns ?? { stores: [] }, op, what);
    if (v.ok && v.owner && v.owner !== b.id) {   // another's own data: that block must be here and still store it
      const o = this.blocks.get(v.owner);
      if (!o) v = { ok: false, why: `there is no block ${v.owner} in the home` };
      else if (!(o.columns?.stores ?? []).includes(v.name)) v = { ok: false, why: `${v.owner} does not store ${v.name} (${(o.columns?.stores ?? []).join(", ") || "none"})` };
    }
    if (!v.ok) {
      this.refusedOne(b, { op, what, why: v.why }, { person: "engine", agent: b.id });
      throw new GateError(`refused: ${b.id} may not ${op} ${what}: ${v.why}`);
    }
    this.passed(b.id);
    return { file: v.owner ? join(this.home, "data", v.owner, `${v.name}.json`) : join(this.home, "data", `${v.name}.json`), name: v.name, own: v.owner === b.id };
  }
  private read(b: Block, what: string): unknown {
    const { file, name, own } = this.passes(b, "read", what);
    const w = own && b.v !== null ? newerThan(this.home, b.id, name, b.v) : null;
    if (w !== null) {   // dsh's rule: an older version never opens data a newer one wrote; it says so in its place
      const newer = [...new Set([...(b.state.newer ?? []), name])].sort();
      if (b.state.newer?.length !== newer.length) { b.state = { ...b.state, newer }; this.append("plugin.trouble", b.id, { where: "sol.read", why: `the data ${name} is newer than this version: version ${w} wrote it, this is ${b.v}` }); }
      throw new Error(`the data ${name} is newer than me: version ${w} wrote it, this is version ${b.v}`);
    }
    const plain = plainIn(file, join(this.home, "data"));   // a link a seat planted reads as never written
    try { return plain ? JSON.parse(readFileSync(plain, "utf8")) : null; } catch { return null; }
  }
  private write(b: Block, what: string, value: unknown): null {
    const { file, name, own } = this.passes(b, "write", what);
    if (own && b.v !== null) stamp(this.home, b.id, name, b.v);   // the version that writes it (step 5), first: a crash between leaves a stamp, never an unstamped newer write
    writeWhole(file, JSON.stringify(value ?? null, null, 2) + "\n", { root: join(this.home, "data") });   // never through a link a seat planted
    if (own && b.state.newer?.includes(name)) { const newer = b.state.newer.filter((x) => x !== name); const { newer: _n, ...rest } = b.state; b.state = newer.length ? { ...rest, newer } : rest; }
    const e = this.append("plugin.write", b.id, { what: name, ...(own ? { own: true } : {}) }, { person: "engine", agent: b.id });   // the bare name, however it was spelled
    b.state = { ...b.state, wrote: { what: name, at: e.at } };
    return null;
  }

  /** sol.since (step A3): the log's past after `from` (a seq; 0 is the start), of the kinds asked (not given: every kind
   *  its record names), at most SINCE_BATCH events, looking through at most SINCE_SCAN, and `next` to ask from for the
   *  rest (null: it reached the end). A kind its record does not name in needs.history, or a record that names none, is
   *  refused and logged, as the door does; checked here, never in the room. Its switch off: there is no past to read */
  private past(b: Block, from: unknown, kinds: unknown): Past {
    if (!b.life.live) throw new Error(`${b.id} is unloaded: since is refused`);
    if (!historyOn()) throw new Error("sol.since is not on this engine");
    if (!Number.isInteger(from) || (from as number) < 0) throw new Error("sol.since(from, kinds): from is a seq on the log, a whole number from 0");
    if (kinds !== undefined && (!Array.isArray(kinds) || !kinds.every((k) => typeof k === "string"))) throw new Error("sol.since(from, kinds): kinds is a list of kinds");
    const h = b.columns?.needs?.history ?? null;
    const asked = (kinds as string[] | undefined) ?? h?.kinds ?? [];
    const not = h ? asked.filter((k) => !h.kinds.includes(k)) : asked;
    if (!h || not.length) {
      const said = not.slice(0, 5).map((k) => (k.length > 64 ? `${k.slice(0, 64)}…` : k)).join(", ");   // a made-up kind is the block's words: a short line of them
      const what = not.length > 5 ? `${said} and ${not.length - 5} more` : said || "the past", why = h ? `not among the kinds its record names in needs.history (${h.kinds.join(", ")})` : "its record names no kinds in needs.history";
      this.refusedOne(b, { op: "since", what, why }, { person: "engine", agent: b.id });
      throw new GateError(`refused: ${b.id} may not read the past ${what}: ${why}`);
    }
    this.passed(b.id);
    const want = new Set(asked.length ? asked : h.kinds), end = this.last, events: Record<string, unknown>[] = [];
    let at = from as number, looked = 0;
    while (at < end && events.length < SINCE_BATCH && looked < SINCE_SCAN) {
      const page = this.log.since(LOG_PROJECT, at);
      if (!page.length) { at = end; break; }
      for (const e of page) {
        if (e.seq > end) { at = end; break; }   // written since this call began: the next call has it
        at = e.seq;
        looked++;
        if (want.has(e.kind)) events.push(pastOf(e, h.text));
        if (events.length >= SINCE_BATCH || looked >= SINCE_SCAN) break;
      }
    }
    return { events, next: at < end ? at : null };
  }

  /** a loaded block's worker threw or ended on its own: the block is broken, with why; nothing else is touched */
  private crash(b: Block, why: string) {
    const life = b.life;
    if (!life.live || this.blocks.get(b.id)?.life !== life) return;   // its own unload, or a load since
    life.live = false;
    if (unregisterSeat(b.id, b.id).ok) this.append("plugin.seat", b.id, { provided: false, why });
    this.drop(life, `${b.id} broke: ${why}`);
    b.state = { state: "broken", why, tools: [], ...(b.v !== null ? { v: b.v } : {}), ...(life.room ? { room: "big" as const } : {}), ...this.suspectOf(b.id) };
    this.append("plugin.broken", b.id, { why });
    void this.end(life);
  }

  /** every call waiting on a life gets its answer now: none */
  private drop(life: Life, why: string) {
    for (const f of life.calls.values()) f({ ok: false, why });
    life.calls.clear();
    life.tools.clear();
    life.listens = false;
  }

  /** terminate a life's worker: its timers, promises, state and everything else it opened end here */
  private async end(life: Life) {
    for (const t of life.timers.splice(0)) clearInterval(t);
    life.stop.abort();   // a request a big room asked for, still on its way, ends with it
    const room = life.room;
    if (room) await room.close("its block ended");
    const seat = life.seat;
    life.seat = null;
    if (seat) {   // the seat's program asked to stop, then killed; its proxy and its scratch folder go with it
      await seat.acp.close().catch(() => {});   // each on its own: a crash's end is not awaited (crash), and must not throw
      await seat.proxy.close().catch(() => {});
      dropScratch(seat.own);
    }
    const w = life.worker;
    life.worker = null;
    life.reply?.close();
    life.reply = null;
    if (w) await w.terminate().catch(() => {});
  }

  /** unload: no more calls, what its load returned runs (a moment at most), then its worker is terminated */
  private async unload(b: Block, why: string) {
    const life = b.life, was = b.state.state;
    const asked = life.live && !!life.worker;
    life.live = false;
    if (unregisterSeat(b.id, b.id).ok) this.append("plugin.seat", b.id, { provided: false, why });   // a turn on it ends with "the seat is gone"
    this.drop(life, `${b.id} was unloaded (${why}) while its tool ran: its answer is dropped`);
    if (life.room) {
      for (const t of life.timers.splice(0)) clearInterval(t);
      life.closing = true;
      await life.room.close(why);   // what its load returned runs in its process, then the process, its proxy, their tunnels and the programs it ran go
      life.stop.abort();   // a request it asked for, still on its way, ends here
      await Promise.race([Promise.allSettled([...life.doing]), new Promise((r) => setTimeout(r, this.closeMs).unref())]);   // what each errand did is said before the unload line, never after it
      life.closing = false;
    } else if (asked) {
      life.closing = true;
      await new Promise<void>((done) => {
        const timer = setTimeout(done, this.closeMs);
        life.closed = () => { clearTimeout(timer); done(); };
        life.worker!.postMessage({ t: "unload" });
      });
      life.closing = false;
    }
    await this.end(life);
    b.state = { ...b.state, state: was === "broken" ? "broken" : "none", tools: [], ...(b.state.awake !== undefined ? { awake: false } : {}) };
    // a broken one going (gone from the home, or loaded again) said nothing, since nothing of it ran; with the narrow
    // look on it is said too, as GET /things changes with it (#691 step 3)
    if (was !== "broken" || this.edits()) this.append("plugin.unload", b.id, { why });
  }

  /** a seat's step through a block's tool: logged, run in its worker, its answer handed back only if the block is still the same live one */
  async runTool(full: string, args: unknown, seat = "seat", longer?: number): Promise<ToolResult> {
    const ms = longer ?? this.callMs;   // a seat's task waits longer (SEAT_MS); a call waits its room's own limit
    const say = (text: string, isError = false): ToolResult => ({ content: [{ type: "text", text }], ...(isError ? { isError } : {}) });
    const b = [...this.blocks.values()].find((x) => x.life.live && [...x.life.tools.values()].some((t) => toolName(x.id, t.name) === full));
    if (!b) return say(`no tool ${full}: its block is not loaded`, true);
    const life = b.life, t = [...life.tools.values()].find((x) => toolName(b.id, x.name) === full)!;
    const still = () => life.live && (!!life.worker || !!life.room) && this.blocks.get(b.id)?.life === life;
    this.append("tool.call", b.id, { tool: t.name }, { person: "seat", agent: seat });
    if (!still()) return say(`${b.id} was unloaded: ${t.name} did not run`, true);   // before: a step can unload what it found
    const call = ++this.calls;
    const plain = isObj(args) ? (JSON.parse(JSON.stringify(args)) as Record<string, unknown>) : {};
    const a = life.room ? await life.room.call(t.name, plain, longer ?? this.big.callMs).then((x) => ({ ok: x.ok, value: x.value as string | undefined, why: x.why })) : await new Promise<Answer>((resolve) => {
      const timer = setTimeout(() => { life.calls.delete(call); resolve({ ok: false, why: `${t.name} did not answer within ${ms} ms` }); }, ms);
      life.calls.set(call, (x) => { clearTimeout(timer); resolve(x); });
      life.worker!.postMessage({ t: "call", call, name: t.name, args: plain });
    });
    if (!still()) return say(this.blocks.get(b.id)?.life === life && b.state.state === "broken" ? `${b.id} broke: ${b.state.why}` : `${b.id} was unloaded while ${t.name} ran: its answer is dropped`, true);   // after: what came back is the old block's
    return a.ok ? say(a.value ?? "null") : say(a.why ?? "the tool failed", true);
  }

  /** undo (POST /things/:id/undo): the block one version back, unloaded and loaded again, one line on the log */
  async undo(id: string): Promise<{ ok: true; from: number; to: number } | { ok: false; why: string }> {
    let out: { ok: true; from: number; to: number } | { ok: false; why: string } = { ok: false, why: "" };
    this.busy = this.busy.then(async () => {
      const t = readThings(this.home).find((x) => x.id === id);
      if (!t) { out = await this.undoStable(id); return; }
      if (t.error || !isObj(t.record)) { out = { ok: false, why: t.error ?? "record.json is not an object" }; return; }
      const cur = currentOf(t.record);
      if (!cur) { out = { ok: false, why: "its record names no current version" }; return; }
      if (t.record.off === true) {   // taken out: undo puts it back, at the version it had (the design's undo, "after a removal")
        const { off: _off, ...rest } = t.record;
        writeWhole(join(this.home, "things", id, "record.json"), JSON.stringify(rest, null, 2) + "\n", { root: join(this.home, "things", id), mode: 0o644 });
        const had = this.blocks.get(id);
        if (had) { await this.unload(had, "undo"); this.blocks.delete(id); }
        this.append("undo.did", id, { from: cur.v, to: cur.v, putBack: true });
        const now = this.found().find((x) => x.id === id)!;
        await this.load(now, this.printOf(now), null);
        out = { ok: true, from: cur.v, to: cur.v };
        return;
      }
      const cols = columnsOf(t.record, this.me);   // the columns sit on the record, not on a version: a version back mends nothing here
      if (!cols.ok) { out = { ok: false, why: `${cols.why}: a version back does not mend the record` }; return; }
      const back = (t.record.versions as unknown[]).filter(isObj).map((x) => x.v).filter((v): v is number => Number.isInteger(v) && (v as number) < cur.v);
      if (!back.length) { out = { ok: false, why: `version ${cur.v} is its first: there is nothing to go back to` }; return; }
      const to = Math.max(...back);
      writeWhole(join(this.home, "things", id, "record.json"), JSON.stringify({ ...t.record, current: to }, null, 2) + "\n", { root: join(this.home, "things", id), mode: 0o644 });
      const had = this.blocks.get(id);
      const gone = had ? this.wentOut(id, had.since) : 0;   // what it sent beyond its wall while this version ran: not undone
      if (had) { await this.unload(had, "undo"); this.blocks.delete(id); }
      this.append("undo.did", id, { from: cur.v, to, ...(gone ? { gone, said: `${gone} ${gone === 1 ? "thing" : "things"} it sent out while version ${cur.v} ran ${gone === 1 ? "does" : "do"} not come back` } : {}) });
      const now = this.found().find((x) => x.id === id)!;
      await this.load(now, this.printOf(now), null);
      out = { ok: true, from: cur.v, to };
    });
    await this.busy;
    return out;
  }

  /** undo on one of Sol's own blocks: one taken out is put back; its versions come with Sol, so none goes back */
  private async undoStable(id: string): Promise<{ ok: true; from: number; to: number } | { ok: false; why: string }> {
    const t = this.found().find((x) => x.id === id && x.stable);
    if (!t) return { ok: false, why: `there is no block ${id} in the home` };
    const cur = isObj(t.record) ? currentOf(t.record) : null;
    if (!cur) return { ok: false, why: t.error ?? "its record names no current version" };
    if (!this.stableOff().includes(id)) return { ok: false, why: `${id} is one of Sol's own blocks: its versions come with Sol, so there is none to go back to here. To change it, write your own as things/${id} (the home's is found first)` };
    this.setStableOff(this.stableOff().filter((x) => x !== id));
    const had = this.blocks.get(id);
    if (had) { await this.unload(had, "undo"); this.blocks.delete(id); }
    this.append("undo.did", id, { from: cur.v, to: cur.v, putBack: true, stable: true });
    const now = this.found().find((x) => x.id === id)!;
    await this.load(now, this.printOf(now), null);
    return { ok: true, from: cur.v, to: cur.v };
  }

  /** a person's press on a block's card (POST /things/<id>/approve, Sol's own page only; never a seat's tool): yes to what
   *  the card showed, named by its print, so a record widened since is not pressed for. Kept beside the log, one line on
   *  it; the block loads again. A key it names that is not pasted yet still keeps it waiting, for the key */
  async approve(id: string, print: unknown): Promise<{ ok: true; state?: EngineState; waiting: Waiting | null } | { ok: false; why: string }> {
    let out: { ok: true; state?: EngineState; waiting: Waiting | null } | { ok: false; why: string } = { ok: false, why: "" };
    this.busy = this.busy.then(async () => {
      await this.syncNow();   // the card is checked against the record as it is now, not as it was at the last look
      const b = this.blocks.get(id);
      if (!b) { out = { ok: false, why: `there is no block ${id} in the home` }; return; }
      if (!b.waiting || !b.columns) { out = { ok: false, why: `${id} is not waiting for a press` }; return; }
      if (typeof print !== "string" || print !== b.waiting.print) { out = { ok: false, why: "its record changed since the card was drawn: the card is drawn again, to be pressed again" }; return; }
      const a = askOf(b.columns);
      writePress(this.app, this.home, pressId(b), a, print, this.now());
      for (const k of a.keys) noteUser(this.app, k, id);
      this.refusals.delete(id);
      this.append("plugin.approve", id, { print, asks: { ...Object.fromEntries([...OUTWARD, "hears", "history", "seat", "seatKey"].map((k) => [k, (a as Record<string, unknown>)[k]]).filter(([, v]) => Array.isArray(v) && v.length)), ...(a.historyText ? { historyText: true } : {}), ...(a.seatChildren ? { seatChildren: true } : {}) }, ...(a.screen ? { screen: true } : {}) }, { person: "person" });
      await this.syncNow();
      const now = this.blocks.get(id);
      out = { ok: true, ...(now ? { state: now.state } : {}), waiting: now?.waiting ?? null };
    });
    await this.busy;
    return out;
  }

  /** the install tool (the design's loader, "when it loads"): a block the AI wrote into the home, checked and loaded now,
   *  with an answer: done, done from a seat's next conversation (it brought tools), or failed with why. A big room is
   *  started once and put away, so a room that cannot start is said now, not at its first use */
  async install(id: string): Promise<Installed> {
    const t = readThings(this.home).find((x) => x.id === id);
    if (!t) {   // one of Sol's own: checked as written, put back when taken out
      const st = this.found().find((x) => x.id === id && x.stable);
      if (!st) return { status: "failed", say: `there is no block ${id} in the home (write it into things/${id}/ first)` };
      if (st.error || !isObj(st.record)) return { status: "failed", say: st.error ?? "record.json is not an object" };
      const bad = versionsHeld(st.dir, st.record);
      if (bad) return { status: "failed", say: bad };
      if (this.stableOff().includes(id)) await this.serial(() => this.setStableOff(this.stableOff().filter((x) => x !== id)));
      await this.sync();
      return this.answer(id, true);
    }
    if (t.error || !isObj(t.record)) return { status: "failed", say: t.error ?? "record.json is not an object" };
    const bad = versionsHeld(join(this.home, "things", id), t.record);
    if (bad) return { status: "failed", say: bad };
    if (t.record.off === true) {   // installing one taken out puts it back
      const r = await this.serial(() => this.edit(id, (rec) => { const { off: _off, ...rest } = rec; return rest; }));
      if (typeof r === "string") return { status: "failed", say: r };
    }
    await this.sync();
    return this.answer(id, true);
  }
  /** what the install tool says of a block now; a big room loaded is tried once when `tryRoom` */
  private async answer(id: string, tryRoom: boolean): Promise<Installed> {
    const b = this.blocks.get(id);
    if (!b) return { status: "failed", say: `${id} is not in the home` };
    if (b.state.off) return { status: "done", say: `${id} is taken out: nothing of it runs, its folder stays` };
    if (b.state.state === "broken") return { status: "failed", say: b.waiting ? `${b.state.why}. Tell the person: its card is in Sol, waiting for their press${b.waiting.missing.length ? " and the key" : ""}` : b.state.why ?? "broken", state: b.state };
    if (tryRoom && b.life.room && !b.life.room.awake) {   // an awake room is up already: never put away under a call
      const no = await b.life.room.wake("tried at install");
      if (no) return { status: "failed", say: `its room would not start: ${no}`, state: b.state };
      await b.life.room.sleep("tried at install");
    }
    const tools = b.state.tools;
    if (tools.length) return { status: "restart", say: `loaded, version ${b.v}. Its tools (${tools.join(", ")}) reach a seat from the seat's next conversation`, state: b.state };
    return { status: "done", say: `loaded, version ${b.v}`, state: b.state };
  }
  /** the install tool's remove: the record marked off, the block unloaded; its folder and data stay (step 5 adds the rest) */
  async remove(id: string): Promise<Installed> {
    const r = await this.serial(() => {
      if (this.found().some((x) => x.id === id && x.stable)) {   // Sol's own in its place (none in the home, or the home's taken out): its code is never written; Sol's folder keeps that it is out
        if (this.stableOff().includes(id)) return "it is taken out already";
        this.setStableOff([...this.stableOff(), id]);
        return {};
      }
      return this.edit(id, (rec) => (rec.off === true ? "it is taken out already" : { ...rec, off: true }));
    });
    if (typeof r === "string") return { status: "failed", say: r };
    await this.sync();
    this.append("plugin.off", id, {});
    const now = this.blocks.get(id);
    if (now?.stable && !this.stableOff().includes(id)) return { status: "done", say: `${id} is taken out: nothing of yours runs, its folder stays. Sol's own ${id} is in its place (${now.state.state === "broken" ? now.state.why : now.state.state}); take that out too with remove again`, state: now.state };
    return this.answer(id, false);
  }
  /** the install tool's version: the record's current set to one of its versions, loaded again */
  async version(id: string, v: unknown): Promise<Installed> {
    if (!readThings(this.home).some((x) => x.id === id) && this.found().some((x) => x.id === id && x.stable)) return { status: "failed", say: `${id} is one of Sol's own blocks: its versions come with Sol. To change it, write your own as things/${id} (the home's is found first)` };
    const r = await this.serial(() => this.edit(id, (rec) => {
      const vs = (Array.isArray(rec.versions) ? rec.versions : []).filter(isObj).map((x) => x.v);
      if (!Number.isInteger(v) || !vs.includes(v)) return `${String(v)} is not one of its versions (${vs.join(", ")})`;
      const { off: _off, ...rest } = rec;
      return { ...rest, current: v };
    }));
    if (typeof r === "string") return { status: "failed", say: r };
    await this.sync();
    return this.answer(id, true);
  }
  /** the install tool's undo: one version back, as POST /things/<id>/undo */
  async back(id: string): Promise<Installed> {
    const before = this.last;
    const r = await this.undo(id);
    if (!r.ok) return { status: "failed", say: r.why };
    const a = await this.answer(id, true);
    const told = this.since(before).filter((e) => e.item === id && (e.kind === "undo.did" || e.kind === "plugin.data")).map((e) => (e.value as { said?: string })?.said).filter(Boolean);
    return told.length ? { ...a, say: `${a.say}. ${told.join(". ")}` } : a;
  }
  /** one thing at a time with the look and the other actions (the busy chain) */
  private serial<T>(f: () => T | Promise<T>): Promise<T> {
    const run = this.busy.then(f, f);
    this.busy = run.then(() => {}, () => {});
    return run;
  }
  /** a record rewritten by the install tool, whole, in one rename; why not, as a string */
  private edit(id: string, f: (rec: Record<string, unknown>) => Record<string, unknown> | string): Record<string, unknown> | string {
    const t = readThings(this.home).find((x) => x.id === id);
    if (!t) return `there is no block ${id} in the home`;
    if (t.error || !isObj(t.record)) return t.error ?? "record.json is not an object";
    const next = f(t.record);
    if (typeof next === "string") return next;
    writeWhole(join(this.home, "things", id, "record.json"), JSON.stringify(next, null, 2) + "\n", { root: join(this.home, "things", id), mode: 0o644 });
    return next;
  }

  /** how many lines past a seq say a block did something beyond its wall (`out`: a run, a fetch, one of Sol's tools) */
  private wentOut(id: string, since: number): number {
    let n = 0, at = since;
    for (;;) {
      const page = this.since(at);
      n += page.filter((e) => e.item === id && (e.value as { out?: unknown } | undefined)?.out === true).length;
      if (page.length < PAGE) return n;
      at = page[page.length - 1].seq;
    }
  }

  /** back to Sol as it came (the design's undo, "back to the factory"): every block in the home taken out, none deleted,
   *  one line; each can be put back (undo, or the install tool). Sol's own blocks (Stable) stay, and any taken out come back */
  async factory(): Promise<{ off: string[] }> {
    const off = await this.serial(() => {
      const ids: string[] = [];
      for (const t of readThings(this.home)) {
        if (!isObj(t.record) || t.record.off === true) continue;
        writeWhole(join(this.home, "things", t.id, "record.json"), JSON.stringify({ ...t.record, off: true }, null, 2) + "\n", { root: join(this.home, "things", t.id), mode: 0o644 });
        ids.push(t.id);
      }
      if (this.stable && this.stableOff().length) this.setStableOff([]);   // and Sol's own taken out are put back: as it came
      return ids;
    });
    await this.sync();
    this.append("plugin.factory", undefined, { off });
    return { off };
  }

  /** watch the home for changes (a light look every interval: a few small files) */
  watch(ms = 1500): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.sync().catch(() => {}); }, ms);
    this.timer.unref?.();
  }

  /** stop watching and unload every block */
  async stop(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    await this.busy.catch(() => {});
    for (const b of this.blocks.values()) await this.unload(b, "the frame was turned off");
    this.blocks.clear();
  }
}

// ---- the engine's one kernel, while the switch is on ----

let kernel: Kernel | null = null;
export const kernelNow = (): Kernel | null => kernel;
/** start or stop with the switch (index.ts calls it at start and after settings change) */
/** the engine's own parts that start with a kernel, called before its first load. Nothing asks today (sticky.ts did, #729) */
const starts = new Set<(k: Kernel) => void>();
export const whenKernel = (f: (k: Kernel) => void) => { starts.add(f); };
/** what engine.start says of the engine, with one local git read: the commit its checkout is at (HEAD, read
 *  now, no network, a short wait at most), and the release, the commit under it and how many of its own are over it
 *  when version.ts has read them already (it reads in the background at start, so the first start often has only head) */
function startedBy(): { release?: string; commit?: string; mine?: number; head?: string } {
  const v = versionNow();
  let head = "";
  try { head = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { cwd: ENGINE_DIR, timeout: 1500, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* not a checkout: said without it */ }
  return { ...(v ? { release: v.release, commit: v.commit, ...(v.mine ? { mine: v.mine } : {}) } : {}), ...(/^[0-9a-f]{4,40}$/.test(head) ? { head } : {}) };
}
export async function syncKernel(home: string, on: boolean): Promise<void> {
  if (on && !kernel) {
    // the places on this machine are decided here, with the frame on, and nowhere else: off, nothing names them
    const k = new Kernel(home, { stable: STABLE_DIR, logDir: logDir(home), appDir: appDir(), edits: logKinds });
    kernel = k;
    for (const f of starts) { try { f(k); } catch { /* its own trouble */ } }   // before the first load: its ear hears it
    // the log's first lines of a start say which engine writes what follows, and its timezone (started()). Nothing
    // waits for them: a seat's steps right after start are written, not dropped, so the kernel is there at once
    try { k.started(startedBy()); } catch (e) { console.error("the log:", e instanceof Error ? e.message : String(e)); }
    await k.sync();
    k.watch();
  }
  else if (!on && kernel) { const k = kernel; kernel = null; await k.stop(); }
}
/** the kernel follows the frame's switch from the engine's start (index.ts): synced now, and again each time the reading
 *  turns (settings.ts onFrame): a setting, or the version once Ship has read the channel (versions.ts) */
export function kernelFollows(home: string): void {
  const sync = (on: boolean) => void syncKernel(home, on).catch((e) => console.error("the kernel:", e));
  onFrame(sync);
  onPatch(() => sync(frameOn()));   // every settings.set, as before: a kernel that did not start is tried again
  sync(frameOn());
}

/** the blocks' tools as the seats' MCP servers want them: a name, a description and a zod shape */
export function thingTools(): { name: string; description: string; shape: Record<string, z.ZodTypeAny>; args: Record<string, Arg> }[] {
  return (kernel?.tools() ?? []).map((t) => ({
    name: toolName(t.block, t.name),
    description: `${t.description} (the block ${t.block})`,
    args: t.args,
    shape: Object.fromEntries(Object.entries(t.args).map(([k, a]) => [k, a === "number" ? z.number() : a === "boolean" ? z.boolean() : z.string()])),
  }));
}
export const runThingTool = (name: string, args: unknown, seat?: string): Promise<ToolResult> =>
  kernel ? kernel.runTool(name, args, seat) : Promise.resolve({ content: [{ type: "text", text: "the frame is off on this engine" }], isError: true });

// Where the log lives, how it is kept, and what one event is (the log's steps 1 and 1b, 2026-11; the event format v1,
// the v2 backend design §6, step 0a).
//   the place     logDir(home): SOL_LOGDIR (a stage, a test, Try), else the folder macOS gives an app for its own things,
//                 ~/Library/Application Support/Sol/log/<home>/ (Linux ~/.local/share/sol/log/<home>/), one folder per
//                 home (its path with every other character as "-", as Claude files its transcripts), so no seat's
//                 project folder and no checkout of Sol covers it, and two engines on two homes never share a file.
//   the files     <YYYY-MM-DD>.jsonl, one event a line, the day the event happened (local time), never an earlier day
//                 than the newest file (a clock set back, a timezone crossed westward: the event goes into the newest
//                 day, so the files in name order are the log in seq order); seq goes on across days; a day's file is
//                 never rewritten or renamed. log.jsonl in the same folder is the one file step 1 wrote, read as the
//                 oldest day. A seat's steps run to thousands of lines a day (step 1), so the engine keeps only the
//                 newest KEEP events in memory; a since= older than that reads the files back, at most PAGE events at a
//                 time (GET /log says `next` when there are more).
//   an event      (v1) a body and four things outside it. The body: v (1), project ("home"), by, via? (the plugin it
//                 went through), kind (a row in contract/kinds.ts, or the write is refused), kv?, item?, field?, hash
//                 (of the value; "" when there is none), at, prev (the id of the event before it, "" for the first;
//                 the chain goes on across days), cause?, ctx? (the conversation, the run, the turn), mode?,
//                 ignorable?. Outside it: id (the SHA-256 of the body's canonical text, so it covers neither the value
//                 nor seq), seq (this log's own order), value?, erased?. The rules are the team trail's
//                 (team/v3/trail.ts) and canonical() is its function, one function the two import (canonical.ts:
//                 outside team/v3, which nothing may load while Cowork v3's switch is off), not a second one.
//   the values    a value with no free text is on the event's line. One with free text (contract/kinds.ts placeOf) is
//                 in values/<hash>.json, the file's text being the value's canonical JSON (so the file's SHA-256 is its
//                 name), and the line holds only the hash. Reading puts the value back on the event; a value file
//                 that is not there reads as `erased: true`.
//   erase         erase(id): the value file goes, then one `log.erase` event says which event and by whom. No line is
//                 rewritten and every id stands, so the chain verifies as before (verifyLog). Content is kept by its
//                 hash: events that carry the same content share one file, and erasing it erases it for all of them.
//                 A value on the line (no free text) and a v0 line cannot be erased: lines are never rewritten.
//   fsync         a kind whose row says fsync ("about to do": run.about, rung.asked) is on the disk, its value file
//                 too, before append returns. Every other line is written as before.
//   v0            a line without `v`: what the beta and main (sol.frame on) wrote. It stays as it is on disk and is
//                 read, never written: handed with `v: 0`, its kind as the registry names it now and the name on the
//                 line as `old`. Its id was made the old way and is not checked; the chain starts at the first v1
//                 event, whose prev is the last v0 line's id.
//   the mirror    the old place, <home>/log/log.jsonl: carried over once (the move, into its days, finished whole or
//                 done again at the next start), then every line goes to it too while the two are reconciled
//                 (logcheck.ts), and it is never read back after the move (it sits in the home, where a seat can
//                 write). The same line, so no free text: the value files are only at the log's place. Its write
//                 failing is said, not thrown: the files are the log.
import { appendFileSync, closeSync, existsSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import type { By, Ev } from "./file-trail.js";   // who wrote it, and a v0 line's shape: read here, not changed
import { canonical, hashOf } from "./canonical.js";   // the one canonical JSON, the team trail's own (team/v3/trail.ts exports the same function)
import { kindRow, placeOf, nameOfOld } from "./contract/kinds.js";
export { SEAT_KINDS } from "./contract/kinds.js";   // the seats' kinds on the log (seatlog.ts writes them)

/** the log's one project: the home */
export const HOME = "home";
/** the plugin an event went through: its id, its version, the print of what was loaded */
export type Via = { plugin: string; pv: number; pkg: string };
/** where it happened: the conversation, the run, the turn */
export type Ctx = { session?: string; run?: string; turn?: string };
/** the part of an event its id covers */
export type LogBody = {
  v: 1; project: typeof HOME; by: By; via?: Via; kind: string; kv?: number; item?: string; field?: string;
  hash: string; at: number; prev: string; cause?: string; ctx?: Ctx; mode?: "record" | "replay"; ignorable?: true;
};
/** one event of the log (v1): the body, and outside it its id, its seq, its value, whether its content was erased */
export type LogEv = LogBody & { id: string; seq: number; value?: unknown; erased?: true };
/** a v0 line as it is read: the event as written, its kind as the registry names it now, the name on the line as `old` */
export type OldEv = Ev & { v: 0; old: string };
export type AnyEv = LogEv | OldEv;
/** what a writer asks to append */
export type LogDraft = { project?: string; by: By; kind: string; item?: string; field?: string; value?: unknown; at?: number; via?: Via; cause?: string; ctx?: Ctx; mode?: "record" | "replay" };
export interface LogPort {
  append(d: LogDraft): LogEv;
  since(project: string, seq?: number): AnyEv[];
  /** the content of one event gone, and a log.erase event that says so */
  erase(id: string, by: By): LogEv;
  files(): string[];
  last(): number;
}

/** the log's old place, in the home: the mirror now */
export const logFile = (home: string) => join(home, "log", "log.jsonl");
export function logDir(home: string): string {
  const env = (process.env.SOL_LOGDIR ?? "").trim();
  if (env) return resolve(env);
  const base = platform() === "darwin" ? join(homedir(), "Library", "Application Support", "Sol", "log") : join(homedir(), ".local", "share", "sol", "log");
  return join(base, home.replace(/[^A-Za-z0-9]/g, "-"));
}
/** how many events stay in memory (the newest), and how many one answer hands back at most */
export const KEEP = 5000;
export const PAGE = 5000;
/** the answer to the face's `GET /log?since=<seq>` (index.ts; its names are docs/backend-beta/WIRE.md §1): the events
 *  after since, the newest seq, and next when the page was cut there; with the frame off there is no log and no kernel */
export function logAnswer(k: { since(seq: number): AnyEv[]; lastSeq(): number } | null, query: URLSearchParams): { last: number; events: AnyEv[]; next?: number } | { off: true; last: 0; events: [] } {
  if (!k) return { off: true, last: 0, events: [] };
  const since = Math.max(0, Number(query.get("since")) || 0);
  const events = k.since(since), last = k.lastSeq();
  return { last, events, ...(events.length >= PAGE && events[events.length - 1].seq < last ? { next: events[events.length - 1].seq } : {}) };
}
/** the move's two marks in the folder: `.moving` while the old file is being carried over, `moved` once it is */
const MOVING = ".moving", MOVED = "moved";

const DAY = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const HEX = /^[0-9a-f]{64}$/;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** the day an event belongs to, local time */
export const dayOf = (at: number): string => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** the log's files in order: step 1's one file first, then the days */
export function logFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const days = readdirSync(dir).filter((n) => DAY.test(n)).sort();
  return [...(existsSync(join(dir, "log.jsonl")) ? ["log.jsonl"] : []), ...days].map((n) => join(dir, n));
}
/** where a content is kept, by its hash */
export const valueFile = (dir: string, hash: string): string => join(dir, "values", `${hash}.json`);

/** the body of an event: all of it but what stands outside (pure) */
export function bodyOf(e: LogEv): LogBody {
  const { id: _i, seq: _s, value: _v, erased: _e, ...body } = e;
  return body;
}
/** an event's id: the SHA-256 of its body's canonical text (pure) */
export const idOf = (body: LogBody): string => sha(canonical(body));

/** a line as it stands in a file, or null for one that is no event (a torn line) */
type Line = Record<string, unknown> & { id: string; seq: number };
const parseOne = (l: string): Line | null => { try { const e = JSON.parse(l); return e && typeof e.id === "string" && Number.isInteger(e.seq) ? (e as Line) : null; } catch { return null; } };
const parse = (text: string): Line[] => text.split("\n").flatMap((l) => { const e = parseOne(l); return e ? [e] : []; });
/** a line as an event: a v0 line under its kind's name today; a v1 line with its value put back from its file, or said
 *  erased when the file is not there */
function read(dir: string, l: Line): AnyEv {
  if (l.v === undefined) { const o = l as unknown as Ev; return { ...o, v: 0, old: o.kind, kind: nameOfOld(o) ?? o.kind }; }
  const e = l as unknown as LogEv;
  if ("value" in e || !e.hash || !HEX.test(e.hash)) return e;
  try { return filed({ ...e, value: JSON.parse(readFileSync(valueFile(dir, e.hash), "utf8")) }); } catch { return { ...e, erased: true }; }
}
/** the events whose content is in a value file, not on their line: the ones erase can take the content of */
const FILED = new WeakSet<object>();
const filed = <T extends object>(e: T): T => { FILED.add(e); return e; };
/** a file's first and last whole lines, read from its two ends only (a few KB), not the whole file */
function ends(file: string, bytes = 64 * 1024): { first: Line | null; last: Line | null; torn: boolean } {
  if (!existsSync(file)) return { first: null, last: null, torn: false };
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size, n = Math.min(size, bytes);
    const head = Buffer.alloc(n), tail = Buffer.alloc(n);
    readSync(fd, head, 0, n, 0);
    readSync(fd, tail, 0, n, size - n);
    const first = head.toString("utf8").split("\n").map(parseOne).find((e) => e) ?? null;
    const lines = tail.toString("utf8").split("\n");
    if (size > n) lines.shift();   // the first piece may be a cut line
    const last = [...lines].reverse().map(parseOne).find((e) => e) ?? null;
    return { first, last, torn: size > 0 && tail[n - 1] !== 0x0a };
  } finally { closeSync(fd); }
}
/** the last seq in a file, from its tail */
export const lastSeqIn = (file: string): number => ends(file).last?.seq ?? 0;

/** a folder's entries on the disk (a file just made, or renamed into it); a file's bytes, the same way */
function onDisk(path: string): void { const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } }
/** one line at a file's end; with `sync`, on the disk before this returns */
function addLine(file: string, line: string, sync: boolean): void {
  if (!sync) { appendFileSync(file, line, { mode: 0o600 }); return; }
  const fresh = !existsSync(file);
  const fd = openSync(file, "a", 0o600);
  try { writeSync(fd, line); fsyncSync(fd); } finally { closeSync(fd); }
  if (fresh) onDisk(dirname(file));
}
/** a content in its file, by its hash; written whole (beside, then renamed), and left alone when it is already there */
function keepValue(dir: string, hash: string, text: string, sync: boolean): void {
  const file = valueFile(dir, hash);
  if (existsSync(file)) { if (sync) { onDisk(file); onDisk(dirname(file)); } return; }   // the same content, kept by a line that did not wait for the disk: this one does
  const first = !existsSync(dirname(file));
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const beside = `${file}.${process.pid}.tmp`;
  const fd = openSync(beside, "w", 0o600);
  try { writeSync(fd, text); if (sync) fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(beside, file);
  if (sync) { onDisk(dirname(file)); if (first) onDisk(dir); }
}

/** the log in a folder, a file a day, the newest KEEP events in memory. `mirrorLine` is told each line as it is written */
export function dayTrail(dir: string, now?: () => number, mirrorLine?: (line: string) => void): LogPort {
  const clock = now ?? Date.now;
  // the tail: the newest files, back until KEEP events are in hand. Their values are put back when they are first read
  const files = logFiles(dir);
  let seed: Line[] = [];
  for (let i = files.length - 1; i >= 0 && seed.length < KEEP; i--) seed = [...parse(readFileSync(files[i], "utf8")), ...seed];
  const all: AnyEv[] = seed.slice(-KEEP) as unknown as AnyEv[];
  const raw = new Set<AnyEv>(all);   // those still as their lines stand
  const whole = (i: number): AnyEv => { const e = all[i]; if (!raw.has(e)) return e; raw.delete(e); return (all[i] = read(dir, e as unknown as Line)); };
  let newest = files.filter((f) => DAY.test(f.slice(dir.length + 1))).at(-1)?.slice(dir.length + 1, -6) ?? "";
  let torn = files.length && ends(files[files.length - 1]).torn ? files[files.length - 1] : "";   // the newest file ends in a cut line (the engine was killed mid-write): the next line there starts on a line of its own

  function append(d: LogDraft): LogEv {
    const row = kindRow(d.kind);
    if (!row) throw new Error(`the log takes no "${d.kind}": a kind is written once it has its row in contract/kinds.ts`);
    if ((d.project ?? HOME) !== HOME) throw new Error(`the log is the home's: "${d.project}" is not its project`);
    if (!d.by?.person) throw new Error("an event names who wrote it");
    const text = d.value === undefined ? undefined : JSON.stringify(d.value);
    const value: unknown = text === undefined ? undefined : JSON.parse(text);   // as it will be read back
    const at = Math.floor(d.at ?? clock());
    const before = all[all.length - 1];
    const seq = (before?.seq ?? 0) + 1;
    const body: LogBody = {
      v: 1, project: HOME, by: d.by, ...(d.via ? { via: d.via } : {}), kind: d.kind, ...(row.kv && row.kv > 1 ? { kv: row.kv } : {}),
      ...(d.item !== undefined ? { item: d.item } : {}), ...(d.field !== undefined ? { field: d.field } : {}),
      hash: hashOf(value), at, prev: before?.id ?? "", ...(d.cause ? { cause: d.cause } : {}), ...(d.ctx && Object.keys(d.ctx).length ? { ctx: d.ctx } : {}),
      ...(d.mode ? { mode: d.mode } : {}), ...(row.ignorable ? { ignorable: true as const } : {}),
    };
    const id = idOf(body);
    const where = placeOf(d.kind, value), sync = row.fsync === true;
    const e: LogEv = { ...body, id, seq, ...(value !== undefined ? { value } : {}) };
    const line = JSON.stringify(where === "line" ? e : { ...body, id, seq }) + "\n";
    const day = dayOf(at) > newest ? dayOf(at) : newest;   // never an earlier day than the newest file
    const made = !existsSync(dir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (sync && made) onDisk(dirname(dir));
    if (where === "file") keepValue(dir, body.hash, canonical(value), sync);   // the content first: a line never points at a content that was not written
    const file = join(dir, `${day}.jsonl`);
    addLine(file, (torn === file ? "\n" : "") + line, sync);   // thrown: not written, not on the log, its seq is used again
    torn = "";
    newest = day;
    all.push(where === "file" ? filed(e) : e);
    if (all.length > KEEP) for (const gone of all.splice(0, all.length - KEEP)) raw.delete(gone);
    mirrorLine?.(line);
    return e;
  }

  /** an event by its id: the newest in memory, else the files, newest first */
  function find(id: string): AnyEv | null {
    for (let i = all.length - 1; i >= 0; i--) if (all[i].id === id) return whole(i);
    for (const f of logFiles(dir).reverse()) { const l = parse(readFileSync(f, "utf8")).find((x) => x.id === id); if (l) return read(dir, l); }
    return null;
  }

  return {
    files: () => logFiles(dir),
    last: () => all[all.length - 1]?.seq ?? 0,
    append,
    since(project, seq = 0) {
      const first = all[0]?.seq ?? 1;
      if (seq >= first - 1) {
        const out: AnyEv[] = [];
        for (let i = 0; i < all.length && out.length < PAGE; i++) if (all[i].project === project && all[i].seq > seq) out.push(whole(i));
        return out;
      }
      // older than what is in memory: the files, in order, from the first that can hold seq+1, up to a page
      const fs = logFiles(dir), out: AnyEv[] = [];
      let start = 0;
      for (let i = 1; i < fs.length; i++) { const f = ends(fs[i]).first; if (f && f.seq <= seq + 1) start = i; else break; }
      let lastSeq = seq;
      for (const f of fs.slice(start)) {
        for (const l of parse(readFileSync(f, "utf8"))) if (l.project === project && l.seq > lastSeq) { out.push(read(dir, l)); lastSeq = l.seq; if (out.length >= PAGE) return out; }
      }
      return out;
    },
    erase(id, by) {
      const e = find(id);
      if (!e) throw new Error(`the log has no event ${id}`);
      if (e.v !== 1) throw new Error("a line written before v1 is read only: its content is on the line, and a line is never rewritten");
      if (!e.hash) throw new Error("the event carries no content");
      if (e.erased) throw new Error("its content is already erased");
      if (!FILED.has(e)) throw new Error("its content is on its line, with no free text in it: there is nothing to erase");
      rmSync(valueFile(dir, e.hash), { force: true });
      onDisk(dirname(valueFile(dir, e.hash)));   // gone on the disk too, before the line that says so
      for (const x of all) if (!raw.has(x) && x.v === 1 && x.hash === e.hash && FILED.has(x)) { delete x.value; x.erased = true; FILED.delete(x); }   // the same content, wherever it was pointed at
      return append({ by, kind: "log.erase", item: id, value: { hash: e.hash } });
    },
  };
}

/** the log at its place, with the old file as a mirror: the first time the folder has no log and the old file is
 *  there, the old file's whole lines are carried over into their days (the move, once; seq goes on; a move cut short
 *  is done again whole at the next start); after that every line goes to both, and nothing is read back from the
 *  mirror. A mirror ahead of the log, or step 1's one file overlapping the days, is said and left */
export function openLog(dir: string, mirror: string | null, now?: () => number): LogPort {
  if (mirror && resolve(dirname(mirror)) === resolve(dir)) mirror = null;   // the same folder is no mirror
  if (mirror && existsSync(mirror)) {
    const moving = join(dir, MOVING), moved = join(dir, MOVED);
    if (!existsSync(moved) && (!logFiles(dir).length || existsSync(moving))) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(moving, "");
      const byDay = new Map<string, string[]>();
      let day = "";
      for (const l of readFileSync(mirror, "utf8").split("\n")) {   // each whole line as it stands
        const e = parseOne(l);
        if (!e || typeof e.at !== "number") continue;
        day = dayOf(e.at) > day ? dayOf(e.at) : day;
        byDay.set(day, [...(byDay.get(day) ?? []), l.trim()]);
      }
      for (const [d, lines] of byDay) writeFileSync(join(dir, `${d}.jsonl`), lines.join("\n") + "\n", { mode: 0o600 });
      writeFileSync(moved, new Date(now?.() ?? Date.now()).toISOString() + "\n");
      rmSync(moving, { force: true });
    } else {
      const files = logFiles(dir), have = files.length ? lastSeqIn(files[files.length - 1]) : 0, theirs = lastSeqIn(mirror);
      if (theirs > have) console.error(`the log's mirror (${mirror}) is ahead of the log (${dir}): not read; the log stands, logcheck shows the difference`);
    }
  }
  const files = logFiles(dir);
  if (files.length > 1 && files[0].endsWith("log.jsonl") && lastSeqIn(files[0]) >= (ends(files[1]).first?.seq ?? Infinity))
    console.error(`the log's old one file (${files[0]}) runs past the first day's start: an older build wrote there; the days stand`);
  if (!mirror) return dayTrail(dir, now);
  const m = mirror;
  return dayTrail(dir, now, (line) => {
    try { mkdirSync(dirname(m), { recursive: true, mode: 0o700 }); appendFileSync(m, line, { mode: 0o600 }); }
    catch (err) { console.error("the log's mirror:", err instanceof Error ? err.message : String(err)); }
  });
}
/** every event in the folder, in order (logcheck, tests) */
export const readLog = (dir: string): AnyEv[] => logFiles(dir).flatMap((f) => parse(readFileSync(f, "utf8")).map((l) => read(dir, l)));

export type Checked = {
  ok: boolean;
  /** v1 events read, v0 lines passed over, contents erased (a value file that is not there) */
  events: number; old: number; erased: number;
  bad: { file: string; seq: number; id: string; why: "id" | "chain" | "content" | "seq"; say: string }[];
};
/** the chain, checked (pure but for reading): every v1 event's id is its body's, its prev is the event before it (the
 *  first one read is the start, so a check may begin at any day: `from`, a day as YYYY-MM-DD), its content is the one
 *  its hash names (on the line or in its value file; an erased one still holds, by its hash), and seq only grows. A v0
 *  line was made the old way: passed over, and counted */
export function verifyLog(dir: string, from?: string): Checked {
  const out: Checked = { ok: true, events: 0, old: 0, erased: 0, bad: [] };
  let prev: { id: string; seq: number } | null = null;
  for (const f of logFiles(dir)) {
    const name = f.slice(dir.length + 1);
    if (from && (!DAY.test(name) || name.slice(0, -6) < from)) continue;
    for (const l of parse(readFileSync(f, "utf8"))) {
      const no = (why: Checked["bad"][number]["why"], say: string) => { out.bad.push({ file: name, seq: l.seq, id: l.id, why, say }); };
      if (prev && l.seq <= prev.seq) no("seq", `seq ${l.seq} comes after ${prev.seq}`);
      if (l.v === undefined) { out.old++; prev = { id: l.id, seq: l.seq }; continue; }
      const e = l as unknown as LogEv;
      out.events++;
      if (idOf(bodyOf(e)) !== e.id) no("id", "its id is not its body's");
      if (prev && e.prev !== prev.id) no("chain", `its prev is not the event before it (seq ${prev.seq})`);
      if ("value" in e) { if (hashOf(e.value) !== e.hash) no("content", "the content on its line is not the content it points at"); }
      else if (e.hash) {
        let text: string | null = null;
        try { text = readFileSync(valueFile(dir, e.hash), "utf8"); } catch { out.erased++; }
        if (text !== null && sha(text) !== e.hash) no("content", "its value file is not the content it points at");
      }
      prev = { id: e.id, seq: e.seq };
    }
  }
  out.ok = out.bad.length === 0;
  return out;
}

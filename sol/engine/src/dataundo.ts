// A block's own data goes back with its version (the design's undo, "data goes back with the version", Frank 2026-11-07
// A, step 5). Only the data a block stores as its own (record `stores`, home/data/<id>/); the shared pool, named in
// reads and writes, is never wound back (another block would break), and the log says so.
//   stamps     home/data/<id>/.stamp.json: by name, the version that last wrote it. An older version reading data a newer
//              one wrote is told so in its place ("the data is newer than me"), never broken in silence (dsh's rule)
//   last copies  home/data-undo/<id>/v<N>/: the data as version N left it, kept when it moves to another version. One a
//              version, the last; the data itself is "the one now"
//   going back from A to B: what A wrote is set aside whole (home/data-undo/<id>/aside/v<A>-<at>/, never dropped) and B's
//              last copy comes back. With no copy of B (it never left), the data stays as A left it, and the stamps say it
//   going forward: the data stays; the new version takes it up
//   the journal  home/data-undo/<id>/journal.json says what a move does before it is done, a stage at a time, each stage
//              one rename; a move cut short (a crash) is finished from it at the next load, whole
//   where it was   home/data-undo/<id>/now.json: the version the data is at, so a change made while the engine was not
//              running (the record edited by hand) is carried at the next load too
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { writeWhole } from "./safewrite.js";

export const undoDir = (home: string, id: string) => join(home, "data-undo", id);
/** a block gone from the home: its copies are put by, under a name no block can have (an id has no dot), so a new block
 *  under the same id starts with none of them */
export function forgetCopies(home: string, id: string, now = Date.now()): void {
  const u = undoDir(home, id);
  try { if (!lstatSync(u).isDirectory()) return; } catch { return; }
  renameSync(u, `${u}.gone-${now}-${randomBytes(4).toString("hex")}`);
}
const ownDir = (home: string, id: string) => join(home, "data", id);
const STAMP = ".stamp.json";

function readJson<T>(f: string): T | null { try { return JSON.parse(readFileSync(f, "utf8")) as T; } catch { return null; } }

/** the version that last wrote each of a block's own data, by name */
export const stampsOf = (home: string, id: string): Record<string, number> => readJson<Record<string, number>>(join(ownDir(home, id), STAMP)) ?? {};
/** one of its own written by version v: stamped */
export function stamp(home: string, id: string, name: string, v: number): void {
  const s = stampsOf(home, id);
  if (s[name] === v) return;
  writeWhole(join(ownDir(home, id), STAMP), JSON.stringify({ ...s, [name]: v }) + "\n", { root: join(home, "data") });
}
/** the version that wrote it, when that is newer than the one reading: else null */
export function newerThan(home: string, id: string, name: string, v: number): number | null {
  const w = stampsOf(home, id)[name];
  return Number.isInteger(w) && w > v ? w : null;
}

type Journal = { from: number; to: number; stage: "copy" | "aside" | "restore"; aside: string | null; at: number; tag: string };
export type Moved = { from: number; to: number; back: boolean; restored: boolean; aside: string | null };

const whole = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
/** where the data is now (the version it was last carried to), or null for a block never seen (or a note that does not hold) */
export function dataAt(home: string, id: string): number | null { const v = readJson<{ v: unknown }>(join(undoDir(home, id), "now.json"))?.v; return whole(v) && v >= 1 ? v : null; }
/** the home is a seat's to write: before a move, none of its folders is a link, and each is, really, in the home */
function guard(home: string, id: string): void {
  const root = realpathSync(home);
  for (const d of [join(home, "data"), join(home, "data", id), join(home, "data-undo"), join(home, "data-undo", id), join(home, "data-undo", id, "aside")]) {
    let st;
    try { st = lstatSync(d); } catch { continue; }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`${d.slice(home.length + 1)} is not a folder (a link, or a file): the data is not moved`);
    const r = realpathSync(d);
    if (!r.startsWith(root + sep)) throw new Error(`${d.slice(home.length + 1)} leads outside the home: the data is not moved`);
  }
}
/** a journal as read from the home: only whole numbers and a stage; the aside path made here, never read */
function journalOf(home: string, id: string, x: unknown): Journal | null {
  const j = x as Partial<Journal> | null;
  if (!j || !whole(j.from) || !whole(j.to) || !whole(j.at) || j.from < 1 || j.to < 1 || !["copy", "aside", "restore"].includes(String(j.stage)) || typeof j.tag !== "string" || !/^[a-f0-9]{8}$/.test(j.tag)) return null;
  return { from: j.from, to: j.to, at: j.at, tag: j.tag, stage: j.stage as Journal["stage"], aside: j.to < j.from ? asideOf(home, id, j.from, j.at, j.tag) : null };
}
/** a set-aside folder's name: the version, the time and a tag of its own, so two moves never share one */
const asideOf = (home: string, id: string, from: number, at: number, tag: string) => join(undoDir(home, id), "aside", `v${from}-${at}-${tag}`);
const setAt = (home: string, id: string, v: number) => { mkdirSync(undoDir(home, id), { recursive: true }); writeWhole(join(undoDir(home, id), "now.json"), JSON.stringify({ v }) + "\n", { root: join(home, "data-undo") }); };
const journalFile = (home: string, id: string) => join(undoDir(home, id), "journal.json");
const writeJournal = (home: string, id: string, j: Journal) => writeWhole(journalFile(home, id), JSON.stringify(j) + "\n", { root: join(home, "data-undo") });

/** a folder copied whole into place in one rename (a copy beside it first); the old one at `to` goes */
/** a real folder (not a link), or nothing there; else it is refused */
function realFolder(d: string): boolean {
  let st;
  try { st = lstatSync(d); } catch { return false; }
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`${d} is not a folder (a link, or a file): the data is not moved`);
  return true;
}
/** whether a link sits anywhere in a folder (looked at after a copy: node has no openat to copy through) */
function hasLink(d: string): boolean {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isSymbolicLink()) return true;
    if (e.isDirectory() && hasLink(join(d, e.name))) return true;
  }
  return false;
}
function copyDir(from: string, to: string) {
  const tmp = `${to}.copy`;
  rmSync(tmp, { recursive: true, force: true });   // a link there goes as a link, never what it points to
  // a link a seat planted, anywhere in what is copied, is left behind: only the block's own files travel
  if (realFolder(from)) cpSync(from, tmp, { recursive: true, dereference: false, filter: (src) => !lstatSync(src).isSymbolicLink() });
  else mkdirSync(tmp, { recursive: true });
  if (hasLink(tmp)) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`a link turned up in ${from} while it was copied: the data is not moved`); }   // swapped in between the look and the copy
  rmSync(to, { recursive: true, force: true });
  renameSync(tmp, to);
}

/** carry a block's own data to the version it loads at (pure but for the files): the move, said; null when nothing moves
 *  (the same version, a block never seen, or one that stores nothing) */
export function carry(home: string, id: string, to: number, stores: string[], now = Date.now()): Moved | null {
  if (!stores.length) return null;   // stores nothing: nothing here is looked at, nothing can break it
  guard(home, id);
  const raw = readJson<unknown>(journalFile(home, id));
  const pending = raw === null ? null : journalOf(home, id, raw);
  if (raw !== null && !pending) throw new Error("its data's journal does not hold (data-undo/<id>/journal.json): the data is not moved");
  if (pending) {   // a move cut short: finished first, whole; then on to the version it loads at now, if that is another
    const done = finish(home, id, pending);
    return done.to === to ? done : carry(home, id, to, stores, now) ?? done;
  }
  const from = dataAt(home, id);
  if (from === null) { setAt(home, id, to); return null; }
  if (from === to) return null;
  const back = to < from;
  const tag = randomBytes(4).toString("hex");
  const aside = back ? asideOf(home, id, from, now, tag) : null;
  writeJournal(home, id, { from, to, stage: "copy", aside, at: now, tag });
  return finish(home, id, { from, to, stage: "copy", aside, at: now, tag });
}

function finish(home: string, id: string, j: Journal): Moved {
  const u = undoDir(home, id), own = ownDir(home, id), back = j.to < j.from;
  const next = (stage: Journal["stage"]) => { j = { ...j, stage }; writeJournal(home, id, j); };
  if (back) realFolder(join(u, `v${j.to}`));   // the copy it goes back to is looked at before anything moves: a link stops it here, with the data where it is
  if (j.stage === "copy") {   // the data as `from` left it: its last copy
    copyDir(own, join(u, `v${j.from}`));
    if (back) next("aside");
  }
  let restored = false, aside = j.aside;
  if (back && j.stage === "aside") {   // what `from` wrote, set aside whole: moved, never dropped
    mkdirSync(join(u, "aside"), { recursive: true });
    if (realFolder(own) && !existsSync(j.aside!)) renameSync(own, j.aside!);
    next("restore");
  }
  if (back && j.stage === "restore") {
    const last = join(u, `v${j.to}`);
    mkdirSync(join(home, "data"), { recursive: true });
    if (realFolder(last)) { copyDir(last, own); restored = true; }
    else if (!existsSync(own) && realFolder(j.aside!)) copyDir(j.aside!, own);   // nothing of `to` was kept (it never left): the data stays as `from` left it, its stamps say so, and the set-aside copy stays too (the older version may write over it)
  }
  setAt(home, id, j.to);
  rmSync(journalFile(home, id), { force: true });
  return { from: j.from, to: j.to, back, restored, aside: back ? aside : null };
}

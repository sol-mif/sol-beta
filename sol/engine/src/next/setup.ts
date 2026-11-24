// Every folder has a setup (BR1 three.html "Every folder has a setup", "Agents keep it organized"; read.html part 4;
// #1615). A setup says what the folder is for (job), how its things are organized (order), what it shows at rest (rest)
// and when opened (open), and its look, which follows the job. No folder is read as a kind (BR1 item 6, folder.html: a
// part per fact, never a kind): every folder starts plain and takes its shape from use, what it shows comes from the
// facts Sol saw in it (look.ts, a part each), and those facts are the setup's because. Meta, designed blind: no
// person's names, words or thresholds.
// The setup's fields are fits (fits.ts) on the folder's own scope (knob "folder.<field>"), so a change goes through fit
// mode's one preview and token (you-known.ts tryFit) and has its Back, its author and its history there. A setup is per
// folder: a parent's take is never read as the child's. Once a folder is set up (the person kept a field or "Use this
// setup", or the move-in ran it, by "sol"), its agent sorts new things in: a note or a quiet session at the folder's top
// level goes into the subfolder its order names, each move shown (a Diary line, next.folder.sorted) and undoable. The
// agent moves a thing once; a move taken back pins the thing where it is. It never moves a file, never works inside a
// folder that keeps a history of its changes (its subfolders are its code), never makes a folder on the person's own disk (a subfolder it makes is a Home
// folder, under SOL_HOME), and rests while Sol is paused.
// One file, SOL_HOME/next/setups.json { v: 1, folders: { <folder>: { at, by } }, runs: Run[], pinned: string[] }.
//   next.folder.setup      { folder }                       → { setup }
//   next.folder.setups     {}                               → { setups: Setup[] } every folder set up, and its look
//   next.folder.setup.set  { folder, field, take, by? }     → { preview: { changes, token } }; { folder, token, keep|back }
//   next.folder.setup.keep { folder }                       → { setup } the defaults kept as they stand: set up
//   next.folder.sort       { folder }                       → { run } the agent's moves now (the person asked)
//   next.folder.sort.back  { run, move? }                   → { run } each move put back if it is where Sol put it
//   next.folder.setup.drop { folder, line }                 → { setup } a read line taken out (×): for, organized or looks
// A setup also carries its reading (setup-read.ts, setup.html): three lines read from what the folder holds, ✦ until kept.
// Signed: marcocyl04-ux's agent, BR1 item 2 (#1615).
import { mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";
import { fsReader, SKIP, type Reader } from "./carry.js";
import { seenOf } from "./look.js";
import { contextOf } from "./context.js";
import { readPause, writeLine } from "./diary.js";
import { nextDir, readJson, writeJson } from "./file.js";
import { readEvents, takeOf, solSet } from "./fits.js";
import { readFolderSessions, refile } from "./folders.js";
import { move as moveNote, okFolder, readNotes } from "./notes.js";
import { scopeOf } from "./pos.js";
import { readOf, type LineKey, type SetupRead } from "./setup-read.js";
import { noteFixIn, tryFit, type FixHow } from "./you-known.js";
import type { Where } from "./you.js";

export type Field = "job" | "order" | "rest" | "open" | "look";
export const FIELDS: Field[] = ["job", "order", "rest", "open", "look"];
export type By = "default" | "person" | "sol";
export type Take = { id: string; n: string };
export type FieldNow = { field: Field; n: string; take: string; name: string; by: By; takes: Take[] };
export type Setup = { folder: string; scope: string | null; because: string[]; history: boolean; set: { at: number; by: "person" | "sol" } | null; fields: FieldNow[]; look: string; sorts: boolean; read: SetupRead };
export type Thing = { kind: "note" | "session"; id: string; label: string };
export type Move = { thing: Thing; from: string; to: string; toN: string; why: string; made: boolean; back?: number };
export type Run = { id: string; at: number; folder: string; by: "sol" | "person"; moves: Move[]; line?: string };
type Store = { folders: Record<string, { at: number; by: "person" | "sol" }>; runs: Run[]; pinned: string[]; dropped: Record<string, LineKey[]> };
export type R<T> = ({ ok: true } & T) | { ok: false; why: string };

/** the words of each field and its takes; the face words nothing of its own */
const FIELD_N: Record<Field, string> = { job: "What it's for", order: "How its things are organized", rest: "What it shows at rest", open: "What it shows opened", look: "How it looks" };
const TAKES: Record<Field, Take[]> = {
  job: [{ id: "build", n: "Making something" }, { id: "learn", n: "Learning: readings and deadlines, week by week" }, { id: "deliver", n: "Delivering: what's due, what waits on others" },
    { id: "keep", n: "Things to keep and find again" }, { id: "plain", n: "Whatever you put here" }],
  order: [{ id: "thread", n: "By what each session works on, newest first" }, { id: "week", n: "By week, a folder for each" }, { id: "deliverable", n: "By deliverable, into the folder it belongs to" },
    { id: "recent", n: "Newest first" }, { id: "kind", n: "By kind of file" }, { id: "date", n: "By date taken" }],
  rest: [{ id: "open", n: "Open threads" }, { id: "next-due", n: "The next deadline" }, { id: "due", n: "What's due and what waits on them" },
    { id: "latest", n: "The latest one" }, { id: "strip", n: "A strip of the newest" }, { id: "count", n: "How many things are in it" }],
  open: [{ id: "open-first", n: "Open threads on top" }, { id: "due-first", n: "What's due on top" }, { id: "newest-first", n: "The newest on top" }, { id: "grid", n: "A grid to look through" }],
  look: [{ id: "workbench", n: "Workbench: tight, made for working" }, { id: "notebook", n: "Notebook: ruled and warm" }, { id: "desk", n: "Desk: each thing a card with its date" },
    { id: "paper", n: "Paper: calm, for reading" }, { id: "gallery", n: "Gallery: pictures first" }, { id: "plain", n: "Plain" }],
};
/** a job's own setup; the look follows the job */
const BY_JOB: Record<string, Omit<Record<Field, string>, "job">> = {
  build: { order: "thread", rest: "open", open: "open-first", look: "workbench" },
  learn: { order: "week", rest: "next-due", open: "due-first", look: "notebook" },
  deliver: { order: "deliverable", rest: "due", open: "due-first", look: "desk" },
  keep: { order: "recent", rest: "latest", open: "newest-first", look: "paper" },
  plain: { order: "recent", rest: "count", open: "newest-first", look: "plain" },
};

export const setupsFile = (home: string) => join(nextDir(home), "setups.json");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KEEP_RUNS = 200, KEEP_PINS = 2000;

function read(home: string): Store {
  const { data } = readJson(setupsFile(home));
  const folders: Store["folders"] = {};
  for (const [f, v] of Object.entries(isObj(data.folders) ? data.folders : {})) if (okFolder(f) && isObj(v) && typeof v.at === "number") folders[f] = { at: v.at, by: v.by === "sol" ? "sol" : "person" };
  const runs = (Array.isArray(data.runs) ? data.runs : []).filter((r): r is Run => isObj(r) && typeof r.id === "string" && okFolder(r.folder) && Array.isArray(r.moves));
  const pinned = (Array.isArray(data.pinned) ? data.pinned : []).filter((x): x is string => typeof x === "string");
  const dropped: Store["dropped"] = {};
  for (const [f, v] of Object.entries(isObj(data.dropped) ? data.dropped : {})) if (okFolder(f) && Array.isArray(v)) dropped[f] = v.filter((x): x is LineKey => LINES.includes(x));
  return { folders, runs, pinned, dropped };
}
const save = (home: string, s: Store) => writeJson(setupsFile(home), { v: 1, folders: s.folders, runs: s.runs.slice(-KEEP_RUNS), pinned: s.pinned.slice(-KEEP_PINS), dropped: s.dropped });
const LINES: LineKey[] = ["for", "organized", "looks"];

/** the fits scope of a folder ("w:/a/b" → "a/b", "h:x" → "home/x"); it lives in pos.ts, where fits.ts reads it too */
export { scopeOf };
/** where a folder is on the disk: a w: folder its path; an h: folder under SOL_HOME (null: not a place on the disk) */
export function diskOf(home: string, folder: string): string | null {
  if (folder.startsWith("w:")) { const p = folder.slice(2); return isAbsolute(p) ? p : null; }
  const rel = folder.slice(2).split("/").filter(Boolean);
  if (!rel.length || rel.some((x) => x === ".." || x === "." || x.startsWith(".")) || SKIP.has(rel[0].toLowerCase())) return null;
  return join(home, ...rel);
}
const nameOf = (folder: string) => basename(folder.slice(2).replace(/\/+$/, "")) || folder.slice(2);

// ------------------------------------------------------------------------------------------- the setup

/** the defaults: plain, or the job the person or Sol chose, the rest following the job */
export function defaultsOf(job = "plain"): Record<Field, string> {
  return { job, ...(BY_JOB[job] ?? BY_JOB.plain) } as Record<Field, string>;
}
/** a setup's because: the facts Sol saw in the folder (look.ts), or that it starts plain */
export const PLAIN = "Sol hasn't seen anything in it yet, so it starts plain and takes its shape from use";
/** a field's take written in this very folder's scope (never a parent's) */
function written(home: string, scope: string | null, field: Field, evs = readEvents(home)): { take: string; by: "person" | "sol" } | null {
  if (!scope) return null;
  const f = takeOf(home, `folder.${field}`, scope, evs);
  return f.scope === scope && f.take !== null && (f.author === "person" || f.author === "sol") && TAKES[field].some((t) => t.id === f.take) ? { take: f.take, by: f.author } : null;
}
export function setupOf(home: string, folder: string, r: Reader = fsReader, s = read(home)): Setup {
  const scope = scopeOf(folder), evs = readEvents(home);
  // a Coming up with nothing dated is an absence, not a fact a setup comes from (BR1 hold)
  const seen = seenOf(home, folder, Date.now(), r).seen.filter((x) => !(x.part === "coming" && !x.items.length));
  const job = written(home, scope, "job", evs);
  const def = defaultsOf(job?.take);
  const fields = FIELDS.map((field): FieldNow => {
    const w = field === "job" ? job : written(home, scope, field, evs);
    const take = w?.take ?? def[field];
    return { field, n: FIELD_N[field], take, name: TAKES[field].find((t) => t.id === take)?.n ?? take, by: w?.by ?? "default", takes: TAKES[field] };
  });
  const order = fields.find((f) => f.field === "order")!.take;
  const history = seen.some((x) => x.part === "changed");
  const read = readOf(home, folder, { abs: diskOf(home, folder), seen, fields, kept: s.folders[folder]?.by === "person", dropped: s.dropped[folder] }, r);
  return { folder, scope, because: seen.length ? seen.map((x) => x.fact) : [PLAIN], history, set: s.folders[folder] ?? null, fields, look: fields.find((f) => f.field === "look")!.take,
    sorts: !!s.folders[folder] && !history && order !== "thread" && order !== "date", read };
}
/** next.folder.setups: every folder set up, with its look (the face draws each one's look at rest) */
export function setupsOf(home: string, r: Reader = fsReader): Setup[] {
  const s = read(home);
  return Object.keys(s.folders).map((f) => setupOf(home, f, r, s));
}

/** a setup act the person made is a fix (BR1 #1615, K's one store): one line, the folder as its place, the key of what
 *  Sol showed as its reason, and the facts the setup rests on (seen:<folder>:<what>) as its because */
const FIELD_KEY: Record<Field, string> = { job: "for", order: "organized", look: "looks", rest: "rest", open: "open" };
const restsOn = (home: string, folder: string) => seenOf(home, folder).seen.filter((x) => !(x.part === "coming" && !x.items.length)).map((x) => x.k);
const fixOf = (home: string, folder: string, how: FixHow, what: string, reason: string, now: number, more: { was?: string } = {}) =>
  noteFixIn(home, { how, what, place: folder, reason, because: restsOn(home, folder), ...more }, now);

const mark = (home: string, folder: string, by: "person" | "sol", now: number) => {
  const s = read(home);
  if (!s.folders[folder] || (by === "person" && s.folders[folder].by === "sol")) { s.folders[folder] = { at: s.folders[folder]?.at ?? now, by }; save(home, s); }
};

/** next.folder.setup.set: one field tried in the folder, fit mode's preview and token; keep marks the folder set up */
export function setField(w: Where, a: { folder?: unknown; field?: unknown; take?: unknown; by?: unknown; token?: unknown; keep?: unknown; back?: unknown }, now = Date.now()) {
  if (!okFolder(a.folder)) return { ok: false as const, why: "that is not a folder" };
  const folder = a.folder, scope = scopeOf(folder);
  if (!scope) return { ok: false as const, why: "that folder has no place Sol can keep a setup for" };
  if (typeof a.token === "string") {
    const was = setupOf(w.sol, folder).fields;
    const r = tryFit(w, { token: a.token, keep: a.keep, back: a.back }, now);
    if (r.ok && a.keep === true) mark(w.sol, folder, "person", now);
    if (!r.ok) return r;
    const setup = setupOf(w.sol, folder);
    // the field the keep changed; a Back is written by fit mode's own Back (you-known.ts back), one line a press
    const ch = a.keep === true ? setup.fields.find((f) => { const b = was.find((x) => x.field === f.field)!; return b.take !== f.take || b.by !== f.by; }) : undefined;
    if (ch) fixOf(w.sol, folder, "keep", `“${ch.n}: ${ch.name}”`, `setup:${folder}:${FIELD_KEY[ch.field]}`, now, { was: was.find((x) => x.field === ch.field)!.name });
    return { ...r, setup };
  }
  const field = FIELDS.find((f) => f === a.field);
  if (!field) return { ok: false as const, why: "a setup's field is job, order, rest, open or look" };
  if (typeof a.take !== "string" || !TAKES[field].some((t) => t.id === a.take)) return { ok: false as const, why: `that is not a take of ${FIELD_N[field].toLowerCase()}` };
  const was = setupOf(w.sol, folder).fields.find((f) => f.field === field)!;
  if (was.take === a.take && was.by !== "default") return { ok: false as const, why: "that is the take there already" };
  const r = tryFit(w, { knob: `folder.${field}`, scope, take: a.take, by: a.by ?? "pick", reason: `${FIELD_N[field]} for ${nameOf(folder)}` }, now);
  if (!r.ok || !("preview" in r)) return r;
  // the preview says the folder's own take as it stands (a default, or this folder's), never a parent's
  return { ok: true as const, preview: { token: r.preview.token, changes: r.preview.changes.map((c) => ({ ...c, from: was.take, fromN: was.name, toN: TAKES[field].find((t) => t.id === a.take)!.n, field, folder })) } };
}

/** next.folder.setup.keep: the setup as it stands is the folder's, so its agent starts sorting */
export function keepSetup(home: string, a: { folder?: unknown }, now = Date.now()): R<{ setup: Setup }> {
  if (!okFolder(a.folder)) return { ok: false, why: "that is not a folder" };
  const was = read(home).folders[a.folder]?.by;
  mark(home, a.folder, "person", now);
  if (was !== "person") fixOf(home, a.folder, "keep", `“${nameOf(a.folder)}'s setup”`, `setup:${a.folder}`, now);
  return { ok: true, setup: setupOf(home, a.folder) };
}

/** next.folder.setup.drop: one read line taken out (×); Sol leaves it out of the reading until the person sets that field */
export function dropLine(home: string, a: { folder?: unknown; line?: unknown }): R<{ setup: Setup }> {
  if (!okFolder(a.folder)) return { ok: false, why: "that is not a folder" };
  const line = LINES.find((x) => x === a.line);
  if (!line) return { ok: false, why: "a setup's line is for, organized or looks" };
  const s = read(home), was = s.dropped[a.folder] ?? [];
  if (!was.includes(line)) {
    const said = setupOf(home, a.folder, fsReader, s).read.lines.find((x) => x.key === line);
    s.dropped[a.folder] = [...was, line];
    save(home, s);
    fixOf(home, a.folder, "hide", `“${said?.line ?? `${nameOf(a.folder)}'s ${line} line`}”`, `setup:${a.folder}:${line}`, Date.now());
  }
  return { ok: true, setup: setupOf(home, a.folder) };
}

/** the move-in runs a folder's setup (item 3): Sol's own takes, each with its reason; a field the person set or held is
 *  left alone (fits.ts solSet refuses it) */
export function runSetup(home: string, folder: string, takes: Partial<Record<Field, string>>, reason: string, now = Date.now()): R<{ setup: Setup }> {
  const scope = scopeOf(folder);
  if (!okFolder(folder) || !scope) return { ok: false, why: "that is not a folder" };
  for (const field of FIELDS) {
    const t = takes[field];
    if (t && TAKES[field].some((x) => x.id === t)) solSet(home, { knob: `folder.${field}`, scope, take: t, reason, count: 1, source: "moving in" }, now);
  }
  mark(home, folder, "sol", now);
  return { ok: true, setup: setupOf(home, folder) };
}

// ------------------------------------------------------------------------------------------- the folder's agent

const WORD = /[\p{L}\p{N}]{3,}/gu;
const wordsOf = (s: string) => new Set((s.toLowerCase().match(WORD) ?? []));
const thingKey = (t: Thing) => `${t.kind}:${t.id}`;
/** the Monday a time falls in, as the week folder's name ("Week of 16 Nov 2026"): a day and a month, never a person's word */
export function weekOf(at: number): string {
  const d = new Date(at), back = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `Week of ${m.getDate()} ${m.toLocaleString("en-GB", { month: "short" })} ${m.getFullYear()}`;
}

/** a folder's subfolders: on the disk (an h: folder's, or a w: folder's), and any folder id below it
 *  that a note or session already sits in (a folder the canvas made) */
export function subfoldersOf(home: string, folder: string, r: Reader = fsReader): { id: string; name: string }[] {
  const out = new Map<string, string>(), abs = diskOf(home, folder);
  if (abs) for (const d of r.list(abs) ?? []) if (d.dir && !d.name.startsWith(".") && !SKIP.has(d.name.toLowerCase())) out.set(`${folder}/${d.name}`, d.name);
  const below = (f: string | null) => { if (f && f.startsWith(folder + "/")) { const name = f.slice(folder.length + 1).split("/")[0]; if (name) out.set(`${folder}/${name}`, name); } };
  for (const n of readNotes(home)) below(n.folder);
  for (const k of Object.values(readFolderSessions(home))) below(k.folder);
  return [...out].map(([id, name]) => ({ id, name }));
}

/** the subfolder a thing belongs in by the folder's order, and why; null when none is clearly it */
function placeFor(home: string, folder: string, order: string, t: Thing & { at: number }, subs: { id: string; name: string }[]): { to: string; toN: string; why: string; make: boolean } | null {
  if (order === "week") {
    const name = weekOf(t.at), had = subs.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (had) return { to: had.id, toN: had.name, why: `it is from the ${name.toLowerCase()}, and this folder keeps a folder for each week`, make: false };
    // a week folder is made only where Sol keeps folders (an h: folder, under SOL_HOME), never on the person's own disk
    return folder.startsWith("h:") ? { to: `${folder}/${name}`, toN: name, why: `it is from the ${name.toLowerCase()}; this folder keeps a folder for each week, so Sol made that week's`, make: true } : null;
  }
  // by words: the subfolder whose name and kept facts share the most words with the thing, and clearly more than the next
  const mine = wordsOf(t.label);
  if (!mine.size || !subs.length) return null;
  const scored = subs.map((s) => {
    const sc = scopeOf(s.id), c = sc ? contextOf(home, sc) : null;
    const theirs = wordsOf(`${s.name} ${c && c.ok ? c.facts.filter((f) => f.place === sc).map((f) => f.fact).join(" ") : ""}`);
    const shared = [...mine].filter((w) => theirs.has(w));
    return { s, shared };
  }).sort((a, b) => b.shared.length - a.shared.length);
  const [a, b] = scored;
  if (!a.shared.length || (b && b.shared.length === a.shared.length)) return null;
  return { to: a.s.id, toN: a.s.name, why: `it speaks of ${a.shared.slice(0, 3).map((w) => `“${w}”`).join(", ")}, as ${a.s.name} does`, make: false };
}

/** the agent's pass over one folder: what is new at its top level, sorted in by its setup. Writes the moves, one Diary
 *  line and the run; answers the run (no moves: null). by "person" when the person pressed Sort; the clock's pass is Sol's */
export function sortRun(home: string, folder: string, by: "sol" | "person" = "sol", now = Date.now(), r: Reader = fsReader): R<{ run: Run | null }> {
  if (!okFolder(folder)) return { ok: false, why: "that is not a folder" };
  if (readPause(home)) return { ok: true, run: null };
  const s = read(home), setup = setupOf(home, folder, r, s);
  if (by === "sol" && !setup.sorts) return { ok: true, run: null };
  if (setup.history) return { ok: false, why: "Sol never sorts inside a folder that keeps a history of its changes: its folders are its code" };
  const order = setup.fields.find((f) => f.field === "order")!.take;
  if (order === "thread" || order === "date") return { ok: true, run: null };
  const sorted = new Set([...s.pinned, ...s.runs.flatMap((x) => x.moves.map((m) => thingKey(m.thing)))]);
  const things: (Thing & { at: number })[] = [
    ...readNotes(home).filter((n) => n.folder === folder).map((n) => ({ kind: "note" as const, id: n.id, label: n.text.replace(/\s+/g, " ").trim().slice(0, 80), at: n.made || n.at })),
    ...Object.entries(readFolderSessions(home)).filter(([, k]) => k.folder === folder && !k.working).map(([id, k]) => ({ kind: "session" as const, id, label: k.title, at: k.at })),
  ].filter((t) => !sorted.has(thingKey(t)));
  if (!things.length) return { ok: true, run: null };
  const subs = subfoldersOf(home, folder, r), moves: Move[] = [];
  for (const t of things) {
    const p = placeFor(home, folder, order, t, subs);
    if (!p) continue;
    if (p.make) {
      const abs = diskOf(home, p.to);
      if (!abs) continue;
      let made = false;
      try { mkdirSync(abs); made = true; } catch { /* there already, or it can't be: the move goes there if it is there */ }
      subs.push({ id: p.to, name: p.toN });
      p.make = made;
    }
    const ok = t.kind === "note" ? moveNote(home, { id: t.id, folder: p.to }, now).ok : refile(home, t.id, folder, p.to, now);
    if (ok) moves.push({ thing: { kind: t.kind, id: t.id, label: t.label }, from: folder, to: p.to, toN: p.toN, why: p.why, made: p.make });
  }
  if (!moves.length) return { ok: true, run: null };
  const run: Run = { id: `sort-${randomBytes(5).toString("hex")}`, at: now, folder, by, moves };
  const said = moves.slice(0, 3).map((m) => `“${m.thing.label || (m.thing.kind === "note" ? "a note" : "a session")}” into ${m.toN}`).join(", ") + (moves.length > 3 ? ` and ${moves.length - 3} more` : "");
  const d = writeLine(home, { words: `Sol sorted ${moves.length === 1 ? "one thing" : `${moves.length} things`} in ${nameOf(folder)}: ${said}.`, region: folder, embed: { sort: run.id }, via: "sort" }, new Date(now));
  if (d.ok && "id" in d && d.id) run.line = d.id;
  s.runs.push(run);
  save(home, s);
  return { ok: true, run };
}

/** next.folder.sort.back: each move (or the one named) put back where it came from if it is still where Sol put it;
 *  the thing is pinned there, so the agent leaves it; an empty week folder Sol made goes with it */
export function sortBack(home: string, a: { run?: unknown; move?: unknown }, now = Date.now()): R<{ run: Run; refused: { thing: Thing; why: string }[] }> {
  const s = read(home), run = s.runs.find((x) => x.id === a.run);
  if (!run) return { ok: false, why: "that sort isn't here" };
  const which = typeof a.move === "number" ? [run.moves[a.move]].filter(Boolean) : run.moves;
  if (!which.length) return { ok: false, why: "that move isn't in this sort" };
  const refused: { thing: Thing; why: string }[] = [];
  const sessions = readFolderSessions(home), notes = readNotes(home);
  for (const m of which) {
    if (m.back) continue;
    const now_ = m.thing.kind === "note" ? notes.find((n) => n.id === m.thing.id)?.folder : sessions[m.thing.id]?.folder;
    if (now_ === undefined) { refused.push({ thing: m.thing, why: "it isn't here any more" }); continue; }
    if (now_ !== m.to) { refused.push({ thing: m.thing, why: "you moved it since; it stays where you put it" }); continue; }
    const ok = m.thing.kind === "note" ? moveNote(home, { id: m.thing.id, folder: m.from }, now).ok : refile(home, m.thing.id, m.to, m.from, now);
    if (!ok) { refused.push({ thing: m.thing, why: "it could not go back" }); continue; }
    m.back = now;
    if (!s.pinned.includes(thingKey(m.thing))) s.pinned.push(thingKey(m.thing));
  }
  // a week folder Sol made, empty now and nothing left in it: taken away
  for (const m of which) if (m.made && m.back && !run.moves.some((x) => x.to === m.to && !x.back)) {
    const abs = diskOf(home, m.to);
    try { if (abs && !readdirSync(abs).length) rmdirSync(abs); } catch { /* not empty, or gone: left as it is */ }
  }
  save(home, s);
  // one fix line for the press: what went back, from where Sol had put it
  const went = which.filter((m) => m.back === now);
  if (went.length) {
    const label = (m: Move) => m.thing.label || (m.thing.kind === "note" ? "a note" : "a session");
    noteFixIn(home, { how: "put-back", what: went.length === 1 ? `“${label(went[0])}”` : `${went.length} things`, was: [...new Set(went.map((m) => nameOf(m.from)))].join(", "), place: run.folder, reason: `sort:${run.id}` }, now);
  }
  return { ok: true, run, refused };
}

/** the folders whose agent sorts (the clock's pass reads them) */
export const sortingFolders = (home: string): string[] => Object.keys(read(home).folders);
export const runsOf = (home: string, folder?: string): Run[] => read(home).runs.filter((x) => !folder || x.folder === folder);

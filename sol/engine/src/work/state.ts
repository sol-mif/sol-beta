// Work mode's own marks on Claude Code sessions: pinned, done, unread, archived, which group a session sits in, which
// session started which, folders Marco added by hand, the groups whole folders sit in, and the folders that moved. Claude's transcripts stay Claude's (the SDK writes them);
// these marks are Sol's and live in one small JSON file outside the repo:
//   macOS  ~/Library/Application Support/com.marcol04.sol/work.json
//   Linux  ~/.local/share/sol/work.json
//   SOL_STATE=<file> overrides (a test engine uses its own).
// No file yet is an empty state. A file that is there and does not read (a hand edit's stray comma, a torn write) is
// put aside beside it as work.bad-<when>.json before anything is written in its place (#896), and one line says so.
// A write that cannot happen (a full disk) is one line too, never the engine's end (#897): the marks stay in memory
// and the next change writes them.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir, platform } from "node:os";

export type Marks = {
  pinned?: boolean;
  done?: boolean;
  unread?: boolean;
  archived?: boolean;
  group?: string;     // a group id
  parent?: string;    // the session that started this one: history ("started by"); since 2026-11-14 it folds nothing
  under?: string;   // the orchestration session that runs this one (folds it in the side): its starter, or set by grouping (group.ts) or a hand
  kind?: "orchestration";   // an orchestration session: runs other sessions (one.ts); absent = a normal session
  grouped?: string;   // the engine put it under (group.ts, #1336): by which evidence (start, card, send, read); the side's mark and undo
  seen?: number;      // when Marco last had it open (ms)
  failed?: boolean;   // its last turn failed (kept after the run closes)
  mode?: "life" | "work" | "cowork"; // the conversation's own mode: a Life conversation handed into Work says "work";
                          // one started from Cowork says "cowork" (Together #31: Work's side does not list it)
  card?: string;      // the proposal card (its tool call) this session was started from
  settled?: Record<string, string>;   // thread map ends already reconciled: an end's last entry -> "fold" | "fork:<id>" | "kept:<id>"
  moved?: string;     // its kept end went on in this session (reconcile could not write on here)
  folder?: string;    // shown under this folder instead of its own (its cwd stays as it is)
  room?: string;      // the room it was started under (#230): only such a session says its title to that room
  roomId?: string;    // that room's id (#314): the face files the session under its group; `room` stays the hash that guards titles
  goalv?: string;     // the room's goal it started with (#234): the first turn carried that snapshot
  thing?: string;     // the room's thing beside it when it started (#238): its room show names it
  memv?: string;      // the group's memory it started with (#316): the shas of the memory files its first turn carried
  role?: Role;        // its part in the dev cycle (#484): given to the guard as SOL_ROLE on every run, set once, at its start
  woken?: "mine" | "others";   // started by a comment on GitHub (#1151, team/wake.ts): every run of it, a resume after a restart
                               // too, is held bare (runs.ts). Set once, at its start, never taken off
};
// the parts a session plays in the dev cycle (#484, sol/locks/team.mjs ROLES, the same list): the guard holds each to its
// locks. Kept on the session, so every run of it (a resume, a restart) is held the same
export const ROLES = ["builder", "verifier", "reviewer", "triage", "first-timer", "dev", "beta", "hand-in"] as const;
export type Role = (typeof ROLES)[number];
// how much a role is held to, most first (team.mjs STRICT): the first-timer touches nothing, the builder never edits
// eval.md, the verifier only adds its Releases line; the rest share the same locks. No role is held to least
const STRICT: readonly string[] = ["first-timer", "builder", "verifier"];
const strictness = (r?: string) => (r ? (STRICT.includes(r) ? STRICT.length - STRICT.indexOf(r) : 0) : -1);
/** a role as given: one of ROLES, undefined for none, and "builder" for one nobody knows (a typo never loosens a lock) */
export const roleIn = (v: unknown): Role | undefined => { const s = String(v ?? "").trim(); return !s ? undefined : (ROLES as readonly string[]).includes(s) ? s as Role : "builder"; };
/** the stricter of two roles: a session started from one with a role never sheds its locks */
export const stricter = (a?: string, b?: string): Role | undefined => { const x = roleIn(a), y = roleIn(b); return strictness(y) > strictness(x) ? y : x; };
// folders: whole folders in it (one group each). in: a topic group inside that folder, holding that folder's sessions
// only (never folders). about: one line on what it is for, so a fresh session there can be filed in it by the model
export type Group = { id: string; name: string; at: number; folders?: string[]; in?: string; about?: string };
// Work's settings drawers (the ones the engine acts on; the face keeps its own pings and keys)
export type Prefs = {
  wtDir: string;        // where side copies go: "" = inside each repo, <repo>/.claude/worktrees
  prefix: string;       // on the branches Sol makes
  archivePr: boolean;   // archive a side copy's sessions once its pull request is merged or closed
  archiveDays: number;  // archive sessions untouched this many days (0 = never)
  browser: boolean;     // the model may drive the browser pane
  suggest: boolean;     // a suggested next prompt after each turn
  awake: boolean;       // keep the machine awake while a session works
  battery: boolean;     // ... on battery too
  style: string;        // the output style new runs start with ("" = Claude Code's default)
  stale: boolean;       // the side lists gone folders and the Claude app's scratch workspaces too
  newIn: string;        // the folder a fresh session starts in when none is picked ("" = the home folder)
};
export const PREFS: Prefs = { wtDir: "", prefix: "claude/", archivePr: false, archiveDays: 0, browser: true, suggest: true, awake: false, battery: false, style: "", stale: false, newIn: "" };
export type WorkState = {
  marks: Record<string, Marks>;
  groups: Group[];
  folders: string[];         // added by hand; shown even with no sessions
  hidden: string[];          // folders Marco took out of the side
  order: string[];           // the side's top rows as Marco dragged them: "g:<group id>" or a folder's path (#73)
  prefs?: Partial<Prefs>;
  copies?: Record<string, string>;   // the side copies Sol made: folder → its repo
  moved?: Record<string, string>;    // folders renamed or moved: old path → where it is now (rename.ts and sol/mine/live --rename write it, #129, #181)
};

const FILE = process.env.SOL_STATE
  ?? (platform() === "darwin"
    ? join(homedir(), "Library", "Application Support", "com.marcol04.sol", "work.json")
    : join(homedir(), ".local", "share", "sol", "work.json"));

export const STATE_DIR = dirname(FILE); // attachments for Work sessions go under it too
let state: WorkState | null = null;
const empty = (): WorkState => ({ marks: {}, groups: [], folders: [], hidden: [], order: [] });
const code = (e: unknown) => String((e as NodeJS.ErrnoException)?.code ?? (e as Error)?.message ?? e).split("\n")[0].slice(0, 200);

// the name an unreadable work.json is kept under, beside it (#896; the name is our pick, after arrange.ts's
// arrangement.bad-<when>.json): work.bad-<when>.json
const asideName = (when: string) => `${FILE.replace(/\.json$/, "")}.bad-${when}.json`;
// true while the file in work.json's place did not read and is still there: nothing is written over it
let unread = false;
/** move the file that did not read out of the way, under a name of its own (a second never covers the first), and say
 *  that name ("" when the file is gone already); it throws when it cannot, and the file stays where it is, unwritten */
function putAside(): string {
  const when = new Date().toISOString().replace(/[:.]/g, "-");
  let bad = asideName(when);
  for (let n = 2; existsSync(bad); n++) bad = asideName(`${when}-${n}`);
  try { renameSync(FILE, bad); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; bad = ""; }
  unread = false;
  return basename(bad);
}

export function workState(): WorkState {
  if (state) return state;
  let why = "";
  try {
    const v = JSON.parse(readFileSync(FILE, "utf8"));
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    // a folder shows its own name on the disk (#181): the names it once wore here (v.names) are left behind
    state = { marks: v.marks ?? {}, groups: v.groups ?? [], folders: v.folders ?? [], hidden: v.hidden ?? [], order: Array.isArray(v.order) ? v.order.map(String) : [], prefs: v.prefs ?? {}, copies: v.copies ?? {}, moved: v.moved ?? {} };
    return state;
  } catch (e) {
    const c = (e as NodeJS.ErrnoException).code;
    // no file yet (or no folder for it): the empty state, as quiet as ever. What a parse says can quote the file, so
    // the line only says that it does not parse
    if (c !== "ENOENT" && c !== "ENOTDIR") why = c ?? "it does not parse";
  }
  state = empty();
  if (why) {
    unread = true;
    try { const bad = putAside(); console.warn(`work: ${basename(FILE)} could not be read (${why})${bad ? `; it is kept aside as ${bad}` : ""} and Work starts from an empty state`); }
    catch (e) { console.warn(`work: ${basename(FILE)} could not be read (${why}) and could not be put aside (${code(e)}); nothing is written over it until it can`); }
  }
  return state;
}

let timer: NodeJS.Timeout | undefined;
let failing = "";   // why the last write did not happen: a run of the same failure says one line, not one per mark
function save(now = false) {
  clearTimeout(timer);
  if (now) return write();   // a woken mark (#1151): written at once, so no crash leaves its session unmarked
  timer = setTimeout(write, 150);
}
function write() {
  const tmp = FILE + ".tmp";
  try {
    if (unread) { const bad = putAside(); if (bad) console.warn(`work: the ${basename(FILE)} that could not be read is kept aside as ${bad}`); }
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(tmp, JSON.stringify(state, null, 1));
    renameSync(tmp, FILE);
    if (failing) { failing = ""; console.warn(`work: ${basename(FILE)} is written again`); }
  } catch (e) {
    // a write that cannot happen (a full disk, a folder that is not one) is not the engine's end (#897): the state
    // stays in memory and the next save() tries again
    try { rmSync(tmp, { force: true }); } catch { /* the half-written temp file stays; the next write covers it */ }
    const why = code(e);
    if (why !== failing) console.warn(`work: ${basename(FILE)} was not written (${why}); the marks stay in memory and the next change tries again`);
    failing = why;
  }
}

const KEYS = ["pinned", "done", "unread", "archived", "group", "parent", "seen", "failed", "mode", "card", "moved", "folder", "room", "roomId", "goalv", "memv", "role", "woken", "under", "kind", "grouped"] as const;
export function mark(sessionId: string, patch: Partial<Record<keyof Marks, unknown>>) {
  const s = workState();
  const m = { ...(s.marks[sessionId] ?? {}) } as Record<string, unknown>;
  for (const k of KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (k === "role") { if (m.role === undefined && roleIn(v)) m.role = roleIn(v); continue; }   // set once: never changed or taken off
    if (k === "woken") { if (m.woken === undefined && (v === "mine" || v === "others")) m.woken = v; continue; }   // the same (#1151)
    // 2026-11-14: only "orchestration" is a kind; anything else is a normal session, which carries no kind at all
    if (k === "kind") { if (v === "orchestration") m.kind = v; else delete m.kind; continue; }
    if (v === null || v === false || v === "" || v === undefined) delete m[k];
    else m[k] = k === "group" || k === "parent" || k === "under" || k === "grouped" || k === "card" || k === "moved" || k === "folder" || k === "room" || k === "roomId" || k === "goalv" || k === "memv" ? String(v) : k === "seen" ? Number(v) : k === "mode" ? (v === "life" || v === "cowork" ? v : "work") : true;
  }
  if (patch.settled && typeof patch.settled === "object") m.settled = { ...(m.settled as object ?? {}), ...(patch.settled as Record<string, string>) };
  // a fork or a side session of a woken one is woken the same (#1151): its history holds the same words
  const from = typeof m.parent === "string" ? s.marks[m.parent]?.woken : undefined;
  if (from && m.woken === undefined) m.woken = from;
  if (Object.keys(m).length) s.marks[sessionId] = m as Marks; else delete s.marks[sessionId];
  save(m.woken !== undefined && s.marks[sessionId] !== undefined && ("woken" in patch || "parent" in patch));
}

export function forget(sessionId: string) {
  const s = workState();
  delete s.marks[sessionId];
  save();
}

// a folder sits in one group at most: putting it in one takes it out of the others
function moveFolder(s: WorkState, id: string | null, folder: string) {
  for (const x of s.groups) if (x.folders?.includes(folder)) { x.folders = x.folders.filter((p) => p !== folder); if (!x.folders.length) delete x.folders; }
  const g = id && s.groups.find((x) => x.id === id && !x.in);   // a topic group holds sessions only
  if (g) g.folders = [...(g.folders ?? []), folder];
}
const pathsIn = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : undefined);

const aboutOf = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

export function groupOp(op: string, a: { id?: string | null; name?: string; sessions?: string[]; folders?: unknown; folder?: unknown; in?: unknown; about?: unknown }): string | undefined {
  const s = workState();
  if (op === "add") {
    let id = "g" + Date.now().toString(36);
    while (s.groups.some((x) => x.id === id)) id += "x";   // two made in the same millisecond
    const g: Group = { id, name: String(a.name || "group").slice(0, 60), at: Date.now() };
    if (a.in) g.in = String(a.in);
    if (aboutOf(a.about)) g.about = aboutOf(a.about);
    s.groups.push(g);
    for (const sid of a.sessions ?? []) mark(sid, { group: id });
    if (!g.in) for (const f of pathsIn(a.folders) ?? []) moveFolder(s, id, f);
    save();
    return id;
  }
  if (op === "move") {   // a folder into a group, or (id null) out of any
    const f = String(a.folder ?? "");
    if (!f) return;
    moveFolder(s, a.id ? String(a.id) : null, f);
    save();
    return a.id ?? undefined;
  }
  const g = s.groups.find((x) => x.id === a.id);
  if (!g) return;
  if (op === "rename") {
    g.name = String(a.name || g.name).slice(0, 60);
    if ("about" in a) { const t = aboutOf(a.about); if (t) g.about = t; else delete g.about; }
    if ("in" in a) { if (a.in) { g.in = String(a.in); for (const f of g.folders ?? []) moveFolder(s, null, f); } else delete g.in; }
    const fs = g.in ? undefined : pathsIn(a.folders);
    if (fs) { for (const f of g.folders ?? []) if (!fs.includes(f)) moveFolder(s, null, f); for (const f of fs) if (!g.folders?.includes(f)) moveFolder(s, g.id, f); }
  }
  else if (op === "delete") {
    s.groups = s.groups.filter((x) => x !== g);
    for (const [sid, m] of Object.entries(s.marks)) if (m.group === g.id) mark(sid, { group: null });
  }
  save();
  return g.id;
}

export function folderOp(op: string, path: string) {
  const s = workState();
  if (!path) return;
  if (op === "add") { s.folders = [...new Set([...s.folders, path])]; s.hidden = s.hidden.filter((p) => p !== path); }
  else if (op === "hide") { s.hidden = [...new Set([...s.hidden, path])]; s.folders = s.folders.filter((p) => p !== path); }
  else if (op === "show") s.hidden = s.hidden.filter((p) => p !== path);
  else return;   // a folder's name is its name on the disk: renaming it is rename.ts (#181)
  save();
}

// a folder renamed on the disk (rename.ts, #181): every path Sol keeps that is the folder or under it says the new place,
// and moved remembers the old one, so Claude's transcripts (which still say it) file under the new folder. An older move
// that ended in the old place now ends in the new one (chains collapse); one that started where the folder now is goes,
// since that place is a real folder again. An older move that ended above the folder now moving (#901: sol → sol2, then
// sol2/engine → engine) stays, and gains a line of its own for this folder's place under the older name (sol/engine →
// engine), when the moves so far did send that place here. The map is kept longest old place first: its readers
// (sessions.ts movedTo, threads.ts placer) take the first line a path is under, so the nearest one has to come first
export function folderMoved(from: string, to: string) {
  const s = workState();
  const under = (p: string, d: string) => p === d || p.startsWith(d + "/");
  const at = (p: string) => (under(p, from) ? to + p.slice(from.length) : p);
  for (const m of Object.values(s.marks)) if (m.folder) m.folder = at(m.folder);
  for (const g of s.groups) { if (g.folders) g.folders = [...new Set(g.folders.map(at))]; if (g.in) g.in = at(g.in); }
  s.folders = [...new Set(s.folders.map(at))];
  s.hidden = [...new Set(s.hidden.map(at))];
  s.order = [...new Set(s.order.map((k) => (k.startsWith("/") ? at(k) : k)))];
  if (s.prefs) for (const k of ["newIn", "wtDir"] as const) { const v = s.prefs[k]; if (typeof v === "string" && v) s.prefs[k] = at(v); }
  if (s.copies) s.copies = Object.fromEntries(Object.entries(s.copies).map(([c, r]) => [at(c), at(r)]));
  const old = Object.entries(s.moved ?? {});
  // where the moves so far send a path: by the longest old place it is or is under, whatever order the file kept them in
  const was = (p: string) => { let hit: [string, string] | undefined; for (const e of old) if (under(p, e[0]) && e[0].length > (hit?.[0].length ?? -1)) hit = e; return hit ? hit[1] + p.slice(hit[0].length) : p; };
  const mv: Record<string, string> = {};
  const put = (a: string, t: string) => { if (!under(a, to) && a !== t) mv[a] = t; };
  for (const [a, b] of old) {
    put(a, at(b));
    if (from === b || !under(from, b)) continue;
    // the folder now moving sits inside the place this older move ended in: what was recorded under the older name goes
    // with it. Not when that place had sent its paths elsewhere (a folder that left before, and a new one of its name)
    const k = a + from.slice(b.length);
    if (was(k) === from) put(k, to);
  }
  mv[from] = to;
  s.moved = Object.fromEntries(Object.entries(mv).sort(([x], [y]) => y.length - x.length));
  save();
}

// the side's top rows in Marco's order: the list replaces the last one; a row not in it goes after, in the side's own rule
export function setOrder(keys: unknown): string[] {
  const s = workState();
  // a key is a group ("g:<id>") or a folder (an absolute path); anything else is not a row and is left out
  const isKey = (k: unknown): k is string => typeof k === "string" && (/^g:[^\s]+$/.test(k) || k.startsWith("/"));
  s.order = [...new Set(Array.isArray(keys) ? keys.filter(isKey).map((k) => k.slice(0, 1000)) : [])].slice(0, 500);
  save();
  return s.order;
}

export const prefs = (): Prefs => ({ ...PREFS, ...(workState().prefs ?? {}) });
// a change from the drawers: each value checked for its kind, anything else ignored
export function setPrefs(patch: Record<string, unknown>): Prefs {
  const s = workState(), p = { ...(s.prefs ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in PREFS)) continue;
    const kind = typeof PREFS[k as keyof Prefs];
    if (kind === "boolean") p[k] = !!v;
    else if (kind === "number") p[k] = Math.max(0, Math.min(365, Math.round(Number(v) || 0)));
    else {
      let t = String(v ?? "").trim();
      if (k === "wtDir" || k === "newIn") { t = t.replace(/^~(?=\/|$)/, homedir()); if (t && !t.startsWith("/")) throw new Error(k === "wtDir" ? "the side-copy folder must be a full path" : "the folder for new sessions must be a full path"); t = t.replace(/\/+$/, ""); }
      if (k === "prefix" && !/^(?![-/.])(?!.*\.\.)[\w./-]{0,40}$/.test(t)) throw new Error("a branch prefix is letters, digits, - _ . /");
      if (k === "style") t = t.slice(0, 80);
      p[k] = t;
    }
  }
  s.prefs = p as Partial<Prefs>;
  save();
  return prefs();
}
export const copies = (): Record<string, string> => workState().copies ?? {};
// a folder renamed or moved (#129): Claude's transcripts still say the old place, so sessions.ts files them under the new one
export const moved = (): Record<string, string> => workState().moved ?? {};
export function noteCopy(at: string, repo: string | null) {
  const s = workState(), c = { ...(s.copies ?? {}) };
  if (repo) c[at] = repo; else delete c[at];
  s.copies = c;
  save();
}

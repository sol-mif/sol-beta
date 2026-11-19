// The system view reflects the work as it happens (#1156): which systems the running sessions are changing now. Each
// recent session (a Sol Work or Build session, or any Claude Code session on this machine) works in a checkout of this
// repo; the files it changed are git's status there plus its commits ahead of main. Each path goes to the record whose
// `where.paths` holds it, the longest prefix winning (a tie: every record at that length, a live one before a legacy
// one). A path no record holds is "no system yet", by folder. With `write` on (off in the engine, wire.ts), a committed
// one also gets a proposal in that checkout's sol/systems/proposals.json (never in records: a person decides a record). The open PRs against main
// are counted per system from GitHub, kept five minutes. Drift is each session's distance from main (behind, ahead).
//
// Nothing polls fast: a session's transcript that changes (~/.claude/projects) or a tool call that ends on the run bus
// reads that one checkout again a moment later; a sweep every 60 s catches the rest (a commit made in a terminal).
// Only while a face holds the view: nobody pays before.
//
//   work.systems.live  {}  → { live }      the work under way now; the face is then told on every change
//   work.systems.live  { live }            to every face that asked, when it changed
//   GET /systems/live      → live          the same, read once (parts/systems-live.ts)
import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { readRegistry, recordsDir, type Rec } from "./systems.js";

// ---- the core: a path to its systems (pure) ----
export type PathIndex = { prefix: string; id: string; legacy: boolean }[];
/** a record path as a repo path, or "" when it is not one (a home path, a glob, empty) */
export const repoPath = (p: string) => {
  const s = p.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  return !s || s.startsWith("~") || s.startsWith("/") || s.includes("*") || s.includes("..") ? "" : s;
};
/** every repo path a record holds, longest first */
export function pathIndex(recs: Map<string, Rec>): PathIndex {
  const out: PathIndex = [];
  for (const r of recs.values()) for (const p of r.where?.paths ?? []) {
    const prefix = repoPath(p);
    if (prefix) out.push({ prefix, id: r.id, legacy: r.state === "legacy" });
  }
  return out.sort((a, b) => b.prefix.length - a.prefix.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** the systems that hold a repo path: the longest prefix that is the path or a folder above it; a tie gives every record
 *  at that length, the live ones only when any is live; [] when no record holds it */
export function systemsOf(path: string, idx: PathIndex): string[] {
  const p = path.replace(/\/+$/, "");
  const hit = idx.filter((x) => p === x.prefix || p.startsWith(`${x.prefix}/`));
  if (!hit.length) return [];
  const top = hit.filter((x) => x.prefix.length === hit[0].prefix.length);
  const live = top.filter((x) => !x.legacy);
  return [...new Set((live.length ? live : top).map((x) => x.id))];
}
/** the folder a path is shown under when no record holds it: its own folder, an untracked folder (git says it with a
 *  trailing /) itself, or the file itself at the top */
export const folderOf = (path: string) => {
  if (path.endsWith("/")) return path.replace(/\/+$/, "");
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : path;
};

/** folders that are never a system: a person's own home and notes (never committed to main) */
export const NOT_SYSTEMS = ["sol/home", "mine"];
const notSystem = (path: string) => NOT_SYSTEMS.some((n) => path === n || path.startsWith(`${n}/`));
/** the system an uncovered folder sits nearest: the parent of the live record whose path shares the most folders with
 *  it, else the root (pure) */
export function nearOf(folder: string, recs: Map<string, Rec>): string {
  const parts = folder.split("/");
  let best: Rec | undefined, most = 0;
  for (const r of recs.values()) {
    if (r.state === "legacy") continue;
    for (const p of r.where?.paths ?? []) {
      const q = repoPath(p).split("/");
      let n = 0; while (n < parts.length && n < q.length && parts[n] === q[n]) n++;
      if (n > most || (n === most && n > 0 && best && r.id < best.id)) { most = n; best = r; }
    }
  }
  return (best && (best.parent ?? best.id)) || "jelly";
}

export type Proposal = { id: string; system: string; title: string; why: string; what: string; effort: string; evidence: string; folder: string };
export const proposalId = (folder: string) => `p-system-${folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
/** a proposal for a record that holds a folder: it would sit beside the record whose path shares the most folders with
 *  it (under that record's parent), else under the root (pure) */
export function proposalFor(folder: string, files: string[], recs: Map<string, Rec>, by: { title: string; person: string; branch: string; at: number }): Proposal {
  const system = nearOf(folder, recs);
  const shown = files.slice(0, 6).join(", ") + (files.length > 6 ? ` and ${files.length - 6} more` : "");
  return {
    id: proposalId(folder), system, title: `A system for ${folder}`,
    why: `${files.length} file${files.length === 1 ? "" : "s"} in ${folder} changed on ${by.branch} (${by.person}, "${by.title}") and no record holds the folder`,
    what: `A record in sol/systems/records whose where.paths holds ${folder}, or the folder added to the record it belongs to`,
    effort: "small", evidence: `${shown} (${new Date(by.at).toISOString().slice(0, 10)})`, folder,
  };
}
/** a folder that may get a proposal: inside a folder (a file at the top is not a system), not the registry itself */
export const proposable = (folder: string) => folder.includes("/") && !folder.startsWith("sol/systems") && !notSystem(folder);
/** the proposals file's list with the new ones added once each, by id (pure); null when the list is not a list */
export function withProposals(list: unknown, adds: Proposal[]): { list: unknown[]; added: string[] } | null {
  if (!Array.isArray(list)) return null;
  const have = new Set(list.map((p) => (p && typeof p === "object" ? (p as { id?: unknown }).id : undefined)));
  const added: string[] = [], out = [...list];
  for (const p of adds) if (!have.has(p.id)) { have.add(p.id); out.push(p); added.push(p.id); }
  return { list: out, added };
}

// ---- the join: what each checkout's git says, by session and system (pure) ----
export type Changed = { path: string; at: number; committed: boolean };
export type SessionHere = { id: string; title: string; updatedAt: number; machine?: string; edits?: Map<string, number> };
export type Read = { top: string; branch: string; person: string; behind: number; ahead: number; files: Changed[]; sessions: SessionHere[] };
export type Work = {
  system: string; session: string; title: string; person: string; branch: string; files: string[]; at: number;
  behind: number; ahead: number; machine?: string;
};
export type Unclaimed = { folder: string; files: string[]; committed: string[]; session: string; title: string; person: string; branch: string; at: number; top: string; near: string };
export type Live = { at: number; work: Work[]; uncovered: Unclaimed[]; prs: Record<string, number[]> };

/** who changed a file in a checkout: the session that edited it last (heard on the run bus), else the session there
 *  that moved last */
const ownerOf = (f: Changed, ss: SessionHere[]) => {
  let who: SessionHere | undefined, when = -1;
  for (const s of ss) { const t = s.edits?.get(f.path); if (t !== undefined && t > when) { who = s; when = t; } }
  return who ?? ss.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
};
/** each checkout's files by session and system, against that checkout's own registry (`reg`: its records and their
 *  index; a branch that adds a record holds its own folder). A person's own folders (NOT_SYSTEMS) count for nothing */
export function joinWork(reads: Read[], reg: (r: Read) => { idx: PathIndex; recs?: Map<string, Rec> }): { work: Work[]; uncovered: Unclaimed[] } {
  const work = new Map<string, Work>(), unc = new Map<string, Unclaimed>();
  for (const r of reads) {
    if (!r.sessions.length) continue;
    const { idx, recs } = reg(r);
    for (const f of r.files) {
      if (notSystem(f.path)) continue;
      const s = ownerOf(f, r.sessions);
      const ids = systemsOf(f.path, idx);
      if (!ids.length) {
        const folder = folderOf(f.path), k = `${r.top}\n${folder}\n${s.id}`;
        const u = unc.get(k) ?? { folder, files: [], committed: [], session: s.id, title: s.title, person: r.person, branch: r.branch, at: 0, top: r.top, near: recs ? nearOf(folder, recs) : "jelly" };
        u.files.push(f.path); if (f.committed) u.committed.push(f.path); u.at = Math.max(u.at, f.at);
        unc.set(k, u);
        continue;
      }
      for (const id of ids) {
        const k = `${id}\n${s.id}`;
        const w = work.get(k) ?? { system: id, session: s.id, title: s.title, person: r.person, branch: r.branch, files: [], at: 0, behind: r.behind, ahead: r.ahead, ...(s.machine ? { machine: s.machine } : {}) };
        if (!w.files.includes(f.path)) w.files.push(f.path);
        w.at = Math.max(w.at, f.at);
        work.set(k, w);
      }
    }
  }
  const byAt = <T extends { at: number }>(a: T, b: T) => b.at - a.at;
  for (const w of work.values()) w.files.sort();
  for (const u of unc.values()) { u.files.sort(); u.committed.sort(); }
  return { work: [...work.values()].sort((a, b) => byAt(a, b) || (a.system < b.system ? -1 : 1)), uncovered: [...unc.values()].sort((a, b) => byAt(a, b) || (a.folder < b.folder ? -1 : 1)) };
}
/** the open PRs by system: each PR's files to their systems (pure) */
export function prsBySystem(prs: { number: number; files: string[] }[], idx: PathIndex): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const pr of prs) {
    const ids = new Set(pr.files.flatMap((f) => systemsOf(f, idx)));
    for (const id of ids) (out[id] ??= []).push(pr.number);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a - b);
  return out;
}
/** the porcelain v1 -z status as paths: a rename gives its new name; an untracked folder its folder */
export function statusPaths(z: string): string[] {
  const out: string[] = [], parts = z.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]; if (e.length < 4) continue;
    out.push(e.slice(3));
    if (e[0] === "R" || e[0] === "C") i++;   // the old name follows
  }
  return out;
}

/** where a session works, read from its transcript: the folders of the files it names and the folders it changes into
 *  (cd, git -C), and the files it edited (Edit, Write, MultiEdit, NotebookEdit). Its recorded folder is often the main
 *  checkout while the work happens in a side copy (pure) */
export function placesIn(text: string): { dirs: string[]; edits: string[] } {
  const dirs = new Set<string>(), edits = new Set<string>();
  const dir = (f: string) => f.slice(0, Math.max(1, f.lastIndexOf("/")));
  for (const m of text.matchAll(/"name":"(?:Edit|Write|MultiEdit|NotebookEdit)","input":\{[^{}]*?"(?:file_path|notebook_path)":"(\/[^"\\]+)"/g)) edits.add(m[1]);
  for (const m of text.matchAll(/"(?:file_path|notebook_path)":"(\/[^"\\]+)"/g)) dirs.add(dir(m[1]));
  for (const m of text.matchAll(/(?:^|[\s;&(|"])(?:cd|git -C)\s+(\/[^\s"';&|)\\]+)/g)) dirs.add(m[1].replace(/\/+$/, "") || "/");
  return { dirs: [...dirs], edits: [...edits] };
}

// ---- reading the machine ----
const run = (cwd: string, args: string[], ms = 5000) => new Promise<string>((ok, no) => {
  execFile("git", ["-C", cwd, ...args], { timeout: ms, maxBuffer: 8 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }, (err, out) => (err ? no(err) : ok(out)));
});
const tops = new Map<string, { top: string | null; until: number }>();   // a folder → its checkout's top; null (kept 5 min) when it is not a Sol checkout
async function topOf(cwd: string): Promise<string | null> {
  const k = tops.get(cwd);
  if (k && Date.now() < k.until) return k.top;
  let top: string | null = null;
  try { const t = (await run(cwd, ["rev-parse", "--show-toplevel"])).trim(); if (t && existsSync(join(t, "sol", "engine"))) top = t; } catch (e) {
    if ((e as { killed?: boolean }).killed) return null;   // timed out: ask again next time
  }
  tops.set(cwd, { top, until: top ? Infinity : Date.now() + 5 * 60_000 });
  return top;
}
const people = new Map<string, string>();
/** a checkout as git says it: its branch, its distance from main, and its changes: every file in a commit ahead of main,
 *  and every uncommitted one touched since `since` (an old leftover in a working tree is not work under way) */
async function readCheckout(top: string, since: number, prev?: Read): Promise<Omit<Read, "sessions">> {
  const [branch, z] = await Promise.all([run(top, ["rev-parse", "--abbrev-ref", "HEAD"]).then((s) => s.trim()).catch(() => "?"), run(top, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"])]);
  if (!people.has(top)) people.set(top, (await run(top, ["config", "user.name"]).catch(() => "")).trim() || basename(homedir()));
  let base = "origin/main";
  try { await run(top, ["rev-parse", "--verify", "-q", base]); } catch { base = "main"; }
  let behind = 0, ahead = 0;
  try { const [b, a] = (await run(top, ["rev-list", "--left-right", "--count", `${base}...HEAD`])).trim().split(/\s+/).map(Number); behind = b || 0; ahead = a || 0; } catch { /* no main here */ }
  const files = new Map<string, Changed>();
  if (ahead > 0 && branch !== "main") {
    // each file's newest commit ahead of main: the log, newest first, NUL-separated (raw names), a \x01time mark then its files
    const log = await run(top, ["-c", "core.quotePath=false", "log", "-z", "--format=%x01%ct", "--name-only", "--no-renames", `${base}..HEAD`]).catch(() => "");
    let at = 0;
    for (const t of log.split("\0")) {
      const l = t.replace(/^\n/, "");
      if (l.startsWith("\x01")) at = Number(l.slice(1)) * 1000;
      else if (l && !files.has(l)) files.set(l, { path: l, at, committed: true });
    }
  }
  const before = new Map((prev?.files ?? []).map((f) => [f.path, f.at]));
  for (const p of statusPaths(z).slice(0, 2000)) {   // an untracked folder keeps its trailing / (folderOf reads it)
    let at: number;
    try { at = statSync(join(top, p)).mtimeMs; } catch { at = before.get(p) ?? Date.now(); }   // removed: the time it was first seen gone
    const was = files.get(p);
    if (!was && at < since) continue;
    files.set(p, { path: p, at: Math.max(at, was?.at ?? 0), committed: !!was });
  }
  return { top, branch, person: people.get(top)!, behind, ahead, files: [...files.values()] };
}

/** a session as the list gives it (sessions.ts) */
export type SessionRow = { id: string; title: string; cwd: string; updatedAt: number; machine?: string; gone?: boolean; transcript?: string };
/** how much of a transcript's end is read for where the session works */
const TAIL = 256 << 10;
/** how long a session counts as working after it last moved */
export const RECENT_MS = 6 * 3_600_000;

export class LiveWork {
  private reads = new Map<string, Read>();   // by checkout
  private edits = new Map<string, Map<string, number>>();   // a session → absolute paths it edited, when
  private seen = new Map<string, { size: number; dirs: Map<string, number> }>();   // a session's transcript, read up to size
  private proposed = new Set<string>();   // top + id: written (or found) once this run
  private prs: { at: number; by: Record<string, number[]>; asking: boolean } = { at: 0, by: {}, asking: false };
  last: Live = { at: 0, work: [], uncovered: [], prs: {} };
  constructor(private o: {
    sessions: () => Promise<SessionRow[]>;
    records?: () => Map<string, Rec>;
    openPrs?: () => Promise<{ number: number; files: string[] }[]>;
    now?: () => number;
    write?: boolean;   // proposals into the checkout's file (false: never)
    keep?: string[];   // checkouts never written to (the window's own: Update and stamp want it clean)
  }) {}
  private keep?: Set<string>;
  private kept(top: string) {
    const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
    this.keep ??= new Set((this.o.keep ?? []).map(real));
    return this.keep.has(real(top));
  }
  private regs = new Map<string, { key: string; idx: PathIndex; recs: Map<string, Rec> }>();
  /** a checkout's own registry, read again when its records folder changed; the engine's when it has none */
  private regOf(top: string): { idx: PathIndex; recs: Map<string, Rec> } {
    if (this.o.records) { const recs = this.o.records(); return { idx: pathIndex(recs), recs }; }
    let dir = join(top, "sol", "systems", "records");
    if (!existsSync(dir)) dir = recordsDir();
    let key = dir;
    try { key += `\n${statSync(dir).mtimeMs}\n${Math.floor(this.now() / 30_000)}`; } catch { /* read it now */ }
    const k = this.regs.get(top);
    if (k && k.key === key) return k;
    const recs = readRegistry(dir).recs, r = { key, idx: pathIndex(recs), recs };
    this.regs.set(top, r);
    return r;
  }
  private now() { return this.o.now?.() ?? Date.now(); }
  /** a tool call ended in a session: the file it named was changed by that session */
  edited(sessionId: string, file: string, fresh = true) {
    const m = this.edits.get(sessionId) ?? new Map<string, number>();
    if (!fresh && m.has(file)) return;   // a transcript names it again: the run bus's time is the truer one
    m.delete(file); m.set(file, this.now()); this.edits.set(sessionId, m);
    if (m.size > 500) m.delete(m.keys().next().value!);
  }
  /** read every checkout a recent session works in (or only `only`, by session id), and join */
  async read(only?: Set<string>, write = true): Promise<Live> {
    const now = this.now();
    const rows = (await this.o.sessions()).filter((s) => !s.gone && s.cwd && now - s.updatedAt < RECENT_MS && existsSync(s.cwd));
    const by = new Map<string, SessionRow[]>();
    for (const s of rows) {
      const mine = new Set<string>();
      for (const d of [s.cwd, ...this.placesOf(s)]) { const t = await topOf(d); if (t) mine.add(t); }
      for (const t of mine) by.set(t, [...(by.get(t) ?? []), s]);
    }
    for (const t of [...this.reads.keys()]) if (!by.has(t)) { this.reads.delete(t); this.regs.delete(t); }
    const todo = [...by];
    const one = async () => {   // three checkouts at a time: each is five or six git calls
      for (let x = todo.shift(); x; x = todo.shift()) {
        const [top, ss] = x, was = this.reads.get(top);
        if (only && was && !ss.some((s) => only.has(s.id))) { this.reads.set(top, { ...was, sessions: this.here(top, ss) }); continue; }
        try { this.reads.set(top, { ...(await readCheckout(top, now - RECENT_MS, was)), sessions: this.here(top, ss) }); } catch { /* the next read tries again */ }
      }
    };
    await Promise.all([one(), one(), one()]);
    const { work, uncovered } = joinWork([...this.reads.values()], (r) => this.regOf(r.top));
    void this.askPrs(() => this.o.records ? pathIndex(this.o.records()) : pathIndex(readRegistry(recordsDir()).recs));   // a PR is against main: the engine's own registry
    if (write && this.o.write !== false) this.propose(uncovered);
    this.last = { at: now, work, uncovered, prs: this.prs.by };
    return this.last;
  }
  /** the folders a session's transcript says it works in, the most recent 30 that are there; read again only when the
   *  transcript grew, and only its end. The files it edited count as its edits */
  private placesOf(s: SessionRow): string[] {
    if (!s.transcript) return [];
    let size = 0;
    try { size = statSync(s.transcript).size; } catch { return []; }
    let k = this.seen.get(s.id);
    if (!k || k.size !== size) {
      k ??= { size: 0, dirs: new Map() };
      try {
        const fd = openSync(s.transcript, "r"), n = Math.min(size, TAIL), buf = Buffer.alloc(n);
        try { readSync(fd, buf, 0, n, size - n); } finally { closeSync(fd); }
        const { dirs, edits } = placesIn(buf.toString("utf8"));
        const at = this.now();
        for (const d of dirs) { k.dirs.delete(d); k.dirs.set(d, at); }
        for (const d of [...k.dirs.keys()].slice(0, Math.max(0, k.dirs.size - 30))) k.dirs.delete(d);
        for (const f of edits) this.edited(s.id, f, false);
      } catch { /* the next read tries again */ }
      k.size = size; this.seen.set(s.id, k);
    }
    return [...k.dirs.keys()].filter((d) => existsSync(d));
  }
  private here(top: string, ss: SessionRow[]): SessionHere[] {
    return ss.map((s) => {
      const abs = this.edits.get(s.id), rel = new Map<string, number>();
      for (const [f, t] of abs ?? []) { const r = relative(top, f); if (r && !r.startsWith("..")) rel.set(r.split(sep).join("/"), t); }
      return { id: s.id, title: s.title, updatedAt: s.updatedAt, ...(s.machine ? { machine: s.machine } : {}), edits: rel };
    });
  }
  /** the open PRs, from GitHub, at most every five minutes, never waited on */
  private async askPrs(idx: () => PathIndex) {
    if (!this.o.openPrs || this.prs.asking || this.now() - this.prs.at < 5 * 60_000) return;
    this.prs.asking = true;
    try { this.prs.by = prsBySystem(await this.o.openPrs(), idx()); } catch { /* kept from the last time */ }
    this.prs.at = this.now(); this.prs.asking = false;
  }
  /** a committed path no record holds: a proposal in that checkout's proposals.json, once */
  private propose(uncovered: Unclaimed[]) {
    const byTop = new Map<string, Proposal[]>();
    for (const u of uncovered) {
      // only from a branch's own commits, into that branch: never main, never a checkout kept clean
      if (!u.committed.length || !proposable(u.folder) || u.branch === "main" || u.branch === "HEAD" || this.kept(u.top)) continue;
      const p = proposalFor(u.folder, u.committed, this.regOf(u.top).recs, u);
      if (this.proposed.has(`${u.top}\n${p.id}`)) continue;
      this.proposed.add(`${u.top}\n${p.id}`);
      byTop.set(u.top, [...(byTop.get(u.top) ?? []), p]);
    }
    for (const [top, adds] of byTop) {
      const f = join(top, "sol", "systems", "proposals.json");
      try {
        const next = withProposals(JSON.parse(readFileSync(f, "utf8")), adds);
        if (next?.added.length) { const t = `${f}.${process.pid}.tmp`; writeFileSync(t, `${JSON.stringify(next.list, null, 2)}\n`); renameSync(t, f); }   // whole or not at all
      } catch { /* no file, or one that does not read: nothing is written */ }
    }
  }
}

// ---- the faces that hold the view, and what wakes a read ----
type Face = { send: (m: object) => void };
const holders = new Map<Face, number>();   // a face → how many of its blocks hold the view
let live: LiveWork | null = null, sweep: NodeJS.Timeout | undefined, soon: NodeJS.Timeout | undefined, watcher: FSWatcher | null = null;
let stirred = new Set<string>(), lastSent = "", reading = false, again = false, lastRead = 0, known = new Set<string>();
export const SWEEP_MS = 60_000;
/** a read never starts sooner than this after the last one (the first after a quiet spell waits only QUIET_MS) */
export const FLOOR_MS = 10_000, QUIET_MS = 1200;
const same = (l: Live) => JSON.stringify({ ...l, at: 0 });
let chain: Promise<unknown> = Promise.resolve();
/** one read at a time, in order: a later read never lands before an earlier one */
const serial = (only?: Set<string>, write = true): Promise<Live> => {
  const p = chain.then(() => { lastRead = Date.now(); return live!.read(only, write); });
  chain = p.catch(() => undefined);
  return p.then((l) => { known = new Set([...l.work.map((w) => w.session), ...l.uncovered.map((u) => u.session)]); return l; });
};
const tell = (l: Live, skip?: Face) => {
  const key = same(l);
  if (key === lastSent) return;
  lastSent = key;
  for (const f of holders.keys()) { if (f === skip) continue; try { f.send({ type: "work.systems.live", live: l }); } catch { holders.delete(f); } }
};
async function tick(only?: Set<string>) {
  if (!live || !holders.size) return;
  if (reading) { again = true; return; }
  reading = true;
  try { tell(await serial(only)); } catch { /* the next tick tries again */ } finally {
    reading = false;
    if (again) { again = false; schedule(); }
  }
}
function schedule(id?: string) {
  if (!holders.size) return;
  if (id) stirred.add(id);
  if (soon) return;   // one read is already coming: it takes this one along
  const wait = Math.max(QUIET_MS, lastRead + FLOOR_MS - Date.now());
  soon = setTimeout(() => { soon = undefined; const s = stirred; stirred = new Set(); void tick(s.size ? s : undefined); }, wait);
}
const EDITS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
/** a session moved: a tool call of its run ended (the run bus, wire.ts). A file it changed (an edit that went through)
 *  is that session's; a Read or a failed edit claims nothing */
export function heardRun(m: { type?: string; sessionId?: string; item?: { kind?: string; name?: string; done?: boolean; ok?: boolean; input?: { file_path?: string; notebook_path?: string } } }) {
  if (!live || !holders.size || m?.type !== "work.item" || m.item?.kind !== "tool" || !m.item.done || !m.sessionId) return;
  try {   // the run bus carries every session: nothing here may break it
    const name = m.item.name ?? "";
    const f = m.item.input?.file_path ?? m.item.input?.notebook_path;
    if (EDITS.test(name) && m.item.ok !== false && typeof f === "string" && f.startsWith("/")) live.edited(m.sessionId, f);
    if (EDITS.test(name) || name === "Bash") schedule(m.sessionId);
  } catch { /* the sweep catches it */ }
}
function start(make: () => LiveWork) {
  live ??= make();
  sweep ??= setInterval(() => void tick(), SWEEP_MS);
  if (!watcher) {
    try {
      watcher = watch(join(homedir(), ".claude", "projects"), { recursive: true }, (_e, name) => {
        const n = String(name ?? ""); if (!n.endsWith(".jsonl")) return;
        const id = basename(n, ".jsonl");
        if (known.size && !known.has(id)) return;   // a session not working here: the sweep finds a new one
        schedule(id);
      });
      watcher.on("error", () => { try { watcher?.close(); } catch { /* closed */ } watcher = null; });
    } catch { watcher = null; }
  }
}
function stop() {
  clearInterval(sweep); sweep = undefined; clearTimeout(soon); soon = undefined;
  try { watcher?.close(); } catch { /* closed */ } watcher = null;
  lastSent = ""; stirred = new Set(); again = false;
}
/** a face let go of the view (its socket closed: all of its blocks; a block closed: that one) */
export function dropLiveFace(face: Face, all = true) {
  const n = all ? 0 : (holders.get(face) ?? 1) - 1;
  if (n > 0) holders.set(face, n); else holders.delete(face);
  if (!holders.size) stop();
}
export const holding = () => holders.size;

let maker: () => LiveWork = () => { throw new Error("systems live: not wired"); };
/** wire.ts gives the way to the sessions and the PRs once */
export function wireLive(make: () => LiveWork) { maker = make; }
/** the face asks for the work under way: answered now, then told on each change; `.off` lets go for one block */
export async function liveMsg(w: Face, m: { type: string; rid?: unknown; off?: boolean }) {
  if (m.off) { dropLiveFace(w, false); return; }
  try {
    holders.set(w, (holders.get(w) ?? 0) + 1); start(maker);
    const l = await serial();
    w.send({ type: m.type, rid: m.rid, live: l });
    tell(l, w);   // the others hear it too when it changed
  } catch (err) { w.send({ type: m.type, rid: m.rid, error: err instanceof Error ? err.message.split("\n")[0] : String(err) }); }
}
/** GET /systems/live: one read (a kept one when it is under 5 s old), never a write */
export async function liveOnce(): Promise<Live> {
  live ??= maker();
  if (Date.now() - live.last.at < 5000) return live.last;
  return serial(undefined, false);
}

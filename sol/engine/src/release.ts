// After a release (#634, freeform #629): the first start of an engine whose contract (sol/design/system/tokens.json) is
// above the one a block's record was made under. One pass over the home's blocks (`<home>/things/<id>/`), run once per
// contract, nothing asked and nothing deleted:
//   migrate  each block below the contract is carried step by step through tokens.json's `migrations`; a key renamed is
//            renamed in its face file (a custom property in its css only, `--old` → `--new`) and its record (the place,
//            reads, writes, listens),
//            and the changed face file is written as a new version beside the old one;
//   re-lint  every block, migrated or not: its place is one the contract has, it sets no fixed colour (error, write,
//            live: the meaning channel);
//   remake   a block that cannot be carried (a key it uses was retired, a step has no migration, the lint fails) is
//            marked `remake` with its reason in its record, and keeps its last working version on screen;
//   the card what moved and what is marked, written to `<home>/after-release.json` and handed to the face on GET /things;
//            its undo puts every record back to the text it had before the pass (the new version files stay). One step.
//   the journal  before any record is touched, `<home>/after-release/<n>.journal` holds every file the pass will write,
//            as it was and as it will be; the marker (after-release.json) is written last. A crash anywhere is finished
//            whole at the next start (`recover`); the undo keeps its own journal the same way.
// It reads records and files directly (the loader is #633's); a folder the frame refuses anyway is left as it is.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { TOKENS_FILE, readThings } from "./things.js";

export type Migration = { from: number; to: number; keys: Record<string, string | null> };
export type Contract = { contract: number; migrations: Migration[]; places: string[]; fixed: string[] };
export type Moved = { id: string; from: number; renamed: string[]; version: number | null };
export type Marked = { id: string; why: string };
export type Pass = { contract: number; at: string; moved: Moved[]; marked: Marked[]; state: "shown" | "closed" | "undone"; undone?: string[]; kept?: string[] };
/** a file the pass or its undo writes, relative to the home, and the text it gets */
type Write = { path: string; text: string };
/** written and made durable before the pass touches anything: every file it will write, as it was (null: not there
 *  yet) and as it will be, and the pass itself, which is the marker written last */
type Journal = { kind: "pass"; contract: number; pass: Pass; originals: { path: string; text: string | null }[]; writes: Write[] };
/** the same for an undo: every record it puts back, decided once, before any is touched */
type UndoJournal = { kind: "undo"; contract: number; writes: Write[]; undone: string[]; kept: string[] };
/** what the face is handed for its one card: the pass without what undo needs */
export type PassWire = { contract: number; at: string; moved: { id: string; from: number; renamed: string[] }[]; marked: { id: string; why: string }[] };

export const PASS_FILE = "after-release.json";
/** the journals: `<home>/after-release/<n>.journal` for contract n's pass, `<n>.undo.journal` for its undo */
export const JOURNAL_DIR = "after-release";
const NAME = /^[a-z][a-z0-9-]*$/;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** the contract this code ships, with its migrations, places and fixed colours; null when tokens.json cannot be trusted */
export function readContract(file = TOKENS_FILE): Contract | null {
  try {
    const t = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const n = t.contract, ms = t.migrations, places = t.places, toks = t.tokens;
    if (!Number.isInteger(n) || (n as number) < 1 || !Array.isArray(ms) || !Array.isArray(places) || !isObj(toks)) return null;
    const migrations: Migration[] = [];
    for (const m of ms) {
      if (!isObj(m) || !Number.isInteger(m.from) || m.to !== (m.from as number) + 1 || !isObj(m.keys)) return null;
      const keys: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(m.keys)) { if (!NAME.test(k) || !(v === null || (typeof v === "string" && NAME.test(v)))) return null; keys[k] = v as string | null; }
      migrations.push({ from: m.from as number, to: m.to as number, keys });
    }
    if (!places.every((p) => typeof p === "string")) return null;
    const fixed = Object.entries(toks).filter(([, v]) => isObj(v) && v.fixed === true).map(([k]) => k);
    return { contract: n as number, migrations, places: places as string[], fixed };
  } catch { return null; }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The key rename touches CSS and only CSS (#635's second read): a face file's `<style>` bodies and its style="…"
// attributes, and in them only custom-property references (`var(--k`), declarations (`--k:`) and `@property --k`;
// never its text, its comments (html or css), its scripts, a css string or anything else that happens to say `--k`.
const RAW = new Set(["script", "style", "textarea", "title", "xmp", "noscript", "template"]);
/** the stretches of a face file that are css: each `<style>` body and each style attribute's value, quoted or not (pure) */
export function cssSpans(html: string): [number, number][] {
  const out: [number, number][] = [];
  const low = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) { const j = html.indexOf("-->", i + 4); i = j < 0 ? html.length : j + 3; continue; }
    const tag = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i, i + 64));
    if (!tag) { i++; continue; }
    const name = tag[1].toLowerCase();
    let k = i + tag[0].length;
    // its attributes, up to the tag's end; a quoted value may hold a ">"
    while (k < html.length && html[k] !== ">") {
      const a = /^[\s/]*([^\s=>/"']+)(\s*=\s*("([^"]*)"|'([^']*)'|[^\s>"']*))?/.exec(html.slice(k));
      if (!a || !a[0].length) { k++; continue; }
      // quoted (style="…", style='…') or unquoted (style=--k:v): the value alone, its quotes left out
      const q = a[4] ?? a[5], v = q ?? a[3];
      if (a[1].toLowerCase() === "style" && v) {
        const at = k + a[0].length - (q !== undefined ? 1 : 0) - v.length;
        out.push([at, at + v.length]);
      }
      k += a[0].length;
    }
    i = Math.min(html.length, k + 1);
    if (RAW.has(name)) {
      const close = low.indexOf(`</${name}`, i);
      const stop = close < 0 ? html.length : close;
      if (name === "style") out.push([i, stop]);
      i = stop;
    }
  }
  return out;
}
/** a css text with `fn` applied to its code only, never inside a comment or a string (pure) */
function mapCode(css: string, fn: (code: string) => string): string {
  let out = "", i = 0, from = 0;
  const flush = (to: number) => { out += fn(css.slice(from, to)); };
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      flush(i);
      const j = css.indexOf("*/", i + 2), end = j < 0 ? css.length : j + 2;
      out += css.slice(i, end); i = from = end; continue;
    }
    if (ch === '"' || ch === "'") {
      flush(i);
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      const end = Math.min(css.length, j + 1);
      out += css.slice(i, end); i = from = end; continue;
    }
    i++;
  }
  flush(css.length);
  return out;
}
/** a face file with `fn` applied to its css code only (pure) */
export function mapCss(html: string, fn: (code: string) => string): string {
  let out = "", at = 0;
  for (const [a, b] of cssSpans(html)) { out += html.slice(at, a) + mapCode(html.slice(a, b), fn); at = b; }
  return out + html.slice(at);
}
// a custom property in css code: a reference, a declaration, or an @property rule
const propRe = (names: string[]) => {
  const n = names.map(esc).join("|");
  return new RegExp(`(var\\(\\s*|@property\\s+)--(${n})(?![\\w-])|(?<![\\w-])--(${n})(?=\\s*:)`, "g");
};
/** the keys among `names` a face file's css uses as custom properties (pure) */
export function cssUses(html: string, names: string[]): Set<string> {
  const used = new Set<string>();
  if (names.length) mapCss(html, (code) => { for (const m of code.matchAll(propRe(names))) used.add(m[2] ?? m[3]); return code; });
  return used;
}
/** a face file with its custom properties renamed by `keys` in one step (a swap is a swap), nothing else touched (pure) */
export function renameProps(html: string, keys: Record<string, string>): string {
  const names = Object.keys(keys);
  if (!names.length) return html;
  return mapCss(html, (code) => code.replace(propRe(names), (_, pre: string | undefined, a: string | undefined, b: string | undefined) => (pre ?? "") + `--${keys[(a ?? b) as string]}`));
}

/** the fixed colours a face file sets, never only reads (pure): a `--error: …` declaration in its css (a `<style>` body
 *  or a style attribute) only, never its text, comments, scripts or strings. The face keeps the same reading
 *  (mac/src/home/frameRules.ts setsFixed); both are held to the same fixtures (mac/src/home/sets-fixed.json) */
export function setsFixed(html: string, fixed: string[]): string[] {
  if (!fixed.length) return [];
  const re = new RegExp(`(?<![\\w-])--(${fixed.map(esc).join("|")})\\s*:`, "g");
  const set = new Set<string>();
  mapCss(html, (code) => { for (const m of code.matchAll(re)) set.add(m[1]); return code; });
  return [...set];
}

type Carried = { ok: true; html: string; record: Record<string, unknown>; renamed: string[] } | { ok: false; why: string };

/** one block carried from its contract to the contract now (pure): its face file and record renamed by each step's
 *  keys, or why it cannot be */
export function carry(html: string, record: Record<string, unknown>, c: Contract, file = "its face file"): Carried {
  const from = record.contract as number;
  let h = html, rec: Record<string, unknown> = { ...record };
  const renamed: string[] = [];
  for (let n = from; n < c.contract; n++) {
    const m = c.migrations.find((x) => x.from === n);
    if (!m) return { ok: false, why: `contract ${n + 1} came with no migration from ${n}` };
    const keys = Object.keys(m.keys);
    if (!keys.length) continue;
    const used = cssUses(h, keys);
    const words = (x: unknown) => (typeof x === "string" ? [x] : Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
    const inRecord = new Set(["place", "reads", "writes", "listens"].flatMap((k) => words(rec[k])).filter((w) => w in m.keys));
    for (const k of keys) {
      if (m.keys[k] !== null) continue;
      if (used.has(k)) return { ok: false, why: `contract ${m.to} retired --${k}, which ${file} uses` };
      if (inRecord.has(k)) return { ok: false, why: `contract ${m.to} retired "${k}", which its record names` };
    }
    h = renameProps(h, Object.fromEntries(Object.entries(m.keys).filter((e): e is [string, string] => e[1] !== null)));
    const swap = (w: string) => (w in m.keys && m.keys[w] ? (m.keys[w] as string) : w);
    for (const k of ["place", "reads", "writes", "listens"] as const) {
      const v = rec[k];
      if (typeof v === "string") rec[k] = swap(v);
      else if (Array.isArray(v)) rec[k] = v.map((s) => (typeof s === "string" ? swap(s) : s));
    }
    for (const k of keys) if (used.has(k)) renamed.push(`--${k} → --${m.keys[k]}`);
    for (const k of keys) if (inRecord.has(k)) renamed.push(`"${k}" → "${m.keys[k]}"`);
  }
  rec.contract = c.contract;
  return { ok: true, html: h, record: rec, renamed: [...new Set(renamed)] };
}

/** the re-lint every block passes after a release (pure): its place is the contract's, it sets no fixed colour */
export function relint(html: string | null, record: Record<string, unknown>, c: Contract): string | null {
  if (typeof record.place !== "string" || !c.places.includes(record.place)) return `asks for the ${String(record.place)}, which contract ${c.contract} does not have (${c.places.join(", ")})`;
  const set = setsFixed(html ?? "", c.fixed);
  if (set.length) return `sets ${set.map((s) => `--${s}`).join(", ")}, a functional colour the contract fixes`;
  return null;
}

// Every write is durable and whole: a temp file beside it, fsynced, renamed over, the folder fsynced. Order, so a crash
// anywhere leaves something the next start can finish (#635's second read):
//   pass  journal (originals + plan + the pass) durable → each file written → the marker (after-release.json) last
//   undo  undo journal (what goes back, decided once) durable → each record put back → the marker says "undone" last
// At start (and before an undo), a journal without its marker is finished whole, from the journal alone: the same
// texts written again, then the marker. Nothing is read from the half-written records, so the outcome is the same
// wherever the crash fell. A journal is never half there (it is renamed into place), so one that will not parse is
// damage: the pass stops and touches nothing.
let fault: ((at: string) => void) | null = null;
/** tests only: called at every write boundary with its name; throwing there is a crash at that point */
export function setFault(f: ((at: string) => void) | null) { fault = f; }
const syncDir = (dir: string) => { try { const fd = openSync(dir, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } } catch { /* a platform without directory fsync */ } };
function durable(path: string, text: string, label: string) {
  fault?.(`${label}: temp`);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`, fd = openSync(tmp, "w");
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  fault?.(`${label}: rename`);
  renameSync(tmp, path);
  syncDir(dirname(path));
}
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const readText = (path: string) => { try { return readFileSync(path, "utf8"); } catch { return null; } };
const readPass = (home: string): Pass | null => {
  try { const p = JSON.parse(readFileSync(join(home, PASS_FILE), "utf8")) as Pass; return Number.isInteger(p?.contract) && Array.isArray(p.moved) && Array.isArray(p.marked) ? p : null; } catch { return null; }
};
const journalPath = (home: string, n: number, undo = false) => join(home, JOURNAL_DIR, `${n}${undo ? ".undo" : ""}.journal`);
function readJournal<T>(path: string): T | null {
  const raw = readText(path);
  if (raw === null) return null;
  try { return JSON.parse(raw) as T; } catch { throw new Error(`${path} is damaged (not JSON); the pass stops and touches nothing`); }
}
const today = (now: Date) => now.toISOString().slice(0, 10);
const putAll = (home: string, writes: Write[], label: string) => { for (const w of writes) durable(join(home, w.path), w.text, `${label} ${w.path}`); };
const idOf = (path: string) => path.split("/")[1];

/** a journal without its marker finished whole (a pass carried forward, an undo put back): run at start and before an
 *  undo. Returns what it finished */
export function recover(home: string): { pass: number[]; undo: number[] } {
  const done = { pass: [] as number[], undo: [] as number[] };
  const dir = join(home, JOURNAL_DIR);
  if (!existsSync(dir)) return done;
  const names = readdirSync(dir);
  for (const n of names) if (n.endsWith(".tmp")) rmSync(join(dir, n), { force: true });   // a journal never renamed in: never begun
  const nums = (re: RegExp) => names.map((n) => re.exec(n)).filter((m): m is RegExpExecArray => !!m).map((m) => Number(m[1])).sort((a, b) => a - b);
  for (const n of nums(/^(\d+)\.journal$/)) {
    const p = readPass(home);
    if (p && p.contract >= n) continue;   // its marker is there: finished
    const j = readJournal<Journal>(journalPath(home, n));
    if (!j || j.kind !== "pass" || j.contract !== n || !Array.isArray(j.writes)) throw new Error(`${journalPath(home, n)} is not a pass journal; the pass stops and touches nothing`);
    for (const w of j.writes) rmSync(join(home, `${w.path}.tmp`), { force: true });
    putAll(home, j.writes, "pass");
    durable(join(home, PASS_FILE), json(j.pass), "pass marker");
    done.pass.push(n);
  }
  for (const n of nums(/^(\d+)\.undo\.journal$/)) {
    const p = readPass(home);
    if (!p || p.contract !== n || p.state === "undone") continue;
    const u = readJournal<UndoJournal>(journalPath(home, n, true));
    if (!u || u.kind !== "undo" || u.contract !== n || !Array.isArray(u.writes)) throw new Error(`${journalPath(home, n, true)} is not an undo journal; the undo stops and touches nothing`);
    for (const w of u.writes) rmSync(join(home, `${w.path}.tmp`), { force: true });
    putAll(home, u.writes, "undo");
    durable(join(home, PASS_FILE), json({ ...p, state: "undone", undone: u.undone, kept: u.kept }), "undo marker");
    done.undo.push(n);
  }
  return done;
}

/** the pass, once per contract: run at the engine's start. Returns the pass written (or finished from its journal),
 *  or null when there was nothing to do (no thing below the contract, or a pass for this contract already ran) */
export function afterRelease(home: string, file = TOKENS_FILE, now = new Date()): Pass | null {
  const finished = recover(home);
  const c = readContract(file);
  if (!c) return null;
  const was = readPass(home);
  if (was?.contract === c.contract) return finished.pass.includes(c.contract) ? was : null;
  const moved: Moved[] = [], marked: Marked[] = [], writes: Write[] = [];
  const all = readThings(home);
  // a release is a thing below the contract: with none, nothing runs (at contract 1 nothing ever does)
  if (!all.some((t) => !t.error && isObj(t.record) && Number.isInteger(t.record.contract) && (t.record.contract as number) < c.contract)) return null;
  // the plan, decided whole before anything is written
  for (const t of all) {
    if (t.error || !isObj(t.record)) continue;   // the frame refuses it at load, with why; never rewritten here
    const r = t.record, dir = `things/${t.id}`;
    if (r.remake !== undefined) continue;          // already waiting for its remake
    const vs = Array.isArray(r.versions) ? (r.versions as { v?: unknown; file?: unknown }[]) : [];
    const cur = Number.isInteger(r.current) ? (r.current as number) : Math.max(0, ...vs.map((v) => (Number.isInteger(v?.v) ? (v.v as number) : 0)));
    const file = vs.find((v) => v?.v === cur)?.file;
    const due = Number.isInteger(r.contract) && (r.contract as number) < c.contract;
    let why: string | null = null, next: Carried | null = null;
    if (due) {
      next = carry(t.html ?? "", r, c, typeof file === "string" ? file : "its face file");
      if (!next.ok) why = next.why;
    }
    why ??= relint(next?.ok ? next.html : t.html, next?.ok ? next.record : r, c);
    if (why) {
      writes.push({ path: `${dir}/record.json`, text: json({ ...r, remake: { why, contract: c.contract, at: today(now) } }) });
      marked.push({ id: t.id, why });
      continue;
    }
    if (!next?.ok) continue;
    let version: number | null = null, rec = next.record;
    if (next.html !== (t.html ?? "")) {
      version = Math.max(0, ...vs.map((v) => (Number.isInteger(v?.v) ? (v.v as number) : 0))) + 1;
      writes.push({ path: `${dir}/v${version}.html`, text: next.html });
      rec = { ...rec, versions: [...vs, { v: version, file: `v${version}.html`, at: today(now), contract: c.contract }], current: version };
    }
    writes.push({ path: `${dir}/record.json`, text: json(rec) });   // the record after its version file: it never names a file not yet there
    moved.push({ id: t.id, from: r.contract as number, renamed: next.renamed, version });
  }
  if (!moved.length && !marked.length) return null;
  const pass: Pass = { contract: c.contract, at: now.toISOString(), moved, marked, state: "shown" };
  const journal: Journal = { kind: "pass", contract: c.contract, pass, originals: writes.map((w) => ({ path: w.path, text: readText(join(home, w.path)) })), writes };
  durable(journalPath(home, c.contract), json(journal), "pass journal");
  putAll(home, writes, "pass");
  durable(join(home, PASS_FILE), json(pass), "pass marker");
  return pass;
}

/** what the face's one card says, while it is to be shown */
export function passWire(home: string): PassWire | null {
  const p = readPass(home);
  if (!p || p.state !== "shown") return null;
  return { contract: p.contract, at: p.at, moved: p.moved.map(({ id, from, renamed }) => ({ id, from, renamed })), marked: p.marked.map(({ id, why }) => ({ id, why })) };
}

/** the card closed: the pass stays as it is, the card goes */
export function closePass(home: string): boolean {
  const p = readPass(home);
  if (!p || p.state !== "shown") return false;
  durable(join(home, PASS_FILE), json({ ...p, state: "closed" }), "close marker");
  return true;
}

/** the whole pass undone, one step, from its journal: every record it wrote goes back to the very text it had before
 *  (its current version, contract, place and data, no remake mark); the version files it wrote stay. A record changed
 *  since the pass (it no longer reads what the pass wrote: a newer version, its mark taken off) is kept and said.
 *  An undo cut short is finished first, whole, and answered as it was decided. */
export function undoPass(home: string): { undone: string[]; kept: string[] } | null {
  const finished = recover(home);
  const p = readPass(home);
  if (p && p.state === "undone" && finished.undo.includes(p.contract)) return { undone: p.undone ?? [], kept: p.kept ?? [] };
  if (!p || p.state === "undone") return null;
  const j = readJournal<Journal>(journalPath(home, p.contract));
  if (!j || j.kind !== "pass") return null;   // a pass without its journal cannot be put back
  const undone: string[] = [], kept: string[] = [], writes: Write[] = [];
  for (const w of j.writes) {
    if (!w.path.endsWith("/record.json")) continue;   // the version files it wrote stay
    const before = j.originals.find((o) => o.path === w.path)?.text;
    if (typeof before === "string" && readText(join(home, w.path)) === w.text) { writes.push({ path: w.path, text: before }); undone.push(idOf(w.path)); }
    else kept.push(idOf(w.path));
  }
  durable(journalPath(home, p.contract, true), json({ kind: "undo", contract: p.contract, writes, undone, kept } satisfies UndoJournal), "undo journal");
  putAll(home, writes, "undo");
  durable(join(home, PASS_FILE), json({ ...p, state: "undone", undone, kept }), "undo marker");
  return { undone, kept };
}

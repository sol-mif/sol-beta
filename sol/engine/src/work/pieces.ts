// Pieces (#1092, behind the face's `build.pieces`): a project folder in Build holds pieces beside its sessions. A piece is
// one stage block the project keeps (blocks.ts: one state, one ledger) that a recipe makes and a pulse keeps fresh.
//
//   <project folder>/.sol/pieces/<name>.json   the recipe: { name, title, view, source, pulse?, verbs?, ceiling?, about? }
//   <home>/<project>/blocks/piece-<name>/      the piece's block: its body (the rows), its ledger
//
// Five parts: state (the block, once, in the project's home), view (a stage kind: list, table, card), verbs under a
// ceiling (look < draft < act < spend: what an agent may do on it), a pulse (when the engine reads its source again, so
// the piece does part of its job between visits), and the recipe (one small file, so the next tool is a file and not a
// feature; an agent makes a piece by writing one). It opens as a page, or is dropped into a session's stage as a block:
// the same block (place's carry), never a copy. Closed in a session, it goes back to the folder, never dead.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import * as blocks from "./blocks.js";
import { builtinSource, nucbox, setDueJev } from "./pieceSources.js";
import { saidOf, tendTurn, type TendAsk } from "./pieceTend.js";
import { askJev, frontBody, frontOrder, frontPick, tierOf, wantsBody, wantsTier, type Tier } from "./pieceJev.js";

export const VIEWS = ["list", "table", "card"] as const;
export type View = (typeof VIEWS)[number];
export const CEILINGS = ["look", "draft", "act", "spend"] as const;
export type Ceiling = (typeof CEILINGS)[number];

/** where a piece's rows come from. `builtin` names one of pieceSources.ts (waits, runs, systems); `script` is a node
 *  program inside .sol/pieces/ that prints the rows as json; `url` is read as json, its `fixture` (a file in the
 *  folder) when it does not answer; `file` is a json file in the folder; `rows` are written in the recipe itself */
export type Source =
  | { from: "rows"; rows: Row[] }
  | { from: "file"; path: string }
  | { from: "url"; url: string; fixture?: string; shape?: string }
  | { from: "script"; path: string }
  | { from: "builtin"; name: string; url?: string; fixture?: string; night?: string; labels?: string[] }
  /** a piece that reads pieces: the piece of this name in each folder under this one (Home's school reads each class's
   *  due), each row grouped by its folder's name */
  | { from: "pieces"; name: string };
export type Recipe = { name: string; title: string; view: View; source: Source; pulse: { every: number }; verbs: string[]; ceiling: Ceiling; about?: string;
  /** its source's order is the order (the night: what he can try first): Jev picks no front, it only judges what needs him */
  keepOrder?: boolean;
  /** the sentence a read-only agent turn answers for each row that newly wants him (pieceTend.ts): the row's `said`.
   *  Only with a ceiling of `draft` or more */
  tend?: string };
/** one row of a piece: `wants` it waits on you (yellow), `done` answered, `now` running; `href` where a press goes;
 *  `press` the word on its button, named by what it does ("merge", "answer", "read"; never "yes") */
export type Row = { id?: string; t: string; note?: string; wants?: boolean; done?: boolean; now?: boolean; href?: string; group?: string; press?: string;
  /** half sure it belongs (Jev under 0.7): drawn as a name with a dashed hairline, never yellow */
  maybe?: boolean;
  /** the row's own figure, four characters or so ("2 d"): when, where the note says what */
  fig?: string };
export type Read = { rows: Row[]; line?: string; from?: string };
/** what the face lists in a folder: the piece at a glance */
export type PieceInfo = {
  name: string; title: string; view: View; id: string; state: blocks.State; wants: number; total: number; open: number; line?: string;
  /** what wants him and came since he last looked: the yellow */
  fresh: number;
  /** new and wanting, but Jev only half sure it needs him: the square's rim dashed, no yellow */
  doubt: number;
  at: number; every: number; ceiling: Ceiling; verbs: string[]; about?: string; from: string; error?: string; sessions: string[];
  /** a script piece waiting for his yes to run the folder's scripts: the one-time code `work.pieces.trust` sends back,
   *  given only to the app's own page ("" elsewhere: the ask shows, the yes cannot be sent) */
  asks?: string;
  /** the built-in source it reads ("due", "issues"), when it is one: Home's sticky press belongs to the built-in due only */
  builtin?: string;
  /** what the yes covers, in words ("sol-dev and its worktrees", "this folder") */
  scope?: string;
  /** the recipe's sentence for what its agent does between his visits (his to rewrite on the back) */
  tend?: string;
  /** an agent asked to go past the ceiling: the rung it needs, and the session that asked (the "let it act" chip) */
  may?: Ceiling; mayFrom?: string;
  /** the asking session's name, when its title fits whole ("orchestrator"); else none and the head says "an agent asks" */
  mayBy?: string;
};

export const DIR = join(".sol", "pieces");
const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const MIN_EVERY = 30, DEFAULT_EVERY = 300;
export const idOf = (name: string) => `piece-${name}`;
export const isPiece = (id: string) => id.startsWith("piece-");
const BY = "the piece's pulse";

// ---- the recipe ----
/** a recipe as written, checked and filled in (pure); a reason when it cannot be one */
export function readRecipe(raw: unknown, file = ""): Recipe | { error: string } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return { error: `${file || "the recipe"} is not a json object` };
  const name = typeof o.name === "string" ? o.name : file.replace(/\.json$/, "");
  if (!NAME.test(name)) return { error: `the name "${name}" is not lower case letters, digits and dashes` };
  const view = (o.view ?? "list") as View;
  if (!VIEWS.includes(view)) return { error: `view is one of ${VIEWS.join(", ")}` };
  const s = o.source as Record<string, unknown> | undefined;
  let source: Source;
  if (!s || typeof s !== "object") return { error: "a recipe names its source" };
  if (s.from === "rows" && Array.isArray(s.rows)) source = { from: "rows", rows: rowsOf(s.rows) };
  else if (s.from === "file" && typeof s.path === "string") source = { from: "file", path: s.path };
  else if (s.from === "url" && typeof s.url === "string" && /^https?:\/\//.test(s.url)) source = { from: "url", url: s.url, ...(typeof s.fixture === "string" ? { fixture: s.fixture } : {}) };
  else if (s.from === "script" && typeof s.path === "string") source = { from: "script", path: s.path };
  else if (s.from === "pieces" && typeof s.name === "string" && NAME.test(s.name)) source = { from: "pieces", name: s.name };
  else if (s.from === "builtin" && typeof s.name === "string") source = { from: "builtin", name: s.name, ...(typeof s.url === "string" && /^https?:\/\//.test(s.url) ? { url: s.url } : {}), ...(typeof s.fixture === "string" ? { fixture: s.fixture } : {}), ...(typeof s.night === "string" && /^https?:\/\//.test(s.night) ? { night: s.night } : {}), ...(Array.isArray(s.labels) ? { labels: s.labels.filter((l): l is string => typeof l === "string" && /^[\w .:/-]{1,40}$/.test(l)).slice(0, 4) } : {}) };
  else return { error: "source.from is one of rows, file, url, script, builtin, pieces, with what it needs" };
  const every = Number((o.pulse as { every?: unknown } | undefined)?.every);
  const ceiling = (o.ceiling ?? "look") as Ceiling;
  if (!CEILINGS.includes(ceiling)) return { error: `ceiling is one of ${CEILINGS.join(", ")}` };
  const verbs = Array.isArray(o.verbs) ? o.verbs.filter((v): v is string => typeof v === "string").slice(0, 8) : ["look"];
  const title = (typeof o.title === "string" && o.title.trim() ? o.title.trim() : name).slice(0, 60);
  return { name, title, view, source, pulse: { every: Number.isFinite(every) ? Math.max(MIN_EVERY, every) : DEFAULT_EVERY }, verbs, ceiling, ...(typeof o.about === "string" ? { about: o.about.slice(0, 300) } : {}), ...(o.keepOrder === true ? { keepOrder: true } : {}), ...(typeof o.tend === "string" && o.tend.trim() ? { tend: o.tend.trim().slice(0, 300) } : {}) };
}

/** rows from anything a source gave: an array of rows or strings, or { rows } (pure) */
export function rowsOf(v: unknown): Row[] {
  const arr = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { rows?: unknown }).rows) ? (v as { rows: unknown[] }).rows : [];
  return arr.slice(0, 200).flatMap((r): Row[] => {
    if (typeof r === "string") return r.trim() ? [{ t: r.trim().slice(0, 200) }] : [];
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const t = typeof o.t === "string" ? o.t : typeof o.title === "string" ? o.title : "";
    if (!t.trim()) return [];
    const s = (k: string, n = 200) => (typeof o[k] === "string" && (o[k] as string).trim() ? { [k]: (o[k] as string).trim().slice(0, n) } : {});
    return [{ t: t.trim().slice(0, 200), ...s("id", 80), ...s("note", 120), ...(typeof o.href === "string" && /^https?:\/\//i.test(o.href.trim()) ? s("href", 400) : {}), ...s("group", 40), ...s("press", 16), ...s("fig", 6), ...(o.wants === true ? { wants: true } : {}), ...(o.done === true ? { done: true } : {}), ...(o.now === true ? { now: true } : {}), ...(o.maybe === true ? { maybe: true } : {}) }];
  });
}

/** the folder's recipes, each read or with why not */
export function recipesIn(cwd: string): { recipes: Recipe[]; errors: { file: string; error: string }[] } {
  const dir = join(cwd, DIR), recipes: Recipe[] = [], errors: { file: string; error: string }[] = [];
  let files: string[] = [];
  // a .sol or .sol/pieces that leads out of the folder lists nothing; a recipe that is a link is not read
  try { if (!inside(cwd, DIR) || [join(cwd, ".sol"), dir].some((x) => lstatSync(x).isSymbolicLink())) return { recipes, errors }; } catch { return { recipes, errors }; }
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json") && !lstatSync(join(dir, f)).isSymbolicLink()).sort(); } catch { return { recipes, errors }; }
  for (const f of files) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch (e) { errors.push({ file: f, error: `not json: ${e instanceof Error ? e.message.split("\n")[0] : e}` }); continue; }
    const r = readRecipe(raw, f);
    if ("error" in r) errors.push({ file: f, error: r.error });
    else if (recipes.some((x) => x.name === r.name)) errors.push({ file: f, error: `a piece named "${r.name}" is there already` });
    else recipes.push(r);
  }
  return { recipes, errors };
}

// ---- a folder's scripts run only once he said so: remembered per repository by its real path (a folder of the same
// name elsewhere is another), in the engine's state outside any checkout (a commit can grant nothing) ----
/** the reason a script piece gives until he lets the folder's scripts run: the face shows it as a dashed chip */
export const ASKS = "asks before it runs this folder's scripts and drafting agents";

/** the engine's own state folder (beside work.json; SOL_STATE's folder), never in a repo */
export const stateDir = () => dirname(process.env.SOL_STATE ?? (platform() === "darwin" ? join(homedir(), "Library", "Application Support", "com.marcol04.sol", "work.json") : join(homedir(), ".local", "share", "sol", "work.json")));
const trustFile = () => join(stateDir(), "pieces-trust.json");
/** the repository a folder is in, by its real path: a worktree's is its main checkout's (the walk blocks.projectOf
 *  makes, kept here so blocks.ts stays as it is) */
export function repoOf(cwd: string): string {
  const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
  // only a folder with its own .git is a repository here: a copy with none is keyed on itself, never on a repo above it
  const d = real(cwd), g = join(d, ".git");
  try {
    if (statSync(g).isFile()) {
      // a worktree: its .git names <repo>/.git/worktrees/<x>, and that folder's own "gitdir" must name this .git back
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(g, "utf8"));
      const at = m ? resolve(d, m[1].trim()) : "", i = at.lastIndexOf("/.git/worktrees/");
      const back = (() => { try { return real(readFileSync(join(at, "gitdir"), "utf8").trim()); } catch { return ""; } })();
      if (i > 0 && back === real(g)) return real(at.slice(0, i));
    }
  } catch { /* no .git of its own */ }
  return d;
}
/** the words for what a yes covers: "sol-dev and its worktrees", or "this folder" for one with no .git of its own */
export const scopeOf = (cwd: string) => { const r = repoOf(cwd); return existsSync(join(r, ".git")) ? `${r.split("/").pop()} and its worktrees` : "this folder"; };
const trustAll = (): Record<string, number> => { try { const v = JSON.parse(readFileSync(trustFile(), "utf8")); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
export const trusted = (cwd: string): boolean => Number(trustAll()[repoOf(cwd)]) > 0;
/** the one-time code a script piece's "asks" carries to the face; the press sends it back, so a yes comes from a face
 *  that was shown the ask (per repository, made at the first ask, spent by the yes) */
const codes = new Map<string, string>();
export const askCode = (cwd: string) => { const r = repoOf(cwd); let c = codes.get(r); if (!c) { c = randomBytes(12).toString("hex"); codes.set(r, c); } return c; };
/** his press on the chip, with the code he was shown: this repository's scripts may run from now on; its script
 *  pieces are read at once. A press without the code is refused */
export function trust(cwd: string, code: unknown) {
  const repo = repoOf(cwd);
  if (typeof code !== "string" || !codes.get(repo) || codes.get(repo) !== code) throw new Error("that yes was not one this engine asked for: press it again");
  codes.delete(repo);
  return trustRepo(cwd);
}
/** the yes itself: only his press on the chip, with the code he was shown */
function trustRepo(cwd: string) {
  const repo = repoOf(cwd);
  // the chip says it: every piece here may run its program and its agent. The pieces there now, as they read now, may
  // draft (never more); a recipe written or changed later asks his window again
  for (const k of kept.get(blocks.projectOf(cwd))?.values() ?? []) if (k.recipe.tend && k.recipe.ceiling !== "look" && heldTo(k.cwd, k.recipe.name, k.recipe.ceiling) === "look") grant(k.cwd, k.recipe.name, "draft", k.recipe.source);
  const all = trustAll(); all[repo] = Date.now();
  mkdirSync(dirname(trustFile()), { recursive: true });
  writeFileSync(`${trustFile()}.tmp`, JSON.stringify(all, null, 1));
  renameSync(`${trustFile()}.tmp`, trustFile());
  const project = blocks.projectOf(cwd);
  touch(project);
  for (const k of kept.get(project)?.values() ?? []) if (k.recipe.source.from === "script" || k.recipe.tend) void pulse(k);
  return { ok: true };
}

// ---- the ceiling an agent is held to: the one Sol's own window last wrote (a make or a notch there), kept in the
// engine's state beside work.json; never the recipe file, which an agent with file tools could edit (the lead's 05:54) ----
const grantsFile = () => join(stateDir(), "pieces-ceilings.json");
const grantsAll = (): Record<string, string> => { try { const v = JSON.parse(readFileSync(grantsFile(), "utf8")); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };
// keyed by the recipe's source too: a piece of the same name that reads something else starts again at "look"
const grantKey = (cwd: string, name: string, source?: unknown) => `${repoOf(cwd)}\u0000${name}\u0000${JSON.stringify(source ?? sourceOfKept(cwd, name) ?? null)}`;
const sourceOfKept = (cwd: string, name: string) => kept.get(blocks.projectOf(cwd))?.get(name)?.recipe.source;
/** Sol's window wrote this ceiling for the piece (a make or a notch there) */
export function grant(cwd: string, name: string, ceiling: Ceiling, source?: unknown) {
  const all = grantsAll(); all[grantKey(cwd, name, source)] = ceiling;
  mkdirSync(dirname(grantsFile()), { recursive: true });
  writeFileSync(`${grantsFile()}.tmp`, JSON.stringify(all, null, 1));
  renameSync(`${grantsFile()}.tmp`, grantsFile());
}
/** the ceiling an agent's verbs are held to: the one Sol's window last wrote ("look" when it wrote none: a committed
 *  recipe lets an agent read until he moves its notch or lets it act in his window) */
export function heldTo(cwd: string, name: string, _recipe: Ceiling): Ceiling {
  // his window's word alone: a make or a notch there writes both, "let it act" only this (the file is every teammate's)
  const g = grantsAll()[grantKey(cwd, name)] as Ceiling | undefined;
  return g && (CEILINGS as readonly string[]).includes(g) ? g : "look";
}

// ---- reading a source ----
/** a path the recipe named, inside the folder or not at all (pure) */
export function inside(cwd: string, p: string): string | null {
  const abs = resolve(cwd, p), rel = relative(resolve(cwd), abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  // as written, and again by its real path: a link inside the folder that points out of it is outside
  try {
    const top = realpathSync(cwd), at = realpathSync(abs), r = relative(top, at);
    if (!r || r.startsWith("..") || isAbsolute(r)) return null;
  } catch { /* not there yet: the path as written is the path */ }
  return abs;
}
const readJson = (f: string) => JSON.parse(readFileSync(f, "utf8"));
async function getJson(url: string, ms = 5000): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.json();
}
let scriptMs = 30_000;
/** for the tests: a shorter time a script may take */
export const setScriptMs = (ms: number) => { scriptMs = ms; };
/** what a folder's script sees of the engine's environment: where it is and how to find node, nothing else: no key,
 *  and a HOME of its own, so the person's ~/.config is not where it looks */
export const scriptEnv = (cwd: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv =>
  ({ ...(env.PATH ? { PATH: env.PATH } : {}), ...(env.LANG ? { LANG: env.LANG } : {}), HOME: scriptHome(), SOL_PIECE_FOLDER: cwd, ...(nucbox() ? { SOL_NUCBOX: nucbox()! } : {}) });
/** a scratch HOME for scripts, under the engine's state: what git or npm write there stays out of the project and out
 *  of the person's own home */
export const scriptHome = () => { const h = join(stateDir(), "pieces-script-home"); try { mkdirSync(h, { recursive: true }); } catch { /* made at the run */ } return h; };
const runScript = (cwd: string, file: string) => new Promise<unknown>((ok, no) => {
  execFile(process.execPath, [file], { cwd, timeout: scriptMs, killSignal: "SIGKILL", maxBuffer: 4 << 20, env: scriptEnv(cwd) }, (err, out, errOut) => {
    if (err) return no(new Error(err.killed ? `the script took over ${Math.round(scriptMs / 1000)} s` : `the script stopped: ${err.message.split("\n")[0]}`));
    // what it printed instead, its first line, so the person writing the tool sees why
    try { ok(JSON.parse(out)); } catch { const said = (String(out).trim() || String(errOut ?? "").trim()).split("\n")[0].slice(0, 120); no(new Error(`the script did not print json${said ? `: ${said}` : " (it printed nothing)"}`)); }
  });
});

/** the rows a recipe's source gives now; a url that does not answer falls back to its fixture, said in `from` */
export async function readSource(cwd: string, r: Recipe): Promise<Read> {
  const s = r.source;
  if (s.from === "rows") return { rows: s.rows, from: "the recipe" };
  if (s.from === "file") {
    const f = inside(cwd, s.path);
    if (!f) throw new Error(`${s.path} is outside the folder`);
    return { ...shapeOf(readJson(f)), from: s.path };
  }
  if (s.from === "script") {
    const f = inside(join(cwd, DIR), s.path);
    if (!f || !existsSync(f)) throw new Error(`the script is not in ${DIR}`);
    if (!trusted(cwd)) throw new Error(ASKS);
    // by its real path: node names the main module by it, so a program's own "am I run" check holds when the folder
    // was reached through a link (a kept piece's folder can be)
    return { ...shapeOf(await runScript(cwd, realpathSync(f))), from: s.path };
  }
  if (s.from === "url") {
    try { return { ...shapeOf(await getJson(s.url)), from: s.url }; }
    catch (e) {
      const f = s.fixture ? inside(cwd, s.fixture) : null;
      if (!f) throw e;
      return { ...shapeOf(readJson(f)), from: `${s.fixture} (the address did not answer)` };
    }
  }
  if (s.from === "pieces") return piecesUnder(cwd, s.name);
  return builtinSource(cwd, s, {
    getJson,
    readJson: (p: string) => { const f = inside(cwd, p); if (!f) throw new Error(`${p} is outside the folder`); return readJson(f); },
    readText: (p: string) => { const f = inside(cwd, p); if (!f) return null; try { return readFileSync(f, "utf8"); } catch { return null; } },
    jsonFiles: (p: string) => jsonFilesIn(cwd, p),
  });
}
/** a file written into the folder's .sol/pieces through a fresh .tmp: a planted link at the .tmp is removed, never
 *  followed ("wx"), and a .sol/pieces that is itself a link out of the folder is refused */
export function writeInPieces(cwd: string, file: string, text: string) {
  const dir = inside(cwd, DIR);
  if (!dir) throw new Error(`${DIR} is not inside this folder`);
  // .sol itself, by its real path, before anything is made: a .sol linked out of the folder makes nothing outside
  if (!inside(cwd, ".sol") || (existsSync(join(cwd, ".sol")) && lstatSync(join(cwd, ".sol")).isSymbolicLink())) throw new Error(`${DIR} is not inside this folder`);
  mkdirSync(dir, { recursive: true });
  if (!inside(cwd, DIR) || lstatSync(dir).isSymbolicLink()) throw new Error(`${DIR} is not inside this folder`);
  const f = join(dir, file), tmp = `${f}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, text, { flag: "wx" });
  renameSync(tmp, f);
}
/** the .json files under a folder inside the project, as paths from the project, at most 2000 and four levels deep */
export function jsonFilesIn(cwd: string, dir: string): string[] {
  const top = inside(cwd, dir);
  if (!top) return [];
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(d).sort(); } catch { return; }
    for (const n of names) {
      if (out.length >= 2000 || n.startsWith(".")) continue;
      const f = join(d, n);
      let st; try { st = lstatSync(f); } catch { continue; }
      if (st.isSymbolicLink()) continue;   // a link may lead out of the folder: not followed
      if (st.isDirectory()) { if (depth < 4) walk(f, depth + 1); }
      else if (n.endsWith(".json")) out.push(relative(cwd, f));
    }
  };
  walk(top, 0);
  return out;
}
/** when a row is due, in days, from its figure ("today", "late", "4 d"); none sorts last (pure) */
export const daysOfFig = (fig?: string) => (!fig ? 1e9 : fig === "today" ? 0 : fig === "late" ? -1 : Number(/^(\d+)\s*d$/.exec(fig)?.[1] ?? 1e9));
/** a folder's name as the person says it: its ground.json name ("LA245"), else the folder's own */
const folderName = (dir: string) => { try { const g = JSON.parse(readFileSync(join(dir, "ground.json"), "utf8")) as { name?: unknown }; if (typeof g.name === "string" && g.name.trim()) return g.name.trim().slice(0, 30); } catch { /* none */ } return dir.split("/").pop() ?? dir; };
/** the piece of this name in each folder right under this one, read now (its own recipe, its own source), its rows
 *  grouped by the folder's name, nearest first; a folder whose piece cannot be read is left out, never thrown */
export async function piecesUnder(cwd: string, name: string): Promise<Read> {
  let dirs: string[] = [];
  try { dirs = readdirSync(cwd).filter((d) => !d.startsWith(".")).map((d) => join(cwd, d)).filter((d) => { try { return lstatSync(d).isDirectory(); } catch { return false; } }); } catch { /* none */ }
  const rows: (Row & { _days: number })[] = [], names: string[] = [];
  for (const d of dirs.sort()) {
    let raw: unknown;
    // a sub-folder's .sol, its pieces folder or the recipe that is a link is not read (it could point anywhere)
    try { if ([join(d, ".sol"), join(d, DIR), join(d, DIR, `${name}.json`)].some((x) => lstatSync(x).isSymbolicLink())) continue; } catch { continue; }
    try { raw = JSON.parse(readFileSync(join(d, DIR, `${name}.json`), "utf8")); } catch { continue; }
    const r = readRecipe(raw, `${name}.json`);
    if ("error" in r || r.source.from === "pieces") continue;   // one level: a piece of pieces does not read another
    try {
      const got = await readSource(d, r), label = folderName(d);
      names.push(label);
      // a row the class's own piece holds as put away (a sticky he started there) is not the school's: one state
      const away = new Set(stepsNow(blocks.projectOf(d), idOf(name)).filter((x) => x.st === "done").map(keyOf));
      for (const x of got.rows) if (!away.has(keyOf(x))) rows.push({ ...x, id: `${label}:${x.id ?? x.t}`.slice(0, 80), group: label, note: x.note ? `${label} · ${x.note}`.slice(0, 120) : label, _days: daysOfFig(x.fig) });
    } catch { /* that folder's piece says its own error in its own folder */ }
  }
  rows.sort((a, b) => a._days - b._days);
  const out = rows.map(({ _days, ...x }) => x);
  const next = out.find((x) => x.fig && daysOfFig(x.fig) >= 0);
  return { rows: out, line: next?.fig ?? (out.length ? `${out.length}` : ""), from: names.length ? `${name} in ${names.join(", ")}` : `no folder here has a ${name} yet` };
}
const shapeOf = (v: unknown): Read => ({ rows: rowsOf(v), ...(v && typeof v === "object" && typeof (v as { line?: unknown }).line === "string" ? { line: ((v as { line: string }).line).slice(0, 120) } : {}) });

// ---- the body: the rows as the view's kind reads them, with the person's ticks kept ----
/** `at`: when this row first came (kept across reads while it is the same row): yellow is only for what came since he
 *  last looked at the piece (the design's "yellow is earned") */
type Step = { t: string; st: "done" | "half" | "wait" | ""; note?: string; id?: string; href?: string; group?: string; press?: string; fig?: string; at?: number;
  /** what the piece's agent did for this row between his visits (the recipe's `tend`) */
  said?: string;
  /** the note this row had when its turn was asked (an empty answer is not asked again until the row changes) */
  tried?: string;
  /** who put it away, when not the person (a session's agent, by the piece's verbs) */
  by?: string;
  /** Jev's pick for the front, half sure: drawn as the first name with a dashed hairline */
  ghost?: boolean;
  /** Jev's word on whether this change needs him (JEV 2), asked when the row came or changed: acts keeps the yellow,
   *  ghost and none do not earn it (none set: no Jev, the plain rule) */
  needs?: Tier };
/** a row the person put away stays away while it is the same row: same id and same title; a new title brings it back */
const keyOf = (x: { id?: string; t: string }) => `${x.id ?? ""}\u0000${x.t}`;
/** the rows as a list's steps, a row the person already ticked staying done while it is the same row (pure) */
export function stepsOf(rows: Row[], before: Step[] = [], now = Date.now()): Step[] {
  const ticked = new Set(before.filter((s) => s.st === "done").map(keyOf));
  const came = new Map(before.map((s) => [keyOf(s), s.at]));
  return rows.map((r) => {
    const st: Step["st"] = r.done || ticked.has(keyOf(r)) ? "done" : r.wants ? "wait" : r.now ? "half" : "";
    return { t: r.t, st, ...(r.note ? { note: r.note } : {}), ...(r.id ? { id: r.id } : {}), ...(r.href ? { href: r.href } : {}), ...(r.group ? { group: r.group } : {}), ...(r.press ? { press: r.press } : {}), ...(r.fig ? { fig: r.fig } : {}), ...(r.maybe ? { ghost: true } : {}), at: came.get(keyOf(r)) ?? now };
  });
}
/** what wants him and came since he last looked (pure): the only rows that earn the yellow */
export const freshOf = (steps: Step[], seen: number) => steps.filter((s) => s.st === "wait" && (s.at ?? 0) > seen && (s.needs === undefined || s.needs === "acts")).length;
/** Jev's word on each waiting row that came, changed or was not judged yet (six a pulse; the rest keep the plain rule
 *  until their turn); an unchanged judged row keeps its word and is not asked again */
export async function jevNeeds(piece: string, steps: Step[], before: Step[]): Promise<Step[]> {
  const was = new Map(before.map((x) => [keyOf(x), x]));
  const ask: number[] = [];
  const out = steps.map((x, i) => {
    const b = was.get(keyOf(x));
    if (x.st !== "wait") return x;
    if (b && b.note === x.note && b.st === x.st && b.needs) return { ...x, needs: b.needs };
    if (ask.length < 6) ask.push(i);   // came, changed, or not judged yet: six a pulse, the rest at the next ones
    return x;
  });
  const said = await Promise.all(ask.map((i) => {
    const b = was.get(keyOf(steps[i]));
    const row = (x: Step): Row => ({ t: x.t, ...(x.note ? { note: x.note } : {}), wants: true });
    return jev(wantsBody(piece, b ? row(b) : undefined, row(steps[i]))).catch(() => null);
  }));
  ask.forEach((i, k) => { if (said[k] !== null && said[k] !== undefined) out[i] = { ...out[i], needs: wantsTier(said[k]) }; });
  return out;
}

// ---- the piece does part of its job: `tend` (pieceTend.ts) ----
let tender: (a: TendAsk) => Promise<string | null> = tendTurn;
/** for the tests: a stub in place of the agent turn (null: none answers) */
export const setTender = (f: ((a: TendAsk) => Promise<string | null>) | null) => { tender = f ?? (async () => null); };
export const TEND_PER_PULSE = 3;
/** the rows with the piece's `said`: kept on a row that is the same as before (same key, same note); asked, three a
 *  pulse, for a row that newly wants him; only with a sentence and a ceiling of `draft` or more. The rows that got a
 *  line come back in `told` for the ledger */
export async function tendSteps(r: { title: string; tend?: string; ceiling: Ceiling }, cwd: string, steps: Step[], before: Step[]): Promise<{ steps: Step[]; told: string[] }> {
  const was = new Map(before.map((x) => [keyOf(x), x]));
  const out = steps.map((x) => {
    const b = was.get(keyOf(x));
    if (!b || b.note !== x.note) return x;
    return { ...x, ...(b.said ? { said: b.said } : {}), ...(b.tried !== undefined ? { tried: b.tried } : {}) };
  });
  if (!r.tend || r.ceiling === "look") return { steps: out, told: [] };
  const ask: number[] = [];
  out.forEach((x, i) => { if (x.st === "wait" && !x.said && x.tried === undefined && ask.length < TEND_PER_PULSE) ask.push(i); });
  const got = await Promise.all(ask.map((i) => tender({ cwd, piece: r.title, sentence: r.tend!, row: { t: out[i].t, ...(out[i].note ? { note: out[i].note } : {}), ...(out[i].href ? { href: out[i].href } : {}) } }).then((s) => (s ? saidOf(s, out[i].t) : null), () => null)));
  const told: string[] = [];
  ask.forEach((i, k) => { const s = got[k]; out[i] = { ...out[i], tried: out[i].note ?? "", ...(s ? { said: s } : {}) }; if (s) told.push(out[i].t); });
  return { steps: out, told };
}

// when he last looked at each piece (its room, or `work.pieces.seen`): <home>/<project>/pieces-seen.json { name: at }
const seenFile = (project: string) => join(blocks.homeRoot(), blocks.projectName(project), "pieces-seen.json");
export function seenAt(project: string, name: string): number {
  try { return Number((JSON.parse(readFileSync(seenFile(project), "utf8")) as Record<string, number>)[name]) || 0; } catch { return 0; }
}
function markSeen(project: string, name: string, at = Date.now()) {
  let all: Record<string, number> = {};
  try { all = JSON.parse(readFileSync(seenFile(project), "utf8")); } catch { /* the first look */ }
  all[name] = at;
  mkdirSync(join(blocks.homeRoot(), blocks.projectName(project)), { recursive: true });
  writeFileSync(`${seenFile(project)}.tmp`, JSON.stringify(all));
  renameSync(`${seenFile(project)}.tmp`, seenFile(project));
}
export function bodyFor(view: View, steps: Step[], line?: string, pick?: Pick): { body: string; format: blocks.Format } {
  if (view === "table") return { body: JSON.stringify({ cols: ["", "what", "note"], rows: steps.map((s) => [s.st === "wait" ? "you" : s.st === "done" ? "done" : s.st === "half" ? "now" : "", s.t, s.note ?? ""]) }), format: "json" };
  if (view === "card") { const w = steps.filter((s) => s.st === "wait").length; return { body: `${line ?? `${w || steps.length}`}\n${steps.slice(0, 3).map((s) => s.t).join("\n")}`, format: "md" }; }
  return { body: JSON.stringify({ steps, ...(line ? { line } : {}), ...(pick ? { pick } : {}) }), format: "json" };
}
export const wantsOf = (steps: Step[]) => steps.filter((s) => s.st === "wait").length;

// ---- Jev's pick for the front (the design's JEV 1; pieceJev.ts) ----
/** what Jev picked the last time the waiting rows changed: the waiting rows' keys then, the row it put in front, how
 *  sure; kept in the body so an unchanged pulse puts the same row in front without asking again */
type Pick = { of: string; key: string; tier: Tier };
const waitingKey = (steps: Step[]) => steps.filter((s) => s.st === "wait").map(keyOf).join("\n");
function pickNow(project: string, id: string): Pick | undefined {
  try { return (JSON.parse(blocks.bodyOf(project, id)?.text ?? "") as { pick?: Pick }).pick; } catch { return undefined; }
}
let jev: (body: unknown) => Promise<unknown | null> = (body) => askJev(body);
/** for the tests: a stub in place of the real Jev (null: no Jev) */
export const setJev = (f: ((body: unknown) => Promise<unknown | null>) | null) => { jev = f ?? (async () => null); setDueJev(f); };
/** the steps with Jev's front applied (acts: that row moves to be the first that waits; ghost: marked, the order kept).
 *  Asked only when the waiting rows changed; no key, slow or an error: the plain order */
export async function jevFront(steps: Step[], before: Step[], was?: Pick): Promise<{ steps: Step[]; pick?: Pick }> {
  const of = waitingKey(steps);
  if (!of) return { steps };
  let pick = was && was.of === of ? was : undefined;
  if (!pick && of !== waitingKey(before.length ? before : [])) {
    const rows: Row[] = steps.map((x) => ({ t: x.t, ...(x.note ? { note: x.note } : {}), ...(x.st === "wait" ? { wants: true } : {}), ...(x.st === "done" ? { done: true } : {}) }));
    const q = frontBody(rows, steps.filter((x) => x.st === "done").map((x) => x.t));
    if (q.index.length > 1) {
      const got = frontPick(await jev(q.body).catch(() => null), q.index);
      if (got) { const o = frontOrder(rows, got); const i = o.front !== null && tierOf(got.p) === "acts" ? o.front : o.ghost; if (i !== null && i !== undefined && steps[i]) pick = { of, key: keyOf(steps[i]), tier: tierOf(got.p) }; }
    }
  }
  if (!pick || pick.tier === "none") return { steps, ...(pick ? { pick } : {}) };
  const i = steps.findIndex((x) => keyOf(x) === pick!.key && x.st === "wait");
  if (i < 0) return { steps };
  if (pick.tier === "ghost") return { steps: steps.map((x, j) => (j === i ? { ...x, ghost: true } : x)), pick };
  const first = steps.findIndex((x) => x.st === "wait");
  if (first === i) return { steps, pick };
  const out = steps.filter((_, j) => j !== i);
  out.splice(first, 0, steps[i]);
  return { steps: out, pick };
}
function stepsNow(project: string, id: string): Step[] {
  const b = blocks.bodyOf(project, id);
  try { const v = JSON.parse(b?.text ?? ""); return Array.isArray(v?.steps) ? v.steps : []; } catch { return []; }
}

// ---- the folder's pieces, kept fresh ----
type Kept = { cwd: string; project: string; recipe: Recipe; at: number; line?: string; from: string; error?: string; timer?: NodeJS.Timeout; busy?: boolean;
  /** an agent asked past the ceiling (pieceVerbs.ts): the rung it needs and the session that asked; his press clears it */
  may?: { ceiling: Ceiling; from: string; at: number; by?: string } };
/** project → name → the piece: one pulse per piece of a project, however many of its folders (worktrees) are listed;
 *  the folder last asked about is the one it reads */
const kept = new Map<string, Map<string, Kept>>();
/** the built-in sources whose rows Jev may be told (titles of issues, pull requests, runs, systems, the night's parts) */
// not the night: its rows are what agents wrote (the run branch's 85b51eed)
const JEV_SOURCES = new Set(["waits", "issues", "prs", "runs", "systems"]);
// whether any project's pieces are on (a face with build.pieces or home.pieces asked for them): the session's `piece`
// tool exists only then (tools.ts syncPieceTool); with both switches off, no session is given it
const onWatch = new Set<(on: boolean) => void>();
let wasOn = false;
const tellOn = () => { const on = [...kept.values()].some((m) => m.size > 0); if (on !== wasOn) { wasOn = on; for (const f of onWatch) { try { f(on); } catch { /* a listener is never the pieces' problem */ } } } };
/** told when pieces go on (the first project's pieces kept) or off (the last let go) */
export const onPiecesOn = (f: (on: boolean) => void) => { onWatch.add(f); return () => onWatch.delete(f); };
export const piecesOn = () => wasOn;
/** folder → its watch (two folders of one project each watch their own .sol/pieces) */
const watchers = new Map<string, { project: string; w: FSWatcher }>();
/** when a face last asked about each project; a project nobody asked about for IDLE_MS stops its pulses and its watch
 *  (the switch off, the window closed: nothing keeps reading) and starts again at the next ask */
const asked = new Map<string, number>();
let IDLE_MS = 10 * 60_000;
/** for the tests: a shorter idle */
export const setIdleMs = (ms: number) => { IDLE_MS = ms; };
const touch = (project: string) => { asked.set(project, Date.now()); };
// a project nobody asked about goes quiet on its own clock too, not only inside a pulse: with the switches off its pulses
// stop within a minute of the idle limit, and the session's piece tool goes with them (the review's R4)
const sweep = setInterval(() => {
  for (const [project, m] of [...kept]) {
    const every = Math.max(0, ...[...m.values()].map((k) => k.recipe.pulse.every * 1000));
    if (Date.now() - (asked.get(project) ?? 0) > Math.max(IDLE_MS, 2 * every)) stopProject(project);
  }
}, 60_000);
sweep.unref?.();
/** the project's pulses stopped and its watch closed */
function stopProject(project: string) {
  for (const k of kept.get(project)?.values() ?? []) clearInterval(k.timer);
  kept.delete(project);
  tellOn();
  for (const [cwd, x] of [...watchers]) if (x.project === project) { x.w.close(); watchers.delete(cwd); }
  asked.delete(project);
}
/** a project's piece by its name, or by its title as a person says it (pieceVerbs.ts) */
export const keptIn = (project: string, name: string) => kept.get(blocks.projectName(project))?.get(name) ?? kept.get(project)?.get(name);
export const keptTitled = (project: string, title: string) => [...(kept.get(blocks.projectName(project))?.values() ?? kept.get(project)?.values() ?? [])].find((k) => k.recipe.title.toLowerCase() === title.trim().toLowerCase());
/** how long an unanswered "let it act" stays on the piece: then it leaves by itself, and nothing happened */
export const MAY_MS = 10 * 60_000;
/** an agent asked past the piece's ceiling: the piece asks him ("let it act"); nothing happens without his press */
export function askMay(k: Kept, ceiling: Ceiling, sessionId: string, by?: string) {
  // one ledger line per ask while it is live, not one per refused verb
  const live = k.may && Date.now() - k.may.at < MAY_MS && k.may.ceiling === ceiling && k.may.from === sessionId;
  k.may = { ceiling, from: sessionId, at: Date.now(), ...(by ? { by } : {}) };
  if (live) { changed(k.cwd, k.project); return; }
  blocks.remark(k.project, idOf(k.recipe.name), "the piece", `asks you: may an agent ${ceiling === "draft" ? "draft" : ceiling} on it`, "ran");
  changed(k.cwd, k.project);
}
/** an agent's drafted line on a row (pieceVerbs.ts say): written into the body as a turn's is, one ledger line in its name */
export function saySaid(k: Kept, row: { id?: string; t: string }, said: string, by: string) {
  const id = idOf(k.recipe.name), steps = stepsNow(k.project, id), i = rowAt(steps, row);
  if (i < 0) throw new Error("no such row");
  steps[i] = { ...steps[i], said };
  const was = JSON.parse(blocks.bodyOf(k.project, id)?.text ?? "{}") as { line?: string; pick?: Pick };
  const { body, format } = bodyFor(k.recipe.view, steps, was.line, was.pick);
  blocks.keepStanding(k.project, id, { kind: k.recipe.view, title: k.recipe.title, body, format, by });
  blocks.remark(k.project, id, by, `drafted a line for ${row.t.slice(0, 80)}`, "ran");
  changed(k.cwd, k.project);
}
/** the folders watched now (for the tests) */
export const watching = () => [...watchers.keys()];
/** is anything keeping this project's pieces now (for the tests and the back) */
export const pulsing = (project: string) => [...(kept.get(project)?.keys() ?? [])];
let say: (m: object) => void = () => {};
/** who hears that a folder's pieces changed (wire.ts gives everyone) */
export const setPiecesBus = (f: (m: object) => void) => { say = f; };
const changed = (cwd: string, project: string) => { try { say({ type: "work.pieces.changed", cwd, project }); } catch { /* a face's trouble */ } };

/** the ticks he made while a pulse was reading (Jev may take 4 s): a row whose done-ness changed between `before` and
 *  `latest` keeps his change in the new steps (pure; the reviewer's 7) */
export function keepTicks(steps: Step[], before: Step[], latest: Step[]): Step[] {
  const was = new Map(before.map((x) => [keyOf(x), x.st === "done"]));
  const flip = new Map<string, Step["st"]>();   // his row's state as he left it
  for (const x of latest) { const k = keyOf(x); if (was.has(k) && was.get(k) !== (x.st === "done")) flip.set(k, x.st); }
  if (!flip.size) return steps;
  return steps.map((x) => { const st = flip.get(keyOf(x)); return st === undefined ? x : { ...x, st }; });
}

/** read one piece's source again and write its block: working while it reads, then waits (rows want you) or live.
 *  Never throws: a timer starts it with `void`, and an unhandled rejection would stop the engine (the reviewer's 1) */
export async function pulse(k: Kept): Promise<void> {
  if (k.busy) return;
  if (Date.now() - (asked.get(k.project) ?? 0) > Math.max(IDLE_MS, 2 * k.recipe.pulse.every * 1000)) { stopProject(k.project); return; }
  k.busy = true;
  const id = idOf(k.recipe.name);
  try {
    const was = blocks.getBlock(k.project, id);
    if (was && was.state !== "dead") blocks.setState(k.project, id, "working");
    const got = await readSource(k.cwd, k.recipe);
    const before = stepsNow(k.project, id);
    // rows from his Home (the built-in due: his stickies' own text, his facts' names; a piece that reads those) are his
    // words: Jev is asked nothing about them. The plain rules stand: due within a week wants him, the nearest is in front
    // Jev is asked only of GitHub's and the boards' rows (titles, kinds, counts); anything else (Home, a file, a program, an
    // address) may hold his own words: an allowed list, not exceptions (the review's R3)
    const his = !(k.recipe.source.from === "builtin" && JEV_SOURCES.has(k.recipe.source.name));
    const needs = his ? stepsOf(got.rows, before) : await jevNeeds(String((k.recipe.source as { name?: string }).name ?? ""), stepsOf(got.rows, before), before);   // the source's fixed name, never the title he may have typed (the lead's 08:20)
    const judged = his || k.recipe.keepOrder ? { steps: needs } : await jevFront(needs, before, pickNow(k.project, id));
    // the rows are written at once (a line already drafted kept); the piece's own lines follow when its turns answer
    const kept0 = (await tendSteps({ ...k.recipe, tend: undefined }, k.cwd, judged.steps, before)).steps;
    const write = (rows: Step[]) => {
      const steps = keepTicks(rows, before, stepsNow(k.project, id));   // his ticks while Jev and the turns were asked
      const { body, format } = bodyFor(k.recipe.view, steps, got.line, judged.pick);
      // the piece's first read is its backlog, not news: it counts as seen, so only what comes after it earns the yellow
      // (the designer's NOW of 02:50)
      if (!seenAt(k.project, k.recipe.name)) markSeen(k.project, k.recipe.name, Math.max(Date.now(), ...steps.map((x) => x.at ?? 0)));
      blocks.keepStanding(k.project, id, { kind: k.recipe.view, title: k.recipe.title, body, format, by: BY });
      const b = blocks.getBlock(k.project, id);
      blocks.setState(k.project, id, freshOf(steps, seenAt(k.project, k.recipe.name)) ? "waits" : "live", b?.state === "dead" ? [] : undefined);
    };
    write(kept0);
    k.line = got.line; k.from = got.from ?? ""; k.error = undefined;
    // his window's word, not the file's: a tend added to a recipe by any other hand drafts nothing (the review's R2)
    if (k.recipe.tend && k.recipe.ceiling !== "look" && heldTo(k.cwd, k.recipe.name, k.recipe.ceiling) !== "look" && trusted(k.cwd)) {
      changed(k.cwd, k.project);   // the rows show now; the turns take their 20 s
      const tended = await tendSteps(k.recipe, k.cwd, kept0, before);
      if (tended.told.length) {
        write(tended.steps);
        for (const t of tended.told) blocks.remark(k.project, id, "the piece", `drafted a line for ${t.slice(0, 80)}`, "ran");
      }
    }
  } catch (e) {
    k.error = e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : String(e);
    try {
      if (!blocks.getBlock(k.project, id)) blocks.keepStanding(k.project, id, { kind: k.recipe.view, title: k.recipe.title, body: bodyFor(k.recipe.view, []).body, by: BY });
      blocks.setState(k.project, id, "live");
    } catch { /* the home cannot be written: the piece says its error, the engine goes on */ }
  } finally {
    k.at = Date.now(); k.busy = false;
    changed(k.cwd, k.project);
  }
}

/** the folder's recipes read again: new pieces made and read, changed ones read again, removed ones stop their pulse */
/** `look`: someone is looking (a face asked), which keeps the project's pulses going; an agent's verb is not a look */
export function load(cwd: string, look = true): { errors: { file: string; error: string }[] } {
  const project = blocks.projectOf(cwd);
  if (look) touch(project);
  const { recipes, errors } = recipesIn(cwd);
  const now = kept.get(project) ?? new Map<string, Kept>();
  kept.set(project, now);
  // two folders of one project (a checkout and its worktree) shown at once: each folder adds and removes only the pieces
  // it made; a piece another folder made stays that folder's while its recipe is there (never a restart loop)
  for (const [name, k] of now) if (k.cwd === cwd && !recipes.some((r) => r.name === name)) { clearInterval(k.timer); now.delete(name); }
  for (const r of recipes) {
    const old = now.get(r.name);
    if (old && JSON.stringify(old.recipe) === JSON.stringify(r)) continue;
    if (old && old.cwd !== cwd && existsSync(join(old.cwd, DIR, `${r.name}.json`))) continue;
    if (old) clearInterval(old.timer);
    const k: Kept = { cwd, project, recipe: r, at: 0, from: "" };
    k.timer = setInterval(() => void pulse(k), r.pulse.every * 1000);
    k.timer.unref?.();
    now.set(r.name, k);
    void pulse(k);
  }
  watchFolder(cwd);
  tellOn();
  return { errors };
}

/** an agent that writes a recipe makes a piece: the folder's .sol/pieces is watched once it has been listed */
function watchFolder(cwd: string) {
  const project = blocks.projectOf(cwd);
  if (watchers.has(cwd)) return;
  const dir = join(cwd, DIR);
  try { if (!statSync(dir).isDirectory()) return; } catch { return; }
  let t: NodeJS.Timeout | undefined;
  try {
    // a recipe written while nobody asks (idle) is read at the next ask, not by the watch
    const w = watch(dir, () => { clearTimeout(t); t = setTimeout(() => { try { if (kept.has(project)) { const a = asked.get(project); load(cwd); if (a !== undefined) asked.set(project, a); changed(cwd, project); } } catch { /* read at the next list */ } }, 250); t.unref?.(); });
    w.on("error", () => { if (watchers.get(cwd)?.w === w) watchers.delete(cwd); });
    watchers.set(cwd, { project, w });
  } catch { /* a folder that cannot be watched is read at each list */ }
}

/** the folder's pieces at a glance, for the face's list */
export function list(cwd: string, look = true): { project: string; pieces: PieceInfo[]; errors: { file: string; error: string }[] } {
  const { errors } = load(cwd, look);
  const project = blocks.projectOf(cwd);
  const pieces = [...(kept.get(project)?.values() ?? [])].map((k): PieceInfo => {
    const id = idOf(k.recipe.name), b = blocks.getBlock(project, id), steps = stepsNow(project, id);
    return {
      name: k.recipe.name, title: k.recipe.title, view: k.recipe.view, id, state: k.busy ? "working" : b?.state === "dead" ? "live" : b?.state ?? "working",
      wants: wantsOf(steps), fresh: freshOf(steps, seenAt(project, k.recipe.name)), doubt: steps.filter((x) => x.st === "wait" && x.needs === "ghost" && (x.at ?? 0) > seenAt(project, k.recipe.name)).length, total: steps.length, open: steps.filter((s) => s.st !== "done").length, ...(k.line ? { line: k.line } : {}), at: k.at, every: k.recipe.pulse.every, ceiling: k.recipe.ceiling,
      verbs: k.recipe.verbs, ...(k.recipe.about ? { about: k.recipe.about } : {}), ...(k.recipe.tend ? { tend: k.recipe.tend } : {}), ...(k.may && Date.now() - k.may.at < MAY_MS ? { may: k.may.ceiling, mayFrom: k.may.from, ...(k.may.by ? { mayBy: k.may.by } : {}) } : {}), from: k.from || sourceWords(k.recipe.source), ...(k.recipe.source.from === "builtin" ? { builtin: (k.recipe.source as { name: string }).name } : {}), ...(k.error ? { error: k.error } : {}), ...(k.error === ASKS || (k.recipe.tend && k.recipe.ceiling !== "look" && !trusted(k.cwd)) ? { asks: "", scope: scopeOf(k.cwd) } : {}), sessions: b?.sessions ?? [],
    };
  });
  return { project, pieces, errors };
}
const sourceWords = (s: Source) => (s.from === "rows" ? "the recipe" : s.from === "builtin" ? s.name : s.from === "pieces" ? `each folder's ${s.name}` : s.from === "url" ? s.url : s.path);

const find = (cwd: string, name: string, look = true) => { load(cwd, look); const k = kept.get(blocks.projectOf(cwd))?.get(name); if (!k) throw new Error(`no piece "${name}" in this folder`); return k; };

/** which row a press names: by its id and title (the order may have changed since the face drew it: Jev's front, a
 *  pulse), by position only when the face sent no key (pure; the reviewer's 6) */
export function rowAt(steps: { id?: string; t: string }[], row: number | { id?: string; t: string }): number {
  if (typeof row === "number") return Number.isInteger(row) && row >= 0 && row < steps.length ? row : -1;
  return steps.findIndex((x) => keyOf(x) === keyOf(row));
}
/** the person's press on a row: ticked (done), the same body every placement reads, and a ledger line */
export function tick(cwd: string, name: string, which: number | { id?: string; t: string }, by = "you", look = by === "you"): blocks.Block {
  const k = find(cwd, name, look), id = idOf(name);
  const steps = stepsNow(k.project, id);
  const row = rowAt(steps, which);
  if (row < 0) throw new Error("no such row");
  const st: Step["st"] = steps[row].st === "done" ? "" : "done";
  // who put it away, when it was not him: the front's foot names the session ("orchestrator put away 2 · undo")
  const { by: _was, ...rest } = steps[row];
  steps[row] = { ...rest, st, ...(st === "done" && by !== "you" ? { by } : {}) };
  const was = JSON.parse(blocks.bodyOf(k.project, id)?.text ?? "{}") as { line?: string; pick?: Pick };
  const { body, format } = bodyFor(k.recipe.view, steps, was.line, was.pick);
  const b = blocks.keepStanding(k.project, id, { kind: k.recipe.view, title: k.recipe.title, body, format, by });
  blocks.setState(k.project, id, freshOf(steps, seenAt(k.project, name)) ? "waits" : "live");
  blocks.remark(k.project, id, by, `${steps[row].st === "done" ? (steps[row].press === "keep" ? "kept" : "ticked") : "unticked"}: ${steps[row].t.slice(0, 80)}`, "yes");
  changed(cwd, k.project);
  return b;
}

/** a piece dropped into a session: the same block on that session's stage (carry), one ledger */
export function drop(cwd: string, name: string, sessionId: string, by = "you", at?: blocks.At, sessionFolder?: string | null) {
  const k = find(cwd, name), id = idOf(name);
  if (!sessionId) throw new Error("no session to drop it in");
  // a session of another project has another home: the block would seat where its stage never looks (the reviewer's 8)
  if (sessionFolder && blocks.projectOf(sessionFolder) !== k.project) throw new Error("that session is in another project: open the piece from its own folder");
  if (!blocks.getBlock(k.project, id)) blocks.keepStanding(k.project, id, { kind: k.recipe.view, title: k.recipe.title, body: bodyFor(k.recipe.view, []).body, by: BY });
  const b = blocks.getBlock(k.project, id)!;
  if (b.state === "dead") blocks.setState(k.project, id, "live", []);
  const r = blocks.place({ project: k.project, sessionId, by }, { id, carry: sessionId, ...(at ? { at } : {}) });
  changed(cwd, k.project);
  return r;
}

/** his new sentence for the piece's turns: the lines the old one drafted are let go (the next pulse drafts again) */
export function clearSaid(cwd: string, name: string) {
  const project = blocks.projectOf(cwd), id = idOf(name);
  const raw = blocks.bodyOf(project, id)?.text;
  if (!raw) return;
  let v: { steps?: Step[]; line?: string; pick?: Pick };
  try { v = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(v.steps) || !v.steps.some((s) => s.said || s.tried !== undefined)) return;
  // the lines and the marks of having asked both go: every row is drafted again under the new sentence
  const steps = v.steps.map(({ said: _said, tried: _tried, ...s }) => s);
  const k = kept.get(project)?.get(name);
  const { body, format } = bodyFor(k?.recipe.view ?? "list", steps, v.line, v.pick);
  blocks.keepStanding(project, id, { kind: k?.recipe.view ?? "list", title: k?.recipe.title ?? name, body, format, by: "you" });
}

/** the piece's ledger and body, for its page */
export function open(cwd: string, name: string) {
  const k = find(cwd, name), id = idOf(name);
  const piece = list(cwd).pieces.find((p) => p.name === name);
  return { piece: piece?.asks !== undefined ? { ...piece, asks: "" } : piece, seen: blocks.seen(k.project, id, 20), recipe: k.recipe, file: join(DIR, `${name}.json`) };
}

/** a recipe written into the folder, checked first (the face's "add", and the way a tool asks for one): refused with
 *  why when it is not one; never over another piece's file */
export function make(cwd: string, raw: unknown, fromSol = false): { piece?: PieceInfo; error?: string } {
  const r = readRecipe(raw);
  if ("error" in r) return { error: r.error };
  // a piece whose agent drafts or acts runs turns on his account: only his own window makes one; it still asks the
  // folder's yes like any other (a keep is never the yes)
  if ((r.tend || r.ceiling !== "look") && !fromSol) return { error: "only Sol's own window makes a piece whose agent drafts or acts" };
  const f = join(cwd, DIR, `${r.name}.json`);
  if (existsSync(f)) return { error: `a piece named "${r.name}" is there already` };
  // the checked recipe is written, with yours' sum kept (yoursKeep.ts: a file changed by hand is never written over)
  const sum = typeof (raw as { sum?: unknown }).sum === "string" ? { sum: (raw as { sum: string }).sum } : {};
  try { writeInPieces(cwd, `${r.name}.json`, JSON.stringify({ ...r, ...sum }, null, 2) + "\n"); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  if (fromSol) grant(cwd, r.name, r.ceiling, r.source);
  // written by another program: the file is there for when his window wakes the folder; it wakes nothing now
  if (!fromSol && !kept.has(blocks.projectOf(cwd))) return { piece: undefined };
  load(cwd);
  changed(cwd, blocks.projectOf(cwd));
  return { piece: list(cwd).pieces.find((p) => p.name === r.name) };
}

/** he looked at the piece (its room opened): what wanted him is not new now; its block stops asking */
export function seen(cwd: string, name: string) {
  const k = find(cwd, name);
  markSeen(k.project, name);
  const b = blocks.getBlock(k.project, idOf(name));
  if (b?.state === "waits") blocks.setState(k.project, b.id, "live");
  changed(cwd, k.project);
  return { ok: true };
}

/** read again now (the page's press) */
export async function now(cwd: string, name: string, look = true) { await pulse(find(cwd, name, look)); return list(cwd, look).pieces.find((p) => p.name === name); }

// a piece closed in a session goes back to the folder: live again, held by no session (a piece is never dead while its
// recipe is there)
blocks.onClose((project, b) => {
  if (!isPiece(b.id)) return;
  setImmediate(() => {
    try {
      const has = [...kept.values()].some((m) => [...m.values()].some((k) => k.project === project && idOf(k.recipe.name) === b.id));
      if (has) blocks.setState(project, b.id, "live", []);
    } catch { /* the home cannot be written now: the next pulse sets it */ }
  });
});

/** the wire's half (work/wire.ts sends work.pieces.* here) */
/** the folder a message names, when it is one: absolute and there (pure but for the disk) */
export const folderOf = (cwd: unknown): string | null => (typeof cwd === "string" && isAbsolute(cwd) && existsSync(cwd) && statSync(cwd).isDirectory() ? cwd : null);
/** where a session works, when the engine knows: a running one by its hold, else the sessions' list */
let sessionFolderOf: (sid: string) => Promise<string | null> = async (sid) => {
  const busy = await import("../busy.js");
  const held = busy.sessionCwd(sid);
  if (held) return held;
  try { const { workSessions } = await import("./sessions.js"); return (await workSessions()).sessions.find((s) => s.id === sid)?.cwd ?? null; } catch { return null; }
};
/** for the tests: where a session works */
export const setSessionFolderOf = (f: (sid: string) => Promise<string | null>) => { sessionFolderOf = f; };
export async function piecesMsg(w: { send: (o: object) => void }, m: { type: string; rid?: string; cwd?: unknown; name?: unknown; row?: unknown; key?: unknown; sessionId?: unknown; at?: unknown }) {
  const reply = (o: object) => w.send({ type: m.type, rid: m.rid, ...o });
  const cwd = folderOf(m.cwd);
  if (!cwd) return reply({ error: "that folder is not there" });
  const name = String(m.name ?? "");
  // words from the folder's files (a script's error, a recipe's parse error) reach only Sol's own window
  const app = (m as { fromSol?: unknown }).fromSol === true;
  const hushed = (e?: string) => (e === undefined || app || e === ASKS ? e : "it could not read");
  const hushP = <T extends { error?: string } | undefined>(p: T): T => (p && p.error !== undefined ? { ...p, error: hushed(p.error) } : p);
  // only Sol's own window wakes a folder's pieces (its switch is on there); another program reads what is awake, and
  // wakes nothing: no pulse, no program, no Jev, no piece tool for the sessions (the review's R5)
  const awake = kept.has(blocks.projectOf(cwd)) || kept.has(blocks.projectName(blocks.projectOf(cwd)));
  if (!app && !awake && m.type !== "work.pieces.make") return reply(m.type === "work.pieces.list" ? { cwd, project: blocks.projectOf(cwd), pieces: [], errors: [] } : { error: "the pieces here are not on" });
  try {
    switch (m.type) {
      case "work.pieces.list": {
        // the yes's one-time code goes only to Sol's own window (index.ts sets fromSol from door.ts appPage, never the
        // message): any other local program sees the ask, never the code
        const l = list(cwd);
        return reply({ cwd, ...l, errors: l.errors.map((e) => ({ ...e, error: hushed(e.error)! })), pieces: l.pieces.map((p) => hushP(p.asks !== undefined ? { ...p, asks: app ? askCode(cwd) : "" } : p)) });
      }
      case "work.pieces.make": { const r = make(cwd, (m as { recipe?: unknown }).recipe, app); return reply({ ...r, piece: hushP(r.piece) }); }   // its own refusals are its words, not the folder's
      case "work.pieces.open": { const o = open(cwd, name); return reply({ ...o, piece: hushP(o.piece) }); }
      case "work.pieces.now": return reply({ piece: hushP(await now(cwd, name)) });
      case "work.pieces.seen": return reply(seen(cwd, name));
      case "work.pieces.tick": {
        const key = m.key as { id?: unknown; t?: unknown } | undefined;
        const which = key && typeof key.t === "string" ? { t: key.t, ...(typeof key.id === "string" ? { id: key.id } : {}) } : Number(m.row);
        return reply({ block: tick(cwd, name, which) });
      }
      case "work.pieces.trust":
        if ((m as { fromSol?: unknown }).fromSol !== true) return reply({ error: "only Sol's own window lets a folder's scripts run" });
        return reply(trust(cwd, (m as { code?: unknown }).code));
      // making one by hand (pieceBench.ts): what the folder can be read from, one read of a draft, a notch moved
      case "work.pieces.sources": {
        const { sources } = await import("./pieceBench.js");
        if ((m as { ghost?: unknown }).ghost !== true) return reply({ sources: sources(cwd) });
        // the ghost row (pieceGhost.ts), asked on the sources' own message (no new type in the shared wire): his lines
        // in the project's sessions of the last day (the side asks by the project's path, a session has its own
        // folder); only Sol's window is answered
        if ((m as { fromSol?: unknown }).fromSol !== true) return reply({ ghost: null });
        const { ghostFor } = await import("./pieceGhost.js"), { workSessions, transcriptFiles } = await import("./sessions.js");
        const ghost = await ghostFor(cwd, sources(cwd), async () => (await workSessions()).sessions.filter((x) => (x.cwd === cwd || blocks.projectOf(x.cwd) === blocks.projectOf(cwd)) && Date.now() - x.updatedAt < 86_400_000).slice(0, 8).flatMap((x) => transcriptFiles(x.id, x.cwd).slice(0, 1)), list(cwd).pieces.map((p) => p.title));
        return reply({ ghost });
      }
      case "work.pieces.try": { const t = await (await import("./pieceBench.js")).tryRecipe(cwd, (m as { recipe?: unknown }).recipe) as { error?: string }; return reply({ ...t, ...(t.error !== undefined ? { error: hushed(t.error) } : {}) }); }
      case "work.pieces.set": {
        if ((m as { fromSol?: unknown }).fromSol !== true) return reply({ error: "only Sol's own window moves a piece's notches" });
        // "let it act": his engine lets agents go that far on this piece; the committed recipe (every teammate's) is not
        // rewritten (the lead's 05:54, 3)
        if ((m as { here?: unknown }).here === true) {
          const c = (m as { ceiling?: unknown }).ceiling;
          if (typeof c !== "string" || !(CEILINGS as readonly string[]).includes(c)) return reply({ error: "no such ceiling" });
          grant(cwd, name, c as Ceiling);
          const k = kept.get(blocks.projectOf(cwd))?.get(name);
          if (k) k.may = undefined;
          changed(cwd, blocks.projectOf(cwd));
          return reply({ ok: true });
        }
        const r = (await import("./pieceBench.js")).setNotch(cwd, name, m as { every?: unknown; ceiling?: unknown; tend?: unknown });
        if (r.ok && (m as { tend?: unknown }).tend !== undefined) clearSaid(cwd, name);
        const c = (m as { ceiling?: unknown }).ceiling;
        if (r.ok && typeof c === "string" && (CEILINGS as readonly string[]).includes(c)) grant(cwd, name, c as Ceiling);
        if (r.ok) { load(cwd); changed(cwd, blocks.projectOf(cwd)); }
        return reply(r);
      }
      case "work.pieces.drop": {
        const a = m.at as Record<string, unknown> | undefined;
        const at = a && ["x", "y", "w", "h"].every((k) => Number.isFinite(a[k])) ? { x: a.x as number, y: a.y as number, w: a.w as number, h: a.h as number, hand: true } : undefined;
        const sid = String(m.sessionId ?? "");
        return reply({ ...drop(cwd, name, sid, "you", at, sid ? await sessionFolderOf(sid) : null) });
      }
    }
    return reply({ error: `no ${m.type}` });
  } catch (e) { return reply({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }); }
}

/** for the tests: every pulse stopped, every watch closed */
export function stopAll() {
  for (const p of [...kept.keys(), ...[...watchers.values()].map((x) => x.project)]) stopProject(p);
}

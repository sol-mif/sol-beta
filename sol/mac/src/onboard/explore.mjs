#!/usr/bin/env node
// The one onboarding's explorer (#1088): what this computer already says about the person, read in the open, in the order
// the person watches it, and never more than names, titles and dates. Read-only: it opens no page, sends nothing, signs in
// nowhere, and never reads a token, a message's text or a file's body (a calendar's .ics is read for its event names and
// times; a file is only its name and date). Run by the face through the engine's terminal wire, like the tour's finder:
//   node explore.mjs --out <file.json> [--home <dir>] [--skip a,b] [--deny a,b] [--days 30] [--from <dir>]
//                    [--connected <file.json>] [--reader <read.mjs>] [--stops-said]
// It is the one reader (#1217): nothing else in Sol finds what the computer holds (the tour's finder went with #1223).
// It writes --out as it works, so the face draws the reading live (#1217, F13-F15): a stop's `open` is the source open now
// (an account, a tool's session list, a folder, a calendar), `read` the rows looked at so far, each fact the moment it is
// found, each thing left unread in `skips` with one reason of three:
//   { v: 1, made, home, stops: [{ id, state: "now"|"done"|"none"|"refused"|"skipped", line, open?, read, facts: [Fact],
//     skips: [{ what, why: "denied" (the person's consent, or what Sol never opens) | "unreachable" | "nothing" }] }],
//     reach: { gh, gog, code: [server], codex: [server], ai: { claude?, codex?, gemini? }, apps: [app] } }   (stop 0, presence only)
//   Fact = { id, k, v, src, kind, when?, sure, via?, n? }   kind: machine | ai | session | tool | project | event | place | file
// What the person allowed is read from their record (~/.sol/record/me.json, `consent`, onboard/consent.ts) before anything
// is opened: its `left` stops are skipped (unless --stops-said: the stops were chosen in this run), a source it names "no" in `sources` is never opened (and so is every --deny),
// and after "only what I tell you" a named source is opened only on its "yes". The named sources: claude-sessions,
// codex-sessions (the AI tools' session files), ai-setup (their rules, settings and hooks, #1423), notes, gdrive, github.
// --from: the folder Sol.app filled with copies of the stores macOS keeps closed to the engine (places_copy, #1069): the
// calendar store, Notes, Safari's history; they are read there first. --connected: the services connected in the person's
// Claude account, as the engine lists them (the face writes it). --reader: places/read.mjs, the store reader, beside this
// file by default.
// The stops, in this order: machine (the apps here), ai (the AI tools signed in, and with consent what the person has been
// working on with each: project names, session titles, dates from Claude Code's and Codex's session files, never a word
// of a message), tools (what is connected and through what: the Claude account, Claude Code, Codex, gh, gog), calendar
// (the calendar store and .ics files), files (by name, and Notes' titles), projects (git folders and their remotes),
// browser (page titles by site). A browser is never opened, and mail, calendar and files are never read through one.
// A stop that cannot read (no permission, a locked store) is "refused" and named; one with nothing is "none". Never a throw.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, copyFileSync, rmSync, mkdtempSync, openSync, readSync, closeSync } from "node:fs";
import { join, basename, extname, dirname, resolve } from "node:path";
import { tmpdir, homedir, userInfo } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HOME = arg("home", homedir());
// a --home that is not this account's own (a seeded person in a test) is read alone: no /Applications, no ps, no id -F,
// no PATH, so nothing of the machine's real owner lands in a stranger's facts (morning round, 2026-11-13). The account's
// home is its login record's, not $HOME: a test engine started with HOME set to a seeded person (people/try.sh) is a stranger too
const OWN = resolve(HOME) === resolve((() => { try { return userInfo().homedir; } catch { return homedir(); } })());
const OUT = arg("out", join(HOME, ".sol", "onboard", "explore.json"));
const SKIP = new Set(String(arg("skip", "")).split(",").filter(Boolean));
const DAYS = Number(arg("days", "30"));
const NOW = Date.now(), SINCE = NOW - DAYS * 864e5;
const FROM = arg("from", null);
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const json = (t) => { try { return JSON.parse(t ?? ""); } catch { return null; } };
/** the word a hook is shown by (#1531): its script's name, never an assignment (`API_TOKEN=…`), `env`, a flag or a shell,
 *  a flag's value or a word that looks like a key, with quotes read as a shell reads them; null when no word is safe. people/mirror.mjs keeps the same picker (this file
 *  ships as one text, so it cannot import one) */
const hookWord = (command) => {
  let afterFlag = false;
  for (const raw of String(command ?? "").match(/(?:[^\s"'`]+|"[^"]*"|'[^']*'|`[^`]*`)+/g) ?? []) {
    const w = raw.replace(/["'`]/g, "");
    if (/^[A-Za-z_]\w*=/.test(raw)) continue;   // an assignment, quoted value and all
    if (/\s/.test(w)) return hookWord(w);   // sh -c "…": the command inside
    if (!w || w.includes("=")) continue;    // an assignment, or a flag's --key=value
    if (/^(env|bash|sh|zsh|node|python3?|exec|sudo|command|nice|uvx?|run|npx|bunx?|tsx|deno)$/.test(w.split("/").pop())) { afterFlag = false; continue; }
    if (w.startsWith("-")) { afterFlag = true; continue; }
    const b = w.split("/").pop();
    if (afterFlag && !w.includes("/") && !/\.\w{1,5}$/.test(b)) return null;   // after a flag, a bare word may be its value
    return /^[\w.@+-]{1,64}$/.test(b) && !/^(sk|ghp|gho|ghs|ghu|glpat|xox[abps])[-_]|^AKIA[0-9A-Z]{12}|[A-Za-z0-9]{24,}/.test(b) ? b : null;
  }
  return null;
};

// what the person allowed, from their record, before anything is opened (#1216, #1217)
const CONSENT = json(read(join(HOME, ".sol", "record", "me.json")))?.consent ?? null;
// the stops it left out, unless the person chose the stops in this very run (--stops-said: the onboarding passes its own)
if (!process.argv.includes("--stops-said")) for (const l of Array.isArray(CONSENT?.left) ? CONSENT.left : []) SKIP.add(l);
const SAID = CONSENT?.sources && typeof CONSENT.sources === "object" ? CONSENT.sources : {};
const DENY = new Set([...String(arg("deny", "")).split(",").filter(Boolean), ...Object.keys(SAID).filter((k) => SAID[k] === "no")]);
const CAREFUL = CONSENT?.agreed?.said === "only what I tell you";
/** may this named source be opened */
const allowed = (id) => !DENY.has(id) && (!CAREFUL || SAID[id] === "yes");
const OFF = (Array.isArray(CONSENT?.off) ? CONSENT.off : []).map((o) => String(o).toLowerCase().replace(/^my\s+/, "").trim()).filter((o) => o.length > 2);

// the store reader (places/read.mjs), beside this file (the face writes both) or in the repo
const HERE = dirname(fileURLToPath(import.meta.url));
const READER = [arg("reader", ""), join(HERE, "read.mjs"), join(HERE, "places", "read.mjs")].find((p) => p && existsSync(p));
let readStore = null;
if (READER) try { ({ readStore } = await import(pathToFileURL(READER).href)); } catch { readStore = null; }
/** one store through the reader, read from Sol's copy first; null when there is no reader */
const store = (name, more = {}) => (readStore ? readStore({ store: name, home: HOME, from: FROM, days: DAYS, hosts: [], bin: null, max: null, chats: null, ...more }) : null);

const out = { v: 1, made: new Date().toISOString(), home: HOME, stops: [] };
mkdirSync(dirname(OUT), { recursive: true });
const flush = () => writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
let n = 0;
// a fact's id is what it is (its kind, key, value and source), so the same thing has the same id on every run: an answer
// given to it ("c-<id>") stays with it, and "look again" knows it; a second one the same in one run gets a suffix
const ids = new Set();
const idOf = (kind, k, v, src) => { const h = createHash("sha1").update(`${kind}|${k}|${v}|${src}`).digest("hex").slice(0, 10); let id = `f${h}`; for (let i = 2; ids.has(id); i++) id = `f${h}-${i}`; ids.add(id); n++; return id; };
const fact = (k, v, src, kind, more = {}) => ({ id: idOf(kind, k, v, src), k, v, src, kind, sure: true, ...more });
const ls = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch (e) { return e && e.code === "EACCES" || e?.code === "EPERM" ? null : []; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };
const onPath = (bin) => { try { return spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8", timeout: 3000 }).stdout.trim() || null; } catch { return null; } };
const HOLDS = /(^|\.)(mail\.|outlook\.|proton|whatsapp|messages\.|messenger|discord|slack|telegram|signal|teams\.|linkedin\.com$|instagram|facebook|x\.com$|twitter|bank|chase\.|paypal|venmo|revolut|wise\.com$|coinbase|chat\.|claude\.ai$|chatgpt\.com$|icloud\.com$|fastmail)/i;
const pretty = (s) => s.replace(/\.app$/, "");

// the live file: written at most every 120 ms while a stop works, and always when it starts and ends
let last = 0;
const soon = () => { const t = Date.now(); if (t - last >= 120) { last = t; flush(); } };
/** the source open now, in words ("Claude Code · thesis", "Calendar · Work") */
const opening = (s, what) => { s.open = what; soon(); };
/** a fact, the moment it is found */
const found = (s, f) => { s.facts.push(f); soon(); return f; };
/** a thing left unread, with its reason: denied | unreachable | nothing */
const skip = (s, what, why) => { if (!s.skips.some((x) => x.what === what)) s.skips.push({ what, why }); soon(); };
const rows = (s, k = 1) => { s.read += k; soon(); };

async function stop(id, line, fn) {
  if (SKIP.has(id)) { out.stops.push({ id, state: "skipped", line: "skipped, as you asked", read: 0, facts: [], skips: [{ what: line, why: "denied" }] }); flush(); return; }
  const s = { id, state: "now", line, read: 0, facts: [], skips: [] };
  out.stops.push(s); last = Date.now(); flush();
  try {
    const r = await fn(s);
    s.state = r === "refused" ? "refused" : s.facts.length ? "done" : "none";
    if (typeof r === "string" && r !== "refused") s.line = r;
  } catch (e) { s.state = "refused"; s.line = `could not read: ${String(e?.message ?? e).split("\n")[0].slice(0, 80)}`; }
  delete s.open;
  flush();
}

// ── 0 what is signed in, by presence only (#1423, the sign-ins under the box: onboard/places.ts): written before the
// first stop, so the ask can say which places are reached and which wait for a sign-in before anything is read. Never a
// name inside an account and never a token: whether gh and gog are signed in, the names of Claude Code's and Codex's own
// MCP servers, each AI tool signed in or not (as stop 2 judges it), and the apps of the places that have one
{
  const there = (p) => existsSync(join(HOME, p));
  const gh = read(join(HOME, ".config", "gh", "hosts.yml")) ?? "";
  const gog = !![join(HOME, ".config", "gogcli"), join(HOME, "Library", "Application Support", "gogcli")].find(isDir) || (OWN && !!onPath("gog"));
  let code = [];
  try { code = Object.keys(json(read(join(HOME, ".claude.json")))?.mcpServers ?? {}); } catch { /* torn */ }
  const codex = [...(read(join(HOME, ".codex", "config.toml")) ?? "").matchAll(/^\[mcp_servers\.([^\].]+)/gm)].map((m) => m[1]);
  const ai = {};
  if (there(".claude") || there(".claude.json")) ai.claude = there(".claude/.credentials.json") || there(".claude.json");
  if (there(".codex")) ai.codex = there(".codex/auth.json");
  if (there(".gemini")) ai.gemini = there(".gemini/oauth_creds.json");
  const APPS = ["Notion", "Slack", "Microsoft Outlook", "OneDrive", "Microsoft Teams", "GitHub Desktop"];
  const apps = APPS.filter((a) => [join(HOME, "Applications"), ...(OWN ? ["/Applications"] : [])].some((d) => existsSync(join(d, `${a}.app`))));
  out.reach = { gh: /\S/.test(gh), gog, code, codex, ai, apps };
  flush();
}

// ── 1 the machine: the apps installed and the ones running (screens are the window's to read; the face adds them)
await stop("machine", "the apps on this computer", (s) => {
  const seen = new Map();
  opening(s, "your Applications folder");
  for (const d of [join(HOME, "Applications"), ...(OWN ? ["/Applications"] : [])]) for (const e of ls(d) ?? []) if (e.name.endsWith(".app")) seen.set(pretty(e.name), "installed");
  // running: a process whose path sits inside a .app (macOS); elsewhere none
  if (OWN) try {
    const ps = spawnSync("ps", ["-axo", "comm="], { encoding: "utf8", timeout: 4000 }).stdout ?? "";
    for (const l of ps.split("\n")) { const m = l.match(/\/([^/]+)\.app\/Contents\/MacOS\//); if (m) seen.set(m[1], "open"); }
  } catch { /* no ps */ }
  // the person's name: the Mac account's full name, else git's, else nothing (the face then greets without one)
  const full = (() => { try { return OWN && process.platform === "darwin" ? spawnSync("id", ["-F"], { encoding: "utf8", timeout: 2000 }).stdout.trim() : ""; } catch { return ""; } })();
  const git = (read(join(HOME, ".gitconfig")) ?? "").match(/^\s*name\s*=\s*(.+)$/m)?.[1]?.trim();
  const who = full || git;
  if (who) found(s, fact("name", who, full ? "this Mac's account" : "your git name", "machine"));
  const sys = /^(Safari|System Settings|App Store|Finder|Utilities|Preview|TextEdit|Calculator|Photo Booth|Automator)$/;
  const apps = [...seen].filter(([a]) => !sys.test(a)).sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === "open" ? -1 : 1));
  for (const [a, st] of apps.slice(0, 24)) found(s, fact("app", a, st === "open" ? "running now" : "/Applications", "machine", { open: st === "open" }));
  const opened = apps.filter((a) => a[1] === "open").length;
  return apps.length ? `${opened ? `${opened} open · ` : ""}${apps.length} apps` : "no apps found";
});

// ── 2 the AI tools signed in (never the token, only that the file is there), and with consent what the person has been
// working on with each: from Claude Code's and Codex's session files, the folder each session ran in, its title, its date.
// A session file is never parsed but for the lines that carry a title (custom-title, ai-title, summary) and a working
// folder's "cwd" key; a message's text is never kept, copied or shown
const BIG = 32 * 2 ** 20, END = 4 * 2 ** 20;
/** a session file's text, or its first and last 4 MB when it is very large (the title lines are short, the cwd early) */
const sessionText = (p) => {
  let size = 0; try { size = statSync(p).size; } catch { return ""; }
  if (size <= BIG) return read(p) ?? "";
  try { const fd = openSync(p, "r"); const a = Buffer.alloc(END), b = Buffer.alloc(END); readSync(fd, a, 0, END, 0); readSync(fd, b, 0, END, size - END); closeSync(fd); return `${a.toString("utf8")}\n${b.toString("utf8")}`; } catch { return ""; }
};
const unq = (s) => json(`"${s}"`) ?? s;
const cwdOf = (t) => { const m = t.match(/"cwd":\s?"((?:[^"\\]|\\.)*)"/); return m ? unq(m[1]) : null; };
/** a session's title: the person's own (custom-title, the last one) before Claude's (ai-title) before an old summary */
const titleOf = (t) => {
  let own = null, ai = null, sum = null;
  for (const line of t.split("\n")) {
    if (!line.startsWith('{"type":"custom-title"') && !line.startsWith('{"type":"ai-title"') && !line.startsWith('{"type":"summary"')) continue;
    const j = json(line); if (!j) continue;
    if (j.type === "custom-title" && j.customTitle) own = String(j.customTitle);
    else if (j.type === "ai-title" && j.aiTitle) ai = String(j.aiTitle);
    else if (j.type === "summary" && j.summary) sum = String(j.summary);
  }
  const x = own ?? ai ?? sum;
  return x ? x.replace(/\s+/g, " ").trim().slice(0, 90) : null;
};
const day = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** the sessions as one fact per folder they ran in: the folder's name, how many, the last, three titles */
function sessionFacts(s, tool, list, where) {
  const by = new Map();
  for (const x of list) {
    const atHome = !x.cwd || resolve(x.cwd) === resolve(HOME);
    const key = atHome ? "~" : x.cwd;
    const g = by.get(key) ?? { cwd: key, n: 0, at: 0, titles: [] };
    g.n++; g.at = Math.max(g.at, x.at);
    if (x.title && !g.titles.includes(x.title) && g.titles.length < 3) g.titles.push(x.title);
    by.set(key, g);
  }
  const groups = [...by.values()].sort((a, b) => b.at - a.at);
  for (const g of groups.slice(0, 8)) {
    const name = g.cwd === "~" ? "your home folder" : basename(g.cwd);
    const path = g.cwd === "~" ? "~" : g.cwd.replace(HOME, "~");
    found(s, fact("sessions", name, `${tool}: ${g.n} session${g.n === 1 ? "" : "s"} in ${path}`, "session",
      { tool, n: g.n, titles: g.titles, path, at: new Date(g.at).toISOString(), when: `last ${day(g.at)}`, via: where }));
  }
  if (groups.length > 8) skip(s, `${groups.length - 8} more ${tool} folders, older`, "nothing");
}
const MAX_SESSIONS = 400;
function claudeSessions(s) {
  const root = join(HOME, ".claude", "projects");
  const dirs = ls(root);
  if (dirs === null) { skip(s, "Claude Code's sessions", "unreachable"); return; }
  const files = [];
  for (const d of dirs) if (d.isDirectory()) for (const e of ls(join(root, d.name)) ?? []) if (e.name.endsWith(".jsonl")) { const p = join(root, d.name, e.name), at = mtime(p); if (at >= SINCE) files.push({ p, at }); }
  if (!files.length) { if (dirs.length) skip(s, `Claude Code's sessions older than ${DAYS} days`, "nothing"); return; }
  files.sort((a, b) => b.at - a.at);
  const list = [];
  for (const f of files.slice(0, MAX_SESSIONS)) {
    const t = sessionText(f.p);
    const cwd = cwdOf(t);
    opening(s, `Claude Code · ${cwd ? basename(cwd) : "a session"}`);
    rows(s);
    list.push({ cwd, at: f.at, title: titleOf(t) });
  }
  if (files.length > MAX_SESSIONS) skip(s, `${files.length - MAX_SESSIONS} more Claude Code sessions, older`, "nothing");
  sessionFacts(s, "Claude Code", list, "~/.claude/projects");
}
function codexSessions(s) {
  const root = join(HOME, ".codex", "sessions");
  if (ls(root) === null) { skip(s, "Codex's sessions", "unreachable"); return; }
  // its titles: session_index.jsonl, { id, thread_name, updated_at } a line
  const names = new Map();
  for (const line of (read(join(HOME, ".codex", "session_index.jsonl")) ?? "").split("\n")) { const j = json(line); if (j?.id && j.thread_name) names.set(String(j.id), String(j.thread_name).replace(/\s+/g, " ").trim().slice(0, 90)); }
  const files = [];
  const walk = (d, depth) => { for (const e of ls(d) ?? []) { const p = join(d, e.name); if (e.isDirectory() && depth < 3) walk(p, depth + 1); else if (/^rollout-.*\.jsonl$/.test(e.name)) { const at = mtime(p); if (at >= SINCE) files.push({ p, at, id: e.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/)?.[1] }); } } };
  walk(root, 0);
  if (!files.length) return;
  files.sort((a, b) => b.at - a.at);
  const list = [];
  for (const f of files.slice(0, MAX_SESSIONS)) {
    // the first line is the session's own record (session_meta): its working folder is read from its first 64 KB
    let head = "";
    try { const fd = openSync(f.p, "r"); const b = Buffer.alloc(65536); const k = readSync(fd, b, 0, 65536, 0); closeSync(fd); head = b.toString("utf8", 0, k).split("\n")[0]; } catch { /* torn */ }
    const cwd = cwdOf(head);
    opening(s, `Codex · ${cwd ? basename(cwd) : "a session"}`);
    rows(s);
    list.push({ cwd, at: f.at, title: f.id ? names.get(f.id) ?? null : null });
  }
  if (files.length > MAX_SESSIONS) skip(s, `${files.length - MAX_SESSIONS} more Codex sessions, older`, "nothing");
  sessionFacts(s, "Codex", list, "~/.codex/sessions");
}

// the person's own AI setup (#1423, decided 2026-11-17 on #1342: onboarding reads, shows and imports all of it), with the
// named source "ai-setup": the rules files (CLAUDE.md, CLAUDE.local.md, AGENTS.md) line by line, the settings Claude Code
// and Codex run with (model, compaction, permission mode: values only, never an env value or a key), the hooks by event
// and command name, the allow and deny lists by count, the memory notes, skills and plugins by count and name, the MCP
// servers by name. Each with where it was read and whose it is: "you" for the person's own, "team" for a rules file
// checked into a repository someone else owns. Written as `out.setup`, beside the stops: it is not a fact of a folder,
// it is the other side of the onboarding's side-by-side (setup.ts). Never sent anywhere; Jev never sees it.
const RULE_LINES = 40, RULE_FILES = 12;
/** a rules file's lines worth showing: bullets, numbered items, table rows and plain sentences; never headings, code or blanks */
function ruleLines(text) {
  const out = []; let fence = false;
  text.split("\n").forEach((raw, i) => {
    const l = raw.trim();
    if (/^```/.test(l)) { fence = !fence; return; }
    if (fence || !l || /^#/.test(l) || /^\|?\s*[-:|\s]+\|?$/.test(l) || /^<!--/.test(l) || /^---$/.test(l)) return;
    const t = l.replace(/^[-*+]\s+|^\d+[.)]\s+/, "").replace(/^\|\s*|\s*\|$/g, "").replace(/\s*\|\s*/g, " → ").replace(/\*\*|`/g, "").trim();
    if (t.length < 8) return;
    out.push({ n: i + 1, text: t.length > 160 ? `${t.slice(0, 157)}…` : t });
  });
  return out;
}
// The person's git folders near home, shared by the side-by-side's rules files and the projects stop (#1425): four
// folders deep, so ~/src/github.com/<org>/<repo> and ~/<folder>/projects/<repo> are found. Never a folder that is not the
// person's own work: a dot folder, an app's or a store's (Library, Applications, media), a package manager's checkout
// (~/go/pkg, ~/.cargo, ~/.rustup, ~/.nvm, /opt), or a copy kept as it was: a "-backup", ".bak", "-old", "copy" or dated
// name next to the folder it copies ("gallery-old" beside "gallery"); alone, the name is the person's own (restic-backup).
// Read nearest first, and each folder under home with its own share of what is looked at, so one big folder cannot
// crowd the others out (#1530).
const REPO_DEPTH = 4, MAX_REPOS = 80, MAX_SEEN = 20000, MIN_SHARE = 500, MAX_WALK = 60000;
const NOT_WORK = /^(Library|Applications|node_modules|Pictures|Music|Movies)$/;
/** a tool's own install, by its path under home (or /opt) */
const INSTALL = /(^|\/)(\.[^/]*|Library|Applications|node_modules|go\/pkg)(\/|$)/;
/** what a copy adds to the name it copies: "app-backup", "app.bak", "app-old", "app copy", "app (copy)", "app-2026-11-02", "app_20261102" */
const COPY = /[-_. ](backup|bak|old)([-_. ]?\d[\d_-]*)?$|\s*(\(copy( \d+)?\)|[-_ ]copy( \d+)?)$|[-_.](19|20)\d\d-\d\d-\d\d([-_T.][\d-]*)?$|[-_.](19|20)\d{6}([-_T]?\d{4,6})?$/i;
/** the names a copy may have been made from, its suffixes taken off one by one ("gallery-old.bak": gallery-old, gallery) */
const copyOf = (name) => { const out = []; let n = name.replace(/^copy of\s+/i, "").trim(); if (n !== name && n) out.push(n); for (let b = n.replace(COPY, "").trim(); b && b !== n; n = b, b = n.replace(COPY, "").trim()) out.push(b); return out; };
/** the git folders, nearest first and fair across the folders under home; `on.seen` for each entry looked at, `on.repo` for each kept */
function gitFolders(on = {}) {
  const tops = (ls(HOME) ?? []).filter((e) => e.isDirectory() && !e.name.startsWith(".") && !NOT_WORK.test(e.name)).length || 1;
  const share = Math.max(MIN_SHARE, Math.floor(MAX_SEEN / tops));
  const seen = new Map(), found = [];
  let walked = 0;
  let level = [{ d: HOME, top: null }];
  for (let depth = 1; depth <= REPO_DEPTH && level.length; depth++) {
    const next = [];
    for (const { d, top } of level) {
      const all = ls(d) ?? [];
      const names = new Set(all.map((e) => e.name.toLowerCase()));
      for (const e of all) {
        const t = top ?? e.name;
        const n = seen.get(t) ?? 0;
        if (n >= share || walked++ >= MAX_WALK) break;
        seen.set(t, n + 1);
        if (!e.isDirectory() || e.name.startsWith(".") || NOT_WORK.test(e.name)) continue;
        if (copyOf(e.name).some((b) => names.has(b.toLowerCase()))) continue;
        const p = join(d, e.name);
        on.seen?.();
        if (INSTALL.test(p.slice(HOME.length)) || /^\/opt(\/|$)/.test(p)) continue;
        if (existsSync(join(p, ".git"))) found.push({ p, t });
        else next.push({ d: p, top: t });
      }
    }
    level = next;
  }
  // at most MAX_REPOS, taken in turn from each folder under home, nearest first within each
  const by = new Map();
  for (const f of found) by.set(f.t, [...(by.get(f.t) ?? []), f.p]);
  const out = [], lists = [...by.values()];
  for (let i = 0; out.length < MAX_REPOS && lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && out.length < MAX_REPOS) out.push(l[i]);
  for (const p of out) on.repo?.(p);
  return out;
}
/** the person's repositories, and their remote's owner */
function repos() {
  return gitFolders().map((p) => { const url = (read(join(p, ".git", "config")) ?? "").match(/url\s*=\s*(\S+)/)?.[1] ?? ""; return { p, owner: url.match(/[:/]([^/:]+)\/[^/]+?(\.git)?$/)?.[1] ?? null }; });
}
function readSetup(s) {
  const has = (p) => existsSync(join(HOME, p));
  const me = (read(join(HOME, ".config", "gh", "hosts.yml")) ?? "").match(/^\s*user:\s*(\S+)/m)?.[1] ?? null;
  const tilde = (p) => p.replace(HOME, "~");
  const setup = { files: [], settings: [], hooks: [], lists: [], kept: [], mcp: [] };
  const rules = (p, tool, owner) => {
    if (setup.files.length >= RULE_FILES) return;
    const t = read(p); if (t === null) return;
    opening(s, `your rules · ${tilde(p)}`); rows(s);
    const lines = ruleLines(t);
    if (lines.length) setup.files.push({ src: tilde(p), tool, owner, n: lines.length, lines: lines.slice(0, RULE_LINES) });
  };
  // the person's own rules, then each repository's
  rules(join(HOME, ".claude", "CLAUDE.md"), "Claude Code", "you");
  rules(join(HOME, ".codex", "AGENTS.md"), "Codex", "you");
  for (const r of repos()) {
    const team = !me || !r.owner || r.owner.toLowerCase() !== me.toLowerCase() ? "team" : "you";
    for (const [f, tool] of [["CLAUDE.md", "Claude Code"], [".claude/CLAUDE.md", "Claude Code"], ["AGENTS.md", "Codex"]]) rules(join(r.p, f), tool, r.owner ? team : "you");
    rules(join(r.p, "CLAUDE.local.md"), "Claude Code", "you");
  }
  // Claude Code's settings: the values that change how a session runs, never `env` (it can hold a key)
  for (const f of [join(HOME, ".claude", "settings.json"), join(HOME, ".claude", "settings.local.json")]) {
    const j = json(read(f)); if (!j || typeof j !== "object") continue;
    opening(s, `your settings · ${tilde(f)}`); rows(s);
    const src = tilde(f);
    for (const k of ["model", "autoCompactWindow", "effortLevel", "outputStyle", "alwaysThinkingEnabled"]) if (j[k] !== undefined && typeof j[k] !== "object") setup.settings.push({ k, v: String(j[k]), src, tool: "Claude Code", shared: true });
    if (typeof j.permissions?.defaultMode === "string") setup.settings.push({ k: "defaultMode", v: j.permissions.defaultMode, src, tool: "Claude Code", shared: true });
    for (const l of ["allow", "deny", "ask"]) if (Array.isArray(j.permissions?.[l]) && j.permissions[l].length) setup.lists.push({ k: l, n: j.permissions[l].length, src });
    for (const [ev, list] of Object.entries(j.hooks ?? {})) for (const h of Array.isArray(list) ? list : []) for (const c of Array.isArray(h?.hooks) ? h.hooks : []) {
      setup.hooks.push({ event: ev, on: h.matcher ? String(h.matcher) : null, what: hookWord(c?.command) ?? "a command", src });
    }
    const plugins = Object.keys(j.enabledPlugins ?? {}).filter((k) => j.enabledPlugins[k]);
    if (plugins.length) setup.kept.push({ k: "plugins", n: plugins.length, names: plugins.slice(0, 6).map((p) => p.split("@")[0]), src });
  }
  // Codex's settings, from config.toml's top lines (model, approval, sandbox)
  const toml = read(join(HOME, ".codex", "config.toml"));
  if (toml) for (const k of ["model", "approval_policy", "sandbox_mode", "model_reasoning_effort"]) { const v = toml.match(new RegExp(`^${k}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1]; if (v) setup.settings.push({ k, v, src: "~/.codex/config.toml", tool: "Codex", shared: true }); }
  // what the person's AI keeps: memory notes, skills (counts and names, never a note's text)
  const memDirs = (ls(join(HOME, ".claude", "projects")) ?? []).filter((d) => d.isDirectory()).map((d) => join(HOME, ".claude", "projects", d.name, "memory")).filter(isDir);
  const notes = memDirs.reduce((a, d) => a + (ls(d) ?? []).filter((e) => e.name.endsWith(".md") && e.name !== "MEMORY.md").length, 0);
  if (notes) setup.kept.push({ k: "memory", n: notes, src: "~/.claude/projects/*/memory" });
  const skills = (ls(join(HOME, ".claude", "skills")) ?? []).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);
  if (skills.length) setup.kept.push({ k: "skills", n: skills.length, names: skills.slice(0, 6), src: "~/.claude/skills" });
  // the MCP servers Claude Code and Codex start, by name
  const cj = json(read(join(HOME, ".claude.json")));
  for (const k of Object.keys(cj?.mcpServers ?? {})) setup.mcp.push({ name: k, src: "~/.claude.json", tool: "Claude Code" });
  // a server's own table and its sub-tables ([mcp_servers.x.env]) name one server
  for (const n of new Set([...(toml ?? "").matchAll(/^\[mcp_servers\.([^\].]+)/gm)].map((m) => m[1]))) setup.mcp.push({ name: n, src: "~/.codex/config.toml", tool: "Codex" });
  const any = setup.files.length + setup.settings.length + setup.hooks.length + setup.lists.length + setup.kept.length + setup.mcp.length;
  if (any) out.setup = setup;
  return any;
}

await stop("ai", "your AI tools", (s) => {
  const has = (p) => existsSync(join(HOME, p));
  opening(s, "the AI tools on this computer");
  if (has(".claude") || has(".claude.json")) found(s, fact("ai", "Claude", "~/.claude", "ai", { signed: has(".claude/.credentials.json") || has(".claude.json") }));
  if (has(".codex/auth.json")) found(s, fact("ai", "Codex", "~/.codex", "ai", { signed: true }));
  else if (has(".codex")) found(s, fact("ai", "Codex", "~/.codex", "ai", { signed: false, sure: false, ask: "Codex is installed but not signed in" }));
  if (has(".gemini")) found(s, fact("ai", "Gemini", "~/.gemini", "ai", { signed: has(".gemini/oauth_creds.json") }));
  if (has(".cursor")) { found(s, fact("ai", "Cursor", "~/.cursor", "ai", { signed: true })); skip(s, "Cursor's chats (kept in a database Sol does not open yet)", "unreachable"); }
  // ChatGPT keeps its history in OpenAI's cloud: named, never "none", and how it comes in (#1217, X3)
  const gpt = [join(HOME, "Applications", "ChatGPT.app"), ...(OWN ? ["/Applications/ChatGPT.app"] : []), join(HOME, "Library", "Application Support", "com.openai.chat")].find((p) => existsSync(p));
  if (gpt) { found(s, fact("ai", "ChatGPT", gpt.replace(HOME, "~"), "ai", { sure: false, reach: "export", ask: "Sol can't read ChatGPT from here; its history comes in once, with ChatGPT's export" })); skip(s, "ChatGPT's history (in OpenAI's cloud; it comes in with its export)", "unreachable"); }
  const tools = s.facts.map((f) => f.v);
  // their own setup (#1423), with their consent by name; "none" stays "none": a setup without a signed-in tool is still read
  const setupN = (has(".claude") || has(".claude.json") || has(".codex")) ? (allowed("ai-setup") ? readSetup(s) : (skip(s, "your AI setup (rules, settings, hooks)", "denied"), 0)) : 0;
  // the session files, each only with the person's consent by name
  const sessions = [["claude-sessions", ".claude/projects", "Claude Code's sessions", claudeSessions], ["codex-sessions", ".codex/sessions", "Codex's sessions", codexSessions]];
  for (const [id, dir, name, fn] of sessions) {
    if (!has(dir)) continue;
    if (!allowed(id)) { skip(s, name, "denied"); continue; }
    fn(s);
  }
  const worked = s.facts.filter((f) => f.kind === "session");
  const n = worked.reduce((a, f) => a + (f.n ?? 0), 0);
  return tools.length ? `${tools.join(", ")}${setupN ? ` · your setup: ${setupN} things` : ""}${n ? ` · ${n} sessions in ${worked.length} folders` : ""}` : "none signed in yet";
});

// ── 3 what is connected, and through what (`via`, kept in the record so Home's tools use the same way later): the
// services connected in the person's Claude account (as the engine lists them, --connected), Claude Code's and Codex's
// own MCP servers, gh and gog signed in on this Mac; through gh and gog (on the person's own machine only) the names of
// their repositories and Drive files. Mail is never read here
await stop("tools", "what they're connected to", (s) => {
  const seen = new Set();
  const plug = (name, src, via, more = {}) => { const k = `${name.toLowerCase()}|${via}`; if (seen.has(k)) return; seen.add(k); found(s, fact("connector", name, src, "tool", { via, ...more })); };
  const connected = arg("connected", "");
  const acct = connected ? json(read(connected)) : null;
  if (Array.isArray(acct)) {
    opening(s, "your Claude account's connectors");
    for (const c of acct) {
      if (!c?.name) continue;
      rows(s);
      // the same states and the same "not here" as Settings › home's list (onboard/connections.ts, #1229)
      if (SAID[`account:${c.name}`] === "no") skip(s, `${c.name} (not here, by your rule)`, "denied");
      else if (c.status && c.status !== "connected") skip(s, `${c.name} (${c.state === "blocked" ? "blocked by your organisation" : c.state ?? c.status})`, "unreachable");
      else plug(String(c.name), "your Claude account", "claude account");
    }
  }
  opening(s, "Claude Code's settings");
  try { for (const k of Object.keys(json(read(join(HOME, ".claude.json")))?.mcpServers ?? {})) plug(k, "Claude's connectors", "claude code"); } catch { /* torn */ }
  opening(s, "Codex's settings");
  const ct = read(join(HOME, ".codex", "config.toml")) ?? "";
  for (const m of ct.matchAll(/^\[mcp_servers\.([^\].]+)/gm)) if (!s.facts.some((f) => f.v === m[1])) plug(m[1], "Codex's connectors", "codex");
  const gh = read(join(HOME, ".config", "gh", "hosts.yml"));
  const ghUser = gh?.match(/^\s+user:\s*(\S+)/m)?.[1];
  if (gh) plug("GitHub", ghUser ? `gh, signed in as ${ghUser}` : "gh", "gh", { who: ghUser });
  const gogDir = [join(HOME, ".config", "gogcli"), join(HOME, "Library", "Application Support", "gogcli")].find(isDir);
  const gog = !!(gogDir || (OWN && onPath("gog")));
  if (gog) plug("Google", "gog: Gmail, Drive, Calendar", "gog");
  // through the tools signed in here: names only, the person's own machine only (a seeded home never reaches a real account)
  const through = [["github", "gh", "GitHub", !!gh, "project"], ["gdrive", "gog", "Google Drive", gog, "file"]];
  for (const [id, via, name, there, kind] of through) {
    if (!there || !OWN || !readStore) continue;
    if (!allowed(id)) { skip(s, `${name}, through ${via}`, "denied"); continue; }
    opening(s, `${name}, through ${via}`);
    const r = store(id, { max: 8 });
    if (!r?.ok) { skip(s, `${name}: ${r?.need?.line ?? "could not read"}`, "unreachable"); continue; }
    for (const g of r.groups) for (const it of g.items.slice(0, 8)) { rows(s); found(s, fact(kind, it.title, `${name}, through ${via}`, kind, { via, ...(it.at ? { at: it.at } : {}) })); }
  }
  const plugs = s.facts.filter((f) => f.kind === "tool").length;
  return plugs ? `${plugs} connections` : "nothing connected yet";
});

// ── 4 the calendar: the calendar store (Sol's copy first, --from) and .ics files (Calendar's old folder, Downloads,
// Documents), each event named with the calendar or file it came from and how many times it was seen; the recurring first
await stop("calendar", "your calendar", (s) => {
  const events = new Map();
  const add = (name, src, more) => { const key = name.toLowerCase(); if (!events.has(key)) events.set(key, { name, src, n: 0, ...more }); events.get(key).n++; rows(s); };
  let closed = false;   // Calendar's own store or folder closed: the rest (Downloads, Documents) is still read
  if (allowed("calendar-store")) {
    opening(s, "Calendar's store");
    const r = store("calendar");
    if (r?.ok) { for (const g of r.groups) { opening(s, `Calendar · ${g.name}`); for (const it of g.items) add(it.title, `Calendar: ${g.name}`, { start: it.at ? it.at.replace(/[-:]/g, "").slice(0, 13) : undefined }); } }
    else if (r?.need?.kind === "switch") { closed = true; skip(s, "Calendar's store (Sol needs Full Disk Access)", "unreachable"); }
  } else skip(s, "Calendar's store", "denied");
  const roots = [join(HOME, "Library", "Calendars"), join(HOME, "Downloads"), join(HOME, "Documents")];
  const files = [];
  const walk = (d, depth) => { const es = ls(d); if (es === null) { if (d === roots[0]) { closed = true; skip(s, "Calendar's own folder", "unreachable"); } return; } for (const e of es) { const p = join(d, e.name); if (e.isDirectory() && depth < 4 && !e.name.startsWith(".")) walk(p, depth + 1); else if (e.name.endsWith(".ics")) files.push(p); } };
  roots.forEach((r) => walk(r, 0));
  for (const f of files) {
    opening(s, basename(f));
    const t = read(f) ?? "";
    const from = f.startsWith(roots[0]) ? basename(f) : `${basename(f)}, in ${dirname(f).replace(HOME + "/", "").split("/")[0]}`;
    for (const ev of t.split("BEGIN:VEVENT").slice(1)) {
      const g = (k) => ev.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1]?.trim();
      const name = g("SUMMARY"); if (!name) continue;
      add(name, `your calendar: ${from}`, { start: g("DTSTART"), rule: g("RRULE"), where: g("LOCATION") });
    }
  }
  const when = (st, rule) => {
    const m = st?.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/); if (!m) return "";
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    const days = rule?.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(",").map((x) => ({ MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" })[x]).join("/");
    const hm = m[4] ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase() : "";
    return rule ? `${days ?? "weekly"} ${hm}`.trim() : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${hm ? " " + hm : ""}`;
  };
  // only what is still on: an old term's calendar left in Downloads names classes that ended (UNTIL), and a date long past
  // is not part of the person's life now. A repeat counts until its UNTIL (or its COUNT of weeks) runs out, a date from two
  // weeks ago to four months ahead; an event with no start (some stores) is kept
  const dayOf = (st) => { const m = st?.match(/^(\d{4})(\d{2})(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const on = (e) => {
    const st = dayOf(e.start), back = NOW - 14 * 864e5;
    if (e.rule) {
      const until = dayOf(e.rule.match(/UNTIL=(\d{8})/)?.[1]), count = Number(e.rule.match(/COUNT=(\d+)/)?.[1] ?? 0);
      if (until !== null) return until >= back;
      if (count && st !== null) return st + count * 7 * 864e5 >= back;
      return st === null || st <= NOW + 120 * 864e5;
    }
    return st === null || (st >= back && st <= NOW + 120 * 864e5);
  };
  const over = [...events.values()].filter((e) => !on(e)).length;
  if (over) skip(s, `${over} events already over (an old calendar or term)`, "nothing");
  const all = [...events.values()].filter(on).sort((a, b) => (b.rule ? 1 : 0) - (a.rule ? 1 : 0) || b.n - a.n);
  for (const e of all.slice(0, 16))
    found(s, fact(e.rule ? "repeats" : "date", e.name, `${e.src}${e.where ? ", " + e.where : ""}`, "event", { when: when(e.start, e.rule), repeats: !!e.rule, at: e.start, n: e.n }));
  if (all.length > 16) skip(s, `${all.length - 16} more events, seen less often`, "nothing");
  if (!s.facts.length && closed) return "refused";
  const shown = all.length > 16 ? ` · 16 of ${all.length}` : "";
  return s.facts.length ? `${s.facts.filter((f) => f.repeats).length} that repeat · ${s.facts.filter((f) => !f.repeats).length} dates${shown}${closed ? " · Calendar's own folder closed" : ""}` : "no calendar here";
});

// ── 5 files by name: Documents, Downloads, Desktop, two deep, the last DAYS days first; never opened. Then Notes' titles
// (its store, Sol's copy first). A folder the person put off-limits is left unread, named
await stop("files", "your files, by name", (s) => {
  const got = [];
  const offOf = (p) => OFF.find((o) => p.toLowerCase().split("/").some((seg) => seg === o || seg.startsWith(`${o} `)));
  for (const top of ["Documents", "Downloads", "Desktop"]) {
    const walk = (d, depth) => {
      opening(s, d.replace(HOME + "/", ""));
      const es = ls(d);
      if (es === null) { got.refused = top; skip(s, top, "unreachable"); return; }
      for (const e of es) {
        if (e.name.startsWith(".")) continue;
        const p = join(d, e.name);
        if (offOf(p.replace(HOME, ""))) { skip(s, p.replace(HOME, "~"), "denied"); continue; }
        rows(s);
        if (e.isDirectory()) { if (existsSync(join(p, ".git"))) continue; if (depth < 2) { got.push({ p, dir: true, top, at: mtime(p) }); walk(p, depth + 1); } } else got.push({ p, top, at: mtime(p) });
      }
    };
    walk(join(HOME, top), 0);
  }
  const kindOf = (name) => /syllab|course|lecture|midterm|exam|homework|hw\d|problem set/i.test(name) ? "class" : /invoice|contract|brief|proposal|sow|quote|client/i.test(name) ? "client" : /resume|cv\b|cover letter|offer/i.test(name) ? "job" : /plan|training|race|marathon|run/i.test(name) ? "life" : null;
  // a file nobody touched in six months does not name a part of the person's life now
  const stale = got.filter((g) => g.at < NOW - 183 * 864e5).length;
  if (stale) skip(s, `${stale} files and folders untouched for six months`, "nothing");
  for (const g of got.filter((x) => x.at >= NOW - 183 * 864e5).sort((a, b) => b.at - a.at)) {
    const name = basename(g.p, extname(g.p));
    const k = kindOf(g.p.replace(HOME, ""));
    if (!k && !g.dir) continue;
    if (g.dir && g.p.split("/").length - HOME.split("/").length > 2 && !k) continue;
    found(s, fact(g.dir ? "folder" : "file", name, `${g.top}${g.p.replace(join(HOME, g.top), "").replace(basename(g.p), "").replace(/\/$/, "") || ""}`, "file", { hint: k, at: new Date(g.at).toISOString(), path: g.p.replace(HOME, "~") }));
    if (s.facts.length >= 24) break;
  }
  // Notes: folder names and note titles, never a note's body
  if (allowed("notes")) {
    opening(s, "Notes");
    const r = store("notes");
    if (r?.ok) { let k = 0; for (const g of r.groups) for (const it of g.items) { rows(s); if (k++ >= 8) continue; found(s, fact("note", it.title, `Notes: ${g.name}`, "file", { hint: kindOf(it.title), ...(it.at ? { at: it.at } : {}) })); } }
    else if (r?.need?.kind === "switch") skip(s, "Notes (Sol needs Full Disk Access)", "unreachable");
  } else skip(s, "Notes", "denied");
  if (got.refused && !s.facts.length) return "refused";
  const notes = s.facts.filter((f) => f.k === "note").length;
  return s.facts.length ? `${s.facts.filter((f) => f.k === "file").length} files · ${s.facts.filter((f) => f.k === "folder").length} folders${notes ? ` · ${notes} notes` : ""}` : "nothing that names a part of your life";
});

// ── 6 projects: git folders near home, their remote's owner (a team), the last touch
await stop("projects", "your projects", (s) => {
  const fnd = gitFolders({ seen: () => rows(s), repo: (p) => opening(s, p.replace(HOME, "~")) });
  for (const p of fnd.sort((a, b) => mtime(join(b, ".git")) - mtime(join(a, ".git"))).slice(0, 8)) {
    const cfg = read(join(p, ".git", "config")) ?? "";
    const url = cfg.match(/url\s*=\s*(\S+)/)?.[1] ?? "";
    const owner = url.match(/github\.com[:/]([^/]+)\//)?.[1];
    found(s, fact("project", basename(p), p.replace(HOME, "~"), "project", { owner, at: new Date(mtime(join(p, ".git"))).toISOString() }));
  }
  if (fnd.length > 8) skip(s, `${fnd.length - 8} more projects, touched less lately`, "nothing");
  return s.facts.length ? `${s.facts.length} projects` : "no projects here";
});

// ── 7 the browser: page titles grouped by site, from history (a copy, never the live file; Safari's from Sol's copy),
// the last DAYS days. A site that holds messages or money keeps no titles: named as left unread
await stop("browser", "your browser, by page title", async (s) => {
  let sqlite; try { sqlite = await import("node:sqlite"); } catch { return "this node cannot read the browser's history"; }
  // Chrome's time: microseconds since 1601; Safari's: seconds since 2001
  const chrome = (since) => ["SELECT u.url AS url, u.title AS title, COUNT(v.id) AS n FROM urls u JOIN visits v ON v.url = u.id WHERE v.visit_time > ? GROUP BY u.id", (since / 1000 + 11644473600) * 1e6];
  const safari = (since) => ["SELECT i.url AS url, MAX(v.title) AS title, COUNT(v.id) AS n FROM history_visits v JOIN history_items i ON v.history_item = i.id WHERE v.visit_time > ? GROUP BY i.id", since / 1000 - 978307200];
  const safariAt = [FROM && join(FROM, "Library", "Safari", "History.db"), join(HOME, "Library", "Safari", "History.db")].find((p) => p && existsSync(p));
  const sources = [
    ["Chrome", join(HOME, "Library", "Application Support", "Google", "Chrome", "Default", "History"), chrome],
    ["Arc", join(HOME, "Library", "Application Support", "Arc", "User Data", "Default", "History"), chrome],
    ["Brave", join(HOME, "Library", "Application Support", "BraveSoftware", "Brave-Browser", "Default", "History"), chrome],
    ["Chrome", join(HOME, ".config", "google-chrome", "Default", "History"), chrome],
    ...(safariAt ? [["Safari", safariAt, safari]] : []),
  ];
  const sites = new Map();
  let refused = 0, any = 0;
  for (const [br, f, q] of sources) {
    if (!existsSync(f)) continue;
    any++;
    opening(s, `${br}'s history`);
    const tmp = mkdtempSync(join(tmpdir(), "sol-explore-"));
    try {
      copyFileSync(f, join(tmp, "h"));
      for (const x of ["-wal", "-shm"]) if (existsSync(f + x)) copyFileSync(f + x, join(tmp, "h" + x));
      const db = new sqlite.DatabaseSync(join(tmp, "h"), { readOnly: true });
      const [sql, since] = q(SINCE);
      const got = db.prepare(sql).all(since);
      db.close();
      for (const r of got) {
        let host; try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { continue; }
        rows(s);
        const x = sites.get(host) ?? { host, n: 0, titles: new Map(), br };
        x.n += Number(r.n); if (r.title) x.titles.set(r.title, (x.titles.get(r.title) ?? 0) + Number(r.n));
        sites.set(host, x);
      }
    } catch { refused++; skip(s, `${br}'s history`, "unreachable"); } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  if (any && refused === any) return "refused";
  const skipHost = /^(google\.com|accounts\.google\.com|localhost|127\.0\.0\.1|newtab|t\.co)$/;
  for (const x of [...sites.values()].filter((x) => !skipHost.test(x.host)).sort((a, b) => b.n - a.n).slice(0, 12)) {
    // a site that holds messages or money keeps no titles at all (they are subjects, names, addresses): the host and a count
    const holds = HOLDS.test(x.host);
    if (holds && x.titles.size) skip(s, `page titles on ${x.host} (they hold messages or money)`, "denied");
    const top = holds ? [] : [...x.titles].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3);
    found(s, fact("site", x.host, `${x.br} history, ${x.n} visits in ${DAYS} days`, "place", { titles: top, visits: x.n, n: x.n }));
  }
  return s.facts.length ? `${s.facts.length} sites you return to` : any ? "nothing in the last month" : "no browser history I can read";
});

out.done = new Date().toISOString();
flush();
console.log(`explore: ${out.stops.map((s) => `${s.id}=${s.state}(${s.facts.length})`).join(" ")} → ${OUT}`);

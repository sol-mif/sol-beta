#!/usr/bin/env node
// The store reader (#1071, pass 5): reads one app's own store on this Mac, READ-ONLY, for Home's tour: names and
// dates only (README.md beside it). Notes: folder names, note titles, when each was changed (never a note's body).
// Calendar: calendar names, event titles and start dates from 14 days back to --days ahead. WhatsApp and Messages:
// the names of the chats and when each was last active (never what was said), and only with --chats names.
// WeChat: its store is locked, so it is never opened. Linux and Windows: no reader, every store is "missing".
// The ways already signed in on this Mac (the tour's first rung, ../ways.ts): gmail, gdrive (Google, through the person's
// own `gog`), github (their own `gh`): subjects, file and repository names, issue titles and dates, listed only; a
// lapsed sign-in is "once" with the one command that signs in again. history: the titles of the pages of --hosts in this
// Mac's browsers (Chrome, Brave, Edge, Arc, Chromium, and Safari from Sol's copy). Only gmail, gdrive and github open
// the network, through those tools; nothing is sent, changed or signed in by the reader.
// It writes --out and nothing else, besides a temp dir it deletes.
// Usage: node read.mjs --store notes|calendar|whatsapp|messages|wechat|gmail|gdrive|github|history --out <file>
//                      [--from <dir>] [--home <dir>] [--chats names] [--days 60] [--hosts a.com,b.org] [--bin <dir>]
//        node read.mjs --check notes,gmail,... --out <file> [the same options]: which ways work now, nothing read (Home's
//        first read, onboarding/waysPick.ts): a store is there, closed or waiting on the chat yes; a tool's sign-in
//        answers one call of one item; the browsers keep a history. { v: 1, store: "check", ok: true, groups: [],
//        checks: { [way]: { ok, need? } } }
// --from: a folder Sol.app filled with copies of the closed stores (src-tauri/src/places.rs, places_copy([store])), at
// their paths under the home. Each store is looked for there first, then in the home. The folder is only read.
// --bin: the one folder the signed-in tools are looked for in (tests); without it, PATH and the usual install folders.
// The shape:
//   { v: 1, store, ok, source?, groups: [{ name, kind: "folder"|"calendar"|"chat", items: [{ title, at? }] }],
//     need?: { kind: "switch"|"encrypted"|"format"|"missing"|"ask"|"once", line, run? }, note? }
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DAY = 86400;
/** Apple's clock starts 2001-01-01 */
const APPLE = 978307200;
const STORES = ["notes", "calendar", "whatsapp", "messages", "wechat", "gmail", "gdrive", "github", "history"];
/** the AI tools' session files (#1217's named sources), only ever checked here (--check): is the folder there. The
 *  explorer reads their names, titles and dates itself; Settings › home (#1229) asks whether each is there */
const SESSIONS = { "claude-sessions": ".claude/projects", "codex-sessions": ".codex/sessions" };
const NAME = { notes: "Notes", calendar: "Calendar", whatsapp: "WhatsApp", messages: "Messages", wechat: "WeChat",
  gmail: "Gmail", gdrive: "Google Drive", github: "GitHub", history: "your browser" };
/** the most items one store gives the tour; the newest first */
const CAP = 400;

const ASK = "I can read the names of your chats and when each was last active, never what was said.";
const LINE = {
  switch: () => "Sol needs a switch",
  encrypted: () => "WeChat keeps its messages locked; a file from it works",
  format: (s) => `I could not read ${NAME[s]}${NAME[s].endsWith("s") ? "'" : "'s"} store on this Mac`,
  missing: (s) => `${NAME[s]} is not on this Mac`,
  ask: () => ASK,
  once: (s) => `sign in to ${s === "github" ? "GitHub" : "Google"} once`,
};

/** where each store lives, relative to the home, in the order they are tried */
export const PATHS = {
  notes: ["Library/Group Containers/group.com.apple.notes/NoteStore.sqlite"],
  calendar: ["Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb", "Library/Calendars/Calendar.sqlitedb"],
  whatsapp: ["Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"],
  messages: ["Library/Messages/chat.db"],
};
const WA_CONTACTS = "Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ContactsV2.sqlite";

function args(argv) {
  // SOL_READ_HOME, SOL_READ_BIN: a made-up Mac home and made-up tools for a walk on a real engine (the engine's shell
  // runs this); --home and --bin win
  const a = { store: null, out: null, from: null, home: process.env.SOL_READ_HOME || os.homedir(), chats: null, days: 60, hosts: [], bin: process.env.SOL_READ_BIN || null, check: null, max: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--store") a.store = v, i++;
    else if (k === "--out") a.out = v, i++;
    else if (k === "--from") a.from = v, i++;
    else if (k === "--home") a.home = v, i++;
    else if (k === "--chats") a.chats = v, i++;
    else if (k === "--days") a.days = Math.max(1, Number(v) || 60), i++;
    else if (k === "--hosts") a.hosts = String(v ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean), i++;
    else if (k === "--bin") a.bin = v, i++;
    else if (k === "--check") a.check = String(v ?? "").split(",").filter((x) => STORES.includes(x) || x in SESSIONS), i++;
  }
  if (a.check) { a.store = "check"; a.max = 1; }
  if (!a.out || (!a.check && !STORES.includes(a.store))) {
    console.error(`usage: node read.mjs --store ${STORES.join("|")} --out <file> [--from <dir>] [--home <dir>] [--chats names] [--days 60] [--hosts a.com,b.org] [--bin <dir>]`);
    process.exit(2);
  }
  return a;
}

// ---------- files ----------
const denied = (e) => !!e && (e.code === "EPERM" || e.code === "EACCES");
/** true, false, or "denied" (macOS keeps it closed to this process) */
function there(p) {
  try { fs.statSync(p); return true; } catch (e) { return denied(e) ? "denied" : false; }
}
/** the first copy of a store: Sol's (--from) before the home's, for each path in order */
function locate(rels, home, from) {
  let shut = false;
  for (const rel of rels) {
    for (const base of from ? [from, home] : [home]) {
      const t = there(path.join(base, rel));
      if (t === true) return { file: path.join(base, rel), rel };
      if (t === "denied") shut = true;
    }
  }
  return shut ? "denied" : null;
}

// ---------- sqlite, always on a copy, opened read-only ----------
let sqliteMod;
try { sqliteMod = await import("node:sqlite"); } catch { sqliteMod = null; }

class Format extends Error {}

/** a store copied with its -wal and -shm into tmp, opened read-only; one function to ask it questions */
function open(tmp, file) {
  const dir = fs.mkdtempSync(path.join(tmp, "db-"));
  const copy = path.join(dir, path.basename(file));
  fs.copyFileSync(file, copy);
  for (const side of ["-wal", "-shm"]) {
    try { fs.copyFileSync(file + side, copy + side); } catch (e) { if (denied(e)) throw e; }
  }
  if (sqliteMod) {
    let db;
    try { db = new sqliteMod.DatabaseSync(copy, { readOnly: true }); db.prepare("SELECT count(*) FROM sqlite_master").get(); }
    catch (e) { try { db?.close(); } catch { /* */ } throw new Format(`not a store sqlite can open (${String(e.message).split("\n")[0]})`); }
    return {
      all: (sql) => { try { return db.prepare(sql).all(); } catch (e) { throw new Format(String(e.message).split("\n")[0]); } },
      close: () => db.close(),
    };
  }
  return {
    all: (sql) => {
      try {
        const out = execFileSync("sqlite3", ["-readonly", "-json", copy, sql], { encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] });
        return out.trim() ? JSON.parse(out) : [];
      } catch (e) { throw new Format(String(e.stderr || e.message).split("\n")[0]); }
    },
    close: () => {},
  };
}

/** a table's columns; a missing table is a format the reader does not know */
function columns(db, table) {
  const cols = db.all(`PRAGMA table_info("${table}")`).map((r) => r.name);
  if (!cols.length) throw new Format(`no ${table} table`);
  return new Set(cols);
}
function need(cols, table, ...names) {
  for (const n of names) if (!cols.has(n)) throw new Format(`${table} has no ${n} column`);
}
/** the first of these columns the table has */
function pick(cols, table, ...names) {
  const n = names.find((x) => cols.has(x));
  if (!n) throw new Format(`${table} has none of ${names.join(", ")}`);
  return n;
}

/** an Apple date (seconds since 2001, or nanoseconds in chat.db) as an ISO string; nothing for none */
export function appleDate(v) {
  let n = Number(v);
  if (!n || !Number.isFinite(n)) return undefined;
  if (Math.abs(n) > 1e14) n = n / 1e9;   // nanoseconds (chat.db, macOS 10.13 and later)
  const t = (n + APPLE) * 1000;
  if (t > Date.now() + 50 * 365 * 864e5) return undefined;   // "distant future": WhatsApp's mark on a pinned chat, not a date
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
const secs = (iso) => (iso ? Date.parse(iso) / 1000 : 0);
const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f￼]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
const newest = (a, b) => secs(b.at) - secs(a.at);

// ---------- the readers ----------

/** Notes (NoteStore.sqlite): ICFolder and ICNote rows of ZICCLOUDSYNCINGOBJECT, told apart by Z_ENT through Z_PRIMARYKEY.
 * Read: folder titles, note titles, the folder each note is in, when it changed. Never ZNOTEDATA, ZSNIPPET or the body. */
function readNotes(db) {
  const ents = new Map(db.all("SELECT Z_ENT AS ent, Z_NAME AS name FROM Z_PRIMARYKEY").map((r) => [r.name, Number(r.ent)]));
  const NOTE = ents.get("ICNote"), FOLDER = ents.get("ICFolder");
  if (NOTE == null || FOLDER == null) throw new Format("no ICNote or ICFolder entity");
  const T = "ZICCLOUDSYNCINGOBJECT";
  const c = columns(db, T);
  need(c, T, "Z_PK", "Z_ENT", "ZFOLDER");
  const noteTitle = pick(c, T, "ZTITLE1", "ZTITLE");
  const folderTitle = pick(c, T, "ZTITLE2", "ZTITLE");
  const changed = pick(c, T, "ZMODIFICATIONDATE1", "ZMODIFICATIONDATE");
  const gone = c.has("ZMARKEDFORDELETION") ? "AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION = 0)" : "";
  const trash = c.has("ZFOLDERTYPE") ? "AND (ZFOLDERTYPE IS NULL OR ZFOLDERTYPE <> 1)" : "";
  const folders = db.all(`SELECT Z_PK AS id, ${folderTitle} AS name FROM ${T} WHERE Z_ENT = ${FOLDER} ${gone} ${trash}`);
  const notes = db.all(`SELECT ZFOLDER AS folder, ${noteTitle} AS title, ${changed} AS at FROM ${T} WHERE Z_ENT = ${NOTE} ${gone}`);
  const by = new Map(folders.map((f) => [Number(f.id), { name: clean(f.name) || "Notes", kind: "folder", items: [] }]));
  for (const n of notes) {
    const g = by.get(Number(n.folder));
    if (!g) continue;   // in the trash, or a folder not kept
    const title = clean(n.title);
    if (!title) continue;
    g.items.push({ title, ...(appleDate(n.at) ? { at: appleDate(n.at) } : {}) });
  }
  return [...by.values()];
}

/** Calendar (Calendar.sqlitedb): Calendar titles, and CalendarItem summaries and start dates from 14 days back to
 * `days` ahead. Never notes, places, attendees or URLs. */
function readCalendar(db, days) {
  const cc = columns(db, "Calendar");
  need(cc, "Calendar", "ROWID", "title");
  const ic = columns(db, "CalendarItem");
  need(ic, "CalendarItem", "summary", "start_date", "calendar_id");
  const now = Math.floor(Date.now() / 1000) - APPLE;
  const hidden = ic.has("hidden") ? "AND (hidden IS NULL OR hidden = 0)" : "";
  const cals = db.all(`SELECT ROWID AS id, title AS name FROM Calendar`);
  const items = db.all(`SELECT calendar_id AS cal, summary AS title, start_date AS at FROM CalendarItem
    WHERE start_date >= ${now - 14 * DAY} AND start_date <= ${now + days * DAY} ${hidden} ORDER BY start_date`);
  const by = new Map(cals.map((c) => [Number(c.id), { name: clean(c.name) || "Calendar", kind: "calendar", items: [] }]));
  for (const e of items) {
    const g = by.get(Number(e.cal));
    const title = clean(e.title);
    if (!g || !title) continue;
    g.items.push({ title, ...(appleDate(e.at) ? { at: appleDate(e.at) } : {}) });
  }
  // a calendar with nothing in the window still names a part of the person's life
  return [...by.values()].filter((g) => g.name);
}

/** WhatsApp desktop (ChatStorage.sqlite): ZWACHATSESSION's ZPARTNERNAME (the contact's or the group's name) and
 * ZLASTMESSAGEDATE. A chat with no name takes the name from ContactsV2.sqlite when it was copied too. Never ZWAMESSAGE. */
function readWhatsApp(db, contacts) {
  const T = "ZWACHATSESSION";
  const c = columns(db, T);
  need(c, T, "ZPARTNERNAME", "ZLASTMESSAGEDATE");
  const jid = c.has("ZCONTACTJID") ? "ZCONTACTJID" : "NULL";
  const removed = c.has("ZREMOVED") ? "AND (ZREMOVED IS NULL OR ZREMOVED = 0)" : "";
  const hidden = c.has("ZHIDDEN") ? "AND (ZHIDDEN IS NULL OR ZHIDDEN = 0)" : "";
  const rows = db.all(`SELECT ZPARTNERNAME AS name, ${jid} AS jid, ZLASTMESSAGEDATE AS at FROM ${T} WHERE 1 = 1 ${removed} ${hidden}`);
  const items = [];
  for (const r of rows) {
    const j = String(r.jid || "");
    if (/status@broadcast$/.test(j) || /@newsletter$/.test(j)) continue;   // the status feed and channels are not chats
    const title = clean(r.name) || clean(contacts?.get(j));
    if (!title) continue;   // a chat with no name: its number is not a name
    items.push({ title, ...(appleDate(r.at) ? { at: appleDate(r.at) } : {}) });
  }
  return [{ name: "WhatsApp", kind: "chat", items: items.sort(newest) }];
}

/** WhatsApp's ContactsV2.sqlite: the address book names by WhatsApp id; empty when its shape is another */
function waContacts(tmp, file) {
  const out = new Map();
  try {
    const db = open(tmp, file);
    try {
      const T = "ZWAADDRESSBOOKCONTACT";
      const c = columns(db, T);
      const name = pick(c, T, "ZFULLNAME", "ZGIVENNAME");
      const id = pick(c, T, "ZWHATSAPPID", "ZLID");
      for (const r of db.all(`SELECT ${id} AS id, ${name} AS name FROM ${T}`)) if (r.id && r.name) out.set(String(r.id), r.name);
    } finally { db.close(); }
  } catch { /* names from the chats alone */ }
  return out;
}

/** Messages (chat.db): each chat's display_name, or its chat_identifier (the handle) when it has none, and the date of
 * its last message through chat_message_join. Never message.text or attributedBody. */
function readMessages(db) {
  const c = columns(db, "chat");
  need(c, "chat", "ROWID", "chat_identifier", "display_name");
  const j = columns(db, "chat_message_join");
  need(j, "chat_message_join", "chat_id", "message_id");
  const m = columns(db, "message");
  need(m, "message", "ROWID", "date");
  // nanoseconds pass 2^53: read as REAL (a second either way is all the tour needs)
  const last = j.has("message_date") ? "CAST(MAX(j.message_date) AS REAL)" : "CAST(MAX(m.date) AS REAL)";
  const join = j.has("message_date") ? "" : "JOIN message m ON m.ROWID = j.message_id";
  const rows = db.all(`SELECT c.display_name AS name, c.chat_identifier AS handle, ${last} AS at
    FROM chat c LEFT JOIN chat_message_join j ON j.chat_id = c.ROWID ${join} GROUP BY c.ROWID`);
  const items = [];
  for (const r of rows) {
    const title = clean(r.name) || clean(r.handle);
    if (!title) continue;
    items.push({ title, ...(appleDate(r.at) ? { at: appleDate(r.at) } : {}) });
  }
  return [{ name: "Messages", kind: "chat", items: items.sort(newest) }];
}

/** WeChat keeps its store encrypted: it is only looked for, never opened */
function wechatThere(home, from) {
  let shut = false;
  for (const base of from ? [from, home] : [home]) {
    const t = there(path.join(base, "Library/Containers/com.tencent.xinWeChat"));
    if (t === true) return true;
    if (t === "denied") shut = true;
    const gc = path.join(base, "Library/Group Containers");
    try { if (fs.readdirSync(gc).some((d) => d.endsWith(".com.tencent.xinWeChat"))) return true; }
    catch (e) { if (denied(e)) shut = true; }
  }
  return shut ? "denied" : false;
}

// ---------- a way already signed in on this Mac: the person's own command-line tools ----------
const BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), "go/bin"), path.join(os.homedir(), ".local/bin")];
/** a tool's path: only in --bin when it is given (tests), else on PATH or in the usual install folders */
function tool(a, name) {
  const dirs = a.bin ? [a.bin] : [...(process.env.PATH ?? "").split(path.delimiter), ...BIN_DIRS];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* not here */ }
  }
  return null;
}
/** one run of a tool: its output, or what it said when it failed; null when the tool is not there */
function cli(a, name, argv) {
  const b = tool(a, name);
  if (!b) return null;
  try { return { out: execFileSync(b, argv, { encoding: "utf8", timeout: 40_000, maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { const err = String(e.stderr || e.message || e); return { err: LAPSED.test(err) ? "lapsed: invalid_grant" : err.slice(0, 400) }; }
}
/** a sign-in that has lapsed or was never made, as the tools say it */
const LAPSED = /invalid_grant|unauthori[sz]ed|\b401\b|token (has )?expired|not logged in|auth login|no (stored )?(refresh )?token|missing credentials|reauth/i;
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const isoOf = (v) => {
  if (v == null || v === "") return undefined;
  const n = Number(v), t = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(String(v));
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : undefined;
};
/** the first array among these keys (the tools wrap their lists differently) */
const listOf = (d, ...keys) => (Array.isArray(d) ? d : keys.map((k) => d?.[k]).find(Array.isArray) ?? []);
const item = (title, at) => ({ title: clean(title), ...(isoOf(at) ? { at: isoOf(at) } : {}) });

/** Google through gog: its signed-in account, or why there is none */
function google(a, kind) {
  const list = cli(a, "gog", ["auth", "list", "--plain"]);
  if (!list || list.err) return { miss: true };
  const row = (list.out ?? "").split("\n").map((l) => l.split("\t")).find((c) => /@/.test(c[0] ?? ""));
  if (!row) return { miss: true };
  const acct = row[0].trim(), services = (row[2] ?? "").trim() || "gmail,drive,docs,calendar";
  const once = { kind: "once", line: LINE.once("google"), run: `gog auth add ${acct} --services ${services}` };
  const r = kind === "gmail"
    ? cli(a, "gog", ["gmail", "search", `newer_than:${a.days}d -in:spam -in:trash`, "--max", String(a.max ?? 100), "-j", "-a", acct])
    : cli(a, "gog", ["drive", "ls", "--max", String(a.max ?? 200), "-j", "-a", acct]);
  if (!r) return { miss: true };
  if (r.err) return LAPSED.test(r.err) ? { once } : { err: r.err.split("\n")[0] };
  const d = json(r.out);
  if (d == null) return { err: "gog gave no JSON" };
  if (kind === "gmail") {
    const items = listOf(d, "threads", "messages", "results").map((t) => item(t.subject ?? t.Subject ?? "", t.date ?? t.Date ?? t.lastMessageDate ?? t.internalDate)).filter((x) => x.title);
    return { groups: [{ name: "Mail", kind: "folder", items }] };
  }
  const files = listOf(d, "files", "items", "results");
  const doc = (m) => /document|spreadsheet|presentation|form/.test(String(m ?? ""));
  const folder = (m) => /folder/.test(String(m ?? ""));
  const of = (f) => item(f.name ?? f.title ?? "", f.modifiedTime ?? f.modified ?? f.updated);
  return { groups: [
    { name: "Documents", kind: "folder", items: files.filter((f) => doc(f.mimeType)).map(of) },
    { name: "Folders", kind: "folder", items: files.filter((f) => folder(f.mimeType)).map(of) },
    { name: "Files", kind: "folder", items: files.filter((f) => !doc(f.mimeType) && !folder(f.mimeType)).map(of) },
  ].filter((g) => g.items.length) };
}

/** GitHub through gh: the person's repositories and the open issues and pull requests they are in */
function github(a) {
  const st = cli(a, "gh", ["auth", "status"]);
  if (!st) return { miss: true };
  const once = { kind: "once", line: LINE.once("github"), run: "gh auth login --web" };
  if (st.err) return LAPSED.test(st.err) || /not logged/i.test(st.err) ? { once } : { err: st.err.split("\n")[0] };
  const repos = cli(a, "gh", ["repo", "list", "--limit", String(a.max ?? 60), "--json", "name,updatedAt"]);
  if (!repos) return { miss: true };
  if (repos.err) return LAPSED.test(repos.err) ? { once } : { err: repos.err.split("\n")[0] };
  if (a.max === 1) return { groups: [] };   // a check: the sign-in answered
  const issues = cli(a, "gh", ["search", "issues", "--involves", "@me", "--state", "open", "--limit", "60", "--json", "title,updatedAt"]);
  return { groups: [
    { name: "Repositories", kind: "folder", items: listOf(json(repos.out)).map((r) => item(r.name, r.updatedAt)) },
    { name: "Open issues and pull requests", kind: "folder", items: !issues || issues.err ? [] : listOf(json(issues.out)).map((r) => item(r.title, r.updatedAt)) },
  ].filter((g) => g.items.length) };
}

// ---------- the titles of a site's pages, from this Mac's browsers ----------
const CHROMIUM = ["Google/Chrome", "BraveSoftware/Brave-Browser", "Microsoft Edge", "Arc/User Data", "Chromium"];
const hostIn = (u, hosts) => { try { const h = new URL(u).hostname.toLowerCase(); return hosts.find((x) => h === x || h.endsWith(`.${x}`)); } catch { return undefined; } };
/** a page title that names nothing of the person's (the site's own name, a sign-in page, an inbox count) */
const BARE = /^(sign in|log ?in|login|loading|home|inbox|new tab|untitled|redirecting)\b/i;
function readHistory(a, home, from, tmp) {
  if (!a.hosts.length) return null;
  const since = Date.now() / 1000 - a.days * DAY;
  const seen = new Map();   // host + title → newest visit
  let opened = 0;
  const take = (url, title, t) => {
    const h = hostIn(url, a.hosts), name = clean(title);
    if (!h || !name || name.length < 3 || BARE.test(name) || a.hosts.some((x) => name.toLowerCase() === x || name.toLowerCase() === x.split(".")[0])) return;
    const k = `${h}\u0000${name}`;
    if (!seen.has(k) || seen.get(k) < t) seen.set(k, t);
  };
  for (const vendor of CHROMIUM) {
    const base = path.join(home, "Library/Application Support", vendor);
    let profiles = [];
    try { profiles = fs.readdirSync(base).filter((d) => d === "Default" || /^Profile \d+$/.test(d)); } catch { continue; }
    for (const p of profiles) {
      const hist = path.join(base, p, "History");
      if (there(hist) !== true) continue;
      try {
        const db = open(tmp, hist);
        try {
          for (const r of db.all(`SELECT u.url AS url, u.title AS title, (u.last_visit_time / 1000000 - 11644473600) AS t FROM urls u WHERE u.last_visit_time > ${Math.floor((since + 11644473600) * 1e6)}`)) take(r.url, r.title, Number(r.t));
          opened++;
        } finally { db.close(); }
      } catch { /* a browser that will not open: the others still count */ }
    }
  }
  const safari = locate(["Library/Safari/History.db"], home, from);
  if (safari && safari !== "denied") {
    try {
      const db = open(tmp, safari.file);
      try {
        for (const r of db.all(`SELECT i.url AS url, v.title AS title, CAST(v.visit_time + ${APPLE} AS INTEGER) AS t FROM history_visits v JOIN history_items i ON v.history_item = i.id WHERE v.visit_time > ${Math.floor(since - APPLE)}`)) take(r.url, r.title, Number(r.t));
        opened++;
      } finally { db.close(); }
    } catch { /* */ }
  }
  if (!opened) return null;
  const by = new Map();
  for (const [k, t] of seen) { const [h, title] = k.split("\u0000"); if (!by.has(h)) by.set(h, []); by.get(h).push({ title, at: new Date(t * 1000).toISOString() }); }
  return [...by].map(([name, items]) => ({ name, kind: "folder", items }));
}

// ---------- main ----------
/** the read of one store as the tour's JSON; never throws */
export function readStore(a) {
  const store = a.store;
  const home = path.resolve(a.home);
  const from = a.from ? path.resolve(a.from) : null;
  const base = { v: 1, store, ok: false, groups: [] };
  const fail = (kind, note) => ({ ...base, need: { kind, line: LINE[kind](store) }, ...(note ? { note } : {}) });

  // the ways already signed in, and the browsers' history: no store file of their own
  if (store === "gmail" || store === "gdrive" || store === "github") {
    try {
      const r = store === "github" ? github(a) : google(a, store);
      if (r.miss) return fail("missing", "no signed-in tool for it here");
      if (r.once) return { ...base, need: r.once };
      if (r.err) return fail("format", r.err);
      return capped({ ...base, ok: true, source: store === "github" ? "gh" : "gog", groups: r.groups });
    } catch (e) { return fail("format", String(e?.message || e).split("\n")[0]); }
  }
  if (store === "history") {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sol-read-"));
    try {
      const groups = readHistory(a, home, from, tmp);
      return groups ? capped({ ...base, ok: true, source: "browser history", groups }) : fail("missing", a.hosts.length ? "no browser history here" : "no --hosts");
    } catch (e) { return fail("format", String(e?.message || e).split("\n")[0]); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // a real Linux or Windows home: none of these apps keep a store a reader knows there
  if (process.platform !== "darwin" && home === path.resolve(os.homedir())) return fail("missing", `no reader on ${process.platform}`);

  if (store === "wechat") {
    const w = wechatThere(home, from);
    return w === true ? fail("encrypted") : w === "denied" ? fail("switch") : fail("missing");
  }
  const chat = store === "whatsapp" || store === "messages";
  if (chat && a.chats !== "names") return fail("ask");

  const at = locate(PATHS[store], home, from);
  if (at === "denied") return fail("switch");
  if (!at) return fail("missing");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sol-read-"));
  try {
    const db = open(tmp, at.file);
    let groups;
    try {
      if (store === "notes") groups = readNotes(db);
      else if (store === "calendar") groups = readCalendar(db, a.days);
      else if (store === "whatsapp") {
        const side = locate([WA_CONTACTS], home, from);
        groups = readWhatsApp(db, side && side !== "denied" ? waContacts(tmp, side.file) : null);
      }
      else groups = readMessages(db);
    } finally { db.close(); }
    return capped({ ...base, ok: true, source: at.rel, groups });
  } catch (e) {
    if (denied(e)) return fail("switch");
    if (e instanceof Format) return { ...fail("format", e.message), source: at.rel };
    return { ...fail("format", String(e?.code || e?.message || e).split("\n")[0]), source: at.rel };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** --check: whether each way works now, nothing read. A store: there (ok), closed (switch), not there (missing), a
 * chat store without the yes (ask), WeChat (encrypted). A tool: one call of one item (ok, once, missing, format). The
 * history: a browser keeps one here. */
export function checkWays(a) {
  const checks = {};
  const home = path.resolve(a.home), from = a.from ? path.resolve(a.from) : null;
  const one = (store) => {
    const r = readStoreLight({ ...a, store }, home, from);
    return r.ok ? { ok: true } : { ok: false, need: r.need };
  };
  for (const s of a.check) { try { checks[s] = one(s); } catch (e) { checks[s] = { ok: false, need: { kind: "format", line: LINE.format(s) } }; } }
  return { v: 1, store: "check", ok: true, groups: [], checks };
}
const CHROMIUM_THERE = (home) => CHROMIUM.some((v) => { try { return fs.readdirSync(path.join(home, "Library/Application Support", v)).some((d) => d === "Default" || /^Profile \d+$/.test(d)); } catch { return false; } });
/** one way's check: the tools are called with one item; a store is only looked for */
function readStoreLight(a, home, from) {
  const store = a.store, base = { v: 1, store, ok: false, groups: [] };
  if (store in SESSIONS) {
    const at = there(path.join(home, SESSIONS[store]));
    return at === true ? { ...base, ok: true } : { ...base, need: { kind: at === "denied" ? "switch" : "missing", line: at === "denied" ? LINE.switch() : "not on this computer" } };
  }
  const fail = (kind) => ({ ...base, need: { kind, line: LINE[kind](store) } });
  if (store === "gmail" || store === "gdrive" || store === "github") {
    const r = store === "github" ? github(a) : google(a, store);
    return r.miss ? fail("missing") : r.once ? { ...base, need: r.once } : r.err ? fail("format") : { ...base, ok: true };
  }
  if (store === "history") {
    const safari = locate(["Library/Safari/History.db"], home, from);
    return CHROMIUM_THERE(home) || (safari && safari !== "denied") ? { ...base, ok: true } : fail("missing");
  }
  if (process.platform !== "darwin" && home === path.resolve(os.homedir())) return fail("missing");
  if (store === "wechat") { const w = wechatThere(home, from); return w === true ? fail("encrypted") : w === "denied" ? fail("switch") : fail("missing"); }
  const at = locate(PATHS[store], home, from);
  if (at === "denied") return fail("switch");
  if (!at) return fail("missing");
  if ((store === "whatsapp" || store === "messages") && a.chats !== "names") return fail("ask");
  return { ...base, ok: true };
}

/** the newest first, at most CAP items in all */
function capped(r) {
  let left = CAP;
  for (const g of r.groups) { g.items.sort(newest); g.items = g.items.slice(0, Math.max(0, left)); left -= g.items.length; }
  return r;
}

export function main(argv = process.argv.slice(2)) {
  const a = args(argv);
  if (a.check) {
    const r = checkWays(a);
    fs.writeFileSync(a.out, JSON.stringify(r, null, 2) + "\n");
    console.log(`check: ${Object.entries(r.checks).map(([k, v]) => `${k} ${v.ok ? "ok" : v.need.kind}`).join(", ")}`);
    return r;
  }
  const r = readStore(a);
  fs.writeFileSync(a.out, JSON.stringify(r, null, 2) + "\n");
  const n = r.groups.reduce((s, g) => s + g.items.length, 0);
  console.log(r.ok ? `${a.store}: ${r.groups.length} group(s), ${n} item(s)` : `${a.store}: ${r.need.kind}${r.note ? ` (${r.note})` : ""}`);
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

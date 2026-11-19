// Builds a made-up, Mac-shaped home for testing the finder (find.mjs). Invented person, invented visits.
// Usage: node fake-home.mjs <dir>   (writes only inside <dir>; <dir>/folders.json and <dir>/_titles.json beside it)
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DAY = 86400;

export function makeFakeHome(dir, now = Math.floor(Date.now() / 1000)) {
  // undo a previous run's locked Safari dir before clearing
  try { fs.chmodSync(path.join(dir, "Library/Safari"), 0o755); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  let seed = 1054;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const titles = new Set();

  /** visits on days chosen by chance p (0..1) over the last 60 days, 1..n times a day, at plausible hours */
  function plan(p, perDay, pages) {
    const out = [];
    for (let d = 59; d >= 0; d--) {
      const weekend = new Date((now - d * DAY) * 1000).getDay() % 6 === 0;
      if (rnd() > (weekend ? p * 0.5 : p)) continue;
      const n = 1 + Math.floor(rnd() * perDay);
      for (let i = 0; i < n; i++) {
        const [url, title] = pages[Math.floor(rnd() * pages.length)];
        const t = now - d * DAY - Math.floor(rnd() * 12 * 3600) - 1800;
        out.push({ url, title, t });
      }
    }
    return out;
  }

  const lms = "https://blackboard.westbrook.edu";
  const chrome = [
    ...plan(0.8, 3, [
      [`${lms}/ultra/course`, "Courses – Blackboard Learn"],
      [`${lms}/ultra/courses/_45821_1/outline`, "LA245-001 Landscape Studio: Site Analysis Brief"],
      [`${lms}/ultra/courses/_45821_1/outline?launch=true&token=abc123`, "LA245-001 Landscape Studio: Pin-up Schedule"],
      [`${lms}/ultra/courses/_46102_1/grades`, "DS480 Machine Learning: Problem Set 4"],
      [`${lms}/ultra/courses/_46102_1/outline`, "DS480 Machine Learning: Lecture 9 Slides"],
      [`${lms}/ultra/courses/_44990_1/outline`, "PSY 210 Social Psychology: Week 6 Readings"],
    ]),
    ...plan(0.95, 4, [
      ["https://mail.google.com/mail/u/0/#inbox", "Inbox (4) - jordan.rivera@school.example - Gmail"],
      ["https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWhk", "Re: studio crit moved to Thursday - jordan.rivera@school.example - Gmail"],
    ]),
    ...plan(0.35, 1, [["https://calendar.google.com/calendar/u/0/r/week", "Google Calendar - Week of November 2"]]),
    ...plan(0.25, 2, [
      ["https://www.linkedin.com/jobs/view/3812345678/?refId=x9Yz&trackingId=AbC", "Junior Data Analyst - Fieldstone Analytics | LinkedIn"],
      ["https://www.linkedin.com/feed/", "Feed for Jordan Rivera on the network"],
    ]),
    ...plan(0.18, 2, [
      ["https://westbrook.joinhandshake.com/stu/jobs/9123456?ref=web", "Summer Research Internship at Greenline Labs | Handshake"],
      ["https://westbrook.joinhandshake.com/stu/postings", "Job postings near Westbrook | Handshake"],
    ]),
    ...plan(0.25, 2, [["https://secure.chase.com/web/auth/dashboard#/dashboard/overview", "Chase Online - My Accounts Overview"]]),
    ...plan(0.7, 3, [
      ["https://www.google.com/search?q=landscape+site+analysis+precedents", "landscape site analysis precedents - Google Search"],
      ["https://www.google.com/search?q=sklearn+gradient+boosting+example", "sklearn gradient boosting example - Google Search"],
    ]),
    ...plan(0.12, 3, [["http://localhost:3000/", "portfolio-site dev preview"], ["http://192.168.1.1/admin", "Router admin panel"]]),
    ...plan(0.08, 1, [["https://web.whatsapp.com/", "WhatsApp Web chats"]]),
    ...plan(0.12, 1, [["https://www.youtube.com/watch?v=IHZwWFHWa-w", "Gradient descent, how neural networks learn"]]),
    ...plan(0.1, 1, [["https://accounts.google.com/v3/signin/identifier?continue=x", "Sign in to continue to Gmail"]]),
    { url: "https://www.nytimes.com/2026/10/30/climate/coastal-wetlands.html", title: "Coastal Wetlands Are Moving Inland, Study Says", t: now - 12 * DAY },
    { url: "https://library.westbrook.edu/databases", title: "Westbrook University Library Databases A to Z", t: now - 20 * DAY },
  ];
  const arc = [
    ...plan(0.4, 2, [
      ["https://www.notion.so/jordanr/DS480-project-notes-4f1c2a9be0d34c17a2b8", "DS480 final project notes"],
      ["https://www.notion.so/jordanr/LA245-site-journal-91aa0c3d55e24f0b8c11", "LA245 site journal entries"],
      ["https://www.notion.so/jordanr/Applications-tracker-77e1d0a2b3c44f5e9d00", "Internship applications tracker"],
    ]),
    ...plan(0.15, 1, [["https://www.figma.com/design/kT9xQ2/LA245-boards", "LA245 final boards draft"]]),
    ...plan(0.3, 1, [["https://mail.google.com/mail/u/0/#inbox", "Inbox (2) - jordan.rivera@school.example - Gmail"]]),
  ];
  for (const v of [...chrome, ...arc]) titles.add(v.title);

  const bookmarks = [
    ["Westbrook Blackboard Learn courses", `${lms}/ultra/course`],
    ["Gmail inbox", "https://mail.google.com/mail/u/0/#inbox"],
    ["Handshake jobs board", "https://westbrook.joinhandshake.com/stu/postings"],
    ["Chase bank login", "https://secure.chase.com/"],
    ["Library databases A to Z", "https://library.westbrook.edu/databases"],
  ];
  for (const [t] of bookmarks) titles.add(t);

  const support = path.join(dir, "Library/Application Support");
  writeChromeProfile(path.join(support, "Google/Chrome/Default"), chrome, bookmarks);
  writeChromeProfile(path.join(support, "Arc/User Data/Default"), arc, []);

  // Safari: present but locked, as without Full Disk Access
  const safari = path.join(dir, "Library/Safari");
  fs.mkdirSync(safari, { recursive: true });
  fs.writeFileSync(path.join(safari, "History.db"), "");
  fs.chmodSync(safari, 0o000);

  // apps under <home>/Applications
  for (const [name, bundle] of [["WhatsApp", "net.whatsapp.WhatsApp"], ["WeChat", "com.tencent.xinWeChat"],
    ["Slack", "com.tinyspeck.slackmacgap"], ["Calculator", "com.apple.calculator"]]) {
    const c = path.join(dir, "Applications", `${name}.app/Contents`);
    fs.mkdirSync(c, { recursive: true });
    fs.writeFileSync(path.join(c, "Info.plist"), plist({ CFBundleName: name, CFBundleIdentifier: bundle, CFBundleShortVersionString: "1.0" }));
  }
  // one app with no readable plist: the folder name must do
  fs.mkdirSync(path.join(dir, "Applications", "Broken.app/Contents"), { recursive: true });

  // a calendar account (the title is an email: it must never reach the output)
  const cal = path.join(dir, "Library/Calendars/6F1E2B7A-0C3D-4E5F-8A9B-1C2D3E4F5A6B.caldav");
  fs.mkdirSync(cal, { recursive: true });
  fs.writeFileSync(path.join(cal, "Info.plist"), plist({ Title: "jordan.rivera@school.example", Type: "CalDAV" }));

  const folders = [
    { id: "la245", name: "LA245 Landscape Studio" },
    { id: "ds480", name: "DS480 Machine Learning" },
    { id: "psy210", name: "PSY 210 Social Psychology" },
    { id: "jobs", name: "Job search" },
  ];
  fs.writeFileSync(path.join(dir, "folders.json"), JSON.stringify(folders, null, 2));
  fs.writeFileSync(path.join(dir, "_titles.json"), JSON.stringify([...titles], null, 2));
  return { folders, titles: [...titles] };
}

function plist(obj) {
  const body = Object.entries(obj).map(([k, v]) => `\t<key>${k}</key>\n\t<string>${v}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

export function writeChromeProfile(dir, visits, bookmarks) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "History"));
  db.exec(`CREATE TABLE meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR);
    CREATE TABLE urls(id INTEGER PRIMARY KEY AUTOINCREMENT, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0 NOT NULL,
      typed_count INTEGER DEFAULT 0 NOT NULL, last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL);
    CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER NOT NULL, visit_time INTEGER NOT NULL, from_visit INTEGER,
      transition INTEGER DEFAULT 0 NOT NULL, segment_id INTEGER, visit_duration INTEGER DEFAULT 0 NOT NULL,
      incremented_omnibox_typed_score BOOLEAN DEFAULT FALSE NOT NULL);
    INSERT INTO meta VALUES ('version', '67');`);
  const ids = new Map();
  const addUrl = db.prepare("INSERT INTO urls(url, title, visit_count, last_visit_time) VALUES (?, ?, 0, 0)");
  const addVisit = db.prepare("INSERT INTO visits(url, visit_time, transition) VALUES (?, ?, 805306368)");
  const bump = db.prepare("UPDATE urls SET visit_count = visit_count + 1, last_visit_time = max(last_visit_time, ?) WHERE id = ?");
  for (const v of visits.sort((a, b) => a.t - b.t)) {
    if (!ids.has(v.url)) ids.set(v.url, Number(addUrl.run(v.url, v.title).lastInsertRowid));
    const chromeTime = BigInt(v.t + 11644473600) * 1000000n;
    addVisit.run(ids.get(v.url), chromeTime);
    bump.run(chromeTime, ids.get(v.url));
  }
  db.close();
  const children = bookmarks.map(([name, url], i) => ({ date_added: "13370000000000000", guid: `00000000-0000-4000-8000-00000000000${i}`, id: String(i + 5), name, type: "url", url }));
  fs.writeFileSync(path.join(dir, "Bookmarks"), JSON.stringify({
    checksum: "0", version: 1,
    roots: {
      bookmark_bar: { children, name: "Bookmarks bar", type: "folder", id: "1" },
      other: { children: [], name: "Other bookmarks", type: "folder", id: "2" },
      synced: { children: [], name: "Mobile bookmarks", type: "folder", id: "3" },
    },
  }, null, 2));
}

// ---------- the apps' own stores (#1071): small real SQLite files with these apps' table shapes, invented people ----------

const APPLE = 978307200;
/** Apple's clock: seconds since 2001-01-01 */
const apple = (t) => t - APPLE;
/** the words a store holds that a reader must never give back (bodies, message text, places, descriptions) */
export const SECRET = ["the lilac bench by the east gate", "bring the larger trace roll", "see you after crit", "meet at 4 by the pond",
  "Room 214 Halden Hall", "agenda: pin-up order"];

const GC = "Library/Group Containers";
export const STORE_DIRS = {
  notes: `${GC}/group.com.apple.notes`,
  calendar: `${GC}/group.com.apple.calendar`,
  whatsapp: `${GC}/group.net.whatsapp.WhatsApp.shared`,
  messages: "Library/Messages",
};

/** Notes' NoteStore.sqlite: Core Data's Z_PRIMARYKEY and ZICCLOUDSYNCINGOBJECT (folders and notes in one table), the
 * body in ZICNOTEDATA. `drop` leaves a column out (a format the reader does not know). */
export function writeNotes(home, now, { drop = null } = {}) {
  const dir = path.join(home, STORE_DIRS.notes);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "NoteStore.sqlite"));
  const cols = ["Z_PK INTEGER PRIMARY KEY", "Z_ENT INTEGER", "Z_OPT INTEGER", "ZMARKEDFORDELETION INTEGER", "ZFOLDER INTEGER",
    "ZFOLDERTYPE INTEGER", "ZACCOUNT2 INTEGER", "ZNOTEDATA INTEGER", "ZIDENTIFIER VARCHAR", "ZTITLE1 VARCHAR", "ZTITLE2 VARCHAR",
    "ZSNIPPET VARCHAR", "ZCREATIONDATE1 TIMESTAMP", "ZMODIFICATIONDATE1 TIMESTAMP"].filter((c) => c.split(" ")[0] !== drop);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE Z_PRIMARYKEY (Z_ENT INTEGER PRIMARY KEY, Z_NAME VARCHAR, Z_SUPER INTEGER, Z_MAX INTEGER);
    INSERT INTO Z_PRIMARYKEY VALUES (5, 'ICCloudSyncingObject', 0, 40), (12, 'ICNote', 5, 30), (15, 'ICFolder', 5, 10), (3, 'ICAccount', 5, 1);
    CREATE TABLE ZICCLOUDSYNCINGOBJECT (${cols.join(", ")});
    CREATE TABLE ZICNOTEDATA (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, Z_OPT INTEGER, ZNOTE INTEGER, ZDATA BLOB);`);
  const have = new Set(cols.map((c) => c.split(" ")[0]));
  const put = (row) => {
    const keys = Object.keys(row).filter((k) => have.has(k));
    db.prepare(`INSERT INTO ZICCLOUDSYNCINGOBJECT (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => row[k]));
  };
  put({ Z_PK: 1, Z_ENT: 3, ZTITLE2: null, ZIDENTIFIER: "acct" });
  put({ Z_PK: 2, Z_ENT: 15, ZTITLE2: "LA245 studio", ZFOLDERTYPE: 0 });
  put({ Z_PK: 3, Z_ENT: 15, ZTITLE2: "Job search", ZFOLDERTYPE: 0 });
  put({ Z_PK: 4, Z_ENT: 15, ZTITLE2: "Recently Deleted", ZFOLDERTYPE: 1 });
  const notes = [
    [10, 2, "Site walk checklist", 2, SECRET[0]], [11, 2, "Pin-up feedback", 5, SECRET[1]],
    [12, 3, "Applications to send", 1, "three left"], [13, 4, "Old grocery list", 9, "milk"],
  ];
  for (const [pk, folder, title, days, body] of notes) {
    put({ Z_PK: pk, Z_ENT: 12, ZFOLDER: folder, ZTITLE1: title, ZSNIPPET: body, ZNOTEDATA: pk + 100, ZMARKEDFORDELETION: 0,
      ZCREATIONDATE1: apple(now - 30 * DAY), ZMODIFICATIONDATE1: apple(now - days * DAY) });
    db.prepare("INSERT INTO ZICNOTEDATA (Z_PK, Z_ENT, ZNOTE, ZDATA) VALUES (?, 9, ?, ?)").run(pk + 100, pk, Buffer.from(body));
  }
  put({ Z_PK: 14, Z_ENT: 12, ZFOLDER: 2, ZTITLE1: "A deleted draft", ZMARKEDFORDELETION: 1, ZMODIFICATIONDATE1: apple(now - DAY) });
  db.close();
}

/** Calendar.sqlitedb: Store, Calendar and CalendarItem (summary, start_date, calendar_id; description and location kept apart) */
export function writeCalendar(home, now) {
  const dir = path.join(home, STORE_DIRS.calendar);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "Calendar.sqlitedb"));
  db.exec(`CREATE TABLE Store (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type INTEGER, disabled INTEGER);
    CREATE TABLE Calendar (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER, title TEXT, color TEXT, flags INTEGER, display_order INTEGER);
    CREATE TABLE Location (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, address TEXT);
    CREATE TABLE CalendarItem (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, summary TEXT, location_id INTEGER, description TEXT,
      start_date REAL, start_tz TEXT, end_date REAL, all_day INTEGER, calendar_id INTEGER, orig_item_id INTEGER, hidden INTEGER, status INTEGER);
    INSERT INTO Store (name, type) VALUES ('iCloud', 1);
    INSERT INTO Calendar (store_id, title) VALUES (1, 'Classes'), (1, 'Work shifts');
    INSERT INTO Location (title) VALUES ('${SECRET[4]}');`);
  const add = db.prepare("INSERT INTO CalendarItem (summary, location_id, description, start_date, end_date, all_day, calendar_id, hidden) VALUES (?, 1, ?, ?, ?, 0, ?, 0)");
  for (const [title, days, cal] of [["LA245 studio crit", 2, 1], ["DS480 lecture", -3, 1], ["Library desk shift", 5, 2],
    ["Last spring's review", -40, 1], ["Next year's fair", 200, 2]]) {
    const t = apple(now + days * DAY);
    add.run(title, SECRET[5], t, t + 3600, cal);
  }
  db.close();
}

/** WhatsApp desktop: ChatStorage.sqlite (ZWACHATSESSION, ZWAMESSAGE) and ContactsV2.sqlite (ZWAADDRESSBOOKCONTACT) */
export function writeWhatsApp(home, now) {
  const dir = path.join(home, STORE_DIRS.whatsapp);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "ChatStorage.sqlite"));
  db.exec(`CREATE TABLE ZWACHATSESSION (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, Z_OPT INTEGER, ZARCHIVED INTEGER, ZHIDDEN INTEGER,
      ZREMOVED INTEGER, ZSESSIONTYPE INTEGER, ZUNREADCOUNT INTEGER, ZLASTMESSAGE INTEGER, ZLASTMESSAGEDATE TIMESTAMP,
      ZCONTACTJID VARCHAR, ZLASTMESSAGETEXT VARCHAR, ZPARTNERNAME VARCHAR);
    CREATE TABLE ZWAMESSAGE (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZCHATSESSION INTEGER, ZISFROMME INTEGER,
      ZMESSAGEDATE TIMESTAMP, ZFROMJID VARCHAR, ZTEXT VARCHAR);`);
  const add = db.prepare("INSERT INTO ZWACHATSESSION (Z_PK, ZSESSIONTYPE, ZREMOVED, ZHIDDEN, ZLASTMESSAGEDATE, ZCONTACTJID, ZLASTMESSAGETEXT, ZPARTNERNAME) VALUES (?, ?, ?, 0, ?, ?, ?, ?)");
  add.run(1, 1, 0, apple(now - 1 * DAY), "120363000000000001@g.us", SECRET[2], "LA245 studio group");
  add.run(2, 0, 0, apple(now - 3 * DAY), "15550000001@s.whatsapp.net", SECRET[3], "Tamsin Arlo");
  add.run(3, 0, 0, apple(now - 6 * DAY), "15550000002@s.whatsapp.net", "ok", "");          // its name is in ContactsV2
  add.run(4, 3, 0, apple(now - 1 * DAY), "status@broadcast", "status", "Status");
  add.run(5, 0, 1, apple(now - 2 * DAY), "15550000003@s.whatsapp.net", "gone", "A removed chat");
  db.prepare("INSERT INTO ZWAMESSAGE (Z_PK, ZCHATSESSION, ZISFROMME, ZMESSAGEDATE, ZTEXT) VALUES (1, 1, 0, ?, ?)").run(apple(now - DAY), SECRET[2]);
  db.close();
  const c = new DatabaseSync(path.join(dir, "ContactsV2.sqlite"));
  c.exec(`CREATE TABLE ZWAADDRESSBOOKCONTACT (Z_PK INTEGER PRIMARY KEY, Z_ENT INTEGER, ZFULLNAME VARCHAR, ZGIVENNAME VARCHAR,
      ZPHONENUMBER VARCHAR, ZWHATSAPPID VARCHAR);
    INSERT INTO ZWAADDRESSBOOKCONTACT (ZFULLNAME, ZGIVENNAME, ZPHONENUMBER, ZWHATSAPPID) VALUES ('Corin Vale', 'Corin', '+1 555 000 0002', '15550000002@s.whatsapp.net');`);
  c.close();
}

/** Messages' chat.db: handle, chat, message, chat_message_join, chat_handle_join; dates in nanoseconds since 2001 */
export function writeMessages(home, now) {
  const dir = path.join(home, STORE_DIRS.messages);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "chat.db"));
  db.exec(`CREATE TABLE handle (ROWID INTEGER PRIMARY KEY AUTOINCREMENT UNIQUE, id TEXT NOT NULL, country TEXT, service TEXT NOT NULL, uncanonicalized_id TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, style INTEGER, state INTEGER,
      account_id TEXT, properties BLOB, chat_identifier TEXT, service_name TEXT, room_name TEXT, account_login TEXT,
      is_archived INTEGER DEFAULT 0, last_addressed_handle TEXT, display_name TEXT, group_id TEXT);
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, text TEXT, handle_id INTEGER DEFAULT 0,
      service TEXT, date INTEGER, date_read INTEGER, date_delivered INTEGER, is_from_me INTEGER DEFAULT 0, attributedBody BLOB);
    CREATE TABLE chat_message_join (chat_id INTEGER REFERENCES chat (ROWID) ON DELETE CASCADE, message_id INTEGER REFERENCES message (ROWID) ON DELETE CASCADE,
      message_date INTEGER DEFAULT 0, PRIMARY KEY (chat_id, message_id));
    CREATE TABLE chat_handle_join (chat_id INTEGER, handle_id INTEGER, UNIQUE(chat_id, handle_id));
    INSERT INTO handle (id, service) VALUES ('+15550000004', 'iMessage');
    INSERT INTO chat (guid, style, chat_identifier, service_name, display_name) VALUES
      ('iMessage;+;chat000001', 43, 'chat000001', 'iMessage', 'Studio carpool'),
      ('iMessage;-;+15550000004', 45, '+15550000004', 'iMessage', '');
    INSERT INTO chat_handle_join VALUES (2, 1);`);
  const msg = db.prepare("INSERT INTO message (guid, text, handle_id, service, date, is_from_me) VALUES (?, ?, 1, 'iMessage', ?, 0)");
  const join = db.prepare("INSERT INTO chat_message_join VALUES (?, ?, ?)");
  let n = 0;
  for (const [chat, days, text] of [[1, 4, SECRET[3]], [1, 2, "on my way"], [2, 8, SECRET[2]]]) {
    const ns = BigInt(apple(now - days * DAY)) * 1000000000n;
    msg.run(`m${++n}`, text, ns);
    join.run(chat, n, ns);
  }
  db.close();
}

/** WeChat on a Mac: its sandbox container and a group container (the store inside is encrypted) */
export function writeWeChat(home) {
  fs.mkdirSync(path.join(home, "Library/Containers/com.tencent.xinWeChat/Data/Library"), { recursive: true });
  fs.mkdirSync(path.join(home, `${GC}/5A4RE8SF68.com.tencent.xinWeChat`), { recursive: true });
}

/** a made-up home for the store reader. shape: "all" (the browsers' home and every store), "apps" (the stores, no
 * browsers), "closed" (the stores there, each folder chmod 000, as without the grant), "wechat" (WeChat alone),
 * "format" (Notes' store without its note title column), "linux", "windows" (those systems' own app folders) */
export function makeStoreHome(dir, shape, now = Math.floor(Date.now() / 1000)) {
  unlockStores(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  if (shape === "all") makeFakeHome(dir, now);
  fs.mkdirSync(dir, { recursive: true });
  if (shape === "all") {
    for (const [name, bundle] of [["Notes", "com.apple.Notes"], ["Messages", "com.apple.MobileSMS"], ["Calendar", "com.apple.iCal"]]) {
      const c = path.join(dir, "Applications", `${name}.app/Contents`);
      fs.mkdirSync(c, { recursive: true });
      fs.writeFileSync(path.join(c, "Info.plist"), plist({ CFBundleName: name, CFBundleIdentifier: bundle }));
    }
  }
  if (shape === "all" || shape === "apps" || shape === "closed") {
    writeNotes(dir, now); writeCalendar(dir, now); writeWhatsApp(dir, now); writeMessages(dir, now); writeWeChat(dir);
  }
  if (shape === "closed") {
    for (const d of Object.values(STORE_DIRS)) fs.chmodSync(path.join(dir, d), 0o000);
    fs.chmodSync(path.join(dir, "Library/Containers/com.tencent.xinWeChat"), 0o000);
  }
  if (shape === "wechat") writeWeChat(dir);
  if (shape === "format") writeNotes(dir, now, { drop: "ZTITLE1" });
  if (shape === "linux") {
    for (const d of [".config/WhatsApp", ".config/google-chrome/Default", ".local/share/evolution/calendar/system", ".local/share/gnome-notes"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  if (shape === "windows") {
    for (const d of ["AppData/Local/Packages/5319275A.WhatsAppDesktop_cv1g1gvanyjgm/LocalState", "AppData/Roaming/Tencent/WeChat",
      "Documents/WeChat Files", "AppData/Local/Packages/Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe/LocalState"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  return dir;
}

/** undo "closed" so the folder can be cleared */
export function unlockStores(dir) {
  for (const d of [...Object.values(STORE_DIRS), "Library/Containers/com.tencent.xinWeChat"]) {
    try { fs.chmodSync(path.join(dir, d), 0o755); } catch { /* none */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node fake-home.mjs <dir>"); process.exit(2); }
  makeFakeHome(path.resolve(dir));
  console.log(`fake home written to ${dir}`);
}
